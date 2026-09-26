// Clip commands over the v2 Clip creation, temporal, appearance, replacement and
// Transition owners. Placement of a Transition-connected Clip goes through the
// Transition owner's connected move, so one arrangement validates once.
import type { ShowPatternRef } from '../personalContentRecords'
import type { ShowRecordV2 } from '../showCompositionV2'
import { editShowClipV2, type ShowClipDuplicateIdentityPlanV2, type ShowIndependentInstancePlanV2 } from '../showClipsV2'
import { editShowClipAppearanceV2 } from '../showClipAppearanceEditsV2'
import { editShowTransitionV2 } from '../showTransitionsV2'
import { editShowClipTemporalV2, type ShowClipTemporalResultV2 } from '../showClipTemporalV2'
import { effectiveShowInstanceUseCountV2, materializeShowGroupsV2 } from '../showGroupsV2'
import {
  refuseShowCommandV2,
  unchangedShowCommandV2,
  type ShowCommandV2Descriptor,
} from './registry'
import {
  adoptOwnerResult,
  adoptOwnerResults,
  describeIds,
  durationField,
  freshShowIdV2,
  freshShowIdsV2,
  idField,
  invalidArgument,
  ownedShowIdsV2,
  timeField,
  unknownIdentity,
  appearancePatchFromInput,
} from './support'
import {
  CLIP_PATCH_FIELD,
  CLIP_SPEC_FIELD,
  createClipsFromSpecs,
  unknownClip,
  writeInstanceProperties,
} from './clipSpec'
import { PATTERN_REFERENCE_FIELD } from './support'

const createClips: ShowCommandV2Descriptor = {
  name: 'create_clips',
  family: 'clips',
  description: 'Create Clips at exact global intervals. Each Clip names its Zone, Layer, start, duration and Pattern source. The instance policy decides the runtime: "sole" reuses the one existing runtime for that source (or creates the first when none exists) and refuses with candidates when several exist, "new" creates the first runtime, and any other value is an explicit instance identity. Timing is exact; nothing is clamped and Show End never grows.',
  touches: ['/composition/clips', '/composition/patternInstances'],
  fields: {
    clips: {
      kind: 'array',
      minItems: 1,
      maxItems: 128,
      description: 'The Clips to create, applied in order as one atomic candidate.',
      items: CLIP_SPEC_FIELD,
    },
  },
  apply(record, input, context) {
    return createClipsFromSpecs('create_clips', record, input.clips as Array<Record<string, unknown>>, context)
  },
}

/**
 * Resize one Clip through the temporal owner, which applies the Transition
 * policy itself: a trailing edge ripples connected successors, and a leading
 * edge changes an incoming Transition duration or removes it at zero.
 */
function resizeClipEdges(record: ShowRecordV2, clipId: string, startMs: number, endMs: number): ShowClipTemporalResultV2 {
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)!
  const oldEndMs = clip.startMs + clip.durationMs
  const inside = startMs >= clip.startMs && endMs <= oldEndMs
  return editShowClipTemporalV2(record, { kind: inside ? 'trim' : 'extend', clipId, startMs, endMs })
}

/** Placement fields that move or resize a Clip. */
function placementRequest(patch: Record<string, unknown>, clip: { zoneId: string; layerId: string; startMs: number; durationMs: number }) {
  const zoneId = (patch.zone_id as string | undefined) ?? clip.zoneId
  const layerId = (patch.layer_id as string | undefined) ?? clip.layerId
  const startMs = (patch.start_ms as number | undefined) ?? clip.startMs
  const durationMs = (patch.duration_ms as number | undefined) ?? clip.durationMs
  return {
    zoneId,
    layerId,
    startMs,
    durationMs,
    moved: zoneId !== clip.zoneId || layerId !== clip.layerId || startMs !== clip.startMs,
    resized: durationMs !== clip.durationMs,
  }
}

