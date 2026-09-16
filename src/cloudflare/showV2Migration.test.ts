import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import {
  D1_SHOW_MIGRATION_CAS_COLUMNS,
  D1_SHOW_MIGRATION_SOURCE_COLUMNS,
  createD1Show,
  showRecordFromRow,
  type D1DatabaseShowsLike,
  type D1ShowRow,
} from './shows'
import { createD1ShowV2MigrationStore, type D1ShowV2MigrationDatabaseLike } from './showV2Migration'
import { rehearseShowV2Migration, rollbackShowV2Migration } from '../engine/showV2Migration'

let sqlite: DatabaseSync

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE personal_shows (
      user_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
      scenes_json TEXT NOT NULL DEFAULT '[]', zones_json TEXT NOT NULL DEFAULT '[]',
      cells_json TEXT NOT NULL DEFAULT '[]', target_controller_profile_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, stage_map_id TEXT,
      routing_layouts_json TEXT NOT NULL DEFAULT '[]',
      routing_switches_json TEXT NOT NULL DEFAULT '[]', transitions_json TEXT,
      output_contract_json TEXT, composition_json TEXT, output_effects_json TEXT,
      import_metadata_json TEXT, record_json TEXT,
      PRIMARY KEY (user_id, id)
    );
    CREATE TABLE personal_show_v2_migration_backups (
      user_id TEXT NOT NULL, show_id TEXT NOT NULL, source_hash TEXT NOT NULL,
      source_row_json TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, show_id)
    );
    CREATE TABLE personal_show_v2_migration_outcomes (
      user_id TEXT NOT NULL, show_id TEXT NOT NULL, source_hash TEXT NOT NULL,
      source_version INTEGER NOT NULL, status TEXT NOT NULL,
      detail_json TEXT, updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, show_id)
    );
  `)
})

afterEach(() => sqlite.close())

it('keeps migration inventory, backup hashes, and atomic writes on the complete persisted source row', () => {
  expect(D1_SHOW_MIGRATION_SOURCE_COLUMNS).toEqual([
    'user_id', 'id', 'name', 'scenes_json', 'zones_json', 'cells_json',
    'target_controller_profile_id', 'created_at', 'updated_at', 'stage_map_id',
    'routing_layouts_json', 'routing_switches_json', 'transitions_json',
    'output_contract_json', 'composition_json', 'output_effects_json',
    'import_metadata_json', 'record_json',
  ])
  expect(['user_id', 'id', ...D1_SHOW_MIGRATION_CAS_COLUMNS])
    .toEqual(D1_SHOW_MIGRATION_SOURCE_COLUMNS)
})

it('rehearses a real D1-shaped row, records its versioned outcome, and restores every source column', async () => {
  const userId = 'github:migration-test'
  const source = { ...convertibleV1Show(), id: 'migration-source', updatedAt: 123 }
  const db = d1Database(sqlite)
  await createD1Show(db, userId, source, 100)
  const original = readRow(sqlite, userId, source.id)
  const store = createD1ShowV2MigrationStore(db, userId, () => 456)

  await expect(rehearseShowV2Migration(store)).resolves.toEqual([
    expect.objectContaining({ id: source.id, sourceVersion: 1, status: 'converted' }),
  ])
  const migrated = readRow(sqlite, userId, source.id)
  expect(JSON.parse(String(migrated.record_json))).toMatchObject({ id: source.id, version: 2 })
  expect(sqlite.prepare(`
    SELECT source_version, status FROM personal_show_v2_migration_outcomes
    WHERE user_id = ? AND show_id = ?
  `).get(userId, source.id)).toEqual({ source_version: 1, status: 'converted' })
  expect(sqlite.prepare(`
    SELECT source_row_json FROM personal_show_v2_migration_backups
    WHERE user_id = ? AND show_id = ?
  `).get(userId, source.id)).toEqual({ source_row_json: JSON.stringify(original) })

  await expect(rehearseShowV2Migration(store)).resolves.toEqual([
    expect.objectContaining({ id: source.id, sourceVersion: 2, status: 'already-v2' }),
  ])
  await rollbackShowV2Migration(store, [source.id])

  expect(readRow(sqlite, userId, source.id)).toEqual(original)
  expect(showRecordFromRow(readRow(sqlite, userId, source.id))).toEqual(showRecordFromRow(original))
  expect(sqlite.prepare(`
    SELECT COUNT(*) AS count FROM personal_show_v2_migration_outcomes
    WHERE user_id = ? AND show_id = ?
  `).get(userId, source.id)).toEqual({ count: 0 })
})

it('snapshots and reports an unreadable legacy row without rewriting it', async () => {
  const userId = 'github:migration-test'
  sqlite.prepare(`
    INSERT INTO personal_shows (
      user_id, id, name, scenes_json, zones_json, cells_json,
      routing_layouts_json, routing_switches_json, created_at, updated_at
    ) VALUES (?, ?, ?, '[]', '[]', '[]', '[]', '[]', 1, 1)
  `).run(userId, 'unreadable', 'Unreadable')
  const before = readRow(sqlite, userId, 'unreadable')
  const store = createD1ShowV2MigrationStore(d1Database(sqlite), userId, () => 456)

  await expect(rehearseShowV2Migration(store)).resolves.toEqual([
    expect.objectContaining({
      id: 'unreadable',
      sourceVersion: 1,
      status: 'refused',
      detail: expect.stringContaining('missing a valid output contract'),
    }),
  ])

  expect(readRow(sqlite, userId, 'unreadable')).toEqual(before)
  expect(sqlite.prepare(`
    SELECT source_version, status FROM personal_show_v2_migration_outcomes
    WHERE user_id = ? AND show_id = ?
  `).get(userId, 'unreadable')).toEqual({ source_version: 1, status: 'refused' })
  expect(sqlite.prepare(`
    SELECT COUNT(*) AS count FROM personal_show_v2_migration_backups
    WHERE user_id = ? AND show_id = ?
  `).get(userId, 'unreadable')).toEqual({ count: 1 })
})

function d1Database(database: DatabaseSync): D1DatabaseShowsLike & D1ShowV2MigrationDatabaseLike {
  return {
    prepare(sql) {
      const statement = database.prepare(sql)
      let values: SQLInputValue[] = []
      return {
        bind(...next) {
          values = next as SQLInputValue[]
          return this
        },
        async all<T>() {
          return { results: statement.all(...values) as T[] }
        },
        async first<T>() {
          return (statement.get(...values) ?? null) as T | null
        },
        async run() {
          const result = statement.run(...values)
          return { success: true, meta: { changes: Number(result.changes) } }
        },
      }
    },
  }
}

function readRow(database: DatabaseSync, userId: string, id: string): D1ShowRow & Record<string, unknown> {
  return database.prepare(`
    SELECT user_id, id, name, scenes_json, zones_json, cells_json, target_controller_profile_id,
           created_at, updated_at, stage_map_id, routing_layouts_json, routing_switches_json,
           transitions_json, output_contract_json, composition_json, output_effects_json,
           import_metadata_json, record_json
    FROM personal_shows WHERE user_id = ? AND id = ?
  `).get(userId, id) as D1ShowRow & Record<string, unknown>
}
