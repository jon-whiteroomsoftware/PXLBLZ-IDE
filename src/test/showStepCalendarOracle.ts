// #1211 independent test oracle. Provenance: AF8 oracle.ts (entire event model),
// af8-diagnostics.ts (register models and all 46 scenarios), and AF9 af9-bounds.ts
// (IEEE-754 rational decoding and corrected bound enumeration).
// Sources: .wrsp/1211-af8-design/ and .wrsp/1211-af9-revision/.
// Expectations walk exact effective-time events; no emitter recurrence is reused.
import { fx } from '../engine/fixedpoint'
import type { StepCalendarSpec as CalendarSpec } from '../engine/showStepClockEmit'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
import { planShowStepClock } from '../engine/showStepClockPlan'

const rationalGcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a }
export class R {
  readonly n: bigint
  readonly d: bigint
  constructor(n: bigint, d = 1n) {
    if (d === 0n) throw new Error('zero denominator')
    if (d < 0n) { n = -n; d = -d }
    const g = rationalGcd(n, d) || 1n
    this.n = n / g; this.d = d / g
  }
  static of(v: bigint | number) { return new R(BigInt(v)) }
  add(o: R) { return new R(this.n * o.d + o.n * this.d, this.d * o.d) }
  sub(o: R) { return new R(this.n * o.d - o.n * this.d, this.d * o.d) }
  mul(o: R) { return new R(this.n * o.n, this.d * o.d) }
  cmp(o: R) { const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0 }
  lt(o: R) { return this.cmp(o) < 0 }
  le(o: R) { return this.cmp(o) <= 0 }
  gt(o: R) { return this.cmp(o) > 0 }
  ge(o: R) { return this.cmp(o) >= 0 }
  eq(o: R) { return this.cmp(o) === 0 }
  floor() { const q = this.n / this.d; return this.n < 0n && q * this.d !== this.n ? q - 1n : q }
  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}` }
  /** Decimal rendering for humans only; never used in a comparison. */
  approx(digits = 18) {
    const neg = this.n < 0n, n = neg ? -this.n : this.n
    const whole = n / this.d
    let rem = n % this.d, frac = ''
    for (let i = 0; i < digits; i++) { rem *= 10n; frac += (rem / this.d).toString(); rem %= this.d }
    return `${neg ? '-' : ''}${whole}.${frac}`
  }
}
const pow2 = (k: number) => k >= 0 ? new R(1n << BigInt(k)) : new R(1n, 1n << BigInt(-k))
const HALF = new R(1n, 2n)
const ONE = R.of(1)
const THOUSAND = R.of(1000)

// ------------------------------------------------------- exact binary64 I/O

const view = new DataView(new ArrayBuffer(8))
const bitsOf = (x: number) => { view.setFloat64(0, x); return view.getBigUint64(0) }
const ofBits = (b: bigint) => { view.setBigUint64(0, b); return view.getFloat64(0) }
/** Exact value of a finite binary64, from its sign, exponent and significand bits. */
export function exactDouble(x: number): R {
  const b = bitsOf(x)
  const sign = b >> 63n, exp = (b >> 52n) & 0x7ffn, man = b & ((1n << 52n) - 1n)
  if (exp === 0x7ffn) throw new Error('non-finite')
  const sig = exp === 0n ? man : man | (1n << 52n)
  const e2 = exp === 0n ? -1074n : exp - 1075n
  const mag = e2 >= 0n ? new R(sig << e2) : new R(sig, 1n << -e2)
  return sign ? R.of(0).sub(mag) : mag
}
/** k representable steps from a non-negative binary64 (k < 0 steps down). */
export const ulps = (x: number, k: number) => ofBits(bitsOf(x) + BigInt(k))
/** Exact rational of a decimal literal string, e.g. '0.9994999999999999'. */
export function exactDecimal(text: string): R {
  const [whole, frac = ''] = text.split('.')
  return new R(BigInt(whole + frac), 10n ** BigInt(frac.length))
}

// AF9 endpoint and interval bounds (exact comparisons, no tolerance).
export const BOUNDS = {
  fast: { endpointLowExclusive: R.of(0).sub(HALF), endpointHigh: HALF.add(pow2(-44)), intervalExclusive: ONE.add(pow2(-44)) },
  precise: { endpointLow: new R(-4095n, 8192n), endpointHigh: HALF, interval: new R(8191n, 8192n) },
  // Claims being replaced (AF8 sections 6.1, 6.2, 6.4).
  af8: { fastIntervalStrictBelow: ONE, fastEndpointAllowance: HALF.add(new R(2n, 10n ** 13n)) },
}

// AF8 #1211 independent calendar oracle (design diagnostic, not product code).
//
// Exact BigInt rationals throughout. The oracle walks events from the origin;
// it shares no expression, packed tick, carry or float recurrence with the
// emitted calendar. Semantics (AF3 accepted rules 1-5, AF8 D3/D4/D6):
// - Effective time E advances only inside the advancing set W, which repeats
//   every loop L. Requests R are right-continuous and repeat every loop.
// - Boundary zero P is the first instant >= origin inside W.
// - A positive request q: the next boundary is the first instant at which E
//   has advanced q since the step began; sample R at that exact instant.
// - Request 0 is continuous until the next change point (authored change or
//   loop seam), where R is sampled again.
// - Delivered motion at tick z is E(z) while continuous, otherwise E at the
//   last owned boundary, rounded up to whole ms (the declared whole-ms
//   delivery of a quantized non-integer request).

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b) [a, b] = [b, a % b]
  return a
}

export class Q {
  readonly n: bigint
  readonly d: bigint
  constructor(n: bigint, d: bigint = 1n) {
    if (d === 0n) throw new Error('zero denominator')
    if (d < 0n) { n = -n; d = -d }
    const g = gcd(n, d) || 1n
    this.n = n / g
    this.d = d / g
  }
  static int(v: number | bigint): Q {
    if (typeof v === 'number' && !Number.isInteger(v)) throw new Error(`Q.int needs an integer, got ${v}`)
    return new Q(BigInt(v))
  }
  /** Exact value of a binary64 number. */
  static ofDouble(x: number): Q {
    const exact = exactDouble(x)
    return new Q(exact.n, exact.d)
  }
  add(o: Q): Q { return new Q(this.n * o.d + o.n * this.d, this.d * o.d) }
  sub(o: Q): Q { return new Q(this.n * o.d - o.n * this.d, this.d * o.d) }
  mul(o: Q): Q { return new Q(this.n * o.n, this.d * o.d) }
  div(o: Q): Q { return new Q(this.n * o.d, this.d * o.n) }
  cmp(o: Q): number { const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0 }
  lt(o: Q) { return this.cmp(o) < 0 }
  le(o: Q) { return this.cmp(o) <= 0 }
  gt(o: Q) { return this.cmp(o) > 0 }
  ge(o: Q) { return this.cmp(o) >= 0 }
  eq(o: Q) { return this.cmp(o) === 0 }
  floor(): bigint { const q = this.n / this.d; return this.n < 0n && q * this.d !== this.n ? q - 1n : q }
  ceil(): bigint { return -new Q(-this.n, this.d).floor() }
  isInt() { return this.d === 1n }
  toNumber() { return Number(this.n) / Number(this.d) }
  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}` }
}

