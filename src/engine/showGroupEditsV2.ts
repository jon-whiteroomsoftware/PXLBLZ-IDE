import {
  validateShowRecordV2,
  type ShowGroupDefinitionV2,
  type ShowGroupLayerBindingV2,
  type ShowGroupOccurrenceV2,
  type ShowPropertyTargetV2,
  type ShowRecordV2,
} from './showCompositionV2'
import { groupDefinitionAsRecord, groupRuntimeBindings, materializeShowGroupsV2 } from './showGroupsV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { firstShowTransitionPlacementRestrictionV2 } from './showTransitionPlacementV2'
import { editShowClipAppearanceV2, type ShowClipAppearanceEditIntentV2 } from './showClipAppearanceEditsV2'
import { writeShowInstancePropertiesV2, type ShowInstancePropertyDependenciesV2 } from './showInstancePropertiesV2'
import type { ShowV2ClipInspectorInstanceIntent } from './showV2ClipAppearancePlanning'

export interface ShowGroupUniqueIdentityPlanV2 {
  definitionId: string
  patternInstanceIds: Record<string, string>
  layerIds: Record<string, string>
  clipIds: Record<string, string>
  transitionIds: Record<string, string>
  propertyTrackIds: Record<string, string>
  appearanceKeyIdsByClipId: Record<string, Record<string, string>>
  propertyKeyIdsByTrackId: Record<string, Record<string, string>>
}

export interface MakeShowGroupUniqueIntentV2 {
  kind: 'make-unique'
  occurrenceId: string
  identities: ShowGroupUniqueIdentityPlanV2
}

export interface ShowGroupOccurrencePlacementV2 {
  startMs: number
  layoutOccurrenceId: string
  zoneId: string
  layerBindings: ShowGroupLayerBindingV2[]
  translationX: number
  translationY: number
}

export interface MoveShowGroupOccurrenceIntentV2 extends ShowGroupOccurrencePlacementV2 {
  kind: 'move-occurrence'
  occurrenceId: string
}

export interface DuplicateShowGroupOccurrenceIntentV2 extends ShowGroupOccurrencePlacementV2 {
  kind: 'duplicate-occurrence'
  occurrenceId: string
  newOccurrenceId: string
}

export interface UngroupShowGroupOccurrenceIntentV2 {
  kind: 'ungroup-occurrence'
  occurrenceId: string
}

export interface DeleteShowGroupOccurrenceIntentV2 {
  kind: 'delete-occurrence'
  occurrenceId: string
}

export interface SetShowGroupDefinitionClipTimingIntentV2 {
  kind: 'set-definition-clip-timing'
  definitionId: string
  clipId: string
  startMs?: number
  durationMs?: number
}

export interface EditShowGroupDefinitionClipAppearanceIntentV2 {
  kind: 'edit-definition-clip-appearance'
  definitionId: string
  appearance: ShowClipAppearanceEditIntentV2
}

export interface WriteShowGroupDefinitionInstancePropertiesIntentV2 {
  kind: 'write-definition-instance-properties'
  definitionId: string
  clipId: string
  properties: ShowV2ClipInspectorInstanceIntent['properties']
}

export type ShowGroupEditRefusalV2 =
  | 'invalid-record'
  | 'missing-occurrence'
  | 'invalid-identity-plan'
  | 'invalid-occurrence-id'
  | 'invalid-placement'
  | 'invalid-intent'
  | 'compiler-ineligible'
  | 'invalid-result'

export interface ShowGroupEditAffectedV2 {
  affectedClipIds: string[]
  affectedInstanceIds: string[]
  affectedTransitionIds: string[]
  affectedTrackIds: string[]
  affectedLayoutDefinitionIds: string[]
  affectedLayoutOccurrenceIds: string[]
  affectedGroupDefinitionIds: string[]
  affectedGroupOccurrenceIds: string[]
  affectedLayerIds: string[]
  affectedMarkerIds: string[]
  affectedAppearanceKeyIds: string[]
  affectedPropertyKeyIds: string[]
  hoistedInstanceIds: string[]
  removedIds: string[]
  discardedControlTargets: Array<Extract<ShowPropertyTargetV2, { kind: 'instance-control' }>>
}

export type ShowGroupEditResultV2 =
  | ({ status: 'changed'; record: ShowRecordV2 } & ShowGroupEditAffectedV2)
  | ({ status: 'unchanged'; record: ShowRecordV2 } & ShowGroupEditAffectedV2)
  | ({
    status: 'refused'
    record: ShowRecordV2
    code: ShowGroupEditRefusalV2
    message: string
  } & ShowGroupEditAffectedV2)

function emptyGroupEditAffected(): ShowGroupEditAffectedV2 {
  return {
    affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [],
    affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [],
    affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [],
    affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], hoistedInstanceIds: [],
    removedIds: [], discardedControlTargets: [],
  }
}

