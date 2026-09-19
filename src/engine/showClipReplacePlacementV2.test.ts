// Ordinary Clip re-placement: the v2 owner intent that changes a Clip's Zone
// and/or Layer, optionally with a new start. v1 `move_clip` accepted a Layer
// change, so the specification's preserved-legacy-edit obligation (section 5)
// requires it here. Oracles are the reopened `.pxlshow` record and the reopened
// `.epe` artifact replayed in Fast and Precise against an independently
// authored record already placed at the destination.
import { expect, it } from 'vitest'
import { LIBRARIES } from '../pixelblaze/libs'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { emitFixedPoint } from './fxEmit'
import { parseEpe } from './epeImport'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { editShowClipTemporalV2 } from './showClipTemporalV2'
import { editShowClipV2 } from './showClipsV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowClipV2,
  type ShowRecordV2,
} from './showCompositionV2'

/**
 * Two Zones under one split Layout, two Layers on the left Zone, one shared
 * runtime and one Clip-owned opacity track. Every destination in these tests is
 * an existing Layer of an existing Zone unless the case says otherwise.
 */
function fixture(): ShowRecordV2 {
  return {
    version: 2,
    id: 'replace-placement',
    name: 'Re-placement fixture',
    zones: [
      { id: 'left', name: 'Left', nominalPixelCount: 16 },
      { id: 'right', name: 'Right', nominalPixelCount: 16 },
    ],
    zoneLayouts: [
      { id: 'both', name: 'Both', zones: [], logical: { kind: 'split', axis: 'x', zoneIds: ['left', 'right'] } },
      { id: 'left-only', name: 'Left only', zones: [], logical: { kind: 'single', zoneIds: ['left'] } },
    ],
    outputContract: {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 16,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    },
    composition: {
      version: 2,
      executionModel: 'continuous',
      showEndMs: 2_000,
      sampleRemap: { repeatScale: 1 },
      patternInstances: [
        { id: 'instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } },
      ],
      layers: [
        { id: 'base', zoneId: 'left', name: 'Base', rank: 0 },
        { id: 'over', zoneId: 'left', name: 'Over', rank: 1 },
        { id: 'right-base', zoneId: 'right', name: 'Right base', rank: 0 },
      ],
      clips: [clip('selected', 'base', 400, 400)],
      transitions: [],
      layoutOccurrences: [{ id: 'coverage', layoutId: 'both', startMs: 0, durationMs: 2_000, parameters: {} }],
      propertyTracks: [{
        id: 'clip-opacity',
        target: { kind: 'clip-opacity', clipId: 'selected' },
        activeStartMs: 400,
        activeDurationMs: 400,
        keyframes: [
          { id: 'opacity-first', timeMs: 400, value: 0.25, easing: { curve: 'quadratic', direction: 'in' } },
          { id: 'opacity-last', timeMs: 800, value: 1, easing: { curve: 'linear' } },
        ],
      }],
      markers: [],
      groupDefinitions: [],
      groupOccurrences: [],
    },
    updatedAt: 1,
  }
}

function clip(id: string, layerId: string, startMs: number, durationMs: number, zoneId = 'left'): ShowClipV2 {
  return {
    id,
    instanceId: 'instance',
    zoneId,
    layerId,
    startMs,
    durationMs,
    entryPolicy: 'continue',
    zoneSampleMode: 'span',
    appearance: {
      keys: [
        { id: `${id}-key`, timeMs: startMs, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } },
        { id: `${id}-dim`, timeMs: startMs + 200, value: { opacity: 0.5, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } },
      ],
    },
  }
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  expect(validateShowRecordV2(opened.record)).toEqual([])
  return opened.record
}

