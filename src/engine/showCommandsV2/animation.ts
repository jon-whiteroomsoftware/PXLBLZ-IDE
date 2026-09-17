// Property animation commands over the v2 Property owner. Tracks use global
// time with explicit activation; a track has effect only inside
// [active_start_ms, active_start_ms + active_duration_ms). Retained curve
// descriptors are engine-owned and no command authors them.
import type { ShowStructuredEasing } from '../personalContentRecords'
import type { ShowPropertyKeyframeV2, ShowPropertyTargetV2, ShowRecordV2 } from '../showCompositionV2'
import { editShowPropertyV2 } from '../showPropertyEditsV2'
import { normalizeShowEasing } from '../showEasing'
import { effectiveShowClipsV2 } from '../showGroupsV2'
import {
  type ShowCommandV2Descriptor,
  type ShowCommandV2Field,
} from './registry'
import {
  EASING_FIELD,
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
} from './support'

/** The nine target forms of specification section 6, with clip-scoped short names. */
export const PROPERTY_TARGET_KINDS = [
  'opacity',
  'view-brightness',
  'view-phase',
  'transform-position-x',
  'transform-position-y',
  'transform-rotation',
  'transform-scale-x',
  'transform-scale-y',
  'aperture-x',
  'aperture-y',
  'aperture-width',
  'aperture-height',
  'effect',
  'control',
  'time-scale',
  'layout-split-position',
  'show-repeat-scale',
] as const

const TARGET_FIELD: ShowCommandV2Field = {
  kind: 'object',
  description: 'What the track animates. Clip kinds need clip_id; control and time-scale need instance_id; effect also needs effect_id and parameter; layout-split-position needs interval_id.',
  properties: {
    kind: { kind: 'string', enum: PROPERTY_TARGET_KINDS, description: 'Target kind.' },
    clip_id: idField('The Clip, for a Clip target.', true),
    instance_id: idField('The Pattern instance, for control and time-scale.', true),
    control: { kind: 'string', optional: true, maxLength: 200, description: 'Exported slider name, for control.' },
    effect_id: idField('The Clip Effect, for an effect target.', true),
    parameter: { kind: 'string', optional: true, maxLength: 200, description: 'Effect parameter name, for effect.' },
    interval_id: idField('The Layout interval, for split position.', true),
  },
}

const KEYFRAME_FIELD: ShowCommandV2Field = {
  kind: 'object',
  description: 'One keyframe inside the activation.',
  properties: {
    at_ms: timeField('Global ms for the keyframe.'),
    value: { kind: 'number', description: 'Value in the target units.' },
    easing: EASING_FIELD,
  },
}

/** Translate one command target into the persisted v2 target. */
function resolveTarget(
  record: ShowRecordV2,
  target: Record<string, unknown>,
): ShowPropertyTargetV2 | { message: string } {
  const kind = target.kind as typeof PROPERTY_TARGET_KINDS[number]
  const clipId = target.clip_id as string | undefined
  const clipScoped = kind === 'opacity' || kind.startsWith('view-') || kind.startsWith('transform-') || kind.startsWith('aperture-') || kind === 'effect'
  if (clipScoped) {
    if (!clipId) return { message: `target kind "${kind}" needs clip_id.` }
    if (!record.composition.clips.some(clip => clip.id === clipId)) return { message: `no Clip has id "${clipId}".` }
  }
  if (kind === 'opacity') return { kind: 'clip-opacity', clipId: clipId! }
  if (kind === 'view-brightness') return { kind: 'clip-view', clipId: clipId!, property: 'brightness' }
  if (kind === 'view-phase') return { kind: 'clip-view', clipId: clipId!, property: 'phase' }
  if (kind.startsWith('transform-')) {
    const property = ({
      'transform-position-x': 'positionX', 'transform-position-y': 'positionY',
      'transform-rotation': 'rotation', 'transform-scale-x': 'scaleX', 'transform-scale-y': 'scaleY',
    } as const)[kind as 'transform-position-x']
    return { kind: 'clip-transform', clipId: clipId!, property }
  }
  if (kind.startsWith('aperture-')) {
    const property = kind.slice('aperture-'.length) as 'x' | 'y' | 'width' | 'height'
    return { kind: 'clip-aperture', clipId: clipId!, property }
  }
  if (kind === 'effect') {
    const effectId = target.effect_id as string | undefined
    const parameterId = target.parameter as string | undefined
    if (!effectId || !parameterId) return { message: 'an effect target needs effect_id and parameter.' }
    const clip = record.composition.clips.find(candidate => candidate.id === clipId)!
    const effect = clip.appearance.keys.flatMap(key => key.value.effects ?? []).find(candidate => candidate.id === effectId)
    if (!effect) return { message: `Clip "${clipId}" has no Effect "${effectId}".` }
    return { kind: 'clip-effect', clipId: clipId!, effectId, effectKind: effect.kind, parameterId }
  }
  if (kind === 'control' || kind === 'time-scale') {
    const instanceId = target.instance_id as string | undefined
    if (!instanceId) return { message: `target kind "${kind}" needs instance_id.` }
    if (!record.composition.patternInstances.some(instance => instance.id === instanceId)) {
      return { message: `no Pattern instance has id "${instanceId}".` }
    }
    if (kind === 'time-scale') return { kind: 'instance-time-scale', instanceId }
    const exportName = target.control as string | undefined
    if (!exportName) return { message: 'a control target needs control.' }
    return { kind: 'instance-control', instanceId, exportName }
  }
  if (kind === 'layout-split-position') {
    const intervalId = target.interval_id as string | undefined
    if (!intervalId) return { message: 'a layout-split-position target needs interval_id.' }
    if (!record.composition.layoutOccurrences.some(occurrence => occurrence.id === intervalId)) {
      return { message: `no Layout interval has id "${intervalId}".` }
    }
    return { kind: 'layout-occurrence-split-position', layoutOccurrenceId: intervalId }
  }
  return { kind: 'show-repeat-scale' }
}

