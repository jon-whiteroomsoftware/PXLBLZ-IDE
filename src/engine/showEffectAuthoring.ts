import type { ShowClipEffect } from './personalContentRecords'
import { colorValueToNormalizedRgb, normalizedRgbToColorValue, parseColorValue } from './colorValue'
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
  'opacity', 'brightness', 'hue', 'saturation', 'contrast', 'invert', 'threshold', 'luma-key', 'chroma-key', 'posterize', 'vignette', 'color-map',
])
const AFFINE_EFFECTS = new Set<ShowClipEffect['kind']>(['translate', 'rotate', 'scale', 'shear', 'wrap'])

export type ShowEffectApplication =
  | { target: 'effect-stack'; effect: ShowClipEffect }
  | { target: 'placement-mirror'; mirror: true }

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
  if (item.authoringTarget !== 'effect-stack') throw new Error(`${item.key} is not an ordered stack Effect.`)
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

export function createShowEffectApplication(
  item: ShowToolkitPresentationItem,
  effects: readonly ShowClipEffect[],
  presetId?: string,
): ShowEffectApplication {
  if (item.kind !== 'effect') throw new Error(`${item.key} is not a static Effect.`)
  if (item.authoringTarget === 'placement-mirror') {
    return { target: 'placement-mirror', mirror: true }
  }
  const id = nextShowEffectId(effects, item.variantId)
  return { target: 'effect-stack', effect: createShowClipEffect(item, id, presetId) }
}

export function showClipEffectParameters(effect: ShowClipEffect): ShowToolkitParameterDescriptor[] {
  const familyId = familyIdForKind(effect.kind)
  const values = Object.fromEntries(
    SHOW_VISUAL_TOOLKIT_REGISTRY
      .find((family) => family.kind === 'effect' && family.id === familyId)
      ?.parameters.map((parameter) => [parameter.id, showClipEffectParameterValue(effect, parameter.id)]) ?? [],
  ) as Record<string, ShowToolkitParameterValue>
  return resolveShowToolkitParameters('effect', familyId, effect.kind, values)
    .filter((parameter) => (parameter.kind === 'number' || parameter.kind === 'color') && parameter.id !== 'durationMs')
}

export function showClipEffectParameterValue(
  effect: ShowClipEffect,
  parameterId: string,
): ShowToolkitParameterValue {
  if (effect.kind === 'color-map') {
    if (parameterId === 'shadowColor') {
      return normalizedRgbToColorValue([effect.shadowR, effect.shadowG, effect.shadowB])
    }
    if (parameterId === 'highlightColor') {
      return normalizedRgbToColorValue([effect.highlightR, effect.highlightG, effect.highlightB])
    }
  }
  const field = showClipEffectPersistedField(effect.kind, parameterId)
  const value = (effect as unknown as Record<string, ShowToolkitParameterValue>)[field]
  return value ?? 0
}

export function updateShowClipEffectParameter(
  effect: ShowClipEffect,
  parameterId: string,
  value: ShowToolkitParameterValue,
): ShowClipEffect {
  if (effect.kind === 'color-map' && (parameterId === 'shadowColor' || parameterId === 'highlightColor')) {
    const color = parseColorValue(value)
    if (!color) return effect
    const [red, green, blue] = colorValueToNormalizedRgb(color)
    const prefix = parameterId === 'shadowColor' ? 'shadow' : 'highlight'
    return normalizeShowClipEffects([{
      ...effect,
      [`${prefix}R`]: red,
      [`${prefix}G`]: green,
      [`${prefix}B`]: blue,
      id: effect.id,
    } as ShowClipEffect])[0] ?? effect
  }
  const field = showClipEffectPersistedField(effect.kind, parameterId)
  return normalizeShowClipEffects([{
    ...effect,
    [field]: value,
    id: effect.id,
  } as ShowClipEffect])[0] ?? effect
}

export function showClipEffectPersistedField(kind: ShowClipEffect['kind'], parameterId: string): string {
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

export function moveShowClipEffectToStagePosition(
  effects: readonly ShowClipEffect[],
  effectId: string,
  targetEffectId: string,
  edge: 'before' | 'after',
): ShowClipEffect[] {
  const normalized = normalizeShowClipEffects(effects)
  if (effectId === targetEffectId) return normalized
  const effect = normalized.find((candidate) => candidate.id === effectId)
  const target = normalized.find((candidate) => candidate.id === targetEffectId)
  if (!effect || !target || showClipEffectStage(effect) !== showClipEffectStage(target)) return normalized

  const stage = showClipEffectStage(effect)
  const siblingIndexes = normalized.flatMap((candidate, index) => (
    showClipEffectStage(candidate) === stage ? [index] : []
  ))
  const siblings = siblingIndexes.map((index) => normalized[index])
  const sourceIndex = siblings.findIndex((candidate) => candidate.id === effectId)
  siblings.splice(sourceIndex, 1)
  const targetIndex = siblings.findIndex((candidate) => candidate.id === targetEffectId)
  siblings.splice(targetIndex + (edge === 'after' ? 1 : 0), 0, effect)

  const next = [...normalized]
  siblingIndexes.forEach((index, siblingIndex) => {
    next[index] = siblings[siblingIndex]
  })
  return next
}
