import { removeShowBoundaryTransitionPreservingTime, type ShowBoundaryTransitionTimeRepairRefusalReason } from './showBoundaryTransitionTimeRepair'
import {
  projectShowClipDeletionBoundaryEligibility,
  type ShowClipDeletionBoundaryEligibility,
  type ShowClipDeletionBoundaryEligibilityResult,
} from './showClipDeletionBoundaryEligibility'
import { validateShowComposition } from './showCompositionModel'
import { deleteShowClipWithLayerTransitions } from './showLayerTransitionAuthoring'
import type { ShowRecord } from './personalContentRecords'
import type { ShowTimelineClipOwner } from './showTimelineClipAuthoring'

export type ShowClipDeletionRefusalReason =
  | 'delete-refused'
  | 'invalid-result'
  | 'already-cut'
  | Extract<ShowClipDeletionBoundaryEligibilityResult, { status: 'refused' }>['reason']
  | ShowBoundaryTransitionTimeRepairRefusalReason

export interface ShowClipDeletionBoundaryRepair {
  transitionId: string
  destinationSceneId: string
  removedDurationMs: number
  shiftedPlacementIds: string[]
  shiftedPropertyTrackIds: string[]
  shiftedKeyframeIds: string[]
  shiftedGroupOccurrenceIds: string[]
}

export type ShowClipDeletionResult =
  | {
      status: 'applied'
      record: ShowRecord
      repairedTransitionIds: string[]
      repairedBoundaries: ShowClipDeletionBoundaryRepair[]
      retainedBoundaries: ShowClipDeletionBoundaryEligibility[]
    }
  | {
      status: 'refused'
      record: ShowRecord
      reason: ShowClipDeletionRefusalReason
      transitionId?: string
      details?: readonly string[]
    }

/**
 * Delete one direct logical Clip and repair only the Scene boundaries its
 * original physical segments made obsolete. The compound edit is atomic:
 * every refusal returns the exact input Show record.
 */
export function deleteShowClipInShow(
  show: ShowRecord,
  composition: NonNullable<ShowRecord['composition']>,
  owner: ShowTimelineClipOwner,
): ShowClipDeletionResult {
  const plannedComposition = deleteShowClipWithLayerTransitions(show, composition, owner)
  if (plannedComposition === composition) {
    return { status: 'refused', record: show, reason: 'delete-refused' }
  }

  const eligibility = projectShowClipDeletionBoundaryEligibility(
    show,
    composition,
    owner.placementId,
    plannedComposition,
  )
  if (eligibility.status === 'refused') {
    return { status: 'refused', record: show, reason: eligibility.reason }
  }

  let candidate: ShowRecord = { ...show, composition: plannedComposition }
  const repairedTransitionIds: string[] = []
  const repairedBoundaries: ShowClipDeletionBoundaryRepair[] = []
  for (const boundary of eligibility.boundaries) {
    if (boundary.decision !== 'repair') continue
    const destinationSceneId = destinationSceneIdForBoundary(candidate, boundary.afterSceneId)
    if (!destinationSceneId || !candidate.composition) {
      return {
        status: 'refused',
        record: show,
        reason: 'missing-destination-scene',
        transitionId: boundary.transitionId,
      }
    }
    const destinationComposition = candidate.composition.scenes.find((scene) => scene.sceneId === destinationSceneId)
    const shiftedPlacementIds = destinationComposition?.zones.flatMap((zone) => [
      ...zone.main,
      ...zone.overlays.flatMap((layer) => layer.placements),
    ]).map((placement) => placement.id) ?? []
    const shiftedPropertyTrackIds = (destinationComposition?.propertyTracks ?? []).map((track) => track.id)
    const shiftedKeyframeIds = (destinationComposition?.propertyTracks ?? [])
      .flatMap((track) => track.keyframes.map((keyframe) => keyframe.id))
    const shiftedGroupOccurrenceIds = (candidate.composition.groupOccurrences ?? [])
      .filter((occurrence) => occurrence.sceneId === destinationSceneId)
      .map((occurrence) => occurrence.id)
    const repaired = removeShowBoundaryTransitionPreservingTime(candidate, boundary.transitionId)
    if (repaired.status !== 'applied') {
      return {
        status: 'refused',
        record: show,
        reason: repaired.reason,
        transitionId: boundary.transitionId,
        ...('details' in repaired && repaired.details ? { details: repaired.details } : {}),
      }
    }
    repairedTransitionIds.push(boundary.transitionId)
    repairedBoundaries.push({
      transitionId: boundary.transitionId,
      destinationSceneId: repaired.destinationSceneId,
      removedDurationMs: repaired.removedDurationMs,
      shiftedPlacementIds,
      shiftedPropertyTrackIds,
      shiftedKeyframeIds,
      shiftedGroupOccurrenceIds,
    })
    candidate = repaired.record
  }

  const issues = candidate.composition
    ? validateShowComposition(candidate, candidate.composition)
    : []
  if (!candidate.composition || issues.length > 0) {
    return {
      status: 'refused',
      record: show,
      reason: 'invalid-result',
      details: issues.map((issue) => `${issue.path}: ${issue.message}`),
    }
  }

  return {
    status: 'applied',
    record: candidate,
    repairedTransitionIds,
    repairedBoundaries,
    retainedBoundaries: eligibility.boundaries.filter((boundary) => boundary.decision === 'retain'),
  }
}

function destinationSceneIdForBoundary(show: ShowRecord, afterSceneId: string): string | null {
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === afterSceneId)
  return sceneIndex >= 0 ? show.scenes[sceneIndex + 1]?.id ?? null : null
}
