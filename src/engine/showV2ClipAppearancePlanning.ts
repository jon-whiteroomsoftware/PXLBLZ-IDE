import type { ShowClipInspectorPatch } from './showClipInspectorModel'
import type { ShowClipV2, ShowRecordV2 } from './showCompositionV2'
import type {
  ShowClipAppearanceEditIntentV2,
  ShowClipAppearancePatchV2,
} from './showClipAppearanceEditsV2'
import type {
  ShowClipEffect,
  ShowClipEvaluationPolicy,
  ShowPatternRef,
} from './personalContentRecords'
import {
  moveShowClipEffectToStagePosition,
  showClipEffectStage,
  updateShowClipEffectParameter,
} from './showEffectAuthoring'
import { SHOW_CLIP_APERTURE_SHAPES } from './showClipViewport'
import { normalizeShowClipTransform } from './showClipTransform'
import { normalizeShowClipViewport } from './showClipViewport'

/**
 * Plan one Clip inspector patch on a v2 backing (#1066 slices 3-4).
 *
 * The existing inspector funnels every appearance control through one patch
 * shape. This planner names the single landed door for that patch: scalar
 * appearance facets (brightness, phase, mirror, opacity, transform, aperture,
 * presentation, blink) and whole-stack Effect operations through the
 * appearance owner, Pattern-instance facets (speed, control targets, stepped
 * clock, evaluation) through the instance-properties owner, the entry-policy
 * facet through the entry-policy owner, and the Pattern facet through the
 * replacement owner. Anything else
 * refuses before any owner runs: no record, no history entry, no save.
 *
 * One patch plans at most one intent, so one accepted edit stays exactly one
 * history entry and one save. A patch mixing facets — appearance with
 * instance, or an Effect operation with any other appearance facet — refuses
 * rather than splitting or silently dropping half the patch; no shipped
 * control emits such a patch.
 */

export type ShowV2ClipInspectorRefusal =
  | 'missing-clip'
  | 'group-child'
  | 'multi-key-clip'
  | 'timing-edit'
  | 'control-target-removal'
  | 'unsupported-simulation'
  | 'ambiguous-effects'
  | 'mixed-facets'
  | 'invalid-request'

/**
 * The instance-properties intent in the admission's own field names. Declared
 * here structurally (rather than importing the store) so the engine stays
 * below the store; the call site passes it straight to the admission.
 */
export interface ShowV2ClipInspectorInstanceIntent {
  clipId: string
  properties: {
    controls?: Record<string, number>
    time_scale?: number
    time_offset_ms?: number
    evaluation?: ShowClipEvaluationPolicy
    stepped_clock?: { stepMs: number } | null
  }
}

/**
 * The entry-policy intent in the admission's own field names, declared
 * structurally for the same reason as the instance intent above. The admission
 * and the owner both require exactly these three keys.
 */
export interface ShowV2ClipInspectorEntryPolicyIntent {
  kind: 'set-entry-policy'
  clipId: string
  entryPolicy: 'continue' | 'restart'
}

export type ShowV2ClipInspectorPlan =
  | { kind: 'appearance'; intent: ShowClipAppearanceEditIntentV2 }
  | { kind: 'instance-properties'; intent: ShowV2ClipInspectorInstanceIntent }
  | { kind: 'entry-policy'; intent: ShowV2ClipInspectorEntryPolicyIntent }
  | { kind: 'replacement'; clipId: string; reference: ShowPatternRef; name: string }
  | { kind: 'no-op' }
  | { kind: 'refuse'; reason: ShowV2ClipInspectorRefusal; message: string }

