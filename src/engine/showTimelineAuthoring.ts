import { editShowMarkerFromUI, type ShowMarkerRequest } from './showExactTimelineMarker'
import { validateShowComposition } from './showCompositionModel'
import { multiSegmentLogicalClips, multiSegmentLogicalPlacementIds } from './showClipInvariant'
import { normalizePersistedShowEasing } from './showEasing'
import { projectShowTimeline, showLoopDurationMs } from './showModel'
import { evaluateShowPropertyTrack } from './showPropertyAnimation'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import type {
  ShowBoundaryTransition,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPropertyAnimationTrack,
  ShowRecord,
  ShowTimelineMarker,
} from './personalContentRecords'

export type ShowEndEditResult =
  | {
      status: 'applied'
      record: ShowRecord
      requestedEndMs: number
      actualEndMs: number
      contentClamped: boolean
      removedSceneIds: string[]
    }
  | {
      status: 'noop'
      record: ShowRecord
      code: 'already-set' | 'content-clamped'
      actualEndMs: number
    }
  | {
      status: 'refused'
      record: ShowRecord
      code: 'invalid-input' | 'invalid-composition' | 'unsupported-topology'
      reason: string
      remedy?: string
      blockerIds?: string[]
    }

export type ShowTimeInsertionPlan =
  | { enabled: true; code: 'ready'; sceneId: string; localTimeMs: number; crossingPlacementIds: string[] }
  | { enabled: false; code: 'invalid-time' | 'invalid-duration' | 'transition' | 'group' | 'logical-clip' | 'missing-composition' | 'nonlinear-property-animation'; reason: string }

export function planShowTimeInsertion(
  show: ShowRecord,
  atMs: number,
  durationMs: number,
): ShowTimeInsertionPlan {
  if (!show.composition) {
    return { enabled: false, code: 'missing-composition', reason: 'Insert Time needs the unified timeline.' }
  }
  if (!Number.isFinite(atMs) || atMs < 0 || atMs > showLoopDurationMs(show)) {
    return { enabled: false, code: 'invalid-time', reason: 'Choose a time inside the Show.' }
  }
  if (!Number.isFinite(durationMs) || Math.round(durationMs) <= 0) {
    return { enabled: false, code: 'invalid-duration', reason: 'Enter a positive amount of time.' }
  }

  const timeline = projectShowTimeline(show)
  const insideLegacyTransition = timeline.transitions.some((transition) => (
    atMs >= transition.startMs && atMs <= transition.endMs
  ))
  const insideLayerTransition = projectShowUnifiedTimeline(show, show.composition).zones
    .some((zone) => zone.layers.some((layer) => layer.junctions.some((junction) => (
      junction.durationMs > 0 && atMs >= junction.startMs && atMs <= junction.endMs
    ))))
  if (insideLegacyTransition || insideLayerTransition) {
    return { enabled: false, code: 'transition', reason: 'Insert Time is unavailable inside a Transition.' }
  }
  const boundarySceneIndex = timeline.scenes.findIndex((scene, index) => (
    index > 0 && scene.startMs === Math.round(atMs)
  ))
  if (boundarySceneIndex > 0) {
    const sceneIndexById = new Map(timeline.scenes.map((scene, index) => [scene.sceneId, index]))
    const crossesLogicalClip = multiSegmentLogicalClips(show.composition).some((logicalClip) => {
      const indexes = logicalClip.segments.flatMap((segment) => {
        const index = sceneIndexById.get(segment.sceneId)
        return index == null ? [] : [index]
      })
      return indexes.some((index) => index < boundarySceneIndex)
        && indexes.some((index) => index >= boundarySceneIndex)
    })
    if (crossesLogicalClip) {
      return {
        enabled: false,
        code: 'logical-clip',
        reason: 'Insert Time is unavailable inside a multi-part Clip.',
      }
    }
  }

  const range = timeline.scenes.find((scene) => atMs >= scene.startMs && atMs <= scene.endMs)
  if (!range) return { enabled: false, code: 'invalid-time', reason: 'Choose a time inside the Show.' }
  const localTimeMs = Math.round(atMs - range.startMs)
  const scene = show.composition.scenes.find((candidate) => candidate.sceneId === range.sceneId)
  const definitionById = new Map((show.composition.groupDefinitions ?? [])
    .map((definition) => [definition.id, definition]))
  const insideGroup = (show.composition.groupOccurrences ?? []).some((occurrence) => {
    if (occurrence.sceneId !== range.sceneId) return false
    const definition = definitionById.get(occurrence.definitionId)
    const endMs = occurrence.startMs + (definition
      ? Math.max(0, ...definition.placements.map((placement) => placement.startMs + placement.durationMs))
      : 0)
    return occurrence.startMs < localTimeMs && endMs > localTimeMs
  })
  if (insideGroup) {
    return {
      enabled: false,
      code: 'group',
      reason: 'Insert Time is unavailable inside a Group. Move or Ungroup it first.',
    }
  }
  if ((scene?.propertyTracks ?? []).some((track) => nonlinearSegmentCrosses(track, localTimeMs))) {
    return {
      enabled: false,
      code: 'nonlinear-property-animation',
      reason: 'Add a keyframe at the playhead or change the crossing segment to Linear before inserting time.',
    }
  }
  const crossingPlacementIds = scene
    ? scene.zones.flatMap((zone) => [
        ...zone.main,
        ...zone.overlays.flatMap((layer) => layer.placements),
      ]).filter((placement) => (
        placement.startMs < localTimeMs
        && placement.startMs + placement.durationMs > localTimeMs
      )).map((placement) => placement.id).sort()
    : []
  const logicalPlacementIds = multiSegmentLogicalPlacementIds(show.composition)
  if (crossingPlacementIds.some((placementId) => logicalPlacementIds.has(placementId))) {
    return {
      enabled: false,
      code: 'logical-clip',
      reason: 'Insert Time is unavailable inside a multi-part Clip.',
    }
  }
  return { enabled: true, code: 'ready', sceneId: range.sceneId, localTimeMs, crossingPlacementIds }
}

