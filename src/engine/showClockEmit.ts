// Show clock emission (#1204).
//
// `__pxlblz_show_elapsed_s` is the Show clock in seconds. Advancing it by
// `delta / 1000` every frame rounds that quotient to 1/65536 s under 16.16, and
// the rounding bias is fixed for a fixed delta, so the error grows linearly with
// frame count (about 12 ms per 48.6 s loop at 60 fps). Instead the clock keeps
// whole seconds plus a millisecond accumulator in [0, 1000): summing `delta` in
// milliseconds is exact in 16.16, carries and loop wraps use exact comparison and
// subtraction, and the seconds value is derived with one rounding per frame.
// Every intermediate stays below 32,767, so the 32,767 s horizon is unchanged.

/** 2^-16, exact in binary64 and 16.16. */
const ONE_LSB = '0.0000152587890625'

export const SHOW_CLOCK_MS = '__pxlblz_show_clock_ms'
export const SHOW_CLOCK_MS_DECLARATION = `var ${SHOW_CLOCK_MS} = 0`
/** Beforerender-local whole seconds of the clock, valid after the advance. */
export const SHOW_CLOCK_WHOLE_S = '__pxlblz_show_clock_s'

export interface ShowClockAdvanceOptions {
  /** Loop length in ms. Omit for a clock that never wraps. */
  loopMs?: number
  /** Variable that receives the number of loop wraps this frame. */
  wraps?: { name: string; declare: boolean }
  /** Indentation for every line after the first. */
  indent?: string
}

/** Statements advancing the Show clock by the `delta` in scope (milliseconds). */
export function emitShowClockAdvance(options: ShowClockAdvanceOptions = {}): string {
  const s = SHOW_CLOCK_WHOLE_S
  const ms = SHOW_CLOCK_MS
  const lines = [
    // The register is s + ms / 1000 rounded once, so subtracting the same
    // quotient recovers s exactly; + 0.5 tolerates any sub-half-second write.
    `var ${s} = floor(__pxlblz_show_elapsed_s - ${ms} / 1000 + 0.5)`,
    `${ms} = ${ms} + delta`,
    `while (${ms} >= 1000) {`,
    `  ${ms} = ${ms} - 1000`,
    `  ${s} = ${s} + 1`,
    '}',
  ]
  const wraps = options.wraps
  if (wraps) lines.push(`${wraps.declare ? 'var ' : ''}${wraps.name} = 0`)
  const loopMs = options.loopMs
  if (loopMs !== undefined) {
    if (!Number.isFinite(loopMs) || loopMs <= 0) throw new Error(`Show clock loop must be positive, got ${loopMs} ms`)
    const loopS = Math.floor(loopMs / 1000)
    const loopRemainderMs = loopMs - loopS * 1000
    const wrapCount = wraps ? [`  ${wraps.name} = ${wraps.name} + 1`] : []
    if (loopRemainderMs === 0) {
      lines.push(`while (${s} >= ${loopS}) {`, `  ${s} = ${s} - ${loopS}`, ...wrapCount, '}')
    } else {
      lines.push(
        `while (${s} > ${loopS} || (${s} == ${loopS} && ${ms} >= ${loopRemainderMs})) {`,
        ...(loopS > 0 ? [`  ${s} = ${s} - ${loopS}`] : []),
        `  ${ms} = ${ms} - ${loopRemainderMs}`,
        `  if (${ms} < 0) {`,
        `    ${ms} = ${ms} + 1000`,
        `    ${s} = ${s} - 1`,
        '  }',
        ...wrapCount,
        '}',
      )
    }
  }
  lines.push(`__pxlblz_show_elapsed_s = ${s} + ${ms} / 1000`)
  // The one rounding can reach the loop literal (ms / 1000 rounds up to the
  // next second, or to the literal's own rounded fraction). No segment owns the
  // loop point, so hold the register one 16.16 step below it.
  if (loopMs !== undefined) {
    lines.push(`if (__pxlblz_show_elapsed_s >= ${loopMs / 1000}) __pxlblz_show_elapsed_s = ${loopMs / 1000} - ${ONE_LSB}`)
  }
  return lines.join(`\n${options.indent ?? '  '}`)
}

/** Clock position in ms after the advance, for post-wrap delta delivery. */
export const SHOW_CLOCK_POSITION_MS = `${SHOW_CLOCK_WHOLE_S} * 1000 + ${SHOW_CLOCK_MS}`
