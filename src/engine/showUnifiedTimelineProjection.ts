import type {
  ShowBoundaryTransition,
  ShowCompositionV1,
  ShowLayerTransition,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowRecord,
  ShowTransitionKind,
} from './personalContentRecords'
import { projectShowTimeline, type ShowTimelineBoundaryTransitionProjection } from './showModel'
import { materializeShowGroupOccurrences } from './showGroupModel'

export interface ShowUnifiedTimelineClipProjection {
  id: string
  logicalClipId?: string
  segmentIds?: string[]
  startPlacementId: string
  endPlacementId: string
  instanceId: string
  patternName: string
  compiled: boolean
  sceneId: string
  startSceneId: string
  endSceneId: string
  zoneId: string
  layerId: string | null
  layerIndex: number
  kind: 'main' | 'overlay'
  localStartMs: number
  startMs: number
  endMs: number
  durationMs: number
  opacity: number
  effectKinds: string[]
  groupOccurrenceId?: string
  diagnostics: string[]
}

export interface ShowUnifiedTimelineGroupProjection {
  id: string
  definitionId: string
  name: string
  sceneId: string
  zoneId: string
  startMs: number
  endMs: number
  durationMs: number
  topLayerIndex: number
  bottomLayerIndex: number
  linkedOccurrenceCount: number
}

export interface ShowUnifiedTimelineLayerProjection {
  id: string
  kind: 'main' | 'overlay'
  layerIndex: number
  clips: ShowUnifiedTimelineClipProjection[]
  junctions: ShowUnifiedTimelineJunctionProjection[]
}

type ShowVisualBoundaryTransition = Omit<ShowBoundaryTransition, 'kind'> & {
  kind: ShowTransitionKind
}

type ShowVisualTimelineBoundaryTransition = Omit<ShowTimelineBoundaryTransitionProjection, 'kind'> & {
  kind: ShowTransitionKind
}

export interface ShowUnifiedTimelineJunctionProjection {
  id: string
  kind: ShowTransitionKind
  leftClipId: string
  rightClipId: string
  fromPlacementId: string
  toPlacementId: string
  startMs: number
  endMs: number
  durationMs: number
  transition: ShowLayerTransition | null
  boundaryTransition?: ShowVisualBoundaryTransition
}

export interface ShowUnifiedTimelineZoneProjection {
  id: string
  name: string
  color: string
  layers: ShowUnifiedTimelineLayerProjection[]
  groups: ShowUnifiedTimelineGroupProjection[]
}

export interface ShowUnifiedTimelineProjection {
  durationMs: number
  zones: ShowUnifiedTimelineZoneProjection[]
}

/**
 * Present durable Scene-local ownership as one global editing surface. Scene
 * identity remains on each Clip only so mutations can resolve their owner.
 */