function refuse(reason: ShowV2ClipInspectorRefusal, message: string): ShowV2ClipInspectorPlan {
  return { kind: 'refuse', reason, message }
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const has = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

type EffectsOp =
  | { kind: 'add'; effect: ShowClipEffect }
  | { kind: 'remove'; effectId: string; effectKind: ShowClipEffect['kind'] }
  | { kind: 'update'; effectId: string; effectKind: ShowClipEffect['kind']; parameter: string; value: number | string }
  | { kind: 'duplicate'; effectId: string; effectKind: ShowClipEffect['kind']; newEffectId: string }
  | { kind: 'reorder'; effectId: string; effectKind: ShowClipEffect['kind']; targetEffectId: string; targetEffectKind: ShowClipEffect['kind']; edge: 'before' | 'after' }
  | { kind: 'none' }
  | { kind: 'ambiguous' }

function effectIdentity(value: unknown): value is ShowClipEffect {
  return object(value) && typeof value.id === 'string' && value.id.length > 0 && typeof value.kind === 'string'
}

function withoutId(effect: ShowClipEffect): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...(effect as unknown as Record<string, unknown>) }
  delete rest.id
  return rest
}

/**
 * Read one UI whole-stack write as the single Effect operation it is. Every
 * shipped stack gesture changes exactly one thing (append, single removal,
 * one parameter, one duplication, one same-stage move); anything else refuses
 * rather than guessing, because a guessed multi-change could not land as one
 * history entry anyway. Candidates are verified by recomputation or
 * simulation against the owner's own algorithms before they are named.
 */
