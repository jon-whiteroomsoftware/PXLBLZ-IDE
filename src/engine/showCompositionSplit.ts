import type {
  ShowCompositionV1,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPropertyAnimationKeyframe,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
  ShowSceneComposition,
} from './personalContentRecords'
import { evaluateShowPropertyTrack } from './showPropertyAnimation'

export function splitShowCompositionScene(
  composition: ShowCompositionV1,
  input: {
    sourceSceneId: string
    destinationSceneId: string
    splitMs: number
    sourceDurationMs: number
  },
): ShowCompositionV1 {
  const draft = cloneJson(composition)
  const sourceIndex = draft.scenes.findIndex((scene) => scene.sceneId === input.sourceSceneId)
  if (sourceIndex < 0) return composition
  const source = draft.scenes[sourceIndex]
  const ids = compositionIds(draft)
  const leftPlacementIds = new Set<string>()
  const rightPlacementIds = new Map<string, string>()
  const leftZones = [] as ShowSceneComposition['zones']
  const rightZones = [] as ShowSceneComposition['zones']

  for (const zone of source.zones) {
    const leftMain: ShowMainPlacement[] = []
    const rightMain: ShowMainPlacement[] = []
    for (const placement of zone.main) {
      const partition = partitionPlacement(placement, input.splitMs, input.destinationSceneId, ids)
      if (partition.left) {
        leftMain.push(partition.left)
        leftPlacementIds.add(placement.id)
      }
      if (partition.right) {
        rightMain.push(partition.right)
        rightPlacementIds.set(placement.id, partition.right.id)
      }
    }

    const leftOverlays: typeof zone.overlays = []
    const rightOverlays: typeof zone.overlays = []
    for (const layer of zone.overlays) {
      const leftPlacements: ShowOverlayPlacement[] = []
      const rightPlacements: ShowOverlayPlacement[] = []
      for (const placement of layer.placements) {
        const partition = partitionPlacement(placement, input.splitMs, input.destinationSceneId, ids)
        if (partition.left) {
          leftPlacements.push(partition.left)
          leftPlacementIds.add(placement.id)
        }
        if (partition.right) {
          rightPlacements.push(partition.right)
          rightPlacementIds.set(placement.id, partition.right.id)
        }
      }
      if (leftPlacements.length > 0) leftOverlays.push({ ...layer, placements: leftPlacements })
      if (rightPlacements.length > 0) {
        rightOverlays.push({
          ...layer,
          id: leftPlacements.length > 0
            ? uniqueDerivedId(ids, `${layer.id}-${input.destinationSceneId}`)
            : layer.id,
          placements: rightPlacements,
        })
      }
    }

    leftZones.push({ ...zone, main: leftMain, overlays: leftOverlays })
    rightZones.push({ ...zone, main: rightMain, overlays: rightOverlays })
  }

  const leftTracks: ShowPropertyAnimationTrack[] = []
  const rightTracks: ShowPropertyAnimationTrack[] = []
  for (const track of source.propertyTracks ?? []) {
    const leftTarget = splitTarget(track.target, 'left', leftPlacementIds, rightPlacementIds)
    const rightTarget = splitTarget(track.target, 'right', leftPlacementIds, rightPlacementIds)
    if (leftTarget) {
      leftTracks.push({
        ...track,
        target: leftTarget,
        keyframes: leftKeyframes(track, input.splitMs, ids),
      })
    }
    if (rightTarget) {
      rightTracks.push({
        ...track,
        id: uniqueDerivedId(ids, `${track.id}-${input.destinationSceneId}`),
        target: rightTarget,
        keyframes: rightKeyframes(track, input.splitMs, input.sourceDurationMs, ids, input.destinationSceneId),
      })
    }
  }

  const left: ShowSceneComposition = {
    ...source,
    zones: leftZones,
    ...(leftTracks.length > 0 ? { propertyTracks: leftTracks } : { propertyTracks: undefined }),
  }
  const right: ShowSceneComposition = {
    ...source,
    sceneId: input.destinationSceneId,
    zones: rightZones,
    ...(rightTracks.length > 0 ? { propertyTracks: rightTracks } : { propertyTracks: undefined }),
  }
  draft.scenes.splice(sourceIndex, 1, left, right)
  return draft
}

function partitionPlacement<T extends ShowMainPlacement | ShowOverlayPlacement>(
  placement: T,
  splitMs: number,
  destinationSceneId: string,
  ids: Set<string>,
): { left?: T; right?: T } {
  const endMs = placement.startMs + placement.durationMs
  const leftDurationMs = Math.min(endMs, splitMs) - placement.startMs
  const rightDurationMs = endMs - Math.max(placement.startMs, splitMs)
  const left = leftDurationMs > 0
    ? { ...placement, durationMs: leftDurationMs }
    : undefined
  const right = rightDurationMs > 0
    ? {
        ...placement,
        id: left
          ? uniqueDerivedId(ids, `${placement.id}-${destinationSceneId}`)
          : placement.id,
        startMs: Math.max(0, placement.startMs - splitMs),
        durationMs: rightDurationMs,
      }
    : undefined
  return { left: left as T | undefined, right: right as T | undefined }
}