export const Q0 = Q.int(0)
const max = (a: Q, b: Q) => (a.ge(b) ? a : b)

export interface OracleSpec {
  loopMs: Q
  windows: Array<{ start: Q; end: Q }>
  initial: Q
  changes: Array<{ at: Q; step: Q }>
}

/** Declared request quantization: whole ms plus a 2^-16 ms residue (round half up). */
export function quantizedRequest(stepMs: number): Q {
  return new Q(BigInt(Math.round(stepMs * 65536)), 65536n)
}

export interface OracleEvent { T: Q; E: Q; q: Q; kind: 'prime' | 'boundary' | 'change' }

export class CalendarOracle {
  readonly events: OracleEvent[] = []
  readonly prime: Q | null

  constructor(readonly spec: OracleSpec, readonly origin: Q) {
    if (spec.windows.some((w, i) => w.start.ge(w.end) || (i > 0 && w.start.lt(spec.windows[i - 1].end)))) {
      throw new Error('windows must be sorted, disjoint and non-empty')
    }
    this.prime = spec.windows.length === 0 ? null : this.firstInW(origin)
    if (this.prime) this.events.push({ T: this.prime, E: Q0, q: this.R(this.prime), kind: 'prime' })
  }

  private epochStart(T: Q): Q { return Q.int(T.div(this.spec.loopMs).floor()).mul(this.spec.loopMs) }
  private local(T: Q): Q { return T.sub(this.epochStart(T)) }