function diffEffects(before: ShowClipEffect[], after: ShowClipEffect[]): EffectsOp {
  if (sameJson(before, after)) return { kind: 'none' }
  if (!after.every(effectIdentity)) return { kind: 'ambiguous' }
  const beforeIds = before.map((effect) => effect.id)
  const afterIds = after.map((effect) => effect.id)
  if (after.length === before.length + 1) {
    const fresh = after.filter((effect) => !beforeIds.includes(effect.id))
    if (fresh.length !== 1) return { kind: 'ambiguous' }
    const added = fresh[0]
    // A copy carries its source's values under a fresh id, so it is checked
    // before a plain append: on a single-key Clip both spellings land the
    // same stack, but only the duplicate keeps animation on its original
    // owner the way the owner's per-key copy does.
    const source = before.find((candidate) => sameJson(withoutId(candidate), withoutId(added)))
    if (source) {
      const sourceIndex = before.indexOf(source)
      const expected = [...before.slice(0, sourceIndex + 1), added, ...before.slice(sourceIndex + 1)]
      if (sameJson(expected, after)) {
        return { kind: 'duplicate', effectId: source.id, effectKind: source.kind, newEffectId: added.id }
      }
    }
    if (sameJson(after.slice(0, before.length), before)) return { kind: 'add', effect: added }
    return { kind: 'ambiguous' }
  }
  if (after.length === before.length - 1) {
    const missing = before.filter((effect) => !afterIds.includes(effect.id))
    if (missing.length !== 1) return { kind: 'ambiguous' }
    if (!sameJson(after, before.filter((effect) => effect.id !== missing[0].id))) return { kind: 'ambiguous' }
    return { kind: 'remove', effectId: missing[0].id, effectKind: missing[0].kind }
  }
  if (after.length !== before.length) return { kind: 'ambiguous' }
  if (new Set(afterIds).size !== after.length || !beforeIds.every((id) => afterIds.includes(id))) {
    return { kind: 'ambiguous' }
  }
  if (sameJson(afterIds, beforeIds)) {
    const changed = before
      .map((effect, index) => ({ effect, next: after[index] }))
      .filter(({ effect, next }) => !sameJson(effect, next))
    if (changed.length !== 1 || changed[0].effect.kind !== changed[0].next.kind) return { kind: 'ambiguous' }
    const { effect, next } = changed[0]
    const fields = Object.keys(next).filter(
      (key) => !sameJson((effect as Record<string, unknown>)[key], (next as Record<string, unknown>)[key]),
    )
    // One persisted field names one update intent: a number, or a single
    // colour string such as a chroma-key target. A multi-field change is a
    // packed color edit (shadow/highlight triples), which has no single
    // parameter spelling and stays unconnected.
    const raw = (next as Record<string, unknown>)[fields[0]]
    if (fields.length !== 1 || (typeof raw !== 'number' && typeof raw !== 'string')) {
      return { kind: 'ambiguous' }
    }
    const value = raw as number | string
    if (!sameJson(updateShowClipEffectParameter(effect, fields[0], value), next)) return { kind: 'ambiguous' }
    return { kind: 'update', effectId: effect.id, effectKind: effect.kind, parameter: fields[0], value }
  }
  // The owner and the control both move within one stage's sibling list, so
  // the diff reads the move there too: group both stacks by the stored stage
  // of each id, require exactly one stage whose sibling order changed, and
  // name the single-element move inside that sibling list. A write no
  // same-stage move reproduces refuses here instead of landing elsewhere.
  const stageOf = new Map<string, string>(before.map((effect) => [effect.id, showClipEffectStage(effect)]))
  const siblingsIn = (ids: string[], stage: string): string[] => ids.filter((id) => stageOf.get(id) === stage)
  const stages = [...new Set(beforeIds.map((id) => stageOf.get(id)!))]
  const moved = stages.filter((stage) => !sameJson(siblingsIn(beforeIds, stage), siblingsIn(afterIds, stage)))
  if (moved.length !== 1) return { kind: 'ambiguous' }
  const siblings = siblingsIn(beforeIds, moved[0])
  const siblingsNext = siblingsIn(afterIds, moved[0])
  const without = (ids: string[], id: string): string[] => ids.filter((candidate) => candidate !== id)
  const candidates = siblings.filter(
    (id) => sameJson(without(siblings, id), without(siblingsNext, id)),
  )
  if (candidates.length === 0) return { kind: 'ambiguous' }
  // An adjacent swap moves two ids symmetrically while every longer move has
  // exactly one; both swap readings permute to the same stack, so the later-
  // travelled id names the move deterministically.
  const byOldIndex = (left: string, right: string): number => siblings.indexOf(left) - siblings.indexOf(right)
  const later = candidates.filter((id) => siblingsNext.indexOf(id) > siblings.indexOf(id)).sort(byOldIndex)
  const earlier = candidates.filter((id) => siblingsNext.indexOf(id) <= siblings.indexOf(id)).sort(byOldIndex)
  const sourceId = [...later, ...earlier][0]
  const at = siblingsNext.indexOf(sourceId)
  if (at < 0 || siblingsNext.length < 2) return { kind: 'ambiguous' }
  const targetId = at < siblingsNext.length - 1 ? siblingsNext[at + 1] : siblingsNext[at - 1]
  const edge = at < siblingsNext.length - 1 ? 'before' : 'after'
  const source = before.find((effect) => effect.id === sourceId)!
  const target = before.find((effect) => effect.id === targetId)!
  // Source and target are same-stage siblings by construction. Prove the
  // owner's own move reproduces the whole edited stack exactly; anything
  // else — a cross-stage interleave, a smuggled parameter edit — refuses.
  if (!sameJson(moveShowClipEffectToStagePosition(before, sourceId, targetId, edge), after)) {
    return { kind: 'ambiguous' }
  }
  return { kind: 'reorder', effectId: sourceId, effectKind: source.kind, targetEffectId: target.id, targetEffectKind: target.kind, edge }
}

/** Shape-owned aperture parameters, mirroring the viewport normalizer. */
const SHAPE_PARAMETERS: Record<string, readonly string[]> = {
  ring: ['ringWidth'],
  'rounded-box': ['cornerRadius'],
  cross: ['crossWidth'],
  star: ['starPoints', 'starInner'],
  crescent: ['crescentOffset'],
  polygon: ['polygonSides'],
}

const NULLABLE_APERTURE_KEYS = new Set([
  'aperture', 'edge', 'feather', 'rotation', 'invert',
  'ringWidth', 'cornerRadius', 'crossWidth', 'starPoints', 'starInner', 'crescentOffset', 'polygonSides',
])

