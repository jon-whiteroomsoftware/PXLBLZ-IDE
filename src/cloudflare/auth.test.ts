import {
  appRedirectUrlForRequest,
  buildGoogleAuthorizeUrl,
  buildGitHubAuthorizeUrl,
  clearCookie,
  createSessionCookie,
  createSessionToken,
  fetchGitHubPrimaryEmail,
  parseCookieHeader,
  readSessionToken,
  sessionCookieName,
} from './auth'

describe('Cloudflare GitHub auth helpers', () => {
  it('builds a GitHub authorization URL with state and PKCE challenge', () => {
    const url = buildGitHubAuthorizeUrl({
      clientId: 'client-123',
      redirectUri: 'https://pxlblz.example/api/auth/callback',
      state: 'state-abc',
      codeChallenge: 'challenge-xyz',
    })

    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://pxlblz.example/api/auth/callback')
    expect(url.searchParams.get('state')).toBe('state-abc')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('read:user user:email')
  })

  it('builds a Google authorization URL with OIDC scopes and PKCE challenge', () => {
    const url = buildGoogleAuthorizeUrl({
      clientId: 'google-client-123',
      redirectUri: 'https://pxlblz.example/api/auth/callback',
      state: 'state-abc',
      codeChallenge: 'challenge-xyz',
    })

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('google-client-123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://pxlblz.example/api/auth/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('state')).toBe('state-abc')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('builds an app redirect URL from an override or the request origin', () => {
    const request = new Request('http://localhost:8788/api/auth/callback')

    expect(appRedirectUrlForRequest(request).toString()).toBe('http://localhost:8788/')
    expect(appRedirectUrlForRequest(request, 'http://localhost:5174/PXLBLZ-IDE/').toString()).toBe(
      'http://localhost:5174/PXLBLZ-IDE/',
    )
  })

  it('reads the primary GitHub email when GitHub exposes verified email addresses', async () => {
    const fetcher = async () => Response.json([
      { email: 'secondary@example.test', primary: false, verified: true, visibility: null },
      { email: 'octocat@example.test', primary: true, verified: true, visibility: 'private' },
    ])

    await expect(fetchGitHubPrimaryEmail('token-123', fetcher)).resolves.toEqual({
      email: 'octocat@example.test',
      primary: true,
      verified: true,
      visibility: 'private',
    })
  })

  it('round-trips a signed session token and rejects tampering', async () => {
    const token = await createSessionToken(
      {
        userId: 'github:123',
        primaryProvider: 'github',
        primaryHandle: 'octocat',
        githubUserId: '123',
        githubLogin: 'octocat',
        displayName: 'The Octocat',
        avatarUrl: 'https://example.test/avatar.png',
      },
      'secret',
      1_000,
      60,
    )

    await expect(readSessionToken(token, 'secret', 1_010)).resolves.toEqual({
      userId: 'github:123',
      primaryProvider: 'github',
      primaryHandle: 'octocat',
      githubUserId: '123',
      githubLogin: 'octocat',
      displayName: 'The Octocat',
      avatarUrl: 'https://example.test/avatar.png',
      exp: 1_060,
    })

    const tampered = `${token.slice(0, -1)}x`
    await expect(readSessionToken(tampered, 'secret', 1_010)).resolves.toBeNull()
  })

  it('builds secure session and clearing cookies', async () => {
    const cookie = await createSessionCookie(
      {
        userId: 'github:123',
        primaryProvider: 'github',
        primaryHandle: 'octocat',
        githubUserId: '123',
        githubLogin: 'octocat',
        displayName: null,
        avatarUrl: null,
      },
      'secret',
      { secure: true, now: 1_000 },
    )

    expect(cookie).toContain(`${sessionCookieName}=`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(clearCookie(sessionCookieName)).toBe(`${sessionCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`)
  })

  it('parses cookie headers without decoding unrelated cookie syntax', () => {
    expect(parseCookieHeader('a=1; pxlblz_session=hello%20there; theme=dark')).toEqual({
      a: '1',
      pxlblz_session: 'hello there',
      theme: 'dark',
    })
  })
})
