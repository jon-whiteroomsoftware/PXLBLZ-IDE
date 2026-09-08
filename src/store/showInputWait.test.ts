// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer'
import { createDefaultShow } from '@/engine/showModel'
import { setPersonalContentProvider, resetPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { showInitialState, useShowStore } from './showStore'

const state = () => useShowStore.getState()
const snapshot = () => structuredClone({ shows: state().shows, histories: state().showHistories, drafts: state().stockShowDrafts, failure: state().showSaveFailure })
const validate = () => true
let session: string
let request: ReturnType<ReturnType<typeof state>['beginShowEdit']>['request']
let candidate: ShowRecord
let writes: ReturnType<typeof vi.fn>
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  useShowStore.setState(showInitialState)
  const show = createDefaultShow('input-wait', 'Original')
  writes = vi.fn(async () => {})
  setPersonalContentProvider({ listShows: async () => [show], updateShow: writes, deleteShow: async () => {} } as unknown as PersonalContentProvider)
  await state().loadShows()
  session = state().beginShowEditSession(show.id)
  request = state().beginShowEdit(session, { operationId: 'op', payloadKey: 'rename', referenceContext: 'original', targets: [] }).request
  candidate = { ...state().resolveEditableShow(show.id)!, name: 'Agent' }
})
afterEach(() => { state().retireShowEditSession(session); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); resetPersonalContentProvider() })

it('waits for overlapping drag and dirty ownership, then adopts exactly once synchronously', async () => {
  const before = snapshot()
  const drag = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const dirty = state().acquireShowEditActivity(session, request.showId, 'dirty-field')!
  expect(state().deliverShowEditCandidate(request, candidate, validate)).toMatchObject({ status: 'waiting', deadline: 5000 })
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
  state().releaseShowEditActivity(drag)
  expect(state().readShowEditCandidate(session, 'op')?.status).toBe('waiting')
  vi.advanceTimersByTime(4999)
  state().releaseShowEditActivity(dirty)
  expect(state().readShowEditCandidate(session, 'op')?.status).toBe('applied')
  const adopted = snapshot()
  expect(adopted.shows[0]).toEqual({ ...before.shows[0], name: 'Agent', updatedAt: expect.any(Number) })
  expect(adopted.histories[request.showId]).toEqual({ past: before.shows, future: [] })
  state().releaseShowEditActivity(dirty)
  expect(state().deliverShowEditCandidate(request, candidate, validate).status).toBe('applied')
  expect(snapshot()).toEqual(adopted)
  await vi.advanceTimersByTimeAsync(1)
  expect(writes).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it.each([4999, 5000, 5001])('checks monotonic settlement at %i ms even if the timer is delayed', async (now) => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const before = snapshot()
  state().deliverShowEditCandidate(request, candidate, validate)
  vi.spyOn(performance, 'now').mockReturnValue(now)
  state().releaseShowEditActivity(token)
  const result = state().readShowEditCandidate(session, 'op')
  if (now < 5000) expect(result?.status).toBe('applied')
  else {
    expect(result).toMatchObject({ status: 'refused', reason: 'interaction-timeout' })
    expect(snapshot()).toEqual(before)
    expect(writes).not.toHaveBeenCalled()
  }
  expect(vi.getTimerCount()).toBe(0)
  vi.restoreAllMocks()
})

it('keeps the original deadline across duplicate delivery and new ownership, then never applies late', async () => {
  const first = state().acquireShowEditActivity(session, request.showId, 'drag')!
  state().deliverShowEditCandidate(request, candidate, validate)
  vi.advanceTimersByTime(4000)
  const second = state().acquireShowEditActivity(session, request.showId, 'dirty-field')!
  state().releaseShowEditActivity(first)
  expect(state().deliverShowEditCandidate(request, candidate, validate)).toMatchObject({ status: 'waiting', deadline: 5000 })
  const before = snapshot()
  vi.advanceTimersByTime(1000)
  expect(state().readShowEditCandidate(session, 'op')).toMatchObject({ status: 'refused', reason: 'interaction-timeout' })
  state().releaseShowEditActivity(second)
  expect(state().deliverShowEditCandidate(request, candidate, validate)).toMatchObject({ reason: 'interaction-timeout' })
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['commit', 'undo'] as const)('manual %s publishes before ownership release and refuses stale completed work', async (mode) => {
  const token = state().acquireShowEditActivity(session, request.showId, 'dirty-field')!
  state().deliverShowEditCandidate(request, candidate, validate)
  const saving = state().updateShow(request.showId, { ...state().resolveEditableShow(request.showId)!, name: 'Manual' })
  if (mode === 'undo') await state().undoShow(request.showId)
  const before = snapshot()
  state().releaseShowEditActivity(token)
  expect(state().readShowEditCandidate(session, 'op')).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  expect(snapshot()).toEqual(before)
  await saving
  expect(writes).toHaveBeenCalledTimes(mode === 'undo' ? 2 : 1)
})

it.each(['session', 'show', 'envelope', 'candidate'] as const)('wrong %s identity preserves the original wait', (mode) => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  state().deliverShowEditCandidate(request, candidate, validate)
  const wrong = { ...request, ...(mode === 'session' ? { sessionId: 'wrong' } : mode === 'show' ? { showId: 'wrong' } : mode === 'envelope' ? { payloadKey: 'wrong' } : {}) }
  const result = state().deliverShowEditCandidate(wrong, mode === 'candidate' ? { ...candidate, name: 'Changed' } : candidate, validate)
  expect(['refused', 'retired']).toContain(result.status)
  expect(state().readShowEditCandidate(session, 'op')?.status).toBe('waiting')
  state().releaseShowEditActivity(token)
  expect(state().resolveEditableShow(request.showId)?.name).toBe('Agent')
})

it.each(['cancel', 'retire', 'new-session', 'hydrate', 'remove', 'complete'] as const)('releases all pending resources on %s', async (mode) => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  state().deliverShowEditCandidate(request, candidate, validate)
  if (mode === 'cancel') state().cancelShowEdit(session, 'op')
  if (mode === 'retire') state().retireShowEditSession(session)
  if (mode === 'new-session') session = state().beginShowEditSession(request.showId)
  if (mode === 'hydrate') await state().loadShows()
  if (mode === 'remove') await state().removeShow(request.showId)
  if (mode === 'complete') expect(state().completeShowEdit(request, 'asked').status).toBe('completed')
  const before = snapshot()
  expect(vi.getTimerCount()).toBe(0)
  state().releaseShowEditActivity(token)
  vi.advanceTimersByTime(6000)
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
})

