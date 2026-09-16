import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { LIBRARIES } from '../pixelblaze/libs'
import type { ShowClipEditIntentV2 } from './showClipsV2'
import { describe, expect, it } from 'vitest'
import { editShowClipV2 } from './showClipsV2'
import { effectiveShowInstanceUseCountV2 } from './showGroupsV2'
import { deriveShowRestartEventsV2, evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
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
  expect(trimmed.status).toBe('changed')
  if (trimmed.status !== 'changed') return
  const trimmedTrack = trimmed.record.composition.propertyTracks.find(item => item.id === 'appearance')!
  expect(trimmedTrack).toMatchObject({ activeStartMs: 300, activeDurationMs: 600 })
  expect(evaluateShowPropertyTrackV2(trimmedTrack, 300)).toBeCloseTo(0.9)
  expect(evaluateShowPropertyTrackV2(trimmedTrack, 899)).toBeCloseTo(evaluateShowPropertyTrackV2(composition.propertyTracks[0], 899)!)
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


it('keeps Restart with the left split owner and derives the edited reset event', () => {
  const source = fixture()
  source.composition.clips[0].entryPolicy = 'restart'
  const result = editShowClipV2(source, { kind: 'split', clipId: 'clip', atMs: 700, rightClipId: 'right' })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.record.composition.clips.map(clip => [clip.id, clip.entryPolicy])).toEqual([
    ['clip', 'restart'], ['right', 'continue'],
  ])
  expect(deriveShowRestartEventsV2(result.record)).toMatchObject({
    status: 'derived', events: [{ instanceId: 'instance', atMs: 100, clipIds: ['clip'] }],
  })

  const moved = editShowClipV2(source, { kind: 'move', clipId: 'clip', startMs: 300 })
  expect(moved.status).toBe('changed')
  if (moved.status !== 'changed') return
  expect(deriveShowRestartEventsV2(moved.record)).toMatchObject({
    status: 'derived', events: [{ instanceId: 'instance', atMs: 300, clipIds: ['clip'] }],
  })
})

it('refuses invalid preimages without changing state', () => {
  const source = fixture()
  source.composition.clips[0].durationMs = 0
  const before = structuredClone(source)
  const result = editShowClipV2(source, { kind: 'move', clipId: 'clip', startMs: 300 })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-record' })
  expect(result.record).toBe(source)
  expect(source).toEqual(before)
})

