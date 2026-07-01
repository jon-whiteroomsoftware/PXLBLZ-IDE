import { clearCookie, sessionCookieName } from '../../../src/cloudflare/auth'

export function onRequestPost(): Response {
  return Response.json(
    { ok: true },
    { headers: { 'Set-Cookie': clearCookie(sessionCookieName) } },
  )
}

export function onRequestGet(): Response {
  return new Response(null, {
    status: 302,
    headers: [
      ['Location', '/'],
      ['Set-Cookie', clearCookie(sessionCookieName)],
    ],
  })
}
