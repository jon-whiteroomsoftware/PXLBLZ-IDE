import type { MapRecord } from '../engine/personalContentRecords'

export interface D1MapStatementLike {
  bind(...values: unknown[]): D1MapStatementLike
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ success: boolean }>
}

export interface D1DatabaseMapsLike {
  prepare(sql: string): D1MapStatementLike
}

export interface D1MapRow {
  id: string
  name: string
  dim: 1 | 2 | 3
  generator: string
  params_json: string
  points_json: string | null
  source: string | null
  grid_dims_json: string | null
  updated_at: number
}

export type MapChanges = Partial<Omit<MapRecord, 'id'>> & { gridDims?: MapRecord['gridDims'] | null }

export function mapRecordFromRow(row: D1MapRow): MapRecord {
  return {
    id: row.id,
    name: row.name,
    dim: row.dim,
    generator: row.generator,
    params: parseJson(row.params_json, {}),
    updatedAt: row.updated_at,
    ...(row.points_json ? { points: parseJson(row.points_json, []) } : {}),
    ...(row.source ? { source: row.source } : {}),
    ...(row.grid_dims_json ? { gridDims: parseJson(row.grid_dims_json, undefined) } : {}),
  }
}

export async function listD1Maps(db: D1DatabaseMapsLike, userId: string): Promise<MapRecord[]> {
  const { results } = await db
    .prepare(`
      SELECT id, name, dim, generator, params_json, points_json, source, grid_dims_json, updated_at
      FROM personal_maps
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .bind(userId)
    .all<D1MapRow>()
  return results.map(mapRecordFromRow)
}

export async function createD1Map(
  db: D1DatabaseMapsLike,
  userId: string,
  record: MapRecord,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO personal_maps (
        user_id, id, name, dim, generator, params_json, points_json, source,
        grid_dims_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId,
      record.id,
      record.name,
      record.dim,
      record.generator,
      JSON.stringify(record.params ?? {}),
      optionalJson(record.points),
      record.source ?? null,
      optionalJson(record.gridDims),
      now,
      record.updatedAt,
    )
    .run()
}

export async function updateD1Map(
  db: D1DatabaseMapsLike,
  userId: string,
  id: string,
  changes: MapChanges,
): Promise<void> {
  const assignments: string[] = []
  const values: unknown[] = []
  addAssignment(assignments, values, 'name', changes.name)
  addAssignment(assignments, values, 'dim', changes.dim)
  addAssignment(assignments, values, 'generator', changes.generator)
  addAssignment(assignments, values, 'params_json', changes.params, true)
  addAssignment(assignments, values, 'points_json', changes.points, true)
  addAssignment(assignments, values, 'source', changes.source)
  addAssignment(assignments, values, 'grid_dims_json', changes.gridDims, true)
  addAssignment(assignments, values, 'updated_at', changes.updatedAt)
  if (assignments.length === 0) return

  await db
    .prepare(`
      UPDATE personal_maps
      SET ${assignments.join(', ')}
      WHERE user_id = ? AND id = ?
    `)
    .bind(...values, userId, id)
    .run()
}

export async function deleteD1Map(db: D1DatabaseMapsLike, userId: string, id: string): Promise<void> {
  await db
    .prepare('DELETE FROM personal_maps WHERE user_id = ? AND id = ?')
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
  values.push(json ? optionalJson(value) : value)
}

function optionalJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value)
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