  R(T: Q): Q {
    const x = this.local(T)
    let value = this.spec.initial
    for (const change of this.spec.changes) if (change.at.le(x)) value = change.step
    return value
  }

  inW(T: Q): boolean {
    const x = this.local(T)
    return this.spec.windows.some(w => w.start.le(x) && x.lt(w.end))
  }

  private firstInW(T: Q): Q {
    if (this.inW(T)) return T
    const base = this.epochStart(T)
    const x = T.sub(base)
    const next = this.spec.windows.find(w => w.start.gt(x))
    return next ? base.add(next.start) : base.add(this.spec.loopMs).add(this.spec.windows[0].start)
  }

  private nextChangePoint(T: Q): Q {
    const base = this.epochStart(T)
    const x = T.sub(base)
    const next = this.spec.changes.find(change => change.at.gt(x))
    return next ? base.add(next.at) : base.add(this.spec.loopMs)
  }

  /** First instant at which effective time has advanced `need` (> 0) since T. */
  private reach(T: Q, need: Q): Q {
    let t = T
    let rem = need
    for (;;) {
      const base = this.epochStart(t)
      const x = t.sub(base)
      const w = this.spec.windows.find(window => window.end.gt(x))
      if (!w) { t = base.add(this.spec.loopMs); continue }
      const start = max(x, w.start)
      const len = w.end.sub(start)
      if (rem.le(len)) return base.add(start).add(rem)
      rem = rem.sub(len)
      t = base.add(w.end)
    }
  }

  /** Measure of W in [T1, T2). */
  measure(T1: Q, T2: Q): Q {
    let total = Q0
    let t = T1
    while (t.lt(T2)) {
      const base = this.epochStart(t)
      const x = t.sub(base)
      const epochEnd = base.add(this.spec.loopMs)
      const stop = T2.lt(epochEnd) ? T2.sub(base) : this.spec.loopMs
      for (const w of this.spec.windows) {
        const s = max(x, w.start)
        const e = w.end.lt(stop) ? w.end : stop
        if (s.lt(e)) total = total.add(e.sub(s))
      }
      t = epochEnd
    }
    return total
  }

  extendTo(z: Q) {
    if (!this.prime) return
    while (this.events[this.events.length - 1].T.le(z)) {
      const last = this.events[this.events.length - 1]
      if (last.q.gt(Q0)) {
        const X = this.reach(last.T, last.q)
        this.events.push({ T: X, E: last.E.add(last.q), q: this.R(X), kind: 'boundary' })
      } else {
        const c = this.nextChangePoint(last.T)
        this.events.push({ T: c, E: last.E.add(this.measure(last.T, c)), q: this.R(c), kind: 'change' })
      }
    }
  }

  private lastIndexAtOrBefore(z: Q): number {
    this.extendTo(z)
    let lo = 0, hi = this.events.length - 1, found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.events[mid].T.le(z)) { found = mid; lo = mid + 1 } else hi = mid - 1
    }
    return found
  }

  /** Delivered effective ms since boundary zero at tick z, and the mode in force after z's events. */
  stateAt(z: Q): { primed: boolean; D: Q; continuous: boolean; index: number } {
    const index = this.lastIndexAtOrBefore(z)
    if (index < 0) return { primed: false, D: Q0, continuous: false, index }
    const event = this.events[index]
    if (event.q.eq(Q0)) return { primed: true, D: event.E.add(this.measure(event.T, z)), continuous: true, index }
    return { primed: true, D: Q.int(event.E.ceil()), continuous: false, index }
  }

  boundariesIn(z1: Q | null, z2: Q): number {
    const hi = this.lastIndexAtOrBefore(z2)
    let count = 0
    for (let i = hi; i >= 0; i--) {
      const event = this.events[i]
      if (z1 && event.T.le(z1)) break
      if (event.kind === 'boundary') count++
    }
    return count
  }
}

export interface OracleCall { primedNow: boolean; delivered: Q; called: boolean; boundaries: number; D: Q; primed: boolean }

