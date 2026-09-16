import type { ShowLayerV2, ShowRecordV2 } from './showCompositionV2'
import { layerReferences, type ShowLayerEditIntentV2, type LayerReference } from './showLayersV2'

export interface ShowV2LayerEditorLayer extends ShowLayerV2 { references: LayerReference[] }
export function buildShowV2LayerEditorModel(record: ShowRecordV2): { layers: ShowV2LayerEditorLayer[] } {
  return { layers: record.zones.flatMap(zone => record.composition.layers
    .filter(layer => layer.zoneId === zone.id).sort((a, b) => a.rank - b.rank)
    .map(layer => ({ ...layer, references: layerReferences(record, layer.id) }))) }
}

export type ShowV2LayerAddPlan = { status: 'ready'; intent: Extract<ShowLayerEditIntentV2, { kind: 'add' }> }
  | { status: 'refused'; message: string }
/** Adapter allocation only: one explicit top Layer, no rank normalization or retry. */
export function createShowV2LayerAtTopIntent(record: ShowRecordV2, zoneId: string, name: string, allocate: () => string): ShowV2LayerAddPlan {
  if (!record.zones.some(zone => zone.id === zoneId) || !name.trim()) return { status: 'refused', message: 'Choose a Zone and give the Layer a name.' }
  const ranks = record.composition.layers.filter(layer => layer.zoneId === zoneId).map(layer => layer.rank)
  const rank = ranks.length ? Math.max(...ranks) + 1 : 0
  if (!Number.isSafeInteger(rank) || rank < 0) return { status: 'refused', message: 'The top Layer rank exceeds safe integer range.' }
  const id = allocate()
  if (typeof id !== 'string' || !id.trim() || record.composition.layers.some(layer => layer.id === id)) return { status: 'refused', message: 'Fresh Layer identity conflicts. Try the edit again.' }
  return { status: 'ready', intent: { kind: 'add', layer: { id, zoneId, name, rank } } }
}

export function reorderShowV2LayerIntent(record: ShowRecordV2, layerId: string, direction: 'up' | 'down'): Extract<ShowLayerEditIntentV2, { kind: 'reorder' }> | null {
  const layer = record.composition.layers.find(layer => layer.id === layerId)
  if (!layer) return null
  const order = record.composition.layers.filter(value => value.zoneId === layer.zoneId).sort((a, b) => a.rank - b.rank).map(value => value.id)
  const index = order.indexOf(layerId), next = index + (direction === 'up' ? 1 : -1)
  if (next < 0 || next >= order.length) return null
  ;[order[index], order[next]] = [order[next], order[index]]
  return { kind: 'reorder', zoneId: layer.zoneId, layerIds: order }
}
