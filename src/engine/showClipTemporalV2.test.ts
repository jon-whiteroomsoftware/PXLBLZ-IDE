import { editShowClipV2 } from './showClipsV2'
import { LIBRARIES } from '../pixelblaze/libs'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { buildShowEpeExport } from './showEpeExport'
import { parseEpe } from './epeImport'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { deriveShowRestartEventsV2, evaluateShowPropertyTrackV2, projectShowTransitionPropertyRampsV2, type ShowTransitionRampProjectionV2 } from './showPropertyAnimationV2'
import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { showSplitClipFixture } from '../test/showSplitClipFixture'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { createDefaultShow } from './showModel'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { editShowClipTemporalV2 } from './showClipTemporalV2'

it('refuses a clip-edge resize against a converted Property ramp carrier (#1061)', () => {
  const show = createDefaultShow('converted-clip-edge', 'Converted clip edge', 1)
  const converted = convertShowRecordV1ToV2(show, {
    byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])),
  })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const source = converted.record
  const boundary = source.composition.transitions[0]
  expect(boundary.origin).toBe('converted-boundary-transition')
  const incoming = boundary.participants[0].toClipId
  boundary.propertyRamps = [{ participantId: boundary.participants[0].id, target: { kind: 'clip-opacity', clipId: incoming }, from: 0.4, durationMs: 800 }]
  expect(validateShowRecordV2(source)).toEqual([])
  const before = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'trim', clipId: incoming, startMs: 33000, endMs: 62000 })
  expect(result).toMatchObject({ status: 'refused', code: 'unsupported-property-carrier', record: source })
  expect(source).toEqual(before)
})

function fixture(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion failed')
  const record = converted.record
  record.composition.showEndMs = 2000
  record.composition.layoutOccurrences = [
    { id: 'layout-before', layoutId: 'layout', startMs: 0, durationMs: 600, parameters: {} },
    { id: 'layout-after', layoutId: 'layout', startMs: 600, durationMs: 1400, parameters: {} },
  ]
  const template = record.composition.clips[0]
  record.composition.clips = [
    { ...structuredClone(template), id: 'before', startMs: 0, durationMs: 100, appearance: { keys: [{ ...structuredClone(template.appearance.keys[0]), timeMs: 0 }] } },
    { ...structuredClone(template), id: 'selected', startMs: 200, durationMs: 400, appearance: { keys: [{ ...structuredClone(template.appearance.keys[0]), timeMs: 200 }, { ...structuredClone(template.appearance.keys[0]), id: 'dim', timeMs: 400, value: { ...structuredClone(template.appearance.keys[0].value), opacity: 0.5 } }] } },
    { ...structuredClone(template), id: 'after', startMs: 700, durationMs: 300, appearance: { keys: [{ ...structuredClone(template.appearance.keys[0]), timeMs: 700 }] } },
  ]
  const transition = { kind: 'crossfade' as const, durationMs: 100, easing: { curve: 'linear' as const }, crossfadePolicy: 'live-live' as const, propertyRamps: [] }
  record.composition.transitions = [
    { ...transition, id: 'incoming', participants: [{ id: 'pair-in', zoneId: template.zoneId, layerId: template.layerId, fromClipId: 'before', toClipId: 'selected' }] },
    { ...transition, id: 'outgoing', participants: [{ id: 'pair-out', zoneId: template.zoneId, layerId: template.layerId, fromClipId: 'selected', toClipId: 'after' }] },
  ]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}
function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}
it('maps both selected edges and connected successors atomically across fixed Layouts', () => {
  const source = fixture()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'trim', clipId: 'selected', startMs: 250, endMs: 550 })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const next = reopen(result.record)
  expect(next.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([['before', 0, 100], ['selected', 250, 300], ['after', 650, 300]])
  expect(next.composition.transitions.map(transition => [transition.id, transition.durationMs])).toEqual([['incoming', 150], ['outgoing', 100]])
  expect(next.composition.layoutOccurrences).toEqual(source.composition.layoutOccurrences)
  expect(next.composition.clips[1].appearance.keys.map(key => key.timeMs)).toEqual([250, 400])
  expect(result.affectedClipIds).toEqual(['after', 'selected'])
  expect(result.affectedTransitionIds).toEqual(['incoming', 'outgoing'])
  expect(source).toEqual(prior)
})

it('splits a connected Clip with incoming endpoints on the left and outgoing endpoints on the right', () => {
  const source = fixture()
  source.composition.clips[1].entryPolicy = 'restart'
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'split', clipId: 'selected', atMs: 400, rightClipId: 'right' })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const next = reopen(result.record)
  expect(next.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs, clip.entryPolicy])).toEqual([['before', 0, 100, 'continue'], ['selected', 200, 200, 'restart'], ['right', 400, 200, 'continue'], ['after', 700, 300, 'continue']])
  expect(next.composition.transitions[0].participants[0].toClipId).toBe('selected')
  expect(next.composition.transitions[1].participants[0].fromClipId).toBe('right')
  expect(next.composition.clips[2].appearance.keys[0]).toMatchObject({ id: 'right:appearance:1', timeMs: 400, value: { opacity: 0.5 } })
  expect(next.composition.patternInstances).toEqual(source.composition.patternInstances)
  expect(source).toEqual(prior)
})

