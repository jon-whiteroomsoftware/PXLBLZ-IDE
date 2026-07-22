import type {
  ShowCompositionV1,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPatternInstance,
  ShowRecord,
} from './personalContentRecords'
import {
  addShowMainClip,
  normalizeShowComposition,
  splitShowMainPlacement,
  splitShowOverlayPlacement,
  validateShowComposition,
} from './showCompositionModel'
import { projectShowTimeline } from './showModel'

export type ShowMainClipAddPlan =
  | {
      enabled: true
      code: 'ready'
      sceneId: string
      localStartMs: number
      durationMs: number
    }
  | {
      enabled: false
      code: 'invalid-time' | 'transition' | 'missing-owner' | 'occupied' | 'no-space'
      reason: string
    }

export interface ShowMainClipAddLocation {
  zoneId: string
  globalTimeMs: number
  defaultDurationMs?: number
}

export type ShowTimelineClipOwner =
  | { kind: 'main'; sceneId: string; zoneId: string; placementId: string }
  | { kind: 'overlay'; sceneId: string; zoneId: string; layerId: string; placementId: string }

export type ShowTimelineClipMoveTarget =
  | { kind: 'main'; zoneId: string; globalStartMs: number }
  | { kind: 'overlay'; zoneId: string; layerIndex: number; globalStartMs: number }

export function addShowOverlayLayerAcrossTimeline(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { zoneId: string; layers: Array<{ sceneId: string; layerId: string }> },
): ShowCompositionV1 {
  const layerBySceneId = new Map(input.layers.map((layer) => [layer.sceneId, layer.layerId]))
  if (layerBySceneId.size !== composition.scenes.length) return composition
  const draft = structuredClone(composition)
  const layerNumber = draft.scenes.reduce((maximum, scene) => {
    const zone = scene.zones.find((candidate) => candidate.zoneId === input.zoneId)
    return Math.max(maximum, zone?.overlays.length ?? 0)
  }, 0) + 1
  for (const scene of draft.scenes) {
    const zone = scene.zones.find((candidate) => candidate.zoneId === input.zoneId)
    const layerId = layerBySceneId.get(scene.sceneId)
    if (!zone || !layerId) return composition
    zone.overlays.unshift({ id: layerId, name: `Layer ${layerNumber}`, placements: [] })
  }
  if (validateShowComposition(show, draft).length > 0) return composition
  return normalizeShowComposition(show, draft)
}

export function planShowMainClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: ShowMainClipAddLocation,
): ShowMainClipAddPlan {
  if (!Number.isFinite(input.globalTimeMs)) {
    return { enabled: false, code: 'invalid-time', reason: 'Choose a time inside the Show.' }
  }

  const globalTimeMs = Math.round(input.globalTimeMs)
  const timeline = projectShowTimeline(show)
  if (globalTimeMs < 0 || globalTimeMs >= timeline.durationMs) {
    return { enabled: false, code: 'invalid-time', reason: 'Choose a time before Show End.' }
  }

  if (timeline.transitions.some((transition) => (
    globalTimeMs >= transition.startMs && globalTimeMs < transition.endMs
  ))) {
    return { enabled: false, code: 'transition', reason: 'A Clip cannot begin inside a Transition.' }
  }

  const sceneRange = timeline.scenes.find((scene) => (
    globalTimeMs >= scene.startMs && globalTimeMs < scene.endMs
  ))
  const sceneComposition = sceneRange
    ? composition.scenes.find((scene) => scene.sceneId === sceneRange.sceneId)
    : undefined
  const zone = sceneComposition?.zones.find((candidate) => candidate.zoneId === input.zoneId)
  if (!sceneRange || !zone) {
    return { enabled: false, code: 'missing-owner', reason: 'The selected Zone has no Layer at the playhead.' }
  }

  const localStartMs = globalTimeMs - sceneRange.startMs
  if (zone.main.some((placement) => (
    localStartMs >= placement.startMs
    && localStartMs < placement.startMs + placement.durationMs
  ))) {
    return { enabled: false, code: 'occupied', reason: 'The selected Layer already has a Clip at the playhead.' }
  }

  const nextObstructionMs = zone.main
    .filter((placement) => placement.startMs > localStartMs)
    .reduce((nearest, placement) => Math.min(nearest, placement.startMs), sceneRange.scene.durationMs)
  const availableMs = nextObstructionMs - localStartMs
  if (availableMs < 1) {
    return { enabled: false, code: 'no-space', reason: 'There is no empty time on the selected Layer.' }
  }

  const defaultDurationMs = Math.max(1, Math.round(input.defaultDurationMs ?? 5_000))
  return {
    enabled: true,
    code: 'ready',
    sceneId: sceneRange.sceneId,
    localStartMs,
    durationMs: Math.min(defaultDurationMs, availableMs),
  }
}

export function addShowMainClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: ShowMainClipAddLocation & {
    instance: ShowPatternInstance
    placementId: string
  },
): ShowCompositionV1 {
  const plan = planShowMainClipAtGlobalTime(show, composition, input)
  if (!plan.enabled) return composition

  return addShowMainClip(show, composition, {
    sceneId: plan.sceneId,
    zoneId: input.zoneId,
    instance: input.instance,
    placement: {
      id: input.placementId,
      instanceId: input.instance.id,
      startMs: plan.localStartMs,
      durationMs: plan.durationMs,
      view: { mirror: false, phase: 0, brightness: 1 },
    },
  })
}

