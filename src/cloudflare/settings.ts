export interface D1SettingsStatementLike {
  bind(...values: unknown[]): D1SettingsStatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<{ success: boolean }>
}

export interface D1DatabaseSettingsLike {
  prepare(sql: string): D1SettingsStatementLike
}

export async function getD1Setting<T>(
  db: D1DatabaseSettingsLike,
  userId: string,
  key: string,
): Promise<T | undefined> {
  const row = await db
    .prepare('SELECT value_json FROM personal_settings WHERE user_id = ? AND key = ? LIMIT 1')
    .bind(userId, key)
    .first<{ value_json: string }>()
  if (!row) return undefined
  return JSON.parse(row.value_json) as T
}

export async function setD1Setting<T>(
  db: D1DatabaseSettingsLike,
  userId: string,
  key: string,
  value: T,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO personal_settings (user_id, key, value_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `)
    .bind(userId, key, JSON.stringify(value), now)
    .run()
}
