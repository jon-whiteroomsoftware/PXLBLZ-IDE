import { defaultGroupRuntimeIdV2, groupRuntimeBindings, materializeShowGroupsV2 } from './showGroupsV2'
import { capturedShowV2ReplacementContext, resolveCapturedShowPatternReplacementV2 } from './showV2ClipReplacementModel'
import type { ShowV2ClipSharingCapture } from './showV2ClipSharingEditorModel'
import type { ShowPatternInstance, ShowPatternRef } from './personalContentRecords'
import type { ShowGroupClipV2, ShowGroupDefinitionV2, ShowPropertyTargetV2, ShowPropertyTrackV2, ShowRecordV2 } from './showCompositionV2'
import type { GroupLocalTrackCopyPlanV2, GroupReplacementRuntimePlanV2, GroupReplacementSlotPlanV2 } from './showGroupReplacementV2'

/** Explicit Group-edit target context; a materialized occurrence child is never an edit target. */
export type ShowV2GroupReplacementIntent = {
  kind: 'replace-group-clip-pattern'
  definitionId: string
  clipId: string
  patternReference: ShowPatternRef
} & (
  | { context: 'linked-occurrences'; slot: GroupReplacementSlotPlanV2; runtimePlansBySourceRuntimeId: Record<string, GroupReplacementRuntimePlanV2> }
  | { context: 'dormant-definition'; slot: { kind: 'retain' } | { kind: 'split'; slotId: string; localTrackIdentitiesBySourceTrackId: GroupLocalTrackCopyPlanV2 } }
)

export interface ShowV2GroupReplacementTarget {
  key: string
  definitionId: string
  definitionName: string
  clipId: string
  patternName: string
  context: 'linked-occurrences' | 'dormant-definition'
  occurrenceIds: string[]
  sourceRuntimeIds: string[]
  sharedRuntimeIds: string[]
}
export type ShowV2GroupReplacementPreview =
  | { status: 'ready'; context: 'linked-occurrences' | 'dormant-definition'; requiresSplit: boolean; forkedRuntimeIds: string[]; discardedControlTargets: ShowPropertyTargetV2[] }
  | { status: 'refused'; message: string }
export type ShowV2GroupReplacementPlan = { status: 'ready'; intent: ShowV2GroupReplacementIntent } | { status: 'refused'; message: string }

interface Resolved {
  record: ShowRecordV2
  expanded: ShowRecordV2
  definition: ShowGroupDefinitionV2
  clip: ShowGroupClipV2
  slot: ShowPatternInstance
  occurrenceIds: string[]
}
function resolve(capture: ShowV2ClipSharingCapture, definitionId: string, clipId: string): Resolved | null {
  const context = capturedShowV2ReplacementContext(capture)
  const record = context?.record
  const definition = record?.composition.groupDefinitions.find(value => value.id === definitionId)
  const clip = definition?.clips.find(value => value.id === clipId)
  const slot = definition?.patternInstances.find(value => value.id === clip?.instanceId)
  if (!record || !definition || !clip || !slot) return null
  try {
    return { record, expanded: materializeShowGroupsV2(record), definition, clip, slot,
      occurrenceIds: record.composition.groupOccurrences.filter(value => value.definitionId === definition.id).map(value => value.id) }
  } catch { return null }
}
function instanceTracks(tracks: readonly ShowPropertyTrackV2[], instanceId: string): ShowPropertyTrackV2[] {
  return tracks.filter(track => 'instanceId' in track.target && track.target.instanceId === instanceId)
}
function incompatible(track: ShowPropertyTrackV2, compatible: ReadonlySet<string>): boolean {
  return track.target.kind === 'instance-control' && !compatible.has(track.target.exportName)
}
function staticLosses(instance: ShowPatternInstance, compatible: ReadonlySet<string>, discarded: ShowPropertyTargetV2[], instanceId: string): void {
  for (const exportName of Object.keys(instance.controlTargets ?? {}).filter(name => !compatible.has(name))) {
    if (!discarded.some(target => target.kind === 'instance-control' && target.exportName === exportName)) discarded.push({ kind: 'instance-control', instanceId, exportName })
  }
}