const updateClips: ShowCommandV2Descriptor = {
  name: 'update_clips',
  family: 'clips',
  description: 'Update Clips by identity: placement (Zone, Layer, start, duration), entry policy, Zone sample mode, held appearance and Pattern-instance values. Moving a Transition-connected Clip in time translates its whole connected component rigidly and preserves Transition identity and settings. Changing a Clip\'s Zone or Layer carries its held appearance and Clip-owned tracks with it, and refuses when the Clip is a participant endpoint of a Transition or a contributor to a converted boundary Transition, when the destination Layer is occupied, or when the destination Zone is missing from the active Layout for any part of its contribution. An appearance patch applies to the whole Clip or to the held key at one global time, leaving later keys with their own values. Instance values affect every Clip sharing that runtime and are reported in the affected set.',
  touches: ['/composition/clips', '/composition/patternInstances', '/composition/transitions', '/composition/propertyTracks'],
  fields: {
    updates: {
      kind: 'array',
      minItems: 1,
      maxItems: 128,
      description: 'The Clip updates, applied in order as one atomic candidate.',
      items: CLIP_PATCH_FIELD,
    },
  },
  apply(record, input, context) {
    const patches = input.updates as Array<Record<string, unknown>>
    const seen = new Set<string>()
    for (const [index, patch] of patches.entries()) {
      const clipId = patch.clip_id as string
      if (seen.has(clipId)) return invalidArgument(record, 'update_clips', `Clip "${clipId}" is updated twice; give one patch per Clip.`, `$.updates[${index}].clip_id`)
      seen.add(clipId)
      if (!record.composition.clips.some(clip => clip.id === clipId)) return unknownClip(record, 'update_clips', clipId)
      const appearance = patch.appearance as Record<string, unknown> | undefined
      const apply = appearance?.apply as Record<string, unknown> | undefined
      if (appearance && (!apply || (apply.scope === 'at-time' && apply.at_ms === undefined))) {
        return invalidArgument(record, 'update_clips', 'an appearance patch needs apply.scope, and at-time needs apply.at_ms.', `$.updates[${index}].appearance.apply`)
      }
    }
    const steps: Array<{ run: (value: ShowRecordV2) => { status: 'changed' | 'unchanged' | 'refused'; record: ShowRecordV2; code?: string; message?: string }; targetId: string }> = []
    const usedIds = ownedShowIdsV2(record)
    for (const patch of patches) {
      const clipId = patch.clip_id as string
      const clip = record.composition.clips.find(candidate => candidate.id === clipId)!
      const request = placementRequest(patch, clip)
      const reroutes = request.zoneId !== clip.zoneId || request.layerId !== clip.layerId
      if (request.moved || request.resized) {
        steps.push({
          targetId: clipId,
          run: value => {
            // A destination change goes through the Clip re-placement intent,
            // which validates routing, occupancy and Transition consistency in
            // one candidate; a time-only change keeps the connected move.
            const moved = request.moved
              ? editShowClipTemporalV2(value, reroutes
                ? { kind: 'replace-placement', clipId, zoneId: request.zoneId, layerId: request.layerId, startMs: request.startMs }
                : { kind: 'move', clipId, startMs: request.startMs })
              : { status: 'unchanged' as const, record: value }
            if (moved.status === 'refused') return moved
            if (!request.resized) return moved
            const afterMove = moved.record
            const placed = afterMove.composition.clips.find(candidate => candidate.id === clipId)!
            const resized = resizeClipEdges(afterMove, clipId, placed.startMs, placed.startMs + request.durationMs)
            return moved.status === 'changed'
              ? combineResults({ ...moved, status: 'changed' as const }, resized)
              : resized
          },
        })
      }
      if (patch.entry_policy !== undefined || patch.zone_sample_mode !== undefined) {
        steps.push({ targetId: clipId, run: value => writeClipFlags(value, clipId, patch) })
      }
      const appearance = patch.appearance as Record<string, unknown> | undefined
      if (appearance) {
        const { apply, ...values } = appearance
        const scope = (apply as Record<string, unknown>).scope as string
        const atMs = (apply as Record<string, unknown>).at_ms as number | undefined
        steps.push({
          targetId: clipId,
          run: value => {
            const clip = value.composition.clips.find(candidate => candidate.id === clipId)!
            const patch = appearancePatchFromInput(values)
            if (scope === 'whole-clip') {
              return editShowClipAppearanceV2(value, { clipId, scope: 'whole-clip', kind: 'appearance', patch: patch as never })
            }
            const existing = clip.appearance.keys.find(key => key.timeMs === atMs)
            const appearanceKeyId = existing?.id ?? freshShowIdV2(`${clipId}-appearance-${atMs}`, usedIds)
            usedIds.add(appearanceKeyId)
            return editShowClipAppearanceV2(value, {
              clipId, scope: 'selected-time', atMs: atMs!,
              keyIdentity: { kind: existing ? 'retain' : 'insert', appearanceKeyId },
              kind: 'appearance', patch: patch as never,
            })
          },
        })
      }
      const instanceProperties = patch.instance_properties as Record<string, unknown> | undefined
      if (instanceProperties) {
        steps.push({ targetId: clipId, run: value => writeInstanceProperties(value, clipId, instanceProperties, context) })
      }
    }
    return adoptOwnerResults('update_clips', record, steps,
      affected => `Updated Clips ${describeIds(affected.clips)}.`)
  },
}

