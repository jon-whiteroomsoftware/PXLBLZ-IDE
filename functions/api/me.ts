import {
  parseCookieHeader,
  readSessionToken,
  sessionCookieName,
} from '../../src/cloudflare/auth'
import { listConnectedIdentities, type D1DatabaseWritableLike } from '../../src/cloudflare/users'

interface PagesFunctionContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseWritableLike
  }
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const cookies = parseCookieHeader(context.request.headers.get('Cookie'))
  const session = await readSessionToken(cookies[sessionCookieName], context.env.SESSION_SECRET)

  if (!session) {
    return Response.json({ authenticated: false })
  }
  const identities = context.env.PXLBLZ_DB
    ? await listConnectedIdentities(context.env.PXLBLZ_DB, session.userId)
    : []

  return Response.json({
    authenticated: true,
    user: {
      id: session.userId,
      primaryProvider: session.primaryProvider,
      primaryHandle: session.primaryHandle,
      githubUserId: session.githubUserId,
      githubLogin: session.githubLogin,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      identities,
    },
  })
}
