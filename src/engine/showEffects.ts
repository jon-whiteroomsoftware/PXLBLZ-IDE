import type { ShowClipEffect } from './personalContentRecords'

export interface ShowAffineMatrix {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

export interface ShowEffectSample {
  x: number
  y: number
  opacity: number
  inside: boolean
  addressPolicy: 'clip' | 'wrap'
}

export type ShowRgb = [number, number, number]

const IDENTITY: ShowAffineMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

export function normalizeShowClipEffects(effects: readonly ShowClipEffect[] | null | undefined): ShowClipEffect[] {
  const ids = new Set<string>()
  return (effects ?? []).flatMap((effect, index): ShowClipEffect[] => {
    if (!effect || typeof effect !== 'object') return []
    const baseId = typeof effect.id === 'string' && effect.id.trim() ? effect.id.trim() : `effect-${index + 1}`
    let id = baseId
    let suffix = 2
    while (ids.has(id)) id = `${baseId}-${suffix++}`
    ids.add(id)
    if (effect.kind === 'opacity') return [{ id, kind: 'opacity' as const, opacity: clamp(effect.opacity, 0, 1, 1) }]
    if (effect.kind === 'brightness') return [{ id, kind: 'brightness' as const, brightness: clamp(effect.brightness, 0, 2, 1) }]
    if (effect.kind === 'hue') return [{ id, kind: 'hue' as const, turns: clamp(effect.turns, -8, 8, 0) }]
    if (effect.kind === 'saturation') return [{ id, kind: 'saturation' as const, saturation: clamp(effect.saturation, 0, 2, 1) }]
    if (effect.kind === 'contrast') return [{ id, kind: 'contrast' as const, contrast: clamp(effect.contrast, 0, 4, 1) }]
    if (effect.kind === 'invert') return [{ id, kind: 'invert' as const, amount: clamp(effect.amount, 0, 1, 0) }]
    if (effect.kind === 'threshold') return [{
      id, kind: 'threshold' as const,
      threshold: clamp(effect.threshold, 0, 1, 0.5), amount: clamp(effect.amount, 0, 1, 0),
    }]
    if (effect.kind === 'posterize') return [{
      id, kind: 'posterize' as const,
      levels: Math.round(clamp(effect.levels, 2, 32, 8)), amount: clamp(effect.amount, 0, 1, 0),
    }]
    if (effect.kind === 'color-map') return [{
      id, kind: 'color-map' as const, amount: clamp(effect.amount, 0, 1, 0),
      shadowR: clamp(effect.shadowR, 0, 1, 0), shadowG: clamp(effect.shadowG, 0, 1, 0), shadowB: clamp(effect.shadowB, 0, 1, 0),
      highlightR: clamp(effect.highlightR, 0, 1, 1), highlightG: clamp(effect.highlightG, 0, 1, 1), highlightB: clamp(effect.highlightB, 0, 1, 1),
    }]
    if (effect.kind === 'translate') return [{
      id, kind: 'translate' as const,
      x: clamp(effect.x, -2, 2, 0), y: clamp(effect.y, -2, 2, 0),
    }]
    if (effect.kind === 'rotate') return [{ id, kind: 'rotate' as const, turns: clamp(effect.turns, -8, 8, 0) }]
    if (effect.kind === 'scale') return [{
      id, kind: 'scale' as const,
      x: clamp(effect.x, 0.01, 8, 1), y: clamp(effect.y, 0.01, 8, 1),
    }]
    if (effect.kind === 'shear') return [{
      id, kind: 'shear' as const,
      x: clamp(effect.x, -4, 4, 0), y: clamp(effect.y, -4, 4, 0),
    }]
    if (effect.kind === 'wrap') return [{ id, kind: 'wrap' as const }]
    return []
  })
}

export function showEffectParameterNames(effect: ShowClipEffect): string[] {
  if (effect.kind === 'opacity') return ['opacity']
  if (effect.kind === 'brightness') return ['brightness']
  if (effect.kind === 'hue' || effect.kind === 'rotate') return ['turns']
  if (effect.kind === 'saturation') return ['saturation']
  if (effect.kind === 'contrast') return ['contrast']
  if (effect.kind === 'invert') return ['amount']
  if (effect.kind === 'threshold') return ['threshold', 'amount']
  if (effect.kind === 'posterize') return ['levels', 'amount']
  if (effect.kind === 'color-map') return ['amount', 'shadowR', 'shadowG', 'shadowB', 'highlightR', 'highlightG', 'highlightB']
  if (effect.kind === 'wrap') return []
  return ['x', 'y']
}

export function sameShowEffectStructure(a: readonly ShowClipEffect[] | undefined, b: readonly ShowClipEffect[] | undefined): boolean {
  const left = normalizeShowClipEffects(a)
  const right = normalizeShowClipEffects(b)
  return left.length === right.length && left.every((effect, index) => (
    effect.id === right[index].id && effect.kind === right[index].kind
  ))
}

export function showEffectsAreIdentity(effects: readonly ShowClipEffect[] | undefined): boolean {
  const normalized = normalizeShowClipEffects(effects)
  const hasAffine = normalized.some((effect) => (
    (effect.kind === 'translate' && (effect.x !== 0 || effect.y !== 0))
    || (effect.kind === 'rotate' && effect.turns !== 0)
    || (effect.kind === 'scale' && (effect.x !== 1 || effect.y !== 1))
    || (effect.kind === 'shear' && (effect.x !== 0 || effect.y !== 0))
  ))
  const hasOpacity = normalized.some((effect) => effect.kind === 'opacity' && effect.opacity !== 1)
  const hasColor = normalized.some((effect) => (
    (effect.kind === 'brightness' && effect.brightness !== 1)
    || (effect.kind === 'hue' && effect.turns !== 0)
    || (effect.kind === 'saturation' && effect.saturation !== 1)
    || (effect.kind === 'contrast' && effect.contrast !== 1)
    || (effect.kind === 'invert' && effect.amount !== 0)
    || (effect.kind === 'threshold' && effect.amount !== 0)
    || (effect.kind === 'posterize' && effect.amount !== 0)
    || (effect.kind === 'color-map' && effect.amount !== 0)
  ))
  return !hasAffine && !hasOpacity && !hasColor
}

export function isShowColorEffect(effect: ShowClipEffect): boolean {
  return !['translate', 'rotate', 'scale', 'shear', 'wrap'].includes(effect.kind)
}

export function showEffectNumericValue(effect: ShowClipEffect, parameter: string): number {
  if (parameter in effect && typeof (effect as unknown as Record<string, unknown>)[parameter] === 'number') {
    return (effect as unknown as Record<string, number>)[parameter]
  }
  throw new Error(`Effect "${effect.id}" has no numeric parameter "${parameter}".`)
}

export function applyShowColorEffects(
  effects: readonly ShowClipEffect[] | undefined,
  color: ShowRgb,
  legacyBrightness = 1,
): ShowRgb {
  let current: ShowRgb = color.map((channel) => channel * legacyBrightness) as ShowRgb
  for (const effect of normalizeShowClipEffects(effects)) {
    if (effect.kind === 'opacity') {
      current = current.map((channel) => channel * effect.opacity) as ShowRgb
    } else if (effect.kind === 'brightness') {
      current = current.map((channel) => clamp01(channel * effect.brightness)) as ShowRgb
    } else if (effect.kind === 'hue') {
      const matrix = showHueRotationMatrix(effect.turns)
      current = applyColorMatrix(current, matrix)
    } else if (effect.kind === 'saturation') {
      const luma = showColorLuma(current)
      current = current.map((channel) => clamp01(luma + (channel - luma) * effect.saturation)) as ShowRgb
    } else if (effect.kind === 'contrast') {
      current = current.map((channel) => clamp01((channel - 0.5) * effect.contrast + 0.5)) as ShowRgb
    } else if (effect.kind === 'invert') {
      current = current.map((channel) => channel * (1 - effect.amount) + (1 - channel) * effect.amount) as ShowRgb
    } else if (effect.kind === 'threshold') {
      const target = showColorLuma(current) >= effect.threshold ? 1 : 0
      current = current.map((channel) => channel * (1 - effect.amount) + target * effect.amount) as ShowRgb
    } else if (effect.kind === 'posterize') {
      const span = effect.levels - 1
      current = current.map((channel) => {
        const target = Math.floor(channel * span + 0.5) / span
        return channel * (1 - effect.amount) + target * effect.amount
      }) as ShowRgb
    } else if (effect.kind === 'color-map') {
      const luma = clamp01(showColorLuma(current))
      const mapped: ShowRgb = [
        effect.shadowR + (effect.highlightR - effect.shadowR) * luma,
        effect.shadowG + (effect.highlightG - effect.shadowG) * luma,
        effect.shadowB + (effect.highlightB - effect.shadowB) * luma,
      ]
      current = current.map((channel, index) => channel * (1 - effect.amount) + mapped[index] * effect.amount) as ShowRgb
    }
  }
  return current
}

export function showColorLuma([r, g, b]: ShowRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function showHueRotationMatrix(turns: number): readonly [number, number, number, number, number, number, number, number, number] {
  const radians = turns * Math.PI * 2
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const third = (1 - cosine) / 3
  const cross = sine / Math.sqrt(3)
  const diagonal = cosine + third
  return [
    diagonal, third - cross, third + cross,
    third + cross, diagonal, third - cross,
    third - cross, third + cross, diagonal,
  ]
}

function applyColorMatrix(color: ShowRgb, matrix: ReturnType<typeof showHueRotationMatrix>): ShowRgb {
  return [
    clamp01(matrix[0] * color[0] + matrix[1] * color[1] + matrix[2] * color[2]),
    clamp01(matrix[3] * color[0] + matrix[4] * color[1] + matrix[5] * color[2]),
    clamp01(matrix[6] * color[0] + matrix[7] * color[1] + matrix[8] * color[2]),
  ]
}

/**
 * Composes authored content transforms in list order, then returns the inverse
 * matrix used to sample that content at an output coordinate.
 */
export function buildShowEffectSampleMatrix(effects: readonly ShowClipEffect[] | undefined): ShowAffineMatrix {
  let forward = IDENTITY
  for (const effect of normalizeShowClipEffects(effects)) {
    const operation = effectMatrix(effect)
    if (operation) forward = multiply(operation, forward)
  }
  return invert(forward)
}

export function applyShowEffectsToSample(
  effects: readonly ShowClipEffect[] | undefined,
  x: number,
  y: number,
): ShowEffectSample {
  const normalized = normalizeShowClipEffects(effects)
  const matrix = buildShowEffectSampleMatrix(normalized)
  let mappedX = matrix.a * x + matrix.c * y + matrix.tx
  let mappedY = matrix.b * x + matrix.d * y + matrix.ty
  const inside = mappedX >= 0 && mappedX <= 1 && mappedY >= 0 && mappedY <= 1
  const wrap = normalized.some((effect) => effect.kind === 'wrap')
  if (wrap) {
    mappedX -= Math.floor(mappedX)
    mappedY -= Math.floor(mappedY)
  } else {
    mappedX = Math.max(0, Math.min(1, mappedX))
    mappedY = Math.max(0, Math.min(1, mappedY))
  }
  return {
    x: mappedX,
    y: mappedY,
    opacity: normalized.reduce((opacity, effect) => effect.kind === 'opacity' ? opacity * effect.opacity : opacity, 1),
    inside: wrap || inside,
    addressPolicy: wrap ? 'wrap' : 'clip',
  }
}

function effectMatrix(effect: ShowClipEffect): ShowAffineMatrix | null {
  if (effect.kind === 'translate') return { ...IDENTITY, tx: effect.x, ty: effect.y }
  if (effect.kind === 'rotate') {
    const radians = effect.turns * Math.PI * 2
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    return centered({ a: cosine, b: sine, c: -sine, d: cosine, tx: 0, ty: 0 })
  }
  if (effect.kind === 'scale') return centered({ a: effect.x, b: 0, c: 0, d: effect.y, tx: 0, ty: 0 })
  if (effect.kind === 'shear') return centered({ a: 1, b: effect.y, c: effect.x, d: 1, tx: 0, ty: 0 })
  return null
}

function centered(matrix: ShowAffineMatrix): ShowAffineMatrix {
  return {
    ...matrix,
    tx: 0.5 - matrix.a * 0.5 - matrix.c * 0.5,
    ty: 0.5 - matrix.b * 0.5 - matrix.d * 0.5,
  }
}

function multiply(left: ShowAffineMatrix, right: ShowAffineMatrix): ShowAffineMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    tx: left.a * right.tx + left.c * right.ty + left.tx,
    ty: left.b * right.tx + left.d * right.ty + left.ty,
  }
}

function invert(matrix: ShowAffineMatrix): ShowAffineMatrix {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  const safe = Math.abs(determinant) < 1e-6 ? (determinant < 0 ? -1e-6 : 1e-6) : determinant
  return {
    a: matrix.d / safe,
    b: -matrix.b / safe,
    c: -matrix.c / safe,
    d: matrix.a / safe,
    tx: (matrix.c * matrix.ty - matrix.d * matrix.tx) / safe,
    ty: (matrix.b * matrix.tx - matrix.a * matrix.ty) / safe,
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
