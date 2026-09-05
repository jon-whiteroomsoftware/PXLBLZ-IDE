// Provenance: pxlblz-v3 src/grammar/operations/clips.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Clip operation family on the global-time layer: add, move, resize, split,
// duplicate, remove, pattern-instance identity, per-clip settings, and
// overlay layers. Planner-backed operations run the vendored plan* function
// first and surface a refusing plan as a typed issue; the rest pre-check the
// cases the engine refuses silently.
import { z } from 'zod'
import type { ShowPatternInstance } from '@/engine/personalContentRecords'
import {
  updateShowClipInspector,
  type ShowClipInspectorOwner,
  type ShowClipInspectorPatch,
} from '@/engine/showClipInspectorModel'
import {
  deleteShowMainPlacement,
  deleteShowOverlayPlacement,
  restartShowMainPlacement,
} from '@/engine/showCompositionModel'
import {
  addShowClipAtGlobalTime,
  addShowClipAtGlobalTimeExtendingShow,
  addShowOverlayLayerAcrossTimeline,
  duplicateLinkedShowClipAfter,
  duplicateShowClipAfter,
  makeShowClipPatternIndependent,
  moveShowClipAtGlobalTime,
  planShowClipAtGlobalTime,
  planShowClipDuplicateAfter,
  planShowClipPatternRejoin,
  planShowClipSplitAtGlobalTime,
  projectShowClipPatternInstanceOwnership,
  rejoinShowClipPatternInstance,
  resizeShowClipAtGlobalTime,
  splitShowClipAtGlobalTime,
  type ShowClipAddTarget,
  type ShowTimelineClipMoveTarget,
} from '@/engine/showTimelineClipAuthoring'
import type { ShowUnifiedTimelineClipProjection } from '@/engine/showUnifiedTimelineProjection'
import type { GrammarOperationResult, ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue, ShowGrammarDocument } from '../types.js'
import {
  composedShow,
  compositionOf,
  describeClip,
  idFactory,
  ownerFor,
  planRefusal,
  refuse,
  replacedShow,
  resolveClip,
  type ClipContext,
  controlExportIssue,
} from '../support.js'

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

const resizeClip: ShowGrammarOperation = {
  name: 'resize_clip',
  description:
    'Change the duration of one clip on the global timeline, keeping its start time. Address the clip ' +
    'by the clip id from open_show. Give exactly one of duration_ms (new length) or end_ms (new absolute ' +
    'end on the global timeline), in milliseconds. A clip spanning several internal Scenes resizes as one ' +
    'clip. Refused if the new span would overlap another clip on the same Zone and layer, or run past the ' +
    'end of the Show.',
  mutates: [
    '/composition/scenes/*/zones/*/main/*',
    '/composition/scenes/*/zones/*/overlays/*/placements/*',
  ],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    duration_ms: z.number().optional().describe('New clip length in milliseconds'),
    end_ms: z.number().optional().describe('New absolute clip end on the global timeline, in milliseconds'),
  },
  apply(document, args) {
    const resolved = resolveClip(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const context = resolved.context
    const { clip, zoneName, timelineDurationMs } = context

    const hasDuration = args.duration_ms !== undefined
    const hasEnd = args.end_ms !== undefined
    if (hasDuration === hasEnd) {
      return refuse({ code: 'invalid-argument', message: 'Give exactly one of duration_ms or end_ms.' })
    }
    const durationMs = hasDuration
      ? (args.duration_ms as number)
      : (args.end_ms as number) - clip.startMs
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return refuse({
        code: 'invalid-argument',
        message: `The clip would be ${durationMs} ms long; a clip needs a positive duration.`,
      })
    }
    const endMs = clip.startMs + durationMs
    if (endMs > timelineDurationMs) {
      return refuse({
        code: 'outside-timeline',
        message: `The clip would end at ${endMs} ms, past the end of the Show at ${timelineDurationMs} ms.`,
        remedy:
          `Choose a duration of at most ${timelineDurationMs - clip.startMs} ms, or move Show End ` +
          'later with set_show_end first.',
      })
    }
    const conflict = overlapConflict(context, clip.zoneId, clip.kind, clip.layerIndex, clip.startMs, endMs)
    if (conflict) {
      return refuse({
        code: 'overlap',
        message:
          `Resizing to ${durationMs} ms would overlap clip ${describeClip(conflict.clip, conflict.zoneName)} ` +
          'on the same Zone and layer.',
        remedy:
          `Resize to at most ${conflict.clip.startMs - clip.startMs} ms, or move or resize clip ` +
          `${conflict.clip.id} first.`,
      })
    }

    const composition = compositionOf(document)
    const result = resizeShowClipAtGlobalTime(document.show, composition, {
      owner: ownerFor(clip),
      globalStartMs: clip.startMs,
      durationMs,
    })
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message:
          `The engine declined to resize clip ${clip.id} to ${durationMs} ms. ` +
          'Re-read the clip listing; the clip may span a boundary this operation cannot cross.',
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'resize_clip',
        targetId: clip.id,
        description:
          `Clip ${clip.id} (${clip.patternName} on ${zoneName}) now runs ` +
          `${clip.startMs}–${endMs} ms (${durationMs} ms).`,
        before: { startMs: clip.startMs, durationMs: clip.durationMs },
        after: { startMs: clip.startMs, durationMs },
      }],
    }
  },
}

