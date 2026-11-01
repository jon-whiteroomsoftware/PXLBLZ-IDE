// #1204: the Show clock against the exact sum of the deltas the runtime delivered.
// Executed through the real bundle/load/shim pipeline in Fast and Precise.
import { describe, expect, it } from 'vitest'
import { Q } from '../test/showStepCalendarOracle'
import { bundle } from './bundle'
import { loadPattern } from './loadPattern'
import { createFxShim, createShim, planeShimConfig } from './shim'
import { compileShow } from './showCompiler'
import { emitShowClockAdvance, emitShowClockInstant, showClockInstantValue, SHOW_CLOCK_LOOP_HOLD, SHOW_CLOCK_MS_DECLARATION } from './showClockEmit'

type Mode = 'fast' | 'precise'
const LEGACY = (loopMs: number) => `__pxlblz_show_elapsed_s = (__pxlblz_show_elapsed_s + delta / 1000) % ${loopMs / 1000}`

function program(advance: string): string {
  return `var __pxlblz_show_elapsed_s = 0
${SHOW_CLOCK_MS_DECLARATION}
var h_wraps = 0
function h_frame(delta) {
  ${advance}
}
export function beforeRender(delta) {
}
export function render(index) {
  rgb(0, 0, 0)
}`
}

function load(mode: Mode, source: string) {
  const { code, fxCode, metadata } = bundle(source, {})
  const config = { ...planeShimConfig({ rows: 1, cols: 1 }), getVirtualTime: () => 0 }
  const shim = mode === 'precise' ? createFxShim(config) : createShim(config)
  const handle = loadPattern(mode === 'precise' ? fxCode : code, metadata, shim.builtins)
  const fns = handle.getPatternFunctions() as Record<string, (...args: number[]) => number>
  return { handle, fns, enc: shim.encodeScalar }
}

/** Exact delivered delta in ms: the binary64 value, or the raw 16.16 value. */
function deliveredMs(mode: Mode, delta: number, enc: (v: number) => number): Q {
  return mode === 'precise' ? new Q(BigInt(enc(delta)), 65536n) : Q.ofDouble(delta)
}

/** Executed register in seconds, exactly. */
function registerS(mode: Mode, value: number): Q {
  return mode === 'precise' ? new Q(BigInt(value), 65536n) : Q.ofDouble(value)
}

/** Half a 16.16 step for the one rounding, or, on a frame held below the loop
 * point, one step under a loop literal that itself rounds by up to half a step. */
const PRECISE_BOUND_S = new Q(3n, 131072n)
const FAST_BOUND_S = new Q(1n, 1_000_000_000n)

interface Run { maxError: Q; outOfRange: number; frames: number; registerAtEnd: number }

function run(mode: Mode, advance: string, loopMs: number | undefined, deltas: (index: number) => number | null): Run {
  const { handle, fns, enc } = load(mode, program(advance))
  let total = Q.int(0)
  let maxError = Q.int(0)
  let outOfRange = 0
  let wraps = 0n
  let frames = 0
  let register = 0
  const L = loopMs === undefined ? null : Q.int(loopMs)
  for (let index = 0; ; index++) {
    const delta = deltas(index)
    if (delta === null) break
    total = total.add(deliveredMs(mode, delta, enc))
    fns.h_frame(enc(delta))
    const state = handle.getRuntimeState() as Record<string, number>
    register = state.__pxlblz_show_elapsed_s
    // Unwrapped position: reported wraps times L plus the register. Judging the
    // unwrapped value checks wrap counts and the register together, and a binary64
    // sum a few ulps either side of the loop point stays one instant.
    if (L) wraps += BigInt(mode === 'precise' ? state.h_wraps / 65536 : state.h_wraps)
    const unwrappedS = registerS(mode, register).add(L ? L.mul(Q.int(wraps)).div(Q.int(1000)) : Q.int(0))
    const error = unwrappedS.sub(total.div(Q.int(1000)))
    const magnitude = error.lt(Q.int(0)) ? Q.int(0).sub(error) : error
    if (magnitude.gt(maxError)) maxError = magnitude
    if (L && (registerS(mode, register).lt(Q.int(0)) || registerS(mode, register).ge(L.div(Q.int(1000))))) outOfRange++
    frames++
  }
  return { maxError, outOfRange, frames, registerAtEnd: register }
}

