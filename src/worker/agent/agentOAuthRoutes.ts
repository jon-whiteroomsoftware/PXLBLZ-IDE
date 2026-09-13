import { agentContinuationCookieName, clearCookie, parseCookieHeader, readSessionFromRequest } from '../../cloudflare/auth'
import { agentServiceRefusal, agentResponse } from '../../cloudflare/agentAccess'
import type { WorkerEnv } from '../apiRoutes'
import { agentOAuthConfig } from './agentOAuthConfig'
import { agentMcpRouting } from './agentMcpRouting'
import type { ValidatedAgentGrant } from './AgentOAuthAuthority'
import { agentAuthorizationExpiredPage, agentSignInPage } from './agentOAuthConsent'

export const AGENT_OAUTH_PATHS = ['/oauth/authorize', '/oauth/token', '/oauth/register', '/mcp', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'] as const
export async function agentOAuthRoute(request: Request, env: WorkerEnv): Promise<Response> {
  const config = agentOAuthConfig(env)
  if (!config || !env.AGENT_OAUTH_AUTHORITY) return agentResponse({ error: 'temporarily_unavailable' }, 503)
  const url = new URL(request.url)
  if (url.origin !== config.origin) return agentResponse({ error: 'invalid_request' }, 400)
  const origin = request.headers.get('Origin')
  if (origin && !safeWebOrigin(origin)) return agentResponse({ error: 'invalid_origin' }, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin ?? config.origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version', 'Access-Control-Max-Age': '600', 'Cache-Control': 'no-store', Vary: 'Origin' } })
  const headers = new Headers()
  for (const name of ['Authorization', 'Accept', 'Content-Type', 'MCP-Protocol-Version', 'Origin']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  let body: Uint8Array<ArrayBuffer> | undefined
  let continuation: string | null = null
  if (request.body) {
    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > (url.pathname === '/mcp' ? 67_584 : 16_384)) { await reader.cancel(); return agentResponse({ error: 'invalid_request' }, 413) }
      chunks.push(value)
    }
    body = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  }
  if (url.pathname === '/oauth/authorize') {
    if (!['GET', 'POST'].includes(request.method)) return agentResponse({ error: 'invalid_request' }, 405)
    if ([...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)) return agentResponse({ error: 'invalid_request' }, 400)
    const session = await readSessionFromRequest(request, env.SESSION_SECRET).catch(() => null)
    if (!session) {
      if (request.method !== 'GET') return agentResponse({ error: 'unauthorized' }, 401)
      headers.set('X-Agent-Continuation-Start', '1')
    } else {
      const refusal = agentServiceRefusal(env)
      if (refusal) return agentResponse({ error: refusal }, 503)
      continuation = parseCookieHeader(request.headers.get('Cookie'))[agentContinuationCookieName] ?? null
      if (continuation) headers.set('X-Agent-Continuation', continuation)
      headers.set('X-Agent-Account', session.userId)
      headers.set('X-Agent-Account-Label', encodeURIComponent(session.displayName || session.primaryHandle || session.userId))
    }
    if (request.method === 'POST' && (origin !== config.origin || headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded')) return agentResponse({ error: 'invalid_request' }, 403)
  } else if (url.pathname === '/oauth/token') {
    if (request.method !== 'POST' || headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') return agentResponse({ error: 'invalid_request' }, 405)
    const form = new URLSearchParams(new TextDecoder().decode(body))
    if ([...form.keys()].some((key) => form.getAll(key).length !== 1)) return agentResponse({ error: 'invalid_request' }, 400)
    if (form.getAll('client_id').length > 1) return agentResponse({ error: 'invalid_client' }, 400)
    const revocation = !form.has('grant_type') && !!form.get('token')
    if (revocation) headers.set('X-Agent-Revocation', '1')
    else if (form.getAll('resource').length !== 1 || form.get('resource') !== config.resource) return agentResponse({ error: 'invalid_target' }, 400)
  } else if (url.pathname === '/oauth/register') {
    if (request.method !== 'POST' || headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return agentResponse({ error: 'invalid_request' }, 405)
    if (origin) {
      let redirectOrigins: string[]
      try {
        const metadata = JSON.parse(new TextDecoder().decode(body)) as { redirect_uris?: unknown }
        redirectOrigins = Array.isArray(metadata.redirect_uris) ? metadata.redirect_uris.map(uri => new URL(String(uri)).origin) : []
      } catch { return agentResponse({ error: 'invalid_request' }, 400) }
      if (!redirectOrigins.includes(origin)) return agentResponse({ error: 'invalid_origin' }, 403)
    }
  } else if (url.pathname === '/mcp') {
    if (!['POST', 'GET', 'DELETE'].includes(request.method)) return agentResponse({ error: 'invalid_request' }, 405)
    if (url.searchParams.has('access_token') || !/^Bearer [^\s]+$/i.test(headers.get('Authorization') ?? '')) return unauthorized(config.origin, origin)
  } else if (request.method !== 'GET') return agentResponse({ error: 'invalid_request' }, 405)
  const forwardedURL = new URL(url)
  if (url.pathname === '/.well-known/oauth-protected-resource/mcp') forwardedURL.pathname = '/.well-known/oauth-protected-resource'
  const stub = env.AGENT_OAUTH_AUTHORITY.get(env.AGENT_OAUTH_AUTHORITY.idFromName(config.origin))
  let response = await stub.fetch(new Request(forwardedURL, { redirect: 'manual', method: request.method, headers, ...(body ? { body } : {}) }))
  if (url.pathname === '/oauth/authorize' && request.method === 'GET') {
    if (headers.get('X-Agent-Continuation-Start') === '1' && response.ok) {
      const pending = await response.json() as { code?: string; continuation?: string; clientName?: string }
      response = pending.code === 'sign_in_required' && pending.continuation && pending.clientName
        ? agentSignInPage(pending.clientName, pending.continuation)
        : agentAuthorizationExpiredPage()
    } else if (continuation && !response.ok) response = agentAuthorizationExpiredPage()
  }
  if (url.pathname === '/.well-known/oauth-authorization-server' && response.ok) {
    const metadata = await response.json() as Record<string, unknown>
    metadata.client_id_metadata_document_supported = true
    response = Response.json(metadata, response)
  }
  if (url.pathname === '/mcp' && response.ok) {
    const grant = await response.json() as ValidatedAgentGrant
    response = origin && origin !== config.origin && !grant.clientOrigins.includes(origin)
      ? agentResponse({ error: 'invalid_origin' }, 403)
      : await agentMcpRouting(new Request(url, { method: request.method, headers, ...(body ? { body } : {}) }), env, grant)
  }
  const result = new Response(response.body, response)
  if (continuation) result.headers.append('Set-Cookie', clearCookie(agentContinuationCookieName))
  result.headers.set('Cache-Control', 'no-store')
  result.headers.delete('Access-Control-Allow-Origin')
  result.headers.delete('Access-Control-Allow-Credentials')
  result.headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Protocol-Version')
  if (origin) { result.headers.set('Access-Control-Allow-Origin', origin); result.headers.set('Vary', 'Origin') }
  return result
}
function unauthorized(origin: string, allowedOrigin: string | null) {
  return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store', 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`, 'Access-Control-Expose-Headers': 'WWW-Authenticate', ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' } : {}) } })
}
function safeWebOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return url.origin === value && !url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  } catch { return false }
}