function nonlinearSegmentCrosses(track: ShowPropertyAnimationTrack, atMs: number): boolean {
  const keyframes = [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  return keyframes.slice(0, -1).some((left, index) => {
    const right = keyframes[index + 1]
    if (left.timeMs >= atMs || right.timeMs <= atMs) return false
    if (Math.abs(right.value - left.value) <= 0.000001) return false
    return normalizePersistedShowEasing(left.easing).curve !== 'linear'
  })
}

export function insertShowTime(
  show: ShowRecord,
  input: {
    atMs: number
    durationMs: number
    newPlacementIdBySourceId: Record<string, string>
  },
): ShowRecord {
  const plan = planShowTimeInsertion(show, input.atMs, input.durationMs)
  if (!plan.enabled || !show.composition) return show
  const durationMs = Math.round(input.durationMs)
  const existingPlacementIds = new Set(show.composition.scenes.flatMap((scene) => scene.zones.flatMap((zone) => [
    ...zone.main.map((placement) => placement.id),
    ...zone.overlays.flatMap((layer) => layer.placements.map((placement) => placement.id)),
  ])))
  const newIds = plan.crossingPlacementIds.map((id) => input.newPlacementIdBySourceId[id])
  if (newIds.some((id) => !id || existingPlacementIds.has(id)) || new Set(newIds).size !== newIds.length) return show

  const next: ShowRecord = structuredClone(show)
  const targetScene = next.scenes.find((scene) => scene.id === plan.sceneId)
  const targetComposition = next.composition!.scenes.find((scene) => scene.sceneId === plan.sceneId)
  if (!targetScene || !targetComposition) return show
  targetScene.durationMs += durationMs
  next.composition!.durationMs = showLoopDurationMs(show) + durationMs
  next.composition!.markers = (next.composition!.markers ?? []).map((marker) => (
    marker.timeMs >= input.atMs ? { ...marker, timeMs: marker.timeMs + durationMs } : marker
  ))

  const splitIds = new Map<string, string>()
  for (const zone of targetComposition.zones) {
    insertIntoPlacements(zone.main, plan.localTimeMs, durationMs, input.newPlacementIdBySourceId, splitIds)
    for (const layer of zone.overlays) {
      insertIntoPlacements(layer.placements, plan.localTimeMs, durationMs, input.newPlacementIdBySourceId, splitIds)
    }
  }
  next.composition!.groupOccurrences = next.composition!.groupOccurrences?.map((occurrence) => (
    occurrence.sceneId === plan.sceneId && occurrence.startMs >= plan.localTimeMs
      ? { ...occurrence, startMs: occurrence.startMs + durationMs }
      : occurrence
  ))
  next.composition!.transitions?.forEach((transition) => {
    const replacement = splitIds.get(transition.fromPlacementId)
    if (replacement) transition.fromPlacementId = replacement
  })

  const authoredTracks = targetComposition.propertyTracks ?? []
  targetComposition.propertyTracks = authoredTracks.map((track) => (
    insertIntoPropertyTrack(track, plan.localTimeMs, durationMs)
  ))
  for (const [sourceId, targetId] of splitIds) {
    const clones = targetComposition.propertyTracks.flatMap((track) => {
      if (!('placementId' in track.target) || track.target.placementId !== sourceId) return []
      return [{
        ...structuredClone(track),
        id: `${track.id}-${targetId}`,
        target: { ...track.target, placementId: targetId },
        keyframes: track.keyframes.map((keyframe) => ({
          ...keyframe,
          id: `${keyframe.id}-${targetId}`,
        })),
      }]
    })
    targetComposition.propertyTracks.push(...clones)
  }
  if (targetComposition.propertyTracks.length === 0) delete targetComposition.propertyTracks

  next.updatedAt = Math.max(Date.now(), show.updatedAt + 1)
  if (validateShowComposition(next, next.composition!).length > 0) return show
  return next
}

/** Final authored Clip boundary in global Show time. Groups are materialized by the projection. */
export function showTimelineContentEndMs(show: ShowRecord): number {
  if (!show.composition) return showLoopDurationMs(show)
  return projectShowUnifiedTimeline(show, show.composition).zones.reduce((showEndMs, zone) => (
    zone.layers.reduce((zoneEndMs, layer) => (
      layer.clips.reduce((layerEndMs, clip) => Math.max(layerEndMs, clip.endMs), zoneEndMs)
    ), showEndMs)
  ), 1)
}

/** Set the deterministic loop boundary without truncating authored content. */
export function editShowEndMs(show: ShowRecord, requestedDurationMs: number): ShowEndEditResult {
  if (!Number.isFinite(requestedDurationMs)) {
    return { status: 'refused', record: show, code: 'invalid-input', reason: 'Show End must be a finite time.' }
  }
  if (!show.composition || show.scenes.length === 0) {
    return { status: 'refused', record: show, code: 'invalid-composition', reason: 'Show End needs a valid composition with at least one Scene.' }
  }
  const requestedMs = Math.max(1, Math.round(requestedDurationMs))
  const preimageIssue = showEndPreimageIssue(show)
  if (preimageIssue) {
    return { status: 'refused', record: show, code: 'invalid-composition', reason: preimageIssue }
  }

  const contentEndMs = showTimelineContentEndMs(show)
  const durationMs = Math.max(contentEndMs, requestedMs)
  if (showLoopDurationMs(show) === durationMs) {
    return {
      status: 'noop',
      record: show,
      code: durationMs > requestedMs ? 'content-clamped' : 'already-set',
      actualEndMs: durationMs,
    }
  }

  const timeline = projectShowTimeline(show)
  const transitionAtEnd = timeline.transitions.find((transition) => (
    durationMs > transition.startMs && durationMs <= transition.endMs
  ))
  if (transitionAtEnd) {
    const transition = show.transitions.find((candidate) => (
      candidate.afterSceneId === transitionAtEnd.afterSceneId && candidate.kind !== 'routing'
    ))
    const destinationIndex = show.scenes.findIndex((scene) => scene.id === transitionAtEnd.afterSceneId) + 1
    const destination = show.scenes[destinationIndex]
    return meaningfulBoundaryRefusal(show, durationMs, transition, destination?.id)
  }

  let retainedSceneIndex = timeline.scenes.findIndex((range) => (
    durationMs > range.startMs && durationMs <= range.endMs
  ))
  if (retainedSceneIndex < 0) {
    const destinationIndex = timeline.scenes.findIndex((range) => range.startMs === durationMs)
    if (destinationIndex > 0) retainedSceneIndex = destinationIndex - 1
    else if (durationMs > timeline.durationMs) retainedSceneIndex = show.scenes.length - 1
  }
  if (retainedSceneIndex < 0) {
    return {
      status: 'refused',
      record: show,
      code: 'unsupported-topology',
      reason: `Show End ${durationMs} ms is outside a supported Scene hold.`,
    }
  }

  const retainedRange = timeline.scenes[retainedSceneIndex]
  const nextFinalDurationMs = durationMs - retainedRange.startMs
  if (!Number.isSafeInteger(nextFinalDurationMs) || nextFinalDurationMs <= 0) {
    return {
      status: 'refused',
      record: show,
      code: 'unsupported-topology',
      reason: `Show End ${durationMs} ms cannot retain a positive final Scene.`,
      blockerIds: [retainedRange.sceneId],
    }
  }

  const removedScenes = show.scenes.slice(retainedSceneIndex + 1)
  if (removedScenes.length > 0) {
    const suffixIssue = showEndSuffixIssue(show, retainedSceneIndex, durationMs)
    if (suffixIssue) return suffixIssue
  }

  const removedSceneIds = removedScenes.map((scene) => scene.id)
  const removedSceneIdSet = new Set(removedSceneIds)
  const removedBoundarySceneIds = new Set(show.scenes
    .slice(retainedSceneIndex, -1)
    .map((scene) => scene.id))
  const sceneIndexById = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  const cells = removedScenes.length === 0 ? show.cells : show.cells.flatMap((cell) => {
    const start = sceneIndexById.get(cell.sceneId)
    if (start == null || removedSceneIdSet.has(cell.sceneId)) return []
    const end = start + cell.sceneSpan - 1
    if (end <= retainedSceneIndex) return [cell]
    return [{ ...cell, sceneSpan: retainedSceneIndex - start + 1 }]
  })

  const next: ShowRecord = {
    ...show,
    scenes: show.scenes.slice(0, retainedSceneIndex + 1).map((scene) => scene.id === retainedRange.sceneId
      ? { ...scene, durationMs: nextFinalDurationMs }
      : scene),
    cells,
    transitions: show.transitions.filter((transition) => !removedBoundarySceneIds.has(transition.afterSceneId)),
    composition: {
      ...show.composition,
      scenes: show.composition.scenes.filter((scene) => !removedSceneIdSet.has(scene.sceneId)),
      durationMs,
    },
    updatedAt: Math.max(Date.now(), show.updatedAt + 1),
  }
  if (
    next.scenes.some((scene) => !Number.isSafeInteger(scene.durationMs) || scene.durationMs <= 0)
    || validateShowComposition(next, next.composition!).length > 0
    || showLoopDurationMs(next) !== durationMs
  ) {
    return {
      status: 'refused',
      record: show,
      code: 'unsupported-topology',
      reason: `Show End ${durationMs} ms would place authored Scene content outside its owner.`,
      blockerIds: [retainedRange.sceneId],
    }
  }
  return {
    status: 'applied',
    record: next,
    requestedEndMs: requestedMs,
    actualEndMs: durationMs,
    contentClamped: durationMs > requestedMs,
    removedSceneIds,
  }
}

/** Compatibility wrapper for manual preview/commit owners. */
export function setShowEndMs(show: ShowRecord, requestedDurationMs: number): ShowRecord {
  const result = editShowEndMs(show, requestedDurationMs)
  return result.status === 'applied' ? result.record : show
}

function showEndPreimageIssue(show: ShowRecord): string | null {
  if (show.scenes.some((scene) => !Number.isSafeInteger(scene.durationMs) || scene.durationMs <= 0)) {
    return 'Every Scene must have a positive safe-integer duration before Show End can change.'
  }
  const showSceneIds = new Set<string>()
  for (const scene of show.scenes) {
    if (showSceneIds.has(scene.id)) return `Scene id "${scene.id}" is ambiguous.`
    showSceneIds.add(scene.id)
  }
  if (
    show.composition!.scenes.length !== show.scenes.length
    || show.composition!.scenes.some((scene, index) => scene.sceneId !== show.scenes[index]?.id)
  ) return 'Show and composition Scene owners do not match in authored order.'
  if (show.cells.some((cell) => !showSceneIds.has(cell.sceneId))) return 'A flat compatibility cell has an unknown Scene owner.'
  const issues = validateShowComposition(show, show.composition!)
  return issues.length > 0 ? `${issues[0].path}: ${issues[0].message}` : null
}

function showEndSuffixIssue(
  show: ShowRecord,
  retainedSceneIndex: number,
  durationMs: number,
): Extract<ShowEndEditResult, { status: 'refused' }> | null {
  for (let boundaryIndex = retainedSceneIndex; boundaryIndex < show.scenes.length - 1; boundaryIndex += 1) {
    const boundaryScene = show.scenes[boundaryIndex]
    const destinationScene = show.scenes[boundaryIndex + 1]
    const transitions = show.transitions.filter((transition) => transition.afterSceneId === boundaryScene.id)
    const routing = transitions.find((transition) => transition.kind === 'routing')
    if (routing) {
      return {
        status: 'refused',
        record: show,
        code: 'unsupported-topology',
        reason: `Set Show End to ${durationMs} ms would remove routing Boundary "${routing.id}" before Scene "${destinationScene.id}".`,
        remedy: 'Choose an end that preserves the routing Boundary, or remove that routing event explicitly before setting Show End.',
        blockerIds: [routing.id, destinationScene.id],
      }
    }
    const visual = transitions.filter((transition) => transition.kind !== 'routing')
    if (visual.length > 1) {
      return {
        status: 'refused',
        record: show,
        code: 'invalid-composition',
        reason: `Boundary after Scene "${boundaryScene.id}" has multiple visual owners.`,
        blockerIds: visual.map((transition) => transition.id),
      }
    }
    if (visual[0] && !isNeutralCut(visual[0])) {
      return meaningfulBoundaryRefusal(show, durationMs, visual[0], destinationScene.id)
    }
  }

  for (const scene of show.scenes.slice(retainedSceneIndex + 1)) {
    const compositionScene = show.composition!.scenes[show.scenes.findIndex((candidate) => candidate.id === scene.id)]
    const placementIds = compositionScene.zones.flatMap((zone) => [
      ...zone.main.map((placement) => placement.id),
      ...zone.overlays.flatMap((layer) => layer.placements.map((placement) => placement.id)),
    ])
    const trackIds = (compositionScene.propertyTracks ?? []).map((track) => track.id)
    const occurrenceIds = (show.composition!.groupOccurrences ?? [])
      .filter((occurrence) => occurrence.sceneId === scene.id)
      .map((occurrence) => occurrence.id)
    const propertyOwners = [
      ...(scene.routingTargets !== undefined ? [`${scene.id}:routingTargets`] : []),
      ...(scene.sampleTargets !== undefined ? [`${scene.id}:sampleTargets`] : []),
    ]
    const blockerIds = [...placementIds, ...trackIds, ...occurrenceIds, ...propertyOwners]
    if (blockerIds.length > 0) {
      return {
        status: 'refused',
        record: show,
        code: 'unsupported-topology',
        reason: `Set Show End to ${durationMs} ms would remove Scene "${scene.id}", which still owns authored content.`,
        remedy: 'Choose an end that keeps the Scene, or remove its authored content explicitly before setting Show End.',
        blockerIds: [scene.id, ...blockerIds],
      }
    }
  }
  return null
}

function meaningfulBoundaryRefusal(
  show: ShowRecord,
  durationMs: number,
  transition: ShowBoundaryTransition | undefined,
  destinationSceneId: string | undefined,
): Extract<ShowEndEditResult, { status: 'refused' }> {
  const transitionName = transition ? `Boundary "${transition.id}"` : 'the visual Boundary'
  const transitionDescription = transition
    ? `${transition.durationMs} ms ${transition.kind}`
    : 'meaningful visual choreography'
  const destinationDescription = destinationSceneId ? `Scene "${destinationSceneId}"` : 'its destination Scene'
  return {
    status: 'refused',
    record: show,
    code: 'unsupported-topology',
    reason: `Set Show End to ${durationMs} ms would remove ${destinationDescription}, but ${transitionName} is a ${transitionDescription} to that Scene.`,
    remedy: 'Reset that Boundary to Cut with set_boundary_transition, then set Show End again, or choose an end that keeps its destination Scene positive.',
    blockerIds: [transition?.id, destinationSceneId].filter((id): id is string => Boolean(id)),
  }
}

function isNeutralCut(transition: ShowBoundaryTransition): boolean {
  if (transition.kind !== 'cut' || transition.durationMs !== 0 || transition.propertyTransitions !== undefined) return false
  const neutralFields = new Set(['id', 'afterSceneId', 'kind', 'durationMs', 'easing'])
  return Object.entries(transition).every(([key, value]) => value === undefined || neutralFields.has(key))
}

export function addShowTimelineMarker(show: ShowRecord, marker: ShowTimelineMarker): ShowRecord {
  return manualMarkerRecord(show, { kind: 'add', marker })
}

export function moveShowTimelineMarker(show: ShowRecord, markerId: string, timeMs: number): ShowRecord {
  return manualMarkerRecord(show, { kind: 'move', markerId, timeMs })
}

export function updateShowTimelineMarker(show: ShowRecord, markerId: string, patch: Partial<Omit<ShowTimelineMarker, 'id'>>): ShowRecord {
  return manualMarkerRecord(show, { kind: 'update', markerId, patch })
}

export function removeShowTimelineMarker(show: ShowRecord, markerId: string): ShowRecord {
  return manualMarkerRecord(show, { kind: 'remove', markerId })
}

function manualMarkerRecord(show: ShowRecord, request: ShowMarkerRequest): ShowRecord {
  const result = editShowMarkerFromUI(show, request)
  return result.status === 'refused' ? show : result.record
}

function insertIntoPlacements<T extends ShowMainPlacement | ShowOverlayPlacement>(
  placements: T[],
  atMs: number,
  durationMs: number,
  newPlacementIdBySourceId: Record<string, string>,
  splitIds: Map<string, string>,
): void {
  const additions = new Map<T, T>()
  for (const placement of placements) {
    const endMs = placement.startMs + placement.durationMs
    if (placement.startMs >= atMs) {
      placement.startMs += durationMs
      continue
    }
    if (endMs <= atMs) continue
    const newId = newPlacementIdBySourceId[placement.id]
    const right = structuredClone(placement)
    right.id = newId
    right.startMs = atMs + durationMs
    right.durationMs = endMs - atMs
    placement.durationMs = atMs - placement.startMs
    additions.set(placement, right)
    splitIds.set(placement.id, newId)
  }
  placements.splice(0, placements.length, ...placements.flatMap(placement => {
    const right = additions.get(placement)
    return right ? [placement, right] : [placement]
  }))
}

function insertIntoPropertyTrack(
  track: ShowPropertyAnimationTrack,
  atMs: number,
  durationMs: number,
): ShowPropertyAnimationTrack {
  const valueAtInsertion = evaluateShowPropertyTrack(track, atMs)
  const crossesInsertion = track.keyframes.some((keyframe) => keyframe.timeMs < atMs)
    && track.keyframes.some((keyframe) => keyframe.timeMs >= atMs)
  const keyAtInsertion = track.keyframes.find((keyframe) => keyframe.timeMs === atMs)
  const continuationEasing = keyAtInsertion?.easing
    ?? [...track.keyframes]
      .filter((keyframe) => keyframe.timeMs < atMs)
      .sort((left, right) => right.timeMs - left.timeMs)[0]?.easing
    ?? { curve: 'linear' as const }
  const shifted = structuredClone(track)
  shifted.keyframes = shifted.keyframes.map((keyframe) => (
    keyframe.timeMs >= atMs ? { ...keyframe, timeMs: keyframe.timeMs + durationMs } : keyframe
  ))
  if (crossesInsertion) {
    const ids = new Set(shifted.keyframes.map((keyframe) => keyframe.id))
    shifted.keyframes.push({
      id: uniqueLocalId(ids, `${track.id}-insert-${atMs}-start`),
      timeMs: atMs,
      value: valueAtInsertion,
      easing: { curve: 'hold', at: 1 },
    })
    if (!keyAtInsertion) {
      shifted.keyframes.push({
        id: uniqueLocalId(ids, `${track.id}-insert-${atMs}-end`),
        timeMs: atMs + durationMs,
        value: valueAtInsertion,
        easing: structuredClone(continuationEasing),
      })
    }
  }
  shifted.keyframes.sort((left, right) => left.timeMs - right.timeMs)
  return shifted
}

function uniqueLocalId(ids: Set<string>, base: string): string {
  let id = base
  let suffix = 2
  while (ids.has(id)) id = `${base}-${suffix++}`
  ids.add(id)
  return id
}
