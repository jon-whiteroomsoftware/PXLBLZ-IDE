import { materializeShowGroupOccurrences } from './showGroupModel'
import { validateShowComposition } from './showCompositionModel'
import type {
  ShowCompositionV1,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowRecord,
} from './personalContentRecords'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

export type ShowClipDeletionBoundaryEdge = 'outgoing' | 'incoming'

export type ShowClipDeletionBoundaryDependency =
  | 'property-transitions'
  | 'surviving-junction'
  | 'incoming-content'

export interface ShowClipDeletionBoundaryEligibility {
  transitionId: string
  afterSceneId: string
  durationMs: number
  touchedEdges: ShowClipDeletionBoundaryEdge[]
  decision: 'repair' | 'retain'
  dependencies: ShowClipDeletionBoundaryDependency[]
}

export type ShowClipDeletionBoundaryEligibilityResult =
  | {
      status: 'ready'
      boundaries: ShowClipDeletionBoundaryEligibility[]
    }
  | {
      status: 'refused'
      reason:
        | 'invalid-original-composition'
        | 'invalid-planned-composition'
        | 'missing-deleted-clip'
        | 'deleted-clip-remains'
    }

/**
 * Classify only visual boundaries touched by the deleted logical Clip's
 * original physical segments. This does not mutate the Show or perform the
 * accepted time-preserving repair.
 */
export function projectShowClipDeletionBoundaryEligibility(
  show: ShowRecord,
  originalComposition: ShowCompositionV1,
  deletedClipId: string,
  plannedComposition: ShowCompositionV1,
): ShowClipDeletionBoundaryEligibilityResult {
  if (validateShowComposition(show, originalComposition).length > 0) {
    return { status: 'refused', reason: 'invalid-original-composition' }
  }
  if (validateShowComposition(show, plannedComposition).length > 0) {
    return { status: 'refused', reason: 'invalid-planned-composition' }
  }

  const originalPlacements = directPlacements(originalComposition)
  const selected = originalPlacements.filter(({ placement }) => placement.id === deletedClipId)
  if (selected.length !== 1) return { status: 'refused', reason: 'missing-deleted-clip' }
  const logicalClipId = selected[0].placement.logicalClipId ?? selected[0].placement.id
  const originalSegments = originalPlacements.filter(({ placement }) => (
    (placement.logicalClipId ?? placement.id) === logicalClipId
  ))
  if (directPlacements(plannedComposition).some(({ placement }) => (
    (placement.logicalClipId ?? placement.id) === logicalClipId
  ))) {
    return { status: 'refused', reason: 'deleted-clip-remains' }
  }

  const sceneIndexById = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  const touchedByTransitionId = new Map<string, Set<ShowClipDeletionBoundaryEdge>>()
  const touch = (afterSceneId: string, edge: ShowClipDeletionBoundaryEdge) => {
    for (const transition of show.transitions) {
      if (
        transition.afterSceneId !== afterSceneId
        || transition.kind === 'cut'
        || transition.kind === 'routing'
        || transition.durationMs <= 0
      ) continue
      const edges = touchedByTransitionId.get(transition.id) ?? new Set()
      edges.add(edge)
      touchedByTransitionId.set(transition.id, edges)
    }
  }

  for (const { sceneId, placement } of originalSegments) {
    const sceneIndex = sceneIndexById.get(sceneId)
    if (sceneIndex === undefined) continue
    const scene = show.scenes[sceneIndex]
    if (placement.startMs + placement.durationMs === scene.durationMs) {
      touch(scene.id, 'outgoing')
    }
    if (placement.startMs === 0 && sceneIndex > 0) {
      touch(show.scenes[sceneIndex - 1].id, 'incoming')
    }
  }

  const projection = projectShowUnifiedTimeline(show, plannedComposition)
  const materialized = materializeShowGroupOccurrences(plannedComposition)
  const transitionIndexById = new Map(show.transitions.map((transition, index) => [transition.id, index]))
  const boundaries = [...touchedByTransitionId.entries()]
    .map(([transitionId, edges]): ShowClipDeletionBoundaryEligibility => {
      const transition = show.transitions.find((candidate) => candidate.id === transitionId)!
      const sceneIndex = sceneIndexById.get(transition.afterSceneId)!
      const destinationSceneId = show.scenes[sceneIndex + 1]?.id
      const hasSurvivingJunction = projection.zones.some((zone) => zone.layers.some((layer) => (
        layer.junctions.some((junction) => junction.boundaryTransition?.id === transitionId)
      )))
      const hasIncomingContent = Boolean(destinationSceneId && materialized.scenes
        .filter((scene) => scene.sceneId === destinationSceneId)
        .some((scene) => scene.zones.some((zone) => [
          ...zone.main,
          ...zone.overlays.flatMap((layer) => layer.placements),
        ].some((placement) => placement.startMs === 0))))
      const dependencies: ShowClipDeletionBoundaryDependency[] = [
        ...(transition.propertyTransitions !== undefined
          ? ['property-transitions' as const]
          : []),
        ...(hasSurvivingJunction ? ['surviving-junction' as const] : []),
        ...(hasIncomingContent ? ['incoming-content' as const] : []),
      ]
      return {
        transitionId,
        afterSceneId: transition.afterSceneId,
        durationMs: transition.durationMs,
        touchedEdges: ['outgoing', 'incoming'].filter((edge): edge is ShowClipDeletionBoundaryEdge => (
          edges.has(edge as ShowClipDeletionBoundaryEdge)
        )),
        decision: dependencies.length > 0 ? 'retain' : 'repair',
        dependencies,
      }
    })
    .sort((left, right) => (
      (transitionIndexById.get(left.transitionId) ?? 0)
      - (transitionIndexById.get(right.transitionId) ?? 0)
      || left.transitionId.localeCompare(right.transitionId)
    ))

  return { status: 'ready', boundaries }
}

function directPlacements(composition: ShowCompositionV1): Array<{
  sceneId: string
  placement: ShowMainPlacement | ShowOverlayPlacement
}> {
  return composition.scenes.flatMap((scene) => scene.zones.flatMap((zone) => [
    ...zone.main.map((placement) => ({ sceneId: scene.sceneId, placement })),
    ...zone.overlays.flatMap((layer) => layer.placements
      .map((placement) => ({ sceneId: scene.sceneId, placement }))),
  ]))
}
