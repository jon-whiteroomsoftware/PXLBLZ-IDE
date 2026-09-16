import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import * as stage from '../engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotLayerEdit } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
import { materializeShowGroupsV2 } from '../engine/showGroupsV2'
import { layerReferences, type ShowLayerEditIntentV2, type ShowLayerReassignmentV2 } from '../engine/showLayersV2'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2 } from '../engine/showCompositionV2'
import { buildShowEpeExportV2 } from '../engine/showEpeExportV2'
import { parseEpe } from '../engine/epeImport'
import { emitFixedPoint } from '../engine/fxEmit'
import { createFastReplayRuntime } from '../engine/fastReplay'
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

function setup(empty = false) {
  const c = convertShowRecordV1ToV2(convertibleV1Show()); if (c.status !== 'converted') throw Error('fixture')
  const record = c.record; record.composition.transitions = []; record.composition.clips = record.composition.clips.slice(0, 1)
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  if (empty) record.composition.clips = []
  const dependencies = { patterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(1,0,0)}', controls: {}, updatedAt: 1 }], maps: [], libraries: [], profiles: [], stageMap: null }
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'layer-test', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const context = () => { const current = useShowStore.getState().showV2Pilots[record.id], provider = getPersonalContentProvider(); return { showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0, capture: { record: current, dependencies, prepared: stage.prepareShowStageV2(current, dependencies) }, isCurrent: () => getPersonalContentProvider() === provider, onAdopted: vi.fn() } }
  return { record, context, write, saved: () => saved }
}
it.each([false, true])('adds an empty named Layer with one checked preparation/history/save and preserves empty=%s capability', async empty => {
  const { record, context, write, saved } = setup(empty); const before = structuredClone(record); const capture = context()
  const prepare = vi.spyOn(stage, 'prepareShowStageV2')
  try {
    const outcome = await admitShowV2PilotLayerEdit({ ...capture, intent: { kind: 'add', layer: { id: 'new-layer', zoneId: record.zones[0].id, name: 'Countervoice', rank: 10 } } })
    expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved', affectedLayerIds: ['new-layer'], affectedClipIds: [], affectedInstanceIds: [] })
    expect(prepare).toHaveBeenCalledTimes(1); expect(write).toHaveBeenCalledTimes(1)
    expect(record).toEqual(before); expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([before])
    expect(saved().composition.layers.find(layer => layer.id === 'new-layer')?.name).toBe('Countervoice')
    expect(stage.prepareShowStageV2(saved(), capture.capture.dependencies).status).toBe(empty ? 'empty' : 'ready')
  } finally { prepare.mockRestore() }
})

