import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { rehearseShowV2Migration, rollbackShowV2Migration, type ShowV2MigrationStore } from '../engine/showV2Migration'
import { createD1Show, type D1DatabaseShowsLike } from './shows'
import { createD1ShowV2MigrationStore, type D1ShowV2MigrationDatabaseLike } from './showV2Migration'

let runtime: Miniflare

beforeAll(async () => {
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default { fetch() { return new Response("migration rehearsal") } }',
    compatibilityDate: '2026-06-30',
    d1Databases: ['PXLBLZ_DB'],
  }))
})

afterAll(async () => { await runtime?.dispose() })

it('uses real D1 for interrupted resume, rollback, and immutable backup generations', async () => {
  const db = await runtime.getD1Database('PXLBLZ_DB')
  await executeSql(db as unknown as D1ShowV2MigrationDatabaseLike, `
    CREATE TABLE app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE personal_shows (
      user_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
      scenes_json TEXT NOT NULL DEFAULT '[]', zones_json TEXT NOT NULL DEFAULT '[]',
      cells_json TEXT NOT NULL DEFAULT '[]', target_controller_profile_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, stage_map_id TEXT,
      routing_layouts_json TEXT NOT NULL DEFAULT '[]',
      routing_switches_json TEXT NOT NULL DEFAULT '[]', transitions_json TEXT,
      output_contract_json TEXT, composition_json TEXT, output_effects_json TEXT,
      import_metadata_json TEXT,
      PRIMARY KEY (user_id, id)
    );
  `)
  await executeSql(
    db as unknown as D1ShowV2MigrationDatabaseLike,
    readFileSync('migrations/0028_show_v2_record.sql', 'utf8'),
  )

  const typedDb = db as unknown as D1DatabaseShowsLike & D1ShowV2MigrationDatabaseLike
  const migrationDb = db as unknown as D1ShowV2MigrationDatabaseLike
  const userId = 'github:issue-1044-disposable'
  for (const [index, id] of ['a-first', 'b-second'].entries()) {
    await createD1Show(typedDb, userId, { ...convertibleV1Show(), id, updatedAt: 100 + index }, 10 + index)
  }
  const originals = await readRows(typedDb, userId)
  const store = createD1ShowV2MigrationStore(typedDb, userId, () => 456)
  let interrupt = true
  const interruptedStore: ShowV2MigrationStore = {
    ...store,
    record: async outcome => {
      if (interrupt) {
        interrupt = false
        throw new Error('synthetic interruption after D1 replacement')
      }
      await store.record(outcome)
    },
  }

  await expect(rehearseShowV2Migration(interruptedStore)).rejects.toThrow('synthetic interruption')
  expect(await migrationState(typedDb, userId)).toEqual({
    backups: 1,
    outcomes: 0,
    versions: [['a-first', 2], ['b-second', 1]],
  })

  await expect(rehearseShowV2Migration(store)).resolves.toEqual([
    expect.objectContaining({ id: 'a-first', sourceVersion: 2, status: 'already-v2' }),
    expect.objectContaining({ id: 'b-second', sourceVersion: 1, status: 'converted' }),
  ])
  expect(await migrationState(typedDb, userId)).toEqual({
    backups: 2,
    outcomes: 2,
    versions: [['a-first', 2], ['b-second', 2]],
  })

  await rollbackShowV2Migration(store, ['a-first', 'b-second'])
  expect(await readRows(typedDb, userId)).toEqual(originals)
  expect(await migrationState(typedDb, userId)).toEqual({
    backups: 2,
    outcomes: 0,
    versions: [['a-first', 1], ['b-second', 1]],
  })

  const repairedUserId = 'github:issue-1044-repaired'
  const repairedSource = { ...convertibleV1Show(), id: 'repaired-source', updatedAt: 200 }
  await createD1Show(typedDb, repairedUserId, repairedSource, 20)
  await typedDb.prepare(`
    UPDATE personal_shows SET output_contract_json = NULL
    WHERE user_id = ? AND id = ?
  `).bind(repairedUserId, repairedSource.id).run()
  const repairedStore = createD1ShowV2MigrationStore(typedDb, repairedUserId, () => 789)

  await expect(rehearseShowV2Migration(repairedStore)).resolves.toEqual([
    expect.objectContaining({ id: repairedSource.id, status: 'refused' }),
  ])
  const backupA = await migrationDb.prepare(`
    SELECT source_hash, source_row_json FROM personal_show_v2_migration_backups
    WHERE user_id = ? AND show_id = ?
  `).bind(repairedUserId, repairedSource.id).first<Record<string, unknown>>()

  await typedDb.prepare(`
    UPDATE personal_shows SET name = ?, output_contract_json = ?
    WHERE user_id = ? AND id = ?
  `).bind('Repaired B', JSON.stringify(repairedSource.outputContract), repairedUserId, repairedSource.id).run()
  const repairedB = await readRows(typedDb, repairedUserId)

  await expect(rehearseShowV2Migration(repairedStore)).resolves.toEqual([
    expect.objectContaining({
      id: repairedSource.id,
      status: 'refused',
      detail: 'Migration backup belongs to a different source revision.',
    }),
  ])
  expect(await readRows(typedDb, repairedUserId)).toEqual(repairedB)
  expect(await migrationDb.prepare(`
    SELECT source_hash, source_row_json FROM personal_show_v2_migration_backups
    WHERE user_id = ? AND show_id = ?
  `).bind(repairedUserId, repairedSource.id).first<Record<string, unknown>>()).toEqual(backupA)
  await expect(rollbackShowV2Migration(repairedStore, [repairedSource.id]))
    .rejects.toThrow('changed after its migration backup')
  expect(await readRows(typedDb, repairedUserId)).toEqual(repairedB)

  const rolledBackSource = { ...convertibleV1Show(), id: 'rolled-back-source', updatedAt: 300 }
  await createD1Show(typedDb, repairedUserId, rolledBackSource, 30)
  await expect(rehearseShowV2Migration(repairedStore)).resolves.toEqual(expect.arrayContaining([
    expect.objectContaining({ id: rolledBackSource.id, status: 'converted' }),
  ]))
  await rollbackShowV2Migration(repairedStore, [rolledBackSource.id])
  await typedDb.prepare(`
    UPDATE personal_shows SET name = ? WHERE user_id = ? AND id = ?
  `).bind('Edited after rollback', repairedUserId, rolledBackSource.id).run()
  const editedAfterRollback = (await readRows(typedDb, repairedUserId))
    .find(row => row.id === rolledBackSource.id)
  await expect(rehearseShowV2Migration(repairedStore)).resolves.toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: rolledBackSource.id,
      status: 'refused',
      detail: 'Migration backup belongs to a different source revision.',
    }),
  ]))
  expect((await readRows(typedDb, repairedUserId)).find(row => row.id === rolledBackSource.id))
    .toEqual(editedAfterRollback)

  const conversionRaceUserId = 'github:issue-1044-conversion-race'
  const conversionRaceSource = { ...convertibleV1Show(), id: 'conversion-race', updatedAt: 350 }
  await createD1Show(typedDb, conversionRaceUserId, conversionRaceSource, 35)
  const conversionRaceBefore = (await readRows(typedDb, conversionRaceUserId))[0]
  expect(conversionRaceBefore.stage_map_id).toBeNull()
  const conversionRaceStore = createD1ShowV2MigrationStore(
    databaseWithShowWriteRace(
      migrationDb,
      conversionRaceUserId,
      conversionRaceSource.id,
      'Concurrent conversion edit',
      'concurrent-map',
    ),
    conversionRaceUserId,
    () => 789,
  )
  await expect(rehearseShowV2Migration(conversionRaceStore)).resolves.toEqual([
    expect.objectContaining({
      id: conversionRaceSource.id,
      status: 'refused',
      detail: 'Source changed after inventory.',
    }),
  ])
  expect((await readRows(typedDb, conversionRaceUserId))[0]).toEqual({
    ...conversionRaceBefore,
    name: 'Concurrent conversion edit',
    stage_map_id: 'concurrent-map',
  })

  const racedSource = { ...convertibleV1Show(), id: 'raced-source', updatedAt: 400 }
  await createD1Show(typedDb, repairedUserId, racedSource, 40)
  await expect(rehearseShowV2Migration(repairedStore)).resolves.toEqual(expect.arrayContaining([
    expect.objectContaining({ id: racedSource.id, status: 'converted' }),
  ]))
  const convertedBeforeRace = (await readRows(typedDb, repairedUserId))
    .find(row => row.id === racedSource.id)
  const racingStore = createD1ShowV2MigrationStore(
    databaseWithShowWriteRace(migrationDb, repairedUserId, racedSource.id, 'Concurrent rollback edit'),
    repairedUserId,
    () => 790,
  )
  await expect(rollbackShowV2Migration(racingStore, [racedSource.id]))
    .rejects.toThrow('changed during migration rollback')
  expect((await readRows(typedDb, repairedUserId)).find(row => row.id === racedSource.id))
    .toEqual({ ...convertedBeforeRace, name: 'Concurrent rollback edit' })
}, 15_000)

