import { report } from './issue512'

describe('Redline exact compiler specialization (#512)', () => {
  it('pins the supported 2,000-pixel routing/capture plan and Fast/Precise equivalence', () => {
    expect(report).toMatchObject({
      fixture: 'stock-show-showcase-redline-installation',
      pixelCount: 2_000,
      selected: {
        routing: {
          kind: 'complete-disjoint-short-circuit',
          rangeCount: 5,
          baselineMaxComparisonsPerPixel: 10,
          selectedMaxComparisonsPerPixel: 4,
          maxComparisonsAvoidedPerPixel: 6,
        },
      },
    })
    expect(report.equivalence).toHaveLength(2)
    expect(report.equivalence.every((result) => result.matches)).toBe(true)
    expect(report.selected.sourceBytes).toBeLessThan(report.counterfactual.sourceBytes)
    expect(report.selected.fastMeanFrameMs).toBeGreaterThan(0)
    expect(report.selected.preciseMeanFrameMs).toBeGreaterThan(0)
  }, 30_000)
})
