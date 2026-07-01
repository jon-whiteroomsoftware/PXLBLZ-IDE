import {
  clearCookie,
  createSessionCookie,
  exchangeGitHubCode,
  fetchGitHubUser,
  isGitHubUserAllowed,
  isSecureRequest,
  oauthStateCookieName,
  oauthVerifierCookieName,
  parseCookieHeader,
  redirectUriForRequest,
} from '../../../src/cloudflare/auth'
import { upsertGitHubUser, type D1DatabaseWritableLike } from '../../../src/cloudflare/users'

interface PagesFunctionContext {
  request: Request
  env: {
    GITHUB_CLIENT_ID?: string
    GITHUB_CLIENT_SECRET?: string
    GITHUB_OAUTH_REDIRECT_URI?: string
    GITHUB_ALLOWED_LOGINS?: string
    GITHUB_ALLOWED_IDS?: string
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseWritableLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const requestUrl = new URL(context.request.url)
  const error = requestUrl.searchParams.get('error')
  const code = requestUrl.searchParams.get('code')
  const state = requestUrl.searchParams.get('state')
  const cookies = parseCookieHeader(context.request.headers.get('Cookie'))
  const redirectToApp = new URL('/', requestUrl.origin)
  const secure = isSecureRequest(context.request)

  if (error) return redirectWithAuthResult(redirectToApp, 'error', secure)
  if (!context.env.GITHUB_CLIENT_ID || !context.env.GITHUB_CLIENT_SECRET || !context.env.SESSION_SECRET) {
    return redirectWithAuthResult(redirectToApp, 'not-configured', secure)
  }
  if (!context.env.PXLBLZ_DB) return redirectWithAuthResult(redirectToApp, 'no-database', secure)
  if (!code || !state || state !== cookies[oauthStateCookieName] || !cookies[oauthVerifierCookieName]) {
    return redirectWithAuthResult(redirectToApp, 'invalid-state', secure)
  }

  try {
    const accessToken = await exchangeGitHubCode({
      clientId: context.env.GITHUB_CLIENT_ID,
      clientSecret: context.env.GITHUB_CLIENT_SECRET,
      code,
      redirectUri: redirectUriForRequest(context.request, context.env.GITHUB_OAUTH_REDIRECT_URI),
      codeVerifier: cookies[oauthVerifierCookieName],
    })
    const githubUser = await fetchGitHubUser(accessToken)

    if (!isGitHubUserAllowed(githubUser, {
      logins: context.env.GITHUB_ALLOWED_LOGINS,
      ids: context.env.GITHUB_ALLOWED_IDS,
    })) {
      return redirectWithAuthResult(redirectToApp, 'not-allowed', secure)
    }

    const user = await upsertGitHubUser(context.env.PXLBLZ_DB, githubUser)
    const sessionCookie = await createSessionCookie(user, context.env.SESSION_SECRET, { secure })

    return new Response(null, {
      status: 302,
      headers: [
        ['Location', redirectToApp.toString()],
        ['Set-Cookie', sessionCookie],
        ['Set-Cookie', clearCookie(oauthStateCookieName)],
        ['Set-Cookie', clearCookie(oauthVerifierCookieName)],
      ],
    })
  } catch {
    return redirectWithAuthResult(redirectToApp, 'error', secure)
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
    ],
  })
}
