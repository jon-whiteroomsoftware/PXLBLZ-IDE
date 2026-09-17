// Layer commands over the stable v2 Layer owner. Stacking is authored by rank
// or by an explicit neighbour Layer; index words retire with v1 addressing.
import type { ShowRecordV2 } from '../showCompositionV2'
import { editShowLayerV2 } from '../showLayersV2'
import {
  refuseShowCommandV2,
  type ShowCommandV2Descriptor,
  type ShowCommandV2Field,
  type ShowCommandV2Outcome,
} from './registry'
import {
  adoptOwnerResult,
  adoptOwnerResults,
  describeIds,
  freshShowIdsV2,
  idField,
  invalidArgument,
  ownedShowIdsV2,
  unknownIdentity,
} from './support'
import { CLIP_SPEC_FIELD, createClipsFromSpecs } from './clipSpec'

function zoneLayers(record: ShowRecordV2, zoneId: string) {
  return record.composition.layers
    .filter(layer => layer.zoneId === zoneId)
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
}

/**
 * Resolve a requested stacking position into a complete rank order for the Zone.
 * `rank` is absolute with zero at the bottom; `above_layer_id` and
 * `below_layer_id` name an existing neighbour.
 */
function requestedOrder(
  record: ShowRecordV2,
  zoneId: string,
  movedLayerId: string,
  request: { rank?: number; aboveLayerId?: string; belowLayerId?: string },
): string[] | { message: string } {
  const ordered = zoneLayers(record, zoneId).map(layer => layer.id)
  const remaining = ordered.filter(id => id !== movedLayerId)
  if (request.rank !== undefined) {
    if (request.rank > remaining.length) {
      return { message: `rank ${request.rank} is above the top of Zone "${zoneId}" (${remaining.length} other Layers).` }
    }
    return [...remaining.slice(0, request.rank), movedLayerId, ...remaining.slice(request.rank)]
  }
  const neighbour = request.aboveLayerId ?? request.belowLayerId!
  const index = remaining.indexOf(neighbour)
  if (index < 0) {
    return { message: `Layer "${neighbour}" is not another Layer in Zone "${zoneId}".` }
  }
  return request.aboveLayerId !== undefined
    ? [...remaining.slice(0, index + 1), movedLayerId, ...remaining.slice(index + 1)]
    : [...remaining.slice(0, index), movedLayerId, ...remaining.slice(index)]
}

const LAYER_SPEC_FIELD: ShowCommandV2Field = {
  kind: 'object',
  description: 'One new Layer, with optional Clips placed on it.',
  properties: {
    zone_id: idField('The Zone that owns the Layer for the whole Show.'),
    name: { kind: 'string', optional: true, maxLength: 200, description: 'Layer name; omit for a generated one.' },
    rank: { kind: 'integer', optional: true, minimum: 0, maximum: 1_000, description: 'Absolute stacking rank; zero is the bottom. Omit for the top of the Zone.' },
    above_layer_id: idField('Place the new Layer directly above this existing Layer instead of naming a rank.', true),
    clips: {
      kind: 'array',
      optional: true,
      minItems: 1,
      maxItems: 128,
      description: 'Clips to place on the new Layer; each omits layer_id.',
      items: CLIP_SPEC_FIELD,
    },
  },
}

