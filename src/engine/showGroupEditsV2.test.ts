import { expect, it } from 'vitest'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowGroupDefinitionV2,
  type ShowGroupOccurrenceV2,
  type ShowRecordV2,
} from './showCompositionV2'
import {
  duplicateShowGroupOccurrenceV2,
  editShowGroupDefinitionClipAppearanceV2,
  insertShowGroupDefinitionLayerTransitionV2,
  makeShowGroupUniqueV2,
  moveShowGroupOccurrenceV2,
  resizeShowGroupDefinitionLayerTransitionV2,
  setShowGroupDefinitionClipTimingV2,
  ungroupShowGroupOccurrenceV2,
  type ShowGroupEditResultV2,
  type ShowGroupOccurrencePlacementV2,
  type ShowGroupUniqueIdentityPlanV2,
} from './showGroupEditsV2'
import { planShowV2GroupOccurrenceEdit } from './showV2GroupOccurrenceEditorModel'
import {
  completeShowGroupSelection,
  createShowGroupFromSelection,
  duplicateShowGroupOccurrence,
  insertShowGroupLayerTransition,
  resizeShowGroupLayerTransition,
  validateShowGroupSelection,
} from './showGroupModel'
import { updateShowGroupClipInspector } from './showGroupClipInspectorModel'
import { resizeBoundaryShow } from '@/agent-harness/baseline/fixtures'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import type { ShowRecord } from './personalContentRecords'
import { effectiveShowInstanceUseCountV2, groupRuntimeBindings, materializeShowGroupsV2 } from './showGroupsV2'
import { deriveShowRestartEventsV2, evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import { buildShowEpeExport } from './showEpeExport'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'

const code = 'export var calls=0; export function beforeRender(delta){calls++} export function render2D(index,x,y){rgb(calls/100,x,y)}'

function linkedRecord(): ShowRecordV2 {
  const source = convertibleV1Show()
  source.composition!.scenes[0].zones[0].overlays = []
  source.composition!.groupDefinitions = [{
    id: 'group',
    name: 'Pulse',
    patternInstances: [{ ...structuredClone(source.composition!.patternInstances[0]), id: 'child' }],
    placements: [{
      id: 'pulse', instanceId: 'child', layerOffset: 0, startMs: 0, durationMs: 100,
      opacity: 0.5, view: { mirror: false, phase: 0, brightness: 1 },
    }, {
      id: 'answer', instanceId: 'child', layerOffset: 0, startMs: 200, durationMs: 100,
      opacity: 0.75, view: { mirror: false, phase: 0, brightness: 1 },
    }],
    transitions: [{
      id: 'local-crossfade', fromPlacementId: 'pulse', toPlacementId: 'answer',
      kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
    }],
    propertyTracks: [{
      id: 'opacity', target: { kind: 'placement-opacity', placementId: 'pulse' },
      keyframes: [
        { id: 'first', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
        { id: 'last', timeMs: 100, value: 0.8, easing: { curve: 'linear' } },
      ],
    }],
  }]
  source.composition!.groupOccurrences = [200, 600].map((startMs, index) => ({
    id: `occ-${index}`, definitionId: 'group', sceneId: 'scene-a', zoneId: 'zone', startMs,
    baseLayer: 1, translationX: index * 0.2, translationY: 0,
  }))
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  for (const occurrence of record.composition.groupOccurrences) {
    delete occurrence.instanceBindings
    delete occurrence.trackActivation
  }
  const selected = record.composition.groupOccurrences[0]
  selected.holds = [{ id: 'held-beat', localTimeMs: 50, durationMs: 25 }]
  const definition = record.composition.groupDefinitions[0]
  definition.clips[0].entryPolicy = 'restart'
  definition.clips[0].appearance.keys.push({
    ...structuredClone(definition.clips[0].appearance.keys[0]),
    id: 'pulse:appearance:second',
    timeMs: 50,
  })
  return record
}

function identityPlan(definition: ShowGroupDefinitionV2, suffix = 'unique'): ShowGroupUniqueIdentityPlanV2 {
  return {
    definitionId: `${definition.id}:${suffix}`,
    patternInstanceIds: Object.fromEntries(definition.patternInstances.map(instance => [instance.id, `${instance.id}:${suffix}`])),
    layerIds: Object.fromEntries(definition.layers.map(layer => [layer.id, `${layer.id}:${suffix}`])),
    clipIds: Object.fromEntries(definition.clips.map(clip => [clip.id, `${clip.id}:${suffix}`])),
    transitionIds: Object.fromEntries(definition.transitions.map(transition => [transition.id, `${transition.id}:${suffix}`])),
    propertyTrackIds: Object.fromEntries(definition.propertyTracks.map(track => [track.id, `${track.id}:${suffix}`])),
    appearanceKeyIdsByClipId: Object.fromEntries(definition.clips.map(clip => [
      clip.id,
      Object.fromEntries(clip.appearance.keys.map(key => [key.id, `${key.id}:${suffix}`])),
    ])),
    propertyKeyIdsByTrackId: Object.fromEntries(definition.propertyTracks.map(track => [
      track.id,
      Object.fromEntries(track.keyframes.map(key => [key.id, `${key.id}:${suffix}`])),
    ])),
  }
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const result = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  expect(result.status, JSON.stringify(result.status === 'refused' && result.issues)).toBe('opened')
  if (result.status !== 'opened') throw new Error(JSON.stringify(result.issues))
  return result.record
}

function expectEmptyAffected(result: ShowGroupEditResultV2): void {
  expect(result).toMatchObject({
    affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [],
    affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [],
    affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [],
    affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], hoistedInstanceIds: [],
    removedIds: [], discardedControlTargets: [],
  })
}

function placementOf(
  occurrence: ShowGroupOccurrenceV2,
  overrides: Partial<ShowGroupOccurrencePlacementV2> = {},
): ShowGroupOccurrencePlacementV2 {
  return {
    startMs: occurrence.startMs,
    layoutOccurrenceId: occurrence.layoutOccurrenceId,
    zoneId: occurrence.zoneId,
    layerBindings: structuredClone(occurrence.layerBindings),
    translationX: occurrence.translationX,
    translationY: occurrence.translationY,
    ...overrides,
  }
}

function transitionLookup() {
  return {
    byCellId: {},
    byPatternInstanceId: { 'out-instance': code, 'in-instance': code },
    stageDimension: 2 as const,
  }
}

function linkedLookup() {
  return {
    byCellId: {},
    byPatternInstanceId: { instance: code, 'group:["group","child"]': code },
    stageDimension: 2 as const,
  }
}

function ordinaryTransitionGroupRecord(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  const overlay = record.composition.layers.find(layer => layer.rank === 1)!
  const outgoing = record.composition.clips.find(clip => clip.id === 'out')!
  record.composition.groupDefinitions = [{
    id: 'placement-group',
    name: 'Placement group',
    patternInstances: [{
      ...structuredClone(record.composition.patternInstances.find(instance => instance.id === outgoing.instanceId)!),
      id: 'child',
    }],
    layers: [{ id: 'local-layer', name: 'Local', rank: 0 }],
    clips: [{
      id: 'child-clip',
      instanceId: 'child',
      layerId: 'local-layer',
      startMs: 0,
      durationMs: 100,
      entryPolicy: outgoing.entryPolicy,
      zoneSampleMode: outgoing.zoneSampleMode,
      appearance: {
        keys: [{
          ...structuredClone(outgoing.appearance.keys[0]),
          id: 'child-appearance',
          timeMs: 0,
        }],
      },
    }],
    transitions: [],
    propertyTracks: [],
  }]
  record.composition.groupOccurrences = [{
    id: 'group-use',
    definitionId: 'placement-group',
    layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    zoneId: outgoing.zoneId,
    startMs: 800,
    translationX: 0,
    translationY: 0,
    holds: [],
    instanceBindings: { child: outgoing.instanceId },
    layerBindings: [{ definitionLayerId: 'local-layer', layerId: overlay.id }],
  }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

it('makes one held linked occurrence unique while preserving effective runtime identity and every authored payload', () => {
  const record = linkedRecord()
  const before = structuredClone(record)
  const definition = record.composition.groupDefinitions[0]
  const selected = record.composition.groupOccurrences[0]
  const other = record.composition.groupOccurrences[1]
  const plan = identityPlan(definition)
  const runtimeId = 'group:["group","child"]'

  const result = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: selected.id, identities: plan })

  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(record).toEqual(before)
  const reopened = reopen(result.record)
  const cloned = reopened.composition.groupDefinitions.find(candidate => candidate.id === plan.definitionId)!
  const editedOccurrence = reopened.composition.groupOccurrences.find(candidate => candidate.id === selected.id)!
  expect(reopened.composition.groupDefinitions.find(candidate => candidate.id === definition.id)).toEqual(before.composition.groupDefinitions[0])
  expect(reopened.composition.groupOccurrences.find(candidate => candidate.id === other.id)).toEqual(before.composition.groupOccurrences[1])
  expect(editedOccurrence).toEqual({
    ...selected,
    definitionId: plan.definitionId,
    instanceBindings: { 'child:unique': runtimeId },
    layerBindings: selected.layerBindings.map(binding => ({
      definitionLayerId: plan.layerIds[binding.definitionLayerId],
      layerId: binding.layerId,
    })),
  })
  expect(cloned.patternInstances.map(instance => instance.id)).toEqual(['child:unique'])
  expect(cloned.layers.map(layer => layer.id)).toEqual([plan.layerIds[definition.layers[0].id]])
  expect(cloned.clips.map(clip => [clip.id, clip.instanceId, clip.layerId])).toEqual([
    ['pulse:unique', 'child:unique', plan.layerIds[definition.layers[0].id]],
    ['answer:unique', 'child:unique', plan.layerIds[definition.layers[0].id]],
  ])
  expect(cloned.transitions[0]).toMatchObject({
    id: 'local-crossfade:unique', fromPlacementId: 'pulse:unique', toPlacementId: 'answer:unique',
  })
  expect(cloned.propertyTracks[0]).toMatchObject({
    id: 'opacity:unique', target: { kind: 'clip-opacity', clipId: 'pulse:unique' },
  })
  expect(cloned.clips[0].appearance.keys.map(key => key.id)).toEqual([
    'pulse:appearance:1:unique', 'pulse:appearance:second:unique',
  ])
  expect(cloned.propertyTracks[0].keyframes.map(key => key.id)).toEqual(['first:unique', 'last:unique'])
  expect(reopened.composition.patternInstances.filter(instance => instance.id === runtimeId)).toHaveLength(1)
  expect(reopened.composition.patternInstances.find(instance => instance.id === runtimeId)).toEqual({
    ...definition.patternInstances[0], id: runtimeId,
  })
  expect(groupRuntimeBindings(reopened).filter(binding => binding.runtimeId === runtimeId)).toHaveLength(2)
  expect(materializeShowGroupsV2(reopened).composition.clips.filter(clip => clip.instanceId === runtimeId)).toHaveLength(4)
  expect(result).toMatchObject({
    affectedClipIds: ['answer:unique', 'pulse:unique'],
    affectedInstanceIds: ['child:unique', runtimeId],
    affectedTransitionIds: ['local-crossfade:unique'],
    affectedTrackIds: ['opacity:unique'],
    affectedGroupDefinitionIds: ['group:unique'],
    affectedGroupOccurrenceIds: ['occ-0'],
    affectedLayerIds: [plan.layerIds[definition.layers[0].id]],
    affectedAppearanceKeyIds: ['answer:appearance:1:unique', 'pulse:appearance:1:unique', 'pulse:appearance:second:unique'],
    affectedPropertyKeyIds: ['first:unique', 'last:unique'],
    hoistedInstanceIds: [runtimeId],
    removedIds: [], discardedControlTargets: [],
  })
  expect(result.affectedLayoutDefinitionIds).toEqual([])
  expect(result.affectedLayoutOccurrenceIds).toEqual([])
  expect(result.affectedMarkerIds).toEqual([])

  const repeated = makeShowGroupUniqueV2(reopened, { kind: 'make-unique', occurrenceId: selected.id, identities: identityPlan(cloned, 'again') })
  expect(repeated.status).toBe('unchanged')
  expect(repeated.record).toBe(reopened)
  expectEmptyAffected(repeated)
})

it('returns an exact no-op when the selected occurrence already owns its definition', () => {
  const record = linkedRecord()
  record.composition.groupOccurrences = [record.composition.groupOccurrences[0]]
  const result = makeShowGroupUniqueV2(record, {
    kind: 'make-unique', occurrenceId: 'occ-0', identities: identityPlan(record.composition.groupDefinitions[0]),
  })
  expect(result.status).toBe('unchanged')
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('uses an explicit top-level Pattern instance as authoritative over stale definition-slot payload', () => {
  const record = linkedRecord()
  const definition = record.composition.groupDefinitions[0]
  const selected = record.composition.groupOccurrences[0]
  selected.instanceBindings = { child: 'instance' }
  definition.propertyTracks[0].target = { kind: 'instance-time-scale', instanceId: 'child' }
  definition.patternInstances[0].time.timeScale = 9
  definition.patternInstances[0].controlTargets = { stale: 1 }
  const authoritative = structuredClone(record.composition.patternInstances.find(instance => instance.id === 'instance')!)
  authoritative.time.timeScale = 0.5
  authoritative.controlTargets = { gain: 0.25 }
  record.composition.patternInstances = [authoritative]
  const resolved = groupRuntimeBindings(record).find(binding => binding.occurrenceId === selected.id)!
  expect(resolved).toMatchObject({ runtimeId: 'instance', slotId: 'child', authority: 'composition', instance: authoritative })

  const result = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: selected.id, identities: identityPlan(definition) })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  const clone = result.record.composition.groupDefinitions.find(candidate => candidate.id === 'group:unique')!
  expect(clone.patternInstances[0]).toEqual({ ...authoritative, id: 'child:unique' })
  expect(clone.propertyTracks[0].target).toEqual({ kind: 'instance-time-scale', instanceId: 'child:unique' })
  expect(result.record.composition.groupDefinitions[0]).toEqual(definition)
  expect(materializeShowGroupsV2(result.record).composition.patternInstances.find(instance => instance.id === 'instance')).toEqual(authoritative)
})

it('does not hoist an explicit compatible binding whose runtime has no top-level owner', () => {
  const record = linkedRecord()
  const selected = record.composition.groupOccurrences[0]
  selected.instanceBindings = { child: 'explicit-unowned' }
  record.composition.groupOccurrences[1].instanceBindings = { child: 'explicit-unowned' }
  const result = makeShowGroupUniqueV2(record, {
    kind: 'make-unique', occurrenceId: selected.id, identities: identityPlan(record.composition.groupDefinitions[0]),
  })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.hoistedInstanceIds).toEqual([])
  expect(result.record.composition.patternInstances.some(instance => instance.id === 'explicit-unowned')).toBe(false)
  expect(result.record.composition.groupOccurrences[0].instanceBindings).toEqual({ 'child:unique': 'explicit-unowned' })
})

