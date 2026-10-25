import type { ShowRecordV2 } from './showCompositionV2'
import { participantWindowBlockedV2 } from './showBoundaryScopeV2'

/** Closed native two-contributor geometry; validation belongs to preparation. */
export function nativePropertyBoundaryV2(record: ShowRecordV2): {
  transitionId: string; fromClipId: string; toClipId: string; startMs: number; endMs: number
} | undefined {
  const c = record.composition
  if (c.executionModel !== 'continuous' || record.zones.length !== 1 || c.layers.length !== 1
    || c.clips.length !== 2 || c.patternInstances.length !== 2 || c.groupDefinitions.length !== 0
    || c.groupOccurrences.length !== 0 || c.layoutOccurrences.length !== 1 || c.transitions.length !== 1) return
  const zone = record.zones[0]
  const layer = c.layers[0]
  const occurrence = c.layoutOccurrences[0]
  if (layer.zoneId !== zone.id || layer.rank !== 0 || occurrence.startMs !== 0
    || occurrence.durationMs !== c.showEndMs || !record.zoneLayouts.some(layout => layout.id === occurrence.layoutId)) return
  const transition = c.transitions[0]
  if (transition.origin !== undefined || transition.kind !== 'crossfade' || transition.crossfadePolicy !== 'snapshot-live'
    || transition.easing.curve !== 'linear' || transition.wholeOutput !== undefined
    || transition.propertyRamps.length !== 0 || transition.participants.length !== 1) return
  const participant = transition.participants[0]
  if (participant.zoneId !== zone.id || participant.layerId !== layer.id) return
  const from = c.clips.find(clip => clip.id === participant.fromClipId)
  const to = c.clips.find(clip => clip.id === participant.toClipId)
  if (!from || !to || from === to || from.instanceId === to.instanceId) return
  for (const clip of [from, to]) {
    if (clip.zoneId !== zone.id || clip.layerId !== layer.id || clip.entryPolicy !== 'continue'
      || clip.zoneSampleMode !== 'independent' || !c.patternInstances.some(instance => instance.id === clip.instanceId)
      || clip.appearance.keys.length !== 1 || clip.appearance.keys[0].timeMs !== clip.startMs
      || clip.appearance.keys[0].value.opacity !== 1) return
  }
  const startMs = from.startMs + from.durationMs
  const endMs = to.startMs
  if (from.startMs !== 0 || to.startMs + to.durationMs !== c.showEndMs
    || endMs <= startMs || endMs - startMs !== transition.durationMs) return
  return { transitionId: transition.id, fromClipId: from.id, toClipId: to.id, startMs, endMs }
}

/** Compiler-only complete-output equivalent; authored identities and scope survive. */
export function projectNativePropertyBoundaryForCompileV2(record: ShowRecordV2): ShowRecordV2 {
  const boundary = nativePropertyBoundaryV2(record)
  if (!boundary || !participantWindowBlockedV2(record)) return record
  const c = record.composition
  const from = c.clips.find(clip => clip.id === boundary.fromClipId)!
  const to = c.clips.find(clip => clip.id === boundary.toClipId)!
  for (const track of c.propertyTracks) {
    const target = track.target
    const instanceTarget = 'instanceId' in target
    const clip = 'clipId' in target ? [from, to].find(clip => clip.id === target.clipId)
      : instanceTarget ? [from, to].find(clip => clip.instanceId === target.instanceId) : undefined
    if (!clip || track.keyframes.some(key => key.curveSegment !== undefined || key.timeMs < clip.startMs || key.timeMs > clip.startMs + clip.durationMs)) return record
    const startMs = clip === to && !instanceTarget ? boundary.startMs : clip.startMs
    const endMs = clip === from ? boundary.endMs : c.showEndMs
    if (track.activeStartMs !== startMs || track.activeDurationMs !== endMs - startMs) return record
  }
  const projected = structuredClone(record)
  const transition = projected.composition.transitions[0]
  transition.participants = []
  transition.wholeOutput = { startMs: boundary.startMs, fromClipIds: [from.id], toClipIds: [to.id] }
  return projected
}