it('mints conversion-style appearance-key ids on the split right half (#1068 gap 5)', () => {
  const source = fixture()
  const selected = source.composition.clips[1]
  const value = structuredClone(selected.appearance.keys[0].value)
  selected.appearance.keys = [{ id: 'selected:appearance:1', timeMs: 200, value }]
  source.composition.transitions = []
  expect(validateShowRecordV2(source)).toEqual([])
  const result = editShowClipTemporalV2(source, { kind: 'split', clipId: 'selected', atMs: 400, rightClipId: 'right' })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const next = reopen(result.record)
  expect(next.composition.clips[1].appearance.keys).toEqual([{ id: 'selected:appearance:1', timeMs: 200, value }])
  expect(next.composition.clips[2].appearance.keys).toEqual([{ id: 'right:appearance:1', timeMs: 400, value }])
  expect(result.affectedAppearanceKeyIds).toEqual(['right:appearance:1'])
  expect(result.removedIds).toEqual([])
})

it('renumbers a multi-key split right half from one under the right Clip id (#1068 gap 5)', () => {
  const source = fixture()
  const result = editShowClipTemporalV2(source, { kind: 'split', clipId: 'selected', atMs: 300, rightClipId: 'right' })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const next = reopen(result.record)
  expect(next.composition.clips[2].appearance.keys.map(key => [key.id, key.timeMs])).toEqual([['right:appearance:1', 300], ['right:appearance:2', 400]])
})

it('moves a component once with a held Group user while shared global animation stays fixed', () => {
  const source = fixture()
  const selected = source.composition.clips[1]
  const { zoneId: _zone, ...child } = structuredClone(selected)
  source.composition.groupDefinitions = [{ id: 'group', name: 'Linked', patternInstances: [{ ...structuredClone(source.composition.patternInstances[0]), id: 'slot' }], layers: [{ id: 'local', name: 'Child', rank: 0 }], clips: [{ ...child, id: 'child', instanceId: 'slot', layerId: 'local', startMs: 0, durationMs: 100, appearance: { keys: [{ ...structuredClone(child.appearance.keys[0]), timeMs: 0 }] } }], transitions: [], propertyTracks: [] }]
  source.composition.groupOccurrences = [{ id: 'use', definitionId: 'group', zoneId: selected.zoneId, layoutOccurrenceId: 'layout-after', startMs: 1200, translationX: 0.2, translationY: 0.1, layerBindings: [{ definitionLayerId: 'local', layerId: selected.layerId }], instanceBindings: { slot: 'instance' }, holds: [{ id: 'held', localTimeMs: 50, durationMs: 100 }] }]
  const keys = [{ id: 'first', timeMs: 200, value: 1, easing: { curve: 'quadratic' as const, direction: 'in' as const } }, { id: 'last', timeMs: 600, value: 0, easing: { curve: 'linear' as const } }]
  source.composition.propertyTracks = [
    { id: 'clip-opacity', target: { kind: 'clip-opacity', clipId: 'selected' }, activeStartMs: 200, activeDurationMs: 400, keyframes: structuredClone(keys) },
    { id: 'shared-speed', target: { kind: 'instance-time-scale', instanceId: 'instance' }, activeStartMs: 200, activeDurationMs: 400, keyframes: structuredClone(keys) },
    { id: 'show-speed', target: { kind: 'show-repeat-scale' }, activeStartMs: 200, activeDurationMs: 400, keyframes: structuredClone(keys) },
  ]
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'move', clipId: 'selected', startMs: 300 })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  const next = reopen(result.record)
  expect(next.composition.clips.map(clip => clip.startMs)).toEqual([100, 300, 800])
  expect(next.composition.propertyTracks[0].keyframes.map(key => key.timeMs)).toEqual([300, 700])
  expect(next.composition.propertyTracks.slice(1)).toEqual(source.composition.propertyTracks.slice(1))
  expect(next.composition.groupDefinitions).toEqual(source.composition.groupDefinitions)
  expect(next.composition.groupOccurrences).toEqual(source.composition.groupOccurrences)
  expect(result.affectedTrackIds).toEqual(['clip-opacity'])
  expect(source).toEqual(prior)
})

it('refuses complete contribution loss in a fixed Layout even when nominal selected timing is covered', () => {
  const source = fixture()
  source.zones.push({ id: 'zone-b', name: 'Other', nominalPixelCount: 16 })
  source.composition.layers.push({ id: 'layer-b', zoneId: 'zone-b', name: 'Main', rank: 0 })
  source.zoneLayouts.push({ id: 'empty', name: 'Other Zone', zones: [], logical: { kind: 'single', zoneIds: ['zone-b'] } })
  source.composition.layoutOccurrences = [
    { id: 'visible', layoutId: 'layout', startMs: 0, durationMs: 1100, parameters: {} },
    { id: 'gone', layoutId: 'empty', startMs: 1100, durationMs: 900, parameters: {} },
  ]
  expect(validateShowRecordV2(source)).toEqual([])
  // Moving the connected component by 200 leaves the selected nominal interval
  // covered, while the stationary routing cannot cover the successor through1200.
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'move', clipId: 'selected', startMs: 400 })
  expect(result.status).toBe('refused')
  expect(result.record).toBe(source)
  expect(result.affectedClipIds).toEqual([])
  expect(source).toEqual(prior)
})

