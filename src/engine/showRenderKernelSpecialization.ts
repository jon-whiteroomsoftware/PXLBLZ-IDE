export interface ShowRenderKernelSelectionInput {
  planCount: number
  kernelCount: number
  baselineDispatchBytes: number
  candidateDispatchBytes: number
  baselineArtifactBytes: number
  artifactBudgetBytes: number
  minimumAvoidedBranchesPerPixel: number
  maxAddedBytes: number
}

export interface ShowRenderKernelSelection {
  selected: boolean
  reason: 'selected' | 'benefit-threshold' | 'artifact-budget' | 'byte-budget' | 'hardware-profile'
  avoidedBranchesPerPixel: number
  sourceByteDelta: number
  projectedArtifactBytes: number
}

/** Selects only kernels whose branch benefit clears both source and artifact budgets. */
export function selectShowRenderKernelSpecialization(
  input: ShowRenderKernelSelectionInput,
): ShowRenderKernelSelection {
  const avoidedBranchesPerPixel = Math.max(0, input.planCount - input.kernelCount)
  const sourceByteDelta = input.candidateDispatchBytes - input.baselineDispatchBytes
  const projectedArtifactBytes = input.baselineArtifactBytes + sourceByteDelta
  if (avoidedBranchesPerPixel < input.minimumAvoidedBranchesPerPixel) {
    return {
      selected: false,
      reason: 'benefit-threshold',
      avoidedBranchesPerPixel,
      sourceByteDelta,
      projectedArtifactBytes,
    }
  }
  if (projectedArtifactBytes > input.artifactBudgetBytes) {
    return {
      selected: false,
      reason: 'artifact-budget',
      avoidedBranchesPerPixel,
      sourceByteDelta,
      projectedArtifactBytes,
    }
  }
  if (sourceByteDelta > input.maxAddedBytes) {
    return {
      selected: false,
      reason: 'byte-budget',
      avoidedBranchesPerPixel,
      sourceByteDelta,
      projectedArtifactBytes,
    }
  }
  return {
    selected: true,
    reason: 'selected',
    avoidedBranchesPerPixel,
    sourceByteDelta,
    projectedArtifactBytes,
  }
}