it('reuses an already-hoisted default as top-level authority without adding another record', () => {
  const record = linkedRecord()
  const runtimeId = 'group:["group","child"]'
  const authoritative = {
    ...structuredClone(record.composition.groupDefinitions[0].patternInstances[0]),
    id: runtimeId,
    patternName: 'Already hoisted',
  }
  record.composition.patternInstances.push(authoritative)
  const result = makeShowGroupUniqueV2(record, {
    kind: 'make-unique', occurrenceId: 'occ-0', identities: identityPlan(record.composition.groupDefinitions[0]),
  })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.hoistedInstanceIds).toEqual([])
  expect(result.record.composition.patternInstances.filter(instance => instance.id === runtimeId)).toEqual([authoritative])
  expect(result.record.composition.groupDefinitions.find(candidate => candidate.id === 'group:unique')?.patternInstances[0]).toEqual({
    ...authoritative, id: 'child:unique',
  })
})

it('edits the named later occurrence without changing the first occurrence', () => {
  const record = linkedRecord()
  const first = structuredClone(record.composition.groupOccurrences[0])
  const result = makeShowGroupUniqueV2(record, {
    kind: 'make-unique', occurrenceId: 'occ-1', identities: identityPlan(record.composition.groupDefinitions[0]),
  })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.record.composition.groupOccurrences[0]).toEqual(first)
  expect(result.record.composition.groupOccurrences[1].definitionId).toBe('group:unique')
})

it('hoists unbound defaults once and resolves mixed bound and unbound slots from their authoritative payloads', () => {
  const record = linkedRecord()
  const definition = record.composition.groupDefinitions[0]
  const selected = record.composition.groupOccurrences[0]
  const second = { ...structuredClone(definition.patternInstances[0]), id: 'bound-child', patternName: 'Bound authoritative' }
  definition.patternInstances.push(second)
  definition.clips[1].instanceId = second.id
  const authoritative = { ...structuredClone(record.composition.patternInstances[0]), id: 'ordinary-bound', patternName: 'Top-level wins' }
  record.composition.patternInstances.push(authoritative)
  selected.instanceBindings = { 'bound-child': authoritative.id }
  record.composition.groupOccurrences[1].instanceBindings = { 'bound-child': authoritative.id }
  const plan = identityPlan(definition)
  const defaultRuntimeId = 'group:["group","child"]'

  const result = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: selected.id, identities: plan })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.record.composition.patternInstances.filter(instance => instance.id === defaultRuntimeId)).toHaveLength(1)
  expect(result.hoistedInstanceIds).toEqual([defaultRuntimeId])
  const edited = result.record.composition.groupOccurrences.find(occurrence => occurrence.id === selected.id)!
  expect(edited.instanceBindings).toEqual({ 'child:unique': defaultRuntimeId, 'bound-child:unique': authoritative.id })
  const clone = result.record.composition.groupDefinitions.find(candidate => candidate.id === plan.definitionId)!
  expect(clone.patternInstances.find(instance => instance.id === 'bound-child:unique')).toEqual({ ...authoritative, id: 'bound-child:unique' })
  const materialized = materializeShowGroupsV2(result.record)
  expect(materialized.composition.patternInstances.filter(instance => instance.id === defaultRuntimeId)).toHaveLength(1)
  expect(materialized.composition.patternInstances.find(instance => instance.id === authoritative.id)).toEqual(authoritative)
})

it.each([
  ['incomplete', (plan: ShowGroupUniqueIdentityPlanV2) => { delete plan.clipIds.answer }],
  ['extraneous', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.layerIds.missing = 'extra-layer' }],
  ['blank', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.transitionIds['local-crossfade'] = '  ' }],
  ['conflicting', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.clipIds.answer = plan.clipIds.pulse }],
  ['already-owned', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.propertyTrackIds.opacity = 'opacity' }],
  ['already-owned appearance key', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.appearanceKeyIdsByClipId.pulse['pulse:appearance:1'] = 'pulse:appearance:1' }],
  ['already-owned Property key', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.propertyKeyIdsByTrackId.opacity.first = 'first' }],
  ['ordinary-owner conflict', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.clipIds.pulse = 'clip' }],
  ['non-string', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.layerIds[Object.keys(plan.layerIds)[0]] = 17 as unknown as string }],
  ['missing mapping', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.patternInstanceIds = undefined as unknown as Record<string, string> }],
  ['cross-owner-key conflict', (plan: ShowGroupUniqueIdentityPlanV2) => {
    plan.appearanceKeyIdsByClipId.answer['answer:appearance:1'] = plan.appearanceKeyIdsByClipId.pulse['pulse:appearance:1']
  }],
  ['extraneous appearance owner', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.appearanceKeyIdsByClipId.missing = {} }],
  ['extraneous Property owner', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.propertyKeyIdsByTrackId.missing = {} }],
] as const)('refuses an %s identity plan atomically', (_partition, mutate) => {
  const record = linkedRecord()
  const plan = identityPlan(record.composition.groupDefinitions[0])
  mutate(plan)
  const result = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: 'occ-0', identities: plan })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-identity-plan' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it.each([
  ['blank definition', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.definitionId = '  ' }],
  ['non-string definition', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.definitionId = 17 as unknown as string }],
  ['missing appearance owners', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.appearanceKeyIdsByClipId = undefined as unknown as Record<string, Record<string, string>> }],
  ['invalid appearance owners', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.appearanceKeyIdsByClipId = null as unknown as Record<string, Record<string, string>> }],
  ['missing Property owners', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.propertyKeyIdsByTrackId = undefined as unknown as Record<string, Record<string, string>> }],
  ['invalid Property owners', (plan: ShowGroupUniqueIdentityPlanV2) => { plan.propertyKeyIdsByTrackId = 17 as unknown as Record<string, Record<string, string>> }],
] as const)('refuses %s in the identity plan', (_partition, mutate) => {
  const record = linkedRecord()
  const plan = identityPlan(record.composition.groupDefinitions[0])
  mutate(plan)
  const result = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: 'occ-0', identities: plan })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-identity-plan' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('refuses a non-object Property-key owner plan when the definition has no Property tracks', () => {
  const record = linkedRecord()
  const definition = record.composition.groupDefinitions[0]
  definition.propertyTracks = []
  const plan = identityPlan(definition)
  plan.propertyKeyIdsByTrackId = 17 as unknown as Record<string, Record<string, string>>
  const result = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: 'occ-0', identities: plan })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-identity-plan' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('refuses a definition identity already owned among several definitions', () => {
  const record = linkedRecord()
  const extra = structuredClone(record.composition.groupDefinitions[0])
  extra.id = 'extra-definition'
  record.composition.groupDefinitions.push(extra)
  const plan = identityPlan(record.composition.groupDefinitions[0])
  plan.definitionId = 'group'
  const result = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: 'occ-0', identities: plan })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-identity-plan' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('refuses key identities already owned by ordinary Clip and Property owners', () => {
  const record = linkedRecord()
  const ordinaryClip = record.composition.clips[0]
  record.composition.propertyTracks.push({
    id: 'ordinary-track',
    target: { kind: 'clip-opacity', clipId: ordinaryClip.id },
    activeStartMs: ordinaryClip.startMs,
    activeDurationMs: ordinaryClip.durationMs,
    keyframes: [
      { id: 'ordinary-property-key', timeMs: ordinaryClip.startMs, value: 1, easing: { curve: 'linear' } },
      { id: 'ordinary-property-end', timeMs: ordinaryClip.startMs + ordinaryClip.durationMs, value: 1, easing: { curve: 'linear' } },
    ],
  })
  const definition = record.composition.groupDefinitions[0]
  const appearancePlan = identityPlan(definition)
  appearancePlan.appearanceKeyIdsByClipId.pulse['pulse:appearance:1'] = ordinaryClip.appearance.keys[0].id
  const appearance = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: 'occ-0', identities: appearancePlan })
  expect(appearance, appearance.status === 'refused' ? appearance.message : undefined).toMatchObject({ status: 'refused', code: 'invalid-identity-plan' })
  expect(appearance.record).toBe(record)
  expectEmptyAffected(appearance)

  const propertyPlan = identityPlan(definition)
  propertyPlan.propertyKeyIdsByTrackId.opacity.first = 'ordinary-property-key'
  const property = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: 'occ-0', identities: propertyPlan })
  expect(property).toMatchObject({ status: 'refused', code: 'invalid-identity-plan' })
  expect(property.record).toBe(record)
  expectEmptyAffected(property)
})

