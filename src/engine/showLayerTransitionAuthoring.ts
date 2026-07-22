import type {
  ShowCompositionV1,
  ShowLayerTransition,
  ShowRecord,
} from './personalContentRecords'
import {
  deleteShowMainPlacement,
  deleteShowOverlayPlacement,
  normalizeShowComposition,
  validateShowComposition,
} from './showCompositionModel'
import {
  moveShowClipAtGlobalTime,
  resizeShowClipAtGlobalTime,
  type ShowTimelineClipMoveTarget,
  type ShowTimelineClipOwner,
} from './showTimelineClipAuthoring'
import { projectShowTimeline } from './showModel'
import {
  projectShowUnifiedTimeline,
  type ShowUnifiedTimelineClipProjection,
  type ShowUnifiedTimelineLayerProjection,
} from './showUnifiedTimelineProjection'

export type ShowLayerTransitionInsertionPlan =
  | { enabled: true; maxDurationMs: number }
  | { enabled: false; maxDurationMs: 0; reason: string }

export function planShowLayerTransitionInsertion(
  show: ShowRecord,
  composition: ShowCompositionV1,
  endpoints: Pick<ShowLayerTransition, 'fromPlacementId' | 'toPlacementId'>,
): ShowLayerTransitionInsertionPlan {
  const fromOwner = findOwner(composition, endpoints.fromPlacementId)
  const toOwner = findOwner(composition, endpoints.toPlacementId)
  if (!fromOwner || !toOwner || fromOwner.sceneId !== toOwner.sceneId) {
    return { enabled: false, maxDurationMs: 0, reason: 'A Transition cannot cross a Zone Layout boundary.' }
  }
  const resolved = resolveEndpointLayer(show, composition, endpoints)
  if (!resolved || resolved.toIndex !== resolved.fromIndex + 1) {
    return { enabled: false, maxDurationMs: 0, reason: 'Choose consecutive Clips on one Layer.' }
  }
  const cut = resolved.layer.junctions.find((junction) => (
    junction.kind === 'cut'
    && junction.leftClipId === endpoints.fromPlacementId
    && junction.rightClipId === endpoints.toPlacementId
  ))
  if (!cut) return { enabled: false, maxDurationMs: 0, reason: 'This junction is not a Cut.' }
  const unrelatedClips = projectShowUnifiedTimeline(show, composition).zones.flatMap((zone) => (
    zone.layers
      .filter((layer) => !layer.clips.some((clip) => clip.id === endpoints.fromPlacementId))
      .flatMap((layer) => layer.clips)
      .filter((clip) => clip.sceneId === fromOwner.sceneId)
  ))
  const chain = downstreamConnectedChain(resolved.layer, composition, resolved.toIndex)
  const last = chain[chain.length - 1]
  const obstruction = resolved.layer.clips[resolved.toIndex + chain.length]
  const sceneEndMs = projectShowTimeline(show).scenes.find((scene) => scene.sceneId === fromOwner.sceneId)?.endMs
    ?? projectShowUnifiedTimeline(show, composition).durationMs
  let maxDurationMs = Math.max(
    0,
    Math.min(obstruction?.startMs ?? sceneEndMs, sceneEndMs) - last.endMs,
  )
  const nextUnrelatedStartMs = unrelatedClips
    .filter((clip) => clip.startMs > cut.startMs)
    .reduce((nearest, clip) => Math.min(nearest, clip.startMs), Number.POSITIVE_INFINITY)
  if (Number.isFinite(nextUnrelatedStartMs)) {
    maxDurationMs = Math.min(maxDurationMs, nextUnrelatedStartMs - cut.startMs - 1)
  }
  const movingTransitionIds = new Set((composition.transitions ?? []).filter((transition) => (
    chain.some((clip) => clip.id === transition.fromPlacementId)
  )).map((transition) => transition.id))
  const fixedIntervals = projectShowUnifiedTimeline(show, composition).zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.junctions))
    .filter((junction) => junction.transition && !movingTransitionIds.has(junction.id))
  if (fixedIntervals.some((interval) => cut.startMs >= interval.startMs && cut.startMs < interval.endMs)) {
    return { enabled: false, maxDurationMs: 0, reason: 'Another Layer is already transitioning at this time.' }
  }
  if (unrelatedClips.some((clip) => clip.startMs <= cut.startMs && clip.endMs >= cut.startMs)) {
    return {
      enabled: false,
      maxDurationMs: 0,
      reason: 'Per-Layer Transitions over other active content need compiler render-target support.',
    }
  }
  const nextFixedStart = fixedIntervals
    .filter((interval) => interval.startMs > cut.startMs)
    .reduce((nearest, interval) => Math.min(nearest, interval.startMs), Number.POSITIVE_INFINITY)
  if (Number.isFinite(nextFixedStart)) maxDurationMs = Math.min(maxDurationMs, nextFixedStart - cut.startMs)
  return maxDurationMs > 0
    ? { enabled: true, maxDurationMs }
    : { enabled: false, maxDurationMs: 0, reason: 'Move downstream content or extend the Show to make room.' }
}