/** Default activation: the Clip span, the union of a runtime's user spans, or the Show. */
function defaultActivation(record: ShowRecordV2, target: ShowPropertyTargetV2): { startMs: number; durationMs: number } | { message: string } {
  if ('clipId' in target) {
    const clip = record.composition.clips.find(candidate => candidate.id === target.clipId)!
    return { startMs: clip.startMs, durationMs: clip.durationMs }
  }
  if ('instanceId' in target) {
    const users = effectiveShowClipsV2(record).filter(clip => clip.instanceId === target.instanceId)
    if (users.length === 0) return { message: `Pattern instance "${target.instanceId}" has no Clip users; give explicit activation.` }
    const startMs = Math.min(...users.map(clip => clip.startMs))
    const endMs = Math.max(...users.map(clip => clip.startMs + clip.durationMs))
    return { startMs, durationMs: endMs - startMs }
  }
  if (target.kind === 'layout-occurrence-split-position') {
    const occurrence = record.composition.layoutOccurrences.find(candidate => candidate.id === target.layoutOccurrenceId)!
    return { startMs: occurrence.startMs, durationMs: occurrence.durationMs }
  }
  return { startMs: 0, durationMs: record.composition.showEndMs }
}

const addPropertyTracks: ShowCommandV2Descriptor = {
  name: 'add_property_tracks',
  family: 'animation',
  description: 'Add Property animation tracks. Each names a typed target, an optional activation window in global milliseconds, and either explicit keyframes or a constant initial_value. Activation defaults to the Clip span for Clip targets, the union of user spans for Pattern-instance targets, the interval for a Layout split position, and the whole Show for repeat scale. Two tracks that would own the same instance target over overlapping activation refuse atomically.',
  touches: ['/composition/propertyTracks'],
  fields: {
    tracks: {
      kind: 'array',
      minItems: 1,
      maxItems: 128,
      description: 'Tracks to add, applied as one atomic candidate.',
      items: {
        kind: 'object',
        description: 'One Property track.',
        properties: {
          target: TARGET_FIELD,
          active_start_ms: timeField('Activation start; omit for the default.', true),
          active_duration_ms: durationField('Activation duration ms; omit for the default.', true),
          keyframes: {
            kind: 'array',
            optional: true,
            minItems: 2,
            maxItems: 128,
            description: 'Ordered keyframes inside the activation.',
            items: KEYFRAME_FIELD,
          },
          initial_value: { kind: 'number', optional: true, description: 'Constant value across the activation, instead of keyframes.' },
        },
      },
    },
  },
  apply(record, input) {
    const specs = input.tracks as Array<Record<string, unknown>>
    const used = ownedShowIdsV2(record)
    const trackIds = freshShowIdsV2(specs.map(spec => `track-${String((spec.target as Record<string, unknown>).kind)}`), used)
    trackIds.forEach(id => used.add(id))
    const steps: Array<{ run: (value: ShowRecordV2) => { status: 'changed' | 'unchanged' | 'refused'; record: ShowRecordV2; code?: string; message?: string }; targetId: string }> = []
    for (const [index, spec] of specs.entries()) {
      if ((spec.keyframes === undefined) === (spec.initial_value === undefined)) {
        return invalidArgument(record, 'add_property_tracks', 'give exactly one of keyframes or initial_value.', `$.tracks[${index}]`)
      }
      const target = resolveTarget(record, spec.target as Record<string, unknown>)
      if ('message' in target) return invalidArgument(record, 'add_property_tracks', target.message, `$.tracks[${index}].target`)
      const fallback = defaultActivation(record, target)
      if ('message' in fallback) return invalidArgument(record, 'add_property_tracks', fallback.message, `$.tracks[${index}]`)
      const activeStartMs = (spec.active_start_ms as number | undefined) ?? fallback.startMs
      const activeDurationMs = (spec.active_duration_ms as number | undefined) ?? fallback.durationMs
      const trackId = trackIds[index]
      const rawKeys = (spec.keyframes as Array<Record<string, unknown>> | undefined)
        ?? [{ at_ms: activeStartMs, value: spec.initial_value }, { at_ms: activeStartMs + activeDurationMs, value: spec.initial_value }]
      const keyIds = freshShowIdsV2(rawKeys.map((_, keyIndex) => `${trackId}-key-${keyIndex + 1}`), used)
      keyIds.forEach(id => used.add(id))
      const keyframes: ShowPropertyKeyframeV2[] = rawKeys.map((key, keyIndex) => ({
        id: keyIds[keyIndex],
        timeMs: key.at_ms as number,
        value: key.value as number,
        easing: normalizeShowEasing(key.easing as ShowStructuredEasing | undefined),
      }))
      steps.push({
        targetId: trackId,
        run: value => editShowPropertyV2(value, { kind: 'show' }, {
          kind: 'add-track',
          track: { id: trackId, target, activeStartMs, activeDurationMs, keyframes },
        }),
      })
    }
    return adoptOwnerResults('add_property_tracks', record, steps,
      affected => `Added Property tracks ${describeIds(affected.tracks)}.`)
  },
}