it('delegates a zero incoming duration to Reset without leaving a dormant Transition', () => {
  const source = fixture()
  const result = editShowClipTemporalV2(source, { kind: 'extend', clipId: 'selected', startMs: 100, endMs: 600 })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const next = reopen(result.record)
  expect(next.composition.transitions.map(transition => transition.id)).toEqual(['outgoing'])
  expect(next.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([['before', 0, 100], ['selected', 100, 400], ['after', 600, 300]])
  expect(result.removedIds).toContain('incoming')
})

const sourceCode = 'export var calls = 0; export var elapsed = 0; export var randomValue = 0; export function beforeRender(delta) { calls++; elapsed += delta; randomValue = random(1) } export function render2D(index, x, y) { rgb(elapsed / 2000, randomValue, 0) }'
function playback(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const prepared = prepareShowV2ForCompile(reopen(record), { byCellId: {}, byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(record).composition.patternInstances.map(instance => [instance.id, sourceCode])), stageDimension: 2 }, { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const reopened = parseEpe(buildShowEpeExport(convertibleV1Show(), artifact.code, { id: 'temporal-proof', stampedAt: '2026-09-16T00:00:00Z' }).text)
  expect(reopened.stamp?.kind).toBe('show')
  return { artifact, runtime: createFastReplayRuntime({ ...artifact, code: reopened.src, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] }) }
}
it.each(['fast', 'fidelity'] as const)('reopened two-edge playback matches independently authored timing/state/PRNG in %s', fidelity => {
  const source = fixture()
  source.composition.executionModel = 'continuous'
  // This consumer isolates admitted connected choreography; repeated Layout
  // topology has a separate existing adapter refusal before and after the edit.
  source.composition.layoutOccurrences = [{ id: 'layout-only', layoutId: 'layout', startMs: 0, durationMs: 2000, parameters: {} }]
  source.composition.clips[1].appearance.keys.splice(1)
  const edited = editShowClipTemporalV2(source, { kind: 'trim', clipId: 'selected', startMs: 250, endMs: 550 })
  expect(edited.status).toBe('changed')
  if (edited.status !== 'changed') return
  const expected = structuredClone(source)
  expected.composition.clips[1].startMs = 250
  expected.composition.clips[1].durationMs = 300
  expected.composition.clips[1].appearance.keys[0].timeMs = 250
  expected.composition.clips[2].startMs = 650
  expected.composition.clips[2].appearance.keys[0].timeMs = 650
  expected.composition.transitions[0].durationMs = 150
  const actual = playback(edited.record, fidelity)
  const oracle = playback(expected, fidelity)
  expect(actual.artifact.code).toBe(oracle.artifact.code)
  for (const time of [0, 99, 100, 149, 249, 250, 251, 549, 550, 599, 600, 649, 650, 651, 949, 950, 2000, 2100]) {
    const a = actual.runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true })
    const b = oracle.runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true })
    expect(Array.from(a.frame), `frame@${time}`).toEqual(Array.from(b.frame))
    expect(a.exports, `state/PRNG@${time}`).toEqual(b.exports)
  }
})
it.each(['fast', 'fidelity'] as const)('split with both attached endpoints preserves reopened %s state and output', fidelity => {
  const source = fixture()
  source.composition.executionModel = 'continuous'
  // This consumer isolates admitted connected choreography; repeated Layout
  // topology has a separate existing adapter refusal before and after the edit.
  source.composition.layoutOccurrences = [{ id: 'layout-only', layoutId: 'layout', startMs: 0, durationMs: 2000, parameters: {} }]
  source.composition.clips[1].appearance.keys.splice(1)
  source.composition.clips[1].entryPolicy = 'restart'
  const edited = editShowClipTemporalV2(source, { kind: 'split', clipId: 'selected', atMs: 400, rightClipId: 'right' })
  expect(edited.status).toBe('changed')
  if (edited.status !== 'changed') return
  expect(deriveShowRestartEventsV2(edited.record)).toEqual(deriveShowRestartEventsV2(source))
  const actual = playback(edited.record, fidelity)
  const oracle = playback(source, fidelity)
  expect(actual.artifact.summary.clips.length).toBe(oracle.artifact.summary.clips.length)
  for (const time of [0, 99, 100, 199, 200, 399, 400, 401, 599, 600, 699, 700, 701, 999, 1000, 2000, 2400]) {
    const a = actual.runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true })
    const b = oracle.runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true })
    expect(Array.from(a.frame), `frame@${time}`).toEqual(Array.from(b.frame))
    expect(a.exports, `state/PRNG@${time}`).toEqual(b.exports)
  }
})
it('partitions retained nonlinear Clip activation exactly and keeps one global instance owner on split', () => {
  const source = fixture()
  const track = { id: 'opacity', target: { kind: 'clip-opacity' as const, clipId: 'selected' }, activeStartMs: 200, activeDurationMs: 400, keyframes: [{ id: 'first', timeMs: 200, value: 0, easing: { curve: 'quadratic' as const, direction: 'in' as const } }, { id: 'last', timeMs: 600, value: 1, easing: { curve: 'linear' as const } }] }
  source.composition.propertyTracks = [track, { ...structuredClone(track), id: 'speed', target: { kind: 'instance-time-scale', instanceId: 'instance' } }]
  const edited = editShowClipTemporalV2(source, { kind: 'split', clipId: 'selected', atMs: 400, rightClipId: 'right' })
  expect(edited.status).toBe('changed')
  if (edited.status !== 'changed') return
  const next = reopen(edited.record)
  expect(next.composition.propertyTracks.find(candidate => candidate.id === 'speed')).toEqual(source.composition.propertyTracks[1])
  const pieces = next.composition.propertyTracks.filter(candidate => 'clipId' in candidate.target)
  for (const time of [199, 200, 399, 400, 401, 599, 600]) {
    const active = pieces.filter(piece => evaluateShowPropertyTrackV2(piece, time) !== undefined)
    expect(active.length).toBe(time >= 200 && time < 600 ? 1 : 0)
    if (active.length) expect(evaluateShowPropertyTrackV2(active[0], time)).toBeCloseTo(((time - 200) / 400) ** 2, 12)
  }
  expect(edited.affectedTrackIds).toEqual(['opacity', 'opacity:split:right'])
})

