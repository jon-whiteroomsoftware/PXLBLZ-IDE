import { projectShowTimeline } from './showModel'
import type { FlatShowCompositionProjection, ShowCompositionPlacementProjection } from './showCompositionProjection'
import type { ShowBoundaryTransition, ShowClipEffect } from './personalContentRecords'

export interface SceneXrayCutReference {
  localTimeMs: number
  kind: 'entry' | 'exit'
  labels: string[]
  zoneIds: string[]
}

export interface SceneXrayEffectActivity {
  sourceCellId: string
  effectId: string
  effectKind: ShowClipEffect['kind']
  startMs: number
  endMs: number
  zoneIds: string[]
}

export interface SceneXrayPropertyBeat {
  property: string
  localTimeMs: number
  durationMs: number
  direction: 'incoming' | 'outgoing'
  sourceCellIds: string[]
}

export interface SceneReadOnlyBoundary {
  id: string
  kind: ShowBoundaryTransition['kind']
  durationMs: number
  easing: ShowBoundaryTransition['easing']
}

export interface SceneReadOnlyPlacement {
  id: string
  sourceCellId: string
  instanceId: string
  patternName: string
  compiled: boolean
  startMs: number
  endMs: number
  effectKinds: ShowClipEffect['kind'][]
  continuesFromPrevious: boolean
  continuesToNext: boolean
  diagnostics: string[]
}

export interface SceneReadOnlyZone {
  zoneId: string
  zoneName: string
  nominalPixelCount: number
  placements: SceneReadOnlyPlacement[]
}

export interface SceneReadOnlyBridgeProjection {
  sceneId: string
  sceneName: string
  durationMs: number
  globalStartMs: number
  globalEndMs: number
  incomingBoundary: SceneReadOnlyBoundary | null
  outgoingBoundary: SceneReadOnlyBoundary | null
  xray: {
    cutReferences: SceneXrayCutReference[]
    effectActivity: SceneXrayEffectActivity[]
    propertyBeats: SceneXrayPropertyBeat[]
  }
  zones: SceneReadOnlyZone[]
  diagnostics: string[]
}

/**
 * Shapes the version-0 composition sidecar for read-only Timeline disclosure.
 * It deliberately reports only signals represented by the current flat Show;
 * it does not synthesize sub-Scene edits or keyframes.
 */