/** Merge two accepted owner results so one command step reports both affected sets. */
function combineResults(
  first: { status: 'changed'; record: ShowRecordV2 },
  second: { status: 'changed' | 'unchanged' | 'refused'; record: ShowRecordV2 },
): { status: 'changed' | 'unchanged' | 'refused'; record: ShowRecordV2; code?: string; message?: string } {
  if (second.status !== 'changed') return second.status === 'unchanged' ? first : second
  const merged: Record<string, unknown> = { ...(first as unknown as Record<string, unknown>) }
  for (const [key, value] of Object.entries(second as unknown as Record<string, unknown>)) {
    const existing = merged[key]
    if (Array.isArray(value) && Array.isArray(existing)) merged[key] = [...new Set([...existing, ...value])]
    else merged[key] = value
  }
  return merged as unknown as { status: 'changed'; record: ShowRecordV2 }
}

/**
 * Clip entry policy and Zone sample mode: authored flags with no owner cascade.
 * The entry policy goes through the shared `set-entry-policy` owner in
 * `showClipsV2`, which the editor's admission wrapper also calls, so the command
 * and the editor cannot write that flag two different ways.
 */
function writeClipFlags(
  record: ShowRecordV2,
  clipId: string,
  patch: Record<string, unknown>,
): { status: 'changed' | 'unchanged' | 'refused'; record: ShowRecordV2; code?: string; message?: string; affectedClipIds?: string[] } {
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)!
  const entryPolicy = (patch.entry_policy as 'continue' | 'restart' | undefined) ?? clip.entryPolicy
  const zoneSampleMode = (patch.zone_sample_mode as ShowRecordV2['composition']['clips'][number]['zoneSampleMode'] | undefined) ?? clip.zoneSampleMode
  const policy = editShowClipV2(record, { kind: 'set-entry-policy', clipId, entryPolicy })
  if (policy.status === 'refused') return { status: 'refused', record, code: policy.code, message: policy.message }
  if (zoneSampleMode === clip.zoneSampleMode) {
    return policy.status === 'changed'
      ? { status: 'changed', record: policy.record, affectedClipIds: [clipId] }
      : { status: 'unchanged', record }
  }
  const next = structuredClone(policy.record)
  next.composition.clips.find(candidate => candidate.id === clipId)!.zoneSampleMode = zoneSampleMode
  return { status: 'changed', record: next, affectedClipIds: [clipId] }
}

