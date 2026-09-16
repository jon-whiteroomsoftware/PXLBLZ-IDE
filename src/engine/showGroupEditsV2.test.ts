import { expect, it } from 'vitest'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  type ShowGroupDefinitionV2,
  type ShowRecordV2,
} from './showCompositionV2'
import { makeShowGroupUniqueV2, type ShowGroupUniqueIdentityPlanV2 } from './showGroupEditsV2'
import { groupRuntimeBindings, materializeShowGroupsV2 } from './showGroupsV2'
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

function expectEmptyAffected(result: ReturnType<typeof makeShowGroupUniqueV2>): void {
  expect(result).toMatchObject({
    affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [],
    affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [],
    affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [],
    affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], hoistedInstanceIds: [],
    removedIds: [], discardedControlTargets: [],
  })
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