const addClip: ShowGrammarOperation = {
  name: 'add_clip',
  description:
    'Add a new clip at a global time on a Zone and layer, referencing a stock pattern or an inline user ' +
    'pattern supplied at open_show. Omit overlay_layer_index for the main layer. The clip takes the ' +
    'requested duration_ms (default 5000) or as much free time as the layer has before the next clip; ' +
    'the change list reports the actual span. With extend_show true, a clip placed at the very end of ' +
    'the Show extends Show End to fit it. Refused when the time is invalid, the layer is occupied, or ' +
    'there is no free time.',
  mutates: [
    '/composition/patternInstances',
    '/composition/scenes/*/zones/*/main',
    '/composition/scenes/*/zones/*/overlays/*/placements',
    '/composition/durationMs',
    // A new Pattern instance changes the cast; the engine forfeits the
    // deterministic-loop proof, which re-stamps on the next open.
    '/composition/executionModel',
    '/scenes/*/durationMs',
  ],
  inputShape: {
    zone_id: z.string().describe('Zone id from the open_show listing'),
    start_ms: z.number().describe('Global timeline start in milliseconds'),
    duration_ms: z.number().optional().describe('Requested clip length in milliseconds (default 5000)'),
    pattern_kind: z.enum(['stock', 'user']).describe('Pattern reference kind'),
    pattern_id: z.string().describe('Stock catalogue id, or an inline user-pattern id from open_show'),
    pattern_name: z.string().optional().describe('Display name (defaults to the pattern id)'),
    overlay_layer_index: z.number().int().min(0).optional()
      .describe('Overlay layer index; omit for the main layer'),
    extend_show: z.boolean().optional()
      .describe('Allow a clip at Show End to extend the Show to fit (default false)'),
  },
  apply(document, args) {
    const zoneId = args.zone_id as string
    if (!document.show.zones.some((zone) => zone.id === zoneId)) {
      return refuse(unknownZone(document, zoneId))
    }
    const layerIndex = args.overlay_layer_index as number | undefined
    if (layerIndex !== undefined && layerIndex >= maxOverlayCount(document, zoneId)) {
      return refuse({
        code: 'missing-owner',
        message:
          `Zone ${zoneId} has ${maxOverlayCount(document, zoneId)} overlay layers; there is no layer ` +
          `at index ${layerIndex}.`,
        remedy: 'Add one with add_overlay_layer, or target an existing layer.',
      })
    }
    const target: ShowClipAddTarget = layerIndex === undefined
      ? { kind: 'main' }
      : { kind: 'overlay', layerIndex }
    const composition = compositionOf(document)
    const location = {
      zoneId,
      globalTimeMs: args.start_ms as number,
      defaultDurationMs: args.duration_ms as number | undefined,
      target,
    }
    const plan = planShowClipAtGlobalTime(document.show, composition, location)
    if (!plan.enabled) {
      return refuse(planRefusal(plan, `Cannot add a clip at ${args.start_ms} ms on Zone ${zoneId}`))
    }

    const newId = idFactory(document)
    const instance: ShowPatternInstance = {
      id: newId('instance'),
      pattern: { kind: args.pattern_kind as 'stock' | 'user', id: args.pattern_id as string },
      patternName: (args.pattern_name as string | undefined) ?? (args.pattern_id as string),
      time: { timeScale: 1, timeOffsetMs: 0 },
    }
    const placementId = newId('clip')

    let nextDocument: ShowGrammarDocument
    if (args.extend_show) {
      const result = addShowClipAtGlobalTimeExtendingShow(document.show, composition, {
        ...location,
        instance,
        placementId,
      })
      if (result === document.show) {
        return refuse({
          code: 'engine-refused',
          message: `The engine declined to add the clip at ${args.start_ms} ms on Zone ${zoneId}.`,
        })
      }
      nextDocument = replacedShow(document, result)
    } else {
      const result = addShowClipAtGlobalTime(document.show, composition, {
        ...location,
        instance,
        placementId,
      })
      if (result === composition) {
        return refuse({
          code: 'engine-refused',
          message: `The engine declined to add the clip at ${args.start_ms} ms on Zone ${zoneId}.`,
        })
      }
      nextDocument = composedShow(document, result)
    }
    const requested = Math.max(1, Math.round((args.duration_ms as number | undefined) ?? 5_000))
    return {
      ok: true,
      document: nextDocument,
      changes: [{
        op: 'add_clip',
        targetId: placementId,
        description:
          `Clip ${placementId} (${instance.patternName}) added on Zone ${zoneId} ` +
          `${layerIndex === undefined ? 'main layer' : `overlay layer ${layerIndex}`} at ` +
          `${Math.round(args.start_ms as number)} ms for ${plan.durationMs} ms` +
          `${plan.durationMs < requested ? ` (clamped from ${requested} ms by the next clip)` : ''}.`,
        details: { instanceId: instance.id },
      }],
    }
  },
}

