import type { ShowClipEffect } from './personalContentRecords'
import { normalizeShowClipEffects } from './showEffects'
import {
  SHOW_VISUAL_TOOLKIT_REGISTRY,
  resolveShowToolkitParameters,
  type ShowToolkitParameterDescriptor,
  type ShowToolkitParameterValue,
} from './showVisualToolkit'
import type {
  ShowEffectPipelineStage,
  ShowToolkitPresentationItem,
} from './showVisualToolkitPresentation'

const OUTPUT_EFFECTS = new Set<ShowClipEffect['kind']>([
  'opacity', 'brightness', 'hue', 'saturation', 'contrast', 'invert', 'threshold', 'posterize', 'color-map',
])
const AFFINE_EFFECTS = new Set<ShowClipEffect['kind']>(['translate', 'rotate', 'scale', 'shear', 'wrap'])

function familyIdForKind(kind: ShowClipEffect['kind']): 'output' | 'affine' | 'distortion' {
  if (OUTPUT_EFFECTS.has(kind)) return 'output'
  if (AFFINE_EFFECTS.has(kind)) return 'affine'
  return 'distortion'
}

export function showClipEffectPresentationKey(effect: Pick<ShowClipEffect, 'kind'>): string {
  return `effect:${familyIdForKind(effect.kind)}:${effect.kind}`
}

export function showClipEffectStage(effect: Pick<ShowClipEffect, 'kind'>): ShowEffectPipelineStage {
  const familyId = familyIdForKind(effect.kind)
  if (familyId === 'distortion') return 'distort'
  if (familyId === 'output') return 'color-output'
  return effect.kind === 'wrap' ? 'address' : 'transform'
}

export function createShowClipEffect(
  item: ShowToolkitPresentationItem,
  id: string,
  presetId?: string,
): ShowClipEffect {
  if (item.kind !== 'effect') throw new Error(`${item.key} is not a static Effect.`)
  const initial = normalizeShowClipEffects([{ id, kind: item.variantId } as ShowClipEffect])[0]
  if (!initial) throw new Error(`Unsupported Show Effect ${item.variantId}.`)
  const family = SHOW_VISUAL_TOOLKIT_REGISTRY.find((candidate) => (
    candidate.kind === 'effect' && candidate.id === item.familyId
  ))
  const variant = family?.variants.find((candidate) => candidate.id === item.variantId)
  const preset = variant?.presets?.find((candidate) => candidate.id === presetId)
  return Object.entries(preset?.values ?? {}).reduce(
    (effect, [parameterId, value]) => updateShowClipEffectParameter(effect, parameterId, value),
    initial,
  )
}

export function showClipEffectParameters(effect: ShowClipEffect): ShowToolkitParameterDescriptor[] {
  const familyId = familyIdForKind(effect.kind)
  const values = Object.fromEntries(
    SHOW_VISUAL_TOOLKIT_REGISTRY
      .find((family) => family.kind === 'effect' && family.id === familyId)
      ?.parameters.map((parameter) => [parameter.id, showClipEffectParameterValue(effect, parameter.id)]) ?? [],
  ) as Record<string, ShowToolkitParameterValue>
  return resolveShowToolkitParameters('effect', familyId, effect.kind, values)
    .filter((parameter) => parameter.kind === 'number' && parameter.id !== 'durationMs')
}

export function showClipEffectParameterValue(
  effect: ShowClipEffect,
  parameterId: string,
): ShowToolkitParameterValue {
  const field = persistedField(effect.kind, parameterId)
  const value = (effect as unknown as Record<string, ShowToolkitParameterValue>)[field]
  return value ?? 0
}

export function updateShowClipEffectParameter(
  effect: ShowClipEffect,
  parameterId: string,
  value: ShowToolkitParameterValue,
): ShowClipEffect {
  const field = persistedField(effect.kind, parameterId)
  return normalizeShowClipEffects([{
    ...effect,
    [field]: value,
    id: effect.id,
  } as ShowClipEffect])[0] ?? effect
}

function persistedField(kind: ShowClipEffect['kind'], parameterId: string): string {
  if (kind === 'translate') {
    if (parameterId === 'translateX') return 'x'
    if (parameterId === 'translateY') return 'y'
  }
  if (kind === 'scale') {
    if (parameterId === 'scaleX') return 'x'
    if (parameterId === 'scaleY') return 'y'
  }
  if (kind === 'shear') {
    if (parameterId === 'shearX') return 'x'
    if (parameterId === 'shearY') return 'y'
  }
  return parameterId
}

export function nextShowEffectId(effects: readonly ShowClipEffect[], baseId: string): string {
  const ids = new Set(effects.map((effect) => effect.id))
  if (!ids.has(baseId)) return baseId
  let suffix = 2
  while (ids.has(`${baseId}-${suffix}`)) suffix += 1
  return `${baseId}-${suffix}`
}

export function duplicateShowClipEffect(
  effects: readonly ShowClipEffect[],
  effectId: string,
): ShowClipEffect[] {
  const normalized = normalizeShowClipEffects(effects)
  const index = normalized.findIndex((effect) => effect.id === effectId)
  if (index < 0) return normalized
  const source = normalized[index]
  const copy = { ...source, id: nextShowEffectId(normalized, source.id) } as ShowClipEffect
  return [...normalized.slice(0, index + 1), copy, ...normalized.slice(index + 1)]
}

export function moveShowClipEffectWithinStage(
  effects: readonly ShowClipEffect[],
  effectId: string,
  direction: -1 | 1,
): ShowClipEffect[] {
  const normalized = normalizeShowClipEffects(effects)
  const index = normalized.findIndex((effect) => effect.id === effectId)
  if (index < 0) return normalized
  const stage = showClipEffectStage(normalized[index])
  const siblingIndexes = normalized.flatMap((effect, candidateIndex) => (
    showClipEffectStage(effect) === stage ? [candidateIndex] : []
  ))
  const siblingIndex = siblingIndexes.indexOf(index)
  const targetIndex = siblingIndexes[siblingIndex + direction]
  if (targetIndex === undefined) return normalized
  const next = [...normalized]
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  return next
}
