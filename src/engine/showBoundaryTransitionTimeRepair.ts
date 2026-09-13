import type {
  ShowCompositionV1,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowRecord,
  ShowSceneComposition,
} from './personalContentRecords'
import { validateShowComposition } from './showCompositionModel'
import { projectShowTimeline } from './showModel'

export type ShowBoundaryTransitionTimeRepairRefusalReason =
  | 'missing-composition'
  | 'missing-transition'
  | 'ambiguous-transition'
  | 'routing-transition'
  | 'invalid-duration'
  | 'ambiguous-visual-boundary'
  | 'missing-boundary-scene'
  | 'ambiguous-boundary-scene'
  | 'missing-destination-scene'
  | 'ambiguous-destination-scene'
  | 'ambiguous-show-scene'
  | 'invalid-scene-duration'
  | 'ambiguous-composition-scene'
  | 'invalid-composition'
  | 'property-transitions'
  | 'cross-boundary-shared-instance'
  | 'destination-entry-content'
  | 'output-feedback-state'
  | 'invalid-result'

export type ShowBoundaryTransitionTimeRepairResult =
  | {
      status: 'applied'
      record: ShowRecord
      transitionId: string
      destinationSceneId: string
      boundaryStartMs: number
      removedDurationMs: number
    }
  | {
      status: 'noop'
      record: ShowRecord
      reason: 'already-cut'
    }
  | {
      status: 'refused'
      record: ShowRecord
      reason: ShowBoundaryTransitionTimeRepairRefusalReason
      details?: readonly string[]
    }

/**
 * Remove one explicitly identified visual Scene-boundary Transition while
 * retaining its duration in the destination Scene's local coordinate space.
 * Candidate eligibility remains a separate decision owned by the caller.
 */
export function removeShowBoundaryTransitionPreservingTime(
  show: ShowRecord,
  transitionId: string,
): ShowBoundaryTransitionTimeRepairResult {
  const matches = show.transitions.filter((transition) => transition.id === transitionId)
  if (matches.length === 0) return { status: 'refused', record: show, reason: 'missing-transition' }
  if (matches.length > 1) return { status: 'refused', record: show, reason: 'ambiguous-transition' }
  const transition = matches[0]
  if (transition.kind === 'routing') return { status: 'refused', record: show, reason: 'routing-transition' }
  if (transition.kind === 'cut') return { status: 'noop', record: show, reason: 'already-cut' }
  if (!Number.isSafeInteger(transition.durationMs) || transition.durationMs <= 0) {
    return { status: 'refused', record: show, reason: 'invalid-duration' }
  }
  if (transition.propertyTransitions !== undefined) {
    return { status: 'refused', record: show, reason: 'property-transitions' }
  }
  const visualTransitionsAtBoundary = show.transitions.filter((candidate) => (
    candidate.afterSceneId === transition.afterSceneId && candidate.kind !== 'routing'
  ))
  if (visualTransitionsAtBoundary.length !== 1) {
    return { status: 'refused', record: show, reason: 'ambiguous-visual-boundary' }
  }
  if (!show.composition) return { status: 'refused', record: show, reason: 'missing-composition' }
  const duplicateShowSceneIds = duplicateIds(show.scenes.map((scene) => scene.id))
  const sceneIndices = show.scenes.flatMap((scene, index) => (
    scene.id === transition.afterSceneId ? [index] : []
  ))
  if (sceneIndices.length === 0) {
    return { status: 'refused', record: show, reason: 'missing-boundary-scene' }
  }
  if (sceneIndices.length > 1) {
    return { status: 'refused', record: show, reason: 'ambiguous-boundary-scene' }
  }
  const sceneIndex = sceneIndices[0]
  const destinationScene = show.scenes[sceneIndex + 1]
  if (!destinationScene) return { status: 'refused', record: show, reason: 'missing-destination-scene' }
  if (show.scenes.filter((scene) => scene.id === destinationScene.id).length > 1) {
    return { status: 'refused', record: show, reason: 'ambiguous-destination-scene' }
  }
  if (duplicateShowSceneIds.length > 0) {
    return {
      status: 'refused',
      record: show,
      reason: 'ambiguous-show-scene',
      details: duplicateShowSceneIds,
    }
  }
  const invalidSceneDurationIds = show.scenes
    .filter((scene) => !Number.isSafeInteger(scene.durationMs) || scene.durationMs <= 0)
    .map((scene) => scene.id)
  if (invalidSceneDurationIds.length > 0) {
    return {
      status: 'refused',
      record: show,
      reason: 'invalid-scene-duration',
      details: invalidSceneDurationIds,
    }
  }
  const duplicateCompositionSceneIds = duplicateIds(show.composition.scenes.map((scene) => scene.sceneId))
  if (duplicateCompositionSceneIds.length > 0) {
    return {
      status: 'refused',
      record: show,
      reason: 'ambiguous-composition-scene',
      details: duplicateCompositionSceneIds,
    }
  }
  const compositionIssues = validateShowComposition(show, show.composition)
  if (compositionIssues.length > 0) {
    return {
      status: 'refused',
      record: show,
      reason: 'invalid-composition',
      details: compositionIssues.map((issue) => `${issue.path}: ${issue.message}`),
    }
  }
  const sharedInstanceIds = sharedDirectInstanceIds(
    show.composition,
    transition.afterSceneId,
    new Set(show.scenes.slice(sceneIndex + 1).map((scene) => scene.id)),
  )
  if (sharedInstanceIds.length > 0) {
    return {
      status: 'refused',
      record: show,
      reason: 'cross-boundary-shared-instance',
      details: sharedInstanceIds,
    }
  }
  const destinationEntryOwners = contentAtDestinationEntry(show.composition, destinationScene.id)
  if (destinationEntryOwners.length > 0) {
    return {
      status: 'refused',
      record: show,
      reason: 'destination-entry-content',
      details: destinationEntryOwners,
    }
  }
  if ((show.outputEffects?.length ?? 0) > 0) {
    return {
      status: 'refused',
      record: show,
      reason: 'output-feedback-state',
      details: show.outputEffects!.map((effect) => effect.id),
    }
  }
  const destinationDurationMs = destinationScene.durationMs + transition.durationMs
  if (!Number.isSafeInteger(destinationDurationMs) || destinationDurationMs <= 0) {
    return { status: 'refused', record: show, reason: 'invalid-duration' }
  }

  const boundaryStartMs = projectShowTimeline(show).boundaryTransitions
    .find((candidate) => candidate.id === transitionId)?.startMs
  if (boundaryStartMs === undefined) {
    return { status: 'refused', record: show, reason: 'missing-boundary-scene' }
  }
  const composition = shiftDestinationSceneLocalTime(
    show.composition,
    destinationScene.id,
    transition.durationMs,
  )
  const record: ShowRecord = {
    ...show,
    scenes: show.scenes.map((scene, index) => (
      index === sceneIndex + 1 ? { ...scene, durationMs: destinationDurationMs } : scene
    )),
    transitions: show.transitions.map((candidate) => candidate.id === transitionId
      ? {
          id: candidate.id,
          afterSceneId: candidate.afterSceneId,
          kind: 'cut',
          durationMs: 0,
          easing: structuredClone(candidate.easing),
        }
      : candidate),
    composition,
  }
  const resultIssues = validateShowComposition(record, record.composition!)
  if (resultIssues.length > 0) {
    return {
      status: 'refused',
      record: show,
      reason: 'invalid-result',
      details: resultIssues.map((issue) => `${issue.path}: ${issue.message}`),
    }
  }
  return {
    status: 'applied',
    record,
    transitionId,
    destinationSceneId: destinationScene.id,
    boundaryStartMs,
    removedDurationMs: transition.durationMs,
  }
}

function duplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
  }
  return [...duplicates].sort((left, right) => left.localeCompare(right))
}

function sharedDirectInstanceIds(
  composition: ShowCompositionV1,
  outgoingSceneId: string,
  laterSceneIds: ReadonlySet<string>,
): string[] {
  const instanceIds = (sceneId: string) => new Set(composition.scenes
    .filter((scene) => scene.sceneId === sceneId)
    .flatMap((scene) => scene.zones.flatMap((zone) => [
      ...zone.main,
      ...zone.overlays.flatMap((layer) => layer.placements),
    ]))
    .map((placement) => placement.instanceId))
  const outgoing = instanceIds(outgoingSceneId)
  const later = new Set([...laterSceneIds].flatMap((sceneId) => [...instanceIds(sceneId)]))
  return [...later]
    .filter((instanceId) => outgoing.has(instanceId))
    .sort((left, right) => left.localeCompare(right))
}

function contentAtDestinationEntry(
  composition: ShowCompositionV1,
  destinationSceneId: string,
): string[] {
  const direct = composition.scenes
    .filter((scene) => scene.sceneId === destinationSceneId)
    .flatMap((scene) => scene.zones.flatMap((zone) => [
      ...zone.main,
      ...zone.overlays.flatMap((layer) => layer.placements),
    ]))
    .filter((placement) => placement.startMs === 0)
    .map((placement) => placement.id)
  const definitionById = new Map((composition.groupDefinitions ?? [])
    .map((definition) => [definition.id, definition]))
  const groups = (composition.groupOccurrences ?? []).flatMap((occurrence) => {
    if (occurrence.sceneId !== destinationSceneId) return []
    const definition = definitionById.get(occurrence.definitionId)
    return definition?.placements.some((placement) => occurrence.startMs + placement.startMs === 0)
      ? [occurrence.id]
      : []
  })
  return [...direct, ...groups].sort((left, right) => left.localeCompare(right))
}

function shiftDestinationSceneLocalTime(
  composition: ShowCompositionV1,
  destinationSceneId: string,
  durationMs: number,
): ShowCompositionV1 {
  return {
    ...composition,
    scenes: composition.scenes.map((scene) => scene.sceneId === destinationSceneId
      ? shiftSceneComposition(scene, durationMs)
      : scene),
    ...(composition.groupOccurrences
      ? {
          groupOccurrences: composition.groupOccurrences.map((occurrence) => occurrence.sceneId === destinationSceneId
            ? { ...occurrence, startMs: occurrence.startMs + durationMs }
            : occurrence),
        }
      : {}),
  }
}

function shiftSceneComposition(
  scene: ShowSceneComposition,
  durationMs: number,
): ShowSceneComposition {
  return {
    ...scene,
    ...(scene.propertyTracks
      ? {
          propertyTracks: scene.propertyTracks.map((track) => ({
            ...track,
            keyframes: track.keyframes.map((keyframe) => ({
              ...keyframe,
              timeMs: keyframe.timeMs + durationMs,
            })),
          })),
        }
      : {}),
    zones: scene.zones.map((zone) => ({
      ...zone,
      main: zone.main.map((placement) => shiftPlacement(placement, durationMs)),
      overlays: zone.overlays.map((layer) => ({
        ...layer,
        placements: layer.placements.map((placement) => shiftPlacement(placement, durationMs)),
      })),
    })),
  }
}

function shiftPlacement<T extends ShowMainPlacement | ShowOverlayPlacement>(
  placement: T,
  durationMs: number,
): T {
  return { ...placement, startMs: placement.startMs + durationMs }
}