const fixed = (deltaMs: number, totalMs: number) => (index: number) => (index + 1) * deltaMs <= totalMs + 1e-6 ? deltaMs : null
/** Deterministic variable 1-45 ms deltas (LCG). */
const variable = (totalMs: number) => {
  let seed = 1204
  let elapsed = 0
  return () => {
    if (elapsed >= totalMs) return null
    seed = (seed * 1103515245 + 12345) % 2147483648
    const delta = 1 + (seed / 2147483648) * 44
    elapsed += delta
    return delta
  }
}
const list = (values: number[], then: (index: number) => number | null) => (index: number) => index < values.length ? values[index] : then(index - values.length)

const LOOPS = [48_600, 49_000, 15_000, 1_001, 700]
/** The largest value a 16.16 register holds, exact in binary64. */
const MAX_DELIVERY_MS = 32_767 + 65_535 / 65_536
const bound = (mode: Mode) => mode === 'precise' ? PRECISE_BOUND_S : FAST_BOUND_S

describe.each(['fast', 'precise'] as const)('Show clock tracks the exact delta sum (%s)', (mode) => {
  it.each(LOOPS)('loop %d ms: fixed 50, 1000/60 and 1000/30 ms over ten loops', (loopMs) => {
    const advance = emitShowClockAdvance({ loopMs, wraps: { name: 'h_wraps', declare: false } })
    for (const deltaMs of [50, 1000 / 60, 1000 / 30]) {
      const result = run(mode, advance, loopMs, fixed(deltaMs, loopMs * 10))
      expect(result.frames).toBeGreaterThan(9 * loopMs / deltaMs)
      expect(result.maxError.le(bound(mode)), `${loopMs} ms at ${deltaMs} ms: max error ${result.maxError.toNumber()} s`).toBe(true)
      expect(result.outOfRange).toBe(0)
    }
  }, 120_000)

  it.each(LOOPS)('loop %d ms: variable deltas and large deltas, including multi-loop deliveries', (loopMs) => {
    const advance = emitShowClockAdvance({ loopMs, wraps: { name: 'h_wraps', declare: false } })
    for (const deltas of [variable(loopMs * 10), list([1500, 31_000, 999.5, 0, 1, 31_000], fixed(1000 / 60, 3 * loopMs))]) {
      const result = run(mode, advance, loopMs, deltas)
      expect(result.maxError.le(bound(mode)), `${loopMs} ms: max error ${result.maxError.toNumber()} s`).toBe(true)
      expect(result.outOfRange).toBe(0)
    }
  }, 120_000)

  // Deliveries whose sum with the ms accumulator passes the 16.16 range (#1204
  // review P1): the accumulator sits at 999 ms, then the delivery is the largest
  // in-range sum (31,768 ms), the first sum past 32,767 (31,769 ms), or the
  // largest 16.16 value; 900 then 32,000 ms is the reviewer's case.
  it.each(LOOPS)('loop %d ms: deliveries whose sum with the accumulator passes 32,767 ms', (loopMs) => {
    const advance = emitShowClockAdvance({ loopMs, wraps: { name: 'h_wraps', declare: false } })
    for (const values of [[999, 31_768], [999, 31_769], [999, MAX_DELIVERY_MS], [900, 32_000], [32_000, 15_999, 32_000], [999, MAX_DELIVERY_MS, 999, MAX_DELIVERY_MS]]) {
      const result = run(mode, advance, loopMs, list(values, fixed(1000 / 60, loopMs)))
      expect(result.maxError.le(bound(mode)), `${loopMs} ms after ${values}: max error ${result.maxError.toNumber()} s`).toBe(true)
      expect(result.outOfRange).toBe(0)
    }
  }, 120_000)

  // Loops at the 32,767 s horizon (#1204 review round 2 P1): the whole-seconds
  // carry must not pass 32,767 before the loop wraps it. 1,023 deliveries of
  // 32,000 ms reach 32,736 s, then 10,000 ms and largest-value deliveries cross
  // the loop point; 32,734 s is the longest loop whose unshifted carry fits.
  it.each([32_767_000, 32_766_500, 32_734_000])('loop %d ms: deliveries crossing a loop at the 32,767 s horizon', (loopMs) => {
    const advance = emitShowClockAdvance({ loopMs, wraps: { name: 'h_wraps', declare: false } })
    const approach = (index: number) => index < 1_023 ? 32_000 : null
    for (const tail of [[10_000, 10_000, 10_000, 10_000], [999, MAX_DELIVERY_MS, MAX_DELIVERY_MS], [500, 31_769, 31_769]]) {
      const deltas = (index: number) => approach(index) ?? (index - 1_023 < tail.length ? tail[index - 1_023] : null)
      const result = run(mode, advance, loopMs, deltas)
      expect(result.maxError.le(bound(mode)), `${loopMs} ms after ${tail}: max error ${result.maxError.toNumber()} s`).toBe(true)
      expect(result.outOfRange).toBe(0)
    }
  }, 120_000)

  it('reads 32.9 s after 900 then 32,000 ms on the 48,600 ms loop (review P1)', () => {
    const result = run(mode, emitShowClockAdvance({ loopMs: 48_600 }), 48_600, list([900, 32_000], () => null))
    const expected = mode === 'precise' ? Math.round(32.9 * 65536) : 32 + 900 / 1000
    expect(result.registerAtEnd).toBe(expected)
  })

  it('a delivery crossing the loop point lands past it and counts one wrap', () => {
    // 32,000 + 15,999 + 32,000 ms on the 48,600 ms loop is 31,399 ms into the
    // next pass, and 999 + 32,000 ms passes 32,767 before the carry.
    const advance = emitShowClockAdvance({ loopMs: 48_600, wraps: { name: 'h_wraps', declare: false } })
    const { handle, fns, enc } = load(mode, program(advance))
    for (const delta of [32_000, 15_999, 32_000]) fns.h_frame(enc(delta))
    const state = handle.getRuntimeState() as Record<string, number>
    expect(state.__pxlblz_show_elapsed_s).toBe(mode === 'precise' ? Math.round(31.399 * 65536) : 31 + 399 / 1000)
    expect(state.h_wraps).toBe(mode === 'precise' ? 65536 : 1)
  })

  it('non-looping clock stays exact over 486 s', () => {
    const result = run(mode, emitShowClockAdvance(), undefined, fixed(1000 / 60, 486_000))
    expect(result.maxError.le(bound(mode)), `max error ${result.maxError.toNumber()} s`).toBe(true)
  }, 120_000)
})

