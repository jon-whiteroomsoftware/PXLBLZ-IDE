// #934 hardware fixtures: the stock Patterns whose per-pixel transcendental
// sites the pass rewrites, as plain Patterns (bundled member source through
// the pass), so the pairing isolates the substitution.
import { bundle } from '../../src/engine/bundle'
import { approximateShowMemberTranscendentals } from '../../src/engine/showMemberTranscendentalApproximation'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'

export const ISSUE934_PIXEL_COUNT = 256

export interface Issue934Fixture {
  pattern: keyof typeof DEMOS
  /** FPS sample window; PhantomStar renders one frame every ~4 s. */
  sampleMs: number
  exact: string
  approximated: string
  rewritten: { exp: number; pow: number; tanh: number }
  skipped: number
}

export const ISSUE934_PATTERNS: Array<{ pattern: keyof typeof DEMOS; sampleMs: number }> = [
  { pattern: 'PhantomStar', sampleMs: 90_000 },
  { pattern: 'PlasmaNebula', sampleMs: 6_000 },
  { pattern: 'Kishimisu', sampleMs: 6_000 },
]

export function issue934Fixtures(): Issue934Fixture[] {
  return ISSUE934_PATTERNS.map(({ pattern, sampleMs }) => {
    const exact = bundle(DEMOS[pattern], LIBRARIES).code
    const result = approximateShowMemberTranscendentals(exact)
    return { pattern, sampleMs, exact, approximated: result.source, rewritten: result.rewritten, skipped: result.skipped.length }
  })
}
