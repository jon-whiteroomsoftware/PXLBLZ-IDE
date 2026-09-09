// Canonical Clip Effect family; toolkit parameter and stack owners are shared
// with the inspector. The diagnostic surface derives this descriptor table.
import type { ShowClipEffect, ShowRecord } from '../personalContentRecords'
import { updateShowClipInspector } from '../showClipInspectorModel'
import { duplicateShowClipEffect, moveShowClipEffectToStagePosition, moveShowClipEffectWithinStage, nextShowEffectId, showClipEffectParameters, showClipEffectPersistedField, showClipEffectStage, updateShowClipEffectParameter } from '../showEffectAuthoring'
import { normalizeShowClipEffects, showEffectParameterNames } from '../showEffects'
import { parseColorValue } from '../colorValue'
import { commandComposition, refuseShowCommand, type ShowCommandDescriptor, type ShowCommandOutcome } from './registry'
import { monotonicRecord, resolveCommandClip } from './support'

export const SHOW_CLIP_EFFECT_KINDS = ['opacity', 'brightness', 'hue', 'saturation', 'contrast', 'invert', 'threshold', 'luma-key', 'chroma-key', 'posterize', 'vignette', 'color-map', 'translate', 'rotate', 'scale', 'shear', 'ripple', 'swirl', 'bulge', 'pixelate', 'kaleidoscope', 'wrap'] as const

function parameterPatch(effect: ShowClipEffect, parameters: Record<string, unknown>): { ok: true; effect: ShowClipEffect } | Extract<ShowCommandOutcome, { ok: false }> {
  let next = effect
  const descriptors = showClipEffectParameters(effect)
  const persisted = showEffectParameterNames(effect)
  for (const [name, value] of Object.entries(parameters)) {
    const descriptor = descriptors.find(item => item.id === name || showClipEffectPersistedField(effect.kind, item.id) === name)
    // The schema's RGB components are retained as finite numeric inputs;
    // routing them through a display hex color would lose their precision.
    if (!descriptor && !persisted.includes(name)) return refuseShowCommand({ code: 'unknown-parameter', message: `${effect.kind} has no parameter ${name}.`, candidates: [...new Set([...descriptors.map(item => item.id), ...persisted])] })
    if (descriptor?.kind === 'color') {
      if (typeof value !== 'string' || !parseColorValue(value)) return refuseShowCommand({ code: 'invalid-argument', message: `${name} requires a valid color string.` })
    } else if (typeof value !== 'number' || !Number.isFinite(value)) return refuseShowCommand({ code: 'invalid-argument', message: `${name} requires a finite number.` })
    if (typeof value === 'number') {
      const min = descriptor?.min ?? 0
      const max = descriptor?.max ?? 1
      if (value < min || value > max) return refuseShowCommand({ code: 'invalid-argument', message: `${name} must be within the supported range ${min}–${max}.` })
    }
    next = descriptor ? updateShowClipEffectParameter(next, descriptor.id, value as number | string)
      : normalizeShowClipEffects([{ ...next, [name]: value } as ShowClipEffect])[0]
  }
  return { ok: true, effect: next }
}

