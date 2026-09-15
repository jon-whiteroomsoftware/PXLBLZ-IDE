import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { LIBRARIES } from '../pixelblaze/libs'
import type { ShowClipEditIntentV2 } from './showClipsV2'
import { describe, expect, it } from 'vitest'
import { editShowClipV2 } from './showClipsV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'

function fixture(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Fixture conversion failed')
  const record = converted.record
  record.composition.showEndMs = 2000
  record.composition.layoutOccurrences[0].durationMs = 2000
  const clip = record.composition.clips[0]
  clip.startMs = 100
  clip.appearance.keys = [
    { id: 'bright', timeMs: 100, value: { effects: [], opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } } },
    { id: 'dim', timeMs: 600, value: { effects: [], opacity: 0.25, view: { mirror: false, phase: 0, brightness: 1 } } },
  ]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function reopen(record: ShowRecordV2) {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error('Edited record did not reopen')
  expect(opened.record).toEqual(record)
  return opened.record
}

describe('v2 held appearance edits', () => {
  it('moves the Clip and held changes together without changing sharing or the preimage', () => {
    const source = fixture()
    const before = structuredClone(source)
    const result = editShowClipV2(source, { kind: 'move', clipId: 'clip', startMs: 300 })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.clips[0]).toMatchObject({ id: 'clip', instanceId: 'instance', startMs: 300, durationMs: 1000 })
    expect(next.composition.clips[0].appearance.keys.map(key => key.timeMs)).toEqual([300, 800])
    expect(next.composition.patternInstances).toEqual(source.composition.patternInstances)
    expect(next.updatedAt).toBe(source.updatedAt)
    expect(result.affectedClipIds).toEqual(['clip'])
    expect(source).toEqual(before)
    result.record.composition.clips[0].appearance.keys[0].value.opacity = 0
    expect(source).toEqual(before)
  })
})

it.each([
  { startMs: 400, endMs: 900, times: [400, 600], values: [1, 0.25] },
  { startMs: 600, endMs: 900, times: [600], values: [0.25] },
  { startMs: 650, endMs: 900, times: [650], values: [0.25] },
  { startMs: 100, endMs: 600, times: [100], values: [1] },
])('trims [$startMs,$endMs) with the held boundary value and no excluded changes', ({ startMs, endMs, times, values }) => {
  const source = fixture()
  const before = structuredClone(source)
  const result = editShowClipV2(source, { kind: 'trim', clipId: 'clip', startMs, endMs })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const clip = reopen(result.record).composition.clips[0]
  expect(clip.startMs).toBe(startMs)
  expect(clip.durationMs).toBe(endMs - startMs)
  expect(clip.appearance.keys.map(key => key.timeMs)).toEqual(times)
  expect(clip.appearance.keys.map(key => key.value.opacity)).toEqual(values)
  expect(source).toEqual(before)
})

it('trim then extend holds the retained value after reopening instead of resurrecting removed changes', () => {
  const source = fixture()
  const trimmed = editShowClipV2(source, { kind: 'trim', clipId: 'clip', startMs: 650, endMs: 900 })
  if (trimmed.status !== 'changed') throw new Error('Trim failed')
  const saved = reopen(trimmed.record)
  const extended = editShowClipV2(saved, { kind: 'extend', clipId: 'clip', startMs: 100, endMs: 1100 })
  expect(extended.status).toBe('changed')
  if (extended.status !== 'changed') return
  const clip = reopen(extended.record).composition.clips[0]
  expect(clip.appearance.keys).toEqual([{ id: 'dim', timeMs: 100, value: source.composition.clips[0].appearance.keys[1].value }])
  expect(extended.record.composition.patternInstances).toEqual(source.composition.patternInstances)
  expect(saved.composition.clips[0].startMs).toBe(650)
  // The retained preimage is sufficient for the existing snapshot-based Undo owner.
  expect(source.composition.clips[0].appearance.keys.map(key => key.value.opacity)).toEqual([1, 0.25])
})

it.each([500, 600, 700])('splits at %s without changing appearance or instance ownership', atMs => {
  const source = fixture()
  const result = editShowClipV2(source, { kind: 'split', clipId: 'clip', atMs, rightClipId: 'right' })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const next = reopen(result.record)
  expect(next.composition.clips.map(clip => [clip.id, clip.instanceId, clip.startMs, clip.durationMs])).toEqual([
    ['clip', 'instance', 100, atMs - 100], ['right', 'instance', atMs, 1100 - atMs],
  ])
  expect(next.composition.patternInstances).toEqual(source.composition.patternInstances)
  expect(next.composition.clips[1].appearance.keys[0].value.opacity).toBe(atMs < 600 ? 1 : 0.25)
  expect(result.affectedClipIds).toEqual(['clip', 'right'])
  const moved = editShowClipV2(next, { kind: 'move', clipId: 'right', startMs: 1200 })
  expect(moved.status).toBe('changed')
  expect(moved.record.composition.patternInstances).toEqual(source.composition.patternInstances)
  expect(source.composition.clips).toHaveLength(1)
})


