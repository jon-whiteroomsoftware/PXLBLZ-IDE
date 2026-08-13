import type {
  MapRecord,
  ShowCell,
  ShowCellAdaptations,
  ShowClipEffect,
  ShowBoundaryTransition,
  ShowRecord,
  ShowOutputContract,
  ShowPortalSettings,
  ShowPropertyAnimationTrack,
  ShowRoutingLayout,
  ShowRoutingLayoutZone,
  ShowScene,
  ShowSpatialShape,
  ShowTransitionCost,
  ShowTransitionKind,
  ShowZone,
} from './personalContentRecords'
import type {
  ShowClipAdaptation,
  ShowEffectPropertyRampsRecipe,
  ShowRecipe,
  ShowRoutedScenePlacementRampRecipe,
  ShowRoutingLayoutRecipe,
} from './showCompiler'
import { clampShowRepeatScale } from './showCoordinateRemap'
import { normalizePersistedShowEasing } from './showEasing'
import { normalizeShowTransitionColor } from './showFadeThroughColor'
import { normalizeShowWipeDirection, normalizeShowWipeSettings } from './showWipe'
import {
  normalizeShowDissolveBlockSize,
  normalizeShowDissolveScale,
  normalizeShowDissolveSeed,
  normalizeShowDissolveSoftness,
} from './showDissolve'
import { normalizeShowMotionTransition } from './showMotionTransition'
import { lowerShowCompositionForCompile } from './showCompositionLowering'
import { splitShowCompositionScene } from './showCompositionSplit'
import {
  normalizeShowClipEffects,
  sameShowEffectStructure,
  showEffectOrderConflicts,
  showEffectOrderVariantClipId,
  showEffectAnimatableParameterNames,
  showEffectNumericValue,
  showEffectsAreIdentity,
} from './showEffects'
import { multiSegmentLogicalPlacementIds } from './showClipInvariant'
import { normalizeShowOutputEffects } from './showPreviousRgbFeedback'
import { createInstallationShowOutputContract } from './showOutputContract'
import type { ShowLogicalRouting } from './showLogicalRouting'
import {
  normalizeShowClipTransform,
  compactShowClipTransform,
  showClipTransformEffectTarget,
  type ShowClipTransformProperty,
} from './showClipTransform'
import { partitionShowPatternControls } from './showPatternControlPartition'
import {
  controllerProfileDisplayName,
  type ControllerProfile,
  type ControllerZone,
} from './controllerProfile'
import { resolveShowZonePixelCount } from './showInstallationCoverage'

export interface ShowStripTransitionProjection {
  afterSceneId: string
  kind: ShowTransitionKind
  durationMs: number
  cost: ShowTransitionCost
}

export interface ShowStripBoundaryTransitionProjection extends ShowBoundaryTransition {
  cost: ShowTransitionCost
  layoutName?: string
}

export interface ShowStripCellProjection extends ShowCell {
  sceneIndex: number
  columnStart: number
  columnSpan: number
  rowSpan: number
}

export interface ShowStripRowProjection {
  zoneId: string
  zoneName: string
  nominalPixelCount: number
  pixelCount: number
  color?: string
  cells: ShowStripCellProjection[]
}

export interface ShowStripProjection {
  sceneColumns: ShowScene[]
  transitions: ShowStripTransitionProjection[]
  boundaryTransitions: ShowStripBoundaryTransitionProjection[]
  routingSwitches: Array<{ afterSceneId: string; layoutId: string; layoutName: string }>
  rows: ShowStripRowProjection[]
}

export interface ShowTimelineRange {
  startMs: number
  endMs: number
}

export interface ShowTimelineSceneProjection extends ShowTimelineRange {
  sceneId: string
  scene: ShowScene
}

export interface ShowTimelineTransitionProjection extends ShowStripTransitionProjection, ShowTimelineRange {}
export interface ShowTimelineBoundaryTransitionProjection extends ShowStripBoundaryTransitionProjection, ShowTimelineRange {}

export interface ShowTimelineCellProjection extends ShowStripCellProjection, ShowTimelineRange {}

export interface ShowTimelineRowProjection extends Omit<ShowStripRowProjection, 'cells'> {
  cells: ShowTimelineCellProjection[]
}

export interface ShowTimelineProjection {
  durationMs: number
  scenes: ShowTimelineSceneProjection[]
  transitions: ShowTimelineTransitionProjection[]
  boundaryTransitions: ShowTimelineBoundaryTransitionProjection[]
  routingSwitches: ShowStripProjection['routingSwitches']
  rows: ShowTimelineRowProjection[]
}

export interface ShowCompileRecipeSourceLookup {
  byCellId: Record<string, string>
  /** Composition-only source table keyed by explicit runtime Pattern instance. */
  byPatternInstanceId?: Record<string, string>
  /** Transient lowering identity; never persisted on flat Show cells. */
  instanceIdByCellId?: Record<string, string>
  /** Transient Scene-local stack metadata; never persisted on flat Show cells. */
  compositionLayerByCellId?: Record<string, { stackOrder: number; opacity: number }>
  /** Transient authored placement identity for placement-owned local tracks. */
  compositionPlacementIdByCellId?: Record<string, string>
  /** Transient logical Clip identity for segments spanning authored Scenes. */
  compositionLogicalClipIdByCellId?: Record<string, string>
  /** Full source-Scene tracks plus the derived hold's offset into local time. */
  compositionPropertyTracksBySceneId?: Record<string, {
    localTimeOffsetMs: number
    tracks: ShowPropertyAnimationTrack[]
  }>
  /** Transient owning Zone for a lowered per-Layer Transition. */
  compositionTransitionZoneIdByTransitionId?: Record<string, string>
  controllerZones?: ControllerZone[]
  stageDimension?: 1 | 2 | 3
}

const DEFAULT_ADAPTATIONS: ShowCellAdaptations = {
  mirror: false,
  phase: 0,
  brightness: 1,
  timeScale: 1,
}

const EMPTY_SHOW_PATTERN_ID = '__pxlblz_empty'
const EMPTY_SHOW_PATTERN_SOURCE = 'export function render(index) { rgb(0, 0, 0) }'

export const ZONE_COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#22c55e', '#f43f5e', '#eab308']

export function createDefaultShow(id: string, name: string, updatedAt = Date.now()): ShowRecord {
  const scenes: ShowScene[] = [
    {
      id: 'scene-1',
      name: 'Scene 1',
      durationMs: 30000,
    },
    { id: 'scene-2', name: 'Scene 2', durationMs: 30000 },
  ]
  const zones: ShowZone[] = [{ id: 'zone-1', name: 'main', nominalPixelCount: 60, color: '#38bdf8' }]
  return {
    id,
    name,
    scenes,
    zones,
    cells: scenes.map((scene, index) => ({
      id: `cell-${index + 1}`,
      zoneId: zones[0].id,
      sceneId: scene.id,
      sceneSpan: 1,
      pattern: { kind: 'stock', id: index === 0 ? 'TestPattern1D' : 'CometLoom' },
      patternName: index === 0 ? 'TestPattern1D' : 'CometLoom',
      adaptations: { ...DEFAULT_ADAPTATIONS },
      restartOnEntry: false,
    })),
    routingLayouts: [routingLayoutFromZones('layout-1', 'Default', zones)],
    transitions: [
      {
        id: 'transition-scene-1',
        afterSceneId: 'scene-1',
        kind: 'crossfade',
        durationMs: 2000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'snapshot-live',
      },
    ],
    stageMapId: null,
    outputContract: createInstallationShowOutputContract({
      outputMapId: null,
      pixelCount: zones[0].nominalPixelCount,
    }),
    updatedAt,
  }
}

export function createShowWithOutputContract(
  id: string,
  name: string,
  outputContract: ShowOutputContract,
  updatedAt = Date.now(),
): ShowRecord {
  const base = createDefaultShow(id, name, updatedAt)
  const pixelCount = outputContract.kind === 'installation'
    ? outputContract.pixelCount
    : outputContract.referencePixelCount
  const stageMapId = outputContract.kind === 'installation'
    ? outputContract.outputMapId
    : outputContract.referenceMapId
  const zones = base.zones.map((zone, index) => (
    index === 0 ? { ...zone, nominalPixelCount: clampPixelCount(pixelCount) } : zone
  ))
  const initialLayout = routingLayoutFromZones('layout-1', 'Default', zones)
  return {
    ...base,
    zones,
    routingLayouts: [{
      ...initialLayout,
      ...(outputContract.kind === 'portable-2d'
        ? { logical: { kind: 'single' as const, zoneIds: [zones[0].id] as [string] } }
        : {}),
    }],
    stageMapId,
    outputContract,
  }
}

export function importedStageMapIdForController(
  controller: ControllerProfile,
  maps: MapRecord[],
): string | null {
  const displayName = controllerProfileDisplayName(controller)
  const candidates = maps.filter((map) => {
    const metadata = map.importMetadata
    if (!metadata) return false
    if (controller.deviceId && metadata.deviceId === controller.deviceId) return true
    if (controller.lastSeenIp && metadata.ip === controller.lastSeenIp) return true
    return metadata.controllerName === displayName
      || metadata.controllerName === controller.lastKnownDeviceName
  })
  candidates.sort(
    (a, b) =>
      (b.importMetadata?.importedAt ?? b.updatedAt) -
      (a.importMetadata?.importedAt ?? a.updatedAt),
  )
  return candidates[0]?.id ?? null
}

export function showLoopDurationMs(show: Pick<ShowRecord, 'scenes' | 'transitions' | 'composition'>): number {
  const structuralDurationMs = show.scenes.reduce((sum, scene) => (
    sum
    + Math.max(0, scene.durationMs)
    + Math.max(0, showVisualTransitionAfter(show, scene.id)?.durationMs ?? 0)
  ), 0)
  const explicitDurationMs = show.composition?.durationMs
  return Number.isInteger(explicitDurationMs) && (explicitDurationMs ?? 0) > 0
    ? Math.max(structuralDurationMs, explicitDurationMs!)
    : structuralDurationMs
}

function showSceneHoldDurationMs(show: Pick<ShowRecord, 'scenes'>): number {
  return show.scenes.reduce((sum, scene) => sum + Math.max(0, scene.durationMs), 0)
}

export function projectShowTimeline(show: ShowRecord): ShowTimelineProjection {
  show = normalizeShowTransitionState(show)
  const strip = projectShowStrip(show)
  const sceneRanges = new Map<string, ShowTimelineSceneProjection>()
  const boundaryTimes = new Map<string, number>()
  const transitions: ShowTimelineTransitionProjection[] = []
  let cursorMs = 0

  for (const scene of show.scenes) {
    const startMs = cursorMs
    const endMs = startMs + Math.max(0, scene.durationMs)
    sceneRanges.set(scene.id, { sceneId: scene.id, scene, startMs, endMs })
    boundaryTimes.set(scene.id, endMs)
    cursorMs = endMs

    const transition = showVisualTransitionAfter(show, scene.id)
    const transitionDurationMs = Math.max(0, transition?.durationMs ?? 0)
    if (transition && transitionDurationMs > 0) {
      transitions.push({
        afterSceneId: scene.id,
        kind: transition.kind,
        durationMs: transitionDurationMs,
        cost: transitionCost(transition.kind),
        startMs: cursorMs,
        endMs: cursorMs + transitionDurationMs,
      })
    }
    cursorMs += transitionDurationMs
  }

  return {
    durationMs: cursorMs,
    scenes: show.scenes.map((scene) => sceneRanges.get(scene.id)!),
    transitions,
    boundaryTransitions: strip.boundaryTransitions.map((transition) => {
      const startMs = boundaryTimes.get(transition.afterSceneId) ?? 0
      return {
        ...transition,
        startMs,
        endMs: startMs + transition.durationMs,
      }
    }),
    routingSwitches: strip.routingSwitches,
    rows: strip.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => {
        const startScene = show.scenes[cell.sceneIndex]
        const endScene = show.scenes[Math.min(show.scenes.length - 1, cell.sceneIndex + cell.sceneSpan - 1)]
        const startRange = startScene ? sceneRanges.get(startScene.id) : undefined
        const endRange = endScene ? sceneRanges.get(endScene.id) : undefined
        return {
          ...cell,
          startMs: startRange?.startMs ?? 0,
          endMs: endRange?.endMs ?? startRange?.endMs ?? 0,
        }
      }),
    })),
  }
}

export function projectShowStrip(show: ShowRecord): ShowStripProjection {
  show = normalizeShowTransitionState(show)
  const sceneIndex = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  const layoutById = new Map(show.routingLayouts.map((layout) => [layout.id, layout]))
  return {
    sceneColumns: show.scenes,
    transitions: show.scenes
      .slice(0, -1)
      .map((scene) => {
        const transition = showVisualTransitionAfter(show, scene.id)
        const kind = transition?.kind ?? 'cut'
        return {
          afterSceneId: scene.id,
          kind,
          durationMs: transition?.durationMs ?? 0,
          cost: transitionCost(kind),
        }
      }),
    boundaryTransitions: (show.transitions ?? []).map((transition) => ({
      ...transition,
      cost: transition.kind === 'routing'
        ? transition.durationMs > 0 ? 'cheap' : 'free'
        : transitionCost(transition.kind),
      ...(transition.kind === 'routing' && transition.layoutId
        ? { layoutName: layoutById.get(transition.layoutId)?.name }
        : {}),
    })),
    routingSwitches: show.transitions.flatMap((transition) => {
      if (transition.kind !== 'routing' || !transition.layoutId) return []
      const layout = show.routingLayouts.find((candidate) => candidate.id === transition.layoutId)
      return layout
        ? [{ afterSceneId: transition.afterSceneId, layoutId: transition.layoutId, layoutName: layout.name }]
        : []
    }),
    rows: show.zones.map((zone) => ({
      zoneId: zone.id,
      zoneName: zone.name,
      nominalPixelCount: zone.nominalPixelCount,
      pixelCount: resolveShowZonePixelCount(show, zone.id)?.pixelCount ?? zone.nominalPixelCount,
      color: zone.color,
      cells: show.cells
        .filter((cell) => cell.zoneId === zone.id)
        .map((cell) => {
          const index = sceneIndex.get(cell.sceneId) ?? 0
          return {
            ...cell,
            sceneIndex: index,
            columnStart: sceneToGridColumn(index),
            columnSpan: Math.max(1, cell.sceneSpan * 2 - 1),
            rowSpan: Math.max(1, cell.zoneSpan ?? 1),
          }
        })
        .sort((a, b) => a.sceneIndex - b.sceneIndex),
    })),
  }
}

export function updateShowScene(
  show: ShowRecord,
  sceneId: string,
  changes: Partial<Omit<ShowScene, 'id'>>,
): ShowRecord {
  const minimumDurationMs = minimumShowSceneDurationMs(show, sceneId)
  return {
    ...show,
    scenes: show.scenes.map((scene) => (
      scene.id === sceneId
        ? {
            ...scene,
            ...changes,
            durationMs: Math.max(minimumDurationMs, clampDuration(changes.durationMs ?? scene.durationMs)),
            ...(changes.routingTargets
              ? { routingTargets: { splitPosition: clamp01(changes.routingTargets.splitPosition ?? 0.5) } }
              : {}),
            ...(changes.sampleTargets
              ? { sampleTargets: { repeatScale: clampShowRepeatScale(changes.sampleTargets.repeatScale ?? 1) } }
              : {}),
          }
        : scene
    )),
    updatedAt: Date.now(),
  }
}

/** Earliest legal Scene end without discarding local placements or keyframes. */
export function minimumShowSceneDurationMs(show: ShowRecord, sceneId: string): number {
  const composition = show.composition?.scenes.find((scene) => scene.sceneId === sceneId)
  if (!composition) return 1_000

  let minimumMs = 1_000
  const include = (candidate: number) => {
    if (Number.isFinite(candidate)) minimumMs = Math.max(minimumMs, Math.ceil(candidate))
  }
  for (const zone of composition.zones) {
    for (const placement of zone.main) include(placement.startMs + placement.durationMs)
    for (const layer of zone.overlays) {
      for (const placement of layer.placements) include(placement.startMs + placement.durationMs)
    }
  }
  for (const track of composition.propertyTracks ?? []) {
    for (const keyframe of track.keyframes) include(keyframe.timeMs)
  }
  return minimumMs
}

export function addShowScene(show: ShowRecord): ShowRecord {
  show = normalizeShowTransitionState(show)
  const id = nextEntityId('scene-', show.scenes)
  const previousScene = show.scenes[show.scenes.length - 1]
  const scene: ShowScene = {
    id,
    name: uniqueSceneName(`Scene ${show.scenes.length + 1}`, show.scenes),
    durationMs: 30000,
    ...(previousScene?.routingTargets
      ? { routingTargets: { ...previousScene.routingTargets } }
      : {}),
    ...(previousScene?.sampleTargets
      ? { sampleTargets: { ...previousScene.sampleTargets } }
      : {}),
  }
  const lastSceneIndex = show.scenes.length - 1
  const usedCellIds = new Set(show.cells.map((cell) => cell.id))
  const nextCells = show.zones.map((zone) => {
    const source = cellCoveringScene(show, zone.id, lastSceneIndex)
    const cellId = nextStringId('cell-', usedCellIds)
    usedCellIds.add(cellId)
    return copyCellForScene(source, cellId, zone.id, scene.id, lastSceneIndex)
  })

  return normalizeShowTransitionState({
    ...show,
    scenes: [...show.scenes, scene],
    cells: [...show.cells, ...nextCells],
    transitions: [
      ...(show.transitions ?? []),
      ...(show.scenes[lastSceneIndex]
        ? [{
            id: `transition-${show.scenes[lastSceneIndex].id}`,
            afterSceneId: show.scenes[lastSceneIndex].id,
            kind: 'crossfade' as const,
            durationMs: 2000,
            easing: { curve: 'linear' as const },
            crossfadePolicy: 'snapshot-live' as const,
          }]
        : []),
    ],
    updatedAt: Date.now(),
  })
}