function splitTarget(
  target: ShowPropertyAnimationTarget,
  side: 'left' | 'right',
  leftPlacementIds: Set<string>,
  rightPlacementIds: Map<string, string>,
): ShowPropertyAnimationTarget | null {
  if (!('placementId' in target)) return { ...target }
  if (side === 'left') return leftPlacementIds.has(target.placementId) ? { ...target } : null
  const placementId = rightPlacementIds.get(target.placementId)
  return placementId ? { ...target, placementId } : null
}

function leftKeyframes(
  track: ShowPropertyAnimationTrack,
  splitMs: number,
  ids: Set<string>,
): ShowPropertyAnimationKeyframe[] {
  const ordered = orderedKeyframes(track)
  const start = ordered.find((keyframe) => keyframe.timeMs === 0)
    ?? boundaryKeyframe(track, 0, uniqueDerivedId(ids, `${track.id}-left-start`), { curve: 'linear' })
  const middle = ordered.filter((keyframe) => keyframe.timeMs > 0 && keyframe.timeMs < splitMs)
  const exact = ordered.find((keyframe) => keyframe.timeMs === splitMs)
  const end = exact
    ? { ...exact, easing: { curve: 'linear' } as const }
    : boundaryKeyframe(track, splitMs, uniqueDerivedId(ids, `${track.id}-left-end`), { curve: 'linear' })
  return [start, ...middle, end]
}

function rightKeyframes(
  track: ShowPropertyAnimationTrack,
  splitMs: number,
  sourceDurationMs: number,
  ids: Set<string>,
  destinationSceneId: string,
): ShowPropertyAnimationKeyframe[] {
  const ordered = orderedKeyframes(track)
  const exactStart = ordered.find((keyframe) => keyframe.timeMs === splitMs)
  const crossing = ordered.find((keyframe, index) => (
    keyframe.timeMs < splitMs && ordered[index + 1]?.timeMs > splitMs
  ))
  const start = boundaryKeyframe(
    track,
    splitMs,
    uniqueDerivedId(ids, `${track.id}-${destinationSceneId}-start`),
    exactStart?.easing ?? crossing?.easing ?? { curve: 'linear' },
  )
  start.timeMs = 0
  const middle = ordered
    .filter((keyframe) => keyframe.timeMs > splitMs && keyframe.timeMs < sourceDurationMs)
    .map((keyframe) => ({
      ...keyframe,
      id: uniqueDerivedId(ids, `${keyframe.id}-${destinationSceneId}`),
      timeMs: keyframe.timeMs - splitMs,
    }))
  const exactEnd = ordered.find((keyframe) => keyframe.timeMs === sourceDurationMs)
  const end = exactEnd
    ? {
        ...exactEnd,
        id: uniqueDerivedId(ids, `${exactEnd.id}-${destinationSceneId}`),
        timeMs: sourceDurationMs - splitMs,
        easing: { curve: 'linear' } as const,
      }
    : boundaryKeyframe(
        track,
        sourceDurationMs,
        uniqueDerivedId(ids, `${track.id}-${destinationSceneId}-end`),
        { curve: 'linear' },
      )
  end.timeMs = sourceDurationMs - splitMs
  return [start, ...middle, end]
}

function boundaryKeyframe(
  track: ShowPropertyAnimationTrack,
  timeMs: number,
  id: string,
  easing: ShowPropertyAnimationKeyframe['easing'],
): ShowPropertyAnimationKeyframe {
  return { id, timeMs, value: evaluateShowPropertyTrack(track, timeMs), easing }
}

function orderedKeyframes(track: ShowPropertyAnimationTrack): ShowPropertyAnimationKeyframe[] {
  return [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
}

function compositionIds(composition: ShowCompositionV1): Set<string> {
  return new Set([
    ...composition.patternInstances.map((instance) => instance.id),
    ...composition.scenes.flatMap((scene) => [
      ...scene.zones.flatMap((zone) => [
        ...zone.main.map((placement) => placement.id),
        ...zone.overlays.flatMap((layer) => [layer.id, ...layer.placements.map((placement) => placement.id)]),
      ]),
      ...(scene.propertyTracks ?? []).flatMap((track) => [track.id, ...track.keyframes.map((keyframe) => keyframe.id)]),
    ]),
  ])
}

function uniqueDerivedId(ids: Set<string>, base: string): string {
  if (!ids.has(base)) {
    ids.add(base)
    return base
  }
  let suffix = 2
  while (ids.has(`${base}-${suffix}`)) suffix += 1
  const id = `${base}-${suffix}`
  ids.add(id)
  return id
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
