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