/** Per-advance expectations for one origin segment: delivered motion and whether the Pattern is called. */
export function oracleCalls(oracle: CalendarOracle, ticks: Q[]): OracleCall[] {
  const out: OracleCall[] = []
  let previous: Q | null = null
  let previousState: ReturnType<CalendarOracle['stateAt']> | null = null
  for (const z of ticks) {
    const state = oracle.stateAt(z)
    const primedBefore = previousState?.primed ?? false
    const primedNow = !primedBefore && state.primed
    const boundaries = oracle.boundariesIn(previous, z)
    const continuousBefore = primedBefore && previousState!.continuous
    const called = primedNow || boundaries > 0 || continuousBefore || (state.primed && state.continuous)
    const delivered = state.D.sub(primedBefore ? previousState!.D : Q0)
    out.push({ primedNow, delivered, called, boundaries, D: state.D, primed: state.primed })
    previous = z
    previousState = state
  }
  return out
}

/**
 * Third, deliberately naive model for oracle self-tests: integer ms only,
 * simulated one millisecond at a time from the origin.
 */
export function bruteForce(spec: { loopMs: number; windows: Array<[number, number]>; initial: number; changes: Array<[number, number]> }, origin: number, zmax: number) {
  const L = spec.loopMs
  const local = (t: number) => ((t % L) + L) % L
  const inW = (t: number) => spec.windows.some(([s, e]) => s <= local(t) && local(t) < e)
  const R = (t: number) => {
    let v = spec.initial
    for (const [at, step] of spec.changes) if (at <= local(t)) v = step
    return v
  }
  const isChangePoint = (t: number) => local(t) === 0 || spec.changes.some(([at]) => at === local(t))
  const out: Array<{ primed: boolean; D: number }> = []
  let primed = false, q = 0, rem = 0, eff = 0, commit = 0
  for (let t = origin; t <= zmax; t++) {
    if (!primed && inW(t)) { primed = true; q = R(t); rem = q; commit = eff }
    out.push({ primed, D: !primed ? 0 : q === 0 ? eff : commit })
    if (!primed) continue
    if (inW(t)) { eff += 1; if (q > 0) rem -= 1 }
    if (q > 0 && rem === 0) { commit = eff; q = R(t + 1); rem = q }
    else if (q === 0 && isChangePoint(t + 1)) { q = R(t + 1); rem = q; commit = eff }
  }
  return out
}


const W = pow2(-43)
export function bandRegisters(s: number, N: number): number[] {
  const t = R.of(N).sub(HALF)
  const low = t.sub(W), high = t.add(W)
  const xOf = (e: number) => THOUSAND.mul(exactDouble(e).sub(R.of(s)))
  let e = s + (N - 0.5) / 1000
  while (xOf(e).ge(low)) e = ulps(e, -1)
  e = ulps(e, 1)
  while (xOf(e).lt(low)) e = ulps(e, 1)
  const out: number[] = []
  while (xOf(e).le(high)) { out.push(e); e = ulps(e, 1) }
  return out
}

export interface PlannedFrame { delta: number; wraps: number; tick: bigint; abs: bigint; regFast?: number; regRaw?: bigint; crossing: { eMs: number; beforeWrap: boolean; abs: bigint } | null; advance: boolean; xMs: Q }

export type Mode = 'fast' | 'precise'

const floorDiv = (a: bigint, b: bigint) => { const q = a / b; return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q }

/** Binary64 evaluation of __pxlblz_tick_now under the Fast shim (frac = v - trunc(v)), in whole ms. */
function fastTickExpression(e: number): bigint {
  let sec = Math.floor(e)
  let m = Math.floor((e - Math.trunc(e)) * 1000 + 0.5)
  if (m >= 1000) { sec = sec + 1; m = 0 }
  return BigInt(sec) * 1000n + BigInt(m)
}

