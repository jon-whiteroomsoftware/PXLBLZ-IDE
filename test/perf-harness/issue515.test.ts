import { report } from './issue515'

describe('Redline physical render-target arena (#515)', () => {
  it('pins the 2,000-pixel arena and Fast/Precise equivalence', () => {
    expect(report).toMatchObject({
      fixture: 'stock-show-showcase-redline-installation',
      pixelCount: 2_000,
      selected: {
        renderTarget: {
          elementCount: 2_000,
          planeCount: 3,
          words: 6_012,
          emitted: true,
          activeRole: null,
        },
        resources: {
          renderTargetWords: 6_012,
          remainingWords: 4_144,
        },
      },
      counterfactual: {
        renderTarget: {
          emitted: false,
        },
      },
    })
    expect(report.equivalence).toHaveLength(2)
    expect(report.equivalence.every((result) => result.matches)).toBe(true)
    expect(report.selected.sourceBytes).toBeGreaterThan(report.counterfactual.sourceBytes)
    expect(report.selected.fastMeanFrameMs).toBeGreaterThan(0)
    expect(report.selected.preciseMeanFrameMs).toBeGreaterThan(0)
  }, 30_000)
})
