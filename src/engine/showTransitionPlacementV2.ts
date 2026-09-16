import type { ShowRecordV2, ShowTransitionV2 } from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'

export type ShowTransitionPlacementRuleV2 = 'RL08' | 'RL09' | 'RL10'

export interface ShowTransitionPlacementRestrictionV2 {
  rule: ShowTransitionPlacementRuleV2
  message: string
}

interface TransitionEndpoints {
  from: string[]
  to: string[]
  all: string[]
}

/**
 * Return the first known compiler topology restriction for a validated record.
 * Group materialization is part of this projection so every placement owner
 * asks the same question about ordinary and definition-local choreography.
 */
export function firstShowTransitionPlacementRestrictionV2(
  record: ShowRecordV2,
): ShowTransitionPlacementRestrictionV2 | null {
  const effective = record.composition.groupOccurrences.length > 0
    ? materializeShowGroupsV2(record)
    : record
  const clipsById = new Map(effective.composition.clips.map(clip => [clip.id, clip]))
  const windows = effective.composition.transitions.flatMap(transition => {
    const endpoints = transitionEndpoints(transition)
    const outgoing = clipsById.get(endpoints.from[0])
    const startMs = transition.wholeOutput?.startMs
      ?? (outgoing ? outgoing.startMs + outgoing.durationMs : undefined)
    return startMs === undefined
      ? []
      : [{ transition, endpoints, startMs, endMs: startMs + transition.durationMs }]
  })
  for (const [index, left] of windows.entries()) {
    if (windows.slice(index + 1).some(right => left.startMs < right.endMs && right.startMs < left.endMs)) {
      return restriction(
        'RL10',
        'independent overlapping positive Transition windows require compiler render-target widening.',
      )
    }
    if (left.transition.wholeOutput) continue
    const owned = new Set(left.endpoints.all)
    const participantZones = new Set(left.transition.participants.map(participant => participant.zoneId))
    const unrelated = effective.composition.clips.filter(clip => !owned.has(clip.id))
    const boundaryInside = unrelated.some(clip => {
      const clipEndMs = clip.startMs + clip.durationMs
      if (participantZones.has(clip.zoneId)) {
        const touches = clipEndMs >= left.startMs && clip.startMs <= left.endMs
        const spans = clip.startMs < left.startMs && clipEndMs > left.endMs
        return touches && !spans
      }
      return (clip.startMs > left.startMs && clip.startMs <= left.endMs)
        || (clipEndMs > left.startMs && clipEndMs <= left.endMs)
    })
    if (boundaryInside) {
      return restriction('RL09', 'an unrelated Clip cannot start or stop at or inside a Layer Transition window.')
    }
    const unrelatedSpansWindow = unrelated.some(clip => (
      clip.startMs < left.startMs
      && clip.startMs + clip.durationMs > left.endMs
    ))
    if (unrelatedSpansWindow && (left.transition.kind === 'fade-color' || left.transition.kind === 'motion')) {
      return restriction('RL08', 'Fade and Motion Layer Transitions cannot pass over unrelated contributing Clips.')
    }
  }
  return null
}

function transitionEndpoints(transition: ShowTransitionV2): TransitionEndpoints {
  const from = transition.wholeOutput?.fromClipIds
    ?? transition.participants.map(participant => participant.fromClipId)
  const to = transition.wholeOutput?.toClipIds
    ?? transition.participants.map(participant => participant.toClipId)
  return { from, to, all: [...from, ...to] }
}

function restriction(
  rule: ShowTransitionPlacementRuleV2,
  detail: string,
): ShowTransitionPlacementRestrictionV2 {
  return { rule, message: `${rule}: ${detail}` }
}
