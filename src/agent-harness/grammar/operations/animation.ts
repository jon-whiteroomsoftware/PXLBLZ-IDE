// Provenance: pxlblz-v3 src/grammar/operations/animation.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Property-animation operation family: tracks and keyframes over every target
// kind the record supports. Tracks are Scene-owned and Scene-local in time;
// these operations take global timeline times and convert. Each entry wraps
// the vendored showPropertyAnimation functions and turns identity refusals
// into typed issues through the vendored track validator.
import { z } from 'zod'
import type {
  ShowPropertyAnimationKeyframe,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
} from '@/engine/personalContentRecords'
import {
  addShowPropertyKeyframe,
  addShowPropertyTrack,
  deleteShowPropertyKeyframe,
  deleteShowPropertyTrack,
  updateShowPropertyKeyframe,
} from '@/engine/showPropertyAnimation'
import type { GrammarOperationResult, ShowGrammarOperation } from '../registry.js'
import type { ShowGrammarDocument } from '../types.js'
import {
  composedShow,
  compositionOf,
  controlExportIssue,
  describeTarget,
  easingArgument,
  engineRefusal,
  findKeyframe,
  findTrack,
  idFactory,
  keyframeArgument,
  refuse,
  resolveClip,
  targetKey,
  toEasing,
  toSceneLocal,
  trackState,
} from '../support.js'

const trackTargetArgument = z
  .enum(['opacity', 'control', 'time-scale', 'view-brightness', 'view-phase'])
  .describe(
    'Which value the track animates: the clip’s opacity (overlay clips only), one of the Pattern ' +
      'instance’s controls (name it in control_export_name), the instance’s time scale, or the clip’s ' +
      'view brightness or phase.',
  )

