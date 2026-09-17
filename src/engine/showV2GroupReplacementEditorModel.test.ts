import { expect, it } from 'vitest'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { defaultGroupRuntimeIdV2, materializeShowGroupsV2 } from './showGroupsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { LIBRARIES } from '../pixelblaze/libs'
import { replaceShowGroupDefinitionClipPatternV2, type ReplaceShowGroupDefinitionClipPatternIntentV2 } from './showGroupReplacementV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { buildShowV2GroupReplacementEditorModel, planShowV2GroupReplacementEdit, previewShowV2GroupReplacement, type ShowV2GroupReplacementIntent } from './showV2GroupReplacementEditorModel'

const voice = 'export var gain=.4;var lost=.2;export var elapsed=0;export function sliderGain(v){gain=v}export function sliderLost(v){lost=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(gain,lost,y)}'
const other = 'export var gain=.9;export var elapsed=0;export function sliderGain(v){gain=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(0,gain,y)}'
const dependencies = () => ({
  patterns: [{ id: 'voice', name: 'Voice', src: voice, controls: {}, updatedAt: 1 }, { id: 'other', name: 'Other', src: other, controls: {}, updatedAt: 1 },
    { id: 'bad', name: 'Bad', src: 'invalid source !!!', controls: {}, updatedAt: 1 }],
  maps: [], libraries: [], profiles: [], stageMap: null,
})
const resolvedOther = { patternReference: { kind: 'user' as const, id: 'other' }, patternName: 'Other', exportedSliders: [{ kind: 'slider' as const, exportName: 'sliderGain', label: 'sliderGain' }] }

function localTracks() {
  return [
    { id: 'local-gain', target: { kind: 'instance-control' as const, instanceId: 'slot', exportName: 'sliderGain' }, activeStartMs: 0, activeDurationMs: 400,
      keyframes: [{ id: 'local-gain:a', timeMs: 0, value: 0.4, easing: { curve: 'sine' as const, direction: 'in-out' as const } }, { id: 'local-gain:b', timeMs: 400, value: 0.8, easing: { curve: 'linear' as const } }] },
    { id: 'local-speed', target: { kind: 'instance-time-scale' as const, instanceId: 'slot' }, activeStartMs: 0, activeDurationMs: 400,
      keyframes: [{ id: 'local-speed:a', timeMs: 0, value: 1, easing: { curve: 'linear' as const } }, { id: 'local-speed:b', timeMs: 400, value: 1.5, easing: { curve: 'linear' as const } }] },
  ]
}
/** One ordinary user and two linked occurrences share `instance`; local Group animation owns one compatible control. */
function linkedRecord(): ShowRecordV2 {
  const record = propertyEditGroupRecord()
  const instance = record.composition.patternInstances[0]
  instance.pattern = { kind: 'user', id: 'voice' }
  instance.patternName = 'Voice'
  instance.controlTargets = { sliderGain: 0.4, sliderLost: 0.2 }
  const definition = record.composition.groupDefinitions[0]
  definition.patternInstances[0] = { ...structuredClone(instance), id: 'slot' }
  definition.propertyTracks = localTracks()
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}
function dormantRecord(): ShowRecordV2 {
  const record = linkedRecord()
  record.composition.groupOccurrences = []
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}
function capture(record: ShowRecordV2) {
  const value = captureShowStageEditV2(record, dependencies())
  expect(value.prepared.status, JSON.stringify(value.prepared)).toBe('ready')
  return value
}
function allocator() {
  let serial = 0
  return () => `fresh-${++serial}`
}
function ownerIntent(intent: ShowV2GroupReplacementIntent): ReplaceShowGroupDefinitionClipPatternIntentV2 {
  const { kind: _kind, patternReference: _reference, ...owned } = intent
  return { ...owned, replacement: structuredClone(resolvedOther) } as ReplaceShowGroupDefinitionClipPatternIntentV2
}
function reopen(record: ShowRecordV2): ShowRecordV2 {
  expect(validateShowRecordV2(record)).toEqual([])
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error('Reopen refused')
  expect(opened.record).toEqual(record)
  return opened.record
}
function runtime(source: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const record = reopen(source)
  const prepared = prepareShowV2ForCompile(record, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(record).composition.patternInstances.map(instance => [instance.id, instance.pattern.id === 'other' ? other : voice])),
  }, { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  return { artifact, replay: createFastReplayRuntime({ ...artifact, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] }) }
}

