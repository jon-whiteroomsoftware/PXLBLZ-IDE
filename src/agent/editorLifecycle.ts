import { useLayoutEffect } from 'react'
import { agentUrlEnabled, createAgentEditorAdmission, observeAgentLocation } from './editorAdmission'
import { createProductionAgentSession } from './editorSession'
import { createBuiltinClient } from './builtinClient'
import type { AgentBrowserSessionPort } from './channelPort'

type Admission = ReturnType<typeof createAgentEditorAdmission>
export interface AgentEditorLifecycleOptions {
  showId: string
  readOnly: boolean
  getContext: () => unknown
  bindFieldActivity?: Parameters<typeof createAgentEditorAdmission>[2]
  createChannel(input: { admission: Admission; showId: string }): AgentBrowserSessionPort
  createAdmission?: typeof createAgentEditorAdmission
  diagnostic?(admission: Admission, session: ReturnType<typeof createProductionAgentSession>): () => void
}
/** One Show/URL lifetime, including remove/restore opt-in ABA. */
export function mountAgentEditorLifecycle(options: AgentEditorLifecycleOptions): () => void {
  if (options.readOnly) return () => {}
  const pathname = window.location.pathname
  let session: ReturnType<typeof createProductionAgentSession> | undefined
  let clearDiagnostic: (() => void) | undefined
  const close = () => {
    session?.close(); session = undefined
    clearDiagnostic?.(); clearDiagnostic = undefined
  }
  const sync = () => {
    if (!agentUrlEnabled() || window.location.pathname !== pathname) { close(); return }
    if (session) return
    const admission = (options.createAdmission ?? createAgentEditorAdmission)(options.showId, options.getContext, options.bindFieldActivity)
    const channel = options.createChannel({ admission, showId: options.showId })
    session = createProductionAgentSession(admission, options.showId, channel, createBuiltinClient(channel))
    clearDiagnostic = options.diagnostic?.(admission, session)
  }
  const stop = observeAgentLocation(sync)
  sync()
  return () => { close(); stop() }
}
export function useAgentEditorLifecycle(options: AgentEditorLifecycleOptions): void {
  const { showId, readOnly, getContext, bindFieldActivity, createChannel, createAdmission, diagnostic } = options
  useLayoutEffect(() => mountAgentEditorLifecycle({ showId, readOnly, getContext, bindFieldActivity, createChannel, createAdmission, diagnostic }), [showId, readOnly, getContext, bindFieldActivity, createChannel, createAdmission, diagnostic])
}
