import {
  parseCookieHeader,
  readSessionToken,
  sessionCookieName,
  type OAuthProvider,
} from '../../../src/cloudflare/auth'
import { disconnectIdentity, type D1DatabaseWritableLike } from '../../../src/cloudflare/users'

interface PagesFunctionContext {
  request: Request
  env: {
    SESSION_SECRET?: string
    PXLBLZ_DB?: D1DatabaseWritableLike
  }
}

export async function onRequestPost(context: PagesFunctionContext): Promise<Response> {
  const cookies = parseCookieHeader(context.request.headers.get('Cookie'))
  const session = await readSessionToken(cookies[sessionCookieName], context.env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!context.env.PXLBLZ_DB) return Response.json({ error: 'Database unavailable' }, { status: 503 })

  const provider = providerFromRequest(new URL(context.request.url))
  if (!provider) return Response.json({ error: 'Unknown provider' }, { status: 400 })

  const result = await disconnectIdentity(context.env.PXLBLZ_DB, session.userId, provider)
  if (result === 'last-identity') {
    return Response.json({ error: 'At least one login must stay connected' }, { status: 400 })
  }
  return Response.json({ ok: true })
}

function providerFromRequest(url: URL): OAuthProvider | null {
  const provider = url.searchParams.get('provider')
  if (provider === 'github' || provider === 'google') return provider
  return null
}
