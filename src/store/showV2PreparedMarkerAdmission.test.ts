import { beforeEach, expect, it, vi } from 'vitest'
import native from '../../e2e/fixtures/showV2PreparedStage.json'
import * as stage from '../engine/showPreparedStageV2'
import * as compatibility from '../engine/showV2Pilot'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2 } from '../engine/showCompositionV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { createFastReplayRuntime } from '../engine/fastReplay'
import { createPortableShowOutputContract } from '../engine/showOutputContract'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
import { createCustomMap } from '../engine/maps'
import { qualifyShowV2PilotArtifacts } from '../engine/showV2Pilot'
import { parseShowFileBundle } from '../engine/showFileBundle'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotMarkerEdit } from './showV2MarkerAdmission'

beforeEach(() => { useShowStore.setState(showInitialState); resetPersonalContentProvider() })

let fixtureIndex = 0
function setup(customize?: (record: ShowRecordV2, dependencies: stage.ShowPreparedStageDependenciesV2) => void) {
  const opened = parseProvisionalShowRecordV2(JSON.stringify(native))
  if (opened.status !== 'opened') throw new Error('Native fixture refused')
  const record = opened.record
  record.id = `prepared-marker-admission-${++fixtureIndex}`
  const map = { id: 'prepared-stage-map', name: 'Stage Grid', dim: 2 as const, generator: 'custom', params: {}, points: Array.from({ length: 256 }, (_, i) => [(i % 16) / 15, Math.floor(i / 16) / 15]), updatedAt: 1 }
  const dependencies: stage.ShowPreparedStageDependenciesV2 = { patterns: [{ id: 'prepared-stage-pattern', name: 'Stage Voice', src: 'export var elapsed=0; export function beforeRender(delta){elapsed+=delta} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}', controls: {}, updatedAt: 1 }], maps: [map], libraries: [], profiles: [], stageMap: createCustomMap(map.points, { id: map.id, name: map.name }) }
  customize?.(record, dependencies)
  let saved = structuredClone(record)
  const replaceShowV2 = vi.fn(async (_id: string, next: typeof record) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'prepared-marker-test', replaceShowV2, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const prepared = stage.prepareShowStageV2(record, dependencies)
  if (prepared.status !== 'ready') throw new Error(prepared.status === 'refused' ? prepared.message : prepared.status)
  return { record, dependencies, prepared, replaceShowV2, readSaved: () => saved, capture: { record, dependencies, prepared } }
}

it('admits an advanced Marker with one candidate capture and one history/save using the displayed trusted context', async () => {
  const { record, capture, replaceShowV2, readSaved } = setup()
  const before = structuredClone(record)
  const factory = vi.spyOn(stage, 'prepareShowStageV2')
  const direct = vi.spyOn(compatibility, 'lowerShowV2PilotPreview')
  const compiler = vi.spyOn(compatibility, 'compileShowV2PilotArtifact')
  const receipt = vi.fn()
  try {
    const result = await admitShowV2PilotMarkerEdit({ showId: record.id, baseRevision: 0, capture, intent: { kind: 'add', marker: { id: 'future', name: 'Future', timeMs: 45000 } }, isCurrent: () => true, onAdopted: receipt })
    expect(result).toMatchObject({ status: 'applied', settlement: 'saved', affectedMarkerIds: ['future'] })
    expect(factory).toHaveBeenCalledTimes(1)
    expect(direct).not.toHaveBeenCalled()
    expect(compiler).not.toHaveBeenCalled()
    expect(factory.mock.calls[0][1].stageMap).toBe(capture.dependencies.stageMap)
    expect(factory.mock.calls[0][1].profiles).toBe(capture.prepared.bundle.assets.profiles)
    expect(replaceShowV2).toHaveBeenCalledTimes(1)
    const adopted = useShowStore.getState().showV2Pilots[record.id]
    expect(receipt).toHaveBeenCalledExactlyOnceWith({ showId: record.id, record: adopted, revision: useShowStore.getState().showRevisions[record.id], provider: getPersonalContentProvider() })
    expect(adopted).not.toBe(record)
    expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([before])
    expect(readSaved().composition).toEqual({ ...before.composition, markers: [...before.composition.markers, { id: 'future', name: 'Future', timeMs: 45000 }] })
    expect(record).toEqual(before)
    const reopened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(readSaved()))
    if (reopened.status !== 'opened') throw new Error('Saved native record refused')
    const changed = stage.prepareShowStageV2(reopened.record, capture.dependencies)
    if (changed.status !== 'ready') throw new Error(changed.status)
    expect(changed.bundle.artifact.code).toBe(capture.prepared.bundle.artifact.code)
    const artifacts = await qualifyShowV2PilotArtifacts(changed.bundle)
    expect((await parseShowFileBundle(artifacts.pxlshowBytes, { acceptV2: true })).show).toEqual(changed.bundle.record)
  } finally { factory.mockRestore(); direct.mockRestore(); compiler.mockRestore() }
})

