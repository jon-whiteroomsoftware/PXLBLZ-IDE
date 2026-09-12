import type { ShowRecord } from '../personalContentRecords'
import {
  removeEmptyShowOverlayLayerAcrossTimeline,
  reorderShowOverlayLayerAcrossTimeline,
  type ShowOverlayLayerAuthoringResult,
} from '../showOverlayLayerAuthoring'
import {
  commandComposition,
  refuseShowCommand,
  withComposition,
  type ShowCommandDescriptor,
  type ShowCommandOutcome,
} from './registry'

function refusal(result: Extract<ShowOverlayLayerAuthoringResult, { status: 'refused' }>): ShowCommandOutcome {
  return refuseShowCommand({
    code: result.code === 'invalid-request' ? 'invalid-argument' : result.code,
    message: result.reason,
    ...(result.candidates ? { candidates: result.candidates } : {}),
    ...(result.code === 'layer-not-empty'
      ? { remedy: 'Move or remove the listed Clips explicitly, then retry against the current Layer index.' }
      : {}),
  })
}

function reorderOutcome(record: ShowRecord, input: Record<string, unknown>): ShowCommandOutcome {
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const result = reorderShowOverlayLayerAcrossTimeline(record, resolved.composition, {
    zoneId: input.zone_id as string,
    fromIndex: input.layer_index as number,
    toIndex: input.target_index as number,
  })
  if (result.status === 'refused') return refusal(result)
  if (result.status === 'noop') return { ok: true, record, changes: [] }
  const targetId = result.layerIdsBySceneId[resolved.composition.scenes[0].sceneId]
  return {
    ok: true,
    record: withComposition(record, result.composition),
    changes: [{
      command: 'reorder_overlay_layer',
      targetId,
      description: `Overlay Layer ${input.layer_index} moved to final index ${input.target_index} in Zone ${input.zone_id} across every Scene.`,
      details: {
        zoneId: input.zone_id,
        fromIndex: input.layer_index,
        toIndex: input.target_index,
        layerIdsBySceneId: result.layerIdsBySceneId,
        indexMap: result.indexMap,
      },
    }],
  }
}

function removeOutcome(record: ShowRecord, input: Record<string, unknown>): ShowCommandOutcome {
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const result = removeEmptyShowOverlayLayerAcrossTimeline(record, resolved.composition, {
    zoneId: input.zone_id as string,
    layerIndex: input.layer_index as number,
  })
  if (result.status === 'refused') return refusal(result)
  if (result.status === 'noop') return { ok: true, record, changes: [] }
  const targetId = result.layerIdsBySceneId[resolved.composition.scenes[0].sceneId]
  return {
    ok: true,
    record: withComposition(record, result.composition),
    changes: [{
      command: 'remove_overlay_layer',
      targetId,
      description: `Empty overlay Layer ${input.layer_index} removed from Zone ${input.zone_id} across every Scene.`,
      details: {
        zoneId: input.zone_id,
        removedIndex: input.layer_index,
        layerIdsBySceneId: result.layerIdsBySceneId,
        indexMap: result.indexMap,
      },
    }],
  }
}

const reorderOverlayLayer: ShowCommandDescriptor = {
  name: 'reorder_overlay_layer',
  description:
    'Move one whole explicit overlay Layer to a final front-to-back index in a Zone across every Scene. ' +
    'Index 0 is topmost; moving 3 to 1 in [A,B,C,D] produces [A,D,B,C]. Uniform explicit stacks are ' +
    'supported; sparse stacks and Group occurrences in the target Zone refuse without changes.',
  touches: ['/composition/scenes/*/zones/*/overlays', '/updatedAt'],
  fields: {
    zone_id: { kind: 'string', description: 'Zone id whose overlay stack is reordered' },
    layer_index: { kind: 'integer', safeInteger: true, minimum: 0, description: 'Current zero-based overlay index (0 = topmost)' },
    target_index: { kind: 'integer', safeInteger: true, minimum: 0, description: 'Final zero-based overlay index after reinsertion' },
  },
  apply: reorderOutcome,
}

const removeOverlayLayer: ShowCommandDescriptor = {
  name: 'remove_overlay_layer',
  description:
    'Remove exactly one empty explicit overlay Layer from a Zone across every Scene. Index 0 is topmost. ' +
    'The Layer must contain no Clip in any Scene; move or remove its Clips explicitly first. Uniform ' +
    'explicit stacks are supported; sparse stacks and Group occurrences in the target Zone refuse.',
  touches: ['/composition/scenes/*/zones/*/overlays', '/updatedAt'],
  fields: {
    zone_id: { kind: 'string', description: 'Zone id whose empty overlay Layer is removed' },
    layer_index: { kind: 'integer', safeInteger: true, minimum: 0, description: 'Current zero-based overlay index (0 = topmost)' },
  },
  apply: removeOutcome,
}

export const SHOW_OVERLAY_LAYER_COMMANDS: ShowCommandDescriptor[] = [reorderOverlayLayer, removeOverlayLayer]
