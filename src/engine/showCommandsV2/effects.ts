// Clip Effect stack commands over the v2 appearance owner. Effect ordering and
// identity are per-Effect, so these stay singular while opacity, view,
// Transform, Aperture, presentation and Blink go through update_clips.
import type { ShowClipEffect } from '../personalContentRecords'
import type { ShowRecordV2 } from '../showCompositionV2'
import { editShowClipAppearanceV2, type ShowClipAppearanceEditIntentV2 } from '../showClipAppearanceEditsV2'
import {
  type ShowCommandV2Descriptor,
  type ShowCommandV2Field,
  type ShowCommandV2Outcome,
} from './registry'
import {
  APPEARANCE_APPLY_FIELD,
  EFFECT_KIND_VALUES,
  adoptOwnerResult,
  describeIds,
  freshShowIdV2,
  idField,
  invalidArgument,
  ownedShowIdsV2,
  unknownIdentity,
} from './support'
import { effectFromSpec, unknownClip } from './clipSpec'

const PARAMETERS_FIELD: ShowCommandV2Field = {
  kind: 'record',
  description: 'Parameter values by name; the authoring reference lists each kind.',
  values: {
    kind: 'union',
    description: 'A number, or a CSS color string.',
    variants: [
      { kind: 'number', description: 'Numeric parameter value.' },
      { kind: 'string', maxLength: 64, description: 'Color parameter value.' },
    ],
  },
}

type AppearanceTarget =
  | { clipId: string; scope: 'whole-clip' }
  | { clipId: string; scope: 'selected-time'; atMs: number; keyIdentity: { kind: 'retain' | 'insert'; appearanceKeyId: string } }

/** Translate the shared `apply` selector into the appearance owner's target. */
function appearanceTarget(
  record: ShowRecordV2,
  clipId: string,
  apply: Record<string, unknown>,
): AppearanceTarget | { message: string } {
  if (apply.scope === 'whole-clip') return { clipId, scope: 'whole-clip' }
  const atMs = apply.at_ms
  if (typeof atMs !== 'number') return { message: 'apply.at_ms is required when apply.scope is at-time.' }
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)!
  const existing = clip.appearance.keys.find(key => key.timeMs === atMs)
  const appearanceKeyId = existing?.id ?? freshShowIdV2(`${clipId}-appearance-${atMs}`, ownedShowIdsV2(record))
  return {
    clipId, scope: 'selected-time', atMs,
    keyIdentity: { kind: existing ? 'retain' : 'insert', appearanceKeyId },
  }
}

function withEffectCommand(
  command: string,
  record: ShowRecordV2,
  input: Record<string, unknown>,
  build: (target: AppearanceTarget) => ShowClipAppearanceEditIntentV2 | { message: string },
  describe: (affected: { clips: string[]; appearanceKeys: string[] }) => string,
): ShowCommandV2Outcome {
  const clipId = input.clip_id as string
  if (!record.composition.clips.some(clip => clip.id === clipId)) return unknownClip(record, command, clipId)
  const target = appearanceTarget(record, clipId, input.apply as Record<string, unknown>)
  if ('message' in target) return invalidArgument(record, command, target.message, '$.apply')
  const intent = build(target)
  if ('message' in intent) return invalidArgument(record, command, intent.message)
  return adoptOwnerResult(command, record, editShowClipAppearanceV2(record, intent), describe, clipId)
}

/** Resolve the one Effect with this identity inside the selected held stacks. */
function effectKind(record: ShowRecordV2, clipId: string, effectId: string): ShowClipEffect['kind'] | undefined {
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)
  for (const key of clip?.appearance.keys ?? []) {
    const effect = (key.value.effects ?? []).find(candidate => candidate.id === effectId)
    if (effect) return effect.kind
  }
  return undefined
}

function effectIds(record: ShowRecordV2, clipId: string): string[] {
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)
  return [...new Set((clip?.appearance.keys ?? []).flatMap(key => (key.value.effects ?? []).map(effect => effect.id)))]
}

