import type { ShowUnifiedTimelineClipProjection } from '@/engine/showUnifiedTimelineProjection'
// Provenance: pxlblz-v3 src/grammar/operations/clips.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Clip operation family on the global-time layer: add, move, resize, split,
// duplicate, remove, pattern-instance identity, per-clip settings, and
// overlay layers. Planner-backed operations run the vendored plan* function
// first and surface a refusing plan as a typed issue; the rest pre-check the
// cases the engine refuses silently.
import { z } from 'zod'
import {
  restartShowMainPlacement,
} from '@/engine/showCompositionModel'
import {
  type ShowTimelineClipMoveTarget,
} from '@/engine/showTimelineClipAuthoring'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue, ShowGrammarDocument } from '../types.js'
import {
  composedShow,
  compositionOf,
  describeClip,
  idFactory,
  ownerFor,
  refuse,
  resolveClip,
  type ClipContext,
} from '../support.js'
import { descriptorOperation } from './descriptorAdapter.js'
import { SHOW_COMMANDS } from '@/engine/showCommands/registry'
import { overlayLayerCommandOutcome } from '@/engine/showCommands/overlayLayer'
import { splitClipCommandOutcome } from '@/engine/showCommands/splitClip'
import { duplicateClipCommandOutcome } from '@/engine/showCommands/duplicateClip'
import { addClipCommandOutcome, independentClipCommandOutcome } from '@/engine/showCommands/clips'

const clipPropertyOperations = ['set_clip_view', 'set_clip_control_target', 'set_clip_time', 'set_clip_evaluation']
  .map(name => descriptorOperation(SHOW_COMMANDS.find(command => command.name === name)!))

function unknownZone(document: ShowGrammarDocument, zoneId: string): GrammarIssue {
  return {
    code: 'unknown-zone',
    message:
      `No Zone has id "${zoneId}". Known Zones: ${
        document.show.zones.map((zone) => `${zone.id} (${zone.name})`).join('; ')}.`,
    candidates: document.show.zones.map((zone) => zone.id),
  }
}

function maxOverlayCount(document: ShowGrammarDocument, zoneId: string): number {
  return compositionOf(document).scenes.reduce((maximum, scene) => {
    const zone = scene.zones.find((candidate) => candidate.zoneId === zoneId)
    return Math.max(maximum, zone?.overlays.length ?? 0)
  }, 0)
}

function overlapConflict(
  context: ClipContext,
  zoneId: string,
  kind: 'main' | 'overlay',
  layerIndex: number,
  startMs: number,
  endMs: number,
): { clip: ShowUnifiedTimelineClipProjection; zoneName: string } | null {
  const conflict = context.siblings.find((candidate) =>
    candidate.clip.id !== context.clip.id &&
    candidate.zoneId === zoneId &&
    candidate.clip.kind === kind &&
    candidate.clip.layerIndex === layerIndex &&
    candidate.clip.startMs < endMs &&
    candidate.clip.endMs > startMs,
  )
  return conflict ? { clip: conflict.clip, zoneName: conflict.zoneName } : null
}

const resizeClip: ShowGrammarOperation = descriptorOperation(SHOW_COMMANDS.find(command => command.name === 'resize_clip')!)

const addClip: ShowGrammarOperation = descriptorOperation(SHOW_COMMANDS.find(command => command.name === 'add_clip')!, (document, args) => addClipCommandOutcome(document.show, args, idFactory(document)))