// Domain sweep (#1204 eng-lead decision 9). Every loop class, from every state
// extreme, under every delivery extreme and the two-frame pairs with the largest
// delivery. Loops are whole ms (V2 Show End is a safe integer, legacy durations
// are rounded) with no authored ceiling, so the domain runs from 1 ms to
// 32,767,999 ms, the longest loop whose literal 16.16 holds. The wrapping shim
// turns an overflow anywhere into a wrong clock, count or range.
const ONE_LSB_MS = 1 / 65_536
/** The longest supported clock: a non-looping clock whose largest delivery still fits. */
const NONE_MAX_S = 32_767 - 33
const SWEEP_LOOPS: (number | undefined)[] = [undefined, 1, 700, 999, 1_000, 49_000, 1_001, 48_600, 32_767_000, 32_767_999]
const SWEEP_DELIVERIES = [0, ONE_LSB_MS, 999, 1_000, 31_768, 32_000, MAX_DELIVERY_MS]
const WRAP_COUNT_MAX = 32_767
const MAX_16_16_INTEGER_S = 32_767
/** The largest 16.16 value, 32,767.99998474 s, in ms: a non-looping clock's last exact position. */
const NONE_HORIZON_MS = (32_768 * 65_536 - 1) / 65_536 * 1000
/** The largest register's fraction in ms: 1,000 LSB below 1,000 ms, on the 16.16 grid. */
const LAST_FRACTION_MS = 1000 - 1000 / 65_536

