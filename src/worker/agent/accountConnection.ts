import { agentAccessRefusal, agentResponse, type AgentAccessEnvironment } from '../../cloudflare/agentAccess'
import type { AgentClaim, WindowIdentity } from '../../engine/agentRendezvous'
import type { AgentAccountNamespace } from './AgentAccount'

/**
 * Internal transport seam shared by built-in service and future OAuth MCP.
 * accountId and identity MUST come from that transport's validated credentials,
 * never browser/tool JSON. No public endpoint exposes this function.
 * inspect resolves a pending call or surviving binding; it never replays work.
 */
export async function accountConnection(
  env: AgentAccessEnvironment & { AGENT_ACCOUNTS?: AgentAccountNamespace },
  accountId: string,
  identity: AgentClaim,
  action: 'claim' | 'inspect',
  window?: WindowIdentity,
): Promise<Response> {
  if (!accountId || !['builtin', 'external'].includes(identity.agentKind)
    || ![identity.agentId, identity.agentName, identity.callId, identity.bindingId].every((value) => typeof value === 'string' && value.length > 0 && value.length <= 128)) return agentResponse({ code: 'invalid_request' }, 400)
  const refusal = agentAccessRefusal(accountId, env)
  if (refusal) return agentResponse({ code: refusal }, refusal === 'not_allowed' ? 403 : 503)
  if (!env.AGENT_ACCOUNTS) return agentResponse({ code: 'unavailable' }, 503)
  const id = env.AGENT_ACCOUNTS.idFromName(accountId)
  return env.AGENT_ACCOUNTS.get(id).fetch(new Request('https://agent-account.internal/connection', {
    method: 'POST', body: JSON.stringify({ type: action, ...identity, ...(action === 'claim' && window ? { window } : {}) }),
  }))
}
