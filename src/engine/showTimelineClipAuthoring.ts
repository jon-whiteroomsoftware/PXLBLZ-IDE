import type {
  ShowCompositionV1,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPatternInstance,
  ShowPropertyAnimationTrack,
  ShowRecord,
} from './personalContentRecords'
import {
  addShowMainClip,
  addShowOverlayClip,
  normalizeShowComposition,
  splitShowMainPlacement,
  splitShowOverlayPlacement,
  validateShowComposition,
} from './showCompositionModel'
import { materializeShowGroupOccurrences } from './showGroupModel'
import { projectShowTimeline, showLoopDurationMs } from './showModel'
import { evaluateShowPropertyTrack } from './showPropertyAnimation'
import { setShowEndMs } from './showTimelineAuthoring'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

export type ShowClipAddPlan =
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

export type ShowMainClipAddPlan = ShowClipAddPlan

export type ShowClipAddTarget =
  | { kind: 'main' }
  | { kind: 'overlay'; layerIndex: number }

export interface ShowMainClipAddLocation {
  zoneId: string
  globalTimeMs: number
  defaultDurationMs?: number
}

export interface ShowClipAddLocation extends ShowMainClipAddLocation {
  target: ShowClipAddTarget
}

export type ShowTimelineClipOwner =
  | { kind: 'main'; sceneId: string; zoneId: string; placementId: string }
  | { kind: 'overlay'; sceneId: string; zoneId: string; layerId: string; placementId: string }

export type ShowTimelineClipMoveTarget =
  | { kind: 'main'; zoneId: string; globalStartMs: number }
  | { kind: 'overlay'; zoneId: string; layerIndex: number; globalStartMs: number }

type LogicalClipSegment = {
  sceneId: string
  sceneStartMs: number
  placement: ShowMainPlacement | ShowOverlayPlacement
}

function placementLogicalClipId(placement: ShowMainPlacement | ShowOverlayPlacement): string {
  return placement.logicalClipId ?? placement.id
}

function logicalClipSegments(
  show: ShowRecord,
  composition: ShowCompositionV1,
  owner: ShowTimelineClipOwner,
): LogicalClipSegment[] {
  const timeline = projectShowTimeline(show)
  const sceneStartById = new Map(timeline.scenes.map((scene) => [scene.sceneId, scene.startMs]))
  const rootId = owner.placementId
  return composition.scenes.flatMap((scene) => {
    const zone = scene.zones.find((candidate) => candidate.zoneId === owner.zoneId)
    if (!zone) return []
    const placements = owner.kind === 'main'
      ? zone.main
      : zone.overlays.flatMap((layer) => layer.placements)
    return placements
      .filter((placement) => placementLogicalClipId(placement) === rootId)
      .map((placement) => ({
        sceneId: scene.sceneId,
        sceneStartMs: sceneStartById.get(scene.sceneId) ?? 0,
        placement,
      }))
  }).sort((left, right) => (
    left.sceneStartMs + left.placement.startMs
    - (right.sceneStartMs + right.placement.startMs)
  ))
}

function globalLogicalClipRange(segments: LogicalClipSegment[]): { startMs: number; endMs: number } | null {
  if (segments.length === 0) return null
  return {
    startMs: segments[0].sceneStartMs + segments[0].placement.startMs,
    endMs: Math.max(...segments.map((segment) => (
      segment.sceneStartMs + segment.placement.startMs + segment.placement.durationMs
    ))),
  }
}

function globalSpanSceneSlices(
  show: ShowRecord,
  globalStartMs: number,
  durationMs: number,
): Array<{ sceneId: string; localStartMs: number; durationMs: number }> {
  const globalEndMs = globalStartMs + durationMs
  const slices = projectShowTimeline(show).scenes.flatMap((scene) => {
    const startMs = Math.max(globalStartMs, scene.startMs)
    const endMs = Math.min(globalEndMs, scene.endMs)
    return endMs > startMs
      ? [{
          sceneId: scene.sceneId,
          localStartMs: startMs - scene.startMs,
          durationMs: endMs - startMs,
        }]
      : []
  })
  if (slices.length === 0) return []
  const timeline = projectShowTimeline(show)
  const firstRange = timeline.scenes.find((scene) => scene.sceneId === slices[0].sceneId)
  const lastRange = timeline.scenes.find((scene) => scene.sceneId === slices[slices.length - 1].sceneId)
  const firstGlobalStartMs = (firstRange?.startMs ?? 0) + slices[0].localStartMs
  const lastGlobalEndMs = (lastRange?.startMs ?? 0)
    + slices[slices.length - 1].localStartMs
    + slices[slices.length - 1].durationMs
  return firstGlobalStartMs === globalStartMs && lastGlobalEndMs === globalEndMs ? slices : []
}

function appendLogicalClipGlobalSpan(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: {
    rootId: string
    base: ShowMainPlacement | ShowOverlayPlacement
    target: ShowClipAddTarget & { zoneId: string }
    globalStartMs: number
    durationMs: number
  },
): boolean {
  const slices = globalSpanSceneSlices(show, input.globalStartMs, input.durationMs)
  if (slices.length === 0) return false
  for (const [index, slice] of slices.entries()) {
    const scene = composition.scenes.find((candidate) => candidate.sceneId === slice.sceneId)
    const zone = scene?.zones.find((candidate) => candidate.zoneId === input.target.zoneId)
    if (!scene || !zone) return false
    const id = index === 0 ? input.rootId : `${input.rootId}--span-${slice.sceneId}`
    const placement = {
      ...structuredClone(input.base),
      id,
      ...(index === 0 ? { logicalClipId: undefined } : { logicalClipId: input.rootId }),
      startMs: Math.round(slice.localStartMs),
      durationMs: Math.round(slice.durationMs),
    }
    if (input.target.kind === 'main') {
      const { opacity: _opacity, ...mainPlacement } = placement as typeof placement & { opacity?: number }
      zone.main.push(mainPlacement)
    } else {
      const layer = zone.overlays[input.target.layerIndex]
      if (!layer) return false
      layer.placements.push({
        ...placement,
        opacity: 'opacity' in input.base && typeof input.base.opacity === 'number' ? input.base.opacity : 1,
      } as ShowOverlayPlacement)
    }
  }
  return true
}