it.each(['record', 'revision', 'route', 'Pattern', 'Map/dimension', 'Library', 'profile', 'provider'] as const)('refuses %s replacement during candidate preparation before adoption/history/save', async partition => {
  const { record, capture, replaceShowV2 } = setup()
  let live = true
  let context = capture.dependencies
  const actual = stage.prepareShowStageV2
  const factory = vi.spyOn(stage, 'prepareShowStageV2').mockImplementation((candidate, inputs) => {
    const prepared = actual(candidate, inputs)
    switch (partition) {
      case 'record': useShowStore.setState({ showV2Pilots: { [record.id]: { ...record, name: 'External' } } }); break
      case 'revision': useShowStore.setState({ showRevisions: { [record.id]: 1 } }); break
      case 'route': live = false; break
      case 'Pattern': context = { ...context, patterns: [] }; break
      case 'Map/dimension': context = { ...context, maps: [{ ...context.maps[0], dim: 3 }] }; break
      case 'Library': context = { ...context, libraries: [] }; break
      case 'profile': context = { ...context, profiles: [] }; break
      case 'provider': setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'external-provider' }); break
    }
    return prepared
  })
  const receipt = vi.fn()
  try {
    const result = await admitShowV2PilotMarkerEdit({ showId: record.id, baseRevision: 0, capture, intent: { kind: 'add', marker: { id: 'future', timeMs: 45000 } }, isCurrent: () => live && context.patterns === capture.dependencies.patterns && context.maps === capture.dependencies.maps && context.libraries === capture.dependencies.libraries && context.profiles === capture.dependencies.profiles, onAdopted: receipt })
    expect(result).toMatchObject({ status: 'refused', code: 'stale-edit', affectedMarkerIds: [] })
    expect(factory).toHaveBeenCalledTimes(1)
    expect(receipt).not.toHaveBeenCalled()
    expect(replaceShowV2).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })
    if (partition !== 'record') expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
    else expect(useShowStore.getState().showV2Pilots[record.id].name).toBe('External')
  } finally { factory.mockRestore() }
})

it.each(['unchanged', 'invalid', 'stale-capture'] as const)('performs zero candidate captures/receipts/writes for %s', async partition => {
  const { record, capture, replaceShowV2 } = setup()
  const factory = vi.spyOn(stage, 'prepareShowStageV2')
  const receipt = vi.fn()
  try {
    const requested = partition === 'stale-capture' ? { ...capture, record: structuredClone(record) } : capture
    const result = await admitShowV2PilotMarkerEdit({ showId: record.id, baseRevision: 0, capture: requested, intent: { kind: 'move', markerId: record.composition.markers[0].id, timeMs: partition === 'invalid' ? -1 : record.composition.markers[0].timeMs }, isCurrent: () => true, onAdopted: receipt })
    expect(result.status).toBe(partition === 'unchanged' ? 'unchanged' : 'refused')
    expect(result.affectedMarkerIds).toEqual([])
    expect(factory).not.toHaveBeenCalled()
    expect(receipt).not.toHaveBeenCalled()
    expect(replaceShowV2).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
    expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })
  } finally { factory.mockRestore() }
})