const canonicalMove = descriptorOperation(SHOW_COMMANDS.find(command => command.name === 'move_clip')!)
const moveClip: ShowGrammarOperation = {
  ...canonicalMove,
  apply(document, args, privateMove) {
    if (!privateMove?.active) {
      const ordinary = canonicalMove.apply(document, args)
      if (ordinary.ok || !privateMove) return ordinary
    }
    const resolved = resolveClip(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const context = resolved.context
    const { clip, timelineDurationMs } = context

    const zoneId = (args.zone_id as string | undefined) ?? clip.zoneId
    if (!document.show.zones.some((zone) => zone.id === zoneId)) {
      return refuse(unknownZone(document, zoneId))
    }
    const layerArg = args.layer as 'main' | number | undefined
    const kind: 'main' | 'overlay' = layerArg === undefined
      ? clip.kind
      : layerArg === 'main' ? 'main' : 'overlay'
    const layerIndex = layerArg === undefined
      ? (clip.kind === 'overlay' ? clip.layerIndex : 0)
      : layerArg === 'main' ? 0 : layerArg
    if (kind === 'overlay' && layerIndex >= maxOverlayCount(document, zoneId)) {
      return refuse({
        code: 'missing-owner',
        message:
          `Zone ${zoneId} has ${maxOverlayCount(document, zoneId)} overlay layers; there is no layer ` +
          `at index ${layerIndex}.`,
        remedy: 'Add one with add_overlay_layer, or target an existing layer.',
      })
    }

    const startMs = args.start_ms as number
    if (!Number.isFinite(startMs) || startMs < 0) {
      return refuse({ code: 'invalid-argument', message: 'start_ms must be a non-negative time in milliseconds.' })
    }
    const endMs = startMs + clip.durationMs
    if (endMs > timelineDurationMs) {
      return refuse({
        code: 'outside-timeline',
        message: `The clip would end at ${endMs} ms, past the end of the Show at ${timelineDurationMs} ms.`,
        remedy: `Choose a start of at most ${timelineDurationMs - clip.durationMs} ms, or move Show End later first.`,
      })
    }
    const conflict = overlapConflict(context, zoneId, kind, layerIndex, startMs, endMs)
    if (conflict && !privateMove) {
      return refuse({
        code: 'occupied',
        message:
          `Moving to ${startMs} ms would overlap clip ${describeClip(conflict.clip, conflict.zoneName)} ` +
          'on the target Zone and layer.',
        remedy: `Choose a different time or layer, or move or resize clip ${conflict.clip.id} first.`,
      })
    }

    const target: ShowTimelineClipMoveTarget = kind === 'main'
      ? { kind: 'main', zoneId, globalStartMs: startMs }
      : { kind: 'overlay', zoneId, layerIndex, globalStartMs: startMs }
    if (!privateMove.active && !conflict) return canonicalMove.apply(document, args)
    const composition = compositionOf(document)
    const result = privateMove.move(ownerFor(clip), target, conflict ? ownerFor(conflict.clip) : undefined)
    if (!result || result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to move clip ${clip.id} to ${startMs} ms on Zone ${zoneId}.`,
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'move_clip',
        targetId: clip.id,
        description:
          `Clip ${clip.id} (${clip.patternName}) moved to ${startMs}–${endMs} ms on Zone ${zoneId} ` +
          `${kind === 'main' ? 'main layer' : `overlay layer ${layerIndex}`}.`,
        before: { startMs: clip.startMs, zoneId: clip.zoneId, kind: clip.kind, layerIndex: clip.layerIndex },
        after: { startMs, zoneId, kind, layerIndex },
      }],
    }
  },
}

const splitClip: ShowGrammarOperation = descriptorOperation(SHOW_COMMANDS.find(command => command.name === 'split_clip')!, (document, args) => {
  const newId = idFactory(document)
  return splitClipCommandOutcome(document.show, args, () => newId('clip'))
})

const duplicateClip: ShowGrammarOperation = descriptorOperation(SHOW_COMMANDS.find(command => command.name === 'duplicate_clip')!, (document, args) => duplicateClipCommandOutcome(document.show, args, idFactory(document)))

const removeClip: ShowGrammarOperation = descriptorOperation(SHOW_COMMANDS.find(command => command.name === 'remove_clip')!)

const makeClipPatternIndependent: ShowGrammarOperation = descriptorOperation(SHOW_COMMANDS.find(command => command.name === 'make_clip_pattern_independent')!, (document, args) => independentClipCommandOutcome(document.show, args, () => idFactory(document)('instance')))

const rejoinClipPatternInstance: ShowGrammarOperation = descriptorOperation(SHOW_COMMANDS.find(command => command.name === 'rejoin_clip_pattern_instance')!)

const restartClip: ShowGrammarOperation = {
  name: 'restart_clip',
  description:
    'Start a main-layer clip with a fresh Pattern instance at entry instead of continuing shared state: ' +
    'the placement gets its own new instance (instance-targeted tracks are copied). Overlay clips are not ' +
    'supported by this operation.',
  mutates: ['/composition/patternInstances', '/composition/scenes/*'],
  inputShape: {
    clip_id: z.string().describe('Main-layer clip id from the open_show listing'),
  },
  apply(document, args) {
    const resolved = resolveClip(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const { clip } = resolved.context
    if (clip.kind !== 'main') {
      return refuse({
        code: 'invalid-argument',
        message: `Clip ${clip.id} is an overlay clip; restart applies to main-layer clips.`,
        remedy: 'Use make_clip_pattern_independent for an overlay clip.',
      })
    }
    const composition = compositionOf(document)
    const newInstanceId = idFactory(document)('instance')
    const result = restartShowMainPlacement(composition, {
      sceneId: clip.sceneId,
      zoneId: clip.zoneId,
      placementId: clip.startPlacementId,
      newInstanceId,
    })
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to restart clip ${clip.id}.`,
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'restart_clip',
        targetId: clip.id,
        description: `Clip ${clip.id} now starts with its own fresh Pattern instance ${newInstanceId}.`,
        details: { newInstanceId },
      }],
    }
  },
}

const addOverlayLayer = descriptorOperation(SHOW_COMMANDS.find(command => command.name === 'add_overlay_layer')!, (document, args) => {
  const newId = idFactory(document)
  return overlayLayerCommandOutcome(document.show, args, () => newId('layer'))
})

export const CLIP_OPERATIONS: ShowGrammarOperation[] = [
  addClip,
  moveClip,
  resizeClip,
  splitClip,
  duplicateClip,
  removeClip,
  makeClipPatternIndependent,
  rejoinClipPatternInstance,
  restartClip,
  ...clipPropertyOperations,
  addOverlayLayer,
]