function refuseGroupEdit(
  record: ShowRecordV2,
  code: ShowGroupEditRefusalV2,
  message: string,
): ShowGroupEditResultV2 {
  return { status: 'refused', record, code, message, ...emptyGroupEditAffected() }
}

function validateGroupEditPreimage(record: ShowRecordV2): ShowGroupEditResultV2 | null {
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuseGroupEdit(record, 'invalid-record', `${invalid.path}: ${invalid.message}`)
  const unavailable = validateShowLayoutAvailabilityV2(record)[0]
  if (unavailable) {
    return refuseGroupEdit(
      record,
      'invalid-record',
      `${unavailable.entityKind} "${unavailable.entityId}" uses an unavailable Zone in Layout occurrence "${unavailable.layoutOccurrenceId}".`,
    )
  }
  return null
}

function placementIssue(
  record: ShowRecordV2,
  definition: ShowGroupDefinitionV2,
  placement: ShowGroupOccurrencePlacementV2,
): string | null {
  if (!Number.isSafeInteger(placement.startMs) || placement.startMs < 0) {
    return 'Group occurrence start must be a nonnegative safe integer.'
  }
  if (!Number.isFinite(placement.translationX) || !Number.isFinite(placement.translationY)) {
    return 'Group occurrence translation must be finite.'
  }
  if (typeof placement.layoutOccurrenceId !== 'string' || !placement.layoutOccurrenceId.trim()) {
    return 'Group occurrence Layout identity must be nonblank.'
  }
  const layout = record.composition.layoutOccurrences.find(value => value.id === placement.layoutOccurrenceId)
  if (!layout || placement.startMs < layout.startMs || placement.startMs >= layout.startMs + layout.durationMs) {
    return 'Group occurrence Layout association must exist and own its start time.'
  }
  if (typeof placement.zoneId !== 'string' || !placement.zoneId.trim()
    || !record.zones.some(zone => zone.id === placement.zoneId)) {
    return 'Group occurrence Zone must exist.'
  }
  if (!Array.isArray(placement.layerBindings)) return 'Group occurrence Layer bindings must be explicit.'
  const expected = [...definition.layers.map(layer => layer.id)].sort()
  const actual = placement.layerBindings.map(binding => binding?.definitionLayerId).sort()
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    return 'Group occurrence Layer bindings must name every definition Layer exactly once.'
  }
  for (const binding of placement.layerBindings) {
    const destination = record.composition.layers.find(layer => layer.id === binding.layerId)
    if (!destination || destination.zoneId !== placement.zoneId) {
      return 'Every Group occurrence Layer binding must target an existing Layer in the destination Zone.'
    }
  }
  return null
}

function shiftedTrackActivation(
  occurrence: ShowGroupOccurrenceV2,
  nextStartMs: number,
): ShowGroupOccurrenceV2['trackActivation'] | null | undefined {
  if (!occurrence.trackActivation) return undefined
  const startMs = occurrence.trackActivation.startMs + (nextStartMs - occurrence.startMs)
  if (!Number.isSafeInteger(startMs) || startMs < 0) return null
  return { startMs, durationMs: occurrence.trackActivation.durationMs }
}

function validateGroupEditResult(record: ShowRecordV2): string | null {
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return `${invalid.path}: ${invalid.message}`
  const unavailable = validateShowLayoutAvailabilityV2(record)[0]
  return unavailable
    ? `${unavailable.entityKind} "${unavailable.entityId}" uses an unavailable Zone in Layout occurrence "${unavailable.layoutOccurrenceId}".`
    : null
}

