import { parseAgentMessageAllowance, unavailableAgentMessageAllowance, type AgentMessageAllowance } from '../../engine/agentAllowance'
import type { AgentAccountNamespace } from './AgentAccount'

export const BUILTIN_ALLOWANCE_OWNER = 'builtin-global-v1'

/** Reads only the canonical account counter from the private allowance owner. */
export async function readBuiltinMessageAllowance(namespace: AgentAccountNamespace, accountId: string): Promise<AgentMessageAllowance> {
  try {
    const owner = namespace.get(namespace.idFromName(BUILTIN_ALLOWANCE_OWNER))
    const response = await owner.fetch(new Request('https://agent-allowance.internal/', {
      method: 'POST',
      body: JSON.stringify({ type: 'status', accountId }),
    }))
    const result = await response.json() as { allowance?: unknown }
    return parseAgentMessageAllowance(result.allowance) ?? unavailableAgentMessageAllowance()
  } catch {
    return unavailableAgentMessageAllowance()
  }
}
