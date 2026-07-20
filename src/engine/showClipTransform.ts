import type { ShowClipEffect, ShowClipTransform } from './personalContentRecords'

export const SHOW_CLIP_TRANSFORM_EFFECT_IDS = {
  scale: 'pxlblz-clip-transform-scale',
  rotation: 'pxlblz-clip-transform-rotation',
  position: 'pxlblz-clip-transform-position',
} as const

export type ShowClipTransformProperty = keyof ShowClipTransform

export function showClipTransformEffectTarget(property: ShowClipTransformProperty): {
  effectId: string
  effectKind: 'translate' | 'rotate' | 'scale'
  parameter: 'x' | 'y' | 'turns'
} {
  if (property === 'positionX') return { effectId: SHOW_CLIP_TRANSFORM_EFFECT_IDS.position, effectKind: 'translate', parameter: 'x' }
  if (property === 'positionY') return { effectId: SHOW_CLIP_TRANSFORM_EFFECT_IDS.position, effectKind: 'translate', parameter: 'y' }
  if (property === 'rotation') return { effectId: SHOW_CLIP_TRANSFORM_EFFECT_IDS.rotation, effectKind: 'rotate', parameter: 'turns' }
  if (property === 'scaleX') return { effectId: SHOW_CLIP_TRANSFORM_EFFECT_IDS.scale, effectKind: 'scale', parameter: 'x' }
  return { effectId: SHOW_CLIP_TRANSFORM_EFFECT_IDS.scale, effectKind: 'scale', parameter: 'y' }
}

export const NEUTRAL_SHOW_CLIP_TRANSFORM: Readonly<ShowClipTransform> = Object.freeze({
  positionX: 0,
  positionY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
})

export function normalizeShowClipTransform(transform: Partial<ShowClipTransform> | undefined): ShowClipTransform {
  return {
    positionX: clamp(transform?.positionX, -4, 4, 0),
    positionY: clamp(transform?.positionY, -4, 4, 0),
    rotation: clamp(transform?.rotation, -8, 8, 0),
    scaleX: clamp(transform?.scaleX, 0.01, 8, 1),
    scaleY: clamp(transform?.scaleY, 0.01, 8, 1),
  }
}

export function compactShowClipTransform(
  transform: Partial<ShowClipTransform> | undefined,
): ShowClipTransform | undefined {
  const normalized = normalizeShowClipTransform(transform)
  return isNeutralShowClipTransform(normalized) ? undefined : normalized
}

export function isNeutralShowClipTransform(transform: ShowClipTransform): boolean {
  return transform.positionX === 0
    && transform.positionY === 0
    && transform.rotation === 0
    && transform.scaleX === 1
    && transform.scaleY === 1
}

/**
 * Lower the canonical pose into the existing affine pipeline. The fixed order
 * is scale, rotation, position, then the user's ordered Effects.
 */
export function showClipTransformEffects(
  transform: Partial<ShowClipTransform> | undefined,
  effects: readonly ShowClipEffect[] | undefined,
  includeNeutral = false,
): ShowClipEffect[] {
  const normalized = normalizeShowClipTransform(transform)
  const canonical: ShowClipEffect[] = [
    { id: SHOW_CLIP_TRANSFORM_EFFECT_IDS.scale, kind: 'scale', x: normalized.scaleX, y: normalized.scaleY },
    { id: SHOW_CLIP_TRANSFORM_EFFECT_IDS.rotation, kind: 'rotate', turns: normalized.rotation },
    { id: SHOW_CLIP_TRANSFORM_EFFECT_IDS.position, kind: 'translate', x: normalized.positionX, y: normalized.positionY },
  ]
  return [
    ...(includeNeutral ? canonical : canonical.filter((effect) => {
      if (effect.kind === 'scale') return effect.x !== 1 || effect.y !== 1
      if (effect.kind === 'rotate') return effect.turns !== 0
      return effect.kind !== 'translate' || effect.x !== 0 || effect.y !== 0
    })),
    ...(effects ?? []),
  ]
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}
