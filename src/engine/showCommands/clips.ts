import { SHOW_CLIP_PROPERTY_COMMANDS } from './clipProperties'
import { createSplitClipCommand } from './splitClip'
import { createOverlayLayerCommand } from './overlayLayer'
// Clip command family: placement lifecycle on the unified timeline through
// the existing pure authoring functions. Commands take global times and clip
// ids; owners are resolved from the unified timeline projection, so the ids
// are the ids every projection (summary included) reports.
import { newPersonalContentId } from '../personalContentMetadata'
import type { ShowPatternInstance, ShowRecord } from '../personalContentRecords'
import { deleteShowClipWithLayerTransitions } from '../showLayerTransitionAuthoring'
import { showCompositionClipCount } from '../showClipInvariant'
import {
  addShowClipAtGlobalTime,
  addShowClipAtGlobalTimeExtendingShow,
  makeShowClipPatternIndependent,
  planShowClipAtGlobalTime,
  planShowClipPatternRejoin,
  rejoinShowClipPatternInstance,
  type ShowTimelineClipMoveTarget,
} from '../showTimelineClipAuthoring'
import { resizeShowClipExactly, type ShowExactClipResizeRequest } from '../showExactClipResize'
import { moveShowClipExactly, type ShowExactClipMoveRequest } from '../showExactClipMove'
import {
  commandComposition,
  refuseShowCommand,
  withComposition,
  type ShowCommandDescriptor,
  type ShowCommandOutcome,
} from './registry'
import {
  engineIdentityRefusal,
  planRefusal,
  resolveCommandClip,
} from './support'
import { createDuplicateClipCommand } from './duplicateClip'

export function addClipCommandOutcome(record: ShowRecord, input: Record<string, unknown>, newId: (kind: 'instance' | 'clip') => string = () => newPersonalContentId()): ShowCommandOutcome {
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const composition = resolved.composition
  const target: ShowTimelineClipMoveTarget = input.overlay_layer_index === undefined
    ? { kind: 'main', zoneId: input.zone_id as string, globalStartMs: input.start_ms as number }
    : {
        kind: 'overlay',
        zoneId: input.zone_id as string,
        layerIndex: input.overlay_layer_index as number,
        globalStartMs: input.start_ms as number,
      }
  const location = {
    zoneId: input.zone_id as string,
    globalTimeMs: input.start_ms as number,
    target,
    defaultDurationMs: (input.duration_ms as number | undefined) ?? 5_000,
  }
  const instance: ShowPatternInstance = {
    id: newId('instance'),
    pattern: { kind: input.pattern_kind as 'stock' | 'user', id: input.pattern_id as string },
    patternName: (input.pattern_name as string | undefined) ?? (input.pattern_id as string),
    time: { timeScale: 1, timeOffsetMs: 0 },
  }
  const placementId = newId('clip')
  if (input.extend_show) {
    const result = addShowClipAtGlobalTimeExtendingShow(record, composition, {
      ...location,
      instance,
      placementId,
    })
    if (result === record) {
      const plan = planShowClipAtGlobalTime(record, composition, location)
      if (!plan.enabled) return planRefusal(plan, 'add_clip')
      return engineIdentityRefusal('add_clip', 'The extended placement did not fit.')
    }
    return {
      ok: true,
      record: result,
      changes: [{
        command: 'add_clip',
        targetId: placementId,
        description:
          `Clip ${instance.patternName} added on ${location.zoneId} at ${Math.round(location.globalTimeMs)} ms, extending the Show.`,
        details: { instanceId: instance.id },
      }],
    }
  }
  const plan = planShowClipAtGlobalTime(record, composition, location)
  if (!plan.enabled) return planRefusal(plan, 'add_clip')
  const result = addShowClipAtGlobalTime(record, composition, { ...location, instance, placementId })
  if (result === composition) return engineIdentityRefusal('add_clip', 'Check the target layer.')
  const clamped = plan.durationMs < ((input.duration_ms as number | undefined) ?? 5_000)
  return {
    ok: true,
    record: withComposition(record, result),
    changes: [{
      command: 'add_clip',
      targetId: placementId,
      description:
        `Clip ${instance.patternName} added on ${location.zoneId} at ${Math.round(location.globalTimeMs)} ms ` +
        `for ${plan.durationMs} ms${clamped ? ' (clamped to the free time)' : ''}.`,
      details: { instanceId: instance.id },
    }],
  }
}