const updatePropertyTrack: ShowCommandV2Descriptor = {
  name: 'update_property_track',
  family: 'animation',
  description: 'Change one Property track\'s activation window. Keyframes keep their global times and must stay inside the new window; an instance target that would overlap another active owner refuses.',
  touches: ['/composition/propertyTracks/*/activeStartMs', '/composition/propertyTracks/*/activeDurationMs'],
  atLeastOne: ['active_start_ms', 'active_duration_ms'],
  fields: {
    track_id: idField('The Property track to change.'),
    active_start_ms: timeField('New global activation start.', true),
    active_duration_ms: durationField('New activation duration in milliseconds.', true),
  },
  apply(record, input) {
    const trackId = input.track_id as string
    if (!record.composition.propertyTracks.some(track => track.id === trackId)) {
      return unknownIdentity(record, 'update_property_track', 'Property track', trackId, record.composition.propertyTracks.map(track => track.id))
    }
    return adoptOwnerResult('update_property_track', record,
      editShowPropertyV2(record, { kind: 'show' }, {
        kind: 'update-track', trackId,
        patch: {
          ...(input.active_start_ms !== undefined ? { activeStartMs: input.active_start_ms as number } : {}),
          ...(input.active_duration_ms !== undefined ? { activeDurationMs: input.active_duration_ms as number } : {}),
        },
      }),
      () => `Property track ${trackId} activation updated.`, trackId)
  },
}

