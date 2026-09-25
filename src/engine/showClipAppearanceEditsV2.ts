import { validateShowRecordV2, type ShowClipAppearanceKeyV2, type ShowClipAppearanceValueV2, type ShowClipV2, type ShowPropertyTargetV2, type ShowRecordV2 } from './showCompositionV2'
import type { ShowClipEffect, ShowClipTransform, ShowClipViewport, ShowClipPresentation, ShowClipBlink, ShowPlacementView } from './personalContentRecords'
import type { ShowClipEditRefusalV2, ShowClipEditResultV2 } from './showClipsV2'
import type { ShowTimelineEditAffectedV2 } from './showTimelineV2'
import { clipContributionInterval, validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { firstShowTransitionPlacementRestrictionV2 } from './showTransitionPlacementV2'
import { normalizeShowClipEffects, showEffectOrderConflicts, showEffectParameterNames } from './showEffects'
import { showClipEffectParameters, showClipEffectParameterValue, showClipEffectPersistedField, showClipEffectStage, updateShowClipEffectParameter } from './showEffectAuthoring'
import { parseColorValue } from './colorValue'
import { NEUTRAL_SHOW_CLIP_TRANSFORM } from './showClipTransform'
import { DEFAULT_SHOW_CLIP_VIEWPORT, SHOW_CLIP_APERTURE_SHAPES } from './showClipViewport'
import { materializeShowGroupsV2 } from './showGroupsV2'

export interface ShowClipAppearancePatchV2 {
  opacity?: number
  view?: Partial<ShowPlacementView>
  transform?: Partial<ShowClipTransform> | null
  aperture?: { [Key in keyof ShowClipViewport]?: ShowClipViewport[Key] | (undefined extends ShowClipViewport[Key] ? null : never) } | null
  presentation?: ShowClipPresentation | null
  blink?: ShowClipBlink | null
}
export type ShowClipAppearanceKeyIdentityV2 = { kind: 'retain' | 'insert'; appearanceKeyId: string }
type Target = { clipId: string; scope: 'whole-clip' }
  | { clipId: string; scope: 'selected-time'; atMs: number; keyIdentity: ShowClipAppearanceKeyIdentityV2 }
type EffectTarget = { effectId: string; effectKind: ShowClipEffect['kind'] }
export type ShowClipAppearanceEditIntentV2 = Target & (
  | { kind: 'appearance'; patch: ShowClipAppearancePatchV2 }
  | { kind: 'add-effect'; effect: ShowClipEffect }
  | ({ kind: 'update-effect'; parameter: string; value: number | string } & EffectTarget)
  | ({ kind: 'duplicate-effect'; newEffectId: string } & EffectTarget)
  | ({ kind: 'reorder-effect'; targetEffectId: string; targetEffectKind: ShowClipEffect['kind']; edge: 'before' | 'after' } & EffectTarget)
  | ({ kind: 'remove-effect' } & EffectTarget)
)
export type ShowClipAppearanceEditResultV2 = (
  | Exclude<ShowClipEditResultV2, { status: 'refused' }>
  | (Omit<Extract<ShowClipEditResultV2, { status: 'refused' }>, 'code'> & { code: ShowClipEditRefusalV2 | 'effect-order-conflict' })
) & ShowTimelineEditAffectedV2 & { reidentifiedEffectIds?: Record<string, string> }

/** Keep one Clip's held keys and every Clip on its instance on one Effect chain. */
export function separateEffectOrderFromSharedClipsV2(record: ShowRecordV2, clipId: string):
  | { status: 'conflict' }
  | { status: 'ready'; record: ShowRecordV2; reidentifiedEffectIds: Record<string, string> } {
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)!
  const keys = clip.appearance.keys
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const left = keys[i].value.effects ?? [], right = keys[j].value.effects ?? []
      const shared = new Set(left.map(effect => effect.id).filter(id => right.some(effect => effect.id === id)))
      if (shared.size > 1 && (showEffectOrderConflicts(left.filter(effect => shared.has(effect.id)), right.filter(effect => shared.has(effect.id)))
        || showEffectOrderConflicts(right.filter(effect => shared.has(effect.id)), left.filter(effect => shared.has(effect.id))))) return { status: 'conflict' }
    }
  }
  const conflicting = new Set<string>()
  for (const sibling of record.composition.clips) {
    if (sibling.id === clip.id || sibling.instanceId !== clip.instanceId) continue
    for (const key of keys) for (const other of sibling.appearance.keys) {
      const effects = key.value.effects ?? [], otherEffects = other.value.effects ?? []
      if (!showEffectOrderConflicts(effects, otherEffects) && !showEffectOrderConflicts(otherEffects, effects)) continue
      for (const effect of effects) if (otherEffects.some(candidate => candidate.id === effect.id && candidate.kind === effect.kind)) conflicting.add(effect.id)
    }
  }
  if (!conflicting.size) return { status: 'ready', record, reidentifiedEffectIds: {} }
  const next = structuredClone(record)
  const used = new Set<string>()
  const collectIds = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(collectIds); return }
    if (!value || typeof value !== 'object') return
    for (const [name, child] of Object.entries(value)) {
      if (name === 'id' && typeof child === 'string') used.add(child)
      else collectIds(child)
    }
  }
  collectIds(record)
  const reidentifiedEffectIds: Record<string, string> = {}
  for (const oldId of [...conflicting].sort()) {
    const base = `${oldId}@${clip.id}`
    let fresh = base, suffix = 2
    while (used.has(fresh)) fresh = `${base}~${suffix++}`
    used.add(fresh)
    reidentifiedEffectIds[oldId] = fresh
  }
  const edited = next.composition.clips.find(candidate => candidate.id === clip.id)!
  for (const key of edited.appearance.keys) for (const effect of key.value.effects ?? []) effect.id = reidentifiedEffectIds[effect.id] ?? effect.id
  for (const track of next.composition.propertyTracks) {
    if (track.target.kind === 'clip-effect' && track.target.clipId === clip.id) {
      track.target.effectId = reidentifiedEffectIds[track.target.effectId] ?? track.target.effectId
    }
  }
  return { status: 'ready', record: next, reidentifiedEffectIds }
}