it('retargets exact whole-output outgoing membership on split without changing contributor sets or settings', () => {
  const source = fixture()
  for (const transition of source.composition.transitions) {
    const participant = transition.participants[0]
    const from = source.composition.clips.find(clip => clip.id === participant.fromClipId)!
    transition.wholeOutput = { startMs: from.startMs + from.durationMs, fromClipIds: [participant.fromClipId], toClipIds: [participant.toClipId] }
    transition.participants = []
  }
  const result = editShowClipTemporalV2(source, { kind: 'split', clipId: 'selected', atMs: 400, rightClipId: 'right' })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const next = reopen(result.record)
  expect(next.composition.transitions[0]).toEqual(source.composition.transitions[0])
  expect(next.composition.transitions[1]).toEqual({ ...source.composition.transitions[1], wholeOutput: { startMs: 600, fromClipIds: ['right'], toClipIds: ['after'] } })
})
it('preserves explicit projection requirements for a prepared scalar-ramp zero Reset', () => {
  const source = scalarRampFixture()
  expect(playback(source, 'fast').artifact.code.length).toBeGreaterThan(0)
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'extend', clipId: 'selected', startMs: 100, endMs: 600 })
  expect(result).toMatchObject({ status: 'refused', code: 'unsupported-property-carrier', affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [], removedIds: [] })
  expect(result.record).toBe(source)
  expect(source).toEqual(prior)
})
it.each([
  { kind: 'move', clipId: 'selected', startMs: 300, extra: true },
  { kind: 'move', clipId: 'selected' },
  { kind: 'unknown', clipId: 'selected', startMs: 300 },
  { kind: 'split', clipId: 'selected', atMs: 400, rightClipId: ' ' },
  { kind: 'move', clipId: 'selected', startMs: Number.MAX_SAFE_INTEGER },
  { kind: 'trim', clipId: 'selected', startMs: 100, endMs: 550 },
  { kind: 'extend', clipId: 'selected', startMs: 250, endMs: 600 },
  { kind: 'extend', clipId: 'selected', startMs: 99, endMs: 600 },
])('refuses strict invalid temporal input atomically ($kind)', raw => {
  const source = fixture()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, raw as Parameters<typeof editShowClipTemporalV2>[1])
  expect(result.status).toBe('refused')
  expect(result.record).toBe(source)
  expect(result.affectedClipIds).toEqual([])
  expect(result.affectedAppearanceKeyIds).toEqual([])
  expect(result.affectedPropertyKeyIds).toEqual([])
  expect(source).toEqual(prior)
})
it('returns a valid exact no-op record by identity and unaliases all changed payloads', () => {
  const source = fixture()
  const noop = editShowClipTemporalV2(source, { kind: 'trim', clipId: 'selected', startMs: 200, endMs: 600 })
  expect(noop.status).toBe('unchanged')
  expect(noop.record).toBe(source)
  expect(noop.affectedClipIds).toEqual([])
  const prior = structuredClone(source)
  const changed = editShowClipTemporalV2(source, { kind: 'trim', clipId: 'selected', startMs: 250, endMs: 550 })
  if (changed.status !== 'changed') throw new Error('Trim refused')
  changed.record.composition.patternInstances[0].time.timeScale = 3
  changed.record.composition.clips[1].appearance.keys[0].value.view.brightness = 0
  expect(source).toEqual(prior)
})

function scalarRampFixture(): ShowRecordV2 {
  const source = fixture()
  source.composition.executionModel = 'continuous'
  source.composition.layoutOccurrences = [{ id: 'layout-only', layoutId: 'layout', startMs: 0, durationMs: 2000, parameters: {} }]
  source.composition.clips[1].appearance.keys.splice(1)
  for (const clip of source.composition.clips) {
    const instance = { ...structuredClone(source.composition.patternInstances[0]), id: `${clip.id}-instance` }
    source.composition.patternInstances.push(instance)
    clip.instanceId = instance.id
  }
  for (const transition of source.composition.transitions) {
    const participant = transition.participants[0]
    const from = source.composition.clips.find(clip => clip.id === participant.fromClipId)!
    transition.wholeOutput = { startMs: from.startMs + from.durationMs, fromClipIds: [participant.fromClipId], toClipIds: [participant.toClipId] }
    transition.participants = []
  }
  source.composition.transitions[0].propertyRamps = [{ target: { kind: 'show-repeat-scale' }, from: 2, easing: { curve: 'linear' } }]
  expect(validateShowRecordV2(source)).toEqual([])
  return source
}
const rampProjections = [{ rampIndex: 0, trackId: 'retained-ramp', startKeyId: 'ramp:first', endKeyId: 'ramp:last', activeEndMs: 600, toValue: 4 }]
it.each(['fast', 'fidelity'] as const)('projects a prepared zero Reset and simultaneous trailing edge without moving retained scalar animation in %s', fidelity => {
  const source = scalarRampFixture()
  expect(playback(source, fidelity).artifact.code.length).toBeGreaterThan(0)
  const edited = editShowClipTemporalV2(source, { kind: 'extend', clipId: 'selected', startMs: 100, endMs: 650, propertyRampProjections: rampProjections })
  expect(edited.status).toBe('changed')
  if (edited.status !== 'changed') return
  const expected = structuredClone(source)
  expected.composition.transitions.shift()
  expected.composition.transitions[0].wholeOutput!.startMs = 550
  expected.composition.clips[1].startMs = 100
  expected.composition.clips[1].durationMs = 450
  expected.composition.clips[1].appearance.keys[0].timeMs = 100
  expected.composition.clips[2].startMs = 650
  expected.composition.clips[2].appearance.keys[0].timeMs = 650
  expected.composition.propertyTracks = [{ id: 'retained-ramp', target: { kind: 'show-repeat-scale' }, activeStartMs: 100, activeDurationMs: 500, keyframes: [
    { id: 'ramp:first', timeMs: 100, value: 2, easing: { curve: 'linear' } }, { id: 'ramp:last', timeMs: 200, value: 4, easing: { curve: 'linear' } },
  ] }]
  expect(reopen(edited.record)).toEqual(expected)
  expect(edited.affectedTrackIds).toContain('retained-ramp')
  expect(edited.affectedPropertyKeyIds).toEqual(['ramp:first', 'ramp:last'])
  const actual = playback(edited.record, fidelity)
  const oracle = playback(expected, fidelity)
  expect(actual.artifact.code).toBe(oracle.artifact.code)
  for (const time of [0, 99, 100, 101, 149, 199, 200, 201, 549, 550, 599, 600, 649, 650, 651, 949, 950, 2000]) {
    const a = actual.runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true })
    const b = oracle.runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true })
    expect(Array.from(a.frame), `frame@${time}`).toEqual(Array.from(b.frame))
    expect(a.exports, `state@${time}`).toEqual(b.exports)
  }
})