function shiftSoleUseInstanceTracksAcrossScenes(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: {
    instanceId: string
    sourceSceneIds: Set<string>
    offsetMs: number
    targetStartMs: number
    targetDurationMs: number
  },
): boolean {
  const timeline = projectShowTimeline(show)
  const sceneRangeById = new Map(timeline.scenes.map((scene) => [scene.sceneId, scene]))
  const entries = composition.scenes.flatMap((scene) => (
    input.sourceSceneIds.has(scene.sceneId)
      ? (scene.propertyTracks ?? []).flatMap((track) => (
          'instanceId' in track.target && track.target.instanceId === input.instanceId
            ? [{ scene, track }]
            : []
        ))
      : []
  ))
  if (entries.length === 0) return true
  const groups = new Map<string, typeof entries>()
  for (const entry of entries) {
    const targetKey = JSON.stringify(entry.track.target)
    groups.set(targetKey, [...(groups.get(targetKey) ?? []), entry])
  }
  const targetSlices = globalSpanSceneSlices(show, input.targetStartMs, input.targetDurationMs)
  if (targetSlices.length === 0) return false
  const generated: Array<{ sceneId: string; track: ShowPropertyAnimationTrack }> = []
  for (const groupedEntries of groups.values()) {
    const baseTrack = groupedEntries[0].track
    const sourcePoints = groupedEntries.flatMap(({ scene, track }) => {
      const sourceRange = sceneRangeById.get(scene.sceneId)
      if (!sourceRange || track.keyframes.length < 2) return []
      return track.keyframes.map((keyframe) => ({
        keyframe,
        globalTimeMs: sourceRange.startMs + keyframe.timeMs,
      }))
    }).sort((left, right) => left.globalTimeMs - right.globalTimeMs || left.keyframe.id.localeCompare(right.keyframe.id))
    if (sourcePoints.length < 2) return false
    const targetIntervals = targetSlices.flatMap((slice) => {
      const range = sceneRangeById.get(slice.sceneId)
      return range
        ? [{
            startMs: range.startMs + slice.localStartMs,
            endMs: range.startMs + slice.localStartMs + slice.durationMs,
          }]
        : []
    })
    if (sourcePoints.some((point) => {
      const shiftedTimeMs = point.globalTimeMs + input.offsetMs
      return !targetIntervals.some((interval) => (
        shiftedTimeMs >= interval.startMs && shiftedTimeMs <= interval.endMs
      ))
    })) return false
    const nonlinear = sourcePoints.some((point) => point.keyframe.easing.curve !== 'linear')
    if (nonlinear) return false

    const evaluateAtGlobalTime = (globalTimeMs: number): number => {
      for (const { scene, track } of groupedEntries) {
        const sourceRange = sceneRangeById.get(scene.sceneId)
        if (!sourceRange) continue
        const first = track.keyframes[0].timeMs + sourceRange.startMs
        const last = track.keyframes[track.keyframes.length - 1].timeMs + sourceRange.startMs
        if (globalTimeMs >= first && globalTimeMs <= last) {
          return evaluateShowPropertyTrack(track, globalTimeMs - sourceRange.startMs)
        }
      }
      if (globalTimeMs <= sourcePoints[0].globalTimeMs) return sourcePoints[0].keyframe.value
      const lastPoint = sourcePoints[sourcePoints.length - 1]
      if (globalTimeMs >= lastPoint.globalTimeMs) return lastPoint.keyframe.value
      const rightIndex = sourcePoints.findIndex((point) => point.globalTimeMs > globalTimeMs)
      const left = sourcePoints[rightIndex - 1]
      const right = sourcePoints[rightIndex]
      const progress = (globalTimeMs - left.globalTimeMs) / (right.globalTimeMs - left.globalTimeMs)
      return left.keyframe.value + (right.keyframe.value - left.keyframe.value) * progress
    }

    for (const slice of targetSlices) {
      const range = sceneRangeById.get(slice.sceneId)
      if (!range) return false
      const intervalStartMs = range.startMs + slice.localStartMs
      const intervalEndMs = intervalStartMs + slice.durationMs
      const globalTimesMs = [...new Set([
        intervalStartMs,
        ...sourcePoints
          .map((item) => item.globalTimeMs + input.offsetMs)
          .filter((timeMs) => timeMs > intervalStartMs && timeMs < intervalEndMs),
        intervalEndMs,
      ])].sort((left, right) => left - right)
      const keyframes = globalTimesMs.map((globalTimeMs, index) => {
        const original = sourcePoints.find((item) => (
          item.globalTimeMs + input.offsetMs === globalTimeMs
        ))?.keyframe
        return {
          ...(original ? structuredClone(original) : {
            value: evaluateAtGlobalTime(globalTimeMs - input.offsetMs),
            easing: { curve: 'linear' as const },
          }),
          id: `${original?.id ?? baseTrack.id}-move-${range.sceneId}-${index}`,
          timeMs: Math.round(globalTimeMs - range.startMs),
        }
      })
      generated.push({
        sceneId: range.sceneId,
        track: {
          ...structuredClone(baseTrack),
          id: `${baseTrack.id}-move-${range.sceneId}`,
          keyframes,
        },
      })
    }
  }

  for (const { scene, track } of entries) {
    scene.propertyTracks = (scene.propertyTracks ?? []).filter((candidate) => candidate !== track)
    if (scene.propertyTracks.length === 0) delete scene.propertyTracks
  }
  for (const item of generated) {
    const scene = composition.scenes.find((candidate) => candidate.sceneId === item.sceneId)
    if (!scene) return false
    scene.propertyTracks = [...(scene.propertyTracks ?? []), item.track]
  }
  return true
}

