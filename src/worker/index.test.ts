import { describe, expect, it } from 'vitest'
import { PersonalStorageGuardError } from '../cloudflare/resourceProtection'
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

  it('maps personal-storage guard errors like the Pages middleware and rethrows the rest', async () => {
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
})

describe('api route table', () => {
  it('registers exactly the routes the Pages functions directory serves today', () => {
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
