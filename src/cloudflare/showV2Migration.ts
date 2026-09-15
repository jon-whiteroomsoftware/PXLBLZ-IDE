import {
  replaceD1ShowV2IfCurrent,
  showRecordFromRow,
  type D1ShowRow,
} from './shows'
import {
  migrationSourceHash,
  type ShowV2MigrationOutcome,
  type ShowV2MigrationSource,
  type ShowV2MigrationStore,
} from '../engine/showV2Migration'

export interface D1ShowV2MigrationStatementLike {
  bind(...values: unknown[]): D1ShowV2MigrationStatementLike
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>
}

export interface D1ShowV2MigrationDatabaseLike {
  prepare(sql: string): D1ShowV2MigrationStatementLike
}

interface D1ShowV2MigrationRow extends D1ShowRow {
  user_id: string
  routing_switches_json: string
  created_at: number
}

interface D1ShowV2MigrationOutcomeRow {
  show_id: string
  source_hash: string
  source_version: number
  status: string
  detail_json: string | null
}

const SHOW_COLUMNS = `
  user_id, id, name, scenes_json, zones_json, cells_json, target_controller_profile_id,
  created_at, updated_at, stage_map_id, routing_layouts_json, routing_switches_json,
  transitions_json, output_contract_json, composition_json, output_effects_json,
  import_metadata_json, record_json
`

