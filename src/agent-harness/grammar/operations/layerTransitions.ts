// Provenance: pxlblz-v3 src/grammar/operations/layerTransitions.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Layer-transition operation family: literal Transitions between two
// consecutive clips on the same layer within a Scene, plus connected-chain
// clip moves and resizes. Insertion is planner-backed; the vendored plan's
// legible reason passes through as a typed transition-conflict issue.
import { z } from 'zod'
import type { ShowLayerTransition } from '@/engine/personalContentRecords'
import {
  insertShowLayerTransition,
  planShowLayerTransitionInsertion,
  resetShowLayerTransitionToCut,
  resizeShowLayerTransition,
} from '@/engine/showLayerTransitionAuthoring'
import type { ShowGrammarOperation } from '../registry.js'
import type { ShowGrammarDocument } from '../types.js'
import {
  composedShow,
  compositionOf,
  idFactory,
  refuse,
  resolveClip,
  toEasing,
  type GrammarRefusal,
} from '../support.js'
import { toolkitTransitionItem } from './junctions.js'
import { showTransitionChangesForPresentation } from '@/engine/showTransitionAuthoring'
import { descriptorOperation } from './descriptorAdapter.js'
import { SHOW_COMMANDS } from '@/engine/showCommands/registry'

function findLayerTransition(
  document: ShowGrammarDocument,
  transitionId: string,
): { ok: true; transition: ShowLayerTransition } | GrammarRefusal {
  const transitions = compositionOf(document).transitions ?? []
  const transition = transitions.find((candidate) => candidate.id === transitionId)
  if (!transition) {
    return refuse({
      code: 'unknown-transition',
      message:
        transitions.length === 0
          ? 'The Show has no layer Transitions yet; add one with insert_layer_transition.'
          : `No layer Transition has id "${transitionId}". Known: ${
              transitions
                .map((candidate) => `${candidate.id} (${candidate.kind}, ${candidate.durationMs} ms)`)
                .join('; ')}.`,
      candidates: transitions.map((candidate) => candidate.id),
    })
  }
  return { ok: true, transition }
}