function noEffects(result: Awaited<ReturnType<typeof admitShowV2PilotLayerEdit>>) {
  for (const [key, value] of Object.entries(result)) if (key.startsWith('affected') || key === 'removedIds' || key === 'discardedControlTargets') expect(value, key).toEqual([])
}
const malformed = [null, {}, [], { kind: 'unknown' }, { kind: 'add' }, { kind: 'add', layer: null },
  { kind: 'add', layer: { id: 'new', zoneId: 'zone', name: 'New', rank: NaN } },
  { kind: 'add', layer: { id: 'new', zoneId: 'zone', name: 'New', rank: 2, hidden: true } },
  { kind: 'rename', zoneId: 'zone', layerId: 'missing', name: ' ' },
  { kind: 'rename', zoneId: 'zone', layerId: 'missing', name: 'Name', hidden: true },
  { kind: 'reorder', zoneId: 'zone', layerIds: null }, { kind: 'reorder', zoneId: 'zone', layerIds: [''] },
  { kind: 'reorder', zoneId: 'zone', layerIds: new Array(1) },
  { kind: 'remove', zoneId: 'zone', layerId: 'missing', reassignments: null },
  { kind: 'remove', zoneId: 'zone', layerId: 'missing', reassignments: [null] },
  { kind: 'remove', zoneId: 'zone', layerId: 'missing', reassignments: [{ kind: 'clip', clipId: 'c', layerId: 'd', hidden: true }] },
  { kind: 'remove', zoneId: 'zone', layerId: 'missing', reassignments: [{ kind: 'group-layer-binding', groupOccurrenceId: 'g', layerId: 'd' }] },
  { kind: 'remove', zoneId: 'zone', layerId: 'missing', reassignments: [{ kind: 'transition-participant', transitionId: 't', participantId: '', layerId: 'd' }] },
]
it.each(malformed.map((intent, index) => ({ intent, index })))('refuses malformed runtime Layer intent $index before preparation/adoption', async ({ intent }) => {
  const { record, context, write } = setup(); const captured = context(); const before = structuredClone(record)
  const prepare = vi.spyOn(stage, 'prepareShowStageV2')
  try {
    const outcome = await admitShowV2PilotLayerEdit({ ...captured, intent: intent as never })
    expect(outcome).toMatchObject({ status: 'refused', source: 'owner', code: 'invalid-request' }); noEffects(outcome)
    expect(prepare).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(record).toEqual(before)
    expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record); expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  } finally { prepare.mockRestore() }
})
it('keeps same name and identical sparse order true no-ops with zero preparation/history/save', async () => {
  const { record, context, write } = setup(); record.composition.layers.forEach((layer, i) => { layer.rank = i * 5 + 3 })
  const layer = record.composition.layers[0]; const captured = context(); const prepare = vi.spyOn(stage, 'prepareShowStageV2')
  try {
    for (const intent of [{ kind: 'rename', zoneId: layer.zoneId, layerId: layer.id, name: layer.name }, { kind: 'reorder', zoneId: layer.zoneId, layerIds: record.composition.layers.filter(l => l.zoneId === layer.zoneId).sort((a, b) => a.rank - b.rank).map(l => l.id) }] as ShowLayerEditIntentV2[]) {
      const result = await admitShowV2PilotLayerEdit({ ...captured, intent }); expect(result.status).toBe('unchanged'); noEffects(result)
    }
    expect(prepare).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  } finally { prepare.mockRestore() }
})
it.each(['record', 'revision', 'provider', 'route'] as const)('refuses stale captured Layer submission after %s replacement', async partition => {
  const { record, context, write } = setup(); const captured = context(); const layer = record.composition.layers[0]
  if (partition === 'record') useShowStore.setState({ showV2Pilots: { [record.id]: { ...record, name: 'External' } } })
  if (partition === 'revision') useShowStore.setState({ showRevisions: { [record.id]: 1 } })
  if (partition === 'provider') setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'external' })
  if (partition === 'route') captured.isCurrent = () => false
  const current = useShowStore.getState().showV2Pilots[record.id]
  const result = await admitShowV2PilotLayerEdit({ ...captured, intent: { kind: 'rename', zoneId: layer.zoneId, layerId: layer.id, name: 'Renamed' } })
  expect(result).toMatchObject({ status: 'refused', code: 'stale-edit' }); noEffects(result)
  expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(current)
})
it('refuses candidate preparation before save without replacing the current record', async () => {
  const { record, context, write } = setup(); const captured = context(); const layer = record.composition.layers[0]
  const prepare = vi.spyOn(stage, 'prepareShowStageV2').mockReturnValue({ status: 'refused', message: 'Known preparation boundary' })
  try {
    const result = await admitShowV2PilotLayerEdit({ ...captured, intent: { kind: 'rename', zoneId: layer.zoneId, layerId: layer.id, name: 'Renamed' } })
    expect(result).toMatchObject({ status: 'refused', source: 'admission', message: 'Known preparation boundary' }); noEffects(result)
    expect(prepare).toHaveBeenCalledTimes(1); expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  } finally { prepare.mockRestore() }
})

