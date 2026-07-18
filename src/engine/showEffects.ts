import type { ShowClipEffect } from './personalContentRecords'
import { normalizeShowTransitionColor, showTransitionColorToRgb } from './showFadeThroughColor'

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
    if (effect.kind === 'luma-key') return [{
      id, kind: 'luma-key' as const,
      target: clamp(effect.target, 0, 1, 0),
      tolerance: clamp(effect.tolerance, 0, 1, 0.05),
      softness: clamp(effect.softness, 0, 1, 0.05),
    }]
    if (effect.kind === 'chroma-key') return [{
      id, kind: 'chroma-key' as const,
      color: typeof effect.color === 'string' ? normalizeShowTransitionColor(effect.color) : '#00ff00',
      tolerance: clamp(effect.tolerance, 0, 1, 0.05),
      softness: clamp(effect.softness, 0, 1, 0.05),
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
    if (effect.kind === 'ripple') return [{
      id, kind: 'ripple' as const,
      amount: clamp(effect.amount, -0.5, 0.5, 0), frequency: clamp(effect.frequency, 1, 32, 8),
      phase: clamp(effect.phase, -8, 8, 0), centerX: clamp(effect.centerX, 0, 1, 0.5), centerY: clamp(effect.centerY, 0, 1, 0.5),
    }]
    if (effect.kind === 'swirl') return [{
      id, kind: 'swirl' as const,
      amount: clamp(effect.amount, -4, 4, 0), radius: clamp(effect.radius, 0.05, 2, 0.7),
      centerX: clamp(effect.centerX, 0, 1, 0.5), centerY: clamp(effect.centerY, 0, 1, 0.5),
    }]
    if (effect.kind === 'bulge') return [{
      id, kind: 'bulge' as const,
      amount: clamp(effect.amount, -0.95, 2, 0), radius: clamp(effect.radius, 0.05, 2, 0.7),
      centerX: clamp(effect.centerX, 0, 1, 0.5), centerY: clamp(effect.centerY, 0, 1, 0.5),
    }]
    if (effect.kind === 'pixelate') return [{
      id, kind: 'pixelate' as const, amount: clamp(effect.amount, 0, 1, 0),
      columns: Math.round(clamp(effect.columns, 1, 128, 12)), rows: Math.round(clamp(effect.rows, 1, 128, 12)),
    }]
    if (effect.kind === 'kaleidoscope') return [{
      id, kind: 'kaleidoscope' as const, amount: clamp(effect.amount, 0, 1, 0),
      segments: Math.round(clamp(effect.segments, 2, 16, 6)), rotation: clamp(effect.rotation, -8, 8, 0),
      centerX: clamp(effect.centerX, 0, 1, 0.5), centerY: clamp(effect.centerY, 0, 1, 0.5),
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
  if (effect.kind === 'luma-key') return ['target', 'tolerance', 'softness']
  if (effect.kind === 'chroma-key') return ['tolerance', 'softness']
  if (effect.kind === 'posterize') return ['levels', 'amount']
  if (effect.kind === 'color-map') return ['amount', 'shadowR', 'shadowG', 'shadowB', 'highlightR', 'highlightG', 'highlightB']
  if (effect.kind === 'ripple') return ['amount', 'frequency', 'phase', 'centerX', 'centerY']
  if (effect.kind === 'swirl' || effect.kind === 'bulge') return ['amount', 'radius', 'centerX', 'centerY']
  if (effect.kind === 'pixelate') return ['amount', 'columns', 'rows']
  if (effect.kind === 'kaleidoscope') return ['amount', 'segments', 'rotation', 'centerX', 'centerY']
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
  const hasDistortion = normalized.some((effect) => isShowDistortionEffect(effect) && effect.amount !== 0)
  const hasColor = normalized.some((effect) => (
    (effect.kind === 'brightness' && effect.brightness !== 1)
    || (effect.kind === 'hue' && effect.turns !== 0)
    || (effect.kind === 'saturation' && effect.saturation !== 1)
    || (effect.kind === 'contrast' && effect.contrast !== 1)
    || (effect.kind === 'invert' && effect.amount !== 0)
    || (effect.kind === 'threshold' && effect.amount !== 0)
    || effect.kind === 'luma-key'
    || effect.kind === 'chroma-key'
    || (effect.kind === 'posterize' && effect.amount !== 0)
    || (effect.kind === 'color-map' && effect.amount !== 0)
  ))
  return !hasAffine && !hasDistortion && !hasOpacity && !hasColor
}

export function isShowColorEffect(effect: ShowClipEffect): boolean {
  return ['opacity', 'brightness', 'hue', 'saturation', 'contrast', 'invert', 'threshold', 'luma-key', 'chroma-key', 'posterize', 'color-map'].includes(effect.kind)
}

export function isShowDistortionEffect(effect: ShowClipEffect): effect is Extract<ShowClipEffect, { amount: number }> {
  return ['ripple', 'swirl', 'bulge', 'pixelate', 'kaleidoscope'].includes(effect.kind)
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
  return applyShowOutputEffects(effects, color, legacyBrightness).color
}

export interface ShowOutputEffectResult {
  color: ShowRgb
  opacity: number
}

export function applyShowOutputEffects(
  effects: readonly ShowClipEffect[] | undefined,
  color: ShowRgb,
  legacyBrightness = 1,
): ShowOutputEffectResult {
  let current: ShowRgb = color.map((channel) => channel * legacyBrightness) as ShowRgb
  let opacity = 1
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
    } else if (effect.kind === 'luma-key') {
      const distance = Math.abs(showColorLuma(current) - effect.target)
      opacity *= featheredKeyOpacity(distance, effect.tolerance, effect.softness)
    } else if (effect.kind === 'chroma-key') {
      const target = showTransitionColorToRgb(effect.color)
      const dr = current[0] - target[0]
      const dg = current[1] - target[1]
      const db = current[2] - target[2]
      const meanSquaredDistance = (dr * dr + dg * dg + db * db) / 3
      opacity *= featheredSquaredKeyOpacity(meanSquaredDistance, effect.tolerance, effect.softness)
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
  return { color: current, opacity }
}

function featheredKeyOpacity(distance: number, tolerance: number, softness: number): number {
  if (softness <= 0) return distance <= tolerance ? 0 : 1
  return clamp01((distance - tolerance) / softness)
}

function featheredSquaredKeyOpacity(distanceSquared: number, tolerance: number, softness: number): number {
  const inner = tolerance * tolerance
  if (softness <= 0) return distanceSquared <= inner ? 0 : 1
  const outer = Math.min(1, tolerance + softness)
  const outerSquared = outer * outer
  return clamp01((distanceSquared - inner) / Math.max(0.000001, outerSquared - inner))
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
  for (const effect of normalized) {
    if (!isShowDistortionEffect(effect) || effect.amount === 0) continue
    ;[mappedX, mappedY] = applyDistortion(effect, mappedX, mappedY)
  }
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

function applyDistortion(
  effect: Extract<ShowClipEffect, { amount: number }>,
  x: number,
  y: number,
): [number, number] {
  if (effect.kind === 'ripple') {
    const dx = x - effect.centerX
    const dy = y - effect.centerY
    const radius = Math.hypot(dx, dy)
    if (radius <= 0.000001) return [x, y]
    const offset = effect.amount * Math.sin((radius * effect.frequency + effect.phase) * Math.PI * 2)
    return [x + dx * offset / radius, y + dy * offset / radius]
  }
  if (effect.kind === 'swirl') {
    const dx = x - effect.centerX
    const dy = y - effect.centerY
    const radius = Math.hypot(dx, dy)
    const falloff = Math.max(0, 1 - radius / effect.radius)
    const angle = effect.amount * falloff * falloff * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    return [
      effect.centerX + dx * cosine - dy * sine,
      effect.centerY + dx * sine + dy * cosine,
    ]
  }
  if (effect.kind === 'bulge') {
    const dx = x - effect.centerX
    const dy = y - effect.centerY
    const radius = Math.hypot(dx, dy)
    const falloff = Math.max(0, 1 - radius / effect.radius)
    const scale = Math.max(0.05, 1 + effect.amount * falloff * falloff)
    return [effect.centerX + dx / scale, effect.centerY + dy / scale]
  }
  if (effect.kind === 'pixelate') {
    const targetX = (Math.min(effect.columns - 1, Math.floor(clamp01(x) * effect.columns)) + 0.5) / effect.columns
    const targetY = (Math.min(effect.rows - 1, Math.floor(clamp01(y) * effect.rows)) + 0.5) / effect.rows
    return [x + (targetX - x) * effect.amount, y + (targetY - y) * effect.amount]
  }
  if (effect.kind === 'kaleidoscope') {
    const dx = x - effect.centerX
    const dy = y - effect.centerY
    const radius = Math.hypot(dx, dy)
    const sectorTurn = positiveFraction((Math.atan2(dy, dx) / (Math.PI * 2) + effect.rotation) * effect.segments)
    const foldedAngle = Math.abs(sectorTurn - 0.5) / effect.segments * Math.PI * 2
    const targetX = effect.centerX + radius * Math.cos(foldedAngle)
    const targetY = effect.centerY + radius * Math.sin(foldedAngle)
    return [x + (targetX - x) * effect.amount, y + (targetY - y) * effect.amount]
  }
  return [x, y]
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

function positiveFraction(value: number): number {
  return value - Math.floor(value)
}