export class FastRegister {
  e = 0
  epoch = 0n
  expressionVsExactHalfUp = 0
  readonly Ls: number
  constructor(readonly loopMs: number) { this.Ls = loopMs / 1000 }
  step(delta: number, restarts: number[]) {
    const prev = this.e
    const unwrapped = prev + delta / 1000
    const next = unwrapped % this.Ls
    const wrapsQ = Q.ofDouble(unwrapped).sub(Q.ofDouble(next)).div(Q.ofDouble(this.Ls))
    if (!wrapsQ.isInt()) throw new Error('non-integer wrap count')
    const wraps = Number(wrapsQ.n)
    // D1/D2: Fast's tick is defined by the emitted expression evaluated in binary64.
    const tick = fastTickExpression(next)
    if (tick !== Q.ofDouble(next).mul(Q.int(1000)).add(new Q(1n, 2n)).floor()) this.expressionVsExactHalfUp++
    let crossing: PlannedFrame['crossing'] = null
    const prevQ = Q.ofDouble(prev)
    const endQ = prevQ.add(Q.ofDouble(delta / 1000))
    for (const eMs of restarts) {
      for (let k = wraps + 1; k >= 0; k--) {
        const ek = Q.ofDouble(eMs / 1000).add(Q.ofDouble(this.Ls).mul(Q.int(k)))
        if (prevQ.lt(ek) && ek.le(endQ)) {
          const abs = (this.epoch + BigInt(k)) * BigInt(this.loopMs) + BigInt(eMs)
          if (!crossing || abs > crossing.abs) crossing = { eMs, beforeWrap: k < wraps, abs }
          break
        }
      }
    }
    this.e = next
    this.epoch += BigInt(wraps)
    return { wraps, tick, abs: this.epoch * BigInt(this.loopMs) + tick, regFast: next, crossing, xMs: this.xMs() }
  }
  xMs() { return Q.int(this.epoch * BigInt(this.loopMs)).add(Q.ofDouble(this.e).mul(Q.int(1000))) }
}

export class PreciseRegister {
  raw = 0n
  epoch = 0n
  readonly Lraw: bigint
  constructor(readonly loopMs: number) {
    const literal = BigInt(fx.fromFloat(loopMs / 1000))
    const exact = floorDiv(BigInt(loopMs) * 65536n * 2n + 1000n, 2000n)
    if (literal !== exact) throw new Error(`loop literal ${literal} differs from exact ${exact}`)
    this.Lraw = exact
  }
  step(delta: number, restarts: number[]) {
    const dRaw = BigInt(fx.fromFloat(delta))
    const inc = floorDiv(dRaw + 500n, 1000n)
    const sum = this.raw + inc
    if (sum > 2147483647n) throw new Error('Precise register would overflow (inherited L + delta horizon)')
    const next = sum % this.Lraw
    const wraps = Number((sum - next) / this.Lraw)
    const tick = floorDiv(next * 1000n + 32768n, 65536n)
    let crossing: PlannedFrame['crossing'] = null
    for (const eMs of restarts) {
      const eRaw = BigInt(fx.fromFloat(eMs / 1000))
      for (let k = wraps + 1; k >= 0; k--) {
        const ek = eRaw + BigInt(k) * this.Lraw
        if (this.raw < ek && ek <= sum) {
          const abs = (this.epoch + BigInt(k)) * BigInt(this.loopMs) + BigInt(eMs)
          if (!crossing || abs > crossing.abs) crossing = { eMs, beforeWrap: k < wraps, abs }
          break
        }
      }
    }
    this.raw = next
    this.epoch += BigInt(wraps)
    return { wraps, tick, abs: this.epoch * BigInt(this.loopMs) + tick, regRaw: next, crossing, xMs: this.xMs() }
  }
  xMs() { return Q.int(this.epoch * BigInt(this.loopMs)).add(new Q(this.raw * 1000n, 65536n)) }
}

// --------------------------------------------------------------- scenarios

type FrameGen = (mode: Mode, regSeconds: number, index: number, nominalMs: number) => number | null
export interface Scenario {
  name: string
  spec: CalendarSpec
  gen: FrameGen
  advance?: (mode: Mode, localTickMs: number, index: number) => boolean
  deterministic?: boolean
  restarts?: number[]
  family?: string
  modes?: Mode[]
}

