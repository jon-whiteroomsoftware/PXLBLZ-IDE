import type {
  ShowCompositionV1,
  ShowLayerTransition,
  ShowRecord,
} from './personalContentRecords'
import {
  normalizeShowComposition,
  validateShowComposition,
} from './showCompositionModel'
import { showCompositionClipCount } from './showClipInvariant'
import { materializeShowGroupOccurrences } from './showGroupModel'
import {
  moveShowClipAtGlobalTime,
  resizeShowClipAtGlobalTime,
  type ShowTimelineClipMoveTarget,
  type ShowTimelineClipOwner,
} from './showTimelineClipAuthoring'
import { projectShowTimeline, removeShowBoundaryTransition } from './showModel'
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
    return { enabled: false, maxDurationMs: 0, reason: 'These two Clips sit in different Zone Layouts. A Transition has to live inside one layout, so move the junction away from the layout change.' }
  }
  const resolved = resolveEndpointLayer(show, composition, endpoints)
  if (!resolved || resolved.toIndex !== resolved.fromIndex + 1) {
    return { enabled: false, maxDurationMs: 0, reason: 'A Transition joins two Clips that follow each other on the same Layer. Select a Clip and the one directly after it.' }
  }
  const cut = resolved.layer.junctions.find((junction) => (
    junction.kind === 'cut'
    && junction.fromPlacementId === endpoints.fromPlacementId
    && junction.toPlacementId === endpoints.toPlacementId
  ))
  if (!cut) return { enabled: false, maxDurationMs: 0, reason: 'This junction already has a Transition. Edit that one instead of adding another.' }
  // Only other Layers of the same Zone can be knocked out of step by making room
  // here. Zones own separate pixels and separate time, so a Clip starting at this
  // instant in another Zone is not a conflict. Counting them refused a Transition
  // in every symmetric multi-Zone Show, which is the common shape (#363).
  const unrelatedClips = projectShowUnifiedTimeline(show, composition).zones
    .filter((zone) => zone.layers.some((layer) => (
      layer.clips.some((clip) => clipOwnsPlacementId(clip, endpoints.fromPlacementId))
    )))
    .flatMap((zone) => (
      zone.layers
        .filter((layer) => !layer.clips.some((clip) => clipOwnsPlacementId(clip, endpoints.fromPlacementId)))
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
  if (unrelatedClips.some((clip) => clip.startMs === cut.startMs)) {
    return {
      enabled: false,
      maxDurationMs: 0,
      reason: 'Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.',
    }
  }
  const activeUnrelatedEndMs = unrelatedClips
    .filter((clip) => clip.startMs < cut.startMs && clip.endMs >= cut.startMs)
    .reduce((nearest, clip) => Math.min(nearest, clip.endMs), Number.POSITIVE_INFINITY)
  if (Number.isFinite(activeUnrelatedEndMs)) {
    maxDurationMs = Math.min(maxDurationMs, activeUnrelatedEndMs - cut.startMs - 1)
  }
  const movingTransitionIds = new Set((composition.transitions ?? []).filter((transition) => (
    chain.some((clip) => clipOwnsPlacementId(clip, transition.fromPlacementId))
  )).map((transition) => transition.id))
  const fixedIntervals = projectShowUnifiedTimeline(show, composition).zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.junctions))
    .filter((junction) => junction.transition && !movingTransitionIds.has(junction.id))
  if (fixedIntervals.some((interval) => cut.startMs >= interval.startMs && cut.startMs < interval.endMs)) {
    return { enabled: false, maxDurationMs: 0, reason: 'Another Layer is already running a Transition across this moment. Only one Layer can transition at a time, so move this junction or shorten that Transition.' }
  }
  const nextFixedStart = fixedIntervals
    .filter((interval) => interval.startMs > cut.startMs)
    .reduce((nearest, interval) => Math.min(nearest, interval.startMs), Number.POSITIVE_INFINITY)
  if (Number.isFinite(nextFixedStart)) maxDurationMs = Math.min(maxDurationMs, nextFixedStart - cut.startMs)
  return maxDurationMs > 0
    ? { enabled: true, maxDurationMs }
    : { enabled: false, maxDurationMs: 0, reason: 'There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.' }
}

