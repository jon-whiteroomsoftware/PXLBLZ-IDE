export const SHOW_ARTIFACT_WARNING_RATIO = 0.8
export const SHOW_RENDERER_WARNING_COUNT = 3
export const SHOW_RENDERER_BLOCK_COUNT = 5

export interface ShowCompilePressureInput {
  /** UTF-8 bytes of the delivered Show source: compiler-generated source plus
   * the provenance/delivery header, i.e. what actually ships in the .epe and
   * is persisted to Controller flash. */
  deliveredSourceBytes: number
  budgetBytes: number
  worstInstantRenderersPerPixel: number
}

export interface ShowCompilePressureAssessment {
  status: 'ok' | 'warning' | 'blocked'
  warnings: string[]
  blocks: string[]
}

/**
 * Classify compiled output against the v2 release support envelope. Delivered
 * source uses a conservative proxy derived from the observed bytecode activation
 * ceiling; it is not a measurement of remaining Controller capacity. The
 * numerator is the delivered total (generated source plus delivery header) so
 * the rule always matches the gauge and inventory the user sees; the compiler's
 * ledger backstop measures generated source alone and, being strictly smaller,
 * can never block a Show this rule accepts. Renderer blocking is the
 * unvalidated side of the four-renderer #492 fixture, not a device-limit claim.
 */
export function assessShowCompilePressure(input: ShowCompilePressureInput): ShowCompilePressureAssessment {
  const warnings: string[] = []
  const blocks: string[] = []
  const budgetRatio = input.budgetBytes > 0 ? input.deliveredSourceBytes / input.budgetBytes : 0
  const observedCeiling = `${input.budgetBytes.toLocaleString('en-US')}-byte compiled-bytecode activation ceiling`

  if (input.deliveredSourceBytes >= input.budgetBytes && input.budgetBytes > 0) {
    blocks.push(`Delivered UTF-8 source meets or exceeds the source-size proxy derived from the observed ${observedCeiling}.`)
  } else if (budgetRatio >= SHOW_ARTIFACT_WARNING_RATIO) {
    warnings.push(`Delivered UTF-8 source is 80% or more of the source-size proxy derived from the observed ${observedCeiling}.`)
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