const fixed = (stepMs: number, totalMs: number): FrameGen => (_m, _r, _i, nominal) => nominal + 1e-9 >= totalMs ? null : stepMs
const listThen = (list: number[], then: FrameGen): FrameGen => (m, r, i, n) => i < list.length ? list[i] : then(m, r, i - list.length, n)
const perMode = (fast: FrameGen, precise: FrameGen): FrameGen => (m, r, i, n) => (m === 'fast' ? fast : precise)(m, r, i, n)
const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const jitter = (seed: number, totalMs: number, lo = 4, hi = 48): FrameGen => {
  const cache: number[] = []
  const rnd = mulberry32(seed)
  return (_m, _r, i, nominal) => {
    if (nominal >= totalMs) return null
    while (cache.length <= i) cache.push(lo + rnd() * (hi - lo))
    return cache[i]
  }
}
const full = (loopMs: number) => [{ startMs: 0, endMs: loopMs }]
const spec = (loopMs: number, initialStepMs: number, changes: Array<[number, number]>, windows = full(loopMs)): CalendarSpec => ({
  prefix: 'p', loopMs, windows, initialStepMs, changes: changes.map(([atMs, stepMs]) => ({ atMs, stepMs })),
})
const inWindows = (s: CalendarSpec) => (_m: Mode, local: number) => s.windows.some(w => w.startMs <= local && local < w.endMs)

const LOOPS = spec(15000, 700, [[3000, 0], [5000, 333], [9000, 16], [12000, 1000]])
const GAPS = spec(15000, 300, [[5000, 250], [10000, 0], [13000, 400]], [{ startMs: 1000, endMs: 4000 }, { startMs: 6000, endMs: 9000 }, { startMs: 12000, endMs: 15000 }])
const UPPER_L = 32767000
const nearSeam = (loopMs: number, big: number, small: number, total: number): FrameGen => (_m, reg, _i, nominal) => nominal >= total ? null : (reg * 1000 > loopMs - big - 2000 ? small : big)

