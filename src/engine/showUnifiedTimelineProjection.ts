import type {
  ShowCompositionV1,
  ShowLayerTransition,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowRecord,
  ShowTransitionKind,
} from './personalContentRecords'
import { projectShowTimeline } from './showModel'

export interface ShowUnifiedTimelineClipProjection {
  id: string
  instanceId: string
  patternName: string
  compiled: boolean
  sceneId: string
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
  diagnostics: string[]
}

export interface ShowUnifiedTimelineLayerProjection {
  id: string
  kind: 'main' | 'overlay'
  layerIndex: number
  clips: ShowUnifiedTimelineClipProjection[]
  junctions: ShowUnifiedTimelineJunctionProjection[]
}

export interface ShowUnifiedTimelineJunctionProjection {
  id: string
  kind: ShowTransitionKind
  leftClipId: string
  rightClipId: string
  startMs: number
  endMs: number
  durationMs: number
  transition: ShowLayerTransition | null
}

export interface ShowUnifiedTimelineZoneProjection {
  id: string
  name: string
  color: string
  layers: ShowUnifiedTimelineLayerProjection[]
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
  const instanceById = new Map(composition.patternInstances.map((instance) => [instance.id, instance]))

  return {
    durationMs: timeline.durationMs,
    zones: show.zones.map((zone) => {
      const maximumOverlayCount = composition.scenes.reduce((maximum, sceneComposition) => {
        const zoneComposition = sceneComposition.zones.find((candidate) => candidate.zoneId === zone.id)
        return Math.max(maximum, zoneComposition?.overlays.length ?? 0)
      }, 0)
      const overlayLayers: ShowUnifiedTimelineLayerProjection[] = Array.from(
        { length: maximumOverlayCount },
        (_, layerIndex) => projectLayer({
          id: `${zone.id}:overlay:${layerIndex}`,
          kind: 'overlay',
          layerIndex,
          clips: composition.scenes.flatMap((sceneComposition) => {
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
            }))
          }).sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)),
          transitions: composition.transitions ?? [],
        }),
      )
      const mainLayer = projectLayer({
        id: `${zone.id}:main`,
        kind: 'main',
        layerIndex: maximumOverlayCount,
        clips: composition.scenes.flatMap((sceneComposition) => {
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
          }))
        }).sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)),
        transitions: composition.transitions ?? [],
      })
      return {
        id: zone.id,
        name: zone.name,
        color: zone.color ?? '#38bdf8',
        layers: [...overlayLayers, mainLayer],
      }
    }),
  }
}

function projectLayer(
  layer: Omit<ShowUnifiedTimelineLayerProjection, 'junctions'> & {
    transitions: ShowLayerTransition[]
  },
): ShowUnifiedTimelineLayerProjection {
  const { transitions, ...projection } = layer
  return {
    ...projection,
    junctions: layer.clips.slice(0, -1).flatMap<ShowUnifiedTimelineJunctionProjection>((leftClip, index) => {
      const rightClip = layer.clips[index + 1]
      const transition = transitions.find((candidate) => (
        candidate.fromPlacementId === leftClip.id
        && candidate.toPlacementId === rightClip.id
      ))
      if (transition) {
        if (leftClip.endMs + transition.durationMs !== rightClip.startMs) return []
        return [{
          id: transition.id,
          kind: transition.kind,
          leftClipId: leftClip.id,
          rightClipId: rightClip.id,
          startMs: leftClip.endMs,
          endMs: rightClip.startMs,
          durationMs: transition.durationMs,
          transition,
        }]
      }
      if (leftClip.endMs !== rightClip.startMs) return []
      return [{
        id: `cut:${leftClip.id}:${rightClip.id}`,
        kind: 'cut' as const,
        leftClipId: leftClip.id,
        rightClipId: rightClip.id,
        startMs: rightClip.startMs,
        endMs: rightClip.startMs,
        durationMs: 0,
        transition: null,
      }]
    }),
  }
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
}): ShowUnifiedTimelineClipProjection {
  const instance = input.instanceById.get(input.placement.instanceId)
  const startMs = input.sceneStartMs + input.placement.startMs
  return {
    id: input.placement.id,
    instanceId: input.placement.instanceId,
    patternName: instance?.patternName ?? 'Missing Pattern',
    compiled: Boolean(instance),
    sceneId: input.sceneId,
    zoneId: input.zoneId,
    layerId: input.layerId,
    layerIndex: input.layerIndex,
    kind: input.kind,
    localStartMs: input.placement.startMs,
    startMs,
    endMs: startMs + input.placement.durationMs,
    durationMs: input.placement.durationMs,
    opacity: input.kind === 'overlay' ? (input.placement as ShowOverlayPlacement).opacity : 1,
    effectKinds: (input.placement.effects ?? []).map((effect) => effect.kind),
    diagnostics: instance ? [] : [`Pattern instance "${input.placement.instanceId}" is missing.`],
  }
}
