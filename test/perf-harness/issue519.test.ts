import { report } from './issue519'

describe('scalar-field cache harness (#519)', () => {
  it('pins exact parity, field work reduction, and arena-only storage', () => {
    expect(report).toMatchObject({
      fixture: 'redline-derived-five-surface-scalar-field',
      pixelCount: 2_000,
      zoneCount: 5,
      zonePixelCount: 400,
      selected: {
        renderTarget: { activeRole: 'scalar-field', words: 6_012 },
        scalarFields: {
          selectedFieldCount: 1,
          operationsAvoidedPerCachedFrame: 96_000,
          additionalArrayWords: 0,
          fields: [{ status: 'selected', planes: [0] }],
        },
      },
      equivalence: [
        { fidelity: 'fast', matches: true },
        { fidelity: 'fidelity', matches: true },
      ],
    })
    expect(report.selected.resources.renderTargetWords).toBe(report.counterfactual.resources.renderTargetWords)
    expect(report.selected.renderTargetPlan.assignments).toEqual([
      expect.objectContaining({ kind: 'scalar-field', planes: [0] }),
    ])
    expect(report.selected.fastMeanFrameMs).toBeGreaterThan(0)
    expect(report.selected.preciseMeanFrameMs).toBeGreaterThan(0)
  }, 30_000)
})
