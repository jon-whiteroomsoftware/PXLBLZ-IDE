import { SHOW_CLIP_PROPERTY_COMMANDS } from './clipProperties'
import { createSplitClipCommand } from './splitClip'
import { createOverlayLayerCommand } from './overlayLayer'
// Clip command family: placement lifecycle on the unified timeline through
// the existing pure authoring functions. Commands take global times and clip
// ids; owners are resolved from the unified timeline projection, so the ids
// are the ids every projection (summary included) reports.
import { newPersonalContentId } from '../personalContentMetadata'
import type { ShowPatternInstance, ShowRecord } from '../personalContentRecords'
import { deleteShowClipInShow, type ShowClipDeletionResult } from '../showClipDeletion'
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
  formatShowCommandDuration,
  formatShowCommandTimeRange,
  monotonicRecord,
} from './support'
import { createDuplicateClipCommand } from './duplicateClip'

export function addClipCommandOutcome(record: ShowRecord, input: Record<string, unknown>, newId: (kind: 'instance' | 'clip') => string = () => newPersonalContentId()): ShowCommandOutcome {
  if (input.layer !== undefined && input.overlay_layer_index !== undefined) {
    return refuseShowCommand({
      code: 'invalid-argument',
      message: 'add_clip accepts layer or overlay_layer_index, not both. Prefer layer for new callers.',
    })
  }
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const composition = resolved.composition
  const layer = input.layer as 'main' | number | undefined
  const overlayLayerIndex = layer === undefined
    ? input.overlay_layer_index as number | undefined
    : typeof layer === 'number' ? layer : undefined
  const target: ShowTimelineClipMoveTarget = overlayLayerIndex === undefined
    ? { kind: 'main', zoneId: input.zone_id as string, globalStartMs: input.start_ms as number }
    : {
        kind: 'overlay',
        zoneId: input.zone_id as string,
        layerIndex: overlayLayerIndex,
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
  const accepted = (next: ShowRecord, extended: boolean): ShowCommandOutcome => {
    const found = resolveCommandClip(next, next.composition!, placementId)
    if (!found.ok) return engineIdentityRefusal('add_clip', 'The accepted placement could not be projected.')
    const { clip } = found.context
    const actualLayer = clip.kind === 'main' ? 'main' : clip.layerIndex
    const clamped = !extended && clip.durationMs < location.defaultDurationMs
    return {
      ok: true,
      record: next,
      changes: [{
        command: 'add_clip',
        targetId: placementId,
        description:
          `Clip ${instance.patternName} added on ${clip.zoneId} ${clip.kind === 'main' ? 'Main' : `overlay Layer ${clip.layerIndex}`} ` +
          `at ${clip.startMs} ms for ${clip.durationMs} ms${clamped ? ' (clamped to the free time)' : ''}${extended ? ', extending the Show' : ''}.`,
        details: {
          instanceId: instance.id,
          zoneId: clip.zoneId,
          layer: actualLayer,
          startMs: clip.startMs,
          endMs: clip.endMs,
          durationMs: clip.durationMs,
        },
      }],
    }
  }
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
    return accepted(result, true)
  }
  const plan = planShowClipAtGlobalTime(record, composition, location)
  if (!plan.enabled) return planRefusal(plan, 'add_clip')
  const result = addShowClipAtGlobalTime(record, composition, { ...location, instance, placementId })
  if (result === composition) return engineIdentityRefusal('add_clip', 'Check the target layer.')
  return accepted(withComposition(record, result), false)
}

const addClip: ShowCommandDescriptor = {
  name: 'add_clip',
  description:
    'Add a Clip at a global time on a Zone\'s Main Layer by default, or choose layer: main or a ' +
    'zero-based overlay index (0 = topmost). overlay_layer_index remains a compatibility spelling; ' +
    'supplying both Layer fields refuses. The duration clamps to free time; extend_show can grow Show End.',
  touches: ['/composition/patternInstances', '/composition/scenes/*/zones', '/composition/durationMs', '/composition/executionModel', '/scenes', '/updatedAt'],
  atMostOne: ['layer', 'overlay_layer_index'],
  fields: {
    zone_id: { kind: 'string', description: 'The Zone to place the clip on' },
    start_ms: { kind: 'number', description: 'Global start time in milliseconds' },
    duration_ms: { kind: 'number', optional: true, description: 'Requested duration; clamps to free time (default 5000)' },
    pattern_kind: { kind: 'string', enum: ['stock', 'user'], description: 'Where the Pattern lives' },
    pattern_id: { kind: 'string', description: 'The Pattern id' },
    pattern_name: { kind: 'string', optional: true, description: 'Display name (defaults to the id)' },
    layer: { kind: 'layer', optional: true, description: 'Preferred destination Layer: main or a zero-based overlay index (0 = topmost)' },
    overlay_layer_index: { kind: 'integer', safeInteger: true, minimum: 0, optional: true, description: 'Compatibility overlay index (0 = topmost); omit both Layer fields for Main' },
    extend_show: { kind: 'boolean', optional: true, description: 'Grow the Show when adding at Show End' },
  },
  apply: (record, input) => addClipCommandOutcome(record, input),
}

