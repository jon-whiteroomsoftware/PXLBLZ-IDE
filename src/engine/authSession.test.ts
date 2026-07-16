import { afterEach, vi } from 'vitest'
import { getAuthSession } from './authSession'

afterEach(() => {
  vi.useRealTimers()
})

describe('auth session probe', () => {
  it('returns authenticated false for an unsigned request', async () => {
    const session = await getAuthSession(async () => Response.json({ authenticated: false }))

    expect(session).toEqual({ authenticated: false })
  })

  it('treats the older 401 unsigned response as authenticated false', async () => {
    const session = await getAuthSession(async () => Response.json({ error: 'Unauthorized' }, { status: 401 }))

    expect(session).toEqual({ authenticated: false })
  })

  it('returns the signed-in user from /api/me', async () => {
    const session = await getAuthSession(async () =>
      Response.json({
        authenticated: true,
        user: {
          id: 'github:123',
          primaryProvider: 'github',
          primaryHandle: 'octocat',
          githubUserId: '123',
          githubLogin: 'octocat',
          displayName: 'Octo Cat',
          avatarUrl: 'https://example.test/avatar.png',
          identities: [
            {
              provider: 'github',
              providerUserId: '123',
              handle: 'octocat',
              email: null,
              emailVerified: null,
            },
          ],
        },
      }),
    )

    expect(session).toEqual({
      authenticated: true,
      user: {
        id: 'github:123',
        primaryProvider: 'github',
        primaryHandle: 'octocat',
        githubUserId: '123',
        githubLogin: 'octocat',
        displayName: 'Octo Cat',
        avatarUrl: 'https://example.test/avatar.png',
        identities: [
          {
            provider: 'github',
            providerUserId: '123',
            handle: 'octocat',
            email: null,
            emailVerified: null,
          },
        ],
      },
    })
  })

  it('rejects a session request that never settles', async () => {
    vi.useFakeTimers()
    const request = getAuthSession(() => new Promise<Response>(() => {}), 1_000)
    const rejection = expect(request).rejects.toThrow('Auth session request timed out')

    await vi.advanceTimersByTimeAsync(1_000)

    await rejection
  })
})
