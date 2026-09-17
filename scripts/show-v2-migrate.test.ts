// #1039: the operator command's own plumbing. The runbook's semantics are
// proved over the owner in src/engine/showV2Migration.test.ts; these cases
// cover what only the command can get wrong - refusing a malformed or unsafe
// invocation, adapting node:sqlite to the store's statement interface, and
// keeping personal content out of the committed report.
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { createShowV2WithOutputContract } from '@/engine/showCreationV2'
import type { ShowDocument } from '@/engine/showDocument'
import {
  rehearseShowV2Migration,
  type ShowV2MigrationOutcome,
  type ShowV2MigrationStore,
} from '@/engine/showV2Migration'
import {
  buildShowV2MigrateReport,
  openLocalD1,
  parseShowV2MigrateArgs,
  REPORT_DETAIL_LIMIT,
  resolveLocalD1File,
  ShowV2MigrateArgsError,
  ShowV2MigrateStopped,
  stopAfterSettledRows,
} from './show-v2-migrate-lib'

const temporaries: string[] = []
afterEach(() => {
  for (const path of temporaries.splice(0)) rmSync(path, { recursive: true, force: true })
})

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), 'show-v2-migrate-'))
  temporaries.push(path)
  return path
}

it('parses a convert invocation with its optional flags', () => {
  expect(parseShowV2MigrateArgs([
    'convert', '--persist-to', '/state', '--user', 'github:local', '--report', 'out.json', '--stop-after', '2',
  ])).toEqual({
    command: 'convert', persistTo: '/state', userId: 'github:local', report: 'out.json', stopAfter: 2,
  })
})

it.each([
  [['migrate', '--persist-to', '/state', '--user', 'u'], /Unknown command/],
  [['convert', '--user', 'u'], /--persist-to is required/],
  [['convert', '--persist-to', '/state'], /--user is required/],
  [['convert', '--persist-to', '/state', '--user', 'u', '--stop-after', '0'], /positive whole number/],
  [['convert', '--persist-to', '/state', '--user', 'u', '--report'], /--report needs a value/],
  [['convert', '/state'], /Unexpected argument/],
])('refuses %j', (argv, message) => {
  expect(() => parseShowV2MigrateArgs(argv)).toThrow(ShowV2MigrateArgsError)
  expect(() => parseShowV2MigrateArgs(argv)).toThrow(message)
})

it('refuses a rollback that does not name the rows to restore', () => {
  // Restoring every backed-up row by default is the one operator mistake this
  // command must not make easy.
  expect(() => parseShowV2MigrateArgs(['rollback', '--persist-to', '/state', '--user', 'u']))
    .toThrow(/rollback needs --ids/)
  expect(parseShowV2MigrateArgs(['rollback', '--persist-to', '/state', '--user', 'u', '--ids', 'a, b ,'])).toEqual({
    command: 'rollback', persistTo: '/state', userId: 'u', ids: ['a', 'b'],
  })
})

it('finds the Show database by its table rather than by filename', () => {
  const root = temporaryDirectory()
  const directory = join(root, 'v3', 'd1', 'miniflare-D1DatabaseObject')
  mkdirSync(directory, { recursive: true })
  // A decoy namespace database and a metadata file sit beside the real one.
  writeFileSync(join(directory, 'metadata.sqlite'), '')
  for (const [name, table] of [['aaaa.sqlite', 'something_else'], ['zzzz.sqlite', 'personal_shows']]) {
    const database = new DatabaseSync(join(directory, name))
    database.exec(`CREATE TABLE ${table} (id TEXT)`)
    database.close()
  }
  expect(resolveLocalD1File(root)).toBe(join(directory, 'zzzz.sqlite'))
})

it('reports a missing local store instead of guessing', () => {
  expect(() => resolveLocalD1File(temporaryDirectory())).toThrow(/No local D1 store under/)
  const root = temporaryDirectory()
  mkdirSync(join(root, 'v3', 'd1', 'miniflare-D1DatabaseObject'), { recursive: true })
  expect(() => resolveLocalD1File(root)).toThrow(/No D1 database with a personal_shows table/)
})