it('awaits the existing durable save even if trusted identity notification throws', async () => {
  const { record, capture, replaceShowV2 } = setup()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  replaceShowV2.mockImplementationOnce(async () => { await gate })
  let settled = false
  const saving = admitShowV2PilotMarkerEdit({ showId: record.id, baseRevision: 0, capture, intent: { kind: 'add', marker: { id: 'future', timeMs: 45000 } }, isCurrent: () => true, onAdopted: () => { throw new Error('notification') } }).then(result => { settled = true; return result })
  await vi.waitFor(() => expect(replaceShowV2).toHaveBeenCalledTimes(1))
  expect(settled).toBe(false)
  release()
  expect(await saving).toMatchObject({ status: 'applied', settlement: 'saved' })
  expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
})


it.each(['held-group', 'layout-split', '3d'] as const)('preserves ready %s choreography and Fast/Precise playback through Marker save/reopen', async kind => {
  const { record, capture, readSaved } = setup((record, inputs) => {
    if (kind === '3d') {
      inputs.patterns = [{ ...inputs.patterns[0], src: 'export var elapsed=0; export function beforeRender(delta){elapsed+=delta} export function render3D(i,x,y,z){rgb(x,y,z)}' }]
      inputs.maps = [{ ...inputs.maps[0], dim: 3, points: inputs.maps[0].points!.map(point => [...point, 0.25]) }]
      inputs.stageMap = createCustomMap(inputs.maps[0].points!, { id: inputs.maps[0].id, name: inputs.maps[0].name })
    } else if (kind === 'held-group') {
      const [first, second] = record.composition.clips
      const { zoneId: _zone, ...local } = structuredClone(first)
      local.instanceId = 'slot'; local.layerId = 'local'; local.durationMs = 15000; local.appearance.keys = [local.appearance.keys[0]]
      record.composition.clips = [second]
      record.composition.groupDefinitions = [{ id: 'group', name: 'Held Group', patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }], layers: [{ id: 'local', name: 'Local', rank: 0 }], clips: [local], transitions: [], propertyTracks: [{ id: 'brightness', target: { kind: 'clip-view', clipId: local.id, property: 'brightness' }, activeStartMs: 0, activeDurationMs: 15000, keyframes: [{ id: 'a', timeMs: 0, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'b', timeMs: 15000, value: 0.8, easing: { curve: 'linear' } }] }] }]
      record.composition.groupOccurrences = [{ id: 'held', definitionId: 'group', zoneId: first.zoneId, layoutOccurrenceId: 'opening', startMs: 0, translationX: 0, translationY: 0, layerBindings: [{ definitionLayerId: 'local', layerId: first.layerId }], instanceBindings: { slot: 'instance' }, holds: [{ id: 'pause', localTimeMs: 7500, durationMs: 1000 }] }]
    } else {
      record.outputContract = createPortableShowOutputContract({ referenceMapId: record.stageMapId ?? null, referencePixelCount: 256 })
      record.zones.push({ ...structuredClone(record.zones[0]), id: 'right', name: 'Right' })
      record.composition.layers.push({ ...structuredClone(record.composition.layers[0]), id: 'right-layer', zoneId: 'right' })
      record.composition.patternInstances.push({ ...structuredClone(record.composition.patternInstances[0]), id: 'right-instance' })
      record.composition.clips.push(...record.composition.clips.map(clip => ({ ...structuredClone(clip), id: `right-${clip.id}`, zoneId: 'right', layerId: 'right-layer', instanceId: 'right-instance' })))
      record.zoneLayouts = [{ id: 'split', name: 'Split', zones: [{ zoneId: 'zone', ranges: [] }, { zoneId: 'right', ranges: [] }], logical: { kind: 'split', axis: 'x', zoneIds: ['zone', 'right'] } }]
      record.composition.layoutOccurrences = [{ id: 'split', layoutId: 'split', startMs: 0, durationMs: 31000, parameters: { splitPosition: 0.5 } }]
      const easing = { curve: 'quadratic', direction: 'in' } as const
      const split = (time: number) => 0.2 + 0.6 * ((time + 5000) / 40000) ** 2
      record.composition.propertyTracks.push({ id: 'split-track', target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'split' }, activeStartMs: 0, activeDurationMs: 31000, keyframes: [{ id: 'a', timeMs: 0, value: split(0), easing, curveSegment: { baseValue: 0.2, deltaValue: 0.6, easing, sourceDurationMs: 40000, elapsedOffsetMs: 5000 } }, { id: 'b', timeMs: 31000, value: split(31000), easing: { curve: 'linear' } }] })
    }
  })
  const before = structuredClone(record)
  expect(await admitShowV2PilotMarkerEdit({ showId: record.id, baseRevision: 0, capture, intent: { kind: 'add', marker: { id: 'future', timeMs: 45000 } }, isCurrent: () => true, onAdopted: () => {} })).toMatchObject({ status: 'applied', settlement: 'saved' })
  const saved = readSaved()
  expect(saved.composition).toEqual({ ...before.composition, markers: [...before.composition.markers, { id: 'future', timeMs: 45000 }] })
  const after = stage.prepareShowStageV2(saved, capture.dependencies)
  if (after.status !== 'ready') throw new Error(after.status === 'refused' ? after.message : after.status)
  expect(after.bundle.presentation.stageDimension).toBe(kind === '3d' ? 3 : 2)
  expect(after.bundle.artifact.code).toBe(capture.prepared.bundle.artifact.code)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const options = { fidelity, randomSeed: 1038, mapPoints: after.bundle.presentation.layout.mapPoints }
    const old = createFastReplayRuntime({ ...capture.prepared.bundle.artifact, dimension: after.bundle.presentation.stageDimension }, options)
    const current = createFastReplayRuntime({ ...after.bundle.artifact, dimension: after.bundle.presentation.stageDimension }, options)
    for (const time of [7500, 8000, 8500, 16000, 17000, 31000, 31125]) {
      const a = old.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
      const b = current.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
      expect(b.frame).toEqual(a.frame); expect(b.exports).toEqual(a.exports)
    }
  }
  const delivered = await qualifyShowV2PilotArtifacts(after.bundle)
  expect((await parseShowFileBundle(delivered.pxlshowBytes, { acceptV2: true })).show).toEqual(after.bundle.record)
})

it('recovers with a fresh supported provider request after refusal without retaining a failed adoption', async () => {
  const { record, capture, replaceShowV2 } = setup()
  const supported = getPersonalContentProvider()
  setPersonalContentProvider({ ...supported, id: 'unsupported', replaceShowV2: undefined })
  const receipt = vi.fn()
  const request = { showId: record.id, baseRevision: 0, capture, intent: { kind: 'add' as const, marker: { id: 'future', timeMs: 45000 } }, isCurrent: () => true, onAdopted: receipt }
  expect(await admitShowV2PilotMarkerEdit(request)).toMatchObject({ status: 'refused', code: 'unsupported-provider', affectedMarkerIds: [] })
  expect(replaceShowV2).not.toHaveBeenCalled(); expect(receipt).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  setPersonalContentProvider(supported)
  expect(await admitShowV2PilotMarkerEdit(request)).toMatchObject({ status: 'applied', settlement: 'saved', affectedMarkerIds: ['future'] })
  expect(replaceShowV2).toHaveBeenCalledTimes(1); expect(receipt).toHaveBeenCalledTimes(1)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])
})
