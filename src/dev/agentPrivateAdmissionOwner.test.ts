// @vitest-environment jsdom
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { resetPersonalContentProvider } from '@/engine/personalContentProvider'
import { createAgentPrivateExecutor } from '@/engine/agentPrivateExecutor'
import { commandFixtureV2 } from '@/engine/showCommandsV2/fixtures'
import { showInitialState, useShowStore } from '@/store/showStore'
import { agentV2Binding, agentV2Record, openAgentV2Show } from '@/test/agentAdmissionV2Harness'
import { createAgentEditorAdmission } from './agentEditorAdmission'
import { createAgentPrivateAdmissionOwner } from '@/agent/privateAdmissionOwner'

let close = () => {}
afterEach(() => { close(); close = () => {}; resetPersonalContentProvider() })
async function setup(initialShow?: ShowRecordV2) {
  window.history.replaceState(null, '', '/studio/shows/test?agent=1')
  useShowStore.setState(showInitialState)
  const record = initialShow ? { ...structuredClone(initialShow), id: 'test', name: 'Original' } : agentV2Record()
  const { writes, binding } = await openAgentV2Show(record)
  const admission = createAgentEditorAdmission('test', () => ({ playheadMs: 0 }), undefined, undefined, binding)
  close = () => { admission.close(); binding.stop() }
  const scope = { bindingId: 'binding', sessionId: admission.sessionId }
  const executor = createAgentPrivateExecutor(scope, createAgentPrivateAdmissionOwner(admission))
  const send = (sequence: number, payload: unknown) => executor.deliver({ ...scope, operationId: 'op', deliveryId: `d${sequence}`, sequence, payload })
  return { admission, executor, send, writes }
}
const state = () => useShowStore.getState()
const clipC = () => state().showV2Pilots.test.composition.clips.find(clip => clip.id === 'clip-c')!
const appearance = (values: Record<string, unknown>) => ({
  kind: 'command', name: 'update_clips', arguments: { updates: [{ clip_id: 'clip-c', appearance: { apply: { scope: 'whole-clip' }, ...values } }] },
})