const addClip: ShowCommandDescriptor = {
  name: 'add_clip',
  description:
    'Add a clip at a global time on a Zone\'s main layer (default) or one of its overlay layers ' +
    '(overlay_layer_index, 0 = topmost). The duration clamps to the free time before the next clip; ' +
    'with extend_show true, adding at Show End grows the Show to fit. Refused inside a Transition, on ' +
    'occupied time, or outside the Show.',
  touches: ['/composition/patternInstances', '/composition/scenes/*/zones', '/composition/durationMs', '/composition/executionModel', '/scenes', '/updatedAt'],
  fields: {
    zone_id: { kind: 'string', description: 'The Zone to place the clip on' },
    start_ms: { kind: 'number', description: 'Global start time in milliseconds' },
    duration_ms: { kind: 'number', optional: true, description: 'Requested duration; clamps to free time (default 5000)' },
    pattern_kind: { kind: 'string', enum: ['stock', 'user'], description: 'Where the Pattern lives' },
    pattern_id: { kind: 'string', description: 'The Pattern id' },
    pattern_name: { kind: 'string', optional: true, description: 'Display name (defaults to the id)' },
    overlay_layer_index: { kind: 'integer', optional: true, description: 'Overlay layer to target (0 = topmost); omit for main' },
    extend_show: { kind: 'boolean', optional: true, description: 'Grow the Show when adding at Show End' },
  },
  apply: (record, input) => addClipCommandOutcome(record, input),
}