export function duplicateShowScene(show: ShowRecord, sceneId: string): ShowRecord {
  show = normalizeShowTransitionState(show)
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === sceneId)
  if (sceneIndex === -1) return show

  const sourceScene = show.scenes[sceneIndex]
  const duplicateId = nextEntityId('scene-', show.scenes)
  const duplicate: ShowScene = {
    ...sourceScene,
    id: duplicateId,
    name: uniqueSceneName(`${sourceScene.name} copy`, show.scenes),
  }
  const scenes = [
    ...show.scenes.slice(0, sceneIndex),
    sourceScene,
    duplicate,
    ...show.scenes.slice(sceneIndex + 1),
  ]

  const sceneIndexById = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  const usedCellIds = new Set(show.cells.map((cell) => cell.id))
  const cells = show.cells.flatMap((cell) => {
    const start = sceneIndexById.get(cell.sceneId)
    if (start == null) return [cell]
    const end = start + Math.max(1, cell.sceneSpan) - 1
    if (sceneIndex < start || sceneIndex > end) return [cell]
    if (end > sceneIndex) return [{ ...cell, sceneSpan: Math.max(1, cell.sceneSpan) + 1 }]

    const cellId = nextStringId('cell-', usedCellIds)
    usedCellIds.add(cellId)
    const copy = copyCellForScene(cell, cellId, cell.zoneId, duplicateId, sceneIndex + 1)
    return [cell, { ...copy, zoneSpan: cell.zoneSpan, zoneMode: cell.zoneMode }]
  })

  const transitions: ShowBoundaryTransition[] = [
    ...(show.transitions ?? []).map((transition) => (
      transition.afterSceneId === sceneId
        ? {
            ...transition,
            id: `${transition.kind === 'routing' ? 'routing' : 'transition'}-${duplicateId}`,
            afterSceneId: duplicateId,
          }
        : transition
    )),
    {
      id: `transition-${sceneId}`,
      afterSceneId: sceneId,
      kind: 'cut',
      durationMs: 0,
      easing: { curve: 'linear' },
    },
  ]

  return normalizeShowTransitionState({
    ...show,
    scenes,
    cells,
    transitions,
    updatedAt: Math.max(Date.now(), show.updatedAt + 1),
  })
}

/**
 * Split the scene hold containing `atMs`. The operation is atomic: invalid
 * boundaries and transition windows return the original record unchanged.
 */
export function splitShowAtTime(show: ShowRecord, atMs: number): ShowRecord {
  if (!showSplitCapability(show, atMs).enabled) return show
  const target = showSplitTarget(show, atMs)
  if (!target) return show
  show = normalizeShowTransitionState(show)
  const { sceneIndex, leftDurationMs } = target
  const sourceScene = show.scenes[sceneIndex]
  const rightDurationMs = sourceScene.durationMs - leftDurationMs

  const newSceneId = nextEntityId('scene-', show.scenes)
  const destinationScene: ShowScene = {
    ...sourceScene,
    id: newSceneId,
    name: uniqueSceneName(`${sourceScene.name} part 2`, show.scenes),
    durationMs: rightDurationMs,
  }
  const scenes = [
    ...show.scenes.slice(0, sceneIndex),
    { ...sourceScene, durationMs: leftDurationMs },
    destinationScene,
    ...show.scenes.slice(sceneIndex + 1),
  ]

  const sceneIndexById = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  const usedCellIds = new Set(show.cells.map((cell) => cell.id))
  const cells = show.cells.flatMap((cell) => {
    const startIndex = sceneIndexById.get(cell.sceneId)
    if (startIndex == null) return [cell]
    const span = Math.max(1, cell.sceneSpan)
    const endIndex = startIndex + span - 1
    if (sceneIndex < startIndex || sceneIndex > endIndex) return [cell]

    const destinationId = nextStringId('cell-', usedCellIds)
    usedCellIds.add(destinationId)
    const leftSpan = sceneIndex - startIndex + 1
    const rightSpan = endIndex - sceneIndex + 1
    return [
      { ...cell, sceneSpan: leftSpan },
      cloneCellForSplit(cell, destinationId, newSceneId, rightSpan),
    ]
  })

  const transitions: ShowBoundaryTransition[] = [
    ...(show.transitions ?? []).flatMap((transition) => (
      transition.afterSceneId === sourceScene.id
        ? [{
            ...transition,
            id: `${transition.kind === 'routing' ? 'routing' : 'transition'}-${newSceneId}`,
            afterSceneId: newSceneId,
          }]
        : [transition]
    )),
    {
      id: `transition-${sourceScene.id}`,
      afterSceneId: sourceScene.id,
      kind: 'cut',
      durationMs: 0,
      easing: { curve: 'linear' },
    },
  ]
  const composition = show.composition
    ? splitShowCompositionScene(show.composition, {
        sourceSceneId: sourceScene.id,
        destinationSceneId: newSceneId,
        splitMs: leftDurationMs,
        sourceDurationMs: sourceScene.durationMs,
      })
    : undefined
  return normalizeShowTransitionState({
    ...show,
    scenes,
    cells,
    transitions,
    ...(composition ? { composition } : {}),
    updatedAt: Math.max(Date.now(), show.updatedAt + 1),
  })
}

export function canSplitShowAtTime(show: ShowRecord, atMs: number): boolean {
  return showSplitCapability(show, atMs).enabled
}

export type ShowSplitCapability =
  | { enabled: true; code: 'ready'; reason: string }
  | { enabled: false; code: 'scene-edge-margin' | 'no-scene' | 'logical-clip' | 'nonlinear-property-animation'; reason: string }

export function showSplitCapability(show: ShowRecord, atMs: number): ShowSplitCapability {
  if (!Number.isFinite(atMs)) {
    return { enabled: false, code: 'no-scene', reason: 'Move the playhead inside a Clip.' }
  }

  let cursorMs = 0
  for (const scene of show.scenes) {
    const holdEndMs = cursorMs + Math.max(0, scene.durationMs)
    if (cursorMs <= atMs && atMs <= holdEndMs) {
      const leftDurationMs = Math.round(atMs - cursorMs)
      const rightDurationMs = scene.durationMs - leftDurationMs
      if (leftDurationMs < 1000 || rightDurationMs < 1000) {
        return {
          enabled: false,
          code: 'scene-edge-margin',
          reason: 'Leave at least 1.0 s on both sides of the playhead.',
        }
      }
      if (multiSegmentLogicalClipCrosses(show, scene.id, leftDurationMs)) {
        return {
          enabled: false,
          code: 'logical-clip',
          reason: 'This multi-part Clip cannot be split here.',
        }
      }
      if (nonlinearPropertySegmentCrosses(show, scene.id, leftDurationMs)) {
        return {
          enabled: false,
          code: 'nonlinear-property-animation',
          reason: 'Add a keyframe at the playhead or change the crossing segment to Linear before splitting.',
        }
      }
      return { enabled: true, code: 'ready', reason: 'Split at the playhead.' }
    }
    cursorMs = holdEndMs + Math.max(0, showVisualTransitionAfter(show, scene.id)?.durationMs ?? 0)
  }

  return { enabled: false, code: 'no-scene', reason: 'Move the playhead inside a Clip.' }
}

function multiSegmentLogicalClipCrosses(show: ShowRecord, sceneId: string, localTimeMs: number): boolean {
  if (!show.composition) return false
  const logicalPlacementIds = multiSegmentLogicalPlacementIds(show.composition)
  const scene = show.composition.scenes.find((candidate) => candidate.sceneId === sceneId)
  return Boolean(scene?.zones.some((zone) => [
    ...zone.main,
    ...zone.overlays.flatMap((layer) => layer.placements),
  ].some((placement) => (
    logicalPlacementIds.has(placement.id)
    && placement.startMs < localTimeMs
    && placement.startMs + placement.durationMs > localTimeMs
  ))))
}

function nonlinearPropertySegmentCrosses(show: ShowRecord, sceneId: string, localTimeMs: number): boolean {
  const scene = show.composition?.scenes.find((candidate) => candidate.sceneId === sceneId)
  return (scene?.propertyTracks ?? []).some((track) => {
    const keyframes = [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
    return keyframes.slice(0, -1).some((left, index) => {
      const right = keyframes[index + 1]
      if (left.timeMs >= localTimeMs || right.timeMs <= localTimeMs) return false
      if (Math.abs(right.value - left.value) <= 0.000001) return false
      return normalizePersistedShowEasing(left.easing).curve !== 'linear'
    })
  })
}

function showSplitTarget(
  show: ShowRecord,
  atMs: number,
): { sceneIndex: number; leftDurationMs: number } | null {
  if (!Number.isFinite(atMs)) return null
  let cursorMs = 0
  for (const [sceneIndex, scene] of show.scenes.entries()) {
    const holdEndMs = cursorMs + Math.max(0, scene.durationMs)
    if (cursorMs < atMs && atMs < holdEndMs) {
      const leftDurationMs = Math.round(atMs - cursorMs)
      const rightDurationMs = scene.durationMs - leftDurationMs
      return leftDurationMs >= 1000 && rightDurationMs >= 1000
        ? { sceneIndex, leftDurationMs }
        : null
    }
    cursorMs = holdEndMs + Math.max(0, showVisualTransitionAfter(show, scene.id)?.durationMs ?? 0)
  }
  return null
}

export function removeShowScene(show: ShowRecord, sceneId: string): ShowRecord {
  if (show.scenes.length <= 1) return show
  const removedSceneIndex = show.scenes.findIndex((scene) => scene.id === sceneId)
  if (removedSceneIndex === -1) return show
  show = normalizeShowTransitionState(show)

  const remainingScenes = show.scenes.filter((scene) => scene.id !== sceneId)
  const finalSceneId = remainingScenes[remainingScenes.length - 1]?.id
  const sceneIndexById = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  const cells = show.cells.flatMap((cell) => {
    const start = sceneIndexById.get(cell.sceneId)
    if (start == null) return []
    const span = Math.max(1, cell.sceneSpan)
    const end = start + span - 1
    if (cell.sceneId === sceneId) {
      const nextSceneId = show.scenes[removedSceneIndex + 1]?.id
      if (span > 1 && nextSceneId) return [{ ...cell, sceneId: nextSceneId, sceneSpan: span - 1 }]
      return []
    }
    if (start < removedSceneIndex && removedSceneIndex <= end) {
      return [{ ...cell, sceneSpan: Math.max(1, span - 1) }]
    }
    return [cell]
  })

  return normalizeShowTransitionState({
    ...show,
    scenes: remainingScenes,
    cells,
    transitions: show.transitions.filter((transition) => (
      transition.afterSceneId !== sceneId && transition.afterSceneId !== finalSceneId
    )),
    updatedAt: Date.now(),
  })
}

export function removeShowClip(show: ShowRecord, clipId: string): ShowRecord {
  if (!show.cells.some((cell) => cell.id === clipId)) return show
  if (show.cells.length <= 1) return show
  const omitClipStart = <T extends { fromByCellId: Record<string, number> }>(transition: T): T => {
    const fromByCellId = { ...transition.fromByCellId }
    delete fromByCellId[clipId]
    return { ...transition, fromByCellId }
  }

  return {
    ...show,
    cells: show.cells.filter((cell) => cell.id !== clipId),
    transitions: show.transitions?.map((transition) => {
      const propertyTransitions = transition.propertyTransitions
      if (!propertyTransitions) return transition
      return {
        ...transition,
        propertyTransitions: {
          ...propertyTransitions,
          ...(propertyTransitions.timeScale ? { timeScale: omitClipStart(propertyTransitions.timeScale) } : {}),
          ...(propertyTransitions.brightness ? { brightness: omitClipStart(propertyTransitions.brightness) } : {}),
          ...(propertyTransitions.controls
            ? {
                controls: Object.fromEntries(Object.entries(propertyTransitions.controls).map(([name, descriptor]) => (
                  [name, omitClipStart(descriptor)]
                ))),
              }
            : {}),
          ...(propertyTransitions.transform
            ? {
                transform: Object.fromEntries(Object.entries(propertyTransitions.transform).map(([property, descriptor]) => (
                  [property, omitClipStart(descriptor)]
                ))),
              }
            : {}),
        },
      }
    }),
    updatedAt: Date.now(),
  }
}

export function showCellAtSlot(
  show: ShowRecord,
  zoneId: string,
  sceneId: string,
): ShowCell | undefined {
  const zoneIndex = show.zones.findIndex((zone) => zone.id === zoneId)
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === sceneId)
  if (zoneIndex === -1 || sceneIndex === -1) return undefined

  return show.cells.find((cell) => {
    const cellZoneIndex = show.zones.findIndex((zone) => zone.id === cell.zoneId)
    const cellSceneIndex = show.scenes.findIndex((scene) => scene.id === cell.sceneId)
    if (cellZoneIndex === -1 || cellSceneIndex === -1) return false
    return zoneIndex >= cellZoneIndex
      && zoneIndex < cellZoneIndex + Math.max(1, cell.zoneSpan ?? 1)
      && sceneIndex >= cellSceneIndex
      && sceneIndex < cellSceneIndex + Math.max(1, cell.sceneSpan)
  })
}

export function placeShowClip(
  show: ShowRecord,
  zoneId: string,
  sceneId: string,
  patch: Pick<ShowCell, 'pattern' | 'patternName'>,
): ShowRecord {
  if (showCellAtSlot(show, zoneId, sceneId)) return show
  if (!show.zones.some((zone) => zone.id === zoneId)) return show
  if (!show.scenes.some((scene) => scene.id === sceneId)) return show

  const cell: ShowCell = {
    id: nextEntityId('cell-', show.cells),
    zoneId,
    sceneId,
    sceneSpan: 1,
    zoneSpan: 1,
    ...patch,
    adaptations: { ...DEFAULT_ADAPTATIONS },
    restartOnEntry: false,
  }
  return {
    ...show,
    cells: [...show.cells, cell],
    updatedAt: Math.max(Date.now(), show.updatedAt + 1),
  }
}

/**
 * Clone one independently editable, single-slot clip immediately after itself.
 * An empty following slot is reused. Otherwise a Scene is inserted so later
 * global time ripples without replacing another Clip. Held and multi-zone Clips
 * remain unsupported because their ownership cannot be split implicitly.
 */
export function cloneShowCellAfter(show: ShowRecord, cellId: string): ShowRecord {
  const source = show.cells.find((cell) => cell.id === cellId)
  if (!source || Math.max(1, source.sceneSpan) !== 1 || Math.max(1, source.zoneSpan ?? 1) !== 1) return show
  const sourceSceneIndex = show.scenes.findIndex((scene) => scene.id === source.sceneId)
  const destinationScene = show.scenes[sourceSceneIndex + 1]
  if (sourceSceneIndex < 0) return show

  if (!destinationScene || showCellAtSlot(show, source.zoneId, destinationScene.id)) {
    const originalCellIds = new Set(show.cells.map((cell) => cell.id))
    const duplicated = duplicateShowScene(show, source.sceneId)
    const insertedScene = duplicated.scenes[sourceSceneIndex + 1]
    if (!insertedScene) return show
    return {
      ...duplicated,
      cells: [
        ...duplicated.cells.filter((cell) => originalCellIds.has(cell.id)),
        cloneShowCellIntoScene(duplicated, source, insertedScene.id),
      ],
    }
  }

  const copy = cloneShowCellIntoScene(show, source, destinationScene.id)
  return {
    ...show,
    cells: [...show.cells, copy],
    updatedAt: Math.max(Date.now(), show.updatedAt + 1),
  }
}

function cloneShowCellIntoScene(show: ShowRecord, source: ShowCell, sceneId: string): ShowCell {
  const usedEffectIds = new Set(show.cells.flatMap((cell) => (cell.effects ?? []).map((effect) => effect.id)))
  const effects = source.effects?.map((effect) => {
    const id = nextStringId('effect-', usedEffectIds)
    usedEffectIds.add(id)
    return { ...effect, id } as ShowClipEffect
  })
  const copy: ShowCell = {
    ...source,
    id: nextEntityId('cell-', show.cells),
    sceneId,
    sceneSpan: 1,
    zoneSpan: 1,
    pattern: { ...source.pattern },
    adaptations: cloneShowCellAdaptations(source.adaptations),
    ...(source.controlTargets ? { controlTargets: { ...source.controlTargets } } : {}),
    ...(source.transform ? { transform: { ...source.transform } } : {}),
    ...(effects ? { effects } : {}),
  }
  return copy
}