const moveClip: ShowGrammarOperation = {
  name: 'move_clip',
  description:
    'Move one clip to a new global start time, optionally to another Zone or layer (layer "main" or an ' +
    'overlay layer index; default is the clip’s current layer). The clip keeps its duration; a clip ' +
    'spanning several internal Scenes moves as one clip, and its property-track keyframes move with it. ' +
    'Refused if the target span would overlap another clip on the target Zone and layer or run past the ' +
    'end of the Show.',
  mutates: [
    '/composition/scenes/*/zones/*',
    '/composition/scenes/*/propertyTracks',
  ],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    start_ms: z.number().describe('New global timeline start in milliseconds'),
    zone_id: z.string().optional().describe('Target Zone id (default: the clip’s current Zone)'),
    layer: z.union([z.literal('main'), z.number().int().min(0)]).optional()
      .describe('Target layer: "main" or an overlay layer index (default: the current layer)'),
  },
  apply(document, args) {
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
    if (conflict) {
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
    const composition = compositionOf(document)
    const result = moveShowClipAtGlobalTime(document.show, composition, { owner: ownerFor(clip), target })
    if (result === composition) {
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

const splitClip: ShowGrammarOperation = {
  name: 'split_clip',
  description:
    'Split one clip in two at a global time strictly inside it. The left part keeps the clip id; the ' +
    'change list carries the new right-part clip id. Property tracks targeting the clip stay attached to ' +
    'the correct halves. A clip spanning several internal Scenes splits as one clip.',
  mutates: [
    '/composition/scenes/*/zones/*',
    '/composition/scenes/*/propertyTracks',
  ],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    at_ms: z.number().describe('Global timeline split point, strictly inside the clip'),
  },
  apply(document, args) {
    const resolved = resolveClip(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const { clip } = resolved.context
    const composition = compositionOf(document)
    const owner = ownerFor(clip)
    const plan = planShowClipSplitAtGlobalTime(document.show, composition, {
      owner,
      globalTimeMs: args.at_ms as number,
    })
    if (!plan.enabled) {
      return refuse(planRefusal(
        plan,
        `Cannot split clip ${clip.id} (${clip.startMs}–${clip.endMs} ms) at ${args.at_ms} ms`,
      ))
    }
    const newPlacementId = idFactory(document)('clip')
    const result = splitShowClipAtGlobalTime(document.show, composition, {
      owner,
      globalTimeMs: args.at_ms as number,
      newPlacementId,
    })
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to split clip ${clip.id} at ${args.at_ms} ms.`,
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'split_clip',
        targetId: newPlacementId,
        description:
          `Clip ${clip.id} split at ${Math.round(args.at_ms as number)} ms; the right part is ` +
          `clip ${newPlacementId}.`,
        details: { leftClipId: clip.id, rightClipId: newPlacementId },
      }],
    }
  },
}

const duplicateClip: ShowGrammarOperation = {
  name: 'duplicate_clip',
  description:
    'Duplicate one clip immediately after itself on the same Zone and layer. By default the duplicate is ' +
    'independent (its own Pattern instance and state); with linked true it shares the original’s Pattern ' +
    'instance, keeping visual identity. Refused when there is no free time after the clip.',
  mutates: [
    '/composition/patternInstances',
    '/composition/scenes/*/zones/*',
    '/composition/scenes/*/propertyTracks',
  ],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    linked: z.boolean().optional()
      .describe('Share the original’s Pattern instance (default false: independent duplicate)'),
  },
  apply(document, args) {
    const resolved = resolveClip(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const { clip } = resolved.context
    const composition = compositionOf(document)
    const owner = ownerFor(clip)
    const linked = Boolean(args.linked)
    const plan = planShowClipDuplicateAfter(document.show, composition, { owner, independent: !linked })
    if (!plan.enabled) {
      return refuse(planRefusal(plan, `Cannot duplicate clip ${clip.id} (${clip.startMs}–${clip.endMs} ms)`))
    }
    const newId = idFactory(document)
    const newPlacementId = newId('clip')
    const result = linked
      ? duplicateLinkedShowClipAfter(document.show, composition, { owner, newPlacementId })
      : duplicateShowClipAfter(document.show, composition, {
          owner,
          newPlacementId,
          newInstanceId: newId('instance'),
        })
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to duplicate clip ${clip.id}.`,
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'duplicate_clip',
        targetId: newPlacementId,
        description:
          `Clip ${clip.id} duplicated ${linked ? 'linked' : 'independently'} as clip ${newPlacementId} at ` +
          `${clip.endMs}–${clip.endMs + clip.durationMs} ms.`,
        details: { sourceClipId: clip.id, linked },
      }],
    }
  },
}

