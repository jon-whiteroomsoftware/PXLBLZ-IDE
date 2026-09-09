import type { ShowRecord } from '../personalContentRecords'
import { newPersonalContentId } from '../personalContentMetadata'
import { planShowClipSplitAtGlobalTime, splitShowClipAtGlobalTime } from '../showTimelineClipAuthoring'
import { commandComposition, withComposition, type ShowCommandDescriptor } from './registry'
import { engineIdentityRefusal, planRefusal, resolveCommandClip } from './support'

/** Caller-local fresh IDs; the same pure owner performs manual and command splits. */
export function splitClipCommandOutcome(record: ShowRecord, input: Record<string, unknown>, newId = newPersonalContentId) {
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const composition = resolved.composition
  const found = resolveCommandClip(record, composition, input.clip_id as string)
  if (!found.ok) return found
  const { clip, owner } = found.context
  const globalTimeMs = input.at_ms as number
  const plan = planShowClipSplitAtGlobalTime(record, composition, { owner, globalTimeMs })
  if (!plan.enabled) return planRefusal(plan, 'split_clip')
  const rightClipId = newId()
  const result = splitShowClipAtGlobalTime(record, composition, { owner, globalTimeMs, newPlacementId: rightClipId })
  if (result === composition) return engineIdentityRefusal('split_clip', 'The rounded split point may sit on a boundary; check owners and fresh identities.')
  const transitionChanges = (result.transitions ?? []).flatMap(transition => {
    const before = composition.transitions?.find(item => item.id === transition.id)
    return before && (before.fromPlacementId !== transition.fromPlacementId || before.toPlacementId !== transition.toPlacementId)
      ? [{ transitionId: transition.id, fromPlacementId: transition.fromPlacementId, toPlacementId: transition.toPlacementId }]
      : []
  })
  return { ok: true as const, record: withComposition(record, result), changes: [{
    command: 'split_clip', targetId: clip.id,
    description: `Clip ${clip.patternName} split at ${Math.round(globalTimeMs)} ms; the right Clip is ${rightClipId}.`,
    details: { leftClipId: clip.id, rightClipId, atMs: Math.round(globalTimeMs), transitionChanges },
  }] }
}

export function createSplitClipCommand(): ShowCommandDescriptor {
  return {
  name: 'split_clip',
  description: 'Split a direct logical Clip at global milliseconds, rounded with Math.round. The left Clip keeps its id; the fresh right Clip shares its Pattern instance. Placement curves copy to applicable halves; outgoing Transition endpoints follow the right Clip. Edges, internal Scene boundaries, Transition gaps and Group children refuse.',
  touches: ['/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', '/composition/transitions', '/updatedAt'],
  fields: {
    clip_id: { kind: 'string', description: 'Logical Clip id from the timeline listing' },
    at_ms: { kind: 'number', description: 'Global split time in milliseconds; rounds to an interior point of a Scene segment' },
  },
  apply: (record, input) => splitClipCommandOutcome(record, input),
}
}
