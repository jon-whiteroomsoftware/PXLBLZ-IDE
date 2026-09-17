import { expect, it } from 'vitest'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2, type ShowPropertyTrackV2 } from './showCompositionV2'
import { editShowClipAppearanceV2, type ShowClipAppearanceEditIntentV2 } from './showClipAppearanceEditsV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'

const source = 'export var level=.2; export var elapsed=0; export function sliderLevel(v){level=v} export function beforeRender(delta){elapsed+=delta} export function render2D(index,x,y){rgb(level+x/4,elapsed/2000,y/2)}'
function fixture(): ShowRecordV2 {
  const legacy = convertibleV1Show()
  legacy.composition!.scenes[0].zones[0].overlays = []
  const conversion = convertShowRecordV1ToV2(legacy)
  if (conversion.status !== 'converted') throw new Error(JSON.stringify(conversion))
  const record = conversion.record
  record.composition.executionModel = 'continuous'
  record.composition.patternInstances[0].controlTargets = { sliderLevel: .2 }
  const clip = record.composition.clips[0], first = clip.appearance.keys[0]
  clip.entryPolicy = 'continue'
  clip.appearance.keys = [0, 400, 800].map((timeMs, index) => ({ ...structuredClone(first), id: `appearance-${index}`, timeMs,
    value: { ...structuredClone(first.value), opacity: 1 - index / 5, effects: [{ id: 'hue', kind: 'hue', turns: .1 }, { id: 'bright', kind: 'brightness', brightness: .8 }] } }))
  record.composition.propertyTracks = [{ id: 'level', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'level-first', timeMs: 0, value: .2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'level-last', timeMs: 1000, value: .6, easing: { curve: 'linear' } }] }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}
function hueTrack(id: string, activeStartMs: number, activeDurationMs: number): ShowPropertyTrackV2 {
  return { id, target: { kind: 'clip-effect', clipId: 'clip', effectId: 'hue', effectKind: 'hue', parameterId: 'turns' }, activeStartMs, activeDurationMs,
    keyframes: [{ id: `${id}-first`, timeMs: activeStartMs, value: .1, easing: { curve: 'sine', direction: 'in-out' } },
      { id: `${id}-last`, timeMs: activeStartMs + activeDurationMs, value: .4, easing: { curve: 'linear' } }] }
}
function reopen(record: ShowRecordV2) {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened))
  return opened.record
}
function prepare(record: ShowRecordV2) {
  const opened = reopen(record)
  return prepareShowV2ForCompile(opened, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(opened).composition.patternInstances.map(instance => [instance.id, source])) }, { libraries: {} })
}
function delivered(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const opened = reopen(record), ready = prepare(opened)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') throw new Error('Effect removal consumer refused')
  const artifact = compileShow(ready.recipe, {})
  const exported = buildShowEpeExportV2(opened, artifact.code, { id: 'effect-removal-proof', stampedAt: '2026-09-16T00:00:00.000Z' })
  if (exported.status !== 'exported') throw new Error(exported.message)
  const epe = parseEpe(exported.text)
  expect(epe.src).toBe(exported.source)
  return createFastReplayRuntime({ ...artifact, code: epe.src, fxCode: emitFixedPoint(epe.src), dimension: 2 },
    { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.25, .5], pos: [.25, .5] }, { sample: [.75, .5], pos: [.75, .5] }] })
}
/** Candidate versus an independently authored record: exact frames and exported state. */
function compareDelivered(actual: ShowRecordV2, expected: ShowRecordV2) {
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const a = delivered(actual, fidelity), b = delivered(expected, fidelity)
    for (const atMs of [0, 1, 199, 200, 201, 399, 400, 401, 599, 600, 601, 799, 800, 801, 999, 1001, 1401]) {
      const x = a.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }), y = b.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(x.frame).toEqual(y.frame)
      expect(x.exports).toEqual(y.exports)
      expect(Object.keys(x.exports)).not.toHaveLength(0)
    }
  }
}
function whole(fields: object): ShowClipAppearanceEditIntentV2 {
  return { kind: 'remove-effect', clipId: 'clip', scope: 'whole-clip', ...fields } as ShowClipAppearanceEditIntentV2
}
function selected(atMs: number, fields: object, identity: 'retain' | 'insert' = 'insert', id = `selected-${atMs}`): ShowClipAppearanceEditIntentV2 {
  return { kind: 'remove-effect', clipId: 'clip', scope: 'selected-time', atMs, keyIdentity: { kind: identity, appearanceKeyId: id }, ...fields } as ShowClipAppearanceEditIntentV2
}
function emptyAffected(result: ReturnType<typeof editShowClipAppearanceV2>) {
  for (const [key, value] of Object.entries(result)) if (key.startsWith('affected') || ['removedIds', 'discardedControlTargets'].includes(key)) expect(value).toEqual([])
}

