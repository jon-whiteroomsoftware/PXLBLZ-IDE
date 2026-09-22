import type { ShowRecordV2 } from './showCompositionV2'
import type { DeleteShowGroupOccurrenceIntentV2, DuplicateShowGroupOccurrenceIntentV2, EditShowGroupDefinitionClipAppearanceIntentV2, MakeShowGroupUniqueIntentV2, MoveShowGroupOccurrenceIntentV2, SetShowGroupDefinitionClipTimingIntentV2, ShowGroupOccurrencePlacementV2, ShowGroupUniqueIdentityPlanV2, UngroupShowGroupOccurrenceIntentV2, WriteShowGroupDefinitionInstancePropertiesIntentV2 } from './showGroupEditsV2'
import { groupDefinitionAsRecord, groupOccurrenceDuration, groupOccurrenceLocalTimeAtV2 } from './showGroupsV2'
import { planShowV2ClipInspectorPatch } from './showV2ClipAppearancePlanning'
import type { ShowClipInspectorPatch } from './showClipInspectorModel'

export type ShowV2GroupOccurrenceIntent = MoveShowGroupOccurrenceIntentV2 | DuplicateShowGroupOccurrenceIntentV2 | MakeShowGroupUniqueIntentV2 | UngroupShowGroupOccurrenceIntentV2 | DeleteShowGroupOccurrenceIntentV2 | SetShowGroupDefinitionClipTimingIntentV2 | EditShowGroupDefinitionClipAppearanceIntentV2 | WriteShowGroupDefinitionInstancePropertiesIntentV2
export type ShowV2GroupOccurrenceRequest =
  | { kind: 'move-occurrence' | 'duplicate-occurrence'; occurrenceId: string; placement: Omit<ShowGroupOccurrencePlacementV2, 'layoutOccurrenceId'> }
  | { kind: 'make-unique' | 'ungroup-occurrence' | 'delete-occurrence'; occurrenceId: string }
  | { kind: 'set-child-timing'; occurrenceId: string; clipId: string; startMs?: number; durationMs?: number }
  | { kind: 'set-child-inspector-patch'; occurrenceId: string; clipId: string; patch: ShowClipInspectorPatch }
