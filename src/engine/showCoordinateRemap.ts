export const SHOW_REPEAT_SCALE_MIN = 1
export const SHOW_REPEAT_SCALE_MAX = 8

export function clampShowRepeatScale(value: number): number {
  if (!Number.isFinite(value)) return SHOW_REPEAT_SCALE_MIN
  return Math.max(SHOW_REPEAT_SCALE_MIN, Math.min(SHOW_REPEAT_SCALE_MAX, value))
}

export function remapShowSample(sample: readonly number[], repeatScale: number): number[] {
  if (sample.length !== 1 && sample.length !== 2) {
    throw new Error('Show coordinate remapping requires a 1D or 2D sample.')
  }
  const scale = clampShowRepeatScale(repeatScale)
  if (scale === 1) return [...sample]
  return sample.map((coordinate) => repeatCoordinate(coordinate, scale))
}

export function remapShowIndex(index: number, pixelCount: number, repeatScale: number): number {
  const count = Math.max(1, Math.floor(pixelCount))
  const boundedIndex = Math.max(0, Math.min(count - 1, Math.floor(index)))
  const scale = clampShowRepeatScale(repeatScale)
  if (count === 1 || scale === 1) return boundedIndex
  const position = boundedIndex / (count - 1)
  return Math.min(count - 1, Math.floor(repeatCoordinate(position, scale) * count))
}

function repeatCoordinate(coordinate: number, scale: number): number {
  const bounded = Math.max(0, Math.min(1, Number.isFinite(coordinate) ? coordinate : 0))
  const repeated = bounded * scale
  return repeated - Math.floor(repeated)
}
