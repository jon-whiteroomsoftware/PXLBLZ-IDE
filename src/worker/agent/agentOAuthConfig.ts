export const AGENT_CONNECT_SCOPE = 'agent:connect'
export interface AgentOAuthClient { clientId: string; clientName: string; redirectUris: string[] }
export interface AgentOAuthConfig { origin: string; resource: string; clients: AgentOAuthClient[] }
export interface AgentOAuthSettings { AGENT_OAUTH_ORIGIN?: string; AGENT_OAUTH_CLIENTS?: string }
/** Deployment-owned preregistration. No URL client IDs or network discovery. */
export function agentOAuthConfig(env: AgentOAuthSettings): AgentOAuthConfig | null {
  try {
    const origin = new URL(env.AGENT_OAUTH_ORIGIN ?? '')
    if (origin.origin !== env.AGENT_OAUTH_ORIGIN || !safeEndpoint(origin)) return null
    const clients: unknown = JSON.parse(env.AGENT_OAUTH_CLIENTS ?? '')
    if (!Array.isArray(clients) || !clients.length || clients.length > 8) return null
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
  return !url.username && !url.password && !url.hash && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
}
export function providerSubject(accountId: string): string {
  const bytes = new TextEncoder().encode(accountId)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
