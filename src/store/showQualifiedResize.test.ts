import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { showInitialState, useShowStore } from './showStore'
import { createDefaultShow } from '@/engine/showModel'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { setPersonalContentProvider, resetPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { usePatternStore, patternInitialState } from './patternStore'
import { useLibraryStore, libraryInitialState } from './libraryStore'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { resizeShowClipExactly } from '@/engine/showExactClipResize'
import { validateShowComposition } from '@/engine/showCompositionModel'
import { validateShowAuthoring } from '@/engine/showAuthoringValidation'
import * as authoring from '@/engine/showAuthoringValidation'
import * as dependencies from '@/engine/showResizeDependencies'
import { useMapStore } from './mapStore'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'

function fixture(): ShowRecord {
  const show = createDefaultShow('qualified', 'Qualified', 1)
  show.scenes = [{ ...show.scenes[0], durationMs: 20_000 }]
  show.zones.push({ ...show.zones[0], id: 'second-zone', name: 'Second' })
  show.cells = []
  show.transitions = []
  show.composition = {
    version: 1,
    patternInstances: ['a', 'b'].map(id => ({ id, pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } })),
    scenes: [{ sceneId: show.scenes[0].id, zones: show.zones.map(zone => ({ zoneId: zone.id, main: [], overlays: ['a', 'b'].map(id => ({ id: `${zone.id}-${id}`, name: id, placements: [{ id: `${zone.id}-${id}-clip`, instanceId: id, startMs: 0, durationMs: 4_000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } }] })) })) }],
  }
  return show
}
const store = () => useShowStore.getState()
let durable: ShowRecord
let write: ReturnType<typeof vi.fn>
beforeEach(async () => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  durable = fixture()
  write = vi.fn(async (_id: string, changes: Partial<ShowRecord>) => { durable = { ...durable, ...structuredClone(changes) } })
  setPersonalContentProvider({ id: 'qualified-memory', listShows: async () => [structuredClone(durable)], updateShow: write } as unknown as PersonalContentProvider)
  await store().loadShows()
})
function current() { return store().resolveEditableShow(durable.id)! }
function begin(operationId = 'resize') {
  const sessionId = store().beginShowEditSession(durable.id)
  return store().beginResolvedShowResize(sessionId, { operationId, resize: { clipId: current().composition!.scenes[0].zones[0].overlays[0].placements[0].id, durationMs: 6_000 } })
}
it('replays exact resize on current Show and undo removes only agent work', async () => {
  const pending = begin()
  const manual = structuredClone(current())
  manual.composition!.scenes[0].zones[0].overlays[1].placements[0].view.brightness = 0.3
  await store().updateShow(manual.id, manual)
  const before = structuredClone(current())
  expect(store().admitResolvedShowResize(pending.request).status).toBe('applied')
  const expected = structuredClone(before)
  expected.composition!.scenes[0].zones[0].overlays[0].placements[0].durationMs = 6_000
  expect(current()).toEqual({ ...expected, updatedAt: current().updatedAt })
  await store().undoShow(manual.id)
  expect(current()).toEqual({ ...before, updatedAt: current().updatedAt })
  await store().redoShow(manual.id)
  expect(current()).toEqual({ ...expected, updatedAt: current().updatedAt })
  expect(durable.composition).toEqual(current().composition)
})


function preservation() { return structuredClone({ show: current(), history: store().showHistories, revisions: store().showRevisions, durable, writes: write.mock.calls.length }) }
function refuseUnchanged(request: ReturnType<typeof begin>['request']) {
  const before = preservation()
  expect(store().admitResolvedShowResize(request).status).toBe('refused')
  expect(preservation()).toEqual(before)
}
async function edit(change: (show: ShowRecord) => void) {
  const next = structuredClone(current())
  change(next)
  await store().updateShow(next.id, next)
}

it('preserves a separate Zone manual edit and reopens the durable accepted .pxlshow', async () => {
  // Default fixture has multiple Zones; each has independent authored Layers.
  expect(current().zones.length).toBeGreaterThan(1)
  const pending = begin()
  await edit(show => { show.composition!.scenes[0].zones[1].overlays[0].placements[0].durationMs = 7_000 })
  const manual = structuredClone(current())
  expect(store().admitResolvedShowResize(pending.request).status).toBe('applied')
  await vi.waitFor(() => expect(store().readShowEdit(pending.request.sessionId, pending.request.operationId)?.settlement).toBe('saved'))
  const expected = structuredClone(manual)
  expected.composition!.scenes[0].zones[0].overlays[0].placements[0].durationMs = 6_000
  expect(current()).toEqual({ ...expected, updatedAt: current().updatedAt })
  const { bundle } = buildShowFileBundle(durable, { patterns: [], maps: [] }, { appVersion: 'C1' })
  const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle), { preserveAuthoringPhysicalRanges: true })
  expect(reopened.show).toEqual(current())
})

