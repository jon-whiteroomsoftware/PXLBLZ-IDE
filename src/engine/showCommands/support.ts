// Shared helpers for the command family modules: clip resolution over the
// unified timeline projection, owner construction, and refusal shapes over
// plan results. Pure logic only.
import type { ShowCompositionV1, ShowRecord } from '../personalContentRecords'
import { removeShowBoundaryTransition } from '../showModel'
import type { ShowTimelineClipOwner } from '../showTimelineClipAuthoring'
import {
  projectShowUnifiedTimeline,
  type ShowUnifiedTimelineClipProjection,
} from '../showUnifiedTimelineProjection'
import { refuseShowCommand, type ShowCommandRefusal } from './registry'

export interface CommandClipContext {
  clip: ShowUnifiedTimelineClipProjection
  owner: ShowTimelineClipOwner
  zoneName: string
  timelineDurationMs: number
  siblings: Array<{ clip: ShowUnifiedTimelineClipProjection; zoneName: string }>
}

export function describeCommandClip(
  clip: ShowUnifiedTimelineClipProjection,
  zoneName: string,
): string {
  return `${clip.id} (${clip.patternName} on ${zoneName}, ${clip.startMs}–${clip.endMs} ms)`
}

export function ownerForClip(clip: ShowUnifiedTimelineClipProjection): ShowTimelineClipOwner {
  return clip.kind === 'main'
    ? { kind: 'main', sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.id }
    : {
        kind: 'overlay',
        sceneId: clip.sceneId,
        zoneId: clip.zoneId,
        layerId: clip.layerId ?? '',
        placementId: clip.id,
      }
}

export function resolveCommandClip(
  record: ShowRecord,
  composition: ShowCompositionV1,
  clipId: string,
): { ok: true; context: CommandClipContext } | ShowCommandRefusal {
  const timeline = projectShowUnifiedTimeline(record, composition)
  const clips: CommandClipContext['siblings'] = []
  for (const zone of timeline.zones) {
    for (const layer of zone.layers) {
      for (const clip of layer.clips) clips.push({ clip, zoneName: zone.name })
    }
  }
  const found = clips.find((candidate) => candidate.clip.id === clipId)
  if (!found) {
    return refuseShowCommand({
      code: 'unknown-clip',
      message:
        `No clip has id "${clipId}". Known clips: ${
          clips.map((candidate) => describeCommandClip(candidate.clip, candidate.zoneName)).join('; ')}.`,
      candidates: clips.map((candidate) => candidate.clip.id),
    })
  }
  if (found.clip.groupOccurrenceId) {
    return refuseShowCommand({
      code: 'group',
      message:
        `Clip ${clipId} is a Group child (occurrence ${found.clip.groupOccurrenceId}); ` +
        'the direct clip commands cannot edit it.',
      remedy: 'Edit the Group definition or occurrence through the Group tools.',
    })
  }
  return {
    ok: true,
    context: {
      clip: found.clip,
      owner: ownerForClip(found.clip),
      zoneName: found.zoneName,
      timelineDurationMs: timeline.durationMs,
      siblings: clips,
    },
  }
}

/** Surface a refused plan's user-legible reason as a typed refusal. */
export function planRefusal(
  plan: { code: string; reason: string },
  context: string,
  remedy?: string,
): ShowCommandRefusal {
  return refuseShowCommand({
    code: plan.code,
    message: `${context}: ${plan.reason}`,
    ...(remedy ? { remedy } : {}),
  })
}

/**
 * Every non-routing parameter leaf of a boundary transition. A kind switch
 * writes all of them - the normalizer fills the new kind's defaults and
 * removes the old kind's stale fields - and the parameter command stores
 * any of them its per-kind validation admits. Routing-only fields
 * (layoutId, routingDirection) and easing are absent: no command writes
 * them deliberately, and claiming them would fake coverage.
 * propertyTransitions is present because collapsing a transition to a Cut
 * removes it.
 */
