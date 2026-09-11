import { z } from 'zod'
import { createDeliveryJournal, type AgentDelivery, type DeliveryScope } from './agentDeliveryJournal'
import type { ShowRecord } from './personalContentRecords'
import type { ShowEditCompletion, ShowEditRequest } from './showEditAdmission'
import { applyShowCommand, type ShowCommandChange, type ShowCommandContext } from './showCommands/registry'

export interface PrivateEditOwner {
  capture(operationId: string, intent: string, remainingBytes: number): { request: ShowEditRequest; show: ShowRecord; context: unknown; commandContext: ShowCommandContext; retainedBytes: number } | undefined
  apply(show: ShowRecord, request: ShowEditRequest): unknown
  complete(request: ShowEditRequest, completion: ShowEditCompletion): unknown
  cancel(request: ShowEditRequest): unknown
  outcome(request: ShowEditRequest): unknown
}
export interface PrivateEditResult { code: string; [key: string]: unknown }
const payloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('begin_edit'), intent: z.string().max(240).refine(text => !/[\r\n]/.test(text)).optional() }).strict(),
  z.object({ kind: z.literal('command'), name: z.string().max(128), arguments: z.record(z.unknown()) }).strict(),
  z.object({ kind: z.literal('commit_edit') }).strict(),
  z.object({ kind: z.literal('cancel_edit') }).strict(),
  z.object({ kind: z.literal('complete_edit'), completion: z.enum(['asked', 'refused', 'nothing-applied', 'commit-refused', 'incomplete', 'service-refused', 'service-failed']) }).strict(),
])
interface Operation {
  request: ShowEditRequest
  private?: { show: ShowRecord; commandContext: ShowCommandContext; changes: ShowCommandChange[] }
}

/** One browser-owned private candidate; the injected owner is existing admission. */
export function createAgentPrivateExecutor(scope: DeliveryScope, owner: PrivateEditOwner) {
  const journal = createDeliveryJournal(scope)
  const operations = new Map<string, Operation>()
  let active: string | undefined
  let retired = false
  let retainedCaptureBytes = 0
  let captureCapacityReached = false
  const outcome = (receipt: unknown): PrivateEditResult => receipt === undefined ? { code: 'unknown' } : { code: 'outcome', receipt }
  const finish = (operationId: string, operation: Operation) => {
    delete operation.private
    if (active === operationId) active = undefined
  }
  const execute = (delivery: AgentDelivery): PrivateEditResult => {
    const parsed = payloadSchema.safeParse(delivery.payload)
    if (!parsed.success) return { code: 'invalid_payload' }
    const payload = parsed.data
    let operation = operations.get(delivery.operationId)
    if (payload.kind === 'begin_edit') {
      if (operation) return { code: 'finished' }
      if (active !== undefined) return { code: 'busy' }
      if (captureCapacityReached) return { code: 'capacity' }
      const captured = owner.capture(`${scope.bindingId}:${delivery.operationId}`, payload.intent ?? '', 16_777_216 - retainedCaptureBytes)
      if (!captured) return { code: 'unavailable' }
      operation = { request: captured.request }
      operations.set(delivery.operationId, operation)
      const viewBytes = new TextEncoder().encode(JSON.stringify({ show: captured.show, context: captured.context })).byteLength
      retainedCaptureBytes += Math.max(viewBytes, captured.retainedBytes)
      if (!Number.isSafeInteger(captured.retainedBytes) || captured.retainedBytes < 0 || viewBytes > 1_048_576 || retainedCaptureBytes > 16_777_216) {
        captureCapacityReached = true
        owner.complete(captured.request, 'service-refused')
        return { code: 'result_too_large' }
      }
      operation.private = { show: captured.show, commandContext: captured.commandContext, changes: [] }
      active = delivery.operationId
      return { code: 'begun', operationId: delivery.operationId, baseRevision: captured.request.baseRevision, show: structuredClone(captured.show), context: structuredClone(captured.context) }
    }
    if (!operation) return { code: 'unknown' }
    if (!operation.private) return { code: 'finished' }
    if (payload.kind === 'command') {
      const result = applyShowCommand(operation.private.show, payload.name, payload.arguments, operation.private.commandContext)
      if (!result.ok) {
        finish(delivery.operationId, operation)
        owner.complete(operation.request, 'refused')
        return { code: 'refused', issues: result.issues }
      }
      if (new TextEncoder().encode(JSON.stringify({ show: result.record, changes: [...operation.private.changes, ...result.changes] })).byteLength > 1_048_576) {
        finish(delivery.operationId, operation)
        owner.complete(operation.request, 'service-refused')
        return { code: 'result_too_large' }
      }
      operation.private.show = result.record
      operation.private.changes.push(...result.changes)
      return { code: result.changes.length ? 'changed' : 'noop', changes: structuredClone(result.changes) }
    }
    const candidate = operation.private
    finish(delivery.operationId, operation)
    if (payload.kind === 'cancel_edit') return outcome(owner.cancel(operation.request))
    if (payload.kind === 'complete_edit') return outcome(owner.complete(operation.request, payload.completion))
    return { ...outcome(owner.apply(candidate.show, operation.request)), changes: structuredClone(candidate.changes) }
  }
  return {
    deliver(delivery: AgentDelivery): PrivateEditResult {
      const admission = journal.admit(delivery)
      if (admission.code === 'known') return admission.result as PrivateEditResult
      if (admission.code !== 'accepted') return admission
      let result: PrivateEditResult
      try { result = execute(delivery) } catch {
        const operation = operations.get(delivery.operationId)
        if (operation) { finish(delivery.operationId, operation); owner.cancel(operation.request) }
        result = { code: 'unavailable' }
      }
      return journal.complete(delivery.operationId, delivery.deliveryId, result) ? result : { code: 'result_unavailable' }
    },
    getOutcome(operationId: string): PrivateEditResult {
      if (retired) return { code: 'retired' }
      const operation = operations.get(operationId)
      return operation ? outcome(owner.outcome(operation.request)) : { code: 'unknown' }
    },
    forgetResults: journal.forgetResults,
    retire() {
      if (retired) return
      retired = true
      journal.retire()
      for (const operation of operations.values()) owner.cancel(operation.request)
      operations.clear()
      active = undefined
    },
  }
}
