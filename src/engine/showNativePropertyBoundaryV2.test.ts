import { expect, it } from 'vitest'
import { createShowV2WithOutputContract } from './showCreationV2'
import { createInstallationShowOutputContract } from './showOutputContract'
import { planShowV2PropertyAnimationChange } from './showV2PropertyAnimationPlanning'
import { editShowPropertyV2 } from './showPropertyEditsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2 } from './showCompositionV2'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { createShowWithOutputContract, showRecordToCompileRecipe } from './showModel'
import { compileShow, type GeneratedShowArtifact } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import type { ShowRecordV2 } from './showCompositionV2'
import type { ShowPropertyAnimationTarget, ShowPropertyAnimationTrack } from './personalContentRecords'
import { participantWindowBlockedV2 } from './showBoundaryScopeV2'
import { projectNativePropertyBoundaryForCompileV2 } from './showNativePropertyBoundaryV2'

const VOICE = 'export var gain=.2; export var elapsed=0; export var renders=0; export function sliderGain(v){gain=v} export function beforeRender(d){elapsed+=d} export function render(index){renders++;rgb(gain,elapsed/100000,renders/100000)}'
const CONTRACT = createInstallationShowOutputContract({ outputMapId: null, pixelCount: 2 })

function nativeWithTrack(): ShowRecordV2 {
  const record = createShowV2WithOutputContract('native', 'Native', CONTRACT, 1)
  record.composition.propertyTracks = [{ id: 'brightness', target: { kind: 'clip-view', clipId: 'clip-1', property: 'brightness' }, activeStartMs: 0, activeDurationMs: 32000,
    keyframes: [{ id: 'from', timeMs: 0, value: .2, easing: { curve: 'linear' } }, { id: 'to', timeMs: 30000, value: .7, easing: { curve: 'linear' } }] }]
  return record
}

const outsideCases: Array<[string, (record: ShowRecordV2) => void]> = [
  ['second Zone', record => { record.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 1 }) }],
  ['third touching Clip', record => {
    const clip = structuredClone(record.composition.clips[0]); clip.id = 'third'; clip.startMs = 30000; clip.durationMs = 1000
    clip.appearance.keys[0] = { ...clip.appearance.keys[0], id: 'third-key', timeMs: 30000 }
    record.composition.clips.push(clip)
  }],
  ['third overlapping Clip', record => {
    const clip = structuredClone(record.composition.clips[0]); clip.id = 'third'; clip.startMs = 29000; clip.durationMs = 3000
    clip.appearance.keys[0] = { ...clip.appearance.keys[0], id: 'third-key', timeMs: 29000 }
    record.composition.clips.push(clip)
  }],
  ['shared instance', record => { record.composition.clips[1].instanceId = 'instance-1' }],
  ['live-live policy', record => { record.composition.transitions[0].crossfadePolicy = 'live-live' }],
  ['different kind', record => { record.composition.transitions[0].kind = 'wipe' }],
  ['multiple appearance keys', record => { const keys = record.composition.clips[0].appearance.keys; keys.push({ ...structuredClone(keys[0]), id: 'held', timeMs: 1000 }) }],
  ['global track', record => { record.composition.propertyTracks.push({ ...structuredClone(record.composition.propertyTracks[0]), id: 'repeat', target: { kind: 'show-repeat-scale' } }) }],
  ['retained curve', record => { record.composition.propertyTracks[0].keyframes[0].curveSegment = { baseValue: .2, deltaValue: .5, easing: { curve: 'linear' }, sourceDurationMs: 30000, elapsedOffsetMs: 0 } }],
  ['explicit activation', record => { record.composition.propertyTracks[0].activeDurationMs = 31000 }],
  ['key inside participant window', record => { record.composition.propertyTracks[0].keyframes[1].timeMs = 31000 }],
]

