import type {
  ShowWipeMode,
  ShowWipeOrientation,
  ShowWipeVariant,
} from './personalContentRecords'

const TAU = Math.PI * 2
const CARDINAL_EPSILON = 1e-12

export interface ShowWipeProjectionCoefficients {
  direction: number
  x: number
  y: number
  minimum: number
  span: number
}

export interface ShowWipeSettings {
  wipeVariant?: ShowWipeVariant
  wipeMode?: ShowWipeMode
  orientation?: ShowWipeOrientation
  direction?: number
  count?: number
  centerX?: number
  centerY?: number
  phase?: number
  clockwise?: boolean
}

export interface NormalizedShowWipeSettings {
  wipeVariant: ShowWipeVariant
  wipeMode: ShowWipeMode
  orientation: ShowWipeOrientation
  direction: number
  count: number
  centerX: number
  centerY: number
  phase: number
  clockwise: boolean
}

export function normalizeShowWipeDirection(direction: number): number {
  if (!Number.isFinite(direction)) return 0
  return direction - Math.floor(direction)
}

export function showWipeProjectionCoefficients(direction: number): ShowWipeProjectionCoefficients {
  const normalized = normalizeShowWipeDirection(direction)
  const x = canonicalComponent(Math.cos(normalized * TAU))
  const y = canonicalComponent(Math.sin(normalized * TAU))
  const minimum = Math.min(0, x) + Math.min(0, y)
  return { direction: normalized, x, y, minimum, span: Math.abs(x) + Math.abs(y) }
}

export function projectShowWipePosition(x: number, y: number, direction: number): number {
  const projection = showWipeProjectionCoefficients(direction)
  return (x * projection.x + y * projection.y - projection.minimum) / projection.span
}

export function normalizeShowWipeSettings(settings: ShowWipeSettings): NormalizedShowWipeSettings {
  const variants: ShowWipeVariant[] = ['linear', 'split', 'barn-doors', 'blinds', 'clock', 'checker', 'grid']
  return {
    wipeVariant: variants.includes(settings.wipeVariant as ShowWipeVariant)
      ? settings.wipeVariant as ShowWipeVariant
      : 'linear',
    wipeMode: settings.wipeMode === 'center-in' ? 'center-in' : 'center-out',
    orientation: settings.orientation === 'horizontal' ? 'horizontal' : 'vertical',
    direction: normalizeShowWipeDirection(settings.direction ?? 0),
    count: Math.max(1, Math.min(32, Math.round(finite(settings.count, 8)))),
    centerX: clamp(finite(settings.centerX, 0.5), 0, 1),
    centerY: clamp(finite(settings.centerY, 0.5), 0, 1),
    phase: normalizeShowWipeDirection(settings.phase ?? 0),
    clockwise: settings.clockwise !== false,
  }
}

export function showWipeMaskPosition(settings: ShowWipeSettings, x: number, y: number): number {
  const normalized = normalizeShowWipeSettings(settings)
  if (normalized.wipeVariant === 'linear') return projectShowWipePosition(x, y, normalized.direction)
  if (normalized.wipeVariant === 'split') {
    const axis = normalized.orientation === 'horizontal' ? y : x
    const distance = Math.min(1, Math.abs(axis - 0.5) * 2)
    return normalized.wipeMode === 'center-in' ? 1 - distance : distance
  }
  if (normalized.wipeVariant === 'barn-doors') {
    const spanX = Math.max(normalized.centerX, 1 - normalized.centerX, 1e-6)
    const spanY = Math.max(normalized.centerY, 1 - normalized.centerY, 1e-6)
    const distance = Math.min(1, Math.max(
      Math.abs(x - normalized.centerX) / spanX,
      Math.abs(y - normalized.centerY) / spanY,
    ))
    return normalized.wipeMode === 'center-in' ? 1 - distance : distance
  }
  if (normalized.wipeVariant === 'blinds') {
    const axis = normalized.orientation === 'horizontal' ? y : x
    return modulo(axis * normalized.count + normalized.phase, 1)
  }
  if (normalized.wipeVariant === 'clock') {
    const angle = Math.atan2(y - normalized.centerY, x - normalized.centerX) / TAU
    return modulo((normalized.clockwise ? angle : -angle) - normalized.phase, 1)
  }
  const cellX = x * normalized.count
  const cellY = y * normalized.count
  const localX = modulo(cellX, 1)
  const localY = modulo(cellY, 1)
  if (normalized.wipeVariant === 'checker') {
    const parity = modulo(Math.floor(cellX) + Math.floor(cellY), 2)
    return (parity + localX) / 2
  }
  return Math.min(1, Math.max(Math.abs(localX - 0.5), Math.abs(localY - 0.5)) * 2)
}

/** Emits the same normalized scalar used by the pure mask evaluator. */
export function showWipeMaskPositionExpression(
  settings: ShowWipeSettings,
  outputDimension: 1 | 2,
): string {
  if (outputDimension !== 2 || (settings.wipeVariant === undefined && settings.direction === undefined)) {
    return 'index / pixelCount'
  }
  const normalized = normalizeShowWipeSettings(settings)
  if (normalized.wipeVariant === 'linear') {
    const projection = showWipeProjectionCoefficients(normalized.direction)
    return `((x * ${projection.x} + y * ${projection.y}) - ${projection.minimum}) / ${projection.span}`
  }
  if (normalized.wipeVariant === 'split') {
    const axis = normalized.orientation === 'horizontal' ? 'y' : 'x'
    const distance = `min(1, abs(${axis} - 0.5) * 2)`
    return normalized.wipeMode === 'center-in' ? `1 - ${distance}` : distance
  }
  if (normalized.wipeVariant === 'barn-doors') {
    const spanX = Math.max(normalized.centerX, 1 - normalized.centerX, 1e-6)
    const spanY = Math.max(normalized.centerY, 1 - normalized.centerY, 1e-6)
    const distance = `min(1, max(abs(x - ${normalized.centerX}) / ${spanX}, abs(y - ${normalized.centerY}) / ${spanY}))`
    return normalized.wipeMode === 'center-in' ? `1 - ${distance}` : distance
  }
  if (normalized.wipeVariant === 'blinds') {
    const axis = normalized.orientation === 'horizontal' ? 'y' : 'x'
    return `frac(${axis} * ${normalized.count} + ${normalized.phase})`
  }
  if (normalized.wipeVariant === 'clock') {
    const sign = normalized.clockwise ? 1 : -1
    const turn = `${sign} * atan2(y - ${normalized.centerY}, x - ${normalized.centerX}) / ${TAU} - ${normalized.phase}`
    // Pixelblaze frac() truncates toward zero, so negative angles remain
    // negative and would make half the Stage pass the Wipe threshold at t=0.
    // Floor-based wrapping matches showWipeMaskPosition's positive modulo.
    return `((${turn}) - floor(${turn}))`
  }
  if (normalized.wipeVariant === 'checker') {
    return `(frac((floor(x * ${normalized.count}) + floor(y * ${normalized.count})) * 0.5) * 2 + frac(x * ${normalized.count})) / 2`
  }
  return `min(1, max(abs(frac(x * ${normalized.count}) - 0.5), abs(frac(y * ${normalized.count}) - 0.5)) * 2)`
}

function canonicalComponent(value: number): number {
  if (Math.abs(value) < CARDINAL_EPSILON) return 0
  if (Math.abs(value - 1) < CARDINAL_EPSILON) return 1
  if (Math.abs(value + 1) < CARDINAL_EPSILON) return -1
  return value
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
