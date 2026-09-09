import type { ShowRecord } from '../personalContentRecords'
import { newPersonalContentId } from '../personalContentMetadata'
import { addShowOverlayLayerAcrossTimeline } from '../showTimelineClipAuthoring'
import { commandComposition, refuseShowCommand, withComposition, type ShowCommandDescriptor } from './registry'

/** Caller-local ID policy; all Layer mutation remains in the manual authoring owner. */
export function overlayLayerCommandOutcome(record: ShowRecord, input: Record<string, unknown>, newId = newPersonalContentId) {
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const zoneId = input.zone_id as string
  if (!record.zones.some(zone => zone.id === zoneId)) return refuseShowCommand({ code: 'unknown-zone', message: `No Zone has id "${zoneId}".`, candidates: record.zones.map(zone => zone.id) })
  const layers = resolved.composition.scenes.map(scene => ({ sceneId: scene.sceneId, layerId: newId() }))
  const composition = addShowOverlayLayerAcrossTimeline(record, resolved.composition, { zoneId, layers })
  if (composition === resolved.composition) return refuseShowCommand({ code: 'engine-refused', message: `Cannot add a Layer to Zone ${zoneId}: check composition owners and fresh Layer identities.` })
  return { ok: true as const, record: withComposition(record, composition), changes: [{
    command: 'add_overlay_layer', targetId: layers[0].layerId,
    description: `New topmost overlay Layer added to Zone ${zoneId} across all ${layers.length} Scene(s); it is overlay layer index 0.`,
    details: { layerIdsBySceneId: Object.fromEntries(layers.map(layer => [layer.sceneId, layer.layerId])) },
  }] }
}

export function createOverlayLayerCommand(): ShowCommandDescriptor {
  return {
    name: 'add_overlay_layer',
    description: 'Add a fresh topmost overlay Layer to a Zone in every Scene. The new Layer is overlay index 0; existing Layers shift down one index with their identities and membership intact. Add Clips with add_clip.',
    fields: { zone_id: { kind: 'string', description: 'Zone id from the Show' } },
    touches: ['/composition/scenes/*/zones/*/overlays', '/updatedAt'],
    apply: (record, input) => overlayLayerCommandOutcome(record, input),
  }
}
