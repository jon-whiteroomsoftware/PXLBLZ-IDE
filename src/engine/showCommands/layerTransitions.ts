// Layer-transition command family: the endpoint-owned non-Cut transitions
// between consecutive clips on one layer, and the rigid-chain move of a
// transition-connected clip. All through the pure layer-transition authoring
// functions; ids are the transition ids the timeline and summary report.
import { newPersonalContentId } from '../personalContentMetadata'
import type { ShowLayerTransition, ShowRecord } from '../personalContentRecords'
import {
  insertShowLayerTransition,
  moveShowConnectedClipAtGlobalTime,
  planShowLayerTransitionInsertion,
  resetShowLayerTransitionToCut,
  resizeShowLayerTransition,
} from '../showLayerTransitionAuthoring'
import type { ShowTimelineClipMoveTarget } from '../showTimelineClipAuthoring'
import {
  commandComposition,
  refuseShowCommand,
  withComposition,
  type ShowCommandDescriptor,
  type ShowCommandRefusal,
} from './registry'
import {
  VISUAL_TRANSITION_PARAMETER_TOUCHES,
  canonicalizeBoundaryAfterShift,
  engineIdentityRefusal,
  resolveCommandClip,
} from './support'

function resolveLayerTransition(
  record: ShowRecord,
  transitionId: string,
): { ok: true; transition: ShowLayerTransition } | ShowCommandRefusal {
  const transitions = record.composition?.transitions ?? []
  const transition = transitions.find((candidate) => candidate.id === transitionId)
  if (!transition) {
    return refuseShowCommand({
      code: 'unknown-transition',
      message:
        transitions.length === 0
          ? `No layer transition has id "${transitionId}"; every junction on this Show's layers is a cut.`
          : `No layer transition has id "${transitionId}". Layer transitions: ${
              transitions.map((candidate) =>
                `${candidate.id} (${candidate.kind}, ${candidate.fromPlacementId} → ${candidate.toPlacementId})`).join('; ')}.`,
      candidates: transitions.map((candidate) => candidate.id),
    })
  }
  return { ok: true, transition }
}

