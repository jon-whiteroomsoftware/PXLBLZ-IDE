// @vitest-environment jsdom
import { createDefaultShow } from '@/engine/showModel'
import { createAgentPrivateExecutor } from '@/engine/agentPrivateExecutor'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { createAgentEditorAdmission } from './editorAdmission'
import { createAgentPrivateAdmissionOwner } from './privateAdmissionOwner'
import { createProductionAgentSession } from './editorSession'
import type { AgentBrowserSessionPort } from './channelPort'
let close = () => {}
afterEach(() => { close(); resetPersonalContentProvider() })
async function setup(writes = vi.fn(async () => {})) {
  window.history.replaceState(null, '', '/studio/shows/test?agent=1')
  useShowStore.setState(showInitialState)
  setPersonalContentProvider({ updateShow: writes, listShows: async () => [createDefaultShow('test', 'Original')] } as unknown as PersonalContentProvider)
  await useShowStore.getState().loadShows()
  const admission = createAgentEditorAdmission('test', () => ({}))
  const scope = { bindingId: 'binding', sessionId: admission.sessionId }
  const executor = createAgentPrivateExecutor(scope, createAgentPrivateAdmissionOwner(admission))
  const channel = { getConnection: () => ({ kind: 'idle' }), subscribe: () => () => {}, getOutcome: executor.getOutcome, close: () => executor.retire() } as unknown as AgentBrowserSessionPort
  const session = createProductionAgentSession(admission, 'test', channel, async () => ({ code: 'unavailable' }))
  close = session.close
  const send = (sequence: number, payload: unknown) => executor.deliver({ ...scope, operationId: 'op', deliveryId: `d${sequence}`, sequence, payload })
  send(0, { kind: 'begin_edit' }); send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Agent' } })
  return { admission, session, executor, send, writes }
}
it('synchronously retires a waiting private candidate before releasing dirty input on departure', async () => {
  const f = await setup()
  const token = useShowStore.getState().acquireShowEditActivity(f.admission.sessionId, 'test', 'dirty-field')!
  expect(f.send(2, { kind: 'commit_edit' })).toMatchObject({ receipt: { status: 'waiting' } })
  f.session.close()
  useShowStore.getState().releaseShowEditActivity(token)
  await Promise.resolve()
  expect(useShowStore.getState().shows[0].name).toBe('Original')
  expect(f.writes).not.toHaveBeenCalled()
  expect(f.admission.available()).toBe(false)
})
it('allows an already adopted save to settle after session departure', async () => {
  let finish!: () => void
  const writes = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const f = await setup(writes)
  expect(f.send(2, { kind: 'commit_edit' })).toMatchObject({ receipt: { status: 'applied', settlement: 'saving' } })
  f.session.close()
  await vi.waitFor(() => expect(writes).toHaveBeenCalledOnce())
  finish()
  await writes.mock.results[0].value
  await Promise.resolve()
  expect(writes.mock.calls[0]).toMatchObject(['test', { name: 'Agent' }])
  expect(useShowStore.getState().readShowEdit(f.admission.sessionId, 'binding:op')).toBeUndefined()
  expect(useShowStore.getState().showSaveFailure).toBeNull()
  expect(useShowStore.getState().shows[0].name).toBe('Agent')
  expect(writes).toHaveBeenCalledOnce()
})
