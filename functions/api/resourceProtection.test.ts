import { createSessionToken, sessionCookieName } from '../../src/cloudflare/auth'
import {
  MAX_PERSONAL_ENTITY_ROWS,
  MAX_WRITE_REQUEST_BYTES,
} from '../../src/cloudflare/resourceProtection'
import { onRequest as apiMiddleware } from './_middleware'
import { onRequestPut as putControllerMetadata } from './controller-metadata/[key]'
import { onRequestPatch as updateController } from './controllers/[id]'
import { onRequestPost as createController } from './controllers/index'
import { onRequestPatch as updateLibrary } from './libraries/[id]'
import { onRequestPost as createLibrary } from './libraries/index'
import { onRequestPatch as updateMap } from './maps/[id]'
import { onRequestPost as createMap } from './maps/index'
import { onRequestPatch as updateMixin } from './mixins/[id]'
import { onRequestPost as createMixin } from './mixins/index'
import { onRequestPatch as updatePattern } from './patterns/[id]'
import { onRequestPost as createPattern } from './patterns/index'
import { onRequestGet as getSetting, onRequestPut as putSetting } from './settings/[key]'
import { onRequestPatch as updateShow } from './shows/[id]'
import { onRequestPost as createShow } from './shows/index'

async function authenticatedRequest(body: unknown): Promise<Request> {
  const token = await createSessionToken(
    {
      userId: 'github:123',
      primaryProvider: 'github',
      primaryHandle: 'octocat',
      githubUserId: '123',
      githubLogin: 'octocat',
      displayName: 'The Octocat',
      avatarUrl: null,
    },
    'secret',
  )

  return new Request('https://pxlblz.example/api/patterns', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${sessionCookieName}=${encodeURIComponent(token)}`,
    },
    body: JSON.stringify(body),
  })
}

describe('personal-storage API protection (#407)', () => {
  it('blocks Pattern creation at the million-row tripwire before inserting', async () => {
    let inserted = false
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return this
          },
          async first() {
            expect(sql).toContain('personal_patterns')
            return { entity_count: MAX_PERSONAL_ENTITY_ROWS, content_bytes: 0 }
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
    const request = await authenticatedRequest({
      id: 'pattern-1',
      name: 'Pattern 1',
      src: 'export function render() {}',
      controls: [],
    })

    const response = await apiMiddleware({
      request,
      env: { SESSION_SECRET: 'secret', PXLBLZ_DB: db },
      next: () => createPattern({
        request,
        env: { SESSION_SECRET: 'secret', PXLBLZ_DB: db },
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'entity_limit_reached',
    })
    expect(inserted).toBe(false)
  })

  it('rejects arbitrary settings keys before querying D1', async () => {
    const original = await authenticatedRequest({})
    const request = new Request('https://pxlblz.example/api/settings/attacker-row', {
      headers: { cookie: original.headers.get('cookie')! },
    })
    const db = {
      prepare() {
        throw new Error('D1 should not be queried for an unknown key')
      },
    }

    const response = await apiMiddleware({
      request,
      env: { SESSION_SECRET: 'secret', PXLBLZ_DB: db },
      next: () => getSetting({
        request,
        params: { key: 'attacker-row' },
        env: { SESSION_SECRET: 'secret', PXLBLZ_DB: db },
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'unknown_storage_key' })
  })

  it('applies the write-body guard to every durable mutation route', async () => {
    const original = await authenticatedRequest({})
    const cookie = original.headers.get('cookie')!
    const routes = [
      ['POST', '/api/patterns', createPattern, {}],
      ['PATCH', '/api/patterns/p1', updatePattern, { id: 'p1' }],
      ['POST', '/api/maps', createMap, {}],
      ['PATCH', '/api/maps/m1', updateMap, { id: 'm1' }],
      ['POST', '/api/mixins', createMixin, {}],
      ['PATCH', '/api/mixins/x1', updateMixin, { id: 'x1' }],
      ['POST', '/api/libraries', createLibrary, {}],
      ['PATCH', '/api/libraries/l1', updateLibrary, { id: 'l1' }],
      ['POST', '/api/shows', createShow, {}],
      ['PATCH', '/api/shows/s1', updateShow, { id: 's1' }],
      ['POST', '/api/controllers', createController, {}],
      ['PATCH', '/api/controllers/c1', updateController, { id: 'c1' }],
      ['PUT', '/api/settings/lastActive', putSetting, { key: 'lastActive' }],
      ['PUT', '/api/controller-metadata/controller-bindings', putControllerMetadata, { key: 'controller-bindings' }],
    ] as const
    const db = {
      prepare() {
        throw new Error('Oversized writes must be rejected before querying D1')
      },
    }

    for (const [method, path, handler, params] of routes) {
      const request = new Request(`https://pxlblz.example${path}`, {
        method,
        headers: {
          cookie,
          'content-length': String(MAX_WRITE_REQUEST_BYTES + 1),
          'content-type': 'application/json',
        },
        body: '{}',
      })
      const env = { SESSION_SECRET: 'secret', PXLBLZ_DB: db }
      const response = await apiMiddleware({
        request,
        env,
        next: () => handler({ request, params, env } as never),
      })

      expect(response.status, `${method} ${path}`).toBe(413)
      await expect(response.json()).resolves.toMatchObject({ code: 'payload_too_large' })
    }
  })
})
