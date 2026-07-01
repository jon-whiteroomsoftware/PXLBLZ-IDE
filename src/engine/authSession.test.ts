import { getAuthSession } from './authSession'

describe('auth session probe', () => {
  it('returns authenticated false for an unsigned request', async () => {
    const session = await getAuthSession(async () => Response.json({ error: 'Unauthorized' }, { status: 401 }))

    expect(session).toEqual({ authenticated: false })
  })

  it('returns the signed-in user from /api/me', async () => {
    const session = await getAuthSession(async () =>
      Response.json({
        authenticated: true,
        user: {
          id: 'github:123',
          githubUserId: '123',
          githubLogin: 'octocat',
          displayName: 'Octo Cat',
          avatarUrl: 'https://example.test/avatar.png',
        },
      }),
    )

    expect(session).toEqual({
      authenticated: true,
      user: {
        id: 'github:123',
        githubUserId: '123',
        githubLogin: 'octocat',
        displayName: 'Octo Cat',
        avatarUrl: 'https://example.test/avatar.png',
      },
    })
  })
})