const removeClips: ShowCommandV2Descriptor = {
  name: 'remove_clips',
  family: 'clips',
  description: 'Remove Clips by identity. Each Clip\'s own tracks and every Transition record naming it are removed; surviving Clip positions and Show End stay fixed, so the vacated window becomes visible blank time. Removing the final content leaves a valid empty Show that stays editable and saveable.',
  touches: ['/composition/clips', '/composition/transitions', '/composition/propertyTracks', '/composition/patternInstances', '/composition/executionModel'],
  fields: {
    clip_ids: {
      kind: 'array',
      minItems: 1,
      maxItems: 128,
      description: 'The Clips to remove.',
      items: idField('A Clip identity.'),
    },
  },
  apply(record, input) {
    const ids = input.clip_ids as string[]
    for (const clipId of ids) {
      if (!record.composition.clips.some(clip => clip.id === clipId)) return unknownClip(record, 'remove_clips', clipId)
    }
    if (new Set(ids).size !== ids.length) {
      return invalidArgument(record, 'remove_clips', 'clip_ids must be unique.', '$.clip_ids')
    }
    const clipById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
    const seenGroups = new Map<string, string>()
    for (const clipId of ids) {
      const key = clipById.get(clipId)?.logicalClipId ?? clipId
      if (!seenGroups.has(key)) seenGroups.set(key, clipId)
    }
    const representatives = [...seenGroups.values()]
    return adoptOwnerResults('remove_clips', record,
      representatives.map(clipId => ({ targetId: clipId, run: (value: ShowRecordV2) => editShowTransitionV2(value, { kind: 'delete-clip', clipId }) })),
      affected => `Removed Clips ${describeIds(ids)}; Transitions ${describeIds(affected.transitions)}.`)
  },
}

const resizeClip: ShowCommandV2Descriptor = {
  name: 'resize_clip',
  family: 'clips',
  description: 'Resize one Clip. A trailing resize (end_ms or duration_ms) moves its end and ripples connected successors by the end delta while preserving Transition durations. A leading resize (start_ms) keeps the end fixed and changes an incoming Transition\'s duration by the same delta. When start_ms reaches or passes the Transition\'s window start, the Clip extends to start_ms and that Transition is removed; nothing else moves. An occupied range refuses.',
  touches: ['/composition/clips', '/composition/transitions', '/composition/propertyTracks'],
  exactlyOne: ['end_ms', 'duration_ms', 'start_ms'],
  fields: {
    clip_id: idField('The Clip to resize.'),
    end_ms: timeField('New exclusive end in global milliseconds (trailing resize).', true),
    duration_ms: durationField('New duration in milliseconds (trailing resize).', true),
    start_ms: timeField('New start in global milliseconds (leading resize).', true),
  },
  apply(record, input) {
    const clipId = input.clip_id as string
    const clip = record.composition.clips.find(candidate => candidate.id === clipId)
    if (!clip) return unknownClip(record, 'resize_clip', clipId)
    const oldEndMs = clip.startMs + clip.durationMs
    const startMs = (input.start_ms as number | undefined) ?? clip.startMs
    const endMs = input.start_ms !== undefined ? oldEndMs
      : (input.end_ms as number | undefined) ?? clip.startMs + (input.duration_ms as number)
    return adoptOwnerResult('resize_clip', record,
      resizeClipEdges(record, clipId, startMs, endMs),
      affected => `Clip ${clipId} spans ${startMs}\u2013${endMs} ms; Clips ${describeIds(affected.clips)}.`, clipId)
  },
}

