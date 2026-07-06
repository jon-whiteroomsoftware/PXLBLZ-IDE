import {
  buildGoogleAuthorizeUrl,
  buildGitHubAuthorizeUrl,
  isSecureRequest,
  oauthModeCookieName,
  oauthProviderCookieName,
  oauthStateCookieName,
  oauthVerifierCookieName,
  type OAuthMode,
  type OAuthProvider,
  pkceChallenge,
  randomToken,
  redirectUriForRequest,
  setCookie,
} from '../../../src/cloudflare/auth'

interface PagesFunctionContext {
  request: Request
  env: {
    GITHUB_CLIENT_ID?: string
    GITHUB_OAUTH_REDIRECT_URI?: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_OAUTH_REDIRECT_URI?: string
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const requestUrl = new URL(context.request.url)
  const provider = oauthProviderFromRequest(requestUrl)
  const mode = oauthModeFromRequest(requestUrl)
  const clientId = provider === 'google' ? context.env.GOOGLE_CLIENT_ID : context.env.GITHUB_CLIENT_ID
  if (!clientId) return Response.json({ error: `${providerLabel(provider)} OAuth is not configured` }, { status: 503 })

  const state = randomToken()
  const verifier = randomToken()
  const redirectOverride = provider === 'google'
    ? context.env.GOOGLE_OAUTH_REDIRECT_URI
    : context.env.GITHUB_OAUTH_REDIRECT_URI
  const redirectUri = redirectUriForRequest(context.request, redirectOverride)
  const codeChallenge = await pkceChallenge(verifier)
  const authorizeUrl = provider === 'google'
    ? buildGoogleAuthorizeUrl({ clientId, redirectUri, state, codeChallenge })
    : buildGitHubAuthorizeUrl({ clientId, redirectUri, state, codeChallenge })
  const secure = isSecureRequest(context.request)

  return new Response(null, {
    status: 302,
    headers: [
      ['Location', authorizeUrl.toString()],
      ['Set-Cookie', setCookie(oauthStateCookieName, state, { maxAge: 600, secure })],
      ['Set-Cookie', setCookie(oauthVerifierCookieName, verifier, { maxAge: 600, secure })],
      ['Set-Cookie', setCookie(oauthProviderCookieName, provider, { maxAge: 600, secure })],
      ['Set-Cookie', setCookie(oauthModeCookieName, mode, { maxAge: 600, secure })],
    ],
  })
}

function oauthProviderFromRequest(url: URL): OAuthProvider {
  return url.searchParams.get('provider') === 'google' ? 'google' : 'github'
}

function oauthModeFromRequest(url: URL): OAuthMode {
  return url.searchParams.get('mode') === 'link' ? 'link' : 'sign-in'
}

function providerLabel(provider: OAuthProvider): string {
  return provider === 'google' ? 'Google' : 'GitHub'
}
