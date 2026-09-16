import type { ResolvedShowPatternReplacementV2 } from './showClipsV2'
import { validateShowRecordV2, type ShowGroupDefinitionV2, type ShowRecordV2 } from './showCompositionV2'
import type { ShowGroupEditAffectedV2 } from './showGroupEditsV2'
import { defaultGroupRuntimeIdV2, groupRuntimeBindings, materializeShowGroupsV2 } from './showGroupsV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { copyShowInstancePropertyTracksV2, type CopyShowInstancePropertyTracksIntentV2 } from './showPropertyAnimationV2'
import { firstShowTransitionPlacementRestrictionV2 } from './showTransitionPlacementV2'

export type GroupReplacementSlotPlanV2 = { kind: 'retain' } | { kind: 'split'; slotId: string }
export type GroupReplacementRuntimePlanV2 =
  | { kind: 'retain' }
  | { kind: 'independent'; instanceId: string; identitiesBySourceTrackId: CopyShowInstancePropertyTracksIntentV2['identitiesBySourceTrackId'] }
export type GroupLocalTrackCopyPlanV2 = Record<string, { trackId: string; keyframeIdsBySourceId: Record<string, string> }>

export type ReplaceShowGroupDefinitionClipPatternIntentV2 = {
  definitionId: string
  clipId: string
  replacement: ResolvedShowPatternReplacementV2
} & (
  | { context: 'linked-occurrences'; slot: GroupReplacementSlotPlanV2; runtimePlansBySourceRuntimeId: Record<string, GroupReplacementRuntimePlanV2> }
  | { context: 'dormant-definition'; slot: { kind: 'retain' } | { kind: 'split'; slotId: string; localTrackIdentitiesBySourceTrackId: GroupLocalTrackCopyPlanV2 } }
)

export type ShowGroupReplacementRefusalV2 = 'invalid-record' | 'missing-definition' | 'missing-clip' | 'invalid-intent' | 'invalid-identity-plan' | 'compiler-ineligible' | 'invalid-result'
export type ShowGroupReplacementResultV2 = ShowGroupEditAffectedV2 & (
  | { status: 'changed' | 'unchanged'; record: ShowRecordV2 }
  | { status: 'refused'; record: ShowRecordV2; code: ShowGroupReplacementRefusalV2; message: string }
)

function emptyAffected(): ShowGroupEditAffectedV2 {
  return { affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [], affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [], affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], hoistedInstanceIds: [], removedIds: [], discardedControlTargets: [] }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return object(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
}
function replacementValid(value: unknown): value is ResolvedShowPatternReplacementV2 {
  return exact(value, ['patternReference', 'patternName', 'exportedSliders'])
    && exact(value.patternReference, ['kind', 'id'])
    && (value.patternReference.kind === 'stock' || value.patternReference.kind === 'user')
    && typeof value.patternReference.id === 'string' && !!value.patternReference.id.trim()
    && typeof value.patternName === 'string' && !!value.patternName.trim()
    && Array.isArray(value.exportedSliders)
    && value.exportedSliders.every(control => object(control) && control.kind === 'slider'
      && typeof control.exportName === 'string' && !!control.exportName.trim() && typeof control.label === 'string')
    && new Set(value.exportedSliders.map(control => control.exportName)).size === value.exportedSliders.length
}

function authoredIds(record: ShowRecordV2): Set<string> {
  const ids = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (object(value)) {
      if (typeof value.id === 'string') ids.add(value.id)
      Object.values(value).forEach(visit)
    }
  }
  visit(record)
  return ids
}