/** The independently authored destination record these tests compare against. */
function authored(mutate: (record: ShowRecordV2) => void): ShowRecordV2 {
  const record = fixture()
  mutate(record)
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

const sourceCode = 'export var calls = 0; export var elapsed = 0; export function beforeRender(delta) { calls++; elapsed += delta } export function render2D(index, x, y) { rgb(elapsed / 2000, x, y) }'

function playback(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const opened = reopen(record)
  const prepared = prepareShowV2ForCompile(opened, {
    byCellId: {},
    stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(opened).composition.patternInstances.map(instance => [instance.id, sourceCode])),
  }, { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const exported = buildShowEpeExportV2(opened, artifact.code, { id: 'replace-placement-proof', stampedAt: '2026-09-16T00:00:00Z' })
  expect(exported.status, JSON.stringify(exported)).toBe('exported')
  if (exported.status !== 'exported') throw new Error(exported.message)
  const delivered = parseEpe(exported.text)
  expect(delivered.stamp?.kind).toBe('show')
  return {
    artifact,
    runtime: createFastReplayRuntime({ ...artifact, code: delivered.src, fxCode: emitFixedPoint(delivered.src), dimension: 2 },
      { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] }),
  }
}

it('moves an ordinary Clip to another Layer with its appearance keys and Clip-owned track', () => {
  const source = fixture()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over' })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  const next = reopen(result.record)
  expect(next.composition.clips.map(candidate => [candidate.id, candidate.zoneId, candidate.layerId, candidate.startMs, candidate.durationMs]))
    .toEqual([['selected', 'left', 'over', 400, 400]])
  // The destination is the only change: keys, tracks and the runtime stay exact.
  expect(next.composition.clips[0].appearance).toEqual(source.composition.clips[0].appearance)
  expect(next.composition.propertyTracks).toEqual(source.composition.propertyTracks)
  expect(next.composition.patternInstances).toEqual(source.composition.patternInstances)
  expect(result.affectedClipIds).toEqual(['selected'])
  expect(result.affectedTrackIds).toEqual([])
  expect(result.affectedAppearanceKeyIds).toEqual([])
  expect(result.removedIds).toEqual([])
  expect(source).toEqual(prior)
})

it('moves an ordinary Clip to another Zone and start, translating its Clip-owned animation once', () => {
  const source = fixture()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', zoneId: 'right', layerId: 'right-base', startMs: 1_000 })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  const next = reopen(result.record)
  const expected = authored(record => {
    record.composition.clips = [clip('selected', 'right-base', 1_000, 400, 'right')]
    record.composition.propertyTracks[0].activeStartMs = 1_000
    record.composition.propertyTracks[0].keyframes[0].timeMs = 1_000
    record.composition.propertyTracks[0].keyframes[1].timeMs = 1_400
  })
  expect(next.composition).toEqual(reopen(expected).composition)
  expect(result.affectedClipIds).toEqual(['selected'])
  expect(result.affectedTrackIds).toEqual(['clip-opacity'])
  expect(result.affectedAppearanceKeyIds.sort()).toEqual(['selected-dim', 'selected-key'])
  expect(result.affectedPropertyKeyIds.sort()).toEqual(['opacity-first', 'opacity-last'])
  expect(source).toEqual(prior)
})

it('leaves a shared-instance track fixed while a Clip-owned track follows the re-placed Clip', () => {
  const source = fixture()
  source.composition.clips.push(clip('other', 'over', 400, 400))
  source.composition.propertyTracks.push({
    id: 'shared-speed',
    target: { kind: 'instance-time-scale', instanceId: 'instance' },
    activeStartMs: 400,
    activeDurationMs: 400,
    keyframes: [
      { id: 'speed-first', timeMs: 400, value: 1, easing: { curve: 'linear' } },
      { id: 'speed-last', timeMs: 800, value: 2, easing: { curve: 'linear' } },
    ],
  })
  expect(validateShowRecordV2(source)).toEqual([])
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', zoneId: 'right', layerId: 'right-base', startMs: 1_000 })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  const next = reopen(result.record)
  expect(next.composition.propertyTracks.find(track => track.id === 'shared-speed'))
    .toEqual(source.composition.propertyTracks.find(track => track.id === 'shared-speed'))
  expect(next.composition.clips.find(candidate => candidate.id === 'other')).toEqual(source.composition.clips[1])
  expect(result.affectedTrackIds).toEqual(['clip-opacity'])
})

it.each(['fast', 'fidelity'] as const)('reopened %s playback matches an independently authored Clip at the destination', fidelity => {
  const source = fixture()
  const edited = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over', startMs: 1_000 })
  expect(edited.status, JSON.stringify(edited)).toBe('changed')
  if (edited.status !== 'changed') return
  const expected = authored(record => {
    record.composition.clips = [clip('selected', 'over', 1_000, 400)]
    record.composition.propertyTracks[0].activeStartMs = 1_000
    record.composition.propertyTracks[0].keyframes[0].timeMs = 1_000
    record.composition.propertyTracks[0].keyframes[1].timeMs = 1_400
  })
  const actual = playback(edited.record, fidelity)
  const oracle = playback(expected, fidelity)
  expect(actual.artifact.code).toBe(oracle.artifact.code)
  for (const atMs of [0, 399, 400, 401, 799, 800, 999, 1_000, 1_001, 1_199, 1_200, 1_399, 1_400, 1_401, 1_999, 2_000, 2_400]) {
    const a = actual.runtime.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    const b = oracle.runtime.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    expect(Array.from(a.frame), `frame@${atMs}`).toEqual(Array.from(b.frame))
    expect(a.exports, `state@${atMs}`).toEqual(b.exports)
  }
})

it.each(['fast', 'fidelity'] as const)('reopened %s playback of a cross-Zone destination lights the destination Zone', fidelity => {
  const source = fixture()
  const edited = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', zoneId: 'right', layerId: 'right-base' })
  expect(edited.status, JSON.stringify(edited)).toBe('changed')
  if (edited.status !== 'changed') return
  const expected = authored(record => { record.composition.clips = [clip('selected', 'right-base', 400, 400, 'right')] })
  const actual = playback(edited.record, fidelity)
  const oracle = playback(expected, fidelity)
  const preimage = playback(source, fidelity)
  expect(actual.artifact.code).toBe(oracle.artifact.code)
  let differed = false
  for (const atMs of [0, 399, 400, 401, 599, 600, 799, 800, 1_200, 2_000, 2_400]) {
    const a = actual.runtime.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    const b = oracle.runtime.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    const before = preimage.runtime.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    expect(Array.from(a.frame), `frame@${atMs}`).toEqual(Array.from(b.frame))
    expect(a.exports, `state@${atMs}`).toEqual(b.exports)
    if (JSON.stringify(Array.from(a.frame)) !== JSON.stringify(Array.from(before.frame))) differed = true
  }
  // The destination is a different Zone, so delivered output must differ.
  expect(differed, 'the re-placed Clip lights another Zone').toBe(true)
})

it.each([
  { label: 'an overlapping ordinary Clip', overlap: 400, accepted: false },
  { label: 'exact half-open adjacency', overlap: 800, accepted: true },
])('checks destination occupancy against $label', ({ overlap, accepted }) => {
  const source = fixture()
  source.composition.clips.push(clip('blocker', 'over', overlap, 400))
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over' })
  expect(result.status).toBe(accepted ? 'changed' : 'refused')
  if (result.status === 'refused') {
    expect(result.code).toBe('invalid-result')
    expect(result.message).toContain('overlap')
    expect(result.record).toBe(source)
    expect(result.affectedClipIds).toEqual([])
  }
  expect(source).toEqual(prior)
})

it('checks destination occupancy against a materialized Group Clip', () => {
  const source = fixture()
  source.composition.groupDefinitions = [{
    id: 'group',
    name: 'Linked',
    patternInstances: [{ ...structuredClone(source.composition.patternInstances[0]), id: 'slot' }],
    layers: [{ id: 'local', name: 'Child', rank: 0 }],
    clips: [{
      id: 'child', instanceId: 'slot', layerId: 'local', startMs: 0, durationMs: 400, entryPolicy: 'continue', zoneSampleMode: 'span',
      appearance: { keys: [{ id: 'child-key', timeMs: 0, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
    }],
    transitions: [],
    propertyTracks: [],
  }]
  source.composition.groupOccurrences = [{
    id: 'use', definitionId: 'group', zoneId: 'left', layoutOccurrenceId: 'coverage', startMs: 500,
    translationX: 0, translationY: 0, layerBindings: [{ definitionLayerId: 'local', layerId: 'over' }],
    instanceBindings: { slot: 'instance' }, holds: [],
  }]
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over' })
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') return
  expect(result.code).toBe('invalid-result')
  expect(result.record).toBe(source)
  expect(source).toEqual(prior)
})

it('refuses a destination Zone the active Layout does not provide for the whole nominal interval', () => {
  const source = fixture()
  source.composition.layoutOccurrences = [
    { id: 'both-first', layoutId: 'both', startMs: 0, durationMs: 600, parameters: {} },
    { id: 'left-later', layoutId: 'left-only', startMs: 600, durationMs: 1_400, parameters: {} },
  ]
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', zoneId: 'right', layerId: 'right-base' })
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') return
  expect(result.code).toBe('zone-unavailable')
  expect(result.message).toContain('selected')
  expect(result.record).toBe(source)
  expect(source).toEqual(prior)
})

/**
 * Whole-output pre-roll: a contributor set is named by exact time, not by Zone
 * or Layer, so a whole-output contributor may change its destination. That is
 * the only partition where incoming pre-roll decides availability on its own —
 * a participant pair detaches before availability runs, so its pre-roll leaves
 * with the Transition.
 */
function wholeOutputPreRoll(): ShowRecordV2 {
  const source = fixture()
  source.composition.clips = [clip('outgoing', 'base', 200, 400), clip('selected', 'base', 700, 400)]
  source.composition.propertyTracks = []
  source.composition.transitions = [{
    id: 'boundary', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' }, crossfadePolicy: 'live-live', propertyRamps: [],
    participants: [],
    wholeOutput: { startMs: 600, fromClipIds: ['outgoing'], toClipIds: ['selected'] },
  }]
  source.composition.layoutOccurrences = [
    { id: 'left-first', layoutId: 'left-only', startMs: 0, durationMs: 650, parameters: {} },
    { id: 'both-later', layoutId: 'both', startMs: 650, durationMs: 1_350, parameters: {} },
  ]
  expect(validateShowRecordV2(source)).toEqual([])
  return source
}

it('refuses a destination Zone that is absent only during the incoming Transition pre-roll', () => {
  const source = wholeOutputPreRoll()
  const prior = structuredClone(source)
  // The nominal bar [700,1100) is covered from 650; the incoming whole-output
  // contribution starts at 600, where the right Zone is not yet routed.
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', zoneId: 'right', layerId: 'right-base' })
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') return
  expect(result.code).toBe('zone-unavailable')
  expect(result.message).toContain('selected')
  expect(result.record).toBe(source)
  expect(source).toEqual(prior)
})

it('accepts the same destination once no Transition extends the contribution before it', () => {
  const source = wholeOutputPreRoll()
  source.composition.transitions = []
  expect(validateShowRecordV2(source)).toEqual([])
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', zoneId: 'right', layerId: 'right-base' })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'selected'))
    .toMatchObject({ zoneId: 'right', layerId: 'right-base', startMs: 700 })
})

it('keeps a whole-output Transition record exact when a contributor changes destination', () => {
  const source = wholeOutputPreRoll()
  source.composition.layoutOccurrences = [{ id: 'coverage', layoutId: 'both', startMs: 0, durationMs: 2_000, parameters: {} }]
  expect(validateShowRecordV2(source)).toEqual([])
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', zoneId: 'right', layerId: 'right-base' })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  expect(reopen(result.record).composition.transitions).toEqual(source.composition.transitions)
  expect(result.affectedTransitionIds).toEqual(['boundary'])
})

it('detaches the attached participant Transition on a Zone or Layer change (#1068 gap 2)', () => {
  // Rewriting this refusal is the point of the slice, not a weakening of it:
  // gap 2 turns the connected-reroute refusal into a detach-and-move, matching
  // the v1 drag on both endpoints of the join.
  const source = gappedJoin()
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  for (const destination of [{ layerId: 'over' }, { zoneId: 'right', layerId: 'right-base' }]) {
    const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', ...destination })
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') continue
    expect(result.record.composition.transitions).toEqual([])
    expect(result.affectedTransitionIds).toEqual(['incoming'])
    expect(result.removedIds).toEqual(['incoming'])
  }
  // The same Clip still moves in time through its connected component.
  const moved = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', startMs: 700 })
  expect(moved.status).toBe('changed')
  if (moved.status !== 'changed') return
  expect(moved.record.composition.transitions).toEqual(source.composition.transitions)
  expect(source).toEqual(prior)
})

it('detaches symmetrically when the first Clip of the join is dragged', () => {
  const source = gappedJoin()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'outgoing', layerId: 'over' })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'outgoing'))
    .toMatchObject({ zoneId: 'left', layerId: 'over', startMs: 0, durationMs: 400 })
  expect(result.record.composition.transitions).toEqual([])
  expect(result.removedIds).toEqual(['incoming'])
  // The former downstream partner stays exactly where it was.
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'selected'))
    .toMatchObject({ zoneId: 'left', layerId: 'base', startMs: 500 })
  // Native joins detach with no timeline reclaim.
  expect(result.record.composition.showEndMs).toBe(2_000)
  expect(source).toEqual(prior)
})

