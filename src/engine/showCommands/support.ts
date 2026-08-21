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
  const boundaryJunctions = (composition: ShowCompositionV1) =>
    projectShowUnifiedTimeline(record, composition).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.junctions))
      .filter((junction) => junction.boundaryTransition)
  const surviving = new Set(boundaryJunctions(after).map((junction) => junction.id))
  const brokenIds = boundaryJunctions(before)
    .filter((junction) => !surviving.has(junction.id))
    .map((junction) => junction.boundaryTransition!.id)
  return brokenIds.reduce(
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
