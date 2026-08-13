import { afterEach, vi } from 'vitest'
import {
  createSessionToken,
  oauthModeCookieName,
  oauthProviderCookieName,
  oauthStateCookieName,
  oauthVerifierCookieName,
  readSessionToken,
  sessionCookieName,
} from '../../../src/cloudflare/auth'
import type {
  D1DatabaseWritableLike,
  D1WritableStatementLike,
} from '../../../src/cloudflare/users'
import { onRequestGet } from './callback'

interface StoredIdentity {
  provider: 'github' | 'google'
  providerUserId: string
  userId: string
  handle: string | null
  email: string | null
  emailVerified: boolean | null
}

class MemoryAuthDatabase implements D1DatabaseWritableLike {
  readonly users = new Set<string>()
  readonly identities: StoredIdentity[] = []

  seedIdentity(identity: StoredIdentity): void {
    this.users.add(identity.userId)
    this.identities.push(identity)
  }

  prepare(sql: string): D1WritableStatementLike {
    let values: unknown[] = []
    const database = this
    return {
      bind(...nextValues) {
        values = nextValues
        return this
      },
      async first<T>() {
        if (sql.includes("key = 'beta_access_mode'")) return { value: 'd1' } as T
        if (sql.includes('FROM beta_access')) return null
        if (sql.includes('WHERE provider = ? AND provider_user_id = ?')) {
          const identity = database.identities.find((candidate) => (
            candidate.provider === values[0] && candidate.providerUserId === values[1]
          ))
          return (identity ? { user_id: identity.userId } : null) as T | null
        }
        if (sql.includes('WHERE lower(email) = lower(?)')) {
          const email = String(values[0]).toLowerCase()
          const identity = database.identities.find((candidate) => (
            candidate.emailVerified === true && candidate.email?.toLowerCase() === email
          ))
          return (identity ? { user_id: identity.userId } : null) as T | null
        }
        return null
      },
      async all<T>() {
        return { results: [] as T[] }
      },
      async run() {
        if (sql.includes('INSERT INTO users')) database.users.add(String(values[0]))
        if (sql.includes('INSERT INTO identities')) {
          const [provider, providerUserId, userId, handle, email, emailVerified] = values
          const next: StoredIdentity = {
            provider: provider as StoredIdentity['provider'],
            providerUserId: String(providerUserId),
            userId: String(userId),
            handle: handle == null ? null : String(handle),
            email: email == null ? null : String(email),
            emailVerified: emailVerified == null ? null : emailVerified === 1,
          }
          const index = database.identities.findIndex((candidate) => (
            candidate.provider === next.provider && candidate.providerUserId === next.providerUserId
          ))
          if (index === -1) database.identities.push(next)
          else database.identities[index] = next
        }
        return { success: true }
      },
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OAuth callback', () => {
  it('opens a durable session for a first-time GitHub identity without beta access', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === 'https://github.com/login/oauth/access_token') {
        return Response.json({ access_token: 'github-token' })
      }
      if (url === 'https://api.github.com/user') {
        return Response.json({
          id: 123,
          login: 'octocat',
          name: 'The Octocat',
          avatar_url: 'https://example.test/octocat.png',
        })
      }
      if (url === 'https://api.github.com/user/emails') return Response.json([])
      return new Response('Unexpected provider request', { status: 500 })
    }))
    const database = new MemoryAuthDatabase()
    const environment = {
      ...githubEnvironment(database),
      GITHUB_ALLOWED_LOGINS: 'someone-else',
      GITHUB_ALLOWED_IDS: '999',
    }

    const response = await onRequestGet({
      request: callbackRequest('github'),
      env: environment,
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(
      'https://app.example/PXLBLZ-IDE/?auth=success&auth_provider=github',
    )
    const session = await responseSession(response)
    expect(session).toMatchObject({
      userId: 'github:123',
      primaryProvider: 'github',
      githubUserId: '123',
      githubLogin: 'octocat',
    })
    expect(database.users).toEqual(new Set(['github:123']))
    expect(database.identities).toContainEqual(expect.objectContaining({
      provider: 'github',
      providerUserId: '123',
      userId: 'github:123',
    }))
    expect(response.headers.get('Set-Cookie')).toContain(`${oauthStateCookieName}=;`)
    expect(response.headers.get('Set-Cookie')).toContain(`${oauthVerifierCookieName}=;`)
  })

  it('opens a durable session for a first-time Google identity without beta access', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'google-token' })
      }
      if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
        return Response.json({
          sub: 'google-123',
          email: 'octocat@example.test',
          email_verified: true,
          name: 'Octo Cat',
          picture: 'https://example.test/google.png',
        })
      }
      return new Response('Unexpected provider request', { status: 500 })
    }))
    const database = new MemoryAuthDatabase()
    const environment = {
      ...googleEnvironment(database),
      GOOGLE_ALLOWED_EMAILS: 'someone-else@example.test',
      GOOGLE_ALLOWED_IDS: 'google-999',
    }

    const response = await onRequestGet({
      request: callbackRequest('google'),
      env: environment,
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(
      'https://app.example/PXLBLZ-IDE/?auth=success&auth_provider=google',
    )
    const session = await responseSession(response)
    expect(session).toMatchObject({
      userId: 'google:google-123',
      primaryProvider: 'google',
      primaryHandle: 'octocat@example.test',
    })
    expect(database.users).toEqual(new Set(['google:google-123']))
    expect(database.identities).toContainEqual(expect.objectContaining({
      provider: 'google',
      providerUserId: 'google-123',
      userId: 'google:google-123',
      email: 'octocat@example.test',
      emailVerified: true,
    }))
  })

  it('reports a provider failure without creating a session or partial identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { error: 'provider_unavailable' },
      { status: 503 },
    )))
    const database = new MemoryAuthDatabase()

    const response = await onRequestGet({
      request: callbackRequest('google'),
      env: {
        GOOGLE_CLIENT_ID: 'google-client',
        GOOGLE_CLIENT_SECRET: 'google-secret',
        SESSION_SECRET: 'session-secret',
        APP_REDIRECT_URL: 'https://app.example/PXLBLZ-IDE/',
        PXLBLZ_DB: database,
      },
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(
      'https://app.example/PXLBLZ-IDE/?auth=error&auth_provider=google',
    )
    expect(response.headers.get('Set-Cookie')).not.toContain('pxlblz_session=')
    expect(response.headers.get('Set-Cookie')).toContain(`${oauthStateCookieName}=;`)
    expect(response.headers.get('Set-Cookie')).toContain(`${oauthVerifierCookieName}=;`)
    expect(database.users).toEqual(new Set())
    expect(database.identities).toEqual([])
  })

  it('returns an existing GitHub identity to its stable user', async () => {
    stubGitHubProvider({
      id: 123,
      login: 'octocat',
      name: 'Updated Octocat',
      avatar_url: 'https://example.test/new-octocat.png',
    }, [{
      email: 'octocat@example.test',
      primary: true,
      verified: true,
      visibility: null,
    }])
    const database = new MemoryAuthDatabase()
    database.seedIdentity({
      provider: 'github',
      providerUserId: '123',
      userId: 'user-existing',
      handle: 'octocat',
      email: 'octocat@example.test',
      emailVerified: true,
    })

    const response = await onRequestGet({
      request: callbackRequest('github'),
      env: githubEnvironment(database),
    })

    expect(response.headers.get('Location')).toBe(
      'https://app.example/PXLBLZ-IDE/?auth=success&auth_provider=github',
    )
    await expect(responseSession(response)).resolves.toMatchObject({
      userId: 'user-existing',
      primaryProvider: 'github',
    })
    expect(database.identities).toHaveLength(1)
    expect(database.identities[0]).toMatchObject({ userId: 'user-existing' })
  })

  it('returns an existing Google identity to its stable user', async () => {
    stubGoogleProvider({
      sub: 'google-existing',
      email: 'returning@example.test',
      email_verified: true,
      name: 'Returning Person',
    })
    const database = new MemoryAuthDatabase()
    database.seedIdentity({
      provider: 'google',
      providerUserId: 'google-existing',
      userId: 'user-existing',
      handle: 'returning@example.test',
      email: 'returning@example.test',
      emailVerified: true,
    })

    const response = await onRequestGet({
      request: callbackRequest('google'),
      env: googleEnvironment(database),
    })

    expect(response.headers.get('Location')).toBe(
      'https://app.example/PXLBLZ-IDE/?auth=success&auth_provider=google',
    )
    await expect(responseSession(response)).resolves.toMatchObject({
      userId: 'user-existing',
      primaryProvider: 'google',
    })
    expect(database.identities).toHaveLength(1)
    expect(database.identities[0]).toMatchObject({ userId: 'user-existing' })
  })

  it('links a verified Google identity to the existing user with the same verified email', async () => {
    stubGoogleProvider({
      sub: 'google-123',
      email: 'shared@example.test',
      email_verified: true,
      name: 'Shared Person',
    })
    const database = new MemoryAuthDatabase()
    database.seedIdentity({
      provider: 'github',
      providerUserId: '123',
      userId: 'github:123',
      handle: 'shared-person',
      email: 'shared@example.test',
      emailVerified: true,
    })

    const response = await onRequestGet({
      request: callbackRequest('google'),
      env: googleEnvironment(database),
    })

    await expect(responseSession(response)).resolves.toMatchObject({
      userId: 'github:123',
      primaryProvider: 'google',
    })
    expect(database.identities).toContainEqual(expect.objectContaining({
      provider: 'google',
      providerUserId: 'google-123',
      userId: 'github:123',
    }))
  })

  it('links a new Google identity to the signed-in user in explicit link mode', async () => {
    stubGoogleProvider({
      sub: 'google-link',
      email: 'link@example.test',
      email_verified: true,
      name: 'Linked Person',
    })
    const database = new MemoryAuthDatabase()
    const existingSession = await createSessionToken({
      userId: 'github:owner',
      primaryProvider: 'github',
      primaryHandle: 'owner',
      githubUserId: 'owner',
      githubLogin: 'owner',
      displayName: 'Owner',
      avatarUrl: null,
    }, 'session-secret')

    const response = await onRequestGet({
      request: callbackRequest('google', { mode: 'link', sessionToken: existingSession }),
      env: googleEnvironment(database),
    })

    await expect(responseSession(response)).resolves.toMatchObject({
      userId: 'github:owner',
      primaryProvider: 'google',
    })
    expect(database.identities).toContainEqual(expect.objectContaining({
      provider: 'google',
      providerUserId: 'google-link',
      userId: 'github:owner',
    }))
  })

  it('preserves ownership when explicit link mode receives an identity owned by another user', async () => {
    stubGoogleProvider({
      sub: 'google-owned',
      email: 'owned@example.test',
      email_verified: true,
      name: 'Owned Identity',
    })
    const database = new MemoryAuthDatabase()
    database.seedIdentity({
      provider: 'google',
      providerUserId: 'google-owned',
      userId: 'github:other-owner',
      handle: 'owned@example.test',
      email: 'owned@example.test',
      emailVerified: true,
    })
    const existingSession = await createSessionToken({
      userId: 'github:current-owner',
      primaryProvider: 'github',
      primaryHandle: 'current-owner',
      githubUserId: 'current-owner',
      githubLogin: 'current-owner',
      displayName: 'Current Owner',
      avatarUrl: null,
    }, 'session-secret')

    const response = await onRequestGet({
      request: callbackRequest('google', { mode: 'link', sessionToken: existingSession }),
      env: googleEnvironment(database),
    })

    expect(response.headers.get('Location')).toBe(
      'https://app.example/PXLBLZ-IDE/?auth=error&auth_provider=google',
    )
    expect(response.headers.get('Set-Cookie')).not.toContain('pxlblz_session=')
    expect(database.users).toEqual(new Set(['github:other-owner']))
    expect(database.identities).toEqual([expect.objectContaining({
      providerUserId: 'google-owned',
      userId: 'github:other-owner',
    })])
  })

  it('rejects an invalid link session before calling the provider or changing ownership', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const database = new MemoryAuthDatabase()

    const response = await onRequestGet({
      request: callbackRequest('google', { mode: 'link', sessionToken: 'invalid-session' }),
      env: googleEnvironment(database),
    })

    expect(response.headers.get('Location')).toBe(
      'https://app.example/PXLBLZ-IDE/?auth=invalid-link&auth_provider=google',
    )
    expect(response.headers.get('Set-Cookie')).not.toContain('pxlblz_session=')
    expect(response.headers.get('Set-Cookie')).toContain(`${oauthStateCookieName}=;`)
    expect(response.headers.get('Set-Cookie')).toContain(`${oauthVerifierCookieName}=;`)
    expect(fetcher).not.toHaveBeenCalled()
    expect(database.users).toEqual(new Set())
    expect(database.identities).toEqual([])
  })

  it.each([
    {
      name: 'missing provider configuration',
      request: () => callbackRequest('github'),
      environment: () => ({
        SESSION_SECRET: 'session-secret',
        APP_REDIRECT_URL: 'https://app.example/PXLBLZ-IDE/',
        PXLBLZ_DB: new MemoryAuthDatabase(),
      }),
      code: 'not-configured',
    },
    {
      name: 'missing database',
      request: () => callbackRequest('github'),
      environment: () => ({
        GITHUB_CLIENT_ID: 'github-client',
        GITHUB_CLIENT_SECRET: 'github-secret',
        SESSION_SECRET: 'session-secret',
        APP_REDIRECT_URL: 'https://app.example/PXLBLZ-IDE/',
      }),
      code: 'no-database',
    },
    {
      name: 'invalid OAuth state',
      request: () => callbackRequest('github', { returnedState: 'wrong-state' }),
      environment: () => githubEnvironment(new MemoryAuthDatabase()),
      code: 'invalid-state',
    },
  ])('reports $name without calling the provider', async ({ request, environment, code }) => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    const response = await onRequestGet({ request: request(), env: environment() })

    expect(response.headers.get('Location')).toBe(
      `https://app.example/PXLBLZ-IDE/?auth=${code}&auth_provider=github`,
    )
    expect(response.headers.get('Set-Cookie')).not.toContain('pxlblz_session=')
    expect(response.headers.get('Set-Cookie')).toContain(`${oauthStateCookieName}=;`)
    expect(fetcher).not.toHaveBeenCalled()
  })
})

