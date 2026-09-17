// #1039: operator plumbing for the section 10 row-conversion runbook.
//
// The runbook itself is `rehearseShowV2Migration` / `rollbackShowV2Migration`
// in `src/engine/showV2Migration.ts` over `createD1ShowV2MigrationStore`. This
// module supplies only what an operator command needs around it: argument
// parsing, a local-D1 adapter for the store's narrow statement interface, and
// the shape of the committed report.
//
// There is deliberately no remote backend. The remote pass is blocked on a
// recorded Cloudflare migration authorization failure, and shipping an
// unexercised `--remote` path would be a claim this candidate cannot support.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { D1ShowV2MigrationDatabaseLike, D1ShowV2MigrationStatementLike } from '@/cloudflare/showV2Migration'
import type { ShowV2MigrationOutcome, ShowV2MigrationStore } from '@/engine/showV2Migration'

export type ShowV2MigrateCommand = 'inventory' | 'convert' | 'rollback'

export interface ShowV2MigrateArgs {
  command: ShowV2MigrateCommand
  /** Miniflare persistence directory, as passed to `wrangler --persist-to`. */
  persistTo: string
  userId: string
  /** Where to write the redacted per-row report; omitted means stdout only. */
  report?: string
  /** Restrict a rollback to these Show identities. Required for rollback. */
  ids?: string[]
  /**
   * Interrupt the pass once this many rows have their outcome durably
   * recorded, so an interrupted pass and its resume can be rehearsed against
   * real storage.
   */
  stopAfter?: number
}

export class ShowV2MigrateArgsError extends Error {}

/** The interruption `--stop-after` raises. Not a failure: the pass is resumable. */
export class ShowV2MigrateStopped extends Error {}

/**
 * Interrupt a pass after `limit` rows are durably settled (#1039).
 *
 * The runbook settles a row by recording its outcome, and the resume path reads
 * exactly those recorded outcomes. So the interruption belongs immediately
 * after `record` returns, not inside the qualification that precedes it:
 * stopping earlier leaves the row unrecorded, which makes the count the
 * operator asked for and the count the store settled disagree, and rehearses a
 * resume that redoes the row rather than skipping it.
 *
 * A row that a previous pass already settled is not recorded again, so the
 * limit counts rows this pass settles.
 */
export function stopAfterSettledRows(store: ShowV2MigrationStore, limit: number): ShowV2MigrationStore {
  let settled = 0
  return {
    inventory: () => store.inventory(),
    outcome: id => store.outcome(id),
    snapshot: (source, sourceHash) => store.snapshot(source, sourceHash),
    writeV2: (source, sourceHash, record) => store.writeV2(source, sourceHash, record),
    read: id => store.read(id),
    restore: id => store.restore(id),
    record: async outcome => {
      await store.record(outcome)
      settled += 1
      if (settled >= limit) throw new ShowV2MigrateStopped(`Stopped after ${settled} settled row(s) at operator request.`)
    },
  }
}

const USAGE = [
  'Usage:',
  '  npm run show:v2-migrate -- inventory --persist-to <dir> --user <id> [--report <path>]',
  '  npm run show:v2-migrate -- convert   --persist-to <dir> --user <id> [--report <path>] [--stop-after <n>]',
  '  npm run show:v2-migrate -- rollback  --persist-to <dir> --user <id> --ids <a,b,c>',
  '',
  'Local D1 only. There is no remote backend; the remote pass is blocked.',
].join('\n')

export function showV2MigrateUsage(): string {
  return USAGE
}

export function parseShowV2MigrateArgs(argv: readonly string[]): ShowV2MigrateArgs {
  const [command, ...rest] = argv
  if (command !== 'inventory' && command !== 'convert' && command !== 'rollback') {
    throw new ShowV2MigrateArgsError(`Unknown command ${JSON.stringify(command ?? '')}.\n\n${USAGE}`)
  }
  const values = new Map<string, string>()
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index]
    if (!flag.startsWith('--')) throw new ShowV2MigrateArgsError(`Unexpected argument ${JSON.stringify(flag)}.\n\n${USAGE}`)
    const value = rest[index + 1]
    if (value === undefined || value.startsWith('--')) throw new ShowV2MigrateArgsError(`${flag} needs a value.\n\n${USAGE}`)
    values.set(flag.slice(2), value)
    index += 1
  }
  const persistTo = values.get('persist-to')
  const userId = values.get('user')
  if (!persistTo) throw new ShowV2MigrateArgsError(`--persist-to is required.\n\n${USAGE}`)
  if (!userId) throw new ShowV2MigrateArgsError(`--user is required.\n\n${USAGE}`)
  const ids = values.get('ids')?.split(',').map(id => id.trim()).filter(id => id.length > 0)
  if (command === 'rollback' && (!ids || ids.length === 0)) {
    throw new ShowV2MigrateArgsError(`rollback needs --ids so it restores exactly the rows you name.\n\n${USAGE}`)
  }
  const stopAfterText = values.get('stop-after')
  const stopAfter = stopAfterText === undefined ? undefined : Number(stopAfterText)
  if (stopAfter !== undefined && (!Number.isSafeInteger(stopAfter) || stopAfter < 1)) {
    throw new ShowV2MigrateArgsError(`--stop-after needs a positive whole number.\n\n${USAGE}`)
  }
  return {
    command,
    persistTo,
    userId,
    ...(values.get('report') ? { report: values.get('report')! } : {}),
    ...(ids ? { ids } : {}),
    ...(stopAfter === undefined ? {} : { stopAfter }),
  }
}