it('late or forged activity ownership cannot release a new session owner', () => {
  const old = state().acquireShowEditActivity(session, request.showId, 'drag')!
  session = state().beginShowEditSession(request.showId)
  request = state().beginShowEdit(session, { operationId: 'new', payloadKey: 'rename', referenceContext: 'original', targets: [] }).request
  const current = state().acquireShowEditActivity(session, request.showId, 'dirty-field')!
  state().deliverShowEditCandidate(request, candidate, validate)
  state().releaseShowEditActivity(old)
  state().releaseShowEditActivity({ ...current })
  expect(state().readShowEditCandidate(session, 'new')?.status).toBe('waiting')
  state().releaseShowEditActivity(current)
  expect(state().readShowEditCandidate(session, 'new')?.status).toBe('applied')
})

it('captures candidate and request before the caller mutates them', () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const mutable = structuredClone(request)
  state().deliverShowEditCandidate(mutable, candidate, validate)
  candidate.name = 'Mutation'
  Object.assign(mutable, { operationId: 'other', showId: 'other' })
  state().releaseShowEditActivity(token)
  expect(state().resolveEditableShow(request.showId)?.name).toBe('Agent')
  expect(state().readShowEditCandidate(session, 'op')?.status).toBe('applied')
})

it('bounds operation and activity retention without eviction or an untracked successful token', () => {
  session = state().beginShowEditSession(request.showId, 1)
  request = state().beginShowEdit(session, { operationId: 'one', payloadKey: 'rename', referenceContext: '', targets: [] }).request
  const tokens = Array.from({ length: 256 }, () => state().acquireShowEditActivity(session, request.showId, 'drag')!)
  expect(() => state().acquireShowEditActivity(session, request.showId, 'drag')).toThrow('capacity')
  expect(state().beginShowEdit(session, { operationId: 'two', payloadKey: '', referenceContext: '', targets: [] }).reason).toBe('capacity')
  expect(state().deliverShowEditCandidate(request, candidate, validate).status).toBe('waiting')
  tokens.forEach(token => state().releaseShowEditActivity(token))
  expect(state().readShowEditCandidate(session, 'one')?.status).toBe('applied')
  expect(state().beginShowEdit(session, { operationId: 'two', payloadKey: '', referenceContext: '', targets: [] }).reason).toBe('capacity')
})