function callbackRequest(
  provider: 'github' | 'google',
  options: {
    mode?: 'link'
    sessionToken?: string
    returnedState?: string
  } = {},
): Request {
  const cookies = [
    `${oauthStateCookieName}=expected-state`,
    `${oauthVerifierCookieName}=code-verifier`,
    `${oauthProviderCookieName}=${provider}`,
    options.mode ? `${oauthModeCookieName}=${options.mode}` : '',
    options.sessionToken ? `${sessionCookieName}=${encodeURIComponent(options.sessionToken)}` : '',
  ].filter(Boolean).join('; ')
  return new Request(
    `https://pxlblz.example/api/auth/callback?code=provider-code&state=${options.returnedState ?? 'expected-state'}`,
    { headers: { Cookie: cookies } },
  )
}

function githubEnvironment(database: MemoryAuthDatabase) {
  return {
    GITHUB_CLIENT_ID: 'github-client',
    GITHUB_CLIENT_SECRET: 'github-secret',
    SESSION_SECRET: 'session-secret',
    APP_REDIRECT_URL: 'https://app.example/PXLBLZ-IDE/',
    PXLBLZ_DB: database,
  }
}

function googleEnvironment(database: MemoryAuthDatabase) {
  return {
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    SESSION_SECRET: 'session-secret',
    APP_REDIRECT_URL: 'https://app.example/PXLBLZ-IDE/',
    PXLBLZ_DB: database,
  }
}

function stubGitHubProvider(
  user: Record<string, unknown>,
  emails: Array<Record<string, unknown>>,
): void {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url === 'https://github.com/login/oauth/access_token') {
      return Response.json({ access_token: 'github-token' })
    }
    if (url === 'https://api.github.com/user') return Response.json(user)
    if (url === 'https://api.github.com/user/emails') return Response.json(emails)
    return new Response('Unexpected provider request', { status: 500 })
  }))
}

function stubGoogleProvider(user: Record<string, unknown>): void {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'google-token' })
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return Response.json(user)
    return new Response('Unexpected provider request', { status: 500 })
  }))
}

async function responseSession(response: Response) {
  const setCookie = response.headers.get('Set-Cookie') ?? ''
  const token = /pxlblz_session=([^;,]+)/.exec(setCookie)?.[1]
  expect(token).toBeDefined()
  return readSessionToken(token ? decodeURIComponent(token) : undefined, 'session-secret')
}
