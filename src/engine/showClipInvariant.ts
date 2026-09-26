import type { ShowCompositionV1 } from './personalContentRecords'

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
