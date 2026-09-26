import type {
  ShowBoundaryTransition,
  ShowLayerTransition,
  ShowTransitionKind,
} from './personalContentRecords'

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
  /** Authored Layer name; the first Scene owning this overlay ordinal supplies it. */
  name: string
  kind: 'main' | 'overlay'
  layerIndex: number
  clips: ShowUnifiedTimelineClipProjection[]
  junctions: ShowUnifiedTimelineJunctionProjection[]
}

type ShowVisualBoundaryTransition = Omit<ShowBoundaryTransition, 'kind'> & {
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
