import type { ShowRecord } from '../engine/personalContentRecords'

export interface D1ShowStatementLike {
  bind(...values: unknown[]): D1ShowStatementLike
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ success: boolean }>
}

export interface D1DatabaseShowsLike {
  prepare(sql: string): D1ShowStatementLike
}

export interface D1ShowRow {
  id: string
  name: string
  scenes_json: string
  zones_json: string
  cells_json: string
  target_controller_profile_id: string | null
  updated_at: number
}

export function showRecordFromRow(row: D1ShowRow): ShowRecord {
  return {
    id: row.id,
    name: row.name,
    scenes: parseJson(row.scenes_json, []),
    zones: parseJson(row.zones_json, []),
    cells: parseJson(row.cells_json, []),
    ...(row.target_controller_profile_id ? { targetControllerProfileId: row.target_controller_profile_id } : {}),
    updatedAt: row.updated_at,
  }
}

export async function listD1Shows(db: D1DatabaseShowsLike, userId: string): Promise<ShowRecord[]> {
  const { results } = await db
    .prepare(`
      SELECT id, name, scenes_json, zones_json, cells_json, target_controller_profile_id, updated_at
      FROM personal_shows
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .bind(userId)
    .all<D1ShowRow>()
  return results.map(showRecordFromRow)
}

export async function createD1Show(
  db: D1DatabaseShowsLike,
  userId: string,
  record: ShowRecord,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO personal_shows (
        user_id, id, name, scenes_json, zones_json, cells_json,
        target_controller_profile_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId,
      record.id,
      record.name,
      JSON.stringify(record.scenes),
      JSON.stringify(record.zones),
      JSON.stringify(record.cells),
      record.targetControllerProfileId ?? null,
      now,
      record.updatedAt,
    )
    .run()
}

export async function updateD1Show(
  db: D1DatabaseShowsLike,
  userId: string,
  id: string,
  changes: Partial<Omit<ShowRecord, 'id'>>,
): Promise<void> {
  const assignments: string[] = []
  const values: unknown[] = []
  addAssignment(assignments, values, 'name', changes.name)
  addAssignment(assignments, values, 'scenes_json', changes.scenes, true)
  addAssignment(assignments, values, 'zones_json', changes.zones, true)
  addAssignment(assignments, values, 'cells_json', changes.cells, true)
  addAssignment(assignments, values, 'target_controller_profile_id', changes.targetControllerProfileId)
  addAssignment(assignments, values, 'updated_at', changes.updatedAt)
  if (assignments.length === 0) return

  await db
    .prepare(`
      UPDATE personal_shows
      SET ${assignments.join(', ')}
      WHERE user_id = ? AND id = ?
    `)
    .bind(...values, userId, id)
    .run()
}

export async function deleteD1Show(db: D1DatabaseShowsLike, userId: string, id: string): Promise<void> {
  await db
    .prepare('DELETE FROM personal_shows WHERE user_id = ? AND id = ?')
    .bind(userId, id)
    .run()
}

function addAssignment(
  assignments: string[],
  values: unknown[],
  column: string,
  value: unknown,
  json = false,
): void {
  if (value === undefined) return
  assignments.push(`${column} = ?`)
  values.push(json ? JSON.stringify(value) : value)
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
