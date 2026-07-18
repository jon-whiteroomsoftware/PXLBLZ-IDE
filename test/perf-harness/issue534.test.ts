import { issue534Cases, report } from './issue534'

describe('multi-layer coverage-directed composition harness (#534)', () => {
  it('pins the complete 0/25/50/90/100 coverage and 3/5-layer matrix', () => {
    expect(report).toMatchObject({
      pixelCount: 2_000,
      coverages: [0, 0.25, 0.5, 0.9, 1],
      layerCounts: [3, 5],
    })
    expect(issue534Cases).toHaveLength(10)
    for (const result of issue534Cases) {
      expect(result.equivalence).toEqual([
        expect.objectContaining({ fidelity: 'fast', matches: true }),
        expect.objectContaining({ fidelity: 'fidelity', matches: true }),
      ])
      expect(result.selected.memberPatternWords).toBe(result.counterfactual.memberPatternWords)
      expect(result.selected.persistentGlobals).toBe(result.counterfactual.persistentGlobals)
      expect(result.selected.renderTargetWords).toBe(result.counterfactual.renderTargetWords)
      if (result.layerCount === 3) {
        expect(result.selected.contentKeys).toMatchObject({
          selectedStackCount: 2,
          evaluationFormula: 'N + U1 + U2',
          bestCaseRenderersPerPixel: 1,
          worstCaseRenderersPerPixel: 3,
        })
        expect(result.counterfactual.contentKeys).toMatchObject({
          selectedStackCount: 0,
          rejectedStackCount: 2,
        })
      } else {
        expect(result.selected.contentKeys).toMatchObject({
          selectedStackCount: 0,
          rejectedStackCount: 2,
          stacks: expect.arrayContaining([expect.objectContaining({ reason: 'stack-depth' })]),
        })
        expect(result.selected.artifactBytes).toBe(result.counterfactual.artifactBytes)
        expect(result.selected.expandedBytes).toBe(result.counterfactual.expandedBytes)
      }
    }
  }, 60_000)
})