const moveClip: ShowCommandDescriptor = {
  name: 'move_clip',
  description: 'Move a logical Clip to exact safe integer global milliseconds, optionally to another Zone or Layer. Supported Transition-connected chains move together on their existing Layer. Incompatible connected destinations, visual Transition removal, occupied destinations and moves outside the Show refuse atomically. A valid already-satisfied target makes no changes.',
  touches: ['/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', '/composition/transitions', '/updatedAt'],
  fields: {
    clip_id: { kind: 'string', description: 'Logical Clip id from the timeline listing' },
    start_ms: { kind: 'integer', safeInteger: true, description: 'Exact global start in milliseconds' },
    zone_id: { kind: 'string', optional: true, description: 'Destination Zone id; default current Zone' },
    layer: { kind: 'layer', optional: true, description: 'Destination Layer: main or a nonnegative overlay index; default current Layer' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const result = moveShowClipExactly(record, resolved.composition, {
      clipId: input.clip_id, globalStartMs: input.start_ms,
      ...(input.zone_id !== undefined ? { zoneId: input.zone_id } : {}),
      ...(input.layer !== undefined ? { layer: input.layer } : {}),
    } as ShowExactClipMoveRequest)
    if (result.status === 'refused' && result.code === 'missing-target') {
      const missing = resolveCommandClip(record, resolved.composition, input.clip_id as string)
      if (!missing.ok) return missing
    }
    if (result.status === 'refused') return refuseShowCommand({
      code: result.code === 'invalid-request' ? 'invalid-argument' : result.code === 'missing-target' ? 'unknown-clip' : result.code === 'missing-destination' ? 'missing-owner' : result.code,
      message: result.reason,
      ...(result.remedy ? { remedy: result.remedy } : {}),
      ...(result.reason.startsWith('Group-owned') ? { remedy: 'Move the Group through its supported Group operation.' } : {}),
    })
    if (result.status === 'noop') return { ok: true, record, changes: [] }
    return {
      ok: true, record: withComposition(record, result.composition),
      changes: [{ command: 'move_clip', targetId: input.clip_id as string,
        description: `Clip ${input.clip_id} moved to ${input.start_ms} ms.`,
        details: { movedClipIds: result.movedClipIds },
      }],
    }
  },
}

const resizeClip: ShowCommandDescriptor = {
  name: 'resize_clip',
  description: 'Resize a logical Clip exactly on the global timeline using safe integer milliseconds. Give exactly one of duration_ms or end_ms; start_ms optionally changes its start. Supported connected Clips move together and Transitions retain their identity. An already-satisfied valid request makes no changes; insufficient space or unsupported topology refuses atomically.',
  touches: ['/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', '/composition/transitions', '/updatedAt'],
  exactlyOne: ['duration_ms', 'end_ms'],
  fields: {
    clip_id: { kind: 'string', description: 'Logical Clip id from the timeline listing' },
    duration_ms: { kind: 'integer', safeInteger: true, optional: true, description: 'Exact new duration in milliseconds; give this or end_ms' },
    end_ms: { kind: 'integer', safeInteger: true, optional: true, description: 'Exact global end in milliseconds; give this or duration_ms' },
    start_ms: { kind: 'integer', safeInteger: true, optional: true, description: 'Exact global start in milliseconds; default unchanged' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const result = resizeShowClipExactly(record, resolved.composition, {
      clipId: input.clip_id,
      ...(input.duration_ms !== undefined ? { durationMs: input.duration_ms } : {}),
      ...(input.end_ms !== undefined ? { globalEndMs: input.end_ms } : {}),
      ...(input.start_ms !== undefined ? { globalStartMs: input.start_ms } : {}),
    } as ShowExactClipResizeRequest)
    if (result.status === 'refused' && result.code === 'missing-target') {
      const missing = resolveCommandClip(record, resolved.composition, input.clip_id as string)
      if (!missing.ok) return missing
    }
    if (result.status === 'refused') return refuseShowCommand({
      code: result.code === 'invalid-request' ? 'invalid-argument' : result.code === 'missing-target' ? 'unknown-clip' : result.code,
      message: result.reason,
      ...(result.availableRange ? { availableRange: result.availableRange } : {}),
    })
    if (result.status === 'noop') return { ok: true, record, changes: [] }
    const found = resolveCommandClip(record, result.composition, input.clip_id as string)
    if (!found.ok) return found
    const { clip } = found.context
    return {
      ok: true,
      record: withComposition(record, result.composition),
      changes: [{
        command: 'resize_clip', targetId: clip.id,
        description: `Clip ${clip.id} now runs ${clip.startMs}–${clip.endMs} ms (${clip.durationMs} ms).`,
        details: { startMs: clip.startMs, endMs: clip.endMs, durationMs: clip.durationMs, changedClipIds: result.changedClipIds, movedClipIds: result.movedClipIds, transitionChanges: result.transitionChanges },
      }],
    }
  },
}


const duplicateClip: ShowCommandDescriptor = createDuplicateClipCommand()

export const removeClipCommand: ShowCommandDescriptor = {
  name: 'remove_clip',
  description:
    'Remove a clip (every Scene segment), its placement tracks and attached Layer Transitions, plus newly orphaned Pattern instances and their tracks. The last clip ' +
    'of a Show refuses; a Show keeps at least one clip.',
  touches: ['/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', '/composition/patternInstances', '/composition/executionModel', '/composition/transitions', '/updatedAt'],
  fields: {
    clip_id: { kind: 'string', description: 'The clip to remove' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const composition = resolved.composition
    const found = resolveCommandClip(record, composition, input.clip_id as string)
    if (!found.ok) return found
    const { clip, owner } = found.context
    const result = deleteShowClipWithLayerTransitions(record, composition, owner)
    if (result === composition) {
      return refuseShowCommand({
        code: showCompositionClipCount(composition) <= 1 ? 'last-clip' : 'engine-refused',
        message: `Clip ${clip.id} was not removed; a Show keeps at least one clip and valid composition owners.`,
        remedy: 'Add a replacement Clip before removing the last Clip; otherwise repair invalid composition owners.',
      })
    }
    return {
      ok: true,
      record: withComposition(record, result),
      changes: [{
        command: 'remove_clip',
        targetId: clip.id,
        description: `Clip ${clip.patternName} removed (${clip.startMs}–${clip.endMs} ms).`,
      }],
    }
  },
}

export function independentClipCommandOutcome(record: ShowRecord, input: Record<string, unknown>, newId = newPersonalContentId): ShowCommandOutcome {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const composition = resolved.composition
    const found = resolveCommandClip(record, composition, input.clip_id as string)
    if (!found.ok) return found
    const { clip } = found.context
    // Siblings are logical clips (one entry per multi-Scene clip), so this
    // counts logical users of the instance, not physical Scene segments.
    const users = found.context.siblings
      .filter((sibling) => sibling.clip.instanceId === clip.instanceId).length
    if (users <= 1) {
      return refuseShowCommand({
        code: 'already-independent',
        message: `Clip ${clip.id} is already the only user of instance ${clip.instanceId}.`,
      })
    }
    const newInstanceId = newId()
    const result = makeShowClipPatternIndependent(composition, {
      owner: found.context.owner,
      newInstanceId,
    })
    if (result === composition) return engineIdentityRefusal('make_clip_pattern_independent', '')
    return {
      ok: true,
      record: withComposition(record, result),
      changes: [{
        command: 'make_clip_pattern_independent',
        targetId: clip.id,
        description: `Clip ${clip.patternName} now uses its own Pattern instance.`,
        details: { newInstanceId },
      }],
    }
}

const makeClipPatternIndependent: ShowCommandDescriptor = {
  name: 'make_clip_pattern_independent',
  description:
    'Give a clip its own copy of its Pattern instance, so editing controls or timing no longer affects ' +
    'the other clips that shared it. Refused when the clip is already the instance\'s only user.',
  touches: ['/composition/patternInstances', '/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', '/composition/executionModel', '/updatedAt'],
  fields: {
    clip_id: { kind: 'string', description: 'The clip to make independent' },
  },
  apply: (record, input) => independentClipCommandOutcome(record, input),
}

const rejoinClipPatternInstance: ShowCommandDescriptor = {
  name: 'rejoin_clip_pattern_instance',
  description:
    'Point a clip at another clip\'s Pattern instance of the same Pattern, re-linking their controls ' +
    'and timing. Refused for incompatible Patterns or an already-shared instance.',
  touches: ['/composition/patternInstances', '/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', '/composition/executionModel', '/updatedAt'],
  fields: {
    clip_id: { kind: 'string', description: 'The clip to re-link' },
    target_clip_id: { kind: 'string', description: 'A clip whose instance to join' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const composition = resolved.composition
    const found = resolveCommandClip(record, composition, input.clip_id as string)
    if (!found.ok) return found
    const target = resolveCommandClip(record, composition, input.target_clip_id as string)
    if (!target.ok) return target
    const plan = planShowClipPatternRejoin(composition, {
      owner: found.context.owner,
      targetInstanceId: target.context.clip.instanceId,
    })
    if (!plan.enabled) return planRefusal(plan, 'rejoin_clip_pattern_instance')
    const result = rejoinShowClipPatternInstance(composition, {
      owner: found.context.owner,
      targetInstanceId: target.context.clip.instanceId,
    })
    if (result === composition) return engineIdentityRefusal('rejoin_clip_pattern_instance', '')
    return {
      ok: true,
      record: withComposition(record, result),
      changes: [{
        command: 'rejoin_clip_pattern_instance',
        targetId: found.context.clip.id,
        description:
          `Clip ${found.context.clip.patternName} now shares instance ${target.context.clip.instanceId}.`,
      }],
    }
  },
}

export const SHOW_CLIP_COMMANDS: ShowCommandDescriptor[] = [
  ...SHOW_CLIP_PROPERTY_COMMANDS,
  createOverlayLayerCommand(),
  addClip,
  moveClip,
  resizeClip,
  createSplitClipCommand(),
  duplicateClip,
  removeClipCommand,
  makeClipPatternIndependent,
  rejoinClipPatternInstance,
]