export const VISUAL_TRANSITION_PARAMETER_TOUCHES = [
  '/transitions/*/kind', '/transitions/*/durationMs', '/transitions/*/crossfadePolicy',
  '/transitions/*/feather', '/transitions/*/color', '/transitions/*/dissolveVariant',
  '/transitions/*/shape', '/transitions/*/motionVariant', '/transitions/*/featherPolicy',
  '/transitions/*/centerX', '/transitions/*/centerY', '/transitions/*/aspect',
  '/transitions/*/rotation', '/transitions/*/revealMode', '/transitions/*/anchorX',
  '/transitions/*/anchorY', '/transitions/*/contentScale', '/transitions/*/spinDirection',
  '/transitions/*/addressPolicy', '/transitions/*/starPoints', '/transitions/*/starInner',
  '/transitions/*/wipeVariant', '/transitions/*/wipeMode', '/transitions/*/orientation',
  '/transitions/*/count', '/transitions/*/phase', '/transitions/*/clockwise',
  '/transitions/*/edgePolicy', '/transitions/*/seed', '/transitions/*/blockSize',
  '/transitions/*/scale', '/transitions/*/softness', '/transitions/*/direction',
  '/transitions/*/ringWidth', '/transitions/*/cornerRadius', '/transitions/*/crossWidth',
  '/transitions/*/crescentOffset', '/transitions/*/polygonSides', '/transitions/*/spin',
  '/transitions/*/propertyTransitions',
] as const

/**
 * The subset the parameter command can write: its whitelist stores the
 * per-kind parameter fields, and a shape switch fills that shape's
 * geometry defaults. Kind, duration, and the motion-geometry fields it has
 * no whitelist entry for are absent.
 */
export const UPDATE_PARAMETER_TRANSITION_TOUCHES = VISUAL_TRANSITION_PARAMETER_TOUCHES.filter((pattern) => ![
  '/transitions/*/kind', '/transitions/*/durationMs', '/transitions/*/revealMode',
  '/transitions/*/anchorX', '/transitions/*/anchorY', '/transitions/*/contentScale',
  '/transitions/*/spinDirection', '/transitions/*/addressPolicy',
  '/transitions/*/propertyTransitions',
].includes(pattern))

/** Clamp a Show-level engine result's stamp to stay monotonic over the input record. */
export function monotonicRecord(record: ShowRecord, result: ShowRecord): ShowRecord {
  return result.updatedAt > record.updatedAt
    ? result
    : { ...result, updatedAt: record.updatedAt + 1 }
}

/**
 * A chain shift can move a clip away from a Scene-boundary junction; the
 * boundary transition then holds hidden time with no junction left. Compare
 * the boundary junctions before and after and replace any broken one with a
 * Cut, the same canonicalization the Show-level move and resize wrappers
 * perform.
 */
export function canonicalizeBoundaryAfterShift(
  record: ShowRecord,
  before: ShowCompositionV1,
  after: ShowCompositionV1,
): ShowRecord {
  // Survival is per lane: the same Show-level boundary transition appears as
  // a junction on every Zone lane it spans, so breaking any one lane's
  // junction collapses the transition (matching the engine's selected-clip
  // canonicalization), even while another lane stays aligned.
  const laneJunctions = (composition: ShowCompositionV1) =>
    projectShowUnifiedTimeline(record, composition).zones.flatMap((zone) =>
      zone.layers.flatMap((layer) =>
        layer.junctions
          .filter((junction) => junction.boundaryTransition)
          .map((junction) => ({
            key: `${zone.id}:${layer.kind}:${layer.layerIndex}:${junction.id}`,
            transitionId: junction.boundaryTransition!.id,
          }))))
  const surviving = new Set(laneJunctions(after).map((lane) => lane.key))
  const brokenIds = laneJunctions(before)
    .filter((lane) => !surviving.has(lane.key))
    .map((lane) => lane.transitionId)
  return [...new Set(brokenIds)].reduce(
    (current, transitionId) => removeShowBoundaryTransition(current, transitionId),
    record,
  )
}

/** An engine identity refusal, when no plan explains it. */
export function engineIdentityRefusal(
  command: string,
  detail: string,
): ShowCommandRefusal {
  return refuseShowCommand({
    code: 'engine-refused',
    message: `${command}: the engine declined this edit. ${detail}`,
  })
}
