import { describe, expect, it } from 'vitest'
import { editShowClipV2, type ShowClipEditIntentV2 } from './showClipsV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { deriveShowRestartEventsV2, evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { parseEpe } from './epeImport'
import { convertibleV2Record, exportShowEpeV2ForTest } from '../test/showEpeV2TestSupport'
import { LIBRARIES } from '../pixelblaze/libs'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'

function fixture(): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(convertibleV1Show())
  if (result.status !== 'converted') throw new Error('Conversion failed')
  const record = result.record
  const clip = record.composition.clips[0]
  record.composition.clips.push({ ...structuredClone(clip), id: 'other', startMs: 500, durationMs: 500,
    appearance: { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: 'other-key', timeMs: 500 }] } })
  clip.durationMs = 500
  record.composition.patternInstances[0].controlTargets = { sliderLevel: 0.2 }
  record.composition.propertyTracks = [{ id: 'control', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLevel' },
    activeStartMs: 0, activeDurationMs: 1000, keyframes: [
      { id: 'start', timeMs: 0, value: 0.2, easing: { curve: 'sine', direction: 'in-out' } },
      { id: 'end', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } },
    ] }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function independent(record: ShowRecordV2): Extract<ShowClipEditIntentV2, { kind: 'make-independent' }> {
  return { kind: 'make-independent', clipId: 'clip', independence: { instanceId: 'independent',
    identitiesBySourceTrackId: Object.fromEntries(materializeShowGroupsV2(record).composition.propertyTracks
      .filter(track => 'instanceId' in track.target && track.target.instanceId === 'instance')
      .map(track => [track.id, { trackId: `copy:${track.id}`, keyframeIdsBySourceId: Object.fromEntries(track.keyframes.map(key => [key.id, `copy:${key.id}`])) }])) } }
}

function groupFixture(): ShowRecordV2 {
  const record = fixture()
  record.composition.clips.splice(1)
  const clip = record.composition.clips[0]
  clip.durationMs = 1000
  const { zoneId: _zone, ...child } = structuredClone(clip)
  record.composition.groupDefinitions = [{ id: 'group', name: 'Linked',
    patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }],
    layers: [{ id: 'local', name: 'Local', rank: 0 }],
    clips: [{ ...child, id: 'child', instanceId: 'slot', layerId: 'local', durationMs: 400,
      appearance: { keys: [{ ...structuredClone(child.appearance.keys[0]), id: 'child:key', value: { ...structuredClone(child.appearance.keys[0].value), opacity: 0 } }] } }],
    transitions: [], propertyTracks: [{ id: 'local-control', target: { kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 400,
      keyframes: [{ id: 'local:start', timeMs: 0, value: 0.2, easing: { curve: 'sine', direction: 'in-out' } },
        { id: 'local:end', timeMs: 400, value: 0.8, easing: { curve: 'linear' } }] },
    { id: 'local-speed', target: { kind: 'instance-time-scale', instanceId: 'slot' }, activeStartMs: 0, activeDurationMs: 400,
      keyframes: [{ id: 'speed:start', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'speed:end', timeMs: 400, value: 1.5, easing: { curve: 'linear' } }] }],
  }]
  record.composition.groupOccurrences = [{ id: 'use', definitionId: 'group', zoneId: clip.zoneId,
    layoutOccurrenceId: record.composition.layoutOccurrences[0].id, startMs: 100, translationX: 0.2, translationY: 0.1,
    layerBindings: [{ definitionLayerId: 'local', layerId: record.composition.layers[1].id }],
    instanceBindings: { slot: 'instance' }, holds: [{ id: 'held', localTimeMs: 200, durationMs: 100 }] }]
  record.composition.propertyTracks = [{ id: 'top-speed', target: { kind: 'instance-time-scale', instanceId: 'instance' }, activeStartMs: 700, activeDurationMs: 100,
    keyframes: [{ id: 'top:start', timeMs: 700, value: 1, easing: { curve: 'linear' } }, { id: 'top:end', timeMs: 800, value: 1.25, easing: { curve: 'linear' } }] }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

const controlCode = 'var level = 0.2; export var elapsed = 0; export function sliderLevel(value) { level = value } export function beforeRender(delta) { elapsed += delta } export function render2D(index, x, y) { rgb(level, 0, 0) }'
function runtime(record: ShowRecordV2, fidelity: 'fast' | 'fidelity', code = controlCode) {
  const prepared = prepareShowV2ForCompile(reopen(record), { byCellId: {},
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(record).composition.patternInstances.map(instance => [instance.id, code])), stageDimension: 2 }, { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const reopened = parseEpe(exportShowEpeV2ForTest(convertibleV2Record(), artifact.code, { id: 'identity-proof', stampedAt: '2026-09-16T00:00:00Z' }).text)
  expect(reopened.stamp?.kind).toBe('show')
  return { artifact, replay: createFastReplayRuntime({ ...artifact, code: reopened.src, dimension: 2 }, {
    fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }],
  }) }
}

