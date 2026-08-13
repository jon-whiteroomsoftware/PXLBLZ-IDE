export const oauthStateCookieName = 'pxlblz_oauth_state'
export const oauthVerifierCookieName = 'pxlblz_oauth_verifier'
export const oauthProviderCookieName = 'pxlblz_oauth_provider'
export const oauthModeCookieName = 'pxlblz_oauth_mode'
export const sessionCookieName = 'pxlblz_session'

const encoder = new TextEncoder()
const sessionTtlSeconds = 60 * 60 * 24 * 30
export type OAuthProvider = 'github' | 'google'
export type OAuthMode = 'sign-in' | 'link'

export interface GitHubUser {
  id: number
  login: string
  name?: string | null
  email?: string | null
  email_verified?: boolean | null
  avatar_url?: string | null
}

export interface GitHubEmail {
  email: string
  primary: boolean
  verified: boolean
  visibility?: string | null
}

export interface GoogleUser {
  sub: string
  email?: string | null
  email_verified?: boolean
  name?: string | null
  picture?: string | null
}

export interface SessionUser {
  userId: string
  primaryProvider: OAuthProvider
  primaryHandle: string | null
  displayName: string | null
  avatarUrl: string | null
  githubUserId?: string | null
  githubLogin?: string | null
}

export interface SessionPayload extends SessionUser {
  exp: number
}

export function buildGitHubAuthorizeUrl(input: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}): URL {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('scope', 'read:user user:email')
  return url
}

export function buildGoogleAuthorizeUrl(input: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}): URL {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url
}

export function redirectUriForRequest(request: Request, override?: string): string {
  if (override) return override
  const url = new URL(request.url)
  return `${url.origin}/api/auth/callback`
}

export function appRedirectUrlForRequest(request: Request, override?: string): URL {
  if (override) return new URL(override)
  const url = new URL(request.url)
  return new URL('/', url.origin)
}

export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return base64UrlEncode(buffer)
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier))
  return base64UrlEncode(new Uint8Array(digest))
}

export async function exchangeGitHubCode(input: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
  codeVerifier: string
  fetcher?: typeof fetch
}): Promise<string> {
  const fetcher = input.fetcher ?? fetch
  const response = await fetcher('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
  })
  const body = await response.json() as { access_token?: string; error?: string }
  if (!response.ok || !body.access_token) {
    throw new Error(body.error ?? 'GitHub OAuth token exchange failed')
  }
  return body.access_token
}

export async function exchangeGoogleCode(input: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
  codeVerifier: string
  fetcher?: typeof fetch
}): Promise<string> {
  const fetcher = input.fetcher ?? fetch
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    grant_type: 'authorization_code',
  })
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const json = await response.json() as { access_token?: string; error?: string }
  if (!response.ok || !json.access_token) {
    throw new Error(json.error ?? 'Google OAuth token exchange failed')
  }
  return json.access_token
}

export async function fetchGitHubUser(accessToken: string, fetcher: typeof fetch = fetch): Promise<GitHubUser> {
  const response = await fetcher('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'PXLBLZ-IDE',
    },
  })
  if (!response.ok) throw new Error('GitHub user lookup failed')
  return await response.json() as GitHubUser
}

export async function fetchGitHubPrimaryEmail(accessToken: string, fetcher: typeof fetch = fetch): Promise<GitHubEmail | null> {
  const response = await fetcher('https://api.github.com/user/emails', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'PXLBLZ-IDE',
    },
  })
  if (!response.ok) return null
  const emails = await response.json() as GitHubEmail[]
  return emails.find((email) => email.primary) ?? null
}

export async function fetchGoogleUser(accessToken: string, fetcher: typeof fetch = fetch): Promise<GoogleUser> {
  const response = await fetcher('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!response.ok) throw new Error('Google user lookup failed')
  return await response.json() as GoogleUser
}

export async function createSessionCookie(
  user: SessionUser,
  secret: string,
  options: { secure: boolean; now?: number },
): Promise<string> {
  const token = await createSessionToken(user, secret, options.now ?? nowSeconds(), sessionTtlSeconds)
  return [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${sessionTtlSeconds}`,
    'HttpOnly',
    options.secure ? 'Secure' : '',
    'SameSite=Lax',
  ].filter(Boolean).join('; ')
}

export async function createSessionToken(
  user: SessionUser,
  secret: string,
  now: number = nowSeconds(),
  ttlSeconds: number = sessionTtlSeconds,
): Promise<string> {
  const payload: SessionPayload = { ...user, exp: now + ttlSeconds }
  const payloadText = JSON.stringify(payload)
  const encodedPayload = base64UrlEncode(encoder.encode(payloadText))
  const signature = await sign(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

export async function readSessionToken(
  token: string | undefined,
  secret: string | undefined,
  now: number = nowSeconds(),
): Promise<SessionPayload | null> {
  if (!token || !secret) return null
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null
  const expected = await sign(encodedPayload, secret)
  if (!timingSafeEqual(signature, expected)) return null

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload
    if (payload.exp <= now) return null
    return payload
  } catch {
    return null
  }
}

export async function readSessionFromRequest(
  request: Request,
  secret: string | undefined,
): Promise<SessionPayload | null> {
  const cookies = parseCookieHeader(request.headers.get('Cookie'))
  return readSessionToken(cookies[sessionCookieName], secret)
}

export function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {}
  const cookies: Record<string, string> = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!name) continue
    cookies[name] = decodeURIComponent(value)
  }
  return cookies
}

export function setCookie(name: string, value: string, options: { maxAge: number; secure: boolean }): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${options.maxAge}`,
    'HttpOnly',
    options.secure ? 'Secure' : '',
    'SameSite=Lax',
  ].filter(Boolean).join('; ')
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
}

export function sessionUserFromGitHub(user: GitHubUser): SessionUser {
  return {
    userId: `github:${user.id}`,
    primaryProvider: 'github',
    primaryHandle: user.login,
    displayName: user.name ?? null,
    avatarUrl: user.avatar_url ?? null,
    githubUserId: String(user.id),
    githubLogin: user.login,
  }
}

export function sessionUserFromGoogle(user: GoogleUser): SessionUser {
  return {
    userId: `google:${user.sub}`,
    primaryProvider: 'google',
    primaryHandle: user.email ?? null,
    displayName: user.name ?? null,
    avatarUrl: user.picture ?? null,
  }
}

export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === 'https:'
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return base64UrlEncode(new Uint8Array(signature))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
