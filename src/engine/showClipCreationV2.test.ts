import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { createShowClipV2, type CreateShowClipIntentV2 } from './showClipCreationV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { defaultGroupRuntimeIdV2, materializeShowGroupsV2 } from './showGroupsV2'
import { LIBRARIES } from '../pixelblaze/libs'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { buildPatternEpeExport } from './patternEpeExport'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime, type FastReplayRuntimeOptions } from './fastReplay'
import { editShowTransitionV2 } from './showTransitionsV2'
import { isValidatedEmptyShowV2 } from './showMarkerRouteModel'
import { deriveShowRestartEventsV2 } from './showPropertyAnimationV2'

const sourceCode = 'export var level=.2; export var elapsed=0; export function sliderLevel(v){level=v} export function beforeRender(delta){elapsed+=delta} export function render2D(index,x,y){rgb(level,elapsed/2000,0)}'

function prepare(record: ShowRecordV2) {
  const opened = reopen(record)
  return prepareShowV2ForCompile(opened, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(opened).composition.patternInstances.map(instance => [instance.id, sourceCode])),
  }, { libraries: LIBRARIES })
}

function delivered(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const prepared = prepare(record)
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  // Package the real standalone program; native Show metadata is qualified separately.
  const opened = parseEpe(buildPatternEpeExport(record.name, artifact.code, { id: 'clip-create-proof' }).text)
  expect(opened.src).toBe(artifact.code)
  const options: FastReplayRuntimeOptions = { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.25, .5], pos: [.25, .5] }, { sample: [.75, .5], pos: [.75, .5] }] }
  return { artifact, replay: createFastReplayRuntime({ ...artifact, code: opened.src, fxCode: emitFixedPoint(opened.src), dimension: 2 }, options) }
}

function compareDelivered(a: ShowRecordV2, b: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const actual = delivered(a, fidelity)
  const expected = delivered(b, fidelity)
  for (const atMs of [0, 1, 99, 100, 101, 199, 200, 201, 249, 250, 251, 299, 300, 301, 399, 400, 401, 499, 500, 501, 999, 1001, 1201]) {
    const x = actual.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    const y = expected.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    expect(x.frame).toEqual(y.frame)
    expect(Object.keys(x.exports).length).toBeGreaterThan(0)
    expect(x.exports).toEqual(y.exports)
  }
  return actual.artifact
}

function emptyAffected(result: ReturnType<typeof createShowClipV2>) {
  for (const [key, value] of Object.entries(result)) if (key.startsWith('affected') || ['removedIds', 'hoistedInstanceIds'].includes(key)) expect(value).toEqual([])
}