function retargetLogicalSplitPlacementTracks(
  composition: ShowCompositionV1,
  input: {
    sourcePlacementIds: Set<string>
    leftLogicalClipId: string
    rightLogicalClipId: string
  },
): boolean {
  for (const scene of composition.scenes) {
    const targetPlacementIds = scene.zones.flatMap((zone) => [
      ...zone.main,
      ...zone.overlays.flatMap((layer) => layer.placements),
    ]).filter((placement) => {
      const logicalClipId = placementLogicalClipId(placement)
      return logicalClipId === input.leftLogicalClipId || logicalClipId === input.rightLogicalClipId
    }).sort((left, right) => {
      const leftSide = placementLogicalClipId(left) === input.leftLogicalClipId ? 0 : 1
      const rightSide = placementLogicalClipId(right) === input.leftLogicalClipId ? 0 : 1
      return leftSide - rightSide || left.startMs - right.startMs || left.id.localeCompare(right.id)
    }).map((placement) => placement.id)
    const tracks = scene.propertyTracks ?? []
    const nextTracks: ShowPropertyAnimationTrack[] = []
    for (const track of tracks) {
      if (!('placementId' in track.target) || !input.sourcePlacementIds.has(track.target.placementId)) {
        nextTracks.push(track)
        continue
      }
      if (targetPlacementIds.length === 0) return false
      const target = track.target
      targetPlacementIds.forEach((placementId, index) => {
        const suffix = index === 0 ? '' : `-${placementId}`
        nextTracks.push({
          ...structuredClone(track),
          id: `${track.id}${suffix}`,
          target: { ...target, placementId },
          keyframes: track.keyframes.map((keyframe) => ({
            ...structuredClone(keyframe),
            id: `${keyframe.id}${suffix}`,
          })),
        })
      })
    }
    if (nextTracks.length > 0) scene.propertyTracks = nextTracks
    else delete scene.propertyTracks
  }
  return true
}

function replaceLogicalClipGlobalSpan(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: {
    owner: ShowTimelineClipOwner
    target: ShowClipAddTarget & { zoneId: string }
    globalStartMs: number
    durationMs: number
  },
): ShowCompositionV1 {
  const segments = logicalClipSegments(show, composition, input.owner)
  const base = segments.find((segment) => segment.placement.id === input.owner.placementId)?.placement
    ?? segments[0]?.placement
  if (!base) return composition
  const sourceRange = globalLogicalClipRange(segments)
  if (!sourceRange) return composition
  const slices = globalSpanSceneSlices(show, input.globalStartMs, input.durationMs)
  if (slices.length === 0) return composition
  const segmentIds = new Set(segments.map((segment) => segment.placement.id))
  const hasPlacementTracks = composition.scenes.some((scene) => (
    (scene.propertyTracks ?? []).some((track) => (
      'placementId' in track.target && segmentIds.has(track.target.placementId)
    ))
  ))
  if (hasPlacementTracks && (segments.length > 1 || slices.length > 1)) return composition

  const rootId = placementLogicalClipId(base)
  const draft = structuredClone(composition)
  for (const scene of draft.scenes) {
    for (const zone of scene.zones) {
      zone.main = zone.main.filter((placement) => placementLogicalClipId(placement) !== rootId)
      for (const layer of zone.overlays) {
        layer.placements = layer.placements.filter((placement) => placementLogicalClipId(placement) !== rootId)
      }
    }
  }

  if (!appendLogicalClipGlobalSpan(show, draft, {
    rootId,
    base,
    target: input.target,
    globalStartMs: input.globalStartMs,
    durationMs: input.durationMs,
  })) return composition
  if (
    showPatternInstanceUseCount(composition, base.instanceId) === 1
    && !shiftSoleUseInstanceTracksAcrossScenes(show, draft, {
      instanceId: base.instanceId,
      sourceSceneIds: new Set(segments.map((segment) => segment.sceneId)),
      offsetMs: input.globalStartMs - sourceRange.startMs,
      targetStartMs: input.globalStartMs,
      targetDurationMs: input.durationMs,
    })
  ) return composition

  if (validateShowComposition(show, draft).length > 0) return composition
  return normalizeShowComposition(show, draft)
}

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
  return planShowClipAtGlobalTime(show, composition, { ...input, target: { kind: 'main' } })
}

export function planShowClipAtTopmostAvailableLayer(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: ShowMainClipAddLocation,
): { target: ShowClipAddTarget; plan: Extract<ShowClipAddPlan, { enabled: true }> } | null {
  const overlayCount = composition.scenes.reduce((maximum, scene) => {
    const zone = scene.zones.find((candidate) => candidate.zoneId === input.zoneId)
    return Math.max(maximum, zone?.overlays.length ?? 0)
  }, 0)
  const targets: ShowClipAddTarget[] = [
    ...Array.from({ length: overlayCount }, (_, layerIndex) => ({
      kind: 'overlay' as const,
      layerIndex,
    })),
    { kind: 'main' },
  ]
  for (const target of targets) {
    const plan = planShowClipAtGlobalTime(show, composition, { ...input, target })
    if (plan.enabled) return { target, plan }
  }
  return null
}

