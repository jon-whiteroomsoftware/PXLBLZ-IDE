import { LIBRARIES } from '../pixelblaze/libs'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { createFastReplayRuntime } from './fastReplay'
import { parseEpe } from './epeImport'
import { convertibleV2Record, exportShowEpeV2ForTest } from '../test/showEpeV2TestSupport'
import { effectiveShowInstanceUseCountV2, materializeShowGroupsV2 } from './showGroupsV2'
import { deriveShowRestartEventsV2, evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import { describe, expect, it } from 'vitest'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2, type ShowClipAppearanceValueV2 } from './showCompositionV2'
import { insertShowTimeV2 } from './showTimelineV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'

function record(): ShowRecordV2 {
  return {
    version: 2, id: 'timeline', name: 'Insert Time', zones: [{ id: 'zone', name: 'Zone', nominalPixelCount: 8 }],
    zoneLayouts: [{ id: 'layout', name: 'Layout', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } }],
    outputContract: { version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 8, compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' } },
    composition: {
      version: 2, executionModel: 'continuous', showEndMs: 1000, sampleRemap: { repeatScale: 1 },
      patternInstances: [{ id: 'instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } }],
      layers: [{ id: 'main', zoneId: 'zone', name: 'Main', rank: 0 }],
      clips: [{ id: 'clip', instanceId: 'instance', zoneId: 'zone', layerId: 'main', startMs: 100, durationMs: 800, entryPolicy: 'continue', zoneSampleMode: 'span', appearance: { keys: [
        { id: 'first', timeMs: 100, value: { opacity: 1, effects: [], view: { mirror: false, phase: 0, brightness: 0.2 } } },
        { id: 'jump', timeMs: 500, value: { opacity: 0.5, effects: [], view: { mirror: false, phase: 0, brightness: 0.8 } } },
      ] } }],
      transitions: [], layoutOccurrences: [{ id: 'first-layout', layoutId: 'layout', startMs: 0, durationMs: 1000, parameters: {} }],
      propertyTracks: [], markers: [{ id: 'before', timeMs: 100 }, { id: 'at', timeMs: 500 }, { id: 'dormant', timeMs: 1500 }], groupDefinitions: [], groupOccurrences: [],
    }, updatedAt: 1,
  }
}
function reopen(value: ShowRecordV2): ShowRecordV2 {
  expect(validateShowRecordV2(value)).toEqual([])
  expect(validateShowLayoutAvailabilityV2(value)).toEqual([])
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(value))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  expect(opened.record).toEqual(value)
  return opened.record
}

describe('global Insert Time v2', () => {
  it('holds an exact appearance key on a crossing Clip and shifts dormant guides with exact affected owners', () => {
    const source = record()
    const before = structuredClone(source)
    const result = insertShowTimeV2(source, { atMs: 500, durationMs: 200 })
    expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
    if (result.status !== 'changed') return
    const actual = reopen(result.record)
    expect(actual.composition.showEndMs).toBe(1200)
    expect(actual.composition.clips[0]).toMatchObject({ startMs: 100, durationMs: 1000 })
    expect(actual.composition.clips[0].appearance.keys.map(key => [key.id, key.timeMs, key.value.view.brightness])).toEqual([
      ['first', 100, 0.2], ['clip:appearance:hold:500', 500, 0.8], ['jump', 700, 0.8],
    ])
    expect(actual.composition.markers.map(marker => [marker.id, marker.timeMs])).toEqual([['before', 100], ['at', 700], ['dormant', 1700]])
    expect(actual.composition.layoutOccurrences[0]).toMatchObject({ startMs: 0, durationMs: 1200 })
    expect(result).toMatchObject({ affectedClipIds: ['clip'], affectedAppearanceKeyIds: ['clip:appearance:hold:500', 'jump'], affectedMarkerIds: ['at', 'dormant'], affectedLayoutOccurrenceIds: ['first-layout'], affectedInstanceIds: [], affectedGroupOccurrenceIds: [], affectedTrackIds: [], removedIds: [] })
    expect(result.record).not.toBe(source)
    expect(result.record.composition.patternInstances).not.toBe(source.composition.patternInstances)
    expect(source).toEqual(before)
    expect(actual.updatedAt).toBe(1)
  })
})

function groupRecord(): ShowRecordV2 {
  const source = record()
  const ordinary = source.composition.clips[0]
  source.composition.clips = []
  source.composition.markers = []
  source.composition.groupDefinitions = [{
    id: 'phrase', name: 'Phrase', patternInstances: structuredClone(source.composition.patternInstances), layers: [{ id: 'local', name: 'Local', rank: 0 }],
    clips: [{ id: 'child', instanceId: 'instance', layerId: 'local', startMs: 0, durationMs: 300, entryPolicy: 'restart', zoneSampleMode: 'span', appearance: { keys: ordinary.appearance.keys.map((key, i) => ({ ...structuredClone(key), timeMs: i * 150 })) } }], transitions: [],
    propertyTracks: [{ id: 'opacity', target: { kind: 'clip-opacity', clipId: 'child' }, activeStartMs: 0, activeDurationMs: 300, keyframes: [{ id: 'left', timeMs: 0, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'right', timeMs: 300, value: 0.8, easing: { curve: 'linear' } }] }],
  }]
  source.composition.groupOccurrences = [100, 600].map((startMs, index) => ({ id: `occ-${index}`, definitionId: 'phrase', layoutOccurrenceId: 'first-layout', zoneId: 'zone', startMs, translationX: 0.2, translationY: 0, layerBindings: [{ definitionLayerId: 'local', layerId: 'main' }], holds: [] }))
  return source
}

it('adds a local hold to the crossing occurrence and moves the linked occurrence without changing definitions or runtimes', () => {
  const source = groupRecord()
  const before = structuredClone(source)
  const result = insertShowTimeV2(source, { atMs: 250, durationMs: 100 })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  const actual = reopen(result.record)
  expect(actual.composition.groupOccurrences).toEqual([
    { ...source.composition.groupOccurrences[0], holds: [{ id: 'occ-0:hold:150', localTimeMs: 150, durationMs: 100 }] },
    { ...source.composition.groupOccurrences[1], startMs: 700 },
  ])
  expect(actual.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(actual.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(result.affectedGroupOccurrenceIds).toEqual(['occ-0', 'occ-1'])
  expect(result.affectedTrackIds).toEqual([])
  expect(source).toEqual(before)
})

it('maps an explicit outgoing activation even when its nominal occurrence ends before insertion', () => {
  const source = groupRecord()
  source.composition.groupOccurrences[0].trackActivation = { startMs: 50, durationMs: 400 }
  const result = insertShowTimeV2(source, { atMs: 420, durationMs: 100 })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  const actual = reopen(result.record)
  expect(actual.composition.groupOccurrences[0]).toMatchObject({ startMs: 100, holds: [], trackActivation: { startMs: 50, durationMs: 500 } })
  expect(actual.composition.groupOccurrences[1].startMs).toBe(700)
  expect(result.affectedGroupOccurrenceIds).toEqual(['occ-0', 'occ-1'])
})

function transitionRecord(wholeOutput: boolean): ShowRecordV2 {
  const source = record()
  const clip = source.composition.clips[0]
  clip.durationMs = 200
  clip.appearance.keys = [clip.appearance.keys[0]]
  source.composition.clips.push({ ...structuredClone(clip), id: 'incoming', startMs: 400, durationMs: 300, appearance: { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: 'incoming-key', timeMs: 400 }] } })
  source.composition.transitions = [{ id: 'fade', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' }, ...(wholeOutput ? { wholeOutput: { startMs: 300, fromClipIds: ['clip'], toClipIds: ['incoming'] } } : {}), participants: wholeOutput ? [] : [{ id: 'pair', zoneId: 'zone', layerId: 'main', fromClipId: 'clip', toClipId: 'incoming' }], propertyRamps: [] }]
  return source
}

it.each([false, true])('maps complete %s whole-output visual windows and validates endpoints without changing duration', wholeOutput => {
  for (const [atMs, status, code] of [[299, 'changed', undefined], [300, 'refused', 'transition-attachment'], [350, 'refused', 'visual-transition-window'], [400, 'refused', 'transition-attachment'], [401, 'changed', undefined]] as const) {
    const source = transitionRecord(wholeOutput)
    const before = structuredClone(source)
    const result = insertShowTimeV2(source, { atMs, durationMs: 100 })
    expect(result.status, `window ${atMs}: ${result.status === 'refused' ? result.message : ''}`).toBe(status)
    if (result.status === 'refused') {
      expect(result.code).toBe(code)
      expect(result.record).toBe(source)
      expect(result.affectedClipIds).toEqual([])
    } else {
      const actual = reopen(result.record)
      expect(actual.composition.transitions[0]).toMatchObject({ id: 'fade', kind: 'crossfade', durationMs: 100 })
      expect(result.affectedTransitionIds).toEqual(atMs === 299 ? ['fade'] : [])
      if (wholeOutput) expect(actual.composition.transitions[0].wholeOutput?.startMs).toBe(atMs === 299 ? 400 : 300)
    }
    expect(source).toEqual(before)
  }
})

it('preserves timed transfer endpoints and refuses only strict interior before final routing validation', () => {
  for (const [atMs, status] of [[399, 'changed'], [400, 'changed'], [450, 'refused'], [500, 'changed'], [501, 'changed']] as const) {
    const source = record()
    source.composition.layoutOccurrences[0].durationMs = 400
    source.composition.layoutOccurrences.push({ id: 'second-layout', layoutId: 'layout', startMs: 400, durationMs: 600, parameters: {}, incomingTransfer: { id: 'transfer', fromOccurrenceId: 'first-layout', durationMs: 100, direction: 'forward' } })
    const result = insertShowTimeV2(source, { atMs, durationMs: 100 })
    expect(result.status, result.status === 'refused' ? result.message : undefined).toBe(status)
    if (result.status === 'refused') {
      expect(result.code).toBe('layout-transfer-window')
      expect(result.record).toBe(source)
    } else {
      const actual = reopen(result.record)
      const second = actual.composition.layoutOccurrences[1]
      expect(second.startMs).toBe(atMs <= 400 ? 500 : 400)
      expect(second.incomingTransfer).toEqual(source.composition.layoutOccurrences[1].incomingTransfer)
      expect(actual.composition.layoutOccurrences[0].durationMs).toBe(atMs <= 400 ? 500 : 400)
    }
  }
})

it.each([0, 100, 900, 1000])('maps exact ordinary/Show boundaries at %i while first Layout stays at zero', atMs => {
  const source = record()
  const result = insertShowTimeV2(source, { atMs, durationMs: 100 })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const actual = reopen(result.record)
  expect(actual.composition.clips[0].startMs).toBe(atMs <= 100 ? 200 : 100)
  expect(actual.composition.clips[0].durationMs).toBe(800)
  expect(actual.composition.clips[0].appearance.keys.map(key => key.timeMs)).toEqual(atMs <= 100 ? [200, 600] : [100, 500])
  expect(actual.composition.layoutOccurrences[0]).toMatchObject({ startMs: 0, durationMs: 1100 })
  expect(result.affectedClipIds).toEqual(atMs <= 100 ? ['clip'] : [])
})

it.each([250, 750])('seeds held appearance between keys/after the last key with collision-safe identity at %i', atMs => {
  const source = record()
  source.composition.clips[0].appearance.keys[0].id = `clip:appearance:hold:${atMs}`
  const result = insertShowTimeV2(source, { atMs, durationMs: 100 })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const keys = reopen(result.record).composition.clips[0].appearance.keys
  expect(keys.find(key => key.id === `clip:appearance:hold:${atMs}:2`)).toMatchObject({ timeMs: atMs, value: { view: { brightness: atMs === 250 ? 0.2 : 0.8 } } })
})

it.each([250, 300, 350])('merges repeat insertion at held global time %i into the same local hold identity', atMs => {
  const source = groupRecord()
  const first = insertShowTimeV2(source, { atMs: 250, durationMs: 100 })
  if (first.status !== 'changed') throw new Error(first.message)
  const second = insertShowTimeV2(reopen(first.record), { atMs, durationMs: 25 })
  expect(second.status, second.status === 'refused' ? second.message : undefined).toBe('changed')
  if (second.status !== 'changed') return
  const actual = reopen(second.record)
  expect(actual.composition.groupOccurrences[0].holds).toEqual([{ id: 'occ-0:hold:150', localTimeMs: 150, durationMs: 125 }])
  expect(actual.composition.groupOccurrences[1].startMs).toBe(725)
  expect(deriveShowRestartEventsV2(actual)).toMatchObject({ status: 'derived', events: [{ atMs: 100 }, { atMs: 725 }] })
  expect(effectiveShowInstanceUseCountV2(actual, 'group:["phrase","instance"]')).toBe(2)
})

it.each([50, 100, 450])('maps explicit pre-roll/start/exclusive activation end at %i independently from placement', atMs => {
  const source = groupRecord()
  source.composition.groupOccurrences[0].trackActivation = { startMs: 50, durationMs: 400 }
  const result = insertShowTimeV2(source, { atMs, durationMs: 100 })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  const actual = reopen(result.record).composition.groupOccurrences[0]
  expect(actual.trackActivation).toEqual(atMs === 50 ? { startMs: 150, durationMs: 400 } : atMs === 100 ? { startMs: 50, durationMs: 500 } : { startMs: 50, durationMs: 400 })
  expect(actual.startMs).toBe(atMs <= 100 ? 200 : 100)
})

it('transforms all top-level ownership classes once, preserving nonlinear and exact discontinuous keys', () => {
  const source = record()
  const quadratic = { curve: 'quadratic', direction: 'in' } as const
  source.composition.layers.push({ id: 'overlay', zoneId: 'zone', name: 'Overlay', rank: 1 })
  source.composition.clips.push({ ...structuredClone(source.composition.clips[0]), id: 'shared', layerId: 'overlay', appearance: { keys: structuredClone(source.composition.clips[0].appearance.keys) } })
  source.composition.propertyTracks = [
    { id: 'brightness', target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' }, activeStartMs: 100, activeDurationMs: 800, keyframes: [{ id: 'same', timeMs: 100, value: 0.2, easing: quadratic }, { id: 'end', timeMs: 900, value: 0.8, easing: { curve: 'linear' } }] },
    { id: 'speed', target: { kind: 'instance-time-scale', instanceId: 'instance' }, activeStartMs: 100, activeDurationMs: 800, keyframes: [{ id: 'same', timeMs: 100, value: 0, easing: { curve: 'hold', at: 1 } }, { id: 'last', timeMs: 500, value: 1, easing: { curve: 'linear' } }] },
    { id: 'split', target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'first-layout' }, activeStartMs: 100, activeDurationMs: 800, keyframes: [{ id: 'same', timeMs: 100, value: 0.2, easing: quadratic }, { id: 'end', timeMs: 900, value: 0.8, easing: { curve: 'linear' } }] },
    { id: 'repeat', target: { kind: 'show-repeat-scale' }, activeStartMs: 100, activeDurationMs: 800, keyframes: [{ id: 'same', timeMs: 100, value: 1, easing: quadratic }, { id: 'end', timeMs: 900, value: 2, easing: { curve: 'linear' } }] },
  ]
  const result = insertShowTimeV2(source, { atMs: 500, durationMs: 200 })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  const actual = reopen(result.record)
  expect(result.affectedTrackIds).toEqual(['brightness', 'repeat', 'speed', 'split'])
  expect(result.affectedPropertyKeyIds.filter(id => id === 'end')).toHaveLength(3)
  const speed = actual.composition.propertyTracks.find(track => track.id === 'speed')!
  expect(speed.keyframes.map(key => [key.id, key.timeMs])).toEqual([['same', 100], ['speed:hold:500', 500], ['last', 700]])
  expect(speed.activeDurationMs).toBe(1000)
  expect(evaluateShowPropertyTrackV2(speed, 499)).toBe(0)
  expect(evaluateShowPropertyTrackV2(speed, 500)).toBe(1)
  const brightness = actual.composition.propertyTracks[0]
  expect(evaluateShowPropertyTrackV2(brightness, 499)).toBeCloseTo(0.2 + 0.6 * (399 / 800) ** 2, 12)
  expect(evaluateShowPropertyTrackV2(brightness, 500)).toBeCloseTo(0.35, 12)
  expect(evaluateShowPropertyTrackV2(brightness, 699)).toBeCloseTo(0.35, 12)
  expect(evaluateShowPropertyTrackV2(brightness, 700)).toBeCloseTo(0.35, 12)
  expect(evaluateShowPropertyTrackV2(brightness, 701)).toBeCloseTo(0.2 + 0.6 * (401 / 800) ** 2, 12)
  expect(actual.composition.patternInstances).toEqual(source.composition.patternInstances)
})

it.each([[-1, 100], [1001, 100], [0.5, 100], [0, 0], [0, -1], [0, 0.5], [0, Number.MAX_SAFE_INTEGER]])('refuses invalid/overflow insertion %j atomically', (atMs, durationMs) => {
  const source = record()
  const before = structuredClone(source)
  const result = insertShowTimeV2(source, { atMs, durationMs })
  expect(result.status).toBe('refused')
  expect(result.record).toBe(source)
  expect(result.affectedClipIds).toEqual([])
  expect(result.affectedTrackIds).toEqual([])
  expect(source).toEqual(before)
})

it('checks dormant Marker overflow and invalid effective shared-track preimages', () => {
  const source = record()
  source.composition.markers[2].timeMs = Number.MAX_SAFE_INTEGER
  expect(insertShowTimeV2(source, { atMs: 500, durationMs: 100 })).toMatchObject({ status: 'refused', code: 'time-overflow', record: source })
  const grouped = groupRecord()
  grouped.composition.groupDefinitions[0].propertyTracks[0].target = { kind: 'instance-time-scale', instanceId: 'instance' }
  grouped.composition.groupOccurrences[0].trackActivation = { startMs: 50, durationMs: 650 }
  expect(insertShowTimeV2(grouped, { atMs: 250, durationMs: 100 })).toMatchObject({ status: 'refused', code: 'invalid-record', record: grouped })
})

it('classifies materialized Group-local Transition interiors/endpoints and intact before-window shifts', () => {
  for (const [atMs, status, code] of [[199, 'changed', undefined], [200, 'refused', 'transition-attachment'], [250, 'refused', 'visual-transition-window'], [300, 'refused', 'transition-attachment'], [301, 'changed', undefined]] as const) {
    const source = groupRecord()
    const definition = source.composition.groupDefinitions[0]
    definition.propertyTracks = []
    definition.clips[0].durationMs = 100
    definition.clips[0].appearance.keys = [definition.clips[0].appearance.keys[0]]
    definition.clips.push({ ...structuredClone(definition.clips[0]), id: 'to', startMs: 200, appearance: { keys: [{ ...structuredClone(definition.clips[0].appearance.keys[0]), id: 'to-key', timeMs: 200 }] } })
    definition.transitions = [{ id: 'local-fade', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' }, fromPlacementId: 'child', toPlacementId: 'to' }]
    const result = insertShowTimeV2(source, { atMs, durationMs: 100 })
    expect(result.status, result.status === 'refused' ? result.message : undefined).toBe(status)
    if (result.status === 'refused') {
      expect(result.code).toBe(code)
      expect(result.record).toBe(source)
    } else {
      const actual = materializeShowGroupsV2(reopen(result.record))
      expect(actual.composition.transitions[0]).toMatchObject({ durationMs: 100, kind: 'crossfade' })
      expect(actual.composition.clips.find(clip => clip.id === 'occ-0:to')?.startMs).toBe(atMs === 199 ? 400 : 300)
    }
  }
})

it('refuses unchanged compiler-ineligible placement topology through the shared guard', () => {
  const source = transitionRecord(false)
  source.composition.layers.push({ id: 'overlay', zoneId: 'zone', name: 'Overlay', rank: 1 })
  source.composition.clips.push({ ...structuredClone(source.composition.clips[0]), id: 'intruder', layerId: 'overlay', startMs: 350, durationMs: 20, appearance: { keys: [{ ...structuredClone(source.composition.clips[0].appearance.keys[0]), timeMs: 350 }] } })
  expect(validateShowRecordV2(source)).toEqual([])
  const result = insertShowTimeV2(source, { atMs: 150, durationMs: 100 })
  expect(result).toMatchObject({ status: 'refused', code: 'compiler-ineligible', message: expect.stringContaining('RL09') })
  expect(result.record).toBe(source)
})

const statefulSource = 'export var elapsed=0; export var calls=0; export function beforeRender(delta){elapsed+=delta;calls++} export function render2D(index,x,y){rgb((elapsed%1024)/1024,x,y)}'
function consumer(recordValue: ShowRecordV2, fidelity: 'fast' | 'fidelity', patternSource = statefulSource) {
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: patternSource, 'group:["phrase","instance"]': patternSource }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(reopen(recordValue), lookup, { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const reopened = parseEpe(exportShowEpeV2ForTest(convertibleV2Record(), artifact.code, { id: 'insert-time', stampedAt: '2026-09-16T00:00:00.000Z' }).text)
  expect(reopened).toMatchObject({ stamp: { kind: 'show' } })
  const runtime = createFastReplayRuntime({ ...artifact, code: reopened.src, dimension: 2 }, {
    randomSeed: 1038, fidelity,
    mapPoints: [{ sample: [0.25, 0.25], pos: [0.25, 0.25] }, { sample: [0.75, 0.75], pos: [0.75, 0.75] }],
  })
  return { runtime, artifact, prepared }
}
function compareConsumers(actual: ShowRecordV2, expected: ShowRecordV2, fidelity: 'fast' | 'fidelity', probes: readonly number[]) {
  const left = consumer(actual, fidelity)
  const right = consumer(expected, fidelity)
  expect(left.artifact.code).toBe(right.artifact.code)
  expect(left.prepared.recipe.restartEvents).toEqual(right.prepared.recipe.restartEvents)
  const samples = new Map<number, ReturnType<typeof left.runtime.renderCurrentFrame>>()
  for (const [index, atMs] of probes.entries()) {
    const advance = { stepMs: 1, forceFullIntermediateRender: true }
    const a = index === 0 ? left.runtime.renderCurrentFrame() : left.runtime.advanceTo(atMs, advance)
    const b = index === 0 ? right.runtime.renderCurrentFrame() : right.runtime.advanceTo(atMs, advance)
    expect(Array.from(a.frame), `${fidelity} frame ${atMs}`).toEqual(Array.from(b.frame))
    expect(a.exports, `${fidelity} state ${atMs}`).toEqual(b.exports)
    samples.set(atMs, structuredClone(a))
  }
  return { ...left, samples }
}

it.each(['fast', 'fidelity'] as const)('reopens an independently authored shared-Clip insertion and advances once through held time in %s', fidelity => {
  const source = record()
  source.composition.markers = []
  source.composition.clips[0].appearance.keys = [source.composition.clips[0].appearance.keys[0]]
  source.composition.layers.push({ id: 'overlay', zoneId: 'zone', name: 'Overlay', rank: 1 })
  source.composition.clips[0].entryPolicy = 'restart'
  source.composition.clips.push({ ...structuredClone(source.composition.clips[0]), id: 'shared', layerId: 'overlay' })
  const changed = insertShowTimeV2(source, { atMs: 500, durationMs: 200 })
  if (changed.status !== 'changed') throw new Error(changed.message)
  const expected = structuredClone(source)
  expected.composition.showEndMs = 1200
  expected.composition.layoutOccurrences[0].durationMs = 1200
  for (const clip of expected.composition.clips) {
    clip.durationMs = 1000
    clip.appearance.keys.push({ id: `${clip.id}:appearance:hold:500`, timeMs: 500, value: structuredClone(clip.appearance.keys[0].value) })
  }
  expect(reopen(changed.record)).toEqual(reopen(expected))
  const compared = compareConsumers(changed.record, expected, fidelity, [0, 99, 100, 499, 500, 600, 699, 700, 1099, 1199, 1200, 1300])
  expect(compared.artifact.summary.clips.filter(clip => !clip.id.includes('empty'))).toHaveLength(1)
  const prefix = compared.artifact.summary.clips.find(clip => clip.id === 'instance')!.prefix
  const beforeHold = compared.samples.get(500)!.exports[`${prefix}_elapsed`] as number
  const afterHold = compared.samples.get(700)!.exports[`${prefix}_elapsed`] as number
  const advance = (afterHold - beforeHold) / (fidelity === 'fidelity' ? 65536 : 1)
  if (fidelity === 'fidelity') expect(advance).toBe(200)
  else expect(advance).toBeCloseTo(200, 12)
  expect(effectiveShowInstanceUseCountV2(changed.record, 'instance')).toBe(2)
  expect(deriveShowRestartEventsV2(changed.record)).toMatchObject({ status: 'derived', events: [{ atMs: 100, clipIds: ['clip', 'shared'] }] })
})

it.each(['fast', 'fidelity'] as const)('reopens an independent held Group insertion with shared state, explicit activation and shifted Restart in %s', fidelity => {
  const source = groupRecord()
  source.composition.groupDefinitions[0].propertyTracks = []
  source.composition.groupDefinitions[0].clips[0].appearance.keys = [source.composition.groupDefinitions[0].clips[0].appearance.keys[0]]
  source.composition.groupOccurrences[0].trackActivation = { startMs: 50, durationMs: 400 }
  const changed = insertShowTimeV2(source, { atMs: 250, durationMs: 100 })
  if (changed.status !== 'changed') throw new Error(changed.message)
  const expected = structuredClone(source)
  expected.composition.showEndMs = 1100
  expected.composition.layoutOccurrences[0].durationMs = 1100
  expected.composition.groupOccurrences[0].holds = [{ id: 'occ-0:hold:150', localTimeMs: 150, durationMs: 100 }]
  expected.composition.groupOccurrences[0].trackActivation = { startMs: 50, durationMs: 500 }
  expected.composition.groupOccurrences[1].startMs = 700
  const compared = compareConsumers(changed.record, expected, fidelity, [0, 99, 100, 249, 250, 300, 349, 350, 499, 699, 700, 999, 1100, 1200])
  const prefix = compared.artifact.summary.clips.find(clip => clip.id === 'group:["phrase","instance"]')!.prefix
  expect(((compared.samples.get(350)!.exports[`${prefix}_elapsed`] as number) - (compared.samples.get(250)!.exports[`${prefix}_elapsed`] as number)) / (fidelity === 'fidelity' ? 65536 : 1)).toBe(100)
  expect(deriveShowRestartEventsV2(changed.record)).toMatchObject({ status: 'derived', events: [{ atMs: 100 }, { atMs: 700 }] })
  expect(changed.record.composition.groupDefinitions).toEqual(source.composition.groupDefinitions)
  expect(changed.record.composition.patternInstances).toEqual(source.composition.patternInstances)
})

it.each(['ordinary', 'group'] as const)('prepares canonical held animated %s insertion after a ready preimage', kind => {
  const source = kind === 'group' ? groupRecord() : record()
  if (kind === 'ordinary') source.composition.clips[0].appearance.keys = [source.composition.clips[0].appearance.keys[0]]
  else source.composition.groupDefinitions[0].clips[0].appearance.keys = [source.composition.groupDefinitions[0].clips[0].appearance.keys[0]]
  if (kind === 'ordinary') source.composition.propertyTracks = [{ id: 'brightness', target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' }, activeStartMs: 100, activeDurationMs: 800, keyframes: [
    { id: 'left', timeMs: 100, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'right', timeMs: 900, value: 0.8, easing: { curve: 'linear' } },
  ] }]
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: statefulSource, 'group:["phrase","instance"]': statefulSource }, stageDimension: 2 as const }
  expect(prepareShowV2ForCompile(reopen(source), lookup, { libraries: LIBRARIES })).toMatchObject({ status: 'ready' })
  const changed = insertShowTimeV2(source, { atMs: kind === 'group' ? 250 : 500, durationMs: 100 })
  expect(changed.status, changed.status === 'refused' ? changed.message : undefined).toBe('changed')
  if (changed.status !== 'changed') return
  const reopened = reopen(changed.record)
  const effective = materializeShowGroupsV2(reopened)
  const track = effective.composition.propertyTracks[0]
  expect(evaluateShowPropertyTrackV2(track, kind === 'group' ? 300 : 550)).toBeCloseTo(0.35, 12)
  const prepared = prepareShowV2ForCompile(reopened, { byCellId: {}, byPatternInstanceId: { instance: statefulSource, 'group:["phrase","instance"]': statefulSource }, stageDimension: 2 }, { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
})

it.each(['fast', 'fidelity'] as const)('retains existing zero-scale and explicit Freeze behavior through inserted playback in %s', fidelity => {
  for (const policy of ['zero', 'freeze'] as const) {
    const source = record()
    source.composition.markers = []
    source.composition.clips[0].appearance.keys = [source.composition.clips[0].appearance.keys[0]]
    if (policy === 'zero') source.composition.patternInstances[0].time.timeScale = 0
    else source.composition.clips[0].appearance.keys[0].value.presentation = { mode: 'freeze' }
    const changed = insertShowTimeV2(source, { atMs: 500, durationMs: 200 })
    if (changed.status !== 'changed') throw new Error(changed.message)
    const expected = structuredClone(source)
    expected.composition.showEndMs = 1200
    expected.composition.layoutOccurrences[0].durationMs = 1200
    expected.composition.clips[0].durationMs = 1000
    expected.composition.clips[0].appearance.keys.push({ id: 'clip:appearance:hold:500', timeMs: 500, value: structuredClone(source.composition.clips[0].appearance.keys[0].value) })
    const compared = compareConsumers(changed.record, expected, fidelity, [0, 100, 499, 500, 600, 699, 700, 1099])
    if (policy === 'zero') {
      const prefix = compared.artifact.summary.clips.find(clip => clip.id === 'instance')!.prefix
      expect(compared.samples.get(500)!.exports[`${prefix}_elapsed`]).toBe(0)
      expect(compared.samples.get(700)!.exports[`${prefix}_elapsed`]).toBe(0)
    } else expect(Array.from(compared.samples.get(700)!.frame)).toEqual(Array.from(compared.samples.get(500)!.frame))
    expect(changed.record.composition.patternInstances).toEqual(source.composition.patternInstances)
    expect(deriveShowRestartEventsV2(changed.record)).toEqual({ status: 'derived', events: [] })
  }
})

it.each(['fast', 'fidelity'] as const)('reopens exact Layout switch/transfer-start insertion with a mapped split-position owner in %s', fidelity => {
  const source = record()
  source.composition.markers = []
  source.composition.clips[0].appearance.keys = [source.composition.clips[0].appearance.keys[0]]
  source.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 8 })
  source.zoneLayouts[0].logical = { kind: 'split', axis: 'x', zoneIds: ['zone', 'other'] }
  source.composition.layoutOccurrences = [
    { id: 'first-layout', layoutId: 'layout', startMs: 0, durationMs: 400, parameters: { splitPosition: 0.2 } },
    { id: 'second-layout', layoutId: 'layout', startMs: 400, durationMs: 600, parameters: { splitPosition: 0.8 }, incomingTransfer: { id: 'transfer', fromOccurrenceId: 'first-layout', durationMs: 100, direction: 'forward' } },
  ]
  source.composition.propertyTracks = [{ id: 'split', target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'second-layout' }, activeStartMs: 700, activeDurationMs: 200, keyframes: [
    { id: 'start', timeMs: 700, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'end', timeMs: 900, value: 0.8, easing: { curve: 'linear' } },
  ] }]
  const changed = insertShowTimeV2(source, { atMs: 400, durationMs: 100 })
  if (changed.status !== 'changed') throw new Error(changed.message)
  const expected = structuredClone(source)
  expected.composition.showEndMs = 1100
  expected.composition.layoutOccurrences[0].durationMs = 500
  expected.composition.layoutOccurrences[1].startMs = 500
  expected.composition.clips[0].durationMs = 900
  expected.composition.clips[0].appearance.keys.push({ id: 'clip:appearance:hold:400', timeMs: 400, value: structuredClone(source.composition.clips[0].appearance.keys[0].value) })
  expected.composition.propertyTracks[0].activeStartMs = 800
  expected.composition.propertyTracks[0].keyframes[0].timeMs = 800
  expected.composition.propertyTracks[0].keyframes[1].timeMs = 1000
  compareConsumers(changed.record, expected, fidelity, [0, 399, 400, 499, 500, 599, 600, 799, 800, 999, 1000, 1099])
  expect(changed.record.composition.layoutOccurrences[1].incomingTransfer).toEqual(source.composition.layoutOccurrences[1].incomingTransfer)
})

it.each(['fast', 'fidelity'] as const)('reopens independently authored participant and whole-output before-window insertion in %s', fidelity => {
  for (const wholeOutput of [false, true]) {
    const source = transitionRecord(wholeOutput)
    source.composition.markers = []
    const changed = insertShowTimeV2(source, { atMs: 299, durationMs: 100 })
    if (changed.status !== 'changed') throw new Error(changed.message)
    const expected = structuredClone(source)
    expected.composition.showEndMs = 1100
    expected.composition.layoutOccurrences[0].durationMs = 1100
    expected.composition.clips[0].durationMs = 300
    expected.composition.clips[0].appearance.keys.push({ id: 'clip:appearance:hold:299', timeMs: 299, value: structuredClone(source.composition.clips[0].appearance.keys[0].value) })
    expected.composition.clips[1].startMs = 500
    expected.composition.clips[1].appearance.keys[0].timeMs = 500
    if (expected.composition.transitions[0].wholeOutput) expected.composition.transitions[0].wholeOutput.startMs = 400
    compareConsumers(changed.record, expected, fidelity, [0, 100, 298, 299, 398, 399, 400, 450, 499, 500, 799, 800, 1099])
    expect(changed.record.composition.transitions[0].durationMs).toBe(100)
  }
})


it.each(['fast', 'fidelity'] as const)('executes restricted nonlinear held ordinary/Group curves against independent output arithmetic in %s', fidelity => {
  for (const kind of ['ordinary', 'group'] as const) {
    const source = kind === 'group' ? groupRecord() : record()
    const clip = kind === 'ordinary' ? source.composition.clips[0] : source.composition.groupDefinitions[0].clips[0]
    clip.appearance.keys = [clip.appearance.keys[0]]
    clip.appearance.keys[0].value.view.brightness = 1
    clip.appearance.keys[0].value.opacity = 1
    if (kind === 'ordinary') source.composition.propertyTracks = [{
      id: 'brightness', target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
      activeStartMs: 100, activeDurationMs: 800,
      keyframes: [{ id: 'left', timeMs: 100, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'right', timeMs: 900, value: 0.8, easing: { curve: 'linear' } }],
    }]
    const insertion = kind === 'ordinary' ? 500 : 250
    const duration = kind === 'ordinary' ? 800 : 300
    const before = consumer(source, fidelity, 'export function render2D(index,x,y){rgb(1,1,1)}')
    const result = insertShowTimeV2(source, { atMs: insertion, durationMs: 100 })
    if (result.status !== 'changed') throw new Error(result.message)
    const after = consumer(result.record, fidelity, 'export function render2D(index,x,y){rgb(1,1,1)}')
    for (const atMs of [100, insertion - 1, insertion, insertion + 25, insertion + 99, insertion + 100, insertion + 101, insertion + 125]) {
      const authoredTime = atMs < insertion ? atMs : atMs < insertion + 100 ? insertion : atMs - 100
      const expected = 0.2 + 0.6 * ((authoredTime - 100) / duration) ** 2
      const snapshot = after.runtime.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true })
      const preimage = before.runtime.advanceTo(authoredTime, { stepMs: 12525, forceFullIntermediateRender: true })
      for (const value of snapshot.frame) {
        if (fidelity === 'fast') expect(value, `${kind} ${atMs}`).toBeCloseTo(expected, 12)
        else expect(Math.abs(value - expected), `${kind} Q16 ${atMs}`).toBeLessThan(4 / 65536)
        expect(Math.round(value * 255), `${kind} displayed ${atMs}`).toBe(Math.round(expected * 255))
      }
      expect(Array.from(snapshot.frame, value => Math.round(value * 255))).toEqual(Array.from(preimage.frame, value => Math.round(value * 255)))
    }
  }
})

