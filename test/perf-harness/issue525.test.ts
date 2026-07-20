import { describe, expect, it } from 'vitest'
import { report } from './issue525'

describe('issue #525 shared motion-transition harness', () => {
  it('pins both candidates, production fit, and exact output', () => {
    expect(report).toMatchObject({
      sceneCount: 21,
      boundaryCount: 20,
      representations: {
        baseline: { sourceBytes: 108_533 },
        structural: {
          sourceBytes: 73_324,
          motionTransitions: {
            representation: 'exact-shared-environment',
            stackPlanCount: 2,
            kernelCount: 20,
            parameterWords: 0,
          },
        },
        selected: {
          sourceBytes: 67_694,
          motionTransitions: {
            representation: 'exact-family-kernels',
            stackPlanCount: 2,
            parameterWords: 0,
            parameterScalarGlobals: 7,
            dynamicBranchesAddedPerPixel: 0,
          },
        },
      },
      equivalence: [
        { fidelity: 'fast', structuralMatches: true, selectedMatches: true },
        { fidelity: 'fidelity', structuralMatches: true, selectedMatches: true },
      ],
    })
    expect(report.scoreTimesMs).toHaveLength(60)
    expect(report.representations.selected.sourceBytes).toBeLessThanOrEqual(68_384)
  })
})
