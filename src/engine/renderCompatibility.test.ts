import type { RenderFns } from './loadPattern'
import {
  adaptSampleForRenderer,
  selectRenderCompatibility,
} from './renderCompatibility'

function capabilities(over: Partial<RenderFns>): RenderFns {
  return {
    hasBeforeRender: false,
    hasRender: false,
    hasRender2D: false,
    hasRender3D: false,
    ...over,
  }
}

describe('selectRenderCompatibility', () => {
  it.each([
    [1, { hasRender: true, hasRender2D: true, hasRender3D: true }, 'render'],
    [1, { hasRender2D: true, hasRender3D: true }, 'render3D'],
    [1, { hasRender2D: true }, 'render2D'],
    [2, { hasRender: true, hasRender2D: true, hasRender3D: true }, 'render2D'],
    [2, { hasRender: true, hasRender3D: true }, 'render3D'],
    [2, { hasRender: true }, 'render'],
    [3, { hasRender: true, hasRender2D: true, hasRender3D: true }, 'render3D'],
    [3, { hasRender: true, hasRender2D: true }, 'render2D'],
    [3, { hasRender: true }, 'render'],
  ] as const)(
    'uses firmware preference order for a %dD map',
    (mapDim, available, renderer) => {
      expect(selectRenderCompatibility(mapDim, capabilities(available)).renderer).toBe(renderer)
    },
  )

  it('returns no renderer when the Pattern defines none', () => {
    expect(selectRenderCompatibility(2, capabilities({})).renderer).toBeNull()
  })

  it('does not describe an exact-dimensional combination as adapted', () => {
    const plan = selectRenderCompatibility(2, capabilities({ hasRender2D: true }))
    expect(plan.description).toBeNull()
  })

  it('describes missing center-space coordinates', () => {
    const plan = selectRenderCompatibility(2, capabilities({ hasRender3D: true }))
    expect(plan.description).toBe('Using render3D with a 2D map; missing z is 0.5.')
  })

  it('describes dropped extra coordinates', () => {
    const plan = selectRenderCompatibility(3, capabilities({ hasRender2D: true }))
    expect(plan.description).toBe('Using render2D with a 3D map; z is dropped.')
  })
})

describe('adaptSampleForRenderer', () => {
  it.each([
    [[0.2], 3, [0.2, 0.5, 0.5]],
    [[0.2, 0.3], 3, [0.2, 0.3, 0.5]],
    [[0.2, 0.3, 0.4], 2, [0.2, 0.3]],
    [[0.2, 0.3], 1, [0.2]],
  ] as const)('adapts %j to a %dD renderer', (sample, rendererDim, expected) => {
    expect(adaptSampleForRenderer([...sample], rendererDim)).toEqual(expected)
  })
})