/** Move one simple clip to an explicit empty Scene slot without changing Zone ownership. */
export function moveShowCellToSlot(
  show: ShowRecord,
  cellId: string,
  zoneId: string,
  sceneId: string,
): ShowRecord {
  const source = show.cells.find((cell) => cell.id === cellId)
  if (!source || Math.max(1, source.sceneSpan) !== 1 || Math.max(1, source.zoneSpan ?? 1) !== 1) return show
  if (source.zoneId !== zoneId || source.sceneId === sceneId) return show
  if (!show.scenes.some((scene) => scene.id === sceneId)) return show
  if (showCellAtSlot(show, zoneId, sceneId)) return show
  return {
    ...show,
    cells: show.cells.map((cell) => cell.id === cellId ? { ...cell, sceneId } : cell),
    updatedAt: Math.max(Date.now(), show.updatedAt + 1),
  }
}

export function updateShowCellAdaptations(
  show: ShowRecord,
  cellId: string,
  changes: Partial<ShowCellAdaptations>,
): ShowRecord {
  return {
    ...show,
    cells: show.cells.map((cell) => (
      cell.id === cellId
        ? { ...cell, adaptations: normalizeAdaptations({ ...cell.adaptations, ...changes }) }
        : cell
    )),
    updatedAt: Date.now(),
  }
}

export function updateShowCellEffects(show: ShowRecord, cellId: string, effects: ShowClipEffect[]): ShowRecord {
  return {
    ...show,
    cells: show.cells.map((cell) => cell.id === cellId
      ? { ...cell, effects: normalizeShowClipEffects(effects) }
      : cell),
    updatedAt: Date.now(),
  }
}

export function addShowCellEffect(show: ShowRecord, cellId: string, effect: ShowClipEffect): ShowRecord {
  const cell = show.cells.find((candidate) => candidate.id === cellId)
  if (!cell) return show
  return updateShowCellEffects(show, cellId, [...(cell.effects ?? []), effect])
}

export function updateShowCellEffect(
  show: ShowRecord,
  cellId: string,
  effectId: string,
  changes: Partial<ShowClipEffect>,
): ShowRecord {
  const cell = show.cells.find((candidate) => candidate.id === cellId)
  if (!cell?.effects?.some((effect) => effect.id === effectId)) return show
  return updateShowCellEffects(show, cellId, cell.effects.map((effect) => (
    effect.id === effectId ? { ...effect, ...changes, id: effect.id } as ShowClipEffect : effect
  )))
}

export function removeShowCellEffect(show: ShowRecord, cellId: string, effectId: string): ShowRecord {
  const cell = show.cells.find((candidate) => candidate.id === cellId)
  if (!cell?.effects?.some((effect) => effect.id === effectId)) return show
  return updateShowCellEffects(show, cellId, cell.effects.filter((effect) => effect.id !== effectId))
}

export function moveShowCellEffect(show: ShowRecord, cellId: string, effectId: string, toIndex: number): ShowRecord {
  const cell = show.cells.find((candidate) => candidate.id === cellId)
  const effects = normalizeShowClipEffects(cell?.effects)
  const fromIndex = effects.findIndex((effect) => effect.id === effectId)
  if (fromIndex < 0) return show
  const [effect] = effects.splice(fromIndex, 1)
  effects.splice(Math.max(0, Math.min(effects.length, Math.round(toIndex))), 0, effect)
  return updateShowCellEffects(show, cellId, effects)
}

export function updateShowCellControlTarget(
  show: ShowRecord,
  cellId: string,
  exportName: string,
  value: number | undefined,
): ShowRecord {
  return {
    ...show,
    cells: show.cells.map((cell) => {
      if (cell.id !== cellId) return cell
      const controlTargets = { ...(cell.controlTargets ?? {}) }
      if (value === undefined) delete controlTargets[exportName]
      else controlTargets[exportName] = clamp01(value)
      return { ...cell, ...(Object.keys(controlTargets).length > 0 ? { controlTargets } : { controlTargets: undefined }) }
    }),
    updatedAt: Date.now(),
  }
}

export function updateShowCellRestartOnEntry(
  show: ShowRecord,
  cellId: string,
  restartOnEntry: boolean,
): ShowRecord {
  return {
    ...show,
    cells: show.cells.map((cell) => (
      cell.id === cellId ? { ...cell, restartOnEntry: Boolean(restartOnEntry) } : cell
    )),
    updatedAt: Date.now(),
  }
}

export function extendShowCell(show: ShowRecord, cellId: string, sceneSpan: number): ShowRecord {
  const target = show.cells.find((cell) => cell.id === cellId)
  if (!target) return show
  const targetSceneIndex = show.scenes.findIndex((scene) => scene.id === target.sceneId)
  const targetZoneIndex = show.zones.findIndex((zone) => zone.id === target.zoneId)
  if (targetSceneIndex === -1 || targetZoneIndex === -1) return show
  const nextSpan = Math.max(1, Math.min(sceneSpan, show.scenes.length - targetSceneIndex))
  return {
    ...show,
    cells: show.cells
      .filter((cell) => cell.id === cellId || !showCellIntersects(
        show,
        cell,
        targetZoneIndex,
        Math.max(1, target.zoneSpan ?? 1),
        targetSceneIndex,
        nextSpan,
      ))
      .map((cell) => cell.id === cellId ? { ...cell, sceneSpan: nextSpan } : cell),
    updatedAt: Date.now(),
  }
}

export function spanShowCellZones(show: ShowRecord, cellId: string, zoneSpan: number): ShowRecord {
  const target = show.cells.find((cell) => cell.id === cellId)
  if (!target) return show
  const targetZoneIndex = show.zones.findIndex((zone) => zone.id === target.zoneId)
  const targetSceneIndex = show.scenes.findIndex((scene) => scene.id === target.sceneId)
  if (targetZoneIndex === -1 || targetSceneIndex === -1) return show
  const nextSpan = Math.max(1, Math.min(zoneSpan, show.zones.length - targetZoneIndex))
  return {
    ...show,
    cells: show.cells
      .filter((cell) => cell.id === cellId || !showCellIntersects(
        show,
        cell,
        targetZoneIndex,
        nextSpan,
        targetSceneIndex,
        Math.max(1, target.sceneSpan),
      ))
      .map((cell) => cell.id === cellId
        ? { ...cell, zoneSpan: nextSpan, ...(nextSpan > 1 ? { zoneMode: cell.zoneMode ?? 'span' as const } : { zoneMode: undefined }) }
        : cell),
    updatedAt: Date.now(),
  }
}

function showCellIntersects(
  show: ShowRecord,
  cell: ShowCell,
  zoneStart: number,
  zoneSpan: number,
  sceneStart: number,
  sceneSpan: number,
): boolean {
  const cellZoneStart = show.zones.findIndex((zone) => zone.id === cell.zoneId)
  const cellSceneStart = show.scenes.findIndex((scene) => scene.id === cell.sceneId)
  if (cellZoneStart === -1 || cellSceneStart === -1) return false
  return cellZoneStart < zoneStart + zoneSpan
    && zoneStart < cellZoneStart + Math.max(1, cell.zoneSpan ?? 1)
    && cellSceneStart < sceneStart + sceneSpan
    && sceneStart < cellSceneStart + Math.max(1, cell.sceneSpan)
}

export function updateShowCellZoneMode(
  show: ShowRecord,
  cellId: string,
  zoneMode: NonNullable<ShowCell['zoneMode']>,
): ShowRecord {
  return {
    ...show,
    cells: show.cells.map((cell) => cell.id === cellId && (cell.zoneSpan ?? 1) > 1
      ? { ...cell, zoneMode: zoneMode === 'repeat' ? 'repeat' : 'span' }
      : cell),
    updatedAt: Date.now(),
  }
}

export function updateShowCellPattern(
  show: ShowRecord,
  cellId: string,
  patch: Pick<ShowCell, 'pattern' | 'patternName'>,
  exportedSliderNames: ReadonlySet<string> = new Set(),
): ShowRecord {
  return {
    ...show,
    cells: show.cells.map((cell) => {
      if (cell.id !== cellId) return cell
      const changesPattern = cell.pattern.kind !== patch.pattern.kind || cell.pattern.id !== patch.pattern.id
      const controlTargets = changesPattern
        ? partitionShowPatternControls(cell.id, cell.controlTargets, undefined, exportedSliderNames).keptControlTargets
        : cell.controlTargets
      return { ...cell, ...patch, controlTargets }
    }),
    updatedAt: Date.now(),
  }
}

export function addShowZone(
  show: ShowRecord,
  seed: Partial<Pick<ShowZone, 'name' | 'nominalPixelCount' | 'color' | 'icon'>> = {},
): ShowRecord {
  const id = nextEntityId('zone-', show.zones)
  const zone: ShowZone = {
    id,
    name: uniqueZoneName(seed.name ?? `zone-${show.zones.length + 1}`, show.zones),
    nominalPixelCount: clampPixelCount(seed.nominalPixelCount ?? 60),
    color: seed.color ?? ZONE_COLORS[show.zones.length % ZONE_COLORS.length],
    ...(seed.icon ? { icon: seed.icon } : {}),
  }
  const next = {
    ...show,
    zones: [...show.zones, zone],
    cells: show.cells,
    ...(show.composition ? {
      composition: {
        ...show.composition,
        scenes: show.composition.scenes.map((scene) => ({
          ...scene,
          zones: [...scene.zones, { zoneId: zone.id, main: [], overlays: [] }],
        })),
      },
    } : {}),
    updatedAt: Date.now(),
  }
  return {
    ...next,
    routingLayouts: next.routingLayouts.map((layout) => appendZoneToLayout(layout, zone)),
  }
}

export function updateShowZone(
  show: ShowRecord,
  zoneId: string,
  changes: Partial<Omit<ShowZone, 'id'>>,
): ShowRecord {
  return {
    ...show,
    zones: show.zones.map((zone) => (
      zone.id === zoneId
        ? {
            ...zone,
            ...changes,
            name: changes.name ?? zone.name,
            nominalPixelCount: clampPixelCount(changes.nominalPixelCount ?? zone.nominalPixelCount),
          }
        : zone
    )),
    updatedAt: Date.now(),
  }
}

export function removeShowZone(show: ShowRecord, zoneId: string): ShowRecord {
  if (show.zones.length <= 1) return show
  const removedZoneIndex = show.zones.findIndex((zone) => zone.id === zoneId)
  if (removedZoneIndex === -1) return show
  const zoneIndexById = new Map(show.zones.map((zone, index) => [zone.id, index]))
  const cells = show.cells.flatMap((cell) => {
    const start = zoneIndexById.get(cell.zoneId)
    if (start == null) return []
    const span = Math.max(1, cell.zoneSpan ?? 1)
    const end = start + span - 1
    if (cell.zoneId === zoneId) {
      const nextZoneId = show.zones[removedZoneIndex + 1]?.id
      if (span > 1 && nextZoneId) return [{
        ...cell,
        zoneId: nextZoneId,
        zoneSpan: span - 1,
        zoneMode: span - 1 > 1 ? cell.zoneMode ?? 'span' : undefined,
      }]
      return []
    }
    if (start < removedZoneIndex && removedZoneIndex <= end) {
      return [{
        ...cell,
        zoneSpan: span - 1,
        zoneMode: span - 1 > 1 ? cell.zoneMode ?? 'span' : undefined,
      }]
    }
    return [cell]
  })
  const removedPlacementIds = new Set(show.composition?.scenes.flatMap((scene) => {
    const zone = scene.zones.find((candidate) => candidate.zoneId === zoneId)
    return zone
      ? [...zone.main.map((placement) => placement.id), ...zone.overlays.flatMap((layer) => layer.placements.map((placement) => placement.id))]
      : []
  }) ?? [])
  return {
    ...show,
    zones: show.zones.filter((zone) => zone.id !== zoneId),
    cells,
    routingLayouts: show.routingLayouts.map((layout) => ({
      ...layout,
      zones: layout.zones.filter((zone) => zone.zoneId !== zoneId),
      logical: layout.logical?.zoneIds.includes(zoneId) ? undefined : layout.logical,
    })),
    ...(show.composition ? {
      composition: {
        ...show.composition,
        scenes: show.composition.scenes.map((scene) => {
          const propertyTracks = (scene.propertyTracks ?? []).filter((track) => (
            !('placementId' in track.target) || !removedPlacementIds.has(track.target.placementId)
          ))
          return {
            ...scene,
            zones: scene.zones.filter((zone) => zone.zoneId !== zoneId),
            ...(propertyTracks.length > 0 ? { propertyTracks } : { propertyTracks: undefined }),
          }
        }),
      },
    } : {}),
    updatedAt: Date.now(),
  }
}

export function normalizeShowRoutingState(show: ShowRecord): ShowRecord {
  const layouts = Array.isArray(show.routingLayouts) && show.routingLayouts.length > 0
    ? show.routingLayouts.map(normalizeRoutingLayout)
    : [routingLayoutFromZones('layout-1', 'Default', show.zones)]
  const layoutIds = new Set(layouts.map((layout) => layout.id))
  return {
    ...show,
    routingLayouts: layouts,
    transitions: show.transitions.filter((transition) => (
      transition.kind !== 'routing' || Boolean(transition.layoutId && layoutIds.has(transition.layoutId))
    )),
  }
}

export function normalizeShowTransitionState(show: ShowRecord): ShowRecord {
  const boundarySceneIds = show.scenes.slice(0, -1).map((scene) => scene.id)
  const boundarySceneIdSet = new Set(boundarySceneIds)
  const normalized = show.transitions
    .filter((transition) => boundarySceneIdSet.has(transition.afterSceneId))
    .map(normalizeBoundaryTransition)
  const visualByScene = new Map(
    normalized.filter((transition) => transition.kind !== 'routing').map((transition) => [transition.afterSceneId, transition]),
  )
  for (const afterSceneId of boundarySceneIds) {
    if (!visualByScene.has(afterSceneId)) {
      const cut: ShowBoundaryTransition = {
        id: `transition-${afterSceneId}`,
        afterSceneId,
        kind: 'cut',
        durationMs: 0,
        easing: { curve: 'linear' },
      }
      normalized.push(cut)
      visualByScene.set(afterSceneId, cut)
    }
  }
  const sceneOrder = new Map(boundarySceneIds.map((sceneId, index) => [sceneId, index]))
  normalized.sort((a, b) => (
    (sceneOrder.get(a.afterSceneId) ?? 0) - (sceneOrder.get(b.afterSceneId) ?? 0)
    || Number(a.kind === 'routing') - Number(b.kind === 'routing')
    || a.id.localeCompare(b.id)
  ))

  return {
    ...show,
    transitions: normalized,
    cells: show.cells.map((cell) => {
      const { transform: authoredTransform, ...rest } = cell
      const transform = compactShowClipTransform(authoredTransform)
      return {
        ...rest,
        ...(transform ? { transform } : {}),
        ...(cell.effects ? { effects: normalizeShowClipEffects(cell.effects) } : {}),
      }
    }),
    scenes: show.scenes.map((scene) => (
      {
        id: scene.id,
        name: scene.name,
        durationMs: scene.durationMs,
        ...(scene.routingTargets
          ? { routingTargets: { splitPosition: clamp01(scene.routingTargets.splitPosition ?? 0.5) } }
          : {}),
        ...(scene.sampleTargets
          ? { sampleTargets: { repeatScale: clampShowRepeatScale(scene.sampleTargets.repeatScale ?? 1) } }
          : {}),
      }
    )),
  }
}

export function showVisualTransitionAfter(
  show: Pick<ShowRecord, 'transitions'>,
  sceneId: string,
): (ShowBoundaryTransition & { kind: ShowTransitionKind }) | undefined {
  return show.transitions.find((transition) => (
    transition.afterSceneId === sceneId && transition.kind !== 'routing'
  )) as (ShowBoundaryTransition & { kind: ShowTransitionKind }) | undefined
}

export function showRoutingTransitionAfter(
  show: Pick<ShowRecord, 'transitions'>,
  sceneId: string,
): ShowBoundaryTransition | undefined {
  return show.transitions.find((transition) => (
    transition.afterSceneId === sceneId && transition.kind === 'routing'
  ))
}