it('reserves effective held-Group identities when splitting authored Clip tracks', () => {
  const source = fixture()
  const selected = source.composition.clips[1]
  const { zoneId: _zone, ...child } = structuredClone(selected)
  source.composition.groupDefinitions = [{ id: 'group', name: 'Linked', patternInstances: [{ ...structuredClone(source.composition.patternInstances[0]), id: 'slot' }], layers: [{ id: 'local', name: 'Child', rank: 0 }], clips: [{ ...child, id: 'child', instanceId: 'slot', layerId: 'local', startMs: 0, durationMs: 100, appearance: { keys: [{ ...structuredClone(child.appearance.keys[0]), timeMs: 0 }] } }], transitions: [], propertyTracks: [{ id: 'opacity:split:right', target: { kind: 'clip-opacity', clipId: 'child' }, activeStartMs: 0, activeDurationMs: 100, keyframes: [{ id: 'local:first', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'local:last', timeMs: 100, value: 1, easing: { curve: 'linear' } }] }] }]
  source.composition.groupOccurrences = [{ id: 'use', definitionId: 'group', zoneId: selected.zoneId, layoutOccurrenceId: 'layout-after', startMs: 1200, translationX: 0.2, translationY: 0.1, layerBindings: [{ definitionLayerId: 'local', layerId: selected.layerId }], instanceBindings: { slot: 'instance' }, holds: [{ id: 'held', localTimeMs: 50, durationMs: 100 }] }]
  source.composition.propertyTracks = [{ id: 'use:opacity', target: { kind: 'clip-opacity', clipId: 'selected' }, activeStartMs: 200, activeDurationMs: 400, keyframes: [{ id: 'first', timeMs: 200, value: 0, easing: { curve: 'linear' } }, { id: 'last', timeMs: 600, value: 1, easing: { curve: 'linear' } }] }]
  expect(validateShowRecordV2(source)).toEqual([])
  const result = editShowClipTemporalV2(source, { kind: 'split', clipId: 'selected', atMs: 400, rightClipId: 'right' })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  expect(reopen(result.record).composition.propertyTracks.map(track => track.id)).toEqual(['use:opacity', 'use:opacity:split:right:2'])
  expect(result.record.composition.groupDefinitions).toEqual(source.composition.groupDefinitions)
  expect(result.record.composition.groupOccurrences).toEqual(source.composition.groupOccurrences)
})

it.each([
  { plans: [], label: 'missing complete projection' },
  { plans: [...rampProjections, { ...rampProjections[0], rampIndex: 1, trackId: 'extra', startKeyId: 'extra:first', endKeyId: 'extra:last' }], label: 'extraneous ramp index' },
  { plans: [{ ...rampProjections[0], rampIndex: 3 }], label: 'wrong ramp index' },
  { plans: [{ ...rampProjections[0], trackId: 'occupied' }], label: 'colliding identity' },
  { plans: [{ ...rampProjections[0], startKeyId: ' ' }], label: 'blank key identity' },
  { plans: [{ ...rampProjections[0], activeEndMs: 199 }], label: 'activation removes retained ramp' },
  { plans: [{ ...rampProjections[0], extra: true }], label: 'extraneous projection fields' },
])('refuses $label without removing the carrier or adopting partial geometry', ({ plans }) => {
  const source = scalarRampFixture()
  source.composition.propertyTracks = [{ id: 'occupied', target: { kind: 'clip-opacity', clipId: 'before' }, activeStartMs: 0, activeDurationMs: 100, keyframes: [{ id: 'occupied:first', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'occupied:last', timeMs: 100, value: 1, easing: { curve: 'linear' } }] }]
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'extend', clipId: 'selected', startMs: 100, endMs: 650, propertyRampProjections: plans })
  expect(result).toMatchObject({ status: 'refused', code: 'unsupported-property-carrier', affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [], removedIds: [] })
  expect(result.record).toBe(source)
  expect(source).toEqual(prior)
})
it.each([
  { kind: 'trim', clipId: 'selected', startMs: 250, endMs: 550, propertyRampProjections: rampProjections },
  { kind: 'extend', clipId: 'selected', startMs: 200, endMs: 600, propertyRampProjections: [] },
  { kind: 'move', clipId: 'selected', startMs: 300, propertyRampProjections: rampProjections },
  { kind: 'split', clipId: 'selected', atMs: 400, rightClipId: 'right', propertyRampProjections: rampProjections },
])('refuses projections in the wrong temporal partition ($kind)', raw => {
  const source = scalarRampFixture()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, raw as Parameters<typeof editShowClipTemporalV2>[1])
  expect(result.status).toBe('refused')
  expect(result.record).toBe(source)
  expect(result.affectedClipIds).toEqual([])
  expect(result.affectedTrackIds).toEqual([])
  expect(source).toEqual(prior)
})