function refused(source: ShowRecordV2, intent: ShowClipEditIntentV2, code = 'invalid-intent') {
  const before = structuredClone(source)
  const result = editShowClipV2(source, intent)
  expect(result).toMatchObject({ status: 'refused', code, affectedClipIds: [], affectedTrackIds: [] })
  expect(result.record).toBe(source)
  expect(source).toEqual(before)
  return result
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const result = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (result.status !== 'opened') throw new Error('Reopen failed')
  expect(result.record).toEqual(record)
  return result.record
}

describe('ordinary Clip runtime identity', () => {
  it('copies the complete payload and effective animation while preserving every other user', () => {
    const source = fixture()
    source.composition.patternInstances[0].evaluationPolicy = 'rolling-refresh'
    source.composition.patternInstances[0].time = { timeScale: 0.75, timeOffsetMs: 150 }
    const before = structuredClone(source)
    const result = editShowClipV2(source, independent(source))
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.clips.map(clip => [clip.id, clip.instanceId])).toEqual([['clip', 'independent'], ['other', 'instance']])
    expect(next.composition.patternInstances[1]).toEqual({ ...source.composition.patternInstances[0], id: 'independent' })
    expect(next.composition.propertyTracks[1]).toEqual({ ...source.composition.propertyTracks[0], id: 'copy:control', target: { kind: 'instance-control', instanceId: 'independent', exportName: 'sliderLevel' },
      keyframes: source.composition.propertyTracks[0].keyframes.map(key => ({ ...key, id: `copy:${key.id}` })) })
    expect(next.composition.executionModel).toBe('continuous')
    expect(result).toMatchObject({ affectedClipIds: ['clip'], affectedTrackIds: ['copy:control'], affectedInstanceIds: ['independent'], affectedKeyframeIds: ['copy:start', 'copy:end'], removedIds: [] })
    expect(source).toEqual(before)
    next.composition.patternInstances[1].controlTargets!.sliderLevel = 0
    next.composition.propertyTracks[0].keyframes[0].value = 0
    next.composition.clips[0].appearance.keys[0].value.opacity = 0
    expect(source).toEqual(before)
  })

  it('rejoins explicitly using target state, discarding only the now-unreferenced source state', () => {
    const source = fixture()
    const made = editShowClipV2(source, independent(source))
    if (made.status !== 'changed') throw new Error('Independence failed')
    const result = editShowClipV2(reopen(made.record), { kind: 'rejoin', clipId: 'clip', targetInstanceId: 'instance' })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.clips).toEqual(source.composition.clips)
    expect(next.composition.patternInstances).toEqual(source.composition.patternInstances)
    expect(next.composition.propertyTracks).toEqual(source.composition.propertyTracks)
    expect(result).toMatchObject({ affectedInstanceIds: ['instance', 'independent'], affectedTrackIds: ['copy:control'], removedIds: ['independent', 'copy:control', 'copy:start', 'copy:end'] })
  })

  it('preserves exact nonlinear held and translated Group projection without rewriting its owners', () => {
    const source = groupFixture()
    const result = editShowClipV2(source, independent(source))
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const original = materializeShowGroupsV2(source).composition.propertyTracks
    const next = reopen(result.record)
    for (const track of original) {
      const copy = next.composition.propertyTracks.find(value => value.id === `copy:${track.id}`)!
      expect(copy.activeStartMs).toBe(track.activeStartMs)
      expect(copy.activeDurationMs).toBe(track.activeDurationMs)
      expect(copy.keyframes.map(key => key.curveSegment)).toEqual(track.keyframes.map(key => key.curveSegment))
      for (const atMs of [99, 100, 299, 300, 350, 399, 400, 599, 600, 700, 800]) {
        expect(evaluateShowPropertyTrackV2(copy, atMs)).toEqual(evaluateShowPropertyTrackV2(track, atMs))
      }
    }
    expect(evaluateShowPropertyTrackV2(next.composition.propertyTracks.find(track => track.id === 'copy:use:local-control')!, 350)).toBeCloseTo(0.5)
    expect(next.composition.groupDefinitions).toEqual(source.composition.groupDefinitions)
    expect(next.composition.groupOccurrences).toEqual(source.composition.groupOccurrences)
  })

  it.each(['fast', 'fidelity'] as const)('reopens admitted held Group Independence with preserved animation and state in %s', fidelity => {
    const source = groupFixture()
    // Independence invalidates cast lifecycle; isolate animation preservation
    // with the explicit continuous lifecycle shared by both consumer records.
    source.composition.executionModel = 'continuous'
    const before = structuredClone(source)
    const result = editShowClipV2(source, independent(source))
    if (result.status !== 'changed') throw new Error('Independence failed')
    const next = reopen(result.record)
    expect(next.composition.groupDefinitions).toEqual(source.composition.groupDefinitions)
    expect(next.composition.groupOccurrences).toEqual(source.composition.groupOccurrences)
    const original = runtime(source, fidelity)
    const copied = runtime(next, fidelity)
    const originalPrefix = original.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    const independentPrefix = copied.artifact.summary.clips.find(member => member.id === 'independent')!.prefix
    const track = next.composition.propertyTracks.find(track => track.id === 'copy:use:local-control')!
    for (const atMs of [299, 300, 399, 400]) expect(evaluateShowPropertyTrackV2(track, atMs)).toBeCloseTo(atMs === 299 ? 0.2 + 0.6 * (1 - Math.cos(Math.PI * 199 / 400)) / 2 : 0.5, 12)
    expect(evaluateShowPropertyTrackV2(track, 600)).toBeUndefined()
    for (const atMs of [0, 99, 100, 299, 300, 350, 399, 400, 401, 599, 600, 700, 799, 800, 999]) {
      const a = original.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = copied.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(Array.from(b.frame), `held frame ${atMs}`).toEqual(Array.from(a.frame))
      expect(b.exports[`${independentPrefix}_elapsed`], `held copied clock ${atMs}`).toEqual(a.exports[`${originalPrefix}_elapsed`])
    }
    expect(source).toEqual(before)
    expect(result.affectedTrackIds).toEqual(['copy:top-speed', 'copy:use:local-control', 'copy:use:local-speed'])
  })

  it.each(['fast', 'fidelity'] as const)('preserves Group-owned control and clock animation on the independent ordinary Clip in %s reopened .epe', fidelity => {
    const source = groupFixture()
    source.composition.groupOccurrences[0].holds = []
    // Isolate copied clock animation from the separately tested cast invalidation.
    source.composition.executionModel = 'continuous'
    const before = structuredClone(source)
    const result = editShowClipV2(source, independent(source))
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.groupDefinitions).toEqual(source.composition.groupDefinitions)
    expect(next.composition.groupOccurrences).toEqual(source.composition.groupOccurrences)
    expect(next.composition.propertyTracks.slice(0, 1)).toEqual(source.composition.propertyTracks)
    expect(result.affectedTrackIds).toEqual(['copy:top-speed', 'copy:use:local-control', 'copy:use:local-speed'])
    expect(next.composition.propertyTracks.slice(1).map(track => track.id)).toEqual(result.affectedTrackIds)
    const original = runtime(source, fidelity)
    const copied = runtime(next, fidelity)
    const originalPrefix = original.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    const independentPrefix = copied.artifact.summary.clips.find(member => member.id === 'independent')!.prefix
    const track = next.composition.propertyTracks.find(track => track.id === 'copy:use:local-control')!
    expect(evaluateShowPropertyTrackV2(track, 300)).toBeCloseTo(0.5)
    expect(evaluateShowPropertyTrackV2(track, 99)).toBeUndefined()
    expect(evaluateShowPropertyTrackV2(track, 500)).toBeUndefined()
    for (const atMs of [0, 99, 100, 299, 300, 350, 399, 400, 599, 600, 700, 799, 800, 999]) {
      const a = original.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = copied.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(Array.from(b.frame), `frame ${atMs}`).toEqual(Array.from(a.frame))
      expect(b.exports[`${independentPrefix}_elapsed`], `copied clock ${atMs}`).toEqual(a.exports[`${originalPrefix}_elapsed`])
      if (atMs >= 100 && atMs < 500) expect(Math.abs(b.frame[0] - evaluateShowPropertyTrackV2(track, atMs)!)).toBeLessThan(fidelity === 'fast' ? 1e-8 : 0.02)
    }
    expect(source).toEqual(before)
  })

  it('preserves a source used by a Group when rejoining another explicit compatible target', () => {
    const source = groupFixture()
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'target', controlTargets: { sliderLevel: 0.9 } })
    const result = editShowClipV2(source, { kind: 'rejoin', clipId: 'clip', targetInstanceId: 'target' })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(reopen(result.record).composition.patternInstances).toEqual(source.composition.patternInstances)
    expect(result.record.composition.propertyTracks).toEqual(source.composition.propertyTracks)
    expect(result.record.composition.groupOccurrences).toEqual(source.composition.groupOccurrences)
    expect(result.removedIds).toEqual([])
    expect(result.affectedTrackIds).toEqual([])
  })

  it('leaves Clip-owned appearance animation and unrelated authored owners fixed through Independence and Rejoin', () => {
    const source = fixture()
    const clipTrack = { id: 'clip-opacity', target: { kind: 'clip-opacity' as const, clipId: 'clip' }, activeStartMs: 0, activeDurationMs: 500,
      keyframes: [{ id: 'clip:start', timeMs: 0, value: 1, easing: { curve: 'linear' as const } }, { id: 'clip:end', timeMs: 500, value: 0.5, easing: { curve: 'linear' as const } }] }
    source.composition.propertyTracks.push(clipTrack)
    const before = structuredClone(source)
    const made = editShowClipV2(source, independent(source))
    if (made.status !== 'changed') throw new Error('Independence failed')
    expect(reopen(made.record).composition.propertyTracks.find(track => track.id === 'clip-opacity')).toEqual(clipTrack)
    const joined = editShowClipV2(reopen(made.record), { kind: 'rejoin', clipId: 'clip', targetInstanceId: 'instance' })
    if (joined.status !== 'changed') throw new Error('Rejoin failed')
    expect(reopen(joined.record).composition.propertyTracks).toEqual(before.composition.propertyTracks)
    expect(joined.record.composition.clips).toEqual(before.composition.clips)
    expect(joined.record.zoneLayouts).toEqual(before.zoneLayouts)
    expect(joined.record.updatedAt).toBe(before.updatedAt)
    expect(source).toEqual(before)
  })

  it.each(['explicit', 'stable-default'] as const)('preserves otherwise unused runtime payload and tracks referenced by an unused Group slot (%s)', binding => {
    const source = groupFixture()
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'target' })
    const definition = source.composition.groupDefinitions[0]
    definition.patternInstances.push({ ...structuredClone(definition.patternInstances[0]), id: 'unused' })
    definition.clips[0].instanceId = 'unused'
    definition.propertyTracks = []
    source.composition.groupOccurrences[0].instanceBindings = { slot: 'instance', unused: 'target' }
    if (binding === 'stable-default') {
      const runtimeId = 'group:["group","slot"]'
      source.composition.patternInstances[0].id = runtimeId
      source.composition.clips[0].instanceId = runtimeId
      source.composition.propertyTracks[0].target = { kind: 'instance-time-scale', instanceId: runtimeId }
      source.composition.groupOccurrences[0].instanceBindings = { unused: 'target' }
    }
    expect(validateShowRecordV2(source)).toEqual([])
    const result = editShowClipV2(source, { kind: 'rejoin', clipId: 'clip', targetInstanceId: 'target' })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(reopen(result.record).composition.patternInstances).toEqual(source.composition.patternInstances)
    expect(result.record.composition.propertyTracks).toEqual(source.composition.propertyTracks)
    expect(result.removedIds).toEqual([])
  })

  it.each(['fast', 'fidelity'] as const)('uses only target controls/tracks after Rejoin in %s', fidelity => {
    const source = fixture()
    source.composition.clips.splice(1)
    source.composition.clips[0].durationMs = 1000
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'target', controlTargets: { sliderLevel: 0.9 } })
    source.composition.propertyTracks.push({ ...structuredClone(source.composition.propertyTracks[0]), id: 'target-control', target: { kind: 'instance-control', instanceId: 'target', exportName: 'sliderLevel' }, keyframes: [
      { id: 'target:start', timeMs: 0, value: 0.7, easing: { curve: 'linear' } }, { id: 'target:end', timeMs: 1000, value: 0.9, easing: { curve: 'linear' } },
    ] })
    const result = editShowClipV2(source, { kind: 'rejoin', clipId: 'clip', targetInstanceId: 'target' })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(reopen(result.record).composition.propertyTracks).toEqual([source.composition.propertyTracks[1]])
    const frame = runtime(result.record, fidelity).replay.advanceTo(500, { stepMs: 1, forceFullIntermediateRender: true }).frame[0]
    expect(Math.abs(frame - 0.8)).toBeLessThan(fidelity === 'fast' ? 1e-8 : 0.02)
  })

  it.each(['fast', 'fidelity'] as const)('separates shared Restart state then restores target sharing through Rejoin in %s', fidelity => {
    const source = fixture()
    source.composition.propertyTracks = []
    source.composition.patternInstances[0].controlTargets = undefined
    source.composition.clips[0].durationMs = 1000
    source.composition.clips[0].entryPolicy = 'restart'
    source.composition.clips[1].entryPolicy = 'restart'
    source.composition.clips[1].layerId = source.composition.layers[1].id
    source.composition.clips[1].appearance.keys[0].value.opacity = 0
    const made = editShowClipV2(source, independent(source))
    expect(made.status).toBe('changed')
    if (made.status !== 'changed') return
    expect(deriveShowRestartEventsV2(reopen(made.record))).toMatchObject({ status: 'derived', events: [
      { instanceId: 'independent', atMs: 0, clipIds: ['clip'] }, { instanceId: 'instance', atMs: 500, clipIds: ['other'] },
    ] })
    const rejoined = editShowClipV2(reopen(made.record), { kind: 'rejoin', clipId: 'clip', targetInstanceId: 'instance' })
    if (rejoined.status !== 'changed') throw new Error('Rejoin failed')
    const code = 'export var elapsed = 0; export function beforeRender(delta) { elapsed += delta } export function render2D(index, x, y) { rgb(elapsed / 1000, 0, 0) }'
    const original = runtime(source, fidelity, code)
    const separated = runtime(made.record, fidelity, code)
    const joined = runtime(rejoined.record, fidelity, code)
    expect(original.artifact.summary.clips).toHaveLength(1)
    expect(separated.artifact.summary.clips).toHaveLength(2)
    expect(joined.artifact.summary.clips).toHaveLength(1)
    const advance = { stepMs: 1, forceFullIntermediateRender: true }
    const a = original.replay.advanceTo(600, advance)
    const b = separated.replay.advanceTo(600, advance)
    const c = joined.replay.advanceTo(600, advance)
    expect(Math.abs(a.frame[0] - 0.1)).toBeLessThan(0.02)
    expect(Math.abs(b.frame[0] - 0.6)).toBeLessThan(0.02)
    expect(Array.from(c.frame)).toEqual(Array.from(a.frame))
    expect(c.exports).toEqual(a.exports)
  })

  it('preserves attached Transition endpoints and settings across independence and Rejoin', () => {
    const source = fixture()
    source.composition.clips[0].durationMs = 100
    source.composition.clips[1].startMs = 400
    source.composition.clips[1].durationMs = 100
    source.composition.clips[1].appearance.keys[0].timeMs = 400
    source.composition.transitions = [{ id: 'attached', kind: 'crossfade', durationMs: 300, easing: { curve: 'linear' }, crossfadePolicy: 'live-live', propertyRamps: [],
      participants: [{ id: 'participant', zoneId: source.composition.clips[0].zoneId, layerId: source.composition.clips[0].layerId, fromClipId: 'clip', toClipId: 'other' }] }]
    const before = structuredClone(source)
    const made = editShowClipV2(source, independent(source))
    expect(made.status).toBe('changed')
    if (made.status !== 'changed') return
    expect(reopen(made.record).composition.transitions).toEqual(before.composition.transitions)
    runtime(made.record, 'fast')
    const rejoined = editShowClipV2(reopen(made.record), { kind: 'rejoin', clipId: 'clip', targetInstanceId: 'instance' })
    expect(rejoined.status).toBe('changed')
    if (rejoined.status !== 'changed') return
    expect(reopen(rejoined.record).composition.transitions).toEqual(before.composition.transitions)
    runtime(rejoined.record, 'fast')
    expect(source).toEqual(before)
  })

  it('retains source state referenced by a Transition Property ramp after its last Clip rejoins', () => {
    const source = fixture()
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'target' })
    source.composition.clips[0].durationMs = 100
    source.composition.clips[1].instanceId = 'target'
    source.composition.clips[1].startMs = 400
    source.composition.clips[1].durationMs = 100
    source.composition.clips[1].appearance.keys[0].timeMs = 400
    source.composition.transitions = [{ id: 'attached', kind: 'crossfade', durationMs: 300, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
      propertyRamps: [{ target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLevel' }, from: 0.9 }],
      participants: [{ id: 'participant', zoneId: source.composition.clips[0].zoneId, layerId: source.composition.clips[0].layerId, fromClipId: 'clip', toClipId: 'other' }] }]
    expect(validateShowRecordV2(source)).toEqual([])
    const result = editShowClipV2(source, { kind: 'rejoin', clipId: 'clip', targetInstanceId: 'target' })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(reopen(result.record).composition.patternInstances).toEqual(source.composition.patternInstances)
    expect(result.record.composition.propertyTracks).toEqual(source.composition.propertyTracks)
    expect(result.record.composition.transitions).toEqual(source.composition.transitions)
    expect(result.removedIds).toEqual([])
  })
})

