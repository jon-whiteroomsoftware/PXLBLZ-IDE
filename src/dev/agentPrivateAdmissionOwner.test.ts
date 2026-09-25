// @vitest-environment jsdom
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { createDefaultShow } from '@/engine/showModel'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { createAgentPrivateExecutor } from '@/engine/agentPrivateExecutor'
import { showInitialState, useShowStore } from '@/store/showStore'
import { createAgentEditorAdmission } from './agentEditorAdmission'
import { createAgentPrivateAdmissionOwner } from '@/agent/privateAdmissionOwner'
import type { ShowCommandContext } from '@/engine/showCommands/registry'

let close = () => {}
afterEach(() => { close(); resetPersonalContentProvider() })
async function setup(initialShow?: ShowRecord) {
  window.history.replaceState(null, '', '/studio/shows/test?agent=1')
  useShowStore.setState(showInitialState)
  const show = initialShow ? { ...structuredClone(initialShow), id: 'test' } : createDefaultShow('test', 'Original')
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

it('applies a private static Clip inspector batch once with replay identity, one save, and one Undo unit', async () => {
  const { showCommandFixture } = await import('@/test/showCommandFixture')
  const { executor, send, writes } = await setup(showCommandFixture())
  expect(send(0, { kind: 'begin_edit', intent: 'Frame and place clip-a' }).code).toBe('begun')
  expect(send(1, {
    kind: 'command', name: 'set_clip_aperture', arguments: {
      clip_id: 'clip-a', enabled: true, x: 0.1, y: 0.2, width: 0.7, height: 0.6,
      aperture: 'rectangle', edge: 'hard', rotation: 0.125,
    },
  })).toMatchObject({ code: 'changed' })
  expect(send(2, {
    kind: 'command', name: 'set_clip_aperture', arguments: {
      clip_id: 'clip-a', aperture: 'ellipse', feather: 0.2,
    },
  })).toMatchObject({ code: 'changed' })
  expect(send(3, { kind: 'command', name: 'set_clip_aperture', arguments: { clip_id: 'clip-a', enabled: false } }))
    .toMatchObject({ code: 'changed' })
  expect(send(4, { kind: 'command', name: 'set_clip_aperture', arguments: { clip_id: 'clip-a', enabled: true } }))
    .toMatchObject({ code: 'changed' })
  expect(send(5, { kind: 'command', name: 'set_clip_opacity', arguments: { clip_id: 'clip-a', opacity: 0.4 } }))
    .toMatchObject({ code: 'changed' })
  const fullTransform = {
    kind: 'command', name: 'set_clip_transform', arguments: {
      clip_id: 'clip-a', position_x: 0.25, position_y: -0.1, rotation: 0.25, scale_x: 0.5, scale_y: 1.5,
    },
  }
  const fullReceipt = send(6, fullTransform)
  expect(fullReceipt).toMatchObject({ code: 'changed' })
  expect(send(7, { kind: 'command', name: 'set_clip_transform', arguments: { clip_id: 'clip-a', scale_y: 0.75 } }))
    .toMatchObject({ code: 'changed' })
  // A retransmitted delivery retains its original result even after a later
  // command changed the same logical Clip.
  expect(send(6, fullTransform)).toEqual(fullReceipt)
  expect(useShowStore.getState().shows[0].composition!.scenes[0].zones[0].main[0]).not.toHaveProperty('viewport')
  expect(writes).not.toHaveBeenCalled()

  expect(send(8, { kind: 'commit_edit' })).toMatchObject({ code: 'outcome', receipt: { status: 'applied' } })
  await vi.waitFor(() => expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'applied', settlement: 'saved' } }))
  const adopted = useShowStore.getState().shows[0].composition!.scenes[0].zones[0].main[0]
  expect(adopted).toMatchObject({
    opacity: 0.4,
    transform: { positionX: 0.25, positionY: -0.1, rotation: 0.25, scaleX: 0.5, scaleY: 0.75 },
    viewport: {
      enabled: true, x: 0.1, y: 0.2, width: 0.7, height: 0.6,
      aperture: 'ellipse', edge: 'hard', feather: 0.2, rotation: 0.125,
    },
  })
  expect(useShowStore.getState().showHistories.test.past).toHaveLength(1)
  expect(writes).toHaveBeenCalledTimes(1)

  await useShowStore.getState().undoShow('test')
  expect(useShowStore.getState().shows[0].composition!.scenes[0].zones[0].main[0]).not.toHaveProperty('viewport')
  await useShowStore.getState().redoShow('test')
  expect(useShowStore.getState().shows[0].composition!.scenes[0].zones[0].main[0]).toEqual(adopted)
})
it('adopts bulk Layer creation and linked Clip updates as one save and one Undo/Redo unit', async () => {
  const { showCommandFixture } = await import('@/test/showCommandFixture')
  const { executor, send, writes } = await setup(showCommandFixture())
  expect(send(0, { kind: 'begin_edit', intent: 'Add two Layers and slow the linked Clips' }).code).toBe('begun')
  const created = send(1, {
    kind: 'command', name: 'create_layers', arguments: {
      schema_version: 1,
      layers: [
        { zone_id: 'zone-1', clips: [{ start_ms: 32_000, duration_ms: 2_000, pattern: { kind: 'stock', id: 'LineDancer2D' }, properties: { controls: { sliderSpeed: 0.4 } } }] },
        { zone_id: 'zone-1', clips: [] },
      ],
    },
  })
  expect(created).toMatchObject({ code: 'changed', changes: [{ description: 'Created 2 Layers with 1 Clip.' }] })
  expect((created.changes as unknown[])).toHaveLength(1)
  const updated = send(2, {
    kind: 'command', name: 'update_clips', arguments: {
      schema_version: 1,
      updates: [
        { clip_id: 'clip-a', properties: { time: { time_scale: 0.5 } } },
        { clip_id: 'clip-c', properties: { time: { time_scale: 0.5 } } },
      ],
    },
  })
  expect(updated).toMatchObject({ code: 'changed', changes: [{
    description: 'Updated speed on 2 Clips.',
    details: { directClipIds: ['clip-a', 'clip-c'], linkedClipIds: [], changedInstanceIds: ['instance-a'] },
  }] })
  expect((updated.changes as unknown[])).toHaveLength(1)
  expect(writes).not.toHaveBeenCalled()

  expect(send(3, { kind: 'commit_edit' })).toMatchObject({ code: 'outcome', receipt: { status: 'applied' } })
  await vi.waitFor(() => expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'applied', settlement: 'saved' } }))
  const adopted = structuredClone(useShowStore.getState().shows[0])
  expect(adopted.composition!.scenes.map(scene => scene.zones[0].overlays.length)).toEqual([3, 2])
  expect(adopted.composition!.patternInstances.find(instance => instance.id === 'instance-a')!.time.timeScale).toBe(0.5)
  expect(useShowStore.getState().showHistories.test.past).toHaveLength(1)
  expect(writes).toHaveBeenCalledTimes(1)

  await useShowStore.getState().undoShow('test')
  expect(useShowStore.getState().shows[0].composition!.scenes.map(scene => scene.zones[0].overlays.length)).toEqual([1, 0])
  expect(useShowStore.getState().shows[0].composition!.patternInstances.find(instance => instance.id === 'instance-a')!.time.timeScale).toBe(1)
  await useShowStore.getState().redoShow('test')
  expect(useShowStore.getState().shows[0]).toEqual({ ...adopted, updatedAt: useShowStore.getState().shows[0].updatedAt })
})
it('keeps a satisfied bulk patch adoption-free through private commit', async () => {
  const { showCommandFixture } = await import('@/test/showCommandFixture')
  const { executor, send, writes } = await setup(showCommandFixture())
  expect(send(0, { kind: 'begin_edit', intent: 'Keep current brightness' }).code).toBe('begun')
  expect(send(1, {
    kind: 'command', name: 'update_clips', arguments: {
      schema_version: 1,
      updates: [{ clip_id: 'clip-a', properties: { view: { brightness: 1 } } }],
    },
  })).toEqual({ code: 'noop', changes: [] })
  expect(send(2, { kind: 'commit_edit' })).toMatchObject({ code: 'outcome', receipt: { status: 'completed', completion: 'nothing-applied' } })
  expect(executor.getOutcome('op')).toMatchObject({ receipt: { status: 'completed', completion: 'nothing-applied' } })
  expect(useShowStore.getState().showHistories.test?.past.length ?? 0).toBe(0)
  expect(writes).not.toHaveBeenCalled()
})
it('captures real source metadata and keeps rename private until one history/save adoption', async () => {
  const { admission, executor, send, writes } = await setup()
  const metadata = admission.captureCommandContext()!
  expect(metadata.retainedBytes).toBeGreaterThan(0)
  expect((metadata.commandContext as ShowCommandContext).source!({ kind: 'stock', id: Object.keys(DEMOS)[0] })).toBeTruthy()
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
