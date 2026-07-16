import { projectShowTimeline } from './showModel'
import type {
  FlatShowCompositionProjection,
  ShowCompositionPatternInstanceProjection,
  ShowCompositionPlacementProjection,
} from './showCompositionProjection'
import type { ShowBoundaryTransition, ShowClipEffect, ShowTransitionEasing } from './personalContentRecords'
import { showClipEffectParameterValue } from './showEffectAuthoring'
import {
  projectGlobalShowScenePropertyLanes,
  projectShowPropertyLane,
  type ShowPropertyLaneProjection,
} from './showPropertyLaneProjection'

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
  ownerId: string
  fromValue: number
  toValue: number
  easing: ShowTransitionEasing
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

export interface SceneReadOnlyLayer {
  id: string
  name: string
  role: 'main' | 'overlay'
  placements: SceneReadOnlyPlacement[]
}

export interface SceneCompositionSummary {
  placementCount: number
  layerCount: number
  effectCount: number
  animationCount: number
  nontrivial: boolean
}

export interface SceneReadOnlyZone {
  zoneId: string
  zoneName: string
  nominalPixelCount: number
  placements: SceneReadOnlyPlacement[]
  layers: SceneReadOnlyLayer[]
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
  summary: SceneCompositionSummary
  localAnimations: Array<{
    id: string
    label: string
    zoneId: string
    projection: ShowPropertyLaneProjection
  }>
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
  if (show.composition) {
    return projectAuthoredSceneReadOnlyBridge(
      show,
      scene.id,
      timelineScene.startMs,
      timelineScene.endMs,
      incoming,
      outgoing,
      scene.placements,
      new Map(projection.patternInstances.map((instance) => [instance.id, instance])),
    )
  }
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

  const zones = show.zones.map((zone): SceneReadOnlyZone => {
    const placements = (placementByZone.get(zone.id) ?? []).map((placement) => {
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
    })
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      nominalPixelCount: zone.nominalPixelCount,
      placements,
      layers: placements.length > 0 ? [{ id: 'main', name: 'Main', role: 'main', placements }] : [],
    }
  }).filter((zone) => zone.placements.length > 0)

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
    ...projectBoundaryPropertyBeats(incoming, 'incoming', 0, scene.placements, instances),
    ...projectBoundaryPropertyBeats(outgoing, 'outgoing', scene.durationMs, nextScene?.placements ?? [], instances),
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
    summary: summarizeReadOnlyZones(zones, 0),
    localAnimations: [],
    zones,
    diagnostics: [...new Set(zones.flatMap((zone) => zone.placements.flatMap((placement) => placement.diagnostics)))],
  }
}

/** Summarize one authored Scene x Zone for the compact global Timeline cell. */
export function projectSceneCompositionSummary(
  show: Pick<import('./personalContentRecords').ShowRecord, 'composition'>,
  sceneId: string,
  zoneId: string,
): SceneCompositionSummary | null {
  const scene = show.composition?.scenes.find((candidate) => candidate.sceneId === sceneId)
  const zone = scene?.zones.find((candidate) => candidate.zoneId === zoneId)
  if (!scene || !zone) return null
  const layers = [
    ...(zone.main.length > 0 ? [zone.main] : []),
    ...zone.overlays.filter((layer) => layer.placements.length > 0).map((layer) => layer.placements),
  ]
  const placements = layers.flat()
  const placementIds = new Set(placements.map((placement) => placement.id))
  const instanceIds = new Set(placements.map((placement) => placement.instanceId))
  const animationCount = (scene.propertyTracks ?? []).filter((track) => (
    'placementId' in track.target
      ? placementIds.has(track.target.placementId)
      : instanceIds.has(track.target.instanceId)
  )).length
  return summarizeCounts(
    placements.length,
    layers.length,
    placements.reduce((count, placement) => count + (placement.effects?.length ?? 0), 0),
    animationCount,
  )
}