it('adapts node:sqlite to the store statement interface, bindings included', async () => {
  const file = join(temporaryDirectory(), 'rows.sqlite')
  const seed = new DatabaseSync(file)
  seed.exec('CREATE TABLE rows (user_id TEXT, id TEXT, value TEXT)')
  seed.close()

  const database = openLocalD1(file)
  try {
    const inserted = await database
      .prepare('INSERT INTO rows (user_id, id, value) VALUES (?, ?, ?)')
      .bind('user', 'a')
      .bind(null)
      .run()
    expect(inserted).toEqual({ success: true, meta: { changes: 1 } })

    expect(await database.prepare('SELECT id, value FROM rows WHERE user_id = ?').bind('user').all())
      .toEqual({ results: [{ id: 'a', value: null }] })
    expect(await database.prepare('SELECT id FROM rows WHERE id = ?').bind('a').first()).toEqual({ id: 'a' })
    // A miss is null, which is what the store's `first` callers check for.
    expect(await database.prepare('SELECT id FROM rows WHERE id = ?').bind('absent').first()).toBeNull()
    // A CAS update that matches nothing reports zero changes rather than throwing.
    expect((await database.prepare('UPDATE rows SET value = ? WHERE id = ?').bind('x', 'absent').run()).meta?.changes).toBe(0)
  } finally {
    database.close()
  }
})

it('keeps the report to identities, hashes, statuses and bounded detail', () => {
  const report = buildShowV2MigrateReport('convert', 'aabbccdd', [
    { id: 'show-a', sourceHash: '11111111', sourceVersion: 1, status: 'converted' },
    { id: 'show-b', sourceHash: '22222222', sourceVersion: 2, status: 'already-v2' },
    { id: 'show-c', sourceHash: '33333333', sourceVersion: 1, status: 'refused', detail: `x${'y'.repeat(400)}` },
  ], '2026-09-16T00:00:00.000Z')

  expect(report.totals).toEqual({ converted: 1, 'already-v2': 1, refused: 1 })
  expect(report.userIdHash).toBe('aabbccdd')
  expect(report.rows.map(row => row.status)).toEqual(['converted', 'already-v2', 'refused'])
  expect(report.rows[2].detail).toHaveLength(REPORT_DETAIL_LIMIT)
  expect(report.rows[2].detail?.endsWith('...')).toBe(true)
  // No field carries a Show name, Pattern source or record content.
  expect(Object.keys(report.rows[0]).sort()).toEqual(['id', 'sourceHash', 'sourceVersion', 'status'])
})

it('collapses whitespace in a refusal detail so one row stays one line', () => {
  const report = buildShowV2MigrateReport('convert', 'aabbccdd', [
    { id: 'show', sourceHash: '1', sourceVersion: 1, status: 'refused', detail: 'first line\n  second line' },
  ], '2026-09-16T00:00:00.000Z')
  expect(report.rows[0].detail).toBe('first line second line')
})

/**
 * `--stop-after <n>` rehearses an interrupted pass. What makes the resume
 * meaningful is where the interruption lands: after exactly n rows have their
 * outcome durably recorded, so the resumed pass skips those n from the recorded
 * outcomes and finishes the rest. Stopping inside a row's qualification instead
 * records nothing for it, so the count the operator asked for and the count the
 * store settled disagree.
 */
function settledStore(ids: readonly string[]) {
  const outcomes = new Map<string, ShowV2MigrationOutcome>()
  const order: string[] = []
  const store: ShowV2MigrationStore = {
    inventory: async () => ids.map(id => ({ id, sourceVersion: 2, document: v2Document(id), sourceRow: { id } })),
    outcome: async id => outcomes.get(id),
    snapshot: async () => 'ready',
    writeV2: async () => 'written',
    read: async id => v2Document(id),
    record: async outcome => { outcomes.set(outcome.id, outcome); order.push(outcome.id) },
    restore: async () => {},
  }
  return { store, outcomes, order }
}

function v2Document(id: string): ShowDocument {
  return createShowV2WithOutputContract(id, id, createInstallationShowOutputContract({ outputMapId: null, pixelCount: 60 }), 1)
}

it('stops a pass only after the requested number of rows are durably settled', async () => {
  const memory = settledStore(['a', 'b', 'c'])

  await expect(rehearseShowV2Migration(stopAfterSettledRows(memory.store, 2)))
    .rejects.toBeInstanceOf(ShowV2MigrateStopped)

  expect(memory.order).toEqual(['a', 'b'])
  expect([...memory.outcomes.keys()]).toEqual(['a', 'b'])
})

it('resumes from the recorded outcomes and settles only what remains', async () => {
  const memory = settledStore(['a', 'b', 'c'])
  await expect(rehearseShowV2Migration(stopAfterSettledRows(memory.store, 2))).rejects.toBeInstanceOf(ShowV2MigrateStopped)

  const resumed = await rehearseShowV2Migration(memory.store)

  expect(resumed.map(outcome => outcome.id)).toEqual(['a', 'b', 'c'])
  // 'a' and 'b' were settled before the interruption and are not written again.
  expect(memory.order).toEqual(['a', 'b', 'c'])
})

it('names the settled count in the message an operator reads', async () => {
  const memory = settledStore(['a', 'b'])
  await expect(rehearseShowV2Migration(stopAfterSettledRows(memory.store, 1)))
    .rejects.toThrow('Stopped after 1 settled row(s) at operator request.')
})
