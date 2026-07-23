import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'

export function showCompositionClipCount(composition: ShowCompositionV1): number {
  const directClipCount = composition.scenes.reduce((sceneCount, scene) => (
    sceneCount + scene.zones.reduce((zoneCount, zone) => (
      zoneCount
      + zone.main.length
      + zone.overlays.reduce((layerCount, layer) => layerCount + layer.placements.length, 0)
    ), 0)
  ), 0)
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