it('public Clip dispatch consumes the temporal transaction with connected edges and complete affected collections', () => {
  const source = fixture()
  const intent = { kind: 'trim' as const, clipId: 'selected', startMs: 250, endMs: 550 }
  expect(editShowClipV2(source, intent)).toEqual(editShowClipTemporalV2(source, intent))
})

it('public temporal resize forwards the complete explicit zero Reset projection plan', () => {
  const source = scalarRampFixture()
  const intent = { kind: 'extend' as const, clipId: 'selected', startMs: 100, endMs: 650, propertyRampProjections: rampProjections }
  expect(editShowClipV2(source, intent)).toEqual(editShowClipTemporalV2(source, intent))
  const outside = { ...intent, propertyRampProjections: [{ ...rampProjections[0], toValue: 8.00000001 }] }
  const refused = editShowClipV2(source, outside)
  expect(refused.status).toBe('refused');expect(refused.record).toBe(source);expect(refused.affectedClipIds).toEqual([])
})

it.each([0.99999999, 8.00000001])('prepared zero Reset refuses outside source endpoint%s through public dispatch', outside => {
  const source = scalarRampFixture()
  source.composition.transitions[0].propertyRamps[0].from = outside
  expect(playback(source, 'fast').artifact.code.length).toBeGreaterThan(0)
  const result = editShowClipV2(source, { kind: 'extend', clipId: 'selected', startMs: 100, endMs: 650, propertyRampProjections: rampProjections })
  expect(result.status).toBe('refused');expect(result.record).toBe(source);expect(result.affectedClipIds).toEqual([]);expect(result.affectedTrackIds).toEqual([])
})

it('public temporal missing-target refusal carries every empty affected collection from its owner', () => {
  const source = fixture()
  const intent = { kind: 'move' as const, clipId: 'absent', startMs: 300 }
  expect(editShowClipV2(source, intent)).toEqual(editShowClipTemporalV2(source, intent))
})

it('refuses a fractional startMs at the temporal owner instead of rounding it', () => {
  const source = fixture()
  const template = source.composition.clips[0]
  const prior = structuredClone(source)
  const move = editShowClipTemporalV2(source, { kind: 'move', clipId: 'selected', startMs: 250.4 })
  expect(move).toMatchObject({ status: 'refused', code: 'invalid-intent' })
  expect(move.record).toBe(source)
  const replace = editShowClipTemporalV2(source, {
    kind: 'replace-placement', clipId: 'selected',
    zoneId: template.zoneId, layerId: template.layerId, startMs: 250.4,
  })
  expect(replace).toMatchObject({ status: 'refused', code: 'invalid-intent' })
  expect(replace.record).toBe(source)
  expect(source).toEqual(prior)
})

it.each((['participants', 'whole-output'] as const).flatMap(topology => ([['full', 100, 700], ['incoming-only', 100, 200], ['outgoing-only', 600, 700]] as const).map(([name, start, end]) => ({ topology, name, start, end }))))('Split partitions $name contribution animation through $topology endpoints', ({ topology, name, start, end }) => {
    const source = fixture()
    if (topology === 'whole-output') for (const transition of source.composition.transitions) {
      const participant = transition.participants[0]
      const from = source.composition.clips.find(clip => clip.id === participant.fromClipId)!
      transition.wholeOutput = { startMs: from.startMs + from.durationMs, fromClipIds: [participant.fromClipId], toClipIds: [participant.toClipId] }
      transition.participants = []
    }
    const track = { id: name, target: { kind: 'clip-opacity' as const, clipId: 'selected' }, activeStartMs: start, activeDurationMs: end - start, keyframes: [
      { id: `${name}:first`, timeMs: start, value: 0.2, easing: { curve: 'quadratic' as const, direction: 'in' as const } },
      { id: `${name}:last`, timeMs: end, value: 0.8, easing: { curve: 'linear' as const } },
    ] }
    source.composition.propertyTracks = [track]
    const prior = structuredClone(source)
    const result = editShowClipV2(source, { kind: 'split', clipId: 'selected', atMs: 400, rightClipId: 'right' })
    expect(result.status, name).toBe('changed')
    if (result.status !== 'changed') throw new Error('Split refused')
    const opened = reopen(result.record)
    for (const time of [99, 100, 150, 199, 200, 399, 400, 401, 599, 600, 650, 699, 700]) {
      const owner = time < 400 ? 'selected' : 'right'
      const active = opened.composition.propertyTracks.find(candidate => 'clipId' in candidate.target && candidate.target.clipId === owner && evaluateShowPropertyTrackV2(candidate, time) !== undefined)
      expect(active ? evaluateShowPropertyTrackV2(active, time) : undefined, `${name}@${time}`).toEqual(evaluateShowPropertyTrackV2(track, time))
    }
    if (name === 'incoming-only') { expect(result.affectedTrackIds).toEqual([]);expect(opened.composition.propertyTracks[0]).toEqual(track) }
    else expect(result.affectedTrackIds).toContain(name)
    expect(opened.composition.patternInstances).toEqual(source.composition.patternInstances)
    expect(source).toEqual(prior)
})

