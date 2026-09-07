import { createShowEditSession } from './showEditAdmission'

it('registers immutable identity and refuses an intervening revision without forgetting the result', () => {
  const session = createShowEditSession('session', 'show')
  const input = { operationId: 'op', payloadKey: 'rename', referenceContext: 'captured', targets: ['clip'] }
  const pending = session.begin(input, 4)
  expect(pending.status).toBe('pending')
  input.targets.push('other')
  expect(session.read('op')).toEqual(pending)
  const result = session.check(pending.request!, { sessionId: 'session', showId: 'show', revision: 5 })
  expect(result.status).toBe('refused')
  expect(result.reason).toBe('revision-conflict')
  expect(session.check(pending.request!, { sessionId: 'session', showId: 'show', revision: 4 })).toEqual(result)
})

const input = (operationId = 'op') => ({ operationId, payloadKey: 'edit', referenceContext: 'original', targets: ['clip'] })
const current = { sessionId: 's', showId: 'show', revision: 1 }

it('deduplicates pending and settled deliveries and refuses altered envelopes without poisoning the original', () => {
  const session = createShowEditSession('s', 'show')
  const original = session.begin(input(), 1)
  expect(session.begin(input(), 9)).toBe(original)
  for (const patch of [{ payloadKey: 'other' }, { targets: ['other'] }, { referenceContext: 'changed' }, { baseRevision: 0 }]) {
    expect(session.check({ ...original.request, ...patch }, current)).toMatchObject({ status: 'refused', reason: 'identity-mismatch' })
    expect(session.read('op')).toBe(original)
  }
  const adopted = session.adopted('op', 'saving')
  expect(session.check(original.request, { ...current, revision: 2 })).toBe(adopted)
  session.settle('op', 'saved')
  expect(session.check(original.request, current)).toMatchObject({ status: 'applied', settlement: 'saved' })
})

it('cancellation wins only before adoption and retirement loses lookup without reviving old ids', () => {
  const session = createShowEditSession('s', 'show')
  const original = session.begin(input(), 1)
  session.cancel('op')
  expect(session.check(original.request, current).status).toBe('cancelled')
  const other = session.begin(input('other'), 1)
  session.adopted('other', 'draft')
  expect(session.cancel('other')).toMatchObject({ status: 'applied', settlement: 'draft' })
  session.retire()
  expect(session.read('op')).toBeUndefined()
  expect(session.check(other.request, current).status).toBe('retired')
  expect(session.begin(input('new'), 1).status).toBe('retired')
})

it('refuses new work at capacity while retaining cancelled, refused and applied deduplication knowledge', () => {
  const session = createShowEditSession('s', 'show', 3)
  const first = session.begin(input('one'), 1)
  session.cancel('one')
  session.begin(input('two'), 1)
  session.refuse('two', 'invalid-candidate')
  session.begin(input('three'), 1)
  session.adopted('three', 'draft')
  expect(session.begin(input('four'), 1)).toMatchObject({ status: 'refused', reason: 'capacity' })
  expect(session.check(first.request, current).status).toBe('cancelled')
  expect(session.begin(input('three'), 9)).toMatchObject({ status: 'applied', settlement: 'draft' })
})

it('refuses wrong sessions, Shows and unknown ids without registering them', () => {
  const session = createShowEditSession('s', 'show')
  const original = session.begin(input(), 1)
  expect(session.check({ ...original.request, sessionId: 'old' }, current).reason).toBe('wrong-session')
  expect(session.check({ ...original.request, showId: 'other' }, current).reason).toBe('wrong-show')
  expect(session.check({ ...original.request, operationId: 'unknown' }, current).reason).toBe('unknown-operation')
  expect(session.read('unknown')).toBeUndefined()
  expect(session.read('op')).toBe(original)
})

it('explicit retry after rollback uses a fresh revision and original immutable targets and intent', () => {
  const session = createShowEditSession('s', 'show')
  session.begin(input(), 1)
  session.adopted('op', 'saving')
  session.settle('op', 'rolled-back')
  const retry = session.begin({ ...input('retry'), retryOf: 'op' }, 3)
  expect(retry).toMatchObject({ status: 'pending', request: { baseRevision: 3, targets: ['clip'], retryOf: 'op' } })
  expect(session.begin({ ...input('bad'), retryOf: 'op', targets: ['replacement'] }, 3).reason).toBe('invalid-retry')
  expect(session.begin({ ...input('changed'), retryOf: 'op', payloadKey: 'different' }, 3).reason).toBe('invalid-retry')
})