const splitClip: ShowCommandV2Descriptor = {
  name: 'split_clip',
  family: 'clips',
  description: 'Split one Clip at a global millisecond strictly inside it. The left piece keeps the Clip identity and its incoming Transition endpoints; the right piece is a new Clip sharing the same Pattern instance with entry policy continue, and outgoing Transition endpoints retarget to it. Neither piece restarts.',
  touches: ['/composition/clips', '/composition/transitions', '/composition/propertyTracks'],
  fields: {
    clip_id: idField('The Clip to split.'),
    at_ms: timeField('Global millisecond strictly inside the Clip.'),
  },
  apply(record, input) {
    const clipId = input.clip_id as string
    if (!record.composition.clips.some(clip => clip.id === clipId)) return unknownClip(record, 'split_clip', clipId)
    const rightClipId = freshShowIdV2(`${clipId}-right`, ownedShowIdsV2(record))
    return adoptOwnerResult('split_clip', record,
      editShowClipV2(record, { kind: 'split', clipId, atMs: input.at_ms as number, rightClipId }),
      () => `Clip ${clipId} split at ${input.at_ms as number} ms into ${clipId} and ${rightClipId}.`, clipId)
  },
}

const duplicateClip: ShowCommandV2Descriptor = {
  name: 'duplicate_clip',
  family: 'clips',
  description: 'Duplicate one Clip at a new placement. The copy shares the source Pattern runtime by default and carries its authored entry policy, so a restarting copy resets the clock every Clip on that runtime sees. Pass independent true to give the copy its own runtime with copied controls and eligible instance tracks.',
  touches: ['/composition/clips', '/composition/patternInstances', '/composition/propertyTracks'],
  fields: {
    clip_id: idField('The Clip to duplicate.'),
    start_ms: timeField('Global start of the copy.'),
    zone_id: idField('Zone for the copy; defaults to the source Zone.', true),
    layer_id: idField('Layer for the copy; defaults to the source Layer.', true),
    independent: { kind: 'boolean', optional: true, description: 'Give the copy its own Pattern runtime instead of sharing the source runtime. Default false.' },
  },
  apply(record, input) {
    const clipId = input.clip_id as string
    const clip = record.composition.clips.find(candidate => candidate.id === clipId)
    if (!clip) return unknownClip(record, 'duplicate_clip', clipId)
    const used = ownedShowIdsV2(record)
    const newClipId = freshShowIdV2(`${clipId}-copy`, used)
    used.add(newClipId)
    const appearanceKeyIds = freshShowIdsV2(clip.appearance.keys.map(key => `${key.id}-copy`), used)
    appearanceKeyIds.forEach(id => used.add(id))
    const sourceTracks = record.composition.propertyTracks.filter(track => 'clipId' in track.target && track.target.clipId === clip.id)
    const clipTrackIdentitiesBySourceTrackId: Record<string, { trackId: string; keyframeIdsBySourceId: Record<string, string> }> = {}
    for (const track of sourceTracks) {
      const trackId = freshShowIdV2(`${track.id}-copy`, used)
      used.add(trackId)
      const keyframeIdsBySourceId: Record<string, string> = {}
      for (const keyframe of track.keyframes) {
        const keyId = freshShowIdV2(`${keyframe.id}-copy`, used)
        used.add(keyId)
        keyframeIdsBySourceId[keyframe.id] = keyId
      }
      clipTrackIdentitiesBySourceTrackId[track.id] = { trackId, keyframeIdsBySourceId }
    }
    const identities: ShowClipDuplicateIdentityPlanV2 = {
      clipId: newClipId,
      appearanceKeyIdsBySourceId: Object.fromEntries(clip.appearance.keys.map((key, index) => [key.id, appearanceKeyIds[index]])),
      clipTrackIdentitiesBySourceTrackId,
    }
    const steps: Array<{ run: (value: ShowRecordV2) => { status: 'changed' | 'unchanged' | 'refused'; record: ShowRecordV2; code?: string; message?: string }; targetId: string }> = [{
      targetId: newClipId,
      run: value => editShowClipV2(value, {
        kind: 'duplicate', clipId,
        zoneId: (input.zone_id as string | undefined) ?? clip.zoneId,
        layerId: (input.layer_id as string | undefined) ?? clip.layerId,
        startMs: input.start_ms as number,
        identities,
      }),
    }]
    if (input.independent === true) {
      steps.push({
        targetId: newClipId,
        run: value => {
          const plan = independencePlan(value, newClipId, used)
          if ('message' in plan) return { status: 'refused', record: value, code: 'invalid-argument', message: plan.message }
          return editShowClipV2(value, { kind: 'make-independent', clipId: newClipId, independence: plan })
        },
      })
    }
    return adoptOwnerResults('duplicate_clip', record, steps,
      affected => `Clip ${clipId} duplicated as ${newClipId}; Pattern instances ${describeIds(affected.instances)}.`)
  },
}

