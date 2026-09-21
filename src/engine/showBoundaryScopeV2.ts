import type { ShowRecordV2 } from './showCompositionV2'

/**
 * A Clip- or instance-targeted track whose activation is not exactly the whole
 * Show. Layout split-position and Show repeat-scale targets reach the compiler
 * through their own scalar channels and never need a derived section.
 */
export function hasSectionScopedTrackActivationV2(record: ShowRecordV2): boolean {
  return record.composition.propertyTracks.some(track => (
    track.target?.kind !== 'layout-occurrence-split-position'
    && track.target?.kind !== 'show-repeat-scale'
    && (track.activeStartMs !== 0 || track.activeDurationMs !== record.composition.showEndMs)
  ))
}

/**
 * Promote participant-scope converted Scene-boundary Transitions to the
 * converter's whole-output shape when the Show carries a section-scoped
 * Property track. Never demotes and never touches Transitions with ramps,
 * non-boundary origins, or existing whole-output scope.
 */
export function promoteConvertedBoundariesToWholeOutputV2(record: ShowRecordV2): { record: ShowRecordV2; promotedTransitionIds: string[] } {
  if (!hasSectionScopedTrackActivationV2(record)) return { record, promotedTransitionIds: [] }
  const clipById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  const promotable = record.composition.transitions.filter(transition => {
    if (transition.origin !== 'converted-boundary-transition') return false
    if (transition.wholeOutput !== undefined) return false
    if (transition.participants.length !== 1) return false
    if (transition.propertyRamps.length !== 0) return false
    const from = clipById.get(transition.participants[0].fromClipId)
    const to = clipById.get(transition.participants[0].toClipId)
    if (!from || !to) return false
    const startMs = from.startMs + from.durationMs
    const endMs = to.startMs
    return endMs - startMs === transition.durationMs
  })
  if (promotable.length === 0) return { record, promotedTransitionIds: [] }
  const promotedIds = new Set(promotable.map(transition => transition.id))
  const next = structuredClone(record)
  next.composition.transitions = next.composition.transitions.map(transition => {
    if (!promotedIds.has(transition.id)) return transition
    const from = next.composition.clips.find(clip => clip.id === transition.participants[0].fromClipId)!
    const startMs = from.startMs + from.durationMs
    const endMs = next.composition.clips.find(clip => clip.id === transition.participants[0].toClipId)!.startMs
    return {
      ...transition,
      participants: [],
      wholeOutput: {
        startMs,
        fromClipIds: next.composition.clips.filter(clip => clip.startMs + clip.durationMs === startMs).map(clip => clip.id),
        toClipIds: next.composition.clips.filter(clip => clip.startMs === endMs).map(clip => clip.id),
      },
    }
  })
  return { record: next, promotedTransitionIds: promotable.map(transition => transition.id) }
}
