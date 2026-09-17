import { useLayoutEffect } from 'react'
import { createAgentEditorAdmission, observeAgentLocation, type AgentEditorRecordBinding } from './editorAdmission'
import { createProductionAgentSession } from './editorSession'
import { createBuiltinClient } from './builtinClient'
import type { AgentBrowserSessionPort } from './channelPort'
import type { AgentMessageAllowance } from '@/engine/agentAllowance'

type Admission = ReturnType<typeof createAgentEditorAdmission>
export interface AgentEditorLifecycleOptions {
  showId: string
  readOnly: boolean
  enabled: boolean
  allowance?: AgentMessageAllowance
  /** DEV-only historical diagnostic gate; observed across same-route URL changes. */
  legacyDiagnosticEnabled?: () => boolean
  getContext: () => unknown
  bindFieldActivity?: Parameters<typeof createAgentEditorAdmission>[2]
  /**
   * Which record version this route holds, and its prepared capture when that
   * is v2 (#1039). Omitted, the admission resolves the v1 collection, which is
   * what the v1 route has always done.
   */
  record?: AgentEditorRecordBinding
  createChannel(input: { admission: Admission; showId: string }): AgentBrowserSessionPort
  createAdmission?: typeof createAgentEditorAdmission
  diagnostic?(admission: Admission, session: ReturnType<typeof createProductionAgentSession>): () => void
}
/** One enabled Show/URL lifetime; capability changes remount through the hook. */
export function mountAgentEditorLifecycle(options: AgentEditorLifecycleOptions): () => void {
  if (options.readOnly || (!options.enabled && !options.legacyDiagnosticEnabled)) return () => {}
  const pathname = window.location.pathname
  let session: ReturnType<typeof createProductionAgentSession> | undefined
  let clearDiagnostic: (() => void) | undefined
  const close = () => {
    session?.close(); session = undefined
    clearDiagnostic?.(); clearDiagnostic = undefined
  }
  const sync = () => {
    if (window.location.pathname !== pathname || (!options.enabled && !options.legacyDiagnosticEnabled?.())) { close(); return }
    if (session) return
    const admission = (options.createAdmission ?? createAgentEditorAdmission)(options.showId, options.getContext, options.bindFieldActivity, undefined, options.record)
    const channel = options.createChannel({ admission, showId: options.showId })
    session = createProductionAgentSession(admission, options.showId, channel, createBuiltinClient(channel), options.allowance)
    clearDiagnostic = options.diagnostic?.(admission, session)
  }
  const stop = observeAgentLocation(sync)
  sync()
  return () => { close(); stop() }
}
export function useAgentEditorLifecycle(options: AgentEditorLifecycleOptions): void {
  const { showId, readOnly, enabled, allowance, legacyDiagnosticEnabled, getContext, bindFieldActivity, record, createChannel, createAdmission, diagnostic } = options
  useLayoutEffect(() => mountAgentEditorLifecycle({ showId, readOnly, enabled, allowance, legacyDiagnosticEnabled, getContext, bindFieldActivity, record, createChannel, createAdmission, diagnostic }), [showId, readOnly, enabled, allowance, legacyDiagnosticEnabled, getContext, bindFieldActivity, record, createChannel, createAdmission, diagnostic])
}
