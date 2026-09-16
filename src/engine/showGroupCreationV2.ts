import { validateShowRecordV2, type ShowRecordV2, type ShowPropertyTrackV2 } from './showCompositionV2'
import type { ShowGroupEditAffectedV2 } from './showGroupEditsV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { firstShowTransitionPlacementRestrictionV2 } from './showTransitionPlacementV2'

export interface ShowGroupCreationIdentityPlanV2 {
  patternInstanceIds: Record<string, string>
  layerIds: Record<string, string>
  clipIds: Record<string, string>
  transitionIds: Record<string, string>
  propertyTrackIds: Record<string, string>
  appearanceKeyIdsByClipId: Record<string, Record<string, string>>
  propertyKeyIdsByTrackId: Record<string, Record<string, string>>
}
export interface CreateShowGroupFromSelectionIntentV2 {
  kind: 'create-group'
  selectedClipIds: string[]
  transitionIds: string[]
  definitionId: string
  occurrenceId: string
  name: string
  originMs: number
  identities: ShowGroupCreationIdentityPlanV2
}
export type ShowGroupCreateRefusalV2 = 'invalid-record' | 'invalid-intent' | 'invalid-selection' | 'invalid-identity-plan' | 'unsupported-representation' | 'invalid-result' | 'compiler-ineligible'
export type ShowGroupCreateResultV2 =
  | ({ status: 'changed'; record: ShowRecordV2 } & ShowGroupEditAffectedV2)
  | ({ status: 'refused'; record: ShowRecordV2; code: ShowGroupCreateRefusalV2; message: string } & ShowGroupEditAffectedV2)

function emptyAffected(): ShowGroupEditAffectedV2 {
  return { affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [], affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [], affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], hoistedInstanceIds: [], removedIds: [], discardedControlTargets: [] }
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
function closed(value: unknown, keys: string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
}
function exactIds(actual: unknown, expected: string[]): boolean {
  return Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length
    && actual.every(id => typeof id === 'string' && expected.includes(id))
}
function mappingIssue(mapping: unknown, ids: string[]): string | null {
  if (!object(mapping) || !exactIds(Object.keys(mapping), ids)) return 'Identity mapping must be complete and contain no extraneous source IDs.'
  const values = Object.values(mapping)
  if (values.some(id => typeof id !== 'string' || !id.trim())) return 'New identities must be nonblank strings.'
  if (new Set(values).size !== values.length || values.some(id => ids.includes(id as string))) return 'New identities must be fresh and distinct within their owner.'
  return null
}
function clipOwned(track: ShowPropertyTrackV2, ids: Set<string>): boolean {
  return 'clipId' in track.target && ids.has(track.target.clipId)
}