function replaceLinked(record: ShowRecordV2, definition: ShowGroupDefinitionV2, clipId: string,
  intent: Extract<ReplaceShowGroupDefinitionClipPatternIntentV2, { context: 'linked-occurrences' }>): ShowGroupReplacementResultV2 {
  const refuse = (code: ShowGroupReplacementRefusalV2, message: string): ShowGroupReplacementResultV2 => ({ status: 'refused', record, code, message, ...emptyAffected() })
  const clip = definition.clips.find(value => value.id === clipId)!
  const slot = definition.patternInstances.find(instance => instance.id === clip.instanceId)!
  let expanded: ShowRecordV2
  try { expanded = materializeShowGroupsV2(record) }
  catch (error) { return refuse('invalid-record', error instanceof Error ? error.message : String(error)) }
  const bindings = groupRuntimeBindings(record).filter(binding => binding.definitionId === definition.id && binding.slotId === slot.id)
  const sourceIds = [...new Set(bindings.map(binding => binding.runtimeId))]
  const plans = intent.runtimePlansBySourceRuntimeId
  if (!exact(plans, sourceIds)) return refuse('invalid-identity-plan', 'Give exactly one explicit plan for each distinct selected source runtime.')
  const used = authoredIds(record)
  for (const id of authoredIds(expanded)) used.add(id)
  for (const group of record.composition.groupDefinitions) for (const instance of group.patternInstances) used.add(defaultGroupRuntimeIdV2(group.id, instance.id))
  const shared = new Set(sourceIds.filter(id => expanded.composition.clips.filter(clip => clip.instanceId === id).length > 1))
  for (const id of sourceIds) {
    const plan = plans[id]
    if (!exact(plan, shared.has(id) ? ['kind', 'instanceId', 'identitiesBySourceTrackId'] : ['kind']) || plan.kind !== (shared.has(id) ? 'independent' : 'retain')) return refuse('invalid-identity-plan', `Runtime "${id}" requires exactly its effective-use retain or independent plan.`)
    if (plan.kind === 'independent') {
      if (typeof plan.instanceId !== 'string' || !plan.instanceId.trim() || used.has(plan.instanceId)) return refuse('invalid-identity-plan', `Runtime "${id}" needs a globally fresh explicit destination.`)
      used.add(plan.instanceId)
    }
  }
  const compatible = new Set(intent.replacement.exportedSliders.map(control => control.exportName))
  const localInstanceTracks = definition.propertyTracks.filter(track => 'instanceId' in track.target && track.target.instanceId === slot.id)
  const needsSplit = definition.clips.some(value => value.id !== clip.id && value.instanceId === slot.id) || (shared.size > 0 && localInstanceTracks.length > 0)
  if (!exact(intent.slot, needsSplit ? ['kind', 'slotId'] : ['kind']) || intent.slot.kind !== (needsSplit ? 'split' : 'retain')) return refuse('invalid-identity-plan', 'Give exactly the required local slot plan to preserve unrelated users and original Group track ownership.')
  const destinationSlotId = intent.slot.kind === 'split' ? intent.slot.slotId : slot.id
  if (intent.slot.kind === 'split') {
    const defaults = record.composition.groupDefinitions.flatMap(group => group.patternInstances.map(instance => defaultGroupRuntimeIdV2(group.id, instance.id)))
    if (typeof destinationSlotId !== 'string' || !destinationSlotId.trim() || used.has(destinationSlotId)
      || used.has(defaultGroupRuntimeIdV2(definition.id, destinationSlotId)) || defaults.includes(defaultGroupRuntimeIdV2(definition.id, destinationSlotId))) return refuse('invalid-identity-plan', 'The new local slot and derived default runtime must be globally fresh.')
    used.add(destinationSlotId)
  }
  const lostLocal = localInstanceTracks.filter(track => track.target.kind === 'instance-control' && !compatible.has(track.target.exportName))
  const retainedIds = sourceIds.filter(id => !shared.has(id))
  // A shared local owner cannot be deleted for a sole runtime while it still
  // animates an unrelated user of a forked source in another occurrence.
  if (lostLocal.length > 0 && retainedIds.length > 0 && shared.size > 0) return refuse('invalid-result', `Replacement cannot discard Group "${definition.id}" control tracks ${lostLocal.map(track => `"${track.id}" (${track.target.kind === 'instance-control' ? track.target.exportName : ''})`).join(', ')} for sole runtimes ${retainedIds.map(id => `"${id}"`).join(', ')} without changing unrelated users of shared runtimes ${[...shared].map(id => `"${id}"`).join(', ')} across occurrences ${bindings.map(binding => `"${binding.occurrenceId}"`).join(', ')}.`)
  const losses: ShowGroupEditAffectedV2['discardedControlTargets'] = []
  const topLevelRemovedTrackIds = new Set<string>()
  const removedTracks: string[] = []
  const removedKeys: string[] = []
  const copiedTracks: typeof record.composition.propertyTracks = []
  const next = structuredClone(record)
  const hoisted: string[] = []
  let changed = slot.pattern.kind !== intent.replacement.patternReference.kind || slot.pattern.id !== intent.replacement.patternReference.id || slot.patternName !== intent.replacement.patternName
    || Object.keys(slot.controlTargets ?? {}).some(name => !compatible.has(name))
  let sourceChanged = slot.pattern.kind !== intent.replacement.patternReference.kind || slot.pattern.id !== intent.replacement.patternReference.id
  for (const sourceId of sourceIds) {
    const source = expanded.composition.patternInstances.find(instance => instance.id === sourceId)!
    const plan = plans[sourceId]
    const effectiveTracks = expanded.composition.propertyTracks.filter(track => 'instanceId' in track.target && track.target.instanceId === sourceId)
    const lost = effectiveTracks.filter(track => track.target.kind === 'instance-control' && !compatible.has(track.target.exportName))
    losses.push(...lost.map(track => structuredClone(track.target) as ShowGroupEditAffectedV2['discardedControlTargets'][number]))
    for (const exportName of Object.keys(source.controlTargets ?? {}).filter(name => !compatible.has(name))) if (!lost.some(track => track.target.kind === 'instance-control' && track.target.exportName === exportName)) losses.push({ kind: 'instance-control', instanceId: sourceId, exportName })
    const referenceChanged = source.pattern.kind !== intent.replacement.patternReference.kind || source.pattern.id !== intent.replacement.patternReference.id
    changed ||= referenceChanged || source.patternName !== intent.replacement.patternName || lost.length > 0 || Object.keys(source.controlTargets ?? {}).some(name => !compatible.has(name))
    sourceChanged ||= referenceChanged
    const destinationId = plan.kind === 'independent' ? plan.instanceId : sourceId
    const destination = { ...structuredClone(source), id: destinationId, pattern: structuredClone(intent.replacement.patternReference), patternName: intent.replacement.patternName }
    if (source.controlTargets !== undefined) destination.controlTargets = Object.fromEntries(Object.entries(source.controlTargets).filter(([name]) => compatible.has(name)))
    if (plan.kind === 'independent') {
      const retained = effectiveTracks.filter(track => !lost.includes(track))
      if (!exact(plan.identitiesBySourceTrackId, retained.map(track => track.id))) return refuse('invalid-identity-plan', `Runtime "${sourceId}" needs exact identities over retained effective tracks.`)
      for (const track of retained) {
        const identity = plan.identitiesBySourceTrackId[track.id]
        if (!exact(identity, ['trackId', 'keyframeIdsBySourceId']) || typeof identity.trackId !== 'string' || !identity.trackId.trim() || used.has(identity.trackId)
          || !exact(identity.keyframeIdsBySourceId, track.keyframes.map(key => key.id))) return refuse('invalid-identity-plan', `Effective track "${track.id}" needs exact fresh caller identities.`)
        used.add(identity.trackId)
        for (const key of track.keyframes) {
          const id = identity.keyframeIdsBySourceId[key.id]
          if (typeof id !== 'string' || !id.trim() || used.has(id)) return refuse('invalid-identity-plan', `Effective key "${key.id}" needs a globally fresh caller identity.`)
          used.add(id)
        }
      }
      // Feed the single resolved projection to the landed helper, then retain
      // only its newly authored copies; original Group owners stay authored.
      const projected = structuredClone(expanded)
      projected.composition.groupDefinitions = []
      projected.composition.groupOccurrences = []
      projected.composition.patternInstances.push(destination)
      projected.composition.propertyTracks.push(...copiedTracks)
      const copied = copyShowInstancePropertyTracksV2(projected, { fromInstanceId: sourceId, toInstanceId: destinationId, placementDeltaMs: 0,
        compatibleControlExports: [...compatible], identitiesBySourceTrackId: plan.identitiesBySourceTrackId })
      if (copied.status === 'refused') return refuse('invalid-identity-plan', copied.message)
      copiedTracks.push(...copied.propertyTracks.slice(projected.composition.propertyTracks.length))
      if (!next.composition.patternInstances.some(instance => instance.id === sourceId)) {
        next.composition.patternInstances.push(structuredClone(source))
        hoisted.push(sourceId)
      }
      next.composition.patternInstances.push(destination)
    } else {
      for (const track of lost) {
        const authored = record.composition.propertyTracks.find(value => value.id === track.id)
        if (authored) { topLevelRemovedTrackIds.add(authored.id); removedTracks.push(authored.id); removedKeys.push(...authored.keyframes.map(key => key.id)); continue }
        const own = bindings.some(binding => lostLocal.some(local => track.id === `${binding.occurrenceId}:${local.id}`))
        if (!own || needsSplit) return refuse('invalid-result', `Replacement cannot discard effective Group control "${track.target.kind === 'instance-control' ? track.target.exportName : ''}" owned by "${track.id}" for sole runtime "${sourceId}" without changing another authored Group owner.`)
      }
      const index = next.composition.patternInstances.findIndex(instance => instance.id === sourceId)
      if (index === -1) { next.composition.patternInstances.push(destination); hoisted.push(sourceId) }
      else next.composition.patternInstances[index] = destination
    }
  }
  if (!changed) return { status: 'unchanged', record, ...emptyAffected() }
  for (const exportName of Object.keys(slot.controlTargets ?? {}).filter(name => !compatible.has(name))) if (!losses.some(target => target.exportName === exportName)) losses.push({ kind: 'instance-control', instanceId: slot.id, exportName })
  const edited = next.composition.groupDefinitions.find(value => value.id === definition.id)!
  const editedSlot = { ...structuredClone(slot), id: destinationSlotId, pattern: structuredClone(intent.replacement.patternReference), patternName: intent.replacement.patternName }
  if (slot.controlTargets !== undefined) editedSlot.controlTargets = Object.fromEntries(Object.entries(slot.controlTargets).filter(([name]) => compatible.has(name)))
  if (intent.slot.kind === 'split') edited.patternInstances.push(editedSlot)
  else edited.patternInstances[edited.patternInstances.findIndex(value => value.id === slot.id)] = editedSlot
  edited.clips.find(value => value.id === clip.id)!.instanceId = destinationSlotId
  for (const occurrence of next.composition.groupOccurrences.filter(value => value.definitionId === definition.id)) {
    const binding = bindings.find(value => value.occurrenceId === occurrence.id)!
    const plan = plans[binding.runtimeId]
    occurrence.instanceBindings = { ...occurrence.instanceBindings, [destinationSlotId]: plan.kind === 'independent' ? plan.instanceId : binding.runtimeId }
  }
  if (!needsSplit) {
    const localRemovedTrackIds = new Set(lostLocal.map(track => track.id))
    edited.propertyTracks = edited.propertyTracks.filter(track => !localRemovedTrackIds.has(track.id))
    removedTracks.push(...lostLocal.map(track => track.id))
    removedKeys.push(...lostLocal.flatMap(track => track.keyframes.map(key => key.id)))
  }
  next.composition.propertyTracks = [...next.composition.propertyTracks.filter(track => !topLevelRemovedTrackIds.has(track.id)), ...copiedTracks]
  if (sourceChanged || shared.size > 0) next.composition.executionModel = 'continuous'
  const issue = validateShowRecordV2(next)[0]
  if (issue) return refuse('invalid-result', `${issue.path}: ${issue.message}`)
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuse('compiler-ineligible', restriction.message)
  return { status: 'changed', record: next, ...emptyAffected(), affectedGroupDefinitionIds: [definition.id], affectedClipIds: [clip.id],
    affectedGroupOccurrenceIds: bindings.map(binding => binding.occurrenceId), affectedInstanceIds: [...new Set([destinationSlotId, ...sourceIds.map(id => plans[id].kind === 'independent' ? plans[id].instanceId : id), ...hoisted])],
    affectedTrackIds: [...removedTracks, ...copiedTracks.map(track => track.id)], affectedPropertyKeyIds: [...removedKeys, ...copiedTracks.flatMap(track => track.keyframes.map(key => key.id))],
    hoistedInstanceIds: hoisted, removedIds: [...removedTracks, ...removedKeys], discardedControlTargets: losses }
}

