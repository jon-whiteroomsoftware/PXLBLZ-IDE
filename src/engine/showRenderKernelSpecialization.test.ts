import { selectShowRenderKernelSpecialization } from './showRenderKernelSpecialization'

describe('Show render-kernel specialization', () => {
  it('selects a byte-non-increasing plan that collapses per-pixel dispatch', () => {
    const result = selectShowRenderKernelSpecialization({
      planCount: 18,
      kernelCount: 1,
      baselineDispatchBytes: 2_400,
      candidateDispatchBytes: 1_300,
      baselineArtifactBytes: 18_781,
      artifactBudgetBytes: 68_384,
      minimumAvoidedBranchesPerPixel: 2,
      maxAddedBytes: 0,
    })

    expect(result).toMatchObject({
      selected: true,
      reason: 'selected',
      avoidedBranchesPerPixel: 17,
      sourceByteDelta: -1_100,
    })
  })

  it('declines insufficient branch benefit and an artifact-budget overflow', () => {
    expect(selectShowRenderKernelSpecialization({
      planCount: 2,
      kernelCount: 2,
      baselineDispatchBytes: 200,
      candidateDispatchBytes: 200,
      baselineArtifactBytes: 1_000,
      artifactBudgetBytes: 2_000,
      minimumAvoidedBranchesPerPixel: 1,
      maxAddedBytes: 128,
    }).reason).toBe('benefit-threshold')

    expect(selectShowRenderKernelSpecialization({
      planCount: 8,
      kernelCount: 2,
      baselineDispatchBytes: 500,
      candidateDispatchBytes: 700,
      baselineArtifactBytes: 1_950,
      artifactBudgetBytes: 2_000,
      minimumAvoidedBranchesPerPixel: 1,
      maxAddedBytes: 256,
    }).reason).toBe('artifact-budget')
  })
})
