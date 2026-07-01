import {
  parseCookieHeader,
  readSessionToken,
  sessionCookieName,
} from '../../src/cloudflare/auth'

interface PagesFunctionContext {
  request: Request
  env: {
    SESSION_SECRET?: string
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const cookies = parseCookieHeader(context.request.headers.get('Cookie'))
  const session = await readSessionToken(cookies[sessionCookieName], context.env.SESSION_SECRET)

  if (!session) {
    return Response.json({ authenticated: false }, { status: 401 })
  }

  return Response.json({
    authenticated: true,
    user: {
      id: session.userId,
      githubUserId: session.githubUserId,
      githubLogin: session.githubLogin,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
    },
  })
}