const addPropertyTrack: ShowGrammarOperation = {
  name: 'add_property_track',
  description:
    'Add a property-animation track to the Scene that owns a clip, targeting the clip’s opacity, a ' +
    'Pattern-instance control, the instance time scale, or a view property. Give either explicit keyframes ' +
    '(at least two, at global timeline times) or initial_value to seed a constant two-keyframe track across ' +
    'the Scene. Keyframe times must fall inside the owning Scene. A Scene can carry only one track per ' +
    'target; the change list returns the new track and keyframe ids for follow-up edits.',
  mutates: ['/composition/scenes/*/propertyTracks'],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    target: trackTargetArgument,
    control_export_name: z.string().optional()
      .describe('Required for target "control": the Pattern’s exported control function name'),
    initial_value: z.number().optional()
      .describe('Seed a constant track across the Scene at this value (alternative to keyframes)'),
    keyframes: z.array(keyframeArgument).optional()
      .describe('Explicit keyframes at global timeline times (at least two)'),
  },
  apply(document, args) {
    const resolved = resolveClip(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const { clip } = resolved.context
    if (clip.startSceneId !== clip.endSceneId) {
      return refuse({
        code: 'multi-segment-clip',
        message:
          `Clip ${clip.id} spans Scenes ${clip.startSceneId}–${clip.endSceneId}; property tracks ` +
          'are Scene-owned and this operation edits one Scene.',
        remedy: 'Target a clip that lies inside one Scene.',
      })
    }

    const targetKind = args.target as string
    let target: ShowPropertyAnimationTarget
    if (targetKind === 'opacity') {
      target = { kind: 'placement-opacity', placementId: clip.startPlacementId }
    } else if (targetKind === 'control') {
      const exportName = args.control_export_name as string | undefined
      if (!exportName) {
        return refuse({
          code: 'invalid-argument',
          message: 'Target "control" needs control_export_name naming the Pattern’s control function.',
        })
      }
      const issue = controlExportIssue(document, clip.instanceId, exportName)
      if (issue) return refuse(issue)
      target = { kind: 'instance-control', instanceId: clip.instanceId, exportName }
    } else if (targetKind === 'time-scale') {
      target = { kind: 'instance-time-scale', instanceId: clip.instanceId }
    } else {
      target = {
        kind: 'placement-view',
        placementId: clip.startPlacementId,
        property: targetKind === 'view-brightness' ? 'brightness' : 'phase',
      }
    }

    const composition = compositionOf(document)
    const scene = composition.scenes.find((candidate) => candidate.sceneId === clip.sceneId)
    const existing = scene?.propertyTracks?.find(
      (candidate) => targetKey(candidate.target) === targetKey(target),
    )
    if (existing) {
      return refuse({
        code: 'duplicate-target',
        message:
          `Track ${existing.id} already animates the ${describeTarget(target)} in this Scene; ` +
          'a Scene can author only one track per target.',
        remedy: `Edit track ${existing.id} with add_keyframe or update_keyframe instead.`,
        candidates: [existing.id],
      })
    }

    const newId = idFactory(document)
    let keyframes: ShowPropertyAnimationKeyframe[]
    const explicit = args.keyframes as Array<{ time_ms: number; value: number; easing?: unknown }> | undefined
    if (explicit) {
      if (explicit.length < 2) {
        return refuse({
          code: 'invalid-argument',
          message: 'An animated property track needs at least two keyframes.',
        })
      }
      const built: ShowPropertyAnimationKeyframe[] = []
      for (const keyframe of explicit) {
        const local = toSceneLocal(document, clip.sceneId, keyframe.time_ms)
        if (!local.ok) return refuse(local.issue)
        built.push({
          id: newId('kf'),
          timeMs: local.localMs,
          value: keyframe.value,
          easing: toEasing(keyframe.easing),
        })
      }
      built.sort((left, right) => left.timeMs - right.timeMs)
      const collision = built.find((keyframe, index) => index > 0 && keyframe.timeMs === built[index - 1].timeMs)
      if (collision) {
        return refuse({
          code: 'duplicate-keyframe-time',
          message: `Two keyframes land on the same time (${collision.timeMs} ms Scene-local); keyframe times must differ.`,
        })
      }
      keyframes = built
    } else if (args.initial_value !== undefined) {
      const sceneRecord = document.show.scenes.find((candidate) => candidate.id === clip.sceneId)
      const value = args.initial_value as number
      keyframes = [
        { id: newId('kf'), timeMs: 0, value, easing: { curve: 'linear' } },
        { id: newId('kf'), timeMs: sceneRecord?.durationMs ?? 0, value, easing: { curve: 'linear' } },
      ]
    } else {
      return refuse({
        code: 'invalid-argument',
        message: 'Give either keyframes (at least two) or initial_value.',
      })
    }

    const track: ShowPropertyAnimationTrack = { id: newId('track'), target, keyframes }
    const result = addShowPropertyTrack(document.show, composition, clip.sceneId, track)
    if (result === composition) {
      const draft = structuredClone(composition)
      const draftScene = draft.scenes.find((candidate) => candidate.sceneId === clip.sceneId)
      if (draftScene) draftScene.propertyTracks = [...(draftScene.propertyTracks ?? []), track]
      return refuse(...engineRefusal(document.show, draft))
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'add_property_track',
        targetId: track.id,
        description:
          `Added track ${track.id} animating the ${describeTarget(target)} with keyframes at ` +
          `${keyframes.map((keyframe) => keyframe.timeMs).join(', ')} ms (Scene-local).`,
        details: { sceneId: clip.sceneId, keyframeIds: keyframes.map((keyframe) => keyframe.id) },
      }],
    }
  },
}

const addKeyframe: ShowGrammarOperation = {
  name: 'add_keyframe',
  description:
    'Add one keyframe to an existing property-animation track. Address the track by the id ' +
    'add_property_track returned (or the open_show listing). The time is global timeline milliseconds ' +
    'and must fall inside the track’s owning Scene; no two keyframes on a track may share a time.',
  mutates: ['/composition/scenes/*/propertyTracks/*/keyframes'],
  inputShape: {
    track_id: z.string().describe('Property track id'),
    time_ms: z.number().describe('Global timeline milliseconds'),
    value: z.number(),
    easing: easingArgument,
  },
  apply(document, args) {
    const found = findTrack(document, args.track_id as string)
    if (!found.ok) return found
    const { sceneId, track } = found.site
    const local = toSceneLocal(document, sceneId, args.time_ms as number)
    if (!local.ok) return refuse(local.issue)
    const collision = track.keyframes.find((candidate) => candidate.timeMs === local.localMs)
    if (collision) {
      return refuse({
        code: 'duplicate-keyframe-time',
        message:
          `Keyframe ${collision.id} already sits at ${local.localMs} ms (Scene-local) on track ${track.id}.`,
        remedy: `Update keyframe ${collision.id} with update_keyframe instead.`,
        candidates: [collision.id],
      })
    }
    const keyframe: ShowPropertyAnimationKeyframe = {
      id: idFactory(document)('kf'),
      timeMs: local.localMs,
      value: args.value as number,
      easing: toEasing(args.easing),
    }
    const composition = compositionOf(document)
    const result = addShowPropertyKeyframe(document.show, composition, sceneId, track.id, keyframe)
    if (result === composition) {
      const draft = structuredClone(composition)
      const draftTrack = draft.scenes
        .find((candidate) => candidate.sceneId === sceneId)?.propertyTracks
        ?.find((candidate) => candidate.id === track.id)
      draftTrack?.keyframes.push(keyframe)
      return refuse(...engineRefusal(document.show, draft))
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'add_keyframe',
        targetId: keyframe.id,
        description:
          `Keyframe ${keyframe.id} added to track ${track.id}: value ${keyframe.value} at ` +
          `${keyframe.timeMs} ms (Scene-local).`,
        details: { trackId: track.id },
      }],
    }
  },
}

