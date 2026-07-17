import { report } from './issue508'

describe('Redline Show Stage performance harness (#508)', () => {
  it('records a packed one-tick-per-frame Fast baseline for the real 4,000-pixel fixture', () => {
    expect(report).toMatchObject({
      fixture: 'stock-show-showcase-redline-installation',
      pixelCount: 4_000,
      runtimeInitializations: 1,
      simulatedTicksPerPresentedFrame: 1,
      frameBufferStable: true,
      stageMaskIdentity: true,
    })
    expect(report.phasesMs.engineFrameTotal.median).toBeGreaterThan(0)
    expect(report.phasesMs.engineFrameTotal.p95).toBeGreaterThanOrEqual(
      report.phasesMs.engineFrameTotal.median,
    )
  })
})