it('hydration invalidates a candidate but preserves a still-active manual owner for new work', async () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'dirty-field')!
  state().deliverShowEditCandidate(request, candidate, validate)
  await state().loadShows()
  const next = state().beginShowEdit(session, { operationId: 'after-hydration', payloadKey: 'rename', referenceContext: '', targets: [] }).request
  expect(state().deliverShowEditCandidate(next, candidate, validate).status).toBe('waiting')
  expect(writes).not.toHaveBeenCalled()
  state().releaseShowEditActivity(token)
  expect(state().readShowEditCandidate(session, next.operationId)?.status).toBe('applied')
})

it('focus alone acquires no activity and the accepted provider record reopens as the complete Show', async () => {
  vi.stubGlobal('Blob', NodeBlob)
  const { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } = await import('@/engine/showFileBundle')
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  expect(document.activeElement).toBe(input)
  expect(state().deliverShowEditCandidate(request, candidate, validate).status).toBe('applied')
  await vi.advanceTimersByTimeAsync(0)
  expect(writes).toHaveBeenCalledTimes(1)
  const durable = { ...state().shows[0], ...writes.mock.calls[0][1] }
  const { bundle } = buildShowFileBundle(durable, { patterns: [], maps: [] }, { appVersion: 'B3' })
  const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle))
  expect(reopened.show).toEqual(state().resolveEditableShow(request.showId))
  input.remove()
})

it('already adopted delayed persistence settles normally after all activity and session teardown', async () => {
  let finish!: () => void
  writes.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  expect(state().deliverShowEditCandidate(request, candidate, validate).status).toBe('applied')
  await vi.advanceTimersByTimeAsync(0)
  const adopted = snapshot()
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  state().retireShowEditSession(session)
  state().releaseShowEditActivity(token)
  finish()
  await vi.advanceTimersByTimeAsync(0)
  expect(snapshot()).toEqual(adopted)
  expect(writes).toHaveBeenCalledTimes(1)
  expect(state().readShowEditCandidate(session, 'op')).toBeUndefined()
})

it('noncandidate completion never queues and cannot turn into a candidate', () => {
  state().acquireShowEditActivity(session, request.showId, 'drag')
  const before = snapshot()
  expect(state().completeShowEdit(request, 'asked').status).toBe('completed')
  expect(state().deliverShowEditCandidate(request, candidate, validate).status).toBe('completed')
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('refuses a known stale arrival immediately despite active input', async () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  await state().updateShow(request.showId, { ...state().shows[0], name: 'Manual' })
  const before = snapshot()
  expect(state().deliverShowEditCandidate(request, candidate, validate)).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  expect(vi.getTimerCount()).toBe(0)
  state().releaseShowEditActivity(token)
  expect(snapshot()).toEqual(before)
  expect(writes).toHaveBeenCalledTimes(1)
})

it('a wrong candidate Show id refuses without reserving the completed-candidate identity', () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  expect(state().deliverShowEditCandidate(request, { ...candidate, id: 'wrong' }, validate)).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  expect(vi.getTimerCount()).toBe(0)
  expect(state().deliverShowEditCandidate(request, candidate, validate).status).toBe('waiting')
  state().releaseShowEditActivity(token)
  expect(state().resolveEditableShow(request.showId)?.name).toBe('Agent')
})