const createLayers: ShowCommandV2Descriptor = {
  name: 'create_layers',
  family: 'layers',
  description: 'Create one or more Layers, each owned by one Zone for the whole Show, optionally placing Clips on them. The default rank is the top of the Zone. Existing Clip identities, Group bindings and stacking of other Zones are unchanged.',
  touches: ['/composition/layers', '/composition/clips', '/composition/patternInstances'],
  fields: {
    layers: {
      kind: 'array',
      minItems: 1,
      maxItems: 128,
      description: 'The Layers to create, applied in order.',
      items: LAYER_SPEC_FIELD,
    },
  },
  apply(record, input, context) {
    const specs = input.layers as Array<Record<string, unknown>>
    for (const [index, spec] of specs.entries()) {
      if (spec.rank !== undefined && spec.above_layer_id !== undefined) {
        return invalidArgument(record, 'create_layers', 'give rank or above_layer_id, not both.', `$.layers[${index}]`)
      }
      if (!record.zones.some(zone => zone.id === spec.zone_id)) {
        return unknownIdentity(record, 'create_layers', 'Zone', String(spec.zone_id), record.zones.map(zone => zone.id))
      }
    }
    const steps: Array<{ run: (value: ShowRecordV2) => ReturnType<typeof editShowLayerV2>; targetId: string }> = []
    const layerIds = freshShowIdsV2(specs.map(spec => `layer-${String(spec.zone_id)}`), ownedShowIdsV2(record))
    const pendingClips: Array<{ layerId: string; zoneId: string; specs: Array<Record<string, unknown>> }> = []
    for (const [index, spec] of specs.entries()) {
      const zoneId = spec.zone_id as string
      const layerId = layerIds[index]
      const name = ((spec.name as string | undefined) ?? `Layer ${layerId}`).trim()
      if (!name) return invalidArgument(record, 'create_layers', 'a Layer name cannot be blank.', `$.layers[${index}].name`)
      steps.push({
        targetId: layerId,
        run: value => {
          const others = zoneLayers(value, zoneId).map(layer => layer.id)
          const requestedRank = spec.above_layer_id !== undefined
            ? others.indexOf(spec.above_layer_id as string) + 1
            : (spec.rank as number | undefined) ?? others.length
          if (spec.above_layer_id !== undefined && !others.includes(spec.above_layer_id as string)) {
            return {
              status: 'refused' as const, record: value, code: 'missing-target',
              message: `Layer "${String(spec.above_layer_id)}" is not an existing Layer in Zone "${zoneId}".`,
              ...emptyLayerAffected(),
            }
          }
          if (requestedRank > others.length) {
            return {
              status: 'refused' as const, record: value, code: 'invalid-request',
              message: `rank ${requestedRank} is above the top of Zone "${zoneId}" (${others.length} existing Layers).`,
              ...emptyLayerAffected(),
            }
          }
          // Add at the top, then reorder into the requested position so every
          // rank stays contiguous through the one Layer owner.
          const added = editShowLayerV2(value, { kind: 'add', layer: { id: layerId, zoneId, name, rank: others.length } })
          if (added.status !== 'changed' || requestedRank === others.length) return added
          const order = [...others.slice(0, requestedRank), layerId, ...others.slice(requestedRank)]
          return editShowLayerV2(added.record, { kind: 'reorder', zoneId, layerIds: order })
        },
      })
      if (Array.isArray(spec.clips) && spec.clips.length > 0) {
        pendingClips.push({ layerId, zoneId, specs: spec.clips as Array<Record<string, unknown>> })
      }
    }
    const outcome = adoptOwnerResults('create_layers', record, steps,
      affected => `Created Layers ${describeIds(affected.layers)}.`)
    if (outcome.status !== 'changed' || pendingClips.length === 0) return outcome
    const placed = createClipsFromSpecs('create_layers', outcome.record, pendingClips.flatMap(pending => (
      pending.specs.map(spec => ({ ...spec, zone_id: pending.zoneId, layer_id: pending.layerId }))
    )), context)
    if (placed.status === 'refused') return refuseShowCommandV2(record, ...placed.issues)
    if (placed.status === 'unchanged') return outcome
    return {
      status: 'changed',
      record: placed.record,
      changes: [...outcome.changes, ...placed.changes.map(change => ({ ...change, command: 'create_layers' }))],
    }
  },
}

function emptyLayerAffected() {
  return {
    affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [],
    affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [],
    affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [],
    removedIds: [], discardedControlTargets: [],
  }
}

const renameLayer: ShowCommandV2Descriptor = {
  name: 'rename_layer',
  family: 'layers',
  description: 'Rename one Layer. Stacking, Clip identities and Group bindings are unchanged.',
  touches: ['/composition/layers/*/name'],
  fields: {
    layer_id: idField('The Layer identity.'),
    name: { kind: 'string', maxLength: 200, description: 'The new Layer name.' },
  },
  apply(record, input) {
    const layerId = input.layer_id as string
    const layer = record.composition.layers.find(candidate => candidate.id === layerId)
    if (!layer) return unknownIdentity(record, 'rename_layer', 'Layer', layerId, record.composition.layers.map(candidate => candidate.id))
    return adoptOwnerResult('rename_layer', record,
      editShowLayerV2(record, { kind: 'rename', zoneId: layer.zoneId, layerId, name: (input.name as string).trim() }),
      () => `Layer ${layerId} renamed to "${(input.name as string).trim()}".`, layerId)
  },
}