it('applies a private static Clip inspector batch once with replay identity, one save, and one Undo unit', async () => {
  const { executor, send, writes } = await setup(commandFixtureV2())
  expect(send(0, { kind: 'begin_edit', intent: 'Frame and place clip-c' }).code).toBe('begun')
  expect(send(1, appearance({
    aperture: { enabled: true, x: 0.1, y: 0.2, width: 0.7, height: 0.6, aperture: 'rectangle', edge: 'hard', shape_parameters: { rotation: 0.125 } },
  }))).toMatchObject({ code: 'changed' })
  expect(send(2, appearance({ aperture: { aperture: 'ellipse', shape_parameters: { feather: 0.2 } } }))).toMatchObject({ code: 'changed' })
  expect(send(3, appearance({ aperture: { enabled: false } }))).toMatchObject({ code: 'changed' })
  expect(send(4, appearance({ aperture: { enabled: true } }))).toMatchObject({ code: 'changed' })
  expect(send(5, appearance({ opacity: 0.4 }))).toMatchObject({ code: 'changed' })
  const fullTransform = appearance({ transform: { positionX: 0.25, positionY: -0.1, rotation: 0.25, scaleX: 0.5, scaleY: 1.5 } })
  const fullReceipt = send(6, fullTransform)
  expect(fullReceipt).toMatchObject({ code: 'changed' })
  expect(send(7, appearance({ transform: { scaleY: 0.75 } }))).toMatchObject({ code: 'changed' })
  // A retransmitted delivery retains its original result even after a later
  // command changed the same logical Clip.
  expect(send(6, fullTransform)).toEqual(fullReceipt)
  expect(clipC().appearance.keys[0].value).not.toHaveProperty('aperture')
  expect(writes).not.toHaveBeenCalled()

  expect(send(8, { kind: 'commit_edit' })).toMatchObject({ code: 'outcome', receipt: { status: 'applied' } })
  await vi.waitFor(() => expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'applied', settlement: 'saved' } }))
  const adopted = structuredClone(clipC())
  expect(adopted.appearance.keys[0].value).toMatchObject({
    opacity: 0.4,
    transform: { positionX: 0.25, positionY: -0.1, rotation: 0.25, scaleX: 0.5, scaleY: 0.75 },
    aperture: {
      enabled: true, x: 0.1, y: 0.2, width: 0.7, height: 0.6,
      aperture: 'ellipse', edge: 'hard', feather: 0.2, rotation: 0.125,
    },
  })
  expect(state().showV2Histories.test.past).toHaveLength(1)
  expect(writes).toHaveBeenCalledTimes(1)

  await state().undoShowV2Pilot('test')
  expect(clipC().appearance.keys[0].value).not.toHaveProperty('aperture')
  await state().redoShowV2Pilot('test')
  expect(clipC()).toEqual(adopted)
})
it('adopts bulk Layer creation and linked Clip updates as one save and one Undo/Redo unit', async () => {
  const { executor, send, writes } = await setup(commandFixtureV2())
  const leftLayers = () => state().showV2Pilots.test.composition.layers.filter(layer => layer.zoneId === 'left').length
  const instanceA = () => state().showV2Pilots.test.composition.patternInstances.find(instance => instance.id === 'inst-a')!
  expect(send(0, { kind: 'begin_edit', intent: 'Add two Layers and slow the linked Clips' }).code).toBe('begun')
  const created = send(1, {
    kind: 'command', name: 'create_layers', arguments: {
      layers: [
        { zone_id: 'left', name: 'Upper', clips: [{ zone_id: 'left', start_ms: 8_000, duration_ms: 2_000, pattern: { kind: 'stock', id: 'TestPattern2D' }, instance: 'sole' }] },
        { zone_id: 'left', name: 'Empty' },
      ],
    },
  })
  expect(created).toMatchObject({ code: 'changed' })
  // "At most one aggregate change" is the v1 registry's rule
  // (show-command-semantics.md, Limits); v2 create_layers reports its Layers
  // and its placed Clips as separate changes of the one command.
  expect((created.changes as Array<{ command: string }>).map(change => change.command)).toEqual(['create_layers', 'create_layers'])
  const updated = send(2, {
    kind: 'command', name: 'update_clips', arguments: {
      updates: [
        { clip_id: 'clip-a', instance_properties: { time_scale: 0.5 } },
        { clip_id: 'clip-b', instance_properties: { time_scale: 0.5 } },
      ],
    },
  })
  expect(updated).toMatchObject({ code: 'changed' })
  expect((updated.changes as unknown[])).toHaveLength(1)
  expect(writes).not.toHaveBeenCalled()

  expect(send(3, { kind: 'commit_edit' })).toMatchObject({ code: 'outcome', receipt: { status: 'applied' } })
  await vi.waitFor(() => expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'applied', settlement: 'saved' } }))
  const adopted = structuredClone(state().showV2Pilots.test)
  expect(leftLayers()).toBe(4)
  expect(instanceA().time.timeScale).toBe(0.5)
  expect(state().showV2Histories.test.past).toHaveLength(1)
  expect(writes).toHaveBeenCalledTimes(1)

  await state().undoShowV2Pilot('test')
  expect(leftLayers()).toBe(2)
  expect(instanceA().time.timeScale).toBe(1)
  await state().redoShowV2Pilot('test')
  expect(state().showV2Pilots.test).toEqual({ ...adopted, updatedAt: state().showV2Pilots.test.updatedAt })
})
it('keeps a satisfied bulk patch adoption-free through private commit', async () => {
  const { executor, send, writes } = await setup(commandFixtureV2())
  expect(send(0, { kind: 'begin_edit', intent: 'Keep current opacity' }).code).toBe('begun')
  expect(send(1, appearance({ opacity: 1 }))).toEqual({ code: 'noop', changes: [] })
  expect(send(2, { kind: 'commit_edit' })).toMatchObject({ code: 'outcome', receipt: { status: 'completed', completion: 'nothing-applied' } })
  expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'completed', completion: 'nothing-applied' } })
  expect(state().showV2Histories.test?.past.length ?? 0).toBe(0)
  expect(writes).not.toHaveBeenCalled()
})
it('captures real source metadata and keeps rename private until one history/save adoption', async () => {
  const { admission, executor, send, writes } = await setup()
  const metadata = admission.captureCommandContext()!
  expect(metadata.retainedBytes).toBeGreaterThan(0)
  expect(metadata.commandContext.resolvePattern({ kind: 'stock', id: 'TestPattern1D' })).toMatchObject({ status: 'ready' })
  expect(send(0, { kind: 'begin_edit', intent: 'Rename' }).code).toBe('begun')
  expect(send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Private rename' } }).code).toBe('changed')
  expect(state().showV2Pilots.test.name).toBe('Original')
  expect(writes).not.toHaveBeenCalled()
  expect(send(2, { kind: 'commit_edit' }).code).toBe('outcome')
  await vi.waitFor(() => expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'applied', settlement: 'saved' } }))
  expect(state().showV2Pilots.test.name).toBe('Private rename')
  expect(state().showV2Histories.test.past).toHaveLength(1)
  expect(writes).toHaveBeenCalledTimes(1)
  executor.retire()
  expect(state().showV2Pilots.test.name).toBe('Private rename')
})
it('live manual revision invalidates a captured private candidate without another save', async () => {
  const { send, writes } = await setup()
  send(0, { kind: 'begin_edit' })
  send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Agent' } })
  await state().updateShowV2Pilot('test', { ...state().showV2Pilots.test, name: 'Manual' })
  expect(send(2, { kind: 'commit_edit' })).toMatchObject({ receipt: { status: 'refused', reason: 'revision-conflict' } })
  expect(state().showV2Pilots.test.name).toBe('Manual')
  expect(writes).toHaveBeenCalledTimes(1)
})
it.each([false, true])('cancel after commit reaches admission and preserves already-adopted saves (%s)', async adopted => {
  const { admission, executor, send, writes } = await setup()
  send(0, { kind: 'begin_edit' })
  send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Agent' } })
  const activity = adopted ? undefined : state().acquireShowEditActivity(admission.sessionId, 'test', 'dirty-field')!
  expect(send(2, { kind: 'commit_edit' })).toMatchObject({ receipt: { status: adopted ? 'applied' : 'waiting' } })
  const cancelled = send(3, { kind: 'cancel_edit' })
  expect(cancelled).toMatchObject({ receipt: { status: adopted ? 'applied' : 'cancelled' } })
  expect(send(3, { kind: 'cancel_edit' })).toEqual(cancelled)
  if (activity) state().releaseShowEditActivity(activity)
  if (adopted) await vi.waitFor(() => expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'applied', settlement: 'saved' } }))
  expect(state().showV2Pilots.test.name).toBe(adopted ? 'Agent' : 'Original')
  expect(writes).toHaveBeenCalledTimes(adopted ? 1 : 0)
  expect(state().showV2Histories.test?.past.length ?? 0).toBe(adopted ? 1 : 0)
})
it.each([false, true])('remote retirement ACK follows local cancellation while preserving an earlier adoption (%s)', async adoptedBeforeAck => {
  const { admission, writes } = await setup()
  const { createAgentBrowserSession } = await import('@/agent/browserSession')
  const own = { registrationId: 'remote-registration', sessionId: admission.sessionId, showId: 'test' }
  const connection = { kind: 'bound', bindingId: 'remote-binding', agentKind: 'external', agentName: 'Client' }
  const receives: Array<(value: Response) => void> = []
  let acknowledgement = false
  let request: import('@/engine/showEditAdmission').ShowEditRequest | undefined
  const activity = state().acquireShowEditActivity(admission.sessionId, 'test', 'dirty-field')!
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(init?.body as string)
    if (body.type === 'register') return Response.json({ code: 'registered', registrationId: own.registrationId, connection })
    if (body.type === 'receive') return new Promise(resolve => receives.push(resolve))
    if (body.type === 'retirement-ack') {
      expect(admission.readOutcome(request!)).toMatchObject({ status: adoptedBeforeAck ? 'applied' : 'cancelled' })
      state().releaseShowEditActivity(activity)
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
  if (adoptedBeforeAck) state().releaseShowEditActivity(activity)
  receives.shift()!(Response.json({ code: 'status', connection: { kind: 'retiring', bindingId: connection.bindingId, agentName: 'Client' }, deliveries: [] }))
  await vi.waitFor(() => expect(acknowledgement).toBe(true))
  expect(state().showV2Pilots.test.name).toBe(adoptedBeforeAck ? 'Agent' : 'Original')
  expect(writes).toHaveBeenCalledTimes(adoptedBeforeAck ? 1 : 0)
  session.close()
})
it('refuses capture before retaining an operation when its encoded snapshot exceeds the remaining budget', async () => {
  const { admission } = await setup()
  expect(admission.beginRequest('too-large', '', [], 1)).toBeUndefined()
  expect(state().readShowEdit(admission.sessionId, 'too-large')).toBeUndefined()
  expect(admission.beginRequest('too-large', '', [], 1_048_000)).toBeDefined()
})
it('captures every supported stock Show below the read cap and edits one draft with zero personal saves', async () => {
  const { STOCK_SHOWS_V2 } = await import('@/pixelblaze/stock/showsV2')
  useShowStore.setState(showInitialState)
  const { writes } = await openAgentV2Show(agentV2Record('personal'))
  const bindings: Array<() => void> = []
  const bound = async (showId: string) => {
    await expect(state().openShowV2Pilot(showId)).resolves.toMatchObject({ status: 'ready' })
    const binding = agentV2Binding(showId)
    bindings.push(binding.stop)
    return binding
  }
  close = () => bindings.forEach(stop => stop())
  for (const show of STOCK_SHOWS_V2) {
    window.history.replaceState(null, '', `/studio/shows/${show.id}?agent=1`)
    const admission = createAgentEditorAdmission(show.id, () => ({}), undefined, undefined, await bound(show.id))
    try {
      const owner = createAgentPrivateAdmissionOwner(admission)
      const captured = owner.capture('capacity-proof', '', 16_777_216)
      expect(captured, show.id).toBeDefined()
      expect(new TextEncoder().encode(JSON.stringify({ show: captured!.show, context: captured!.context })).byteLength, show.id).toBeLessThan(1_048_576)
      expect(captured!.retainedBytes, show.id).toBeLessThan(16_777_216)
    } finally { admission.close() }
  }
  const target = STOCK_SHOWS_V2[0]
  window.history.replaceState(null, '', `/studio/shows/${target.id}?agent=1`)
  const admission = createAgentEditorAdmission(target.id, () => ({}), undefined, undefined, await bound(target.id))
  close = () => { admission.close(); bindings.forEach(stop => stop()) }
  const scope = { bindingId: 'stock-binding', sessionId: admission.sessionId }
  const executor = createAgentPrivateExecutor(scope, createAgentPrivateAdmissionOwner(admission))
  const send = (sequence: number, payload: unknown) => executor.deliver({ ...scope, operationId: 'stock-op', deliveryId: `stock-${sequence}`, sequence, payload })
  expect(send(0, { kind: 'begin_edit' }).code).toBe('begun')
  expect(send(1, { kind: 'command', name: 'rename_show', arguments: { name: 'Local draft' } }).code).toBe('changed')
  expect(send(2, { kind: 'commit_edit' })).toMatchObject({ receipt: { status: 'applied', settlement: 'draft' } })
  expect(state().showV2Pilots[target.id].name).toBe('Local draft')
  expect(state().showV2Histories[target.id].past).toHaveLength(1)
  expect(state().isShowV2LessonDraft(target.id)).toBe(true)
  expect(writes).not.toHaveBeenCalled()
}, 60_000)
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
  const activity = state().acquireShowEditActivity(admission.sessionId, 'test', 'dirty-field')!
  const committing = relay.dispatch({ operationId: 'op', deliveryId: 'commit', sequence: 2, payload: { kind: 'commit_edit' } })
  const [commit] = relay.take()
  const lost = browser.deliver(commit)
  expect(lost).toMatchObject({ receipt: { status: 'waiting' } })
  const cancelling = relay.dispatch({ operationId: 'op', deliveryId: 'cancel', sequence: 3, payload: { kind: 'cancel_edit' } })
  const [cancel] = relay.take(); relay.reply(cancel, browser.deliver(cancel))
  expect(await cancelling).toMatchObject({ receipt: { status: 'cancelled' } })
  expect(await committing).toEqual({ code: 'result_unavailable' })
  expect(relay.reply(commit, lost)).toBe(false)
  state().releaseShowEditActivity(activity)
  expect(state().showV2Pilots.test.name).toBe('Original')
  expect(writes).not.toHaveBeenCalled()
  expect(state().showV2Histories.test?.past.length ?? 0).toBe(0)
  relay.end(); browser.retire()
})
