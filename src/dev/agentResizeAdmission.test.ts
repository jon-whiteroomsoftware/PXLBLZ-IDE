// @vitest-environment jsdom
import { createDefaultShow } from '@/engine/showModel'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { createAgentEditorAdmission } from './agentEditorAdmission'

const state = () => useShowStore.getState()
let api: ReturnType<typeof createAgentEditorAdmission>
let durable: ShowRecord
let writes: ReturnType<typeof vi.fn>
beforeEach(async () => {
  window.history.replaceState(null, '', '/studio/shows/typed?agent=1')
  useShowStore.setState(showInitialState)
  durable = createDefaultShow('typed', 'Unrelated name sentinel', 1)
  durable.scenes[0].durationMs = 20000
  durable.cells = []
  durable.composition = { version: 1, patternInstances: [{ id: 'instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } }], scenes: [{ sceneId: durable.scenes[0].id, zones: [{ zoneId: durable.zones[0].id, main: [], overlays: ['target', 'unrelated'].map(id => ({ id, name: id, placements: [{ id: `${id}-clip`, instanceId: 'instance', startMs: 0, durationMs: 4000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } }] })) }] }] }
  writes = vi.fn(async (_id: string, patch: Partial<ShowRecord>) => { durable = { ...durable, ...structuredClone(patch) } })
  setPersonalContentProvider({ listShows: async () => [structuredClone(durable)], updateShow: writes } as unknown as PersonalContentProvider)
  await state().loadShows()
  api = createAgentEditorAdmission('typed', () => ({ selectedClipIds: ['unrelated-focus-sentinel'] }))
})
afterEach(() => { api?.close(); resetPersonalContentProvider() })
it('captures before inference, applies the exact output to current state and Undo preserves manual work', async () => {
  const captured = api.beginResizeRequest('resize', { clipId: 'target-clip', durationMs: 6000 })!
  expect(captured.intent).toEqual({ clipId: 'target-clip', durationMs: 6000 })
  expect(Object.keys(captured).sort()).toEqual(['intent', 'request'])
  const manual = structuredClone(state().resolveEditableShow('typed')!)
  manual.composition!.scenes[0].zones[0].overlays[1].placements[0].view.brightness = 0.3
  await state().updateShow('typed', manual)
  const before = structuredClone(state().resolveEditableShow('typed')!)
  expect(api.applyResize(captured.intent, captured.request).status).toBe('applied')
  await vi.waitFor(() => expect(api.readOutcome(captured.request)).toMatchObject({ status: 'applied', settlement: 'saved' }))
  const expected = structuredClone(before)
  expected.composition!.scenes[0].zones[0].overlays[0].placements[0].durationMs = 6000
  expect(durable).toEqual({ ...expected, updatedAt: durable.updatedAt })
  expect(state().resolveEditableShow('typed')).toEqual(durable)
  expect(writes).toHaveBeenCalledTimes(2)
  await state().undoShow('typed')
  expect(durable).toEqual({ ...before, updatedAt: durable.updatedAt })
})
it('makes a mismatched proposal terminal only for its exact pending envelope', () => {
  const captured = api.beginResizeRequest('resize', { clipId: 'target-clip', durationMs: 6000 })!
  const foreign = { ...captured.request, payloadKey: 'foreign' }
  expect(api.applyResize({ clipId: 'foreign', durationMs: 6000 }, foreign).status).toBe('refused')
  expect(api.readOutcome(captured.request)?.status).toBe('pending')
  expect(api.applyResize({ clipId: 'foreign', durationMs: 6000 }, captured.request)).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  expect(api.readOutcome(captured.request)).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  expect(api.applyResize(captured.intent, captured.request)).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  expect(writes).not.toHaveBeenCalled()
})
it.each(['same-layer', 'shared', 'metadata', 'ABA', 'cancel', 'retire'] as const)('refuses %s without any additional history or write', async action => {
  const captured = api.beginResizeRequest('resize', { clipId: 'target-clip', durationMs: 6000 })!
  const original = structuredClone(state().resolveEditableShow('typed')!)
  if (action === 'cancel') api.cancel(captured.request)
  else if (action === 'retire') api.close()
  else if (action === 'metadata') {
    const { usePatternStore } = await import('@/store/patternStore')
    const patterns = usePatternStore.getState().userPatterns
    usePatternStore.setState({ userPatterns: [...patterns] })
    usePatternStore.setState({ userPatterns: patterns })
  } else {
    const next = structuredClone(original)
    if (action === 'shared') next.name = 'Shared change'
    else next.composition!.scenes[0].zones[0].overlays[0].placements[0].durationMs = 7000
    await state().updateShow('typed', next)
    if (action === 'ABA') await state().updateShow('typed', original)
  }
  const snapshot = () => structuredClone({ current: state().resolveEditableShow('typed'), history: state().showHistories, durable, writes: writes.mock.calls })
  const before = snapshot()
  expect(api.applyResize(captured.intent, captured.request).status).toBe(action === 'cancel' ? 'cancelled' : action === 'retire' ? 'retired' : 'refused')
  expect(snapshot()).toEqual(before)
})
it('deduplicates successful and no-op delivery without replacing terminal receipts', async () => {
  const captured = api.beginResizeRequest('noop', { clipId: 'target-clip', durationMs: 4000 })!
  expect(api.applyResize(captured.intent, captured.request).status).toBe('noop')
  const receipt = api.readOutcome(captured.request)
  expect(api.applyResize({ clipId: 'target-clip', durationMs: 6000 }, captured.request)).toEqual(receipt)
  expect(writes).not.toHaveBeenCalled()
  const changed = api.beginResizeRequest('changed', { clipId: 'target-clip', durationMs: 6000 })!
  expect(api.applyResize(changed.intent, changed.request).status).toBe('applied')
  await vi.waitFor(() => expect(api.readOutcome(changed.request)).toMatchObject({ settlement: 'saved' }))
  const applied = api.readOutcome(changed.request)
  expect(api.applyResize({ clipId: 'target-clip', durationMs: 7000 }, changed.request)).toEqual(applied)
  expect(api.applyResize(changed.intent, changed.request)).toEqual(applied)
  expect(writes).toHaveBeenCalledTimes(1)
})
it('refuses missing targets, invalid output and ambiguous free text before inference', () => {
  for (const value of [{ clipId: 'missing', durationMs: 6000 }, { clipId: 'target-clip', durationMs: 0 }, { clipId: 'target-clip', durationMs: 6000, utterance: 'like before' }]) expect(api.beginResizeRequest(crypto.randomUUID(), value)).toBeUndefined()
  expect(writes).not.toHaveBeenCalled()
})
it('preserves another Zone edit and refuses a changed registration under the original id', async () => {
  const expanded = structuredClone(state().resolveEditableShow('typed')!)
  expanded.zones.push({ ...expanded.zones[0], id: 'other-zone', name: 'Other' })
  const other = structuredClone(expanded.composition!.scenes[0].zones[0])
  other.zoneId = 'other-zone'
  for (const layer of other.overlays) { layer.id += '-other'; for (const placement of layer.placements) placement.id += '-other' }
  expanded.composition!.scenes[0].zones.push(other)
  await state().updateShow('typed', expanded)
  const captured = api.beginResizeRequest('resize', { clipId: 'target-clip', durationMs: 6000 })!
  expect(api.beginResizeRequest('resize', { clipId: 'target-clip', durationMs: 7000 })).toBeUndefined()
  const manual = structuredClone(state().resolveEditableShow('typed')!)
  manual.composition!.scenes[0].zones[1].overlays[0].placements[0].durationMs = 7000
  await state().updateShow('typed', manual)
  const expected = structuredClone(state().resolveEditableShow('typed')!)
  expected.composition!.scenes[0].zones[0].overlays[0].placements[0].durationMs = 6000
  expect(api.applyResize(captured.intent, captured.request).status).toBe('applied')
  await vi.waitFor(() => expect(api.readOutcome(captured.request)).toMatchObject({ settlement: 'saved' }))
  expect(durable).toEqual({ ...expected, updatedAt: durable.updatedAt })
  expect(state().resolveEditableShow('typed')).toEqual(durable)
})
