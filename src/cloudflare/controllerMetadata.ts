export interface D1ControllerMetadataStatementLike {
  bind(...values: unknown[]): D1ControllerMetadataStatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<{ success: boolean }>
}

export interface D1DatabaseControllerMetadataLike {
  prepare(sql: string): D1ControllerMetadataStatementLike
}

export async function getD1ControllerMetadata<T>(
  db: D1DatabaseControllerMetadataLike,
  userId: string,
  key: string,
): Promise<T | undefined> {
  const row = await db
    .prepare('SELECT value_json FROM controller_metadata WHERE user_id = ? AND key = ? LIMIT 1')
    .bind(userId, key)
    .first<{ value_json: string }>()
  if (!row) return undefined
  return JSON.parse(row.value_json) as T
}

export async function setD1ControllerMetadata<T>(
  db: D1DatabaseControllerMetadataLike,
  userId: string,
  key: string,
  value: T,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO controller_metadata (user_id, key, value_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `)
    .bind(userId, key, JSON.stringify(value), now)
    .run()
}