it.each(outsideCases)('retains existing typed refusal outside closed geometry: %s (#1209)', (_name, mutate) => {
  const record = nativeWithTrack()
  mutate(record)
  const before = structuredClone(record)
  expect(projectNativePropertyBoundaryForCompileV2(record)).toBe(record)
  expect(participantWindowBlockedV2(record)).toBe(true)
  const prepared = prepareShowV2ForCompile(record, { byCellId: {}, byPatternInstanceId: { 'instance-1': VOICE, 'instance-2': VOICE }, stageDimension: 2 }, { libraries: {} })
  expect(prepared.status).toBe('refused')
  if (prepared.status === 'refused') expect(prepared.issues.length).toBeGreaterThan(0)
  expect(record).toEqual(before)
})

it('leaves already-ready native no-track bytes and identity unchanged (#1209)', () => {
  const record = createShowV2WithOutputContract('native', 'Native', CONTRACT, 1)
  expect(projectNativePropertyBoundaryForCompileV2(record)).toBe(record)
  const lookup = { byCellId: { 'cell-1': DEMOS.TestPattern1D, 'cell-2': DEMOS.CometLoom }, byPatternInstanceId: { 'instance-1': DEMOS.TestPattern1D, 'instance-2': DEMOS.CometLoom }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(record, lookup, { libraries: LIBRARIES })
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared))
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(createShowWithOutputContract('legacy', 'Legacy', CONTRACT, 1), lookup), LIBRARIES).code)
})

it('admits renamed identities and authored appearance without rewriting them (#1209)', () => {
  const record = nativeWithTrack()
  record.composition.layers[0].id = 'authored-layer'
  for (const [index, clip] of record.composition.clips.entries()) {
    clip.id = `authored-clip-${index}`
    clip.instanceId = `authored-instance-${index}`
    clip.layerId = 'authored-layer'
    clip.appearance.keys[0].value.view = { mirror: true, phase: .25, brightness: .5 }
    record.composition.patternInstances[index].id = clip.instanceId
  }
  const transition = record.composition.transitions[0]
  transition.id = 'authored-transition'
  Object.assign(transition.participants[0], { layerId: 'authored-layer', fromClipId: 'authored-clip-0', toClipId: 'authored-clip-1' })
  record.composition.propertyTracks[0].target = { kind: 'clip-view', clipId: 'authored-clip-0', property: 'brightness' }
  const before = structuredClone(record)
  const prepared = prepareShowV2ForCompile(record, { byCellId: {}, byPatternInstanceId: { 'authored-instance-0': VOICE, 'authored-instance-1': VOICE }, stageDimension: 2 }, { libraries: {} })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  expect(record).toStrictEqual(before)
})

function normalizedState(result: { exports: Record<string, unknown> }, artifact: GeneratedShowArtifact) {
  const normalized = new Set(artifact.metadata.deterministicReplay?.normalizedBindings ?? [])
  return artifact.summary.clips.map(member => Object.fromEntries(Object.entries(result.exports)
    .filter(([key, value]) => key.startsWith(`${member.prefix}_`) && !normalized.has(key) && (typeof value === 'number' || typeof value === 'boolean'))
    .map(([key, value]) => [key.slice(member.prefix.length + 1), value])))
}