describe('v2 ordinary linked Clip duplication', () => {
  it('duplicates at exact adjacency with fresh authored identities while preserving the shared runtime', () => {
    const source = fixture()
    source.composition.showEndMs = 2_200
    source.composition.layoutOccurrences[0].durationMs = 2_200
    source.composition.clips[0].entryPolicy = 'restart'
    source.composition.propertyTracks = [
      {
        id: 'opacity', target: { kind: 'clip-opacity', clipId: 'clip' },
        activeStartMs: 100, activeDurationMs: 1_000,
        keyframes: [
          { id: 'opacity:start', timeMs: 100, value: 1, easing: { curve: 'sine', direction: 'in-out' } },
          { id: 'opacity:end', timeMs: 1_100, value: 0.2, easing: { curve: 'linear' } },
        ],
      },
      {
        id: 'clock', target: { kind: 'instance-time-scale', instanceId: 'instance' },
        activeStartMs: 100, activeDurationMs: 2_000,
        keyframes: [
          { id: 'clock:start', timeMs: 100, value: 1, easing: { curve: 'linear' } },
          { id: 'clock:end', timeMs: 2_100, value: 1, easing: { curve: 'linear' } },
        ],
      },
    ]
    expect(validateShowRecordV2(source)).toEqual([])
    const before = structuredClone(source)
    const result = editShowClipV2(source, {
      kind: 'duplicate', clipId: 'clip', startMs: 1_100,
      zoneId: source.composition.clips[0].zoneId,
      layerId: source.composition.clips[0].layerId,
      identities: {
        clipId: 'copy',
        appearanceKeyIdsBySourceId: { bright: 'copy:bright', dim: 'copy:dim' },
        clipTrackIdentitiesBySourceTrackId: {
          opacity: {
            trackId: 'copy:opacity',
            keyframeIdsBySourceId: {
              'opacity:start': 'copy:opacity:start',
              'opacity:end': 'copy:opacity:end',
            },
          },
        },
      },
    })

    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const reopened = reopen(result.record)
    expect(reopened.composition.clips.map(clip => [clip.id, clip.instanceId, clip.startMs, clip.durationMs, clip.entryPolicy])).toEqual([
      ['clip', 'instance', 100, 1_000, 'restart'],
      ['copy', 'instance', 1_100, 1_000, 'restart'],
    ])
    expect(reopened.composition.clips[1].appearance.keys.map(key => [key.id, key.timeMs, key.value.opacity])).toEqual([
      ['copy:bright', 1_100, 1], ['copy:dim', 1_600, 0.25],
    ])
    expect(reopened.composition.patternInstances).toEqual(source.composition.patternInstances)
    expect(reopened.composition.propertyTracks.map(track => [track.id, track.target, track.activeStartMs, track.keyframes.map(key => [key.id, key.timeMs])])).toEqual([
      ['opacity', { kind: 'clip-opacity', clipId: 'clip' }, 100, [['opacity:start', 100], ['opacity:end', 1_100]]],
      ['clock', { kind: 'instance-time-scale', instanceId: 'instance' }, 100, [['clock:start', 100], ['clock:end', 2_100]]],
      ['copy:opacity', { kind: 'clip-opacity', clipId: 'copy' }, 1_100, [['copy:opacity:start', 1_100], ['copy:opacity:end', 2_100]]],
    ])
    expect(result.affectedClipIds).toEqual(['copy'])
    expect(result.affectedTrackIds).toEqual(['copy:opacity'])
    expect(deriveShowRestartEventsV2(reopened)).toMatchObject({
      status: 'derived',
      events: [
        { instanceId: 'instance', atMs: 100, clipIds: ['clip'] },
        { instanceId: 'instance', atMs: 1_100, clipIds: ['copy'] },
      ],
    })
    expect(source).toEqual(before)
    result.record.composition.clips[1].appearance.keys[0].value.opacity = 0
    expect(source).toEqual(before)
  })

  it('retargets every Clip-owned Property form and preserves Effect identity inside copied appearance', () => {
    const source = fixture()
    source.composition.showEndMs = 2_200
    source.composition.layoutOccurrences[0].durationMs = 2_200
    for (const key of source.composition.clips[0].appearance.keys) {
      key.value.transform = { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
      key.value.aperture = { enabled: true, x: 0, y: 0, width: 1, height: 1 }
      key.value.effects = [{ id: 'fade', kind: 'opacity', opacity: 1 }]
    }
    const targets = [
      { kind: 'clip-opacity', clipId: 'clip' },
      { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
      { kind: 'clip-transform', clipId: 'clip', property: 'positionX' },
      { kind: 'clip-aperture', clipId: 'clip', property: 'width' },
      { kind: 'clip-effect', clipId: 'clip', effectId: 'fade', effectKind: 'opacity', parameterId: 'opacity' },
    ] as const
    source.composition.propertyTracks = targets.map((target, index) => ({
      id: `track:${index}`, target, activeStartMs: 100, activeDurationMs: 1_000,
      keyframes: [
        { id: `track:${index}:start`, timeMs: 100, value: 0.2, easing: { curve: 'linear' as const } },
        { id: `track:${index}:end`, timeMs: 1_100, value: 0.8, easing: { curve: 'linear' as const } },
      ],
    }))
    expect(validateShowRecordV2(source)).toEqual([])

    const result = editShowClipV2(source, linkedDuplicateIntent(source))
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const copy = reopen(result.record).composition.clips.find(clip => clip.id === 'copy')!
    expect(copy.appearance.keys.every(key => key.value.effects?.[0]?.id === 'fade')).toBe(true)
    expect(result.affectedTrackIds).toEqual(targets.map((_target, index) => `copy:track:${index}`))
    expect(result.record.composition.propertyTracks.slice(-targets.length).map(track => track.target)).toEqual(
      targets.map(target => ({ ...target, clipId: 'copy' })),
    )
  })
})

function linkedDuplicateIntent(source: ShowRecordV2, startMs = 1_100): Extract<ShowClipEditIntentV2, { kind: 'duplicate' }> {
  const clip = source.composition.clips.find(candidate => candidate.id === 'clip')!
  const tracks = source.composition.propertyTracks.filter(track => 'clipId' in track.target && track.target.clipId === clip.id)
  return {
    kind: 'duplicate', clipId: clip.id, startMs, zoneId: clip.zoneId, layerId: clip.layerId,
    identities: {
      clipId: 'copy',
      appearanceKeyIdsBySourceId: Object.fromEntries(clip.appearance.keys.map(key => [key.id, `copy:${key.id}`])),
      clipTrackIdentitiesBySourceTrackId: Object.fromEntries(tracks.map(track => [track.id, {
        trackId: `copy:${track.id}`,
        keyframeIdsBySourceId: Object.fromEntries(track.keyframes.map(key => [key.id, `copy:${key.id}`])),
      }])),
    },
  }
}

describe('v2 linked duplicate identity admission', () => {
  it.each([
    ['reused appearance key', (intent: ReturnType<typeof linkedDuplicateIntent>) => { intent.identities.appearanceKeyIdsBySourceId = { bright: 'bright', dim: 'copy:dim' } }],
    ['reused Property key', (intent: ReturnType<typeof linkedDuplicateIntent>) => { intent.identities.clipTrackIdentitiesBySourceTrackId.opacity.keyframeIdsBySourceId = { 'opacity:start': 'clock:start', 'opacity:end': 'copy:opacity:end' } }],
  ] as const)('refuses a %s identity even when its schema scope would allow it', (_name, mutate) => {
    const source = fixture()
    source.composition.showEndMs = 2_200
    source.composition.layoutOccurrences[0].durationMs = 2_200
    source.composition.propertyTracks = [
      {
        id: 'opacity', target: { kind: 'clip-opacity', clipId: 'clip' }, activeStartMs: 100, activeDurationMs: 1_000,
        keyframes: [
          { id: 'opacity:start', timeMs: 100, value: 1, easing: { curve: 'linear' } },
          { id: 'opacity:end', timeMs: 1_100, value: 0, easing: { curve: 'linear' } },
        ],
      },
      {
        id: 'clock', target: { kind: 'instance-time-scale', instanceId: 'instance' }, activeStartMs: 100, activeDurationMs: 2_000,
        keyframes: [
          { id: 'clock:start', timeMs: 100, value: 1, easing: { curve: 'linear' } },
          { id: 'clock:end', timeMs: 2_100, value: 1, easing: { curve: 'linear' } },
        ],
      },
    ]
    const intent = linkedDuplicateIntent(source)
    mutate(intent)
    const before = structuredClone(source)
    const result = editShowClipV2(source, intent)
    expect(result).toMatchObject({ status: 'refused', code: 'invalid-intent', affectedClipIds: [], affectedTrackIds: [] })
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })

  it.each([
    ['blank Clip ID', (intent: ReturnType<typeof linkedDuplicateIntent>) => { intent.identities.clipId = ' ' }],
    ['owned Clip ID', (intent: ReturnType<typeof linkedDuplicateIntent>) => { intent.identities.clipId = 'clip' }],
    ['missing appearance identity', (intent: ReturnType<typeof linkedDuplicateIntent>) => { delete (intent.identities.appearanceKeyIdsBySourceId as Record<string, string>).dim }],
    ['extraneous appearance identity', (intent: ReturnType<typeof linkedDuplicateIntent>) => { (intent.identities.appearanceKeyIdsBySourceId as Record<string, string>).extra = 'copy:extra' }],
    ['duplicate appearance identity', (intent: ReturnType<typeof linkedDuplicateIntent>) => { (intent.identities.appearanceKeyIdsBySourceId as Record<string, string>).dim = 'copy:bright' }],
    ['missing track identity', (intent: ReturnType<typeof linkedDuplicateIntent>) => { delete (intent.identities.clipTrackIdentitiesBySourceTrackId as Record<string, unknown>).opacity }],
    ['extraneous track identity', (intent: ReturnType<typeof linkedDuplicateIntent>) => { (intent.identities.clipTrackIdentitiesBySourceTrackId as Record<string, unknown>).extra = { trackId: 'copy:extra', keyframeIdsBySourceId: {} } }],
    ['blank copied track ID', (intent: ReturnType<typeof linkedDuplicateIntent>) => { intent.identities.clipTrackIdentitiesBySourceTrackId.opacity.trackId = '' }],
    ['owned copied track ID', (intent: ReturnType<typeof linkedDuplicateIntent>) => { intent.identities.clipTrackIdentitiesBySourceTrackId.opacity.trackId = 'opacity' }],
    ['missing key identity', (intent: ReturnType<typeof linkedDuplicateIntent>) => { delete (intent.identities.clipTrackIdentitiesBySourceTrackId.opacity.keyframeIdsBySourceId as Record<string, string>)['opacity:end'] }],
    ['extraneous key identity', (intent: ReturnType<typeof linkedDuplicateIntent>) => { (intent.identities.clipTrackIdentitiesBySourceTrackId.opacity.keyframeIdsBySourceId as Record<string, string>).extra = 'copy:key:extra' }],
    ['duplicate copied key identity', (intent: ReturnType<typeof linkedDuplicateIntent>) => { (intent.identities.clipTrackIdentitiesBySourceTrackId.opacity.keyframeIdsBySourceId as Record<string, string>)['opacity:end'] = 'copy:opacity:start' }],
  ] as const)('refuses an exact-plan violation: %s', (_name, mutate) => {
    const source = fixture()
    source.composition.showEndMs = 2_200
    source.composition.layoutOccurrences[0].durationMs = 2_200
    source.composition.propertyTracks = [{
      id: 'opacity', target: { kind: 'clip-opacity', clipId: 'clip' }, activeStartMs: 100, activeDurationMs: 1_000,
      keyframes: [
        { id: 'opacity:start', timeMs: 100, value: 1, easing: { curve: 'linear' } },
        { id: 'opacity:end', timeMs: 1_100, value: 0, easing: { curve: 'linear' } },
      ],
    }]
    const intent = linkedDuplicateIntent(source)
    mutate(intent)
    const before = structuredClone(source)
    const result = editShowClipV2(source, intent)
    expect(result).toMatchObject({ status: 'refused', code: 'invalid-intent', affectedClipIds: [], affectedTrackIds: [] })
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })

  it.each([
    ['missing identity plan', (intent: ReturnType<typeof linkedDuplicateIntent>) => { (intent as unknown as { identities?: unknown }).identities = undefined }],
    ['null appearance map', (intent: ReturnType<typeof linkedDuplicateIntent>) => { (intent.identities as unknown as { appearanceKeyIdsBySourceId: unknown }).appearanceKeyIdsBySourceId = null }],
    ['non-string appearance identity', (intent: ReturnType<typeof linkedDuplicateIntent>) => { (intent.identities.appearanceKeyIdsBySourceId as unknown as Record<string, unknown>).bright = 42 }],
    ['null track identity', (intent: ReturnType<typeof linkedDuplicateIntent>) => { (intent.identities.clipTrackIdentitiesBySourceTrackId as unknown as Record<string, unknown>).opacity = null }],
    ['missing track key map', (intent: ReturnType<typeof linkedDuplicateIntent>) => { (intent.identities.clipTrackIdentitiesBySourceTrackId.opacity as unknown as { keyframeIdsBySourceId?: unknown }).keyframeIdsBySourceId = undefined }],
  ] as const)('refuses a malformed runtime identity plan: %s', (_name, mutate) => {
    const source = fixture()
    source.composition.showEndMs = 2_200
    source.composition.layoutOccurrences[0].durationMs = 2_200
    source.composition.propertyTracks = [{
      id: 'opacity', target: { kind: 'clip-opacity', clipId: 'clip' }, activeStartMs: 100, activeDurationMs: 1_000,
      keyframes: [
        { id: 'opacity:start', timeMs: 100, value: 1, easing: { curve: 'linear' } },
        { id: 'opacity:end', timeMs: 1_100, value: 0, easing: { curve: 'linear' } },
      ],
    }]
    const intent = linkedDuplicateIntent(source)
    mutate(intent)
    const before = structuredClone(source)
    const result = editShowClipV2(source, intent)
    expect(result).toMatchObject({ status: 'refused', code: 'invalid-intent', affectedClipIds: [], affectedTrackIds: [] })
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })

  it.each([-1, 100.5, 1_201, Number.MAX_SAFE_INTEGER])('refuses invalid duplicate start %s atomically', startMs => {
    const source = fixture()
    const before = structuredClone(source)
    const result = editShowClipV2(source, linkedDuplicateIntent(source, startMs))
    expect(result).toMatchObject({ status: 'refused', affectedClipIds: [], affectedTrackIds: [] })
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })

  it.each([
    ['missing Layer', (intent: ReturnType<typeof linkedDuplicateIntent>) => { intent.layerId = 'missing' }],
    ['foreign-Zone Layer', (intent: ReturnType<typeof linkedDuplicateIntent>, source: ShowRecordV2) => {
      source.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 16 })
      source.composition.layers.push({ id: 'other-layer', zoneId: 'other', name: 'Other', rank: 0 })
      intent.layerId = 'other-layer'
    }],
    ['missing Zone', (intent: ReturnType<typeof linkedDuplicateIntent>) => { intent.zoneId = 'missing' }],
  ] as const)('refuses an invalid destination: %s', (_name, mutate) => {
    const source = fixture()
    source.composition.showEndMs = 2_200
    source.composition.layoutOccurrences[0].durationMs = 2_200
    const intent = linkedDuplicateIntent(source)
    mutate(intent, source)
    const before = structuredClone(source)
    const result = editShowClipV2(source, intent)
    expect(result).toMatchObject({ status: 'refused', code: 'invalid-result', affectedClipIds: [], affectedTrackIds: [] })
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })
})