export function planShowClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: ShowClipAddLocation,
): ShowClipAddPlan {
  if (!Number.isFinite(input.globalTimeMs)) {
    return { enabled: false, code: 'invalid-time', reason: 'Choose a time inside the Show.' }
  }

  const globalTimeMs = Math.round(input.globalTimeMs)
  const timeline = projectShowTimeline(show)
  const atShowEnd = globalTimeMs === timeline.durationMs
  if (globalTimeMs < 0 || globalTimeMs > timeline.durationMs) {
    return { enabled: false, code: 'invalid-time', reason: 'Choose a time before Show End.' }
  }

  if (timeline.transitions.some((transition) => (
    globalTimeMs >= transition.startMs && globalTimeMs < transition.endMs
  ))) {
    return { enabled: false, code: 'transition', reason: 'A Clip cannot begin inside a Transition.' }
  }

  const sceneRange = atShowEnd
    ? timeline.scenes[timeline.scenes.length - 1]
    : timeline.scenes.find((scene) => (
        globalTimeMs >= scene.startMs && globalTimeMs < scene.endMs
      ))
  const sceneComposition = sceneRange
    ? composition.scenes.find((scene) => scene.sceneId === sceneRange.sceneId)
    : undefined
  const zone = sceneComposition?.zones.find((candidate) => candidate.zoneId === input.zoneId)
  const authoredOverlayLayer = input.target.kind === 'overlay'
    ? zone?.overlays[input.target.layerIndex]
    : undefined
  const authoredPlacements = input.target.kind === 'main'
    ? zone?.main
    : authoredOverlayLayer?.placements
  const materializedComposition = composition.groupOccurrences?.length
    ? materializeShowGroupOccurrences(composition)
    : composition
  const materializedScene = sceneRange
    ? materializedComposition.scenes.find((scene) => scene.sceneId === sceneRange.sceneId)
    : undefined
  const materializedZone = materializedScene?.zones.find((candidate) => candidate.zoneId === input.zoneId)
  const placements = input.target.kind === 'main'
    ? materializedZone?.main
    : materializedZone?.overlays.find((layer) => layer.id === authoredOverlayLayer?.id)?.placements
  if (!sceneRange || !zone || !authoredPlacements || !placements) {
    return { enabled: false, code: 'missing-owner', reason: 'The selected Zone has no Layer at the playhead.' }
  }

  const localStartMs = globalTimeMs - sceneRange.startMs
  if (placements.some((placement) => (
    localStartMs >= placement.startMs
    && localStartMs < placement.startMs + placement.durationMs
  ))) {
    return { enabled: false, code: 'occupied', reason: 'The selected Layer already has a Clip at the playhead.' }
  }

  const defaultDurationMs = Math.max(1, Math.round(input.defaultDurationMs ?? 5_000))
  const nextObstructionMs = placements
    .filter((placement) => placement.startMs > localStartMs)
    .reduce(
      (nearest, placement) => Math.min(nearest, placement.startMs),
      atShowEnd ? localStartMs + defaultDurationMs : sceneRange.scene.durationMs,
    )
  const availableMs = nextObstructionMs - localStartMs
  if (availableMs < 1) {
    return { enabled: false, code: 'no-space', reason: 'There is no empty time on the selected Layer.' }
  }

  return {
    enabled: true,
    code: 'ready',
    sceneId: sceneRange.sceneId,
    localStartMs,
    durationMs: Math.min(defaultDurationMs, availableMs),
  }
}

export function addShowClipAtGlobalTimeExtendingShow(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: ShowClipAddLocation & {
    instance: ShowPatternInstance
    placementId: string
  },
): ShowRecord {
  const plan = planShowClipAtGlobalTime(show, composition, input)
  if (!plan.enabled) return show
  const requiredShowEndMs = Math.round(input.globalTimeMs) + plan.durationMs
  const basis = requiredShowEndMs > showLoopDurationMs(show)
    ? setShowEndMs({ ...show, composition }, requiredShowEndMs)
    : { ...show, composition }
  const nextComposition = addShowClipAtGlobalTime(basis, basis.composition!, input)
  if (nextComposition === basis.composition) return show
  return {
    ...basis,
    composition: nextComposition,
    updatedAt: Math.max(Date.now(), show.updatedAt + 1),
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
  return addShowClipAtGlobalTime(show, composition, { ...input, target: { kind: 'main' } })
}

export function addShowClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: ShowClipAddLocation & {
    instance: ShowPatternInstance
    placementId: string
  },
): ShowCompositionV1 {
  const plan = planShowClipAtGlobalTime(show, composition, input)
  if (!plan.enabled) return composition

  const placement = {
    id: input.placementId,
    instanceId: input.instance.id,
    startMs: plan.localStartMs,
    durationMs: plan.durationMs,
    view: { mirror: false, phase: 0, brightness: 1 },
  }
  if (input.target.kind === 'main') {
    return addShowMainClip(show, composition, {
      sceneId: plan.sceneId,
      zoneId: input.zoneId,
      instance: input.instance,
      placement,
    })
  }
  const layerId = composition.scenes.find((scene) => scene.sceneId === plan.sceneId)?.zones
    .find((zone) => zone.zoneId === input.zoneId)?.overlays[input.target.layerIndex]?.id
  if (!layerId) return composition
  return addShowOverlayClip(show, composition, {
    sceneId: plan.sceneId,
    zoneId: input.zoneId,
    layerId,
    instance: input.instance,
    placement: { ...placement, opacity: 1 },
  })
}

export function moveShowClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; target: ShowTimelineClipMoveTarget },
): ShowCompositionV1 {
  if (!Number.isFinite(input.target.globalStartMs)) return composition
  const logicalSegments = logicalClipSegments(show, composition, input.owner)
  const logicalRange = globalLogicalClipRange(logicalSegments)
  if (!logicalRange) return composition
  const logicalDurationMs = logicalRange.endMs - logicalRange.startMs
  const targetSlices = globalSpanSceneSlices(show, input.target.globalStartMs, logicalDurationMs)
  if (logicalSegments.length > 1 || targetSlices.length > 1) {
    return replaceLogicalClipGlobalSpan(show, composition, {
      owner: input.owner,
      target: input.target.kind === 'main'
        ? { kind: 'main', zoneId: input.target.zoneId }
        : { kind: 'overlay', zoneId: input.target.zoneId, layerIndex: input.target.layerIndex },
      globalStartMs: Math.round(input.target.globalStartMs),
      durationMs: logicalDurationMs,
    })
  }
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
  const sourceInstanceId = sourcePlacements[sourceIndex].instanceId
  const instanceUseCount = draft.scenes.reduce((count, scene) => (
    count + scene.zones.reduce((zoneCount, zone) => (
      zoneCount
      + zone.main.filter((placement) => placement.instanceId === sourceInstanceId).length
      + zone.overlays.reduce((layerCount, layer) => (
        layerCount + layer.placements.filter((placement) => placement.instanceId === sourceInstanceId).length
      ), 0)
    ), 0)
  ), 0)
  const instanceIsSoleUse = instanceUseCount === 1
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
    || (
      instanceIsSoleUse
      && 'instanceId' in track.target
      && track.target.instanceId === sourcePlacement.instanceId
    )
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

export type ShowClipSplitPlan =
  | { enabled: true; code: 'ready'; reason: string }
  | { enabled: false; code: 'invalid-time' | 'missing-owner' | 'outside-clip' | 'transition-gap'; reason: string }

export function planShowClipSplitAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; globalTimeMs: number },
): ShowClipSplitPlan {
  if (!Number.isFinite(input.globalTimeMs)) {
    return { enabled: false, code: 'invalid-time', reason: 'Place the playhead inside the selected Clip.' }
  }
  const segments = logicalClipSegments(show, composition, input.owner)
  if (segments.length === 0) {
    return { enabled: false, code: 'missing-owner', reason: 'The selected Clip no longer exists.' }
  }
  const insideSegment = segments.some((segment) => {
    const startMs = segment.sceneStartMs + segment.placement.startMs
    const endMs = startMs + segment.placement.durationMs
    return input.globalTimeMs > startMs && input.globalTimeMs < endMs
  })
  if (insideSegment) return { enabled: true, code: 'ready', reason: 'Split the selected Clip at the playhead.' }
  const logicalRange = globalLogicalClipRange(segments)
  if (logicalRange && input.globalTimeMs > logicalRange.startMs && input.globalTimeMs < logicalRange.endMs) {
    return {
      enabled: false,
      code: 'transition-gap',
      reason: 'A Clip cannot be split inside a Transition.',
    }
  }
  return { enabled: false, code: 'outside-clip', reason: 'Place the playhead inside the selected Clip.' }
}

