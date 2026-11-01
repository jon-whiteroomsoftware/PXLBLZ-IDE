// Show clock emission (#1204).
//
// `__pxlblz_show_elapsed_s` is the Show clock in seconds. Advancing it by
// `delta / 1000` every frame rounds that quotient to 1/65536 s under 16.16, and
// the rounding bias is fixed for a fixed delta, so the error grows linearly with
// frame count (about 12 ms per 48.6 s loop at 60 fps). Instead the clock keeps
// whole seconds plus a millisecond accumulator in [0, 1000): summing `delta` in
// milliseconds is exact in 16.16, carries and loop wraps use exact comparison and
// subtraction, and the seconds value is derived with one rounding per frame.
//
// Domain: any 16.16 delivery in [0, 32,767.99998] ms; no loop, exact for
// positions at or below 32,767.99998474 s (the largest register within half a
// step) and holding there after it; or any loop whose literal 16.16 holds (1 ms
// to 32,767,999 ms; authoring sets no ceiling).
// Ranges over that domain, L the loop's whole seconds (shift L when L > 0, and
// 32,767 with no loop, so s - 32,767 + carries is in [-32,767, 32]):
//   ms - 1000 + delta      [-1000, 31,768)    ms gives up 1,000 before the add
//   carries per frame      [0, 32]
//   s - L + carries        [-L, 32]           shifted seconds before the wrap
//   wrap borrow (s - 1)    >= -L              a borrow follows s >= 1
//   s after the wrap       [0, L], register   [0, loop)
//   wraps per frame        <= 1 + 32,768 / loop ms: 33 for loops >= 1 s and
//                          32,768 at 1 ms, so a count that can pass 32,767 saturates
// Full table and sweep: proof-1204.md, `showClockEmit.test.ts` "domain sweep".

/** 2^-16, exact in binary64 and 16.16. */
const ONE_LSB = '0.0000152587890625'
/** Largest whole value a 16.16 register holds. */
const MAX_16_16_INTEGER = 32_767
/** Largest value a 16.16 register holds. */
const MAX_16_16 = MAX_16_16_INTEGER + 65_535 / 65_536
/** The largest register's fraction in ms, 1,000 LSB below 1,000 ms: exact in 16.16. */
const LAST_FRACTION_MS = 1000 - 1000 / 65_536

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
  const loopMs = options.loopMs
  if (loopMs !== undefined && (!Number.isFinite(loopMs) || loopMs <= 0)) throw new Error(`Show clock loop must be positive, got ${loopMs} ms`)
  const loopS = loopMs === undefined ? 0 : Math.floor(loopMs / 1000)
  const loopRemainderMs = loopMs === undefined ? 0 : loopMs - loopS * 1000
  // A loop past the 16.16 range has a literal that wraps negative under
  // Precise, so a `while` would never exit. One wrap per frame is the most
  // such a loop can need for any in-range delta.
  const inRange = loopMs === undefined || loopMs / 1000 <= MAX_16_16
  // Whole seconds give up the loop's whole seconds before the carry, as ms gives
  // up 1,000: s - loopS + carries stays in [-loopS, 32], and a borrow follows
  // s >= 1, so it is at least -loopS. With no loop they give up 32,767, so the
  // carry cannot pass the largest whole value and the hold compares with 0.
  const shift = loopMs === undefined ? MAX_16_16_INTEGER : inRange && loopS > 0 ? loopS : 0
  const lines = [
    // The register is s + ms / 1000 rounded once, so subtracting the same
    // quotient recovers s exactly; + 0.5 tolerates any sub-half-second write.
    `var ${s} = floor(__pxlblz_show_elapsed_s - ${ms} / 1000 + 0.5)${shift ? ` - ${shift}` : ''}`,
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
  if (loopMs !== undefined) {
    // A frame wraps at most 1 + 32,768 / loopMs times (a position below the
    // loop plus the largest delivery). Past 32,767 the count would wrap
    // negative and read as no wrap, so it saturates instead (a 1 ms loop).
    const saturate = 1 + (MAX_16_16_INTEGER + 1) / loopMs > MAX_16_16_INTEGER
    const wrapCount = wraps
      ? [`  ${saturate ? `if (${wraps.name} < ${MAX_16_16_INTEGER}) ` : ''}${wraps.name} = ${wraps.name} + 1`]
      : []
    const wrap = inRange ? 'while' : 'if'
    // Seconds compared with the loop's whole seconds, in shifted terms.
    const whole = loopS - shift
    if (loopRemainderMs === 0) {
      lines.push(`${wrap} (${s} >= ${whole}) {`, `  ${s} = ${s} - ${loopS}`, ...wrapCount, '}')
    } else {
      lines.push(
        `${wrap} (${s} > ${whole} || (${s} == ${whole} && ${ms} >= ${loopRemainderMs})) {`,
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
  } else {
    // Decision 10: past the largest register the clock holds there, at
    // 32,767 s plus the largest fraction, which ms / 1000 reads exactly. Held
    // ms keeps the next frame's derived seconds at 32,767.
    lines.push(`if (${s} > 0 || (${s} == 0 && ${ms} > ${LAST_FRACTION_MS})) {`, `  ${s} = 0`, `  ${ms} = ${LAST_FRACTION_MS}`, '}')
  }
  if (shift) lines.push(`${s} = ${s} + ${shift}`)
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

/**
 * The register the advance derives at exactly `atMs`, `s + ms / 1000` in
 * binary64, for a comparison with an authored instant (decision 12). Emitted as
 * its shortest round-trip literal, it equals the Fast register bit for bit; a
 * plain `atMs / 1000` literal is one ulp off on a tie (1,118 ms). Precise reads
 * the same register from it as from the plain literal: a whole-ms instant lies
 * on a 16.16 step only when ms is a multiple of 125, where both are exact, and
 * elsewhere they differ by about 1e-16, far from any step or half-step.
 */
export function showClockInstantValue(atMs: number): number {
  const wholeS = Math.floor(atMs / 1000)
  return wholeS + (atMs - wholeS * 1000) / 1000
}

/** Leading text of the loop-point hold, the advance's last statement. */
export const SHOW_CLOCK_LOOP_HOLD = 'if (__pxlblz_show_elapsed_s >= '

/** Clock position in ms after the advance, for post-wrap delta delivery. */
export const SHOW_CLOCK_POSITION_MS = `${SHOW_CLOCK_WHOLE_S} * 1000 + ${SHOW_CLOCK_MS}`