/**
 * A joined Clip with a 100 ms gap before its incoming participant: the
 * contribution interval [400, 900) extends 100 ms before the Clip's own
 * [500, 900), which is the pre-roll the detach probes below exercise.
 */
function gappedJoin(): ShowRecordV2 {
  const source = fixture()
  source.composition.clips = [clip('outgoing', 'base', 0, 400), clip('selected', 'base', 500, 400)]
  source.composition.propertyTracks = []
  source.composition.transitions = [{
    id: 'incoming', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' }, crossfadePolicy: 'live-live', propertyRamps: [],
    participants: [{ id: 'pair', zoneId: 'left', layerId: 'base', fromClipId: 'outgoing', toClipId: 'selected' }],
  }]
  expect(validateShowRecordV2(source)).toEqual([])
  return source
}

it.each([
  { label: 'another Layer', destination: { layerId: 'over' }, zoneId: 'left', layerId: 'over' },
  { label: 'another Zone', destination: { zoneId: 'right', layerId: 'right-base' }, zoneId: 'right', layerId: 'right-base' },
])('detaches a plain participant Transition when a joined Clip moves to $label', ({ destination, zoneId, layerId }) => {
  const source = gappedJoin()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', ...destination })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'selected'))
    .toMatchObject({ zoneId, layerId, startMs: 500, durationMs: 400 })
  expect(result.record.composition.transitions).toEqual([])
  expect(result.affectedTransitionIds).toEqual(['incoming'])
  expect(result.removedIds).toEqual(['incoming'])
  // The former join partner stays exactly where it was: only the dragged Clip moves.
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'outgoing'))
    .toMatchObject({ zoneId: 'left', layerId: 'base', startMs: 0, durationMs: 400 })
  // Native joins detach with no timeline reclaim: Show End and Layouts stay exact.
  expect(result.record.composition.showEndMs).toBe(2_000)
  expect(result.record.composition.layoutOccurrences).toEqual(source.composition.layoutOccurrences)
  expect(source).toEqual(prior)
})

