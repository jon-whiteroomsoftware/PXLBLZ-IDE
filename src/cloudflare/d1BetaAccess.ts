import {
  normalizeBetaAccessEmail,
  type BetaAccessEntry,
  type BetaAccessStore,
} from './betaAccess'

export interface D1BetaAccessRunResultLike {
  success: boolean
}

export interface D1BetaAccessStatementLike {
  bind(...values: unknown[]): D1BetaAccessStatementLike
  first<T>(): Promise<T | null>
  all<T>(): Promise<{ results: T[] }>
  run(): Promise<D1BetaAccessRunResultLike>
}

export interface D1BetaAccessDatabaseLike {
  prepare(sql: string): D1BetaAccessStatementLike
}

export interface D1BetaAccessStore extends BetaAccessStore {
  list(): Promise<BetaAccessEntry[]>
  add(email: string, label: string | null): Promise<void>
  disable(email: string): Promise<void>
  remove(email: string): Promise<void>
}

interface BetaAccessRow {
  email: string
  label: string | null
  enabled: number
  user_id: string | null
}

export function createD1BetaAccessStore(db: D1BetaAccessDatabaseLike): D1BetaAccessStore {
  const store: D1BetaAccessStore = {
    async isAuthoritative() {
      const row = await db.prepare(`
        SELECT value
        FROM app_metadata
        WHERE key = 'beta_access_mode'
        LIMIT 1
      `).first<{ value: string }>()
      return row?.value === 'd1'
    },

    async count() {
      const row = await db.prepare('SELECT COUNT(*) AS count FROM beta_access').first<{ count: number }>()
      return row?.count ?? 0
    },

    async getByEmail(emailInput) {
      const email = normalizeBetaAccessEmail(emailInput)
      const row = await db.prepare(`
        SELECT email, label, enabled, user_id
        FROM beta_access
        WHERE email = ? COLLATE NOCASE
        LIMIT 1
      `).bind(email).first<BetaAccessRow>()
      return row ? betaAccessEntry(row) : null
    },

    async findActiveForUser(userId) {
      const row = await db.prepare(`
        SELECT DISTINCT access.email, access.label, access.enabled, access.user_id
        FROM beta_access AS access
        LEFT JOIN identities AS identity
          ON lower(identity.email) = lower(access.email)
          AND identity.email_verified = 1
        WHERE access.enabled = 1
          AND (access.user_id = ? OR identity.user_id = ?)
        LIMIT 1
      `).bind(userId, userId).first<BetaAccessRow>()
      return row ? betaAccessEntry(row) : null
    },

    async bindUser(emailInput, userId) {
      const email = normalizeBetaAccessEmail(emailInput)
      await db.prepare(`
        UPDATE beta_access
        SET user_id = ?, updated_at = unixepoch()
        WHERE email = ? COLLATE NOCASE
          AND enabled = 1
          AND (user_id IS NULL OR user_id = ?)
      `).bind(userId, email, userId).run()
      const entry = await store.getByEmail(email)
      if (entry?.userId !== userId) {
        throw new Error(`Beta access for ${email} could not be claimed by ${userId}.`)
      }
    },

    async list() {
      const result = await db.prepare(`
        SELECT email, label, enabled, user_id
        FROM beta_access
        ORDER BY lower(email)
      `).all<BetaAccessRow>()
      return result.results.map(betaAccessEntry)
    },

    async add(emailInput, label) {
      const email = normalizeBetaAccessEmail(emailInput)
      await runChecked(db.prepare(`
        INSERT INTO beta_access (email, label, enabled, user_id, created_at, updated_at)
        VALUES (?, ?, 1, NULL, unixepoch(), unixepoch())
        ON CONFLICT(email) DO UPDATE SET
          label = COALESCE(excluded.label, beta_access.label),
          enabled = 1,
          updated_at = excluded.updated_at
      `).bind(email, label), `add beta access for ${email}`)
      await runChecked(db.prepare(`
        INSERT INTO app_metadata (key, value, updated_at)
        VALUES ('beta_access_mode', 'd1', unixepoch())
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `), 'activate D1 beta access')
    },

    async disable(emailInput) {
      const email = normalizeBetaAccessEmail(emailInput)
      await runChecked(db.prepare(`
        UPDATE beta_access
        SET enabled = 0, updated_at = unixepoch()
        WHERE email = ? COLLATE NOCASE
      `).bind(email), `disable beta access for ${email}`)
    },

    async remove(emailInput) {
      const email = normalizeBetaAccessEmail(emailInput)
      await runChecked(
        db.prepare('DELETE FROM beta_access WHERE email = ? COLLATE NOCASE').bind(email),
        `remove beta access for ${email}`,
      )
    },
  }
  return store
}

function betaAccessEntry(row: BetaAccessRow): BetaAccessEntry {
  return {
    email: normalizeBetaAccessEmail(row.email),
    label: row.label,
    enabled: row.enabled === 1,
    userId: row.user_id,
  }
}

async function runChecked(statement: D1BetaAccessStatementLike, action: string): Promise<void> {
  const result = await statement.run()
  if (!result.success) throw new Error(`Could not ${action}.`)
}