it.each([
  ['same Layer distant edit', (show: ShowRecord) => { show.composition!.scenes[0].zones[0].overlays[0].placements.push({ ...show.composition!.scenes[0].zones[0].overlays[0].placements[0], id: 'distant', startMs: 15_000, durationMs: 1_000 }) }],
  ['shared instance', (show: ShowRecord) => { show.composition!.patternInstances[0].time.timeScale = 2 }],
  ['Transition', (show: ShowRecord) => { show.composition!.transitions = [{ id: 'new', fromPlacementId: show.composition!.scenes[0].zones[0].overlays[0].placements[0].id, toPlacementId: 'distant', kind: 'crossfade', durationMs: 500, easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }] }],
  ['Scene timing', (show: ShowRecord) => { show.scenes[0].durationMs += 1_000 }],
  ['Layer insert', (show: ShowRecord) => { show.composition!.scenes[0].zones[0].overlays.unshift({ id: 'inserted', name: 'New', placements: [] }) }],
  ['Layer reorder', (show: ShowRecord) => { show.composition!.scenes[0].zones[0].overlays.reverse() }],
  ['Layer removal', (show: ShowRecord) => { show.composition!.scenes[0].zones[0].overlays.pop() }],
  ['target removal', (show: ShowRecord) => { show.composition!.scenes[0].zones[0].overlays[0].placements = [] }],
] as const)('permanently refuses %s even after exact bytes are restored', async (_name, change) => {
  const pending = begin()
  const original = structuredClone(current())
  await edit(change)
  await store().updateShow(original.id, original)
  refuseUnchanged(pending.request)
})

it('detects edit-undo ABA through actual Show history', async () => {
  const pending = begin()
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[0].placements[0].opacity = 0.2 })
  await store().undoShow(durable.id)
  refuseUnchanged(pending.request)
})

it.each(['hydrate', 'reset', 'remove'] as const)('refuses on authoritative %s without extra writes', async action => {
  const pending = begin()
  if (action === 'hydrate') await store().loadShows()
  else if (action === 'reset') useShowStore.setState(showInitialState)
  else {
    getPersonalContentProvider().deleteShow = async () => {}
    await store().removeShow(durable.id)
  }
  refuseUnchanged(pending.request)
})

it.each(['pattern', 'library'] as const)('observes relevant external %s source change-and-restore', async kind => {
  usePatternStore.setState(patternInitialState)
  useLibraryStore.setState(libraryInitialState)
  const provider = getPersonalContentProvider()
  provider.updatePattern = async () => {}
  provider.updateLibrary = async () => {}
  const pattern = { controls: {}, id: 'personal', name: 'Personal', src: 'export function render(index) { Custom.paint(index) }', updatedAt: 1 }
  const library = { id: 'custom', name: 'Custom', src: 'export function paint(index) { rgb(1,0,0) }', updatedAt: 1 }
  usePatternStore.setState({ userPatterns: [pattern] })
  useLibraryStore.setState({ userLibraries: [library] })
  await edit(show => { show.composition!.patternInstances[0].pattern = { kind: 'user', id: pattern.id } })
  const pending = begin()
  expect(pending.status).toBe('pending')
  if (kind === 'pattern') {
    await usePatternStore.getState().updatePatternSrc(pattern.id, 'export function render(index) { rgb(0,1,0) }')
    await usePatternStore.getState().updatePatternSrc(pattern.id, pattern.src)
  } else {
    await useLibraryStore.getState().updateLibrarySrc(library.id, 'export function paint(index) { rgb(0,1,0) }')
    await useLibraryStore.getState().updateLibrarySrc(library.id, library.src)
  }
  refuseUnchanged(pending.request)
})

it('validates a no-op, records one terminal receipt, and adds no history or provider write', () => {
  const sessionId = store().beginShowEditSession(durable.id, 1)
  const intent = { operationId: 'noop', resize: { clipId: current().composition!.scenes[0].zones[0].overlays[0].placements[0].id, durationMs: 4_000 } }
  const pending = store().beginResolvedShowResize(sessionId, intent)
  const before = preservation()
  expect(store().admitResolvedShowResize(pending.request).status).toBe('noop')
  expect(store().admitResolvedShowResize(pending.request).status).toBe('noop')
  expect(store().beginResolvedShowResize(sessionId, intent).status).toBe('noop')
  expect(store().beginResolvedShowResize(sessionId, { ...intent, operationId: 'new' })).toMatchObject({ status: 'refused', reason: 'capacity' })
  expect(preservation()).toEqual(before)
})