/** Move one Group occurrence without changing its definition or effective runtime identities. */
export function moveShowGroupOccurrenceV2(
  record: ShowRecordV2,
  intent: MoveShowGroupOccurrenceIntentV2,
): ShowGroupEditResultV2 {
  const preimage = validateGroupEditPreimage(record)
  if (preimage) return preimage
  const occurrence = record.composition.groupOccurrences.find(value => value.id === intent.occurrenceId)
  if (!occurrence) return refuseGroupEdit(record, 'missing-occurrence', `Group occurrence "${intent.occurrenceId}" does not exist.`)
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const issue = placementIssue(record, definition, intent)
  if (issue) return refuseGroupEdit(record, 'invalid-placement', issue)
  const trackActivation = shiftedTrackActivation(occurrence, intent.startMs)
  if (trackActivation === null) return refuseGroupEdit(record, 'invalid-placement', 'Shifted Group track activation must remain a nonnegative safe time.')
  const edited: ShowGroupOccurrenceV2 = {
    ...structuredClone(occurrence),
    startMs: intent.startMs,
    layoutOccurrenceId: intent.layoutOccurrenceId,
    zoneId: intent.zoneId,
    layerBindings: structuredClone(intent.layerBindings),
    translationX: intent.translationX,
    translationY: intent.translationY,
    ...(trackActivation ? { trackActivation } : {}),
  }
  if (JSON.stringify(edited) === JSON.stringify(occurrence)) {
    return { status: 'unchanged', record, ...emptyGroupEditAffected() }
  }
  const next = structuredClone(record)
  next.composition.groupOccurrences[next.composition.groupOccurrences.findIndex(value => value.id === occurrence.id)] = edited
  const affectedTrackIds: string[] = []
  const affectedPropertyKeyIds: string[] = []
  const deltaMs = intent.startMs - occurrence.startMs
  if (deltaMs !== 0) {
    const clips = materializeShowGroupsV2(record).composition.clips
    const selectedClipIds = new Set(definition.clips.map(clip => `${occurrence.id}:${clip.id}`))
    const uses = new Map<string, number>()
    for (const clip of clips) uses.set(clip.instanceId, (uses.get(clip.instanceId) ?? 0) + 1)
    const soleMovedInstances = new Set(clips
      .filter(clip => selectedClipIds.has(clip.id) && uses.get(clip.instanceId) === 1)
      .map(clip => clip.instanceId))
    for (const track of next.composition.propertyTracks) {
      if ((track.target.kind !== 'instance-control' && track.target.kind !== 'instance-time-scale')
        || !soleMovedInstances.has(track.target.instanceId)) continue
      const shiftedStartMs = track.activeStartMs + deltaMs
      const shiftedEndMs = shiftedStartMs + track.activeDurationMs
      const keyTimes = track.keyframes.map(key => key.timeMs + deltaMs)
      if (![shiftedStartMs, shiftedEndMs, ...keyTimes].every(time => Number.isSafeInteger(time) && time >= 0)) {
        return refuseGroupEdit(record, 'invalid-result', 'Shifted sole-user instance animation must remain a nonnegative safe time.')
      }
      track.activeStartMs = shiftedStartMs
      track.keyframes.forEach((key, index) => { key.timeMs = keyTimes[index] })
      affectedTrackIds.push(track.id)
      affectedPropertyKeyIds.push(...track.keyframes.map(key => key.id))
    }
  }
  const resultIssue = validateGroupEditResult(next)
  if (resultIssue) return refuseGroupEdit(record, 'invalid-result', resultIssue)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refuseGroupEdit(record, 'compiler-ineligible', compilerRestriction.message)
  return { status: 'changed', record: next, ...emptyGroupEditAffected(), affectedGroupOccurrenceIds: [occurrence.id], affectedTrackIds, affectedPropertyKeyIds }
}

/** Add one linked Group occurrence without minting a definition, track, or runtime. */
export function duplicateShowGroupOccurrenceV2(
  record: ShowRecordV2,
  intent: DuplicateShowGroupOccurrenceIntentV2,
): ShowGroupEditResultV2 {
  const preimage = validateGroupEditPreimage(record)
  if (preimage) return preimage
  const occurrence = record.composition.groupOccurrences.find(value => value.id === intent.occurrenceId)
  if (!occurrence) return refuseGroupEdit(record, 'missing-occurrence', `Group occurrence "${intent.occurrenceId}" does not exist.`)
  if (typeof intent.newOccurrenceId !== 'string' || !intent.newOccurrenceId.trim()
    || record.composition.groupOccurrences.some(value => value.id === intent.newOccurrenceId)) {
    return refuseGroupEdit(record, 'invalid-occurrence-id', 'Linked duplicate requires a fresh nonblank Group occurrence identity.')
  }
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  const issue = placementIssue(record, definition, intent)
  if (issue) return refuseGroupEdit(record, 'invalid-placement', issue)
  const trackActivation = shiftedTrackActivation(occurrence, intent.startMs)
  if (trackActivation === null) return refuseGroupEdit(record, 'invalid-placement', 'Shifted Group track activation must remain a nonnegative safe time.')
  const duplicate: ShowGroupOccurrenceV2 = {
    ...structuredClone(occurrence),
    id: intent.newOccurrenceId,
    startMs: intent.startMs,
    layoutOccurrenceId: intent.layoutOccurrenceId,
    zoneId: intent.zoneId,
    layerBindings: structuredClone(intent.layerBindings),
    translationX: intent.translationX,
    translationY: intent.translationY,
    ...(trackActivation ? { trackActivation } : {}),
  }
  const next = structuredClone(record)
  next.composition.groupOccurrences.push(duplicate)
  const resultIssue = validateGroupEditResult(next)
  if (resultIssue) return refuseGroupEdit(record, 'invalid-result', resultIssue)
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refuseGroupEdit(record, 'compiler-ineligible', compilerRestriction.message)
  return { status: 'changed', record: next, ...emptyGroupEditAffected(), affectedGroupOccurrenceIds: [duplicate.id] }
}