it('stock reset releases a pending timer while preserving active draft ownership', async () => {
  const { STOCK_SHOWS } = await import('@/pixelblaze/stock/shows')
  const show = STOCK_SHOWS[0].show
  await state().updateShow(show.id, { ...show, name: 'Manual draft' })
  session = state().beginShowEditSession(show.id)
  request = state().beginShowEdit(session, { operationId: 'stock', payloadKey: 'rename', referenceContext: '', targets: [] }).request
  candidate = { ...state().resolveEditableShow(show.id)!, name: 'Agent draft' }
  const token = state().acquireShowEditActivity(session, show.id, 'dirty-field')!
  state().deliverShowEditCandidate(request, candidate, validate)
  state().resetStockShowDraft(show.id)
  const before = snapshot()
  expect(vi.getTimerCount()).toBe(0)
  state().releaseShowEditActivity(token)
  expect(state().readShowEditCandidate(session, 'stock')).toMatchObject({ reason: 'revision-conflict' })
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
})

it('final validation refusal and same-session cancellation discard the callback without writes', () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const validator = vi.fn(() => false)
  const before = snapshot()
  state().deliverShowEditCandidate(request, candidate, validator)
  expect(validator).not.toHaveBeenCalled()
  state().releaseShowEditActivity(token)
  expect(state().readShowEditCandidate(session, 'op')).toMatchObject({ reason: 'invalid-candidate' })
  expect(validator).toHaveBeenCalledTimes(1)
  expect(state().deliverShowEditCandidate(request, { ...candidate, name: 'Different' }, validate)).toMatchObject({ reason: 'identity-mismatch' })
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('early timer wakeups cannot expire before the monotonic deadline', () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  state().deliverShowEditCandidate(request, candidate, validate)
  vi.spyOn(performance, 'now').mockReturnValue(4999)
  vi.advanceTimersByTime(5000)
  expect(state().readShowEditCandidate(session, 'op')?.status).toBe('waiting')
  state().releaseShowEditActivity(token)
  expect(state().readShowEditCandidate(session, 'op')?.status).toBe('applied')
  expect(vi.getTimerCount()).toBe(0)
  vi.restoreAllMocks()
})

it.each([2000, 5000])('counts %i ms snapshot preparation against first-arrival deadline', (preparation) => {
  state().acquireShowEditActivity(session, request.showId, 'drag')
  const originalClone = globalThis.structuredClone
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
  vi.spyOn(globalThis, 'structuredClone').mockImplementation(value => {
    const result = originalClone(value)
    clock.mockReturnValue(preparation)
    return result
  })
  const result = state().deliverShowEditCandidate(request, candidate, validate)
  expect(result).toMatchObject(preparation < 5000 ? { status: 'waiting', deadline: 5000 } : { status: 'refused', reason: 'interaction-timeout' })
  expect(writes).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

it('does not adopt when final synchronous validation reaches the deadline', () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const before = snapshot()
  state().deliverShowEditCandidate(request, candidate, () => {
    vi.spyOn(performance, 'now').mockReturnValue(5000)
    return true
  })
  vi.advanceTimersByTime(4999)
  state().releaseShowEditActivity(token)
  expect(state().readShowEditCandidate(session, 'op')).toMatchObject({ status: 'refused', reason: 'interaction-timeout' })
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
})

it('does not impose a validation deadline on an immediate candidate that never waited for input', async () => {
  const before = snapshot()
  const result = state().deliverShowEditCandidate(request, candidate, () => {
    vi.spyOn(performance, 'now').mockReturnValue(6000)
    return true
  })
  expect(result.status).toBe('applied')
  expect(state().showHistories[request.showId]).toEqual({ past: before.shows, future: [] })
  expect(state().shows[0]).toEqual({ ...before.shows[0], name: 'Agent', updatedAt: expect.any(Number) })
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(0)
  expect(writes).toHaveBeenCalledTimes(1)
  expect(state().readShowEditCandidate(session, 'op')).toMatchObject({ status: 'applied', settlement: 'saved' })
})