const sourceCode = 'export var calls = 0; export var elapsed = 0; export function beforeRender(delta) { calls++; elapsed += delta } export function render2D(index, x, y) { rgb(1, 0, 0) }'
function compiledRuntime(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const prepared = prepareShowV2ForCompile(reopen(record), { byCellId: {}, byPatternInstanceId: { instance: sourceCode }, stageDimension: 2 })
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const runtime = createFastReplayRuntime({ code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns) }, {
    mapPoints: [{ sample: [0.25, 0.25], pos: [0.25, 0.25] }], randomSeed: 1038, fidelity,
  })
  return { runtime, prefix: artifact.summary.clips.find(clip => clip.id === 'instance')!.prefix }
}

it.each([
  { fidelity: 'fast', overlay: false }, { fidelity: 'fidelity', overlay: false },
  { fidelity: 'fast', overlay: true }, { fidelity: 'fidelity', overlay: true },
] as const)('split preserves $fidelity frames and private state (overlay: $overlay), including the next loop', ({ fidelity, overlay }) => {
  const source = fixture()
  if (overlay) source.composition.clips[0].layerId = source.composition.layers.find(layer => layer.rank > 0)!.id
  const split = editShowClipV2(source, { kind: 'split', clipId: 'clip', atMs: 700, rightClipId: 'right' })
  if (split.status !== 'changed') throw new Error('Split failed')
  const left = compiledRuntime(source, fidelity)
  const right = compiledRuntime(split.record, fidelity)
  for (const time of [99, 100, 599, 600, 699, 700, 701, 1099, 1100, 1999, 2000, 2100, 2700]) {
    const a = left.runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true })
    const b = right.runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true })
    expect(Array.from(b.frame), `frame at ${time}`).toEqual(Array.from(a.frame))
    for (const state of ['calls', 'elapsed']) expect(b.exports[`${right.prefix}_${state}`], `${state} at ${time}`).toEqual(a.exports[`${left.prefix}_${state}`])
  }
})

it.each(['fast', 'fidelity'] as const)('trim then extend emits only retained dim appearance in %s', fidelity => {
  const trimmed = editShowClipV2(fixture(), { kind: 'trim', clipId: 'clip', startMs: 650, endMs: 900 })
  const extended = editShowClipV2(reopen(trimmed.record), { kind: 'extend', clipId: 'clip', startMs: 100, endMs: 1100 })
  expect(extended.status).toBe('changed')
  const { runtime } = compiledRuntime(extended.record, fidelity)
  const reference = fixture()
  reference.composition.clips[0].appearance.keys = [{ ...reference.composition.clips[0].appearance.keys[0], value: { effects: [], opacity: 0.25, view: { mirror: false, phase: 0, brightness: 1 } } }]
  const expected = compiledRuntime(reference, fidelity).runtime
  for (const time of [100, 300, 599, 600, 650, 900, 1099]) {
    const frame = runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true }).frame
    const referenceFrame = expected.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true }).frame
    expect(Array.from(frame), `reference at ${time}`).toEqual(Array.from(referenceFrame))
    // Precise timestep accumulation may cross the end early; compare that
    // boundary to the independently authored reference as well as interior RGB.
    if (time < 1099) expect(Array.from(frame), `interior at ${time}`).toEqual([0.25, 0, 0])
  }
})

it.each([
  { kind: 'move', clipId: 'clip', startMs: -1 },
  { kind: 'move', clipId: 'clip', startMs: 0.5 },
  { kind: 'move', clipId: 'clip', startMs: Number.NaN },
  { kind: 'move', clipId: 'clip', startMs: Number.MAX_SAFE_INTEGER },
  { kind: 'move', clipId: 'missing', startMs: 300 },
  { kind: 'trim', clipId: 'clip', startMs: 0, endMs: 900 },
  { kind: 'trim', clipId: 'clip', startMs: 600, endMs: 600 },
  { kind: 'extend', clipId: 'clip', startMs: 300, endMs: 1100 },
  { kind: 'split', clipId: 'clip', atMs: 100, rightClipId: 'right' },
  { kind: 'split', clipId: 'clip', atMs: 1100, rightClipId: 'right' },
  { kind: 'split', clipId: 'clip', atMs: 700, rightClipId: 'clip' },
] satisfies ShowClipEditIntentV2[])('refuses invalid intent atomically: %j', intent => {
  const source = fixture()
  const before = structuredClone(source)
  const result = editShowClipV2(source, intent)
  expect(result.status).toBe('refused')
  expect(result.record).toBe(source)
  expect(result.affectedClipIds).toEqual([])
  expect(result.affectedTrackIds).toEqual([])
  expect(source).toEqual(before)
})