it('repairs a converted boundary on a cross-Layer drop instead of leaving its window unplayed', () => {
  const source = convertedJoin()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over' })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  // The 100 ms boundary window [500, 600) is reclaimed: the dragged downstream
  // Clip lands 100 ms earlier, Show End shrinks by the same 100 ms, and the
  // owning Layout occurrence absorbs the reclaim, so nothing is left unplayed.
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'selected'))
    .toMatchObject({ zoneId: 'left', layerId: 'over', startMs: 500, durationMs: 400 })
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'outgoing'))
    .toMatchObject({ zoneId: 'left', layerId: 'base', startMs: 0, durationMs: 500 })
  expect(result.record.composition.transitions).toEqual([])
  expect(result.record.composition.showEndMs).toBe(1_900)
  expect(result.record.composition.layoutOccurrences).toEqual([
    { id: 'coverage', layoutId: 'both', startMs: 0, durationMs: 1_900, parameters: {} },
  ])
  expect(result.affectedTransitionIds).toEqual(['incoming'])
  expect(result.removedIds).toEqual(['incoming'])
  expect(result.affectedClipIds).toEqual(['selected'])
  expect(result.affectedLayoutOccurrenceIds).toEqual(['coverage'])
  expect(source).toEqual(prior)
})

it('repairs the same converted boundary when the upstream Clip of the join is dragged', () => {
  const source = convertedJoin()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'outgoing', layerId: 'over' })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  // The dragged upstream Clip is untouched by the reclaim; the downstream side
  // still moves earlier by the boundary duration and Show End still shrinks.
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'outgoing'))
    .toMatchObject({ zoneId: 'left', layerId: 'over', startMs: 0, durationMs: 500 })
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'selected'))
    .toMatchObject({ zoneId: 'left', layerId: 'base', startMs: 500, durationMs: 400 })
  expect(result.record.composition.transitions).toEqual([])
  expect(result.record.composition.showEndMs).toBe(1_900)
  expect(result.affectedTransitionIds).toEqual(['incoming'])
  expect(result.removedIds).toEqual(['incoming'])
  expect(result.affectedClipIds).toEqual(expect.arrayContaining(['outgoing', 'selected']))
  expect(source).toEqual(prior)
})