const removeClip: ShowGrammarOperation = {
  name: 'remove_clip',
  description:
    'Remove one clip from the timeline (all segments, if it spans several internal Scenes). The Show keeps ' +
    'at least one clip; removing the last one is refused.',
  mutates: [
    '/composition/scenes/*/zones/*',
    '/composition/scenes/*/propertyTracks',
    '/composition/patternInstances',
  ],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
  },
  apply(document, args) {
    const resolved = resolveClip(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const { clip, siblings } = resolved.context
    if (siblings.length <= 1) {
      return refuse({
        code: 'last-clip',
        message: `Clip ${clip.id} is the Show's only clip; a Show keeps at least one.`,
        remedy: 'Add a replacement clip first, or edit this one instead.',
      })
    }
    const composition = compositionOf(document)
    let result = clip.kind === 'main'
      ? deleteShowMainPlacement(composition, {
          sceneId: clip.sceneId,
          zoneId: clip.zoneId,
          placementId: clip.id,
        })
      : deleteShowOverlayPlacement(composition, {
          sceneId: clip.sceneId,
          zoneId: clip.zoneId,
          layerId: clip.layerId ?? '',
          placementId: clip.id,
        })
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to remove clip ${clip.id}.`,
      })
    }
    // The engine leaves the clip's Pattern instance behind. An orphaned
    // instance is dead weight — and an orphaned user-pattern instance keeps
    // the document tier-0-invalid — so prune it (and its instance-targeted
    // tracks) when no other placement references it.
    const stillUsed = result.scenes.some((scene) => scene.zones.some((zone) =>
      zone.main.some((placement) => placement.instanceId === clip.instanceId) ||
      zone.overlays.some((layer) =>
        layer.placements.some((placement) => placement.instanceId === clip.instanceId))))
    if (!stillUsed) {
      result = {
        ...result,
        patternInstances: result.patternInstances.filter((instance) => instance.id !== clip.instanceId),
        scenes: result.scenes.map((scene) => {
          const tracks = (scene.propertyTracks ?? []).filter((track) =>
            !('instanceId' in track.target) || track.target.instanceId !== clip.instanceId)
          const { propertyTracks: _dropped, ...rest } = scene
          return tracks.length > 0 ? { ...rest, propertyTracks: tracks } : rest
        }),
      }
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'remove_clip',
        targetId: clip.id,
        description: `Clip ${clip.id} (${clip.patternName}, ${clip.startMs}–${clip.endMs} ms) removed.`,
      }],
    }
  },
}

const makeClipPatternIndependent: ShowGrammarOperation = {
  name: 'make_clip_pattern_independent',
  description:
    'Give one clip its own Pattern instance, splitting it from the other clips that share the instance. ' +
    'Instance-targeted property tracks are copied for the new instance. Refused when the clip already ' +
    'owns its instance alone.',
  mutates: ['/composition/patternInstances', '/composition/scenes/*'],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
  },
  apply(document, args) {
    const resolved = resolveClip(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const { clip } = resolved.context
    const composition = compositionOf(document)
    const owner = ownerFor(clip)
    const ownership = projectShowClipPatternInstanceOwnership(composition, owner)
    if (ownership && ownership.useCount <= 1) {
      return refuse({
        code: 'already-independent',
        message:
          `Clip ${clip.id} already owns Pattern instance ${ownership.instanceId} alone; nothing shares it.`,
        remedy: 'Use rejoin_clip_pattern_instance to share an instance instead.',
      })
    }
    const newInstanceId = idFactory(document)('instance')
    const result = makeShowClipPatternIndependent(composition, { owner, newInstanceId })
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to make clip ${clip.id} independent.`,
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'make_clip_pattern_independent',
        targetId: clip.id,
        description:
          `Clip ${clip.id} now runs its own Pattern instance ${newInstanceId}, independent of the ` +
          `${(ownership?.useCount ?? 2) - 1} other clip(s) on the previous instance.`,
        details: { newInstanceId },
      }],
    }
  },
}

