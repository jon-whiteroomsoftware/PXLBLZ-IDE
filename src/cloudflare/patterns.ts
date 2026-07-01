import type { PatternRecord } from '../engine/storage'

export interface D1PatternStatementLike {
  bind(...values: unknown[]): D1PatternStatementLike
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ success: boolean }>
}

export interface D1DatabasePatternsLike {
  prepare(sql: string): D1PatternStatementLike
}

export interface D1PatternRow {
  id: string
  name: string
  src: string
  controls_json: string
  params_json: string | null
  settings_json: string | null
  updated_at: number
}

export function patternRecordFromRow(row: D1PatternRow): PatternRecord {
  return {
    id: row.id,
    name: row.name,
    src: row.src,
    controls: parseJsonRecord(row.controls_json, {}),
    updatedAt: row.updated_at,
    ...(row.params_json ? { params: parseJsonRecord(row.params_json, {}) } : {}),
    ...(row.settings_json ? { settings: parseJsonRecord(row.settings_json, {}) } : {}),
  }
}

export async function listD1Patterns(
  db: D1DatabasePatternsLike,
  userId: string,
): Promise<PatternRecord[]> {
  const { results } = await db
    .prepare(`
      SELECT id, name, src, controls_json, params_json, settings_json, updated_at
      FROM personal_patterns
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .bind(userId)
    .all<D1PatternRow>()
  return results.map(patternRecordFromRow)
}

export async function createD1Pattern(
  db: D1DatabasePatternsLike,
  userId: string,
  record: PatternRecord,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO personal_patterns (
        user_id,
        id,
        name,
        src,
        controls_json,
        params_json,
        settings_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId,
      record.id,
      record.name,
      record.src,
      JSON.stringify(record.controls ?? {}),
      optionalJson(record.params),
      optionalJson(record.settings),
      now,
      record.updatedAt,
    )
    .run()
}

export async function updateD1Pattern(
  db: D1DatabasePatternsLike,
  userId: string,
  id: string,
  changes: Partial<Omit<PatternRecord, 'id'>>,
): Promise<void> {
  const assignments: string[] = []
  const values: unknown[] = []
  addAssignment(assignments, values, 'name', changes.name)
  addAssignment(assignments, values, 'src', changes.src)
  addAssignment(assignments, values, 'controls_json', changes.controls, true)
  addAssignment(assignments, values, 'params_json', changes.params, true)
  addAssignment(assignments, values, 'settings_json', changes.settings, true)
  addAssignment(assignments, values, 'updated_at', changes.updatedAt)
  if (assignments.length === 0) return

  await db
    .prepare(`
      UPDATE personal_patterns
      SET ${assignments.join(', ')}
      WHERE user_id = ? AND id = ?
    `)
    .bind(...values, userId, id)
    .run()
}

export async function deleteD1Pattern(
  db: D1DatabasePatternsLike,
  userId: string,
  id: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM personal_patterns WHERE user_id = ? AND id = ?')
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
  return value === undefined ? null : JSON.stringify(value)
}

function parseJsonRecord<T extends Record<string, unknown>>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
