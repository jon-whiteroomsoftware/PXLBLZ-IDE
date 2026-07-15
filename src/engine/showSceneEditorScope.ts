import type { FlatShowCompositionProjection } from './showCompositionProjection'
import { showCellAtSlot } from './showModel'
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
    const routingSwitch = show.routingSwitches.find((candidate) => candidate.afterSceneId === afterSceneId)
    const next = routingSwitch
      ? show.routingLayouts.find((candidate) => candidate.id === routingSwitch.layoutId)
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

  const detail = projectSceneReadOnlyBridge(projection, scene.id)
  const zoneDetail = detail.zones.find((candidate) => candidate.zoneId === zone.id)
  const sceneIndex = show.scenes.findIndex((candidate) => candidate.id === scene.id)
  const previousSceneId = show.scenes[sceneIndex - 1]?.id
  const incomingBoundary = previousSceneId
    ? show.transitions?.find((boundary) => boundary.afterSceneId === previousSceneId && boundary.kind !== 'routing') ?? null
    : null
  const outgoingBoundary = show.transitions?.find(
    (boundary) => boundary.afterSceneId === scene.id && boundary.kind !== 'routing',
  ) ?? null

  return {
    scene,
    zone,
    layout: showRoutingLayoutForScene(show, scene.id),
    globalStartMs: detail.globalStartMs,
    globalEndMs: detail.globalEndMs,
    incomingBoundary,
    outgoingBoundary,
    mainPlacements: zoneDetail?.placements ?? [],
    availableZones: detail.zones.map((candidate) => {
      const source = show.zones.find((item) => item.id === candidate.zoneId)!
      return { id: source.id, name: source.name, nominalPixelCount: source.nominalPixelCount }
    }),
    diagnostics: [...detail.diagnostics, ...(zoneDetail?.placements.flatMap((placement) => placement.diagnostics) ?? [])],
  }
}