describe('identity admission and exact caller plans', () => {
  it.each([
    ['missing plan', (plan: ReturnType<typeof independent>) => { plan.independence = undefined as never }],
    ['blank runtime', (plan: ReturnType<typeof independent>) => { plan.independence.instanceId = ' ' }],
    ['owned runtime', (plan: ReturnType<typeof independent>) => { plan.independence.instanceId = 'instance' }],
    ['missing track', (plan: ReturnType<typeof independent>) => { plan.independence.identitiesBySourceTrackId = {} }],
    ['extraneous track', (plan: ReturnType<typeof independent>) => { plan.independence.identitiesBySourceTrackId = { ...plan.independence.identitiesBySourceTrackId, extra: { trackId: 'extra', keyframeIdsBySourceId: {} } } }],
    ['blank track', (plan: ReturnType<typeof independent>) => { plan.independence.identitiesBySourceTrackId.control.trackId = ' ' }],
    ['owned track', (plan: ReturnType<typeof independent>) => { plan.independence.identitiesBySourceTrackId.control.trackId = 'control' }],
    ['missing key', (plan: ReturnType<typeof independent>) => { plan.independence.identitiesBySourceTrackId.control.keyframeIdsBySourceId = { start: 'fresh' } }],
    ['extraneous key', (plan: ReturnType<typeof independent>) => { plan.independence.identitiesBySourceTrackId.control.keyframeIdsBySourceId = { start: 'fresh', end: 'end-fresh', extra: 'extra' } }],
    ['blank key', (plan: ReturnType<typeof independent>) => { plan.independence.identitiesBySourceTrackId.control.keyframeIdsBySourceId = { start: ' ', end: 'end-fresh' } }],
    ['owned key', (plan: ReturnType<typeof independent>) => { plan.independence.identitiesBySourceTrackId.control.keyframeIdsBySourceId = { start: 'start', end: 'end-fresh' } }],
    ['duplicate key', (plan: ReturnType<typeof independent>) => { plan.independence.identitiesBySourceTrackId.control.keyframeIdsBySourceId = { start: 'fresh', end: 'fresh' } }],
    ['malformed track', (plan: ReturnType<typeof independent>) => { plan.independence.identitiesBySourceTrackId = { control: null as never } }],
    ['malformed key value', (plan: ReturnType<typeof independent>) => { plan.independence.identitiesBySourceTrackId.control.keyframeIdsBySourceId = { start: 5 as never, end: 'fresh' } }],
  ] as const)('refuses %s atomically', (_name, mutate) => {
    const source = fixture()
    const plan = independent(source)
    mutate(plan)
    expect(refused(source, plan)).toMatchObject({ affectedInstanceIds: [], affectedKeyframeIds: [], removedIds: [] })
  })

  it.each(['', ' ', 'missing', 'group:["group","slot"]'])('refuses absent/non-top-level target %s', targetInstanceId => {
    const source = fixture()
    refused(source, { kind: 'rejoin', clipId: 'clip', targetInstanceId })
  })

  it.each([{ kind: 'user', id: 'TestPattern1D' }, { kind: 'stock', id: 'Other' }] as const)('requires structured source identity %j rather than equal display name', pattern => {
    const source = fixture()
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'target', pattern })
    refused(source, { kind: 'rejoin', clipId: 'clip', targetInstanceId: 'target' })
  })

  it('returns original identity for sole-user Independence and current-target Rejoin', () => {
    const source = fixture()
    source.composition.clips.splice(1)
    for (const intent of [independent(source), { kind: 'rejoin', clipId: 'clip', targetInstanceId: 'instance' } as const]) {
      const result = editShowClipV2(source, intent)
      expect(result).toMatchObject({ status: 'unchanged', affectedClipIds: [], affectedTrackIds: [], affectedInstanceIds: [], affectedKeyframeIds: [], removedIds: [] })
      expect(result.record).toBe(source)
    }
  })

  it('supports shared independence with no source animation and requires the exact empty map', () => {
    const source = fixture()
    source.composition.propertyTracks = []
    const result = editShowClipV2(source, independent(source))
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(reopen(result.record).composition.patternInstances).toHaveLength(2)
    expect(result.affectedTrackIds).toEqual([])
  })

  it('refuses malformed preimages and missing or materialized-only Clip targets', () => {
    const source = groupFixture()
    refused(source, { ...independent(source), clipId: 'use:child' }, 'missing-clip')
    source.composition.clips[0].durationMs = -1
    refused(source, independent(source), 'invalid-record')
  })

  it('refuses Group-effective runtime/track/key freshness collisions and cross-copy key collisions', () => {
    const source = groupFixture()
    for (const collision of ['instance', 'track', 'key', 'cross-key', 'cross-track'] as const) {
      const plan = independent(source)
      const map = plan.independence.identitiesBySourceTrackId
      if (collision === 'instance') {
        const unbound = structuredClone(source)
        unbound.composition.groupOccurrences[0].instanceBindings = undefined
        const other = structuredClone(unbound.composition.clips[0])
        other.id = 'other'
        other.layerId = unbound.composition.layers[1].id
        other.startMs = 900
        other.durationMs = 100
        other.appearance.keys[0].timeMs = 900
        unbound.composition.clips.push(other)
        plan.independence.instanceId = 'group:["group","slot"]'
        refused(unbound, plan)
        continue
      }
      if (collision === 'track') map['use:local-control'].trackId = 'use:local-speed'
      if (collision === 'cross-track') map['use:local-control'].trackId = map['use:local-speed'].trackId
      if (collision === 'key') map['use:local-control'].keyframeIdsBySourceId = {
        ...map['use:local-control'].keyframeIdsBySourceId,
        [Object.keys(map['use:local-control'].keyframeIdsBySourceId)[0]]: 'use:speed:start',
      }
      if (collision === 'cross-key') map['use:local-control'].keyframeIdsBySourceId = {
        ...map['use:local-control'].keyframeIdsBySourceId,
        [Object.keys(map['use:local-control'].keyframeIdsBySourceId)[0]]: 'copy:top:start',
      }
      refused(source, plan)
    }
  })

  it('refuses overlapping effective Group and top-level owners before creating a runtime', () => {
    const source = groupFixture()
    source.composition.propertyTracks.push({ id: 'conflict', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLevel' }, activeStartMs: 200, activeDurationMs: 100,
      keyframes: [{ id: 'conflict:key', timeMs: 200, value: 0.9, easing: { curve: 'linear' } }, { id: 'conflict:end', timeMs: 300, value: 0.9, easing: { curve: 'linear' } }] })
    expect(validateShowRecordV2(source)).toContainEqual(expect.objectContaining({ code: 'invalid-property-target', message: expect.stringContaining('overlap') }))
    refused(source, independent(source), 'invalid-record')
  })
})