/** Remove one occurrence shell, retaining its authored definition and runtime owners. */
export function deleteShowGroupOccurrenceV2(
  record: ShowRecordV2,
  intent: DeleteShowGroupOccurrenceIntentV2,
): ShowGroupEditResultV2 {
  const preimage = validateGroupEditPreimage(record)
  if (preimage) return preimage
  if (typeof intent !== 'object' || intent === null || Array.isArray(intent)
    || JSON.stringify(Object.keys(intent).sort()) !== JSON.stringify(['kind', 'occurrenceId']) || intent.kind !== 'delete-occurrence'
    || typeof intent.occurrenceId !== 'string' || intent.occurrenceId.length === 0) {
    return refuseGroupEdit(record, 'invalid-occurrence-id', 'Give only the explicit delete operation and one nonempty exact occurrence identity.')
  }
  const occurrence = record.composition.groupOccurrences.find(value => value.id === intent.occurrenceId)
  if (!occurrence) return refuseGroupEdit(record, 'missing-occurrence', `Group occurrence "${intent.occurrenceId}" does not exist.`)
  const next = structuredClone(record)
  next.composition.groupOccurrences = next.composition.groupOccurrences.filter(value => value.id !== occurrence.id)
  const resultIssue = validateGroupEditResult(next)
  if (resultIssue) return refuseGroupEdit(record, 'invalid-result', resultIssue)
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuseGroupEdit(record, 'compiler-ineligible', restriction.message)
  return { status: 'changed', record: next, ...emptyGroupEditAffected(), affectedGroupOccurrenceIds: [occurrence.id], removedIds: [occurrence.id] }
}

/** Write one definition Clip's Start and/or Duration without shifting siblings (v1 parity). */
export function setShowGroupDefinitionClipTimingV2(
  record: ShowRecordV2,
  intent: SetShowGroupDefinitionClipTimingIntentV2,
): ShowGroupEditResultV2 {
  const preimage = validateGroupEditPreimage(record)
  if (preimage) return preimage
  const keys = intent && typeof intent === 'object' && !Array.isArray(intent) ? Object.keys(intent).sort() : []
  const hasStart = intent && typeof intent === 'object' && 'startMs' in intent
  const hasDuration = intent && typeof intent === 'object' && 'durationMs' in intent
  const expected = ['clipId', 'definitionId', 'kind', ...(hasStart ? ['startMs'] : []), ...(hasDuration ? ['durationMs'] : [])].sort()
  if (!intent || typeof intent !== 'object' || Array.isArray(intent) || intent.kind !== 'set-definition-clip-timing'
    || JSON.stringify(keys) !== JSON.stringify(expected)
    || typeof intent.definitionId !== 'string' || !intent.definitionId.trim()
    || typeof intent.clipId !== 'string' || !intent.clipId.trim()
    || (!hasStart && !hasDuration)) {
    return refuseGroupEdit(record, 'invalid-placement', 'Give one Group definition Clip with a Start and/or Duration.')
  }
  if (hasStart && (typeof intent.startMs !== 'number' || !Number.isSafeInteger(intent.startMs) || intent.startMs < 0)) {
    return refuseGroupEdit(record, 'invalid-placement', 'Group definition Clip Start must be a nonnegative safe integer.')
  }
  if (hasDuration && (typeof intent.durationMs !== 'number' || !Number.isSafeInteger(intent.durationMs) || intent.durationMs <= 0)) {
    return refuseGroupEdit(record, 'invalid-placement', 'Group definition Clip Duration must be a positive safe integer.')
  }
  const definition = record.composition.groupDefinitions.find(value => value.id === intent.definitionId)
  if (!definition) return refuseGroupEdit(record, 'invalid-placement', `Group definition "${intent.definitionId}" does not exist.`)
  const clip = definition.clips.find(value => value.id === intent.clipId)
  if (!clip) return refuseGroupEdit(record, 'invalid-placement', `Group definition Clip "${intent.clipId}" does not exist.`)
  const nextStartMs = hasStart ? intent.startMs! : clip.startMs
  const nextDurationMs = hasDuration ? intent.durationMs! : clip.durationMs
  if (nextStartMs === clip.startMs && nextDurationMs === clip.durationMs) {
    return { status: 'unchanged', record, ...emptyGroupEditAffected() }
  }
  const next = structuredClone(record)
  const edited = next.composition.groupDefinitions.find(value => value.id === definition.id)!.clips.find(value => value.id === clip.id)!
  if (hasStart) {
    const deltaMs = intent.startMs! - edited.startMs
    edited.startMs = intent.startMs!
    if (deltaMs !== 0) {
      for (const key of edited.appearance.keys) key.timeMs += deltaMs
    }
  }
  if (hasDuration) edited.durationMs = intent.durationMs!
  const resultIssue = validateGroupEditResult(next)
  if (resultIssue) return refuseGroupEdit(record, 'invalid-result', resultIssue)
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuseGroupEdit(record, 'compiler-ineligible', restriction.message)
  return {
    status: 'changed',
    record: next,
    ...emptyGroupEditAffected(),
    affectedGroupDefinitionIds: [definition.id],
    affectedGroupOccurrenceIds: record.composition.groupOccurrences.filter(value => value.definitionId === definition.id).map(value => value.id),
  }
}