export function splitShowClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; globalTimeMs: number; newPlacementId: string },
): ShowCompositionV1 {
  const globalTimeMs = Math.round(input.globalTimeMs)
  if (!planShowClipSplitAtGlobalTime(show, composition, { ...input, globalTimeMs }).enabled) return composition
  const segments = logicalClipSegments(show, composition, input.owner)
  const logicalRange = globalLogicalClipRange(segments)
  if (segments.length > 1 && logicalRange) {
    if (globalTimeMs <= logicalRange.startMs || globalTimeMs >= logicalRange.endMs) return composition
    const segmentIds = new Set(segments.map((segment) => segment.placement.id))
    const base = segments[0].placement
    const sourceScene = composition.scenes.find((scene) => scene.sceneId === input.owner.sceneId)
    const sourceZone = sourceScene?.zones.find((zone) => zone.zoneId === input.owner.zoneId)
    const sourceLayerId = input.owner.kind === 'overlay' ? input.owner.layerId : null
    const layerIndex = sourceLayerId
      ? sourceZone?.overlays.findIndex((layer) => layer.id === sourceLayerId)
      : -1
    if (input.owner.kind === 'overlay' && (layerIndex === undefined || layerIndex < 0)) return composition
    const target: ShowClipAddTarget & { zoneId: string } = input.owner.kind === 'main'
      ? { kind: 'main', zoneId: input.owner.zoneId }
      : { kind: 'overlay', zoneId: input.owner.zoneId, layerIndex: layerIndex! }
    const draft = structuredClone(composition)
    const rootId = placementLogicalClipId(base)
    for (const scene of draft.scenes) {
      for (const zone of scene.zones) {
        zone.main = zone.main.filter((placement) => placementLogicalClipId(placement) !== rootId)
        for (const layer of zone.overlays) {
          layer.placements = layer.placements.filter((placement) => placementLogicalClipId(placement) !== rootId)
        }
      }
    }
    if (!appendLogicalClipGlobalSpan(show, draft, {
      rootId,
      base,
      target,
      globalStartMs: logicalRange.startMs,
      durationMs: globalTimeMs - logicalRange.startMs,
    })) return composition
    if (!appendLogicalClipGlobalSpan(show, draft, {
      rootId: input.newPlacementId,
      base,
      target,
      globalStartMs: globalTimeMs,
      durationMs: logicalRange.endMs - globalTimeMs,
    })) return composition
    if (!retargetLogicalSplitPlacementTracks(draft, {
      sourcePlacementIds: segmentIds,
      leftLogicalClipId: rootId,
      rightLogicalClipId: input.newPlacementId,
    })) return composition
    const rightSegments = logicalClipSegments(show, draft, {
      ...input.owner,
      placementId: input.newPlacementId,
    })
    const rightEndPlacementId = rightSegments[rightSegments.length - 1]?.placement.id
    if (!rightEndPlacementId) return composition
    draft.transitions = draft.transitions?.map((transition) => ({
      ...transition,
      ...(segmentIds.has(transition.fromPlacementId)
        ? { fromPlacementId: rightEndPlacementId }
        : {}),
      ...(segmentIds.has(transition.toPlacementId)
        ? { toPlacementId: rootId }
        : {}),
    }))
    if (validateShowComposition(show, draft).length > 0) return composition
    return normalizeShowComposition(show, draft)
  }
  const range = projectShowTimeline(show).scenes.find((scene) => scene.sceneId === input.owner.sceneId)
  if (!range) return composition
  const atMs = globalTimeMs - range.startMs
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
  input: { owner: ShowTimelineClipOwner; newPlacementId: string; newInstanceId: string },
): ShowCompositionV1 {
  return duplicateShowClip(show, composition, input)
}

export function duplicateLinkedShowClipAfter(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; newPlacementId: string },
): ShowCompositionV1 {
  return duplicateShowClip(show, composition, { ...input, newInstanceId: null })
}

export type ShowClipDuplicatePlan =
  | { enabled: true; code: 'ready'; reason: string }
  | {
      enabled: false
      code: 'missing-owner' | 'transition-boundary' | 'scene-boundary' | 'occupied' | 'unsupported-animation'
      reason: string
    }

function showClipDuplicateHasUnsupportedTracks(
  composition: ShowCompositionV1,
  logicalSegments: LogicalClipSegment[],
  targetSliceCount: number,
  independent: boolean,
): boolean {
  if (logicalSegments.length <= 1 && targetSliceCount <= 1) return false
  const base = logicalSegments[0]?.placement
  if (!base) return false
  const segmentIds = new Set(logicalSegments.map((segment) => segment.placement.id))
  return composition.scenes.some((scene) => (
    (scene.propertyTracks ?? []).some((track) => (
      'placementId' in track.target
        ? segmentIds.has(track.target.placementId)
        : Boolean(independent && track.target.instanceId === base.instanceId)
    ))
  ))
}