/** Every definition-local Clip with its actual explicit replacement context. */
export function buildShowV2GroupReplacementEditorModel(capture: ShowV2ClipSharingCapture): { targets: ShowV2GroupReplacementTarget[] } | null {
  const context = capturedShowV2ReplacementContext(capture)
  if (!context) return null
  const { record } = context
  let expanded: ShowRecordV2
  try { expanded = materializeShowGroupsV2(record) } catch { return null }
  const bindings = groupRuntimeBindings(record)
  return { targets: record.composition.groupDefinitions.flatMap(definition => definition.clips.map(clip => {
    const occurrenceIds = record.composition.groupOccurrences.filter(value => value.definitionId === definition.id).map(value => value.id)
    const sourceRuntimeIds = [...new Set(bindings.filter(binding => binding.definitionId === definition.id && binding.slotId === clip.instanceId).map(binding => binding.runtimeId))]
    return {
      key: `${definition.id}:${clip.id}`, definitionId: definition.id, definitionName: definition.name, clipId: clip.id,
      patternName: definition.patternInstances.find(value => value.id === clip.instanceId)?.patternName ?? '',
      context: occurrenceIds.length === 0 ? 'dormant-definition' as const : 'linked-occurrences' as const,
      occurrenceIds, sourceRuntimeIds,
      sharedRuntimeIds: sourceRuntimeIds.filter(id => expanded.composition.clips.filter(value => value.instanceId === id).length > 1),
    }
  })) }
}

/** Projects the owner's reported loss from captured metadata; no identity is allocated. */
export function previewShowV2GroupReplacement(capture: ShowV2ClipSharingCapture, definitionId: string, clipId: string, reference: ShowPatternRef | undefined): ShowV2GroupReplacementPreview {
  const target = resolve(capture, definitionId, clipId)
  if (!target) return { status: 'refused', message: 'Select an available definition-local Group Clip.' }
  const resolved = resolveCapturedShowPatternReplacementV2(capture, reference)
  if (resolved.status === 'refused') return resolved
  const { record, expanded, definition, clip, slot, occurrenceIds } = target
  const compatible = new Set(resolved.replacement.exportedSliders.map(control => control.exportName))
  const discardedControlTargets: ShowPropertyTargetV2[] = []
  const otherLocalUser = definition.clips.some(value => value.id !== clip.id && value.instanceId === slot.id)
  if (occurrenceIds.length === 0) {
    for (const track of instanceTracks(definition.propertyTracks, slot.id).filter(track => incompatible(track, compatible))) discardedControlTargets.push(structuredClone(track.target))
    staticLosses(slot, compatible, discardedControlTargets, slot.id)
    return { status: 'ready', context: 'dormant-definition', forkedRuntimeIds: [], discardedControlTargets,
      requiresSplit: otherLocalUser || record.composition.patternInstances.some(value => value.id === defaultGroupRuntimeIdV2(definition.id, slot.id)) }
  }
  const sourceIds = [...new Set(groupRuntimeBindings(record).filter(binding => binding.definitionId === definition.id && binding.slotId === slot.id).map(binding => binding.runtimeId))]
  const forkedRuntimeIds = sourceIds.filter(id => expanded.composition.clips.filter(value => value.instanceId === id).length > 1)
  for (const sourceId of sourceIds) {
    const source = expanded.composition.patternInstances.find(value => value.id === sourceId)!
    const lost = instanceTracks(expanded.composition.propertyTracks, sourceId).filter(track => incompatible(track, compatible))
    for (const track of lost) discardedControlTargets.push(structuredClone(track.target))
    for (const exportName of Object.keys(source.controlTargets ?? {}).filter(name => !compatible.has(name))) {
      if (!lost.some(track => track.target.kind === 'instance-control' && track.target.exportName === exportName)) discardedControlTargets.push({ kind: 'instance-control', instanceId: sourceId, exportName })
    }
  }
  staticLosses(slot, compatible, discardedControlTargets, slot.id)
  return { status: 'ready', context: 'linked-occurrences', forkedRuntimeIds, discardedControlTargets,
    requiresSplit: otherLocalUser || (forkedRuntimeIds.length > 0 && instanceTracks(definition.propertyTracks, slot.id).length > 0) }
}

