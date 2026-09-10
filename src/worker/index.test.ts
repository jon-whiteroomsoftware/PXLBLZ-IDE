import { describe, expect, it } from 'vitest'
import { createSessionToken, sessionCookieName } from '../cloudflare/auth'
import { PersonalStorageGuardError } from '../cloudflare/resourceProtection'
import {
  MAX_PERSONAL_ENTITY_ROWS,
  MAX_WRITE_REQUEST_BYTES,
} from '../cloudflare/resourceProtection'
import { apiRoutes } from './apiRoutes'
import worker, { handleApiRequest, type WorkerEnv } from './index'
import type { WorkerRoute } from './router'

function envWithAssets(assets?: (request: Request) => Response): WorkerEnv {
  return {
    ASSETS: {
      fetch: async (request: Request) => (assets ? assets(request) : new Response('asset')),
    },
  } as WorkerEnv
}

function envWithDatabase(database: unknown): WorkerEnv {
  return {
    SESSION_SECRET: 'secret',
    PXLBLZ_DB: database,
    ASSETS: { fetch: async () => new Response('asset') },
  } as WorkerEnv
}

async function authenticatedRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Request> {
  const token = await createSessionToken({
    userId: 'github:123',
    primaryProvider: 'github',
    primaryHandle: 'octocat',
    githubUserId: '123',
    githubLogin: 'octocat',
    displayName: 'The Octocat',
    avatarUrl: null,
  }, 'secret')
  return new Request(`https://pxlblz.example${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: `${sessionCookieName}=${encodeURIComponent(token)}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('worker fetch handler', () => {
  it('serves a cookieless /api/me as signed out through the real route table', async () => {
    const response = await worker.fetch(new Request('https://app.test/api/me'), envWithAssets())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ authenticated: false })
  })

  it('reports D1 health as unavailable when the binding is missing', async () => {
    const response = await worker.fetch(new Request('https://app.test/api/d1/health'), envWithAssets())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, schemaVersion: null })
  })

  it('answers unknown /api paths worker-first with a JSON 404, never the SPA', async () => {
    const response = await worker.fetch(new Request('https://app.test/api/no-such-route'), envWithAssets())
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it('answers a known path with an unsupported method with 405 and Allow', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/me', { method: 'PATCH' }),
      envWithAssets(),
    )
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET')
  })

  it('delegates every non-API path to the assets binding', async () => {
    const seen: string[] = []
    const env = envWithAssets((request) => {
      seen.push(new URL(request.url).pathname)
      return new Response('spa-shell')
    })
    const response = await worker.fetch(new Request('https://app.test/p/oasis'), env)
    expect(await response.text()).toBe('spa-shell')
    expect(seen).toEqual(['/p/oasis'])
  })

  it('maps personal-storage guard errors and rethrows the rest', async () => {
    const table: WorkerRoute<WorkerEnv>[] = [
      {
        path: '/api/guarded',
        methods: {
          GET: () => {
            throw new PersonalStorageGuardError('write_too_large', 413, 'Write request exceeds the limit')
          },
        },
      },
      {
        path: '/api/broken',
        methods: {
          GET: () => {
            throw new Error('unrelated failure')
          },
        },
      },
    ]
    const guarded = await handleApiRequest(table, new Request('https://app.test/api/guarded'), envWithAssets())
    expect(guarded.status).toBe(413)
    expect(await guarded.json()).toEqual({ error: 'Write request exceeds the limit', code: 'write_too_large' })

    await expect(
      handleApiRequest(table, new Request('https://app.test/api/broken'), envWithAssets()),
    ).rejects.toThrow('unrelated failure')
  })

  it('dispatches authenticated requests without pre-checking retired beta access state', async () => {
    const request = await authenticatedRequest('GET', '/api/me')
    const database = {
      prepare(): never {
        throw new Error('Worker guard queried retired beta access state')
      },
    }
    const table: WorkerRoute<WorkerEnv>[] = [{
      path: '/api/me',
      methods: { GET: () => Response.json({ authenticated: true }) },
    }]

    const response = await handleApiRequest(table, request, envWithDatabase(database))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ authenticated: true })
  })
})