it('lands an explicit start exactly on a converted-boundary drop while downstream still reclaims', () => {
  const source = convertedJoin()
  // A tail Clip downstream of the join makes the reclaim observable apart from
  // the dragged Clip: it must ride the repair even though the dragged Clip is
  // pinned to its requested start.
  source.composition.clips.push(clip('tail', 'base', 1_000, 400))
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over', startMs: 1_200 })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  // The requested start names post-repair coordinates: the Clip lands exactly
  // at 1200, not 1100. If the preimage-derived shift returns, this is the
  // assertion that fails.
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'selected'))
    .toMatchObject({ zoneId: 'left', layerId: 'over', startMs: 1_200, durationMs: 400 })
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'outgoing'))
    .toMatchObject({ zoneId: 'left', layerId: 'base', startMs: 0, durationMs: 500 })
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'tail'))
    .toMatchObject({ zoneId: 'left', layerId: 'base', startMs: 900, durationMs: 400 })
  expect(result.record.composition.transitions).toEqual([])
  expect(result.record.composition.showEndMs).toBe(1_900)
  expect(result.record.composition.layoutOccurrences).toEqual([
    { id: 'coverage', layoutId: 'both', startMs: 0, durationMs: 1_900, parameters: {} },
  ])
  expect(source).toEqual(prior)
})