/** Shared implementation for update_keyframe and move_keyframe. */
function applyKeyframeChange(
  operationName: string,
  document: ShowGrammarDocument,
  args: Record<string, unknown>,
): GrammarOperationResult {
  const found = findTrack(document, args.track_id as string)
  if (!found.ok) return found
  const { sceneId, track } = found.site
  const keyframeFound = findKeyframe(found.site, args.keyframe_id as string)
  if (!keyframeFound.ok) return keyframeFound
  const keyframe = keyframeFound.keyframe

  if (args.time_ms === undefined && args.value === undefined && args.easing === undefined) {
    return refuse({
      code: 'invalid-argument',
      message: 'Give at least one of time_ms, value, or easing.',
    })
  }
  const changes: Partial<Pick<ShowPropertyAnimationKeyframe, 'timeMs' | 'value' | 'easing'>> = {}
  if (args.time_ms !== undefined) {
    const local = toSceneLocal(document, sceneId, args.time_ms as number)
    if (!local.ok) return refuse(local.issue)
    const collision = track.keyframes.find(
      (candidate) => candidate.id !== keyframe.id && candidate.timeMs === local.localMs,
    )
    if (collision) {
      return refuse({
        code: 'duplicate-keyframe-time',
        message:
          `Keyframe ${collision.id} already sits at ${local.localMs} ms (Scene-local) on track ${track.id}.`,
        remedy: `Pick a different time, or update keyframe ${collision.id} instead.`,
        candidates: [collision.id],
      })
    }
    changes.timeMs = local.localMs
  }
  if (args.value !== undefined) changes.value = args.value as number
  if (args.easing !== undefined) changes.easing = toEasing(args.easing)

  const composition = compositionOf(document)
  const result = updateShowPropertyKeyframe(
    document.show, composition, sceneId, track.id, keyframe.id, changes,
  )
  if (result === composition) {
    const draft = structuredClone(composition)
    const draftKeyframe = draft.scenes
      .find((candidate) => candidate.sceneId === sceneId)?.propertyTracks
      ?.find((candidate) => candidate.id === track.id)?.keyframes
      .find((candidate) => candidate.id === keyframe.id)
    if (draftKeyframe) Object.assign(draftKeyframe, changes)
    return refuse(...engineRefusal(document.show, draft))
  }
  return {
    ok: true,
    document: composedShow(document, result),
    changes: [{
      op: operationName,
      targetId: keyframe.id,
      description:
        `Keyframe ${keyframe.id} on track ${track.id} updated: ${
          Object.entries(changes)
            .map(([key, next]) => `${key} ${JSON.stringify(next)}`)
            .join(', ')}.`,
      before: { timeMs: keyframe.timeMs, value: keyframe.value, easing: keyframe.easing },
      details: { trackId: track.id },
    }],
  }
}

const updateKeyframe: ShowGrammarOperation = {
  name: 'update_keyframe',
  description:
    'Change the time, value, or easing of one keyframe on a property-animation track. Give at least one ' +
    'of time_ms (global timeline milliseconds, inside the owning Scene), value, or easing. Keyframes stay ' +
    'sorted by time; two keyframes cannot share a time.',
  mutates: ['/composition/scenes/*/propertyTracks/*/keyframes/*'],
  inputShape: {
    track_id: z.string().describe('Property track id'),
    keyframe_id: z.string().describe('Keyframe id'),
    time_ms: z.number().optional().describe('New global timeline time in milliseconds'),
    value: z.number().optional(),
    easing: easingArgument,
  },
  apply(document, args) {
    return applyKeyframeChange('update_keyframe', document, args)
  },
}

