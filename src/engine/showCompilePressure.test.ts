import { assessShowCompilePressure } from './showCompilePressure'

describe('Show compiled pressure release envelope (#492)', () => {
  it('keeps ordinary one/two-source work below the disclosure threshold', () => {
    expect(assessShowCompilePressure({
      deliveredSourceBytes: 34_000,
      budgetBytes: 68_384,
      worstInstantRenderersPerPixel: 2,
    })).toEqual({ status: 'ok', sourceStatus: 'ok', warnings: [], blocks: [] })
  })

  it('keeps source size advisory at and beyond the measured bytecode proxy', () => {
    expect(assessShowCompilePressure({
      deliveredSourceBytes: 55_000,
      budgetBytes: 68_384,
      worstInstantRenderersPerPixel: 2,
    })).toEqual({ status: 'ok', sourceStatus: 'warning', warnings: [], blocks: [] })

    expect(assessShowCompilePressure({
      deliveredSourceBytes: 68_384,
      budgetBytes: 68_384,
      worstInstantRenderersPerPixel: 2,
    })).toEqual({ status: 'ok', sourceStatus: 'over', warnings: [], blocks: [] })
  })

  it('keeps renderer feedback short and blocks only beyond the validated renderer envelope', () => {
    const warning = assessShowCompilePressure({
      deliveredSourceBytes: 20_000,
      budgetBytes: 68_384,
      worstInstantRenderersPerPixel: 3,
    })
    expect(warning).toEqual({
      status: 'warning',
      sourceStatus: 'ok',
      warnings: ['Peak: 3 Patterns per pixel.'],
      blocks: [],
    })

    const blocked = assessShowCompilePressure({
      deliveredSourceBytes: 20_000,
      budgetBytes: 68_384,
      worstInstantRenderersPerPixel: 5,
    })
    expect(blocked).toEqual({
      status: 'blocked',
      sourceStatus: 'ok',
      warnings: [],
      blocks: ['Peak: 5 Patterns per pixel (limit 4).'],
    })
  })
})