/**
 * Translate one inspector viewport patch into the aperture spelling the
 * appearance owner validates. `undefined` is the inspector's delete spelling
 * (spread onto the stored viewport, the normalizer drops it), which the owner
 * spells `null`; `rectangle` normalizes away to a missing silhouette, which
 * the owner also spells `null`; and a newly chosen silhouette drops the
 * previous shape's parameters exactly as the normalizer does when it keeps
 * only the selected shape's fields.
 */
function planAperture(patch: Record<string, unknown>): Record<string, unknown> | null {
  const aperture: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      if (!NULLABLE_APERTURE_KEYS.has(key)) return null
      aperture[key] = null
      continue
    }
    aperture[key] = value
  }
  if (typeof aperture.aperture === 'string' && SHOW_CLIP_APERTURE_SHAPES.includes(aperture.aperture as never)) {
    if (aperture.aperture === 'rectangle') {
      aperture.aperture = null
      for (const parameters of Object.values(SHAPE_PARAMETERS)) {
        for (const parameter of parameters) {
          if (!has(patch, parameter)) aperture[parameter] = null
        }
      }
    } else {
      for (const [shape, parameters] of Object.entries(SHAPE_PARAMETERS)) {
        if (shape === aperture.aperture) continue
        for (const parameter of parameters) {
          if (!has(patch, parameter)) aperture[parameter] = null
        }
      }
    }
  }
  return aperture
}

const VIEW_KEYS = new Set(['mirror', 'phase', 'brightness'])
const TRANSFORM_KEYS = new Set(['positionX', 'positionY', 'rotation', 'scaleX', 'scaleY'])

/**
 * Whether the patch carries any facet outside the exclusive Pattern and
 * entry-policy doors: every appearance, instance or timing key. Blink is the
 * only nullable facet, so it reads by presence while the rest read defined.
 */
function hasOtherInspectorFacet(patch: ShowClipInspectorPatch): boolean {
  return patch.evaluationPolicy !== undefined
    || patch.presentation !== undefined
    || has(patch, 'blink')
    || patch.simulation !== undefined
    || patch.view !== undefined
    || patch.transform !== undefined
    || patch.viewport !== undefined
    || patch.effects !== undefined
    || patch.local !== undefined
}

/**
 * Plan one inspector patch against the current v2 record. The record is the
 * before-image for every comparison, matching the legacy owner's apply-to-
 * current semantics; the UI's displayed value is never trusted for stored
 * state, only the patch it emitted is read.
 */