function projectAuthoredSceneReadOnlyBridge(
  show: import('./personalContentRecords').ShowRecord,
  sceneId: string,
  globalStartMs: number,
  globalEndMs: number,
  incoming: ShowBoundaryTransition | null,
  outgoing: ShowBoundaryTransition | null,
  flatPlacements: ShowCompositionPlacementProjection[],
  flatInstances: Map<string, ShowCompositionPatternInstanceProjection>,
): SceneReadOnlyBridgeProjection {
  const scene = show.scenes.find((candidate) => candidate.id === sceneId)!
  const authored = show.composition!.scenes.find((candidate) => candidate.sceneId === sceneId)
  const instances = new Map(show.composition!.patternInstances.map((instance) => [instance.id, instance]))
  const missingInstances = new Set<string>()
  const zones = show.zones.flatMap((zone): SceneReadOnlyZone[] => {
    const zoneComposition = authored?.zones.find((candidate) => candidate.zoneId === zone.id)
    if (!zoneComposition) return []
    const toPlacements = (
      placements: Array<import('./personalContentRecords').ShowMainPlacement | import('./personalContentRecords').ShowOverlayPlacement>,
    ): SceneReadOnlyPlacement[] => placements.map((placement, index) => {
      const instance = instances.get(placement.instanceId)
      if (!instance) missingInstances.add(placement.instanceId)
      const previous = placements[index - 1]
      const next = placements[index + 1]
      return {
        id: placement.id,
        sourceCellId: placement.id,
        instanceId: placement.instanceId,
        patternName: instance?.patternName ?? 'Missing Pattern',
        compiled: Boolean(instance),
        startMs: placement.startMs,
        endMs: placement.startMs + placement.durationMs,
        effectKinds: (placement.effects ?? []).map((effect) => effect.kind),
        continuesFromPrevious: Boolean(previous
          && previous.instanceId === placement.instanceId
          && previous.startMs + previous.durationMs === placement.startMs),
        continuesToNext: Boolean(next
          && next.instanceId === placement.instanceId
          && placement.startMs + placement.durationMs === next.startMs),
        diagnostics: instance ? [] : [`Pattern instance ${placement.instanceId} is missing.`],
      }
    })
    const layers: SceneReadOnlyLayer[] = [
      ...zoneComposition.overlays
        .filter((layer) => layer.placements.length > 0)
        .map((layer) => ({
          id: layer.id,
          name: layer.name,
          role: 'overlay' as const,
          placements: toPlacements(layer.placements),
        })),
      ...(zoneComposition.main.length > 0
        ? [{ id: 'main', name: 'Main', role: 'main' as const, placements: toPlacements(zoneComposition.main) }]
        : []),
    ]
    return [{
      zoneId: zone.id,
      zoneName: zone.name,
      nominalPixelCount: zone.nominalPixelCount,
      layers,
      placements: layers.flatMap((layer) => layer.placements),
    }]
  })
  const animationCount = authored?.propertyTracks?.length ?? 0
  const summary = summarizeReadOnlyZones(zones, animationCount)
  const boundaries = [...new Set([
    0,
    scene.durationMs,
    ...zones.flatMap((zone) => zone.placements.flatMap((placement) => [placement.startMs, placement.endMs])),
  ])].sort((left, right) => left - right)
  const labels = [...new Set(zones.flatMap((zone) => zone.placements.map((placement) => placement.patternName)))]
  const activeZoneIds = zones.map((zone) => zone.zoneId)
  const cutReferences: SceneXrayCutReference[] = boundaries.map((localTimeMs, index) => ({
    localTimeMs,
    kind: index === boundaries.length - 1 ? 'exit' : 'entry',
    labels,
    zoneIds: activeZoneIds,
  }))
  const effectActivity = zones.flatMap((zone) => zone.placements.flatMap((placement) => (
    placement.effectKinds.map((effectKind, index) => ({
      sourceCellId: placement.sourceCellId,
      effectId: `${placement.id}-${effectKind}-${index}`,
      effectKind,
      startMs: placement.startMs,
      endMs: placement.endMs,
      zoneIds: [zone.zoneId],
    }))
  )))
  const propertyBeats = [
    ...projectBoundaryPropertyBeats(incoming, 'incoming', 0, flatPlacements, flatInstances),
    ...projectBoundaryPropertyBeats(outgoing, 'outgoing', scene.durationMs, [], flatInstances),
  ]
  const localAnimations = projectGlobalShowScenePropertyLanes(show)
    .filter((lane) => lane.sceneId === sceneId)
    .map((lane) => ({
      id: lane.id,
      label: lane.label,
      zoneId: lane.zoneId,
      projection: {
        ...lane.projection,
        durationMs: scene.durationMs,
        samples: lane.projection.samples.map((sample) => {
          const timeMs = sample.timeMs - globalStartMs
          return { ...sample, timeMs, displayX: timeMs / Math.max(1, scene.durationMs) }
        }),
        beats: lane.projection.beats.map((beat) => {
          const timeMs = beat.timeMs - globalStartMs
          return { ...beat, timeMs, displayX: timeMs / Math.max(1, scene.durationMs) }
        }),
      },
    }))
  return {
    sceneId,
    sceneName: scene.name,
    durationMs: scene.durationMs,
    globalStartMs,
    globalEndMs,
    incomingBoundary: boundarySummary(incoming),
    outgoingBoundary: boundarySummary(outgoing),
    xray: { cutReferences, effectActivity, propertyBeats },
    summary,
    localAnimations,
    zones,
    diagnostics: [...missingInstances].map((id) => `Pattern instance ${id} is missing.`),
  }
}