const SHOW_COLUMNS = `
  user_id, id, name, scenes_json, zones_json, cells_json, target_controller_profile_id,
  created_at, updated_at, stage_map_id, routing_layouts_json, routing_switches_json,
  transitions_json, output_contract_json, composition_json, output_effects_json,
  import_metadata_json, record_json
`

async function readRows(db: D1ShowV2MigrationDatabaseLike, userId: string): Promise<Record<string, unknown>[]> {
  const result = await db.prepare(`SELECT ${SHOW_COLUMNS} FROM personal_shows WHERE user_id = ? ORDER BY id`)
    .bind(userId)
    .all<Record<string, unknown>>()
  return result.results
}

async function migrationState(db: D1ShowV2MigrationDatabaseLike, userId: string) {
  const rows = await readRows(db, userId)
  const backups = await db.prepare('SELECT COUNT(*) AS count FROM personal_show_v2_migration_backups WHERE user_id = ?')
    .bind(userId)
    .first<{ count: number }>()
  const outcomes = await db.prepare('SELECT COUNT(*) AS count FROM personal_show_v2_migration_outcomes WHERE user_id = ?')
    .bind(userId)
    .first<{ count: number }>()
  return {
    backups: backups?.count ?? 0,
    outcomes: outcomes?.count ?? 0,
    versions: rows.map(row => [row.id, row.record_json ? 2 : 1]),
  }
}