it('does not allow a valid-size no-op to skip final authoring validation', async () => {
  await edit(show => { show.composition!.patternInstances[0].controlTargets = { sliderUnknown: 0.5 } })
  const sessionId = store().beginShowEditSession(durable.id)
  const pending = store().beginResolvedShowResize(sessionId, { operationId: 'invalid-noop', resize: { clipId: current().composition!.scenes[0].zones[0].overlays[0].placements[0].id, durationMs: 4_000 } })
  expect(pending.status).toBe('pending')
  refuseUnchanged(pending.request)
})

it('deduplicates pending and applied requests and binds envelopes and stored arguments', async () => {
  const pending = begin()
  const { sessionId, operationId } = pending.request
  const intent = { operationId, resize: { clipId: pending.request.targets[0], durationMs: 6_000 } }
  expect(store().beginResolvedShowResize(sessionId, intent)).toBe(pending)
  expect(store().beginResolvedShowResize(sessionId, { ...intent, resize: { ...intent.resize, durationMs: 7_000 } })).toMatchObject({ reason: 'identity-mismatch' })
  for (const patch of [{ payloadKey: 'other' }, { targets: ['different'] }, { referenceContext: 'different' }, { baseRevision: 100 }, { showId: 'other' }]) {
    refuseUnchanged({ ...pending.request, ...patch })
  }
  expect(store().readShowEdit(sessionId, operationId)).toBe(pending)
  intent.resize.durationMs = 9_000
  expect(store().admitResolvedShowResize(pending.request).status).toBe('applied')
  await vi.waitFor(() => expect(store().readShowEdit(sessionId, operationId)?.settlement).toBe('saved'))
  const before = preservation()
  expect(store().admitResolvedShowResize(pending.request).status).toBe('applied')
  expect(preservation()).toEqual(before)
  expect(current().composition!.scenes[0].zones[0].overlays[0].placements[0].durationMs).toBe(6_000)
})

it.each(['cancel', 'retire'] as const)('releases observation on %s and never revives the request', async action => {
  const pending = begin()
  if (action === 'cancel') store().cancelShowEdit(pending.request.sessionId, pending.request.operationId)
  else store().retireShowEditSession(pending.request.sessionId)
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[0].placements[0].opacity = 0.2 })
  const before = preservation()
  expect(store().admitResolvedShowResize(pending.request).status).toBe(action === 'cancel' ? 'cancelled' : 'retired')
  expect(preservation()).toEqual(before)
})

it('keeps arbitrary callbacks whole-Show guarded and rejects callback use of a resize capability', async () => {
  const pending = begin()
  const evaluate = vi.fn((show: ShowRecord) => ({ ...show, name: 'Callback' }))
  expect(store().admitShowEdit(pending.request, evaluate, () => true).status).toBe('refused')
  expect(evaluate).not.toHaveBeenCalled()
  const broad = store().beginShowEdit(pending.request.sessionId, { operationId: 'broad', payloadKey: 'broad', referenceContext: JSON.stringify(current()), targets: [] })
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[1].placements[0].opacity = 0.2 })
  const before = preservation()
  expect(store().admitShowEdit(broad.request, evaluate, () => true)).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  expect(evaluate).not.toHaveBeenCalled()
  expect(preservation()).toEqual(before)
})

it('refuses unsupported Group context conservatively', async () => {
  await edit(show => {
    show.composition!.groupDefinitions = [{ id: 'g', name: 'Group', patternInstances: [], placements: [] }]
  })
  const before = preservation()
  expect(begin().status).toBe('refused')
  expect(preservation()).toEqual(before)
})

it('validates against the current complete candidate after an unrelated Layer becomes invalid', async () => {
  const pending = begin()
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[1].placements[0].durationMs = 40_000 })
  expect(validateShowAuthoring(current(), { source: ref => DEMOS[ref.id] }).valid).toBe(false)
  refuseUnchanged(pending.request)
})

