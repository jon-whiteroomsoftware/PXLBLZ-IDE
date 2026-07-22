import { normalizeShowComposition, validateShowComposition } from './showCompositionModel'
import { projectShowTimeline, showLoopDurationMs } from './showModel'
import { evaluateShowPropertyTrack } from './showPropertyAnimation'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import type {
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPropertyAnimationTrack,
  ShowRecord,
  ShowTimelineMarker,
} from './personalContentRecords'

export type ShowTimeInsertionPlan =
  | { enabled: true; code: 'ready'; sceneId: string; localTimeMs: number; crossingPlacementIds: string[] }
  | { enabled: false; code: 'invalid-time' | 'invalid-duration' | 'transition' | 'missing-composition'; reason: string }

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
    atMs >= transition.startMs && atMs < transition.endMs
  ))
  const insideLayerTransition = projectShowUnifiedTimeline(show, show.composition).zones
    .some((zone) => zone.layers.some((layer) => layer.junctions.some((junction) => (
      junction.durationMs > 0 && atMs >= junction.startMs && atMs < junction.endMs
    ))))
  if (insideLegacyTransition || insideLayerTransition) {
    return { enabled: false, code: 'transition', reason: 'Insert Time is unavailable inside a Transition.' }
  }

  const range = timeline.scenes.find((scene) => atMs >= scene.startMs && atMs <= scene.endMs)
  if (!range) return { enabled: false, code: 'invalid-time', reason: 'Choose a time inside the Show.' }
  const localTimeMs = Math.round(atMs - range.startMs)
  const scene = show.composition.scenes.find((candidate) => candidate.sceneId === range.sceneId)
  const crossingPlacementIds = scene
    ? scene.zones.flatMap((zone) => [
        ...zone.main,
        ...zone.overlays.flatMap((layer) => layer.placements),
      ]).filter((placement) => (
        placement.startMs < localTimeMs
        && placement.startMs + placement.durationMs > localTimeMs
      )).map((placement) => placement.id).sort()
    : []
  return { enabled: true, code: 'ready', sceneId: range.sceneId, localTimeMs, crossingPlacementIds }
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
  const normalized = normalizeShowComposition(next, next.composition!)
  if (validateShowComposition(next, normalized).length > 0) return show
  return { ...next, composition: normalized }
}

/** Set the deterministic loop boundary without truncating authored content. */
export function setShowEndMs(show: ShowRecord, requestedDurationMs: number): ShowRecord {
  if (!show.composition || !Number.isFinite(requestedDurationMs) || show.scenes.length === 0) return show
  const requestedMs = Math.max(1, Math.round(requestedDurationMs))
  const timeline = projectShowTimeline(show)
  const finalScene = show.scenes[show.scenes.length - 1]!
  const finalRange = timeline.scenes.find((range) => range.sceneId === finalScene.id)
  const finalComposition = show.composition.scenes.find((scene) => scene.sceneId === finalScene.id)
  if (!finalRange || !finalComposition) return show

  let requiredLocalEndMs = 1
  for (const zone of finalComposition.zones) {
    for (const placement of zone.main) {
      requiredLocalEndMs = Math.max(requiredLocalEndMs, placement.startMs + placement.durationMs)
    }
    for (const layer of zone.overlays) {
      for (const placement of layer.placements) {
        requiredLocalEndMs = Math.max(requiredLocalEndMs, placement.startMs + placement.durationMs)
      }
    }
  }
  for (const track of finalComposition.propertyTracks ?? []) {
    for (const keyframe of track.keyframes) requiredLocalEndMs = Math.max(requiredLocalEndMs, keyframe.timeMs)
  }

  const durationMs = Math.max(finalRange.startMs + requiredLocalEndMs, requestedMs)
  const nextFinalDurationMs = durationMs - finalRange.startMs
  if (showLoopDurationMs(show) === durationMs && finalScene.durationMs === nextFinalDurationMs) return show

  const next: ShowRecord = {
    ...show,
    scenes: show.scenes.map((scene) => scene.id === finalScene.id
      ? { ...scene, durationMs: nextFinalDurationMs }
      : scene),
    composition: { ...show.composition, durationMs },
    updatedAt: Math.max(Date.now(), show.updatedAt + 1),
  }
  return { ...next, composition: normalizeShowComposition(next, next.composition!) }
}

export function addShowTimelineMarker(show: ShowRecord, marker: ShowTimelineMarker): ShowRecord {
  if (!show.composition || !marker.id || !Number.isFinite(marker.timeMs)) return show
  if ((show.composition.markers ?? []).some((candidate) => candidate.id === marker.id)) return show
  return withMarkers(show, [
    ...(show.composition.markers ?? []),
    { ...marker, timeMs: Math.max(0, Math.round(marker.timeMs)) },
  ])
}

export function moveShowTimelineMarker(show: ShowRecord, markerId: string, timeMs: number): ShowRecord {
  if (!show.composition || !Number.isFinite(timeMs)) return show
  const markers = show.composition.markers ?? []
  if (!markers.some((marker) => marker.id === markerId)) return show
  return withMarkers(show, markers.map((marker) => marker.id === markerId
    ? { ...marker, timeMs: Math.max(0, Math.round(timeMs)) }
    : marker))
}

export function updateShowTimelineMarker(
  show: ShowRecord,
  markerId: string,
  patch: Partial<Omit<ShowTimelineMarker, 'id'>>,
): ShowRecord {
  if (!show.composition) return show
  const markers = show.composition.markers ?? []
  const marker = markers.find((candidate) => candidate.id === markerId)
  if (!marker || (patch.timeMs !== undefined && !Number.isFinite(patch.timeMs))) return show
  return withMarkers(show, markers.map((candidate) => candidate.id === markerId
    ? {
        ...candidate,
        ...patch,
        ...(patch.timeMs !== undefined ? { timeMs: Math.max(0, Math.round(patch.timeMs)) } : {}),
      }
    : candidate))
}

export function removeShowTimelineMarker(show: ShowRecord, markerId: string): ShowRecord {
  if (!show.composition?.markers?.some((marker) => marker.id === markerId)) return show
  return withMarkers(show, show.composition.markers.filter((marker) => marker.id !== markerId))
}

function withMarkers(show: ShowRecord, markers: ShowTimelineMarker[]): ShowRecord {
  const next: ShowRecord = {
    ...show,
    composition: { ...show.composition!, markers },
    updatedAt: Math.max(Date.now(), show.updatedAt + 1),
  }
  return { ...next, composition: normalizeShowComposition(next, next.composition!) }
}

function insertIntoPlacements<T extends ShowMainPlacement | ShowOverlayPlacement>(
  placements: T[],
  atMs: number,
  durationMs: number,
  newPlacementIdBySourceId: Record<string, string>,
  splitIds: Map<string, string>,
): void {
  const additions: T[] = []
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
    additions.push(right)
    splitIds.set(placement.id, newId)
  }
  placements.push(...additions)
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
  return shifted
}

function uniqueLocalId(ids: Set<string>, base: string): string {
  let id = base
  let suffix = 2
  while (ids.has(id)) id = `${base}-${suffix++}`
  ids.add(id)
  return id
}