/** Replace one local Clip across its linked definition uses; adoption stays caller-owned. */
export function replaceShowGroupDefinitionClipPatternV2(record: ShowRecordV2, intent: ReplaceShowGroupDefinitionClipPatternIntentV2): ShowGroupReplacementResultV2 {
  const refuse = (code: ShowGroupReplacementRefusalV2, message: string): ShowGroupReplacementResultV2 => ({ status: 'refused', record, code, message, ...emptyAffected() })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  const availability = validateShowLayoutAvailabilityV2(record)[0]
  if (availability) return refuse('invalid-record', `${availability.entityKind} "${availability.entityId}" uses an unavailable Zone.`)
  if (!object(intent) || (intent.context !== 'dormant-definition' && intent.context !== 'linked-occurrences')
    || !exact(intent, intent.context === 'dormant-definition'
      ? ['definitionId', 'clipId', 'replacement', 'context', 'slot']
      : ['definitionId', 'clipId', 'replacement', 'context', 'slot', 'runtimePlansBySourceRuntimeId'])
    || typeof intent.definitionId !== 'string' || typeof intent.clipId !== 'string'
    || !replacementValid(intent.replacement)) return refuse('invalid-intent', 'Give an explicit definition-local Clip target, context and trusted resolved Pattern metadata.')
  const definition = record.composition.groupDefinitions.find(value => value.id === intent.definitionId)
  if (!definition) return refuse('missing-definition', `Group definition "${intent.definitionId}" does not exist.`)
  const clip = definition.clips.find(value => value.id === intent.clipId)
  if (!clip) return refuse('missing-clip', `Local Clip "${intent.clipId}" does not exist in Group "${definition.id}".`)
  const occurrences = record.composition.groupOccurrences.filter(value => value.definitionId === definition.id)
  if ((intent.context === 'dormant-definition') !== (occurrences.length === 0)) return refuse('invalid-intent', 'The explicit replacement context must match the definition occurrence state.')
  if (intent.context === 'linked-occurrences') return replaceLinked(record, definition, clip.id, intent)
  const source = definition.patternInstances.find(instance => instance.id === clip.instanceId)!
  const needsSplit = definition.clips.some(value => value.id !== clip.id && value.instanceId === source.id)
    || record.composition.patternInstances.some(value => value.id === defaultGroupRuntimeIdV2(definition.id, source.id))
  if (!exact(intent.slot, needsSplit ? ['kind', 'slotId', 'localTrackIdentitiesBySourceTrackId'] : ['kind'])
    || intent.slot.kind !== (needsSplit ? 'split' : 'retain')) return refuse('invalid-identity-plan', 'Give exactly the required local replacement slot plan; protect other local users and hoisted default authority.')
  const compatible = new Set(intent.replacement.exportedSliders.map(control => control.exportName))
  const lost = definition.propertyTracks.filter(track => track.target.kind === 'instance-control' && track.target.instanceId === source.id && !compatible.has(track.target.exportName))
  const losses = lost.map(track => structuredClone(track.target) as ShowGroupEditAffectedV2['discardedControlTargets'][number])
  for (const exportName of Object.keys(source.controlTargets ?? {}).filter(name => !compatible.has(name))) {
    if (!losses.some(target => target.exportName === exportName)) losses.push({ kind: 'instance-control', instanceId: source.id, exportName })
  }
  const sourceChanged = source.pattern.kind !== intent.replacement.patternReference.kind || source.pattern.id !== intent.replacement.patternReference.id
  const copies: typeof definition.propertyTracks = []
  const targetSlotId = intent.slot.kind === 'split' ? intent.slot.slotId : source.id
  if (intent.slot.kind === 'split') {
    const used = authoredIds(record)
    const runtimeIds = new Set([...record.composition.patternInstances.map(instance => instance.id), ...groupRuntimeBindings(record).map(binding => binding.runtimeId)])
    for (const group of record.composition.groupDefinitions) for (const instance of group.patternInstances) runtimeIds.add(defaultGroupRuntimeIdV2(group.id, instance.id))
    if (typeof targetSlotId !== 'string' || !targetSlotId.trim() || used.has(targetSlotId) || runtimeIds.has(defaultGroupRuntimeIdV2(definition.id, targetSlotId))) return refuse('invalid-identity-plan', 'The fresh local slot and its derived default runtime must be globally unused.')
    used.add(targetSlotId)
    const retained = definition.propertyTracks.filter(track => 'instanceId' in track.target && track.target.instanceId === source.id && !lost.includes(track))
    const plan = intent.slot.localTrackIdentitiesBySourceTrackId
    if (!exact(plan, retained.map(track => track.id))) return refuse('invalid-identity-plan', 'Give exact caller identities for every retained local instance track.')
    for (const track of retained) {
      const identity = plan[track.id]
      if (!exact(identity, ['trackId', 'keyframeIdsBySourceId']) || typeof identity.trackId !== 'string' || !identity.trackId.trim() || used.has(identity.trackId)
        || !exact(identity.keyframeIdsBySourceId, track.keyframes.map(key => key.id))) return refuse('invalid-identity-plan', `Local track "${track.id}" needs exact fresh track and key identities.`)
      used.add(identity.trackId)
      for (const key of track.keyframes) {
        const id = identity.keyframeIdsBySourceId[key.id]
        if (typeof id !== 'string' || !id.trim() || used.has(id)) return refuse('invalid-identity-plan', `Local key "${key.id}" needs a fresh caller identity.`)
        used.add(id)
      }
      copies.push({ ...structuredClone(track), id: identity.trackId,
        target: { ...structuredClone(track.target), instanceId: targetSlotId } as typeof track.target,
        keyframes: track.keyframes.map(key => ({ ...structuredClone(key), id: identity.keyframeIdsBySourceId[key.id] })) })
    }
  }
  if (!sourceChanged && source.patternName === intent.replacement.patternName && losses.length === 0) return { status: 'unchanged', record, ...emptyAffected() }
  const next = structuredClone(record)
  const edited = next.composition.groupDefinitions.find(value => value.id === definition.id)!
  const target = intent.slot.kind === 'split' ? { ...structuredClone(source), id: targetSlotId } : edited.patternInstances.find(instance => instance.id === source.id)!
  if (intent.slot.kind === 'split') {
    edited.patternInstances.push(target)
    edited.clips.find(value => value.id === clip.id)!.instanceId = targetSlotId
    edited.propertyTracks.push(...copies)
  }
  target.pattern = structuredClone(intent.replacement.patternReference)
  target.patternName = intent.replacement.patternName
  if (source.controlTargets !== undefined) target.controlTargets = Object.fromEntries(Object.entries(source.controlTargets).filter(([name]) => compatible.has(name)))
  const removedTracks = intent.slot.kind === 'retain' ? lost.map(track => track.id) : []
  const removedKeys = intent.slot.kind === 'retain' ? lost.flatMap(track => track.keyframes.map(key => key.id)) : []
  edited.propertyTracks = edited.propertyTracks.filter(track => !removedTracks.includes(track.id))
  if (sourceChanged) next.composition.executionModel = 'continuous'
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuse('compiler-ineligible', restriction.message)
  return { status: 'changed', record: next, ...emptyAffected(), affectedGroupDefinitionIds: [definition.id], affectedClipIds: [clip.id], affectedInstanceIds: [targetSlotId], affectedTrackIds: [...removedTracks, ...copies.map(track => track.id)], affectedPropertyKeyIds: [...removedKeys, ...copies.flatMap(track => track.keyframes.map(key => key.id))],
    removedIds: [...removedTracks, ...removedKeys], discardedControlTargets: losses }
}
