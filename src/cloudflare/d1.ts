export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike
}

export interface D1Health {
  ok: boolean
  schemaVersion: string | null
}

export async function d1HealthResponse(db: D1DatabaseLike): Promise<D1Health> {
  try {
    const row = await db
      .prepare('SELECT value FROM app_metadata WHERE key = ? LIMIT 1')
      .bind('schema_version')
      .first<{ value: string }>()

    return { ok: true, schemaVersion: row?.value ?? null }
  } catch {
    return { ok: false, schemaVersion: null }
  }
}
