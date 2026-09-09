// @vitest-environment jsdom
import { resizeBoundaryShow } from '@/agent-harness/baseline/fixtures'
import { applyShowCommand } from '@/engine/showCommands/registry'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { createAgentEditorAdmission } from './agentEditorAdmission'

const state = () => useShowStore.getState()
const intent = { clipId: 'resize-a', durationMs: 6000 }
let close = () => {}
afterEach(() => { close(); resetPersonalContentProvider() })
it('retains the exact binding through ordinary save rollback and retries without replaying the failed record', async () => {
  window.history.replaceState(null, '', '/studio/shows/retry?agent=1')
  useShowStore.setState(showInitialState)
  const show = resizeBoundaryShow()
  const writes = vi.fn(async () => {}).mockRejectedValueOnce(new Error('synthetic save failure'))
  setPersonalContentProvider({ listShows: async () => [show], updateShow: writes } as unknown as PersonalContentProvider)
  await state().loadShows()
  const api = createAgentEditorAdmission(show.id, () => ({}))
  close = api.close
  const first = api.beginRequest('first', 'resize first', [])!
  const candidate = applyShowCommand(first.show, 'resize_clip', { clip_id: 'resize-a', duration_ms: 6000 })
  if (!candidate.ok) throw new Error('fixture')
  api.applyShow(candidate.record, first.request, intent)
  expect(api.retryIntent(first.request)).toBeUndefined()
  await vi.waitFor(() => expect(api.readOutcome(first.request)).toMatchObject({ settlement: 'rolled-back' }))
  expect(api.retryIntent(first.request)).toEqual(intent)
  const retry = api.beginRetry('second', first.request)!
  expect(retry.show).toEqual(first.show)
  expect(api.applyShow(candidate.record, retry.request, intent)).toMatchObject({ status: 'applied' })
  await vi.waitFor(() => expect(api.readOutcome(retry.request)).toMatchObject({ settlement: 'saved' }))
  expect(writes).toHaveBeenCalledTimes(2)
  expect(state().showHistories[show.id].past).toHaveLength(1)
  expect(api.retryIntent(retry.request)).toBeUndefined()
})
it('retains broad identity while retrying the original Clip against fresh state', async () => {
  window.history.replaceState(null, '', '/studio/shows/retry?agent=1')
  useShowStore.setState(showInitialState)
  const show = resizeBoundaryShow()
  const writes = vi.fn(async () => {})
  setPersonalContentProvider({ listShows: async () => [show], updateShow: writes } as unknown as PersonalContentProvider)
  await state().loadShows()
  let focus = { selection: { kind: 'clip', clipId: 'resize-a' }, playheadMs: 0 }
  const api = createAgentEditorAdmission(show.id, () => focus)
  close = api.close
  const original = api.beginRequest('original', 'resize the first Clip', [])!
  const candidate = applyShowCommand(original.show, 'resize_clip', { clip_id: intent.clipId, duration_ms: intent.durationMs })
  if (!candidate.ok) throw new Error('invalid fixture')
  await state().updateShow(show.id, { ...state().shows[0], name: 'Manual work' })
  expect(api.applyShow(candidate.record, original.request, intent)).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  focus = { selection: { kind: 'clip', clipId: 'resize-b' }, playheadMs: 9000 }
  const retry = api.beginRetry('retry', original.request)!
  expect(retry.request).toEqual({ ...original.request, operationId: 'retry', retryOf: 'original', baseRevision: retry.request.baseRevision })
  expect(retry.request.baseRevision).toBeGreaterThan(original.request.baseRevision)
  expect(retry.show.name).toBe('Manual work')
  expect(retry.retryResize).toEqual(intent)
  const fresh = applyShowCommand(retry.show, 'resize_clip', { clip_id: intent.clipId, duration_ms: intent.durationMs })
  if (!fresh.ok) throw new Error('invalid retry fixture')
  expect(api.applyShow(fresh.record, retry.request, intent)).toMatchObject({ status: 'applied' })
  await vi.waitFor(() => expect(api.readOutcome(retry.request)).toMatchObject({ settlement: 'saved' }))
  expect(writes).toHaveBeenCalledTimes(2)
  expect(state().showHistories[show.id].past).toHaveLength(2)
  await state().undoShow(show.id)
  expect(state().shows[0]).toEqual({ ...retry.show, updatedAt: state().shows[0].updatedAt })
})