it('removes a whole-Clip Effect and exactly its Clip-owned animation, keeping unrelated tracks and order', () => {
  const record = fixture()
  record.composition.propertyTracks.push(hueTrack('hue-track', 0, 1000), { id: 'bright-track',
    target: { kind: 'clip-effect', clipId: 'clip', effectId: 'bright', effectKind: 'brightness', parameterId: 'brightness' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'bright-first', timeMs: 0, value: .8, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'bright-last', timeMs: 1000, value: .4, easing: { curve: 'linear' } }] })
  expect(validateShowRecordV2(record)).toEqual([])
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record), requested = whole({ effectId: 'hue', effectKind: 'hue' }), beforeIntent = structuredClone(requested)
  const result = editShowClipAppearanceV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) key.value.effects = [{ id: 'bright', kind: 'brightness', brightness: .8 }]
  expected.composition.propertyTracks = expected.composition.propertyTracks.filter(track => track.id !== 'hue-track')
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedClipIds).toEqual(['clip'])
  expect(result.affectedAppearanceKeyIds).toEqual(['appearance-0', 'appearance-1', 'appearance-2'])
  expect(result.affectedTrackIds).toEqual(['hue-track'])
  expect(result.removedIds).toEqual(['hue-track'])
  expect(result.affectedPropertyKeyIds).toEqual(['hue-track-first', 'hue-track-last'])
  expect(result.affectedInstanceIds).toEqual([])
  expect(record).toEqual(before)
  expect(requested).toEqual(beforeIntent)
  compareDelivered(result.record, expected)
})

it('removes the Effect only from the selected span and retains animation whose activation keeps a complete Effect', () => {
  const record = fixture()
  record.composition.propertyTracks.push(hueTrack('late-hue', 600, 400))
  expect(validateShowRecordV2(record)).toEqual([])
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, selected(200, { effectId: 'hue', effectKind: 'hue' }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-200', timeMs: 200,
    value: { ...structuredClone(before.composition.clips[0].appearance.keys[0].value), effects: [{ id: 'bright', kind: 'brightness', brightness: .8 }] } })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedAppearanceKeyIds).toEqual(['selected-200'])
  expect(result.affectedTrackIds).toEqual([])
  expect(result.removedIds).toEqual([])
  expect(result.affectedPropertyKeyIds).toEqual([])
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it('removes animation whose activation intersects the emptied selected span and leaves the retained curve elsewhere exact', () => {
  const record = fixture()
  record.composition.propertyTracks.push(hueTrack('crossing-hue', 100, 200), hueTrack('later-hue', 400, 400))
  record.composition.propertyTracks[2].keyframes[0].curveSegment = { baseValue: .1, deltaValue: .5, easing: { curve: 'cubic', direction: 'in-out' }, sourceDurationMs: 600, elapsedOffsetMs: 100 }
  expect(validateShowRecordV2(record)).toEqual([])
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, selected(200, { effectId: 'hue', effectKind: 'hue' }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips[0].appearance.keys.splice(1, 0, { id: 'selected-200', timeMs: 200,
    value: { ...structuredClone(before.composition.clips[0].appearance.keys[0].value), effects: [{ id: 'bright', kind: 'brightness', brightness: .8 }] } })
  expected.composition.propertyTracks = expected.composition.propertyTracks.filter(track => track.id !== 'crossing-hue')
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedTrackIds).toEqual(['crossing-hue'])
  expect(result.removedIds).toEqual(['crossing-hue'])
  expect(result.affectedPropertyKeyIds).toEqual(['crossing-hue-first', 'crossing-hue-last'])
  // The surviving nonlinear descriptor keeps every retained coefficient exactly.
  expect(result.record.composition.propertyTracks.find(track => track.id === 'later-hue'))
    .toEqual(before.composition.propertyTracks.find(track => track.id === 'later-hue'))
  expect(record).toEqual(before)
})

it('refuses removal when the exact Effect is absent from a selected held stack without changing any span', () => {
  const record = fixture()
  record.composition.clips[0].appearance.keys[2].value.effects = [{ id: 'bright', kind: 'brightness', brightness: .8 }]
  const before = structuredClone(record)
  for (const requested of [
    whole({ effectId: 'hue', effectKind: 'hue' }),
    whole({ effectId: 'missing', effectKind: 'hue' }),
    whole({ effectId: 'hue', effectKind: 'brightness' }),
    whole({ effectId: 'hue', effectKind: 'hue', extra: true }),
    selected(900, { effectId: 'hue', effectKind: 'hue' }),
  ]) {
    const result = editShowClipAppearanceV2(record, requested)
    expect(result.status, JSON.stringify(result)).toBe('refused')
    expect(result.record).toBe(record)
    emptyAffected(result)
  }
  expect(record).toEqual(before)
})

