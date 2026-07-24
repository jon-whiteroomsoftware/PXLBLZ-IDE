import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'

export function showCompositionClipCount(composition: ShowCompositionV1): number {
  const directClipCount = new Set(composition.scenes.flatMap((scene) => (
    scene.zones.flatMap((zone) => [
      ...zone.main.map((placement) => placement.logicalClipId ?? placement.id),
      ...zone.overlays.flatMap((layer) => (
        layer.placements.map((placement) => placement.logicalClipId ?? placement.id)
      )),
    ])
  ))).size
  const definitionById = new Map(
    (composition.groupDefinitions ?? []).map((definition) => [definition.id, definition]),
  )
  const groupedClipCount = (composition.groupOccurrences ?? []).reduce((count, occurrence) => (
    count + (definitionById.get(occurrence.definitionId)?.placements.length ?? 0)
  ), 0)
  return directClipCount + groupedClipCount
}

export function showRecordClipCount(show: Pick<ShowRecord, 'cells' | 'composition'>): number {
  return show.composition ? showCompositionClipCount(show.composition) : show.cells.length
}

export interface MultiSegmentLogicalClip {
  id: string
  segments: Array<{ placementId: string; sceneId: string }>
}

export function multiSegmentLogicalClips(composition: ShowCompositionV1): MultiSegmentLogicalClip[] {
  const groups = new Map<string, MultiSegmentLogicalClip>()
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      for (const placement of [
        ...zone.main,
        ...zone.overlays.flatMap((layer) => layer.placements),
      ]) {
        const logicalClipId = placement.logicalClipId ?? placement.id
        const group = groups.get(logicalClipId) ?? { id: logicalClipId, segments: [] }
        group.segments.push({ placementId: placement.id, sceneId: scene.sceneId })
        groups.set(logicalClipId, group)
      }
    }
  }
  return [...groups.values()].filter((group) => group.segments.length > 1)
}

export function multiSegmentLogicalPlacementIds(composition: ShowCompositionV1): Set<string> {
  return new Set(multiSegmentLogicalClips(composition)
    .flatMap((group) => group.segments.map((segment) => segment.placementId)))
}