function addBoundGroupUse(source: ShowRecordV2, startMs: number) {
  const base = source.composition.clips.find(clip => clip.id === 'clip')!
  const { zoneId: _zoneId, ...groupBase } = base
  source.composition.groupDefinitions = [{
    id: 'group', name: 'Linked group',
    patternInstances: [{ ...structuredClone(source.composition.patternInstances[0]), id: 'slot' }],
    layers: [{ id: 'group-layer', name: 'Group Layer', rank: 0 }],
    clips: [{
      ...structuredClone(groupBase), id: 'group-child', instanceId: 'slot', layerId: 'group-layer',
      startMs: 0, durationMs: 100,
      appearance: { keys: [{ ...structuredClone(base.appearance.keys[0]), id: 'group:key', timeMs: 0 }] },
    }],
    transitions: [], propertyTracks: [],
  }]
  source.composition.groupOccurrences = [{
    id: 'group-use', definitionId: 'group', layoutOccurrenceId: source.composition.layoutOccurrences[0].id,
    zoneId: base.zoneId, startMs, translationX: 0, translationY: 0,
    instanceBindings: { slot: 'instance' }, holds: [],
    layerBindings: [{ definitionLayerId: 'group-layer', layerId: base.layerId }],
  }]
}

describe('v2 linked duplicate topology and consumer proof', () => {
  it('accepts exact materialized-Group adjacency, counts the effective sharer, and refuses one-millisecond overlap', () => {
    const source = fixture()
    source.composition.showEndMs = 2_400
    source.composition.layoutOccurrences[0].durationMs = 2_400
    addBoundGroupUse(source, 2_100)
    expect(validateShowRecordV2(source)).toEqual([])
    expect(effectiveShowInstanceUseCountV2(source, 'instance')).toBe(2)

    const result = editShowClipV2(source, linkedDuplicateIntent(source))
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const reopened = reopen(result.record)
    expect(effectiveShowInstanceUseCountV2(reopened, 'instance')).toBe(3)
    expect(reopened.composition.patternInstances).toEqual(source.composition.patternInstances)
    expect(reopened.composition.groupDefinitions).toEqual(source.composition.groupDefinitions)
    expect(reopened.composition.groupOccurrences).toEqual(source.composition.groupOccurrences)

    const overlap = structuredClone(source)
    overlap.composition.groupOccurrences[0].startMs = 2_099
    expect(validateShowRecordV2(overlap)).toEqual([])
    const before = structuredClone(overlap)
    const refused = editShowClipV2(overlap, linkedDuplicateIntent(overlap))
    expect(refused).toMatchObject({ status: 'refused', code: 'invalid-result' })
    expect(refused.record).toBe(overlap)
    expect(overlap).toEqual(before)
  })

  it('preserves an attached source Transition instead of applying the foundation topology refusal or duplicating it', () => {
    const source = fixture()
    const clip = source.composition.clips[0]
    clip.startMs = 200
    clip.durationMs = 400
    clip.appearance.keys = [{ ...structuredClone(clip.appearance.keys[0]), timeMs: 200 }]
    source.composition.showEndMs = 1_200
    source.composition.layoutOccurrences[0].durationMs = 1_200
    source.composition.clips.unshift({
      ...structuredClone(clip), id: 'out', startMs: 0, durationMs: 100,
      appearance: { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: 'out:key', timeMs: 0 }] },
    })
    source.composition.transitions = [{
      id: 'attached', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' },
      crossfadePolicy: 'live-live', propertyRamps: [],
      participants: [{
        id: 'attached:participant', zoneId: clip.zoneId, layerId: clip.layerId,
        fromClipId: 'out', toClipId: 'clip',
      }],
    }]
    expect(validateShowRecordV2(source)).toEqual([])
    const transitionBefore = structuredClone(source.composition.transitions)
    const intent = linkedDuplicateIntent(source, 600)
    intent.identities.appearanceKeyIdsBySourceId = { bright: 'copy:bright' }
    const result = editShowClipV2(source, intent)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.transitions).toEqual(transitionBefore)
    expect(result.record.composition.clips.find(candidate => candidate.id === 'copy')).toMatchObject({ startMs: 600, durationMs: 400 })
  })

  it('accepts a routed destination across Layout occurrences and refuses an unavailable destination Zone', () => {
    const source = fixture()
    const clip = source.composition.clips[0]
    clip.durationMs = 400
    clip.appearance.keys = [{ ...structuredClone(clip.appearance.keys[0]), timeMs: 100 }]
    source.composition.showEndMs = 2_000
    source.composition.layoutOccurrences = [
      { ...structuredClone(source.composition.layoutOccurrences[0]), id: 'layout:first', startMs: 0, durationMs: 1_000 },
      { ...structuredClone(source.composition.layoutOccurrences[0]), id: 'layout:second', startMs: 1_000, durationMs: 1_000 },
    ]
    expect(validateShowRecordV2(source)).toEqual([])
    const intent = linkedDuplicateIntent(source, 1_200)
    intent.identities.appearanceKeyIdsBySourceId = { bright: 'copy:bright' }
    expect(editShowClipV2(source, intent).status).toBe('changed')

    const unavailable = structuredClone(source)
    unavailable.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 16 })
    unavailable.zoneLayouts.push({
      ...structuredClone(unavailable.zoneLayouts[0]), id: 'other-layout', name: 'Other Layout',
      logical: { kind: 'single', zoneIds: ['other'] },
    })
    unavailable.composition.layoutOccurrences[1].layoutId = 'other-layout'
    expect(validateShowRecordV2(unavailable)).toEqual([])
    const before = structuredClone(unavailable)
    const refused = editShowClipV2(unavailable, intent)
    expect(refused).toMatchObject({ status: 'refused', code: 'invalid-result', message: expect.stringContaining('unavailable') })
    expect(refused.record).toBe(unavailable)
    expect(unavailable).toEqual(before)
  })

  it.each(['fast', 'fidelity'] as const)('reopens and emits the copied nonlinear track on one shared Restart runtime in %s', fidelity => {
    const source = fixture()
    const clip = source.composition.clips[0]
    clip.entryPolicy = 'restart'
    clip.appearance.keys = [{ ...structuredClone(clip.appearance.keys[0]), id: 'steady', timeMs: 100 }]
    source.composition.showEndMs = 2_200
    source.composition.layoutOccurrences[0].durationMs = 2_200
    source.composition.propertyTracks = [{
      id: 'opacity', target: { kind: 'clip-opacity', clipId: 'clip' },
      activeStartMs: 100, activeDurationMs: 1_000,
      keyframes: [
        { id: 'opacity:start', timeMs: 100, value: 1, easing: { curve: 'sine', direction: 'in-out' } },
        { id: 'opacity:end', timeMs: 1_100, value: 0.2, easing: { curve: 'linear' } },
      ],
    }]
    const intent = linkedDuplicateIntent(source)
    intent.identities.appearanceKeyIdsBySourceId = { steady: 'copy:steady' }
    const result = editShowClipV2(source, intent)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const reopened = reopen(result.record)
    const copied = reopened.composition.propertyTracks.find(track => track.id === 'copy:opacity')!
    expect(evaluateShowPropertyTrackV2(copied, 1_600)).toBeCloseTo(evaluateShowPropertyTrackV2(source.composition.propertyTracks[0], 600)!)
    expect(deriveShowRestartEventsV2(reopened)).toMatchObject({
      status: 'derived', events: [
        { instanceId: 'instance', atMs: 100, clipIds: ['clip'] },
        { instanceId: 'instance', atMs: 1_100, clipIds: ['copy'] },
      ],
    })
    const { runtime, prefix } = compiledRuntime(reopened, fidelity)
    const sourceMiddle = runtime.advanceTo(600, { stepMs: 16, forceFullIntermediateRender: true })
    const beforeRestart = runtime.advanceTo(1_099, { stepMs: 16, forceFullIntermediateRender: true })
    const callsBeforeRestart = Number(beforeRestart.exports[`${prefix}_calls`])
    runtime.advanceTo(1_100, { stepMs: 16, forceFullIntermediateRender: true })
    const duplicateMiddle = runtime.advanceTo(1_600, { stepMs: 16, forceFullIntermediateRender: true })
    const callsInDuplicate = Number(duplicateMiddle.exports[`${prefix}_calls`])
    const sourceExpected = evaluateShowPropertyTrackV2(source.composition.propertyTracks[0], 600)!
    const duplicateExpected = evaluateShowPropertyTrackV2(copied, 1_600)!
    const outputTolerance = fidelity === 'fast' ? 1e-8 : 0.02
    expect(Math.abs(sourceMiddle.frame[0] - sourceExpected)).toBeLessThan(outputTolerance)
    expect(Math.abs(duplicateMiddle.frame[0] - duplicateExpected)).toBeLessThan(outputTolerance)
    expect(callsBeforeRestart).toBeGreaterThan(0)
    expect(callsInDuplicate).toBeLessThan(callsBeforeRestart)
    expect(Object.keys(duplicateMiddle.exports).filter(key => key.endsWith('_elapsed'))).toHaveLength(1)
  })
})