it.each([-1, 1000, 1001, Number.MAX_SAFE_INTEGER])('refuses selected-time removal at nominal boundary %i without creating a key', atMs => {
  const record = fixture(), before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, selected(atMs, { effectId: 'hue', effectKind: 'hue' }))
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  emptyAffected(result)
  expect(record).toEqual(before)
})

it.each([['out', 400], ['out', 600], ['in', 399], ['in', 400], ['in', 1000]] as const)('refuses outside-bar %s removal at inherited contribution time %i', (clipId, atMs) => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
  const record = converted.record, clip = record.composition.clips.find(candidate => candidate.id === clipId)!
  for (const key of clip.appearance.keys) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .2 }]
  expect(validateShowRecordV2(record)).toEqual([])
  const before = structuredClone(record)
  for (const kind of ['insert', 'retain'] as const) {
    const requested = { ...selected(atMs, { effectId: 'hue', effectKind: 'hue' }, kind, kind === 'retain' ? clip.appearance.keys[0].id : `outside-${atMs}`), clipId }
    const result = editShowClipAppearanceV2(record, requested)
    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    emptyAffected(result)
  }
  expect(record).toEqual(before)
})

it('refuses atomically when a Transition property ramp still targets the removed Effect', () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
  const record = converted.record, transition = record.composition.transitions[0]
  const incoming = record.composition.clips.find(clip => clip.id === transition.participants[0].toClipId)!
  for (const key of incoming.appearance.keys) key.value.effects = [{ id: 'hue', kind: 'hue', turns: .2 }]
  transition.propertyRamps = [{ participantId: transition.participants[0].id,
    target: { kind: 'clip-effect', clipId: incoming.id, effectId: 'hue', effectKind: 'hue', parameterId: 'turns' }, from: .1, easing: { curve: 'sine', direction: 'in-out' } }]
  expect(validateShowRecordV2(record)).toEqual([])
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, { kind: 'remove-effect', clipId: incoming.id, scope: 'whole-clip', effectId: 'hue', effectKind: 'hue' })
  expect(result.status).toBe('refused')
  if (result.status === 'refused') expect(result.message).toContain(transition.id)
  expect(result.record).toBe(record)
  emptyAffected(result)
  expect(record).toEqual(before)
})

it('keeps other Clips, shared runtime users, Group definitions and their same-ID Effects untouched', () => {
  const record = fixture(), clip = record.composition.clips[0]
  clip.durationMs = 500
  clip.appearance.keys.forEach(key => { key.timeMs /= 2 })
  record.composition.layers.push({ id: 'group-layer', zoneId: clip.zoneId, name: 'Group', rank: 1 })
  // The neighbour shares the runtime, the Effect ID and the same interval, so
  // only the target Clip ID distinguishes their Clip-owned animation.
  const other = structuredClone(clip)
  other.id = 'other-clip'; other.layerId = 'group-layer'
  for (const key of other.appearance.keys) key.id = `other:${key.id}`
  record.composition.clips.push(other)
  record.composition.groupDefinitions = [{ id: 'group', name: 'Group', patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }],
    layers: [{ id: 'local-layer', name: 'Local', rank: 0 }], clips: [{ id: 'child', instanceId: 'slot', layerId: 'local-layer', startMs: 0, durationMs: 200,
      entryPolicy: 'continue', zoneSampleMode: 'span', appearance: { keys: [{ id: 'local-key', timeMs: 0,
        value: { ...structuredClone(clip.appearance.keys[0].value), effects: [{ id: 'hue', kind: 'hue', turns: .4 }] } }] } }], transitions: [], propertyTracks: [] }]
  record.composition.groupOccurrences = [{ id: 'use', definitionId: 'group', zoneId: 'zone', layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    startMs: 500, translationX: 0, translationY: 0, holds: [], instanceBindings: { slot: 'instance' },
    layerBindings: [{ definitionLayerId: 'local-layer', layerId: 'group-layer' }] }]
  record.composition.propertyTracks.push(hueTrack('hue-track', 0, 500),
    { ...hueTrack('other-hue-track', 0, 500), target: { kind: 'clip-effect', clipId: 'other-clip', effectId: 'hue', effectKind: 'hue', parameterId: 'turns' } })
  expect(validateShowRecordV2(record)).toEqual([])
  const before = structuredClone(record)
  const result = editShowClipAppearanceV2(record, whole({ effectId: 'hue', effectKind: 'hue' }))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  expect(result.record.composition.clips[1]).toEqual(before.composition.clips[1])
  expect(result.record.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(result.record.composition.groupOccurrences).toEqual(before.composition.groupOccurrences)
  expect(result.record.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(result.record.composition.propertyTracks.map(track => track.id)).toEqual(['level', 'other-hue-track'])
  expect(result.record.composition.propertyTracks[1]).toEqual(before.composition.propertyTracks[2])
  expect(result.removedIds).toEqual(['hue-track'])
  expect(record).toEqual(before)
})
