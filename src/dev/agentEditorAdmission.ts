import { createAgentEditorAdmission as createAdmission } from '@/agent/editorAdmission'
import { recordAgentObservation, showRecordDigest } from './agentObservation'
export { agentUrlEnabled, observeAgentLocation } from '@/agent/editorAdmission'

/** Diagnostic compatibility only; production imports the shared owner directly. */
export function createAgentEditorAdmission(...args: Parameters<typeof createAdmission>) {
  return createAdmission(args[0], args[1], args[2], (request, phase, show, historyDepth) => {
    args[3]?.(request, phase, show, historyDepth)
    recordAgentObservation({ kind: 'agent-apply', phase, showId: request.showId, requestId: request.operationId, at: Date.now(),
      ...(show ? { digest: showRecordDigest(show), updatedAt: show.updatedAt } : {}), historyDepth })
  })
}
