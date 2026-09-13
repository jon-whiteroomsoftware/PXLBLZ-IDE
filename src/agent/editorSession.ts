import type { createAgentEditorAdmission } from './editorAdmission'
import type { AgentBrowserSessionPort } from './channelPort'
import { createProductionDrawerController } from './drawerController'
import type { AgentMessageAllowance } from '@/engine/agentAllowance'

/** React owns the admission lifetime; the one channel owns executor retirement. */
export function createProductionAgentSession(admission: ReturnType<typeof createAgentEditorAdmission>, showId: string, channel: AgentBrowserSessionPort, builtin: Parameters<typeof createProductionDrawerController>[3], allowance?: AgentMessageAllowance) {
  const controller = createProductionDrawerController(admission, showId, channel, builtin, allowance)
  let closed = false
  return {
    controller,
    close() {
      if (closed) return
      closed = true
      // close() on the channel retires private work synchronously, before leave I/O.
      controller.dispose()
      admission.close()
    },
  }
}
