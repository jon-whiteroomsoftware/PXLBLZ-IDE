import type { PrivateEditOwner } from '@/engine/agentPrivateExecutor'
import type { createAgentEditorAdmission } from './editorAdmission'

/** The shared local admission remains the only validation, adoption and save owner. */
export function createAgentPrivateAdmissionOwner(admission: ReturnType<typeof createAgentEditorAdmission>): PrivateEditOwner {
  return {
    capture(operationId, intent, remainingBytes) {
      const metadata = admission.captureCommandContext()
      const show = admission.getShow()
      const context = admission.getEditorFocus()
      if (!metadata || !show) return undefined
      // Reserve source/context and the Show before admission retains its snapshot.
      const estimate = new TextEncoder().encode(JSON.stringify({ show, context })).byteLength + metadata.retainedBytes
      if (estimate > remainingBytes || estimate > 1_048_576) return undefined
      const captured = admission.beginRequest(operationId, intent, [])
      if (!captured) return undefined
      return { ...captured, ...metadata, retainedBytes: new TextEncoder().encode(JSON.stringify(captured)).byteLength + metadata.retainedBytes }
    },
    apply: (show, request) => admission.applyShow(show, request),
    complete: (request, completion) => admission.complete(request, completion),
    cancel: request => admission.cancel(request),
    outcome: request => admission.readOutcome(request),
  }
}
