import type { GridDims, GridRecipe } from './maps'

export const QUICK_RESOLUTION_MAX = 2048

const SQUARE_STEPS = [16, 24, 32, 40, 45].map((side) => side * side)
const WIDE_STEPS = [[24, 12], [32, 16], [40, 20], [48, 24], [56, 28], [64, 32]]
  .map(([cols, rows]) => cols * rows)
const CUBE_STEPS = [6, 8, 10, 12].map((side) => side ** 3)
const GENERIC_STEPS = [256, 512, 768, 1024, 1536, QUICK_RESOLUTION_MAX]

export function previewResolutionSteps(options: {
  mapDim: 1 | 2 | 3
  gridRecipe?: GridRecipe
  bakedCount?: number
}): number[] {
  if (options.bakedCount != null) return []
  if (options.mapDim === 1) return [...GENERIC_STEPS]
  if (options.gridRecipe === 'square') return [...SQUARE_STEPS]
  if (options.gridRecipe === 'wide') return [...WIDE_STEPS]
  if (options.gridRecipe === 'cube') return [...CUBE_STEPS]
  return [...GENERIC_STEPS]
}

export function resolutionStepIndex(steps: readonly number[], count: number | null): number | null {
  if (count == null) return null
  const index = steps.indexOf(count)
  return index >= 0 ? index : null
}

export function adjacentPreviewResolution(
  steps: readonly number[],
  count: number | null,
  direction: -1 | 1,
): number | null {
  if (steps.length === 0) return null
  if (count == null) return direction < 0 ? steps[0] : steps[steps.length - 1]
  if (direction < 0) {
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      if (steps[index] < count) return steps[index]
    }
  } else {
    for (const step of steps) {
      if (step > count) return step
    }
  }
  return null
}

export function formatResolutionDimensions(dims: GridDims | null): string | null {
  if (!dims) return null
  return dims.depth == null
    ? `${dims.cols}×${dims.rows}`
    : `${dims.cols}×${dims.rows}×${dims.depth}`
}

export function realizedResolutionCount(
  requestedCount: number,
  dims: GridDims | null,
  gridRecipe?: GridRecipe,
): number {
  if (gridRecipe !== 'cube' || !dims?.depth) return requestedCount
  return dims.cols * dims.rows * dims.depth
}
