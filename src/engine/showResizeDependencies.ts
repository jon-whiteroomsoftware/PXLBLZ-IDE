import type { ShowRecord } from './personalContentRecords'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import { showLayerTransitionConnectedClosure } from './showLayerTransitionAuthoring'

/** Finite internal context: no Groups, and only unrelated placement values are
 * excluded. Layer membership/order, all instances/tracks/Transitions, routing and
 * shared timing remain dependencies. Numeric projected indices are never alone. */
export function showResizeDependencyContext(show: ShowRecord, clipId: string): string | undefined {
  const composition = show.composition
  if (!composition || composition.groupOccurrences?.length || composition.groupDefinitions?.length) return undefined
  const clips = projectShowUnifiedTimeline(show, composition).zones.flatMap(zone => zone.layers.flatMap(layer => layer.clips))
  const target = clips.find(clip => clip.id === clipId)
  if (!target || target.groupOccurrenceId) return undefined
  const closure = new Set(showLayerTransitionConnectedClosure(composition, [clipId]))
  closure.add(clipId)
  const layers = clips.filter(clip => closure.has(clip.id))
  const dependent = (zoneId: string, kind: 'main' | 'overlay', index: number) => layers.some(clip => clip.zoneId === zoneId && clip.kind === kind && (kind === 'main' || clip.layerIndex === index))
  const identity = (placement: { id: string; instanceId: string; logicalClipId?: string }) => ({ id: placement.id, instanceId: placement.instanceId, logicalClipId: placement.logicalClipId })
  const { updatedAt: _stamp, ...record } = show
  return JSON.stringify({ ...record, composition: { ...composition, scenes: composition.scenes.map(scene => ({ ...scene, zones: scene.zones.map(zone => ({
    ...zone,
    main: dependent(zone.zoneId, 'main', -1) ? zone.main : zone.main.map(identity),
    overlays: zone.overlays.map((layer, index) => ({ ...layer, placements: dependent(zone.zoneId, 'overlay', index) ? layer.placements : layer.placements.map(identity) })),
  })) })) } })
}