const editPropertyKeyframes: ShowCommandV2Descriptor = {
  name: 'edit_property_keyframes',
  family: 'animation',
  description: 'Add, update and remove keyframes of one Property track in a single atomic call. Editing an endpoint or its easing explicitly reauthors the adjacent segment and replaces any retained restriction descriptor with the requested curve.',
  touches: ['/composition/propertyTracks/*/keyframes'],
  fields: {
    track_id: idField('The Property track to edit.'),
    edits: {
      kind: 'object',
      description: 'Removals, updates and additions in one candidate.',
      atLeastOne: ['add', 'update', 'remove'],
      properties: {
        add: {
          kind: 'array', optional: true, minItems: 1, maxItems: 128,
          description: 'Keyframes to add.',
          items: KEYFRAME_FIELD,
        },
        update: {
          kind: 'array', optional: true, minItems: 1, maxItems: 128,
          description: 'Keyframes to reauthor.',
          items: {
            kind: 'object',
            description: 'One keyframe change.',
            atLeastOne: ['at_ms', 'value', 'easing'],
            properties: {
              keyframe_id: idField('The keyframe to change.'),
              at_ms: timeField('New global ms.', true),
              value: { kind: 'number', optional: true, description: 'New keyframe value.' },
              easing: EASING_FIELD,
            },
          },
        },
        remove: {
          kind: 'array', optional: true, minItems: 1, maxItems: 128,
          description: 'Keyframe identities to remove.',
          items: idField('A keyframe identity.'),
        },
      },
    },
  },
  apply(record, input) {
    const trackId = input.track_id as string
    const track = record.composition.propertyTracks.find(candidate => candidate.id === trackId)
    if (!track) {
      return unknownIdentity(record, 'edit_property_keyframes', 'Property track', trackId, record.composition.propertyTracks.map(candidate => candidate.id))
    }
    const edits = input.edits as Record<string, unknown>
    const removals = (edits.remove as string[] | undefined) ?? []
    const updates = (edits.update as Array<Record<string, unknown>> | undefined) ?? []
    for (const keyframeId of [...removals, ...updates.map(update => update.keyframe_id as string)]) {
      if (!track.keyframes.some(key => key.id === keyframeId)) {
        return unknownIdentity(record, 'edit_property_keyframes', 'keyframe', keyframeId, track.keyframes.map(key => key.id))
      }
    }
    const used = ownedShowIdsV2(record)
    const additions = (edits.add as Array<Record<string, unknown>> | undefined) ?? []
    const steps: Array<{ run: (value: ShowRecordV2) => { status: 'changed' | 'unchanged' | 'refused'; record: ShowRecordV2; code?: string; message?: string }; targetId: string }> = []
    for (const keyframeId of removals) {
      steps.push({ targetId: trackId, run: value => editShowPropertyV2(value, { kind: 'show' }, { kind: 'remove-key', trackId, keyId: keyframeId }) })
    }
    for (const update of updates) {
      steps.push({
        targetId: trackId,
        run: value => editShowPropertyV2(value, { kind: 'show' }, {
          kind: 'update-key', trackId, keyId: update.keyframe_id as string,
          patch: {
            ...(update.at_ms !== undefined ? { timeMs: update.at_ms as number } : {}),
            ...(update.value !== undefined ? { value: update.value as number } : {}),
            ...(update.easing !== undefined ? { easing: normalizeShowEasing(update.easing as ShowStructuredEasing) } : {}),
          },
        }),
      })
    }
    for (const [index, addition] of additions.entries()) {
      const keyId = freshShowIdV2(`${trackId}-key-${addition.at_ms as number}-${index + 1}`, used)
      used.add(keyId)
      steps.push({
        targetId: trackId,
        run: value => editShowPropertyV2(value, { kind: 'show' }, {
          kind: 'add-key', trackId,
          key: {
            id: keyId,
            timeMs: addition.at_ms as number,
            value: addition.value as number,
            easing: normalizeShowEasing(addition.easing as ShowStructuredEasing | undefined),
          },
        }),
      })
    }
    return adoptOwnerResults('edit_property_keyframes', record, steps,
      affected => `Property track ${trackId} keyframes edited; keys ${describeIds(affected.propertyKeys)}.`)
  },
}

const removePropertyTracks: ShowCommandV2Descriptor = {
  name: 'remove_property_tracks',
  family: 'animation',
  description: 'Remove Property animation tracks by identity. Their keyframes are removed with them; Clips, appearance, Transitions and Show End stay fixed.',
  touches: ['/composition/propertyTracks'],
  fields: {
    track_ids: {
      kind: 'array',
      minItems: 1,
      maxItems: 128,
      description: 'The Property tracks to remove.',
      items: idField('A Property track identity.'),
    },
  },
  apply(record, input) {
    const ids = input.track_ids as string[]
    if (new Set(ids).size !== ids.length) {
      return invalidArgument(record, 'remove_property_tracks', 'track_ids must be unique.', '$.track_ids')
    }
    for (const trackId of ids) {
      if (!record.composition.propertyTracks.some(track => track.id === trackId)) {
        return unknownIdentity(record, 'remove_property_tracks', 'Property track', trackId, record.composition.propertyTracks.map(track => track.id))
      }
    }
    return adoptOwnerResults('remove_property_tracks', record,
      ids.map(trackId => ({ targetId: trackId, run: (value: ShowRecordV2) => editShowPropertyV2(value, { kind: 'show' }, { kind: 'remove-track', trackId }) })),
      affected => `Removed Property tracks ${describeIds(ids)}; removed ${describeIds(affected.removed)}.`)
  },
}

export const SHOW_V2_ANIMATION_COMMANDS: ShowCommandV2Descriptor[] = [
  addPropertyTracks,
  updatePropertyTrack,
  editPropertyKeyframes,
  removePropertyTracks,
]
