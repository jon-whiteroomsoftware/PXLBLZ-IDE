export interface DeliveryScope { bindingId: string; sessionId: string }
export interface AgentDelivery extends DeliveryScope {
  operationId: string
  deliveryId: string
  sequence: number
  payload: unknown
}
export type DeliveryAdmission =
  | { code: 'known'; result: unknown }
  | { code: 'accepted' | 'pending' | 'unknown' | 'identity_conflict' | 'out_of_order' | 'busy' | 'capacity' | 'retired' | 'invalid_payload' }
interface Entry { identity: string; sequence: number; pending: boolean; result?: { value: unknown; bytes: number } }

/** Session-local identity owner. Dropping result bytes never drops a tombstone. */
export function createDeliveryJournal(scope: DeliveryScope, limits: { operations: number; deliveries: number; identityBytes?: number; resultBytes?: number } = { operations: 256, deliveries: 256 }) {
  const { bindingId, sessionId } = scope
  let identityBytes = 0
  let resultBytes = 0
  const cached = new Set<Entry>()
  const operations = new Map<string, Map<string, Entry>>()
  let retired = false
  return {
    admit(delivery: AgentDelivery, cancelAfterSentDeliveryId?: string): DeliveryAdmission {
      if (retired || delivery.bindingId !== bindingId || delivery.sessionId !== sessionId) return { code: 'retired' }
      if (![delivery.operationId, delivery.deliveryId].every(id => /^[A-Za-z0-9_-]{1,128}$/.test(id))) return { code: 'invalid_payload' }
      let identity: string
      try { identity = canonicalJson(delivery.payload) } catch { return { code: 'invalid_payload' } }
      const bytes = new TextEncoder().encode(identity).byteLength
      if (bytes > 65_536) return { code: 'invalid_payload' }
      const operation = operations.get(delivery.operationId)
      const prior = operation?.get(delivery.deliveryId)
      if (prior) {
        if (prior.identity !== identity || prior.sequence !== delivery.sequence) return { code: 'identity_conflict' }
        if (prior.pending) return { code: 'pending' }
        return prior.result ? { code: 'known', result: structuredClone(prior.result.value) } : { code: 'unknown' }
      }
      if (identityBytes + bytes > (limits.identityBytes ?? 4_194_304)) return { code: 'capacity' }
      if ((!operation && operations.size >= limits.operations) || (operation && operation.size >= limits.deliveries)) return { code: 'capacity' }
      if (!Number.isSafeInteger(delivery.sequence) || delivery.sequence !== (operation?.size ?? 0)) return { code: 'out_of_order' }
      const pending = operation ? [...operation.entries()].filter(([, entry]) => entry.pending) : []
      // Only the server relay can attest a prior delivery was sent. The browser
      // uses ordinary serial admission and can still refuse a missing sequence.
      const terminalCancel = pending.length === 1 && cancelAfterSentDeliveryId === pending[0][0]
        && identity === '{"kind":"cancel_edit"}' && pending[0][1].identity !== identity
      if (pending.length && !terminalCancel) return { code: 'busy' }
      const entries = operation ?? new Map<string, Entry>()
      identityBytes += bytes
      entries.set(delivery.deliveryId, { identity, sequence: delivery.sequence, pending: true })
      operations.set(delivery.operationId, entries)
      return { code: 'accepted' }
    },
    complete(operationId: string, deliveryId: string, result: unknown): boolean {
      const entry = operations.get(operationId)?.get(deliveryId)
      if (retired || !entry?.pending) return false
      entry.pending = false
      let bytes: number
      try { bytes = new TextEncoder().encode(canonicalJson(result)).byteLength } catch { return false }
      const cap = limits.resultBytes ?? 4_194_304
      if (bytes > 1_048_576 || bytes > cap) return false
      for (const old of cached) {
        if (resultBytes + bytes <= cap) break
        resultBytes -= old.result?.bytes ?? 0
        delete old.result
        cached.delete(old)
      }
      entry.result = { value: structuredClone(result), bytes }
      cached.add(entry)
      resultBytes += bytes
      return true
    },
    forgetResults() {
      for (const entry of cached) delete entry.result
      cached.clear()
      resultBytes = 0
    },
    retire() { retired = true; operations.clear(); cached.clear(); resultBytes = 0 },
  }
}

/** JSON identity with stable object-key order; no coercion of invalid values. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  throw new Error('Payload must be JSON')
}