export function planShowGroupLayerTransitionInsertion(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { occurrenceId: string; fromPlacementId: string; toPlacementId: string },
): ShowLayerTransitionInsertionPlan {
  const occurrence = composition.groupOccurrences?.find((candidate) => candidate.id === input.occurrenceId)
  if (!occurrence) {
    return { enabled: false, maxDurationMs: 0, reason: 'This Group no longer exists.' }
  }
  const selectedPrefix = `${occurrence.id}:`
  const fromPlacementId = input.fromPlacementId.startsWith(selectedPrefix)
    ? input.fromPlacementId.slice(selectedPrefix.length)
    : input.fromPlacementId
  const toPlacementId = input.toPlacementId.startsWith(selectedPrefix)
    ? input.toPlacementId.slice(selectedPrefix.length)
    : input.toPlacementId
  const materialized = materializeShowGroupOccurrences(composition)
  let maxDurationMs = Number.POSITIVE_INFINITY
  for (const linkedOccurrence of composition.groupOccurrences?.filter((candidate) => (
    candidate.definitionId === occurrence.definitionId
  )) ?? []) {
    const prefix = `${linkedOccurrence.id}:`
    const plan = planShowLayerTransitionInsertion(show, materialized, {
      fromPlacementId: `${prefix}${fromPlacementId}`,
      toPlacementId: `${prefix}${toPlacementId}`,
    })
    if (!plan.enabled) return plan
    maxDurationMs = Math.min(maxDurationMs, plan.maxDurationMs)
  }
  return Number.isFinite(maxDurationMs)
    ? { enabled: true, maxDurationMs }
    : { enabled: false, maxDurationMs: 0, reason: 'This Group no longer exists.' }
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

  const draft = shiftTimelineClips(show, composition, chain, transition.durationMs)
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
  const changed = shiftTimelineClips(show, withoutTransition, chain, -transition.durationMs)
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
  const draft = shiftTimelineClips(show, composition, chain, deltaMs)
  if (!draft) return composition
  const changedTransition = draft.transitions?.find((candidate) => candidate.id === transitionId)
  if (!changedTransition) return composition
  changedTransition.durationMs = durationMs
  if (validateShowComposition(show, draft).length > 0 || hasConcurrentLayerTransitions(show, draft)) return composition
  return normalizeShowComposition(show, draft)
}

/**
 * Horizontal movement treats every non-Cut-connected Clip as one rigid chain.
 * Moving across Layers detaches the selected Clip by removing its directly
 * connected Transitions before committing the placement move.
 */
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
  if (!sameLayer) {
    const draft = structuredClone(composition)
    const remainingTransitions = (draft.transitions ?? []).filter((transition) => (
      !clipOwnsPlacementId(selected, transition.fromPlacementId)
      && !clipOwnsPlacementId(selected, transition.toPlacementId)
    ))
    if (remainingTransitions.length > 0) draft.transitions = remainingTransitions
    else delete draft.transitions
    const moved = moveShowClipAtGlobalTime(show, draft, input)
    return moved === draft ? composition : moved
  }

  const selectedIndex = layer.clips.findIndex((clip) => clip.id === selected.id)
  let firstIndex = selectedIndex
  let lastIndex = selectedIndex
  while (firstIndex > 0 && hasTransitionBetween(composition, layer.clips[firstIndex - 1], layer.clips[firstIndex])) {
    firstIndex -= 1
  }
  while (lastIndex < layer.clips.length - 1 && hasTransitionBetween(composition, layer.clips[lastIndex], layer.clips[lastIndex + 1])) {
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

  const changed = shiftTimelineClips(show, composition, chain, deltaMs)
  if (!changed || validateShowComposition(show, changed).length > 0 || hasConcurrentLayerTransitions(show, changed)) return composition
  return normalizeShowComposition(show, changed)
}

/**
 * Move one Clip as an atomic Show edit. Plan against the original Show timing,
 * then delete a Scene-boundary visual Transition only when the accepted move
 * breaks its endpoint junction. The planned Composition therefore keeps the
 * requested global placement even when deleting that Transition shortens the
 * canonical Show timeline.
 */
export function moveShowConnectedClipInShowAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: {
    owner: ShowTimelineClipOwner
    target: ShowTimelineClipMoveTarget
    plannedComposition?: ShowCompositionV1
  },
): ShowRecord {
  const projection = projectShowUnifiedTimeline(show, composition)
  const selected = projection.zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
    .find((clip) => clip.id === input.owner.placementId)
  if (!selected) return show
  const layer = projection.zones
    .flatMap((zone) => zone.layers)
    .find((candidate) => candidate.clips.some((clip) => clip.id === selected.id))
  if (!layer) return show

  const sameLayer = input.target.kind === selected.kind
    && input.target.zoneId === selected.zoneId
    && (input.target.kind === 'main' || input.target.layerIndex === selected.layerIndex)
  if (sameLayer && Math.round(input.target.globalStartMs) === selected.startMs) return show
  const moved = input.plannedComposition
    ?? moveShowConnectedClipAtGlobalTime(show, composition, input)
  if (moved === composition) return show

  const plannedJunctions = projectShowUnifiedTimeline(show, moved).zones
    .flatMap((zone) => zone.layers.flatMap((candidate) => candidate.junctions))
  const boundaryTransitionIds = layer.junctions.flatMap((junction) => {
    if (
      !junction.boundaryTransition
      || (junction.leftClipId !== selected.id && junction.rightClipId !== selected.id)
    ) return []
    return plannedJunctions.some((candidate) => (
      candidate.id === junction.id
      && (candidate.leftClipId === selected.id || candidate.rightClipId === selected.id)
    )) ? [] : [junction.boundaryTransition.id]
  })
  const canonicalShow = boundaryTransitionIds.reduce(
    (current, transitionId) => removeShowBoundaryTransition(current, transitionId),
    show,
  )
  return { ...canonicalShow, composition: moved }
}