export function buildShowV2GroupOccurrenceEditorModel(record: ShowRecordV2) {
  return {
    occurrences: record.composition.groupOccurrences.map(occurrence => {
      const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
      return { id: occurrence.id, name: definition.name, startMs: occurrence.startMs,
        endMs: occurrence.startMs + groupOccurrenceDuration(definition, occurrence),
        holdDurationMs: occurrence.holds.reduce((sum, hold) => sum + hold.durationMs, 0),
        layers: definition.layers.map(layer => ({ id: layer.id, name: layer.name })) }
    }).sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)),
    zones: record.zones.map(zone => ({ id: zone.id, name: zone.name })),
    layers: record.composition.layers.map(layer => ({ id: layer.id, zoneId: layer.zoneId, name: layer.name })),
  }
}
/** Plans only explicit placement/identities. Existing pure owners validate choreography. */
export function planShowV2GroupOccurrenceEdit(record: ShowRecordV2, request: ShowV2GroupOccurrenceRequest, allocate: () => string):
  { status: 'ready'; intent: ShowV2GroupOccurrenceIntent } | { status: 'refused'; message: string } {
  const occurrence = record.composition.groupOccurrences.find(value => value.id === request.occurrenceId)
  if (!occurrence) return { status: 'refused', message: 'Select an existing Group occurrence.' }
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  try {
    const fresh = (reserved: Set<string>) => {
      const id = allocate()
      if (typeof id !== 'string' || !id.trim() || reserved.has(id)) throw Error('Fresh Group identities conflict. Try the edit again.')
      reserved.add(id); return id
    }
    if (request.kind === 'move-occurrence' || request.kind === 'duplicate-occurrence') {
      const placement = request.placement
      const layout = record.composition.layoutOccurrences.find(value => placement.startMs >= value.startMs && placement.startMs < value.startMs + value.durationMs)
      if (!layout) return { status: 'refused', message: 'The requested start needs an existing Layout occurrence.' }
      const common = { ...structuredClone(placement), layoutOccurrenceId: layout.id, occurrenceId: occurrence.id }
      return { status: 'ready', intent: request.kind === 'move-occurrence'
        ? { kind: 'move-occurrence', ...common }
        : { kind: 'duplicate-occurrence', ...common, newOccurrenceId: fresh(new Set(record.composition.groupOccurrences.map(value => value.id))) } }
    }
    if (request.kind === 'set-child-timing') {
      const child = definition.clips.find(value => value.id === request.clipId)
      if (!child) return { status: 'refused', message: 'Select an existing Group Clip.' }
      const hasStart = request.startMs !== undefined
      const hasDuration = request.durationMs !== undefined
      if (!hasStart && !hasDuration) return { status: 'refused', message: 'Give a Start and/or Duration for one Group Clip.' }
      if (hasStart && (typeof request.startMs !== 'number' || !Number.isFinite(request.startMs))) {
        return { status: 'refused', message: 'Give a finite Show-time Start for one Group Clip.' }
      }
      if (hasDuration && (typeof request.durationMs !== 'number' || !Number.isFinite(request.durationMs))) {
        return { status: 'refused', message: 'Give a finite Duration for one Group Clip.' }
      }
      const intent: SetShowGroupDefinitionClipTimingIntentV2 = {
        kind: 'set-definition-clip-timing',
        definitionId: definition.id,
        clipId: child.id,
        ...(hasStart ? { startMs: Math.round(groupOccurrenceLocalTimeAtV2(occurrence, Math.round(request.startMs!))) } : {}),
        ...(hasDuration ? { durationMs: Math.round(request.durationMs!) } : {}),
      }
      return { status: 'ready', intent }
    }
    if (request.kind === 'set-child-inspector-patch') {
      const child = definition.clips.find(value => value.id === request.clipId)
      if (!child) return { status: 'refused', message: 'Select an existing Group Clip.' }
      const plan = planShowV2ClipInspectorPatch(groupDefinitionAsRecord(record, definition), request.clipId, request.patch)
      if (plan.kind === 'appearance') {
        const intent: EditShowGroupDefinitionClipAppearanceIntentV2 = {
          kind: 'edit-definition-clip-appearance',
          definitionId: definition.id,
          appearance: plan.intent,
        }
        return { status: 'ready', intent }
      }
      if (plan.kind === 'instance-properties') {
        const intent: WriteShowGroupDefinitionInstancePropertiesIntentV2 = {
          kind: 'write-definition-instance-properties',
          definitionId: definition.id,
          clipId: plan.intent.clipId,
          properties: plan.intent.properties,
        }
        return { status: 'ready', intent }
      }
      if (plan.kind === 'replacement') return { status: 'refused', message: 'Changing a Group Clip\'s Pattern is not connected yet.' }
      if (plan.kind === 'refuse') return { status: 'refused', message: plan.message }
      if (plan.kind === 'entry-policy') return { status: 'refused', message: 'Changing a Group Clip\'s entry policy is not connected yet.' }
      return { status: 'refused', message: 'No change.' }
    }
    if (request.kind !== 'make-unique') return { status: 'ready', intent: { kind: request.kind, occurrenceId: occurrence.id } }
    const definitions = record.composition.groupDefinitions
    const map = (ids: string[], reserved: string[]) => {
      const used = new Set(reserved)
      return Object.fromEntries(ids.map(id => [id, fresh(used)]))
    }
    const appearanceReserved = new Set([...record.composition.clips, ...definitions.flatMap(value => value.clips)].flatMap(clip => clip.appearance.keys.map(key => key.id)))
    const propertyReserved = new Set([...record.composition.propertyTracks, ...definitions.flatMap(value => value.propertyTracks)].flatMap(track => track.keyframes.map(key => key.id)))
    const identities: ShowGroupUniqueIdentityPlanV2 = {
      definitionId: fresh(new Set(definitions.map(value => value.id))),
      patternInstanceIds: map(definition.patternInstances.map(value => value.id), [...record.composition.patternInstances, ...definitions.flatMap(value => value.patternInstances)].map(value => value.id)),
      layerIds: map(definition.layers.map(value => value.id), [...record.composition.layers, ...definitions.flatMap(value => value.layers)].map(value => value.id)),
      clipIds: map(definition.clips.map(value => value.id), [...record.composition.clips, ...definitions.flatMap(value => value.clips)].map(value => value.id)),
      transitionIds: map(definition.transitions.map(value => value.id), [...record.composition.transitions, ...definitions.flatMap(value => value.transitions)].map(value => value.id)),
      propertyTrackIds: map(definition.propertyTracks.map(value => value.id), [...record.composition.propertyTracks, ...definitions.flatMap(value => value.propertyTracks)].map(value => value.id)),
      appearanceKeyIdsByClipId: Object.fromEntries(definition.clips.map(clip => [clip.id, Object.fromEntries(clip.appearance.keys.map(key => [key.id, fresh(appearanceReserved)]))])),
      propertyKeyIdsByTrackId: Object.fromEntries(definition.propertyTracks.map(track => [track.id, Object.fromEntries(track.keyframes.map(key => [key.id, fresh(propertyReserved)]))])),
    }
    return { status: 'ready', intent: { kind: 'make-unique', occurrenceId: occurrence.id, identities } }
  } catch (error) { return { status: 'refused', message: error instanceof Error ? error.message : 'Fresh Group identities conflict.' } }
}
