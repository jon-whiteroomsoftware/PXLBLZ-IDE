import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { vi } from 'vitest'
import { createSessionToken, sessionCookieName } from '../../../cloudflare/auth'
import { createD1Show } from '../../../cloudflare/shows'
import { convertShowRecordV1ToV2 } from '../../../engine/showRecordV1ToV2'
import type { ShowRecordV2 } from '../../../engine/showCompositionV2'
import { convertibleV1Show } from '../../../test/showV2TracerFixture'
import worker, { type WorkerEnv } from '../../index'

// This Node suite exercises Shows routes; native OAuth runs in workerd suites.
vi.mock('@cloudflare/workers-oauth-provider', async () => (await import('../../../test/oauthProviderFake')).oauthProviderModule())

const userId = 'github:123'
const retired = {
  error: 'show-v1-retired',
  message: 'Show version 1 records are no longer read or written; convert them with the operator migration.',
}

function workerEnv(database: unknown): WorkerEnv {
  return {
    SESSION_SECRET: 'secret',
    PXLBLZ_DB: database,
    ASSETS: { fetch: async () => new Response('asset') },
  } as WorkerEnv
}

async function authenticationCookie(): Promise<string> {
  const token = await createSessionToken({
    userId,
    primaryProvider: 'github',
    primaryHandle: 'octocat',
    githubUserId: '123',
    githubLogin: 'octocat',
    displayName: 'The Octocat',
    avatarUrl: null,
  }, 'secret')
  return `${sessionCookieName}=${encodeURIComponent(token)}`
}

/** A D1-shaped `personal_shows` table; the storage-usage probe reports an empty account. */
function showsDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE personal_shows (
      user_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
      record_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );
  `)
  const db = {
    prepare(sql: string) {
      let values: SQLInputValue[] = []
      const usage = sql.includes('entity_count')
      const statement = usage ? undefined : sqlite.prepare(sql)
      return {
        bind(...next: unknown[]) {
          values = next as SQLInputValue[]
          return this
        },
        async first<T>() {
          if (usage) return { entity_count: 0, content_bytes: 0 } as T
          return (statement!.get(...values) ?? null) as T | null
        },
        async all<T>() {
          return { results: statement!.all(...values) as T[] }
        },
        async run() {
          const result = statement!.run(...values)
          return { success: true, meta: { changes: Number(result.changes) } }
        },
      }
    },
  }
  const rows = () => sqlite.prepare('SELECT id, name, record_json FROM personal_shows ORDER BY id')
    .all() as Array<{ id: string; name: string; record_json: string | null }>
  return { db, rows, sqlite }
}

function v2Record(id: string, name: string, updatedAt = 200): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2({ ...convertibleV1Show(), id, name })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return { ...converted.record, updatedAt }
}

async function seeded() {
  const store = showsDatabase()
  store.sqlite.prepare('INSERT INTO personal_shows (user_id, id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, 'v1-row', 'Unconverted', 1, 100)
  await createD1Show(store.db, userId, v2Record('v2-row', 'Converted'), 1)
  return store
}

async function send(db: unknown, path: string, init: RequestInit = {}): Promise<Response> {
  const request = new Request(`https://pxlblz.example${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', cookie: await authenticationCookie(), ...init.headers },
  })
  return worker.fetch(request, workerEnv(db))
}

describe('Shows API: the version-1 door is closed (#1042)', () => {
  it('refuses the version-1 list with 410 and names the operator migration', async () => {
    const { db } = await seeded()

    const response = await send(db, '/api/shows')

    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual(retired)
  })

  it('refuses a version-1 create with 410 before anything is written', async () => {
    const { db, rows } = await seeded()
    const before = rows()

    const response = await send(db, '/api/shows', {
      method: 'POST',
      body: JSON.stringify({ ...convertibleV1Show(), id: 'v1-new' }),
    })

    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual(retired)
    expect(rows()).toEqual(before)
  })

  it('refuses a version-1 PATCH with 410 and leaves the stored row untouched', async () => {
    const { db, rows } = await seeded()
    const before = rows()

    const response = await send(db, '/api/shows/v1-row', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed', scenes: [], updatedAt: 999 }),
    })

    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual(retired)
    expect(rows()).toEqual(before)
  })

  it('never lists a row without a version-2 record', async () => {
    const { db } = await seeded()

    const response = await send(db, '/api/shows?show-version=2')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      shows: [v2Record('v2-row', 'Converted')],
      unreadableShows: [],
    })
  })

  it('creates through the version-2 route and refuses a version-1 body there', async () => {
    const { db, rows } = showsDatabase()
    const record = v2Record('v2-new', 'Created')

    const created = await send(db, '/api/shows?show-version=2', { method: 'POST', body: JSON.stringify(record) })
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toEqual({ show: record })

    const v1Body = await send(db, '/api/shows?show-version=2', {
      method: 'POST',
      body: JSON.stringify({ ...convertibleV1Show(), id: 'v1-body' }),
    })
    expect(v1Body.status).toBe(400)
    expect(rows().map(row => row.id)).toEqual(['v2-new'])

    const listed = await send(db, '/api/shows?show-version=2')
    await expect(listed.json()).resolves.toEqual({ shows: [record], unreadableShows: [] })
  })

  it('keeps the version-2 PUT replacement and its opt-in refusal unchanged', async () => {
    const { db, rows } = await seeded()
    const replacement = { ...v2Record('v2-row', 'Renamed v2'), updatedAt: 300 }

    const refused = await send(db, '/api/shows/v2-row', { method: 'PUT', body: JSON.stringify(replacement) })
    expect(refused.status).toBe(400)

    const replaced = await send(db, '/api/shows/v2-row?show-version=2', { method: 'PUT', body: JSON.stringify(replacement) })
    expect(replaced.status).toBe(200)
    await expect(replaced.json()).resolves.toEqual({ show: replacement })
    expect(JSON.parse(rows().find(row => row.id === 'v2-row')!.record_json!)).toEqual(replacement)
  })

  it('keeps DELETE unchanged for rows with and without a record', async () => {
    const { db, rows } = await seeded()

    expect((await send(db, '/api/shows/v2-row', { method: 'DELETE' })).status).toBe(200)
    expect((await send(db, '/api/shows/v1-row', { method: 'DELETE' })).status).toBe(200)
    expect(rows()).toEqual([])
  })
})

describe('Shows API output-contract validation (#653)', () => {
  it('returns a named 400 before a contract-less Show reaches D1', async () => {
    const { outputContract: _outputContract, ...show } = v2Record('contract-less-show', 'Contract-less')
    const { db, rows } = showsDatabase()

    const response = await send(db, '/api/shows?show-version=2', { method: 'POST', body: JSON.stringify(show) })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'missing_show_output_contract',
      error: 'Show contract-less-show is missing a valid output contract',
    })
    expect(rows()).toEqual([])
  })

  it('does not surface a row without a record as an unreadable v2 Show', async () => {
    const store = showsDatabase()
    store.sqlite.prepare('INSERT INTO personal_shows (user_id, id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, 'legacy-show', 'Legacy', 1, 123)

    const response = await send(store.db, '/api/shows?show-version=2')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ shows: [], unreadableShows: [] })
  })
})
