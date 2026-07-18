import { report } from './issue527'

describe('content-key composition harness (#527)', () => {
  it('pins exact parity, N + U evaluation, and zero additional arrays', () => {
    expect(report).toMatchObject({
      fixture: 'mostly-opaque-black-key-overlay',
      pixelCount: 2_000,
      expectedOpaqueFraction: 0.9,
      selected: {
        contentKeys: {
          keyedClipCount: 1,
          selectedStackCount: 2,
          evaluationFormula: 'N + U',
          bestCaseRenderersPerPixel: 1,
          worstCaseRenderersPerPixel: 2,
          featheredPixelsEvaluateBoth: true,
        },
        effects: {
          keyEffectsPerEvaluatedPixel: 1,
          keyScalarOpsPerEvaluatedPixel: 13,
          keySqrtCallsPerEvaluatedPixel: 0,
        },
      },
      counterfactual: {
        contentKeys: {
          selectedStackCount: 0,
          rejectedStackCount: 2,
          stacks: expect.arrayContaining([expect.objectContaining({ reason: 'disabled' })]),
        },
      },
      equivalence: [
        { fidelity: 'fast', matches: true },
        { fidelity: 'fidelity', matches: true },
      ],
    })
    expect(report.selected.resources.renderTargetWords).toBe(report.counterfactual.resources.renderTargetWords)
    expect(report.selected.resources.memberArrayWords).toBe(report.counterfactual.resources.memberArrayWords)
    expect(report.selected.fastMeanFrameMs).toBeGreaterThan(0)
    expect(report.selected.preciseMeanFrameMs).toBeGreaterThan(0)
  }, 30_000)
})