/** Fresh instance and copied instance-track identities for an independence step. */
function independencePlan(
  record: ShowRecordV2,
  clipId: string,
  used: Set<string>,
  compatibleControlExports?: readonly string[],
): ShowIndependentInstancePlanV2 | { message: string } {
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)
  if (!clip) return { message: `no Clip has id "${clipId}".` }
  const instanceId = freshShowIdV2(`${clip.instanceId}-independent`, used)
  used.add(instanceId)
  const effective = materializeShowGroupsV2(record)
  const compatible = compatibleControlExports === undefined ? null : new Set(compatibleControlExports)
  const tracks = effective.composition.propertyTracks.filter(track => (
    'instanceId' in track.target && track.target.instanceId === clip.instanceId
    && (compatible === null || track.target.kind === 'instance-time-scale'
      || (track.target.kind === 'instance-control' && compatible.has(track.target.exportName)))
  ))
  const identitiesBySourceTrackId: Record<string, { trackId: string; keyframeIdsBySourceId: Record<string, string> }> = {}
  for (const track of tracks) {
    const trackId = freshShowIdV2(`${track.id}-independent`, used)
    used.add(trackId)
    const keyframeIdsBySourceId: Record<string, string> = {}
    for (const keyframe of track.keyframes) {
      const keyId = freshShowIdV2(`${keyframe.id}-independent`, used)
      used.add(keyId)
      keyframeIdsBySourceId[keyframe.id] = keyId
    }
    identitiesBySourceTrackId[track.id] = { trackId, keyframeIdsBySourceId }
  }
  return { instanceId, identitiesBySourceTrackId }
}

const replaceClipPattern: ShowCommandV2Descriptor = {
  name: 'replace_clip_pattern',
  family: 'clips',
  description: 'Replace the Pattern behind one Clip. When the Clip shares its runtime, an independent runtime is created for it first with its controls and eligible instance tracks copied; other users keep their instance, controls, tracks and compiled member. Compatible public sliders and instance time-scale tracks are kept; incompatible controls are dropped and named in discardedControlTargets. Clip and Transition identities and Transition settings are preserved. Pattern metadata comes from the trusted source resolver, never from arguments.',
  touches: ['/composition/patternInstances', '/composition/clips/*/instanceId', '/composition/propertyTracks'],
  fields: {
    clip_id: idField('The Clip whose Pattern changes.'),
    pattern: PATTERN_REFERENCE_FIELD,
  },
  apply(record, input, context) {
    const clipId = input.clip_id as string
    const clip = record.composition.clips.find(candidate => candidate.id === clipId)
    if (!clip) return unknownClip(record, 'replace_clip_pattern', clipId)
    const resolver = context?.resolvePattern
    if (!resolver) {
      return refuseShowCommandV2(record, {
        code: 'missing-dependency',
        message: 'replace_clip_pattern: resolved Pattern metadata is unavailable in this session.',
      })
    }
    const resolved = resolver(input.pattern as ShowPatternRef)
    if (resolved.status === 'refused') {
      return refuseShowCommandV2(record, { code: 'missing-dependency', message: `replace_clip_pattern: ${resolved.message}` })
    }
    const shared = effectiveShowInstanceUseCountV2(record, clip.instanceId) > 1
    const used = ownedShowIdsV2(record)
    const exports = resolved.replacement.exportedSliders.map(control => control.exportName)
    const independence = shared ? independencePlan(record, clipId, used, exports) : undefined
    if (independence && 'message' in independence) {
      return invalidArgument(record, 'replace_clip_pattern', independence.message)
    }
    return adoptOwnerResult('replace_clip_pattern', record,
      editShowClipV2(record, {
        kind: 'replace-pattern', clipId,
        replacement: resolved.replacement,
        ...(independence ? { independence } : {}),
      }),
      affected => `Clip ${clipId} now plays ${resolved.replacement.patternName}; Pattern instances ${describeIds(affected.instances)}.`,
      clipId)
  },
}