/** Localize an explicitly selected lossless ordinary schedule without creating a runtime. */
export function createShowGroupFromSelectionV2(record: ShowRecordV2, intent: CreateShowGroupFromSelectionIntentV2): ShowGroupCreateResultV2 {
  const refuse = (code: ShowGroupCreateRefusalV2, message: string): ShowGroupCreateResultV2 => ({ status: 'refused', record, code, message, ...emptyAffected() })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  if (validateShowLayoutAvailabilityV2(record).length > 0) return refuse('invalid-record', 'The preimage uses an unavailable Layout Zone.')
  if (!closed(intent, ['kind', 'selectedClipIds', 'transitionIds', 'definitionId', 'occurrenceId', 'name', 'originMs', 'identities']) || intent.kind !== 'create-group'
    || !Array.isArray(intent.selectedClipIds) || intent.selectedClipIds.length === 0 || new Set(intent.selectedClipIds).size !== intent.selectedClipIds.length
    || intent.selectedClipIds.some(id => typeof id !== 'string' || !id)
    || !Array.isArray(intent.transitionIds) || new Set(intent.transitionIds).size !== intent.transitionIds.length || intent.transitionIds.some(id => typeof id !== 'string' || !id)
    || !Number.isSafeInteger(intent.originMs) || intent.originMs < 0 || typeof intent.name !== 'string' || !intent.name.trim()) {
    return refuse('invalid-intent', 'Supply an exact create operation, explicit ordinary selection, complete Transition IDs, name and safe origin.')
  }
  if (typeof intent.definitionId !== 'string' || !intent.definitionId.trim() || record.composition.groupDefinitions.some(value => value.id === intent.definitionId)
    || typeof intent.occurrenceId !== 'string' || !intent.occurrenceId.trim() || record.composition.groupOccurrences.some(value => value.id === intent.occurrenceId)) return refuse('invalid-identity-plan', 'Definition and occurrence identities must be fresh and nonblank.')
  const selectedIds = new Set(intent.selectedClipIds)
  const clips = record.composition.clips.filter(clip => selectedIds.has(clip.id))
  if (clips.length !== selectedIds.size || new Set(clips.map(clip => clip.zoneId)).size !== 1 || Math.min(...clips.map(clip => clip.startMs)) !== intent.originMs) return refuse('invalid-selection', 'Select ordinary Clips in one Zone and give their exact first-start origin.')
  const selectedTracks = record.composition.propertyTracks.filter(track => clipOwned(track, selectedIds))
  const selectedEndMs = Math.max(...clips.map(clip => clip.startMs + clip.durationMs))
  if (selectedTracks.some(track => track.activeStartMs < intent.originMs || track.activeStartMs + track.activeDurationMs > selectedEndMs)) return refuse('unsupported-representation', 'Clip animation activation lies outside the existing local Group duration.')
  const transitions = record.composition.transitions.filter(transition =>
    transition.participants.some(participant => selectedIds.has(participant.fromClipId) || selectedIds.has(participant.toClipId))
    || transition.wholeOutput && [...transition.wholeOutput.fromClipIds, ...transition.wholeOutput.toClipIds].some(id => selectedIds.has(id))
    || transition.propertyRamps.some(ramp => 'clipId' in ramp.target && selectedIds.has(ramp.target.clipId)))
  if (!exactIds(intent.transitionIds, transitions.map(transition => transition.id))) return refuse('invalid-selection', 'Explicitly select every attached internal Transition and no unrelated Transition.')
  if (transitions.some(transition => transition.wholeOutput || transition.participants.length !== 1 || transition.propertyRamps.length
    || !selectedIds.has(transition.participants[0].fromClipId) || !selectedIds.has(transition.participants[0].toClipId))) return refuse('unsupported-representation', 'Existing Groups cannot losslessly represent partial chains, whole-output, multi-participant or ramp Transitions.')

  const plan = intent.identities
  if (!closed(plan, ['patternInstanceIds', 'layerIds', 'clipIds', 'transitionIds', 'propertyTrackIds', 'appearanceKeyIdsByClipId', 'propertyKeyIdsByTrackId'])) return refuse('invalid-identity-plan', 'Give only the complete local identity plan.')
  const runtimeIds = [...new Set(clips.map(clip => clip.instanceId))]
  const layerIds = [...new Set(clips.map(clip => clip.layerId))]
  for (const [mapping, ids] of [[plan.patternInstanceIds, runtimeIds], [plan.layerIds, layerIds], [plan.clipIds, clips.map(clip => clip.id)], [plan.transitionIds, transitions.map(transition => transition.id)], [plan.propertyTrackIds, selectedTracks.map(track => track.id)]] as const) {
    const issue = mappingIssue(mapping, [...ids]); if (issue) return refuse('invalid-identity-plan', issue)
  }
  if (!object(plan.appearanceKeyIdsByClipId) || !exactIds(Object.keys(plan.appearanceKeyIdsByClipId), clips.map(clip => clip.id)) || !object(plan.propertyKeyIdsByTrackId) || !exactIds(Object.keys(plan.propertyKeyIdsByTrackId), selectedTracks.map(track => track.id))) return refuse('invalid-identity-plan', 'Nested key owner mappings must be complete and closed.')
  for (const clip of clips) {
    const issue = mappingIssue(plan.appearanceKeyIdsByClipId[clip.id], clip.appearance.keys.map(key => key.id)); if (issue) return refuse('invalid-identity-plan', issue)
  }
  for (const track of selectedTracks) {
    const issue = mappingIssue(plan.propertyKeyIdsByTrackId[track.id], track.keyframes.map(key => key.id)); if (issue) return refuse('invalid-identity-plan', issue)
  }
  const layout = record.composition.layoutOccurrences.find(value => value.startMs <= intent.originMs && intent.originMs < value.startMs + value.durationMs)!
  const next = structuredClone(record)
  const layers = record.composition.layers.filter(layer => layerIds.includes(layer.id))
  next.composition.groupDefinitions.push({ id: intent.definitionId, name: intent.name,
    patternInstances: runtimeIds.map(id => ({ ...structuredClone(record.composition.patternInstances.find(instance => instance.id === id)!), id: plan.patternInstanceIds[id] })),
    layers: layers.map(layer => ({ id: plan.layerIds[layer.id], name: layer.name, rank: layer.rank })),
    clips: clips.map(clip => {
      const { zoneId: _zoneId, ...child } = structuredClone(clip)
      return { ...child, id: plan.clipIds[clip.id], instanceId: plan.patternInstanceIds[clip.instanceId], layerId: plan.layerIds[clip.layerId], startMs: clip.startMs - intent.originMs,
        appearance: { keys: clip.appearance.keys.map(key => ({ ...structuredClone(key), id: plan.appearanceKeyIdsByClipId[clip.id][key.id], timeMs: key.timeMs - intent.originMs })) } }
    }), transitions: transitions.map(transition => {
      const { participants, propertyRamps: _propertyRamps, wholeOutput: _wholeOutput, ...settings } = structuredClone(transition)
      return { ...settings, id: plan.transitionIds[transition.id], fromPlacementId: plan.clipIds[participants[0].fromClipId], toPlacementId: plan.clipIds[participants[0].toClipId] }
    }), propertyTracks: selectedTracks.map(track => ({
      ...structuredClone(track), id: plan.propertyTrackIds[track.id], target: { ...structuredClone(track.target), clipId: plan.clipIds[(track.target as Extract<ShowPropertyTrackV2['target'], { clipId: string }>).clipId] },
      activeStartMs: track.activeStartMs - intent.originMs,
      keyframes: track.keyframes.map(key => ({ ...structuredClone(key), id: plan.propertyKeyIdsByTrackId[track.id][key.id], timeMs: key.timeMs - intent.originMs })),
    })),
  })
  next.composition.groupOccurrences.push({ id: intent.occurrenceId, definitionId: intent.definitionId, layoutOccurrenceId: layout.id, zoneId: clips[0].zoneId, startMs: intent.originMs, translationX: 0, translationY: 0, holds: [],
    instanceBindings: Object.fromEntries(runtimeIds.map(id => [plan.patternInstanceIds[id], id])), layerBindings: layers.map(layer => ({ definitionLayerId: plan.layerIds[layer.id], layerId: layer.id })),
  })
  next.composition.clips = next.composition.clips.filter(clip => !selectedIds.has(clip.id))
  next.composition.propertyTracks = next.composition.propertyTracks.filter(track => !clipOwned(track, selectedIds))
  const selectedTransitionIds = new Set(transitions.map(transition => transition.id))
  next.composition.transitions = next.composition.transitions.filter(transition => !selectedTransitionIds.has(transition.id))
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  if (validateShowLayoutAvailabilityV2(next).length) return refuse('invalid-result', 'The Group crosses an unavailable Layout Zone.')
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuse('compiler-ineligible', restriction.message)
  return { status: 'changed', record: next, ...emptyAffected(), affectedClipIds: [...clips.map(clip => clip.id), ...clips.map(clip => plan.clipIds[clip.id])], affectedInstanceIds: runtimeIds.map(id => plan.patternInstanceIds[id]), affectedLayerIds: layers.map(layer => plan.layerIds[layer.id]), affectedGroupDefinitionIds: [intent.definitionId], affectedGroupOccurrenceIds: [intent.occurrenceId], affectedAppearanceKeyIds: clips.flatMap(clip => [...clip.appearance.keys.map(key => key.id), ...clip.appearance.keys.map(key => plan.appearanceKeyIdsByClipId[clip.id][key.id])]), affectedTrackIds: [...selectedTracks.map(track => track.id), ...selectedTracks.map(track => plan.propertyTrackIds[track.id])], affectedPropertyKeyIds: selectedTracks.flatMap(track => [...track.keyframes.map(key => key.id), ...track.keyframes.map(key => plan.propertyKeyIdsByTrackId[track.id][key.id])]), affectedTransitionIds: [...transitions.map(transition => transition.id), ...transitions.map(transition => plan.transitionIds[transition.id])], removedIds: [...clips.map(clip => clip.id), ...selectedTracks.map(track => track.id), ...transitions.map(transition => transition.id)] }
}