function sweepStates(loopMs: number | undefined): { s: number; ms: number }[] {
  const lastS = loopMs === undefined ? NONE_MAX_S : Math.ceil(loopMs / 1000) - 1
  const remainderMs = loopMs === undefined ? 0 : loopMs % 1000
  const states = [0, lastS].flatMap(s => [0, 1000 - ONE_LSB_MS, ...(remainderMs ? [remainderMs - ONE_LSB_MS] : [])].map(ms => ({ s, ms })))
  // A non-looping clock also starts at its last whole second and at the largest register.
  if (loopMs === undefined) states.push({ s: MAX_16_16_INTEGER_S, ms: 0 }, { s: MAX_16_16_INTEGER_S, ms: LAST_FRACTION_MS })
  const reachable = states.filter(({ s, ms }) => loopMs === undefined || s * 1000 + ms < loopMs)
  return reachable.filter((state, index) => reachable.findIndex(other => other.s === state.s && other.ms === state.ms) === index)
}

function sweepSequences(): number[][] {
  return SWEEP_DELIVERIES.flatMap(delta => [[delta], [delta, MAX_DELIVERY_MS], [MAX_DELIVERY_MS, delta]])
}

function sweepProgram(loopMs: number | undefined): string {
  const hold = loopMs === undefined ? '' : `\n  ${SHOW_CLOCK_LOOP_HOLD}${loopMs / 1000}) __pxlblz_show_elapsed_s = ${loopMs / 1000} - 0.0000152587890625`
  return program(emitShowClockAdvance({ ...(loopMs === undefined ? {} : { loopMs }), wraps: { name: 'h_wraps', declare: false } })).replace(
    'export function beforeRender',
    // The state as the advance leaves it: ms, then the register derived once.
    `function h_set(s, ms) {
  __pxlblz_show_clock_ms = ms
  __pxlblz_show_elapsed_s = s + ms / 1000${hold}
}
export function beforeRender`,
  )
}

interface SweepFailure { loopMs: number | undefined; start: string; deltas: number[]; frame: number; reason: string }