function held(record: ShowRecordV2, targetStart: number) {
  const ordinary = record.composition.clips[0], sourceId = 'held-source', targetId = ordinary.layerId
  ordinary.durationMs = 100
  record.composition.layers.push({ id: sourceId, zoneId: ordinary.zoneId, name: 'Held', rank: 9 })
  const { zoneId: _zoneId, ...child } = structuredClone(ordinary)
  record.composition.groupDefinitions = [{ id: 'group', name: 'Held Group', layers: [{ id: 'local', name: 'Local', rank: 0 }, { id: 'unused', name: 'Unused', rank: 1 }],
    patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }], clips: [{ ...child, id: 'child', instanceId: 'slot', layerId: 'local', startMs: 0, durationMs: 200 }], transitions: [], propertyTracks: [] }]
  record.composition.groupOccurrences = [{ id: 'held-use', definitionId: 'group', layoutOccurrenceId: record.composition.layoutOccurrences[0].id, zoneId: ordinary.zoneId, startMs: 200,
    translationX: 0, translationY: 0, holds: [{ id: 'pause', localTimeMs: 100, durationMs: 100 }], instanceBindings: { slot: ordinary.instanceId },
    layerBindings: [{ definitionLayerId: 'local', layerId: sourceId }, { definitionLayerId: 'unused', layerId: sourceId }] }]
  record.composition.clips.push({ ...structuredClone(ordinary), id: 'target', startMs: targetStart, durationMs: 100, appearance: { keys: [{ ...structuredClone(ordinary.appearance.keys[0]), timeMs: targetStart }] } })
  return { sourceId, targetId }
}
it.each([499, 500])('checks held Group through500 and all unused binding references at target start%s', async start => {
  const { record, context, write, saved } = setup(); const { sourceId, targetId } = held(record, start); const captured = context()
  expect(captured.capture.prepared.status).toBe('ready'); const before = structuredClone(record)
  expect(materializeShowGroupsV2(record).composition.clips.find(clip => clip.id === 'held-use:child')).toMatchObject({ startMs: 200, durationMs: 300, instanceId: record.composition.clips[0].instanceId })
  const incomplete = await admitShowV2PilotLayerEdit({ ...captured, intent: { kind: 'remove', zoneId: 'zone', layerId: sourceId, reassignments: [{ kind: 'group-layer-binding', groupOccurrenceId: 'held-use', definitionLayerId: 'local', layerId: targetId }] } })
  expect(incomplete).toMatchObject({ status: 'refused', code: 'incomplete-reassignment' }); noEffects(incomplete); expect(write).not.toHaveBeenCalled()
  const reassignments: ShowLayerReassignmentV2[] = ['local', 'unused'].map(definitionLayerId => ({ kind: 'group-layer-binding', groupOccurrenceId: 'held-use', definitionLayerId, layerId: targetId }))
  const result = await admitShowV2PilotLayerEdit({ ...captured, intent: { kind: 'remove', zoneId: 'zone', layerId: sourceId, reassignments } })
  if (start === 499) { expect(result).toMatchObject({ status: 'refused', code: 'invalid-result' }); noEffects(result); expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record) }
  else { expect(result).toMatchObject({ status: 'applied', affectedGroupOccurrenceIds: ['held-use'], removedIds: [sourceId] }); expect(write).toHaveBeenCalledTimes(1)
    expect(saved().composition.groupDefinitions).toEqual(before.composition.groupDefinitions); expect(saved().composition.groupOccurrences[0].holds).toEqual(before.composition.groupOccurrences[0].holds)
    expect(materializeShowGroupsV2(saved()).composition.clips.find(clip => clip.id === 'held-use:child')).toMatchObject({ layerId: targetId, durationMs: 300, instanceId: record.composition.clips[0].instanceId }) }
  expect(record).toEqual(before)
})
it('preserves attached Transition endpoints only with complete coherent authored reassignment', async () => {
  const { record, context, write, saved } = setup(); const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade')); if (converted.status !== 'converted') throw Error('transition')
  record.composition = converted.record.composition
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  const source = record.composition.clips[0].layerId, target = record.composition.layers.find(layer => layer.id !== source)!.id, captured = context()
  expect(captured.capture.prepared.status).toBe('ready'); const before = structuredClone(record)
  const plans = layerReferences(record, source).map(reference => {
    if (reference.kind === 'clip') return { kind: reference.kind, clipId: reference.clipId, layerId: target }
    if (reference.kind === 'transition-participant') return { kind: reference.kind, transitionId: reference.transitionId, participantId: reference.participantId, layerId: target }
    throw Error('fixture')
  })
  const partial = await admitShowV2PilotLayerEdit({ ...captured, intent: { kind: 'remove', zoneId: 'zone', layerId: source, reassignments: plans.filter(plan => plan.kind === 'clip') } })
  expect(partial).toMatchObject({ status: 'refused', code: 'incomplete-reassignment' }); noEffects(partial); expect(write).not.toHaveBeenCalled()
  const result = await admitShowV2PilotLayerEdit({ ...captured, intent: { kind: 'remove', zoneId: 'zone', layerId: source, reassignments: plans } })
  expect(result.status).toBe('applied'); expect(write).toHaveBeenCalledTimes(1); expect(saved().composition.transitions[0]).toEqual({ ...before.composition.transitions[0], participants: before.composition.transitions[0].participants.map(participant => ({ ...participant, layerId: target })) })
  expect(saved().composition.clips.map(clip => [clip.id, clip.startMs, clip.instanceId])).toEqual(before.composition.clips.map(clip => [clip.id, clip.startMs, clip.instanceId]))
})