const insertLayerTransition: ShowGrammarOperation = {
  name: 'insert_layer_transition',
  description:
    'Replace the cut between two consecutive clips on the same Zone and layer with a literal Transition ' +
    'of the given kind and duration. Clip durations never change: the destination clip and everything ' +
    'transition-connected after it move later to make room. Refused when the clips are not consecutive on ' +
    'one layer, the junction already has a Transition, another layer is transitioning across the moment, ' +
    'or there is no free time to make room.',
  mutates: ['/composition/transitions', '/composition/scenes/*/zones/*', '/composition/scenes/*/propertyTracks'],
  inputShape: {
    from_clip_id: z.string().describe('The left clip; the Transition replaces the cut after it'),
    to_clip_id: z.string().describe('The clip directly after it on the same layer'),
    duration_ms: z.number().describe('Transition duration in milliseconds (positive)'),
    kind: z.enum(['crossfade', 'fade-color', 'wipe', 'dither', 'portal', 'motion']).optional()
      .describe('Transition kind (default crossfade)'),
    variant: z.string().optional().describe('Family variant id (defaults per kind)'),
    easing: z.union([
      z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']),
      z.record(z.unknown()),
    ]).optional(),
  },
  apply(document, args) {
    const fromResolved = resolveClip(document, args.from_clip_id as string)
    if (!fromResolved.ok) return fromResolved
    const toResolved = resolveClip(document, args.to_clip_id as string)
    if (!toResolved.ok) return toResolved
    const from = fromResolved.context.clip
    const to = toResolved.context.clip

    const composition = compositionOf(document)
    const endpoints = { fromPlacementId: from.endPlacementId, toPlacementId: to.startPlacementId }
    const plan = planShowLayerTransitionInsertion(document.show, composition, endpoints)
    if (!plan.enabled) {
      return refuse({
        code: 'transition-conflict',
        message: `Cannot insert a Transition between clips ${from.id} and ${to.id}: ${plan.reason}`,
      })
    }
    const durationMs = Math.round(args.duration_ms as number)
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return refuse({ code: 'invalid-argument', message: 'duration_ms must be a positive number of milliseconds.' })
    }
    if (durationMs > plan.maxDurationMs) {
      return refuse({
        code: 'transition-conflict',
        message:
          `A ${durationMs} ms Transition does not fit here; at most ${plan.maxDurationMs} ms of room ` +
          'can be made.',
        remedy: `Choose a duration of at most ${plan.maxDurationMs} ms, or free time after clip ${to.id} first.`,
      })
    }
    const item = toolkitTransitionItem((args.kind as string | undefined) ?? 'crossfade', args.variant as string | undefined)
    if (!item.ok) return refuse(item.issue)
    const transition = {
      id: idFactory(document)('transition'),
      ...endpoints,
      durationMs,
      easing: toEasing(args.easing),
      ...showTransitionChangesForPresentation(item.item),
    } as ShowLayerTransition
    const result = insertShowLayerTransition(document.show, composition, transition)
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to insert the Transition between clips ${from.id} and ${to.id}.`,
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'insert_layer_transition',
        targetId: transition.id,
        description:
          `${transition.kind} Transition ${transition.id} (${durationMs} ms) inserted between clips ` +
          `${from.id} and ${to.id}; following clips moved later to make room.`,
        details: { fromClipId: from.id, toClipId: to.id },
      }],
    }
  },
}

const resizeLayerTransition: ShowGrammarOperation = {
  name: 'resize_layer_transition',
  description:
    'Change a layer Transition’s duration. Connected clips after it move to keep clip durations intact; ' +
    'duration 0 resets the junction to a cut and closes the interval.',
  mutates: ['/composition/transitions', '/composition/scenes/*/zones/*', '/composition/scenes/*/propertyTracks'],
  inputShape: {
    transition_id: z.string().describe('Layer Transition id'),
    duration_ms: z.number().min(0).describe('New duration in milliseconds (0 resets to a cut)'),
  },
  apply(document, args) {
    const found = findLayerTransition(document, args.transition_id as string)
    if (!found.ok) return found
    const durationMs = Math.round(args.duration_ms as number)
    if (durationMs === found.transition.durationMs) {
      return refuse({
        code: 'no-change',
        message: `Transition ${found.transition.id} is already ${durationMs} ms.`,
      })
    }
    const composition = compositionOf(document)
    const result = resizeShowLayerTransition(document.show, composition, found.transition.id, durationMs)
    if (result === composition) {
      return refuse({
        code: 'transition-conflict',
        message:
          `The engine declined to resize Transition ${found.transition.id} to ${durationMs} ms; there may ` +
          'be no free time after the connected clips.',
        remedy: 'Free time after the connected clips, or choose a shorter duration.',
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'resize_layer_transition',
        targetId: found.transition.id,
        description:
          durationMs === 0
            ? `Transition ${found.transition.id} reset to a cut.`
            : `Transition ${found.transition.id} resized to ${durationMs} ms.`,
        before: { durationMs: found.transition.durationMs },
        after: { durationMs },
      }],
    }
  },
}

const resetLayerTransitionToCut: ShowGrammarOperation = {
  name: 'reset_layer_transition_to_cut',
  description:
    'Remove a layer Transition, closing its interval back into a cut: the destination clip and its ' +
    'connected successors move earlier by the Transition’s duration.',
  mutates: ['/composition/transitions', '/composition/scenes/*/zones/*', '/composition/scenes/*/propertyTracks'],
  inputShape: {
    transition_id: z.string().describe('Layer Transition id'),
  },
  apply(document, args) {
    const found = findLayerTransition(document, args.transition_id as string)
    if (!found.ok) return found
    const composition = compositionOf(document)
    const result = resetShowLayerTransitionToCut(document.show, composition, found.transition.id)
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to reset Transition ${found.transition.id} to a cut.`,
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'reset_layer_transition_to_cut',
        targetId: found.transition.id,
        description:
          `Transition ${found.transition.id} removed; the junction is a cut again and later clips ` +
          `moved ${found.transition.durationMs} ms earlier.`,
      }],
    }
  },
}

const resizeDescriptor = SHOW_COMMANDS.find(command => command.name === 'resize_clip')!
const resizeConnectedClip: ShowGrammarOperation = descriptorOperation({
  ...resizeDescriptor,
  name: 'resize_connected_clip',
  description: `Historical diagnostic compatibility; use resize_clip. ${resizeDescriptor.description}`,
})

export const LAYER_TRANSITION_OPERATIONS: ShowGrammarOperation[] = [
  insertLayerTransition,
  resizeLayerTransition,
  resetLayerTransitionToCut,
  resizeConnectedClip,
]