it('resizes a multi-Scene logical Clip and replays its connected successor on current state', async () => {
  await edit(show => {
    show.scenes[0].durationMs = 10_000
    show.scenes.push({ id: 'second-scene', name: 'Second', durationMs: 10_000 })
    const composition = show.composition!
    const first = composition.scenes[0].zones[0].overlays[0].placements[0]
    first.startMs = 9_000
    first.durationMs = 1_000
    const next = structuredClone(composition.scenes[0])
    next.sceneId = 'second-scene'
    for (const zone of next.zones) for (const layer of zone.overlays) { layer.id += '-second'; layer.placements = [] }
    next.zones[0].overlays[0].placements = [{ ...first, id: `${first.id}--span-second-scene`, logicalClipId: first.id, startMs: 0, durationMs: 3_000 }, { ...first, id: 'successor', startMs: 4_000, durationMs: 2_000 }]
    composition.scenes.push(next)
    composition.transitions = [{ id: 'connected', fromPlacementId: `${first.id}--span-second-scene`, toPlacementId: 'successor', kind: 'crossfade', durationMs: 1_000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
  })
  const pending = begin()
  expect(validateShowComposition(current(), current().composition!)).toEqual([])
  expect(resizeShowClipExactly(current(), current().composition!, { clipId: pending.request.targets[0], durationMs: 6_000 }).status).toBe('changed')
  expect(pending.status).toBe('pending')
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[1].placements[0].opacity = 0.25 })
  const expected = structuredClone(current())
  expected.composition!.scenes[1].zones[0].overlays[0].placements[0].durationMs = 5_000
  expected.composition!.scenes[1].zones[0].overlays[0].placements[1].startMs = 6_000
  expect(store().admitResolvedShowResize(pending.request).status).toBe('applied')
  expect(current()).toEqual({ ...expected, updatedAt: current().updatedAt })
  expect(validateShowAuthoring(current(), { source: ref => DEMOS[ref.id] }).valid).toBe(true)
  await vi.waitFor(() => expect(store().readShowEdit(pending.request.sessionId, pending.request.operationId)?.settlement).toBe('saved'))
  const { bundle } = buildShowFileBundle(durable, { patterns: [], maps: [] }, { appVersion: 'C1' })
  const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle))
  expect(reopened.show).toEqual(current())
})

it('guards Scene-local Layer ordering even when only a later Scene changes', async () => {
  await edit(show => {
    show.scenes.push({ id: 'second-scene', name: 'Second', durationMs: 20_000 })
    const scene = structuredClone(show.composition!.scenes[0])
    scene.sceneId = 'second-scene'
    for (const zone of scene.zones) for (const layer of zone.overlays) { layer.id += '-second'; layer.placements = layer.placements.map(clip => ({ ...clip, id: `${clip.id}-second` })) }
    show.composition!.scenes.push(scene)
  })
  const pending = begin()
  await edit(show => { show.composition!.scenes[1].zones[0].overlays.reverse() })
  refuseUnchanged(pending.request)
})

it('releases all bounded subscriptions after cancellation, no-op and retirement', () => {
  const stops: ReturnType<typeof vi.fn>[] = []
  const original = usePatternStore.subscribe
  const tracked = vi.spyOn(usePatternStore, 'subscribe').mockImplementation(listener => {
    const stop = vi.fn(original(listener))
    stops.push(stop)
    return stop
  })
  try {
    const pending = begin()
    expect(stops).toHaveLength(1)
    store().cancelShowEdit(pending.request.sessionId, pending.request.operationId)
    expect(stops[0]).toHaveBeenCalledTimes(1)
    const session = store().beginShowEditSession(durable.id)
    const noop = store().beginResolvedShowResize(session, { operationId: 'noop', resize: { clipId: pending.request.targets[0], durationMs: 4_000 } })
    store().admitResolvedShowResize(noop.request)
    expect(stops[1]).toHaveBeenCalledTimes(1)
    begin()
    store().beginShowEditSession(durable.id)
    expect(stops[2]).toHaveBeenCalledTimes(1)
  } finally { tracked.mockRestore() }
})

function deferredWrite() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
it('reports superseded saving and preserves a later manual edit', async () => {
  const pending = begin()
  const gate = deferredWrite()
  write.mockImplementationOnce(async () => gate.promise)
  expect(store().admitResolvedShowResize(pending.request)).toMatchObject({ status: 'applied', settlement: 'saving' })
  const next = structuredClone(current())
  next.composition!.scenes[0].zones[0].overlays[1].placements[0].opacity = 0.2
  const saved = store().updateShow(next.id, next)
  gate.resolve()
  await saved
  expect(store().readShowEdit(pending.request.sessionId, pending.request.operationId)?.settlement).toBe('superseded')
  expect(current()).toEqual({ ...next, updatedAt: current().updatedAt })
  expect(durable.composition).toEqual(current().composition)
})