function groupFixture(): ShowRecordV2 {
  const record = fixture()
  const template = { ...structuredClone(record.composition.patternInstances[0]), id: 'slot', controlTargets: { sliderLevel: .4 } }
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'other-source' }
  record.composition.patternInstances[0].patternName = 'Other source'
  record.composition.patternInstances[0].controlTargets = { sliderLevel: .6 }
  record.composition.clips[0].durationMs = 100
  record.composition.layers.push({ id: 'group-layer', name: 'Overlay', zoneId: 'zone', rank: 1 })
  record.composition.groupDefinitions = [{ id: 'group', name: 'Group', patternInstances: [template], layers: [{ id: 'local-layer', name: 'Local', rank: 0 }],
    clips: [{ id: 'child', instanceId: 'slot', layerId: 'local-layer', startMs: 0, durationMs: 200, zoneSampleMode: 'span', entryPolicy: 'restart',
      appearance: { keys: [{ ...structuredClone(record.composition.clips[0].appearance.keys[0]), id: 'child-key', timeMs: 0 }] } }],
    transitions: [], propertyTracks: [{ id: 'local-level', target: { kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 200,
      keyframes: [{ id: 'local-first', timeMs: 0, value: .4, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'local-last', timeMs: 200, value: .8, easing: { curve: 'linear' } }] }],
  }]
  record.composition.groupOccurrences = [{ id: 'use', definitionId: 'group', layoutOccurrenceId: record.composition.layoutOccurrences[0].id, zoneId: 'zone', startMs: 200,
    translationX: .1, translationY: .2, layerBindings: [{ definitionLayerId: 'local-layer', layerId: 'group-layer' }], holds: [{ id: 'hold', localTimeMs: 100, durationMs: 100 }] }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function fixture(): ShowRecordV2 {
  const source = convertibleV1Show()
  source.composition!.scenes[0].zones[0].overlays = []
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

function emptyFixture(): ShowRecordV2 {
  const record = fixture()
  record.composition.clips = []
  record.composition.patternInstances = []
  return record
}

function intent(record: ShowRecordV2): CreateShowClipIntentV2 {
  return { kind: 'create-clip', patternReference: { kind: 'stock', id: 'TestPattern1D' },
    clip: { id: 'new-clip', zoneId: record.zones[0].id, layerId: record.composition.layers[0].id, startMs: 100, durationMs: 300,
      entryPolicy: 'continue', zoneSampleMode: 'span', appearance: { keys: [{ id: 'new-appearance', timeMs: 100, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] } },
    runtime: { kind: 'first', instance: { id: 'new-runtime', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderLevel: .2 } } } }
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  expect(opened.status).toBe('opened')
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

it('creates one exactly placed Clip and explicit first runtime in an empty Show without alias or timing repair', () => {
  const record = emptyFixture()
  const requested = intent(record)
  const before = structuredClone(record)
  const beforeIntent = structuredClone(requested)
  const result = createShowClipV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  expect(record).toEqual(before)
  expect(requested).toEqual(beforeIntent)
  const expected = structuredClone(before)
  expected.composition.patternInstances = [beforeIntent.runtime.kind === 'first' ? beforeIntent.runtime.instance : fixture().composition.patternInstances[0]]
  expected.composition.clips = [{ ...beforeIntent.clip, instanceId: 'new-runtime' }]
  expected.composition.executionModel = 'continuous'
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedClipIds).toEqual(['new-clip'])
  expect(result.affectedInstanceIds).toEqual(['new-runtime'])
  expect(result.affectedAppearanceKeyIds).toEqual(['new-appearance'])
  expect(result.affectedKeyframeIds).toEqual([])
  expect(result.affectedTrackIds).toEqual([])
  expect(result.removedIds).toEqual([])
  result.record.composition.clips[0].appearance.keys[0].value.opacity = .4
  result.record.composition.patternInstances[0].controlTargets!.sliderLevel = .8
  expect(record).toEqual(before)
  expect(requested).toEqual(beforeIntent)
})

it('extends Show End for a Clip starting exactly at Show End (#1091)', () => {
  const record = emptyFixture()
  const showEndMs = record.composition.showEndMs
  const requested = intent(record)
  requested.clip.startMs = showEndMs
  requested.clip.appearance.keys[0].timeMs = showEndMs
  Object.assign(requested, { extendShowEnd: true })
  const before = structuredClone(record)
  const beforeIntent = structuredClone(requested)
  const result = createShowClipV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') throw new Error('Expected a changed record.')
  expect(record).toEqual(before)
  expect(requested).toEqual(beforeIntent)
  expect(result.record.composition.showEndMs).toBe(showEndMs + requested.clip.durationMs)
  const orderedBefore = [...before.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  const orderedAfter = [...result.record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  expect(orderedAfter.length).toBe(orderedBefore.length)
  for (const [index, occurrence] of orderedBefore.entries()) {
    if (index < orderedBefore.length - 1) expect(orderedAfter[index]).toEqual(occurrence)
  }
  const lastBefore = orderedBefore[orderedBefore.length - 1]
  const lastAfter = orderedAfter[orderedAfter.length - 1]
  expect(lastAfter.id).toBe(lastBefore.id)
  expect(lastAfter.startMs).toBe(lastBefore.startMs)
  expect(lastAfter.durationMs).toBe(lastBefore.durationMs + requested.clip.durationMs)
  const expected = structuredClone(before)
  expected.composition.showEndMs = showEndMs + requested.clip.durationMs
  expected.composition.layoutOccurrences.find((occurrence) => occurrence.id === lastBefore.id)!.durationMs += requested.clip.durationMs
  expected.composition.patternInstances = [beforeIntent.runtime.kind === 'first' ? beforeIntent.runtime.instance : fixture().composition.patternInstances[0]]
  expected.composition.clips = [{ ...beforeIntent.clip, instanceId: 'new-runtime' }]
  expected.composition.executionModel = 'continuous'
  expect(reopen(result.record)).toEqual(expected)
  expect(result.record.composition.clips).toHaveLength(before.composition.clips.length + 1)
  expect(record).toEqual(before)
})

it('refuses extendShowEnd when the Clip starts before Show End (#1091)', () => {
  const record = emptyFixture()
  const requested = intent(record)
  Object.assign(requested, { extendShowEnd: true })
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') throw new Error('Expected a refusal.')
  expect(result.code).toBe('invalid-intent')
  expect(result.message).toBe('Only a Clip placed exactly at Show End can extend the Show.')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

it.each([false, 0, 1, 'true', null] as const)('refuses non-true extendShowEnd %j as invalid-intent (#1091)', (value) => {
  const record = emptyFixture()
  const requested = intent(record)
  Object.assign(requested, { extendShowEnd: value })
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') throw new Error('Expected a refusal.')
  expect(result.code).toBe('invalid-intent')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

it('reuses a sole matching dormant top-level runtime without changing its values, tracks or lifecycle', () => {
  const record = fixture()
  record.composition.clips = []
  record.composition.patternInstances[0].controlTargets = { sliderLevel: .6 }
  record.composition.propertyTracks = [{ id: 'level-track', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'level-first', timeMs: 0, value: .2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'level-last', timeMs: 1000, value: .8, easing: { curve: 'linear' } }] }]
  const requested = intent(record)
  requested.runtime = { kind: 'existing' }
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.clips = [{ ...requested.clip, instanceId: 'instance' }]
  expect(reopen(result.record)).toEqual(expected)
  expect(record).toEqual(before)
  expect(result.hoistedInstanceIds).toEqual([])
  expect(result.affectedTrackIds).toEqual([])
})

it('refuses first-runtime setup while a same-source runtime already exists', () => {
  const record = fixture()
  record.composition.clips = []
  const before = structuredClone(record)
  const result = createShowClipV2(record, intent(record))
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
})

it.each([undefined, 'instance', 'second'])('multiple same-source runtimes require an explicit choice (%s)', selected => {
  const record = fixture()
  record.composition.clips = []
  record.composition.patternInstances.push({ ...structuredClone(record.composition.patternInstances[0]), id: 'second', controlTargets: { sliderLevel: .8 } })
  const requested = intent(record)
  requested.runtime = selected === undefined ? { kind: 'existing' } : { kind: 'existing', instanceId: selected }
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  if (selected === undefined) {
    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    emptyAffected(result)
  } else {
    expect(result.status, JSON.stringify(result)).toBe('changed')
    expect(result.record.composition.clips[0].instanceId).toBe(selected)
    expect(result.record.composition.patternInstances).toEqual(before.composition.patternInstances)
    expect(result.record.composition.executionModel).toBe(before.composition.executionModel)
  }
  expect(record).toEqual(before)
})

it.each(['missing', 'foreign', ''])('existing choice %j must match requested source identity even with a sole match', selected => {
  const record = fixture()
  record.composition.clips = []
  record.composition.patternInstances.push({ ...structuredClone(record.composition.patternInstances[0]), id: 'foreign', pattern: { kind: 'user', id: 'TestPattern1D' } })
  const requested = intent(record)
  requested.runtime = { kind: 'existing', instanceId: selected }
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

it('hoists a sole Group-default payload under the same runtime ID without copying animation or altering its Group', () => {
  const record = groupFixture()
  const requested = intent(record)
  requested.runtime = { kind: 'existing' }
  const before = structuredClone(record)
  const oldEffective = materializeShowGroupsV2(record)
  const result = createShowClipV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const runtimeId = defaultGroupRuntimeIdV2('group', 'slot')
  expect(result.record.composition.clips[1].instanceId).toBe(runtimeId)
  expect(result.hoistedInstanceIds).toEqual([runtimeId])
  expect(result.record.composition.patternInstances[1]).toEqual(oldEffective.composition.patternInstances.find(instance => instance.id === runtimeId))
  expect(result.record.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(result.record.composition.groupOccurrences).toEqual(before.composition.groupOccurrences)
  expect(result.record.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(result.record.composition.executionModel).toBe(before.composition.executionModel)
  expect(new Set(materializeShowGroupsV2(result.record).composition.patternInstances.map(instance => instance.id))).toEqual(new Set(oldEffective.composition.patternInstances.map(instance => instance.id)))
  expect(record).toEqual(before)
  expect(reopen(result.record)).toEqual(result.record)
})

it('matching uses authoritative top-level Group bindings rather than stale template source copies', () => {
  const record = groupFixture()
  record.composition.groupOccurrences[0].instanceBindings = { slot: 'instance' }
  const requested = intent(record)
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  expect(result.record.composition.clips[1].instanceId).toBe('new-runtime')
  expect(result.record.composition.patternInstances[0]).toEqual(before.composition.patternInstances[0])
  expect(result.record.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(result.record.composition.groupOccurrences).toEqual(before.composition.groupOccurrences)
})

it('dormant definition templates do not create matches but reserve their default identity', () => {
  const record = groupFixture()
  record.composition.groupOccurrences = []
  record.composition.clips = []
  record.composition.patternInstances = []
  const requested = intent(record)
  const result = createShowClipV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const existing = structuredClone(requested)
  existing.runtime = { kind: 'existing', instanceId: defaultGroupRuntimeIdV2('group', 'slot') }
  const before = structuredClone(record)
  const missing = createShowClipV2(record, existing)
  expect(missing.status).toBe('refused')
  expect(missing.record).toBe(record)
  if (requested.runtime.kind !== 'first') throw new Error('Fixture setup')
  requested.runtime.instance.id = defaultGroupRuntimeIdV2('group', 'slot')
  const collision = createShowClipV2(record, requested)
  expect(collision.status).toBe('refused')
  expect(collision.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(collision)
})

it.each([99, 100, 101])('ordinary Main placement uses exact half-open occupancy at %s ms', startMs => {
  const record = fixture()
  record.composition.clips[0].durationMs = 100
  const requested = intent(record)
  requested.runtime = { kind: 'existing' }
  requested.clip.startMs = startMs
  requested.clip.appearance.keys[0].timeMs = startMs
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  if (startMs === 99) {
    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    emptyAffected(result)
  } else {
    expect(result.status, JSON.stringify(result)).toBe('changed')
    expect(reopen(result.record).composition.clips[1]).toEqual({ ...requested.clip, instanceId: 'instance' })
  }
  expect(record).toEqual(before)
})

it.each([499, 500, 501])('materialized held Group occupancy lasts through500 with exact adjacency at %s', startMs => {
  const record = groupFixture()
  const requested = intent(record)
  requested.runtime = { kind: 'existing' }
  requested.clip.layerId = 'group-layer'
  requested.clip.startMs = startMs
  requested.clip.durationMs = 100
  requested.clip.appearance.keys[0].timeMs = startMs
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  if (startMs === 499) {
    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    emptyAffected(result)
  } else expect(result.status, JSON.stringify(result)).toBe('changed')
  expect(record).toEqual(before)
})

it('one continuous new Clip crosses available Layout occurrences but refuses a disappearing Zone', () => {
  const record = emptyFixture()
  record.zones.push({ id: 'other-zone', name: 'Other', nominalPixelCount: 16 })
  record.zoneLayouts.push({ id: 'second-layout', name: 'Later', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } })
  record.composition.layoutOccurrences[0].durationMs = 200
  record.composition.layoutOccurrences.push({ id: 'second-use', layoutId: 'second-layout', startMs: 200, durationMs: 800, parameters: {} })
  const requested = intent(record)
  expect(createShowClipV2(record, requested).status).toBe('changed')
  record.zoneLayouts[1].logical = { kind: 'single', zoneIds: ['other-zone'] }
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

it.each([199, 200, 201, 1000])('validates existing ordinary Clip availability when creating in another Zone (existing end %s)', endMs => {
  const record = fixture()
  record.zones.push({ id: 'other-zone', name: 'Other', nominalPixelCount: 16 })
  record.composition.layers.push({ id: 'other-layer', zoneId: 'other-zone', name: 'Other', rank: 0 })
  record.zoneLayouts.push({ id: 'second-layout', name: 'Later', zones: [], logical: { kind: 'single', zoneIds: ['other-zone'] } })
  record.composition.layoutOccurrences[0].durationMs = 200
  record.composition.layoutOccurrences.push({ id: 'second-use', layoutId: 'second-layout', startMs: 200, durationMs: 800, parameters: {} })
  record.composition.clips[0].durationMs = endMs
  const requested = intent(record)
  requested.runtime = { kind: 'existing' }
  requested.clip.zoneId = 'other-zone'
  requested.clip.layerId = 'other-layer'
  requested.clip.startMs = 200
  requested.clip.appearance.keys[0].timeMs = 200
  expect(validateShowRecordV2(record)).toEqual([])
  expect(prepare(record).status).toBe(endMs <= 200 ? 'ready' : 'refused')
  const before = structuredClone(record)
  const beforeIntent = structuredClone(requested)
  const result = createShowClipV2(record, requested)
  if (endMs <= 200) {
    expect(result.status, JSON.stringify(result)).toBe('changed')
    const expected = structuredClone(before)
    expected.composition.clips.push({ ...structuredClone(beforeIntent.clip), instanceId: 'instance' })
    expect(reopen(result.record)).toEqual(expected)
    for (const fidelity of ['fast', 'fidelity'] as const) compareDelivered(result.record, expected, fidelity)
    expect(record).toEqual(before)
    expect(requested).toEqual(beforeIntent)
    return
  }
  expect(result.status, JSON.stringify(result)).toBe('refused')
  if (result.status !== 'refused') throw new Error('Expected full-candidate routing refusal')
  expect(result.code).toBe('invalid-result')
  expect(result.message).toContain('Zone zone is unavailable in Layout second-layout')
  expect(result.message).toContain(`[0, ${endMs})`)
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  expect(requested).toEqual(beforeIntent)
  emptyAffected(result)
})

it.each([
  ['negative start', (i: CreateShowClipIntentV2) => { i.clip.startMs = -1; i.clip.appearance.keys[0].timeMs = -1 }],
  ['fractional start', (i: CreateShowClipIntentV2) => { i.clip.startMs = 1.5; i.clip.appearance.keys[0].timeMs = 1.5 }],
  ['zero duration', (i: CreateShowClipIntentV2) => { i.clip.durationMs = 0 }],
  ['fractional duration', (i: CreateShowClipIntentV2) => { i.clip.durationMs = 1.5 }],
  ['past ShowEnd', (i: CreateShowClipIntentV2) => { i.clip.durationMs = 1000 }],
  ['unsafe addition', (i: CreateShowClipIntentV2) => { i.clip.startMs = Number.MAX_SAFE_INTEGER; i.clip.durationMs = 1; i.clip.appearance.keys[0].timeMs = i.clip.startMs }],
  ['blank ClipID', (i: CreateShowClipIntentV2) => { i.clip.id = ' ' }],
  ['blank keyID', (i: CreateShowClipIntentV2) => { i.clip.appearance.keys[0].id = '' }],
  ['same plan identities', (i: CreateShowClipIntentV2) => { i.clip.appearance.keys[0].id = i.clip.id }],
  ['foreign Zone', (i: CreateShowClipIntentV2) => { i.clip.zoneId = 'missing' }],
  ['foreign Layer', (i: CreateShowClipIntentV2) => { i.clip.layerId = 'missing' }],
  ['invalid entry', (i: CreateShowClipIntentV2) => { Object.assign(i.clip, { entryPolicy: 'private-restart' }) }],
  ['invalid sampling', (i: CreateShowClipIntentV2) => { Object.assign(i.clip, { zoneSampleMode: 'guess' }) }],
  ['missing complete appearance', (i: CreateShowClipIntentV2) => { Object.assign(i.clip.appearance.keys[0], { value: { opacity: 1 } }) }],
  ['wrong appearance time', (i: CreateShowClipIntentV2) => { i.clip.appearance.keys[0].timeMs = 101 }],
  ['extra appearance key', (i: CreateShowClipIntentV2) => { i.clip.appearance.keys.push({ ...structuredClone(i.clip.appearance.keys[0]), id: 'extra', timeMs: 200 }) }],
  ['missing appearance key', (i: CreateShowClipIntentV2) => { i.clip.appearance.keys = [] }],
  ['extra Clip field', (i: CreateShowClipIntentV2) => { Object.assign(i.clip, { instanceId: 'guess' }) }],
  ['extra intent field', (i: CreateShowClipIntentV2) => { Object.assign(i, { showEndMs: 5000 }) }],
  ['extra runtime field', (i: CreateShowClipIntentV2) => { Object.assign(i.runtime, { instanceId: 'guess' }) }],
  ['source identity mismatch', (i: CreateShowClipIntentV2) => { if (i.runtime.kind === 'first') i.runtime.instance.pattern = { kind: 'user', id: 'TestPattern1D' } }],
  ['blank runtimeID', (i: CreateShowClipIntentV2) => { if (i.runtime.kind === 'first') i.runtime.instance.id = ' ' }],
  ['invalid runtime payload', (i: CreateShowClipIntentV2) => { if (i.runtime.kind === 'first') Object.assign(i.runtime.instance.time, { timeScale: Infinity }) }],
] as const)('malformed %s intent refuses atomically without clamp, inferred fields or partial setup', (_name, mutate) => {
  const record = emptyFixture()
  const requested = intent(record)
  mutate(requested)
  const before = structuredClone(record)
  const beforeIntent = structuredClone(requested)
  const result = createShowClipV2(record, requested)
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  expect(requested).toEqual(beforeIntent)
  emptyAffected(result)
})

it.each([null, {}, { kind: 'add' }, { kind: 'create-clip', clip: null }])('incomplete intent %j refuses rather than throwing or adopting', raw => {
  const record = emptyFixture()
  const result = createShowClipV2(record, raw as unknown as CreateShowClipIntentV2)
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  emptyAffected(result)
})

it('an invalid preimage cannot be laundered into a fresh valid placement', () => {
  const record = emptyFixture()
  Object.assign(record, { scenes: [] })
  const before = structuredClone(record)
  const result = createShowClipV2(record, intent(record))
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

it.each(['fast', 'fidelity'] as const)('empty add→delete collects the runtime; first-runtime readd yields fresh default %s output without resurrecting effects', fidelity => {
  const empty = emptyFixture()
  expect(isValidatedEmptyShowV2(empty)).toBe(true)
  const requested = intent(empty)
  const added = createShowClipV2(empty, requested)
  expect(added.status).toBe('changed')
  expect(isValidatedEmptyShowV2(added.record)).toBe(false)
  const expected = fixture()
  expected.composition.executionModel = 'continuous'
  expected.composition.patternInstances = [{ id: 'new-runtime', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderLevel: .2 } }]
  expected.composition.clips = [{ id: 'new-clip', instanceId: 'new-runtime', zoneId: 'zone', layerId: 'layer:zone:main', startMs: 100, durationMs: 300, entryPolicy: 'continue', zoneSampleMode: 'span',
    appearance: { keys: [{ id: 'new-appearance', timeMs: 100, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] } }]
  compareDelivered(added.record, expected, fidelity)
  const decorated = reopen(added.record)
  decorated.composition.clips[0].appearance.keys[0].value.opacity = .5
  decorated.composition.propertyTracks.push({ id: 'old-opacity', target: { kind: 'clip-opacity', clipId: 'new-clip' }, activeStartMs: 100, activeDurationMs: 300,
    keyframes: [{ id: 'old-opacity-key', timeMs: 100, value: .4, easing: { curve: 'linear' } }, { id: 'old-opacity-last', timeMs: 400, value: .8, easing: { curve: 'linear' } }] })
  expect(validateShowRecordV2(decorated)).toEqual([])
  const deleted = editShowTransitionV2(decorated, { kind: 'delete-clip', clipId: 'new-clip' })
  expect(deleted.status, JSON.stringify(deleted)).toBe('changed')
  expect(isValidatedEmptyShowV2(reopen(deleted.record))).toBe(true)
  expect(deleted.record.composition.propertyTracks).toEqual([])
  expect(deleted.record.composition.patternInstances).toEqual([])
  expect(deleted.removedIds).toContain('new-runtime')
  const fresh = { id: 'readded-runtime', pattern: { kind: 'stock' as const, id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: {} }
  const again = intent(deleted.record)
  again.runtime = { kind: 'first', instance: fresh }
  const readded = createShowClipV2(deleted.record, again)
  expect(readded.status).toBe('changed')
  const expectedReadd = structuredClone(expected)
  expectedReadd.composition.patternInstances = [fresh]
  expectedReadd.composition.clips[0].instanceId = 'readded-runtime'
  expect(reopen(readded.record)).toEqual(expectedReadd)
  compareDelivered(readded.record, expectedReadd, fidelity)
})

it.each(['fast', 'fidelity'] as const)('Group-default sharing, nonlinear animation and Restart remain one %s runtime after creation', fidelity => {
  const record = groupFixture()
  const requested = intent(record)
  requested.runtime = { kind: 'existing' }
  requested.clip.entryPolicy = 'restart'
  const before = structuredClone(record)
  expect(prepare(record).status).toBe('ready')
  const result = createShowClipV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const runtimeId = defaultGroupRuntimeIdV2('group', 'slot')
  const expected = groupFixture()
  expected.composition.patternInstances.push({ id: runtimeId, pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderLevel: .4 } })
  expected.composition.clips.push({ id: 'new-clip', instanceId: runtimeId, zoneId: 'zone', layerId: 'layer:zone:main', startMs: 100, durationMs: 300, entryPolicy: 'restart', zoneSampleMode: 'span',
    appearance: { keys: [{ id: 'new-appearance', timeMs: 100, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] } })
  compareDelivered(result.record, expected, fidelity)
  const prepared = prepare(result.record)
  expect(prepared.status).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Preparation refused')
  expect(prepared.provenance.runtimeInstanceIdByClipId).toEqual({ [record.composition.clips[0].id]: 'instance', 'use:child': runtimeId, 'new-clip': runtimeId })
  const restart = deriveShowRestartEventsV2(result.record)
  expect(restart.status).toBe('derived')
  expect(restart.events.map(event => [event.instanceId, event.atMs])).toEqual([[runtimeId, 100], [runtimeId, 200]])
  expect(materializeShowGroupsV2(result.record).composition.clips.filter(clip => clip.instanceId === runtimeId)).toHaveLength(2)
  expect(record).toEqual(before)
})

it('final source admission refuses missing code without invalidating the structurally accepted private candidate', () => {
  const record = emptyFixture()
  const result = createShowClipV2(record, intent(record))
  expect(result.status).toBe('changed')
  const before = structuredClone(result.record)
  const prepared = prepareShowV2ForCompile(reopen(result.record), { byCellId: {}, byPatternInstanceId: {}, stageDimension: 2 }, { libraries: LIBRARIES })
  expect(prepared.status).toBe('refused')
  expect(result.record).toEqual(before)
  expect(isValidatedEmptyShowV2(record)).toBe(true)
})

function windowFixture(group: boolean): ShowRecordV2 {
  const record = group ? groupFixture() : fixture()
  if (group) {
    const definition = record.composition.groupDefinitions[0]
    definition.propertyTracks = []
    definition.clips[0].durationMs = 50
    const incoming = structuredClone(definition.clips[0])
    incoming.id = 'later'
    incoming.startMs = 100
    incoming.durationMs = 100
    incoming.appearance.keys[0] = { ...incoming.appearance.keys[0], id: 'later-key', timeMs: 100 }
    definition.clips.push(incoming)
    definition.transitions = [{ id: 'local-fade', kind: 'crossfade', durationMs: 50, easing: { curve: 'linear' }, fromPlacementId: 'child', toPlacementId: 'later' }]
    record.composition.groupOccurrences[0].holds[0].localTimeMs = 150
  } else {
    const outgoing = record.composition.clips[0]
    outgoing.durationMs = 100
    const incoming = structuredClone(outgoing)
    incoming.id = 'later'
    incoming.startMs = 400
    incoming.durationMs = 100
    incoming.appearance.keys[0] = { ...incoming.appearance.keys[0], id: 'later-key', timeMs: 400 }
    record.composition.clips.push(incoming)
    record.composition.transitions = [{ id: 'fade', kind: 'crossfade', durationMs: 300, easing: { curve: 'linear' }, propertyRamps: [],
      participants: [{ id: 'pair', zoneId: 'zone', layerId: outgoing.layerId, fromClipId: outgoing.id, toClipId: incoming.id }] }]
    record.composition.layers.push({ id: 'overlay', name: 'Overlay', zoneId: 'zone', rank: 1 })
  }
  return record
}

it.each([
  [false, 0, 50, true], [false, 50, 50, false], [false, 100, 50, false], [false, 200, 50, false],
  [false, 350, 50, false], [false, 400, 50, false], [false, 401, 50, true], [false, 500, 50, true],
  [true, 100, 149, true], [true, 100, 150, false], [true, 250, 20, false], [true, 251, 20, false],
  [true, 280, 20, false], [true, 300, 20, false], [true, 301, 20, true], [true, 100, 250, true],
] as const)('ordinary/Group window creation (Group:%s, %s+%s, admitted:%s) retains public preparation eligibility', (group, startMs, durationMs, admitted) => {
  const record = windowFixture(group)
  const before = structuredClone(record)
  expect(prepare(record).status).toBe('ready')
  const requested = intent(record)
  requested.runtime = { kind: 'existing' }
  requested.clip.layerId = group ? 'layer:zone:main' : 'overlay'
  requested.clip.startMs = startMs
  requested.clip.durationMs = durationMs
  requested.clip.appearance.keys[0].timeMs = startMs
  const result = createShowClipV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe(admitted ? 'changed' : 'refused')
  expect(record).toEqual(before)
  if (admitted) {
    expect(validateShowRecordV2(reopen(result.record))).toEqual([])
    expect(prepare(result.record).status).toBe('ready')
    expect(result.record.composition.transitions).toEqual(before.composition.transitions)
    expect(result.record.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  } else {
    expect(result.record).toBe(record)
    emptyAffected(result)
  }
})

it.each(['child', 'child-key', 'slot', 'local-level', 'use', 'use:child', 'use:child-key', 'use:local-level', 'use:local-first'])('fresh caller identity cannot collide with authored/effective Group owner %s', collision => {
  const record = groupFixture()
  const before = structuredClone(record)
  for (const field of ['clip', 'key'] as const) {
    const requested = intent(record)
    requested.runtime = { kind: 'existing' }
    if (field === 'clip') requested.clip.id = collision
    else requested.clip.appearance.keys[0].id = collision
    const result = createShowClipV2(record, requested)
    expect(result.status, JSON.stringify(result)).toBe('refused')
    expect(result.record).toBe(record)
    emptyAffected(result)
  }
  expect(record).toEqual(before)
})

it('an unused slot in an actual Group occurrence remains an explicit existing source runtime choice', () => {
  const record = groupFixture()
  const definition = record.composition.groupDefinitions[0]
  definition.patternInstances.push({ ...structuredClone(definition.patternInstances[0]), id: 'unused-slot', controlTargets: { sliderLevel: .7 } })
  const before = structuredClone(record)
  const requested = intent(record)
  requested.runtime = { kind: 'existing' }
  const ambiguous = createShowClipV2(record, requested)
  expect(ambiguous.status).toBe('refused')
  expect(ambiguous.record).toBe(record)
  emptyAffected(ambiguous)
  const runtimeId = defaultGroupRuntimeIdV2('group', 'unused-slot')
  requested.runtime = { kind: 'existing', instanceId: runtimeId }
  const result = createShowClipV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  expect(result.hoistedInstanceIds).toEqual([runtimeId])
  expect(result.record.composition.patternInstances[result.record.composition.patternInstances.length - 1].controlTargets).toEqual({ sliderLevel: .7 })
  expect(result.record.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(prepare(result.record).status).toBe('ready')
  expect(record).toEqual(before)
})

it.each([false, true])('creation refuses unrelated spanning Fade contribution (Group:%s) from an admitted preimage', group => {
  const record = windowFixture(group)
  if (group) record.composition.groupDefinitions[0].transitions[0] = { ...record.composition.groupDefinitions[0].transitions[0], kind: 'fade-color', color: '#204060' }
  else record.composition.transitions[0] = { ...record.composition.transitions[0], kind: 'fade-color', color: '#204060' }
  expect(prepare(record).status).toBe('ready')
  const requested = intent(record)
  requested.runtime = { kind: 'existing' }
  requested.clip.layerId = group ? 'layer:zone:main' : 'overlay'
  requested.clip.startMs = group ? 100 : 0
  requested.clip.durationMs = group ? 250 : 500
  requested.clip.appearance.keys[0].timeMs = requested.clip.startMs
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') throw new Error('Expected refusal')
  expect(result.code).toBe('compiler-ineligible')
  expect(result.message).toContain('RL08')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

it.each(['fast', 'fidelity'] as const)('equal source text under different Pattern references stays two independently authored %s runtimes', fidelity => {
  const record = fixture()
  record.composition.clips[0].durationMs = 100
  const requested = intent(record)
  requested.patternReference = { kind: 'user', id: 'TestPattern1D' }
  if (requested.runtime.kind !== 'first') throw new Error('Fixture setup')
  requested.runtime.instance.pattern = { kind: 'user', id: 'TestPattern1D' }
  requested.runtime.instance.controlTargets = { sliderLevel: .8 }
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = fixture()
  expected.composition.executionModel = 'continuous'
  expected.composition.clips[0].durationMs = 100
  expected.composition.patternInstances.push({ id: 'new-runtime', pattern: { kind: 'user', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderLevel: .8 } })
  expected.composition.clips.push({ id: 'new-clip', instanceId: 'new-runtime', zoneId: 'zone', layerId: 'layer:zone:main', startMs: 100, durationMs: 300, entryPolicy: 'continue', zoneSampleMode: 'span',
    appearance: { keys: [{ id: 'new-appearance', timeMs: 100, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] } })
  compareDelivered(result.record, expected, fidelity)
  const prepared = prepare(result.record)
  expect(prepared.status).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Preparation refused')
  expect(prepared.provenance.runtimeInstanceIdByClipId).toEqual({ clip: 'instance', 'new-clip': 'new-runtime' })
  expect(result.record.composition.patternInstances[0]).toEqual(before.composition.patternInstances[0])
  expect(record).toEqual(before)
})

it('a Zone cannot use another Zone Layer, and repeated creation cannot reuse its prior identities', () => {
  const record = emptyFixture()
  record.zones.push({ id: 'other-zone', name: 'Other', nominalPixelCount: 16 })
  record.composition.layers.push({ id: 'other-layer', zoneId: 'other-zone', name: 'Other', rank: 0 })
  const requested = intent(record)
  requested.clip.layerId = 'other-layer'
  const before = structuredClone(record)
  const foreign = createShowClipV2(record, requested)
  expect(foreign.status).toBe('refused')
  expect(foreign.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(foreign)
  requested.clip.layerId = 'layer:zone:main'
  const added = createShowClipV2(record, requested)
  expect(added.status).toBe('changed')
  requested.runtime = { kind: 'existing' }
  const repeated = createShowClipV2(added.record, requested)
  expect(repeated.status).toBe('refused')
  expect(repeated.record).toBe(added.record)
  emptyAffected(repeated)
})

it('refuses a create-clip intent that authors conversion provenance (#1068 gap 8, part A2)', () => {
  const record = emptyFixture()
  const requested = intent(record)
  requested.clip.logicalClipId = 'solo'
  const before = structuredClone(record)
  const result = createShowClipV2(record, requested)
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') return
  expect(result.code).toBe('invalid-intent')
  expect(result.message).toContain('conversion provenance')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})