it('refuses duplicate Property key targets across cloned tracks', () => {
  const record = linkedRecord()
  const definition = record.composition.groupDefinitions[0]
  definition.propertyTracks.push({
    ...structuredClone(definition.propertyTracks[0]),
    id: 'second-track',
    target: { kind: 'instance-time-scale', instanceId: 'child' },
    keyframes: definition.propertyTracks[0].keyframes.map(key => ({ ...structuredClone(key), id: `second-${key.id}` })),
  })
  const plan = identityPlan(definition)
  plan.propertyKeyIdsByTrackId['second-track']['second-first'] = plan.propertyKeyIdsByTrackId.opacity.first
  const result = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: 'occ-0', identities: plan })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-identity-plan' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it.each([
  ['Pattern instance', (plan: ShowGroupUniqueIdentityPlanV2) => { delete plan.patternInstanceIds.child }],
  ['Layer', (plan: ShowGroupUniqueIdentityPlanV2, definition: ShowGroupDefinitionV2) => { delete plan.layerIds[definition.layers[0].id] }],
  ['Transition', (plan: ShowGroupUniqueIdentityPlanV2) => { delete plan.transitionIds['local-crossfade'] }],
  ['Property track', (plan: ShowGroupUniqueIdentityPlanV2) => { delete plan.propertyTrackIds.opacity }],
  ['appearance key', (plan: ShowGroupUniqueIdentityPlanV2) => { delete plan.appearanceKeyIdsByClipId.pulse['pulse:appearance:1'] }],
  ['appearance owner', (plan: ShowGroupUniqueIdentityPlanV2) => { delete plan.appearanceKeyIdsByClipId.pulse }],
  ['Property key', (plan: ShowGroupUniqueIdentityPlanV2) => { delete plan.propertyKeyIdsByTrackId.opacity.first }],
  ['Property owner', (plan: ShowGroupUniqueIdentityPlanV2) => { delete plan.propertyKeyIdsByTrackId.opacity }],
] as const)('requires a complete %s identity partition', (_partition, mutate) => {
  const record = linkedRecord()
  const definition = record.composition.groupDefinitions[0]
  const plan = identityPlan(definition)
  mutate(plan, definition)
  const result = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: 'occ-0', identities: plan })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-identity-plan' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('refuses a missing occurrence without allocating identities', () => {
  const record = linkedRecord()
  const result = makeShowGroupUniqueV2(record, {
    kind: 'make-unique', occurrenceId: 'missing', identities: identityPlan(record.composition.groupDefinitions[0]),
  })
  expect(result).toMatchObject({ status: 'refused', code: 'missing-occurrence' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('refuses incompatible unowned same-runtime claims without choosing a payload', () => {
  const record = linkedRecord()
  const duplicate = structuredClone(record.composition.groupDefinitions[0])
  duplicate.id = 'other-group'
  duplicate.patternInstances[0].time.timeScale = 2
  record.composition.groupDefinitions.push(duplicate)
  record.composition.groupOccurrences[0].instanceBindings = { child: 'unowned-runtime' }
  record.composition.groupOccurrences[1].definitionId = duplicate.id
  record.composition.groupOccurrences[1].instanceBindings = { child: 'unowned-runtime' }

  expect(() => materializeShowGroupsV2(record)).toThrow(/conflicting Pattern instance values/)
  const result = makeShowGroupUniqueV2(record, {
    kind: 'make-unique', occurrenceId: 'occ-0', identities: identityPlan(record.composition.groupDefinitions[0]),
  })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-record' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('moves one held occurrence as a complete placement and shifts only its occurrence-owned activation', () => {
  const record = linkedRecord()
  const before = structuredClone(record)
  const selected = record.composition.groupOccurrences[0]
  selected.trackActivation = { startMs: 150, durationMs: 400 }
  before.composition.groupOccurrences[0].trackActivation = { startMs: 150, durationMs: 400 }
  record.composition.propertyTracks.push({
    id: 'shared-runtime-scale',
    target: { kind: 'instance-time-scale', instanceId: 'instance' },
    activeStartMs: 0,
    activeDurationMs: 1000,
    keyframes: [
      { id: 'shared-start', timeMs: 0, value: 1, easing: { curve: 'linear' } },
      { id: 'shared-end', timeMs: 1000, value: 1, easing: { curve: 'linear' } },
    ],
  })
  before.composition.propertyTracks = structuredClone(record.composition.propertyTracks)

  const result = moveShowGroupOccurrenceV2(record, {
    kind: 'move-occurrence', occurrenceId: selected.id,
    ...placementOf(selected, { startMs: 250, translationX: 0.4, translationY: -0.2 }),
  })

  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(record).toEqual(before)
  const reopened = reopen(result.record)
  const moved = reopened.composition.groupOccurrences.find(value => value.id === selected.id)!
  expect(moved).toEqual({
    ...before.composition.groupOccurrences[0],
    startMs: 250,
    translationX: 0.4,
    translationY: -0.2,
    trackActivation: { startMs: 200, durationMs: 400 },
  })
  expect(reopened.composition.groupOccurrences[1]).toEqual(before.composition.groupOccurrences[1])
  expect(reopened.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(reopened.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(materializeShowGroupsV2(reopened).composition.clips
    .filter(clip => clip.id.startsWith('occ-0:'))
    .map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['occ-0:pulse', 250, 125],
      ['occ-0:answer', 475, 100],
    ])
  const restartEvents = deriveShowRestartEventsV2(reopened)
  expect(restartEvents).toMatchObject({ status: 'derived' })
  if (restartEvents.status === 'derived') expect(restartEvents.events.map(event => event.atMs)).toEqual([250, 600])
  expect(result).toMatchObject({ affectedGroupOccurrenceIds: ['occ-0'] })
  expect({ ...result, affectedGroupOccurrenceIds: [] }).toMatchObject({
    affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [],
    affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [],
    affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [],
    affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], hoistedInstanceIds: [],
    removedIds: [], discardedControlTargets: [],
  })
})

it('returns the original record for an exact Group occurrence placement no-op', () => {
  const record = linkedRecord()
  const occurrence = record.composition.groupOccurrences[0]
  const result = moveShowGroupOccurrenceV2(record, {
    kind: 'move-occurrence', occurrenceId: occurrence.id, ...placementOf(occurrence),
  })
  expect(result.status).toBe('unchanged')
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('duplicates a held occurrence as a linked shell without minting runtime or animation owners', () => {
  const record = linkedRecord()
  record.composition.showEndMs = 1400
  record.composition.layoutOccurrences[0].durationMs = 1400
  const before = structuredClone(record)
  const source = record.composition.groupOccurrences[0]
  source.trackActivation = { startMs: 150, durationMs: 400 }
  before.composition.groupOccurrences[0].trackActivation = { startMs: 150, durationMs: 400 }

  const result = duplicateShowGroupOccurrenceV2(record, {
    kind: 'duplicate-occurrence', occurrenceId: source.id, newOccurrenceId: 'occ-copy',
    ...placementOf(source, { startMs: 1000, translationX: 0.7 }),
  })

  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(record).toEqual(before)
  const directCopy = result.record.composition.groupOccurrences.find(value => value.id === 'occ-copy')!
  expect(directCopy).not.toBe(source)
  expect(directCopy.holds).not.toBe(source.holds)
  expect(directCopy.layerBindings).not.toBe(source.layerBindings)
  const reopened = reopen(result.record)
  const copy = reopened.composition.groupOccurrences.find(value => value.id === 'occ-copy')!
  expect(copy).toEqual({
    ...before.composition.groupOccurrences[0], id: 'occ-copy', startMs: 1000,
    translationX: 0.7, trackActivation: { startMs: 950, durationMs: 400 },
  })
  expect(copy.holds).not.toBe(reopened.composition.groupOccurrences[0].holds)
  expect(copy.layerBindings).not.toBe(reopened.composition.groupOccurrences[0].layerBindings)
  expect(reopened.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(reopened.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(reopened.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(groupRuntimeBindings(reopened).map(value => value.runtimeId)).toEqual([
    'group:["group","child"]', 'group:["group","child"]', 'group:["group","child"]',
  ])
  expect(materializeShowGroupsV2(reopened).composition.clips.filter(clip => clip.instanceId === 'group:["group","child"]')).toHaveLength(6)
  const restarts = deriveShowRestartEventsV2(reopened)
  expect(restarts).toMatchObject({ status: 'derived' })
  if (restarts.status === 'derived') expect(restarts.events.map(event => event.atMs)).toEqual([200, 600, 1000])
  expect(result).toMatchObject({ affectedGroupOccurrenceIds: ['occ-copy'] })
  expect({ ...result, affectedGroupOccurrenceIds: [] }).toMatchObject({
    affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [],
    affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [],
    affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [],
    affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], hoistedInstanceIds: [],
    removedIds: [], discardedControlTargets: [],
  })
})

it.each(['move', 'duplicate'] as const)('refuses Group %s when a materialized child enters an ordinary Transition window', operation => {
  const record = ordinaryTransitionGroupRecord()
  const before = structuredClone(record)
  const source = record.composition.groupOccurrences[0]
  const placement = placementOf(source, { startMs: 450 })
  const candidate = structuredClone(record)
  candidate.composition.groupOccurrences[0] = { ...candidate.composition.groupOccurrences[0], ...structuredClone(placement) }
  if (operation === 'duplicate') {
    candidate.composition.groupOccurrences.push({
      ...candidate.composition.groupOccurrences[0], id: 'group-copy',
    })
    candidate.composition.groupOccurrences[0] = structuredClone(record.composition.groupOccurrences[0])
  }
  expect(prepareShowV2ForCompile(record, transitionLookup()).status).toBe('ready')
  expect(prepareShowV2ForCompile(reopen(candidate), transitionLookup())).toMatchObject({
    status: 'refused',
    issues: expect.arrayContaining([expect.objectContaining({ code: 'compiler-ineligible' })]),
  })

  const result = operation === 'move'
    ? moveShowGroupOccurrenceV2(record, {
        kind: 'move-occurrence', occurrenceId: source.id, ...placement,
      })
    : duplicateShowGroupOccurrenceV2(record, {
        kind: 'duplicate-occurrence', occurrenceId: source.id, newOccurrenceId: 'group-copy', ...placement,
      })
  expect(result).toMatchObject({ status: 'refused', code: 'compiler-ineligible' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
  expect(record).toEqual(before)
})

it.each(['move', 'duplicate'] as const)('refuses Group %s when its child enters a materialized Group Transition window', operation => {
  const record = linkedRecord()
  record.composition.groupDefinitions[0].propertyTracks = []
  record.composition.groupDefinitions[0].clips[0].appearance.keys = [
    record.composition.groupDefinitions[0].clips[0].appearance.keys[0],
  ]
  const before = structuredClone(record)
  const source = record.composition.groupOccurrences[1]
  const rank = Math.max(...record.composition.layers.map(layer => layer.rank)) + 1
  record.composition.layers.push({ id: 'collision-oracle-layer', zoneId: source.zoneId, name: 'Oracle', rank })
  before.composition.layers = structuredClone(record.composition.layers)
  const placement = placementOf(source, {
    startMs: 350,
    layerBindings: source.layerBindings.map(binding => ({ ...binding, layerId: 'collision-oracle-layer' })),
  })
  const candidate = structuredClone(record)
  candidate.composition.groupOccurrences[1] = { ...candidate.composition.groupOccurrences[1], ...structuredClone(placement) }
  if (operation === 'duplicate') {
    candidate.composition.groupOccurrences.push({
      ...candidate.composition.groupOccurrences[1], id: 'group-copy',
    })
    candidate.composition.groupOccurrences[1] = structuredClone(record.composition.groupOccurrences[1])
  }
  const preparedBefore = prepareShowV2ForCompile(record, linkedLookup())
  expect(preparedBefore.status, JSON.stringify(preparedBefore)).toBe('ready')
  expect(prepareShowV2ForCompile(reopen(candidate), linkedLookup())).toMatchObject({
    status: 'refused',
    issues: expect.arrayContaining([expect.objectContaining({ code: 'compiler-ineligible' })]),
  })

  const result = operation === 'move'
    ? moveShowGroupOccurrenceV2(record, {
        kind: 'move-occurrence', occurrenceId: source.id, ...placement,
      })
    : duplicateShowGroupOccurrenceV2(record, {
        kind: 'duplicate-occurrence', occurrenceId: source.id, newOccurrenceId: 'group-copy', ...placement,
      })
  expect(result).toMatchObject({ status: 'refused', code: 'compiler-ineligible' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
  expect(record).toEqual(before)
})

it.each([
  ['unsafe start', (_record: ShowRecordV2, placement: ShowGroupOccurrencePlacementV2) => { placement.startMs = Number.MAX_SAFE_INTEGER + 1 }],
  ['negative start', (_record: ShowRecordV2, placement: ShowGroupOccurrencePlacementV2) => { placement.startMs = -1 }],
  ['unknown Layout occurrence', (_record: ShowRecordV2, placement: ShowGroupOccurrencePlacementV2) => { placement.layoutOccurrenceId = 'missing' }],
  ['unknown Zone', (_record: ShowRecordV2, placement: ShowGroupOccurrencePlacementV2) => { placement.zoneId = 'missing' }],
  ['incomplete binding', (_record: ShowRecordV2, placement: ShowGroupOccurrencePlacementV2) => { placement.layerBindings = [] }],
  ['duplicate binding', (_record: ShowRecordV2, placement: ShowGroupOccurrencePlacementV2) => { placement.layerBindings.push(structuredClone(placement.layerBindings[0])) }],
  ['extraneous binding', (_record: ShowRecordV2, placement: ShowGroupOccurrencePlacementV2) => { placement.layerBindings.push({ definitionLayerId: 'missing', layerId: placement.layerBindings[0].layerId }) }],
  ['unknown destination Layer', (_record: ShowRecordV2, placement: ShowGroupOccurrencePlacementV2) => { placement.layerBindings[0].layerId = 'missing' }],
  ['collision', (_record: ShowRecordV2, placement: ShowGroupOccurrencePlacementV2) => { placement.startMs = 600 }],
  ['Show End', (_record: ShowRecordV2, placement: ShowGroupOccurrencePlacementV2) => { placement.startMs = 800 }],
] as const)('refuses move with %s atomically', (_partition, mutate) => {
  const record = linkedRecord()
  const source = record.composition.groupOccurrences[0]
  const placement = placementOf(source)
  mutate(record, placement)
  const result = moveShowGroupOccurrenceV2(record, { kind: 'move-occurrence', occurrenceId: source.id, ...placement })
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it.each([
  ['blank identity', '  ', 1000],
  ['owned identity', 'occ-1', 1000],
  ['materialized identity collision', 'occ-0', 1000],
  ['destination collision', 'fresh', 600],
] as const)('refuses duplicate with %s atomically', (_partition, newOccurrenceId, startMs) => {
  const record = linkedRecord()
  record.composition.showEndMs = 1400
  record.composition.layoutOccurrences[0].durationMs = 1400
  const source = record.composition.groupOccurrences[0]
  const result = duplicateShowGroupOccurrenceV2(record, {
    kind: 'duplicate-occurrence', occurrenceId: source.id, newOccurrenceId,
    ...placementOf(source, { startMs }),
  })
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('moves a held occurrence across an explicit Layout boundary while preserving its local choreography', () => {
  const record = linkedRecord()
  record.composition.showEndMs = 1400
  record.composition.layoutOccurrences[0].durationMs = 700
  record.composition.layoutOccurrences.push({
    ...structuredClone(record.composition.layoutOccurrences[0]), id: 'layout-later', startMs: 700, durationMs: 700,
  })
  const source = record.composition.groupOccurrences[0]
  const result = moveShowGroupOccurrenceV2(record, {
    kind: 'move-occurrence', occurrenceId: source.id,
    ...placementOf(source, { startMs: 1000, layoutOccurrenceId: 'layout-later' }),
  })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  const reopened = reopen(result.record)
  expect(reopened.composition.groupOccurrences.find(value => value.id === source.id)).toMatchObject({
    startMs: 1000, layoutOccurrenceId: 'layout-later', holds: source.holds,
  })
  expect(materializeShowGroupsV2(reopened).composition.transitions.find(value => value.id === 'occ-0:local-crossfade')).toMatchObject({
    id: 'occ-0:local-crossfade', durationMs: 100,
  })
})

it('moves to a different Zone only with a complete destination Layer plan and available routing', () => {
  const record = linkedRecord()
  record.zones.push({ ...structuredClone(record.zones[0]), id: 'zone-b', name: 'Second' })
  const source = record.composition.groupOccurrences[0]
  const sourceLayer = record.composition.layers.find(layer => layer.id === source.layerBindings[0].layerId)!
  record.composition.layers.push({ ...structuredClone(sourceLayer), id: 'zone-b-layer', zoneId: 'zone-b' })
  record.zoneLayouts[0].logical = { kind: 'split', zoneIds: ['zone', 'zone-b'], axis: 'x' }
  const result = moveShowGroupOccurrenceV2(record, {
    kind: 'move-occurrence', occurrenceId: source.id,
    ...placementOf(source, {
      zoneId: 'zone-b',
      layerBindings: source.layerBindings.map(binding => ({ ...binding, layerId: 'zone-b-layer' })),
    }),
  })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  const reopened = reopen(result.record)
  expect(reopened.composition.groupOccurrences.find(value => value.id === source.id)).toMatchObject({
    zoneId: 'zone-b', layerBindings: [{ layerId: 'zone-b-layer' }],
  })
  expect(materializeShowGroupsV2(reopened).composition.clips
    .filter(clip => clip.id.startsWith('occ-0:'))
    .every(clip => clip.zoneId === 'zone-b' && clip.layerId === 'zone-b-layer')).toBe(true)
})

it('refuses a valid destination Zone that is unavailable in the owning Layout', () => {
  const record = linkedRecord()
  record.zones.push({ ...structuredClone(record.zones[0]), id: 'zone-b', name: 'Second' })
  const source = record.composition.groupOccurrences[0]
  const sourceLayer = record.composition.layers.find(layer => layer.id === source.layerBindings[0].layerId)!
  record.composition.layers.push({ ...structuredClone(sourceLayer), id: 'zone-b-layer', zoneId: 'zone-b' })
  const result = moveShowGroupOccurrenceV2(record, {
    kind: 'move-occurrence', occurrenceId: source.id,
    ...placementOf(source, {
      zoneId: 'zone-b',
      layerBindings: source.layerBindings.map(binding => ({ ...binding, layerId: 'zone-b-layer' })),
    }),
  })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-result' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('refuses an overlapping linked duplicate of an effective instance track but accepts exact half-open adjacency', () => {
  const record = linkedRecord()
  record.composition.showEndMs = 1400
  record.composition.layoutOccurrences[0].durationMs = 1400
  const definition = record.composition.groupDefinitions[0]
  definition.propertyTracks[0].target = { kind: 'instance-time-scale', instanceId: 'child' }
  const source = record.composition.groupOccurrences[0]
  const sourceLayer = record.composition.layers.find(layer => layer.id === source.layerBindings[0].layerId)!
  record.composition.layers.push({ ...structuredClone(sourceLayer), id: 'copy-layer', rank: sourceLayer.rank + 1 })
  const bindings = source.layerBindings.map(binding => ({ ...binding, layerId: 'copy-layer' }))

  const overlapping = duplicateShowGroupOccurrenceV2(record, {
    kind: 'duplicate-occurrence', occurrenceId: source.id, newOccurrenceId: 'overlapping',
    ...placementOf(source, { startMs: 250, layerBindings: bindings }),
  })
  expect(overlapping).toMatchObject({ status: 'refused', code: 'invalid-result' })
  expect(overlapping.record).toBe(record)
  expectEmptyAffected(overlapping)

  const adjacent = duplicateShowGroupOccurrenceV2(record, {
    kind: 'duplicate-occurrence', occurrenceId: source.id, newOccurrenceId: 'adjacent',
    ...placementOf(source, { startMs: 900, layerBindings: bindings }),
  })
  expect(adjacent.status, adjacent.status === 'refused' ? adjacent.message : undefined).toBe('changed')
  if (adjacent.status !== 'changed') return
  const materialized = materializeShowGroupsV2(reopen(adjacent.record))
  expect(materialized.composition.propertyTracks
    .filter(track => track.target.kind === 'instance-time-scale')
    .map(track => [track.id, track.activeStartMs, track.activeDurationMs])).toEqual([
      ['occ-0:opacity', 200, 325],
      ['occ-1:opacity', 600, 300],
      ['adjacent:opacity', 900, 325],
  ])
})

it('preserves explicit runtime authority and coalesces simultaneous linked Restart entries', () => {
  const record = linkedRecord()
  // This case owns Restart coalescing. Simultaneous positive Transition
  // windows are independently compiler-ineligible under RL10.
  record.composition.groupDefinitions[0].transitions = []
  const source = record.composition.groupOccurrences[0]
  source.instanceBindings = { child: 'instance' }
  record.composition.groupOccurrences[1].instanceBindings = { child: 'instance' }
  const authoritative = structuredClone(record.composition.patternInstances[0])
  authoritative.controlTargets = { gain: 0.375 }
  record.composition.patternInstances[0] = authoritative
  record.composition.groupDefinitions[0].patternInstances[0].controlTargets = { stale: 1 }
  const sourceLayer = record.composition.layers.find(layer => layer.id === source.layerBindings[0].layerId)!
  record.composition.layers.push({ ...structuredClone(sourceLayer), id: 'simultaneous-layer', rank: sourceLayer.rank + 1 })
  const result = duplicateShowGroupOccurrenceV2(record, {
    kind: 'duplicate-occurrence', occurrenceId: source.id, newOccurrenceId: 'simultaneous',
    ...placementOf(source, {
      layerBindings: source.layerBindings.map(binding => ({ ...binding, layerId: 'simultaneous-layer' })),
    }),
  })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  const reopened = reopen(result.record)
  const duplicate = reopened.composition.groupOccurrences.find(value => value.id === 'simultaneous')!
  expect(duplicate.instanceBindings).toEqual({ child: 'instance' })
  expect(reopened.composition.patternInstances).toEqual([authoritative])
  expect(groupRuntimeBindings(reopened).filter(value => value.runtimeId === 'instance')).toHaveLength(3)
  expect(materializeShowGroupsV2(reopened).composition.patternInstances.find(value => value.id === 'instance')).toEqual(authoritative)
  const restarts = deriveShowRestartEventsV2(reopened)
  expect(restarts).toMatchObject({ status: 'derived' })
  if (restarts.status === 'derived') {
    expect(restarts.events.find(event => event.atMs === 200)).toMatchObject({
      instanceId: 'instance', clipIds: ['occ-0:pulse', 'simultaneous:pulse'],
    })
  }
})

it('refuses a fresh occurrence identity whose derived Clip identity is already persisted', () => {
  const record = linkedRecord()
  record.composition.showEndMs = 1400
  record.composition.layoutOccurrences[0].durationMs = 1400
  record.composition.clips[0].id = 'fresh:pulse'
  const source = record.composition.groupOccurrences[0]
  const result = duplicateShowGroupOccurrenceV2(record, {
    kind: 'duplicate-occurrence', occurrenceId: source.id, newOccurrenceId: 'fresh',
    ...placementOf(source, { startMs: 1000 }),
  })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-result' })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('ungroups one held occurrence into its exact ordinary projection without cloning its runtime', () => {
  const record = linkedRecord()
  const before = structuredClone(record)
  const selected = record.composition.groupOccurrences[0]
  const definition = record.composition.groupDefinitions[0]
  const effectiveBefore = materializeShowGroupsV2(record)
  const runtimeId = 'group:["group","child"]'
  const useCount = effectiveShowInstanceUseCountV2(record, runtimeId)
  const restartBefore = deriveShowRestartEventsV2(record)
  const expectedClipIds = definition.clips.map(clip => `${selected.id}:${clip.id}`)
  const expectedTransitionIds = definition.transitions.map(transition => `${selected.id}:${transition.id}`)
  const expectedTrackIds = definition.propertyTracks.map(track => `${selected.id}:${track.id}`)
  const expectedClips = effectiveBefore.composition.clips.filter(clip => expectedClipIds.includes(clip.id))
  const expectedTransitions = effectiveBefore.composition.transitions.filter(transition => expectedTransitionIds.includes(transition.id))
  const expectedTracks = effectiveBefore.composition.propertyTracks.filter(track => expectedTrackIds.includes(track.id))

  const result = ungroupShowGroupOccurrenceV2(record, { kind: 'ungroup-occurrence', occurrenceId: selected.id })

  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(record).toEqual(before)
  expect(result.record.composition.groupOccurrences).toEqual([before.composition.groupOccurrences[1]])
  expect(result.record.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(result.record.composition.clips.filter(clip => expectedClipIds.includes(clip.id))).toEqual(expectedClips)
  expect(result.record.composition.transitions.filter(transition => expectedTransitionIds.includes(transition.id))).toEqual(expectedTransitions)
  expect(result.record.composition.propertyTracks.filter(track => expectedTrackIds.includes(track.id))).toEqual(expectedTracks)
  expect(result.record.composition.patternInstances.find(instance => instance.id === runtimeId)).toEqual({
    ...definition.patternInstances[0], id: runtimeId,
  })
  const addedClip = result.record.composition.clips[result.record.composition.clips.length - 1]
  const expectedLastClip = expectedClips[expectedClips.length - 1]
  expect(addedClip).not.toBe(expectedLastClip)
  expect(addedClip.appearance.keys).not.toBe(expectedLastClip.appearance.keys)
  const reopened = reopen(result.record)
  expect(effectiveShowInstanceUseCountV2(reopened, runtimeId)).toBe(useCount)
  expect(deriveShowRestartEventsV2(reopened)).toEqual(restartBefore)
  expect(result).toMatchObject({
    affectedClipIds: expectedClipIds.sort(),
    affectedInstanceIds: [runtimeId],
    affectedTransitionIds: expectedTransitionIds.sort(),
    affectedTrackIds: expectedTrackIds.sort(),
    affectedGroupDefinitionIds: [],
    affectedGroupOccurrenceIds: [selected.id],
    affectedLayerIds: [],
    hoistedInstanceIds: [runtimeId],
    removedIds: [selected.id],
  })
  expect(result.affectedAppearanceKeyIds).toEqual(expectedClips.flatMap(clip => clip.appearance.keys.map(key => key.id)).sort())
  expect(result.affectedPropertyKeyIds).toEqual(expectedTracks.flatMap(track => track.keyframes.map(key => key.id)).sort())
  expect(result.affectedLayoutDefinitionIds).toEqual([])
  expect(result.affectedLayoutOccurrenceIds).toEqual([])
  expect(result.affectedMarkerIds).toEqual([])
  expect(result.discardedControlTargets).toEqual([])
})

it('retains an unused definition and an existing authoritative instance when ungrouping its final occurrence', () => {
  const record = linkedRecord()
  const selected = record.composition.groupOccurrences[0]
  record.composition.groupOccurrences = [selected]
  selected.instanceBindings = { child: 'instance' }
  const authoritative = structuredClone(record.composition.patternInstances[0])
  authoritative.controlTargets = { gain: 0.625 }
  record.composition.patternInstances = [authoritative]
  record.composition.groupDefinitions[0].patternInstances[0].controlTargets = { stale: 1 }
  const definition = structuredClone(record.composition.groupDefinitions[0])

  const result = ungroupShowGroupOccurrenceV2(record, { kind: 'ungroup-occurrence', occurrenceId: selected.id })

  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.record.composition.groupOccurrences).toEqual([])
  expect(result.record.composition.groupDefinitions).toEqual([definition])
  expect(result.record.composition.patternInstances).toEqual([authoritative])
  expect(result.affectedInstanceIds).toEqual([])
  expect(result.hoistedInstanceIds).toEqual([])
  expect(result.affectedGroupDefinitionIds).toEqual([])
  expect(result.removedIds).toEqual([selected.id])
  expect(materializeShowGroupsV2(reopen(result.record)).composition.patternInstances.find(instance => instance.id === 'instance')).toEqual(authoritative)
})

it('hoists one explicit-unowned effective runtime and preserves a linked sibling byte-for-byte', () => {
  const record = linkedRecord()
  const selected = record.composition.groupOccurrences[0]
  const sibling = structuredClone(record.composition.groupOccurrences[1])
  selected.instanceBindings = { child: 'shared-unowned' }
  record.composition.groupOccurrences[1].instanceBindings = { child: 'shared-unowned' }
  const definition = record.composition.groupDefinitions[0]

  const result = ungroupShowGroupOccurrenceV2(record, { kind: 'ungroup-occurrence', occurrenceId: selected.id })

  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.record.composition.groupOccurrences).toEqual([{ ...sibling, instanceBindings: { child: 'shared-unowned' } }])
  expect(result.record.composition.patternInstances.filter(instance => instance.id === 'shared-unowned')).toEqual([{
    ...definition.patternInstances[0], id: 'shared-unowned',
  }])
  expect(result.affectedInstanceIds).toEqual(['shared-unowned'])
  expect(result.hoistedInstanceIds).toEqual(['shared-unowned'])
  expect(groupRuntimeBindings(result.record).find(binding => binding.occurrenceId === sibling.id)).toMatchObject({
    runtimeId: 'shared-unowned', authority: 'composition', instance: { id: 'shared-unowned' },
  })
})

it('reports repeated owner-scoped nested key IDs once per persisted key without claiming global uniqueness', () => {
  const record = linkedRecord()
  const definition = record.composition.groupDefinitions[0]
  definition.clips.forEach(clip => {
    clip.appearance.keys = [{ ...structuredClone(clip.appearance.keys[0]), id: 'same-appearance' }]
  })
  definition.propertyTracks[0].keyframes.forEach(key => { key.id = 'same-property' })
  definition.propertyTracks[0].keyframes[1].id = 'same-property-end'
  definition.propertyTracks.push({
    ...structuredClone(definition.propertyTracks[0]), id: 'opacity-answer',
    target: { kind: 'clip-opacity', clipId: 'answer' },
  })
  const effective = materializeShowGroupsV2(record)
  const expectedAppearanceIds = effective.composition.clips
    .filter(clip => clip.id === 'occ-0:pulse' || clip.id === 'occ-0:answer')
    .flatMap(clip => clip.appearance.keys.map(key => key.id)).sort()
  const expectedPropertyIds = effective.composition.propertyTracks
    .filter(track => track.id === 'occ-0:opacity' || track.id === 'occ-0:opacity-answer')
    .flatMap(track => track.keyframes.map(key => key.id)).sort()
  const result = ungroupShowGroupOccurrenceV2(record, { kind: 'ungroup-occurrence', occurrenceId: 'occ-0' })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.affectedAppearanceKeyIds).toEqual(expectedAppearanceIds)
  expect(result.affectedAppearanceKeyIds.filter(id => id === 'occ-0:same-appearance')).toHaveLength(2)
  expect(result.affectedPropertyKeyIds).toEqual(expectedPropertyIds)
  expect(result.affectedPropertyKeyIds.filter(id => id === 'occ-0:same-property')).toHaveLength(2)
  expect(result.affectedPropertyKeyIds.filter(id => id === 'occ-0:same-property-end')).toHaveLength(2)
  expect(reopen(result.record).composition.clips.filter(clip => clip.id.startsWith('occ-0:'))).toHaveLength(2)
})

it('persists translated appearance and an exact nonlinear Property curve through a held Ungroup', () => {
  const record = linkedRecord()
  const occurrence = record.composition.groupOccurrences[0]
  occurrence.translationX = 0.2
  occurrence.translationY = -0.1
  const definition = record.composition.groupDefinitions[0]
  definition.clips[0].appearance.keys[0].value.transform = {
    positionX: 0.05, positionY: 0.1, rotation: 0, scaleX: 1, scaleY: 1,
  }
  definition.clips[0].appearance.keys[0].value.aperture = {
    enabled: true, x: 0.1, y: 0.2, width: 0.5, height: 0.5, aperture: 'ellipse',
  }
  const track = definition.propertyTracks[0]
  track.target = { kind: 'clip-transform', clipId: 'pulse', property: 'positionX' }
  track.keyframes = [
    {
      id: 'curve-start', timeMs: 0, value: 0.05, easing: { curve: 'quadratic', direction: 'in' },
      curveSegment: {
        baseValue: 0.05, deltaValue: 0.4, easing: { curve: 'quadratic', direction: 'in' },
        sourceDurationMs: 100, elapsedOffsetMs: 0,
      },
    },
    { id: 'curve-end', timeMs: 100, value: 0.45, easing: { curve: 'linear' } },
  ]
  const expected = materializeShowGroupsV2(record)
  const expectedClip = expected.composition.clips.find(clip => clip.id === 'occ-0:pulse')!
  const expectedTrack = expected.composition.propertyTracks.find(value => value.id === 'occ-0:opacity')!

  const result = ungroupShowGroupOccurrenceV2(record, { kind: 'ungroup-occurrence', occurrenceId: occurrence.id })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  const reopened = reopen(result.record)
  const actualClip = reopened.composition.clips.find(clip => clip.id === expectedClip.id)!
  const actualTrack = reopened.composition.propertyTracks.find(value => value.id === expectedTrack.id)!
  expect(actualClip).toEqual(expectedClip)
  expect(actualClip.appearance.keys[0].value.transform).toMatchObject({ positionX: 0.25, positionY: 0 })
  expect(actualClip.appearance.keys[0].value.aperture?.x).toBeCloseTo(0.3, 12)
  expect(actualClip.appearance.keys[0].value.aperture?.y).toBeCloseTo(0.1, 12)
  expect(actualTrack).toEqual(expectedTrack)
  expect(actualTrack.keyframes[0].curveSegment?.baseValue).toBeCloseTo(0.25, 12)
  expect(evaluateShowPropertyTrackV2(actualTrack, 225)).toBeCloseTo(0.275, 12)
})

it('selects exact materialized IDs when another occurrence ID shares its prefix', () => {
  const record = linkedRecord()
  record.composition.groupOccurrences[0].id = 'a'
  record.composition.groupOccurrences[1].id = 'a:b'
  const sibling = structuredClone(record.composition.groupOccurrences[1])
  const result = ungroupShowGroupOccurrenceV2(record, { kind: 'ungroup-occurrence', occurrenceId: 'a' })
  expect(result.status, result.status === 'refused' ? result.message : undefined).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.record.composition.groupOccurrences).toEqual([sibling])
  expect(result.affectedClipIds).toEqual(['a:answer', 'a:pulse'])
  expect(result.record.composition.clips.some(clip => clip.id.startsWith('a:b:'))).toBe(false)
  expect(materializeShowGroupsV2(reopen(result.record)).composition.clips.filter(clip => clip.id.startsWith('a:b:'))).toHaveLength(2)
})

it.each([
  ['missing occurrence', (record: ShowRecordV2) => ungroupShowGroupOccurrenceV2(record, { kind: 'ungroup-occurrence', occurrenceId: 'missing' }), 'missing-occurrence'],
  ['invalid projected identity collision', (record: ShowRecordV2) => {
    record.composition.clips[0].id = 'occ-0:pulse'
    return ungroupShowGroupOccurrenceV2(record, { kind: 'ungroup-occurrence', occurrenceId: 'occ-0' })
  }, 'invalid-record'],
] as const)('refuses Ungroup with %s atomically', (_partition, edit, code) => {
  const record = linkedRecord()
  const result = edit(record)
  expect(result).toMatchObject({ status: 'refused', code })
  expect(result.record).toBe(record)
  expectEmptyAffected(result)
})

it('preserves runtime authority through Make Unique, move, linked duplicate and selected Ungroup', () => {
  const record = linkedRecord()
  record.composition.showEndMs = 1400
  record.composition.layoutOccurrences[0].durationMs = 1400
  const definition = record.composition.groupDefinitions[0]
  const unique = makeShowGroupUniqueV2(record, {
    kind: 'make-unique', occurrenceId: 'occ-0', identities: identityPlan(definition),
  })
  expect(unique.status, unique.status === 'refused' ? unique.message : undefined).toBe('changed')
  if (unique.status !== 'changed') return
  const uniqueOccurrence = unique.record.composition.groupOccurrences.find(value => value.id === 'occ-0')!
  const moved = moveShowGroupOccurrenceV2(unique.record, {
    kind: 'move-occurrence', occurrenceId: uniqueOccurrence.id,
    ...placementOf(uniqueOccurrence, { startMs: 250 }),
  })
  expect(moved.status, moved.status === 'refused' ? moved.message : undefined).toBe('changed')
  if (moved.status !== 'changed') return
  const movedOccurrence = moved.record.composition.groupOccurrences.find(value => value.id === 'occ-0')!
  const duplicated = duplicateShowGroupOccurrenceV2(moved.record, {
    kind: 'duplicate-occurrence', occurrenceId: movedOccurrence.id, newOccurrenceId: 'occ-copy',
    ...placementOf(movedOccurrence, { startMs: 1000 }),
  })
  expect(duplicated.status, duplicated.status === 'refused' ? duplicated.message : undefined).toBe('changed')
  if (duplicated.status !== 'changed') return
  const runtimeId = 'group:["group","child"]'
  const useCount = effectiveShowInstanceUseCountV2(duplicated.record, runtimeId)
  const ungrouped = ungroupShowGroupOccurrenceV2(duplicated.record, {
    kind: 'ungroup-occurrence', occurrenceId: 'occ-copy',
  })
  expect(ungrouped.status, ungrouped.status === 'refused' ? ungrouped.message : undefined).toBe('changed')
  if (ungrouped.status !== 'changed') return
  const reopened = reopen(ungrouped.record)
  expect(reopened.composition.groupOccurrences.map(value => value.id).sort()).toEqual(['occ-0', 'occ-1'])
  expect(reopened.composition.groupDefinitions.map(value => value.id).sort()).toEqual(['group', 'group:unique'])
  expect(effectiveShowInstanceUseCountV2(reopened, runtimeId)).toBe(useCount)
  expect(reopened.composition.clips.filter(clip => clip.id.startsWith('occ-copy:'))).toHaveLength(2)
  expect(groupRuntimeBindings(reopened).filter(binding => binding.runtimeId === runtimeId)).toHaveLength(2)
})

it.each(['fast', 'fidelity'] as const)('preserves reopened generated output and shared Restart state after Ungroup in %s mode', fidelity => {
  const before = linkedRecord()
  before.composition.groupDefinitions[0].clips[0].appearance.keys = [before.composition.groupDefinitions[0].clips[0].appearance.keys[0]]
  before.composition.groupDefinitions[0].propertyTracks = []
  const changed = ungroupShowGroupOccurrenceV2(before, { kind: 'ungroup-occurrence', occurrenceId: 'occ-0' })
  expect(changed.status, changed.status === 'refused' ? changed.message : undefined).toBe('changed')
  if (changed.status !== 'changed') return
  const after = reopen(changed.record)
  const runtimeId = 'group:["group","child"]'
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: code, [runtimeId]: code }, stageDimension: 2 as const }
  const preparedBefore = prepareShowV2ForCompile(reopen(before), lookup, { libraries: LIBRARIES })
  const preparedAfter = prepareShowV2ForCompile(after, lookup, { libraries: LIBRARIES })
  expect(preparedBefore.status, JSON.stringify(preparedBefore)).toBe('ready')
  expect(preparedAfter.status, JSON.stringify(preparedAfter)).toBe('ready')
  if (preparedBefore.status !== 'ready' || preparedAfter.status !== 'ready') return
  expect(preparedAfter.recipe.restartEvents).toEqual(preparedBefore.recipe.restartEvents)
  expect(Object.values(preparedAfter.provenance.runtimeInstanceIdByClipId).filter(id => id === runtimeId)).toHaveLength(4)
  const artifactBefore = compileShow(preparedBefore.recipe, LIBRARIES)
  const artifactAfter = compileShow(preparedAfter.recipe, LIBRARIES)
  const reopenedBefore = parseEpe(buildShowEpeExport(convertibleV1Show(), artifactBefore.code, {
    id: `ungroup-before-${fidelity}`, stampedAt: '2026-09-15T00:00:00.000Z',
  }).text)
  const reopenedAfter = parseEpe(buildShowEpeExport(convertibleV1Show(), artifactAfter.code, {
    id: `ungroup-after-${fidelity}`, stampedAt: '2026-09-15T00:00:00.000Z',
  }).text)
  expect(reopenedBefore).toMatchObject({ stamp: { kind: 'show' } })
  expect(reopenedAfter).toMatchObject({ stamp: { kind: 'show' } })
  expect(artifactAfter.summary.clips.map(clip => clip.id).sort()).toEqual(artifactBefore.summary.clips.map(clip => clip.id).sort())
  const options = {
    randomSeed: 1038,
    fidelity,
    mapPoints: [{ sample: [0.5, 0.5] as [number, number], pos: [0.5, 0.5] as [number, number] }],
  }
  const runtimeBefore = createFastReplayRuntime({ ...artifactBefore, code: reopenedBefore.src, dimension: 2 }, options)
  const runtimeAfter = createFastReplayRuntime({ ...artifactAfter, code: reopenedAfter.src, dimension: 2 }, options)
  for (const [index, atMs] of [0, 199, 200, 249, 250, 324, 525, 599, 600, 899].entries()) {
    const advance = { stepMs: 1, forceFullIntermediateRender: true }
    const actual = index === 0 ? runtimeAfter.renderCurrentFrame() : runtimeAfter.advanceTo(atMs, advance)
    const oracle = index === 0 ? runtimeBefore.renderCurrentFrame() : runtimeBefore.advanceTo(atMs, advance)
    expect(Array.from(actual.frame), `${fidelity} frame at ${atMs}`).toEqual(Array.from(oracle.frame))
    expect(actual.exports, `${fidelity} state at ${atMs}`).toEqual(oracle.exports)
  }
})

it.each(['fast', 'fidelity'] as const)('reopens and renders independently authored move plus linked duplicate choreography in %s mode', fidelity => {
  const source = linkedRecord()
  source.composition.showEndMs = 1400
  source.composition.layoutOccurrences[0].durationMs = 1400
  source.composition.groupDefinitions[0].clips[0].appearance.keys = [source.composition.groupDefinitions[0].clips[0].appearance.keys[0]]
  source.composition.groupDefinitions[0].propertyTracks = []
  const first = source.composition.groupOccurrences[0]
  const moved = moveShowGroupOccurrenceV2(source, {
    kind: 'move-occurrence', occurrenceId: first.id, ...placementOf(first, { startMs: 250 }),
  })
  expect(moved.status, moved.status === 'refused' ? moved.message : undefined).toBe('changed')
  if (moved.status !== 'changed') return
  const movedOccurrence = moved.record.composition.groupOccurrences.find(value => value.id === first.id)!
  const duplicated = duplicateShowGroupOccurrenceV2(moved.record, {
    kind: 'duplicate-occurrence', occurrenceId: first.id, newOccurrenceId: 'occ-copy',
    ...placementOf(movedOccurrence, { startMs: 1000 }),
  })
  expect(duplicated.status, duplicated.status === 'refused' ? duplicated.message : undefined).toBe('changed')
  if (duplicated.status !== 'changed') return
  const actualRecord = reopen(duplicated.record)

  const oracleRecord = structuredClone(source)
  oracleRecord.composition.groupOccurrences[0].startMs = 250
  oracleRecord.composition.groupOccurrences.push({
    ...structuredClone(oracleRecord.composition.groupOccurrences[0]), id: 'occ-copy', startMs: 1000,
  })
  const runtimeId = 'group:["group","child"]'
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: code, [runtimeId]: code }, stageDimension: 2 as const }
  const actualPrepared = prepareShowV2ForCompile(actualRecord, lookup, { libraries: LIBRARIES })
  const oraclePrepared = prepareShowV2ForCompile(reopen(oracleRecord), lookup, { libraries: LIBRARIES })
  expect(actualPrepared.status, JSON.stringify(actualPrepared)).toBe('ready')
  expect(oraclePrepared.status, JSON.stringify(oraclePrepared)).toBe('ready')
  if (actualPrepared.status !== 'ready' || oraclePrepared.status !== 'ready') return
  expect((actualPrepared.recipe.restartEvents ?? []).map(event => event.atMs)).toEqual([250, 600, 1000])
  expect(actualPrepared.recipe.restartEvents).toEqual(oraclePrepared.recipe.restartEvents)
  expect(Object.values(actualPrepared.provenance.runtimeInstanceIdByClipId).filter(id => id === runtimeId)).toHaveLength(6)
  const actualArtifact = compileShow(actualPrepared.recipe, LIBRARIES)
  const oracleArtifact = compileShow(oraclePrepared.recipe, LIBRARIES)
  expect(actualArtifact.code).toBe(oracleArtifact.code)
  const reopenedArtifact = parseEpe(buildShowEpeExport(convertibleV1Show(), actualArtifact.code, {
    id: `group-move-duplicate-${fidelity}`, stampedAt: '2026-09-15T00:00:00.000Z',
  }).text)
  expect(reopenedArtifact).toMatchObject({ stamp: { kind: 'show' } })
  const options = {
    randomSeed: 1038,
    fidelity,
    mapPoints: [{ sample: [0.5, 0.5] as [number, number], pos: [0.5, 0.5] as [number, number] }],
  }
  const actualRuntime = createFastReplayRuntime({ ...actualArtifact, code: reopenedArtifact.src, dimension: 2 }, options)
  const oracleRuntime = createFastReplayRuntime({ ...oracleArtifact, dimension: 2 }, options)
  for (const [index, atMs] of [0, 249, 250, 374, 575, 599, 600, 899, 999, 1000, 1324].entries()) {
    const advance = { stepMs: 1, forceFullIntermediateRender: true }
    const actual = index === 0 ? actualRuntime.renderCurrentFrame() : actualRuntime.advanceTo(atMs, advance)
    const oracle = index === 0 ? oracleRuntime.renderCurrentFrame() : oracleRuntime.advanceTo(atMs, advance)
    expect(Array.from(actual.frame), `${fidelity} frame at ${atMs}`).toEqual(Array.from(oracle.frame))
    expect(actual.exports, `${fidelity} state at ${atMs}`).toEqual(oracle.exports)
  }
})

it.each(['fast', 'fidelity'] as const)('keeps compiled runtime sharing, held timing and Restart semantics in %s artifacts', fidelity => {
  const record = linkedRecord()
  const definition = record.composition.groupDefinitions[0]
  definition.clips[0].appearance.keys = [definition.clips[0].appearance.keys[0]]
  definition.propertyTracks = []
  const plan = identityPlan(definition)
  const before = reopen(record)
  const changed = makeShowGroupUniqueV2(before, { kind: 'make-unique', occurrenceId: 'occ-0', identities: plan })
  expect(changed.status, changed.status === 'refused' ? changed.message : undefined).toBe('changed')
  if (changed.status !== 'changed') return
  const after = reopen(changed.record)
  const runtimeId = 'group:["group","child"]'
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: code, [runtimeId]: code }, stageDimension: 2 as const }
  const preparedBefore = prepareShowV2ForCompile(before, lookup, { libraries: LIBRARIES })
  const preparedAfter = prepareShowV2ForCompile(after, lookup, { libraries: LIBRARIES })
  expect(preparedBefore.status, JSON.stringify(preparedBefore)).toBe('ready')
  expect(preparedAfter.status, JSON.stringify(preparedAfter)).toBe('ready')
  if (preparedBefore.status !== 'ready' || preparedAfter.status !== 'ready') return
  expect(Object.values(preparedBefore.provenance.runtimeInstanceIdByClipId).filter(id => id === runtimeId)).toHaveLength(4)
  expect(Object.values(preparedAfter.provenance.runtimeInstanceIdByClipId).filter(id => id === runtimeId)).toHaveLength(4)
  expect(preparedAfter.recipe.restartEvents).toEqual(preparedBefore.recipe.restartEvents)
  const artifactBefore = compileShow(preparedBefore.recipe, LIBRARIES)
  const artifactAfter = compileShow(preparedAfter.recipe, LIBRARIES)
  const reopenedBefore = parseEpe(buildShowEpeExport(convertibleV1Show(), artifactBefore.code, {
    id: 'group-before', stampedAt: '2026-09-15T00:00:00.000Z',
  }).text)
  const reopenedAfter = parseEpe(buildShowEpeExport(convertibleV1Show(), artifactAfter.code, {
    id: 'group-after', stampedAt: '2026-09-15T00:00:00.000Z',
  }).text)
  expect(reopenedBefore).toMatchObject({ stamp: { kind: 'show' } })
  expect(reopenedAfter).toMatchObject({ stamp: { kind: 'show' } })
  expect(artifactAfter.summary.clips.map(clip => clip.id).sort()).toEqual(artifactBefore.summary.clips.map(clip => clip.id).sort())
  const options = {
    randomSeed: 1038,
    fidelity,
    mapPoints: [{ sample: [0.5, 0.5] as [number, number], pos: [0.5, 0.5] as [number, number] }],
  }
  const runtimeBefore = createFastReplayRuntime({ ...artifactBefore, code: reopenedBefore.src, dimension: 2 }, options)
  const runtimeAfter = createFastReplayRuntime({ ...artifactAfter, code: reopenedAfter.src, dimension: 2 }, options)
  for (const [index, atMs] of [0, 199, 200, 249, 250, 324, 525, 599, 600, 899].entries()) {
    const advance = { stepMs: 1, forceFullIntermediateRender: true }
    const actual = index === 0 ? runtimeAfter.renderCurrentFrame() : runtimeAfter.advanceTo(atMs, advance)
    const oracle = index === 0 ? runtimeBefore.renderCurrentFrame() : runtimeBefore.advanceTo(atMs, advance)
    expect(Array.from(actual.frame), `${fidelity} frame at ${atMs}`).toEqual(Array.from(oracle.frame))
    expect(Object.keys(actual.exports), `${fidelity} state keys at ${atMs}`).toEqual(Object.keys(oracle.exports))
    for (const [name, value] of Object.entries(oracle.exports)) {
      const actualValue = actual.exports[name]
      if (typeof value === 'number' && typeof actualValue === 'number') {
        expect(actualValue, `${fidelity} ${name} at ${atMs}`).toBeCloseTo(value, 12)
      } else expect(actualValue, `${fidelity} ${name} at ${atMs}`).toEqual(value)
    }
  }
})

describe('set-definition-clip-timing (#1075 G2a)', () => {
  it('writes only that Clip while the linked occurrence shares the definition', () => {
    const record = linkedRecord()
    const before = structuredClone(record)
    const result = setShowGroupDefinitionClipTimingV2(record, {
      kind: 'set-definition-clip-timing', definitionId: 'group', clipId: 'answer', durationMs: 120,
    })
    expect(result.status, result.status === 'refused' ? result.message : '').toBe('changed')
    if (result.status !== 'changed') return
    const definition = result.record.composition.groupDefinitions.find(value => value.id === 'group')!
    expect(definition.clips.find(clip => clip.id === 'answer')).toMatchObject({ startMs: 200, durationMs: 120 })
    expect(definition.clips.find(clip => clip.id === 'pulse')).toMatchObject({ startMs: 0, durationMs: 100 })
    expect(result.affectedGroupDefinitionIds).toEqual(['group'])
    expect([...result.affectedGroupOccurrenceIds].sort()).toEqual(['occ-0', 'occ-1'])
    expect(result.record.composition.groupOccurrences.map(occurrence => occurrence.definitionId)).toEqual(['group', 'group'])
    expect(record).toEqual(before)
  })

  it('refuses an overlapping duration as invalid-result without writing', () => {
    const record = linkedRecord()
    const result = setShowGroupDefinitionClipTimingV2(record, {
      kind: 'set-definition-clip-timing', definitionId: 'group', clipId: 'pulse', durationMs: 250,
    })
    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.code).toBe('invalid-result')
    expect(result.record).toBe(record)
  })

  it('returns unchanged when the value already matches', () => {
    const record = linkedRecord()
    const result = setShowGroupDefinitionClipTimingV2(record, {
      kind: 'set-definition-clip-timing', definitionId: 'group', clipId: 'pulse', durationMs: 100,
    })
    expect(result.status).toBe('unchanged')
    expect(result.record).toBe(record)
  })

  it('refuses a missing Clip or definition', () => {
    const record = linkedRecord()
    const missingClip = setShowGroupDefinitionClipTimingV2(record, {
      kind: 'set-definition-clip-timing', definitionId: 'group', clipId: 'missing', durationMs: 80,
    })
    expect(missingClip.status).toBe('refused')
    const missingDefinition = setShowGroupDefinitionClipTimingV2(record, {
      kind: 'set-definition-clip-timing', definitionId: 'missing', clipId: 'pulse', durationMs: 80,
    })
    expect(missingDefinition.status).toBe('refused')
    expect(record.composition.groupDefinitions[0].clips.find(clip => clip.id === 'pulse')!.durationMs).toBe(100)
  })
})

function q6BaseShow(id: string): ShowRecord {
  const source = resizeBoundaryShow(id)
  const view = { mirror: false, phase: 0, brightness: 1 }
  source.composition!.patternInstances.push(
    { id: 'instance-overlay', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Overlay pulse', time: { timeScale: 1, timeOffsetMs: 0 } },
  )
  const zone = source.composition!.scenes[0].zones[0]
  zone.main = [{ id: 'clip-main', instanceId: 'resize-instance', startMs: 0, durationMs: 5_000, view }]
  zone.overlays = [{ id: 'overlay-1', name: 'Overlay 1', placements: [{ id: 'clip-overlay', instanceId: 'instance-overlay', startMs: 0, durationMs: 5_000, opacity: 1, view }] }]
  return source
}

function q6GroupedBefore(): ShowRecord {
  const show = q6BaseShow('g2dur-oracle')
  const selection = completeShowGroupSelection(show.composition!, ['clip-main', 'clip-overlay'])
  const plan = validateShowGroupSelection(show.composition!, selection)
  if (!plan.enabled) throw new Error('selection not enabled')
  let composition = createShowGroupFromSelection(show.composition!, { selection, definitionId: 'def-1', occurrenceId: 'occ-1', name: 'Group' })
  composition = duplicateShowGroupOccurrence(composition, { occurrenceId: 'occ-1', newOccurrenceId: 'occ-2', startMs: 5_000 })
  return { ...show, composition }
}

it('matches the v1-then-convert oracle for a 4000 ms Group Clip duration (#1075 G2a)', () => {
  const before = q6GroupedBefore()
  const edited = updateShowGroupClipInspector(before, { occurrenceId: 'occ-1', placementId: 'clip-main' }, { local: { durationMs: 4_000 } })
  expect(edited).not.toBe(before)
  const convertedEdited = convertShowRecordV1ToV2(edited)
  expect(convertedEdited.status).toBe('converted')
  if (convertedEdited.status !== 'converted') return
  expect(convertedEdited.record.composition.groupDefinitions[0].clips.find(clip => clip.id === 'clip-main')!.durationMs).toBe(4_000)
  expect(validateShowRecordV2(convertedEdited.record)).toEqual([])
  const convertedBefore = convertShowRecordV1ToV2(before)
  expect(convertedBefore.status).toBe('converted')
  if (convertedBefore.status !== 'converted') return
  const planned = planShowV2GroupOccurrenceEdit(convertedBefore.record, {
    kind: 'set-child-timing', occurrenceId: 'occ-1', clipId: 'clip-main', durationMs: 4_000,
  } as unknown as Parameters<typeof planShowV2GroupOccurrenceEdit>[1], () => { throw new Error('no allocate') })
  expect(planned.status).toBe('ready')
  if (planned.status !== 'ready') return
  const applied = setShowGroupDefinitionClipTimingV2(convertedBefore.record, planned.intent as unknown as Parameters<typeof setShowGroupDefinitionClipTimingV2>[1])
  expect(applied.status).toBe('changed')
  if (applied.status !== 'changed') return
  expect(applied.record.composition.groupDefinitions[0].clips).toEqual(convertedEdited.record.composition.groupDefinitions[0].clips)
})

it('stores a Show-time Start as definition-local time for an occurrence at 5000 ms (#1075 G2a)', () => {
  const converted = convertShowRecordV1ToV2(q6GroupedBefore())
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') return
  const planned = planShowV2GroupOccurrenceEdit(converted.record, {
    kind: 'set-child-timing', occurrenceId: 'occ-2', clipId: 'clip-main', startMs: 5_200,
  } as unknown as Parameters<typeof planShowV2GroupOccurrenceEdit>[1], () => { throw new Error('no allocate') })
  expect(planned.status).toBe('ready')
  if (planned.status !== 'ready') return
  expect(planned.intent).toMatchObject({ kind: 'set-definition-clip-timing', definitionId: 'def-1', clipId: 'clip-main', startMs: 200 })
  const applied = setShowGroupDefinitionClipTimingV2(converted.record, planned.intent as unknown as Parameters<typeof setShowGroupDefinitionClipTimingV2>[1])
  expect(applied.status, applied.status === 'refused' ? applied.message : '').toBe('changed')
  if (applied.status !== 'changed') return
  expect(applied.record.composition.groupDefinitions[0].clips.find(clip => clip.id === 'clip-main')!.startMs).toBe(200)
})

it('stores a Start inside a hold as the hold local time (#1075 G2a)', () => {
  const record = propertyEditGroupRecord()
  record.composition.showEndMs = 2_000
  record.composition.layoutOccurrences[0]!.durationMs = 2_000
  const occurrence = record.composition.groupOccurrences.find(value => value.id === 'occ-0')!
  const planned = planShowV2GroupOccurrenceEdit(record, {
    kind: 'set-child-timing', occurrenceId: occurrence.id, clipId: 'child', startMs: occurrence.startMs + 250,
  } as unknown as Parameters<typeof planShowV2GroupOccurrenceEdit>[1], () => { throw new Error('no allocate') })
  expect(planned.status).toBe('ready')
  if (planned.status !== 'ready') return
  expect(planned.intent).toMatchObject({ kind: 'set-definition-clip-timing', clipId: 'child', startMs: 200 })
  const applied = setShowGroupDefinitionClipTimingV2(record, planned.intent as unknown as Parameters<typeof setShowGroupDefinitionClipTimingV2>[1])
  expect(applied.status, applied.status === 'refused' ? applied.message : '').toBe('changed')
  if (applied.status !== 'changed') return
  expect(applied.record.composition.groupDefinitions[0].clips.find(clip => clip.id === 'child')!.startMs).toBe(200)
})

it('writes Group Clip brightness to the definition and both occurrences observe it (#1075 G2b)', () => {
  const converted = convertShowRecordV1ToV2(q6GroupedBefore())
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') return
  const before = converted.record
  const result = editShowGroupDefinitionClipAppearanceV2(before, {
    kind: 'edit-definition-clip-appearance', definitionId: 'def-1',
    appearance: { kind: 'appearance', clipId: 'clip-main', scope: 'whole-clip', patch: { view: { brightness: 0.5 } } },
  })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  expect(result.record.composition.groupDefinitions[0].clips.find(clip => clip.id === 'clip-main')!.appearance.keys[0].value.view.brightness).toBe(0.5)
  expect(result.record.composition.clips).toEqual(before.composition.clips)
  expect(result.record.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(result.record.composition.groupOccurrences).toEqual(before.composition.groupOccurrences)
  expect(result.record.composition.groupDefinitions[0].clips.find(clip => clip.id === 'clip-overlay')).toEqual(before.composition.groupDefinitions[0].clips.find(clip => clip.id === 'clip-overlay'))
  const materialized = materializeShowGroupsV2(result.record)
  expect(materialized.composition.clips.find(clip => clip.id === 'occ-2:clip-main')!.appearance.keys[0].value.view.brightness).toBe(0.5)
  expect(result.affectedGroupDefinitionIds).toEqual(['def-1'])
  expect([...result.affectedGroupOccurrenceIds].sort()).toEqual(['occ-1', 'occ-2'])
})

it('returns unchanged for an identical Group Clip appearance value (#1075 G2b)', () => {
  const converted = convertShowRecordV1ToV2(q6GroupedBefore())
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') return
  const before = converted.record
  const current = before.composition.groupDefinitions[0].clips.find(clip => clip.id === 'clip-main')!.appearance.keys[0].value.view.brightness
  const result = editShowGroupDefinitionClipAppearanceV2(before, {
    kind: 'edit-definition-clip-appearance', definitionId: 'def-1',
    appearance: { kind: 'appearance', clipId: 'clip-main', scope: 'whole-clip', patch: { view: { brightness: current } } },
  })
  expect(result.status).toBe('unchanged')
  expect(result.record).toBe(before)
})

it('refuses Group Clip appearance for a missing definition without writing (#1075 G2b)', () => {
  const converted = convertShowRecordV1ToV2(q6GroupedBefore())
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') return
  const before = converted.record
  const snapshot = structuredClone(before)
  const result = editShowGroupDefinitionClipAppearanceV2(before, {
    kind: 'edit-definition-clip-appearance', definitionId: 'missing',
    appearance: { kind: 'appearance', clipId: 'clip-main', scope: 'whole-clip', patch: { view: { brightness: 0.5 } } },
  })
  expect(result.status).toBe('refused')
  expect(result.record).toBe(before)
  expect(before).toEqual(snapshot)
})

it('refuses an adapter appearance refusal without writing (#1075 G2b)', () => {
  const converted = convertShowRecordV1ToV2(q6GroupedBefore())
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') return
  const before = converted.record
  const snapshot = structuredClone(before)
  const result = editShowGroupDefinitionClipAppearanceV2(before, {
    kind: 'edit-definition-clip-appearance', definitionId: 'def-1',
    appearance: { kind: 'appearance', clipId: 'missing', scope: 'whole-clip', patch: { view: { brightness: 0.5 } } },
  })
  expect(result.status).toBe('refused')
  expect(result.record).toBe(before)
  expect(before).toEqual(snapshot)
})

function g4aV1Before(withTrack = false): ShowRecord {
  const source = convertibleV1Show()
  source.scenes[0].durationMs = 30000
  source.composition!.durationMs = 30000
  source.composition!.scenes[0].zones[0].overlays = [{ id: 'ov1', name: 'ov', placements: [] }]
  const inst = { ...structuredClone(source.composition!.patternInstances[0]), id: 'g-inst' }
  source.composition!.groupDefinitions = [{
    id: 'def-1',
    name: 'D',
    patternInstances: [inst],
    placements: [
      { id: 'g-a', instanceId: 'g-inst', layerOffset: 0, startMs: 0, durationMs: 4000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
      { id: 'g-b', instanceId: 'g-inst', layerOffset: 0, startMs: 4000, durationMs: 3000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
    ],
    ...(withTrack ? {
      propertyTracks: [{
        id: 'trk',
        target: { kind: 'placement-opacity', placementId: 'g-b' },
        keyframes: [
          { id: 'k1', timeMs: 4000, value: 0.2, easing: { curve: 'linear' } },
          { id: 'k2', timeMs: 4500, value: 0.8, easing: { curve: 'linear' } },
        ],
      }],
    } : {}),
  }]
  source.composition!.groupOccurrences = [
    { id: 'occ-1', definitionId: 'def-1', sceneId: 'scene-a', zoneId: 'zone', startMs: 0, baseLayer: 1, translationX: 0, translationY: 0 },
    { id: 'occ-2', definitionId: 'def-1', sceneId: 'scene-a', zoneId: 'zone', startMs: 10000, baseLayer: 1, translationX: 0, translationY: 0 },
  ]
  return source
}

function g4aV2Before(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(g4aV1Before(false))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

function g4aInsertV2Transition(layerId: string) {
  return {
    id: 'lt-1',
    kind: 'crossfade' as const,
    durationMs: 1000,
    easing: { curve: 'linear' as const },
    crossfadePolicy: 'live-live' as const,
    participants: [{ id: 'lt-1:participant', zoneId: 'definition-zone', layerId, fromClipId: 'g-a', toClipId: 'g-b' }],
    propertyRamps: [] as const,
  }
}

it('matches v1-then-convert for a definition Layer Transition insert (#1075 G4a)', () => {
  const v1before = g4aV1Before(true)
  const convertedBefore = convertShowRecordV1ToV2(v1before)
  expect(convertedBefore.status).toBe('converted')
  if (convertedBefore.status !== 'converted') return
  const v2before = convertedBefore.record
  const beforeSnapshot = structuredClone(v2before)
  const v1transition = { id: 'lt-1', fromPlacementId: 'g-a', toPlacementId: 'g-b', kind: 'crossfade' as const, durationMs: 1000, easing: { curve: 'linear' as const }, crossfadePolicy: 'live-live' as const }
  const v1afterComposition = insertShowGroupLayerTransition({ scenes: v1before.scenes, zones: v1before.zones }, structuredClone(v1before.composition!), { occurrenceId: 'occ-1', transition: v1transition })
  expect(v1afterComposition.groupDefinitions![0].placements).toMatchObject([{ id: 'g-a' }, { id: 'g-b' }])
  const oracle = convertShowRecordV1ToV2({ ...structuredClone(v1before), composition: v1afterComposition })
  expect(oracle.status).toBe('converted')
  if (oracle.status !== 'converted') return
  const definition = v2before.composition.groupDefinitions.find(value => value.id === 'def-1')!
  const result = insertShowGroupDefinitionLayerTransitionV2(v2before, {
    kind: 'insert-definition-layer-transition', definitionId: 'def-1', transition: g4aInsertV2Transition(definition.layers[0].id) as never,
  })
  expect(result.status, result.status === 'refused' ? result.message : '').toBe('changed')
  if (result.status !== 'changed') return
  expect(v2before).toEqual(beforeSnapshot)
  const edited = result.record.composition.groupDefinitions.find(value => value.id === 'def-1')!
  expect(edited.clips.find(clip => clip.id === 'g-b')).toMatchObject({ startMs: 5000, durationMs: 3000 })
  expect(edited.clips.find(clip => clip.id === 'g-a')).toMatchObject({ startMs: 0, durationMs: 4000 })
  expect(edited.transitions).toHaveLength(1)
  expect(edited.clips).toEqual(oracle.record.composition.groupDefinitions[0].clips)
  expect(edited.transitions).toEqual(oracle.record.composition.groupDefinitions[0].transitions)
  expect(edited.propertyTracks).toEqual(oracle.record.composition.groupDefinitions[0].propertyTracks)
  expect(result.affectedGroupDefinitionIds).toEqual(['def-1'])
  expect([...result.affectedGroupOccurrenceIds].sort()).toEqual(['occ-1', 'occ-2'])
})

it('matches v1-then-convert for a definition Layer Transition resize 1000 to 2500 (#1075 G4a)', () => {
  const v1before = g4aV1Before(true)
  const v1transition = { id: 'lt-1', fromPlacementId: 'g-a', toPlacementId: 'g-b', kind: 'crossfade' as const, durationMs: 1000, easing: { curve: 'linear' as const }, crossfadePolicy: 'live-live' as const }
  const v1inserted = insertShowGroupLayerTransition({ scenes: v1before.scenes, zones: v1before.zones }, structuredClone(v1before.composition!), { occurrenceId: 'occ-1', transition: v1transition })
  const v1resized = resizeShowGroupLayerTransition({ scenes: v1before.scenes, zones: v1before.zones }, structuredClone(v1inserted), { occurrenceId: 'occ-1', transitionId: 'lt-1', durationMs: 2500 })
  expect(v1resized.groupDefinitions![0].placements.find(placement => placement.id === 'g-b')!.startMs).toBe(6500)
  const oracle = convertShowRecordV1ToV2({ ...structuredClone(v1before), composition: v1resized })
  expect(oracle.status).toBe('converted')
  if (oracle.status !== 'converted') return
  const convertedInserted = convertShowRecordV1ToV2({ ...structuredClone(v1before), composition: v1inserted })
  expect(convertedInserted.status).toBe('converted')
  if (convertedInserted.status !== 'converted') return
  const result = resizeShowGroupDefinitionLayerTransitionV2(convertedInserted.record, {
    kind: 'resize-definition-layer-transition', definitionId: 'def-1', transitionId: 'lt-1', durationMs: 2500,
  })
  expect(result.status, result.status === 'refused' ? result.message : '').toBe('changed')
  if (result.status !== 'changed') return
  const edited = result.record.composition.groupDefinitions.find(value => value.id === 'def-1')!
  expect(edited.clips.find(clip => clip.id === 'g-b')).toMatchObject({ startMs: 6500, durationMs: 3000 })
  expect(edited.clips).toEqual(oracle.record.composition.groupDefinitions[0].clips)
  expect(edited.transitions).toEqual(oracle.record.composition.groupDefinitions[0].transitions)
  expect(edited.propertyTracks).toEqual(oracle.record.composition.groupDefinitions[0].propertyTracks)
})

it('matches v1-then-convert for Reset to Cut on a definition Layer Transition (#1075 G4a)', () => {
  const v1before = g4aV1Before(true)
  const v1transition = { id: 'lt-1', fromPlacementId: 'g-a', toPlacementId: 'g-b', kind: 'crossfade' as const, durationMs: 1000, easing: { curve: 'linear' as const }, crossfadePolicy: 'live-live' as const }
  const v1inserted = insertShowGroupLayerTransition({ scenes: v1before.scenes, zones: v1before.zones }, structuredClone(v1before.composition!), { occurrenceId: 'occ-1', transition: v1transition })
  const v1reset = resizeShowGroupLayerTransition({ scenes: v1before.scenes, zones: v1before.zones }, structuredClone(v1inserted), { occurrenceId: 'occ-1', transitionId: 'lt-1', durationMs: 0 })
  expect(v1reset.groupDefinitions![0].placements.find(placement => placement.id === 'g-b')!.startMs).toBe(4000)
  const oracle = convertShowRecordV1ToV2({ ...structuredClone(v1before), composition: v1reset })
  expect(oracle.status).toBe('converted')
  if (oracle.status !== 'converted') return
  const convertedInserted = convertShowRecordV1ToV2({ ...structuredClone(v1before), composition: v1inserted })
  expect(convertedInserted.status).toBe('converted')
  if (convertedInserted.status !== 'converted') return
  const result = resizeShowGroupDefinitionLayerTransitionV2(convertedInserted.record, {
    kind: 'resize-definition-layer-transition', definitionId: 'def-1', transitionId: 'lt-1', durationMs: 0,
  })
  expect(result.status, result.status === 'refused' ? result.message : '').toBe('changed')
  if (result.status !== 'changed') return
  const edited = result.record.composition.groupDefinitions.find(value => value.id === 'def-1')!
  expect(edited.clips.find(clip => clip.id === 'g-b')).toMatchObject({ startMs: 4000, durationMs: 3000 })
  expect(edited.transitions).toEqual([])
  expect(edited.clips).toEqual(oracle.record.composition.groupDefinitions[0].clips)
  expect(edited.transitions).toEqual(oracle.record.composition.groupDefinitions[0].transitions ?? [])
  expect(edited.propertyTracks).toEqual(oracle.record.composition.groupDefinitions[0].propertyTracks ?? [])
  expect(edited.propertyTracks.find(track => track.id === 'trk')).toMatchObject({ activeStartMs: 0, activeDurationMs: 7000 })
})

it('shifts every linked occurrence after a definition Layer Transition insert (#1075 G4a)', () => {
  const v2before = g4aV2Before()
  const definition = v2before.composition.groupDefinitions.find(value => value.id === 'def-1')!
  const result = insertShowGroupDefinitionLayerTransitionV2(v2before, {
    kind: 'insert-definition-layer-transition', definitionId: 'def-1', transition: g4aInsertV2Transition(definition.layers[0].id) as never,
  })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const materialized = materializeShowGroupsV2(result.record)
  const first = materialized.composition.clips.find(clip => clip.id === 'occ-1:g-b')!
  const second = materialized.composition.clips.find(clip => clip.id === 'occ-2:g-b')!
  expect(first.startMs).toBe(5000)
  expect(second.startMs).toBe(15000)
  expect(materialized.composition.clips.find(clip => clip.id === 'occ-1:g-a')!.startMs).toBe(0)
  expect(materialized.composition.clips.find(clip => clip.id === 'occ-2:g-a')!.startMs).toBe(10000)
})

it('refuses a definition Layer Transition growth that crosses its Layout interval or overlaps ordinary content (#1075 G4a)', () => {
  const tightV1 = g4aV1Before(false)
  tightV1.composition!.groupOccurrences![1].startMs = 23000
  const convertedTight = convertShowRecordV1ToV2(tightV1)
  expect(convertedTight.status).toBe('converted')
  if (convertedTight.status !== 'converted') return
  const tight = convertedTight.record
  const tightDefinition = tight.composition.groupDefinitions.find(value => value.id === 'def-1')!
  const tightSnapshot = structuredClone(tight)
  const tightResult = insertShowGroupDefinitionLayerTransitionV2(tight, {
    kind: 'insert-definition-layer-transition', definitionId: 'def-1', transition: g4aInsertV2Transition(tightDefinition.layers[0].id) as never,
  })
  expect(tightResult.status).toBe('refused')
  if (tightResult.status !== 'refused') return
  expect(tightResult.code).toBe('invalid-result')
  expect(tightResult.record).toBe(tight)
  expect(tight).toEqual(tightSnapshot)
  const v2before = g4aV2Before()
  const overlapped = structuredClone(v2before)
  const occurrence = overlapped.composition.groupOccurrences.find(value => value.id === 'occ-2')!
  const destinationLayerId = occurrence.layerBindings[0].layerId
  const destinationZoneId = occurrence.zoneId
  const template = overlapped.composition.clips[0]
  overlapped.composition.clips.push({
    ...structuredClone(template),
    id: 'ordinary-after',
    zoneId: destinationZoneId,
    layerId: destinationLayerId,
    startMs: 17000,
    durationMs: 1000,
    appearance: { keys: [{ ...structuredClone(template.appearance.keys[0]), id: 'ordinary-after:appearance:1', timeMs: 17000 }] },
  })
  expect(validateShowRecordV2(overlapped)).toEqual([])
  const overlappedSnapshot = structuredClone(overlapped)
  const overlappedDefinition = overlapped.composition.groupDefinitions.find(value => value.id === 'def-1')!
  const overlappedResult = insertShowGroupDefinitionLayerTransitionV2(overlapped, {
    kind: 'insert-definition-layer-transition', definitionId: 'def-1', transition: g4aInsertV2Transition(overlappedDefinition.layers[0].id) as never,
  })
  expect(overlappedResult.status).toBe('refused')
  if (overlappedResult.status !== 'refused') return
  expect(overlappedResult.code).toBe('invalid-result')
  expect(overlappedResult.record).toBe(overlapped)
  expect(overlapped).toEqual(overlappedSnapshot)
})

it('refuses unknown and non-adjacent definition Layer Transition endpoints without writing (#1075 G4a)', () => {
  const v1before = g4aV1Before(false)
  const v1transition = { id: 'lt-1', fromPlacementId: 'g-a', toPlacementId: 'g-b', kind: 'crossfade' as const, durationMs: 1000, easing: { curve: 'linear' as const }, crossfadePolicy: 'live-live' as const }
  const v1inserted = insertShowGroupLayerTransition({ scenes: v1before.scenes, zones: v1before.zones }, structuredClone(v1before.composition!), { occurrenceId: 'occ-1', transition: v1transition })
  const convertedInserted = convertShowRecordV1ToV2({ ...structuredClone(v1before), composition: v1inserted })
  expect(convertedInserted.status).toBe('converted')
  if (convertedInserted.status !== 'converted') return
  const inserted = convertedInserted.record
  const unknownSnapshot = structuredClone(inserted)
  const unknown = resizeShowGroupDefinitionLayerTransitionV2(inserted, {
    kind: 'resize-definition-layer-transition', definitionId: 'def-1', transitionId: 'missing', durationMs: 2000,
  })
  expect(unknown.status).toBe('refused')
  if (unknown.status !== 'refused') return
  expect(unknown.code).toBe('invalid-intent')
  expect(unknown.record).toBe(inserted)
  expect(inserted).toEqual(unknownSnapshot)
  const v2before = g4aV2Before()
  const v2snapshot = structuredClone(v2before)
  const definition = v2before.composition.groupDefinitions.find(value => value.id === 'def-1')!
  const reversed = {
    id: 'lt-bad',
    kind: 'crossfade' as const,
    durationMs: 500,
    easing: { curve: 'linear' as const },
    crossfadePolicy: 'live-live' as const,
    participants: [{ id: 'lt-bad:participant', zoneId: 'definition-zone', layerId: definition.layers[0].id, fromClipId: 'g-b', toClipId: 'g-a' }],
    propertyRamps: [] as const,
  }
  const nonAdjacent = insertShowGroupDefinitionLayerTransitionV2(v2before, {
    kind: 'insert-definition-layer-transition', definitionId: 'def-1', transition: reversed as never,
  })
  expect(nonAdjacent.status).toBe('refused')
  if (nonAdjacent.status !== 'refused') return
  expect(nonAdjacent.code).toBe('invalid-intent')
  expect(nonAdjacent.record).toBe(v2before)
  expect(v2before).toEqual(v2snapshot)
})

it('shifts a definition-owned track on the to-Clip with the v1 keyframes (#1075 G4a)', () => {
  const v1before = g4aV1Before(true)
  const convertedBefore = convertShowRecordV1ToV2(v1before)
  expect(convertedBefore.status).toBe('converted')
  if (convertedBefore.status !== 'converted') return
  const v1transition = { id: 'lt-1', fromPlacementId: 'g-a', toPlacementId: 'g-b', kind: 'crossfade' as const, durationMs: 1000, easing: { curve: 'linear' as const }, crossfadePolicy: 'live-live' as const }
  const v1afterComposition = insertShowGroupLayerTransition({ scenes: v1before.scenes, zones: v1before.zones }, structuredClone(v1before.composition!), { occurrenceId: 'occ-1', transition: v1transition })
  const oracle = convertShowRecordV1ToV2({ ...structuredClone(v1before), composition: v1afterComposition })
  expect(oracle.status).toBe('converted')
  if (oracle.status !== 'converted') return
  const oracleTrack = oracle.record.composition.groupDefinitions[0].propertyTracks.find(track => track.id === 'trk')!
  expect(oracleTrack.keyframes.map(key => key.timeMs)).toEqual([5000, 5500])
  const v2before = convertedBefore.record
  const definition = v2before.composition.groupDefinitions.find(value => value.id === 'def-1')!
  const result = insertShowGroupDefinitionLayerTransitionV2(v2before, {
    kind: 'insert-definition-layer-transition', definitionId: 'def-1', transition: g4aInsertV2Transition(definition.layers[0].id) as never,
  })
  expect(result.status, result.status === 'refused' ? result.message : '').toBe('changed')
  if (result.status !== 'changed') return
  const edited = result.record.composition.groupDefinitions.find(value => value.id === 'def-1')!
  const editedTrack = edited.propertyTracks.find(track => track.id === 'trk')!
  expect(editedTrack).toEqual(oracleTrack)
  expect(edited.propertyTracks).toEqual(oracle.record.composition.groupDefinitions[0].propertyTracks)
})