export const scenarios: Scenario[] = [
  { name: 'af3-held-500-to-250-at-200', spec: spec(15000, 500, [[200, 250]]), gen: fixed(1000 / 60, 3000) },
  { name: 'af3-continuous-to-250-at-200', spec: spec(15000, 0, [[200, 250]]), gen: fixed(1000 / 60, 3000) },
  { name: 'exact-and-adjacent-ownership', spec: spec(15000, 500, [[1000, 250]]), gen: listThen([499, 1, 499, 2, 248, 1, 1, 250, 100, 149, 1, 1], fixed(50, 6000)) },
  { name: 'held-at-boundary-200ms', spec: spec(15000, 500, [[1000, 250], [1500, 0], [2600, 125], [4000, 333]]), gen: fixed(200, 9000) },
  { name: 'held-at-boundary-60hz', spec: spec(15000, 500, [[1000, 250], [1500, 0], [2600, 125], [4000, 333]]), gen: fixed(1000 / 60, 9000) },
  {
    name: 'long-call-batch-60s', spec: spec(300000, 125, [[1000, 250], [3000, 16], [3500, 60000], [125000, 0], [130000, 40000], [250000, 31999]]),
    gen: perMode(listThen([5000, 61000, 60000, 1, 59999, 30000], fixed(30000, 600000)), fixed(30000, 600000)),
    advance: (mode, _local, index) => mode === 'fast' || index % 3 === 2,
  },
  { name: 'step-60000', spec: spec(600000, 60000, [[300000, 16], [300016, 32001]]), gen: perMode(listThen([60000, 59999, 1, 60001], fixed(60000, 1300000)), fixed(30000, 1300000)) },
  { name: 'upper-domain-restart-32759s', spec: spec(UPPER_L, 60000, []), restarts: [32759000], gen: nearSeam(UPPER_L, 30000, 500, UPPER_L * 3 + 200000) },
  { name: 'upper-domain-window-32759s', spec: spec(UPPER_L, 60000, [], [{ startMs: 32759000, endMs: UPPER_L }]), gen: nearSeam(UPPER_L, 30000, 500, UPPER_L * 9) },
  { name: 'restart-before-wrap', spec: spec(15000, 700, [[9000, 250]]), restarts: [14990, 2500], gen: fixed(32, 60000) },
  { name: 'restart-mid-step', spec: spec(15000, 700, [[9000, 250]]), restarts: [2500, 11000], gen: fixed(1000 / 60, 45000) },
  { name: 'repeated-loops-60hz', spec: LOOPS, gen: fixed(1000 / 60, 150000) },
  { name: 'multi-wrap', spec: LOOPS, gen: perMode(listThen([100000, 7, 31000, 45000, 1, 14999], fixed(1000 / 60, 200000)), listThen([32000, 32000, 7, 31000, 1, 14999], fixed(1000 / 60, 150000))) },
  { name: 'activation-gaps-scheduled', spec: GAPS, gen: fixed(1000 / 60, 45000), advance: inWindows(GAPS) },
  { name: 'activation-gaps-every-frame', spec: GAPS, gen: fixed(1000 / 60, 45000) },
  { name: 'continue-deterministic', spec: spec(15000, 300, [[5000, 250], [10000, 0], [13000, 400]], [{ startMs: 1000, endMs: 15000 }]), gen: fixed(1000 / 60, 45000), deterministic: true },
  { name: 'deterministic-full', spec: LOOPS, gen: fixed(1000 / 60, 45000), deterministic: true },
  { name: 'window-end-boundary', spec: spec(15000, 1000, [[5000, 250]], [{ startMs: 0, endMs: 5000 }, { startMs: 7000, endMs: 15000 }]), gen: fixed(1000 / 60, 30000) },
  { name: 'continuous-quantization', spec: spec(15000, 0, []), gen: listThen([0.49, 0.02, 0.49, 0.02, 0.5, 0.5, 0.25, 0.25, 1.5], jitter(1211, 40000, 0.01, 40)) },
  { name: 'residue-base-60hz', spec: spec(15000, 1000 / 60, [[5000, 250], [8000, 1000 / 60]]), gen: fixed(1000 / 60, 45000) },
  { name: 'residue-base-125ms', spec: spec(15000, 1000 / 60, [[5000, 250], [8000, 1000 / 60]]), gen: fixed(125, 45000) },
  { name: 'residue-change-at-ceil', spec: spec(15000, 16.5, [[50, 250], [3001, 0], [6000, 16.5]]), gen: listThen([1000, 2500, 3500], jitter(1212, 45000)) },
  ...[1000 / 30, 125, 1000 / 7, 1000 / 6, 200].map((step): Scenario => ({ name: `partition-${step.toFixed(3)}`, spec: LOOPS, gen: fixed(step, 60000), family: 'partitions' })),
  ...Array.from({ length: 16 }, (_, k): Scenario => ({ name: `partition-jitter-${1205 + k}`, spec: LOOPS, gen: jitter(1205 + k, 60000), family: 'partitions' })),
  { name: 'seek-live-60hz-to-37000', spec: LOOPS, gen: fixed(1000 / 60, 37000), family: 'seek' },
  { name: 'seek-replay-33.333-to-37000', spec: LOOPS, gen: (_m, _r, _i, nominal) => nominal + 1e-9 >= 37000 ? null : Math.min(1000 / 30, 37000 - nominal), family: 'seek' },
  { name: 'seek-replay-125-to-37000', spec: LOOPS, gen: (_m, _r, _i, nominal) => nominal + 1e-9 >= 37000 ? null : Math.min(125, 37000 - nominal), family: 'seek' },
]

export function toOracleSpec(s: CalendarSpec): OracleSpec {
  return {
    loopMs: Q.int(s.loopMs),
    windows: s.windows.map(w => ({ start: Q.int(w.startMs), end: Q.int(Math.min(w.endMs, s.loopMs)) })),
    initial: quantizedRequest(s.initialStepMs),
    changes: s.changes.map(c => ({ at: Q.int(c.atMs), step: quantizedRequest(c.stepMs) })),
  }
}

export interface Expected { frame: number; abs: bigint; tick: bigint; delivered: Q; called: boolean; boundaries: number; D: Q; primed: boolean; segment: number; xMs: Q }
export interface Plan { frames: PlannedFrame[]; expected: Expected[]; oracleEvents: number; segments: number; fastExpressionVsExactHalfUp: number | null }