const moveKeyframe: ShowGrammarOperation = {
  name: 'move_keyframe',
  description:
    'Move one keyframe to a new time (global timeline milliseconds, inside the owning Scene), keeping its ' +
    'value and easing. Keyframes stay sorted by time; two keyframes cannot share a time.',
  mutates: ['/composition/scenes/*/propertyTracks/*/keyframes/*/timeMs'],
  inputShape: {
    track_id: z.string().describe('Property track id'),
    keyframe_id: z.string().describe('Keyframe id'),
    time_ms: z.number().describe('New global timeline time in milliseconds'),
  },
  apply(document, args) {
    return applyKeyframeChange('move_keyframe', document, args)
  },
}

const deleteKeyframe: ShowGrammarOperation = {
  name: 'delete_keyframe',
  description:
    'Delete one keyframe from a property-animation track. A track keeps at least two keyframes; deleting ' +
    'below that minimum is refused.',
  mutates: ['/composition/scenes/*/propertyTracks/*/keyframes'],
  inputShape: {
    track_id: z.string().describe('Property track id'),
    keyframe_id: z.string().describe('Keyframe id'),
  },
  apply(document, args) {
    const found = findTrack(document, args.track_id as string)
    if (!found.ok) return found
    const { sceneId, track } = found.site
    const keyframeFound = findKeyframe(found.site, args.keyframe_id as string)
    if (!keyframeFound.ok) return keyframeFound
    if (track.keyframes.length <= 2) {
      return refuse({
        code: 'minimum-keyframes',
        message: `Track ${track.id} has ${track.keyframes.length} keyframes; a track keeps at least two.`,
        remedy: 'Update the remaining keyframes instead, or delete the track with delete_property_track.',
      })
    }
    const composition = compositionOf(document)
    const result = deleteShowPropertyKeyframe(composition, sceneId, track.id, keyframeFound.keyframe.id)
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to delete keyframe ${keyframeFound.keyframe.id} from track ${track.id}.`,
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'delete_keyframe',
        targetId: keyframeFound.keyframe.id,
        description:
          `Keyframe ${keyframeFound.keyframe.id} (at ${keyframeFound.keyframe.timeMs} ms Scene-local) ` +
          `deleted from track ${track.id}.`,
        details: { trackId: track.id },
      }],
    }
  },
}

const deletePropertyTrack: ShowGrammarOperation = {
  name: 'delete_property_track',
  description:
    'Delete one property-animation track and all of its keyframes from the Scene that owns it.',
  mutates: ['/composition/scenes/*/propertyTracks'],
  inputShape: {
    track_id: z.string().describe('Property track id'),
  },
  apply(document, args) {
    const found = findTrack(document, args.track_id as string)
    if (!found.ok) return found
    const { sceneId, track } = found.site
    const composition = compositionOf(document)
    const result = deleteShowPropertyTrack(composition, sceneId, track.id)
    if (result === composition) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to delete track ${track.id}.`,
      })
    }
    return {
      ok: true,
      document: composedShow(document, result),
      changes: [{
        op: 'delete_property_track',
        targetId: track.id,
        description:
          `Track ${track.id} (${describeTarget(track.target)}) deleted with its ` +
          `${track.keyframes.length} keyframes.`,
      }],
    }
  },
}

/** After an accepted edit the change carries the track's keyframes (global
 * times) and engine-evaluated samples, so the result confirms itself (#34). */
function withTrackState(operation: ShowGrammarOperation): ShowGrammarOperation {
  return {
    ...operation,
    apply(document, args) {
      const outcome = operation.apply(document, args)
      if (!outcome.ok) return outcome
      return {
        ...outcome,
        changes: outcome.changes.map((change) => {
          const trackId = change.op === 'add_property_track'
            ? change.targetId
            : (change.details?.trackId as string | undefined)
          const state = trackId ? trackState(outcome.document, trackId) : null
          return state ? { ...change, details: { ...change.details, ...state } } : change
        }),
      }
    },
  }
}

export const ANIMATION_OPERATIONS: ShowGrammarOperation[] = [
  addPropertyTrack,
  addKeyframe,
  updateKeyframe,
  moveKeyframe,
  deleteKeyframe,
  deletePropertyTrack,
].map(withTrackState)