export function planShowV2ClipInspectorPatch(
  record: ShowRecordV2,
  clipId: string,
  patch: ShowClipInspectorPatch,
): ShowV2ClipInspectorPlan {
  if (typeof clipId !== 'string' || clipId.trim().length === 0) {
    return refuse('invalid-request', 'Choose one ordinary Clip to edit.')
  }
  if (clipId.includes(':')) {
    return refuse('group-child', 'A Group Clip use is edited through its Group occurrence.')
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return refuse('invalid-request', 'Give one Clip inspector patch.')
  }
  // Only the v1 converter writes conversion provenance; an inspector patch
  // cannot author it (#1068).
  if ('logicalClipId' in patch && patch.logicalClipId !== undefined) {
    return refuse('invalid-request', 'A Clip inspector patch cannot author conversion provenance.')
  }
  const clip = record.composition.clips.find((candidate) => candidate.id === clipId)
  if (!clip) return refuse('missing-clip', `Clip "${clipId}" does not exist.`)
  // The Pattern and entry-policy facets each own their admission, so either
  // one travels alone: a combined write could not land as one history entry.
  // No shipped control emits such a patch; both gestures below read the
  // record as the before-image, exactly like the facet flow underneath.
  if (patch.pattern !== undefined || patch.entryPolicy !== undefined) {
    if (hasOtherInspectorFacet(patch)) {
      return refuse('mixed-facets', 'One inspector write carries one owner edit; mixed appearance and instance writes stay unconnected.')
    }
    if (patch.pattern !== undefined && patch.entryPolicy !== undefined) {
      return refuse('mixed-facets', 'One inspector write carries one owner edit; mixed appearance and instance writes stay unconnected.')
    }
    if (patch.entryPolicy !== undefined) {
      if (patch.entryPolicy !== 'continue' && patch.entryPolicy !== 'restart') {
        return refuse('invalid-request', 'Choose Continue or Restart for one ordinary Clip.')
      }
      if (clip.entryPolicy === patch.entryPolicy) return { kind: 'no-op' }
      return { kind: 'entry-policy', intent: { kind: 'set-entry-policy', clipId, entryPolicy: patch.entryPolicy } }
    }
    const replacement = patch.pattern as unknown
    if (!object(replacement) || !object(replacement.ref)
      || (replacement.ref.kind !== 'stock' && replacement.ref.kind !== 'user')
      || typeof replacement.ref.id !== 'string' || replacement.ref.id.trim().length === 0
      || Object.keys(replacement.ref).length !== 2
      || typeof replacement.name !== 'string' || replacement.name.trim().length === 0) {
      return refuse('invalid-request', 'Choose one captured Pattern with a name.')
    }
    const reference: ShowPatternRef = { kind: replacement.ref.kind, id: replacement.ref.id }
    const instance = record.composition.patternInstances.find((candidate) => candidate.id === clip.instanceId)
    if (!instance) return refuse('missing-clip', `Clip "${clipId}" has no Pattern instance.`)
    if (instance.pattern.kind === reference.kind && instance.pattern.id === reference.id
      && instance.patternName === replacement.name) {
      return { kind: 'no-op' }
    }
    return { kind: 'replacement', clipId, reference, name: replacement.name }
  }
  if (patch.local !== undefined && (patch.local.startMs !== undefined || patch.local.durationMs !== undefined)) {
    return refuse('timing-edit', 'Clip timing travels through the temporal owners, not this surface.')
  }

  const appearance: ShowClipAppearancePatchV2 = {}
  let appearanceFacets = 0
  const noteAppearance = (): void => { appearanceFacets += 1 }

  if (patch.view !== undefined) {
    if (!object(patch.view) || Object.keys(patch.view).some((key) => !VIEW_KEYS.has(key))) {
      return refuse('invalid-request', 'Give finite placement-view fields.')
    }
    if (has(patch.view, 'mirror') && typeof patch.view.mirror !== 'boolean') {
      return refuse('invalid-request', 'Give finite placement-view fields.')
    }
    for (const key of ['phase', 'brightness'] as const) {
      if (has(patch.view, key) && (typeof patch.view[key] !== 'number' || !Number.isFinite(patch.view[key]))) {
        return refuse('invalid-request', 'Give finite placement-view fields.')
      }
    }
    appearance.view = { ...(patch.view as Partial<ShowClipAppearancePatchV2['view']>) }
    noteAppearance()
  }
  if (patch.transform !== undefined) {
    if (patch.transform === null || !object(patch.transform) || Object.keys(patch.transform).some((key) => !TRANSFORM_KEYS.has(key))) {
      return refuse('invalid-request', 'Give finite transform fields.')
    }
    for (const value of Object.values(patch.transform)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return refuse('invalid-request', 'Give finite transform fields.')
    }
    appearance.transform = { ...(patch.transform as NonNullable<ShowClipAppearancePatchV2['transform']>) }
    noteAppearance()
  }
  if (patch.viewport !== undefined) {
    if (!object(patch.viewport)) return refuse('invalid-request', 'Give aperture fields.')
    const aperture = planAperture(patch.viewport)
    if (!aperture) return refuse('invalid-request', 'Give aperture fields.')
    appearance.aperture = aperture as ShowClipAppearancePatchV2['aperture']
    noteAppearance()
  }
  if (patch.presentation !== undefined) {
    if (!object(patch.presentation)) return refuse('invalid-request', 'Give one Clip presentation.')
    appearance.presentation = patch.presentation as ShowClipAppearancePatchV2['presentation']
    noteAppearance()
  }
  if (has(patch, 'blink')) {
    if (patch.blink !== null && !object(patch.blink)) return refuse('invalid-request', 'Give one Blink gate or clear it.')
    appearance.blink = (patch.blink ?? null) as ShowClipAppearancePatchV2['blink']
    noteAppearance()
  }
  if (patch.local !== undefined && patch.local.opacity !== undefined) {
    if (typeof patch.local.opacity !== 'number' || !Number.isFinite(patch.local.opacity)) {
      return refuse('invalid-request', 'Give a finite Clip opacity.')
    }
    appearance.opacity = patch.local.opacity
    noteAppearance()
  }

  let effectsOp: EffectsOp | null = null
  if (patch.effects !== undefined) {
    if (!Array.isArray(patch.effects)) return refuse('invalid-request', 'Give one complete Effect stack.')
    if (clip.appearance.keys.length !== 1) {
      const everyEqual = clip.appearance.keys.every((key) => sameJson(key.value.effects ?? [], patch.effects))
      if (!everyEqual) {
        return refuse('multi-key-clip', 'A Clip with held appearance variation keeps its segments; whole-Clip appearance writes stay unconnected.')
      }
    } else {
      effectsOp = diffEffects(clip.appearance.keys[0].value.effects ?? [], patch.effects as ShowClipEffect[])
      if (effectsOp.kind === 'ambiguous') {
        return refuse('ambiguous-effects', 'One stack write carries one Effect change; combined stack rewrites stay unconnected.')
      }
      if (effectsOp.kind !== 'none') noteAppearance()
    }
  }

  const properties: ShowV2ClipInspectorInstanceIntent['properties'] = {}
  let instanceFacets = 0
  const noteInstance = (): void => { instanceFacets += 1 }
  if (patch.simulation !== undefined) {
    if (!object(patch.simulation)) return refuse('invalid-request', 'Give Pattern-instance values.')
    if (patch.simulation.lightShutter !== undefined && patch.simulation.lightShutter !== null) {
      return refuse('unsupported-simulation', 'The light shutter has no instance owner on this surface.')
    }
    if (patch.simulation.lightShutter === null) {
      return refuse('unsupported-simulation', 'The light shutter has no instance owner on this surface.')
    }
    if (patch.simulation.timeScale !== undefined) {
      if (typeof patch.simulation.timeScale !== 'number' || !Number.isFinite(patch.simulation.timeScale)) {
        return refuse('invalid-request', 'Give a finite animation speed.')
      }
      properties.time_scale = patch.simulation.timeScale
      noteInstance()
    }
    if (patch.simulation.timeOffsetMs !== undefined) {
      if (typeof patch.simulation.timeOffsetMs !== 'number' || !Number.isSafeInteger(patch.simulation.timeOffsetMs)) {
        return refuse('invalid-request', 'Give an integer Pattern time offset.')
      }
      properties.time_offset_ms = patch.simulation.timeOffsetMs
      noteInstance()
    }
    if (has(patch.simulation, 'steppedClock')) {
      const stepped = patch.simulation.steppedClock
      if (stepped === undefined || stepped === null) properties.stepped_clock = null
      else {
        if (!object(stepped)) return refuse('invalid-request', 'Give one positive stutter step or clear it.')
        if (typeof stepped.stepMs !== 'number' || !Number.isFinite(stepped.stepMs) || stepped.stepMs <= 0) {
          return refuse('invalid-request', 'Give one positive stutter step or clear it.')
        }
        properties.stepped_clock = { stepMs: stepped.stepMs }
      }
      noteInstance()
    }
    if (has(patch.simulation, 'controlTargets')) {
      const instance = record.composition.patternInstances.find((candidate) => candidate.id === clip.instanceId)
      if (!instance) return refuse('missing-clip', `Clip "${clipId}" has no Pattern instance.`)
      const targets = patch.simulation.controlTargets
      if (targets !== undefined && (!object(targets) || Object.values(targets).some((value) => typeof value !== 'number' || !Number.isFinite(value)))) {
        return refuse('invalid-request', 'Give finite Pattern control targets.')
      }
      const current = instance.controlTargets ?? {}
      const next = targets ?? {}
      const removed = Object.keys(current).filter((name) => !has(next, name))
      if (removed.length > 0) {
        return refuse('control-target-removal', `Removing the ${removed[0]} control target has no instance owner on this surface.`)
      }
      const changed: Record<string, number> = {}
      for (const [name, value] of Object.entries(next)) {
        if (typeof value === 'number' && !sameJson(current[name], value)) changed[name] = value
      }
      if (Object.keys(changed).length > 0) {
        properties.controls = changed
        noteInstance()
      }
    }
  }
  if (patch.evaluationPolicy !== undefined) {
    if (patch.evaluationPolicy !== 'live' && patch.evaluationPolicy !== 'freeze-at-entry' && patch.evaluationPolicy !== 'rolling-refresh') {
      return refuse('invalid-request', 'Choose a Clip evaluation policy.')
    }
    properties.evaluation = patch.evaluationPolicy
    noteInstance()
  }

  if (appearanceFacets > 0 && instanceFacets > 0) {
    return refuse('mixed-facets', 'One inspector write carries one owner edit; mixed appearance and instance writes stay unconnected.')
  }

  if (instanceFacets > 0) {
    const instance = record.composition.patternInstances.find((candidate) => candidate.id === clip.instanceId)
    if (!instance) return refuse('missing-clip', `Clip "${clipId}" has no Pattern instance.`)
    if (properties.time_scale !== undefined && instance.time.timeScale === properties.time_scale) {
      delete properties.time_scale
      instanceFacets -= 1
    }
    if (properties.time_offset_ms !== undefined && instance.time.timeOffsetMs === properties.time_offset_ms) {
      delete properties.time_offset_ms
      instanceFacets -= 1
    }
    if (properties.evaluation !== undefined && (instance.evaluationPolicy ?? 'live') === properties.evaluation) {
      delete properties.evaluation
      instanceFacets -= 1
    }
    if (properties.stepped_clock !== undefined && instance.time.steppedClock?.stepMs === properties.stepped_clock?.stepMs) {
      delete properties.stepped_clock
      instanceFacets -= 1
    }
    if (instanceFacets === 0) return { kind: 'no-op' }
    return { kind: 'instance-properties', intent: { clipId, properties } }
  }

  if (appearanceFacets === 0) return { kind: 'no-op' }
  if (clip.appearance.keys.length !== 1) {
    return refuse('multi-key-clip', 'A Clip with held appearance variation keeps its segments; whole-Clip appearance writes stay unconnected.')
  }
  const key = clip.appearance.keys[0]
  if (appearance.view !== undefined && Object.entries(appearance.view).every(([field, value]) => sameJson(((key.value.view as unknown) as Record<string, unknown>)[field], value))) {
    delete appearance.view
    appearanceFacets -= 1
  }
  if (appearance.transform !== undefined && appearance.transform !== null) {
    const current = normalizeShowClipTransform(key.value.transform)
    const currentFields = (current as unknown) as Record<string, unknown>
    if (Object.entries(appearance.transform).every(([field, value]) => sameJson(currentFields[field], value))) {
      delete appearance.transform
      appearanceFacets -= 1
    }
  }
  if (appearance.aperture !== undefined && appearance.aperture !== null) {
    const current = normalizeShowClipViewport(key.value.aperture)
    const entries = Object.entries(appearance.aperture)
    const currentFields = (current as unknown) as Record<string, unknown>
    const settled = entries.every(([field, value]) => (
      value === null ? currentFields[field] === undefined : sameJson(currentFields[field], value)
    ))
    if (settled) {
      delete appearance.aperture
      appearanceFacets -= 1
    }
  }
  if (appearance.presentation !== undefined && sameJson(key.value.presentation ?? { mode: 'live' }, appearance.presentation)) {
    delete appearance.presentation
    appearanceFacets -= 1
  }
  if (has(appearance, 'blink') && sameJson(key.value.blink ?? null, appearance.blink ?? null)) {
    delete appearance.blink
    appearanceFacets -= 1
  }
  if (appearance.opacity !== undefined && key.value.opacity === appearance.opacity) {
    delete appearance.opacity
    appearanceFacets -= 1
  }
  if (effectsOp && effectsOp.kind !== 'none') {
    // The Effect operation already counted one appearance facet; any other
    // surviving appearance facet makes this a mixed write, which refuses
    // rather than storing half the patch while the caller reads success.
    if (appearanceFacets > 1) {
      return refuse('mixed-facets', 'One inspector write carries one owner edit; mixed appearance and instance writes stay unconnected.')
    }
    const outcome = effectsIntent(clipId, effectsOp, clip.appearance.keys)
    if (!outcome) {
      return refuse('ambiguous-effects', 'One stack write carries one Effect change; combined stack rewrites stay unconnected.')
    }
    return { kind: 'appearance', intent: outcome }
  }
  if (appearanceFacets === 0) return { kind: 'no-op' }
  return { kind: 'appearance', intent: { kind: 'appearance', clipId, scope: 'whole-clip', patch: appearance } }
}

