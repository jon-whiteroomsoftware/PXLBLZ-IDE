import { describe, expect, it } from 'vitest'
import { createDeliveryJournal } from './agentDeliveryJournal'

describe('binding-scoped delivery journal', () => {
  const scope = { bindingId: 'binding', sessionId: 'session' }
  const delivery = (sequence = 0, payload: unknown = { kind: 'begin_edit', intent: 'resize' }) => ({ ...scope, operationId: 'op', deliveryId: `d${sequence}`, sequence, payload })

  it('normalizes object keys and never admits the same delivery twice', () => {
    const journal = createDeliveryJournal(scope)
    expect(journal.admit(delivery())).toEqual({ code: 'accepted' })
    expect(journal.admit(delivery(0, { intent: 'resize', kind: 'begin_edit' }))).toEqual({ code: 'pending' })
    journal.complete('op', 'd0', { ok: true })
    expect(journal.admit(delivery())).toEqual({ code: 'known', result: { ok: true } })
    expect(journal.admit(delivery(0, { kind: 'begin_edit', intent: 'other' }))).toEqual({ code: 'identity_conflict' })
  })

  it('refuses gaps, concurrent execution, and reused sequence under another ID', () => {
    const journal = createDeliveryJournal(scope)
    expect(journal.admit(delivery(1))).toEqual({ code: 'out_of_order' })
    expect(journal.admit(delivery())).toEqual({ code: 'accepted' })
    expect(journal.admit(delivery(1))).toEqual({ code: 'busy' })
    journal.complete('op', 'd0', null)
    expect(journal.admit({ ...delivery(), deliveryId: 'different' })).toEqual({ code: 'out_of_order' })
    expect(journal.admit(delivery(1))).toEqual({ code: 'accepted' })
  })

  it('keeps tombstones after result expiry and refuses capacity instead of evicting', () => {
    const journal = createDeliveryJournal(scope, { operations: 1, deliveries: 1 })
    journal.admit(delivery())
    journal.complete('op', 'd0', 'saved')
    journal.forgetResults()
    expect(journal.admit(delivery())).toEqual({ code: 'unknown' })
    expect(journal.admit(delivery(1))).toEqual({ code: 'capacity' })
    expect(journal.admit({ ...delivery(), operationId: 'another' })).toEqual({ code: 'capacity' })
    expect(journal.admit(delivery())).toEqual({ code: 'unknown' })
  })

  it('bounds total retained identity bytes without making forgotten results replayable', () => {
    const journal = createDeliveryJournal(scope, { operations: 256, deliveries: 256, identityBytes: 4 })
    expect(journal.admit(delivery(0, null))).toEqual({ code: 'accepted' })
    journal.complete('op', 'd0', null)
    journal.forgetResults()
    expect(journal.admit(delivery(1, null))).toEqual({ code: 'capacity' })
    expect(journal.admit(delivery(0, null))).toEqual({ code: 'unknown' })
  })

  it('bounds cached result bytes separately and retains identities after eviction or oversize', () => {
    const journal = createDeliveryJournal(scope, { operations: 256, deliveries: 256, resultBytes: 4 })
    journal.admit(delivery())
    expect(journal.complete('op', 'd0', null)).toBe(true)
    journal.admit(delivery(1))
    expect(journal.complete('op', 'd1', null)).toBe(true)
    expect(journal.admit(delivery())).toEqual({ code: 'unknown' })
    expect(journal.admit(delivery(1))).toEqual({ code: 'known', result: null })
    journal.admit(delivery(2))
    expect(journal.complete('op', 'd2', 'too large')).toBe(false)
    expect(journal.admit(delivery(2))).toEqual({ code: 'unknown' })
  })

  it('retirement rejects old scope and late completion cannot resurrect work', () => {
    const journal = createDeliveryJournal(scope)
    expect(journal.admit({ ...delivery(), bindingId: 'old' })).toEqual({ code: 'retired' })
    journal.admit(delivery())
    journal.retire()
    expect(journal.complete('op', 'd0', 'late')).toBe(false)
    expect(journal.admit(delivery())).toEqual({ code: 'retired' })
  })

  it('copies result boundaries and rejects non-JSON identities', () => {
    const journal = createDeliveryJournal(scope)
    expect(journal.admit(delivery(0, { value: Number.NaN }))).toEqual({ code: 'invalid_payload' })
    journal.admit(delivery())
    const result = { value: 1 }
    journal.complete('op', 'd0', result)
    result.value = 2
    const known = journal.admit(delivery())
    expect(known).toEqual({ code: 'known', result: { value: 1 } })
  })
})