const insertLayerTransition: ShowCommandDescriptor = {
  name: 'insert_layer_transition',
  description:
    'Insert a non-Cut transition between two clips that meet at a cut on the same layer. The second ' +
    'clip and everything transition-connected after it shift later by the transition\'s duration. ' +
    'Refused when the clips do not touch, the duration exceeds the available room, or the shift would ' +
    'collide.',
  touches: ['/composition/transitions', '/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', '/updatedAt'],
  fields: {
    from_clip_id: { kind: 'string', description: 'The clip the transition leaves' },
    to_clip_id: { kind: 'string', description: 'The clip the transition enters' },
    kind: {
      kind: 'string',
      optional: true,
      enum: ['crossfade', 'fade-color', 'wipe', 'dither', 'portal', 'motion'],
      description: 'Transition kind (default crossfade)',
    },
    duration_ms: { kind: 'integer', description: 'Transition duration in milliseconds (positive)' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const composition = resolved.composition
    const from = resolveCommandClip(record, composition, input.from_clip_id as string)
    if (!from.ok) return from
    const to = resolveCommandClip(record, composition, input.to_clip_id as string)
    if (!to.ok) return to
    const plan = planShowLayerTransitionInsertion(record, composition, {
      fromPlacementId: from.context.clip.endPlacementId,
      toPlacementId: to.context.clip.startPlacementId,
    })
    if (!plan.enabled) {
      return refuseShowCommand({
        code: 'transition-refused',
        message: `insert_layer_transition: ${plan.reason}`,
      })
    }
    const durationMs = input.duration_ms as number
    if (durationMs <= 0 || durationMs > plan.maxDurationMs) {
      return refuseShowCommand({
        code: 'invalid-duration',
        message:
          `insert_layer_transition: the duration must be between 1 and ${plan.maxDurationMs} ms here ` +
          `(requested ${durationMs}).`,
      })
    }
    const transition: ShowLayerTransition = {
      id: newPersonalContentId(),
      fromPlacementId: from.context.clip.endPlacementId,
      toPlacementId: to.context.clip.startPlacementId,
      kind: (input.kind as ShowLayerTransition['kind'] | undefined) ?? 'crossfade',
      durationMs,
      easing: { curve: 'linear' },
      ...(((input.kind as string | undefined) ?? 'crossfade') === 'crossfade'
        ? { crossfadePolicy: 'snapshot-live' as const }
        : {}),
    }
    const result = insertShowLayerTransition(record, composition, transition)
    if (result === composition) {
      return engineIdentityRefusal(
        'insert_layer_transition',
        'The shift may collide with a later clip or the clips may not meet at a cut.',
      )
    }
    return {
      ok: true,
      record: withComposition(record, result),
      changes: [{
        command: 'insert_layer_transition',
        targetId: transition.id,
        description:
          `${transition.kind} of ${durationMs} ms inserted between ${from.context.clip.patternName} ` +
          `and ${to.context.clip.patternName}.`,
      }],
    }
  },
}

const resizeLayerTransition: ShowCommandDescriptor = {
  name: 'resize_layer_transition',
  description:
    'Resize a layer transition, shifting the transition-connected chain after it. A duration of zero ' +
    'closes it into a cut. Refused when growth would collide with a later clip.',
  touches: ['/composition/transitions', '/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', ...VISUAL_TRANSITION_PARAMETER_TOUCHES, '/updatedAt'],
  fields: {
    transition_id: { kind: 'string', description: 'The layer transition id' },
    duration_ms: { kind: 'integer', description: 'New duration in milliseconds; 0 closes to a cut' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const composition = resolved.composition
    const found = resolveLayerTransition(record, input.transition_id as string)
    if (!found.ok) return found
    const durationMs = input.duration_ms as number
    if (durationMs === found.transition.durationMs) {
      return refuseShowCommand({
        code: 'no-change',
        message: `Layer transition ${found.transition.id} already runs ${durationMs} ms.`,
      })
    }
    const result = resizeShowLayerTransition(record, composition, found.transition.id, durationMs)
    if (result === composition) {
      return engineIdentityRefusal(
        'resize_layer_transition',
        'Growth may collide with a later clip, or the duration was negative.',
      )
    }
    return {
      ok: true,
      record: withComposition(canonicalizeBoundaryAfterShift(record, composition, result), result),
      changes: [{
        command: 'resize_layer_transition',
        targetId: found.transition.id,
        description:
          durationMs === 0
            ? `Layer transition ${found.transition.id} closed into a cut.`
            : `Layer transition ${found.transition.id} now runs ${durationMs} ms.`,
      }],
    }
  },
}

const resetLayerTransitionToCut: ShowCommandDescriptor = {
  name: 'reset_layer_transition_to_cut',
  description:
    'Remove a layer transition, closing its interval so the two clips meet at a cut again; the ' +
    'connected chain after it shifts earlier by the removed duration.',
  touches: ['/composition/transitions', '/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', ...VISUAL_TRANSITION_PARAMETER_TOUCHES, '/updatedAt'],
  fields: {
    transition_id: { kind: 'string', description: 'The layer transition id' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const composition = resolved.composition
    const found = resolveLayerTransition(record, input.transition_id as string)
    if (!found.ok) return found
    const result = resetShowLayerTransitionToCut(record, composition, found.transition.id)
    if (result === composition) {
      return engineIdentityRefusal('reset_layer_transition_to_cut', 'The closing shift may collide.')
    }
    return {
      ok: true,
      record: withComposition(canonicalizeBoundaryAfterShift(record, composition, result), result),
      changes: [{
        command: 'reset_layer_transition_to_cut',
        targetId: found.transition.id,
        description: `Layer transition ${found.transition.id} removed; the clips meet at a cut.`,
      }],
    }
  },
}

const moveConnectedClip: ShowCommandDescriptor = {
  name: 'move_connected_clip',
  description:
    'Move a transition-connected clip, carrying its whole rigid chain (every clip joined to it by ' +
    'layer transitions) to keep the transitions intact. Use move_clip for unconnected clips.',
  touches: ['/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', ...VISUAL_TRANSITION_PARAMETER_TOUCHES, '/updatedAt'],
  fields: {
    clip_id: { kind: 'string', description: 'Any clip of the connected chain' },
    start_ms: { kind: 'number', description: 'New global start time for that clip' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const composition = resolved.composition
    const found = resolveCommandClip(record, composition, input.clip_id as string)
    if (!found.ok) return found
    const { clip, owner } = found.context
    // The connected-move engine compares the unified layer index for the
    // same-layer (chain-preserving) path.
    const target: ShowTimelineClipMoveTarget = clip.kind === 'main'
      ? { kind: 'main', zoneId: clip.zoneId, globalStartMs: input.start_ms as number }
      : {
          kind: 'overlay',
          zoneId: clip.zoneId,
          layerIndex: clip.layerIndex,
          globalStartMs: input.start_ms as number,
        }
    const result = moveShowConnectedClipAtGlobalTime(record, composition, { owner, target })
    if (result === composition) {
      return engineIdentityRefusal(
        'move_connected_clip',
        'The destination may be occupied or outside the Show.',
      )
    }
    // Canonicalize every boundary junction the chain shift broke - the
    // Show-level engine wrapper only checks junctions touching the selected
    // clip, and any clip of the chain may sit on a Scene boundary.
    return {
      ok: true,
      record: withComposition(canonicalizeBoundaryAfterShift(record, composition, result), result),
      changes: [{
        command: 'move_connected_clip',
        targetId: clip.id,
        description: `Clip ${clip.patternName} and its connected chain moved to ${Math.round(input.start_ms as number)} ms.`,
      }],
    }
  },
}

export const SHOW_LAYER_TRANSITION_COMMANDS: ShowCommandDescriptor[] = [
  insertLayerTransition,
  resizeLayerTransition,
  resetLayerTransitionToCut,
  moveConnectedClip,
]
