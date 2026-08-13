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
  sourceStatus: 'ok' | 'warning' | 'over'
  warnings: string[]
  blocks: string[]
}

/**
 * Classify compiled output against the v2 release support envelope. Delivered
 * source uses a conservative proxy derived from an observed bytecode activation
 * ceiling. Source bytes and bytecode bytes diverge, so sourceStatus colors the
 * advisory gauge but never blocks delivery. Renderer blocking is the unvalidated
 * side of the four-renderer #492 fixture, not a device-limit claim.
 */
export function assessShowCompilePressure(input: ShowCompilePressureInput): ShowCompilePressureAssessment {
  const warnings: string[] = []
  const blocks: string[] = []
  const budgetRatio = input.budgetBytes > 0 ? input.deliveredSourceBytes / input.budgetBytes : 0
  const sourceStatus = input.budgetBytes > 0 && budgetRatio >= 1
    ? 'over'
    : budgetRatio >= SHOW_ARTIFACT_WARNING_RATIO
      ? 'warning'
      : 'ok'

  if (input.worstInstantRenderersPerPixel >= SHOW_RENDERER_BLOCK_COUNT) {
    blocks.push(`Peak: ${input.worstInstantRenderersPerPixel} Patterns per pixel (limit 4).`)
  } else if (input.worstInstantRenderersPerPixel >= SHOW_RENDERER_WARNING_COUNT) {
    warnings.push(`Peak: ${input.worstInstantRenderersPerPixel} Patterns per pixel.`)
  }

  return {
    status: blocks.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ok',
    sourceStatus,
    warnings,
    blocks,
  }
}
