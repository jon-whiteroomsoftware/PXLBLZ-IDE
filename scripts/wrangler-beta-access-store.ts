import { normalizeBetaAccessEmail, type BetaAccessEntry } from '../src/cloudflare/betaAccess'
import type { BetaAccessCommandStore } from './beta-access-lib'

export type WranglerBetaAccessExecutor = (sql: string) => Promise<Array<Record<string, unknown>>>

export function wranglerBetaAccessArgs(remote: boolean, sql: string): string[] {
  return [
    'd1',
    'execute',
    'pxlblz-ide',
    remote ? '--remote' : '--local',
    '--command',
    sql,
    '--json',
  ]
}

interface BetaAccessRecord {
  email: string
  label: string | null
  enabled: number
  user_id: string | null
}

export function createWranglerBetaAccessStore(
  execute: WranglerBetaAccessExecutor,
): BetaAccessCommandStore {
  return {
    async list() {
      const rows = await execute(`
        SELECT email, label, enabled, user_id
        FROM beta_access
        ORDER BY lower(email)
      `)
      return rows.map((row) => betaAccessEntry(row as unknown as BetaAccessRecord))
    },

    async getByEmail(emailInput) {
      const email = normalizeBetaAccessEmail(emailInput)
      const rows = await execute(`
        SELECT email, label, enabled, user_id
        FROM beta_access
        WHERE email = ${sqlString(email)} COLLATE NOCASE
        LIMIT 1
      `)
      const row = rows[0] as unknown as BetaAccessRecord | undefined
      return row ? betaAccessEntry(row) : null
    },

    async add(emailInput, label) {
      const email = normalizeBetaAccessEmail(emailInput)
      await execute(`
        INSERT INTO beta_access (email, label, enabled, user_id, created_at, updated_at)
        VALUES (${sqlString(email)}, ${label === null ? 'NULL' : sqlString(label)}, 1, NULL, unixepoch(), unixepoch())
        ON CONFLICT(email) DO UPDATE SET
          label = COALESCE(excluded.label, beta_access.label),
          enabled = 1,
          updated_at = excluded.updated_at;
        INSERT INTO app_metadata (key, value, updated_at)
        VALUES ('beta_access_mode', 'd1', unixepoch())
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
    },

    async disable(emailInput) {
      const email = normalizeBetaAccessEmail(emailInput)
      await execute(`
        UPDATE beta_access
        SET enabled = 0, updated_at = unixepoch()
        WHERE email = ${sqlString(email)} COLLATE NOCASE
      `)
    },

    async remove(emailInput) {
      const email = normalizeBetaAccessEmail(emailInput)
      await execute(`DELETE FROM beta_access WHERE email = ${sqlString(email)} COLLATE NOCASE`)
    },
  }
}

export function parseWranglerD1Json(output: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(output) as unknown
  if (!Array.isArray(parsed)) throw new Error('Wrangler returned an unexpected D1 result.')
  const rows: Array<Record<string, unknown>> = []
  for (const result of parsed) {
    if (!result || typeof result !== 'object') throw new Error('Wrangler returned an unexpected D1 result.')
    const record = result as { success?: boolean; results?: unknown }
    if (record.success !== true) throw new Error('Wrangler D1 command failed.')
    if (!Array.isArray(record.results)) continue
    for (const row of record.results) {
      if (row && typeof row === 'object') rows.push(row as Record<string, unknown>)
    }
  }
  return rows
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function betaAccessEntry(row: BetaAccessRecord): BetaAccessEntry {
  return {
    email: normalizeBetaAccessEmail(row.email),
    label: row.label,
    enabled: row.enabled === 1,
    userId: row.user_id,
  }
}