const moveClip: ShowCommandDescriptor = {
  name: 'move_clip',
  description: 'Move a logical Clip to exact safe integer global milliseconds, another Zone or another Layer. Omitted start_ms preserves its current private-candidate start; give at least one destination or time field. Overlay indices are zero-based and 0 is topmost. Existing Transition, collision and topology restrictions remain atomic.',
  touches: ['/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', '/composition/transitions', '/updatedAt'],
  atLeastOne: ['start_ms', 'zone_id', 'layer'],
  fields: {
    clip_id: { kind: 'string', description: 'Logical Clip id from the timeline listing' },
    start_ms: { kind: 'integer', safeInteger: true, minimum: 0, optional: true, description: 'Exact global start in milliseconds; default current start' },
    zone_id: { kind: 'string', optional: true, description: 'Destination Zone id; default current Zone' },
    layer: { kind: 'layer', optional: true, description: 'Destination Layer: main or a nonnegative overlay index; default current Layer' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const current = resolveCommandClip(record, resolved.composition, input.clip_id as string)
    if (!current.ok) {
      const issue = current.issues[0]
      return issue?.code === 'group'
        ? refuseShowCommand({ ...issue, code: 'unsupported-topology' })
        : current
    }
    const result = moveShowClipExactly(record, resolved.composition, {
      clipId: input.clip_id,
      globalStartMs: input.start_ms ?? current.context.clip.startMs,
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
    const found = resolveCommandClip(record, result.composition, input.clip_id as string)
    if (!found.ok) return found
    const { clip } = found.context
    return {
      ok: true, record: withComposition(record, result.composition),
      changes: [{ command: 'move_clip', targetId: clip.id,
        description: `Clip ${clip.id} moved to ${clip.startMs} ms on ${clip.zoneId} ${clip.kind === 'main' ? 'Main' : `overlay Layer ${clip.layerIndex}`}.`,
        details: {
          movedClipIds: result.movedClipIds,
          zoneId: clip.zoneId,
          layer: clip.kind === 'main' ? 'main' : clip.layerIndex,
          startMs: clip.startMs,
          endMs: clip.endMs,
          durationMs: clip.durationMs,
        },
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
    const before = resolveCommandClip(record, resolved.composition, input.clip_id as string)
    const verb = before.ok && clip.durationMs < before.context.clip.durationMs ? 'Shortened'
      : before.ok && clip.durationMs > before.context.clip.durationMs ? 'Lengthened'
        : 'Resized'
    return {
      ok: true,
      record: withComposition(record, result.composition),
      changes: [{
        command: 'resize_clip', targetId: clip.id,
        description: `${verb} ${clip.patternName} to ${formatShowCommandDuration(clip.durationMs)}.\n${formatShowCommandTimeRange(clip.startMs, clip.endMs, clip.durationMs)}`,
        details: { startMs: clip.startMs, endMs: clip.endMs, durationMs: clip.durationMs, changedClipIds: result.changedClipIds, movedClipIds: result.movedClipIds, transitionChanges: result.transitionChanges },
      }],
    }
  },
}


const duplicateClip: ShowCommandDescriptor = createDuplicateClipCommand()

type ShowClipDeletionRefusal = Extract<ShowClipDeletionResult, { status: 'refused' }>

function removeClipRefusal(
  clipId: string,
  result: ShowClipDeletionRefusal,
): ShowCommandOutcome {
  const location = result.transitionId
    ? ` Boundary Transition ${result.transitionId}.`
    : ''
  const related = result.details?.length
    ? ` Related IDs: ${result.details.join(', ')}.`
    : ''
  const explanation = result.reason === 'cross-boundary-shared-instance'
    ? 'the time-preserving boundary repair cannot move Pattern-instance state shared across that boundary'
    : result.reason === 'output-feedback-state'
      ? 'the time-preserving boundary repair cannot preserve output-feedback history across that boundary'
      : `the compound deletion could not preserve the complete Show (${result.reason})`
  const remedy = result.reason === 'cross-boundary-shared-instance'
    ? 'Keep the Clip, or separate the listed Pattern instance across the Scene boundary before retrying.'
    : result.reason === 'output-feedback-state'
      ? 'Keep the Clip, or remove the listed output-feedback state before retrying.'
      : result.details?.length
        ? 'Keep the Clip and repair the listed boundary dependency or malformed Show owner before retrying.'
        : 'Keep the Clip and repair the Show composition or boundary ownership before retrying.'
  return refuseShowCommand({
    code: result.reason,
    path: '$.clip_id',
    message: `Clip ${clipId} was not removed because ${explanation}.${location}${related}`,
    remedy,
  })
}

export const removeClipCommand: ShowCommandDescriptor = {
  name: 'remove_clip',
  description:
    'Remove a clip (every Scene segment), its placement tracks and attached Layer Transitions, plus newly orphaned Pattern instances and their tracks. Supported unused visual Scene boundaries become time-preserving Cuts. The last clip ' +
    'of a Show refuses; a Show keeps at least one clip.',
  touches: [
    '/composition/scenes/*/zones',
    '/composition/scenes/*/propertyTracks',
    '/composition/patternInstances',
    '/composition/executionModel',
    '/composition/transitions',
    '/composition/groupOccurrences/*/startMs',
    '/scenes/*/durationMs',
    '/transitions/*',
    '/updatedAt',
  ],
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
    const result = deleteShowClipInShow(record, composition, owner)
    if (result.status === 'refused') {
      if (showCompositionClipCount(composition) > 1) {
        return removeClipRefusal(clip.id, result)
      }
      return refuseShowCommand({
        code: 'last-clip',
        message: `Clip ${clip.id} was not removed; a Show keeps at least one clip and valid composition owners.`,
        remedy: 'Add a replacement Clip before removing the last Clip; otherwise repair invalid composition owners.',
      })
    }
    return {
      ok: true,
      record: monotonicRecord(record, result.record),
      changes: [{
        command: 'remove_clip',
        targetId: clip.id,
        description: `Clip ${clip.patternName} removed (${clip.startMs}–${clip.endMs} ms).`,
        details: {
          repairedTransitionIds: result.repairedTransitionIds,
          boundaryRepairs: result.repairedBoundaries,
          retainedTransitionIds: result.retainedBoundaries.map((boundary) => boundary.transitionId),
        },
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
