import { describe, expect, it } from 'vitest'
import { report } from './issue525'

describe('issue #525 shared motion-transition harness', () => {
  it('pins both candidates, production fit, and exact output', () => {
    // Re-measured 2026-08-02 against the Zoom and Spin reference after the
    // showcase repartition retired the original twenty-boundary Motion
    // fixture.
    expect(report).toMatchObject({
      sceneCount: 8,
      boundaryCount: 7,
      representations: {
        baseline: { sourceBytes: 33_913 },
        structural: {
          sourceBytes: 27_719,
          motionTransitions: {
            representation: 'exact-shared-environment',
            stackPlanCount: 2,
            kernelCount: 7,
            parameterWords: 0,
          },
        },
        selected: {
          sourceBytes: 28_208,
          motionTransitions: {
            representation: 'exact-family-kernels',
            stackPlanCount: 2,
            kernelCount: 5,
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
    expect(report.scoreTimesMs).toHaveLength(21)
    expect(report.representations.selected.sourceBytes).toBeLessThanOrEqual(68_384)
  })
})