const addClipEffect: ShowCommandV2Descriptor = {
  name: 'add_clip_effect',
  family: 'effects',
  description: 'Append one Effect to a Clip\'s Effect stack, on every held key or on the held key at one global time. An Effect that an active Property track targets must exist in every appearance span the track intersects, so the owner refuses an addition that would leave a gap.',
  touches: ['/composition/clips/*/appearance/keys/*/value/effects'],
  fields: {
    clip_id: idField('The Clip.'),
    kind: { kind: 'string', enum: EFFECT_KIND_VALUES, description: 'Effect kind.' },
    parameters: { ...PARAMETERS_FIELD, optional: true, description: 'Parameter values by name; omitted keep the default.' },
    apply: APPEARANCE_APPLY_FIELD,
  },
  apply(record, input) {
    const clipId = input.clip_id as string
    const effectId = freshShowIdV2(`${clipId}-${input.kind as string}`, ownedShowIdsV2(record))
    return withEffectCommand('add_clip_effect', record, input, target => {
      const effect = effectFromSpec({ kind: input.kind, parameters: input.parameters }, effectId)
      if ('message' in effect) return effect
      return { ...target, kind: 'add-effect', effect }
    }, affected => `Effect ${effectId} added to Clip ${clipId}; appearance keys ${describeIds(affected.appearanceKeys)}.`)
  },
}

const updateClipEffect: ShowCommandV2Descriptor = {
  name: 'update_clip_effect',
  family: 'effects',
  description: 'Set parameter values on one Effect of a Clip, on every held key or on the held key at one global time. The exact Effect must exist in every selected held stack.',
  touches: ['/composition/clips/*/appearance/keys/*/value/effects'],
  fields: {
    clip_id: idField('The Clip.'),
    effect_id: idField('The Effect.'),
    parameters: PARAMETERS_FIELD,
    apply: APPEARANCE_APPLY_FIELD,
  },
  apply(record, input) {
    const clipId = input.clip_id as string
    const effectId = input.effect_id as string
    if (!record.composition.clips.some(clip => clip.id === clipId)) return unknownClip(record, 'update_clip_effect', clipId)
    const kind = effectKind(record, clipId, effectId)
    if (!kind) return unknownIdentity(record, 'update_clip_effect', 'Clip Effect', effectId, effectIds(record, clipId))
    const parameters = Object.entries(input.parameters as Record<string, number | string>)
    if (parameters.length === 0) return invalidArgument(record, 'update_clip_effect', 'give at least one parameter.', '$.parameters')
    // Each parameter is one owner step so the owner validates every value.
    let current = record
    const appearanceKeys = new Set<string>()
    for (const [parameter, value] of parameters) {
      const target = appearanceTarget(current, clipId, input.apply as Record<string, unknown>)
      if ('message' in target) return invalidArgument(record, 'update_clip_effect', target.message, '$.apply')
      const result = editShowClipAppearanceV2(current, { ...target, kind: 'update-effect', effectId, effectKind: kind, parameter, value })
      if (result.status === 'refused') {
        return invalidArgument(record, 'update_clip_effect', `${result.message} (parameter "${parameter}")`)
      }
      if (result.status === 'unchanged') continue
      current = result.record
      result.affectedAppearanceKeyIds.forEach(id => appearanceKeys.add(id))
    }
    if (current === record) return { status: 'unchanged', record, changes: [] }
    return adoptOwnerResult('update_clip_effect', record,
      { status: 'changed', record: current, affectedClipIds: [clipId], affectedAppearanceKeyIds: [...appearanceKeys].sort() } as never,
      affected => `Effect ${effectId} on Clip ${clipId} updated; appearance keys ${describeIds(affected.appearanceKeys)}.`, clipId)
  },
}

