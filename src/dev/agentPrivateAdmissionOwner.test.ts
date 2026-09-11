// @vitest-environment jsdom
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { createDefaultShow } from '@/engine/showModel'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { createAgentPrivateExecutor } from '@/engine/agentPrivateExecutor'
import { showInitialState, useShowStore } from '@/store/showStore'
import { createAgentEditorAdmission } from './agentEditorAdmission'
import { createAgentPrivateAdmissionOwner } from '@/agent/privateAdmissionOwner'

let close = () => {}
afterEach(() => { close(); resetPersonalContentProvider() })
async function setup() {
  window.history.replaceState(null, '', '/studio/shows/test?agent=1')
  useShowStore.setState(showInitialState)
  const show = createDefaultShow('test', 'Original')
  const writes = vi.fn(async () => {})
  setPersonalContentProvider({ updateShow: writes, listShows: async () => [show] } as unknown as PersonalContentProvider)
  await useShowStore.getState().loadShows()
  const admission = createAgentEditorAdmission('test', () => ({ playheadMs: 0 }))
  close = admission.close
  const scope = { bindingId: 'binding', sessionId: admission.sessionId }
  const executor = createAgentPrivateExecutor(scope, createAgentPrivateAdmissionOwner(admission))
  const send = (sequence: number, payload: unknown) => executor.deliver({ ...scope, operationId: 'op', deliveryId: `d${sequence}`, sequence, payload })
  return { admission, executor, send, writes }
}
it('captures real source metadata and keeps rename private until one history/save adoption', async () => {
  const { admission, executor, send, writes } = await setup()
  const metadata = admission.captureCommandContext()!
  expect(metadata.retainedBytes).toBeGreaterThan(0)
  expect(metadata.commandContext.source({ kind: 'stock', id: Object.keys(DEMOS)[0] })).toBeTruthy()
  expect(send(0, { kind: 'begin_edit', intent: 'Rename' }).code).toBe('begun')
  expect(send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Private rename' } }).code).toBe('changed')
  expect(useShowStore.getState().shows[0].name).toBe('Original')
  expect(writes).not.toHaveBeenCalled()
  expect(send(2, { kind: 'commit_edit' }).code).toBe('outcome')
  await vi.waitFor(() => expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'applied', settlement: 'saved' } }))
  expect(useShowStore.getState().shows[0].name).toBe('Private rename')
  expect(useShowStore.getState().showHistories.test.past).toHaveLength(1)
  expect(writes).toHaveBeenCalledTimes(1)
  executor.retire()
  expect(useShowStore.getState().shows[0].name).toBe('Private rename')
})
it('live manual revision invalidates a captured private candidate without another save', async () => {
  const { send, writes } = await setup()
  send(0, { kind: 'begin_edit' })
  send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Agent' } })
  const store = useShowStore.getState()
  await store.updateShow('test', { ...store.shows[0], name: 'Manual' })
  expect(send(2, { kind: 'commit_edit' })).toMatchObject({ receipt: { status: 'refused', reason: 'revision-conflict' } })
  expect(useShowStore.getState().shows[0].name).toBe('Manual')
  expect(writes).toHaveBeenCalledTimes(1)
})
it('retries only a single resolved resize against fresh state while preserving its first refusal', async () => {
  const { executor, send, writes } = await setup()
  const { showCommandFixture } = await import('@/test/showCommandFixture')
  await useShowStore.getState().updateShow('test', { ...showCommandFixture(), id: 'test' })
  send(0, { kind: 'begin_edit' })
  send(1, { kind: 'command', name: 'resize_clip', arguments: { clip_id: 'clip-a', duration_ms: 9000 } })
  await useShowStore.getState().updateShow('test', { ...useShowStore.getState().shows[0], name: 'Manual' })
  expect(send(2, { kind: 'commit_edit' })).toMatchObject({ receipt: { status: 'refused', reason: 'revision-conflict' } })
  const result = executor.retry('op', 'retry')
  expect(result).toMatchObject({ code: 'outcome', operationId: 'retry', request: { operationId: 'binding:retry', retryOf: 'binding:op' } })
  await vi.waitFor(() => expect(executor.getOutcome('retry')).toMatchObject({ receipt: { status: 'applied', settlement: 'saved' } }))
  expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'refused', reason: 'revision-conflict' } })
  expect(useShowStore.getState().shows[0].name).toBe('Manual')
  expect(writes).toHaveBeenCalledTimes(3)
})
it.each([false, true])('cancel after commit reaches admission and preserves already-adopted saves (%s)', async adopted => {
  const { admission, executor, send, writes } = await setup()
  send(0, { kind: 'begin_edit' })
  send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Agent' } })
  const activity = adopted ? undefined : useShowStore.getState().acquireShowEditActivity(admission.sessionId, 'test', 'dirty-field')!
  expect(send(2, { kind: 'commit_edit' })).toMatchObject({ receipt: { status: adopted ? 'applied' : 'waiting' } })
  const cancelled = send(3, { kind: 'cancel_edit' })
  expect(cancelled).toMatchObject({ receipt: { status: adopted ? 'applied' : 'cancelled' } })
  expect(send(3, { kind: 'cancel_edit' })).toEqual(cancelled)
  if (activity) useShowStore.getState().releaseShowEditActivity(activity)
  if (adopted) await vi.waitFor(() => expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'applied', settlement: 'saved' } }))
  expect(useShowStore.getState().shows[0].name).toBe(adopted ? 'Agent' : 'Original')
  expect(writes).toHaveBeenCalledTimes(adopted ? 1 : 0)
  expect(useShowStore.getState().showHistories.test?.past.length ?? 0).toBe(adopted ? 1 : 0)
})