it.each(['brightness', 'stock-brightness', 'extra-key', 'nonlinear', 'control', 'time-scale'] as const)('delivered native %s matches independent Scene-local choreography (#1209)', kind => {
  for (const duration of [30000, 300]) for (const index of [0, 1]) {
    const gap = duration / 15
    const record = createShowV2WithOutputContract('native', 'Native', CONTRACT, 1)
    record.composition.showEndMs = 2 * duration + gap
    record.composition.layoutOccurrences[0].durationMs = 2 * duration + gap
    record.composition.clips.forEach((clip, i) => {
      clip.startMs = i === 0 ? 0 : duration + gap
      clip.durationMs = duration
      clip.appearance.keys[0].timeMs = clip.startMs
    })
    record.composition.transitions[0].durationMs = gap
    for (const instance of kind === 'stock-brightness' ? [] : record.composition.patternInstances) {
      instance.pattern = { kind: 'user', id: 'voice' }
      instance.controlTargets = { sliderGain: .2 }
    }
    const clip = record.composition.clips[index]
    const target: ShowPropertyAnimationTarget = !['control', 'time-scale'].includes(kind)
      ? { kind: 'placement-view', placementId: clip.id, property: 'brightness' }
      : kind === 'control' ? { kind: 'instance-control', instanceId: clip.instanceId, exportName: 'sliderGain' }
        : { kind: 'instance-time-scale', instanceId: clip.instanceId }
    const keyframes: ShowPropertyAnimationTrack['keyframes'] = [{ id: 'from', timeMs: 0, value: .2, easing: kind === 'nonlinear' ? { curve: 'quadratic', direction: 'in' } : { curve: 'linear' } }, { id: 'to', timeMs: duration, value: .7, easing: { curve: 'linear' } }]
    if (kind === 'extra-key') keyframes.splice(1, 0, { id: 'middle', timeMs: duration / 2, value: .4, easing: { curve: 'linear' } })
    let id = 0
    const plan = planShowV2PropertyAnimationChange(record, clip.id, { showTimeOffsetMs: clip.startMs, storageDurationMs: duration }, { kind: 'add-track', target, initialValue: .2, keyframes }, () => `key-${++id}`)
    if (plan.kind !== 'edit') throw new Error(JSON.stringify(plan))
    let edit = editShowPropertyV2(record, plan.propertyOwner, plan.intent)
    if (edit.status !== 'changed') throw new Error(JSON.stringify(edit))
    if (kind === 'extra-key') {
      const addedTrack = edit.record.composition.propertyTracks[0]
      edit = editShowPropertyV2(edit.record, { kind: 'show' }, { kind: 'update-key', trackId: addedTrack.id, keyId: addedTrack.keyframes[1].id, patch: { value: .55 } })
      if (edit.status !== 'changed') throw new Error(JSON.stringify(edit))
      keyframes[1].value = .55
    }
    expect(edit.record.composition.transitions).toEqual(record.composition.transitions)
    expect(validateShowRecordV2(edit.record)).toEqual([])
    const authored = structuredClone(edit.record)
    const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(edit.record))
    if (opened.status !== 'opened') throw new Error(JSON.stringify(opened))
    expect(opened.record).toEqual(authored)
    expect('origin' in opened.record.composition.transitions[0]).toBe(false)
    const plannedTrack = opened.record.composition.propertyTracks[0]
    expect(plannedTrack.activeStartMs).toBe(index === 0 ? 0 : kind === 'control' || kind === 'time-scale' ? duration + gap : duration)
    expect(plannedTrack.activeDurationMs).toBe(index === 0 || !['control', 'time-scale'].includes(kind) ? duration + gap : duration)
    expect(plannedTrack.keyframes.map(key => [key.timeMs, key.value])).toEqual(keyframes.map(key => [clip.startMs + key.timeMs, key.value]))
    const lookup = { byCellId: {}, byPatternInstanceId: kind === 'stock-brightness' ? { 'instance-1': DEMOS.TestPattern1D, 'instance-2': DEMOS.CometLoom } : { 'instance-1': VOICE, 'instance-2': VOICE }, stageDimension: 2 as const }
    const prepared = prepareShowV2ForCompile(opened.record, lookup, { libraries: LIBRARIES })
    if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared))
    const artifact = compileShow(prepared.recipe, LIBRARIES)
    const exported = buildShowEpeExportV2(opened.record, artifact.code)
    if (exported.status !== 'exported') throw new Error(exported.message)
    const source = parseEpe(exported.text).src
    expect(source).toBe(exported.source)
    expect(opened.record).toEqual(authored)

    // Independent v1 authoring: two explicit Scene-local placements and tracks.
    const legacy = createShowWithOutputContract('legacy', 'Legacy', CONTRACT, 1)
    legacy.scenes = [{ id: 'out', name: 'Out', durationMs: duration }, { id: 'in', name: 'In', durationMs: duration }]
    legacy.cells = []
    legacy.transitions = [{ id: 'crossfade', afterSceneId: 'out', kind: 'crossfade', durationMs: gap, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live' }]
    const track: ShowPropertyAnimationTrack = { id: 'legacy-track', target, keyframes: keyframes.map((key, i) => ({ ...key, id: `legacy-key-${i}` })) }
    legacy.composition = {
      version: 1, durationMs: 2 * duration + gap,
      patternInstances: [1, 2].map(i => ({ id: `instance-${i}`, pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, ...(kind === 'stock-brightness' ? {} : { controlTargets: { sliderGain: .2 } }) })),
      scenes: ['out', 'in'].map((sceneId, i) => ({ sceneId, zones: [{ zoneId: legacy.zones[0].id, main: [{ id: `clip-${i + 1}`, instanceId: `instance-${i + 1}`, startMs: 0, durationMs: duration, view: { mirror: false, phase: 0, brightness: 1 } }], overlays: [] }], ...(i === index ? { propertyTracks: [track] } : {}) })),
      transitions: [],
    }
    const oracle = compileShow(showRecordToCompileRecipe(legacy, lookup), LIBRARIES)
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const options = { fidelity, randomSeed: 1209, mapPoints: [{ sample: [0], pos: [0, .5] as [number, number] }, { sample: [1], pos: [1, .5] as [number, number] }] }
      const candidate = createFastReplayRuntime({ ...artifact, code: source, fxCode: emitFixedPoint(source), dimension: 2 }, options)
      const reference = createFastReplayRuntime({ ...oracle, dimension: 2 }, options)
      const probes = duration === 30000 ? [0, 15000, 29999, 30000, 30001, 31000, 31999, 32000, 32001, 45000, 61999]
        : [0, 150, 299, 300, 301, 310, 319, 320, 321, 450, 619]
      for (const atMs of probes) {
        const left = candidate.advanceTo(atMs, { stepMs: 25, forceFullIntermediateRender: true })
        const right = reference.advanceTo(atMs, { stepMs: 25, forceFullIntermediateRender: true })
        const label = `${kind} side=${index} duration=${duration} ${fidelity} @${atMs}`
        expect(left.frame, label).toEqual(right.frame)
        const state = normalizedState(left, artifact)
        expect(state.every(member => Object.keys(member).length > 0)).toBe(true)
        expect(state, label).toEqual(normalizedState(right, oracle))
      }
    }
  }
})