/** Write one definition Clip's appearance through the ordinary appearance owner (#1075 G2b). */
export function editShowGroupDefinitionClipAppearanceV2(
  record: ShowRecordV2,
  intent: EditShowGroupDefinitionClipAppearanceIntentV2,
): ShowGroupEditResultV2 {
  const preimage = validateGroupEditPreimage(record)
  if (preimage) return preimage
  const definition = record.composition.groupDefinitions.find(value => value.id === intent.definitionId)
  if (!definition) return refuseGroupEdit(record, 'invalid-placement', `Group definition "${intent.definitionId}" does not exist.`)
  const outcome = editShowClipAppearanceV2(groupDefinitionAsRecord(record, definition), intent.appearance)
  if (outcome.status === 'refused') return refuseGroupEdit(record, 'invalid-intent', outcome.message)
  if (outcome.status === 'unchanged') return { status: 'unchanged', record, ...emptyGroupEditAffected() }
  const edited = outcome.record.composition.clips.find(candidate => candidate.id === intent.appearance.clipId)
  if (!edited) return refuseGroupEdit(record, 'invalid-intent', `Group definition Clip "${intent.appearance.clipId}" does not exist.`)
  const next = structuredClone(record)
  const target = next.composition.groupDefinitions.find(value => value.id === definition.id)!.clips.find(value => value.id === edited.id)
  if (!target) return refuseGroupEdit(record, 'invalid-intent', `Group definition Clip "${edited.id}" does not exist.`)
  target.appearance = structuredClone(edited.appearance)
  next.composition.groupDefinitions.find(value => value.id === definition.id)!.propertyTracks = structuredClone(outcome.record.composition.propertyTracks)
  const resultIssue = validateGroupEditResult(next)
  if (resultIssue) return refuseGroupEdit(record, 'invalid-result', resultIssue)
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuseGroupEdit(record, 'compiler-ineligible', restriction.message)
  return {
    status: 'changed',
    record: next,
    ...emptyGroupEditAffected(),
    affectedGroupDefinitionIds: [definition.id],
    affectedGroupOccurrenceIds: record.composition.groupOccurrences.filter(value => value.definitionId === definition.id).map(value => value.id),
  }
}

/** Write one definition Clip's Pattern-instance values through the ordinary instance owner (#1075 G2b). */
export function writeShowGroupDefinitionInstancePropertiesV2(
  record: ShowRecordV2,
  intent: WriteShowGroupDefinitionInstancePropertiesIntentV2,
  dependencies: ShowInstancePropertyDependenciesV2 | undefined,
): ShowGroupEditResultV2 {
  const preimage = validateGroupEditPreimage(record)
  if (preimage) return preimage
  const definition = record.composition.groupDefinitions.find(value => value.id === intent.definitionId)
  if (!definition) return refuseGroupEdit(record, 'invalid-placement', `Group definition "${intent.definitionId}" does not exist.`)
  const outcome = writeShowInstancePropertiesV2(groupDefinitionAsRecord(record, definition), intent.clipId, intent.properties, dependencies)
  if (outcome.status === 'refused') return refuseGroupEdit(record, 'invalid-intent', outcome.message ?? 'The Pattern-instance owner declined this edit.')
  if (outcome.status === 'unchanged') return { status: 'unchanged', record, ...emptyGroupEditAffected() }
  const adapterClip = outcome.record.composition.clips.find(candidate => candidate.id === intent.clipId)
  if (!adapterClip) return refuseGroupEdit(record, 'invalid-intent', `Group definition Clip "${intent.clipId}" does not exist.`)
  const edited = outcome.record.composition.patternInstances.find(candidate => candidate.id === adapterClip.instanceId)
  if (!edited) return refuseGroupEdit(record, 'invalid-intent', `Group definition Clip "${intent.clipId}" has no Pattern instance.`)
  const next = structuredClone(record)
  const targetDefinition = next.composition.groupDefinitions.find(value => value.id === definition.id)!
  const targetIndex = targetDefinition.patternInstances.findIndex(candidate => candidate.id === edited.id)
  if (targetIndex < 0) return refuseGroupEdit(record, 'invalid-intent', `Group definition Clip "${intent.clipId}" has no Pattern instance.`)
  targetDefinition.patternInstances[targetIndex] = structuredClone(edited)
  targetDefinition.propertyTracks = structuredClone(outcome.record.composition.propertyTracks)
  const resultIssue = validateGroupEditResult(next)
  if (resultIssue) return refuseGroupEdit(record, 'invalid-result', resultIssue)
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuseGroupEdit(record, 'compiler-ineligible', restriction.message)
  return {
    status: 'changed',
    record: next,
    ...emptyGroupEditAffected(),
    affectedGroupDefinitionIds: [definition.id],
    affectedGroupOccurrenceIds: record.composition.groupOccurrences.filter(value => value.definitionId === definition.id).map(value => value.id),
  }
}

