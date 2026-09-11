import { applyShowCommand } from '@/engine/showCommands/registry'
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
    apply: (show, request, resize) => admission.applyShow(show, request, resize),
    retry(request, operationId, remainingBytes) {
      // Reserve the maximum admitted snapshot before retaining another request.
      const metadata = admission.captureCommandContext()
      if (!metadata || remainingBytes < 2_097_152 + metadata.retainedBytes) return undefined
      const captured = admission.beginRetry(operationId, request)
      if (!captured) return undefined
      const result = applyShowCommand(captured.show, 'resize_clip', { clip_id: captured.retryResize.clipId, duration_ms: captured.retryResize.durationMs })
      const receipt = result.ok ? admission.applyShow(result.record, captured.request, captured.retryResize) : admission.complete(captured.request, 'refused')
      return { request: captured.request, receipt, retainedBytes: 2_097_152 + metadata.retainedBytes }
    },
    complete: (request, completion) => admission.complete(request, completion),
    cancel: request => admission.cancel(request),
    outcome: request => admission.readOutcome(request),
  }
}
