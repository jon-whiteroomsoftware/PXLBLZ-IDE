import type { MixinRecord } from '../engine/personalContentRecords'

export interface D1MixinStatementLike {
  bind(...values: unknown[]): D1MixinStatementLike
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ success: boolean }>
}

export interface D1DatabaseMixinsLike {
  prepare(sql: string): D1MixinStatementLike
}

export interface D1MixinRow {
  id: string
  name: string
  kind: MixinRecord['kind']
  src: string
  updated_at: number
}

export function mixinRecordFromRow(row: D1MixinRow): MixinRecord {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    src: row.src,
    updatedAt: row.updated_at,
  }
}

export async function listD1Mixins(
  db: D1DatabaseMixinsLike,
  userId: string,
): Promise<MixinRecord[]> {
  const { results } = await db
    .prepare(`
      SELECT id, name, kind, src, updated_at
      FROM personal_mixins
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .bind(userId)
    .all<D1MixinRow>()
  return results.map(mixinRecordFromRow)
}

export async function createD1Mixin(
  db: D1DatabaseMixinsLike,
  userId: string,
  record: MixinRecord,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO personal_mixins (
        user_id, id, name, kind, src, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(userId, record.id, record.name, record.kind, record.src, now, record.updatedAt)
    .run()
}

export async function updateD1Mixin(
  db: D1DatabaseMixinsLike,
  userId: string,
  id: string,
  changes: Partial<Omit<MixinRecord, 'id'>>,
): Promise<void> {
  const assignments: string[] = []
  const values: unknown[] = []
  addAssignment(assignments, values, 'name', changes.name)
  addAssignment(assignments, values, 'kind', changes.kind)
  addAssignment(assignments, values, 'src', changes.src)
  addAssignment(assignments, values, 'updated_at', changes.updatedAt)
  if (assignments.length === 0) return

  await db
    .prepare(`
      UPDATE personal_mixins
      SET ${assignments.join(', ')}
      WHERE user_id = ? AND id = ?
    `)
    .bind(...values, userId, id)
    .run()
}

export async function deleteD1Mixin(
  db: D1DatabaseMixinsLike,
  userId: string,
  id: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM personal_mixins WHERE user_id = ? AND id = ?')
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