/**
 * Replace a derived Cut with a literal positive-duration transition. Clip
 * durations never change: the destination Clip and every transition-connected
 * successor move together to create the authored interval.
 */
export function insertShowLayerTransition(
  show: ShowRecord,
  composition: ShowCompositionV1,
  transition: ShowLayerTransition,
): ShowCompositionV1 {
  if (!Number.isInteger(transition.durationMs) || transition.durationMs <= 0) return composition
  if ((composition.transitions ?? []).some((candidate) => candidate.id === transition.id)) return composition
  const plan = planShowLayerTransitionInsertion(show, composition, transition)
  if (!plan.enabled || transition.durationMs > plan.maxDurationMs) return composition
  const resolved = resolveEndpointLayer(show, composition, transition)!
  const chain = downstreamConnectedChain(resolved.layer, composition, resolved.toIndex)

  const draft = shiftPlacementStarts(composition, chain.map((clip) => clip.id), transition.durationMs)
  if (!draft) return composition
  draft.transitions = [...(draft.transitions ?? []), structuredClone(transition)]
  if (validateShowComposition(show, draft).length > 0 || hasConcurrentLayerTransitions(show, draft)) return composition
  return normalizeShowComposition(show, draft)
}

/** Remove a non-Cut transition and close its interval into a derived Cut. */
export function resetShowLayerTransitionToCut(
  show: ShowRecord,
  composition: ShowCompositionV1,
  transitionId: string,
): ShowCompositionV1 {
  const transition = composition.transitions?.find((candidate) => candidate.id === transitionId)
  if (!transition) return composition
  const resolved = resolveEndpointLayer(show, composition, transition)
  if (!resolved) return composition
  const chain = downstreamConnectedChain(resolved.layer, composition, resolved.toIndex)
  const withoutTransition: ShowCompositionV1 = {
    ...structuredClone(composition),
    transitions: (composition.transitions ?? []).filter((candidate) => candidate.id !== transitionId),
  }
  const changed = shiftPlacementStarts(withoutTransition, chain.map((clip) => clip.id), -transition.durationMs)
  if (!changed) return composition
  if (validateShowComposition(show, changed).length > 0) return composition
  return normalizeShowComposition(show, changed)
}

export function resizeShowLayerTransition(
  show: ShowRecord,
  composition: ShowCompositionV1,
  transitionId: string,
  durationMs: number,
): ShowCompositionV1 {
  if (!Number.isInteger(durationMs) || durationMs < 0) return composition
  const transition = composition.transitions?.find((candidate) => candidate.id === transitionId)
  if (!transition) return composition
  if (durationMs === transition.durationMs) return composition
  if (durationMs === 0) return resetShowLayerTransitionToCut(show, composition, transitionId)
  const resolved = resolveEndpointLayer(show, composition, transition)
  if (!resolved) return composition
  const chain = downstreamConnectedChain(resolved.layer, composition, resolved.toIndex)
  const deltaMs = durationMs - transition.durationMs
  if (deltaMs > 0) {
    const last = chain[chain.length - 1]
    const obstruction = resolved.layer.clips[resolved.toIndex + chain.length]
    const availableMs = (obstruction?.startMs ?? projectShowUnifiedTimeline(show, composition).durationMs) - last.endMs
    if (deltaMs > availableMs) return composition
  }
  const draft = shiftPlacementStarts(composition, chain.map((clip) => clip.id), deltaMs)
  if (!draft) return composition
  const changedTransition = draft.transitions?.find((candidate) => candidate.id === transitionId)
  if (!changedTransition) return composition
  changedTransition.durationMs = durationMs
  if (validateShowComposition(show, draft).length > 0 || hasConcurrentLayerTransitions(show, draft)) return composition
  return normalizeShowComposition(show, draft)
}