function summarizeReadOnlyZones(zones: SceneReadOnlyZone[], animationCount: number): SceneCompositionSummary {
  return summarizeCounts(
    zones.reduce((count, zone) => count + zone.placements.length, 0),
    zones.reduce((count, zone) => count + zone.layers.length, 0),
    zones.reduce((count, zone) => count + zone.placements.reduce(
      (placementCount, placement) => placementCount + placement.effectKinds.length,
      0,
    ), 0),
    animationCount,
  )
}

function summarizeCounts(
  placementCount: number,
  layerCount: number,
  effectCount: number,
  animationCount: number,
): SceneCompositionSummary {
  return {
    placementCount,
    layerCount,
    effectCount,
    animationCount,
    nontrivial: placementCount !== 1 || layerCount > 1 || effectCount > 0 || animationCount > 0,
  }
}

export function projectSceneXrayPropertyLane(
  beat: SceneXrayPropertyBeat,
  sceneDurationMs: number,
): ShowPropertyLaneProjection {
  const startMs = beat.direction === 'incoming'
    ? 0
    : Math.max(0, sceneDurationMs - beat.durationMs)
  const endMs = Math.min(sceneDurationMs, startMs + beat.durationMs)
  const constraint = beat.property === 'timeScale'
    ? { min: 0, max: 4 }
    : { min: Math.min(0, beat.fromValue, beat.toValue), max: Math.max(1, beat.fromValue, beat.toValue) }
  const baseId = `${beat.ownerId}:${beat.property}:${beat.sourceCellIds.join(',')}`
  return projectShowPropertyLane({
    durationMs: sceneDurationMs,
    constraint,
    defaultValue: beat.fromValue,
    segments: [
      {
        id: `${baseId}:before`,
        startMs: 0,
        endMs: startMs,
        from: beat.fromValue,
        to: beat.fromValue,
        easing: { curve: 'linear' },
      },
      {
        id: `${baseId}:ramp`,
        startMs,
        endMs,
        from: beat.fromValue,
        to: beat.toValue,
        easing: beat.easing,
      },
      {
        id: `${baseId}:after`,
        startMs: endMs,
        endMs: sceneDurationMs,
        from: beat.toValue,
        to: beat.toValue,
        easing: { curve: 'linear' },
      },
    ],
    beats: [
      { id: `${baseId}:start`, timeMs: startMs, value: beat.fromValue, kind: 'boundary', ownerId: beat.ownerId, label: `${beat.property} starts` },
      { id: `${baseId}:end`, timeMs: endMs, value: beat.toValue, kind: 'boundary', ownerId: beat.ownerId, label: `${beat.property} reaches target` },
    ],
  })
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
  instances: Map<string, ShowCompositionPatternInstanceProjection>,
): SceneXrayPropertyBeat[] {
  const properties = boundary?.propertyTransitions
  if (!boundary || !properties) return []
  const sourceIds = new Set(placements.map((placement) => placement.sourceCellId))
  const beats: SceneXrayPropertyBeat[] = []
  const addCellProperty = (
    property: string,
    descriptor: { fromByCellId: Record<string, number>; durationMs?: number; easing?: ShowTransitionEasing } | undefined,
  ) => {
    if (!descriptor) return
    for (const cellId of Object.keys(descriptor.fromByCellId).filter((candidate) => sourceIds.has(candidate))) {
      const placement = placements.find((candidate) => candidate.sourceCellId === cellId)
      const toValue = placement ? placementPropertyValue(property, placement, instances.get(placement.instanceId)) : undefined
      if (toValue === undefined) continue
      beats.push({
        property,
        localTimeMs,
        durationMs: descriptor.durationMs ?? boundary.durationMs,
        direction,
        sourceCellIds: [cellId],
        ownerId: boundary.id,
        fromValue: descriptor.fromByCellId[cellId],
        toValue,
        easing: descriptor.easing ?? boundary.easing,
      })
    }
  }
  addCellProperty('timeScale', properties.timeScale)
  addCellProperty('brightness', properties.brightness)
  for (const [name, descriptor] of Object.entries(properties.controls ?? {})) addCellProperty(name, descriptor)
  for (const [effectId, parameters] of Object.entries(properties.effects ?? {})) {
    for (const [parameter, descriptor] of Object.entries(parameters)) addCellProperty(`${effectId}.${parameter}`, descriptor)
  }
  return beats
}

function placementPropertyValue(
  property: string,
  placement: ShowCompositionPlacementProjection,
  instance: ShowCompositionPatternInstanceProjection | undefined,
): number | undefined {
  if (property === 'timeScale') return instance?.simulation.timeScale
  if (property === 'brightness') return placement.appearance.brightness
  if (!property.includes('.')) return instance?.simulation.controlTargets?.[property]
  const [effectId, parameterId] = property.split('.', 2)
  const effect = placement.appearance.effects?.find((candidate) => candidate.id === effectId)
  const value = effect ? showClipEffectParameterValue(effect, parameterId) : undefined
  return typeof value === 'number' ? value : undefined
}