const rejoinClipPatternInstance: ShowGrammarOperation = {
  name: 'rejoin_clip_pattern_instance',
  description:
    'Make one clip share another clip’s Pattern instance (same Pattern required), so they render with ' +
    'shared state and identity. If the source instance had no other users, it is discarded along with its ' +
    'instance-targeted property tracks.',
  mutates: ['/composition/patternInstances', '/composition/scenes/*'],
  inputShape: {
    clip_id: z.string().describe('The clip to re-home'),
    target_clip_id: z.string().describe('A clip whose Pattern instance this clip should share'),
  },
  apply(document, args) {
    const resolved = resolveClip(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const targetResolved = resolveClip(document, args.target_clip_id as string)
    if (!targetResolved.ok) return targetResolved
    const { clip } = resolved.context
    const target = targetResolved.context.clip
    const composition = compositionOf(document)
    const owner = ownerFor(clip)
    const plan = planShowClipPatternRejoin(composition, { owner, targetInstanceId: target.instanceId })
    if (!plan.enabled) {
      return refuse(planRefusal(
        plan,
        `Cannot rejoin clip ${clip.id} to clip ${target.id}'s instance ${target.instanceId}`,
      ))
    }
    const result = rejoinShowClipPatternInstance(composition, { owner, targetInstanceId: target.instanceId })
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to rejoin clip ${clip.id} to instance ${target.instanceId}.`,
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'rejoin_clip_pattern_instance',
        targetId: clip.id,
        description:
          `Clip ${clip.id} now shares Pattern instance ${plan.targetInstanceId} with clip ${target.id}` +
          `${plan.discardsSourceState ? '; its previous sole-use instance was discarded' : ''}.`,
        details: { targetInstanceId: plan.targetInstanceId },
      }],
    }
  },
}

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

function inspectorOwnerFor(clip: ShowUnifiedTimelineClipProjection): ShowClipInspectorOwner {
  return clip.kind === 'main'
    ? { kind: 'scene-main', sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.startPlacementId }
    : {
        kind: 'scene-overlay',
        sceneId: clip.sceneId,
        zoneId: clip.zoneId,
        layerId: clip.layerId ?? '',
        placementId: clip.startPlacementId,
      }
}

function applyInspectorPatch(
  operationName: string,
  document: ShowGrammarDocument,
  clipId: string,
  patch: ShowClipInspectorPatch,
  describe: (clip: ShowUnifiedTimelineClipProjection) => string,
): GrammarOperationResult {
  const resolved = resolveClip(document, clipId)
  if (!resolved.ok) return resolved
  const { clip } = resolved.context
  const result = updateShowClipInspector(document.show, inspectorOwnerFor(clip), patch)
  if (result === document.show) {
    return refuse({
      code: 'engine-refused',
      message: `The engine declined to update clip ${clip.id}. Check the values against the clip listing.`,
    })
  }
  return {
    ok: true,
    document: replacedShow(document, result),
    changes: [{ op: operationName, targetId: clip.id, description: describe(clip) }],
  }
}

const setClipView: ShowGrammarOperation = {
  name: 'set_clip_view',
  description:
    'Set a clip’s placement view values: mirror (reflect the Pattern domain), phase (0–1 domain offset), ' +
    'or brightness (0–1 output scale, the main-layer way to dim a clip). Give at least one field.',
  mutates: ['/composition/scenes/*/zones/*/main/*/view', '/composition/scenes/*/zones/*/overlays/*/placements/*/view'],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    mirror: z.boolean().optional(),
    phase: z.number().optional().describe('Domain offset, 0–1'),
    brightness: z.number().optional().describe('Output scale, 0–1'),
  },
  apply(document, args) {
    const view: Record<string, unknown> = {}
    if (args.mirror !== undefined) view.mirror = args.mirror
    if (args.phase !== undefined) view.phase = args.phase
    if (args.brightness !== undefined) view.brightness = args.brightness
    if (Object.keys(view).length === 0) {
      return refuse({ code: 'invalid-argument', message: 'Give at least one of mirror, phase, or brightness.' })
    }
    return applyInspectorPatch('set_clip_view', document, args.clip_id as string, { view }, (clip) =>
      `Clip ${clip.id} view updated: ${
        Object.entries(view).map(([key, value]) => `${key} ${JSON.stringify(value)}`).join(', ')}.`,
    )
  },
}

const setClipControlTarget: ShowGrammarOperation = {
  name: 'set_clip_control_target',
  description:
    'Set (or clear, with value null) one of the Pattern’s exported slider-control targets on the clip’s ' +
    'Pattern instance. Values are 0–1. Every clip sharing the instance is affected.',
  mutates: ['/composition/patternInstances/*/controlTargets'],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    export_name: z.string().describe('The Pattern’s exported control function name'),
    value: z.number().min(0).max(1).nullable().describe('Control target 0–1, or null to clear it'),
  },
  apply(document, args) {
    const resolved = resolveClip(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const { clip } = resolved.context
    const instance = compositionOf(document).patternInstances
      .find((candidate) => candidate.id === clip.instanceId)
    const merged: Record<string, number> = { ...(instance?.controlTargets ?? {}) }
    const exportName = args.export_name as string
    if (args.value !== null) {
      const issue = controlExportIssue(document, clip.instanceId, exportName)
      if (issue) return refuse(issue)
    }
    if (args.value === null) {
      if (!(exportName in merged)) {
        return refuse({
          code: 'no-change',
          message: `Instance ${clip.instanceId} has no control target "${exportName}" to clear.`,
        })
      }
      delete merged[exportName]
    } else {
      merged[exportName] = args.value as number
    }
    return applyInspectorPatch(
      'set_clip_control_target',
      document,
      args.clip_id as string,
      { simulation: { controlTargets: merged } },
      (target) =>
        args.value === null
          ? `Control target "${exportName}" cleared on clip ${target.id}'s instance.`
          : `Control target "${exportName}" set to ${args.value} on clip ${target.id}'s instance.`,
    )
  },
}