it('rolls back a failed adoption, refuses pending work, and accepts an explicit exact retry', async () => {
  const pending = begin()
  const before = structuredClone(current())
  const beforeHistory = { [durable.id]: { past: [], future: [] } }
  const gate = deferredWrite()
  write.mockImplementationOnce(async () => gate.promise)
  store().admitResolvedShowResize(pending.request)
  const other = store().beginResolvedShowResize(pending.request.sessionId, { operationId: 'during-save', resize: { clipId: current().composition!.scenes[0].zones[0].overlays[1].placements[0].id, durationMs: 5_000 } })
  expect(other.status).toBe('pending')
  const token = store().acquireShowEditActivity(pending.request.sessionId, durable.id, 'drag')!
  expect(store().admitResolvedShowResize(other.request).status).toBe('waiting')
  gate.reject(new Error('Save failed'))
  await vi.waitFor(() => expect(store().readShowEdit(pending.request.sessionId, pending.request.operationId)?.settlement).toBe('rolled-back'))
  expect(current()).toEqual(before)
  expect(store().showHistories).toEqual(beforeHistory)
  refuseUnchanged(other.request)
  const retry = store().beginResolvedShowResize(pending.request.sessionId, { operationId: 'retry', retryOf: pending.request.operationId, resize: { clipId: pending.request.targets[0], durationMs: 6_000 } })
  expect(retry.status).toBe('pending')
  expect(store().admitResolvedShowResize(retry.request).status).toBe('waiting')
  store().releaseShowEditActivity(token)
  expect(store().readShowEditCandidate(retry.request.sessionId, retry.request.operationId)?.status).toBe('applied')
  await vi.waitFor(() => expect(store().readShowEdit(retry.request.sessionId, retry.request.operationId)?.settlement).toBe('saved'))
  expect(store().showHistories[durable.id].past).toEqual([before])
})

it('explicit retry uses current dependencies but retains the original logical target and exact request', async () => {
  const pending = begin()
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[0].placements[0].opacity = 0.2 })
  refuseUnchanged(pending.request)
  await edit(show => { show.composition!.scenes[0].zones[0].overlays.reverse() })
  const retryInput = { operationId: 'fresh-retry', retryOf: pending.request.operationId, resize: { clipId: pending.request.targets[0], durationMs: 6_000 } }
  const retry = store().beginResolvedShowResize(pending.request.sessionId, retryInput)
  expect(retry.status).toBe('pending')
  expect(retry.request.referenceContext).toBe(pending.request.referenceContext)
  expect(retry.request.baseRevision).toBeGreaterThan(pending.request.baseRevision)
  const before = structuredClone(current())
  expect(store().admitResolvedShowResize(retry.request).status).toBe('applied')
  const expected = structuredClone(before)
  expected.composition!.scenes[0].zones[0].overlays.flatMap(layer => layer.placements).find(clip => clip.id === pending.request.targets[0])!.durationMs = 6_000
  expect(current()).toEqual({ ...expected, updatedAt: current().updatedAt })
  await vi.waitFor(() => expect(store().readShowEdit(retry.request.sessionId, retry.request.operationId)?.settlement).toBe('saved'))
})

it('retry refuses a deleted original target and cannot substitute another Clip', async () => {
  const pending = begin()
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[0].placements = [] })
  refuseUnchanged(pending.request)
  const before = preservation()
  const retry = { operationId: 'retry-deleted', retryOf: pending.request.operationId, resize: { clipId: pending.request.targets[0], durationMs: 6_000 } }
  expect(store().beginResolvedShowResize(pending.request.sessionId, retry).status).toBe('refused')
  expect(store().beginResolvedShowResize(pending.request.sessionId, { ...retry, operationId: 'retarget', resize: { ...retry.resize, clipId: current().composition!.scenes[0].zones[0].overlays[1].placements[0].id } })).toMatchObject({ reason: 'invalid-retry' })
  expect(preservation()).toEqual(before)
})

it('guards a distant existing Clip anywhere on the same logical Layer', async () => {
  await edit(show => {
    const layer = show.composition!.scenes[0].zones[0].overlays[0]
    layer.placements.push({ ...layer.placements[0], id: 'distant', startMs: 15_000, durationMs: 1_000 })
  })
  const pending = begin()
  const original = structuredClone(current())
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[0].placements[1].opacity = 0.2 })
  await store().updateShow(original.id, original)
  refuseUnchanged(pending.request)
})

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses invalid exact duration %s without side effects', durationMs => {
  const session = store().beginShowEditSession(durable.id)
  const before = preservation()
  expect(store().beginResolvedShowResize(session, { operationId: 'invalid-range', resize: { clipId: current().composition!.scenes[0].zones[0].overlays[0].placements[0].id, durationMs } }).status).toBe('refused')
  expect(preservation()).toEqual(before)
})

it('does not let a dependency change become successful merely because the requested size is already present', async () => {
  const pending = begin()
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[0].placements[0].durationMs = 6_000 })
  refuseUnchanged(pending.request)
})

it('caps qualified pending operations in the existing shared session table', () => {
  const session = store().beginShowEditSession(durable.id, 1)
  const intent = { operationId: 'first', resize: { clipId: current().composition!.scenes[0].zones[0].overlays[0].placements[0].id, durationMs: 6_000 } }
  const first = store().beginResolvedShowResize(session, intent)
  expect(first.status).toBe('pending')
  expect(store().beginResolvedShowResize(session, { ...intent, operationId: 'second' })).toMatchObject({ reason: 'capacity' })
  store().cancelShowEdit(session, 'first')
  expect(store().beginResolvedShowResize(session, { ...intent, operationId: 'third' })).toMatchObject({ reason: 'capacity' })
})

