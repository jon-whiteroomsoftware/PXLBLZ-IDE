import { agentBuiltinAccessRefusal, agentServiceRefusal, type AgentAccessEnvironment } from '../../cloudflare/agentAccess'
import type { AgentClaim, ExternalMoveNotice, WindowIdentity } from '../../engine/agentRendezvous'
import type { PrivateEditResult } from '../../engine/agentPrivateExecutor'
import { isAgentMcpResult } from '../../engine/agentMcpResults'
import type { AgentAccountNamespace } from './AgentAccount'
import type { AgentDeliveryInput, AgentEditorQuery, ExternalAgentDeliveryInput } from './agentRelay'
type Environment = AgentAccessEnvironment & { AGENT_ACCOUNTS?: AgentAccountNamespace }
export interface ExternalToolConnection extends PrivateEditResult {
  claim?: AgentClaim
  binding?: AgentClaim & WindowIdentity & { showName?: string }
  expiresAt?: number
  moveNotice?: ExternalMoveNotice
  retry_after_ms?: number
}

interface TrustedExternalTool {
  accountId: string
  grantId: string
  clientName: string
}

export function connectExternalTool(env: Environment, grant: TrustedExternalTool, callId?: string): Promise<ExternalToolConnection> {
  return sendExternal(env, grant, {
    type: 'external-tool-connect',
    ...(callId ? { callId } : { nextCallId: crypto.randomUUID(), nextBindingId: crypto.randomUUID() }),
  })
}
export function resolveExternalTool(env: Environment, grant: TrustedExternalTool): Promise<ExternalToolConnection> {
  return sendExternal(env, grant, { type: 'external-tool-resolve' })
}
export function dispatchExternalTool(env: Environment, grant: TrustedExternalTool, expectedBindingId: string, delivery: ExternalAgentDeliveryInput): Promise<ExternalToolConnection> {
  return sendExternal(env, grant, { type: 'external-tool-dispatch', expectedBindingId, delivery })
}
export function queryExternalTool(env: Environment, grant: TrustedExternalTool, expectedBindingId: string, query: AgentEditorQuery): Promise<ExternalToolConnection> {
  return sendExternal(env, grant, { type: 'external-tool-query', expectedBindingId, query })
}

async function sendExternal(env: Environment, grant: TrustedExternalTool, command: Record<string, unknown>): Promise<ExternalToolConnection> {
  if (!grant.accountId || !grant.grantId || !grant.clientName || [grant.accountId, grant.grantId, grant.clientName].some(value => typeof value !== 'string' || value.length > 256)) return { code: 'invalid_request' }
  const refusal = agentServiceRefusal(env)
  if (refusal) return { code: refusal }
  if (!env.AGENT_ACCOUNTS) return { code: 'unavailable' }
  try {
    const response = await env.AGENT_ACCOUNTS.get(env.AGENT_ACCOUNTS.idFromName(grant.accountId)).fetch(new Request('https://agent-account.internal/external-tool', {
      method: 'POST', body: JSON.stringify({ ...command, agentId: grant.grantId, agentName: grant.clientName }),
    }))
    const result: unknown = await response.json()
    return isAgentMcpResult(result) ? result as ExternalToolConnection : { code: 'unknown' }
  } catch { return { code: 'unknown' } }
}

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
  const refusal = identity.agentKind === 'builtin' ? agentBuiltinAccessRefusal(accountId, env) : agentServiceRefusal(env)
  if (refusal) return { code: refusal }
  if (!env.AGENT_ACCOUNTS) return { code: 'unavailable' }
  try {
    const response = await env.AGENT_ACCOUNTS.get(env.AGENT_ACCOUNTS.idFromName(accountId)).fetch(new Request('https://agent-account.internal/delivery', {
      method: 'POST', body: JSON.stringify({ ...command, identity, accountId }),
    }))
    return await response.json() as PrivateEditResult
  } catch { return { code: 'unknown' } }
}