/** Explicit held-value authoring; retained animation and runtime owners stay authored. */
export function editShowClipAppearanceV2(record: ShowRecordV2, intent: ShowClipAppearanceEditIntentV2): ShowClipAppearanceEditResultV2 {
  const empty = { affectedClipIds: [] as [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [] as [],
    affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [], affectedGroupDefinitionIds: [], affectedGroupOccurrenceIds: [],
    affectedLayerIds: [], affectedMarkerIds: [], affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [], removedIds: [], discardedControlTargets: [] }
  const refuse = (code: ShowClipEditRefusalV2 | 'effect-order-conflict', message: string): ShowClipAppearanceEditResultV2 => ({ status: 'refused', record, code, message, ...empty })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  if (!object(intent) || !['whole-clip', 'selected-time'].includes(intent.scope) || typeof intent.clipId !== 'string' || !intent.clipId.length) return refuse('invalid-intent', 'Give an ordinary Clip and explicit appearance scope.')
  const clip = record.composition.clips.find(candidate => candidate.id === intent.clipId)
  if (!clip) return refuse('missing-clip', `Clip "${intent.clipId}" does not exist.`)
  const targetFields = intent.scope === 'whole-clip' ? ['clipId', 'scope'] : ['clipId', 'scope', 'atMs', 'keyIdentity']
  let selectedKeys: ShowClipAppearanceKeyV2[] = clip.appearance.keys
  if (intent.scope === 'selected-time') {
    if (!Number.isSafeInteger(intent.atMs) || intent.atMs < clip.startMs || intent.atMs >= clip.startMs + clip.durationMs
      || !exact(intent.keyIdentity, ['kind', 'appearanceKeyId']) || typeof intent.keyIdentity.appearanceKeyId !== 'string') {
      return refuse('invalid-intent', 'Select an integer time inside the Clip bar, before its end, with an exact held-key identity plan.')
    }
    const existing = clip.appearance.keys.find(key => key.timeMs === intent.atMs)
    if (intent.keyIdentity.kind === 'retain') {
      if (!existing || existing.id !== intent.keyIdentity.appearanceKeyId) return refuse('invalid-intent', 'Retain the exact appearance key at the selected time.')
      selectedKeys = [existing]
    } else if (intent.keyIdentity.kind === 'insert') {
      if (existing || !intent.keyIdentity.appearanceKeyId.trim() || clip.appearance.keys.some(key => key.id === intent.keyIdentity.appearanceKeyId)) {
        return refuse('invalid-intent', 'Insert one fresh appearance key at the selected interior time.')
      }
      const held = [...clip.appearance.keys].reverse().find(key => key.timeMs < intent.atMs)!
      selectedKeys = [{ id: intent.keyIdentity.appearanceKeyId, timeMs: intent.atMs, value: held.value }]
    } else return refuse('invalid-intent', 'Use an explicit retain or insert appearance key plan.')
  }
  if (intent.kind === 'appearance' && (!exact(intent, [...targetFields, 'kind', 'patch']) || !validAppearancePatch(intent.patch))) return refuse('invalid-intent', 'Supply finite supported appearance fields.')
  if (intent.kind === 'add-effect') {
    if (!exact(intent, [...targetFields, 'kind', 'effect']) || !validEffect(intent.effect)) return refuse('invalid-intent', 'Supply one complete Effect with finite supported values.')
    if (clip.appearance.keys.some(key => key.value.effects?.some(effect => effect.id === intent.effect.id))) return refuse('invalid-intent', 'The new Effect ID must be unused in every held stack of this Clip.')
  } else if (intent.kind === 'update-effect') {
    if (!exact(intent, [...targetFields, 'kind', 'effectId', 'effectKind', 'parameter', 'value'])
      || selectedKeys.some(key => {
        const effects = (key.value.effects ?? []).filter(effect => effect.id === intent.effectId)
        return effects.length !== 1 || effects[0].kind !== intent.effectKind || !effectParameterPatch(effects[0], intent.parameter, intent.value)
      })) return refuse('invalid-intent', 'The exact Effect and finite supported parameter must exist in every selected held stack.')
  } else if (intent.kind === 'duplicate-effect') {
    if (!exact(intent, [...targetFields, 'kind', 'effectId', 'effectKind', 'newEffectId'])
      || typeof intent.newEffectId !== 'string' || !intent.newEffectId.trim()
      || selectedKeys.some(key => !exactEffect(key.value.effects ?? [], intent.effectId, intent.effectKind))
      || clip.appearance.keys.some(key => key.value.effects?.some(effect => effect.id === intent.newEffectId))) return refuse('invalid-intent', 'Supply a fresh Effect ID and the exact source in every selected held stack.')
  } else if (intent.kind === 'remove-effect') {
    if (!exact(intent, [...targetFields, 'kind', 'effectId', 'effectKind'])
      || selectedKeys.some(key => !exactEffect(key.value.effects ?? [], intent.effectId, intent.effectKind))) return refuse('invalid-intent', 'The exact Effect must exist in every selected held stack.')
  } else if (intent.kind === 'reorder-effect') {
    if (!exact(intent, [...targetFields, 'kind', 'effectId', 'effectKind', 'targetEffectId', 'targetEffectKind', 'edge'])
      || !['before', 'after'].includes(intent.edge) || selectedKeys.some(key => {
        const source = exactEffect(key.value.effects ?? [], intent.effectId, intent.effectKind)
        const target = exactEffect(key.value.effects ?? [], intent.targetEffectId, intent.targetEffectKind)
        return !source || !target || showClipEffectStage(source) !== showClipEffectStage(target)
      })) return refuse('invalid-intent', 'Give exact source and same-stage destination Effects in every selected held stack.')
  } else if (intent.kind !== 'appearance') return refuse('invalid-intent', 'Unsupported appearance operation.')
  let next = structuredClone(record)
  const edited = next.composition.clips.find(candidate => candidate.id === clip.id)!
  if (intent.scope === 'selected-time' && intent.keyIdentity.kind === 'insert') {
    edited.appearance.keys.push(structuredClone(selectedKeys[0]))
    edited.appearance.keys.sort((left, right) => left.timeMs - right.timeMs)
  }
  const affectedAppearanceKeyIds: string[] = []
  for (const key of edited.appearance.keys) {
    if (intent.scope === 'selected-time' && key.id !== intent.keyIdentity.appearanceKeyId) continue
    const before = JSON.stringify(key.value)
    if (intent.kind === 'appearance') applyAppearance(key.value, intent.patch)
    else if (intent.kind === 'add-effect') {
      const effect = normalizeShowClipEffects([intent.effect])[0]
      effect.id = intent.effect.id
      key.value.effects = [...(key.value.effects ?? []), effect]
    } else if (intent.kind === 'update-effect') {
      const effect = key.value.effects!.find(effect => effect.id === intent.effectId)!
      Object.assign(effect, effectParameterPatch(effect, intent.parameter, intent.value)!)
    } else if (intent.kind === 'remove-effect') {
      key.value.effects = key.value.effects!.filter(effect => effect.id !== intent.effectId)
    } else if (intent.kind === 'duplicate-effect') {
      const effects = key.value.effects!
      const index = effects.findIndex(effect => effect.id === intent.effectId)
      effects.splice(index + 1, 0, { ...structuredClone(effects[index]), id: intent.newEffectId } as ShowClipEffect)
    } else if (intent.kind === 'reorder-effect' && intent.effectId !== intent.targetEffectId) {
      const effects = key.value.effects!
      const stage = showClipEffectStage(exactEffect(effects, intent.effectId, intent.effectKind)!)
      const positions = effects.flatMap((effect, index) => showClipEffectStage(effect) === stage ? [index] : [])
      const siblings = positions.map(index => effects[index])
      const sourceIndex = siblings.findIndex(effect => effect.id === intent.effectId)
      const [source] = siblings.splice(sourceIndex, 1)
      const targetIndex = siblings.findIndex(effect => effect.id === intent.targetEffectId)
      siblings.splice(targetIndex + (intent.edge === 'after' ? 1 : 0), 0, source)
      positions.forEach((position, index) => { effects[position] = siblings[index] })
    }
    if (JSON.stringify(key.value) !== before) affectedAppearanceKeyIds.push(key.id)
  }
  let reidentifiedEffectIds: Record<string, string> | undefined
  if (intent.kind === 'reorder-effect' && affectedAppearanceKeyIds.length) {
    const separated = separateEffectOrderFromSharedClipsV2(next, clip.id)
    if (separated.status === 'conflict') return refuse('effect-order-conflict', 'This Clip already uses these Effects in a different order at another time. Reorder them for the whole Clip instead.')
    next = separated.record
    reidentifiedEffectIds = separated.reidentifiedEffectIds
  }
  // Legacy `remove_clip_effect` pruned every Scene Property track whose
  // placement-effect target no longer resolved on that logical Clip
  // (`pruneRemovedEffectPropertyTracks`). The v2 cascade is exactly that, read
  // per appearance span: a Clip-owned track naming this Effect is removed when
  // any span intersecting its activation no longer carries the Effect. Nothing
  // else is touched; a surviving Transition ramp refuses below instead.
  const removedTracks = intent.kind !== 'remove-effect' ? [] : next.composition.propertyTracks.filter(track => {
    const target = track.target
    if (target.kind !== 'clip-effect' || target.clipId !== clip.id || target.effectId !== intent.effectId || target.effectKind !== intent.effectKind) return false
    const activeEndMs = track.activeStartMs + track.activeDurationMs
    return appearanceSpans(materializeShowGroupsV2(next), edited).some(span => span.startMs < activeEndMs && span.endMs > track.activeStartMs
      && !exactEffect(span.effects, intent.effectId, intent.effectKind))
  })
  const removedTrackIds = removedTracks.map(track => track.id).sort()
  if (removedTrackIds.length) next.composition.propertyTracks = next.composition.propertyTracks.filter(track => !removedTrackIds.includes(track.id))
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  const referenceIssue = effectReferenceIssue(next)
  if (referenceIssue) return refuse('invalid-result', referenceIssue)
  const availability = validateShowLayoutAvailabilityV2(next)[0]
  if (availability) return refuse('invalid-result', `${availability.entityKind} "${availability.entityId}" uses an unavailable Zone.`)
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuse('compiler-ineligible', restriction.message)
  if (!affectedAppearanceKeyIds.length) return { status: 'unchanged', record, ...empty }
  const newEffectIds = new Set(Object.values(reidentifiedEffectIds ?? {}))
  const reidentifiedTrackIds = next.composition.propertyTracks.filter(track => track.target.kind === 'clip-effect'
    && track.target.clipId === clip.id && newEffectIds.has(track.target.effectId)).map(track => track.id)
  return { status: 'changed', record: next, ...empty, affectedClipIds: [clip.id], affectedAppearanceKeyIds, reidentifiedEffectIds,
    affectedTrackIds: [...removedTrackIds, ...reidentifiedTrackIds].sort(), removedIds: removedTrackIds,
    affectedPropertyKeyIds: removedTracks.flatMap(track => track.keyframes.map(keyframe => keyframe.id)).sort() }
}

/** Held spans of one Clip, the first inheriting its incoming contribution. */
function appearanceSpans(effective: ShowRecordV2, clip: ShowClipV2): Array<{ startMs: number; endMs: number; effects: ShowClipEffect[] }> {
  const contribution = clipContributionInterval(effective, clip)
  return clip.appearance.keys.map((key, index) => ({
    startMs: index === 0 ? contribution.startMs : key.timeMs,
    endMs: clip.appearance.keys[index + 1]?.timeMs ?? contribution.endMs,
    effects: key.value.effects ?? [],
  }))
}

function applyAppearance(value: ShowClipAppearanceValueV2, patch: ShowClipAppearancePatchV2): void {
  if (has(patch, 'opacity')) value.opacity = patch.opacity!
  if (patch.view) Object.assign(value.view, structuredClone(patch.view))
  if (has(patch, 'transform')) {
    if (patch.transform === null) delete value.transform
    else if (Object.keys(patch.transform!).length) {
      value.transform ??= { ...NEUTRAL_SHOW_CLIP_TRANSFORM }
      Object.assign(value.transform, structuredClone(patch.transform))
    }
  }
  if (has(patch, 'aperture')) {
    if (patch.aperture === null) delete value.aperture
    else {
      const entries = Object.entries(patch.aperture!)
      if (!value.aperture && entries.some(([, item]) => item !== null)) value.aperture = { ...DEFAULT_SHOW_CLIP_VIEWPORT }
      for (const [field, item] of value.aperture ? entries : []) {
        const aperture = value.aperture as unknown as Record<string, unknown>
        if (item === null) delete aperture[field]
        else aperture[field] = ['starPoints', 'polygonSides'].includes(field) ? Math.round(item as number) : structuredClone(item)
      }
    }
  }
  if (has(patch, 'presentation')) {
    if (patch.presentation === null) delete value.presentation
    else value.presentation = patch.presentation!.mode === 'strobe'
      ? { mode: 'strobe', cadenceMs: Math.round(patch.presentation!.cadenceMs) } : structuredClone(patch.presentation!)
  }
  if (has(patch, 'blink')) {
    if (patch.blink === null) delete value.blink
    else value.blink = structuredClone(patch.blink!)
  }
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function exact(value: unknown, keys: readonly string[]): boolean { return object(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()) }
function has(value: object, key: string): boolean { return Object.prototype.hasOwnProperty.call(value, key) }
function exactEffect(effects: ShowClipEffect[], id: unknown, kind: unknown): ShowClipEffect | undefined {
  if (typeof id !== 'string' || !id.length) return undefined
  const matches = effects.filter(effect => effect.id === id)
  return matches.length === 1 && matches[0].kind === kind ? matches[0] : undefined
}
function number(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max }

function validAppearancePatch(patch: unknown): patch is ShowClipAppearancePatchV2 {
  if (!object(patch)) return false
  const transformRanges = { positionX: [-4, 4], positionY: [-4, 4], rotation: [-8, 8], scaleX: [.01, 8], scaleY: [.01, 8] }
  const apertureRanges = { x: [-4, 4], y: [-4, 4], width: [.01, 8], height: [.01, 8], feather: [.001, 1], rotation: [-1, 1],
    ringWidth: [.05, 1], cornerRadius: [.05, 1], crossWidth: [.1, .9], starPoints: [3, 12], starInner: [.2, .8], crescentOffset: [.15, .8], polygonSides: [3, 8] }
  return Object.entries(patch).every(([field, value]) => {
    if (field === 'opacity') return number(value, 0, 1)
    if (field === 'view') return object(value) && Object.entries(value).every(([key, item]) => key === 'mirror' ? typeof item === 'boolean' : ['phase', 'brightness'].includes(key) && number(item, 0, 1))
    if (['transform', 'aperture', 'presentation', 'blink'].includes(field) && value === null) return true
    if (!object(value)) return false
    if (field === 'transform') return Object.entries(value).every(([key, item]) => range(item, transformRanges, key))
    if (field === 'aperture') return Object.entries(value).every(([key, item]) => {
      if (item === null) return ['aperture', 'edge', 'feather', 'rotation', 'invert', 'ringWidth', 'cornerRadius', 'crossWidth', 'starPoints', 'starInner', 'crescentOffset', 'polygonSides'].includes(key)
      if (['enabled', 'invert'].includes(key)) return typeof item === 'boolean'
      if (key === 'aperture') return SHOW_CLIP_APERTURE_SHAPES.includes(item as never)
      if (key === 'edge') return ['hard', 'soft', 'dither'].includes(item as string)
      return range(item, apertureRanges, key)
    })
    if (field === 'presentation') return value.mode === 'strobe' ? exact(value, ['mode', 'cadenceMs']) && number(value.cadenceMs, 16, 60000)
      : ['live', 'freeze'].includes(value.mode as string) && exact(value, ['mode'])
    if (field === 'blink') return exact(value, ['rateHz', 'duty', 'phase']) && number(value.rateHz, .01, 60) && number(value.duty, 0, 1) && number(value.phase, 0, 1)
    return false
  })
}
function range(value: unknown, ranges: Record<string, number[]>, key: string): boolean {
  return has(ranges, key) && number(value, ranges[key][0], ranges[key][1])
}

function validEffect(value: unknown): value is ShowClipEffect {
  if (!object(value) || typeof value.id !== 'string' || !value.id.trim() || typeof value.kind !== 'string') return false
  // Only trusted catalogue defaults enter normalization before raw value admission.
  const template = normalizeShowClipEffects([{ id: 'catalogue-default', kind: value.kind } as ShowClipEffect])[0]
  if (!template || !exact(value, Object.keys(template))) return false
  if (Object.entries(value).some(([key, item]) => !['id', 'kind'].includes(key)
    && (key === 'color' ? typeof item !== 'string' || !parseColorValue(item) : typeof item !== 'number' || !Number.isFinite(item)))) return false
  const effect = value as unknown as ShowClipEffect
  const descriptors = showClipEffectParameters(effect)
  return showEffectParameterNames(effect).every(parameter => {
    const item = value[parameter]
    const descriptor = descriptors.find(candidate => candidate.id === parameter || showClipEffectPersistedField(effect.kind, candidate.id) === parameter)
    return descriptor?.kind === 'color' ? typeof item === 'string' && !!parseColorValue(item)
      : number(item, descriptor?.min ?? 0, descriptor?.max ?? 1)
  })
}

function effectParameterPatch(effect: ShowClipEffect, parameter: unknown, value: unknown): Record<string, number | string> | undefined {
  if (typeof parameter !== 'string') return undefined
  const descriptor = showClipEffectParameters(effect).find(candidate => candidate.id === parameter || showClipEffectPersistedField(effect.kind, candidate.id) === parameter)
  if (!descriptor && !showEffectParameterNames(effect).includes(parameter)) return undefined
  if (descriptor?.kind === 'color') {
    if (typeof value !== 'string' || !parseColorValue(value)) return undefined
  } else if (!number(value, descriptor?.min ?? 0, descriptor?.max ?? 1)) return undefined
  if (!descriptor) return { [parameter]: value as number }
  const updated = updateShowClipEffectParameter(effect, descriptor.id, value as number | string)
  if (effect.kind === 'color-map' && ['shadowColor', 'highlightColor'].includes(descriptor.id)) {
    const prefix = descriptor.id === 'shadowColor' ? 'shadow' : 'highlight'
    return Object.fromEntries(['R', 'G', 'B'].map(component => {
      const field = `${prefix}${component}`
      return [field, (updated as unknown as Record<string, number>)[field]]
    }))
  }
  const field = showClipEffectPersistedField(effect.kind, descriptor.id)
  return { [field]: (updated as unknown as Record<string, number | string>)[field] }
}

function effectReferenceIssue(record: ShowRecordV2): string | undefined {
  const effective = materializeShowGroupsV2(record)
  const clips = new Map(effective.composition.clips.map(clip => [clip.id, clip]))
  const check = (target: ShowPropertyTargetV2, startMs: number, endMs: number, owner: string): string | undefined => {
    if (target.kind !== 'clip-effect') return undefined
    const clip = clips.get(target.clipId)
    if (!clip) return `${owner} targets a missing Clip Effect.`
    for (const span of appearanceSpans(effective, clip)) {
      if (span.startMs >= endMs || span.endMs <= startMs) continue
      const effect = exactEffect(span.effects, target.effectId, target.effectKind)
      const descriptor = effect && showClipEffectParameters(effect).find(parameter => parameter.id === target.parameterId)
      if (!effect || descriptor?.kind !== 'number' || typeof showClipEffectParameterValue(effect, target.parameterId) !== 'number') {
        return `${owner} targets an unavailable numeric parameter "${target.parameterId}" on Clip "${clip.id}" Effect "${target.effectId}".`
      }
    }
    return undefined
  }
  for (const track of effective.composition.propertyTracks) {
    const issue = check(track.target, track.activeStartMs, track.activeStartMs + track.activeDurationMs, `Track "${track.id}"`)
    if (issue) return issue
  }
  for (const transition of effective.composition.transitions) {
    for (const [index, ramp] of transition.propertyRamps.entries()) {
      if (ramp.target.kind !== 'clip-effect') continue
      const participant = ramp.participantId === undefined ? transition.participants[0]
        : transition.participants.find(participant => participant.id === ramp.participantId)
      if (ramp.participantId !== undefined && !participant) return `Transition "${transition.id}" ramp ${index} targets a missing participant.`
      const outgoing = participant && clips.get(participant.fromClipId)
      const startMs = transition.wholeOutput?.startMs ?? (outgoing ? outgoing.startMs + outgoing.durationMs : 0)
      const issue = check(ramp.target, startMs, startMs + (ramp.durationMs ?? transition.durationMs), `Transition "${transition.id}" ramp ${index}`)
      if (issue) return issue
    }
  }
  return undefined
}
