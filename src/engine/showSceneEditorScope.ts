import type { FlatShowCompositionProjection } from './showCompositionProjection'
import { projectShowTimeline, showCellAtSlot, showRoutingTransitionAfter } from './showModel'
import { validateShowComposition } from './showCompositionModel'
import { projectSceneReadOnlyBridge, type SceneReadOnlyPlacement } from './showSceneReadOnlyProjection'
import type {
  ShowBoundaryTransition,
  ShowRecord,
  ShowRoutingLayout,
  ShowScene,
  ShowZone,
} from './personalContentRecords'

export interface ShowSceneEditorScope {
  sceneId: string
  zoneId: string
}

export interface ShowSceneEditorProjection {
  scene: ShowScene
  zone: ShowZone
  layout: ShowRoutingLayout | null
  globalStartMs: number
  globalEndMs: number
  incomingBoundary: ShowBoundaryTransition | null
  outgoingBoundary: ShowBoundaryTransition | null
  mainPlacements: SceneReadOnlyPlacement[]
  overlayLayers: Array<{
    id: string
    name: string
    placements: Array<SceneReadOnlyPlacement & { opacity: number }>
  }>
  availableZones: Array<Pick<ShowZone, 'id' | 'name' | 'nominalPixelCount'>>
  diagnostics: string[]
}

/**
 * Resolve the requested production authoring scope without inventing local
 * content. A missing Scene closes the scope; a stale Zone falls back to the
 * first Zone with a flat placement in that Scene, then to the first Show Zone.
 */
export function resolveShowSceneEditorScope(
  show: ShowRecord,
  requested: ShowSceneEditorScope,
): ShowSceneEditorScope | null {
  const scene = show.scenes.find((candidate) => candidate.id === requested.sceneId)
  if (!scene) return null

  const requestedZone = show.zones.find((candidate) => candidate.id === requested.zoneId)
  if (show.composition && requestedZone) return requested
  if (requestedZone && showCellAtSlot(show, requestedZone.id, scene.id)) return requested

  const activeZone = show.zones.find((zone) => showCellAtSlot(show, zone.id, scene.id))
    ?? show.zones[0]
  return activeZone ? { sceneId: scene.id, zoneId: activeZone.id } : null
}

/** Return the Zone Layout active for a top-level Scene. */
export function showRoutingLayoutForScene(
  show: ShowRecord,
  sceneId: string,
): ShowRoutingLayout | null {
  const targetIndex = show.scenes.findIndex((scene) => scene.id === sceneId)
  if (targetIndex < 0) return null

  let layout = show.routingLayouts[0] ?? null
  for (let index = 0; index < targetIndex; index += 1) {
    const afterSceneId = show.scenes[index]?.id
    const routingTransition = showRoutingTransitionAfter(show, afterSceneId)
    const next = routingTransition?.layoutId
      ? show.routingLayouts.find((candidate) => candidate.id === routingTransition.layoutId)
      : undefined
    if (next) layout = next
  }
  return layout
}

/**
 * Narrow the lossless version-0 composition projection to one editable
 * Scene x Zone shell. The returned Main placements still point to real flat
 * Show cells, so existing mutations and compilation remain authoritative.
 */
export function projectShowSceneEditorScope(
  projection: FlatShowCompositionProjection,
  requested: ShowSceneEditorScope,
): ShowSceneEditorProjection | null {
  const show = projection.flatRecord
  const scope = resolveShowSceneEditorScope(show, requested)
  if (!scope) return null

  const scene = show.scenes.find((candidate) => candidate.id === scope.sceneId)
  const zone = show.zones.find((candidate) => candidate.id === scope.zoneId)
  if (!scene || !zone) return null

  const sceneIndex = show.scenes.findIndex((candidate) => candidate.id === scene.id)
  const previousSceneId = show.scenes[sceneIndex - 1]?.id
  const incomingBoundary = previousSceneId
    ? show.transitions?.find((boundary) => boundary.afterSceneId === previousSceneId && boundary.kind !== 'routing') ?? null
    : null
  const outgoingBoundary = show.transitions?.find(
    (boundary) => boundary.afterSceneId === scene.id && boundary.kind !== 'routing',
  ) ?? null

  if (show.composition) {
    const timelineScene = projectShowTimeline(show).scenes.find((candidate) => candidate.sceneId === scene.id)
    if (!timelineScene) return null
    const sceneComposition = show.composition.scenes.find((candidate) => candidate.sceneId === scene.id)
    const zoneComposition = sceneComposition?.zones.find((candidate) => candidate.zoneId === zone.id)
    const instances = new Map(show.composition.patternInstances.map((instance) => [instance.id, instance]))
    const placements = zoneComposition?.main ?? []
    const mainPlacements: SceneReadOnlyPlacement[] = placements.map((placement, index) => {
      const instance = instances.get(placement.instanceId)
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
        diagnostics: [],
      }
    })
    const overlayLayers = (zoneComposition?.overlays ?? []).map((layer) => ({
      id: layer.id,
      name: layer.name,
      placements: layer.placements.map((placement, index) => {
        const instance = instances.get(placement.instanceId)
        const previous = layer.placements[index - 1]
        const next = layer.placements[index + 1]
        return {
          id: placement.id,
          sourceCellId: placement.id,
          instanceId: placement.instanceId,
          patternName: instance?.patternName ?? 'Missing Pattern',
          compiled: Boolean(instance),
          startMs: placement.startMs,
          endMs: placement.startMs + placement.durationMs,
          opacity: placement.opacity,
          effectKinds: (placement.effects ?? []).map((effect) => effect.kind),
          continuesFromPrevious: Boolean(previous
            && previous.instanceId === placement.instanceId
            && previous.startMs + previous.durationMs === placement.startMs),
          continuesToNext: Boolean(next
            && next.instanceId === placement.instanceId
            && placement.startMs + placement.durationMs === next.startMs),
          diagnostics: [],
        }
      }),
    }))
    return {
      scene,
      zone,
      layout: showRoutingLayoutForScene(show, scene.id),
      globalStartMs: timelineScene.startMs,
      globalEndMs: timelineScene.endMs,
      incomingBoundary,
      outgoingBoundary,
      mainPlacements,
      overlayLayers,
      availableZones: show.zones.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        nominalPixelCount: candidate.nominalPixelCount,
      })),
      diagnostics: validateShowComposition(show, show.composition).map((issue) => `${issue.path}: ${issue.message}`),
    }
  }

  const detail = projectSceneReadOnlyBridge(projection, scene.id)
  const zoneDetail = detail.zones.find((candidate) => candidate.zoneId === zone.id)

  return {
    scene,
    zone,
    layout: showRoutingLayoutForScene(show, scene.id),
    globalStartMs: detail.globalStartMs,
    globalEndMs: detail.globalEndMs,
    incomingBoundary,
    outgoingBoundary,
    mainPlacements: zoneDetail?.placements ?? [],
    overlayLayers: [],
    availableZones: detail.zones.map((candidate) => {
      const source = show.zones.find((item) => item.id === candidate.zoneId)!
      return { id: source.id, name: source.name, nominalPixelCount: source.nominalPixelCount }
    }),
    diagnostics: [...detail.diagnostics, ...(zoneDetail?.placements.flatMap((placement) => placement.diagnostics) ?? [])],
  }
}