it.each(['fast', 'fidelity'] as const)('reopened native EPE delivers independently expected stacking and unchanged runtime/Restart state in%s', async fidelity => {
  const { record, context, write, saved } = setup()
  const ordinary = record.composition.clips[0], redId = ordinary.layerId, blueId = record.composition.layers.find(layer => layer.id !== redId)!.id
  ordinary.entryPolicy = 'restart'
  const red = record.composition.patternInstances.find(instance => instance.id === ordinary.instanceId)!
  record.composition.patternInstances.push({ ...structuredClone(red), id: 'blue-runtime', pattern: { kind: 'user', id: 'blue' } })
  record.composition.clips.push({ ...structuredClone(ordinary), id: 'blue-clip', instanceId: 'blue-runtime', layerId: blueId })
  const captured = context()
  captured.capture.dependencies.patterns[0].src = 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(1,0,0)}'
  captured.capture.dependencies.patterns.push({ id: 'blue', name: 'Blue', src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(0,0,1)}', controls: {}, updatedAt: 1 })
  captured.capture.prepared = stage.prepareShowStageV2(record, captured.capture.dependencies)
  expect(captured.capture.prepared.status).toBe('ready'); const before = structuredClone(record)
  const result = await admitShowV2PilotLayerEdit({ ...captured, intent: { kind: 'reorder', zoneId: 'zone', layerIds: [blueId, redId] } })
  expect(result).toMatchObject({ status: 'applied', affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [] }); expect(write).toHaveBeenCalledTimes(1)
  expect(saved().composition.clips).toEqual(before.composition.clips); expect(saved().composition.patternInstances).toEqual(before.composition.patternInstances)
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(saved())); expect(opened.status).toBe('opened'); if (opened.status !== 'opened') throw Error('codec')
  expect(validateShowRecordV2(opened.record)).toEqual([])
  const oracle = structuredClone(before); oracle.composition.layers.find(layer => layer.id === redId)!.rank = 1; oracle.composition.layers.find(layer => layer.id === blueId)!.rank = 0
  const prepare = (source: ShowRecordV2) => { const prepared = stage.prepareShowStageV2(source, captured.capture.dependencies); expect(prepared.status).toBe('ready'); if (prepared.status !== 'ready') throw Error('prepare'); return prepared.bundle }
  const original = prepare(before), actual = prepare(opened.record), expected = prepare(oracle)
  const options = { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.25, .5] as [number, number], pos: [.25, .5] as [number, number] }] }
  const delivered = (source: ShowRecordV2, bundle: typeof actual) => {
    const exported = buildShowEpeExportV2(source, bundle.artifact.code, { id: 'layer-proof', stampedAt: '2026-09-16T00:00:00Z' }); expect(exported.status).toBe('exported'); if (exported.status !== 'exported') throw Error('EPE')
    const epe = parseEpe(exported.text); expect(epe.stamp?.kind).toBe('show')
    return createFastReplayRuntime({ ...bundle.artifact, code: epe.src, fxCode: emitFixedPoint(epe.src), dimension: 2 }, options)
  }
  const a = delivered(opened.record, actual), e = delivered(oracle, expected), b = delivered(before, original)
  for (const at of [1, 125, 500, 999, 1000, 1125, 2000]) {
    const after = a.advanceTo(at, { stepMs: 125, forceFullIntermediateRender: true }), independent = e.advanceTo(at, { stepMs: 125, forceFullIntermediateRender: true }), prior = b.advanceTo(at, { stepMs: 125, forceFullIntermediateRender: true })
    expect(Array.from(after.frame), `${fidelity}@${at}`).toEqual([1, 0, 0]); expect(Array.from(prior.frame), `${fidelity}@${at}`).toEqual([0, 0, 1])
    expect(after.frame).toEqual(independent.frame); expect(after.exports).toEqual(independent.exports); expect(after.exports).toEqual(prior.exports); expect(Object.keys(after.exports).length).toBeGreaterThan(0)
  }
})

