import { expect, it } from 'vitest'
import { propertyEditRecord } from '../test/showV2PropertyEditsFixture'
import { createShowGroupFromSelectionV2, type CreateShowGroupFromSelectionIntentV2 } from './showGroupCreationV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2 } from './showCompositionV2'
function fixture() {
  const record = propertyEditRecord()
  record.composition.executionModel = 'continuous'
  const clip = record.composition.clips[0]
  clip.startMs = 100; clip.durationMs = 400; clip.appearance.keys[0].timeMs = 100
  const intent: CreateShowGroupFromSelectionIntentV2 = {
    kind: 'create-group', selectedClipIds: [clip.id], transitionIds: [], definitionId: 'created', occurrenceId: 'first-use', name: 'Created', originMs: 100,
    identities: { patternInstanceIds: { instance: 'slot' }, layerIds: { [clip.layerId]: 'local-layer' }, clipIds: { [clip.id]: 'child' }, transitionIds: {}, propertyTrackIds: {}, appearanceKeyIdsByClipId: { [clip.id]: { [clip.appearance.keys[0].id]: 'local-appearance' } }, propertyKeyIdsByTrackId: {} },
  }
  return { record, intent }
}
it('creates a reopened lossless Group bound to the same authoritative runtime', () => {
  const { record, intent } = fixture(); const original = structuredClone(record)
  const result = createShowGroupFromSelectionV2(record, intent)
  expect(result.status).toBe('changed'); expect(record).toEqual(original)
  expect(validateShowRecordV2(result.record)).toEqual([])
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result.record))
  expect(opened.status).toBe('opened'); if (opened.status !== 'opened') throw Error('Codec')
  expect(opened.record.composition.groupOccurrences[0]).toEqual({ id: 'first-use', definitionId: 'created', layoutOccurrenceId: 'layout-occurrence:1', zoneId: 'zone', startMs: 100, translationX: 0, translationY: 0, layerBindings: [{ definitionLayerId: 'local-layer', layerId: record.composition.clips[0].layerId }], instanceBindings: { slot: 'instance' }, holds: [] })
  expect(opened.record.composition.patternInstances).toEqual(record.composition.patternInstances)
  const effective = materializeShowGroupsV2(opened.record).composition.clips[0]
  expect(effective).toMatchObject({ id: 'first-use:child', instanceId: 'instance', startMs: 100, durationMs: 400, entryPolicy: 'continue', layerId: record.composition.clips[0].layerId })
  expect(result).toMatchObject({ affectedClipIds: ['clip', 'child'], affectedInstanceIds: ['slot'], affectedGroupDefinitionIds: ['created'], affectedGroupOccurrenceIds: ['first-use'], affectedLayerIds: ['local-layer'], removedIds: ['clip'] })
  result.record.composition.groupDefinitions[0].clips[0].appearance.keys[0].value.view.brightness = 0
  expect(record).toEqual(original)
})
import { evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
it('localizes selected Clip kernels/Effect identities while keeping all global owners once', () => {
  const { record, intent } = fixture()
  record.composition.propertyTracks = [
    { id: 'effect-track', target: { kind: 'clip-effect', clipId: 'clip', effectId: 'turn', effectKind: 'rotate', parameterId: 'turns' }, activeStartMs: 100, activeDurationMs: 400, keyframes: [{ id: 'same', timeMs: 100, value: 0.2, easing: { curve: 'linear' }, curveSegment: { baseValue: 0, deltaValue: 1, sourceDurationMs: 1000, elapsedOffsetMs: 200, easing: { curve: 'quadratic', direction: 'in' } } }, { id: 'end', timeMs: 500, value: 0.36, easing: { curve: 'linear' } }] },
    { id: 'global', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderGain' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'same', timeMs: 0, value: 0.4, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'end', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] },
    { id: 'show', target: { kind: 'show-repeat-scale' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'same', timeMs: 0, value: 2, easing: { curve: 'linear' } }, { id: 'end', timeMs: 1000, value: 3, easing: { curve: 'linear' } }] },
    { id: 'layout', target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'layout-occurrence:1' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'same', timeMs: 0, value: 0.4, easing: { curve: 'linear' } }, { id: 'end', timeMs: 1000, value: 0.6, easing: { curve: 'linear' } }] },
  ]
  intent.identities.propertyTrackIds = { 'effect-track': 'local-track' }
  intent.identities.propertyKeyIdsByTrackId = { 'effect-track': { same: 'local-first', end: 'local-last' } }
  const before = structuredClone(record); expect(validateShowRecordV2(record)).toEqual([])
  const result = createShowGroupFromSelectionV2(record, intent)
  expect(result.status).toBe('changed'); expect(record).toEqual(before)
  const definition = result.record.composition.groupDefinitions[0]
  expect(definition.propertyTracks[0]).toMatchObject({ id: 'local-track', activeStartMs: 0, activeDurationMs: 400, target: { kind: 'clip-effect', clipId: 'child', effectId: 'turn' } })
  expect(definition.propertyTracks[0].keyframes[0].curveSegment).toEqual(before.composition.propertyTracks[0].keyframes[0].curveSegment)
  expect(result.record.composition.propertyTracks).toEqual(before.composition.propertyTracks.slice(1))
  const materialized = materializeShowGroupsV2(result.record)
  const projected = materialized.composition.propertyTracks.find(track => track.id === 'first-use:local-track')!
  // The retained original source runs .2 -> .6, so halfway is .4².
  expect(evaluateShowPropertyTrackV2(projected, 300)).toBeCloseTo(0.16, 14)
  expect(projected.keyframes.map(key => key.timeMs)).toEqual([100, 500])
  expect(result).toMatchObject({ affectedTrackIds: ['effect-track', 'local-track'], affectedPropertyKeyIds: ['same', 'end', 'local-first', 'local-last'], removedIds: ['clip', 'effect-track'] })
})
function atomicRefusal(record: ReturnType<typeof fixture>['record'], intent: CreateShowGroupFromSelectionIntentV2, code?: string) {
  const before = structuredClone(record); const result = createShowGroupFromSelectionV2(record, intent)
  expect(result.status).toBe('refused'); expect(result.record).toBe(record); expect(record).toEqual(before)
  if (code) expect(result).toHaveProperty('code', code)
  for (const [key, value] of Object.entries(result)) if (key.startsWith('affected') || ['removedIds', 'hoistedInstanceIds', 'discardedControlTargets'].includes(key)) expect(value).toEqual([])
}
it.each([[0, 500], [100, 500]] as const)('refuses lossless-unrepresentable activation %i + %i without cropping', (start, duration) => {
  const { record, intent } = fixture()
  record.composition.propertyTracks = [{ id: 'outside', target: { kind: 'clip-opacity', clipId: 'clip' }, activeStartMs: start, activeDurationMs: duration, keyframes: [{ id: 'left', timeMs: start, value: 0.2, easing: { curve: 'linear' } }, { id: 'right', timeMs: start + duration, value: 0.8, easing: { curve: 'linear' } }] }]
  intent.identities.propertyTrackIds = { outside: 'local-outside' }; intent.identities.propertyKeyIdsByTrackId = { outside: { left: 'local-left', right: 'local-right' } }
  expect(validateShowRecordV2(record)).toEqual([]); atomicRefusal(record, intent, 'unsupported-representation')
})
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import type { ShowRecordV2 } from './showCompositionV2'
function planFor(record: ShowRecordV2, selectedClipIds = record.composition.clips.map(clip => clip.id)): CreateShowGroupFromSelectionIntentV2 {
  const clips = record.composition.clips.filter(clip => selectedClipIds.includes(clip.id))
  const tracks = record.composition.propertyTracks.filter(track => 'clipId' in track.target && selectedClipIds.includes(track.target.clipId))
  const transitionIds = record.composition.transitions.map(transition => transition.id)
  const map = (ids: string[]) => Object.fromEntries(ids.map(id => [id, `local-${id}`]))
  return { kind: 'create-group', selectedClipIds, transitionIds, definitionId: 'created', occurrenceId: 'first-use', name: 'Created', originMs: Math.min(...clips.map(clip => clip.startMs)), identities: {
    patternInstanceIds: map([...new Set(clips.map(clip => clip.instanceId))]), layerIds: map([...new Set(clips.map(clip => clip.layerId))]), clipIds: map(selectedClipIds), transitionIds: map(transitionIds), propertyTrackIds: map(tracks.map(track => track.id)),
    appearanceKeyIdsByClipId: Object.fromEntries(clips.map(clip => [clip.id, map(clip.appearance.keys.map(key => key.id))])), propertyKeyIdsByTrackId: Object.fromEntries(tracks.map(track => [track.id, map(track.keyframes.map(key => key.id))])),
  } }
}
function pairFixture(kind: 'crossfade' | 'wipe' | 'portal' = 'crossfade') {
  const converted = convertShowRecordV1ToV2(transitionV1Show(kind))
  if (converted.status !== 'converted') throw Error('Fixture')
  const record = converted.record; record.composition.executionModel = 'continuous'
  return { record, intent: planFor(record) }
}
it.each(['crossfade', 'wipe', 'portal'] as const)('localizes lossless%s pair settings without pairwise rewrite', kind => {
  const { record, intent } = pairFixture(kind); const before = structuredClone(record)
  const result = createShowGroupFromSelectionV2(record, intent)
  expect(result.status).toBe('changed'); expect(validateShowRecordV2(result.record)).toEqual([])
  const source = record.composition.transitions[0]
  const { participants: _participants, propertyRamps: _ramps, ...settings } = source
  expect(result.record.composition.groupDefinitions[0].transitions).toEqual([{ ...settings, id: `local-${source.id}`, fromPlacementId: 'local-out', toPlacementId: 'local-in' }])
  const projected = materializeShowGroupsV2(result.record).composition.transitions[0]
  expect(projected).toMatchObject({ kind, durationMs: 200, easing: { curve: 'sine', direction: 'in-out' }, participants: [{ fromClipId: 'first-use:local-out', toClipId: 'first-use:local-in', layerId: record.composition.clips[0].layerId }] })
  expect(result).toMatchObject({ affectedTransitionIds: [source.id, `local-${source.id}`], removedIds: ['out', 'in', source.id] })
  expect(record).toEqual(before)
})
it.each(['partial', 'omitted', 'whole', 'participants', 'ramp'] as const)('atomically refuses%s Transition selection/representation', partition => {
  const { record } = pairFixture()
  const transition = record.composition.transitions[0]
  if (partition === 'whole') { transition.wholeOutput = { startMs: 400, fromClipIds: ['out'], toClipIds: ['in'] }; transition.participants = [] }
  if (partition === 'participants') {
    const overlay = record.composition.layers.find(layer => layer.rank === 1)!
    for (const id of ['out', 'in']) { const clip = structuredClone(record.composition.clips.find(clip => clip.id === id)!); clip.id += '-overlay'; clip.layerId = overlay.id; record.composition.clips.push(clip) }
    transition.participants.push({ ...structuredClone(transition.participants[0]), id: 'other', layerId: overlay.id, fromClipId: 'out-overlay', toClipId: 'in-overlay' })
  }
  if (partition === 'ramp') transition.propertyRamps = [{ target: { kind: 'instance-time-scale', instanceId: 'in-instance' }, from: 0.5 }]
  const intent = planFor(record, partition === 'partial' ? ['out'] : undefined)
  if (partition === 'omitted') { intent.transitionIds = []; intent.identities.transitionIds = {} }
  expect(validateShowRecordV2(record)).toEqual([]); atomicRefusal(record, intent)
})
it.each(['missing', 'extra', 'blank', 'duplicate', 'source-id', 'nested-extra', 'nested-array', 'wrong-origin', 'wrong-kind', 'empty-selection', 'duplicate-selection', 'extra-intent', 'bigint-origin'] as const)('rejects%s identity/intent atomically without throwing', partition => {
  const { record, intent } = fixture()
  if (partition === 'missing') intent.identities.clipIds = {}
  if (partition === 'extra') intent.identities.clipIds.extra = 'unused'
  if (partition === 'blank') intent.identities.patternInstanceIds.instance = ' '
  if (partition === 'source-id') intent.identities.clipIds.clip = 'clip'
  if (partition === 'duplicate') { const second = structuredClone(record.composition.clips[0]); second.id = 'second'; second.startMs = 600; second.durationMs = 200; second.appearance.keys[0].timeMs = 600; record.composition.clips.push(second); intent.selectedClipIds.push('second'); intent.identities.clipIds.second = 'child' }
  if (partition === 'nested-extra') intent.identities.appearanceKeyIdsByClipId.extra = {}
  if (partition === 'nested-array') intent.identities.appearanceKeyIdsByClipId.clip = [] as unknown as Record<string, string>
  if (partition === 'wrong-origin') intent.originMs = 0
  if (partition === 'wrong-kind') Object.assign(intent, { kind: 'create' })
  if (partition === 'empty-selection') intent.selectedClipIds = []
  if (partition === 'duplicate-selection') intent.selectedClipIds.push('clip')
  if (partition === 'extra-intent') Object.assign(intent, { placement: {} })
  if (partition === 'bigint-origin') Object.assign(intent, { originMs: 100n })
  atomicRefusal(record, intent)
})
it('allows repeated nested IDs across owners and unrelated local namespace reuse', () => {
  const { record, intent } = fixture()
  const second = structuredClone(record.composition.clips[0]); second.id = 'other'; second.startMs = 600; second.durationMs = 200; second.appearance.keys[0].timeMs = 600; record.composition.clips.push(second)
  const linked = planFor(record)
  linked.identities.appearanceKeyIdsByClipId.other = linked.identities.appearanceKeyIdsByClipId.clip
  const dormant = structuredClone(record.composition.patternInstances[0]); dormant.id = 'slot'; record.composition.patternInstances.push(dormant)
  linked.identities.patternInstanceIds.instance = 'slot'
  linked.identities.clipIds.clip = 'created' // Distinct collection from the definition ID.
  const result = createShowGroupFromSelectionV2(record, linked)
  expect(result.status).toBe('changed'); expect(validateShowRecordV2(result.record)).toEqual([])
  expect(result.affectedAppearanceKeyIds).toEqual(['clip:appearance:1', 'local-clip:appearance:1', 'clip:appearance:1', 'local-clip:appearance:1'])
  expect(result.record.composition.groupOccurrences[0].instanceBindings).toEqual({ slot: 'instance' })
  expect(intent.identities.patternInstanceIds.instance).toBe('slot')
})
it('refuses Group child IDs and same-ID materialization collisions without prefix matching', () => {
  const { record, intent } = fixture(); const created = createShowGroupFromSelectionV2(record, intent)
  expect(created.status).toBe('changed')
  const childIntent = structuredClone(intent); childIntent.selectedClipIds = ['first-use:child']
  atomicRefusal(created.record, childIntent)
  const other = structuredClone(record.composition.clips[0]); other.id = 'first-use:child'; other.startMs = 600; other.durationMs = 200; other.appearance.keys[0].timeMs = 600; record.composition.clips.push(other)
  expect(validateShowRecordV2(record)).toEqual([]); atomicRefusal(record, intent, 'invalid-result')
})
it('keeps initial association while validating the entire Group envelope across Layouts', () => {
  const { record, intent } = fixture()
  record.composition.layoutOccurrences = [{ id: 'early', layoutId: 'layout', startMs: 0, durationMs: 300, parameters: {} }, { id: 'late', layoutId: 'layout', startMs: 300, durationMs: 700, parameters: {} }]
  const changed = createShowGroupFromSelectionV2(record, intent)
  expect(changed.status).toBe('changed'); expect(changed.record.composition.groupOccurrences[0].layoutOccurrenceId).toBe('early')
  // Ordinary endpoints individually fit, but the Group envelope cannot bridge absent Zone time.
  const later = structuredClone(record.composition.clips[0]); later.id = 'later'; later.startMs = 700; later.durationMs = 200; later.appearance.keys[0].timeMs = 700
  record.composition.clips[0].durationMs = 100; record.composition.clips.push(later)
  record.zones.push({ id: 'absent', name: 'Absent', nominalPixelCount: 16 }); record.zoneLayouts.push({ id: 'no-zone', name: 'Gap', zones: [], logical: { kind: 'single', zoneIds: ['absent'] } })
  record.composition.layoutOccurrences = [{ id: 'early', layoutId: 'layout', startMs: 0, durationMs: 300, parameters: {} }, { id: 'gap', layoutId: 'no-zone', startMs: 300, durationMs: 300, parameters: {} }, { id: 'late', layoutId: 'layout', startMs: 600, durationMs: 400, parameters: {} }]
  expect(validateShowRecordV2(record)).toEqual([]); atomicRefusal(record, planFor(record), 'invalid-result')
})
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'
import { deriveShowRestartEventsV2 } from './showPropertyAnimationV2'
import { effectiveShowInstanceUseCountV2, groupRuntimeBindings } from './showGroupsV2'
const source = 'export var elapsed=0;export var level=.2;export function sliderGain(v){level=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(level,elapsed/2000,0)}'
function reopened(record: ShowRecordV2) {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw Error('Codec'); return opened.record
}
function compiled(record: ShowRecordV2) {
  record = reopened(record)
  const lookup = Object.fromEntries([...record.composition.patternInstances.map(instance => instance.id), ...groupRuntimeBindings(record).map(binding => binding.runtimeId)].map(id => [id, source]))
  const prepared = prepareShowV2ForCompile(record, { byCellId: {}, byPatternInstanceId: lookup, stageDimension: 2 }, { libraries: {} })
  expect(prepared.status).toBe('ready'); if (prepared.status !== 'ready') throw Error(JSON.stringify(prepared.issues))
  const artifact = compileShow(prepared.recipe, {})
  const exported = buildShowEpeExportV2(record, artifact.code, { id: 'group-create-native', stampedAt: '2026-09-16T00:00:00Z' })
  expect(exported.status).toBe('exported'); if (exported.status !== 'exported') throw Error('Export')
  const epe = parseEpe(exported.text)
  return { ...artifact, code: epe.src, fxCode: emitFixedPoint(epe.src), dimension: 2 as const }
}
function sharedSchedule() {
  const record = propertyEditRecord(); record.composition.executionModel = 'continuous'; record.composition.patternInstances[0].controlTargets = { sliderGain: 0.2 }
  const main = record.composition.clips[0]; const overlay = record.composition.layers.find(layer => layer.rank === 1)!
  for (const [id, startMs, durationMs, entryPolicy] of [['selected-a', 100, 100, 'continue'], ['selected-b', 200, 200, 'restart']] as const) {
    const clip = structuredClone(main); Object.assign(clip, { id, layerId: overlay.id, startMs, durationMs, entryPolicy }); clip.appearance.keys[0].timeMs = startMs; record.composition.clips.push(clip)
  }
  record.composition.propertyTracks = [{ id: 'global-level', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderGain' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'first', timeMs: 0, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'last', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] }]
  return { record, intent: planFor(record, ['selected-a', 'selected-b']) }
}
it.each(['fast', 'fidelity'] as const)('native reopened%s sharing/global animation/Restart equals the independent selected schedule', fidelity => {
  const { record, intent } = sharedSchedule(); const before = structuredClone(record)
  const result = createShowGroupFromSelectionV2(record, intent)
  expect(result.status).toBe('changed'); expect(result.record.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(result.record.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(effectiveShowInstanceUseCountV2(result.record, 'instance')).toBe(3)
  expect(deriveShowRestartEventsV2(result.record)).toMatchObject({ status: 'derived', events: [{ instanceId: 'instance', atMs: 200 }] })
  const artifacts = [compiled(before), compiled(result.record)]
  expect(artifacts.map(artifact => artifact.summary.clips.length)).toEqual([1, 1])
  const runtimes = artifacts.map(artifact => createFastReplayRuntime(artifact, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] }))
  for (const time of [0, 1, 99, 100, 101, 199, 200, 201, 250, 399, 400, 401, 999, 1001, 1201]) {
    const frames = runtimes.map(runtime => runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true }))
    expect(Array.from(frames[1].frame), `frame@${time}`).toEqual(Array.from(frames[0].frame))
    for (const name of ['elapsed', 'level']) expect(frames[1].exports[`${artifacts[1].summary.clips[0].prefix}_${name}`]).toBe(frames[0].exports[`${artifacts[0].summary.clips[0].prefix}_${name}`])
    if (time > 0 && time < 1000 && fidelity === 'fast') {
      expect(frames[1].frame[0]).toBeCloseTo(0.2 + 0.6 * (time / 1000) ** 2, 12)
      expect(frames[1].frame[1]).toBeCloseTo((time < 200 ? time : time - 200) / 2000, 12)
    }
  }
})
it.each(['fast', 'fidelity'] as const)('native%s retained local Clip kernel and original Effect identity remain lossless', fidelity => {
  const { record } = fixture(); record.composition.patternInstances[0].controlTargets = { sliderGain: 0.4 }
  record.composition.propertyTracks = [{ id: 'local-source', target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' }, activeStartMs: 100, activeDurationMs: 400, keyframes: [{ id: 'first', timeMs: 100, value: 0.2, easing: { curve: 'linear' }, curveSegment: { baseValue: 0.2, deltaValue: 0.6, sourceDurationMs: 1000, elapsedOffsetMs: 200, easing: { curve: 'quadratic', direction: 'in' } } }, { id: 'last', timeMs: 500, value: 0.8, easing: { curve: 'linear' } }] }]
  const result = createShowGroupFromSelectionV2(record, planFor(record)); expect(result.status).toBe('changed')
  const artifacts = [compiled(record), compiled(result.record)]
  const runtimes = artifacts.map(artifact => createFastReplayRuntime(artifact, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] }))
  for (const time of [0, 99, 100, 101, 199, 300, 499, 500, 501, 999, 1001]) {
    const frames = runtimes.map(runtime => runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true }))
    expect(Array.from(frames[1].frame), `retained@${time}`).toEqual(Array.from(frames[0].frame))
    if (fidelity === 'fast' && time > 100 && time < 500) expect(frames[1].frame[0]).toBeCloseTo(0.4 * (0.2 + 0.6 * ((time + 100) / 1000) ** 2), 12)
  }
  expect(result.record.composition.groupDefinitions[0].clips[0].appearance.keys[0].value.effects).toEqual([{ id: 'turn', kind: 'rotate', turns: 0 }])
})
it.each(['fast', 'fidelity'] as const)('native%s exact pair preserves distinct equal-source runtimes and preroll Restart', fidelity => {
  const { record, intent } = pairFixture(); record.composition.clips[1].entryPolicy = 'restart'
  record.composition.patternInstances[0].controlTargets = { sliderGain: 0.2 }; record.composition.patternInstances[1].controlTargets = { sliderGain: 0.8 }
  const result = createShowGroupFromSelectionV2(record, intent); expect(result.status).toBe('changed')
  expect(deriveShowRestartEventsV2(result.record)).toMatchObject({ status: 'derived', events: [{ instanceId: 'in-instance', atMs: 400 }] })
  const artifacts = [compiled(record), compiled(result.record)]
  expect(artifacts.map(artifact => artifact.summary.clips.length)).toEqual([2, 2])
  const runtimes = artifacts.map(artifact => createFastReplayRuntime(artifact, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] }))
  for (const time of [0, 1, 399, 400, 401, 500, 599, 600, 601, 999, 1001]) {
    const frames = runtimes.map(runtime => runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true }))
    expect(Array.from(frames[1].frame), `pair@${time}`).toEqual(Array.from(frames[0].frame))
    for (const id of ['out-instance', 'in-instance']) {
      const prefixes = artifacts.map(artifact => artifact.summary.clips.find(member => member.id === id)!.prefix)
      for (const name of ['elapsed', 'level']) expect(frames[1].exports[`${prefixes[1]}_${name}`]).toBe(frames[0].exports[`${prefixes[0]}_${name}`])
    }
  }
})
import { duplicateShowGroupOccurrenceV2, makeShowGroupUniqueV2, moveShowGroupOccurrenceV2, ungroupShowGroupOccurrenceV2, type ShowGroupUniqueIdentityPlanV2 } from './showGroupEditsV2'
it.each(['fast', 'fidelity'] as const)('selection→Group→move/duplicate→held Unique→Ungroup stays native%s equivalent to an authored ordinary schedule', fidelity => {
  const { record, intent } = sharedSchedule()
  record.composition.propertyTracks = []
  record.composition.patternInstances[0].controlTargets = { sliderGain: 0.4 }
  const result = createShowGroupFromSelectionV2(record, intent); expect(result.status).toBe('changed')
  const initial = result.record.composition.groupOccurrences[0]
  const placement = { startMs: 125, layoutOccurrenceId: initial.layoutOccurrenceId, zoneId: initial.zoneId, layerBindings: structuredClone(initial.layerBindings), translationX: 0, translationY: 0 }
  const moved = moveShowGroupOccurrenceV2(result.record, { kind: 'move-occurrence', occurrenceId: initial.id, ...placement }); expect(moved.status).toBe('changed')
  const held = structuredClone(moved.record); held.composition.groupOccurrences[0].holds = [{ id: 'held-beat', localTimeMs: 150, durationMs: 50 }]
  expect(validateShowRecordV2(held)).toEqual([])
  const duplicate = duplicateShowGroupOccurrenceV2(held, { kind: 'duplicate-occurrence', occurrenceId: initial.id, newOccurrenceId: 'linked-repeat', ...placement, startMs: 600 }); expect(duplicate.status).toBe('changed')
  const definition = duplicate.record.composition.groupDefinitions[0]
  const map = (ids: string[]) => Object.fromEntries(ids.map(id => [id, `unique-${id}`]))
  const identities: ShowGroupUniqueIdentityPlanV2 = { definitionId: 'unique-definition', patternInstanceIds: map(definition.patternInstances.map(instance => instance.id)), layerIds: map(definition.layers.map(layer => layer.id)), clipIds: map(definition.clips.map(clip => clip.id)), transitionIds: {}, propertyTrackIds: {}, appearanceKeyIdsByClipId: Object.fromEntries(definition.clips.map(clip => [clip.id, Object.fromEntries(clip.appearance.keys.map(key => [key.id, `unique-${clip.id}-${key.id}`]))])), propertyKeyIdsByTrackId: {} }
  const unique = makeShowGroupUniqueV2(duplicate.record, { kind: 'make-unique', occurrenceId: initial.id, identities }); expect(unique.status).toBe('changed')
  const ungrouped = ungroupShowGroupOccurrenceV2(unique.record, { kind: 'ungroup-occurrence', occurrenceId: initial.id }); expect(ungrouped.status).toBe('changed')
  expect(ungrouped.record.composition.groupOccurrences).toEqual([duplicate.record.composition.groupOccurrences[1]])
  expect(ungrouped.record.composition.groupDefinitions[0]).toEqual(definition)
  expect(ungrouped.record.composition.patternInstances).toEqual(record.composition.patternInstances)
  expect(ungrouped.record.composition.propertyTracks).toEqual(record.composition.propertyTracks)
  expect(effectiveShowInstanceUseCountV2(ungrouped.record, 'instance')).toBe(5)
  const oracle = structuredClone(record); oracle.composition.clips = [oracle.composition.clips[0]]
  for (const [id, startMs, durationMs, entryPolicy] of [['a', 125, 100, 'continue'], ['b', 225, 250, 'restart'], ['repeat-a', 600, 100, 'continue'], ['repeat-b', 700, 250, 'restart']] as const) {
    const clip = structuredClone(record.composition.clips[1]); Object.assign(clip, { id, startMs, durationMs, entryPolicy }); clip.appearance.keys[0].timeMs = startMs; oracle.composition.clips.push(clip)
  }
  const artifacts = [compiled(oracle), compiled(ungrouped.record)]
  const runtimes = artifacts.map(artifact => createFastReplayRuntime(artifact, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] }))
  for (const time of [0, 124, 125, 224, 225, 226, 274, 275, 324, 325, 474, 475, 599, 600, 699, 700, 701, 749, 750, 799, 800, 949, 950, 999, 1001]) {
    const frames = runtimes.map(runtime => runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true }))
    expect(Array.from(frames[1].frame), `lifecycle@${time}`).toEqual(Array.from(frames[0].frame))
    for (const name of ['elapsed', 'level']) expect(frames[1].exports[`${artifacts[1].summary.clips[0].prefix}_${name}`]).toBe(frames[0].exports[`${artifacts[0].summary.clips[0].prefix}_${name}`])
  }
})
it('requires ordinary same-Zone selection and retains the shared RL placement boundary', () => {
  const { record } = pairFixture()
  const unrelated = structuredClone(record.composition.clips[0]); Object.assign(unrelated, { id: 'intruder', layerId: record.composition.layers.find(layer => layer.rank === 1)!.id, startMs: 450, durationMs: 50 }); unrelated.appearance.keys[0].timeMs = 450; record.composition.clips.push(unrelated)
  expect(validateShowRecordV2(record)).toEqual([])
  atomicRefusal(record, planFor(record, ['out', 'in']), 'compiler-ineligible')
  const one = fixture().record; const right = structuredClone(one.composition.clips[0]); Object.assign(right, { id: 'right', zoneId: 'right-zone', layerId: 'right-layer', startMs: 600, durationMs: 200 }); right.appearance.keys[0].timeMs = 600
  one.zones.push({ id: 'right-zone', name: 'Right', nominalPixelCount: 16 }); one.composition.layers.push({ id: 'right-layer', zoneId: 'right-zone', name: 'Main', rank: 0 }); one.zoneLayouts[0].logical = { kind: 'split', zoneIds: ['zone', 'right-zone'], axis: 'x' }; one.composition.clips.push(right)
  expect(validateShowRecordV2(one)).toEqual([]); atomicRefusal(one, planFor(one), 'invalid-selection')
})