function sweep(mode: Mode, loopMs: number | undefined): SweepFailure[] {
  const { handle, fns, enc } = load(mode, sweepProgram(loopMs))
  const L = loopMs === undefined ? null : Q.int(loopMs)
  const failures: SweepFailure[] = []
  for (const { s, ms } of sweepStates(loopMs)) {
    for (const deltas of sweepSequences()) {
      // A clock with no loop is defined at or below the largest 16.16 value, 32,767.99998474 s.
      if (!L && s * 1000 + ms + deltas.reduce((sum, delta) => sum + delta, 0) > NONE_HORIZON_MS) continue
      fns.h_set(enc(s), enc(ms))
      let position = Q.int(s * 1000).add(deliveredMs(mode, ms, enc))
      deltas.forEach((delta, frame) => {
        fns.h_frame(enc(delta))
        position = position.add(deliveredMs(mode, delta, enc))
        const state = handle.getRuntimeState() as Record<string, number>
        const register = registerS(mode, state.__pxlblz_show_elapsed_s)
        const wraps = mode === 'precise' ? state.h_wraps / 65_536 : state.h_wraps
        const fail = (reason: string) => failures.push({ loopMs, start: `${s} s + ${ms} ms`, deltas, frame, reason })
        // Exact modular sum: wraps = floor(position / L), register = the remainder.
        const exactWraps = L ? position.div(L).floor() : 0n
        if (L && (register.lt(Q.int(0)) || register.ge(L.div(Q.int(1000))))) fail(`register ${register.toNumber()} s outside the loop`)
        // A 16.16 count holds at most 32,767 wraps; only a 1 ms loop can need more.
        const countable = exactWraps <= BigInt(WRAP_COUNT_MAX)
        const expectedWraps = countable ? exactWraps : BigInt(WRAP_COUNT_MAX)
        // The unwrapped position judges count and register together, so a binary64
        // sum a few ulps either side of the loop point stays one instant.
        const unwrapped = register.add(L ? L.mul(Q.int(countable ? BigInt(wraps) : exactWraps)).div(Q.int(1000)) : Q.int(0))
        const error = unwrapped.sub(position.div(Q.int(1000)))
        const magnitude = error.lt(Q.int(0)) ? Q.int(0).sub(error) : error
        if (magnitude.gt(bound(mode))) fail(`clock ${register.toNumber()} s with ${wraps} wraps, exact ${position.toNumber() / 1000} s (${exactWraps} wraps)`)
        if (!countable && BigInt(wraps) !== expectedWraps) fail(`wrap count ${wraps}, expected the saturated ${expectedWraps}`)
        position = L ? position.sub(L.mul(Q.int(exactWraps))) : position
      })
    }
  }
  return failures
}

describe.each(['fast', 'precise'] as const)('domain sweep: the clock equals the exact modular sum (%s)', (mode) => {
  it.each(SWEEP_LOOPS.map(loopMs => [loopMs === undefined ? 'none' : `${loopMs} ms`, loopMs] as const))('loop %s', (_label, loopMs) => {
    const failures = sweep(mode, loopMs)
    expect(failures.slice(0, 5), `${failures.length} failures`).toEqual([])
  }, 120_000)
})

describe('non-looping horizon', () => {
  // Decision 10: the non-looping clock is exact at or below the largest register; later positions wrap, as base's did.
  it.each([
    ['the largest register, delivered nothing', LAST_FRACTION_MS, 0],
    ['the last whole second, delivered up to the largest register', 0, LAST_FRACTION_MS],
  ])('%s reads 32,767 + 65,535/65,536 s in Precise', (_label, ms, delta) => {
    const { handle, fns, enc } = load('precise', sweepProgram(undefined))
    fns.h_set(enc(MAX_16_16_INTEGER_S), enc(ms))
    fns.h_frame(enc(delta))
    const state = handle.getRuntimeState() as Record<string, number>
    expect(state.__pxlblz_show_elapsed_s).toBe(MAX_16_16_INTEGER_S * 65_536 + 65_535)
  })
})

describe('fault sensitivity', () => {
  it('the pre-#1204 emission fails the same oracle in Precise (rounding accumulates per frame)', () => {
    // advanceTo(48_599, { stepMs: 50 }): 971 steps of 50 ms, then 49 ms.
    const toSample = (index: number) => index < 971 ? 50 : index === 971 ? 49 : null
    const legacy = run('precise', LEGACY(48_600), 48_600, toSample)
    expect(legacy.maxError.gt(new Q(2n, 1000n)), `legacy max error ${legacy.maxError.toNumber()} s`).toBe(true)
    // The original report: the legacy clock reads 48.601959 s before 48.6 s of deltas, so it has rolled over.
    expect(legacy.registerAtEnd).toBe(128)
    const fixedClock = run('precise', emitShowClockAdvance({ loopMs: 48_600 }), 48_600, toSample)
    expect(fixedClock.registerAtEnd / 65536).toBeLessThan(48.6)
  })
})

