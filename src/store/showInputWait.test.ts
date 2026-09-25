// @vitest-environment jsdom
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

// V1-ONLY (#1042): v2 reload retires the pilot; deleted with deliverShowEditCandidate.
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

// V1-ONLY (#1042): v2 refuses an unserializable delivery terminally; deleted with deliverShowEditCandidate.
it('keeps an unserializable delivery ephemeral so a later legitimate first candidate can apply', async () => {
  const before = snapshot()
  const cyclic = { ...candidate, cycle: undefined as unknown }
  cyclic.cycle = cyclic
  const refused = state().deliverShowEditCandidate(request, cyclic, validate)
  expect(refused).toMatchObject({
    status: 'refused', reason: 'invalid-candidate',
    diagnostic: { stage: 'unexpected-admission-failure', issues: [{ code: 'admission-unavailable' }] },
  })
  expect(state().readShowEditCandidate(session, 'op')).toMatchObject({ status: 'pending' })
  expect(snapshot()).toEqual(before)
  expect(state().deliverShowEditCandidate(request, candidate, validate)).toMatchObject({ status: 'applied' })
  await vi.advanceTimersByTimeAsync(0)
  expect(writes).toHaveBeenCalledOnce()
})

// V1-ONLY (#1042): v2 delivery has no validateRaw; deleted with deliverShowEditCandidate.
it('fails closed when a raw validator returns an unsupported Promise-like result', () => {
  const before = snapshot()
  const result = state().deliverShowEditCandidate(request, candidate, validate, (() => Promise.resolve(true)) as never)
  expect(result).toMatchObject({
    status: 'refused', reason: 'invalid-candidate',
    diagnostic: { stage: 'unexpected-admission-failure', issues: [{ code: 'admission-unavailable' }] },
  })
  expect(state().readShowEditCandidate(session, 'op')).toBe(result)
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
})