it('lists every definition-local Clip with its actual linked or dormant replacement context', () => {
  expect(buildShowV2GroupReplacementEditorModel(capture(linkedRecord()))?.targets).toEqual([{ key: 'definition:child', definitionId: 'definition', definitionName: 'Definition',
    clipId: 'child', patternName: 'Voice', context: 'linked-occurrences', occurrenceIds: ['occ-0', 'occ-1'], sourceRuntimeIds: ['instance'], sharedRuntimeIds: ['instance'] }])
  expect(buildShowV2GroupReplacementEditorModel(capture(dormantRecord()))?.targets).toEqual([{ key: 'definition:child', definitionId: 'definition', definitionName: 'Definition',
    clipId: 'child', patternName: 'Voice', context: 'dormant-definition', occurrenceIds: [], sourceRuntimeIds: [], sharedRuntimeIds: [] }])
})

it('projects exactly the owner-reported control loss before any identity is allocated', () => {
  const record = linkedRecord()
  const preview = previewShowV2GroupReplacement(capture(record), 'definition', 'child', { kind: 'user', id: 'other' })
  expect(preview).toEqual({ status: 'ready', context: 'linked-occurrences', requiresSplit: true, forkedRuntimeIds: ['instance'],
    discardedControlTargets: [{ kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLost' }] })
  const plan = planShowV2GroupReplacementEdit(capture(record), 'definition', 'child', { kind: 'user', id: 'other' }, allocator())
  if (plan.status !== 'ready') throw new Error(plan.message)
  const result = replaceShowGroupDefinitionClipPatternV2(record, ownerIntent(plan.intent))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  expect(result.discardedControlTargets).toEqual(preview.status === 'ready' ? preview.discardedControlTargets : [])
  const unchanged = previewShowV2GroupReplacement(capture(record), 'definition', 'child', { kind: 'user', id: 'voice' })
  expect(unchanged).toEqual({ status: 'ready', context: 'linked-occurrences', requiresSplit: true, forkedRuntimeIds: ['instance'], discardedControlTargets: [] })

  // A stale local template control with no effective-runtime counterpart keeps its own slot target.
  const stale = linkedRecord()
  stale.composition.patternInstances[0].controlTargets = { sliderGain: 0.4 }
  expect(validateShowRecordV2(stale)).toEqual([])
  const staleLoss = previewShowV2GroupReplacement(capture(stale), 'definition', 'child', { kind: 'user', id: 'other' })
  expect(staleLoss).toEqual({ status: 'ready', context: 'linked-occurrences', requiresSplit: true, forkedRuntimeIds: ['instance'],
    discardedControlTargets: [{ kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLost' }] })
  const stalePlan = planShowV2GroupReplacementEdit(capture(stale), 'definition', 'child', { kind: 'user', id: 'other' }, allocator())
  if (stalePlan.status !== 'ready') throw new Error(stalePlan.message)
  const staleResult = replaceShowGroupDefinitionClipPatternV2(stale, ownerIntent(stalePlan.intent))
  expect(staleResult.status, JSON.stringify(staleResult)).toBe('changed')
  expect(staleResult.discardedControlTargets).toEqual(staleLoss.status === 'ready' ? staleLoss.discardedControlTargets : [])
})

it('plans one fresh destination per distinct shared source over exact retained effective tracks', () => {
  const record = linkedRecord()
  const expanded = materializeShowGroupsV2(record)
  const plan = planShowV2GroupReplacementEdit(capture(record), 'definition', 'child', { kind: 'user', id: 'other' }, allocator())
  expect(plan.status, JSON.stringify(plan)).toBe('ready')
  if (plan.status !== 'ready' || plan.intent.context !== 'linked-occurrences') throw new Error('Linked plan expected')
  expect(plan.intent.slot).toEqual({ kind: 'split', slotId: 'fresh-1' })
  expect(Object.keys(plan.intent.runtimePlansBySourceRuntimeId)).toEqual(['instance'])
  const runtimePlan = plan.intent.runtimePlansBySourceRuntimeId.instance
  if (runtimePlan.kind !== 'independent') throw new Error('Fork expected')
  expect(runtimePlan.instanceId).toBe('fresh-2')
  const retained = expanded.composition.propertyTracks.filter(track => 'instanceId' in track.target && track.target.instanceId === 'instance')
  expect(Object.keys(runtimePlan.identitiesBySourceTrackId).sort()).toEqual(retained.map(track => track.id).sort())
  for (const track of retained) expect(Object.keys(runtimePlan.identitiesBySourceTrackId[track.id].keyframeIdsBySourceId).sort()).toEqual(track.keyframes.map(key => key.id).sort())
  const minted = [runtimePlan.instanceId, 'fresh-1', ...Object.values(runtimePlan.identitiesBySourceTrackId).flatMap(value => [value.trackId, ...Object.values(value.keyframeIdsBySourceId)])]
  expect(new Set(minted).size).toBe(minted.length)
  const result = replaceShowGroupDefinitionClipPatternV2(record, ownerIntent(plan.intent))
  expect(result.status, JSON.stringify(result)).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.record.composition.patternInstances[0]).toEqual(record.composition.patternInstances[0])
  expect(result.record.composition.clips).toEqual(record.composition.clips)
  expect(result.record.composition.groupDefinitions[0].propertyTracks).toEqual(record.composition.groupDefinitions[0].propertyTracks)
  expect(result.record.composition.groupOccurrences.map(occurrence => occurrence.instanceBindings)).toEqual([{ slot: 'instance', 'fresh-1': 'fresh-2' }, { slot: 'instance', 'fresh-1': 'fresh-2' }])
})

it('plans a sole linked source as an explicit retain without a fresh runtime or slot', () => {
  const record = linkedRecord()
  record.composition.clips[0].instanceId = 'solo'
  record.composition.patternInstances.push({ ...structuredClone(record.composition.patternInstances[0]), id: 'solo' })
  record.composition.groupOccurrences = [record.composition.groupOccurrences[0]]
  expect(validateShowRecordV2(record)).toEqual([])
  const plan = planShowV2GroupReplacementEdit(capture(record), 'definition', 'child', { kind: 'user', id: 'other' }, () => { throw new Error('allocated') })
  expect(plan.status, JSON.stringify(plan)).toBe('ready')
  if (plan.status !== 'ready') return
  expect(plan.intent).toEqual({ kind: 'replace-group-clip-pattern', definitionId: 'definition', clipId: 'child', patternReference: { kind: 'user', id: 'other' },
    context: 'linked-occurrences', slot: { kind: 'retain' }, runtimePlansBySourceRuntimeId: { instance: { kind: 'retain' } } })
  expect(replaceShowGroupDefinitionClipPatternV2(record, ownerIntent(plan.intent)).status).toBe('changed')
})

it('plans a dormant split only when hoisted default authority or another local Clip requires one', () => {
  const sole = planShowV2GroupReplacementEdit(capture(dormantRecord()), 'definition', 'child', { kind: 'user', id: 'other' }, () => { throw new Error('allocated') })
  expect(sole.status, JSON.stringify(sole)).toBe('ready')
  if (sole.status !== 'ready') return
  expect(sole.intent).toEqual({ kind: 'replace-group-clip-pattern', definitionId: 'definition', clipId: 'child', patternReference: { kind: 'user', id: 'other' },
    context: 'dormant-definition', slot: { kind: 'retain' } })
  const hoisted = dormantRecord()
  hoisted.composition.patternInstances.push({ ...structuredClone(hoisted.composition.patternInstances[0]), id: defaultGroupRuntimeIdV2('definition', 'slot') })
  expect(validateShowRecordV2(hoisted)).toEqual([])
  const split = planShowV2GroupReplacementEdit(capture(hoisted), 'definition', 'child', { kind: 'user', id: 'other' }, allocator())
  expect(split.status, JSON.stringify(split)).toBe('ready')
  if (split.status !== 'ready' || split.intent.context !== 'dormant-definition' || split.intent.slot.kind !== 'split') throw new Error('Dormant split expected')
  expect(split.intent.slot.slotId).toBe('fresh-1')
  expect(split.intent.slot.localTrackIdentitiesBySourceTrackId).toEqual({
    'local-gain': { trackId: 'fresh-2', keyframeIdsBySourceId: { 'local-gain:a': 'fresh-3', 'local-gain:b': 'fresh-4' } },
    'local-speed': { trackId: 'fresh-5', keyframeIdsBySourceId: { 'local-speed:a': 'fresh-6', 'local-speed:b': 'fresh-7' } },
  })
  const applied = replaceShowGroupDefinitionClipPatternV2(hoisted, ownerIntent(split.intent))
  expect(applied.status, JSON.stringify(applied)).toBe('changed')
  if (applied.status !== 'changed') return
  expect(applied.record.composition.patternInstances).toEqual(hoisted.composition.patternInstances)
  expect(applied.record.composition.groupDefinitions[0].patternInstances[0]).toEqual(hoisted.composition.groupDefinitions[0].patternInstances[0])
  expect(applied.record.composition.groupDefinitions[0].clips[0].instanceId).toBe('fresh-1')
})

it('refuses unavailable, malformed and colliding identities before planning anything', () => {
  const record = linkedRecord()
  const allocate = () => { throw new Error('allocated') }
  for (const reference of [undefined, { kind: 'user', id: 'missing' }, { kind: 'user', id: 'bad' }, { kind: 'external', id: 'other' }, { kind: 'user', id: 'other', src: 'guess' }]) {
    expect(planShowV2GroupReplacementEdit(capture(record), 'definition', 'child', reference as never, allocate).status, JSON.stringify(reference)).toBe('refused')
    expect(previewShowV2GroupReplacement(capture(record), 'definition', 'child', reference as never).status).toBe('refused')
  }
  expect(planShowV2GroupReplacementEdit(capture(record), 'missing', 'child', { kind: 'user', id: 'other' }, allocate).status).toBe('refused')
  expect(planShowV2GroupReplacementEdit(capture(record), 'definition', 'occ-0:child', { kind: 'user', id: 'other' }, allocate).status).toBe('refused')
  expect(planShowV2GroupReplacementEdit(capture(record), 'definition', 'child', { kind: 'user', id: 'other' }, () => 'local-gain').status).toBe('refused')
  expect(planShowV2GroupReplacementEdit(capture(record), 'definition', 'child', { kind: 'user', id: 'other' }, () => ' ').status).toBe('refused')
  expect(record).toEqual(linkedRecord())
})

it.each(['fast', 'fidelity'] as const)('matches an independently authored Group replacement through reopened artifacts in %s', fidelity => {
  const record = linkedRecord()
  const before = structuredClone(record)
  const preimage = runtime(record, fidelity)
  const plan = planShowV2GroupReplacementEdit(capture(record), 'definition', 'child', { kind: 'user', id: 'other' }, allocator())
  if (plan.status !== 'ready') throw new Error(plan.message)
  const result = replaceShowGroupDefinitionClipPatternV2(record, ownerIntent(plan.intent))
  if (result.status !== 'changed') throw new Error('Owner refused')
  expect(record).toEqual(before)

  // Independent authoring: a second local slot carrying its own equivalent local
  // animation, bound to a separately authored runtime. No copy helper is used.
  const authored = structuredClone(before)
  const definition = authored.composition.groupDefinitions[0]
  definition.patternInstances.push({ ...structuredClone(definition.patternInstances[0]), id: 'authored-slot',
    pattern: { kind: 'user', id: 'other' }, patternName: 'Other', controlTargets: { sliderGain: 0.4 } })
  definition.clips[0].instanceId = 'authored-slot'
  definition.propertyTracks.push(...localTracks().map(track => ({ ...track, id: `authored-${track.id}`,
    target: { ...track.target, instanceId: 'authored-slot' }, keyframes: track.keyframes.map(key => ({ ...key, id: `authored-${key.id}` })) })))
  authored.composition.patternInstances.push({ ...structuredClone(authored.composition.patternInstances[0]), id: 'authored-runtime',
    pattern: { kind: 'user', id: 'other' }, patternName: 'Other', controlTargets: { sliderGain: 0.4 } })
  for (const occurrence of authored.composition.groupOccurrences) occurrence.instanceBindings = { ...occurrence.instanceBindings, 'authored-slot': 'authored-runtime' }
  authored.composition.executionModel = 'continuous'
  expect(validateShowRecordV2(authored)).toEqual([])

  const candidate = runtime(result.record, fidelity)
  const independent = runtime(authored, fidelity)
  const prefix = (value: ReturnType<typeof runtime>, id: string) => value.artifact.summary.clips.find(member => member.id === id)!.prefix
  for (const atMs of [120, 260, 380, 520, 760, 960]) {
    const a = candidate.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    const b = independent.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    expect(b.frame, `${fidelity} independent frame at ${atMs}`).toEqual(a.frame)
    for (const name of ['gain', 'elapsed']) {
      expect(b.exports[`${prefix(independent, 'authored-runtime')}_${name}`], `${fidelity} replacement ${name} at ${atMs}`).toEqual(a.exports[`${prefix(candidate, 'fresh-2')}_${name}`])
      expect(a.exports[`${prefix(candidate, 'instance')}_${name}`], `${fidelity} retained ${name} at ${atMs}`).toEqual(preimage.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }).exports[`${prefix(preimage, 'instance')}_${name}`])
    }
  }
})