/** Horizontal movement treats every non-Cut-connected Clip as one rigid chain. */
export function moveShowConnectedClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; target: ShowTimelineClipMoveTarget },
): ShowCompositionV1 {
  const projection = projectShowUnifiedTimeline(show, composition)
  const selected = projection.zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
    .find((clip) => clip.id === input.owner.placementId)
  if (!selected) return composition
  const layer = projection.zones
    .flatMap((zone) => zone.layers)
    .find((candidate) => candidate.clips.some((clip) => clip.id === selected.id))
  if (!layer) return composition
  const sameLayer = input.target.kind === selected.kind
    && input.target.zoneId === selected.zoneId
    && (input.target.kind === 'main' || input.target.layerIndex === selected.layerIndex)
  if (!sameLayer) return moveShowClipAtGlobalTime(show, composition, input)

  const selectedIndex = layer.clips.findIndex((clip) => clip.id === selected.id)
  let firstIndex = selectedIndex
  let lastIndex = selectedIndex
  while (firstIndex > 0 && hasTransitionBetween(composition, layer.clips[firstIndex - 1].id, layer.clips[firstIndex].id)) {
    firstIndex -= 1
  }
  while (lastIndex < layer.clips.length - 1 && hasTransitionBetween(composition, layer.clips[lastIndex].id, layer.clips[lastIndex + 1].id)) {
    lastIndex += 1
  }
  if (firstIndex === lastIndex) return moveShowClipAtGlobalTime(show, composition, input)

  const chain = layer.clips.slice(firstIndex, lastIndex + 1)
  const deltaMs = Math.round(input.target.globalStartMs - selected.startMs)
  if (deltaMs === 0) return composition
  const previous = layer.clips[firstIndex - 1]
  const next = layer.clips[lastIndex + 1]
  const leftLimit = previous?.endMs ?? 0
  const rightLimit = next?.startMs ?? projection.durationMs
  if (chain[0].startMs + deltaMs < leftLimit || chain[chain.length - 1].endMs + deltaMs > rightLimit) {
    return composition
  }

  const changed = shiftPlacementStarts(composition, chain.map((clip) => clip.id), deltaMs)
  if (!changed || validateShowComposition(show, changed).length > 0 || hasConcurrentLayerTransitions(show, changed)) return composition
  return normalizeShowComposition(show, changed)
}

export function showLayerTransitionsConnectedToClip(
  composition: ShowCompositionV1,
  placementId: string,
): ShowLayerTransition[] {
  return (composition.transitions ?? []).filter((transition) => (
    transition.fromPlacementId === placementId || transition.toPlacementId === placementId
  ))
}

/**
 * Expand selection seeds through every non-Cut Transition. Direct Clip editing
 * can remain singular; marquee refinement and grouping use this closure so a
 * Transition can never be captured without both endpoint Clips.
 */
export function showLayerTransitionConnectedClosure(
  composition: ShowCompositionV1,
  placementIds: Iterable<string>,
): string[] {
  const connected = new Set(placementIds)
  let changed = true
  while (changed) {
    changed = false
    for (const transition of composition.transitions ?? []) {
      if (!connected.has(transition.fromPlacementId) && !connected.has(transition.toPlacementId)) continue
      const before = connected.size
      connected.add(transition.fromPlacementId)
      connected.add(transition.toPlacementId)
      changed ||= connected.size !== before
    }
  }
  return [...connected].sort((left, right) => left.localeCompare(right))
}

export function resizeShowConnectedClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: {
    owner: ShowTimelineClipOwner
    globalStartMs: number
    durationMs: number
  },
): ShowCompositionV1 {
  const projection = projectShowUnifiedTimeline(show, composition)
  const clip = projection.zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
    .find((candidate) => candidate.id === input.owner.placementId)
  if (!clip) return composition
  const nextStartMs = Math.round(input.globalStartMs)
  const nextDurationMs = Math.round(input.durationMs)
  const nextEndMs = nextStartMs + nextDurationMs
  const startDeltaMs = nextStartMs - clip.startMs
  const endDeltaMs = nextEndMs - clip.endMs

  const incoming = (composition.transitions ?? []).find((transition) => transition.toPlacementId === clip.id)
  if (incoming && startDeltaMs !== 0 && endDeltaMs === 0) {
    const resizedTransition = resizeShowLayerTransition(
      show,
      composition,
      incoming.id,
      incoming.durationMs + startDeltaMs,
    )
    if (resizedTransition === composition) return composition
    const changed = resizeShowClipAtGlobalTime(show, resizedTransition, input)
    return changed !== resizedTransition && !hasConcurrentLayerTransitions(show, changed) ? changed : composition
  }

  const outgoing = (composition.transitions ?? []).find((transition) => transition.fromPlacementId === clip.id)
  if (outgoing && startDeltaMs === 0 && endDeltaMs !== 0) {
    const resolved = resolveEndpointLayer(show, composition, outgoing)
    if (!resolved) return composition
    const chain = downstreamConnectedChain(resolved.layer, composition, resolved.toIndex)
    if (endDeltaMs > 0) {
      const last = chain[chain.length - 1]
      const obstruction = resolved.layer.clips[resolved.toIndex + chain.length]
      const availableMs = (obstruction?.startMs ?? projection.durationMs) - last.endMs
      if (endDeltaMs > availableMs) return composition
    }
    const draft = shiftPlacementStarts(composition, chain.map((candidate) => candidate.id), endDeltaMs)
    if (!draft) return composition
    const owner = findOwner(draft, clip.id)
    if (!owner) return composition
    const changed = resizeShowClipAtGlobalTime(show, draft, {
      owner,
      globalStartMs: nextStartMs,
      durationMs: nextDurationMs,
    })
    return changed !== draft && !hasConcurrentLayerTransitions(show, changed) ? changed : composition
  }

  return resizeShowClipAtGlobalTime(show, composition, input)
}