it('invalidates qualified stock draft work on the authoritative reset action', () => {
  const id = STOCK_SHOWS[0].show.id
  const draft = { ...fixture(), id }
  useShowStore.setState({ stockShowDrafts: { [id]: draft } })
  const session = store().beginShowEditSession(id)
  const pending = store().beginResolvedShowResize(session, { operationId: 'stock-reset', resize: { clipId: draft.composition!.scenes[0].zones[0].overlays[0].placements[0].id, durationMs: 6_000 } })
  expect(pending.status).toBe('pending')
  const token = store().acquireShowEditActivity(session, id, 'dirty-field')!
  expect(store().admitResolvedShowResize(pending.request).status).toBe('waiting')
  store().resetStockShowDraft(id)
  store().releaseShowEditActivity(token)
  const before = structuredClone({ draft: store().resolveEditableShow(id), history: store().showHistories, writes: write.mock.calls })
  expect(store().admitResolvedShowResize(pending.request).status).toBe('refused')
  expect({ draft: store().resolveEditableShow(id), history: store().showHistories, writes: write.mock.calls }).toEqual(before)
})

it('qualifies Main independently of an Overlay manual edit', async () => {
  await edit(show => {
    const zone = show.composition!.scenes[0].zones[0]
    zone.main = zone.overlays.shift()!.placements
  })
  const session = store().beginShowEditSession(durable.id)
  const pending = store().beginResolvedShowResize(session, { operationId: 'main', resize: { clipId: current().composition!.scenes[0].zones[0].main[0].id, durationMs: 6_000 } })
  expect(pending.status).toBe('pending')
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[0].placements[0].opacity = 0.2 })
  const expected = structuredClone(current())
  expected.composition!.scenes[0].zones[0].main[0].durationMs = 6_000
  expect(store().admitResolvedShowResize(pending.request).status).toBe('applied')
  expect(current()).toEqual({ ...expected, updatedAt: current().updatedAt })
})

it('waits for overlapping input and preserves an independent Layer edit through resize and undo', async () => {
  const pending = begin()
  const { sessionId, operationId, showId } = pending.request
  const drag = store().acquireShowEditActivity(sessionId, showId, 'drag')!
  const dirty = store().acquireShowEditActivity(sessionId, showId, 'dirty-field')!
  const before = preservation()
  expect(store().admitResolvedShowResize(pending.request).status).toBe('waiting')
  expect(preservation()).toEqual(before)
  store().releaseShowEditActivity(drag)
  expect(store().readShowEditCandidate(sessionId, operationId)?.status).toBe('waiting')
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[1].placements[0].view.brightness = 0.3 })
  const manual = preservation()
  expect(store().admitResolvedShowResize(pending.request).status).toBe('waiting')
  expect(preservation()).toEqual(manual)
  store().releaseShowEditActivity(dirty)
  await vi.waitFor(() => expect(store().readShowEditCandidate(sessionId, operationId)).toMatchObject({ status: 'applied', settlement: 'saved' }))
  const expected = structuredClone(manual.show)
  expected.composition!.scenes[0].zones[0].overlays[0].placements[0].durationMs = 6_000
  expect(current()).toEqual({ ...expected, updatedAt: current().updatedAt })
  expect(write).toHaveBeenCalledTimes(2)
  const { bundle } = buildShowFileBundle(durable, { patterns: [], maps: [] }, { appVersion: 'C2' })
  expect((await parseShowFileBundle(await serializeShowFileBundle(bundle))).show).toEqual(current())
  const adopted = preservation()
  expect(store().admitResolvedShowResize(pending.request).status).toBe('applied')
  expect(preservation()).toEqual(adopted)
  await store().undoShow(showId)
  expect(current()).toEqual({ ...manual.show, updatedAt: current().updatedAt })
})

