import {
  buildGitHubAuthorizeUrl,
  isSecureRequest,
  oauthStateCookieName,
  oauthVerifierCookieName,
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
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const clientId = context.env.GITHUB_CLIENT_ID
  if (!clientId) return Response.json({ error: 'GitHub OAuth is not configured' }, { status: 503 })

  const state = randomToken()
  const verifier = randomToken()
  const redirectUri = redirectUriForRequest(context.request, context.env.GITHUB_OAUTH_REDIRECT_URI)
  const authorizeUrl = buildGitHubAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: await pkceChallenge(verifier),
  })
  const secure = isSecureRequest(context.request)

  return new Response(null, {
    status: 302,
    headers: [
      ['Location', authorizeUrl.toString()],
      ['Set-Cookie', setCookie(oauthStateCookieName, state, { maxAge: 600, secure })],
      ['Set-Cookie', setCookie(oauthVerifierCookieName, verifier, { maxAge: 600, secure })],
    ],
  })
}
