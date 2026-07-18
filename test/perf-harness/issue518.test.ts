import { report } from './issue518'

describe('compatible Pattern-output reuse harness (#518)', () => {
  it('pins exact parity, evaluation reduction, and arena-only storage', () => {
    expect(report).toMatchObject({
      fixture: 'five-surface-shared-pattern-output',
      pixelCount: 2_000,
      zoneCount: 5,
      zonePixelCount: 400,
      selected: {
        renderTarget: { activeRole: 'stage-rgb', words: 6_012 },
        outputReuse: {
          selectedGroupCount: 2,
          evaluationsAvoidedPerFrame: 1_600,
          additionalArrayWords: 0,
        },
      },
      equivalence: [
        { fidelity: 'fast', matches: true },
        { fidelity: 'fidelity', matches: true },
      ],
    })
    expect(report.selected.resources.renderTargetWords).toBe(report.counterfactual.resources.renderTargetWords)
    expect(report.selected.renderTargetPlan.assignments.every((assignment) => (
      assignment.kind === 'shared-pattern-output' && assignment.planes.join(',') === '0,1,2'
    ))).toBe(true)
    expect(report.selected.fastMeanFrameMs).toBeGreaterThan(0)
    expect(report.selected.preciseMeanFrameMs).toBeGreaterThan(0)
  }, 30_000)
})