const moveClipEffect: ShowCommandV2Descriptor = {
  name: 'move_clip_effect',
  family: 'effects',
  description: 'Reorder one Effect inside its stage of a Clip\'s Effect stack, either one place in a direction or directly before or after another Effect of the same stage.',
  touches: ['/composition/clips/*/appearance/keys/*/value/effects'],
  exactlyOne: ['direction', 'target_effect_id'],
  fields: {
    clip_id: idField('The Clip.'),
    effect_id: idField('The Effect to move.'),
    direction: { kind: 'string', optional: true, enum: ['earlier', 'later'], description: 'Move one place inside the stage.' },
    target_effect_id: idField('Neighbour Effect of the same stage.', true),
    edge: { kind: 'string', optional: true, enum: ['before', 'after'], description: 'Side of target_effect_id; default before.' },
    apply: APPEARANCE_APPLY_FIELD,
  },
  apply(record, input) {
    const clipId = input.clip_id as string
    const effectId = input.effect_id as string
    if (!record.composition.clips.some(clip => clip.id === clipId)) return unknownClip(record, 'move_clip_effect', clipId)
    const kind = effectKind(record, clipId, effectId)
    if (!kind) return unknownIdentity(record, 'move_clip_effect', 'Clip Effect', effectId, effectIds(record, clipId))
    let targetEffectId = input.target_effect_id as string | undefined
    let edge = (input.edge as 'before' | 'after' | undefined) ?? 'before'
    if (targetEffectId === undefined) {
      const clip = record.composition.clips.find(candidate => candidate.id === clipId)!
      const stack = (clip.appearance.keys[0]?.value.effects ?? []).filter(effect => effect.kind === kind || true)
      const index = stack.findIndex(effect => effect.id === effectId)
      const neighbour = stack[index + (input.direction === 'later' ? 1 : -1)]
      if (!neighbour) return { status: 'unchanged', record, changes: [] }
      targetEffectId = neighbour.id
      edge = input.direction === 'later' ? 'after' : 'before'
    }
    const targetKind = effectKind(record, clipId, targetEffectId)
    if (!targetKind) return unknownIdentity(record, 'move_clip_effect', 'Clip Effect', targetEffectId, effectIds(record, clipId))
    return withEffectCommand('move_clip_effect', record, input, target => ({
      ...target, kind: 'reorder-effect', effectId, effectKind: kind,
      targetEffectId: targetEffectId!, targetEffectKind: targetKind, edge,
    }), affected => `Effect ${effectId} on Clip ${clipId} reordered; appearance keys ${describeIds(affected.appearanceKeys)}.`)
  },
}

const duplicateClipEffect: ShowCommandV2Descriptor = {
  name: 'duplicate_clip_effect',
  family: 'effects',
  description: 'Duplicate one Effect directly after itself in a Clip\'s Effect stack, with the same parameter values and a fresh Effect identity.',
  touches: ['/composition/clips/*/appearance/keys/*/value/effects'],
  fields: {
    clip_id: idField('The Clip.'),
    effect_id: idField('The Effect to duplicate.'),
    apply: APPEARANCE_APPLY_FIELD,
  },
  apply(record, input) {
    const clipId = input.clip_id as string
    const effectId = input.effect_id as string
    if (!record.composition.clips.some(clip => clip.id === clipId)) return unknownClip(record, 'duplicate_clip_effect', clipId)
    const kind = effectKind(record, clipId, effectId)
    if (!kind) return unknownIdentity(record, 'duplicate_clip_effect', 'Clip Effect', effectId, effectIds(record, clipId))
    const newEffectId = freshShowIdV2(`${effectId}-copy`, ownedShowIdsV2(record))
    return withEffectCommand('duplicate_clip_effect', record, input, target => ({
      ...target, kind: 'duplicate-effect', effectId, effectKind: kind, newEffectId,
    }), () => `Effect ${effectId} on Clip ${clipId} duplicated as ${newEffectId}.`)
  },
}

const removeClipEffect: ShowCommandV2Descriptor = {
  name: 'remove_clip_effect',
  family: 'effects',
  description: 'Remove one Effect from a Clip\'s Effect stack. A Clip-owned Property track naming that Effect is removed when any appearance span its activation intersects no longer carries the Effect; a surviving Transition ramp refuses instead.',
  touches: ['/composition/clips/*/appearance/keys/*/value/effects', '/composition/propertyTracks'],
  fields: {
    clip_id: idField('The Clip.'),
    effect_id: idField('The Effect to remove.'),
    apply: APPEARANCE_APPLY_FIELD,
  },
  apply(record, input) {
    const clipId = input.clip_id as string
    const effectId = input.effect_id as string
    if (!record.composition.clips.some(clip => clip.id === clipId)) return unknownClip(record, 'remove_clip_effect', clipId)
    const kind = effectKind(record, clipId, effectId)
    if (!kind) return unknownIdentity(record, 'remove_clip_effect', 'Clip Effect', effectId, effectIds(record, clipId))
    return withEffectCommand('remove_clip_effect', record, input, target => ({
      ...target, kind: 'remove-effect', effectId, effectKind: kind,
    }), affected => `Effect ${effectId} removed from Clip ${clipId}; removed ${describeIds(affected.appearanceKeys)}.`)
  },
}

export const SHOW_V2_EFFECT_COMMANDS: ShowCommandV2Descriptor[] = [
  addClipEffect,
  updateClipEffect,
  moveClipEffect,
  duplicateClipEffect,
  removeClipEffect,
]