it.each(['participants', 'whole-output'] as const)('Split retains existing typed positive-window animation preparation limit for%s', topology => {
  const source = fixture()
  source.composition.executionModel = 'continuous'
  source.composition.layoutOccurrences = [{ id: 'layout-only', layoutId: 'layout', startMs: 0, durationMs: 2000, parameters: {} }]
  source.composition.clips[1].appearance.keys.splice(1)
  source.composition.clips[1].entryPolicy = 'restart'
  source.composition.propertyTracks = [{ id: 'opacity', target: { kind: 'clip-opacity', clipId: 'selected' }, activeStartMs: 100, activeDurationMs: 600, keyframes: [
    { id: 'first', timeMs: 100, value: 0.25, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'last', timeMs: 700, value: 0.75, easing: { curve: 'linear' } },
  ] }]
  if (topology === 'whole-output') for (const transition of source.composition.transitions) {
    const participant = transition.participants[0]
    const from = source.composition.clips.find(clip => clip.id === participant.fromClipId)!
    transition.wholeOutput = { startMs: from.startMs + from.durationMs, fromClipIds: [participant.fromClipId], toClipIds: [participant.toClipId] }
    transition.participants = []
  }
  const edited = editShowClipTemporalV2(source, { kind: 'split', clipId: 'selected', atMs: 400, rightClipId: 'right' })
  expect(edited.status).toBe('changed')
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: sourceCode }, stageDimension: 2 as const }
  const code = topology === 'participants' ? 'unsupported-transition-property-track' : 'compiler-ineligible'
  for (const record of [source, reopen(edited.record)]) {
    const prepared = prepareShowV2ForCompile(record, lookup, { libraries: LIBRARIES })
    expect(prepared.status).toBe('refused')
    if (prepared.status !== 'refused') throw new Error('Unexpected admission')
    expect(prepared.issues.length).toBeGreaterThan(0)
    expect(prepared.issues.every(issue => issue.code === code)).toBe(true)
  }
  expect(deriveShowRestartEventsV2(edited.record)).toEqual(deriveShowRestartEventsV2(source))
})


it.each(['length', 'constructor', '0', -1, 0.5, NaN, Infinity, -Infinity, {}, null, undefined, true, Number.MAX_SAFE_INTEGER, 1])('malformed ramp index %s refuses atomically before array access', rawIndex => {
  const source = scalarRampFixture()
  const prior = structuredClone(source)
  const plans = [{ ...rampProjections[0], rampIndex: rawIndex }] as unknown as ShowTransitionRampProjectionV2[]
  for (const owner of [editShowClipTemporalV2, editShowClipV2]) {
    const result = owner(source, { kind: 'extend', clipId: 'selected', startMs: 100, endMs: 650, propertyRampProjections: plans })
    expect(result.status).toBe('refused')
    expect(result.record).toBe(source)
    for (const [key, value] of Object.entries(result)) if (key.startsWith('affected') || key === 'removedIds' || key === 'discardedControlTargets') expect(value).toEqual([])
  }
  const direct = projectShowTransitionPropertyRampsV2(source, source.composition.transitions[0].id, plans)
  expect(direct.status).toBe('refused')
  expect(direct.record).toBe(source)
  expect(direct.affectedTrackIds).toEqual([])
  expect(source).toEqual(prior)
})

it('valid zero and complete reordered multiramp indices preserve caller identities', () => {
  const source = scalarRampFixture()
  const zero = editShowClipTemporalV2(source, { kind: 'extend', clipId: 'selected', startMs: 100, endMs: 650, propertyRampProjections: rampProjections })
  expect(zero.status).toBe('changed')
  source.composition.transitions[0].propertyRamps.push({ target: { kind: 'clip-opacity', clipId: 'selected' }, from: 0.4, easing: { curve: 'linear' } })
  expect(validateShowRecordV2(source)).toEqual([])
  const plans = [{ ...rampProjections[0], rampIndex: 1, trackId: 'opacity-projection', startKeyId: 'opacity:start', endKeyId: 'opacity:end', toValue: 0.8 }, rampProjections[0]]
  const result = editShowClipTemporalV2(source, { kind: 'extend', clipId: 'selected', startMs: 100, endMs: 650, propertyRampProjections: plans })
  expect(result.status).toBe('changed')
  expect(reopen(result.record).composition.propertyTracks.map(track => [track.id, track.keyframes.map(key => key.id)])).toEqual([['opacity-projection', ['opacity:start', 'opacity:end']], ['retained-ramp', ['ramp:first', 'ramp:last']]])
})

it('keeps a keyless incoming Clip value ramp spanning a native leading edge window', () => {
  const source = fixture()
  const boundary = source.composition.transitions[0]
  boundary.propertyRamps = [{
    participantId: boundary.participants[0].id,
    target: { kind: 'clip-view', clipId: 'selected', property: 'brightness' }, from: 0.2,
  }]
  expect(validateShowRecordV2(source)).toEqual([])
  const grown = editShowClipTemporalV2(source, { kind: 'trim', clipId: 'selected', startMs: 250, endMs: 600 })
  expect(grown.status).toBe('changed')
  if (grown.status !== 'changed') return
  expect(grown.record.composition.transitions[0].durationMs).toBe(150)
  expect(grown.record.composition.transitions[0].propertyRamps[0].durationMs).toBeUndefined()
  expect(validateShowRecordV2(grown.record)).toEqual([])
  const shrunk = editShowClipTemporalV2(source, { kind: 'extend', clipId: 'selected', startMs: 150, endMs: 600 })
  expect(shrunk.status).toBe('changed')
  if (shrunk.status !== 'changed') return
  expect(shrunk.record.composition.transitions[0].durationMs).toBe(50)
  expect(shrunk.record.composition.transitions[0].propertyRamps[0].durationMs).toBeUndefined()
  expect(validateShowRecordV2(shrunk.record)).toEqual([])
})

