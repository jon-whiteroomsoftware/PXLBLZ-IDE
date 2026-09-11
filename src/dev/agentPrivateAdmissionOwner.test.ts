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
it.each([false, true])('remote retirement ACK follows local cancellation while preserving an earlier adoption (%s)', async adoptedBeforeAck => {
  const { admission, writes } = await setup()
  const { createAgentBrowserSession } = await import('@/agent/browserSession')
  const own = { registrationId: 'remote-registration', sessionId: admission.sessionId, showId: 'test' }
  const connection = { kind: 'bound', bindingId: 'remote-binding', agentKind: 'external', agentName: 'Client' }
  const receives: Array<(value: Response) => void> = []
  let acknowledgement = false
  let request: import('@/engine/showEditAdmission').ShowEditRequest | undefined
  const activity = useShowStore.getState().acquireShowEditActivity(admission.sessionId, 'test', 'dirty-field')!
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(init?.body as string)
    if (body.type === 'register') return Response.json({ code: 'registered', registrationId: own.registrationId, connection })
    if (body.type === 'receive') return new Promise(resolve => receives.push(resolve))
    if (body.type === 'retirement-ack') {
      expect(admission.readOutcome(request!)).toMatchObject({ status: adoptedBeforeAck ? 'applied' : 'cancelled' })
      useShowStore.getState().releaseShowEditActivity(activity)
      acknowledgement = true
      return Response.json({ code: 'editing_ended' })
    }
    return Response.json({ code: 'received' })
  }
  const session = createAgentBrowserSession({ admission, showId: 'test', fetch: fetcher })
  session.subscribe(event => { if (event.type === 'delivery' && event.request) request = event.request })
  await session.ready
  for (const [sequence, payload] of [{ kind: 'begin_edit' }, { kind: 'command', name: 'rename_show', arguments: { name: 'Agent' } }, { kind: 'commit_edit' }].entries()) {
    receives.shift()!(Response.json({ code: 'status', connection, deliveries: [{ ...own, bindingId: connection.bindingId, operationId: 'op', deliveryId: `d${sequence}`, sequence, payload }] }))
    await vi.waitFor(() => expect(receives.length).toBe(1))
  }
  expect(admission.readOutcome(request!)).toMatchObject({ status: 'waiting' })
  if (adoptedBeforeAck) useShowStore.getState().releaseShowEditActivity(activity)
  receives.shift()!(Response.json({ code: 'status', connection: { kind: 'retiring', bindingId: connection.bindingId, agentName: 'Client' }, deliveries: [] }))
  await vi.waitFor(() => expect(acknowledgement).toBe(true))
  expect(useShowStore.getState().shows[0].name).toBe(adoptedBeforeAck ? 'Agent' : 'Original')
  expect(writes).toHaveBeenCalledTimes(adoptedBeforeAck ? 1 : 0)
  session.close()
})
it('refuses capture before retaining an operation when its encoded snapshot exceeds the remaining budget', async () => {
  const { admission } = await setup()
  expect(admission.beginRequest('too-large', '', [], 1)).toBeUndefined()
  expect(useShowStore.getState().readShowEdit(admission.sessionId, 'too-large')).toBeUndefined()
  expect(admission.beginRequest('too-large', '', [], 1_048_000)).toBeDefined()
})
it('captures every supported stock Show below the read cap and edits one draft with zero personal saves', async () => {
  const { STOCK_SHOWS } = await import('@/pixelblaze/stock/shows')
  const writes = vi.fn(async () => {})
  setPersonalContentProvider({ updateShow: writes, listShows: async () => [] } as unknown as PersonalContentProvider)
  useShowStore.setState(showInitialState)
  await useShowStore.getState().loadShows()
  for (const show of STOCK_SHOWS) {
    window.history.replaceState(null, '', `/studio/shows/${show.id}?agent=1`)
    const admission = createAgentEditorAdmission(show.id, () => ({ selectedSceneId: show.show.scenes[0]?.id }))
    try {
      const owner = createAgentPrivateAdmissionOwner(admission)
      const captured = owner.capture('capacity-proof', '', 16_777_216)
      expect(captured, show.id).toBeDefined()
      expect(new TextEncoder().encode(JSON.stringify({ show: captured!.show, context: captured!.context })).byteLength, show.id).toBeLessThan(1_048_576)
      expect(captured!.retainedBytes, show.id).toBeLessThan(16_777_216)
    } finally { admission.close() }
  }
  const target = STOCK_SHOWS[0]
  window.history.replaceState(null, '', `/studio/shows/${target.id}?agent=1`)
  const admission = createAgentEditorAdmission(target.id, () => ({}))
  close = admission.close
  const scope = { bindingId: 'stock-binding', sessionId: admission.sessionId }
  const executor = createAgentPrivateExecutor(scope, createAgentPrivateAdmissionOwner(admission))
  const send = (sequence: number, payload: unknown) => executor.deliver({ ...scope, operationId: 'stock-op', deliveryId: `stock-${sequence}`, sequence, payload })
  expect(send(0, { kind: 'begin_edit' }).code).toBe('begun')
  expect(send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Local draft' } }).code).toBe('changed')
  expect(send(2, { kind: 'commit_edit' })).toMatchObject({ receipt: { status: 'applied' } })
  expect(useShowStore.getState().stockShowDrafts[target.id].name).toBe('Local draft')
  expect(useShowStore.getState().showHistories[target.id].past).toHaveLength(1)
  expect(useShowStore.getState().shows).toEqual([])
  expect(writes).not.toHaveBeenCalled()
})
it('cancels a real waiting commit whose relay acknowledgement was lost, without adoption on manual release', async () => {
  const { admission, writes } = await setup()
  const { AgentRelay } = await import('@/worker/agent/agentRelay')
  const scope = { bindingId: 'lost-binding', sessionId: admission.sessionId, registrationId: 'registration', showId: 'test' }
  const relay = new AgentRelay(scope, () => {})
  const browser = createAgentPrivateExecutor(scope, createAgentPrivateAdmissionOwner(admission))
  for (const [sequence, payload] of [{ kind: 'begin_edit' }, { kind: 'command', name: 'rename_show', arguments: { name: 'Agent' } }].entries()) {
    const response = relay.dispatch({ operationId: 'op', deliveryId: `d${sequence}`, sequence, payload })
    const [message] = relay.take(); relay.reply(message, browser.deliver(message)); await response
  }
  const activity = useShowStore.getState().acquireShowEditActivity(admission.sessionId, 'test', 'dirty-field')!
  const committing = relay.dispatch({ operationId: 'op', deliveryId: 'commit', sequence: 2, payload: { kind: 'commit_edit' } })
  const [commit] = relay.take()
  const lost = browser.deliver(commit)
  expect(lost).toMatchObject({ receipt: { status: 'waiting' } })
  const cancelling = relay.dispatch({ operationId: 'op', deliveryId: 'cancel', sequence: 3, payload: { kind: 'cancel_edit' } })
  const [cancel] = relay.take(); relay.reply(cancel, browser.deliver(cancel))
  expect(await cancelling).toMatchObject({ receipt: { status: 'cancelled' } })
  expect(await committing).toEqual({ code: 'result_unavailable' })
  expect(relay.reply(commit, lost)).toBe(false)
  useShowStore.getState().releaseShowEditActivity(activity)
  expect(useShowStore.getState().shows[0].name).toBe('Original')
  expect(writes).not.toHaveBeenCalled()
  expect(useShowStore.getState().showHistories.test?.past.length ?? 0).toBe(0)
  relay.end(); browser.retire()
})