/** Persist one occurrence's existing materialized projection without cloning its runtimes. */
export function ungroupShowGroupOccurrenceV2(
  record: ShowRecordV2,
  intent: UngroupShowGroupOccurrenceIntentV2,
): ShowGroupEditResultV2 {
  const preimage = validateGroupEditPreimage(record)
  if (preimage) return preimage
  const occurrence = record.composition.groupOccurrences.find(value => value.id === intent.occurrenceId)
  if (!occurrence) return refuseGroupEdit(record, 'missing-occurrence', `Group occurrence "${intent.occurrenceId}" does not exist.`)
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  let materialized: ShowRecordV2
  try {
    materialized = materializeShowGroupsV2(record)
  } catch (error) {
    return refuseGroupEdit(record, 'invalid-record', error instanceof Error ? error.message : String(error))
  }

  const clipIds = definition.clips.map(clip => `${occurrence.id}:${clip.id}`)
  const transitionIds = definition.transitions.map(transition => `${occurrence.id}:${transition.id}`)
  const trackIds = definition.propertyTracks.map(track => `${occurrence.id}:${track.id}`)
  const clipById = new Map(materialized.composition.clips.map(clip => [clip.id, clip]))
  const transitionById = new Map(materialized.composition.transitions.map(transition => [transition.id, transition]))
  const trackById = new Map(materialized.composition.propertyTracks.map(track => [track.id, track]))
  const projectedClips = clipIds.map(id => clipById.get(id)!)
  const projectedTransitions = transitionIds.map(id => transitionById.get(id)!)
  const projectedTracks = trackIds.map(id => trackById.get(id)!)

  const next = structuredClone(record)
  next.composition.groupOccurrences = next.composition.groupOccurrences.filter(value => value.id !== occurrence.id)
  next.composition.clips.push(...structuredClone(projectedClips))
  next.composition.transitions.push(...structuredClone(projectedTransitions))
  next.composition.propertyTracks.push(...structuredClone(projectedTracks))

  const hoistedInstanceIds: string[] = []
  const topLevelIds = new Set(next.composition.patternInstances.map(instance => instance.id))
  for (const binding of groupRuntimeBindings(record).filter(value => value.occurrenceId === occurrence.id)) {
    if (topLevelIds.has(binding.runtimeId)) continue
    next.composition.patternInstances.push({ ...structuredClone(binding.instance), id: binding.runtimeId })
    topLevelIds.add(binding.runtimeId)
    hoistedInstanceIds.push(binding.runtimeId)
  }

  const resultIssue = validateGroupEditResult(next)
  if (resultIssue) return refuseGroupEdit(record, 'invalid-result', resultIssue)
  return {
    status: 'changed',
    record: next,
    ...emptyGroupEditAffected(),
    affectedClipIds: [...clipIds].sort(),
    affectedInstanceIds: [...hoistedInstanceIds].sort(),
    affectedTransitionIds: [...transitionIds].sort(),
    affectedTrackIds: [...trackIds].sort(),
    affectedGroupOccurrenceIds: [occurrence.id],
    affectedAppearanceKeyIds: projectedClips.flatMap(clip => clip.appearance.keys.map(key => key.id)).sort(),
    affectedPropertyKeyIds: projectedTracks.flatMap(track => track.keyframes.map(key => key.id)).sort(),
    hoistedInstanceIds: [...hoistedInstanceIds].sort(),
    removedIds: [occurrence.id],
  }
}