export function createD1ShowV2MigrationStore(
  db: D1ShowV2MigrationDatabaseLike,
  userId: string,
  now: () => number = () => Math.floor(Date.now() / 1000),
): ShowV2MigrationStore {
  const readRow = async (id: string): Promise<D1ShowV2MigrationRow | null> => db
    .prepare(`SELECT ${SHOW_COLUMNS} FROM personal_shows WHERE user_id = ? AND id = ? LIMIT 1`)
    .bind(userId, id)
    .first<D1ShowV2MigrationRow>()

  return {
    inventory: async () => {
      const { results } = await db
        .prepare(`SELECT ${SHOW_COLUMNS} FROM personal_shows WHERE user_id = ? ORDER BY id`)
        .bind(userId)
        .all<D1ShowV2MigrationRow>()
      return results.map((row): ShowV2MigrationSource => {
        const sourceVersion = row.record_json ? 2 : 1
        try {
          return { id: row.id, sourceVersion, document: showRecordFromRow(row), sourceRow: row }
        } catch (error) {
          return {
            id: row.id,
            sourceVersion,
            sourceRow: row,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      })
    },

    outcome: async (id) => {
      const row = await db
        .prepare(`
          SELECT show_id, source_hash, source_version, status, detail_json
          FROM personal_show_v2_migration_outcomes
          WHERE user_id = ? AND show_id = ?
          LIMIT 1
        `)
        .bind(userId, id)
        .first<D1ShowV2MigrationOutcomeRow>()
      if (!row) return undefined
      if (
        (row.source_version !== 1 && row.source_version !== 2)
        || (row.status !== 'converted' && row.status !== 'already-v2' && row.status !== 'refused')
      ) {
        throw new Error('Stored migration outcome for Show ' + id + ' is invalid.')
      }
      return {
        id: row.show_id,
        sourceHash: row.source_hash,
        sourceVersion: row.source_version,
        status: row.status,
        ...(row.detail_json ? { detail: parseDetail(row.detail_json, id) } : {}),
      } satisfies ShowV2MigrationOutcome
    },

    snapshot: async (source, sourceHash) => {
      await db
        .prepare(`
          INSERT INTO personal_show_v2_migration_backups (
            user_id, show_id, source_hash, source_row_json, created_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, show_id) DO NOTHING
        `)
        .bind(userId, source.id, sourceHash, JSON.stringify(source.sourceRow), now())
        .run()
    },

    writeV2: async (id, sourceHash, record) => {
      const current = await readRow(id)
      if (!current || migrationSourceHash(current) !== sourceHash) return 'changed-source'
      const written = await replaceD1ShowV2IfCurrent(db, userId, id, record, {
        updatedAt: current.updated_at,
        recordJson: current.record_json ?? null,
      })
      return written ? 'written' : 'changed-source'
    },

    read: async (id) => {
      const row = await readRow(id)
      if (!row) throw new Error('Show ' + id + ' is unavailable after migration write.')
      return showRecordFromRow(row)
    },

    record: async (outcome) => {
      await db
        .prepare(`
          INSERT INTO personal_show_v2_migration_outcomes (
            user_id, show_id, source_hash, source_version, status, detail_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, show_id) DO UPDATE SET
            source_hash = excluded.source_hash,
            source_version = excluded.source_version,
            status = excluded.status,
            detail_json = excluded.detail_json,
            updated_at = excluded.updated_at
        `)
        .bind(
          userId,
          outcome.id,
          outcome.sourceHash,
          outcome.sourceVersion,
          outcome.status,
          outcome.detail === undefined ? null : JSON.stringify(outcome.detail),
          now(),
        )
        .run()
    },

    restore: async (id) => {
      const backup = await db
        .prepare(`
          SELECT source_row_json
          FROM personal_show_v2_migration_backups
          WHERE user_id = ? AND show_id = ?
          LIMIT 1
        `)
        .bind(userId, id)
        .first<{ source_row_json: string }>()
      if (!backup) throw new Error('Show ' + id + ' has no migration backup to restore.')
      const original = parseBackup(backup.source_row_json, userId, id)
      const result = await db
        .prepare(`
          UPDATE personal_shows
          SET name = ?, scenes_json = ?, zones_json = ?, cells_json = ?,
              target_controller_profile_id = ?, created_at = ?, updated_at = ?, stage_map_id = ?,
              routing_layouts_json = ?, routing_switches_json = ?, transitions_json = ?,
              output_contract_json = ?, composition_json = ?, output_effects_json = ?,
              import_metadata_json = ?, record_json = ?
          WHERE user_id = ? AND id = ?
        `)
        .bind(
          original.name,
          original.scenes_json,
          original.zones_json,
          original.cells_json,
          original.target_controller_profile_id,
          original.created_at,
          original.updated_at,
          original.stage_map_id,
          original.routing_layouts_json,
          original.routing_switches_json,
          original.transitions_json,
          original.output_contract_json,
          original.composition_json,
          original.output_effects_json,
          original.import_metadata_json,
          original.record_json,
          userId,
          id,
        )
        .run()
      if (result.meta?.changes === 0) throw new Error('Show ' + id + ' disappeared before migration rollback.')
      await db
        .prepare('DELETE FROM personal_show_v2_migration_outcomes WHERE user_id = ? AND show_id = ?')
        .bind(userId, id)
        .run()
      const reopened = await readRow(id)
      if (!reopened || migrationSourceHash(reopened) !== migrationSourceHash(original)) {
        throw new Error('Show ' + id + ' did not restore byte-for-byte from its migration backup.')
      }
    },
  }
}

function parseDetail(value: string, id: string): string {
  try {
    const detail = JSON.parse(value)
    if (typeof detail === 'string') return detail
  } catch {
    // Fall through to the explicit corruption error.
  }
  throw new Error('Stored migration detail for Show ' + id + ' is invalid.')
}

function parseBackup(value: string, userId: string, id: string): D1ShowV2MigrationRow {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Migration backup for Show ' + id + ' is invalid JSON.')
  }
  if (
    !parsed
    || typeof parsed !== 'object'
    || Array.isArray(parsed)
    || (parsed as { user_id?: unknown }).user_id !== userId
    || (parsed as { id?: unknown }).id !== id
  ) {
    throw new Error('Migration backup for Show ' + id + ' does not match its owner and identity.')
  }
  return parsed as D1ShowV2MigrationRow
}