export function projectSceneReadOnlyBridge(
  projection: FlatShowCompositionProjection,
  sceneId: string,
): SceneReadOnlyBridgeProjection {
  const sceneIndex = projection.scenes.findIndex((scene) => scene.id === sceneId)
  const scene = projection.scenes[sceneIndex]
  if (!scene) throw new Error(`Unknown Scene ${sceneId}.`)

  const show = projection.flatRecord
  const sourceScene = show.scenes.find((candidate) => candidate.id === sceneId)
  if (!sourceScene) throw new Error(`Scene ${sceneId} is missing from the flat Show.`)
  const timelineScene = projectShowTimeline(show).scenes.find((candidate) => candidate.sceneId === sceneId)
  if (!timelineScene) throw new Error(`Scene ${sceneId} has no Timeline range.`)

  const previousScene = projection.scenes[sceneIndex - 1]
  const nextScene = projection.scenes[sceneIndex + 1]
  const incoming = previousScene
    ? show.transitions?.find((transition) => transition.afterSceneId === previousScene.id && transition.kind !== 'routing') ?? null
    : null
  const outgoing = show.transitions?.find((transition) => transition.afterSceneId === scene.id && transition.kind !== 'routing') ?? null
  const instances = new Map(projection.patternInstances.map((instance) => [instance.id, instance]))
  const diagnosticsByCell = new Map<string, string[]>()
  for (const diagnostic of projection.diagnostics) {
    const cellIds = diagnostic.kind === 'compiler-omits-cell' ? [diagnostic.cellId] : diagnostic.cellIds
    for (const cellId of cellIds) {
      diagnosticsByCell.set(cellId, [...(diagnosticsByCell.get(cellId) ?? []), diagnostic.message])
    }
  }

  const placementByZone = new Map<string, ShowCompositionPlacementProjection[]>()
  for (const placement of scene.placements) {
    for (const zoneId of placement.zoneIds) {
      placementByZone.set(zoneId, [...(placementByZone.get(zoneId) ?? []), placement])
    }
  }

  const zones = show.zones.map((zone): SceneReadOnlyZone => ({
    zoneId: zone.id,
    zoneName: zone.name,
    nominalPixelCount: zone.nominalPixelCount,
    placements: (placementByZone.get(zone.id) ?? []).map((placement) => {
      const instance = instances.get(placement.instanceId)
      const previous = previousScene?.placements.some((candidate) => (
        candidate.sourceCellId === placement.sourceCellId
        && candidate.instanceId === placement.instanceId
        && candidate.zoneIds.includes(zone.id)
      )) ?? false
      const next = nextScene?.placements.some((candidate) => (
        candidate.sourceCellId === placement.sourceCellId
        && candidate.instanceId === placement.instanceId
        && candidate.zoneIds.includes(zone.id)
      )) ?? false
      return {
        id: placement.id,
        sourceCellId: placement.sourceCellId,
        instanceId: placement.instanceId,
        patternName: instance?.patternName ?? 'Unknown Pattern',
        compiled: instance?.compiled ?? false,
        startMs: placement.startMs,
        endMs: placement.startMs + placement.durationMs,
        effectKinds: (placement.appearance.effects ?? []).map((effect) => effect.kind),
        continuesFromPrevious: previous && placement.entryPolicy === 'continue',
        continuesToNext: next,
        diagnostics: diagnosticsByCell.get(placement.sourceCellId) ?? [],
      }
    }),
  })).filter((zone) => zone.placements.length > 0)

  const labels = [...new Set(zones.flatMap((zone) => zone.placements.map((placement) => placement.patternName)))]
  const activeZoneIds = zones.map((zone) => zone.zoneId)
  const cutReferences: SceneXrayCutReference[] = [
    { localTimeMs: 0, kind: 'entry', labels, zoneIds: activeZoneIds },
    { localTimeMs: scene.durationMs, kind: 'exit', labels, zoneIds: activeZoneIds },
  ]
  const effectActivity = scene.placements.flatMap((placement): SceneXrayEffectActivity[] => (
    (placement.appearance.effects ?? []).map((effect) => ({
      sourceCellId: placement.sourceCellId,
      effectId: effect.id,
      effectKind: effect.kind,
      startMs: placement.startMs,
      endMs: placement.startMs + placement.durationMs,
      zoneIds: placement.zoneIds,
    }))
  ))
  const propertyBeats = [
    ...projectBoundaryPropertyBeats(incoming, 'incoming', 0, scene.placements),
    ...projectBoundaryPropertyBeats(outgoing, 'outgoing', scene.durationMs, scene.placements),
  ]

  return {
    sceneId: scene.id,
    sceneName: scene.name,
    durationMs: scene.durationMs,
    globalStartMs: timelineScene.startMs,
    globalEndMs: timelineScene.endMs,
    incomingBoundary: boundarySummary(incoming),
    outgoingBoundary: boundarySummary(outgoing),
    xray: { cutReferences, effectActivity, propertyBeats },
    zones,
    diagnostics: [...new Set(zones.flatMap((zone) => zone.placements.flatMap((placement) => placement.diagnostics)))],
  }
}

function boundarySummary(boundary: ShowBoundaryTransition | null): SceneReadOnlyBoundary | null {
  return boundary ? {
    id: boundary.id,
    kind: boundary.kind,
    durationMs: boundary.durationMs,
    easing: boundary.easing,
  } : null
}

function projectBoundaryPropertyBeats(
  boundary: ShowBoundaryTransition | null,
  direction: 'incoming' | 'outgoing',
  localTimeMs: number,
  placements: ShowCompositionPlacementProjection[],
): SceneXrayPropertyBeat[] {
  const properties = boundary?.propertyTransitions
  if (!boundary || !properties) return []
  const sourceIds = new Set(placements.map((placement) => placement.sourceCellId))
  const beats: SceneXrayPropertyBeat[] = []
  const addCellProperty = (property: string, descriptor: { fromByCellId: Record<string, number>; durationMs?: number } | undefined) => {
    if (!descriptor) return
    const relevant = Object.keys(descriptor.fromByCellId).filter((cellId) => sourceIds.has(cellId))
    if (relevant.length === 0) return
    beats.push({
      property,
      localTimeMs,
      durationMs: descriptor.durationMs ?? boundary.durationMs,
      direction,
      sourceCellIds: relevant,
    })
  }
  addCellProperty('timeScale', properties.timeScale)
  addCellProperty('brightness', properties.brightness)
  for (const [name, descriptor] of Object.entries(properties.controls ?? {})) addCellProperty(name, descriptor)
  for (const [effectId, parameters] of Object.entries(properties.effects ?? {})) {
    for (const [parameter, descriptor] of Object.entries(parameters)) addCellProperty(`${effectId}.${parameter}`, descriptor)
  }
  if (properties.routing?.splitPosition) {
    beats.push({
      property: 'routing.splitPosition',
      localTimeMs,
      durationMs: properties.routing.splitPosition.durationMs ?? boundary.durationMs,
      direction,
      sourceCellIds: [],
    })
  }
  if (properties.sample?.repeatScale) {
    beats.push({
      property: 'sample.repeatScale',
      localTimeMs,
      durationMs: properties.sample.repeatScale.durationMs ?? boundary.durationMs,
      direction,
      sourceCellIds: [],
    })
  }
  return beats
}