/** Make one linked Group occurrence structurally unique without minting a runtime. */
export function makeShowGroupUniqueV2(
  record: ShowRecordV2,
  intent: MakeShowGroupUniqueIntentV2,
): ShowGroupEditResultV2 {
  const empty = (): ShowGroupEditAffectedV2 => ({
    affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [],
    affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [],
    affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [],
    affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], hoistedInstanceIds: [],
    removedIds: [], discardedControlTargets: [],
  })
  const refuse = (code: ShowGroupEditRefusalV2, message: string): ShowGroupEditResultV2 => ({
    status: 'refused', record, code, message, ...empty(),
  })

  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  const occurrence = record.composition.groupOccurrences.find(candidate => candidate.id === intent.occurrenceId)
  if (!occurrence) return refuse('missing-occurrence', `Group occurrence "${intent.occurrenceId}" does not exist.`)
  const definition = record.composition.groupDefinitions.find(candidate => candidate.id === occurrence.definitionId)!
  const planIssue = validateIdentityPlan(record, definition, intent.identities)
  if (planIssue) return refuse('invalid-identity-plan', planIssue)
  if (record.composition.groupOccurrences.filter(candidate => candidate.definitionId === definition.id).length === 1) {
    return { status: 'unchanged', record, ...empty() }
  }

  const selectedBindings = groupRuntimeBindings(record)
    .filter(binding => binding.occurrenceId === occurrence.id)
  const bindingBySlotId = new Map(selectedBindings.map(binding => [binding.slotId, binding]))
  const next = structuredClone(record)
  const hoistedInstanceIds: string[] = []
  for (const slot of definition.patternInstances) {
    const binding = bindingBySlotId.get(slot.id)!
    if (!binding.sharedDefault || binding.authority === 'composition') continue
    next.composition.patternInstances.push({ ...structuredClone(binding.instance), id: binding.runtimeId })
    hoistedInstanceIds.push(binding.runtimeId)
  }

  const identities = intent.identities
  const cloned: ShowGroupDefinitionV2 = {
    id: identities.definitionId,
    name: definition.name,
    patternInstances: definition.patternInstances.map(slot => ({
      ...structuredClone(bindingBySlotId.get(slot.id)!.instance),
      id: identities.patternInstanceIds[slot.id],
    })),
    layers: definition.layers.map(layer => ({ ...structuredClone(layer), id: identities.layerIds[layer.id] })),
    clips: definition.clips.map(clip => ({
      ...structuredClone(clip),
      id: identities.clipIds[clip.id],
      instanceId: identities.patternInstanceIds[clip.instanceId],
      layerId: identities.layerIds[clip.layerId],
      appearance: {
        keys: clip.appearance.keys.map(key => ({
          ...structuredClone(key),
          id: identities.appearanceKeyIdsByClipId[clip.id][key.id],
        })),
      },
    })),
    transitions: definition.transitions.map(transition => ({
      ...structuredClone(transition),
      id: identities.transitionIds[transition.id],
      fromPlacementId: identities.clipIds[transition.fromPlacementId],
      toPlacementId: identities.clipIds[transition.toPlacementId],
    })),
    propertyTracks: definition.propertyTracks.map(track => ({
      ...structuredClone(track),
      id: identities.propertyTrackIds[track.id],
      target: remapTarget(track.target, identities),
      keyframes: track.keyframes.map(key => ({
        ...structuredClone(key),
        id: identities.propertyKeyIdsByTrackId[track.id][key.id],
      })),
    })),
  }
  next.composition.groupDefinitions.push(cloned)
  const edited = next.composition.groupOccurrences.find(candidate => candidate.id === occurrence.id)!
  edited.definitionId = cloned.id
  edited.instanceBindings = Object.fromEntries(definition.patternInstances.map(slot => [
    identities.patternInstanceIds[slot.id],
    bindingBySlotId.get(slot.id)!.runtimeId,
  ]))
  edited.layerBindings = occurrence.layerBindings.map(binding => ({
    definitionLayerId: identities.layerIds[binding.definitionLayerId],
    layerId: binding.layerId,
  }))

  const issue = validateShowRecordV2(next)[0]
  if (issue) return refuse('invalid-result', `${issue.path}: ${issue.message}`)
  return {
    status: 'changed',
    record: next,
    affectedClipIds: Object.values(identities.clipIds).sort(),
    affectedInstanceIds: [...new Set([
      ...Object.values(identities.patternInstanceIds),
      ...hoistedInstanceIds,
    ])].sort(),
    affectedTransitionIds: Object.values(identities.transitionIds).sort(),
    affectedTrackIds: Object.values(identities.propertyTrackIds).sort(),
    affectedLayoutDefinitionIds: [],
    affectedLayoutOccurrenceIds: [],
    affectedGroupDefinitionIds: [cloned.id],
    affectedGroupOccurrenceIds: [edited.id],
    affectedLayerIds: Object.values(identities.layerIds).sort(),
    affectedMarkerIds: [],
    affectedAppearanceKeyIds: Object.values(identities.appearanceKeyIdsByClipId).flatMap(Object.values).sort(),
    affectedPropertyKeyIds: Object.values(identities.propertyKeyIdsByTrackId).flatMap(Object.values).sort(),
    hoistedInstanceIds: hoistedInstanceIds.sort(),
    removedIds: [],
    discardedControlTargets: [],
  }
}

function remapTarget(
  target: ShowPropertyTargetV2,
  identities: ShowGroupUniqueIdentityPlanV2,
): ShowPropertyTargetV2 {
  if ('clipId' in target) return { ...structuredClone(target), clipId: identities.clipIds[target.clipId] }
  if ('instanceId' in target) return { ...structuredClone(target), instanceId: identities.patternInstanceIds[target.instanceId] }
  return structuredClone(target)
}

