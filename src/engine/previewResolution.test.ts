import {
  adjacentPreviewResolution,
  formatResolutionDimensions,
  previewResolutionSteps,
  realizedResolutionCount,
  resolutionStepIndex,
} from './previewResolution'

describe('Preview resolution ladders (#428)', () => {
  it('uses complete, bounded lattices for Square, Wide, and Cube', () => {
    expect(previewResolutionSteps({ mapDim: 2, gridRecipe: 'square' })).toEqual([
      256, 576, 1024, 1600, 2025,
    ])
    expect(previewResolutionSteps({ mapDim: 2, gridRecipe: 'wide' })).toEqual([
      288, 512, 800, 1152, 1568, 2048,
    ])
    expect(previewResolutionSteps({ mapDim: 3, gridRecipe: 'cube' })).toEqual([
      216, 512, 1000, 1728,
    ])
  })

  it('uses a conservative ladder for regenerating paths, shells, and volumes', () => {
    expect(previewResolutionSteps({ mapDim: 1 })).toEqual([256, 512, 768, 1024, 1536, 2048])
    expect(previewResolutionSteps({ mapDim: 3 })).toEqual([256, 512, 768, 1024, 1536, 2048])
  })

  it('does not offer quick scaling for a fixed baked map', () => {
    expect(previewResolutionSteps({ mapDim: 2, bakedCount: 160 })).toEqual([])
  })

  it('treats an off-ladder exact count as indeterminate and steps around it', () => {
    const steps = previewResolutionSteps({ mapDim: 2, gridRecipe: 'square' })
    expect(resolutionStepIndex(steps, 1000)).toBeNull()
    expect(adjacentPreviewResolution(steps, 1000, -1)).toBe(576)
    expect(adjacentPreviewResolution(steps, 1000, 1)).toBe(1024)
    expect(adjacentPreviewResolution(steps, 1024, -1)).toBe(576)
    expect(adjacentPreviewResolution(steps, 1024, 1)).toBe(1600)
  })

  it('formats exact map dimensions without inventing them for irregular geometry', () => {
    expect(formatResolutionDimensions({ cols: 32, rows: 32 })).toBe('32×32')
    expect(formatResolutionDimensions({ cols: 12, rows: 12, depth: 12 })).toBe('12×12×12')
    expect(formatResolutionDimensions(null)).toBeNull()
  })

  it('reports a cube\'s complete realized lattice while preserving partial 2D counts', () => {
    expect(realizedResolutionCount(1600, { cols: 12, rows: 12, depth: 12 }, 'cube')).toBe(1728)
    expect(realizedResolutionCount(1000, { cols: 32, rows: 32 }, 'square')).toBe(1000)
  })
})
