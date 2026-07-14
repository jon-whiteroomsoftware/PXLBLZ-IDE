import type {
  ShowClipEffect,
  ShowMotionAddressPolicy,
  ShowMotionSpinDirection,
  ShowMotionTransitionVariant,
  ShowTransitionEdgePolicy,
} from './personalContentRecords'
import { applyShowEffectsToSample, type ShowEffectSample } from './showEffects'

export interface ShowMotionTransitionSettings {
  motionVariant?: ShowMotionTransitionVariant
  direction?: number
  anchorX?: number
  anchorY?: number
  contentScale?: number
  rotation?: number
  spinDirection?: ShowMotionSpinDirection
  addressPolicy?: ShowMotionAddressPolicy
  edgePolicy?: ShowTransitionEdgePolicy
}

export interface NormalizedShowMotionTransition {
  motionVariant: ShowMotionTransitionVariant
  direction: number
  anchorX: number
  anchorY: number
  contentScale: number
  rotation: number
  spinDirection: ShowMotionSpinDirection
  addressPolicy: ShowMotionAddressPolicy
  edgePolicy: 'hard' | 'blend'
}

export interface ShowMotionTransitionSamples {
  outgoing: ShowEffectSample
  incoming: ShowEffectSample
  pick: 'outgoing' | 'incoming' | 'blend'
}

export function normalizeShowMotionTransition(
  settings: ShowMotionTransitionSettings,
): NormalizedShowMotionTransition {
  const variants: ShowMotionTransitionVariant[] = [
    'cover', 'reveal', 'push', 'content-grow', 'content-shrink', 'zoom-in', 'zoom-out',
  ]
  return {
    motionVariant: variants.includes(settings.motionVariant as ShowMotionTransitionVariant)
      ? settings.motionVariant as ShowMotionTransitionVariant
      : 'cover',
    direction: modulo(finite(settings.direction, 0), 1),
    anchorX: clamp(finite(settings.anchorX, 0.5), 0, 1),
    anchorY: clamp(finite(settings.anchorY, 0.5), 0, 1),
    contentScale: clamp(finite(settings.contentScale, 0.01), 0.01, 1),
    rotation: clamp(Math.abs(finite(settings.rotation, 0)), 0, 8),
    spinDirection: settings.spinDirection === 'counterclockwise' ? 'counterclockwise' : 'clockwise',
    addressPolicy: settings.addressPolicy === 'wrap' ? 'wrap' : 'clip',
    edgePolicy: settings.edgePolicy === 'blend' ? 'blend' : 'hard',
  }
}

/**
 * Returns ordinary clip Effects so motion and authored Effects share exactly
 * the same affine composition and address semantics.
 */
export function showMotionTransitionEffects(
  settings: ShowMotionTransitionSettings,
  progress: number,
): { outgoing: ShowClipEffect[]; incoming: ShowClipEffect[] } {
  const normalized = normalizeShowMotionTransition(settings)
  const mix = clamp(finite(progress, 0), 0, 1)
  const vector = showMotionTransitionVector(normalized.direction)
  const translate = (id: string, amount: number): ShowClipEffect => ({
    id,
    kind: 'translate',
    x: canonicalZero(vector.x * amount),
    y: canonicalZero(vector.y * amount),
  })
  const address = (id: string): ShowClipEffect[] => (
    normalized.addressPolicy === 'wrap' ? [{ id, kind: 'wrap' }] : []
  )
  if (normalized.motionVariant === 'cover') {
    return {
      outgoing: [],
      incoming: [translate('motion-translate', -(1 - mix)), ...address('motion-wrap')],
    }
  }
  if (normalized.motionVariant === 'reveal') {
    return {
      outgoing: [translate('motion-translate', mix), ...address('motion-wrap')],
      incoming: [],
    }
  }
  if (normalized.motionVariant === 'push') {
    return {
      outgoing: [translate('motion-translate', mix), ...address('motion-wrap')],
      incoming: [translate('motion-translate', -(1 - mix)), ...address('motion-wrap')],
    }
  }
  const grows = normalized.motionVariant === 'content-grow' || normalized.motionVariant === 'zoom-in'
  const scale = grows
    ? normalized.contentScale * (1 - mix) + mix
    : (1 - mix) + normalized.contentScale * mix
  const rotation = normalized.motionVariant === 'zoom-in'
    ? signedRotation(normalized) * (1 - mix)
    : normalized.motionVariant === 'zoom-out'
      ? signedRotation(normalized) * mix
      : 0
  const scaled = contentAffineEffects(
    scale, rotation, normalized.anchorX, normalized.anchorY, normalized.addressPolicy,
  )
  return grows
    ? { outgoing: [], incoming: scaled }
    : { outgoing: scaled, incoming: [] }
}

export function sampleShowMotionTransition(
  settings: ShowMotionTransitionSettings,
  progress: number,
  x: number,
  y: number,
): ShowMotionTransitionSamples {
  const normalized = normalizeShowMotionTransition(settings)
  const effects = showMotionTransitionEffects(normalized, progress)
  const outgoing = applyShowEffectsToSample(effects.outgoing, x, y)
  const incoming = applyShowEffectsToSample(effects.incoming, x, y)
  if (normalized.edgePolicy === 'blend') return { outgoing, incoming, pick: 'blend' }
  const transformedIncoming = normalized.motionVariant === 'cover'
    || normalized.motionVariant === 'push'
    || normalized.motionVariant === 'content-grow'
    || normalized.motionVariant === 'zoom-in'
  return {
    outgoing,
    incoming,
    pick: transformedIncoming
      ? incoming.inside ? 'incoming' : 'outgoing'
      : outgoing.inside ? 'outgoing' : 'incoming',
  }
}

export function showMotionTransitionVector(direction: number): { x: number; y: number } {
  const radians = modulo(direction, 1) * Math.PI * 2
  const unitX = Math.cos(radians)
  const unitY = Math.sin(radians)
  const stageProjectionSpan = Math.abs(unitX) + Math.abs(unitY)
  return { x: unitX * stageProjectionSpan, y: unitY * stageProjectionSpan }
}

function contentAffineEffects(
  scale: number,
  rotation: number,
  anchorX: number,
  anchorY: number,
  addressPolicy: ShowMotionAddressPolicy,
): ShowClipEffect[] {
  const effects: ShowClipEffect[] = [
    { id: 'motion-scale', kind: 'scale', x: scale, y: scale },
    { id: 'motion-rotate', kind: 'rotate', turns: canonicalZero(rotation) },
    {
      id: 'motion-anchor',
      kind: 'translate',
      ...anchorCompensation(scale, rotation, anchorX, anchorY),
    },
  ]
  if (addressPolicy === 'wrap') effects.push({ id: 'motion-wrap', kind: 'wrap' })
  return effects
}

function signedRotation(settings: NormalizedShowMotionTransition): number {
  return settings.spinDirection === 'counterclockwise' ? -settings.rotation : settings.rotation
}

function anchorCompensation(
  scale: number,
  rotation: number,
  anchorX: number,
  anchorY: number,
): { x: number; y: number } {
  const radians = rotation * Math.PI * 2
  const cosine = Math.cos(radians) * scale
  const sine = Math.sin(radians) * scale
  const dx = anchorX - 0.5
  const dy = anchorY - 0.5
  return {
    x: canonicalZero(dx - (cosine * dx - sine * dy)),
    y: canonicalZero(dy - (sine * dx + cosine * dy)),
  }
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value as number : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function canonicalZero(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value
}