export function planShowClipDuplicateAfter(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; independent: boolean },
): ShowClipDuplicatePlan {
  const logicalSegments = logicalClipSegments(show, composition, input.owner)
  if (logicalSegments.length === 0) {
    return { enabled: false, code: 'missing-owner', reason: 'The selected Clip no longer exists.' }
  }
  const logicalRange = globalLogicalClipRange(logicalSegments)
  if (!logicalRange) {
    return { enabled: false, code: 'missing-owner', reason: 'The selected Clip no longer exists.' }
  }
  const durationMs = logicalRange.endMs - logicalRange.startMs
  const targetStartMs = logicalRange.endMs
  const targetEndMs = targetStartMs + durationMs
  const targetSlices = globalSpanSceneSlices(show, targetStartMs, durationMs)
  if (targetSlices.length === 0) {
    return {
      enabled: false,
      code: targetEndMs > showLoopDurationMs(show) ? 'scene-boundary' : 'transition-boundary',
      reason: 'The duplicate needs uninterrupted Show time after the selected Clip.',
    }
  }
  if (showClipDuplicateHasUnsupportedTracks(
    composition,
    logicalSegments,
    targetSlices.length,
    input.independent,
  )) {
    return {
      enabled: false,
      code: 'unsupported-animation',
      reason: 'Multi-part Clips with Property animation cannot be cloned yet.',
    }
  }
  const timeline = projectShowUnifiedTimeline(show, composition)
  const layer = timeline.zones
    .find((zone) => zone.id === input.owner.zoneId)
    ?.layers.find((candidate) => candidate.clips.some((clip) => clip.id === input.owner.placementId))
  if (!layer) {
    return { enabled: false, code: 'missing-owner', reason: 'The selected Clip no longer exists.' }
  }
  if (layer.junctions.some((junction) => (
    junction.durationMs > 0
    && junction.startMs < targetEndMs
    && junction.endMs > targetStartMs
  ))) {
    return {
      enabled: false,
      code: 'transition-boundary',
      reason: 'The duplicate would overlap a Layer Transition.',
    }
  }
  if (layer.clips.some((clip) => (
    clip.id !== input.owner.placementId
    && clip.startMs < targetEndMs
    && clip.endMs > targetStartMs
  ))) {
    return {
      enabled: false,
      code: 'occupied',
      reason: 'The selected Clip needs empty time after it on this Layer.',
    }
  }
  return { enabled: true, code: 'ready', reason: 'Duplicate the selected Clip immediately after itself.' }
}

function duplicateShowClip(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; newPlacementId: string; newInstanceId: string | null },
): ShowCompositionV1 {
  if (!planShowClipDuplicateAfter(show, composition, {
    owner: input.owner,
    independent: Boolean(input.newInstanceId),
  }).enabled) return composition
  const logicalRange = globalLogicalClipRange(logicalClipSegments(show, composition, input.owner))
  const target = clipMoveTargetForOwner(composition, input.owner, logicalRange?.endMs ?? Number.NaN)
  if (!target) return composition
  return duplicateShowClipAtGlobalTime(show, composition, { ...input, target })
}

function clipMoveTargetForOwner(
  composition: ShowCompositionV1,
  owner: ShowTimelineClipOwner,
  globalStartMs: number,
): ShowTimelineClipMoveTarget | null {
  if (owner.kind === 'main') return { kind: 'main', zoneId: owner.zoneId, globalStartMs }
  const zone = composition.scenes.find((scene) => scene.sceneId === owner.sceneId)?.zones
    .find((candidate) => candidate.zoneId === owner.zoneId)
  const layerIndex = zone?.overlays.findIndex((layer) => layer.id === owner.layerId) ?? -1
  return layerIndex >= 0
    ? { kind: 'overlay', zoneId: owner.zoneId, layerIndex, globalStartMs }
    : null
}

