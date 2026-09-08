/** Session-only deduplication. Full tables refuse new work; ids are never evicted. */
export const DEFAULT_SHOW_EDIT_OPERATION_CAPACITY = 256

export interface ShowEditIntent {
  readonly operationId: string
  /** Exact, deterministic identity of the request payload; supplied by its trusted adapter. */
  readonly payloadKey: string
  readonly referenceContext: string
  readonly targets: readonly string[]
  readonly retryOf?: string
}

export interface ShowEditRequest extends ShowEditIntent {
  readonly sessionId: string
  readonly showId: string
  readonly baseRevision: number
}

export type ShowEditSettlement = 'saving' | 'saved' | 'rolled-back' | 'superseded' | 'draft'
export type ShowEditRefusal = 'revision-conflict' | 'wrong-session' | 'wrong-show' | 'unknown-operation'
  | 'identity-mismatch' | 'capacity' | 'invalid-retry' | 'missing-show' | 'invalid-candidate' | 'no-candidate'

export type ShowEditCompletion = 'asked' | 'refused' | 'nothing-applied' | 'commit-refused' | 'incomplete' | 'service-refused' | 'service-failed'

export type ShowEditReceipt = { readonly request: ShowEditRequest } & (
  | { readonly status: 'pending' | 'cancelled' | 'retired' | 'noop'; readonly reason?: never; readonly settlement?: never }
  | { readonly status: 'completed'; readonly completion: ShowEditCompletion; readonly reason?: never; readonly settlement?: never }
  | { readonly status: 'refused'; readonly reason: ShowEditRefusal; readonly settlement?: never }
  | { readonly status: 'applied'; readonly settlement: ShowEditSettlement; readonly reason?: never }
)

export interface ShowEditEligibility {
  sessionId: string
  showId: string
  revision: number
}

function sameIntent(a: ShowEditIntent, b: ShowEditIntent): boolean {
  return a.operationId === b.operationId && a.payloadKey === b.payloadKey
    && a.referenceContext === b.referenceContext && a.retryOf === b.retryOf
    && a.targets.length === b.targets.length && a.targets.every((id, index) => id === b.targets[index])
}

/** Pure policy owner. The store supplies authoritative revisions and owns synchronous adoption. */
export function createShowEditSession(
  sessionId: string,
  showId: string,
  capacity = DEFAULT_SHOW_EDIT_OPERATION_CAPACITY,
) {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('Invalid operation capacity')
  const entries = new Map<string, ShowEditReceipt>()
  let retired = false
  const receipt = (request: ShowEditRequest, status: Exclude<ShowEditReceipt['status'], 'applied' | 'completed'>, reason?: ShowEditRefusal): ShowEditReceipt =>
    status === 'refused'
      ? Object.freeze({ request, status, reason: reason! })
      : Object.freeze({ request, status })
  const remember = (value: ShowEditReceipt): ShowEditReceipt => {
    entries.set(value.request.operationId, value)
    return value
  }
  const read = (id: string) => entries.get(id)
  return {
    sessionId,
    showId,
    read,
    begin(input: ShowEditIntent, revision: number): ShowEditReceipt {
      const request = Object.freeze({ ...input, targets: Object.freeze([...input.targets]), sessionId, showId, baseRevision: revision })
      if (retired) return receipt(request, 'retired')
      const existing = read(input.operationId)
      if (existing) return sameIntent(existing.request, input) ? existing : receipt(request, 'refused', 'identity-mismatch')
      if (entries.size >= capacity) return receipt(request, 'refused', 'capacity')
      if (input.retryOf !== undefined) {
        const original = read(input.retryOf)
        if (!original || !(original.status === 'refused' || original.status === 'cancelled' || original.settlement === 'rolled-back')
          || original.request.payloadKey !== input.payloadKey
          || original.request.referenceContext !== input.referenceContext
          || original.request.targets.length !== input.targets.length
          || original.request.targets.some((id, i) => id !== input.targets[i])) {
          return remember(receipt(request, 'refused', 'invalid-retry'))
        }
      }
      return remember(receipt(request, 'pending'))
    },
    check(request: ShowEditRequest, current: ShowEditEligibility): ShowEditReceipt {
      if (retired) return receipt(request, 'retired')
      if (request.sessionId !== sessionId || current.sessionId !== sessionId) return receipt(request, 'refused', 'wrong-session')
      if (request.showId !== showId || current.showId !== showId) return receipt(request, 'refused', 'wrong-show')
      const existing = read(request.operationId)
      if (!existing) return receipt(request, 'refused', 'unknown-operation')
      if (!sameIntent(existing.request, request) || existing.request.baseRevision !== request.baseRevision) {
        return receipt(request, 'refused', 'identity-mismatch')
      }
      if (existing.status !== 'pending') return existing
      if (request.baseRevision !== current.revision) return remember(receipt(existing.request, 'refused', 'revision-conflict'))
      return existing
    },
    refuse(id: string, reason: ShowEditRefusal): ShowEditReceipt | undefined {
      const existing = read(id)
      return existing?.status === 'pending' ? remember(receipt(existing.request, 'refused', reason)) : existing
    },
    complete(id: string, completion: ShowEditCompletion): ShowEditReceipt | undefined {
      const existing = read(id)
      return existing?.status === 'pending' ? remember(Object.freeze({ request: existing.request, status: 'completed', completion })) : existing
    },
    cancel(id: string): ShowEditReceipt | undefined {
      const existing = read(id)
      return existing?.status === 'pending' ? remember(receipt(existing.request, 'cancelled')) : existing
    },
    noop(id: string): ShowEditReceipt {
      const existing = read(id)
      if (retired || existing?.status !== 'pending') throw new Error('Operation is not eligible for no-op completion')
      return remember(receipt(existing.request, 'noop'))
    },
    adopted(id: string, settlement: 'saving' | 'draft'): ShowEditReceipt {
      const existing = read(id)
      if (retired || existing?.status !== 'pending') throw new Error('Operation is not eligible for adoption')
      return remember(Object.freeze({ request: existing.request, status: 'applied', settlement }))
    },
    settle(id: string, settlement: Exclude<ShowEditSettlement, 'saving' | 'draft'>): void {
      const existing = read(id)
      if (existing?.status === 'applied' && existing.settlement === 'saving') {
        remember(Object.freeze({ ...existing, settlement }))
      }
    },
    retire(): void {
      retired = true
      entries.clear()
    },
  }
}

export type ShowEditSession = ReturnType<typeof createShowEditSession>
