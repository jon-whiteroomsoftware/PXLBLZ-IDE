import { agentAccessRefusal, type AgentAccessEnvironment } from '../../cloudflare/agentAccess'
import type { AgentClaim } from '../../engine/agentRendezvous'
import type { PrivateEditResult } from '../../engine/agentPrivateExecutor'
import type { AgentAccountNamespace } from './AgentAccount'
import type { AgentDeliveryInput, AgentEditorQuery } from './agentRelay'
type Environment = AgentAccessEnvironment & { AGENT_ACCOUNTS?: AgentAccountNamespace }

/** Internal transport seam. Account and claim come from validated credentials or
 * exact-window builtin resolution, never browser/tool-supplied actor fields. */
export async function dispatchAgentDelivery(env: Environment, accountId: string, identity: AgentClaim, delivery: AgentDeliveryInput): Promise<PrivateEditResult> {
  return send(env, accountId, identity, { type: 'relay-dispatch', delivery })
}
export async function queryAgentEditor(env: Environment, accountId: string, identity: AgentClaim, query: AgentEditorQuery): Promise<PrivateEditResult> {
  return send(env, accountId, identity, { type: 'relay-query', query })
}
async function send(env: Environment, accountId: string, identity: AgentClaim, command: { type: 'relay-dispatch'; delivery: AgentDeliveryInput } | { type: 'relay-query'; query: AgentEditorQuery }): Promise<PrivateEditResult> {
  if (!accountId || !['builtin', 'external'].includes(identity.agentKind) || ![identity.agentId, identity.agentName, identity.callId, identity.bindingId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 128)) return { code: 'invalid_request' }
  const refusal = agentAccessRefusal(accountId, env)
  if (refusal) return { code: refusal }
  if (!env.AGENT_ACCOUNTS) return { code: 'unavailable' }
  try {
    const response = await env.AGENT_ACCOUNTS.get(env.AGENT_ACCOUNTS.idFromName(accountId)).fetch(new Request('https://agent-account.internal/delivery', {
      method: 'POST', body: JSON.stringify({ ...command, identity, accountId }),
    }))
    return await response.json() as PrivateEditResult
  } catch { return { code: 'unknown' } }
}