export function duplicateShowClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: {
    owner: ShowTimelineClipOwner
    target: ShowTimelineClipMoveTarget
    newPlacementId: string
    newInstanceId: string | null
  },
): ShowCompositionV1 {
  if (!Number.isFinite(input.target.globalStartMs)) return composition
  const logicalSegments = logicalClipSegments(show, composition, input.owner)
  const logicalRange = globalLogicalClipRange(logicalSegments)
  const base = logicalSegments.find((segment) => segment.placement.id === input.owner.placementId)?.placement
    ?? logicalSegments[0]?.placement
  if (!logicalRange || !base || composition.scenes.some((scene) => scene.zones.some((zone) => (
    zone.main.some((placement) => placement.id === input.newPlacementId)
    || zone.overlays.some((layer) => layer.placements.some((placement) => placement.id === input.newPlacementId))
  )))) return composition
  const targetStartMs = Math.round(input.target.globalStartMs)
  const targetSlices = globalSpanSceneSlices(
    show,
    targetStartMs,
    logicalRange.endMs - logicalRange.startMs,
  )
  if (targetSlices.length === 0 || showClipDuplicateHasUnsupportedTracks(
    composition,
    logicalSegments,
    targetSlices.length,
    Boolean(input.newInstanceId),
  )) return composition
  const sourceInstance = composition.patternInstances.find((instance) => instance.id === base.instanceId)
  if (!sourceInstance || (input.newInstanceId && composition.patternInstances.some((instance) => (
    instance.id === input.newInstanceId
  )))) return composition

  const sourceTarget = clipMoveTargetForOwner(composition, input.owner, logicalRange.startMs)
  if (!sourceTarget) return composition
  const staged = structuredClone(composition)
  if (input.newInstanceId) {
    staged.patternInstances.push({ ...structuredClone(sourceInstance), id: input.newInstanceId })
  }
  if (!appendLogicalClipGlobalSpan(show, staged, {
    rootId: input.newPlacementId,
    base: {
      ...structuredClone(base),
      instanceId: input.newInstanceId ?? base.instanceId,
    },
    target: sourceTarget.kind === 'main'
      ? { kind: 'main', zoneId: sourceTarget.zoneId }
      : { kind: 'overlay', zoneId: sourceTarget.zoneId, layerIndex: sourceTarget.layerIndex },
    globalStartMs: logicalRange.startMs,
    durationMs: logicalRange.endMs - logicalRange.startMs,
  })) return composition

  if (logicalSegments.length === 1) {
    const sourceScene = staged.scenes.find((scene) => scene.sceneId === logicalSegments[0].sceneId)
    const placementCopies = (sourceScene?.propertyTracks ?? []).flatMap((track) => (
      'placementId' in track.target && track.target.placementId === input.owner.placementId
        ? [{
            ...structuredClone(track),
            id: `${track.id}-${input.newPlacementId}`,
            target: { ...track.target, placementId: input.newPlacementId },
            keyframes: track.keyframes.map((keyframe) => ({
              ...structuredClone(keyframe),
              id: `${keyframe.id}-${input.newPlacementId}`,
            })),
          }]
        : []
    ))
    if (sourceScene && placementCopies.length > 0) {
      sourceScene.propertyTracks = [...(sourceScene.propertyTracks ?? []), ...placementCopies]
    }
  }
  if (input.newInstanceId) {
    for (const sceneId of new Set(logicalSegments.map((segment) => segment.sceneId))) {
      cloneTimelineInstanceTracks(staged, sceneId, base.instanceId, input.newInstanceId, 0)
    }
  }

  // Stage the copy at the source so the existing move path owns target
  // slicing, track relocation, occupancy checks, and final validation. The
  // overlapping draft is internal only; a refused move returns the original.
  const stagedOwner: ShowTimelineClipOwner = { ...input.owner, placementId: input.newPlacementId }
  const duplicated = moveShowClipAtGlobalTime(show, staged, {
    owner: stagedOwner,
    target: { ...input.target, globalStartMs: targetStartMs },
  })
  return duplicated === staged ? composition : duplicated
}

export function makeShowClipPatternIndependent(
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; newInstanceId: string },
): ShowCompositionV1 {
  const draft = structuredClone(composition)
  if (draft.patternInstances.some((instance) => instance.id === input.newInstanceId)) return composition
  const placements = findTimelineLogicalPlacements(draft, input.owner)
  const placement = placements[0]?.placement
  if (!placement) return composition
  const sourceInstance = draft.patternInstances.find((instance) => instance.id === placement.instanceId)
  if (!sourceInstance) return composition

  draft.patternInstances.push({ ...structuredClone(sourceInstance), id: input.newInstanceId })
  placements.forEach((segment) => {
    segment.placement.instanceId = input.newInstanceId
  })
  for (const sceneId of new Set(placements.map((segment) => segment.sceneId))) {
    cloneTimelineInstanceTracks(draft, sceneId, sourceInstance.id, input.newInstanceId, 0)
  }
  draft.patternInstances.sort((left, right) => left.id.localeCompare(right.id))
  return draft
}

export type ShowClipPatternRejoinPlan =
  | {
      enabled: true
      code: 'ready'
      sourceInstanceId: string
      targetInstanceId: string
      targetUseCount: number
      discardsSourceState: boolean
    }
  | {
      enabled: false
      code: 'missing-owner' | 'missing-target' | 'already-shared' | 'incompatible-target'
      reason: string
    }

export interface ShowClipPatternInstanceOwnership {
  instanceId: string
  useCount: number
  compatibleTargets: Array<{
    instanceId: string
    patternName: string
    useCount: number
  }>
}

export function projectShowClipPatternInstanceOwnership(
  composition: ShowCompositionV1,
  owner: ShowTimelineClipOwner,
): ShowClipPatternInstanceOwnership | null {
  const placement = findTimelinePlacement(composition, owner)
  if (!placement) return null
  const instance = composition.patternInstances.find((candidate) => candidate.id === placement.instanceId)
  if (!instance) return null
  return {
    instanceId: instance.id,
    useCount: showPatternInstanceUseCount(composition, instance.id),
    compatibleTargets: composition.patternInstances.flatMap((candidate) => {
      if (
        candidate.id === instance.id
        || candidate.pattern.kind !== instance.pattern.kind
        || candidate.pattern.id !== instance.pattern.id
      ) return []
      return [{
        instanceId: candidate.id,
        patternName: candidate.patternName,
        useCount: showPatternInstanceUseCount(composition, candidate.id),
      }]
    }),
  }
}

export function planShowClipPatternRejoin(
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; targetInstanceId: string },
): ShowClipPatternRejoinPlan {
  const placement = findTimelinePlacement(composition, input.owner)
  if (!placement) return { enabled: false, code: 'missing-owner', reason: 'The selected Clip no longer exists.' }
  if (placement.instanceId === input.targetInstanceId) {
    return { enabled: false, code: 'already-shared', reason: 'This Clip already uses that Pattern instance.' }
  }
  const source = composition.patternInstances.find((instance) => instance.id === placement.instanceId)
  const target = composition.patternInstances.find((instance) => instance.id === input.targetInstanceId)
  if (!source || !target) {
    return { enabled: false, code: 'missing-target', reason: 'Choose an existing Pattern instance.' }
  }
  if (source.pattern.kind !== target.pattern.kind || source.pattern.id !== target.pattern.id) {
    return { enabled: false, code: 'incompatible-target', reason: 'Choose an instance of the same Pattern.' }
  }
  return {
    enabled: true,
    code: 'ready',
    sourceInstanceId: source.id,
    targetInstanceId: target.id,
    targetUseCount: showPatternInstanceUseCount(composition, target.id),
    discardsSourceState: showPatternInstanceUseCount(composition, source.id) === 1,
  }
}