function normalizeBoundaryTransition(transition: ShowBoundaryTransition): ShowBoundaryTransition {
  // A zero-duration visual transition IS a Cut: the compiler requires
  // positive durations for non-Cut kinds, and deleting a visual Transition
  // already persists as a cut record. Normalizing the kind keeps the
  // floor-free duration model (#823) compilable end to end.
  const kind = transition.kind !== 'cut' && transition.kind !== 'routing'
    && clampTransitionDuration(transition.durationMs) <= 0
    ? 'cut'
    : transition.kind
  const base: ShowBoundaryTransition = {
    id: transition.id || `${kind === 'routing' ? 'routing' : 'transition'}-${transition.afterSceneId}`,
    afterSceneId: transition.afterSceneId,
    kind,
    durationMs: kind === 'cut'
      ? 0
      : kind === 'routing' && transition.durationMs <= 0
        ? 0
        : clampTransitionDuration(transition.durationMs),
    easing: normalizePersistedShowEasing(transition.easing),
    ...(kind === 'cut' || kind === 'routing' ? {} : normalizePropertyTransitions(transition)),
  }
  if (kind === 'routing') {
    return {
      ...base,
      layoutId: transition.layoutId,
      ...(transition.routingDirection
        ? { routingDirection: transition.routingDirection === 'reverse' ? 'reverse' as const : 'forward' as const }
        : {}),
    }
  }
  if (kind === 'crossfade') {
    return {
      ...base,
      crossfadePolicy: transition.crossfadePolicy === 'snapshot-live' ? 'snapshot-live' : 'live-live',
    }
  }
  if (kind === 'wipe') {
    const settings = normalizeShowWipeSettings(transition)
    const variantSettings = normalizeWipeVariantSettings(settings)
    const canonicalSettings = settings.wipeVariant === 'linear' && transition.direction === undefined
      ? { wipeVariant: 'linear' as const }
      : variantSettings
    return {
      ...base,
      feather: clamp01(transition.feather ?? 0),
      ...canonicalSettings,
      ...(transition.edgePolicy === 'hard' || transition.edgePolicy === 'dither' || transition.edgePolicy === 'blend'
        ? { edgePolicy: transition.edgePolicy }
        : {}),
    }
  }
  if (kind === 'fade-color') return { ...base, color: normalizeShowTransitionColor(transition.color) }
  if (kind === 'dither') {
    const variant = transition.dissolveVariant === 'block'
      ? 'block' as const
      : transition.dissolveVariant === 'pixel'
        ? 'pixel' as const
        : transition.dissolveVariant === 'coherent-noise'
          ? 'coherent-noise' as const
          : transition.dissolveVariant === 'soft-threshold'
            ? 'soft-threshold' as const
        : 'pixel' as const
    return {
      ...base,
      dissolveVariant: variant,
      ...(transition.seed === undefined ? {} : { seed: normalizeShowDissolveSeed(transition.seed) }),
      ...(variant === 'block'
        ? { blockSize: normalizeShowDissolveBlockSize(transition.blockSize ?? 8) }
        : {}),
      ...(variant === 'coherent-noise' || variant === 'soft-threshold'
        ? { scale: normalizeShowDissolveScale(transition.scale ?? 6) }
        : {}),
      ...(variant === 'soft-threshold'
        ? { softness: normalizeShowDissolveSoftness(transition.softness ?? 0.15) }
        : {}),
      ...(variant === 'soft-threshold'
        ? transition.edgePolicy === 'hard' || transition.edgePolicy === 'dither' || transition.edgePolicy === 'blend'
          ? { edgePolicy: transition.edgePolicy }
          : { edgePolicy: 'dither' as const }
        : transition.edgePolicy === 'dither' || transition.edgePolicy === 'hard'
          ? { edgePolicy: transition.edgePolicy }
          : {}),
    }
  }
  if (kind === 'portal') {
    const revealMode = transition.revealMode === 'grow-incoming' || transition.revealMode === 'shrink-outgoing'
      ? transition.revealMode
      : 'grow-incoming' as const
    const explicitEdgePolicy = transition.edgePolicy === 'hard' || transition.edgePolicy === 'dither' || transition.edgePolicy === 'blend'
      ? transition.edgePolicy
      : undefined
    return {
      ...base,
      feather: clamp01(transition.feather ?? 0.12),
      centerX: clamp01(transition.centerX ?? 0.5),
      centerY: clamp01(transition.centerY ?? 0.5),
      featherPolicy: transition.featherPolicy === 'blend' ? 'blend' : 'dither',
      revealMode,
      ...(explicitEdgePolicy ? { edgePolicy: explicitEdgePolicy } : {}),
      ...normalizeSpatialShapeSettings(transition),
    }
  }
  if (kind === 'motion') {
    const motion = normalizeShowMotionTransition(transition)
    return { ...base, ...motion }
  }
  return base
}

function normalizePropertyTransitions(transition: ShowBoundaryTransition): Pick<ShowBoundaryTransition, 'propertyTransitions'> {
  const normalizeProperty = (
    property: 'timeScale' | 'brightness',
    clamp: (value: number) => number,
  ) => {
    const source = transition.propertyTransitions?.[property]
    if (!source) return undefined
    return {
      fromByCellId: Object.fromEntries(Object.entries(source.fromByCellId ?? {}).map(([cellId, value]) => [cellId, clamp(value)])),
      durationMs: Math.min(clampPropertyDuration(source.durationMs ?? transition.durationMs), clampTransitionDuration(transition.durationMs)),
      easing: normalizeEasing(source.easing ?? transition.easing),
    }
  }
  const timeScale = normalizeProperty('timeScale', clampTimeScale)
  const brightness = normalizeProperty('brightness', clamp01)
  const controls = Object.fromEntries(Object.entries(transition.propertyTransitions?.controls ?? {}).map(([exportName, source]) => {
    const normalized = {
      fromByCellId: Object.fromEntries(Object.entries(source.fromByCellId ?? {}).map(([cellId, value]) => [cellId, clamp01(value)])),
      durationMs: Math.min(clampPropertyDuration(source.durationMs ?? transition.durationMs), clampTransitionDuration(transition.durationMs)),
      easing: normalizeEasing(source.easing ?? transition.easing),
    }
    return [exportName, normalized]
  }))
  const transform = Object.fromEntries(([
    'positionX', 'positionY', 'rotation', 'scaleX', 'scaleY',
  ] as const).flatMap((property) => {
    const source = transition.propertyTransitions?.transform?.[property]
    if (!source) return []
    const [min, max] = property === 'positionX' || property === 'positionY'
      ? [-4, 4]
      : property === 'rotation' ? [-8, 8] : [0.01, 8]
    return [[property, {
      fromByCellId: Object.fromEntries(Object.entries(source.fromByCellId ?? {}).map(([cellId, value]) => (
        [cellId, clampRange(value, min, max)]
      ))),
      durationMs: Math.min(clampPropertyDuration(source.durationMs ?? transition.durationMs), clampTransitionDuration(transition.durationMs)),
      easing: normalizeEasing(source.easing ?? transition.easing),
    }]]
  }))
  const splitPositionSource = transition.propertyTransitions?.routing?.splitPosition
  const splitPosition = splitPositionSource
    ? {
        from: clamp01(splitPositionSource.from),
        durationMs: Math.min(
          clampPropertyDuration(splitPositionSource.durationMs ?? transition.durationMs),
          clampTransitionDuration(transition.durationMs),
        ),
        easing: normalizeEasing(splitPositionSource.easing ?? transition.easing),
    }
    : undefined
  const repeatScaleSource = transition.propertyTransitions?.sample?.repeatScale
  const repeatScale = repeatScaleSource
    ? {
        from: clampShowRepeatScale(repeatScaleSource.from),
        durationMs: Math.min(
          clampPropertyDuration(repeatScaleSource.durationMs ?? transition.durationMs),
          clampTransitionDuration(transition.durationMs),
        ),
        easing: normalizeEasing(repeatScaleSource.easing ?? transition.easing),
      }
    : undefined
  const effects = Object.fromEntries(Object.entries(transition.propertyTransitions?.effects ?? {}).flatMap(([effectId, parameters]) => {
    const normalizedParameters = Object.fromEntries(Object.entries(parameters).flatMap(([parameter, source]) => {
      if (!source) return []
      return [[parameter, {
        fromByCellId: Object.fromEntries(Object.entries(source.fromByCellId ?? {}).map(([cellId, value]) => (
          [cellId, clampRange(value, -8, 8)]
        ))),
        durationMs: Math.min(
          clampPropertyDuration(source.durationMs ?? transition.durationMs),
          clampTransitionDuration(transition.durationMs),
        ),
        easing: normalizeEasing(source.easing ?? transition.easing),
      }]]
    }))
    return Object.keys(normalizedParameters).length > 0 ? [[effectId, normalizedParameters]] : []
  }))
  return timeScale || brightness || Object.keys(controls).length > 0 || Object.keys(transform).length > 0 || splitPosition || repeatScale || Object.keys(effects).length > 0
    ? {
        propertyTransitions: {
          ...(timeScale ? { timeScale } : {}),
          ...(brightness ? { brightness } : {}),
          ...(Object.keys(controls).length > 0 ? { controls } : {}),
          ...(Object.keys(transform).length > 0 ? { transform } : {}),
          ...(splitPosition ? { routing: { splitPosition } } : {}),
          ...(repeatScale ? { sample: { repeatScale } } : {}),
          ...(Object.keys(effects).length > 0 ? { effects } : {}),
        },
      }
    : {}
}

function normalizeWipeVariantSettings(
  settings: ReturnType<typeof normalizeShowWipeSettings>,
): Partial<Pick<
  ShowBoundaryTransition,
  'wipeVariant' | 'direction' | 'wipeMode' | 'orientation' | 'count' | 'centerX' | 'centerY' | 'phase' | 'clockwise'
>> {
  if (settings.wipeVariant === 'linear') {
    return { wipeVariant: 'linear', direction: settings.direction }
  }
  if (settings.wipeVariant === 'split') {
    return { wipeVariant: 'split', wipeMode: settings.wipeMode, orientation: settings.orientation }
  }
  if (settings.wipeVariant === 'barn-doors') {
    return {
      wipeVariant: 'barn-doors', wipeMode: settings.wipeMode,
      centerX: settings.centerX, centerY: settings.centerY,
    }
  }
  if (settings.wipeVariant === 'blinds') {
    return {
      wipeVariant: 'blinds', orientation: settings.orientation,
      count: settings.count, phase: settings.phase,
    }
  }
  if (settings.wipeVariant === 'clock') {
    return {
      wipeVariant: 'clock', centerX: settings.centerX, centerY: settings.centerY,
      phase: settings.phase, clockwise: settings.clockwise,
    }
  }
  return { wipeVariant: settings.wipeVariant, count: settings.count }
}

function showWipeRequires2D(transition: Pick<ShowBoundaryTransition, 'direction' | 'wipeVariant'>): boolean {
  return transition.direction !== undefined
    || (transition.wipeVariant !== undefined && transition.wipeVariant !== 'linear')
}

function normalizeSpatialShapeSettings(transition: {
  shape?: ShowSpatialShape
  scale?: number
  rotation?: number
  spin?: number
  ringWidth?: number
  aspect?: number
  cornerRadius?: number
  crossWidth?: number
  starPoints?: number
  starInner?: number
  crescentOffset?: number
  polygonSides?: number
}): Partial<Pick<
  ShowBoundaryTransition,
  | 'shape' | 'scale' | 'rotation' | 'spin' | 'ringWidth' | 'aspect'
  | 'cornerRadius' | 'crossWidth' | 'starPoints' | 'starInner' | 'crescentOffset' | 'polygonSides'
>> {
  const shapes: ShowSpatialShape[] = [
    'circle', 'ellipse', 'box', 'rounded-box', 'diamond', 'cross', 'ring',
    'heart', 'star', 'crescent', 'polygon', 'cloud', 'cat-head', 'cat-side-profile', 'bastet',
  ]
  if (!shapes.includes(transition.shape as ShowSpatialShape)) return {}
  const base = {
    shape: transition.shape,
    scale: clampRange(transition.scale ?? 1, 0.25, 2),
  }
  if (transition.shape === 'diamond') {
    return {
      ...base,
      rotation: clampRange(transition.rotation ?? 0, -1, 1),
      spin: clampRange(transition.spin ?? 0, -4, 4),
    }
  }
  if (transition.shape === 'box') {
    return {
      ...base,
      aspect: clampRange(transition.aspect ?? 1, 0.25, 4),
      rotation: clampRange(transition.rotation ?? 0, -1, 1),
    }
  }
  if (transition.shape === 'ellipse') {
    return {
      ...base,
      aspect: clampRange(transition.aspect ?? 1.5, 0.25, 4),
      rotation: clampRange(transition.rotation ?? 0, -1, 1),
    }
  }
  if (transition.shape === 'rounded-box') {
    return {
      ...base,
      aspect: clampRange(transition.aspect ?? 1, 0.25, 4),
      rotation: clampRange(transition.rotation ?? 0, -1, 1),
      cornerRadius: clamp01(transition.cornerRadius ?? 0.3),
    }
  }
  if (transition.shape === 'cross') {
    return {
      ...base,
      aspect: clampRange(transition.aspect ?? 1, 0.25, 4),
      rotation: clampRange(transition.rotation ?? 0, -1, 1),
      crossWidth: clampRange(transition.crossWidth ?? 0.32, 0.1, 0.9),
    }
  }
  if (transition.shape === 'ring') {
    return { ...base, ringWidth: clampRange(transition.ringWidth ?? 0.12, 0.02, 1) }
  }
  const shaped = {
    ...base,
    aspect: clampRange(transition.aspect ?? (transition.shape === 'cat-side-profile' ? 1.6 : transition.shape === 'bastet' ? 0.65 : transition.shape === 'cloud' ? 1.4 : 1), 0.25, 4),
    rotation: clampRange(transition.rotation ?? 0, -1, 1),
  }
  if (transition.shape === 'star') {
    return {
      ...shaped,
      starPoints: Math.round(clampRange(transition.starPoints ?? 5, 3, 12)),
      starInner: clampRange(transition.starInner ?? 0.45, 0.2, 0.8),
    }
  }
  if (transition.shape === 'crescent') {
    return { ...shaped, crescentOffset: clampRange(transition.crescentOffset ?? 0.45, 0.15, 0.8) }
  }
  if (transition.shape === 'polygon') {
    return { ...shaped, polygonSides: Math.round(clampRange(transition.polygonSides ?? 6, 3, 8)) }
  }
  return shaped
}

function normalizeEasing(easing: ShowBoundaryTransition['easing'] | undefined): ShowBoundaryTransition['easing'] {
  return normalizePersistedShowEasing(easing)
}

function clampTimeScale(value: number): number {
  return Math.max(0, Math.min(4, Number.isFinite(value) ? value : 1))
}

export function normalizeShowEntryState(show: ShowRecord): ShowRecord {
  return {
    ...show,
    cells: show.cells.map((cell) => ({
      ...cell,
      restartOnEntry: Boolean(cell.restartOnEntry),
    })),
  }
}

// User-facing identity of a layout is its kind (#694); names persist as
// auto-managed identifiers, seeded from this label for new definitions.
export function showRoutingLayoutKindLabel(layout: Pick<ShowRoutingLayout, 'logical'>): string {
  const logical = layout.logical
  if (!logical) return 'Physical ranges'
  if (logical.kind === 'single') return 'Full surface'
  if (logical.kind === 'grid') return 'Grid'
  if (logical.kind === 'stripes') return logical.axis === 'x' ? 'Left / right stripes' : 'Top / bottom stripes'
  if (logical.kind === 'checker') return 'Checker'
  if (logical.kind === 'rings') return 'Rings'
  if (logical.kind === 'pinwheel') return 'Pinwheel'
  if (logical.kind === 'wave') return 'Wave'
  if (logical.kind === 'soft-split') return 'Soft split'
  if (logical.kind === 'split') return logical.axis === 'x' ? 'Moving split X' : 'Moving split Y'
  return 'Zone Layout'
}

export function addShowRoutingLayout(show: ShowRecord, name?: string, sourceLayoutId?: string): ShowRecord {
  const normalized = normalizeShowRoutingState(show)
  const id = nextEntityId('layout-', normalized.routingLayouts)
  const source = sourceLayoutId
    ? normalized.routingLayouts.find((layout) => layout.id === sourceLayoutId)
    : undefined
  const logical = source?.logical
    ? cloneLogicalRouting(source.logical)
    : normalized.outputContract?.kind === 'portable-2d'
      ? normalized.routingLayouts[0]?.logical
        ? cloneLogicalRouting(normalized.routingLayouts[0].logical)
        : { kind: 'single' as const, zoneIds: [normalized.zones[0].id] as [string] }
      : undefined
  const autoName = name ?? showRoutingLayoutKindLabel({ logical })
  const layout: ShowRoutingLayout = {
    id,
    name: uniqueRoutingLayoutName(autoName, normalized.routingLayouts),
    zones: source
      ? source.zones.map(cloneRoutingLayoutZone)
      : routingLayoutFromZones(id, autoName, normalized.zones).zones,
    logical,
  }
  return { ...normalized, routingLayouts: [...normalized.routingLayouts, layout], updatedAt: Date.now() }
}