const setClipTime: ShowGrammarOperation = {
  name: 'set_clip_time',
  description:
    'Set the clip’s Pattern-instance time behavior: time_scale (animation speed multiplier) or ' +
    'time_offset_ms (phase offset into the Pattern’s own time). Give at least one field. Every clip ' +
    'sharing the instance is affected.',
  mutates: ['/composition/patternInstances/*/time'],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    time_scale: z.number().optional().describe('Animation speed multiplier (1 is normal speed)'),
    time_offset_ms: z.number().optional().describe('Offset into the Pattern’s own time, in milliseconds'),
  },
  apply(document, args) {
    const simulation: Record<string, unknown> = {}
    if (args.time_scale !== undefined) simulation.timeScale = args.time_scale
    if (args.time_offset_ms !== undefined) simulation.timeOffsetMs = args.time_offset_ms
    if (Object.keys(simulation).length === 0) {
      return refuse({ code: 'invalid-argument', message: 'Give at least one of time_scale or time_offset_ms.' })
    }
    return applyInspectorPatch('set_clip_time', document, args.clip_id as string, { simulation }, (clip) =>
      `Clip ${clip.id} instance time updated: ${
        Object.entries(simulation).map(([key, value]) => `${key} ${JSON.stringify(value)}`).join(', ')}.`,
    )
  },
}