it.each(['fast', 'fidelity'] as const)('complete held Group Layer reassignment preserves shared runtime/full Restart in delivered%s artifacts', async fidelity => {
  const { record, context, saved } = setup(); const { sourceId, targetId } = held(record, 500)
  record.composition.groupDefinitions[0].clips[0].entryPolicy = 'restart'
  const captured = context(); captured.capture.dependencies.patterns[0].src = 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(elapsed/1000,0,0)}'
  captured.capture.prepared = stage.prepareShowStageV2(record, captured.capture.dependencies)
  expect(captured.capture.prepared.status).toBe('ready'); const before = structuredClone(record)
  expect((await admitShowV2PilotLayerEdit({ ...captured, intent: { kind: 'remove', zoneId: 'zone', layerId: sourceId, reassignments: ['local', 'unused'].map(definitionLayerId => ({ kind: 'group-layer-binding', groupOccurrenceId: 'held-use', definitionLayerId, layerId: targetId })) } })).status).toBe('applied')
  const expected = structuredClone(before); expected.composition.layers = expected.composition.layers.filter(layer => layer.id !== sourceId); expected.composition.groupOccurrences[0].layerBindings = [{ definitionLayerId: 'local', layerId: targetId }, { definitionLayerId: 'unused', layerId: targetId }]
  expect(saved().composition.groupDefinitions).toEqual(before.composition.groupDefinitions); expect(saved().composition.propertyTracks).toEqual(before.composition.propertyTracks); expect(saved().composition.patternInstances).toEqual(before.composition.patternInstances)
  const runtimes = [saved(), expected, before].map(source => {
    const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(source)); if (opened.status !== 'opened') throw Error('native reopen')
    const prepared = stage.prepareShowStageV2(opened.record, captured.capture.dependencies); expect(prepared.status).toBe('ready'); if (prepared.status !== 'ready') throw Error('prepare')
    expect(prepared.bundle.recipe.clips.filter(clip => !clip.compilerOwnedEmpty)).toHaveLength(1)
    const exported = buildShowEpeExportV2(opened.record, prepared.bundle.artifact.code, { id: 'shared-held-layer', stampedAt: '2026-09-16T00:00:00Z' }); if (exported.status !== 'exported') throw Error('EPE')
    const epe = parseEpe(exported.text)
    return createFastReplayRuntime({ ...prepared.bundle.artifact, code: epe.src, fxCode: emitFixedPoint(epe.src), dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.25, .5], pos: [.25, .5] }] })
  })
  for (const at of [1, 99, 100, 199, 200, 201, 299, 300, 399, 400, 499, 500, 501, 599, 600, 999, 1001, 1201]) {
    const frames = runtimes.map(runtime => runtime.advanceTo(at, { stepMs: 1, forceFullIntermediateRender: true }))
    expect(frames[0].frame, `${fidelity}@${at}`).toEqual(frames[1].frame); expect(frames[0].frame).toEqual(frames[2].frame)
    expect(frames[0].exports).toEqual(frames[1].exports); expect(frames[0].exports).toEqual(frames[2].exports); expect(Object.keys(frames[0].exports).length).toBeGreaterThan(0)
  }
})

