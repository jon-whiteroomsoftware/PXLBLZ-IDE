// Effect command family: the ordered clip Effect stack, edited by rebuilding
// the placement's effects list with the pure stack helpers and committing it
// through updateShowClipInspector, which validates the composition.
import type { ShowClipEffect, ShowRecord } from '../personalContentRecords'
import {
  updateShowClipInspector,
  type ShowClipInspectorOwner,
} from '../showClipInspectorModel'
import {
  duplicateShowClipEffect,
  moveShowClipEffectWithinStage,
  nextShowEffectId,
} from '../showEffectAuthoring'
import { normalizeShowClipEffects } from '../showEffects'
import {
  commandComposition,
  refuseShowCommand,
  type ShowCommandDescriptor,
  type ShowCommandOutcome,
  type ShowCommandRefusal,
} from './registry'
import { monotonicRecord, resolveCommandClip, type CommandClipContext } from './support'

// Trails is a Show-level output Effect (set_output_trails), not a clip
// Effect; the clip normalizer drops it, so it is not offered here.
export const SHOW_CLIP_EFFECT_KINDS = [
  'opacity', 'brightness', 'hue', 'saturation', 'contrast', 'invert', 'threshold',
  'luma-key', 'chroma-key', 'posterize', 'vignette', 'color-map',
  'translate', 'rotate', 'scale', 'shear', 'ripple', 'swirl', 'bulge',
  'pixelate', 'kaleidoscope', 'wrap',
] as const

function inspectorOwner(context: CommandClipContext): ShowClipInspectorOwner {
  const { clip } = context
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

function placementEffects(record: ShowRecord, context: CommandClipContext): ShowClipEffect[] {
  const { clip } = context
  const zone = record.composition?.scenes
    .find((scene) => scene.sceneId === clip.sceneId)?.zones
    .find((candidate) => candidate.zoneId === clip.zoneId)
  const placement = clip.kind === 'main'
    ? zone?.main.find((candidate) => candidate.id === clip.startPlacementId)
    : zone?.overlays.find((layer) => layer.id === clip.layerId)?.placements
        .find((candidate) => candidate.id === clip.startPlacementId)
  return placement?.effects ?? []
}

function resolveEffect(
  effects: readonly ShowClipEffect[],
  clipId: string,
  effectId: string,
): { ok: true; effect: ShowClipEffect } | ShowCommandRefusal {
  const effect = effects.find((candidate) => candidate.id === effectId)
  if (!effect) {
    return refuseShowCommand({
      code: 'unknown-effect',
      message:
        effects.length === 0
          ? `Clip ${clipId} has no Effects yet; add one with add_clip_effect.`
          : `Clip ${clipId} has no Effect "${effectId}". Effects: ${
              effects.map((candidate) => `${candidate.id} (${candidate.kind})`).join('; ')}.`,
      candidates: effects.map((candidate) => candidate.id),
    })
  }
  return { ok: true, effect }
}

/** Commit a rebuilt effects list; a validation identity becomes a typed refusal. */
function commitEffects(
  record: ShowRecord,
  context: CommandClipContext,
  effects: ShowClipEffect[],
  change: { command: string; targetId: string; description: string; details?: Record<string, unknown> },
): ShowCommandOutcome {
  const result = updateShowClipInspector(record, inspectorOwner(context), { effects })
  if (result === record) {
    return refuseShowCommand({
      code: 'engine-refused',
      message: `${change.command}: the composition validator declined the rebuilt Effect stack.`,
    })
  }
  return { ok: true, record: monotonicRecord(record, result), changes: [change] }
}

const addClipEffect: ShowCommandDescriptor = {
  name: 'add_clip_effect',
  description:
    'Add an Effect to a clip\'s ordered stack, at that Effect kind\'s pipeline stage. Optional ' +
    'parameters patch the new Effect\'s persisted fields (for example { "brightness": 0.4 } or ' +
    '{ "x": 0.25, "y": 0 }); omitted fields keep the kind\'s defaults.',
  touches: ['/composition/scenes/*/zones', '/updatedAt'],
  fields: {
    clip_id: { kind: 'string', description: 'The clip to add the Effect to' },
    kind: { kind: 'string', enum: SHOW_CLIP_EFFECT_KINDS, description: 'The Effect kind' },
    parameters: { kind: 'json', optional: true, description: 'Persisted parameter fields to set on the new Effect' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const found = resolveCommandClip(record, resolved.composition, input.clip_id as string)
    if (!found.ok) return found
    const effects = placementEffects(record, found.context)
    const kind = input.kind as ShowClipEffect['kind']
    const id = nextShowEffectId(effects, kind)
    const base = normalizeShowClipEffects([{ id, kind } as ShowClipEffect])[0]
    if (!base) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message: `add_clip_effect: "${kind}" is not a supported clip Effect kind.`,
      })
    }
    const parameters = (input.parameters ?? {}) as Record<string, unknown>
    if (typeof parameters !== 'object' || Array.isArray(parameters)) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message: 'add_clip_effect: parameters must be an object of persisted fields.',
      })
    }
    const unknown = Object.keys(parameters).filter((name) => !(name in base))
    if (unknown.length > 0) {
      return refuseShowCommand({
        code: 'unknown-parameter',
        message:
          `add_clip_effect: ${unknown.map((name) => `"${name}"`).join(', ')} are not fields of a ` +
          `${kind} Effect. Fields: ${Object.keys(base).filter((name) => name !== 'id' && name !== 'kind').join(', ')}.`,
      })
    }
    const patched = normalizeShowClipEffects([{ ...base, ...parameters } as ShowClipEffect])[0]
    return commitEffects(record, found.context, [...effects, patched], {
      command: 'add_clip_effect',
      targetId: id,
      description: `${kind} Effect added to clip ${found.context.clip.patternName}.`,
    })
  },
}