async function executeSql(db: D1ShowV2MigrationDatabaseLike, sql: string): Promise<void> {
  for (const statement of sql.split(';').map(part => part.trim()).filter(Boolean)) {
    const result = await db.prepare(statement).run()
    if (!result.success) throw new Error(`D1 refused migration statement: ${statement}`)
  }
}

function databaseWithShowWriteRace(
  db: D1ShowV2MigrationDatabaseLike,
  userId: string,
  id: string,
  name: string,
  stageMapId?: string,
): D1ShowV2MigrationDatabaseLike {
  let injected = false
  return {
    prepare(sql) {
      const statement = db.prepare(sql)
      let bound = statement
      return {
        bind(...values) {
          bound = statement.bind(...values)
          return this
        },
        all: <T>() => bound.all<T>(),
        first: <T>() => bound.first<T>(),
        async run() {
          if (!injected && sql.includes('SET name = ?, scenes_json = ?')) {
            injected = true
            const update = stageMapId
              ? db.prepare(`
                  UPDATE personal_shows SET name = ?, stage_map_id = ?
                  WHERE user_id = ? AND id = ?
                `).bind(name, stageMapId, userId, id)
              : db.prepare(`
                  UPDATE personal_shows SET name = ?
                  WHERE user_id = ? AND id = ?
                `).bind(name, userId, id)
            await update.run()
          }
          return bound.run()
        },
      }
    },
  }
}
