import type { ShowRecordV2, ShowTransitionV2 } from './showCompositionV2'
import type { CreateShowGroupFromSelectionIntentV2, ShowGroupCreationIdentityPlanV2 } from './showGroupCreationV2'

export interface ShowV2GroupSelection {
  clipIds: string[]
  transitionIds: string[]
  name: string
}
export interface ShowV2GroupClipChoice {
  id: string; name: string; zoneName: string; layerName: string; startMs: number; endMs: number
}
function attached(transition: ShowTransitionV2, selected: Set<string>): boolean {
  return transition.participants.some(pair => selected.has(pair.fromClipId) || selected.has(pair.toClipId))
    || !!transition.wholeOutput && [...transition.wholeOutput.fromClipIds, ...transition.wholeOutput.toClipIds].some(id => selected.has(id))
    || transition.propertyRamps.some(ramp => 'clipId' in ramp.target && selected.has(ramp.target.clipId))
}
/** Presentation only: ordinary owners and explicitly selected/attached Transitions. */
export function buildShowV2GroupCreationEditorModel(record: ShowRecordV2, clipIds: string[], transitionIds: string[]): {
  clips: ShowV2GroupClipChoice[]; transitions: { id: string; kind: string }[]
} {
  const selected = new Set(clipIds)
  return {
    clips: record.composition.clips.map(clip => ({ id: clip.id,
      name: record.composition.patternInstances.find(instance => instance.id === clip.instanceId)?.patternName ?? clip.id,
      zoneName: record.zones.find(zone => zone.id === clip.zoneId)?.name ?? clip.zoneId,
      layerName: record.composition.layers.find(layer => layer.id === clip.layerId)?.name ?? clip.layerId,
      startMs: clip.startMs, endMs: clip.startMs + clip.durationMs,
    })).sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)),
    transitions: record.composition.transitions.filter(transition => attached(transition, selected) || transitionIds.includes(transition.id))
      .map(transition => ({ id: transition.id, kind: transition.kind })),
  }
}
export type ShowV2GroupCreationPlan = { status: 'ready'; intent: CreateShowGroupFromSelectionIntentV2 } | { status: 'refused'; message: string }
/** Exactly one supplied allocation per cloned local identity; no retries or selection expansion. */
export function planShowV2GroupCreation(record: ShowRecordV2, selection: ShowV2GroupSelection, allocate: () => string): ShowV2GroupCreationPlan {
  const clips = record.composition.clips.filter(clip => selection.clipIds.includes(clip.id))
  const transitions = record.composition.transitions.filter(transition => selection.transitionIds.includes(transition.id))
  if (!selection.clipIds.length || clips.length !== selection.clipIds.length || transitions.length !== selection.transitionIds.length || !selection.name.trim()) {
    return { status: 'refused', message: 'Select ordinary Clips and give the Group a name.' }
  }
  const tracks = record.composition.propertyTracks.filter(track => 'clipId' in track.target && selection.clipIds.includes(track.target.clipId))
  try {
    const fresh = (reserved: Set<string>): string => {
      const id = allocate()
      if (typeof id !== 'string' || !id.trim() || reserved.has(id)) throw Error('identity')
      reserved.add(id); return id
    }
    const map = (ids: string[]): Record<string, string> => {
      const reserved = new Set(ids)
      return Object.fromEntries(ids.map(id => [id, fresh(reserved)]))
    }
    const definitionId = fresh(new Set(record.composition.groupDefinitions.map(definition => definition.id)))
    const occurrenceId = fresh(new Set(record.composition.groupOccurrences.map(occurrence => occurrence.id)))
    const identities: ShowGroupCreationIdentityPlanV2 = {
      patternInstanceIds: map([...new Set(clips.map(clip => clip.instanceId))]),
      layerIds: map([...new Set(clips.map(clip => clip.layerId))]),
      clipIds: map(clips.map(clip => clip.id)), transitionIds: map(transitions.map(transition => transition.id)),
      propertyTrackIds: map(tracks.map(track => track.id)),
      appearanceKeyIdsByClipId: Object.fromEntries(clips.map(clip => [clip.id, map(clip.appearance.keys.map(key => key.id))])),
      propertyKeyIdsByTrackId: Object.fromEntries(tracks.map(track => [track.id, map(track.keyframes.map(key => key.id))])),
    }
    return { status: 'ready', intent: { kind: 'create-group', selectedClipIds: [...selection.clipIds], transitionIds: [...selection.transitionIds], name: selection.name,
      originMs: Math.min(...clips.map(clip => clip.startMs)), definitionId, occurrenceId, identities } }
  } catch { return { status: 'refused', message: 'Fresh Group identities conflict. Try the edit again.' } }
}
