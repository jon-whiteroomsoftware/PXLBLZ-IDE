import type { ShowDissolveVariant, ShowTransitionEdgePolicy } from './personalContentRecords'
import { evaluateShowTransitionEdge, type ShowTransitionEdgeResult } from './showTransitionEdge'

const GOLDEN_FRACTION = 0.61803398875
const SEED_MODULUS = 65_536

export function normalizeShowDissolveSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0
  const integer = Math.round(seed)
  return ((integer % SEED_MODULUS) + SEED_MODULUS) % SEED_MODULUS
}

export function normalizeShowDissolveBlockSize(blockSize: number): number {
  if (!Number.isFinite(blockSize)) return 8
  return Math.min(1024, Math.max(1, Math.round(blockSize)))
}

export function normalizeShowDissolveScale(scale: number): number {
  if (!Number.isFinite(scale)) return 6
  return Math.min(32, Math.max(1, scale))
}

export function normalizeShowDissolveSoftness(softness: number): number {
  if (!Number.isFinite(softness)) return 0.15
  return Math.min(1, Math.max(0, softness))
}

export function showDissolveCell(
  index: number,
  variant: ShowDissolveVariant,
  blockSize: number,
): number {
  return variant === 'block'
    ? Math.floor(index / normalizeShowDissolveBlockSize(blockSize))
    : index
}

export function showDissolveHash(
  index: number,
  variant: ShowDissolveVariant,
  blockSize: number,
  seed: number,
): number {
  const cell = showDissolveCell(index, variant, blockSize)
  const value = (cell + 1 + normalizeShowDissolveSeed(seed) * 131) * GOLDEN_FRACTION
  return value - Math.floor(value)
}

export function showDissolveSelectsIncoming(
  index: number,
  progress: number,
  variant: ShowDissolveVariant,
  blockSize: number,
  seed: number,
): boolean {
  const normalizedProgress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0))
  return showDissolveHash(index, variant, blockSize, seed) < normalizedProgress
}

export function showCoherentDissolveField(
  x: number,
  y: number,
  scale: number,
  seed: number,
): number {
  const spatialScale = normalizeShowDissolveScale(scale)
  const scaledX = x * spatialScale
  const scaledY = y * spatialScale
  const cellX = Math.floor(scaledX)
  const cellY = Math.floor(scaledY)
  const localX = scaledX - cellX
  const localY = scaledY - cellY
  const smoothX = localX * localX * (3 - 2 * localX)
  const smoothY = localY * localY * (3 - 2 * localY)
  const top = mix(latticeHash(cellX, cellY, seed), latticeHash(cellX + 1, cellY, seed), smoothX)
  const bottom = mix(latticeHash(cellX, cellY + 1, seed), latticeHash(cellX + 1, cellY + 1, seed), smoothX)
  return mix(top, bottom, smoothY)
}

export function showSoftDissolveEdge(input: {
  field: number
  progress: number
  softness: number
  policy: ShowTransitionEdgePolicy
  hash: number
}): ShowTransitionEdgeResult {
  return evaluateShowTransitionEdge({
    position: input.field,
    progress: input.progress,
    feather: normalizeShowDissolveSoftness(input.softness),
    policy: input.policy,
    hash: input.hash,
  })
}

function latticeHash(x: number, y: number, seed: number): number {
  const value = (x + y * 4096 + 1 + normalizeShowDissolveSeed(seed) * 131) * GOLDEN_FRACTION
  return value - Math.floor(value)
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}
