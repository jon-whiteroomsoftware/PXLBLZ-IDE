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
  if (effect.kind === 'rotate') return ['turns']
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
  return !hasAffine && !hasOpacity
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