it('removes the final unreferenced Layers in an empty Show, then adds/renames/removes rank0 without runtime manufacture', async () => {
  const { record, context, saved, write } = setup(true)
  for (const layer of record.composition.layers) expect((await admitShowV2PilotLayerEdit({ ...context(), intent: { kind: 'remove', zoneId: layer.zoneId, layerId: layer.id } })).status).toBe('applied')
  expect(saved().composition.layers).toEqual([]); expect(stage.prepareShowStageV2(saved(), context().capture.dependencies).status).toBe('empty')
  expect((await admitShowV2PilotLayerEdit({ ...context(), intent: { kind: 'add', layer: { id: 'rank0', zoneId: 'zone', name: 'New', rank: 0 } } })).status).toBe('applied')
  expect((await admitShowV2PilotLayerEdit({ ...context(), intent: { kind: 'rename', zoneId: 'zone', layerId: 'rank0', name: 'Named empty' } })).status).toBe('applied')
  const noop = await admitShowV2PilotLayerEdit({ ...context(), intent: { kind: 'reorder', zoneId: 'zone', layerIds: ['rank0'] } }); expect(noop.status).toBe('unchanged'); noEffects(noop)
  expect((await admitShowV2PilotLayerEdit({ ...context(), intent: { kind: 'remove', zoneId: 'zone', layerId: 'rank0' } })).status).toBe('applied')
  expect(write).toHaveBeenCalledTimes(record.composition.layers.length + 3); expect(saved().composition.clips).toEqual([]); expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances); expect(saved().composition.showEndMs).toBe(record.composition.showEndMs)
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(saved())); expect(opened.status).toBe('opened')
})
it('preserves durable A after optimistic B fails, and retries through the existing history/save owner', async () => {
  const { record, context, write, saved } = setup(); const layer = record.composition.layers[0]
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve })
  write.mockImplementationOnce(async (_id, next) => { await pending; Object.assign(saved(), structuredClone(next)) }).mockRejectedValueOnce(Error('offline'))
  const a = admitShowV2PilotLayerEdit({ ...context(), intent: { kind: 'rename', zoneId: layer.zoneId, layerId: layer.id, name: 'A' } })
  const b = admitShowV2PilotLayerEdit({ ...context(), intent: { kind: 'rename', zoneId: layer.zoneId, layerId: layer.id, name: 'B' } })
  const failed = b.catch(error => error)
  release(); expect((await a).status).toBe('applied'); expect(await failed).toMatchObject({ message: 'offline' })
  const current = useShowStore.getState().showV2Pilots[record.id]
  expect(current.composition.layers[0].name).toBe('A'); expect(saved().composition.layers[0].name).toBe('A')
  expect((await admitShowV2PilotLayerEdit({ ...context(), intent: { kind: 'rename', zoneId: layer.zoneId, layerId: layer.id, name: 'C' } })).status).toBe('applied')
  expect(write).toHaveBeenCalledTimes(3); expect(saved().composition.layers[0].name).toBe('C'); expect(useShowStore.getState().showV2Histories[record.id].past.map(snapshot => snapshot.composition.layers[0].name)).toEqual([layer.name, 'A'])
})