it.each(['malformed', 'changed-binding', 'stale-candidate', 'foreign-envelope', 'reordered-fields', 'retry-of-retry', 'retirement'] as const)('preserves identity and complete records for %s', async action => {
  window.history.replaceState(null, '', '/studio/shows/retry?agent=1')
  useShowStore.setState(showInitialState)
  const show = resizeBoundaryShow()
  const writes = vi.fn(async () => {})
  setPersonalContentProvider({ listShows: async () => [show], updateShow: writes } as unknown as PersonalContentProvider)
  await state().loadShows()
  const api = createAgentEditorAdmission(show.id, () => ({ selection: { kind: 'clip', clipId: 'resize-a' } }))
  close = api.close
  const first = api.beginRequest('first', 'first Clip six seconds', [{ role: 'user', text: 'before' }])!
  const edited = applyShowCommand(first.show, 'resize_clip', { clip_id: 'resize-a', duration_ms: 6000 })
  if (!edited.ok) throw new Error('fixture')
  expect(api.retryIntent(first.request)).toBeUndefined()
  await state().updateShow(show.id, { ...state().shows[0], name: 'Keep manual work' })
  api.applyShow(edited.record, first.request, intent)
  const retry = api.beginRetry('second', first.request)!
  expect(api.beginRetry('second', first.request)).toEqual(retry)
  expect(api.beginRetry('foreign', { ...first.request, payloadKey: 'changed' })).toBeUndefined()
  const fresh = applyShowCommand(retry.show, 'resize_clip', { clip_id: 'resize-a', duration_ms: 6000 })
  if (!fresh.ok) throw new Error('fixture')
  const before = structuredClone({ shows: state().shows, histories: state().showHistories })
  if (action === 'retry-of-retry') {
    api.cancel(retry.request)
    const third = api.beginRetry('third', retry.request)!
    expect(third.request).toEqual({ ...retry.request, operationId: 'third', retryOf: 'second' })
    expect(third.retryResize).toEqual(intent)
    expect(api.applyShow(fresh.record, third.request, intent)).toMatchObject({ status: 'applied' })
  } else if (action === 'reordered-fields') {
    const reordered = Object.fromEntries(Object.entries(fresh.record).reverse())
    expect(api.applyShow(reordered, retry.request, intent)).toMatchObject({ status: 'applied' })
  } else if (action === 'foreign-envelope') {
    expect(api.applyShow(fresh.record, { ...retry.request, targets: ['other'] }, intent)).toMatchObject({ reason: 'identity-mismatch' })
    expect(api.readOutcome(retry.request)).toMatchObject({ status: 'pending' })
    expect(api.applyShow(fresh.record, retry.request, intent)).toMatchObject({ status: 'applied' })
  } else {
    if (action === 'retirement') api.close()
    const bad = api.applyShow(action === 'stale-candidate' ? edited.record : fresh.record, retry.request,
      action === 'malformed' ? { clipId: 'resize-a', durationMs: 0 } : action === 'changed-binding' ? { clipId: 'resize-b', durationMs: 6000 } : intent)
    expect(bad.status).not.toBe('applied')
    expect(api.applyShow(fresh.record, retry.request, intent).status).not.toBe('applied')
    expect({ shows: state().shows, histories: state().showHistories }).toEqual(before)
    expect(writes).toHaveBeenCalledTimes(1)
  }
})
