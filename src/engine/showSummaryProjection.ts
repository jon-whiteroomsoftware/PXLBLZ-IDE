import type {
  ShowCompositionV1,
  ShowPropertyAnimationTarget,
  ShowRecord,
  ShowTransitionKind,
} from './personalContentRecords'
import { projectShowLayoutIntervals } from './showLayoutIntervals'
import { projectShowTimeline } from './showModel'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

export interface ShowSummaryScene {
  sceneId: string
  name: string
  startMs: number
  endMs: number
  durationMs: number
}

export interface ShowSummaryClip {
  clipId: string
  patternName: string
  instanceId: string
  /** Owner coordinates the clip mutation functions accept. */
  kind: 'main' | 'overlay'
  sceneId: string
  zoneId: string
  layerId: string | null
  startMs: number
  endMs: number
  durationMs: number
  logicalClipId?: string
  effectKinds: string[]
}

export interface ShowSummaryJunction {
  junctionId: string
  kind: ShowTransitionKind
  afterClipId: string
  beforeClipId: string
  startMs: number
  endMs: number
  durationMs: number
  /** True on a Scene-boundary junction; false on a within-Scene cut or transition. */
  boundary: boolean
  /** The endpoint-owned Layer transition id, when one exists; the id resize/reset accept. */
  layerTransitionId: string | null
}

export interface ShowSummaryLayer {
  kind: 'main' | 'overlay'
  layerIndex: number
  clips: ShowSummaryClip[]
  junctions: ShowSummaryJunction[]
}

export interface ShowSummaryGroup {
  occurrenceId: string
  definitionId: string
  name: string
  startMs: number
  endMs: number
}

export interface ShowSummaryZone {
  zoneId: string
  name: string
  color: string
  layers: ShowSummaryLayer[]
  groups: ShowSummaryGroup[]
}

export interface ShowSummaryMarker {
  markerId: string
  timeMs: number
  name?: string
  color?: string
}

export interface ShowSummaryLayout {
  layoutId: string
  name: string
  zoneIds: string[]
}

export interface ShowSummaryLayoutOccurrence {
  intervalId: string
  layoutId: string
  layoutName: string
  startMs: number
  endMs: number
}

export interface ShowSummaryTrack {
  trackId: string
  sceneId: string
  target: ShowPropertyAnimationTarget
  keyframeCount: number
}

export interface ShowSummary {
  showId: string
  name: string
  durationMs: number
  scenes: ShowSummaryScene[]
  zones: ShowSummaryZone[]
  markers: ShowSummaryMarker[]
  layouts: ShowSummaryLayout[]
  layoutOccurrences: ShowSummaryLayoutOccurrence[]
  tracks: ShowSummaryTrack[]
}

/**
 * One compact summary of a Show as the editor presents it, assembled from
 * the existing projections (unified timeline, timeline ranges, Zone Layout
 * occurrences) rather than the raw record. Every id is the id the matching
 * mutation function accepts: clip ids resolve in the clip authoring
 * functions, layer transition ids in the Layer transition authoring
 * functions, marker ids in the timeline marker functions, Zone and Layout
 * ids in the Show model functions. Useful for a command palette,
 * diagnostics, and table-driven tests.
 */
export function projectShowSummary(
  show: ShowRecord,
  composition: ShowCompositionV1,
): ShowSummary {
  const timeline = projectShowTimeline(show)
  const unified = projectShowUnifiedTimeline(show, composition)

  return {
    showId: show.id,
    name: show.name,
    durationMs: unified.durationMs,
    scenes: timeline.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      name: scene.scene.name,
      startMs: scene.startMs,
      endMs: scene.endMs,
      durationMs: scene.endMs - scene.startMs,
    })),
    zones: unified.zones.map((zone) => ({
      zoneId: zone.id,
      name: zone.name,
      color: zone.color,
      layers: zone.layers.map((layer) => ({
        kind: layer.kind,
        layerIndex: layer.layerIndex,
        clips: layer.clips.map((clip) => ({
          clipId: clip.id,
          patternName: clip.patternName,
          instanceId: clip.instanceId,
          kind: clip.kind,
          sceneId: clip.sceneId,
          zoneId: clip.zoneId,
          layerId: clip.layerId,
          startMs: clip.startMs,
          endMs: clip.endMs,
          durationMs: clip.durationMs,
          ...(clip.logicalClipId !== undefined ? { logicalClipId: clip.logicalClipId } : {}),
          effectKinds: [...clip.effectKinds],
        })),
        junctions: layer.junctions.map((junction) => ({
          junctionId: junction.id,
          kind: junction.kind,
          afterClipId: junction.leftClipId,
          beforeClipId: junction.rightClipId,
          startMs: junction.startMs,
          endMs: junction.endMs,
          durationMs: junction.durationMs,
          boundary: Boolean(junction.boundaryTransition),
          layerTransitionId: junction.transition?.id ?? null,
        })),
      })),
      groups: zone.groups.map((group) => ({
        occurrenceId: group.id,
        definitionId: group.definitionId,
        name: group.name,
        startMs: group.startMs,
        endMs: group.endMs,
      })),
    })),
    markers: (composition.markers ?? []).map((marker) => ({
      markerId: marker.id,
      timeMs: marker.timeMs,
      ...(marker.name !== undefined ? { name: marker.name } : {}),
      ...(marker.color !== undefined ? { color: marker.color } : {}),
    })),
    layouts: show.routingLayouts.map((layout) => ({
      layoutId: layout.id,
      name: layout.name,
      zoneIds: layout.logical?.zoneIds ?? layout.zones.map((zone) => zone.zoneId),
    })),
    layoutOccurrences: projectShowLayoutIntervals(show).map((interval) => ({
      intervalId: interval.id,
      layoutId: interval.layoutId,
      layoutName: interval.layoutName,
      startMs: interval.startMs,
      endMs: interval.endMs,
    })),
    tracks: composition.scenes.flatMap((scene) =>
      (scene.propertyTracks ?? []).map((track) => ({
        trackId: track.id,
        sceneId: scene.sceneId,
        target: track.target,
        keyframeCount: track.keyframes.length,
      })),
    ),
  }
}