it.each(['fast', 'fidelity'] as const)('holds an exact discontinuous last key through generated section playback in %s', fidelity => {
  const source = record()
  const clip = source.composition.clips[0]
  clip.appearance.keys = [clip.appearance.keys[0]]
  clip.appearance.keys[0].value.view.brightness = 1
  source.composition.propertyTracks = [{ id: 'step', target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' }, activeStartMs: 100, activeDurationMs: 800, keyframes: [
    { id: 'left', timeMs: 100, value: 0, easing: { curve: 'hold', at: 1 } }, { id: 'last', timeMs: 500, value: 1, easing: { curve: 'linear' } },
  ] }]
  const result = insertShowTimeV2(source, { atMs: 500, durationMs: 100 })
  if (result.status !== 'changed') throw new Error(result.message)
  expect(result.record.composition.propertyTracks[0].keyframes.find(key => key.id === 'last')?.timeMs).toBe(600)
  const playback = consumer(result.record, fidelity, 'export function render2D(index,x,y){rgb(1,1,1)}')
  for (const atMs of [499, 500, 550, 599, 600, 601, 999]) {
    expect(Array.from(playback.runtime.advanceTo(atMs, { stepMs: 125 }).frame)).toEqual(Array(6).fill(atMs < 500 ? 0 : 1))
  }
})