it('accepts an explicit start smaller than the boundary duration instead of refusing it', () => {
  const source = convertedJoin()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over', startMs: 50 })
  // A preimage-frame repair would move the Clip to -50 and refuse; the
  // requested start is post-repair, so this drop is legal and lands at 50.
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'selected'))
    .toMatchObject({ zoneId: 'left', layerId: 'over', startMs: 50, durationMs: 400 })
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'outgoing'))
    .toMatchObject({ zoneId: 'left', layerId: 'base', startMs: 0, durationMs: 500 })
  expect(result.record.composition.transitions).toEqual([])
  expect(result.record.composition.showEndMs).toBe(1_900)
  expect(source).toEqual(prior)
})

it('honours an explicit start on the from-side endpoint without moving the dragged Clip', () => {
  const source = convertedJoin()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'outgoing', layerId: 'over', startMs: 1_200 })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'outgoing'))
    .toMatchObject({ zoneId: 'left', layerId: 'over', startMs: 1_200, durationMs: 500 })
  // The downstream side still reclaims by the boundary duration.
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'selected'))
    .toMatchObject({ zoneId: 'left', layerId: 'base', startMs: 500, durationMs: 400 })
  expect(result.record.composition.transitions).toEqual([])
  expect(result.record.composition.showEndMs).toBe(1_900)
  expect(source).toEqual(prior)
})

it('refuses a drop whose post-move interval straddles the reclaimed window end', () => {
  const source = convertedJoin()
  const prior = structuredClone(source)
  // The preimage [0, 500) passes the old guard, but the candidate [520, 1020)
  // straddles windowEndMs 600 while everything from 600 shifts 100 ms earlier.
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'outgoing', layerId: 'over', startMs: 520 })
  expect(result.status, JSON.stringify(result)).toBe('refused')
  if (result.status !== 'refused') return
  expect(result.code).toBe('invalid-result')
  expect(result.message).toContain('600')
  expect(result.record).toBe(source)
  expect(result.affectedClipIds).toEqual([])
  expect(result.removedIds).toEqual([])
  expect(result.record.composition.transitions).toHaveLength(1)
  expect(result.record.composition.showEndMs).toBe(2_000)
  expect(source).toEqual(prior)
})

it.each([
  { label: 'a native join', join: 'gapped' },
  { label: 'a converted-Layer join', join: 'converted-layer' },
])('leaves $label unrepaired on an explicit-start drop', ({ join }) => {
  const source = join === 'gapped' ? gappedJoin() : convertedLayerJoin()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over', startMs: 1_000 })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'selected'))
    .toMatchObject({ zoneId: 'left', layerId: 'over', startMs: 1_000, durationMs: 400 })
  expect(result.record.composition.transitions).toEqual([])
  // No boundary repair runs here: Show End and Layouts stay exact.
  expect(result.record.composition.showEndMs).toBe(2_000)
  expect(result.record.composition.layoutOccurrences).toEqual(source.composition.layoutOccurrences)
  expect(source).toEqual(prior)
})

