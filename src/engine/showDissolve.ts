import type { ShowDissolveVariant } from './personalContentRecords'

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