/**
 * The committed report. It carries identities, source hashes, versions,
 * statuses, refusal details and compiled-artifact evidence, and deliberately no
 * Show name, Pattern source or record content: a migration report is reviewed
 * and kept, and personal content must not travel with it.
 */
export interface ShowV2MigrateReport {
  command: ShowV2MigrateCommand
  ranAt: string
  userIdHash: string
  totals: Record<string, number>
  rows: Array<{
    id: string
    sourceHash: string
    sourceVersion: 1 | 2
    status: ShowV2MigrationOutcome['status']
    detail?: string
  }>
}

export const REPORT_DETAIL_LIMIT = 240

export function buildShowV2MigrateReport(
  command: ShowV2MigrateCommand,
  userIdHash: string,
  outcomes: readonly ShowV2MigrationOutcome[],
  ranAt: string,
): ShowV2MigrateReport {
  const totals: Record<string, number> = {}
  for (const outcome of outcomes) totals[outcome.status] = (totals[outcome.status] ?? 0) + 1
  return {
    command,
    ranAt,
    userIdHash,
    totals,
    rows: outcomes.map(outcome => ({
      id: outcome.id,
      sourceHash: outcome.sourceHash,
      sourceVersion: outcome.sourceVersion,
      status: outcome.status,
      ...(outcome.detail === undefined ? {} : { detail: truncateDetail(outcome.detail) }),
    })),
  }
}

function truncateDetail(detail: string): string {
  const single = detail.replace(/\s+/g, ' ').trim()
  return single.length <= REPORT_DETAIL_LIMIT ? single : `${single.slice(0, REPORT_DETAIL_LIMIT - 3)}...`
}

/**
 * Locate the Show database inside a miniflare persistence directory. There is
 * one `.sqlite` per Durable Object namespace, so the file is chosen by looking
 * for the `personal_shows` table rather than by guessing a name.
 */
export function resolveLocalD1File(persistTo: string): string {
  const root = join(persistTo, 'v3', 'd1', 'miniflare-D1DatabaseObject')
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    throw new Error(`No local D1 store under ${root}. Start the runtime first, or pass the right --persist-to.`)
  }
  const candidates = entries
    .filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
    .map(name => join(root, name))
    .filter(path => statSync(path).isFile())
  for (const path of candidates) {
    const database = new DatabaseSync(path, { readOnly: true })
    try {
      const found = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'personal_shows'")
        .get()
      if (found) return path
    } finally {
      database.close()
    }
  }
  throw new Error(`No D1 database with a personal_shows table under ${root}.`)
}

type SqliteValue = string | number | bigint | null | Uint8Array

/**
 * Adapt `node:sqlite` to the narrow prepare/bind/all/first/run interface the
 * migration store already uses, so the operator command runs the same
 * production row reader and CAS writer the Worker runs.
 */
export function openLocalD1(file: string): D1ShowV2MigrationDatabaseLike & { close(): void } {
  const database = new DatabaseSync(file)
  return {
    prepare(sql: string): D1ShowV2MigrationStatementLike {
      const statement = database.prepare(sql)
      const make = (bound: SqliteValue[]): D1ShowV2MigrationStatementLike => ({
        bind: (...values: unknown[]) => make([...bound, ...values.map(toSqliteValue)]),
        all: async <T = Record<string, unknown>>() => ({ results: statement.all(...bound) as T[] }),
        first: async <T = Record<string, unknown>>() => (statement.get(...bound) as T | undefined) ?? null,
        run: async () => {
          const result = statement.run(...bound)
          return { success: true, meta: { changes: Number(result.changes) } }
        },
      })
      return make([])
    },
    close: () => database.close(),
  }
}

function toSqliteValue(value: unknown): SqliteValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Uint8Array) return value
  throw new Error(`A D1 binding of type ${typeof value} is not supported by the local adapter.`)
}
