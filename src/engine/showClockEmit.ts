// Show clock emission (#1204).
//
// `__pxlblz_show_elapsed_s` is the Show clock in seconds. Advancing it by
// `delta / 1000` every frame rounds that quotient to 1/65536 s under 16.16, and
// the rounding bias is fixed for a fixed delta, so the error grows linearly with
// frame count (about 12 ms per 48.6 s loop at 60 fps). Instead the clock keeps
// whole seconds plus a millisecond accumulator in [0, 1000): summing `delta` in
// milliseconds is exact in 16.16, carries and loop wraps use exact comparison and
// subtraction, and the seconds value is derived with one rounding per frame.
// The accumulator gives up 1,000 ms before the delivery is added, so the sum
// stays in [-1000, 31768) for any 16.16 delivery and no intermediate passes
// 32,767; the 32,767 s horizon is unchanged.

/** 2^-16, exact in binary64 and 16.16. */
const ONE_LSB = '0.0000152587890625'
/** Largest whole value a 16.16 register holds. */
const MAX_16_16_INTEGER = 32_767

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
    // ms + delta can pass 32,767 (999 + 31,769); ms - 1000 + delta cannot.
    `${ms} = ${ms} - 1000 + delta`,
    `while (${ms} >= 0) {`,
    `  ${ms} = ${ms} - 1000`,
    `  ${s} = ${s} + 1`,
    '}',
    `${ms} = ${ms} + 1000`,
  ]
  const wraps = options.wraps
  if (wraps) lines.push(`${wraps.declare ? 'var ' : ''}${wraps.name} = 0`)
  const loopMs = options.loopMs
  if (loopMs !== undefined) {
    if (!Number.isFinite(loopMs) || loopMs <= 0) throw new Error(`Show clock loop must be positive, got ${loopMs} ms`)
    const loopS = Math.floor(loopMs / 1000)
    const loopRemainderMs = loopMs - loopS * 1000
    const wrapCount = wraps ? [`  ${wraps.name} = ${wraps.name} + 1`] : []
    // A loop past the 16.16 range has a literal that wraps negative under
    // Precise, so a `while` would never exit. One wrap per frame is the most
    // such a loop can need for any in-range delta.
    const wrap = loopMs / 1000 > MAX_16_16_INTEGER ? 'if' : 'while'
    if (loopRemainderMs === 0) {
      lines.push(`${wrap} (${s} >= ${loopS}) {`, `  ${s} = ${s} - ${loopS}`, ...wrapCount, '}')
    } else {
      lines.push(
        `${wrap} (${s} > ${loopS} || (${s} == ${loopS} && ${ms} >= ${loopRemainderMs})) {`,
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
    lines.push(`${SHOW_CLOCK_LOOP_HOLD}${loopMs / 1000}) __pxlblz_show_elapsed_s = ${loopMs / 1000} - ${ONE_LSB}`)
  }
  return lines.join(`\n${options.indent ?? '  '}`)
}

/**
 * A Show instant written as the advance derives the register, so the clock at
 * exactly `atMs` equals it bit for bit in Fast and Precise. A decimal literal
 * would differ by one binary64 ulp on a round-to-even tie of `s + ms / 1000`.
 */
export function emitShowClockInstant(atMs: number): string {
  const wholeS = Math.floor(atMs / 1000)
  const remainderMs = atMs - wholeS * 1000
  if (remainderMs === 0) return `${wholeS}`
  return wholeS === 0 ? `${remainderMs} / 1000` : `${wholeS} + ${remainderMs} / 1000`
}

/** Leading text of the loop-point hold, the advance's last statement. */
export const SHOW_CLOCK_LOOP_HOLD = 'if (__pxlblz_show_elapsed_s >= '

/** Clock position in ms after the advance, for post-wrap delta delivery. */
export const SHOW_CLOCK_POSITION_MS = `${SHOW_CLOCK_WHOLE_S} * 1000 + ${SHOW_CLOCK_MS}`