export function deleteShowClipWithLayerTransitions(
  show: ShowRecord,
  composition: ShowCompositionV1,
  owner: ShowTimelineClipOwner,
): ShowCompositionV1 {
  const draft: ShowCompositionV1 = {
    ...structuredClone(composition),
    transitions: (composition.transitions ?? []).filter((transition) => (
      transition.fromPlacementId !== owner.placementId
      && transition.toPlacementId !== owner.placementId
    )),
  }
  const deleted = owner.kind === 'main'
    ? deleteShowMainPlacement(draft, owner)
    : deleteShowOverlayPlacement(draft, owner)
  if (deleted === draft || validateShowComposition(show, deleted).length > 0) return composition
  return normalizeShowComposition(show, deleted)
}

function resolveEndpointLayer(
  show: ShowRecord,
  composition: ShowCompositionV1,
  transition: Pick<ShowLayerTransition, 'fromPlacementId' | 'toPlacementId'>,
): { layer: ShowUnifiedTimelineLayerProjection; fromIndex: number; toIndex: number } | null {
  for (const zone of projectShowUnifiedTimeline(show, composition).zones) {
    for (const layer of zone.layers) {
      const fromIndex = layer.clips.findIndex((clip) => clip.id === transition.fromPlacementId)
      const toIndex = layer.clips.findIndex((clip) => clip.id === transition.toPlacementId)
      if (fromIndex >= 0 && toIndex >= 0) return { layer, fromIndex, toIndex }
    }
  }
  return null
}

function downstreamConnectedChain(
  layer: ShowUnifiedTimelineLayerProjection,
  composition: ShowCompositionV1,
  startIndex: number,
): ShowUnifiedTimelineClipProjection[] {
  const chain = [layer.clips[startIndex]]
  for (let index = startIndex; index < layer.clips.length - 1; index += 1) {
    const current = layer.clips[index]
    const next = layer.clips[index + 1]
    const connected = hasTransitionBetween(composition, current.id, next.id)
    if (!connected) break
    chain.push(next)
  }
  return chain
}

function hasTransitionBetween(
  composition: ShowCompositionV1,
  fromPlacementId: string,
  toPlacementId: string,
): boolean {
  return (composition.transitions ?? []).some((transition) => (
    transition.fromPlacementId === fromPlacementId && transition.toPlacementId === toPlacementId
  ))
}

function shiftPlacementStarts(
  composition: ShowCompositionV1,
  placementIds: string[],
  deltaMs: number,
): ShowCompositionV1 | null {
  const ids = new Set(placementIds)
  const draft = structuredClone(composition)
  let changedCount = 0
  for (const scene of draft.scenes) {
    const movedInScene = new Set<string>()
    for (const zone of scene.zones) {
      for (const placement of zone.main) {
        if (!ids.has(placement.id)) continue
        placement.startMs += deltaMs
        movedInScene.add(placement.id)
        changedCount += 1
      }
      for (const layer of zone.overlays) {
        for (const placement of layer.placements) {
          if (!ids.has(placement.id)) continue
          placement.startMs += deltaMs
          movedInScene.add(placement.id)
          changedCount += 1
        }
      }
    }
    for (const track of scene.propertyTracks ?? []) {
      if (!('placementId' in track.target) || !movedInScene.has(track.target.placementId)) continue
      track.keyframes.forEach((keyframe) => {
        keyframe.timeMs += deltaMs
      })
    }
  }
  return changedCount === ids.size ? draft : null
}

function hasConcurrentLayerTransitions(
  show: ShowRecord,
  composition: ShowCompositionV1,
): boolean {
  const intervals = projectShowUnifiedTimeline(show, composition).zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.junctions))
    .filter((junction) => junction.transition !== null)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
  return intervals.some((interval, index) => {
    const next = intervals[index + 1]
    return Boolean(next && next.startMs < interval.endMs)
  })
}

function findOwner(
  composition: ShowCompositionV1,
  placementId: string,
): ShowTimelineClipOwner | null {
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      if (zone.main.some((placement) => placement.id === placementId)) {
        return { kind: 'main', sceneId: scene.sceneId, zoneId: zone.zoneId, placementId }
      }
      for (const layer of zone.overlays) {
        if (layer.placements.some((placement) => placement.id === placementId)) {
          return {
            kind: 'overlay',
            sceneId: scene.sceneId,
            zoneId: zone.zoneId,
            layerId: layer.id,
            placementId,
          }
        }
      }
    }
  }
  return null
}
