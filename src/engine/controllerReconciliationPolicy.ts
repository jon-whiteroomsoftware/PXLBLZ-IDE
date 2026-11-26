import { sameControllerDeviceId } from './controllerIdentity'
import { ControllerActivationTimeoutError, ControllerRequestTimeoutError } from './PixelblazeConnection'

export const RECONCILIATION_RETRY_MS = 10_000

export interface ReconciliationTarget {
  ip: string
  deviceId?: string | null
}

export interface ScheduledReconciliationRetry {
  target: ReconciliationTarget
  stage: 'scheduled'
  at: number
}

export type ReconciliationStall = ScheduledReconciliationRetry | {
  target: ReconciliationTarget
  stage: 'retrying' | 'manual'
}

export type ReconciliationRequest =
  | { kind: 'background'; stalledTarget?: ReconciliationTarget; profileChanged?: boolean }
  | { kind: 'automatic'; scheduled: ScheduledReconciliationRetry }
  | { kind: 'manual' }

/** Learning a device ID on an existing address does not replace the Controller. */
export function sameReconciliationTarget(left: ReconciliationTarget, right: ReconciliationTarget): boolean {
  return left.deviceId && right.deviceId
    ? sameControllerDeviceId(left.deviceId, right.deviceId)
    : left.ip === right.ip
}

export function stallAfterReconciliation(
  target: ReconciliationTarget,
  automatic: boolean,
  outcome: 'timeout' | 'interrupted' | 'finished',
  now: number,
): ReconciliationStall | undefined {
  if (outcome === 'finished') return
  if (automatic) return { target, stage: 'manual' }
  if (outcome === 'timeout') {
    return { target, stage: 'scheduled', at: now + RECONCILIATION_RETRY_MS }
  }
}

export function isReconciliationTimeout(error: unknown): boolean {
  const visited = new Set<Error>()
  let cause = error
  while (cause instanceof Error && !visited.has(cause)) {
    if (cause instanceof ControllerRequestTimeoutError || cause instanceof ControllerActivationTimeoutError) {
      return true
    }
    visited.add(cause)
    cause = cause.cause
  }
  return false
}
