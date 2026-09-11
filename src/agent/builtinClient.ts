import { agentUrlEnabled } from './editorAdmission'
import type { AgentBrowserSessionPort } from './channelPort'

/** Same-origin transport; account and binding authority are resolved on the server. */
export function createBuiltinClient(channel: AgentBrowserSessionPort, transport: typeof fetch = fetch) {
  return async (command: Record<string, unknown>): Promise<{ code: string; [key: string]: unknown }> => {
    if (!agentUrlEnabled()) return { code: 'opt_in_required' }
    const identity = channel.getWindow() ?? await channel.ready
    if (!identity || !agentUrlEnabled()) return { code: 'no_live_editor' }
    const response = await transport('/api/agent/builtin?agent=1', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...command, window: identity }) })
    const result: unknown = await response.json()
    return result && typeof result === 'object' && 'code' in result && typeof result.code === 'string' ? result as { code: string; [key: string]: unknown } : { code: 'unavailable' }
  }
}