const setClipEvaluation: ShowGrammarOperation = {
  name: 'set_clip_evaluation',
  description:
    'Set the clip’s Pattern evaluation policy: live (evaluate continuously), freeze-at-entry (hold one ' +
    'complete entry frame), or rolling-refresh (refresh a quarter of pixels per frame). Every clip sharing ' +
    'the instance is affected; use restart_clip for a fresh instance at entry.',
  mutates: ['/composition/patternInstances/*/evaluationPolicy'],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    policy: z.enum(['live', 'freeze-at-entry', 'rolling-refresh']),
  },
  apply(document, args) {
    return applyInspectorPatch(
      'set_clip_evaluation',
      document,
      args.clip_id as string,
      { evaluationPolicy: args.policy as 'live' | 'freeze-at-entry' | 'rolling-refresh' },
      (clip) => `Clip ${clip.id} evaluation policy set to ${args.policy}.`,
    )
  },
}

const addOverlayLayer: ShowGrammarOperation = {
  name: 'add_overlay_layer',
  description:
    'Add a new topmost overlay layer to a Zone across the whole timeline (every Scene). The new layer is ' +
    'overlay index 0; existing overlay layers shift down one index. Add clips to it with add_clip.',
  mutates: ['/composition/scenes/*/zones/*/overlays'],
  inputShape: {
    zone_id: z.string().describe('Zone id from the open_show listing'),
  },
  apply(document, args) {
    const zoneId = args.zone_id as string
    if (!document.show.zones.some((zone) => zone.id === zoneId)) {
      return refuse(unknownZone(document, zoneId))
    }
    const composition = compositionOf(document)
    const newId = idFactory(document)
    const layers = composition.scenes.map((scene) => ({ sceneId: scene.sceneId, layerId: newId('layer') }))
    const result = addShowOverlayLayerAcrossTimeline(document.show, composition, { zoneId, layers })
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to add an overlay layer to Zone ${zoneId}.`,
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'add_overlay_layer',
        targetId: layers[0]?.layerId ?? zoneId,
        description:
          `New topmost overlay layer added to Zone ${zoneId} across all ${layers.length} Scene(s); ` +
          'it is overlay layer index 0.',
        details: { layerIdsBySceneId: Object.fromEntries(layers.map((layer) => [layer.sceneId, layer.layerId])) },
      }],
    }
  },
}

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
  setClipView,
  setClipControlTarget,
  setClipTime,
  setClipEvaluation,
  addOverlayLayer,
]