export function rejoinShowClipPatternInstance(
  composition: ShowCompositionV1,
  input: { owner: ShowTimelineClipOwner; targetInstanceId: string },
): ShowCompositionV1 {
  const plan = planShowClipPatternRejoin(composition, input)
  if (!plan.enabled) return composition
  const draft = structuredClone(composition)
  const placements = findTimelineLogicalPlacements(draft, input.owner)
  if (placements.length === 0) return composition
  placements.forEach((segment) => {
    segment.placement.instanceId = plan.targetInstanceId
  })
  if (plan.discardsSourceState) {
    draft.patternInstances = draft.patternInstances.filter((instance) => instance.id !== plan.sourceInstanceId)
    for (const scene of draft.scenes) {
      scene.propertyTracks = scene.propertyTracks?.filter((track) => (
        !('instanceId' in track.target) || track.target.instanceId !== plan.sourceInstanceId
      ))
      if (scene.propertyTracks?.length === 0) delete scene.propertyTracks
    }
  }
  return draft
}

function showPatternInstanceUseCount(composition: ShowCompositionV1, instanceId: string): number {
  const logicalClipIds = new Set<string>()
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      for (const placement of zone.main) {
        if (placement.instanceId === instanceId) logicalClipIds.add(placementLogicalClipId(placement))
      }
      for (const layer of zone.overlays) {
        for (const placement of layer.placements) {
          if (placement.instanceId === instanceId) logicalClipIds.add(placementLogicalClipId(placement))
        }
      }
    }
  }
  return logicalClipIds.size
}

function findTimelineLogicalPlacements(
  composition: ShowCompositionV1,
  owner: ShowTimelineClipOwner,
): Array<{ sceneId: string; placement: ShowMainPlacement | ShowOverlayPlacement }> {
  const source = findTimelinePlacement(composition, owner)
  if (!source) return []
  const logicalClipId = placementLogicalClipId(source)
  return composition.scenes.flatMap((scene) => scene.zones.flatMap((zone) => [
    ...zone.main.flatMap((placement) => (
      placementLogicalClipId(placement) === logicalClipId ? [{ sceneId: scene.sceneId, placement }] : []
    )),
    ...zone.overlays.flatMap((layer) => layer.placements.flatMap((placement) => (
      placementLogicalClipId(placement) === logicalClipId ? [{ sceneId: scene.sceneId, placement }] : []
    ))),
  ]))
}

function findTimelinePlacement(
  composition: ShowCompositionV1,
  owner: ShowTimelineClipOwner,
): ShowMainPlacement | ShowOverlayPlacement | undefined {
  const zone = composition.scenes.find((scene) => scene.sceneId === owner.sceneId)?.zones
    .find((candidate) => candidate.zoneId === owner.zoneId)
  return owner.kind === 'main'
    ? zone?.main.find((placement) => placement.id === owner.placementId)
    : zone?.overlays.find((layer) => layer.id === owner.layerId)?.placements
      .find((placement) => placement.id === owner.placementId)
}

function cloneTimelineInstanceTracks(
  composition: ShowCompositionV1,
  sceneId: string,
  sourceInstanceId: string,
  targetInstanceId: string,
  offsetMs: number,
): void {
  const scene = composition.scenes.find((candidate) => candidate.sceneId === sceneId)
  if (!scene?.propertyTracks) return
  const copies = scene.propertyTracks.flatMap((track) => {
    if (!('instanceId' in track.target) || track.target.instanceId !== sourceInstanceId) return []
    return [{
      ...structuredClone(track),
      id: `${track.id}-${targetInstanceId}`,
      target: { ...track.target, instanceId: targetInstanceId },
      keyframes: track.keyframes.map((keyframe) => ({
        ...structuredClone(keyframe),
        id: `${keyframe.id}-${targetInstanceId}`,
        timeMs: keyframe.timeMs + offsetMs,
      })),
    }]
  })
  scene.propertyTracks.push(...copies)
}

export function resizeShowClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: {
    owner: ShowTimelineClipOwner
    globalStartMs: number
    durationMs: number
  },
): ShowCompositionV1 {
  if (!Number.isFinite(input.globalStartMs) || !Number.isFinite(input.durationMs)) return composition
  const logicalSegments = logicalClipSegments(show, composition, input.owner)
  const targetSlices = globalSpanSceneSlices(show, input.globalStartMs, input.durationMs)
  if (logicalSegments.length > 1 || targetSlices.length > 1 || targetSlices[0]?.sceneId !== input.owner.sceneId) {
    const sourceScene = composition.scenes.find((scene) => scene.sceneId === input.owner.sceneId)
    const sourceZone = sourceScene?.zones.find((zone) => zone.zoneId === input.owner.zoneId)
    const sourceLayerId = input.owner.kind === 'overlay' ? input.owner.layerId : null
    const layerIndex = sourceLayerId
      ? sourceZone?.overlays.findIndex((layer) => layer.id === sourceLayerId)
      : -1
    if (input.owner.kind === 'overlay' && (layerIndex === undefined || layerIndex < 0)) return composition
    return replaceLogicalClipGlobalSpan(show, composition, {
      owner: input.owner,
      target: input.owner.kind === 'main'
        ? { kind: 'main', zoneId: input.owner.zoneId }
        : { kind: 'overlay', zoneId: input.owner.zoneId, layerIndex: layerIndex! },
      globalStartMs: Math.round(input.globalStartMs),
      durationMs: Math.round(input.durationMs),
    })
  }
  const range = projectShowTimeline(show).scenes.find((scene) => scene.sceneId === input.owner.sceneId)
  if (!range) return composition
  const startMs = Math.round(input.globalStartMs - range.startMs)
  const durationMs = Math.round(input.durationMs)
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
  const placement = placements?.find((candidate) => candidate.id === input.owner.placementId)
  if (!placement) return composition
  const offsetMs = startMs - placement.startMs
  placement.startMs = startMs
  placement.durationMs = durationMs
  if (offsetMs !== 0) {
    for (const track of scene.propertyTracks ?? []) {
      if (!('placementId' in track.target) || track.target.placementId !== input.owner.placementId) continue
      track.keyframes.forEach((keyframe) => {
        keyframe.timeMs += offsetMs
      })
    }
  }
  if (validateShowComposition(show, draft).length > 0) return composition
  return normalizeShowComposition(show, draft)
}
