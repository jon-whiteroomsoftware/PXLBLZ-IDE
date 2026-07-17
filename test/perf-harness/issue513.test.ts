import { report } from './issue513'

describe('Redline frame-invariant and render-kernel specialization (#513)', () => {
  it('pins the cumulative 2,000-pixel plan and Fast/Precise equivalence', () => {
    expect(report).toMatchObject({
      fixture: 'stock-show-showcase-redline-installation',
      pixelCount: 2_000,
      selected: {
        renderKernels: {
          selected: false,
          reason: 'hardware-profile',
          configurationPlanCount: 18,
          kernelCount: 2,
          avoidedBranchesPerPixel: 16,
        },
        kernelCandidate: {
          selected: true,
          reason: 'selected',
        },
      },
    })
    expect(report.selected.frameInvariants).toContainEqual(expect.objectContaining({
      clipId: 'redline-machine',
      candidateCount: 7,
      selectedCount: 7,
      bindings: expect.arrayContaining(['density', 'surfaceGlow']),
      operationsAvoidedPerEvaluatedPixel: 18,
    }))
    expect(report.equivalence).toHaveLength(2)
    expect(report.equivalence.every((result) => result.matches)).toBe(true)
    expect(report.selected.sourceBytes - report.counterfactual.sourceBytes).toBeLessThanOrEqual(1_024)
    expect(report.selected.fastMeanFrameMs).toBeGreaterThan(0)
    expect(report.selected.preciseMeanFrameMs).toBeGreaterThan(0)
  }, 30_000)
})
