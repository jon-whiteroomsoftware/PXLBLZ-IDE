export const SHOW_ARTIFACT_WARNING_RATIO = 0.8
export const SHOW_RENDERER_WARNING_COUNT = 3
export const SHOW_RENDERER_BLOCK_COUNT = 5

export interface ShowCompilePressureInput {
  artifactBytes: number
  budgetBytes: number
  worstInstantRenderersPerPixel: number
}

export interface ShowCompilePressureAssessment {
  status: 'ok' | 'warning' | 'blocked'
  warnings: string[]
  blocks: string[]
}

/**
 * Classify compiled output against the v2 release support envelope. Generated
 * source uses a conservative proxy derived from the observed bytecode activation
 * ceiling; it is not a measurement of remaining Controller capacity. Renderer
 * blocking is the unvalidated side of the four-renderer #492 fixture, not a
 * device-limit claim.
 */
export function assessShowCompilePressure(input: ShowCompilePressureInput): ShowCompilePressureAssessment {
  const warnings: string[] = []
  const blocks: string[] = []
  const budgetRatio = input.budgetBytes > 0 ? input.artifactBytes / input.budgetBytes : 0
  const observedCeiling = `${input.budgetBytes.toLocaleString('en-US')}-byte compiled-bytecode activation ceiling`

  if (input.artifactBytes >= input.budgetBytes && input.budgetBytes > 0) {
    blocks.push(`Generated UTF-8 source meets or exceeds the source-size proxy derived from the observed ${observedCeiling}.`)
  } else if (budgetRatio >= SHOW_ARTIFACT_WARNING_RATIO) {
    warnings.push(`Generated UTF-8 source is 80% or more of the source-size proxy derived from the observed ${observedCeiling}.`)
  }

  if (input.worstInstantRenderersPerPixel >= SHOW_RENDERER_BLOCK_COUNT) {
    blocks.push('Worst instant exceeds the four-renderer release validation envelope.')
  } else if (input.worstInstantRenderersPerPixel >= SHOW_RENDERER_WARNING_COUNT) {
    warnings.push(`Worst instant evaluates ${input.worstInstantRenderersPerPixel} simultaneous Pattern sources per pixel.`)
  }

  return {
    status: blocks.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ok',
    warnings,
    blocks,
  }
}