function validateIdentityPlan(
  record: ShowRecordV2,
  definition: ShowGroupDefinitionV2,
  plan: ShowGroupUniqueIdentityPlanV2,
): string | null {
  if (typeof plan.definitionId !== 'string'
    || !plan.definitionId.trim()
    || record.composition.groupDefinitions.some(candidate => candidate.id === plan.definitionId)) {
    return 'Make Unique requires a fresh nonblank Group definition identity.'
  }
  const partitions: Array<{
    label: string
    sourceIds: string[]
    mapping: Record<string, string>
    existingIds: string[]
  }> = [
    {
      label: 'Pattern instance',
      sourceIds: definition.patternInstances.map(value => value.id),
      mapping: plan.patternInstanceIds,
      existingIds: [
        ...record.composition.patternInstances.map(instance => instance.id),
        ...record.composition.groupDefinitions.flatMap(value => value.patternInstances.map(instance => instance.id)),
      ],
    },
    {
      label: 'Layer',
      sourceIds: definition.layers.map(value => value.id),
      mapping: plan.layerIds,
      existingIds: [
        ...record.composition.layers.map(layer => layer.id),
        ...record.composition.groupDefinitions.flatMap(value => value.layers.map(layer => layer.id)),
      ],
    },
    {
      label: 'Clip',
      sourceIds: definition.clips.map(value => value.id),
      mapping: plan.clipIds,
      existingIds: [
        ...record.composition.clips.map(clip => clip.id),
        ...record.composition.groupDefinitions.flatMap(value => value.clips.map(clip => clip.id)),
      ],
    },
    {
      label: 'Transition',
      sourceIds: definition.transitions.map(value => value.id),
      mapping: plan.transitionIds,
      existingIds: [
        ...record.composition.transitions.map(transition => transition.id),
        ...record.composition.groupDefinitions.flatMap(value => value.transitions.map(transition => transition.id)),
      ],
    },
    {
      label: 'Property track',
      sourceIds: definition.propertyTracks.map(value => value.id),
      mapping: plan.propertyTrackIds,
      existingIds: [
        ...record.composition.propertyTracks.map(track => track.id),
        ...record.composition.groupDefinitions.flatMap(value => value.propertyTracks.map(track => track.id)),
      ],
    },
  ]
  for (const partition of partitions) {
    const issue = mappingIssue(partition.label, partition.sourceIds, partition.mapping, partition.existingIds)
    if (issue) return issue
  }
  if (!plan.appearanceKeyIdsByClipId || typeof plan.appearanceKeyIdsByClipId !== 'object') {
    return 'Appearance key owner identity mapping is missing.'
  }
  const appearanceOwnerIds = new Set(definition.clips.map(clip => clip.id))
  if (Object.keys(plan.appearanceKeyIdsByClipId).some(id => !appearanceOwnerIds.has(id))) {
    return 'Appearance key owner identity mapping contains an extraneous Clip.'
  }
  if (!plan.propertyKeyIdsByTrackId || typeof plan.propertyKeyIdsByTrackId !== 'object') {
    return 'Property key owner identity mapping is missing.'
  }
  const propertyOwnerIds = new Set(definition.propertyTracks.map(track => track.id))
  if (Object.keys(plan.propertyKeyIdsByTrackId).some(id => !propertyOwnerIds.has(id))) {
    return 'Property key owner identity mapping contains an extraneous track.'
  }
  const existingAppearanceIds = [
    ...record.composition.clips.flatMap(clip => clip.appearance.keys.map(key => key.id)),
    ...record.composition.groupDefinitions.flatMap(value => (
      value.clips.flatMap(clip => clip.appearance.keys.map(key => key.id))
    )),
  ]
  for (const clip of definition.clips) {
    const issue = mappingIssue(
      `Appearance key for Clip "${clip.id}"`,
      clip.appearance.keys.map(key => key.id),
      plan.appearanceKeyIdsByClipId[clip.id],
      existingAppearanceIds,
    )
    if (issue) return issue
  }
  const appearanceIds = Object.values(plan.appearanceKeyIdsByClipId).flatMap(Object.values)
  if (new Set(appearanceIds).size !== appearanceIds.length) return 'Appearance key identities must be distinct across the cloned definition.'
  const existingPropertyKeyIds = [
    ...record.composition.propertyTracks.flatMap(track => track.keyframes.map(key => key.id)),
    ...record.composition.groupDefinitions.flatMap(value => (
      value.propertyTracks.flatMap(track => track.keyframes.map(key => key.id))
    )),
  ]
  for (const track of definition.propertyTracks) {
    const issue = mappingIssue(
      `Property key for track "${track.id}"`,
      track.keyframes.map(key => key.id),
      plan.propertyKeyIdsByTrackId[track.id],
      existingPropertyKeyIds,
    )
    if (issue) return issue
  }
  const propertyKeyIds = Object.values(plan.propertyKeyIdsByTrackId).flatMap(Object.values)
  if (new Set(propertyKeyIds).size !== propertyKeyIds.length) return 'Property key identities must be distinct across the cloned definition.'
  return null
}

function mappingIssue(
  label: string,
  sourceIds: string[],
  mapping: Record<string, string> | undefined,
  existingIds: string[],
): string | null {
  if (!mapping) return `${label} identity mapping is missing.`
  const expected = [...sourceIds].sort()
  const actual = Object.keys(mapping).sort()
  if (JSON.stringify(expected) !== JSON.stringify(actual)) return `${label} identity mapping must be complete and contain no extraneous source identities.`
  const values = Object.values(mapping)
  if (values.some(value => typeof value !== 'string' || !value.trim())) return `${label} identities must be nonblank.`
  if (new Set(values).size !== values.length) return `${label} identities must be distinct.`
  if (values.some(value => existingIds.includes(value))) return `${label} identities must be fresh.`
  return null
}