export function moveShowClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; target: ShowTimelineClipMoveTarget },
): ShowCompositionV1 {
  if (!Number.isFinite(input.target.globalStartMs)) return composition
  const timeline = projectShowTimeline(show)
  const range = timeline.scenes.find((scene) => (
    input.target.globalStartMs >= scene.startMs && input.target.globalStartMs < scene.endMs
  ))
  if (!range) return composition
  const startMs = Math.round(input.target.globalStartMs - range.startMs)
  const draft = structuredClone(composition)
  const sourceScene = draft.scenes.find((scene) => scene.sceneId === input.owner.sceneId)
  const sourceZone = sourceScene?.zones.find((zone) => zone.zoneId === input.owner.zoneId)
  const targetScene = draft.scenes.find((scene) => scene.sceneId === range.sceneId)
  const targetZone = targetScene?.zones.find((zone) => zone.zoneId === input.target.zoneId)
  if (!sourceScene || !sourceZone || !targetScene || !targetZone) return composition

  let sourcePlacements: Array<ShowMainPlacement | ShowOverlayPlacement> | undefined
  if (input.owner.kind === 'main') {
    sourcePlacements = sourceZone.main
  } else {
    const sourceLayerId = input.owner.layerId
    sourcePlacements = sourceZone.overlays.find((layer) => layer.id === sourceLayerId)?.placements
  }
  const sourceIndex = sourcePlacements?.findIndex((placement) => placement.id === input.owner.placementId) ?? -1
  if (!sourcePlacements || sourceIndex < 0) return composition
  const [sourcePlacement] = sourcePlacements.splice(sourceIndex, 1)
  const sourceStartMs = sourcePlacement.startMs

  if (input.target.kind === 'main') {
    const { opacity: _opacity, ...mainPlacement } = sourcePlacement as typeof sourcePlacement & { opacity?: number }
    targetZone.main.push({ ...mainPlacement, startMs })
  } else {
    const targetLayer = targetZone.overlays[input.target.layerIndex]
    if (!targetLayer) return composition
    targetLayer.placements.push({
      ...sourcePlacement,
      startMs,
      opacity: 'opacity' in sourcePlacement ? sourcePlacement.opacity : 1,
    })
  }

  const movedTracks = (sourceScene.propertyTracks ?? []).filter((track) => (
    'placementId' in track.target && track.target.placementId === input.owner.placementId
  ))
  const offsetMs = startMs - sourceStartMs
  movedTracks.forEach((track) => {
    track.keyframes.forEach((keyframe) => {
      keyframe.timeMs += offsetMs
    })
  })
  if (sourceScene !== targetScene && movedTracks.length > 0) {
    sourceScene.propertyTracks = (sourceScene.propertyTracks ?? []).filter((track) => !movedTracks.includes(track))
    if (sourceScene.propertyTracks.length === 0) delete sourceScene.propertyTracks
    targetScene.propertyTracks = [...(targetScene.propertyTracks ?? []), ...movedTracks]
  }

  if (validateShowComposition(show, draft).length > 0) return composition
  return normalizeShowComposition(show, draft)
}

export function splitShowClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; globalTimeMs: number; newPlacementId: string },
): ShowCompositionV1 {
  if (!Number.isFinite(input.globalTimeMs)) return composition
  const range = projectShowTimeline(show).scenes.find((scene) => scene.sceneId === input.owner.sceneId)
  if (!range) return composition
  const atMs = Math.round(input.globalTimeMs - range.startMs)
  return input.owner.kind === 'main'
    ? splitShowMainPlacement(show, composition, {
        ...input.owner,
        atMs,
        newPlacementId: input.newPlacementId,
      })
    : splitShowOverlayPlacement(show, composition, {
        ...input.owner,
        atMs,
        newPlacementId: input.newPlacementId,
      })
}

export function duplicateShowClipAfter(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; newPlacementId: string },
): ShowCompositionV1 {
  const draft = structuredClone(composition)
  const scene = draft.scenes.find((candidate) => candidate.sceneId === input.owner.sceneId)
  const zone = scene?.zones.find((candidate) => candidate.zoneId === input.owner.zoneId)
  if (!scene || !zone) return composition
  let placements: Array<ShowMainPlacement | ShowOverlayPlacement> | undefined
  if (input.owner.kind === 'main') {
    placements = zone.main
  } else {
    const layerId = input.owner.layerId
    placements = zone.overlays.find((layer) => layer.id === layerId)?.placements
  }
  const source = placements?.find((placement) => placement.id === input.owner.placementId)
  if (!placements || !source) return composition
  const startMs = source.startMs + source.durationMs
  placements.push({ ...structuredClone(source), id: input.newPlacementId, startMs })

  const sourceTracks = (scene.propertyTracks ?? []).filter((track) => (
    'placementId' in track.target && track.target.placementId === input.owner.placementId
  ))
  const copies = sourceTracks.map((track) => ({
    ...structuredClone(track),
    id: `${track.id}-${input.newPlacementId}`,
    target: { ...track.target, placementId: input.newPlacementId },
    keyframes: track.keyframes.map((keyframe) => ({
      ...structuredClone(keyframe),
      id: `${keyframe.id}-${input.newPlacementId}`,
      timeMs: keyframe.timeMs + source.durationMs,
    })),
  }))
  if (copies.length > 0) scene.propertyTracks = [...(scene.propertyTracks ?? []), ...copies]

  if (validateShowComposition(show, draft).length > 0) return composition
  return normalizeShowComposition(show, draft)
}