it.each([0, 1])('native first Brightness on Clip %s retains authored scope and prepares (#1209)', index => {
  const record = createShowV2WithOutputContract('native', 'Native', createInstallationShowOutputContract({ outputMapId: null, pixelCount: 60 }), 1)
  const before = structuredClone(record)
  const clip = record.composition.clips[index]
  let id = 0
  const plan = planShowV2PropertyAnimationChange(record, clip.id, { showTimeOffsetMs: clip.startMs, storageDurationMs: clip.durationMs }, {
    kind: 'add-track', target: { kind: 'placement-view', placementId: clip.id, property: 'brightness' }, initialValue: 0.2,
  }, () => `property-${++id}`)
  if (plan.kind !== 'edit' || plan.intent.kind !== 'add-track') throw new Error(JSON.stringify(plan))
  expect(plan.intent.track).toMatchObject({ activeStartMs: index === 0 ? 0 : 30000, activeDurationMs: 32000 })
  expect(plan.intent.track.keyframes.map(key => [key.timeMs, key.value])).toEqual([[clip.startMs, 0.2], [clip.startMs + clip.durationMs, 0.2]])
  const edit = editShowPropertyV2(record, plan.propertyOwner, plan.intent)
  if (edit.status !== 'changed') throw new Error(JSON.stringify(edit))
  expect(record).toEqual(before)
  expect(edit.record.composition.transitions).toEqual(before.composition.transitions)
  expect(validateShowRecordV2(edit.record)).toEqual([])
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(edit.record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened))
  expect(opened.record).toEqual(edit.record)
  const snapshot = structuredClone(opened.record)
  const prepared = prepareShowV2ForCompile(opened.record, { byCellId: {}, byPatternInstanceId: { 'instance-1': DEMOS.TestPattern1D, 'instance-2': DEMOS.CometLoom }, stageDimension: 2 }, { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  expect(opened.record).toEqual(snapshot)
})
