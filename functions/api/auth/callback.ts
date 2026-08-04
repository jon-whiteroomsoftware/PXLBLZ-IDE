import {
  clearCookie,
  createSessionCookie,
  exchangeGoogleCode,
  exchangeGitHubCode,
  fetchGoogleUser,
  fetchGitHubPrimaryEmail,
  fetchGitHubUser,
  isGoogleUserAllowed,
  isGitHubUserAllowed,
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
  claimMatchingBetaAccess,
  resolveBetaOAuthAdmission,
} from '../../../src/cloudflare/betaAccess'
import {
  createD1BetaAccessStore,
} from '../../../src/cloudflare/d1BetaAccess'
import {
  findOAuthIdentityUserId,
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
    GITHUB_ALLOWED_LOGINS?: string
    GITHUB_ALLOWED_IDS?: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    GOOGLE_OAUTH_REDIRECT_URI?: string
    GOOGLE_ALLOWED_EMAILS?: string
    GOOGLE_ALLOWED_IDS?: string
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

  if (error) return redirectWithAuthResult(redirectToApp, 'error', secure)
  if (!context.env.SESSION_SECRET || !providerConfigured(provider, context.env)) {
    return redirectWithAuthResult(redirectToApp, 'not-configured', secure)
  }
  if (!context.env.PXLBLZ_DB) return redirectWithAuthResult(redirectToApp, 'no-database', secure)
  if (!code || !state || state !== cookies[oauthStateCookieName] || !cookies[oauthVerifierCookieName]) {
    return redirectWithAuthResult(redirectToApp, 'invalid-state', secure)
  }

  try {
    const linkSession = mode === 'link'
      ? await readSessionToken(cookies[sessionCookieName], context.env.SESSION_SECRET)
      : null
    if (mode === 'link' && !linkSession) return redirectWithAuthResult(redirectToApp, 'invalid-link', secure)

    const user = provider === 'google'
      ? await resolveGoogleUser(context, code, cookies[oauthVerifierCookieName], linkSession?.userId)
      : await resolveGitHubUser(context, code, cookies[oauthVerifierCookieName], linkSession?.userId)
    const sessionCookie = await createSessionCookie(user, context.env.SESSION_SECRET, { secure })

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
  } catch (caught) {
    return redirectWithAuthResult(redirectToApp, caught instanceof AuthCallbackError ? caught.result : 'error', secure)
  }
}

function redirectWithAuthResult(url: URL, result: string, _secure: boolean): Response {
  url.searchParams.set('auth', result)
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

  const store = createD1BetaAccessStore(context.env.PXLBLZ_DB!)
  const existingUserId = linkUserId ?? await findOAuthIdentityUserId(
    context.env.PXLBLZ_DB!,
    'github',
    String(githubUser.id),
  )
  const admission = await resolveBetaOAuthAdmission(store, {
    verifiedEmail: primaryEmail?.verified ? primaryEmail.email : null,
    existingUserId,
  })
  const legacyAllowed = isGitHubUserAllowed(githubUserWithEmail, {
    logins: context.env.GITHUB_ALLOWED_LOGINS,
    ids: context.env.GITHUB_ALLOWED_IDS,
  })
  if (admission.decision === 'denied' || (admission.decision === 'legacy' && !legacyAllowed)) {
    throw new AuthCallbackError('not-allowed')
  }

  const user = await upsertGitHubUser(
    context.env.PXLBLZ_DB!,
    githubUserWithEmail,
    Math.floor(Date.now() / 1000),
    admission.userId ?? undefined,
  )
  await claimMatchingBetaAccess(store, primaryEmail?.verified ? primaryEmail.email : null, user.userId)
  return user
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

  const store = createD1BetaAccessStore(context.env.PXLBLZ_DB!)
  const existingUserId = linkUserId ?? await findOAuthIdentityUserId(
    context.env.PXLBLZ_DB!,
    'google',
    googleUser.sub,
  )
  const verifiedEmail = googleUser.email_verified === true ? googleUser.email ?? null : null
  const admission = await resolveBetaOAuthAdmission(store, { verifiedEmail, existingUserId })
  const legacyAllowed = isGoogleUserAllowed(googleUser, {
    emails: context.env.GOOGLE_ALLOWED_EMAILS,
    ids: context.env.GOOGLE_ALLOWED_IDS,
  })
  if (admission.decision === 'denied' || (admission.decision === 'legacy' && !legacyAllowed)) {
    throw new AuthCallbackError('not-allowed')
  }

  const user = await upsertGoogleUser(
    context.env.PXLBLZ_DB!,
    googleUser,
    Math.floor(Date.now() / 1000),
    admission.userId ?? undefined,
  )
  await claimMatchingBetaAccess(store, verifiedEmail, user.userId)
  return user
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

class AuthCallbackError extends Error {
  constructor(readonly result: string) {
    super(result)
  }
}