export function formatShowRoutingRanges(ranges: ShowRoutingLayoutZone['ranges']): string {
  return ranges.map((range) => range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`).join(', ')
}

export function parseShowRoutingRanges(value: string): ShowRoutingLayoutZone['ranges'] | null {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return []
  const ranges: ShowRoutingLayoutZone['ranges'] = []
  for (const part of parts) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part)
    if (!match) return null
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    ranges.push({ start: Math.min(start, end), end: Math.max(start, end) })
  }
  return ranges.sort((a, b) => a.start - b.start || a.end - b.end)
}

export function updateShowRoutingLayout(
  show: ShowRecord,
  layoutId: string,
  changes: Partial<Omit<ShowRoutingLayout, 'id'>>,
): ShowRecord {
  const normalized = normalizeShowRoutingState(show)
  return {
    ...normalized,
    routingLayouts: normalized.routingLayouts.map((layout) => layout.id === layoutId
      ? normalizeRoutingLayout({ ...layout, ...changes, id: layout.id })
      : layout),
    updatedAt: Date.now(),
  }
}

export function removeShowRoutingLayout(show: ShowRecord, layoutId: string): ShowRecord {
  const normalized = normalizeShowTransitionState(normalizeShowRoutingState(show))
  if (normalized.routingLayouts.length <= 1) return show
  const routingLayouts = normalized.routingLayouts.filter((layout) => layout.id !== layoutId)
  if (routingLayouts.length === normalized.routingLayouts.length) return show
  return {
    ...normalized,
    routingLayouts,
    transitions: normalized.transitions.filter((transition) => transition.kind !== 'routing' || transition.layoutId !== layoutId),
    updatedAt: Date.now(),
  }
}

export function updateShowRoutingSwitch(show: ShowRecord, afterSceneId: string, layoutId: string | null): ShowRecord {
  const normalized = normalizeShowTransitionState(normalizeShowRoutingState(show))
  if (!normalized.scenes.slice(0, -1).some((scene) => scene.id === afterSceneId)) return show
  if (layoutId !== null && !normalized.routingLayouts.some((layout) => layout.id === layoutId)) return show
  const transitions = (normalized.transitions ?? []).filter((transition) => (
    transition.kind !== 'routing' || transition.afterSceneId !== afterSceneId
  ))
  if (layoutId !== null) {
    transitions.push({
      id: `routing-${afterSceneId}`,
      afterSceneId,
      kind: 'routing',
      durationMs: 0,
      easing: { curve: 'linear' },
      layoutId,
    })
  }
  return normalizeShowTransitionState({ ...normalized, transitions, updatedAt: Date.now() })
}

export function updateShowTransition(
  show: ShowRecord,
  sceneId: string,
  kind: ShowTransitionKind,
  durationMs: number,
  feather = 0,
  portal: Partial<ShowPortalSettings> = {},
): ShowRecord {
  const normalized = normalizeShowTransitionState(show)
  if (!normalized.scenes.slice(0, -1).some((scene) => scene.id === sceneId)) return show
  const current = normalized.transitions?.find((transition) => (
    transition.afterSceneId === sceneId && transition.kind !== 'routing'
  ))
  const currentPortal = current?.kind === 'portal' ? current : undefined
  const transition: ShowBoundaryTransition = kind === 'portal'
    ? {
        id: current?.id ?? `transition-${sceneId}`,
        afterSceneId: sceneId,
        kind,
        durationMs: clampTransitionDuration(durationMs),
        easing: current?.easing ?? { curve: 'linear' },
        feather: clamp01(feather),
        centerX: clamp01(portal.centerX ?? currentPortal?.centerX ?? 0.5),
        centerY: clamp01(portal.centerY ?? currentPortal?.centerY ?? 0.5),
        featherPolicy: (portal.featherPolicy ?? currentPortal?.featherPolicy) === 'blend' ? 'blend' : 'dither',
        shape: portal.shape ?? currentPortal?.shape,
        scale: portal.scale ?? currentPortal?.scale,
        rotation: portal.rotation ?? currentPortal?.rotation,
        spin: portal.spin ?? currentPortal?.spin,
        ringWidth: portal.ringWidth ?? currentPortal?.ringWidth,
        cornerRadius: portal.cornerRadius ?? currentPortal?.cornerRadius,
        crossWidth: portal.crossWidth ?? currentPortal?.crossWidth,
        starPoints: portal.starPoints ?? currentPortal?.starPoints,
        starInner: portal.starInner ?? currentPortal?.starInner,
        crescentOffset: portal.crescentOffset ?? currentPortal?.crescentOffset,
        polygonSides: portal.polygonSides ?? currentPortal?.polygonSides,
        revealMode: portal.revealMode ?? currentPortal?.revealMode ?? 'grow-incoming',
        aspect: portal.aspect ?? currentPortal?.aspect,
        edgePolicy: portal.edgePolicy ?? currentPortal?.edgePolicy,
      }
    : {
        id: current?.id ?? `transition-${sceneId}`,
        afterSceneId: sceneId,
        kind,
        durationMs: kind === 'cut' ? 0 : clampTransitionDuration(durationMs),
        easing: current?.easing ?? { curve: 'linear' },
        ...(kind === 'crossfade'
          ? {
              crossfadePolicy: current?.kind === 'crossfade'
                ? current.crossfadePolicy
                : 'snapshot-live' as const,
            }
          : {}),
        ...(kind === 'wipe' ? { feather: clamp01(feather) } : {}),
      }
  return normalizeShowTransitionState({
    ...normalized,
    transitions: [
      ...(normalized.transitions ?? []).filter((candidate) => candidate.id !== current?.id),
      transition,
    ],
    updatedAt: Date.now(),
  })
}

export function updateShowBoundaryTransition(
  show: ShowRecord,
  transitionId: string,
  changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>,
): ShowRecord {
  const normalized = normalizeShowTransitionState(show)
  const current = normalized.transitions?.find((transition) => transition.id === transitionId)
  if (!current) return show
  const next = normalizeBoundaryTransition({ ...current, ...changes, id: current.id, afterSceneId: current.afterSceneId })
  return normalizeShowTransitionState({
    ...normalized,
    transitions: normalized.transitions?.map((transition) => transition.id === transitionId ? next : transition),
    updatedAt: Date.now(),
  })
}

export function removeShowBoundaryTransition(show: ShowRecord, transitionId: string): ShowRecord {
  const normalized = normalizeShowTransitionState(show)
  const current = normalized.transitions?.find((transition) => transition.id === transitionId)
  if (!current) return show
  const transitions = current.kind === 'routing'
    ? normalized.transitions?.filter((transition) => transition.id !== transitionId)
    : normalized.transitions?.map((transition) => transition.id === transitionId
      ? {
          id: transition.id,
          afterSceneId: transition.afterSceneId,
          kind: 'cut' as const,
          durationMs: 0,
          easing: transition.easing,
        }
      : transition)
  return normalizeShowTransitionState({ ...normalized, transitions, updatedAt: Date.now() })
}

export function showRecordToCompileRecipe(
  show: ShowRecord,
  lookup: ShowCompileRecipeSourceLookup,
  useRoutedInstallationRecipe = true,
): ShowRecipe {
  show = normalizeShowTransitionState(show)
  const outputEffects = normalizeShowOutputEffects(show.outputEffects)
  if (show.composition) {
    const deterministicLoopReset = show.composition.executionModel === 'deterministic-loop'
    const lowered = lowerShowCompositionForCompile(show, lookup)
    return {
      ...showRecordToCompileRecipe(lowered.show, lowered.lookup),
      ...(deterministicLoopReset ? { deterministicLoopReset: true } : {}),
      outputEffects,
    }
  }
  if (lookup.compositionLayerByCellId && Object.keys(lookup.compositionLayerByCellId).length > 0) {
    return { ...showRecordToRoutedSceneSequenceRecipe(show, lookup), outputEffects }
  }
  if (show.cells.some((cell) => cell.viewport?.enabled)) {
    return { ...showRecordToRoutedSceneSequenceRecipe(show, lookup), outputEffects }
  }
  if (show.cells.some((cell) => cell.evaluationPolicy === 'freeze-at-entry' || cell.evaluationPolicy === 'rolling-refresh')) {
    return { ...showRecordToRoutedSceneSequenceRecipe(show, lookup), outputEffects }
  }
  if (
    useRoutedInstallationRecipe
    && show.outputContract.kind === 'installation'
    && show.zones.length === 1
    && !show.transitions.some((transition) => transition.kind === 'routing')
  ) {
    const singleZoneRecipe = showRecordToCompileRecipe(show, lookup, false)
    return {
      ...singleZoneRecipe,
      zones: show.routingLayouts[0]
        ? routingLayoutControllerZones(show.zones, show.routingLayouts[0])
        : nominalZones(show.zones),
      masterPixelCount: show.outputContract.pixelCount,
    }
  }
  if (
    (useRoutedInstallationRecipe && show.outputContract.kind === 'installation')
    || show.zones.length > 1
    || show.transitions.some((transition) => transition.kind === 'routing')
  ) {
    return { ...showRecordToRoutedSceneSequenceRecipe(show, lookup), outputEffects }
  }

  const firstZone = show.zones[0]
  if (!firstZone) throw new Error('Show compile requires at least one zone.')
  const sceneSequence = showRecordToSceneSequenceRecipe(show, firstZone, lookup)
  if (sceneSequence) return { ...sceneSequence, outputEffects }
  const samplePropertyRamps = showSamplePropertyRamps(show, true)
  const cells = show.cells
    .filter((cell) => cell.zoneId === firstZone.id)
    .sort((a, b) => sceneIndex(show, a.sceneId) - sceneIndex(show, b.sceneId))
    .slice(0, 2)
  if (cells.length === 0) throw new Error('Show compile requires at least one clip on the first zone.')
  const source0 = lookup.byCellId[cells[0].id]
  if (!source0) throw new Error('Show compile requires pattern source for the first clip.')

  if (cells[0].sceneSpan > 1 || cells.length === 1) {
    return {
      clips: [{ id: cells[0].id, source: source0, ...compilerEvaluationPolicy(cells[0]), adaptation: compilerAdaptation(cells[0].adaptations), controlTargets: cells[0].controlTargets, transform: cells[0].transform, effects: cells[0].effects }],
      zones: lookup.controllerZones ?? nominalZones(show.zones),
      samplePropertyRamps,
      outputEffects,
    }
  }

  const source1 = lookup.byCellId[cells[1].id]
  if (!source1) throw new Error('Show compile requires pattern source for both clips.')

  const transitionScene = show.scenes[sceneIndex(show, cells[0].sceneId)]
  const transition = transitionScene ? showVisualTransitionAfter(show, transitionScene.id) : undefined
  const boundary = transition
  const samePattern = isSamePattern(cells[0], cells[1])
  if (transition?.kind === 'portal' && (!show.stageMapId || lookup.stageDimension !== 2)) {
    throw new Error('Portal transition requires a 2D Stage Map.')
  }
  if (transition?.kind === 'wipe' && showWipeRequires2D(transition) && (!show.stageMapId || lookup.stageDimension !== 2)) {
    throw new Error('Directional Wipe requires a 2D Stage Map; select a 2D Stage or remove Direction.')
  }
  if (transition?.kind === 'motion' && (!show.stageMapId || lookup.stageDimension !== 2)) {
    throw new Error('Motion transition requires a 2D Stage Map.')
  }
  if (transition?.kind === 'dither'
    && (transition.dissolveVariant === 'coherent-noise' || transition.dissolveVariant === 'soft-threshold')
    && (!show.stageMapId || lookup.stageDimension !== 2)) {
    throw new Error('Spatial Dissolve requires a 2D Stage Map.')
  }
  if (samePattern && hasSameDiscreteAdaptations(cells[0], cells[1]) && transition && transition.kind !== 'cut' && transition.kind !== 'portal' && transition.kind !== 'fade-color' && transition.kind !== 'motion') {
    const explicitFrom = boundary?.propertyTransitions?.timeScale?.fromByCellId[cells[1].id]
    const propertyRamps = boundary?.propertyTransitions
      ? Object.fromEntries((['timeScale', 'brightness'] as const).flatMap((property) => {
          const descriptor = boundary.propertyTransitions?.[property]
          if (!descriptor) return []
          return [[property, {
            from: descriptor.fromByCellId[cells[1].id] ?? cells[0].adaptations[property],
            to: cells[1].adaptations[property],
            durationMs: descriptor.durationMs ?? boundary.durationMs,
            easing: descriptor.easing ?? { curve: 'linear' },
          }]]
        }))
      : undefined
    const controlRamps = boundary?.propertyTransitions?.controls
      ? Object.fromEntries(Object.entries(boundary.propertyTransitions.controls).map(([exportName, descriptor]) => {
          const from = cells[0].controlTargets?.[exportName]
          const to = cells[1].controlTargets?.[exportName]
          if (from === undefined || to === undefined) {
            throw new Error(`Show control "${exportName}" needs targets in both adjacent scenes.`)
          }
          return [exportName, {
            from: descriptor.fromByCellId[cells[1].id] ?? from,
            to,
            durationMs: descriptor.durationMs ?? boundary.durationMs,
            easing: descriptor.easing ?? { curve: 'linear' },
          }]
        }))
      : undefined
    const effectRamps = compileShowEffectRamps(cells[0], cells[1], boundary)
    return {
      clips: [{ id: cells[0].id, source: source0, ...compilerEvaluationPolicy(cells[0]), adaptation: compilerAdaptation(cells[0].adaptations), controlTargets: cells[0].controlTargets, transform: cells[1].transform, effects: cells[1].effects }],
      adaptationRamp: {
        startMs: show.scenes[0].durationMs,
        durationMs: transition.durationMs,
        from: {
          ...compilerAdaptation(cells[0].adaptations),
          ...(explicitFrom === undefined ? {} : { timeScale: explicitFrom }),
        },
        to: compilerAdaptation(cells[1].adaptations),
        easing: boundary?.easing ?? { curve: 'linear' },
        ...(propertyRamps && Object.keys(propertyRamps).length > 0 ? { propertyRamps } : {}),
        ...(controlRamps && Object.keys(controlRamps).length > 0 ? { controlRamps } : {}),
        ...(effectRamps ? { effectRamps } : {}),
      },
      zones: lookup.controllerZones ?? nominalZones(show.zones),
      samplePropertyRamps,
      outputEffects,
    }
  }

  const clips = [
    { id: cells[0].id, source: source0, ...compilerEvaluationPolicy(cells[0]), adaptation: compilerAdaptation(cells[0].adaptations), controlTargets: cells[0].controlTargets, transform: cells[0].transform, effects: cells[0].effects },
    { id: cells[1].id, source: source1, ...compilerEvaluationPolicy(cells[1]), adaptation: compilerAdaptation(cells[1].adaptations), controlTargets: cells[1].controlTargets, transform: cells[1].transform, effects: cells[1].effects },
  ]
  return {
    clips,
    crossfade: transition && transition.kind === 'crossfade'
      ? {
          startMs: show.scenes[0].durationMs,
          durationMs: transition.durationMs,
          crossfadePolicy: transition.crossfadePolicy,
        }
      : undefined,
    cut: !transition || transition.kind === 'cut' ? { startMs: show.scenes[0].durationMs } : undefined,
    routeTransition: transition && (transition.kind === 'fade-color' || transition.kind === 'wipe' || transition.kind === 'dither' || transition.kind === 'portal' || transition.kind === 'motion')
      ? {
          kind: transition.kind,
          startMs: show.scenes[0].durationMs,
          durationMs: transition.durationMs,
          easing: boundary?.easing ?? { curve: 'linear' },
          ...(transition.kind === 'fade-color'
            ? { color: normalizeShowTransitionColor(transition.color) }
            : {}),
          ...(transition.kind === 'dither'
            ? {
                ...(transition.dissolveVariant === undefined ? {} : { dissolveVariant: transition.dissolveVariant }),
                ...(transition.seed === undefined ? {} : { seed: normalizeShowDissolveSeed(transition.seed) }),
                ...(transition.blockSize === undefined ? {} : { blockSize: normalizeShowDissolveBlockSize(transition.blockSize) }),
                ...(transition.scale === undefined ? {} : { scale: normalizeShowDissolveScale(transition.scale) }),
                ...(transition.softness === undefined ? {} : { softness: normalizeShowDissolveSoftness(transition.softness) }),
                ...(transition.edgePolicy === undefined ? {} : { edgePolicy: transition.edgePolicy }),
              }
            : {}),
          ...(transition.kind === 'wipe'
            ? {
                feather: clamp01(transition.feather ?? 0),
                ...(transition.direction === undefined ? {} : { direction: normalizeShowWipeDirection(transition.direction) }),
                ...(transition.wipeVariant === undefined
                  ? {}
                  : transition.wipeVariant === 'linear' && transition.direction === undefined
                    ? { wipeVariant: 'linear' as const }
                    : normalizeWipeVariantSettings(normalizeShowWipeSettings(transition))),
                ...(transition.edgePolicy === undefined ? {} : { edgePolicy: transition.edgePolicy }),
              }
            : {}),
          ...(transition.kind === 'portal'
            ? {
                feather: clamp01(transition.feather ?? 0.12),
                centerX: clamp01(transition.centerX ?? 0.5),
                centerY: clamp01(transition.centerY ?? 0.5),
                featherPolicy: transition.featherPolicy === 'blend' ? 'blend' as const : 'dither' as const,
                revealMode: transition.revealMode ?? 'grow-incoming',
                ...(transition.edgePolicy ? { edgePolicy: transition.edgePolicy } : {}),
                ...normalizeSpatialShapeSettings(transition),
              }
            : {}),
          ...(transition.kind === 'motion' ? normalizeShowMotionTransition(transition) : {}),
        }
      : undefined,
    zones: lookup.controllerZones ?? nominalZones(show.zones),
    samplePropertyRamps,
    outputEffects,
  }
}

function showRecordToSceneSequenceRecipe(
  show: ShowRecord,
  zone: ShowZone,
  lookup: ShowCompileRecipeSourceLookup,
): ShowRecipe | null {
  const cells = show.scenes.map((scene) => (
    showCellAtSlot(show, zone.id, scene.id)
  ))
  const hasEmptyScene = cells.some((cell) => !cell)
  if (show.scenes.length < 3 && !hasEmptyScene) return null
  const resolvedCells = cells.map((cell, index): ShowCell => cell ?? ({
    id: `${EMPTY_SHOW_PATTERN_ID}-${show.scenes[index].id}`,
    zoneId: zone.id,
    sceneId: show.scenes[index].id,
    sceneSpan: 1,
    zoneSpan: 1,
    pattern: { kind: 'stock', id: EMPTY_SHOW_PATTERN_ID },
    patternName: 'Empty',
    adaptations: { ...DEFAULT_ADAPTATIONS },
    restartOnEntry: false,
  }))
  const transitions = show.scenes.slice(0, -1).map((scene) => showVisualTransitionAfter(show, scene.id))
  const hasPropertyTransitions = show.transitions?.some((transition) => (
    transition.kind !== 'routing' && Boolean(transition.propertyTransitions && Object.keys(transition.propertyTransitions).length > 0)
  )) ?? false
  if (transitions.some((transition) => transition?.kind === 'portal') && (!show.stageMapId || lookup.stageDimension !== 2)) {
    throw new Error('Portal transition requires a 2D Stage Map.')
  }
  if (transitions.some((transition) => transition?.kind === 'wipe' && showWipeRequires2D(transition))
    && (!show.stageMapId || lookup.stageDimension !== 2)) {
    throw new Error('Directional Wipe requires a 2D Stage Map; select a 2D Stage or remove Direction.')
  }
  if (transitions.some((transition) => transition?.kind === 'motion') && (!show.stageMapId || lookup.stageDimension !== 2)) {
    throw new Error('Motion transition requires a 2D Stage Map.')
  }
  if (transitions.some((transition) => transition?.kind === 'dither'
    && (transition.dissolveVariant === 'coherent-noise' || transition.dissolveVariant === 'soft-threshold'))
    && (!show.stageMapId || lookup.stageDimension !== 2)) {
    throw new Error('Spatial Dissolve requires a 2D Stage Map.')
  }

  const clipByKey = new Map<string, ShowRecipe['clips'][number]>()
  const clipIdByCellId = new Map<string, string>()
  for (const [index, cell] of resolvedCells.entries()) {
    const source = cell.pattern.id === EMPTY_SHOW_PATTERN_ID
      ? EMPTY_SHOW_PATTERN_SOURCE
      : lookup.byCellId[cell.id]
    if (!source) throw new Error(`Show compile requires pattern source for clip "${cell.id}".`)
    const adaptation = compilerAdaptation(cell.adaptations)
    const explicitInstanceId = lookup.instanceIdByCellId?.[cell.id]
    const continuityKey = `${cell.pattern.kind}:${cell.pattern.id}:${JSON.stringify(adaptation)}:${JSON.stringify(cell.transform ?? null)}:${JSON.stringify(cell.effects ?? [])}:${cell.evaluationPolicy ?? 'live'}`
    const key = explicitInstanceId
      ? `composition-instance:${explicitInstanceId}`
      : cell.restartOnEntry ? `${continuityKey}:restart:${cell.id}` : continuityKey
    const previous = resolvedCells[index - 1]
    const incomingBoundary = previous
      ? show.transitions?.find((transition) => transition.afterSceneId === previous.sceneId && transition.kind !== 'routing')
      : undefined
    const continuesPropertyRamp = Boolean(
      previous
      && !cell.restartOnEntry
      && incomingBoundary?.propertyTransitions
      && isSamePattern(previous, cell)
      && hasSameDiscreteAdaptations(previous, cell),
    )
    const continuedClipId = continuesPropertyRamp ? clipIdByCellId.get(previous.id) : undefined
    const existing = explicitInstanceId
      ? clipByKey.get(key)
      : continuedClipId
      ? [...clipByKey.values()].find((clip) => clip.id === continuedClipId)
      : clipByKey.get(key)
    if (existing) {
      if (showEffectsAreIdentity(existing.effects) && !showEffectsAreIdentity(cell.effects)) existing.effects = cell.effects
      clipIdByCellId.set(cell.id, existing.id)
    } else {
      const clip = { id: explicitInstanceId ?? cell.id, source, ...compilerEvaluationPolicy(cell), adaptation, transform: cell.transform, effects: cell.effects }
      Object.assign(clip, { controlTargets: cell.controlTargets })
      clipByKey.set(key, clip)
      clipIdByCellId.set(cell.id, clip.id)
    }
  }

  return {
    clips: [...clipByKey.values()],
    sceneSequence: {
      scenes: show.scenes.map((scene, index) => {
        const cell = resolvedCells[index]
        const transition = showVisualTransitionAfter(show, scene.id)
        const nextCell = resolvedCells[index + 1]
        const boundary = show.transitions?.find((candidate) => (
          candidate.afterSceneId === scene.id && candidate.kind !== 'routing'
        ))
        const propertyRamps = nextCell && boundary?.propertyTransitions
          ? Object.fromEntries((['timeScale', 'brightness'] as const).flatMap((property) => {
              const descriptor = boundary.propertyTransitions?.[property]
              if (!descriptor) return []
              return [[property, {
                from: descriptor.fromByCellId[nextCell.id] ?? cell.adaptations[property],
                to: nextCell.adaptations[property],
                durationMs: descriptor.durationMs ?? boundary.durationMs,
                easing: descriptor.easing ?? { curve: 'linear' },
              }]]
            }))
          : undefined
        const controlRamps = nextCell && boundary?.propertyTransitions?.controls
          ? Object.fromEntries(Object.entries(boundary.propertyTransitions.controls).map(([exportName, descriptor]) => {
              const from = cell.controlTargets?.[exportName]
              const to = nextCell.controlTargets?.[exportName]
              if (from === undefined || to === undefined) {
                throw new Error(`Show control "${exportName}" needs targets in both adjacent scenes.`)
              }
              return [exportName, {
                from: descriptor.fromByCellId[nextCell.id] ?? from,
                to,
                durationMs: descriptor.durationMs ?? boundary.durationMs,
                easing: descriptor.easing ?? { curve: 'linear' },
              }]
            }))
          : undefined
        const effectRamps = nextCell && (boundary?.propertyTransitions?.effects || boundary?.propertyTransitions?.transform)
          ? compileShowEffectRamps(cell, nextCell, boundary)
          : undefined
        return {
          clipId: clipIdByCellId.get(cell.id)!,
          holdMs: scene.durationMs,
          ...(hasPropertyTransitions || lookup.instanceIdByCellId
            ? { timeScale: cell.adaptations.timeScale, brightness: cell.adaptations.brightness }
            : {}),
          ...(cell.controlTargets ? { controlTargets: { ...cell.controlTargets } } : {}),
          ...(cell.transform ? { transform: structuredClone(cell.transform) } : {}),
          ...(cell.effects ? { effects: normalizeShowClipEffects(cell.effects) } : {}),
          ...(transition
            ? {
                transitionOut: {
                  ...compilerSequenceTransition(transition, boundary?.easing),
                  ...(propertyRamps && Object.keys(propertyRamps).length > 0 ? { propertyRamps } : {}),
                  ...(controlRamps && Object.keys(controlRamps).length > 0 ? { controlRamps } : {}),
                  ...(effectRamps ? { effectRamps } : {}),
                },
              }
            : {}),
        }
      }),
    },
    zones: lookup.controllerZones ?? nominalZones(show.zones),
    samplePropertyRamps: showSamplePropertyRamps(show, true),
  }
}

function compilerSequenceTransition(
  transition: ShowBoundaryTransition & { kind: ShowTransitionKind },
  easing?: ShowBoundaryTransition['easing'],
  scopeZoneName?: string,
): NonNullable<NonNullable<ShowRecipe['sceneSequence']>['scenes'][number]['transitionOut']> {
  return {
    kind: transition.kind,
    durationMs: transition.durationMs,
    easing: easing ?? { curve: 'linear' },
    ...(scopeZoneName ? { scopeZoneName } : {}),
    ...(transition.kind === 'crossfade' ? { crossfadePolicy: transition.crossfadePolicy } : {}),
    ...(transition.kind === 'fade-color' ? { color: normalizeShowTransitionColor(transition.color) } : {}),
    ...(transition.kind === 'dither'
      ? {
          ...(transition.dissolveVariant === undefined ? {} : { dissolveVariant: transition.dissolveVariant }),
          ...(transition.seed === undefined ? {} : { seed: normalizeShowDissolveSeed(transition.seed) }),
          ...(transition.blockSize === undefined ? {} : { blockSize: normalizeShowDissolveBlockSize(transition.blockSize) }),
          ...(transition.scale === undefined ? {} : { scale: normalizeShowDissolveScale(transition.scale) }),
          ...(transition.softness === undefined ? {} : { softness: normalizeShowDissolveSoftness(transition.softness) }),
          ...(transition.edgePolicy === undefined ? {} : { edgePolicy: transition.edgePolicy }),
        }
      : {}),
    ...(transition.kind === 'wipe'
      ? {
          feather: clamp01(transition.feather ?? 0),
          ...(transition.direction === undefined ? {} : { direction: normalizeShowWipeDirection(transition.direction) }),
          ...(transition.wipeVariant === undefined
            ? {}
            : transition.wipeVariant === 'linear' && transition.direction === undefined
              ? { wipeVariant: 'linear' as const }
              : normalizeWipeVariantSettings(normalizeShowWipeSettings(transition))),
          ...(transition.edgePolicy === undefined ? {} : { edgePolicy: transition.edgePolicy }),
        }
      : {}),
    ...(transition.kind === 'portal'
      ? {
          feather: clamp01(transition.feather ?? 0.12),
          centerX: clamp01(transition.centerX ?? 0.5),
          centerY: clamp01(transition.centerY ?? 0.5),
          featherPolicy: transition.featherPolicy === 'blend' ? 'blend' as const : 'dither' as const,
          revealMode: transition.revealMode ?? 'grow-incoming',
          ...(transition.edgePolicy ? { edgePolicy: transition.edgePolicy } : {}),
          ...normalizeSpatialShapeSettings(transition),
        }
      : {}),
    ...(transition.kind === 'motion' ? normalizeShowMotionTransition(transition) : {}),
  }
}

function showRecordToStaticRoutedRecipe(
  show: ShowRecord,
  lookup: ShowCompileRecipeSourceLookup,
): ShowRecipe {
  const firstScene = show.scenes[0]
  if (!firstScene) throw new Error('Show compile requires at least one scene.')
  const zoneById = new Map(show.zones.map((zone) => [zone.id, zone]))
  const cells = show.zones
    .map((zone) => show.cells.find((cell) => cell.zoneId === zone.id && cell.sceneId === firstScene.id))
    .filter((cell): cell is ShowCell => Boolean(cell))
  if (cells.length === 0) throw new Error('Show compile requires at least one first-scene zone clip.')

  const normalized = normalizeShowRoutingState(show)
  const loopDurationMs = showSceneHoldDurationMs(normalized)
  const activeSwitches = normalized.transitions.flatMap((transition) => {
    if (transition.kind !== 'routing' || !transition.layoutId) return []
    const sceneIndex = normalized.scenes.findIndex((scene) => scene.id === transition.afterSceneId)
    if (sceneIndex < 0 || sceneIndex >= normalized.scenes.length - 1) return []
    const atMs = normalized.scenes
      .slice(0, sceneIndex + 1)
      .reduce((sum, scene) => sum + Math.max(0, scene.durationMs), 0)
    return [{
      atMs,
      layoutId: transition.layoutId,
      durationMs: Math.min(transition.durationMs, Math.max(0, loopDurationMs - atMs)),
      easing: transition.easing,
      direction: transition.routingDirection ?? 'forward',
    }]
  })
  const splitLayout = normalized.routingLayouts.find((layout) => (
    layout.logical?.kind === 'split' || layout.logical?.kind === 'soft-split'
  ))
  const installationContract = normalized.outputContract?.kind === 'installation'
    ? normalized.outputContract
    : null
  const portableContract = normalized.outputContract?.kind === 'portable-2d'
  const selectedLayouts = installationContract || portableContract || activeSwitches.length > 0
    ? normalized.routingLayouts
    : splitLayout ? [splitLayout] : []
  const routingLayouts = selectedLayouts.length > 0
    ? selectedLayouts.map((layout) => ({
        id: layout.id,
        name: layout.name,
        zones: routingLayoutControllerZones(normalized.zones, layout),
        logical: layout.logical ? logicalRoutingRecipe(normalized.zones, layout.logical) : undefined,
      }))
    : undefined
  const splitPosition = splitLayout
    ? {
        initial: clamp01(normalized.scenes[0]?.routingTargets?.splitPosition ?? 0.5),
        // The static routed recipe's loop and switch clocks are hold-only
        // (showSceneHoldDurationMs), so its ramp anchors stay hold-only too -
        // mixing clocks would anchor ramps past the loop wrap (#823 review).
        ramps: normalized.scenes.slice(0, -1).map((scene, sceneIndex) => {
          const target = clamp01(normalized.scenes[sceneIndex + 1]?.routingTargets?.splitPosition ?? 0.5)
          const boundary = normalized.transitions?.find((transition) => (
            transition.afterSceneId === scene.id && transition.kind !== 'routing'
          ))
          const descriptor = boundary?.propertyTransitions?.routing?.splitPosition
          return {
            atMs: normalized.scenes.slice(0, sceneIndex + 1)
              .reduce((sum, candidate) => sum + Math.max(0, candidate.durationMs), 0),
            from: clamp01(descriptor?.from ?? scene.routingTargets?.splitPosition ?? 0.5),
            to: target,
            durationMs: descriptor?.durationMs ?? 0,
            easing: descriptor?.easing ?? { curve: 'linear' },
          }
        }),
      }
    : undefined
  const installationZones = installationContract && normalized.routingLayouts[0]
    ? routingLayoutControllerZones(normalized.zones, normalized.routingLayouts[0])
    : undefined

  return {
    clips: cells.map((cell) => {
      const source = lookup.byCellId[cell.id]
      if (!source) throw new Error(`Show compile requires pattern source for clip "${cell.id}".`)
      const zone = zoneById.get(cell.zoneId)
      if (!zone) throw new Error(`Show compile requires zone for clip "${cell.id}".`)
      const zoneIndex = show.zones.findIndex((candidate) => candidate.id === cell.zoneId)
      const zoneSpan = Math.max(1, Math.min(cell.zoneSpan ?? 1, show.zones.length - zoneIndex))
      const spannedZones = show.zones.slice(zoneIndex, zoneIndex + zoneSpan)
      return {
        id: cell.id,
        source,
        ...compilerEvaluationPolicy(cell),
        ...(zoneSpan > 1
          ? {
              zones: spannedZones.map((spannedZone) => spannedZone.name),
              zoneMode: cell.zoneMode === 'repeat' ? 'repeat' as const : 'span' as const,
            }
          : { zone: zone.name }),
        adaptation: compilerAdaptation(cell.adaptations),
        transform: cell.transform,
        effects: cell.effects,
        controlTargets: cell.controlTargets,
      }
    }),
    zones: installationZones ?? lookup.controllerZones ?? nominalZones(show.zones),
    routingLayouts,
    masterPixelCount: installationContract?.pixelCount,
    routingSwitches: routingLayouts ? activeSwitches : undefined,
    routingPropertyRamps: splitPosition ? { splitPosition } : undefined,
    samplePropertyRamps: showSamplePropertyRamps(normalized, false),
    loopDurationMs: routingLayouts ? loopDurationMs : undefined,
  }
}

function showRecordToRoutedSceneSequenceRecipe(
  show: ShowRecord,
  lookup: ShowCompileRecipeSourceLookup,
): ShowRecipe {
  const firstScene = show.scenes[0]
  if (!firstScene) throw new Error('Show compile requires at least one scene.')

  const normalized = normalizeShowRoutingState(show)
  const loopDurationMs = showLoopDurationMs(normalized)
  const activeSwitches = normalized.transitions.flatMap((transition) => {
    if (transition.kind !== 'routing' || !transition.layoutId) return []
    const sceneIndex = normalized.scenes.findIndex((scene) => scene.id === transition.afterSceneId)
    if (sceneIndex < 0 || sceneIndex >= normalized.scenes.length - 1) return []
    const atMs = normalized.scenes.slice(0, sceneIndex).reduce((sum, scene) => (
      sum + Math.max(0, scene.durationMs) + Math.max(0, showVisualTransitionAfter(normalized, scene.id)?.durationMs ?? 0)
    ), 0) + Math.max(0, normalized.scenes[sceneIndex].durationMs)
    return [{
      atMs,
      layoutId: transition.layoutId,
      durationMs: Math.min(transition.durationMs, Math.max(0, loopDurationMs - atMs)),
      easing: transition.easing,
      direction: transition.routingDirection ?? 'forward',
    }]
  })
  const splitLayout = normalized.routingLayouts.find((layout) => (
    layout.logical?.kind === 'split' || layout.logical?.kind === 'soft-split'
  ))
  const installationContract = normalized.outputContract?.kind === 'installation'
    ? normalized.outputContract
    : null
  const portableContract = normalized.outputContract?.kind === 'portable-2d'
  const usesAuthoredRoutingLayouts = Boolean(
    installationContract || portableContract || activeSwitches.length > 0 || splitLayout,
  )
  const selectedLayouts = installationContract || portableContract || activeSwitches.length > 0
    ? normalized.routingLayouts
    : splitLayout ? [splitLayout] : []
  const routingLayouts = usesAuthoredRoutingLayouts && selectedLayouts.length > 0
    ? selectedLayouts.map((layout) => ({
        id: layout.id,
        name: layout.name,
        zones: routingLayoutControllerZones(normalized.zones, layout),
        logical: layout.logical ? logicalRoutingRecipe(normalized.zones, layout.logical) : undefined,
      }))
    : [{
        id: normalized.routingLayouts[0]?.id ?? 'layout-1',
        name: normalized.routingLayouts[0]?.name ?? 'Default',
        zones: lookup.controllerZones ?? nominalZones(normalized.zones),
      }]
  const splitPosition = splitLayout
    ? {
        initial: clamp01(normalized.scenes[0]?.routingTargets?.splitPosition ?? 0.5),
        // Ramp anchors accumulate visual-transition extensions exactly like
        // the routing switches: a positive-duration boundary extends the
        // compiled timeline, and a ramp anchored at bare hold sums fires
        // early by every preceding extension (#823 review P1).
        ramps: (() => {
          let rampCursorMs = 0
          return normalized.scenes.slice(0, -1).map((scene, sceneIndex) => {
            rampCursorMs += Math.max(0, scene.durationMs)
            const target = clamp01(normalized.scenes[sceneIndex + 1]?.routingTargets?.splitPosition ?? 0.5)
            const boundary = normalized.transitions?.find((transition) => (
              transition.afterSceneId === scene.id && transition.kind !== 'routing'
            ))
            const descriptor = boundary?.propertyTransitions?.routing?.splitPosition
            const ramp = {
              atMs: rampCursorMs,
              from: clamp01(descriptor?.from ?? scene.routingTargets?.splitPosition ?? 0.5),
              to: target,
              durationMs: descriptor?.durationMs ?? 0,
              easing: descriptor?.easing ?? { curve: 'linear' },
            }
            rampCursorMs += Math.max(0, showVisualTransitionAfter(normalized, scene.id)?.durationMs ?? 0)
            return ramp
          })
        })(),
      }
    : undefined
  const installationZones = installationContract && normalized.routingLayouts[0]
    ? routingLayoutControllerZones(normalized.zones, normalized.routingLayouts[0])
    : undefined

  const clipIdByCellId = new Map<string, string>()
  // Placements of one instance normally share a clip, and their Effect lists are
  // merged by id so a placement may carry a subset or its own values. That merge
  // cannot represent two placements whose shared Effects run in opposite order,
  // so a conflicting placement takes its own clip variant instead of silently
  // adopting whichever order was seen first (#363).
  const mergedEffectsByClipId = new Map<string, ShowCell['effects']>()
  for (const zone of normalized.zones) {
    normalized.scenes.forEach((scene, sceneIndex) => {
      for (const cell of showCompileCellsAtSlot(normalized, zone.id, scene.id, lookup)) {
        if (clipIdByCellId.has(cell.id)) continue
        const explicitInstanceId = lookup.instanceIdByCellId?.[cell.id]
        if (explicitInstanceId) {
          let clipId = explicitInstanceId
          for (let variant = 1; mergedEffectsByClipId.has(clipId); variant += 1) {
            if (!showEffectOrderConflicts(mergedEffectsByClipId.get(clipId), cell.effects)) break
            clipId = showEffectOrderVariantClipId(explicitInstanceId, variant)
          }
          mergedEffectsByClipId.set(
            clipId,
            mergeShowPlacementEffects(mergedEffectsByClipId.get(clipId), cell.effects),
          )
          clipIdByCellId.set(cell.id, clipId)
          continue
        }
        const previousScene = normalized.scenes[sceneIndex - 1]
        const previous = previousScene ? showCellAtSlot(normalized, zone.id, previousScene.id) : undefined
        const continuedClipId = previous
          && !cell.restartOnEntry
          && isSamePattern(previous, cell)
          && hasSameDiscreteAdaptations(previous, cell)
          ? clipIdByCellId.get(previous.id)
          : undefined
        clipIdByCellId.set(cell.id, continuedClipId ?? cell.id)
      }
    })
  }

  const clipById = new Map<string, ShowRecipe['clips'][number]>()
  const emptyClipId = `${EMPTY_SHOW_PATTERN_ID}-routed`
  for (const scene of normalized.scenes) {
    for (const zone of normalized.zones) {
      const cells = showCompileCellsAtSlot(normalized, zone.id, scene.id, lookup)
      if (cells.length === 0) {
        if (!clipById.has(emptyClipId)) {
          clipById.set(emptyClipId, { id: emptyClipId, source: EMPTY_SHOW_PATTERN_SOURCE })
        }
        continue
      }
      for (const cell of cells) {
        const clipId = clipIdByCellId.get(cell.id) ?? cell.id
        const existing = clipById.get(clipId)
        if (existing) {
          existing.effects = mergeShowPlacementEffects(existing.effects, cell.effects)
          continue
        }
        const source = lookup.byCellId[cell.id]
        if (!source) throw new Error(`Show compile requires pattern source for clip "${cell.id}".`)
        clipById.set(clipId, {
          id: clipId,
          source,
          ...compilerEvaluationPolicy(cell),
          adaptation: compilerAdaptation(cell.adaptations),
          transform: cell.transform,
          effects: cell.effects,
          controlTargets: cell.controlTargets,
        })
      }
    }
  }
  if (clipById.size === 0) throw new Error('Show compile requires at least one routed clip.')

  const routedScenes = normalized.scenes.map((scene, sceneIndex) => {
    const transitionRamps = routedScenePlacementRamps(normalized, sceneIndex, clipIdByCellId)
    const propertyAnimation = lookup.compositionPropertyTracksBySceneId?.[scene.id]
    const visualTransition = showVisualTransitionAfter(normalized, scene.id)
    const scopeZoneId = visualTransition
      ? lookup.compositionTransitionZoneIdByTransitionId?.[visualTransition.id]
      : undefined
    const scopeZoneName = scopeZoneId
      ? normalized.zones.find((zone) => zone.id === scopeZoneId)?.name
      : undefined
    return {
          holdMs: scene.durationMs,
          ...(propertyAnimation ? {
            localTimeOffsetMs: propertyAnimation.localTimeOffsetMs,
            propertyTracks: structuredClone(propertyAnimation.tracks),
          } : {}),
          placements: normalized.zones.flatMap((zone) => {
            const cells = showCompileCellsAtSlot(normalized, zone.id, scene.id, lookup)
            if (cells.length === 0) return [{ zoneName: zone.name, clipId: emptyClipId }]
            return cells.map((cell) => {
              const cellZoneIndex = normalized.zones.findIndex((candidate) => candidate.id === cell.zoneId)
              const domainZoneNames = cellZoneIndex >= 0
                ? normalized.zones.slice(cellZoneIndex, cellZoneIndex + Math.max(1, cell.zoneSpan ?? 1)).map((candidate) => candidate.name)
                : []
              const layer = lookup.compositionLayerByCellId?.[cell.id]
              return {
                ...(lookup.compositionPlacementIdByCellId?.[cell.id]
                  ? { placementId: lookup.compositionPlacementIdByCellId[cell.id] }
                  : {}),
                ...(lookup.compositionLogicalClipIdByCellId?.[cell.id]
                  ? { logicalClipId: lookup.compositionLogicalClipIdByCellId[cell.id] }
                  : {}),
                zoneName: zone.name,
                clipId: clipIdByCellId.get(cell.id) ?? cell.id,
                ...(layer ? { stackOrder: layer.stackOrder, opacity: layer.opacity } : {}),
                ...(domainZoneNames.length > 1 ? {
                  domainZoneNames,
                  zoneMode: cell.zoneMode === 'repeat' ? 'repeat' as const : 'span' as const,
                } : {}),
                timeScale: cell.adaptations.timeScale,
                brightness: cell.adaptations.brightness,
                phase: cell.adaptations.phase,
                mirror: cell.adaptations.mirror,
                ...(cell.controlTargets ? { controlTargets: { ...cell.controlTargets } } : {}),
                ...(cell.transform ? { transform: structuredClone(cell.transform) } : {}),
                ...(cell.viewport ? { viewport: structuredClone(cell.viewport) } : {}),
                ...(cell.effects ? { effects: normalizeShowClipEffects(cell.effects) } : {}),
                ...(cell.presentation ? { presentation: structuredClone(cell.presentation) } : {}),
                ...(cell.blink ? { blink: structuredClone(cell.blink) } : {}),
              }
            })
          }),
          ...(visualTransition ? {
            transitionOut: compilerSequenceTransition(
              visualTransition,
              visualTransition.easing,
              scopeZoneName,
            ),
          } : {}),
          ...(transitionRamps.length > 0 ? { transitionRamps } : {}),
        }
  })

  const firstPlacements = routedScenes[0]?.placements
  const hasStaticPatternSchedule = Boolean(firstPlacements)
    && routedScenes.every((scene) => !scene.transitionRamps?.length
      && scene.placements.every((placement, index) => (
        JSON.stringify(placement) === JSON.stringify(firstPlacements[index])
      )))
  const hasAuthoredCachedEvaluation = [...clipById.values()].some((clip) => (
    clip.evaluationPolicy === 'freeze-at-entry' || clip.evaluationPolicy === 'rolling-refresh'
  ))
  const hasEnabledViewport = normalized.cells.some((cell) => cell.viewport?.enabled)
  if (
    hasStaticPatternSchedule
    && !lookup.compositionLayerByCellId
    && !hasAuthoredCachedEvaluation
    && !hasEnabledViewport
  ) {
    return showRecordToStaticRoutedRecipe(normalized, lookup)
  }

  return {
    clips: [...clipById.values()],
    routedSceneSequence: {
      scenes: routedScenes,
    },
    zones: installationZones ?? lookup.controllerZones ?? nominalZones(show.zones),
    routingLayouts,
    masterPixelCount: installationContract?.pixelCount,
    routingSwitches: routingLayouts ? activeSwitches : undefined,
    routingPropertyRamps: splitPosition ? { splitPosition } : undefined,
    samplePropertyRamps: showSamplePropertyRamps(normalized, true),
    loopDurationMs: routingLayouts ? loopDurationMs : undefined,
  }
}

function mergeShowPlacementEffects(
  existing: ShowCell['effects'],
  incoming: ShowCell['effects'],
): ShowCell['effects'] {
  const result = normalizeShowClipEffects(existing)
  for (const effect of normalizeShowClipEffects(incoming)) {
    if (!result.some((candidate) => candidate.id === effect.id && candidate.kind === effect.kind)) {
      result.push(effect)
    }
  }
  return result.length > 0 ? result : undefined
}

function compilerEvaluationPolicy(
  cell: Pick<ShowCell, 'evaluationPolicy'>,
): Pick<ShowRecipe['clips'][number], 'evaluationPolicy' | 'rollingRefreshSlices'> {
  if (cell.evaluationPolicy === 'freeze-at-entry') return { evaluationPolicy: 'freeze-at-entry' }
  if (cell.evaluationPolicy === 'rolling-refresh') {
    return { evaluationPolicy: 'rolling-refresh', rollingRefreshSlices: 4 }
  }
  return {}
}

function showCompileCellsAtSlot(
  show: ShowRecord,
  zoneId: string,
  sceneId: string,
  lookup: ShowCompileRecipeSourceLookup,
): ShowCell[] {
  if (!lookup.compositionLayerByCellId) {
    const cell = showCellAtSlot(show, zoneId, sceneId)
    return cell ? [cell] : []
  }
  return show.cells
    .filter((cell) => cell.zoneId === zoneId && cell.sceneId === sceneId)
    .sort((left, right) => (
      (lookup.compositionLayerByCellId?.[left.id]?.stackOrder ?? 0)
      - (lookup.compositionLayerByCellId?.[right.id]?.stackOrder ?? 0)
    ))
}

function routedScenePlacementRamps(
  show: ShowRecord,
  sceneIndex: number,
  clipIdByCellId: Map<string, string>,
): ShowRoutedScenePlacementRampRecipe[] {
  const scene = show.scenes[sceneIndex]
  const nextScene = show.scenes[sceneIndex + 1]
  if (!scene || !nextScene) return []
  const boundary = show.transitions?.find((candidate) => (
    candidate.afterSceneId === scene.id && candidate.kind !== 'routing'
  ))
  const propertyTransitions = boundary?.propertyTransitions
  if (!boundary || !propertyTransitions) return []

  return show.zones.flatMap((zone) => {
    const current = showCellAtSlot(show, zone.id, scene.id)
    const next = showCellAtSlot(show, zone.id, nextScene.id)
    if (!current || !next) return []
    const propertyRamps = Object.fromEntries((['timeScale', 'brightness'] as const).flatMap((property) => {
      const descriptor = propertyTransitions[property]
      if (!descriptor) return []
      return [[property, {
        from: descriptor.fromByCellId[next.id] ?? current.adaptations[property],
        to: next.adaptations[property],
        durationMs: descriptor.durationMs ?? boundary.durationMs,
        easing: descriptor.easing ?? { curve: 'linear' },
      }]]
    }))
    const controlRamps = propertyTransitions.controls
      ? Object.fromEntries(Object.entries(propertyTransitions.controls).map(([exportName, descriptor]) => {
          const from = current.controlTargets?.[exportName]
          const to = next.controlTargets?.[exportName]
          if (from === undefined || to === undefined) {
            throw new Error(`Show control "${exportName}" needs targets in both adjacent scenes.`)
          }
          return [exportName, {
            from: descriptor.fromByCellId[next.id] ?? from,
            to,
            durationMs: descriptor.durationMs ?? boundary.durationMs,
            easing: descriptor.easing ?? { curve: 'linear' },
          }]
        }))
      : undefined
    const effectRamps = propertyTransitions.effects || propertyTransitions.transform
      ? compileShowEffectRamps(current, next, boundary)
      : undefined
    if (Object.keys(propertyRamps).length === 0 && !controlRamps && !effectRamps) return []
    return [{
      clipId: clipIdByCellId.get(next.id) ?? next.id,
      ...(Object.keys(propertyRamps).length > 0 ? { propertyRamps } : {}),
      ...(controlRamps ? { controlRamps } : {}),
      ...(effectRamps ? { effectRamps } : {}),
    }]
  })
}

function showSamplePropertyRamps(
  show: ShowRecord,
  includeTransitionDurations: boolean,
): ShowRecipe['samplePropertyRamps'] {
  const hasAuthoredValue = show.scenes.some((scene) => scene.sampleTargets?.repeatScale !== undefined)
    || Boolean(show.transitions?.some((transition) => transition.propertyTransitions?.sample?.repeatScale))
  if (!hasAuthoredValue) return undefined

  let cursorMs = 0
  const ramps = show.scenes.slice(0, -1).map((scene, sceneIndex) => {
    cursorMs += Math.max(0, scene.durationMs)
    const boundary = show.transitions?.find((transition) => (
      transition.afterSceneId === scene.id && transition.kind !== 'routing'
    ))
    const descriptor = boundary?.propertyTransitions?.sample?.repeatScale
    const ramp = {
      atMs: cursorMs,
      from: clampShowRepeatScale(descriptor?.from ?? scene.sampleTargets?.repeatScale ?? 1),
      to: clampShowRepeatScale(show.scenes[sceneIndex + 1]?.sampleTargets?.repeatScale ?? 1),
      durationMs: descriptor?.durationMs ?? 0,
      easing: descriptor?.easing ?? { curve: 'linear' as const },
    }
    if (includeTransitionDurations) {
      cursorMs += Math.max(0, showVisualTransitionAfter(show, scene.id)?.durationMs ?? 0)
    }
    return ramp
  })
  return {
    repeatScale: {
      initial: clampShowRepeatScale(show.scenes[0]?.sampleTargets?.repeatScale ?? 1),
      ramps,
    },
  }
}

export function transitionCost(kind: ShowTransitionKind): ShowTransitionCost {
  if (kind === 'crossfade') return 'expensive'
  if (kind === 'portal') return 'expensive'
  if (kind === 'motion') return 'expensive'
  if (kind === 'fade-color' || kind === 'wipe' || kind === 'dither') return 'cheap'
  return 'free'
}

function sceneIndex(show: ShowRecord, sceneId: string): number {
  const index = show.scenes.findIndex((scene) => scene.id === sceneId)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function sceneToGridColumn(index: number): number {
  return 2 + index * 2
}

// Scene durations keep a 1,000 ms floor; transition durations do not. The
// authoring contract has declared transition durationMs min 0 since #443,
// and the editors expose min 0 - the old floor here was a vestige of the
// pre-compiler scene-strip editor (#318) that silently rewrote authored
// sub-second fades (#823).
/**
 * Forfeits the deterministic-loop stamp whenever an edit changes the cast -
 * top-level or group Pattern instances. The exact-reset proof (#823 wrap
 * census) binds to the authored cast, so any source change, addition, or
 * removal invalidates it regardless of which authoring op made it. Applied
 * centrally at the store's update choke point.
 */
export function forfeitShowExecutionModelOnCastChange(previous: ShowRecord, next: ShowRecord): ShowRecord {
  if (next.composition?.executionModel === undefined) return next
  // First materialization carries no prior claim to invalidate: stamping a
  // freshly materialized composition is a deliberate authoring act (#586).
  if (!previous.composition) return next
  const castOf = (record: ShowRecord) => JSON.stringify([
    record.composition?.patternInstances.map((instance) => [instance.id, instance.pattern.kind, instance.pattern.id]) ?? null,
    record.composition?.groupDefinitions?.map((definition) => (
      definition.patternInstances.map((instance) => [instance.id, instance.pattern.kind, instance.pattern.id])
    )) ?? null,
    // Each Group occurrence materializes its own runtime instances, so the
    // occurrence roster is part of the effective cast: duplicating or
    // deleting one changes what the wrap census proved.
    record.composition?.groupOccurrences?.map((occurrence) => (
      [occurrence.id, occurrence.definitionId]
    )) ?? null,
  ])
  if (castOf(previous) === castOf(next)) return next
  return { ...next, composition: { ...next.composition, executionModel: undefined } }
}

/**
 * The inverse guard: an update whose cast still equals the previous record's
 * cast keeps the previous deterministic-loop stamp, even when intermediate
 * transient state (a Try-with projection unwound through Clip Detail rather
 * than the slot picker) dropped it. Cast-equality is the same fingerprint the
 * forfeiture uses, so the pair is idempotent and symmetric (#823 review).
 */
export function reconcileShowExecutionModelOnCastReturn(previous: ShowRecord, next: ShowRecord): ShowRecord {
  if (!previous.composition?.executionModel || !next.composition) return next
  if (next.composition.executionModel !== undefined) return next
  if (castFingerprint(previous) !== castFingerprint(next)) return next
  return { ...next, composition: { ...next.composition, executionModel: previous.composition.executionModel } }
}

function castFingerprint(record: ShowRecord): string {
  return JSON.stringify([
    record.composition?.patternInstances.map((instance) => [instance.id, instance.pattern.kind, instance.pattern.id]) ?? null,
    record.composition?.groupDefinitions?.map((definition) => (
      definition.patternInstances.map((instance) => [instance.id, instance.pattern.kind, instance.pattern.id])
    )) ?? null,
    record.composition?.groupOccurrences?.map((occurrence) => (
      [occurrence.id, occurrence.definitionId]
    )) ?? null,
  ])
}

function clampTransitionDuration(durationMs: number): number {
  return Math.max(0, Math.round(durationMs))
}

function clampDuration(durationMs: number): number {
  return Math.max(1000, Math.round(durationMs))
}

function clampPropertyDuration(durationMs: number): number {
  return Math.max(100, Math.round(durationMs))
}

function clampPixelCount(pixelCount: number): number {
  if (!Number.isFinite(pixelCount)) return 1
  return Math.max(1, Math.round(pixelCount))
}

function normalizeAdaptations(adaptations: ShowCellAdaptations): ShowCellAdaptations {
  return {
    mirror: Boolean(adaptations.mirror),
    phase: clamp01(adaptations.phase),
    brightness: clamp01(adaptations.brightness),
    timeScale: Math.max(0, Math.min(4, adaptations.timeScale)),
    ...(adaptations.lightShutter
      ? {
          lightShutter: {
            rateHz: Math.max(0.01, Math.min(60, adaptations.lightShutter.rateHz)),
            duty: clamp01(adaptations.lightShutter.duty),
            phase: clamp01(adaptations.lightShutter.phase),
            clockBehavior: adaptations.lightShutter.clockBehavior === 'freeze' ? 'freeze' as const : 'continue' as const,
          },
      }
      : {}),
    ...(adaptations.steppedClock
      ? { steppedClock: { stepMs: Math.max(16, Math.min(60000, adaptations.steppedClock.stepMs)) } }
      : {}),
    ...(adaptations.timeOffsetMs !== undefined
      ? { timeOffsetMs: Math.max(0, Math.min(60000, adaptations.timeOffsetMs)) }
      : {}),
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function compileShowEffectRamps(
  fromCell: ShowCell,
  toCell: ShowCell,
  boundary: ShowBoundaryTransition | undefined,
): ShowEffectPropertyRampsRecipe | undefined {
  const ramps: ShowEffectPropertyRampsRecipe = {}
  if (sameShowEffectStructure(fromCell.effects, toCell.effects)) {
    const fromEffects = normalizeShowClipEffects(fromCell.effects)
    const toEffects = normalizeShowClipEffects(toCell.effects)
    for (const toEffect of toEffects) {
      const fromEffect = fromEffects.find((effect) => effect.id === toEffect.id && effect.kind === toEffect.kind)
      if (!fromEffect) continue
      for (const parameter of showEffectAnimatableParameterNames(toEffect)) {
        const descriptor = boundary?.propertyTransitions?.effects?.[toEffect.id]?.[parameter]
        const naturalFrom = showEffectNumericValue(fromEffect, parameter)
        const to = showEffectNumericValue(toEffect, parameter)
        const from = descriptor?.fromByCellId[toCell.id] ?? naturalFrom
        if (!descriptor && from === to) continue
        ramps[toEffect.id] ??= {}
        ramps[toEffect.id][parameter] = {
          from,
          to,
          durationMs: descriptor?.durationMs ?? boundary?.durationMs ?? 2000,
          easing: descriptor?.easing ?? boundary?.easing ?? { curve: 'linear' },
        }
      }
    }
  }
  const fromTransform = normalizeShowClipTransform(fromCell.transform)
  const toTransform = normalizeShowClipTransform(toCell.transform)
  for (const property of Object.keys(boundary?.propertyTransitions?.transform ?? {}) as ShowClipTransformProperty[]) {
    const descriptor = boundary?.propertyTransitions?.transform?.[property]
    if (!descriptor) continue
    const target = showClipTransformEffectTarget(property)
    ramps[target.effectId] ??= {}
    ramps[target.effectId][target.parameter] = {
      from: descriptor.fromByCellId[toCell.id] ?? fromTransform[property],
      to: toTransform[property],
      durationMs: descriptor.durationMs ?? boundary?.durationMs ?? 2_000,
      easing: descriptor.easing ?? boundary?.easing ?? { curve: 'linear' },
    }
  }
  return Object.keys(ramps).length > 0 ? ramps : undefined
}

function compilerAdaptation(adaptations: ShowCellAdaptations): ShowClipAdaptation {
  return {
    brightness: adaptations.brightness,
    phase: adaptations.phase,
    timeScale: adaptations.timeScale,
    mirror: adaptations.mirror,
    ...(adaptations.lightShutter ? { lightShutter: { ...adaptations.lightShutter } } : {}),
    ...(adaptations.steppedClock ? { steppedClock: { ...adaptations.steppedClock } } : {}),
    timeOffsetMs: adaptations.timeOffsetMs ?? 0,
  }
}

function isSamePattern(a: ShowCell, b: ShowCell): boolean {
  return a.pattern.kind === b.pattern.kind && a.pattern.id === b.pattern.id
}

function hasSameDiscreteAdaptations(a: ShowCell, b: ShowCell): boolean {
  const aShutter = a.adaptations.lightShutter
  const bShutter = b.adaptations.lightShutter
  const sameShutter = !aShutter || !bShutter
    ? aShutter === bShutter
    : aShutter.rateHz === bShutter.rateHz
    && aShutter.duty === bShutter.duty
    && aShutter.phase === bShutter.phase
    && aShutter.clockBehavior === bShutter.clockBehavior
  const aSteppedClock = a.adaptations.steppedClock
  const bSteppedClock = b.adaptations.steppedClock
  const sameSteppedClock = !aSteppedClock || !bSteppedClock
    ? aSteppedClock === bSteppedClock
    : aSteppedClock.stepMs === bSteppedClock.stepMs
  return sameShutter
    && sameSteppedClock
    && (a.adaptations.timeOffsetMs ?? 0) === (b.adaptations.timeOffsetMs ?? 0)
    && sameShowEffectStructure(a.effects, b.effects)
}

function nominalZones(zones: ShowZone[]): ControllerZone[] {
  let offset = 0
  return zones.map((zone) => {
    const pixelCount = clampPixelCount(zone.nominalPixelCount)
    const start = offset
    const end = offset + pixelCount - 1
    offset += pixelCount
    return {
      id: zone.id,
      name: zone.name,
      ranges: [{ start, end }],
    }
  })
}

function routingLayoutFromZones(id: string, name: string, zones: ShowZone[]): ShowRoutingLayout {
  return {
    id,
    name,
    zones: nominalZones(zones).map((zone) => ({
      zoneId: zone.id,
      ranges: zone.ranges.map((range) => ({ ...range })),
    })),
  }
}

function routingLayoutControllerZones(showZones: ShowZone[], layout: ShowRoutingLayout): ControllerZone[] {
  return showZones.map((zone) => ({
    id: `${layout.id}:${zone.id}`,
    name: zone.name,
    ranges: (layout.zones.find((entry) => entry.zoneId === zone.id)?.ranges ?? []).map((range) => ({ ...range })),
  }))
}

function appendZoneToLayout(layout: ShowRoutingLayout, zone: ShowZone): ShowRoutingLayout {
  const end = layout.zones.reduce((largest, entry) => (
    Math.max(largest, ...entry.ranges.map((range) => range.end))
  ), -1)
  const start = end + 1
  return {
    ...layout,
    ...(layout.logical ? { logical: appendZoneToLogicalRouting(layout.logical, zone.id) } : {}),
    zones: [
      ...layout.zones.map(cloneRoutingLayoutZone),
      { zoneId: zone.id, ranges: [{ start, end: start + clampPixelCount(zone.nominalPixelCount) - 1 }] },
    ],
  }
}

function appendZoneToLogicalRouting(logical: ShowLogicalRouting, zoneId: string): ShowLogicalRouting {
  const zoneIds = [...logical.zoneIds, zoneId]
  if (logical.kind === 'stripes') return { ...logical, zoneIds }
  if (logical.kind === 'rings') return { ...logical, zoneIds }
  if (logical.kind === 'pinwheel') return { ...logical, zoneIds }
  if (logical.kind === 'wave') return { ...logical, zoneIds }
  // Operators such as Single, Split, Soft Split, Checker, and Grid have fixed
  // arity. A horizontal stripe subdivision is the least surprising valid
  // default until the author chooses a more specific Portable topology.
  return { kind: 'stripes', axis: 'x', zoneIds }
}

function normalizeRoutingLayout(layout: ShowRoutingLayout): ShowRoutingLayout {
  return {
    id: layout.id,
    name: layout.name.trim() || 'Untitled layout',
    zones: layout.zones.map((zone) => ({
      zoneId: zone.zoneId,
      ranges: zone.ranges
        .map((range) => ({
          start: Math.max(0, Math.round(Math.min(range.start, range.end))),
          end: Math.max(0, Math.round(Math.max(range.start, range.end))),
        }))
        .sort((a, b) => a.start - b.start || a.end - b.end),
    })),
    logical: layout.logical ? cloneLogicalRouting(layout.logical) : undefined,
  }
}

function cloneRoutingLayoutZone(zone: ShowRoutingLayoutZone): ShowRoutingLayoutZone {
  return { zoneId: zone.zoneId, ranges: zone.ranges.map((range) => ({ ...range })) }
}

function cloneLogicalRouting(logical: NonNullable<ShowRoutingLayout['logical']>): NonNullable<ShowRoutingLayout['logical']> {
  return { ...logical, zoneIds: [...logical.zoneIds] } as NonNullable<ShowRoutingLayout['logical']>
}

function logicalRoutingRecipe(
  zones: ShowZone[],
  logical: NonNullable<ShowRoutingLayout['logical']>,
): NonNullable<ShowRoutingLayoutRecipe['logical']> {
  const zoneNameById = new Map(zones.map((zone) => [zone.id, zone.name]))
  const zoneNames = logical.zoneIds.map((zoneId) => zoneNameById.get(zoneId) ?? zoneId)
  if (logical.kind === 'single') return { kind: logical.kind, zoneNames: [zoneNames[0]] }
  if (logical.kind === 'grid') {
    return { kind: logical.kind, zoneNames, columns: logical.columns, rows: logical.rows }
  }
  if (logical.kind === 'stripes') return { kind: logical.kind, zoneNames, axis: logical.axis }
  if (logical.kind === 'checker') {
    return { kind: logical.kind, zoneNames: [zoneNames[0], zoneNames[1]], columns: logical.columns, rows: logical.rows }
  }
  if (logical.kind === 'rings') return { kind: logical.kind, zoneNames, rings: logical.rings }
  if (logical.kind === 'wave') {
    return {
      kind: logical.kind,
      zoneNames,
      axis: logical.axis,
      bands: logical.bands,
      amplitude: logical.amplitude,
      frequency: logical.frequency,
      phase: logical.phase,
    }
  }
  if (logical.kind === 'soft-split') {
    return {
      kind: logical.kind,
      zoneNames: [zoneNames[0], zoneNames[1]],
      axis: logical.axis,
      feather: logical.feather,
    }
  }
  if (logical.kind === 'split') return { kind: logical.kind, zoneNames: [zoneNames[0], zoneNames[1]], axis: logical.axis }
  return {
    kind: logical.kind,
    zoneNames,
    arms: logical.arms ?? zoneNames.length,
    twist: logical.twist,
    rotation: logical.rotation ?? 0,
  }
}

function cellCoveringScene(show: ShowRecord, zoneId: string, sceneIndex: number): ShowCell | undefined {
  const sceneIndexById = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  return show.cells.find((cell) => {
    if (cell.zoneId !== zoneId) return false
    const start = sceneIndexById.get(cell.sceneId)
    if (start == null) return false
    return start <= sceneIndex && sceneIndex < start + Math.max(1, cell.sceneSpan)
  })
}

function copyCellForScene(
  source: ShowCell | undefined,
  id: string,
  zoneId: string,
  sceneId: string,
  sceneIndex: number,
): ShowCell {
  if (!source) return defaultCell(id, zoneId, sceneId, sceneIndex)
  return {
    ...source,
    id,
    zoneId,
    sceneId,
    sceneSpan: 1,
    zoneSpan: 1,
    pattern: { ...source.pattern },
    adaptations: {
      ...source.adaptations,
      ...(source.adaptations.lightShutter
        ? { lightShutter: { ...source.adaptations.lightShutter } }
        : {}),
      ...(source.adaptations.steppedClock
        ? { steppedClock: { ...source.adaptations.steppedClock } }
        : {}),
    },
    ...(source.controlTargets ? { controlTargets: { ...source.controlTargets } } : {}),
    restartOnEntry: false,
  }
}

function cloneShowCellAdaptations(adaptations: ShowCellAdaptations): ShowCellAdaptations {
  return {
    ...adaptations,
    ...(adaptations.lightShutter ? { lightShutter: { ...adaptations.lightShutter } } : {}),
    ...(adaptations.steppedClock ? { steppedClock: { ...adaptations.steppedClock } } : {}),
  }
}

function cloneCellForSplit(source: ShowCell, id: string, sceneId: string, sceneSpan: number): ShowCell {
  return {
    ...source,
    id,
    sceneId,
    sceneSpan,
    pattern: { ...source.pattern },
    adaptations: {
      ...source.adaptations,
      ...(source.adaptations.lightShutter
        ? { lightShutter: { ...source.adaptations.lightShutter } }
        : {}),
      ...(source.adaptations.steppedClock
        ? { steppedClock: { ...source.adaptations.steppedClock } }
        : {}),
    },
    restartOnEntry: false,
  }
}

function defaultCell(id: string, zoneId: string, sceneId: string, sceneIndex: number): ShowCell {
  return {
    id,
    zoneId,
    sceneId,
    sceneSpan: 1,
    zoneSpan: 1,
    pattern: { kind: 'stock', id: sceneIndex === 0 ? 'TestPattern1D' : 'CometLoom' },
    patternName: sceneIndex === 0 ? 'TestPattern1D' : 'CometLoom',
    adaptations: { ...DEFAULT_ADAPTATIONS },
    restartOnEntry: false,
  }
}

function nextEntityId(prefix: string, existing: Array<{ id: string }>): string {
  return nextStringId(prefix, new Set(existing.map((item) => item.id)))
}

function nextStringId(prefix: string, used: Set<string>): string {
  let index = used.size + 1
  let id = `${prefix}${index}`
  while (used.has(id)) {
    index += 1
    id = `${prefix}${index}`
  }
  return id
}

function uniqueZoneName(name: string, zones: ShowZone[]): string {
  const taken = new Set(zones.map((zone) => zone.name.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  let index = 2
  let next = `${name} ${index}`
  while (taken.has(next.toLowerCase())) {
    index += 1
    next = `${name} ${index}`
  }
  return next
}

function uniqueSceneName(name: string, scenes: ShowScene[]): string {
  const taken = new Set(scenes.map((scene) => scene.name.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  let index = 2
  let next = `${name} ${index}`
  while (taken.has(next.toLowerCase())) {
    index += 1
    next = `${name} ${index}`
  }
  return next
}

function uniqueRoutingLayoutName(name: string, layouts: ShowRoutingLayout[]): string {
  const taken = new Set(layouts.map((layout) => layout.name.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  let index = 2
  let next = `${name} ${index}`
  while (taken.has(next.toLowerCase())) {
    index += 1
    next = `${name} ${index}`
  }
  return next
}