export function projectShowUnifiedTimeline(
  show: ShowRecord,
  composition: ShowCompositionV1,
): ShowUnifiedTimelineProjection {
  const timeline = projectShowTimeline(show)
  const sceneRangeById = new Map(timeline.scenes.map((scene) => [scene.sceneId, scene]))
  const nextSceneIdById = new Map(timeline.scenes.slice(0, -1)
    .map((scene, index) => [scene.sceneId, timeline.scenes[index + 1].sceneId]))
  const projectedComposition = materializeShowGroupOccurrences(composition)
  const instanceById = new Map(projectedComposition.patternInstances.map((instance) => [instance.id, instance]))
  const groupByPlacementId = new Map((composition.groupOccurrences ?? []).flatMap((occurrence) => {
    const definition = composition.groupDefinitions?.find((candidate) => candidate.id === occurrence.definitionId)
    return (definition?.placements ?? []).map((placement) => [`${occurrence.id}:${placement.id}`, occurrence.id] as const)
  }))

  return {
    durationMs: timeline.durationMs,
    zones: show.zones.map((zone) => {
      const maximumOverlayCount = projectedComposition.scenes.reduce((maximum, sceneComposition) => {
        const zoneComposition = sceneComposition.zones.find((candidate) => candidate.zoneId === zone.id)
        return Math.max(maximum, zoneComposition?.overlays.length ?? 0)
      }, 0)
      const overlayLayers: ShowUnifiedTimelineLayerProjection[] = Array.from(
        { length: maximumOverlayCount },
        (_, layerIndex) => projectLayer({
          id: `${zone.id}:overlay:${layerIndex}`,
          kind: 'overlay',
          layerIndex,
          clips: coalesceLogicalClips(projectedComposition.scenes.flatMap((sceneComposition) => {
            const range = sceneRangeById.get(sceneComposition.sceneId)
            const zoneComposition = sceneComposition.zones.find((candidate) => candidate.zoneId === zone.id)
            const layer = zoneComposition?.overlays[layerIndex]
            if (!range || !layer) return []
            return layer.placements.map((placement) => projectPlacement({
              placement,
              sceneId: sceneComposition.sceneId,
              zoneId: zone.id,
              layerId: layer.id,
              layerIndex,
              kind: 'overlay',
              sceneStartMs: range.startMs,
              instanceById,
              groupByPlacementId,
            }))
          }).sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))),
          transitions: projectedComposition.transitions ?? [],
          boundaryTransitions: timeline.boundaryTransitions,
          nextSceneIdById,
        }),
      )
      const mainLayer = projectLayer({
        id: `${zone.id}:main`,
        kind: 'main',
        layerIndex: maximumOverlayCount,
        clips: coalesceLogicalClips(projectedComposition.scenes.flatMap((sceneComposition) => {
          const range = sceneRangeById.get(sceneComposition.sceneId)
          const zoneComposition = sceneComposition.zones.find((candidate) => candidate.zoneId === zone.id)
          if (!range || !zoneComposition) return []
          return zoneComposition.main.map((placement) => projectPlacement({
            placement,
            sceneId: sceneComposition.sceneId,
            zoneId: zone.id,
            layerId: null,
            layerIndex: maximumOverlayCount,
            kind: 'main',
            sceneStartMs: range.startMs,
            instanceById,
            groupByPlacementId,
          }))
        }).sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))),
        transitions: projectedComposition.transitions ?? [],
        boundaryTransitions: timeline.boundaryTransitions,
        nextSceneIdById,
      })
      return {
        id: zone.id,
        name: zone.name,
        color: zone.color ?? '#38bdf8',
        layers: [...overlayLayers, mainLayer],
        groups: (composition.groupOccurrences ?? []).flatMap((occurrence) => {
          if (occurrence.zoneId !== zone.id) return []
          const definition = composition.groupDefinitions?.find((candidate) => candidate.id === occurrence.definitionId)
          const sceneRange = sceneRangeById.get(occurrence.sceneId)
          if (!definition || !sceneRange || definition.placements.length === 0) return []
          const durationMs = Math.max(...definition.placements.map((placement) => placement.startMs + placement.durationMs))
          const minimumLayer = occurrence.baseLayer + Math.min(...definition.placements.map((placement) => placement.layerOffset))
          const maximumLayer = occurrence.baseLayer + Math.max(...definition.placements.map((placement) => placement.layerOffset))
          const startMs = sceneRange.startMs + occurrence.startMs
          return [{
            id: occurrence.id,
            definitionId: definition.id,
            name: definition.name,
            sceneId: occurrence.sceneId,
            zoneId: occurrence.zoneId,
            startMs,
            endMs: startMs + durationMs,
            durationMs,
            topLayerIndex: maximumOverlayCount - maximumLayer,
            bottomLayerIndex: maximumOverlayCount - minimumLayer,
            linkedOccurrenceCount: (composition.groupOccurrences ?? [])
              .filter((candidate) => candidate.definitionId === definition.id).length,
          }]
        }).sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id)),
      }
    }),
  }
}