export function showLayerTransitionsConnectedToClip(
  composition: ShowCompositionV1,
  placementId: string,
): ShowLayerTransition[] {
  const logicalPlacementIds = placementIdsForLogicalClip(composition, placementId)
  return (composition.transitions ?? []).filter((transition) => (
    logicalPlacementIds.has(transition.fromPlacementId)
    || logicalPlacementIds.has(transition.toPlacementId)
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
  const logicalIdByPlacementId = new Map<string, string>()
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      for (const placement of zone.main) {
        logicalIdByPlacementId.set(placement.id, placement.logicalClipId ?? placement.id)
      }
      for (const layer of zone.overlays) {
        for (const placement of layer.placements) {
          logicalIdByPlacementId.set(placement.id, placement.logicalClipId ?? placement.id)
        }
      }
    }
  }
  const logicalId = (id: string) => logicalIdByPlacementId.get(id) ?? id
  const connected = new Set([...placementIds].map(logicalId))
  let changed = true
  while (changed) {
    changed = false
    for (const transition of composition.transitions ?? []) {
      const fromPlacementId = logicalId(transition.fromPlacementId)
      const toPlacementId = logicalId(transition.toPlacementId)
      if (!connected.has(fromPlacementId) && !connected.has(toPlacementId)) continue
      const before = connected.size
      connected.add(fromPlacementId)
      connected.add(toPlacementId)
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

  const incoming = (composition.transitions ?? []).find((transition) => (
    transition.toPlacementId === clip.startPlacementId
  ))
  const outgoing = (composition.transitions ?? []).find((transition) => (
    transition.fromPlacementId === clip.endPlacementId
  ))
  if ((incoming || outgoing) && startDeltaMs !== 0 && endDeltaMs === 0) {
    const transitionDurationMs = incoming ? incoming.durationMs + startDeltaMs : null
    if (transitionDurationMs != null && transitionDurationMs < 0) return composition
    const detachedTransitionIds = new Set([incoming?.id, outgoing?.id].filter(Boolean))
    const detached = structuredClone(composition)
    detached.transitions = detached.transitions?.filter((transition) => !detachedTransitionIds.has(transition.id))
    if (detached.transitions?.length === 0) delete detached.transitions
    const resizedComposition = resizeShowClipAtGlobalTime(show, detached, {
      ...input,
      globalStartMs: nextStartMs,
      durationMs: nextDurationMs,
    })
    if (resizedComposition === detached) return composition
    const resizedClip = projectShowUnifiedTimeline(show, resizedComposition).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .find((candidate) => candidate.id === clip.id)
    if (!resizedClip) return composition
    resizedComposition.transitions = [
      ...(resizedComposition.transitions ?? []),
      ...(incoming && transitionDurationMs != null && transitionDurationMs > 0
        ? [{
            ...structuredClone(incoming),
            toPlacementId: resizedClip.startPlacementId,
            durationMs: transitionDurationMs,
          }]
        : []),
      ...(outgoing
        ? [{ ...structuredClone(outgoing), fromPlacementId: resizedClip.endPlacementId }]
        : []),
    ]
    if (
      validateShowComposition(show, resizedComposition).length > 0
      || hasConcurrentLayerTransitions(show, resizedComposition)
    ) {
      return composition
    }
    return normalizeShowComposition(show, resizedComposition)
  }

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
    const draft = shiftTimelineClips(show, composition, chain, endDeltaMs)
    if (!draft) return composition
    const shiftedOutgoing = (draft.transitions ?? []).find((transition) => transition.id === outgoing.id)
    if (!shiftedOutgoing) return composition
    const withoutOutgoing = structuredClone(draft)
    withoutOutgoing.transitions = withoutOutgoing.transitions?.filter((transition) => transition.id !== outgoing.id)
    if (withoutOutgoing.transitions?.length === 0) delete withoutOutgoing.transitions
    const owner = findOwner(withoutOutgoing, clip.id)
    if (!owner) return composition
    const changed = resizeShowClipAtGlobalTime(show, withoutOutgoing, {
      owner,
      globalStartMs: nextStartMs,
      durationMs: nextDurationMs,
    })
    if (changed === withoutOutgoing) return composition
    const resizedClip = projectShowUnifiedTimeline(show, changed).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .find((candidate) => candidate.id === clip.id)
    if (!resizedClip) return composition
    changed.transitions = [
      ...(changed.transitions ?? []),
      { ...shiftedOutgoing, fromPlacementId: resizedClip.endPlacementId },
    ]
    if (validateShowComposition(show, changed).length > 0 || hasConcurrentLayerTransitions(show, changed)) {
      return composition
    }
    return normalizeShowComposition(show, changed)
  }

  return resizeShowClipAtGlobalTime(show, composition, input)
}

export function deleteShowClipWithLayerTransitions(
  show: ShowRecord,
  composition: ShowCompositionV1,
  owner: ShowTimelineClipOwner,
): ShowCompositionV1 {
  if (showCompositionClipCount(composition) <= 1) return composition
  const draft = structuredClone(composition)
  const segmentIds = new Set<string>()
  for (const scene of draft.scenes) {
    for (const zone of scene.zones) {
      for (const placement of zone.main) {
        if ((placement.logicalClipId ?? placement.id) === owner.placementId) segmentIds.add(placement.id)
      }
      zone.main = zone.main.filter((placement) => (
        (placement.logicalClipId ?? placement.id) !== owner.placementId
      ))
      for (const layer of zone.overlays) {
        for (const placement of layer.placements) {
          if ((placement.logicalClipId ?? placement.id) === owner.placementId) segmentIds.add(placement.id)
        }
        layer.placements = layer.placements.filter((placement) => (
          (placement.logicalClipId ?? placement.id) !== owner.placementId
        ))
      }
    }
    scene.propertyTracks = scene.propertyTracks?.filter((track) => (
      !('placementId' in track.target) || !segmentIds.has(track.target.placementId)
    ))
    if (scene.propertyTracks?.length === 0) delete scene.propertyTracks
  }
  if (segmentIds.size === 0) return composition
  draft.transitions = (draft.transitions ?? []).filter((transition) => (
    !segmentIds.has(transition.fromPlacementId)
    && !segmentIds.has(transition.toPlacementId)
    && transition.fromPlacementId !== owner.placementId
    && transition.toPlacementId !== owner.placementId
  ))
  if (validateShowComposition(show, draft).length > 0) return composition
  return normalizeShowComposition(show, draft)
}

function resolveEndpointLayer(
  show: ShowRecord,
  composition: ShowCompositionV1,
  transition: Pick<ShowLayerTransition, 'fromPlacementId' | 'toPlacementId'>,
): { layer: ShowUnifiedTimelineLayerProjection; fromIndex: number; toIndex: number } | null {
  for (const zone of projectShowUnifiedTimeline(show, composition).zones) {
    for (const layer of zone.layers) {
      const fromIndex = layer.clips.findIndex((clip) => clip.id === transition.fromPlacementId)
      const toIndex = layer.clips.findIndex((clip) => clipOwnsPlacementId(clip, transition.toPlacementId))
      const resolvedFromIndex = fromIndex >= 0
        ? fromIndex
        : layer.clips.findIndex((clip) => clipOwnsPlacementId(clip, transition.fromPlacementId))
      if (resolvedFromIndex >= 0 && toIndex >= 0) return { layer, fromIndex: resolvedFromIndex, toIndex }
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
    const connected = hasTransitionBetween(composition, current, next)
    if (!connected) break
    chain.push(next)
  }
  return chain
}

function hasTransitionBetween(
  composition: ShowCompositionV1,
  fromClip: ShowUnifiedTimelineClipProjection,
  toClip: ShowUnifiedTimelineClipProjection,
): boolean {
  return (composition.transitions ?? []).some((transition) => (
    clipOwnsPlacementId(fromClip, transition.fromPlacementId)
    && clipOwnsPlacementId(toClip, transition.toPlacementId)
  ))
}

function clipOwnsPlacementId(
  clip: ShowUnifiedTimelineClipProjection,
  placementId: string,
): boolean {
  return clip.id === placementId || clip.segmentIds?.includes(placementId) === true
}

function placementIdsForLogicalClip(
  composition: ShowCompositionV1,
  placementId: string,
): Set<string> {
  let logicalClipId = placementId
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      const placement = [
        ...zone.main,
        ...zone.overlays.flatMap((layer) => layer.placements),
      ].find((candidate) => candidate.id === placementId)
      if (placement) logicalClipId = placement.logicalClipId ?? placement.id
    }
  }
  const ids = new Set<string>([logicalClipId])
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      for (const placement of [
        ...zone.main,
        ...zone.overlays.flatMap((layer) => layer.placements),
      ]) {
        if ((placement.logicalClipId ?? placement.id) === logicalClipId) ids.add(placement.id)
      }
    }
  }
  return ids
}