const makeClipPatternIndependent: ShowCommandV2Descriptor = {
  name: 'make_clip_pattern_independent',
  family: 'clips',
  description: 'Give one Clip its own Pattern runtime, copying the shared instance\'s controls and eligible instance tracks. Other users keep the original runtime. A Clip that is already the sole user of its runtime is unchanged.',
  touches: ['/composition/patternInstances', '/composition/clips/*/instanceId', '/composition/propertyTracks'],
  fields: { clip_id: idField('The Clip to separate.') },
  apply(record, input) {
    const clipId = input.clip_id as string
    if (!record.composition.clips.some(clip => clip.id === clipId)) return unknownClip(record, 'make_clip_pattern_independent', clipId)
    const plan = independencePlan(record, clipId, ownedShowIdsV2(record))
    if ('message' in plan) return invalidArgument(record, 'make_clip_pattern_independent', plan.message)
    return adoptOwnerResult('make_clip_pattern_independent', record,
      editShowClipV2(record, { kind: 'make-independent', clipId, independence: plan }),
      affected => `Clip ${clipId} now owns Pattern instance ${describeIds(affected.instances)}.`, clipId)
  },
}

const rejoinClipPatternInstance: ShowCommandV2Descriptor = {
  name: 'rejoin_clip_pattern_instance',
  family: 'clips',
  description: 'Point one Clip at an existing Pattern instance with the same structured Pattern source. The Clip adopts that instance\'s controls and tracks with no implicit animation merge; the vacated runtime and its tracks are collected only when nothing references them.',
  touches: ['/composition/patternInstances', '/composition/clips/*/instanceId', '/composition/propertyTracks'],
  fields: {
    clip_id: idField('The Clip to rejoin.'),
    instance_id: idField('The existing Pattern instance the Clip joins.'),
  },
  apply(record, input) {
    const clipId = input.clip_id as string
    if (!record.composition.clips.some(clip => clip.id === clipId)) return unknownClip(record, 'rejoin_clip_pattern_instance', clipId)
    const instanceId = input.instance_id as string
    if (!record.composition.patternInstances.some(instance => instance.id === instanceId)) {
      return unknownIdentity(record, 'rejoin_clip_pattern_instance', 'Pattern instance', instanceId,
        record.composition.patternInstances.map(instance => instance.id))
    }
    return adoptOwnerResult('rejoin_clip_pattern_instance', record,
      editShowClipV2(record, { kind: 'rejoin', clipId, targetInstanceId: instanceId }),
      affected => `Clip ${clipId} joined Pattern instance ${instanceId}; removed ${describeIds(affected.removed)}.`, clipId)
  },
}

export const SHOW_V2_CLIP_COMMANDS: ShowCommandV2Descriptor[] = [
  createClips,
  updateClips,
  removeClips,
  resizeClip,
  splitClip,
  duplicateClip,
  replaceClipPattern,
  makeClipPatternIndependent,
  rejoinClipPatternInstance,
]

export { unchangedShowCommandV2 }