function projectLayer(
  layer: Omit<ShowUnifiedTimelineLayerProjection, 'junctions'> & {
    transitions: ShowLayerTransition[]
    boundaryTransitions: ShowTimelineBoundaryTransitionProjection[]
    nextSceneIdById: Map<string, string>
  },
): ShowUnifiedTimelineLayerProjection {
  const { transitions, boundaryTransitions, nextSceneIdById, ...projection } = layer
  return {
    ...projection,
    junctions: layer.clips.slice(0, -1).flatMap<ShowUnifiedTimelineJunctionProjection>((leftClip, index) => {
      const rightClip = layer.clips[index + 1]
      const fromPlacementId = leftClip.endPlacementId
      const toPlacementId = rightClip.startPlacementId
      const transition = transitions.find((candidate) => (
        candidate.fromPlacementId === fromPlacementId
        && candidate.toPlacementId === toPlacementId
      ))
      if (transition) {
        if (leftClip.endMs + transition.durationMs !== rightClip.startMs) return []
        return [{
          id: transition.id,
          kind: transition.kind,
          leftClipId: leftClip.id,
          rightClipId: rightClip.id,
          fromPlacementId,
          toPlacementId,
          startMs: leftClip.endMs,
          endMs: rightClip.startMs,
          durationMs: transition.durationMs,
          transition,
        }]
      }
      const boundaryTransition = boundaryTransitions.find((
        candidate,
      ): candidate is ShowVisualTimelineBoundaryTransition => (
        candidate.kind !== 'routing'
        && candidate.afterSceneId === leftClip.endSceneId
        && rightClip.startSceneId === nextSceneIdById.get(leftClip.endSceneId)
        && leftClip.endMs === candidate.startMs
        && rightClip.startMs === candidate.endMs
      ))
      if (boundaryTransition) {
        const {
          cost: _cost,
          startMs: _startMs,
          endMs: _endMs,
          layoutName: _layoutName,
          ...authoredBoundaryTransition
        } = boundaryTransition
        return [{
          id: boundaryTransition.id,
          kind: boundaryTransition.kind,
          leftClipId: leftClip.id,
          rightClipId: rightClip.id,
          fromPlacementId,
          toPlacementId,
          startMs: leftClip.endMs,
          endMs: rightClip.startMs,
          durationMs: boundaryTransition.durationMs,
          transition: null,
          boundaryTransition: authoredBoundaryTransition,
        }]
      }
      if (leftClip.endMs !== rightClip.startMs) return []
      return [{
        id: `cut:${leftClip.id}:${rightClip.id}`,
        kind: 'cut' as const,
        leftClipId: leftClip.id,
        rightClipId: rightClip.id,
        fromPlacementId,
        toPlacementId,
        startMs: rightClip.startMs,
        endMs: rightClip.startMs,
        durationMs: 0,
        transition: null,
      }]
    }),
  }
}

function coalesceLogicalClips(
  clips: ShowUnifiedTimelineClipProjection[],
): ShowUnifiedTimelineClipProjection[] {
  const groups = new Map<string, ShowUnifiedTimelineClipProjection[]>()
  for (const clip of clips) {
    const id = clip.logicalClipId ?? clip.id
    groups.set(id, [...(groups.get(id) ?? []), clip])
  }
  return [...groups.entries()].map(([id, segments]) => {
    const ordered = segments.sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
    const first = ordered[0]
    const endMs = Math.max(...ordered.map((segment) => segment.endMs))
    return {
      ...first,
      id,
      logicalClipId: id,
      segmentIds: ordered.map((segment) => segment.id),
      startPlacementId: ordered[0].id,
      endPlacementId: ordered[ordered.length - 1].id,
      startSceneId: ordered[0].sceneId,
      endSceneId: ordered[ordered.length - 1].sceneId,
      endMs,
      durationMs: endMs - first.startMs,
      diagnostics: [...new Set(ordered.flatMap((segment) => segment.diagnostics))],
    }
  }).sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
}

function projectPlacement(input: {
  placement: ShowMainPlacement | ShowOverlayPlacement
  sceneId: string
  zoneId: string
  layerId: string | null
  layerIndex: number
  kind: 'main' | 'overlay'
  sceneStartMs: number
  instanceById: Map<string, ShowCompositionV1['patternInstances'][number]>
  groupByPlacementId: Map<string, string>
}): ShowUnifiedTimelineClipProjection {
  const instance = input.instanceById.get(input.placement.instanceId)
  const startMs = input.sceneStartMs + input.placement.startMs
  return {
    id: input.placement.id,
    startPlacementId: input.placement.id,
    endPlacementId: input.placement.id,
    ...(input.placement.logicalClipId ? { logicalClipId: input.placement.logicalClipId } : {}),
    instanceId: input.placement.instanceId,
    patternName: instance?.patternName ?? 'Missing Pattern',
    compiled: Boolean(instance),
    sceneId: input.sceneId,
    startSceneId: input.sceneId,
    endSceneId: input.sceneId,
    zoneId: input.zoneId,
    layerId: input.layerId,
    layerIndex: input.layerIndex,
    kind: input.kind,
    localStartMs: input.placement.startMs,
    startMs,
    endMs: startMs + input.placement.durationMs,
    durationMs: input.placement.durationMs,
    opacity: input.placement.opacity ?? 1,
    effectKinds: (input.placement.effects ?? []).map((effect) => effect.kind),
    ...(input.groupByPlacementId.get(input.placement.id)
      ? { groupOccurrenceId: input.groupByPlacementId.get(input.placement.id) }
      : {}),
    diagnostics: instance ? [] : [`Pattern instance "${input.placement.instanceId}" is missing.`],
  }
}
