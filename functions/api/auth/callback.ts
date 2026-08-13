import {
  clearCookie,
  createSessionCookie,
  exchangeGoogleCode,
  exchangeGitHubCode,
  fetchGoogleUser,
  fetchGitHubPrimaryEmail,
  fetchGitHubUser,
  isSecureRequest,
  oauthModeCookieName,
  oauthProviderCookieName,
  oauthStateCookieName,
  oauthVerifierCookieName,
  parseCookieHeader,
  appRedirectUrlForRequest,
  readSessionToken,
  redirectUriForRequest,
  sessionCookieName,
  type OAuthMode,
  type OAuthProvider,
} from '../../../src/cloudflare/auth'
import {
  upsertGitHubUser,
  upsertGoogleUser,
  type D1DatabaseWritableLike,
} from '../../../src/cloudflare/users'

interface PagesFunctionContext {
  request: Request
  env: {
    GITHUB_CLIENT_ID?: string
    GITHUB_CLIENT_SECRET?: string
    GITHUB_OAUTH_REDIRECT_URI?: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    GOOGLE_OAUTH_REDIRECT_URI?: string
    SESSION_SECRET?: string
    APP_REDIRECT_URL?: string
    PXLBLZ_DB?: D1DatabaseWritableLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const requestUrl = new URL(context.request.url)
  const error = requestUrl.searchParams.get('error')
  const code = requestUrl.searchParams.get('code')
  const state = requestUrl.searchParams.get('state')
  const cookies = parseCookieHeader(context.request.headers.get('Cookie'))
  const redirectToApp = appRedirectUrlForRequest(context.request, context.env.APP_REDIRECT_URL)
  const secure = isSecureRequest(context.request)
  const provider = oauthProviderFromCookie(cookies[oauthProviderCookieName])
  const mode = oauthModeFromCookie(cookies[oauthModeCookieName])

  if (error) return redirectWithAuthResult(redirectToApp, 'error', provider)
  if (!context.env.SESSION_SECRET || !providerConfigured(provider, context.env)) {
    return redirectWithAuthResult(redirectToApp, 'not-configured', provider)
  }
  if (!context.env.PXLBLZ_DB) return redirectWithAuthResult(redirectToApp, 'no-database', provider)
  if (!code || !state || state !== cookies[oauthStateCookieName] || !cookies[oauthVerifierCookieName]) {
    return redirectWithAuthResult(redirectToApp, 'invalid-state', provider)
  }

  try {
    const linkSession = mode === 'link'
      ? await readSessionToken(cookies[sessionCookieName], context.env.SESSION_SECRET)
      : null
    if (mode === 'link' && !linkSession) {
      return redirectWithAuthResult(redirectToApp, 'invalid-link', provider)
    }

    const user = provider === 'google'
      ? await resolveGoogleUser(context, code, cookies[oauthVerifierCookieName], linkSession?.userId)
      : await resolveGitHubUser(context, code, cookies[oauthVerifierCookieName], linkSession?.userId)
    const sessionCookie = await createSessionCookie(user, context.env.SESSION_SECRET, { secure })
    redirectToApp.searchParams.set('auth', 'success')
    redirectToApp.searchParams.set('auth_provider', provider)

    return new Response(null, {
      status: 302,
      headers: [
        ['Location', redirectToApp.toString()],
        ['Set-Cookie', sessionCookie],
        ['Set-Cookie', clearCookie(oauthStateCookieName)],
        ['Set-Cookie', clearCookie(oauthVerifierCookieName)],
        ['Set-Cookie', clearCookie(oauthProviderCookieName)],
        ['Set-Cookie', clearCookie(oauthModeCookieName)],
      ],
    })
  } catch {
    return redirectWithAuthResult(redirectToApp, 'error', provider)
  }
}

function redirectWithAuthResult(
  url: URL,
  result: string,
  provider: OAuthProvider,
): Response {
  url.searchParams.set('auth', result)
  url.searchParams.set('auth_provider', provider)
  return new Response(null, {
    status: 302,
    headers: [
      ['Location', url.toString()],
      ['Set-Cookie', clearCookie(oauthStateCookieName)],
      ['Set-Cookie', clearCookie(oauthVerifierCookieName)],
      ['Set-Cookie', clearCookie(oauthProviderCookieName)],
      ['Set-Cookie', clearCookie(oauthModeCookieName)],
    ],
  })
}

async function resolveGitHubUser(
  context: PagesFunctionContext,
  code: string,
  codeVerifier: string,
  linkUserId?: string,
) {
  const accessToken = await exchangeGitHubCode({
    clientId: context.env.GITHUB_CLIENT_ID!,
    clientSecret: context.env.GITHUB_CLIENT_SECRET!,
    code,
    redirectUri: redirectUriForRequest(context.request, context.env.GITHUB_OAUTH_REDIRECT_URI),
    codeVerifier,
  })
  const githubUser = await fetchGitHubUser(accessToken)
  const primaryEmail = await fetchGitHubPrimaryEmail(accessToken)
  const githubUserWithEmail = primaryEmail
    ? { ...githubUser, email: primaryEmail.email, email_verified: primaryEmail.verified }
    : githubUser

  return upsertGitHubUser(
    context.env.PXLBLZ_DB!,
    githubUserWithEmail,
    Math.floor(Date.now() / 1000),
    linkUserId,
  )
}

async function resolveGoogleUser(
  context: PagesFunctionContext,
  code: string,
  codeVerifier: string,
  linkUserId?: string,
) {
  const accessToken = await exchangeGoogleCode({
    clientId: context.env.GOOGLE_CLIENT_ID!,
    clientSecret: context.env.GOOGLE_CLIENT_SECRET!,
    code,
    redirectUri: redirectUriForRequest(context.request, context.env.GOOGLE_OAUTH_REDIRECT_URI),
    codeVerifier,
  })
  const googleUser = await fetchGoogleUser(accessToken)

  return upsertGoogleUser(
    context.env.PXLBLZ_DB!,
    googleUser,
    Math.floor(Date.now() / 1000),
    linkUserId,
  )
}

function oauthProviderFromCookie(value: string | undefined): OAuthProvider {
  return value === 'google' ? 'google' : 'github'
}

function oauthModeFromCookie(value: string | undefined): OAuthMode {
  return value === 'link' ? 'link' : 'sign-in'
}

function providerConfigured(provider: OAuthProvider, env: PagesFunctionContext['env']): boolean {
  if (provider === 'google') return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
}