const reorderLayer: ShowCommandV2Descriptor = {
  name: 'reorder_layer',
  family: 'layers',
  description: 'Restack one Layer inside its Zone by absolute rank (zero is the bottom) or relative to another Layer. Clip identities, Clip times and Group bindings are unchanged.',
  touches: ['/composition/layers/*/rank'],
  exactlyOne: ['rank', 'above_layer_id', 'below_layer_id'],
  fields: {
    layer_id: idField('The Layer to restack.'),
    rank: { kind: 'integer', optional: true, minimum: 0, maximum: 1_000, description: 'Absolute stacking rank; zero is the bottom of the Zone.' },
    above_layer_id: idField('Place the Layer directly above this Layer in the same Zone.', true),
    below_layer_id: idField('Place the Layer directly below this Layer in the same Zone.', true),
  },
  apply(record, input) {
    const layerId = input.layer_id as string
    const layer = record.composition.layers.find(candidate => candidate.id === layerId)
    if (!layer) return unknownIdentity(record, 'reorder_layer', 'Layer', layerId, record.composition.layers.map(candidate => candidate.id))
    const order = requestedOrder(record, layer.zoneId, layerId, {
      rank: input.rank as number | undefined,
      aboveLayerId: input.above_layer_id as string | undefined,
      belowLayerId: input.below_layer_id as string | undefined,
    })
    if (!Array.isArray(order)) return invalidArgument(record, 'reorder_layer', order.message)
    return adoptOwnerResult('reorder_layer', record,
      editShowLayerV2(record, { kind: 'reorder', zoneId: layer.zoneId, layerIds: order }),
      affected => `Layer ${layerId} restacked; Layers ${describeIds(affected.layers)}.`, layerId)
  },
}

const removeLayer: ShowCommandV2Descriptor = {
  name: 'remove_layer',
  family: 'layers',
  description: 'Remove one Layer. An empty unreferenced Layer is removed directly; otherwise name reassign_to_layer_id and every Clip, Group Layer binding and Transition participant on the removed Layer moves to it in one atomic candidate.',
  touches: ['/composition/layers', '/composition/clips/*/layerId', '/composition/transitions/*/participants/*/layerId', '/composition/groupOccurrences/*/layerBindings/*/layerId'],
  fields: {
    layer_id: idField('The Layer to remove.'),
    reassign_to_layer_id: idField('Another Layer in the same Zone that adopts every reference; required when the Layer is referenced.', true),
  },
  apply(record, input): ShowCommandV2Outcome {
    const layerId = input.layer_id as string
    const layer = record.composition.layers.find(candidate => candidate.id === layerId)
    if (!layer) return unknownIdentity(record, 'remove_layer', 'Layer', layerId, record.composition.layers.map(candidate => candidate.id))
    const destination = input.reassign_to_layer_id as string | undefined
    const reassignments = destination === undefined ? undefined : [
      ...record.composition.clips.filter(clip => clip.layerId === layerId)
        .map(clip => ({ kind: 'clip' as const, clipId: clip.id, layerId: destination })),
      ...record.composition.groupOccurrences.flatMap(occurrence => occurrence.layerBindings
        .filter(binding => binding.layerId === layerId)
        .map(binding => ({
          kind: 'group-layer-binding' as const,
          groupOccurrenceId: occurrence.id,
          definitionLayerId: binding.definitionLayerId,
          layerId: destination,
        }))),
      ...record.composition.transitions.flatMap(transition => transition.participants
        .filter(participant => participant.layerId === layerId)
        .map(participant => ({
          kind: 'transition-participant' as const,
          transitionId: transition.id,
          participantId: participant.id,
          layerId: destination,
        }))),
    ]
    return adoptOwnerResult('remove_layer', record,
      editShowLayerV2(record, {
        kind: 'remove', zoneId: layer.zoneId, layerId,
        ...(reassignments ? { reassignments } : {}),
      }),
      affected => `Layer ${layerId} removed; Clips ${describeIds(affected.clips)}.`, layerId)
  },
}

export const SHOW_V2_LAYER_COMMANDS: ShowCommandV2Descriptor[] = [
  createLayers,
  renameLayer,
  reorderLayer,
  removeLayer,
]