it('keeps an admitted participant Transition shared-instance track preparable after before-window insertion', () => {
  const source = transitionRecord(false)
  source.composition.propertyTracks = [{ id: 'speed', target: { kind: 'instance-time-scale', instanceId: 'instance' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [
    { id: 'left', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'right', timeMs: 1000, value: 1, easing: { curve: 'linear' } },
  ] }]
  expect(consumer(source, 'fast').prepared.status).toBe('ready')
  const result = insertShowTimeV2(source, { atMs: 299, durationMs: 100 })
  if (result.status !== 'changed') throw new Error(result.message)
  expect(consumer(result.record, 'fast').prepared.status).toBe('ready')
})


it.each([
  ['opacity', { opacity: 0.25 }],
  ['view', { view: { mirror: false, phase: 0, brightness: 0.2 + Number.EPSILON } }],
  ['presentation', { presentation: { mode: 'freeze' } }],
  ['blink', { blink: { rateHz: 2, duty: 0.5, phase: 0 } }],
  ['transform', { transform: { positionX: 0.1, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 } }],
  ['aperture', { aperture: { enabled: true, x: 0, y: 0, width: 0.5, height: 1 } }],
  ['effects', { effects: [{ id: 'effect', kind: 'brightness', brightness: 0.5 }] }],
] satisfies Array<[string, Partial<ShowClipAppearanceValueV2>]>)('preserves honest Transition refusal for actual %s appearance divergence', (_field, difference) => {
  const source = transitionRecord(false)
  const clip = source.composition.clips[0]
  clip.appearance.keys.push({ id: 'changed-value', timeMs: 200, value: { ...structuredClone(clip.appearance.keys[0].value), ...structuredClone(difference) } })
  source.composition.propertyTracks = [{ id: 'speed', target: { kind: 'instance-time-scale', instanceId: 'instance' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [
    { id: 'left', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'right', timeMs: 1000, value: 1, easing: { curve: 'linear' } },
  ] }]
  const before = structuredClone(source)
  expect(validateShowRecordV2(source)).toEqual([])
  expect(prepareShowV2ForCompile(reopen(source), { byCellId: {}, byPatternInstanceId: { instance: statefulSource }, stageDimension: 2 }, { libraries: LIBRARIES })).toMatchObject({ status: 'refused', issues: [{ code: 'unsupported-transition-property-track' }] })
  expect(source).toEqual(before)
})

it('coalesces only transient exact complete values without changing persisted keys or previously admitted source', () => {
  const source = transitionRecord(false)
  source.composition.propertyTracks = [{ id: 'speed', target: { kind: 'instance-time-scale', instanceId: 'instance' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [
    { id: 'left', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'right', timeMs: 1000, value: 1, easing: { curve: 'linear' } },
  ] }]
  const beforeCode = consumer(source, 'fast').artifact.code
  const first = source.composition.clips[0].appearance.keys[0].value
  source.composition.clips[0].appearance.keys.push({ id: 'equal-key', timeMs: 200, value: { view: { brightness: first.view.brightness, phase: first.view.phase, mirror: first.view.mirror }, effects: [], opacity: first.opacity } })
  const before = structuredClone(source)
  expect(consumer(source, 'fast').artifact.code).toBe(beforeCode)
  expect(source).toEqual(before)
  expect(reopen(source).composition.clips[0].appearance.keys.map(key => [key.id, key.timeMs])).toEqual([['first', 100], ['equal-key', 200]])
})

it('allocates collision-safe transient section track and key IDs without rewriting authored identities', () => {
  const source = record()
  source.composition.clips[0].appearance.keys = [source.composition.clips[0].appearance.keys[0]]
  source.composition.propertyTracks = [
    { id: 'brightness', target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' }, activeStartMs: 100, activeDurationMs: 800, keyframes: [{ id: 'left', timeMs: 100, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'right', timeMs: 900, value: 0.8, easing: { curve: 'linear' } }] },
    { id: 'brightness@v2-section:1', target: { kind: 'instance-time-scale', instanceId: 'instance' }, activeStartMs: 100, activeDurationMs: 800, keyframes: [{ id: 'left@v2-section:1', timeMs: 100, value: 1, easing: { curve: 'linear' } }, { id: 'speed-right', timeMs: 900, value: 1, easing: { curve: 'linear' } }] },
  ]
  const result = insertShowTimeV2(source, { atMs: 500, durationMs: 100 })
  if (result.status !== 'changed') throw new Error(result.message)
  const before = structuredClone(result.record)
  const prepared = consumer(result.record, 'fast').prepared
  const tracks = prepared.recipe.routedSceneSequence!.scenes.flatMap(scene => scene.propertyTracks ?? [])
  expect(tracks.map(track => track.id)).toContain('brightness@v2-section:1:2')
  expect(tracks.flatMap(track => track.keyframes.map(key => key.id))).toContain('left@v2-section:1:2')
  expect(new Set(tracks.map(track => track.id)).size).toBe(tracks.length)
  const keys = tracks.flatMap(track => track.keyframes.map(key => key.id))
  expect(new Set(keys).size).toBe(keys.length)
  expect(result.record).toEqual(before)
})

it.each([30000, 60000])('reopens ordinary %ims Shows with bounded inserted playback and unchanged runtime identity', showEndMs => {
  const source = record()
  source.composition.showEndMs = showEndMs
  source.composition.layoutOccurrences[0].durationMs = showEndMs
  source.composition.clips[0].durationMs = showEndMs - 100
  source.composition.clips[0].appearance.keys = [source.composition.clips[0].appearance.keys[0]]
  const atMs = showEndMs - 1000
  const result = insertShowTimeV2(source, { atMs, durationMs: 500 })
  if (result.status !== 'changed') throw new Error(result.message)
  expect(reopen(result.record).composition.showEndMs).toBe(showEndMs + 500)
  expect(result.record.composition.patternInstances).toEqual(source.composition.patternInstances)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const playback = consumer(result.record, fidelity)
    const before = structuredClone(playback.runtime.advanceTo(atMs, { stepMs: 125 }).exports)
    const after = playback.runtime.advanceTo(atMs + 500, { stepMs: 125 }).exports
    const prefix = playback.artifact.summary.clips.find(clip => clip.id === 'instance')!.prefix
    expect(((after[`${prefix}_elapsed`] as number) - (before[`${prefix}_elapsed`] as number)) / (fidelity === 'fidelity' ? 65536 : 1)).toBe(500)
  }
})