function identityAllocator(record: ShowRecordV2, expanded: ShowRecordV2, allocate: () => string): () => string {
  const used = new Set<string>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') {
      const item = value as Record<string, unknown>
      if ((item.kind === 'user' || item.kind === 'stock') && Object.keys(item).length === 2) return
      if (typeof item.id === 'string') used.add(item.id)
      Object.values(item).forEach(visit)
    }
  }
  visit(record); visit(expanded)
  for (const definition of record.composition.groupDefinitions) for (const slot of definition.patternInstances) used.add(defaultGroupRuntimeIdV2(definition.id, slot.id))
  return () => {
    const id = allocate()
    if (typeof id !== 'string' || !id.trim() || used.has(id)) throw Error('Fresh Group replacement identities conflict. Try the edit again.')
    used.add(id)
    return id
  }
}
function copyPlan(tracks: readonly ShowPropertyTrackV2[], mint: () => string): GroupLocalTrackCopyPlanV2 {
  return Object.fromEntries(tracks.map(track => [track.id, { trackId: mint(), keyframeIdsBySourceId: Object.fromEntries(track.keyframes.map(key => [key.id, mint()])) }]))
}

/** Allocates the required fresh identities exactly once; the pure owner validates the complete plan. */
export function planShowV2GroupReplacementEdit(capture: ShowV2ClipSharingCapture, definitionId: string, clipId: string, reference: ShowPatternRef | undefined, allocate: () => string): ShowV2GroupReplacementPlan {
  const preview = previewShowV2GroupReplacement(capture, definitionId, clipId, reference)
  if (preview.status === 'refused') return preview
  const target = resolve(capture, definitionId, clipId)
  const resolved = resolveCapturedShowPatternReplacementV2(capture, reference)
  if (!target || resolved.status === 'refused') return { status: 'refused', message: 'Select an available definition-local Group Clip.' }
  const { record, expanded, definition, slot } = target
  const compatible = new Set(resolved.replacement.exportedSliders.map(control => control.exportName))
  const common = { kind: 'replace-group-clip-pattern' as const, definitionId, clipId, patternReference: { ...resolved.replacement.patternReference } }
  try {
    const mint = identityAllocator(record, expanded, allocate)
    if (preview.context === 'dormant-definition') {
      if (!preview.requiresSplit) return { status: 'ready', intent: { ...common, context: 'dormant-definition', slot: { kind: 'retain' } } }
      const slotId = mint()
      const retained = instanceTracks(definition.propertyTracks, slot.id).filter(track => !incompatible(track, compatible))
      return { status: 'ready', intent: { ...common, context: 'dormant-definition', slot: { kind: 'split', slotId, localTrackIdentitiesBySourceTrackId: copyPlan(retained, mint) } } }
    }
    const plannedSlot: GroupReplacementSlotPlanV2 = preview.requiresSplit ? { kind: 'split', slotId: mint() } : { kind: 'retain' }
    const sourceIds = [...new Set(groupRuntimeBindings(record).filter(binding => binding.definitionId === definition.id && binding.slotId === slot.id).map(binding => binding.runtimeId))]
    const runtimePlansBySourceRuntimeId: Record<string, GroupReplacementRuntimePlanV2> = {}
    for (const sourceId of sourceIds) {
      if (!preview.forkedRuntimeIds.includes(sourceId)) { runtimePlansBySourceRuntimeId[sourceId] = { kind: 'retain' }; continue }
      const retained = instanceTracks(expanded.composition.propertyTracks, sourceId).filter(track => !incompatible(track, compatible))
      runtimePlansBySourceRuntimeId[sourceId] = { kind: 'independent', instanceId: mint(), identitiesBySourceTrackId: copyPlan(retained, mint) }
    }
    return { status: 'ready', intent: { ...common, context: 'linked-occurrences', slot: plannedSlot, runtimePlansBySourceRuntimeId } }
  } catch (error) { return { status: 'refused', message: error instanceof Error ? error.message : 'Fresh Group replacement identities conflict.' } }
}
