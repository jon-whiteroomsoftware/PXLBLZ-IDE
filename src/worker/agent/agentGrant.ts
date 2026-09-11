import type { WorkerEnv } from '../apiRoutes'
import type { ValidatedAgentGrant } from './AgentOAuthAuthority'
import { agentOAuthConfig } from './agentOAuthConfig'

/** Private authority lookup after a held connection; no caller identity headers. */
export async function agentGrantAction(env: WorkerEnv, accountId: string, grantId: string, action: 'inspect' | 'revoke'): Promise<{ code: string; clientId?: string }> {
  const config = agentOAuthConfig(env)
  if (!config || !env.AGENT_OAUTH_AUTHORITY) return { code: 'unavailable' }
  try {
    const response = await env.AGENT_OAUTH_AUTHORITY.get(env.AGENT_OAUTH_AUTHORITY.idFromName(config.origin)).fetch(new Request(`${config.origin}/internal/grant`, {
      method: 'POST', headers: { 'X-Agent-Account': accountId, 'X-Agent-Grant': grantId, 'X-Agent-Grant-Action': action, ...(action === 'revoke' ? { 'X-Agent-Revocation': '1' } : {}) },
    }))
    return await response.json() as { code: string; clientId?: string }
  } catch { return { code: 'unavailable' } }
}
export async function agentGrantLive(env: WorkerEnv, grant: ValidatedAgentGrant): Promise<boolean> {
  if (grant.expiresAt * 1000 <= Date.now()) return false
  const current = await agentGrantAction(env, grant.accountId, grant.grantId, 'inspect')
  return current.code === 'live' && current.clientId === grant.clientId
}