it('refuses the whole drop atomically when the converted-boundary repair is blocked', () => {
  const source = convertedJoin()
  // A Clip on an untouched Layer spans the reclaimed window end (600 ms), so
  // the commit cannot move the downstream side and must refuse without a write.
  source.composition.clips.push(clip('blocker', 'right-base', 550, 250, 'right'))
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over' })
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') return
  expect(result.code).toBe('invalid-result')
  expect(result.message).toContain('600')
  expect(result.record).toBe(source)
  expect(result.affectedTransitionIds).toEqual([])
  expect(result.removedIds).toEqual([])
  expect(result.record.composition.transitions).toHaveLength(1)
  expect(result.record.composition.showEndMs).toBe(2_000)
  expect(source).toEqual(prior)
})

it('refuses to detach a converted boundary that carries Property ramps', () => {
  const source = convertedJoin()
  // Participant scope cannot carry global scalar ramps (those require whole-output
  // scope), so the carrier targets the joining Clip's own appearance instead.
  source.composition.transitions[0].propertyRamps = [{
    participantId: 'pair', target: { kind: 'clip-view', clipId: 'selected', property: 'brightness' },
    from: 0.2, easing: { curve: 'quadratic', direction: 'in' },
  }]
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over' })
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') return
  expect(result.code).toBe('unsupported-property-carrier')
  expect(result.message).toContain('incoming')
  expect(result.record).toBe(source)
  expect(result.record.composition.transitions).toHaveLength(1)
  expect(result.affectedTransitionIds).toEqual([])
  expect(source).toEqual(prior)
})

/**
 * A converted Scene boundary at participant scope: the 100 ms Transition
 * window runs [500, 600) between exact endpoints, structurally identical to a
 * native Layer junction but carrying boundary provenance.
 */
function convertedJoin(): ShowRecordV2 {
  const source = fixture()
  source.composition.clips = [clip('outgoing', 'base', 0, 500), clip('selected', 'base', 600, 400)]
  source.composition.propertyTracks = []
  source.composition.transitions = [{
    id: 'incoming', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' }, crossfadePolicy: 'live-live', propertyRamps: [],
    origin: 'converted-boundary-transition',
    participants: [{ id: 'pair', zoneId: 'left', layerId: 'base', fromClipId: 'outgoing', toClipId: 'selected' }],
  }]
  expect(validateShowRecordV2(source)).toEqual([])
  return source
}

/**
 * A converted Layer junction at participant scope: structurally identical to
 * the boundary above, but Layer provenance means it detaches with no repair.
 */
function convertedLayerJoin(): ShowRecordV2 {
  const source = convertedJoin()
  source.composition.transitions = [{
    ...source.composition.transitions[0],
    origin: 'converted-layer-transition',
  }]
  expect(validateShowRecordV2(source)).toEqual([])
  return source
}

it('refuses to detach a participant Transition that carries Property ramps', () => {
  const source = gappedJoin()
  // Participant scope cannot carry global scalar ramps (those require whole-output
  // scope), so the carrier targets the joining Clip's own appearance instead.
  source.composition.transitions[0].propertyRamps = [{
    participantId: 'pair', target: { kind: 'clip-view', clipId: 'selected', property: 'brightness' },
    from: 0.2, easing: { curve: 'quadratic', direction: 'in' },
  }]
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over' })
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') return
  expect(result.code).toBe('unsupported-property-carrier')
  expect(result.message).toContain('incoming')
  expect(result.record).toBe(source)
  expect(result.record.composition.transitions).toHaveLength(1)
  expect(result.affectedTransitionIds).toEqual([])
  expect(source).toEqual(prior)
})

it('succeeds after detach when the destination is unavailable only across the detached pre-roll', () => {
  const source = gappedJoin()
  // Right is unrouted while the detached incoming contribution runs [400, 500)
  // but routed across the Clip's own [500, 900): the pre-roll leaves with the
  // Transition, so the destination validates.
  source.composition.layoutOccurrences = [
    { id: 'left-first', layoutId: 'left-only', startMs: 0, durationMs: 500, parameters: {} },
    { id: 'both-later', layoutId: 'both', startMs: 500, durationMs: 1_500, parameters: {} },
  ]
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', zoneId: 'right', layerId: 'right-base' })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  expect(reopen(result.record).composition.clips.find(candidate => candidate.id === 'selected'))
    .toMatchObject({ zoneId: 'right', layerId: 'right-base', startMs: 500 })
  expect(result.record.composition.transitions).toEqual([])
  expect(source).toEqual(prior)
})