function applyEffect(record: ShowRecord, command: string, input: Record<string, unknown>): ShowCommandOutcome {
  const composition = commandComposition(record)
  if (!composition.ok) return composition
  const found = resolveCommandClip(record, composition.composition, input.clip_id as string)
  if (!found.ok) return found
  const { clip } = found.context
  const zone = composition.composition.scenes.find(scene => scene.sceneId === clip.sceneId)!.zones.find(zone => zone.zoneId === clip.zoneId)!
  const placement = clip.kind === 'main' ? zone.main.find(item => item.id === clip.startPlacementId)! : zone.overlays.find(layer => layer.id === clip.layerId)!.placements.find(item => item.id === clip.startPlacementId)!
  const effects = placement.effects ?? []
  const target = effects.find(effect => effect.id === input.effect_id)
  if (command !== 'add_clip_effect' && !target) return refuseShowCommand({ code: 'unknown-effect', message: `Clip ${clip.id} has no Effect ${input.effect_id}.`, candidates: effects.map(effect => effect.id) })
  let next: ShowClipEffect[]
  let targetId = target?.id ?? ''
  if (command === 'add_clip_effect') {
    const kind = input.kind as ShowClipEffect['kind']
    const initial = normalizeShowClipEffects([{ id: nextShowEffectId(effects, kind), kind } as ShowClipEffect])[0]
    const parameters = input.parameters ?? {}
    if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) return refuseShowCommand({ code: 'invalid-argument', message: 'parameters must be an object of finite Effect parameters.' })
    const patched = parameterPatch(initial, parameters as Record<string, unknown>)
    if (!patched.ok) return patched
    next = [...effects, patched.effect]
    targetId = patched.effect.id
  } else if (command === 'update_clip_effect') {
    const patched = parameterPatch(target!, { [input.parameter as string]: input.value })
    if (!patched.ok) return patched
    next = effects.map(effect => effect.id === target!.id ? patched.effect : effect)
  } else if (command === 'duplicate_clip_effect') {
    next = duplicateShowClipEffect(effects, target!.id)
    targetId = next.find(effect => !effects.some(old => old.id === effect.id))!.id
  } else if (command === 'move_clip_effect') {
    if (input.direction !== undefined) {
      if (input.edge !== undefined) return refuseShowCommand({ code: 'invalid-argument', message: 'edge requires target_effect_id.' })
      next = moveShowClipEffectWithinStage(effects, target!.id, input.direction === 'earlier' ? -1 : 1)
    } else {
      const destination = effects.find(effect => effect.id === input.target_effect_id)
      if (!destination) return refuseShowCommand({ code: 'unknown-effect', message: `No target Effect ${input.target_effect_id}.`, candidates: effects.map(effect => effect.id) })
      if (showClipEffectStage(destination) !== showClipEffectStage(target!)) return refuseShowCommand({ code: 'invalid-argument', message: 'Effects cannot leave their pipeline stage.' })
      next = moveShowClipEffectToStagePosition(effects, target!.id, destination.id, (input.edge as 'before' | 'after') ?? 'after')
    }
  } else next = effects.filter(effect => effect.id !== target!.id)
  if (JSON.stringify(next) === JSON.stringify(effects)) return { ok: true, record, changes: [] }
  const owner = clip.kind === 'main'
    ? { kind: 'scene-main' as const, sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.startPlacementId }
    : { kind: 'scene-overlay' as const, sceneId: clip.sceneId, zoneId: clip.zoneId, layerId: clip.layerId!, placementId: clip.startPlacementId }
  const result = updateShowClipInspector(record, owner, { effects: next })
  if (result === record) return refuseShowCommand({ code: 'engine-refused', message: 'The Clip inspector refused the Effect stack.' })
  return { ok: true, record: monotonicRecord(record, result), changes: [{ command, targetId, description: `${command}: Effect ${targetId} on Clip ${clip.id}.` }] }
}

const clip_id = { kind: 'string' as const, description: 'Logical Clip id' }
const effect_id = { kind: 'string' as const, description: 'Effect id in the Clip stack' }
const touches = ['/composition/scenes/*/zones/*/main/*/effects', '/composition/scenes/*/zones/*/overlays/*/placements/*/effects', '/composition/scenes/*/propertyTracks', '/updatedAt']
const definitions: Omit<ShowCommandDescriptor, 'apply'>[] = [
  { name: 'add_clip_effect', description: 'Add one of the 22 Clip Effects with catalogue defaults and typed toolkit parameters or finite persisted-field aliases. Out-of-range values refuse with the supported range; valid values retain declared rounding. Identity fields cannot be patched.', touches: touches.filter(path => !path.includes('propertyTracks')), fields: { clip_id, kind: { kind: 'string', enum: SHOW_CLIP_EFFECT_KINDS, description: 'Clip Effect kind; Trails is Show output only' }, parameters: { kind: 'json', optional: true, description: 'Finite typed parameters from the existing toolkit/schema' } } },
  { name: 'update_clip_effect', description: 'Update one typed toolkit parameter or finite persisted-field alias, preserving identity, order and other Effects. Out-of-range values refuse; valid values retain declared rounding; valid satisfied values make no changes.', touches: touches.filter(path => !path.includes('propertyTracks')), fields: { clip_id, effect_id, parameter: { kind: 'string', description: 'Toolkit parameter or finite persisted-field alias' }, value: { kind: 'json', description: 'Finite numeric or valid color value' } } },
  { name: 'duplicate_clip_effect', description: 'Duplicate an Effect immediately after itself with a fresh id and copied values; existing animation stays with its original Effect.', touches: touches.filter(path => !path.includes('propertyTracks')), fields: { clip_id, effect_id } },
  { name: 'move_clip_effect', description: 'Reorder within the same pipeline stage. Give one step direction or target_effect_id with optional before/after edge. Valid stage-edge and satisfied positions make no changes.', touches: touches.filter(path => !path.includes('propertyTracks')), exactlyOne: ['direction', 'target_effect_id'], fields: { clip_id, effect_id, direction: { kind: 'string', enum: ['earlier', 'later'], optional: true, description: 'One step within the stage' }, target_effect_id: { kind: 'string', optional: true, description: 'Same-stage destination Effect' }, edge: { kind: 'string', enum: ['before', 'after'], optional: true, description: 'Side of destination, default after' } } },
  { name: 'remove_clip_effect', description: 'Remove an Effect and its matching animation through the Clip inspector; other Effects and animation retain their identities and order.', touches, fields: { clip_id, effect_id } },
]
export const SHOW_EFFECT_COMMANDS: ShowCommandDescriptor[] = definitions.map(descriptor => ({ ...descriptor, apply: (record, input) => applyEffect(record, descriptor.name, input) }))
