import { createSessionToken, sessionCookieName } from '../../src/cloudflare/auth'
import { onRequest as apiMiddleware } from './_middleware'

async function request(path: string, userId?: string): Promise<Request> {
  const headers = new Headers()
  if (userId) {
    const token = await createSessionToken({
      userId,
      primaryProvider: 'github',
      primaryHandle: 'octocat',
      githubUserId: '123',
      githubLogin: 'octocat',
      displayName: 'The Octocat',
      avatarUrl: null,
    }, 'secret')
    headers.set('cookie', `${sessionCookieName}=${encodeURIComponent(token)}`)
  }
  return new Request(`https://pxlblz.example${path}`, { headers })
}

function betaDb(entryUserId: string | null) {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return this
        },
        async first<T>() {
          if (sql.includes('app_metadata')) return { value: 'd1' } as T
          if (sql.includes('COUNT(*)')) return { count: 1 } as T
          return entryUserId ? {
            email: 'owner@example.test',
            label: 'Owner',
            enabled: 1,
            user_id: entryUserId,
          } as T : null
        },
        async all<T>() {
          return { results: [] as T[] }
        },
        async run() {
          return { success: true }
        },
      }
    },
  }
}

describe('beta access API middleware', () => {
  it('rejects a valid session immediately when its beta entry is inactive', async () => {
    let continued = false
    const response = await apiMiddleware({
      request: await request('/api/me', 'github:123'),
      env: { SESSION_SECRET: 'secret', PXLBLZ_DB: betaDb(null) },
      async next() {
        continued = true
        return new Response('ok')
      },
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(continued).toBe(false)
  })

  it('continues for a valid session with active beta access', async () => {
    const response = await apiMiddleware({
      request: await request('/api/me', 'github:123'),
      env: { SESSION_SECRET: 'secret', PXLBLZ_DB: betaDb('github:123') },
      async next() { return new Response('ok') },
    })

    expect(response.status).toBe(200)
  })

  it('leaves public OAuth routes and unauthenticated endpoint behavior alone', async () => {
    for (const path of ['/api/auth/callback', '/api/patterns']) {
      const response = await apiMiddleware({
        request: await request(path),
        env: { SESSION_SECRET: 'secret', PXLBLZ_DB: betaDb(null) },
        async next() { return new Response('existing behavior', { status: 418 }) },
      })
      expect(response.status, path).toBe(418)
    }
  })
})
