import { createSessionToken, sessionCookieName } from '../../src/cloudflare/auth'
import { onRequest as apiMiddleware } from './_middleware'

describe('API middleware', () => {
  it('continues authenticated requests without consulting retired beta access state', async () => {
    const token = await createSessionToken({
      userId: 'github:123',
      primaryProvider: 'github',
      primaryHandle: 'octocat',
      githubUserId: '123',
      githubLogin: 'octocat',
      displayName: 'The Octocat',
      avatarUrl: null,
    }, 'secret')
    const request = new Request('https://pxlblz.example/api/me', {
      headers: { Cookie: `${sessionCookieName}=${encodeURIComponent(token)}` },
    })
    const database = {
      prepare(): never {
        throw new Error('API middleware queried retired beta access state')
      },
    }

    const response = await apiMiddleware({
      request,
      env: { SESSION_SECRET: 'secret', PXLBLZ_DB: database },
      async next() {
        return Response.json({ authenticated: true })
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ authenticated: true })
  })
})
