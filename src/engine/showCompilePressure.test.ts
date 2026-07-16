import { assessShowCompilePressure } from './showCompilePressure'

describe('Show compiled pressure release envelope (#492)', () => {
  it('keeps ordinary one/two-source work below the disclosure threshold', () => {
    expect(assessShowCompilePressure({
      artifactBytes: 34_000,
      budgetBytes: 68_384,
      worstInstantRenderersPerPixel: 2,
    })).toEqual({ status: 'ok', warnings: [], blocks: [] })
  })

  it.each([
    {
      input: { artifactBytes: 55_000, budgetBytes: 68_384, worstInstantRenderersPerPixel: 2 },
      warning: 'Generated artifact uses 80% or more of the measured activation budget.',
    },
    {
      input: { artifactBytes: 20_000, budgetBytes: 68_384, worstInstantRenderersPerPixel: 3 },
      warning: 'Worst instant evaluates 3 simultaneous Pattern sources per pixel.',
    },
  ])('warns without blocking inside the supported stress envelope', ({ input, warning }) => {
    const result = assessShowCompilePressure(input)

    expect(result.status).toBe('warning')
    expect(result.warnings).toContain(warning)
    expect(result.blocks).toEqual([])
  })

  it.each([
    {
      input: { artifactBytes: 68_384, budgetBytes: 68_384, worstInstantRenderersPerPixel: 1 },
      block: 'Generated artifact meets or exceeds the measured activation budget.',
    },
    {
      input: { artifactBytes: 20_000, budgetBytes: 68_384, worstInstantRenderersPerPixel: 5 },
      block: 'Worst instant exceeds the four-renderer release validation envelope.',
    },
  ])('blocks output outside the measured release envelope', ({ input, block }) => {
    const result = assessShowCompilePressure(input)

    expect(result.status).toBe('blocked')
    expect(result.blocks).toContain(block)
  })
})