it('proportionally retimes a native edge carrying a clip-effect ramp', () => {
  const source = fixture()
  const boundary = source.composition.transitions[0]
  boundary.propertyRamps = [{
    participantId: boundary.participants[0].id,
    target: { kind: 'clip-effect', clipId: 'selected', effectId: 'hue', effectKind: 'hue', parameterId: 'turns' }, from: 0.2, durationMs: 40,
  }]
  expect(validateShowRecordV2(source)).toEqual([])
  const result = editShowClipTemporalV2(source, { kind: 'trim', clipId: 'selected', startMs: 250, endMs: 600 })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.record.composition.transitions[0].durationMs).toBe(150)
  expect(result.record.composition.transitions[0].propertyRamps).toEqual([{ ...boundary.propertyRamps[0], durationMs: 60 }])
  expect(validateShowRecordV2(result.record)).toEqual([])
})

it('resizes the trailing edge against a native Transition carrying a clip-opacity ramp (#1091 C1)', () => {
  const source = fixture()
  const boundary = source.composition.transitions[1]
  boundary.propertyRamps = [{ target: { kind: 'clip-opacity', clipId: 'after' }, from: 0.4 }]
  expect(validateShowRecordV2(source)).toEqual([])
  const result = editShowClipTemporalV2(source, { kind: 'trim', clipId: 'selected', startMs: 200, endMs: 550 })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.record.composition.clips.find(clip => clip.id === 'after')?.startMs).toBe(650)
  expect(result.record.composition.transitions[1].propertyRamps).toEqual(boundary.propertyRamps)
  expect(validateShowRecordV2(result.record)).toEqual([])
})

it('resizes the leading edge against a whole-output Transition carrying a show-repeat-scale ramp (#1091 C1)', () => {
  const source = fixture()
  const boundary = source.composition.transitions[0]
  boundary.participants = []
  boundary.wholeOutput = { startMs: 100, fromClipIds: ['before'], toClipIds: ['selected'] }
  boundary.propertyRamps = [{ target: { kind: 'show-repeat-scale' }, from: 2 }]
  expect(validateShowRecordV2(source)).toEqual([])
  const result = editShowClipTemporalV2(source, { kind: 'trim', clipId: 'selected', startMs: 250, endMs: 600 })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.record.composition.transitions[0]).toMatchObject({ durationMs: 150, wholeOutput: { startMs: 100 }, propertyRamps: boundary.propertyRamps })
  expect(validateShowRecordV2(result.record)).toEqual([])
})

it('names the validator overlap issue when a move lands on an occupied same-Layer range (#1098)', () => {
  const source = fixture()
  source.composition.transitions = []
  const result = editShowClipTemporalV2(source, { kind: 'move', clipId: 'after', startMs: 300 })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-result', issueCode: 'overlap' })
})

function convertedSplitFixture(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(showSplitClipFixture())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

function splitPreparation(record: ShowRecordV2) {
  const lookup = { byCellId: {}, byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(record).composition.patternInstances.map(instance => [instance.id, sourceCode])), stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(reopen(record), lookup, { libraries: LIBRARIES })
  return prepared.status === 'refused' ? prepared.issues : prepared.status
}

function activation(record: ShowRecordV2, id: string): number[] {
  const track = record.composition.propertyTracks.find(candidate => candidate.id === id)!
  return [track.activeStartMs, track.activeStartMs + track.activeDurationMs]
}

it('a split cuts a Clip track only at the split time, so the converted connected Clip still prepares (#1101)', () => {
  const source = convertedSplitFixture()
  expect(activation(source, 'track-b')).toEqual([0, 30000])
  expect(activation(source, 'tail-track')).toEqual([30000, 60000])
  const result = editShowClipV2(source, { kind: 'split', clipId: 'clip-b', atMs: 16000, rightClipId: 'clip-b-right' })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  expect(splitPreparation(result.record)).toBe('ready')
  expect(activation(result.record, 'track-b')).toEqual([0, 16000])
  expect(activation(result.record, 'track-b:split:clip-b-right')).toEqual([16000, 30000])
  // Wholly after the split, tail-track only retargets; its activation is unchanged.
  expect(activation(result.record, 'tail-track')).toEqual([30000, 60000])
  const original = source.composition.propertyTracks.find(track => track.id === 'track-b')!
  for (const time of [0, 11000, 12000, 15999, 16000, 19000, 29999]) {
    const piece = result.record.composition.propertyTracks.find(track => track.id === (time < 16000 ? 'track-b' : 'track-b:split:clip-b-right'))!
    expect(evaluateShowPropertyTrackV2(piece, time), `${time}`).toEqual(evaluateShowPropertyTrackV2(original, time))
  }
})

it('a split keeps an activation that starts inside the Clip and cuts it only at the split time (#1101)', () => {
  const source = convertedSplitFixture()
  const track = source.composition.propertyTracks.find(candidate => candidate.id === 'track-b')!
  track.activeStartMs = 13000
  track.activeDurationMs = 17000
  track.keyframes = [
    { id: 'inside-first', timeMs: 13000, value: 0.2, easing: { curve: 'linear' } },
    { id: 'inside-last', timeMs: 20000, value: 1, easing: { curve: 'linear' } },
  ]
  expect(validateShowRecordV2(source)).toEqual([])
  const result = editShowClipV2(source, { kind: 'split', clipId: 'clip-b', atMs: 16000, rightClipId: 'clip-b-right' })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  expect(activation(result.record, 'track-b')).toEqual([13000, 16000])
  expect(activation(result.record, 'track-b:split:clip-b-right')).toEqual([16000, 30000])
})