function shiftTimelineClips(
  show: ShowRecord,
  composition: ShowCompositionV1,
  clips: ShowUnifiedTimelineClipProjection[],
  deltaMs: number,
): ShowCompositionV1 | null {
  const savedTransitions = composition.transitions?.map((transition) => ({
    transition: structuredClone(transition),
    fromLogicalClipId: logicalClipIdForPlacement(composition, transition.fromPlacementId),
    toLogicalClipId: logicalClipIdForPlacement(composition, transition.toPlacementId),
  }))
  const withoutTransitions = structuredClone(composition)
  delete withoutTransitions.transitions
  let draft = withoutTransitions
  const ordered = deltaMs > 0 ? [...clips].reverse() : clips
  for (const clip of ordered) {
    const owner = findOwner(draft, clip.id)
    if (!owner) return null
    const target: ShowTimelineClipMoveTarget = clip.kind === 'main'
      ? { kind: 'main', zoneId: clip.zoneId, globalStartMs: clip.startMs + deltaMs }
      : {
          kind: 'overlay',
          zoneId: clip.zoneId,
          layerIndex: clip.layerIndex,
          globalStartMs: clip.startMs + deltaMs,
        }
    const moved = moveShowClipAtGlobalTime(show, draft, { owner, target })
    if (moved === draft) return null
    draft = moved
  }
  if (savedTransitions) {
    const movedClips = projectShowUnifiedTimeline(show, draft).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
    draft.transitions = savedTransitions.map((saved) => {
      const fromClip = movedClips.find((clip) => clip.id === saved.fromLogicalClipId)
      const toClip = movedClips.find((clip) => clip.id === saved.toLogicalClipId)
      return {
        ...saved.transition,
        fromPlacementId: fromClip?.endPlacementId ?? saved.transition.fromPlacementId,
        toPlacementId: toClip?.startPlacementId ?? saved.transition.toPlacementId,
      }
    })
  }
  return draft
}

function logicalClipIdForPlacement(
  composition: ShowCompositionV1,
  placementId: string,
): string {
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      for (const placement of [
        ...zone.main,
        ...zone.overlays.flatMap((layer) => layer.placements),
      ]) {
        if (placement.id === placementId) return placement.logicalClipId ?? placement.id
      }
    }
  }
  return placementId
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