describe('emission', () => {
  it('rejects a non-positive loop', () => {
    expect(() => emitShowClockAdvance({ loopMs: 0 })).toThrow(/positive/)
  })

  it('stays plain Pixelblaze arithmetic with no value above 32,767', () => {
    const text = emitShowClockAdvance({ loopMs: 48_600, wraps: { name: 'w', declare: true } })
    expect(text).not.toMatch(/delta \/ 1000/)
    // Whole seconds are carried and wrapped shifted by the loop's whole seconds.
    expect(text).toContain('floor(__pxlblz_show_elapsed_s - __pxlblz_show_clock_ms / 1000 + 0.5) - 48')
    expect(text).toContain('while (__pxlblz_show_clock_s > 0 || (__pxlblz_show_clock_s == 0 && __pxlblz_show_clock_ms >= 600))')
    expect(text).toContain('__pxlblz_show_clock_s = __pxlblz_show_clock_s + 48')
    expect(emitShowClockAdvance({ loopMs: 49_000 })).toContain('while (__pxlblz_show_clock_s >= 0)')
    expect(emitShowClockAdvance({ loopMs: 700 })).toContain('floor(__pxlblz_show_elapsed_s - __pxlblz_show_clock_ms / 1000 + 0.5)\n')
  })
})

describe('instants (#1204)', () => {
  // 1,118 ms is a binary64 tie: s + ms / 1000 is one ulp below the decimal
  // literal. The others are not; together they cover sub-second, past 32.767 s
  // and the 48,599 ms #1197 sample.
  const INSTANTS = [700, 1_118, 1_600, 33_123, 48_599]
  const instantProgram = (loopMs: number) => program(emitShowClockAdvance({ loopMs })).replace(
    'export function beforeRender',
    `${INSTANTS.map((atMs, index) => `function h_instant${index}() { return ${emitShowClockInstant(atMs)} }`).join('\n')}
export function beforeRender`,
  )

  it.each(['fast', 'precise'] as const)('equal the register bit for bit when the clock lands on them (%s)', (mode) => {
    const { handle, fns, enc } = load(mode, instantProgram(49_000))
    let positionMs = 0
    INSTANTS.forEach((atMs, index) => {
      // Whole-ms deliveries of at most 1,000 ms land exactly on the instant.
      while (positionMs < atMs) {
        const delta = Math.min(1_000, atMs - positionMs)
        fns.h_frame(enc(delta))
        positionMs += delta
      }
      const register = (handle.getRuntimeState() as Record<string, number>).__pxlblz_show_elapsed_s
      expect(register, `${atMs} ms`).toBe(fns[`h_instant${index}`]())
    })
  })

  it('differ from the decimal literal on a binary64 tie, which is why they exist', () => {
    expect(1 + 118 / 1000).not.toBe(1.118)
    expect(emitShowClockInstant(1_118)).toBe('1 + 118 / 1000')
    expect(emitShowClockInstant(118)).toBe('118 / 1000')
    expect(emitShowClockInstant(49_000)).toBe('49')
  })
})

describe('instant literals (#1204 decision 12)', () => {
  // The compile-time literal of the clock's route reads as the register the
  // clock derives, in both modes, for every ms remainder. Whole seconds 1 and
  // 48 cover a binary64 tie band (1,118 ms) and the #1197 loop.
  it.each(['fast', 'precise'] as const)('equal the clock route for every remainder 0 to 999 (%s)', (mode) => {
    for (const wholeS of [0, 1, 48, 32_000]) {
      const atMs = (ms: number) => wholeS * 1000 + ms
      const fns = Array.from({ length: 1000 }, (_, ms) => `function h_r${ms}() { return ${emitShowClockInstant(atMs(ms))} }
function h_l${ms}() { return ${showClockInstantValue(atMs(ms))} }`)
      const { fns: loaded } = load(mode, program('').replace('export function beforeRender', `${fns.join('\n')}\nexport function beforeRender`))
      const mismatches = Array.from({ length: 1000 }, (_, ms) => ms).filter(ms => loaded[`h_l${ms}`]() !== loaded[`h_r${ms}`]())
      expect(mismatches, `${wholeS} s`).toEqual([])
    }
  })

  it('is the binary64 route, not the decimal, on a tie', () => {
    expect(showClockInstantValue(1_118)).toBe(1 + 118 / 1000)
    expect(showClockInstantValue(1_118)).not.toBe(1.118)
    expect(showClockInstantValue(49_000)).toBe(49)
  })
})