/**
 * Name one whole-Clip Effect operation after proving it exists exactly in
 * every held stack. The diff already proved the operation reproduces the
 * edited stack; this repeats the owner's exactness rule per key so a partial
 * stack never names an intent the owner must refuse.
 */
function effectsIntent(
  clipId: string,
  op: Exclude<EffectsOp, { kind: 'none' } | { kind: 'ambiguous' }>,
  keys: ShowClipV2['appearance']['keys'],
): ShowClipAppearanceEditIntentV2 | null {
  const scope = 'whole-clip' as const
  const exactInEveryKey = (id: string, kind: ShowClipEffect['kind']): boolean => keys.every((key) => {
    const matches = (key.value.effects ?? []).filter((effect) => effect.id === id)
    return matches.length === 1 && matches[0].kind === kind
  })
  if (op.kind === 'add') {
    if (keys.some((key) => (key.value.effects ?? []).some((effect) => effect.id === op.effect.id))) return null
    return { kind: 'add-effect', clipId, scope, effect: op.effect }
  }
  if (op.kind === 'remove') {
    if (!exactInEveryKey(op.effectId, op.effectKind)) return null
    return { kind: 'remove-effect', clipId, scope, effectId: op.effectId, effectKind: op.effectKind }
  }
  if (op.kind === 'update') {
    if (!exactInEveryKey(op.effectId, op.effectKind)) return null
    return { kind: 'update-effect', clipId, scope, effectId: op.effectId, effectKind: op.effectKind, parameter: op.parameter, value: op.value }
  }
  if (op.kind === 'duplicate') {
    if (!exactInEveryKey(op.effectId, op.effectKind)) return null
    if (keys.some((key) => (key.value.effects ?? []).some((effect) => effect.id === op.newEffectId))) return null
    return { kind: 'duplicate-effect', clipId, scope, effectId: op.effectId, effectKind: op.effectKind, newEffectId: op.newEffectId }
  }
  if (!exactInEveryKey(op.effectId, op.effectKind) || !exactInEveryKey(op.targetEffectId, op.targetEffectKind)) {
    return null
  }
  const find = (id: string): ShowClipEffect => keys[0].value.effects!.find((effect) => effect.id === id)!
  if (showClipEffectStage(find(op.effectId)) !== showClipEffectStage(find(op.targetEffectId))) return null
  return {
    kind: 'reorder-effect', clipId, scope,
    effectId: op.effectId, effectKind: op.effectKind,
    targetEffectId: op.targetEffectId, targetEffectKind: op.targetEffectKind, edge: op.edge,
  }
}
