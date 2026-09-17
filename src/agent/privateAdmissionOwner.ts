import { applyShowCommand } from '@/engine/showCommands/registry'
import { isShowRecordV2 } from '@/engine/showDocument'
import type { PrivateEditOwner } from '@/engine/agentPrivateExecutor'
import type { createAgentEditorAdmission } from './editorAdmission'

/**
 * The shared local admission remains the only validation, adoption and save
 * owner, for both record versions (#1039).
 *
 * The owner itself is version-independent: it captures whatever record the
 * editor holds, hands it to the executor, and gives the candidate back to the
 * same admission. Only the stable diagnostic resize retry is v1's, because it
 * qualifies one exact `resize_clip` recomputation; a v2 editor's admission
 * offers no retry capture, so `beginRetry` refuses and the executor answers
 * `not_qualified` rather than approximating the intent with another command.
 */
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
      const captured = admission.beginRequest(operationId, intent, [], Math.min(1_048_000, remainingBytes - metadata.retainedBytes))
      if (!captured) return undefined
      return { ...captured, ...metadata, retainedBytes: new TextEncoder().encode(JSON.stringify(captured)).byteLength + metadata.retainedBytes }
    },
    apply: (show, request, resize) => admission.applyShow(show, request, resize),
    retry(request, operationId, remainingBytes) {
      const metadata = admission.captureCommandContext()
      if (!metadata || remainingBytes <= metadata.retainedBytes) return undefined
      const captured = admission.beginRetry(operationId, request, Math.min(1_048_000, remainingBytes - metadata.retainedBytes))
      if (!captured || isShowRecordV2(captured.show)) return undefined
      const result = applyShowCommand(captured.show, 'resize_clip', { clip_id: captured.retryResize.clipId, duration_ms: captured.retryResize.durationMs })
      const receipt = result.ok ? admission.applyShow(result.record, captured.request, captured.retryResize) : admission.complete(captured.request, 'refused')
      return { request: captured.request, receipt, retainedBytes: new TextEncoder().encode(JSON.stringify(captured)).byteLength + metadata.retainedBytes }
    },
    complete: (request, completion) => admission.complete(request, completion),
    cancel: request => admission.cancel(request),
    outcome: request => admission.readOutcome(request),
  }
}
