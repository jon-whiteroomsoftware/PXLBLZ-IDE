import type { LibraryRecord } from '../engine/personalContentRecords'

export interface D1LibraryStatementLike {
  bind(...values: unknown[]): D1LibraryStatementLike
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ success: boolean }>
}

export interface D1DatabaseLibrariesLike {
  prepare(sql: string): D1LibraryStatementLike
}

export interface D1LibraryRow {
  id: string
  name: string
  src: string
  updated_at: number
}

export function libraryRecordFromRow(row: D1LibraryRow): LibraryRecord {
  return {
    id: row.id,
    name: row.name,
    src: row.src,
    updatedAt: row.updated_at,
  }
}

export async function listD1Libraries(
  db: D1DatabaseLibrariesLike,
  userId: string,
): Promise<LibraryRecord[]> {
  const { results } = await db
    .prepare(`
      SELECT id, name, src, updated_at
      FROM personal_libraries
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .bind(userId)
    .all<D1LibraryRow>()
  return results.map(libraryRecordFromRow)
}

export async function createD1Library(
  db: D1DatabaseLibrariesLike,
  userId: string,
  record: LibraryRecord,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO personal_libraries (
        user_id, id, name, src, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(userId, record.id, record.name, record.src, now, record.updatedAt)
    .run()
}

export async function updateD1Library(
  db: D1DatabaseLibrariesLike,
  userId: string,
  id: string,
  changes: Partial<Omit<LibraryRecord, 'id'>>,
): Promise<void> {
  const assignments: string[] = []
  const values: unknown[] = []
  addAssignment(assignments, values, 'name', changes.name)
  addAssignment(assignments, values, 'src', changes.src)
  addAssignment(assignments, values, 'updated_at', changes.updatedAt)
  if (assignments.length === 0) return

  await db
    .prepare(`
      UPDATE personal_libraries
      SET ${assignments.join(', ')}
      WHERE user_id = ? AND id = ?
    `)
    .bind(...values, userId, id)
    .run()
}

export async function deleteD1Library(
  db: D1DatabaseLibrariesLike,
  userId: string,
  id: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM personal_libraries WHERE user_id = ? AND id = ?')
    .bind(userId, id)
    .run()
}

function addAssignment(
  assignments: string[],
  values: unknown[],
  column: string,
  value: unknown,
): void {
  if (value === undefined) return
  assignments.push(`${column} = ?`)
  values.push(value)
}