describe('api route table', () => {
  it('registers the complete Worker API surface', () => {
    const registered = apiRoutes
      .flatMap((route) => Object.keys(route.methods).map((method) => `${method} ${route.path}`))
      .sort()
    expect(registered).toEqual([
      'DELETE /api/controllers/[id]',
      'DELETE /api/libraries/[id]',
      'DELETE /api/maps/[id]',
      'DELETE /api/mixins/[id]',
      'DELETE /api/patterns/[id]',
      'DELETE /api/shows/[id]',
      'GET /api/auth/callback',
      'GET /api/auth/login',
      'GET /api/auth/logout',
      'GET /api/controller-metadata/[key]',
      'GET /api/controllers',
      'GET /api/controllers/[id]',
      'GET /api/d1/health',
      'GET /api/libraries',
      'GET /api/maps',
      'GET /api/me',
      'GET /api/mixins',
      'GET /api/patterns',
      'GET /api/settings/[key]',
      'GET /api/shows',
      'PATCH /api/controllers/[id]',
      'PATCH /api/libraries/[id]',
      'PATCH /api/maps/[id]',
      'PATCH /api/mixins/[id]',
      'PATCH /api/patterns/[id]',
      'PATCH /api/shows/[id]',
      'POST /api/agent/channel',
      'POST /api/auth/disconnect',
      'POST /api/auth/logout',
      'POST /api/controllers',
      'POST /api/libraries',
      'POST /api/maps',
      'POST /api/mixins',
      'POST /api/patterns',
      'POST /api/shows',
      'PUT /api/controller-metadata/[key]',
      'PUT /api/settings/[key]',
    ])
  })
})

describe('personal-storage API protection (#407)', () => {
  it('blocks Pattern creation at the million-row tripwire before inserting', async () => {
    let inserted = false
    const database = {
      prepare(sql: string) {
        return {
          bind() {
            return this
          },
          async first<T>() {
            expect(sql).toContain('personal_patterns')
            return { entity_count: MAX_PERSONAL_ENTITY_ROWS, content_bytes: 0 } as T
          },
          async all<T>() {
            return { results: [] as T[] }
          },
          async run() {
            inserted = true
            return { success: true }
          },
        }
      },
    }
    const request = await authenticatedRequest('POST', '/api/patterns', {
      id: 'pattern-1',
      name: 'Pattern 1',
      src: 'export function render() {}',
      controls: [],
    })

    const response = await worker.fetch(request, envWithDatabase(database))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'entity_limit_reached' })
    expect(inserted).toBe(false)
  })

  it('rejects arbitrary settings keys before querying D1', async () => {
    const request = await authenticatedRequest('GET', '/api/settings/attacker-row')
    const database = {
      prepare(): never {
        throw new Error('D1 should not be queried for an unknown key')
      },
    }

    const response = await worker.fetch(request, envWithDatabase(database))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'unknown_storage_key' })
  })

  it('applies the write-body guard to every durable mutation route', async () => {
    const routes = [
      ['POST', '/api/patterns'],
      ['PATCH', '/api/patterns/p1'],
      ['POST', '/api/maps'],
      ['PATCH', '/api/maps/m1'],
      ['POST', '/api/mixins'],
      ['PATCH', '/api/mixins/x1'],
      ['POST', '/api/libraries'],
      ['PATCH', '/api/libraries/l1'],
      ['POST', '/api/shows'],
      ['PATCH', '/api/shows/s1'],
      ['POST', '/api/controllers'],
      ['PATCH', '/api/controllers/c1'],
      ['PUT', '/api/settings/lastActive'],
      ['PUT', '/api/controller-metadata/controller-bindings'],
    ] as const
    const database = {
      prepare(sql: string) {
        if (sql.includes('app_metadata')) {
          return {
            bind() { return this },
            async first<T>() { return { value: 'legacy' } as T },
            async all<T>() { return { results: [] as T[] } },
            async run() { return { success: true } },
          }
        }
        throw new Error('Oversized writes must be rejected before querying D1')
      },
    }

    for (const [method, path] of routes) {
      const original = await authenticatedRequest(method, path, {})
      const request = new Request(original, {
        headers: {
          ...Object.fromEntries(original.headers),
          'content-length': String(MAX_WRITE_REQUEST_BYTES + 1),
        },
      })
      const response = await worker.fetch(request, envWithDatabase(database))

      expect(response.status, `${method} ${path}`).toBe(413)
      await expect(response.json()).resolves.toMatchObject({ code: 'payload_too_large' })
    }
  })
})
