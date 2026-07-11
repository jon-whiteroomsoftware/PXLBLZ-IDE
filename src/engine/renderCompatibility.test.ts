import type { RenderFns } from './loadPattern'
import {
  adaptSampleForRenderer,
  planHardwareRenderer,
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

describe('planHardwareRenderer', () => {
  it('treats a centered higher-dimensional adapter as compatible on older firmware', () => {
    expect(planHardwareRenderer(
      2,
      capabilities({ hasRender3D: true }),
      '3.65',
    )).toMatchObject({
      adapterRequired: true,
      firmwareSupport: 'supported',
      compatibility: { renderer: 'render3D', rendererDim: 3 },
    })
  })

  it('rejects an unadapted lower-dimensional fallback on pre-3.66 firmware', () => {
    const plan = planHardwareRenderer(3, capabilities({ hasRender2D: true }), 'v3.65')

    expect(plan.firmwareSupport).toBe('unsupported')
    expect(plan.reason).toContain('3.66 or newer')
  })

  it('reports unknown firmware honestly for an unproven fallback', () => {
    expect(planHardwareRenderer(
      3,
      capabilities({ hasRender2D: true }),
      undefined,
    ).firmwareSupport).toBe('unknown')
  })

  it('allows the documented renderer matrix on firmware 3.66+', () => {
    expect(planHardwareRenderer(
      3,
      capabilities({ hasRender2D: true }),
      '3.67',
    ).firmwareSupport).toBe('supported')
  })

  it('rejects true 1D maps on pre-3.66 firmware even with an exact renderer', () => {
    const plan = planHardwareRenderer(1, capabilities({ hasRender: true }), '3.65')

    expect(plan.firmwareSupport).toBe('unsupported')
    expect(plan.reason).toContain('True 1D maps')
  })

  it('rejects a Pattern with no usable renderer', () => {
    expect(planHardwareRenderer(2, capabilities({}), '3.67')).toMatchObject({
      firmwareSupport: 'unsupported',
      adapterRequired: false,
    })
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