it('returns the original record for no-op and rejects a move into another Clip', () => {
  const source = fixture()
  const noOp = editShowClipV2(source, { kind: 'move', clipId: 'clip', startMs: 100 })
  expect(noOp.status).toBe('unchanged')
  expect(noOp.record).toBe(source)
  source.composition.clips.push({ ...structuredClone(source.composition.clips[0]), id: 'neighbor', startMs: 1500, durationMs: 500, appearance: { keys: [{ ...structuredClone(source.composition.clips[0].appearance.keys[0]), timeMs: 1500 }] } })
  const before = structuredClone(source)
  const collision = editShowClipV2(source, { kind: 'move', clipId: 'clip', startMs: 800 })
  expect(collision).toMatchObject({ status: 'refused', code: 'invalid-result' })
  expect(collision.record).toBe(source)
  expect(source).toEqual(before)
})

it.each([false, true])('moves animation according to ownership (shared instance: %s)', shared => {
  const source = fixture()
  const composition = source.composition
  if (shared) {
    composition.layers.push({ ...composition.layers[0], id: 'other-layer', rank: 2 })
    composition.clips.push({ ...structuredClone(composition.clips[0]), id: 'other', layerId: 'other-layer' })
  }
  const track = { activeStartMs: 100, activeDurationMs: 1000, keyframes: [
    { id: 'a', timeMs: 100, value: 1, easing: { curve: 'linear' as const } },
    { id: 'b', timeMs: 1100, value: 0.5, easing: { curve: 'sine' as const, direction: 'in-out' as const } },
  ] }
  composition.propertyTracks = [
    { ...structuredClone(track), id: 'appearance', target: { kind: 'clip-opacity', clipId: 'clip' } },
    { ...structuredClone(track), id: 'clock', target: { kind: 'instance-time-scale', instanceId: 'instance' } },
    { ...structuredClone(track), id: 'show', target: { kind: 'show-repeat-scale' } },
  ]
  const before = structuredClone(source)
  const result = editShowClipV2(source, { kind: 'move', clipId: 'clip', startMs: 300 })
  expect(result.status).toBe('changed')
  const next = reopen(result.record)
  expect(next.composition.propertyTracks.map(item => item.activeStartMs)).toEqual([300, shared ? 100 : 300, 100])
  expect(next.composition.propertyTracks.map(item => item.keyframes.map(key => key.timeMs))).toEqual([[300, 1300], shared ? [100, 1100] : [300, 1300], [100, 1100]])
  expect(result.affectedTrackIds).toEqual(shared ? ['appearance'] : ['appearance', 'clock'])
  expect(source).toEqual(before)
  const trimmed = editShowClipV2(source, { kind: 'trim', clipId: 'clip', startMs: 300, endMs: 900 })
  expect(trimmed).toMatchObject({ status: 'refused', code: 'unsupported-animation' })
  expect(trimmed.record).toBe(source)
})

it('refuses a Clip whose Zone is absent from the active Layout', () => {
  const source = fixture()
  source.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 16 })
  source.zoneLayouts[0].logical = { kind: 'single', zoneIds: ['other'] }
  expect(validateShowRecordV2(source)).toEqual([])
  const result = editShowClipV2(source, { kind: 'move', clipId: 'clip', startMs: 300 })
  expect(result).toMatchObject({ status: 'refused', code: 'unsupported-topology' })
  expect(result.record).toBe(source)
})


it('refuses pending Restart semantics and invalid preimages without changing state', () => {
  const source = fixture()
  source.composition.clips[0].entryPolicy = 'restart'
  const result = editShowClipV2(source, { kind: 'split', clipId: 'clip', atMs: 700, rightClipId: 'right' })
  expect(result).toMatchObject({ status: 'refused', code: 'unsupported-topology' })
  expect(result.record).toBe(source)
  source.composition.clips[0].durationMs = 0
  expect(editShowClipV2(source, { kind: 'move', clipId: 'clip', startMs: 300 })).toMatchObject({ status: 'refused', code: 'invalid-record' })
})
