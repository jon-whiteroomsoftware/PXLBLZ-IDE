const TAU = Math.PI * 2
const CARDINAL_EPSILON = 1e-12

export interface ShowWipeProjectionCoefficients {
  direction: number
  x: number
  y: number
  minimum: number
  span: number
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

function canonicalComponent(value: number): number {
  if (Math.abs(value) < CARDINAL_EPSILON) return 0
  if (Math.abs(value - 1) < CARDINAL_EPSILON) return 1
  if (Math.abs(value + 1) < CARDINAL_EPSILON) return -1
  return value
}