const updateClipEffect: ShowCommandDescriptor = {
  name: 'update_clip_effect',
  description:
    'Set one persisted parameter field on a clip Effect (for example brightness on a brightness ' +
    'Effect, or x on a translate). The stack order and the Effect\'s identity are unchanged.',
  touches: ['/composition/scenes/*/zones', '/updatedAt'],
  fields: {
    clip_id: { kind: 'string', description: 'The clip carrying the Effect' },
    effect_id: { kind: 'string', description: 'The Effect id' },
    parameter: { kind: 'string', description: 'The persisted field name' },
    value: { kind: 'json', description: 'The new value' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const found = resolveCommandClip(record, resolved.composition, input.clip_id as string)
    if (!found.ok) return found
    const effects = placementEffects(record, found.context)
    const target = resolveEffect(effects, found.context.clip.id, input.effect_id as string)
    if (!target.ok) return target
    const parameter = input.parameter as string
    if (!(parameter in target.effect) || parameter === 'id' || parameter === 'kind') {
      return refuseShowCommand({
        code: 'unknown-parameter',
        message:
          `update_clip_effect: "${parameter}" is not a field of a ${target.effect.kind} Effect. Fields: ${
            Object.keys(target.effect).filter((name) => name !== 'id' && name !== 'kind').join(', ')}.`,
      })
    }
    const previous = (target.effect as unknown as Record<string, unknown>)[parameter]
    const patched = normalizeShowClipEffects(effects.map((effect) => (
      effect.id === target.effect.id ? { ...effect, [parameter]: input.value } as ShowClipEffect : effect
    )))
    const stored = (patched.find((effect) => effect.id === target.effect.id) as
      | Record<string, unknown>
      | undefined)?.[parameter]
    if (JSON.stringify(stored) === JSON.stringify(previous)) {
      return refuseShowCommand({
        code: 'no-change',
        message:
          `Effect ${target.effect.id}: ${parameter} stays ${JSON.stringify(previous)} ` +
          '(the request equals or normalizes to the current value).',
      })
    }
    return commitEffects(record, found.context, patched, {
      command: 'update_clip_effect',
      targetId: target.effect.id,
      description: `Effect ${target.effect.id}: ${parameter} is now ${JSON.stringify(stored)}.`,
    })
  },
}

const duplicateClipEffect: ShowCommandDescriptor = {
  name: 'duplicate_clip_effect',
  description:
    'Duplicate a clip Effect immediately after itself in the stack, with a fresh id and the same ' +
    'parameter values.',
  touches: ['/composition/scenes/*/zones', '/updatedAt'],
  fields: {
    clip_id: { kind: 'string', description: 'The clip carrying the Effect' },
    effect_id: { kind: 'string', description: 'The Effect to duplicate' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const found = resolveCommandClip(record, resolved.composition, input.clip_id as string)
    if (!found.ok) return found
    const effects = placementEffects(record, found.context)
    const target = resolveEffect(effects, found.context.clip.id, input.effect_id as string)
    if (!target.ok) return target
    const duplicated = duplicateShowClipEffect(effects, target.effect.id)
    const copy = duplicated.find((effect) => !effects.some((existing) => existing.id === effect.id))
    if (!copy) {
      return refuseShowCommand({
        code: 'engine-refused',
        message: `duplicate_clip_effect: the stack helper declined to duplicate ${target.effect.id}.`,
      })
    }
    return commitEffects(record, found.context, duplicated, {
      command: 'duplicate_clip_effect',
      targetId: copy.id,
      description: `Effect ${target.effect.id} duplicated as ${copy.id}.`,
    })
  },
}

const moveClipEffect: ShowCommandDescriptor = {
  name: 'move_clip_effect',
  description:
    'Move a clip Effect one position earlier or later within its pipeline stage. Effects never leave ' +
    'their stage; a move at the stage edge refuses as a no-change.',
  touches: ['/composition/scenes/*/zones', '/updatedAt'],
  fields: {
    clip_id: { kind: 'string', description: 'The clip carrying the Effect' },
    effect_id: { kind: 'string', description: 'The Effect to move' },
    direction: { kind: 'string', enum: ['earlier', 'later'], description: 'Which way to move it' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const found = resolveCommandClip(record, resolved.composition, input.clip_id as string)
    if (!found.ok) return found
    const effects = placementEffects(record, found.context)
    const target = resolveEffect(effects, found.context.clip.id, input.effect_id as string)
    if (!target.ok) return target
    const moved = moveShowClipEffectWithinStage(
      effects,
      target.effect.id,
      input.direction === 'earlier' ? -1 : 1,
    )
    const normalized = normalizeShowClipEffects(effects)
    if (JSON.stringify(moved.map((effect) => effect.id)) === JSON.stringify(normalized.map((effect) => effect.id))) {
      return refuseShowCommand({
        code: 'no-change',
        message:
          `Effect ${target.effect.id} is already at its stage ${input.direction === 'earlier' ? 'start' : 'end'}.`,
      })
    }
    return commitEffects(record, found.context, moved, {
      command: 'move_clip_effect',
      targetId: target.effect.id,
      description: `Effect ${target.effect.id} moved ${input.direction} in its stage.`,
    })
  },
}

const removeClipEffect: ShowCommandDescriptor = {
  name: 'remove_clip_effect',
  description: 'Remove one Effect from a clip\'s stack; the other Effects keep their order.',
  touches: ['/composition/scenes/*/zones', '/updatedAt'],
  fields: {
    clip_id: { kind: 'string', description: 'The clip carrying the Effect' },
    effect_id: { kind: 'string', description: 'The Effect to remove' },
  },
  apply(record, input) {
    const resolved = commandComposition(record)
    if (!resolved.ok) return resolved
    const found = resolveCommandClip(record, resolved.composition, input.clip_id as string)
    if (!found.ok) return found
    const effects = placementEffects(record, found.context)
    const target = resolveEffect(effects, found.context.clip.id, input.effect_id as string)
    if (!target.ok) return target
    return commitEffects(
      record,
      found.context,
      effects.filter((effect) => effect.id !== target.effect.id),
      {
        command: 'remove_clip_effect',
        targetId: target.effect.id,
        description: `${target.effect.kind} Effect ${target.effect.id} removed from clip ${found.context.clip.patternName}.`,
      },
    )
  },
}

export const SHOW_EFFECT_COMMANDS: ShowCommandDescriptor[] = [
  addClipEffect,
  updateClipEffect,
  duplicateClipEffect,
  moveClipEffect,
  removeClipEffect,
]