describe('qualified resize waiting lifetime', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }) })
  afterEach(() => {
    store().beginShowEditSession(durable.id)
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  function waiting() {
    const receipt = begin()
    const token = store().acquireShowEditActivity(receipt.request.sessionId, durable.id, 'dirty-field')!
    expect(store().admitResolvedShowResize(receipt.request)).toMatchObject({ status: 'waiting', deadline: 5000 })
    return { request: receipt.request, token }
  }
  function read(request: ReturnType<typeof begin>['request']) { return store().readShowEditCandidate(request.sessionId, request.operationId) }

  it.each([4999, 5000, 5001])('settles at monotonic %i with delayed timers and never repeats adoption', async now => {
    const { request, token } = waiting()
    const before = preservation()
    vi.spyOn(performance, 'now').mockReturnValue(now)
    store().releaseShowEditActivity(token)
    if (now < 5000) {
      expect(read(request)?.status).toBe('applied')
      await vi.advanceTimersByTimeAsync(0)
      expect(write).toHaveBeenCalledTimes(1)
      expect(store().showHistories[durable.id].past).toEqual([before.show])
    } else {
      expect(read(request)).toMatchObject({ status: 'refused', reason: 'interaction-timeout' })
      expect(preservation()).toEqual(before)
    }
    const after = preservation()
    store().releaseShowEditActivity(token)
    store().admitResolvedShowResize(request)
    expect(preservation()).toEqual(after)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains its original deadline through duplicate delivery and overlapping new activity', () => {
    const { request, token } = waiting()
    vi.advanceTimersByTime(4000)
    const second = store().acquireShowEditActivity(request.sessionId, durable.id, 'drag')!
    store().releaseShowEditActivity(token)
    expect(store().admitResolvedShowResize(request)).toMatchObject({ status: 'waiting', deadline: 5000 })
    const before = preservation()
    vi.advanceTimersByTime(1000)
    expect(read(request)).toMatchObject({ reason: 'interaction-timeout' })
    store().releaseShowEditActivity(second)
    expect(preservation()).toEqual(before)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([false, true])('slow final authoring validation has a deadline only after actual waiting: %s', async waited => {
    const pending = begin()
    const before = preservation()
    const token = waited ? store().acquireShowEditActivity(pending.request.sessionId, durable.id, 'drag')! : undefined
    const real = authoring.validateShowAuthoring
    vi.spyOn(authoring, 'validateShowAuthoring').mockImplementation((...args) => {
      const result = real(...args)
      vi.spyOn(performance, 'now').mockReturnValue(6000)
      return result
    })
    const result = store().admitResolvedShowResize(pending.request)
    if (token) {
      expect(result.status).toBe('waiting')
      vi.advanceTimersByTime(4999)
      store().releaseShowEditActivity(token)
      expect(read(pending.request)).toMatchObject({ reason: 'interaction-timeout' })
      expect(preservation()).toEqual(before)
    } else {
      expect(result.status).toBe('applied')
      await vi.advanceTimersByTimeAsync(0)
      expect(write).toHaveBeenCalledTimes(1)
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['layer', 'undo', 'pattern', 'library', 'map', 'cancel', 'hydrate', 'remove', 'reset', 'retire', 'complete'] as const)('promptly discards waiting resources on %s', async mode => {
    const originalSubscribe = usePatternStore.subscribe
    const stop = vi.fn()
    vi.spyOn(usePatternStore, 'subscribe').mockImplementation(listener => {
      const unsubscribe = originalSubscribe(listener)
      return () => { stop(); unsubscribe() }
    })
    const { request, token } = waiting()
    if (mode === 'layer' || mode === 'undo') {
      await edit(show => { show.composition!.scenes[0].zones[0].overlays[0].placements[0].opacity = 0.2 })
      if (mode === 'undo') await store().undoShow(durable.id)
    }
    if (mode === 'pattern') usePatternStore.setState({ userPatterns: [...usePatternStore.getState().userPatterns] })
    if (mode === 'library') useLibraryStore.setState({ userLibraries: [...useLibraryStore.getState().userLibraries] })
    if (mode === 'map') useMapStore.setState({ userMaps: [...useMapStore.getState().userMaps] })
    if (mode === 'cancel') store().cancelShowEdit(request.sessionId, request.operationId)
    if (mode === 'hydrate') await store().loadShows()
    if (mode === 'remove') { getPersonalContentProvider().deleteShow = async () => {}; await store().removeShow(durable.id) }
    if (mode === 'reset') useShowStore.setState(showInitialState)
    if (mode === 'retire') store().retireShowEditSession(request.sessionId)
    if (mode === 'complete') store().completeShowEdit(request, 'asked')
    expect(vi.getTimerCount()).toBe(0)
    expect(stop).toHaveBeenCalledTimes(1)
    const before = preservation()
    store().releaseShowEditActivity(token)
    vi.advanceTimersByTime(6000)
    expect(preservation()).toEqual(before)
    expect(store().admitResolvedShowResize(request).status).not.toBe('applied')
  })

  it('metadata invalidation preserves active input for a fresh qualified request', () => {
    const { request, token } = waiting()
    useMapStore.setState({ userMaps: [...useMapStore.getState().userMaps] })
    expect(vi.getTimerCount()).toBe(0)
    const next = store().beginResolvedShowResize(request.sessionId, { operationId: 'next', resize: { clipId: request.targets[0], durationMs: 6000 } })
    expect(store().admitResolvedShowResize(next.request).status).toBe('waiting')
    expect(write).not.toHaveBeenCalled()
    store().releaseShowEditActivity(token)
    expect(read(next.request)?.status).toBe('applied')
  })

  it('timeout releases qualified observers immediately', () => {
    const original = usePatternStore.subscribe
    const stop = vi.fn()
    vi.spyOn(usePatternStore, 'subscribe').mockImplementation(listener => {
      const unsubscribe = original(listener)
      return () => { stop(); unsubscribe() }
    })
    waiting()
    vi.advanceTimersByTime(5000)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(write).not.toHaveBeenCalled()
  })

  it('wrong envelopes and broad callback delivery cannot replace or bypass the wait', () => {
    const { request, token } = waiting()
    const before = preservation()
    for (const patch of [{ payloadKey: 'other' }, { targets: ['other'] }, { baseRevision: 100 }, { showId: 'other' }]) {
      expect(store().admitResolvedShowResize({ ...request, ...patch }).status).toBe('refused')
    }
    const evaluate = vi.fn((show: ShowRecord) => ({ ...show, name: 'Bypass' }))
    expect(store().admitShowEdit(request, evaluate, () => true).status).toBe('refused')
    expect(store().deliverShowEditCandidate(request, current(), () => true).status).toBe('refused')
    expect(evaluate).not.toHaveBeenCalled()
    expect(read(request)?.status).toBe('waiting')
    expect(preservation()).toEqual(before)
    store().releaseShowEditActivity(token)
    expect(read(request)?.status).toBe('applied')
  })

  it('validates and deduplicates a waiting no-op at the original operation capacity', () => {
    const session = store().beginShowEditSession(durable.id, 1)
    const intent = { operationId: 'noop', resize: { clipId: current().composition!.scenes[0].zones[0].overlays[0].placements[0].id, durationMs: 4000 } }
    const request = store().beginResolvedShowResize(session, intent).request
    const token = store().acquireShowEditActivity(session, durable.id, 'drag')!
    const before = preservation()
    expect(store().admitResolvedShowResize(request).status).toBe('waiting')
    store().releaseShowEditActivity(token)
    expect(store().admitResolvedShowResize(request).status).toBe('noop')
    expect(store().beginResolvedShowResize(session, { ...intent, operationId: 'new' })).toMatchObject({ reason: 'capacity' })
    expect(preservation()).toEqual(before)
  })
})

it('checks stale qualification before active input can queue it', async () => {
  const pending = begin()
  const token = store().acquireShowEditActivity(pending.request.sessionId, durable.id, 'drag')!
  await edit(show => { show.composition!.scenes[0].zones[0].overlays[0].placements[0].opacity = 0.3 })
  const before = preservation()
  expect(store().admitResolvedShowResize(pending.request)).toMatchObject({ reason: 'revision-conflict' })
  store().releaseShowEditActivity(token)
  expect(preservation()).toEqual(before)
})

it('captures delivery arrival before readiness preparation when input is active', () => {
  const pending = begin()
  const token = store().acquireShowEditActivity(pending.request.sessionId, durable.id, 'drag')!
  const before = preservation()
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
  const original = globalThis.structuredClone
  const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementation(value => {
    const result = original(value)
    clock.mockReturnValue(5000)
    return result
  })
  try {
    expect(store().admitResolvedShowResize(pending.request)).toMatchObject({ reason: 'interaction-timeout' })
    store().releaseShowEditActivity(token)
    expect(preservation()).toEqual(before)
  } finally { clone.mockRestore(); clock.mockRestore() }
})

it('refuses if final dependency qualification crosses the armed deadline', () => {
  const pending = begin()
  const token = store().acquireShowEditActivity(pending.request.sessionId, durable.id, 'drag')!
  const before = preservation()
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
  const original = dependencies.showResizeDependencyContext
  let calls = 0
  const context = vi.spyOn(dependencies, 'showResizeDependencyContext').mockImplementation((...args) => {
    const result = original(...args)
    if (++calls === 3) clock.mockReturnValue(5000)
    return result
  })
  try {
    expect(store().admitResolvedShowResize(pending.request).status).toBe('waiting')
    store().releaseShowEditActivity(token)
    expect(store().readShowEditCandidate(pending.request.sessionId, pending.request.operationId)).toMatchObject({ reason: 'interaction-timeout' })
    expect(preservation()).toEqual(before)
  } finally { context.mockRestore(); clock.mockRestore() }
})

it('refuses broad delivery and invalidation without consuming qualified resize authority', () => {
  const pending = begin()
  expect(store().deliverShowEditCandidate(pending.request, current(), () => true)).toMatchObject({ status: 'refused' })
  expect(store().invalidateShowEditCandidate(pending.request)).toMatchObject({ status: 'refused' })
  expect(store().readShowEdit(pending.request.sessionId, pending.request.operationId)?.status).toBe('pending')
  expect(store().admitResolvedShowResize(pending.request).status).toBe('applied')
})