describe('authored boundaries (#1204 decision 8)', () => {
  // A delivery that lands exactly on a cut shows the incoming member. The cut's
  // instant must be the clock's own route, not a decimal literal: 1,118 ms is a
  // binary64 tie, and 1,600 ms has a fraction past half a 16.16 step.
  const memberSource = (id: number) => `export var who = 0
export function beforeRender(delta) { who = ${id} }
export function render(index) { rgb(who, 0, 0) }`
  it.each([
    ['fast', 1_118], ['precise', 1_118], ['fast', 1_600], ['precise', 1_600],
  ] as const)('a %s cut at %i ms reached exactly shows the incoming member', (mode, cutMs) => {
    const artifact = compileShow({ clips: [{ id: 'from', source: memberSource(1) }, { id: 'to', source: memberSource(2) }], cut: { startMs: cutMs } }, {})
    const config = { ...planeShimConfig({ rows: 1, cols: 1 }), getVirtualTime: () => 0 }
    const shim = mode === 'precise' ? createFxShim(config) : createShim(config)
    const handle = loadPattern(mode === 'precise' ? artifact.fxCode : artifact.code, artifact.metadata, shim.builtins)
    const phase = () => (handle.getRuntimeState() as Record<string, number>).__pxlblz_show_phase
    handle.beforeRender(shim.encodeScalar(cutMs - 1))
    expect(phase(), 'one ms before the cut').toBe(0)
    handle.beforeRender(shim.encodeScalar(1))
    expect(phase(), 'exactly on the cut').toBe(shim.encodeScalar(2))
  })
})

describe('wrap count', () => {
  it('saturates at 32,767 only where a frame can wrap more often (#1204 round 2 P2)', () => {
    const w = { name: 'w', declare: true }
    expect(emitShowClockAdvance({ loopMs: 1, wraps: w })).toContain('if (w < 32767) w = w + 1')
    expect(emitShowClockAdvance({ loopMs: 2, wraps: w })).not.toContain('if (w < 32767)')
    expect(emitShowClockAdvance({ loopMs: 48_600, wraps: w })).not.toContain('if (w < 32767)')
  })
})

describe('loops past the 16.16 range', () => {
  it('wrap with `if`, because the loop literal itself wraps negative under Precise', () => {
    expect(emitShowClockAdvance({ loopMs: 32_767_000 })).toContain('while (__pxlblz_show_clock_s >= 0)')
    expect(emitShowClockAdvance({ loopMs: 32_768_000 })).toContain('if (__pxlblz_show_clock_s >= 32768)')
    expect(emitShowClockAdvance({ loopMs: 40_000_500 })).toContain('if (__pxlblz_show_clock_s > 40000 ||')
  })

  it('start past the longest loop whose literal 16.16 holds', () => {
    expect(emitShowClockAdvance({ loopMs: 32_767_999 })).toContain('while (__pxlblz_show_clock_s > 0 ||')
    expect(emitShowClockAdvance({ loopMs: 32_767_999 })).toContain('floor(__pxlblz_show_elapsed_s - __pxlblz_show_clock_ms / 1000 + 0.5) - 32767')
  })

  it('terminate a Precise frame for an out-of-range loop', () => {
    // Values past the 32,767 s horizon are unsupported; the frame must still end.
    const { fns, enc } = load('precise', program(emitShowClockAdvance({ loopMs: 32_768_000 })))
    for (let frame = 0; frame < 3; frame++) fns.h_frame(enc(16))
  })
})
