export const AGENT_CONNECT_SCOPE = 'agent:connect'
export interface AgentOAuthClient { clientId: string; clientName: string; redirectUris: string[] }
export interface AgentOAuthConfig { origin: string; resource: string; clients: AgentOAuthClient[] }
export interface AgentOAuthSettings {
  AGENT_OAUTH_ORIGIN?: string
  AGENT_OAUTH_CLIENTS?: string
  /** Dev coordinator override. Accepted only as a literal HTTP loopback origin. */
  PXLBLZ_DEV_AGENT_OAUTH_ORIGIN?: string
}
/** Deployment-owned preregistration. DCR and CIMD clients resolve in the authority. */
export function agentOAuthConfig(env: AgentOAuthSettings): AgentOAuthConfig | null {
  try {
    const configuredOrigin = env.PXLBLZ_DEV_AGENT_OAUTH_ORIGIN ?? env.AGENT_OAUTH_ORIGIN ?? ''
    const origin = new URL(configuredOrigin)
    if (origin.origin !== configuredOrigin || !safeEndpoint(origin)) return null
    if (env.PXLBLZ_DEV_AGENT_OAUTH_ORIGIN && (origin.protocol !== 'http:' || !isLoopback(origin))) return null
    const clients: unknown = JSON.parse(env.AGENT_OAUTH_CLIENTS ?? '')
    if (!Array.isArray(clients) || clients.length > 8) return null
    const ids = new Set<string>()
    for (const value of clients) {
      if (!value || typeof value !== 'object') return null
      const client = value as AgentOAuthClient
      if (Object.keys(client).some((key) => !['clientId', 'clientName', 'redirectUris'].includes(key)) || typeof client.clientId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(client.clientId) || ids.has(client.clientId) || typeof client.clientName !== 'string' || !client.clientName.trim() || client.clientName.length > 100 || !Array.isArray(client.redirectUris) || !client.redirectUris.length || client.redirectUris.length > 4) return null
      ids.add(client.clientId)
      if (!client.redirectUris.every((uri) => typeof uri === 'string' && uri.length <= 512 && safeEndpoint(new URL(uri)))) return null
    }
    return { origin: origin.origin, resource: `${origin.origin}/mcp`, clients }
  } catch { return null }
}
function safeEndpoint(url: URL) {
  return !url.username && !url.password && !url.hash && (url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url)))
}
function isLoopback(url: URL) { return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) }
export function providerSubject(accountId: string): string {
  const bytes = new TextEncoder().encode(accountId)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** Mirrors the pinned provider's RFC 8252 callback match: loopback ports are
 * chosen at runtime; every other component and every non-loopback URI is exact. */
export function isAgentRedirectUri(requestUri: string, registeredUris: readonly string[]): boolean {
  return registeredUris.some((registeredUri) => {
    if (!isLoopbackRedirect(requestUri) || !isLoopbackRedirect(registeredUri)) return requestUri === registeredUri
    try {
      const requested = new URL(requestUri)
      const registered = new URL(registeredUri)
      return requested.protocol === registered.protocol
        && requested.hostname === registered.hostname
        && requested.pathname === registered.pathname
        && requested.search === registered.search
    } catch { return false }
  })
}

function isLoopbackRedirect(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  } catch { return false }
}