export function planScenario(sc: Scenario, mode: Mode): Plan {
  const reg = mode === 'fast' ? new FastRegister(sc.spec.loopMs) : new PreciseRegister(sc.spec.loopMs)
  const ospec = toOracleSpec(sc.spec)
  const frames: PlannedFrame[] = []
  const segments: Array<{ oracle: CalendarOracle; calls: Array<{ frame: number; abs: bigint; tick: bigint; xMs: Q }> }> = [{ oracle: new CalendarOracle(ospec, Q0), calls: [] }]
  let nominal = 0
  for (let i = 0; ; i++) {
    const regSeconds = mode === 'fast' ? (reg as FastRegister).e : Number((reg as PreciseRegister).raw) / 65536
    const delta = sc.gen(mode, regSeconds, i, nominal)
    if (delta === null) break
    nominal += delta
    const step = reg.step(delta, sc.restarts ?? [])
    const local = Number(step.tick)
    if (sc.deterministic && step.wraps > 0) segments.push({ oracle: new CalendarOracle(ospec, Q.int(step.abs - step.tick)), calls: [] })
    if (step.crossing) segments.push({ oracle: new CalendarOracle(ospec, Q.int(step.crossing.abs)), calls: [] })
    const advance = sc.advance ? sc.advance(mode, local, i) : true
    frames.push({ delta, ...step, advance })
    if (advance) segments[segments.length - 1].calls.push({ frame: i, abs: step.abs, tick: step.tick, xMs: step.xMs })
  }
  const expected: Expected[] = []
  let oracleEvents = 0
  segments.forEach((segment, segmentIndex) => {
    const calls = oracleCalls(segment.oracle, segment.calls.map(call => Q.int(call.abs)))
    calls.forEach((call, k) => expected.push({ ...segment.calls[k], ...call, segment: segmentIndex }))
    oracleEvents += segment.oracle.events.length
  })
  return { frames, expected, oracleEvents, segments: segments.length, fastExpressionVsExactHalfUp: reg instanceof FastRegister ? reg.expressionVsExactHalfUp : null }
}



/** #1202 deliverStepped chunks one calendar delivery into Pattern calls. */
export function expectedBeforeRenderCalls(deliveredMs: number): number {
  const b = Math.floor(deliveredMs / 16000)
  const r = deliveredMs - 16000 * b
  return Math.floor(b / 2) + ((b % 2) * 16000 + r > 0 || Math.floor(b / 2) === 0 ? 1 : 0)
}

/** L and the next loop's zero are one instant (AF9 design 4.3). */
export function normalizeCalendarCursor(cursor: number, loopMs: number): number {
  const seconds = Math.floor(loopMs / 1000)
  const end = seconds + (loopMs - seconds * 1000) / 1024
  return cursor === end ? 0 : cursor
}

/** Acceptance fixtures derive W and requests from authored data, never compiler maps.
 * Group callers first materialize the authored record, preserving runtime instance ids. */
export function authoredCalendarOracleSpec(record: ShowRecordV2, instanceId: string): OracleSpec {
  const composition = record.composition
  const instance = composition.patternInstances.find(candidate => candidate.id === instanceId)
  if (!instance) throw new Error(`Missing authored instance "${instanceId}"`)
  const intervals = composition.clips.filter(clip => clip.instanceId === instanceId)
    .map(clip => ({ start: clip.startMs, end: clip.startMs + clip.durationMs }))
    .sort((a, b) => a.start - b.start)
  const merged: typeof intervals = []
  for (const interval of intervals) {
    const previous = merged[merged.length - 1]
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end)
    else merged.push({ ...interval })
  }
  const windows = composition.executionModel === 'deterministic-loop' && merged.length > 1
    ? [{ start: merged[0].start, end: merged[merged.length - 1].end }] : merged
  const baseStepMs = instance.time.steppedClock
    ? Math.max(16, Math.min(60000, instance.time.steppedClock.stepMs)) : 0
  const tracks = composition.propertyTracks.filter(track =>
    track.target.kind === 'instance-time-step-ms' && track.target.instanceId === instanceId)
  const plan = planShowStepClock({ instanceId, baseStepMs, tracks })
  return {
    loopMs: Q.int(composition.showEndMs),
    windows: windows.map(w => ({ start: Q.int(w.start), end: Q.int(w.end) })),
    initial: quantizedRequest(plan?.initialStepMs ?? baseStepMs),
    changes: (plan?.changes ?? []).filter(c => c.atMs > 0 && c.atMs < composition.showEndMs)
      .map(c => ({ at: Q.int(c.atMs), step: quantizedRequest(c.stepMs) })),
  }
}