it("still refuses when the destination is unavailable across the Clip's own interval", () => {
  const source = gappedJoin()
  // Right stays unrouted until 700, inside the Clip's own [500, 900): the
  // detach cannot repair that, so the destination still refuses.
  source.composition.layoutOccurrences = [
    { id: 'left-first', layoutId: 'left-only', startMs: 0, durationMs: 700, parameters: {} },
    { id: 'both-later', layoutId: 'both', startMs: 700, durationMs: 1_300, parameters: {} },
  ]
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', zoneId: 'right', layerId: 'right-base' })
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') return
  expect(result.code).toBe('zone-unavailable')
  expect(result.message).toContain('selected')
  expect(result.record).toBe(source)
  expect(result.record.composition.transitions).toHaveLength(1)
  expect(source).toEqual(prior)
})

it('still enforces destination occupancy after the detach', () => {
  const source = gappedJoin()
  source.composition.clips.push(clip('blocker', 'over', 600, 400))
  expect(validateShowRecordV2(source)).toEqual([])
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', layerId: 'over' })
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') return
  expect(result.code).toBe('invalid-result')
  expect(result.message).toContain('overlap')
  expect(result.record).toBe(source)
  expect(result.record.composition.transitions).toHaveLength(1)
  expect(source).toEqual(prior)
})

it.each([
  { label: 'an unknown Layer', intent: { layerId: 'absent' }, code: 'missing-target' },
  { label: 'a Layer of another Zone', intent: { zoneId: 'right', layerId: 'over' }, code: 'missing-target' },
  { label: 'an unknown Zone', intent: { zoneId: 'absent', layerId: 'over' }, code: 'missing-target' },
  { label: 'a blank Layer identity', intent: { layerId: '  ' }, code: 'invalid-intent' },
  { label: 'a fractional start', intent: { layerId: 'over', startMs: 10.5 }, code: 'invalid-intent' },
  { label: 'a start past Show End', intent: { layerId: 'over', startMs: 1_900 }, code: 'invalid-intent' },
  { label: 'no destination field', intent: {}, code: 'invalid-intent' },
  { label: 'an unknown field', intent: { layerId: 'over', endMs: 900 }, code: 'invalid-intent' },
])('refuses $label atomically', ({ intent, code }) => {
  const source = fixture()
  const prior = structuredClone(source)
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', ...intent } as never)
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') return
  expect(result.code).toBe(code)
  expect(result.record).toBe(source)
  expect(result.affectedClipIds).toEqual([])
  expect(result.removedIds).toEqual([])
  expect(source).toEqual(prior)
})

it('refuses an unknown Clip and returns the original record', () => {
  const source = fixture()
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'absent', layerId: 'over' })
  expect(result).toMatchObject({ status: 'refused', code: 'missing-clip', record: source })
})

it('returns unchanged for an already-satisfied destination without touching the record', () => {
  const source = fixture()
  const result = editShowClipTemporalV2(source, { kind: 'replace-placement', clipId: 'selected', zoneId: 'left', layerId: 'base', startMs: 400 })
  expect(result.status).toBe('unchanged')
  expect(result.record).toBe(source)
  expect(result.affectedClipIds).toEqual([])
})

it('reaches the same result through editShowClipV2', () => {
  const viaOwner = editShowClipTemporalV2(fixture(), { kind: 'replace-placement', clipId: 'selected', layerId: 'over', startMs: 1_000 })
  const viaClipEdit = editShowClipV2(fixture(), { kind: 'replace-placement', clipId: 'selected', layerId: 'over', startMs: 1_000 })
  expect(viaOwner.status).toBe('changed')
  expect(viaClipEdit.status).toBe('changed')
  if (viaOwner.status !== 'changed' || viaClipEdit.status !== 'changed') return
  expect(viaClipEdit.record.composition).toEqual(viaOwner.record.composition)
  expect(viaClipEdit.affectedClipIds).toEqual(viaOwner.affectedClipIds)
  expect(viaClipEdit.affectedTrackIds).toEqual(viaOwner.affectedTrackIds)
})
