// #1211 slice 1 diagnostic proof. Ported from AF8 oracle.ts and af8-diagnostics.ts,
// and AF9 af9-bounds.ts in .wrsp/1211-{af8-design,af9-revision}/.
// Exact BigInt oracles judge product-emitted text through the real bundle/load/shim pipeline.
// Compiled Show / reopened EPE acceptance belongs to later slices.
import { beforeEach, describe, expect, it } from 'vitest'
import { bundle } from './bundle'
import { loadPattern } from './loadPattern'
import { createFxShim, createShim, planeShimConfig } from './shim'
import {
  emitStepCalendarSharedHelpers, emitStepCalendarMember, emitStepCalendarLoopPrelude,
  packedMs, stepCalendarResetLines, stepCalendarOriginLines, stepCalendarStateVars,
  stepCalendarNeedsResidue, splitStepRequest, STEP_CALENDAR_TICK_LINE,
  type StepCalendarSpec,
} from './showStepClockEmit'
const check = (ok: boolean, label: string) => { expect(ok, label).toBe(true); return ok }
const results: Record<string, unknown> = {}
const rationalGcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a }
class R {
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
function exactDouble(x: number): R {
  const b = bitsOf(x)
  const sign = b >> 63n, exp = (b >> 52n) & 0x7ffn, man = b & ((1n << 52n) - 1n)
  if (exp === 0x7ffn) throw new Error('non-finite')
  const sig = exp === 0n ? man : man | (1n << 52n)
  const e2 = exp === 0n ? -1074n : exp - 1075n
  const mag = e2 >= 0n ? new R(sig << e2) : new R(sig, 1n << -e2)
  return sign ? R.of(0).sub(mag) : mag
}
/** k representable steps from a non-negative binary64 (k < 0 steps down). */
const ulps = (x: number, k: number) => ofBits(bitsOf(x) + BigInt(k))
/** Exact rational of a decimal literal string, e.g. '0.9994999999999999'. */
function exactDecimal(text: string): R {
  const [whole, frac = ''] = text.split('.')
  return new R(BigInt(whole + frac), 10n ** BigInt(frac.length))
}

// ------------------------------------------------- the system under test

function helperProgram() { return `${emitStepCalendarSharedHelpers()}
var __pxlblz_show_elapsed_s = 0
function old_tick_ms(a, b) {
  return (floor(b) - floor(a)) * 1000 + (frac(b) - frac(a)) * 1024
}
function h_pi(x) {
  __pxlblz_show_elapsed_s = x
  return __pxlblz_show_tick_now()
}
function h_ms(d) { return __pxlblz_show_tick_ms(d) }
function h_add(a, b) { return __pxlblz_show_tick_add(a, b) }
function h_sub(a, b) { return __pxlblz_show_tick_sub(a, b) }
function h_of_ms(ms) { return __pxlblz_show_tick_of_ms(ms) }
export function beforeRender(delta) {
}
export function render(index) {
  rgb(0, 0, 0)
}` }
function load(mode: 'fast' | 'precise', source = helperProgram()) {
  const { code, fxCode, metadata } = bundle(source, {})
  const config = { ...planeShimConfig({ rows: 1, cols: 1 }), getVirtualTime: () => 0 }
  const shim = mode === 'precise' ? createFxShim(config) : createShim(config)
  const handle = loadPattern(mode === 'precise' ? fxCode : code, metadata, shim.builtins)
  return { handle, fns: handle.getPatternFunctions() as Record<string, (...args: number[]) => number>, enc: shim.encodeScalar, dec: shim.decodeScalar }
}

let fast: ReturnType<typeof load>
let precise: ReturnType<typeof load>
beforeEach(() => { fast = load('fast'); precise = load('precise') })

/** Executed Fast tick in whole ms, decoded exactly from the packed binary64 s + m/1024. */
function fastTick(e: number): { ms: bigint; s: bigint; m: bigint } {
  const packed = exactDouble(fast.fns.h_pi(e))
  const s = packed.floor()
  const m1024 = packed.sub(R.of(s)).mul(R.of(1024))
  if (m1024.d !== 1n || m1024.n < 0n || m1024.n > 999n) throw new Error(`non-canonical Fast packed tick for ${e}`)
  return { ms: 1000n * s + m1024.n, s, m: m1024.n }
}
/** Executed Precise tick in whole ms, decoded exactly from the raw 16.16 result. */
function preciseTick(raw: number): { ms: bigint; s: bigint; m: bigint } {
  const out = precise.fns.h_pi(raw)
  if (!Number.isInteger(out) || out < 0) throw new Error(`bad Precise raw ${out}`)
  const s = BigInt(Math.floor(out / 65536)), low = BigInt(out) - s * 65536n
  if (low % 64n !== 0n || low / 64n > 999n) throw new Error(`non-canonical Precise packed tick for raw ${raw}`)
  return { ms: 1000n * s + low / 64n, s, m: low / 64n }
}

// ------------------------------------------------------------- the bounds

// Endpoint error delta(e) = tick(e) - 1000*e ms, against the mode's own register.
// Interval error Delta = (tick(e2) - tick(e1)) - 1000*(e2 - e1) = delta(e2) - delta(e1).
const BOUNDS = {
  fast: { endpointLowExclusive: R.of(0).sub(HALF), endpointHigh: HALF.add(pow2(-44)), intervalExclusive: ONE.add(pow2(-44)) },
  precise: { endpointLow: new R(-4095n, 8192n), endpointHigh: HALF, interval: new R(8191n, 8192n) },
  // Claims being replaced (AF8 sections 6.1, 6.2, 6.4).
  af8: { fastIntervalStrictBelow: ONE, fastEndpointAllowance: HALF.add(new R(2n, 10n ** 13n)) },
}
const fastEndpointOk = (d: R) => d.gt(BOUNDS.fast.endpointLowExclusive) && d.le(BOUNDS.fast.endpointHigh)
const fastIntervalOk = (D: R) => D.lt(BOUNDS.fast.intervalExclusive) && D.gt(R.of(0).sub(BOUNDS.fast.intervalExclusive))
const preciseEndpointOk = (d: R) => d.ge(BOUNDS.precise.endpointLow) && d.le(BOUNDS.precise.endpointHigh)
const halfUp = (x: R) => x.add(HALF).floor()


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

class Q {
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

const Q0 = Q.int(0)
const max = (a: Q, b: Q) => (a.ge(b) ? a : b)

interface OracleSpec {
  loopMs: Q
  windows: Array<{ start: Q; end: Q }>
  initial: Q
  changes: Array<{ at: Q; step: Q }>
}

/** Declared request quantization: whole ms plus a 2^-16 ms residue (round half up). */
function quantizedRequest(stepMs: number): Q {
  return new Q(BigInt(Math.round(stepMs * 65536)), 65536n)
}

interface OracleEvent { T: Q; E: Q; q: Q; kind: 'prime' | 'boundary' | 'change' }

class CalendarOracle {
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

interface OracleCall { primedNow: boolean; delivered: Q; called: boolean; boundaries: number; D: Q; primed: boolean }

/** Per-advance expectations for one origin segment: delivered motion and whether the Pattern is called. */
function oracleCalls(oracle: CalendarOracle, ticks: Q[]): OracleCall[] {
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
function bruteForce(spec: { loopMs: number; windows: Array<[number, number]>; initial: number; changes: Array<[number, number]> }, origin: number, zmax: number) {
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

const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function oracleSelfTests() {
  const out: Record<string, unknown> = {}
  // 60 Hz, duty 0.5, phase 0.25 over 8 s: open while frac(t*60 + 0.25) < 0.5.
  const windows: Array<{ start: Q; end: Q }> = []
  const period = new Q(1000n, 60n)
  for (let k = 0; k <= 480; k++) {
    const start = period.mul(Q.int(k)).sub(period.mul(new Q(1n, 4n)))
    const end = start.add(period.mul(new Q(1n, 2n)))
    const s = start.lt(Q0) ? Q0 : start
    const e = end.gt(Q.int(8000)) ? Q.int(8000) : end
    if (s.lt(e)) windows.push({ start: s, end: e })
  }
  const shutter = new CalendarOracle({ loopMs: Q.int(8000), windows, initial: Q.int(16), changes: [] }, Q0)
  const active = shutter.measure(Q0, Q.int(8000))
  const steps = shutter.boundariesIn(null, Q.int(8000)) // boundaries owned by t <= 8000 (same loop)
  // Float enumeration for contrast (the AF7-rejected authority).
  let floatActive = 0, floatSteps = 0, acc = 0
  for (let k = 0; k <= 480; k++) {
    const s = Math.max(0, (k - 0.25) * (1000 / 60)), e = Math.min(8000, (k + 0.25) * (1000 / 60))
    if (s < e) { floatActive += e - s; acc += e - s; while (acc >= 16) { acc -= 16; floatSteps++ } }
  }
  out.shutter60Hz = { activeMs: active.toString(), steps, floatActiveMs: floatActive, floatSteps }
  check(active.eq(Q.int(4000)) && steps === 250, 'oracle self-test: 60 Hz duty .5 phase .25 has 4000 active ms and 250 steps')
  // AF3 worked examples.
  const boundaryTimes = (o: CalendarOracle, until: number) => { o.extendTo(Q.int(until)); return o.events.filter(e => e.kind === 'boundary' && e.T.le(Q.int(until))).map(e => e.T.toString()) }
  const a = boundaryTimes(new CalendarOracle({ loopMs: Q.int(15000), windows: [{ start: Q0, end: Q.int(15000) }], initial: Q.int(500), changes: [{ at: Q.int(200), step: Q.int(250) }] }, Q0), 1000)
  const b = boundaryTimes(new CalendarOracle({ loopMs: Q.int(15000), windows: [{ start: Q0, end: Q.int(15000) }], initial: Q0, changes: [{ at: Q.int(200), step: Q.int(250) }] }, Q0), 1000)
  out.af3Examples = { longerToShorter: a, continuousToStepped: b }
  check(a.join(',') === '500,750,1000', 'oracle self-test: 500->250 at 200 ticks at 500, 750')
  check(b.join(',') === '450,700,950', 'oracle self-test: continuous->250 at 200 first ticks at 450')
  // Residue closed form: full window, constant S = 1000/60 quantized.
  const S = quantizedRequest(1000 / 60)
  const res = new CalendarOracle({ loopMs: Q.int(100000), windows: [{ start: Q0, end: Q.int(100000) }], initial: S, changes: [] }, Q.int(7))
  let residueBad = 0
  for (let z = 7; z <= 20000; z += 13) {
    const j = Q.int(z - 7).div(S).floor()
    const expect = Q.int(Q.int(j).mul(S).ceil())
    if (!res.stateAt(Q.int(z)).D.eq(expect)) residueBad++
  }
  out.residueClosedForm = { samples: Math.floor((20000 - 7) / 13) + 1, mismatches: residueBad }
  check(residueBad === 0, 'oracle self-test: residue closed form')
  // Brute-force per-ms model against the event walk on random integer specs.
  const rnd = mulberry32(42)
  let cases = 0, compared = 0, bad = 0
  const values = [0, 0, 16, 37, 100, 250, 500, 1000]
  for (let c = 0; c < 240; c++) {
    const L = 1500 + Math.floor(rnd() * 4000)
    const cuts = Array.from({ length: Math.floor(rnd() * 5) * 2 }, () => Math.floor(rnd() * L)).sort((x, y) => x - y)
    const wins: Array<[number, number]> = []
    for (let k = 0; k + 1 < cuts.length; k += 2) if (cuts[k] < cuts[k + 1] && (!wins.length || cuts[k] > wins[wins.length - 1][1])) wins.push([cuts[k], cuts[k + 1]])
    if (!wins.length) wins.push([0, L])
    const changeAts = [...new Set(Array.from({ length: Math.floor(rnd() * 5) }, () => 1 + Math.floor(rnd() * (L - 1))))].sort((x, y) => x - y)
    const changes = changeAts.map(at => [at, values[Math.floor(rnd() * values.length)]] as [number, number])
    const initial = values[Math.floor(rnd() * values.length)]
    const origin = Math.floor(rnd() * L)
    const zmax = origin + 3 * L
    const brute = bruteForce({ loopMs: L, windows: wins, initial, changes }, origin, zmax)
    const oracle = new CalendarOracle({ loopMs: Q.int(L), windows: wins.map(([s, e]) => ({ start: Q.int(s), end: Q.int(e) })), initial: Q.int(initial), changes: changes.map(([at, step]) => ({ at: Q.int(at), step: Q.int(step) })) }, Q.int(origin))
    cases++
    for (let z = origin; z <= zmax; z += 1 + Math.floor(rnd() * 3)) {
      compared++
      const st = oracle.stateAt(Q.int(z))
      const bf = brute[z - origin]
      if (st.primed !== bf.primed || !st.D.eq(Q.int(bf.D))) bad++
    }
  }
  out.bruteForce = { cases, compared, mismatches: bad }
  check(bad === 0, 'oracle self-test: event walk equals per-ms brute force')
  return out
}


describe('step calendar emitted arithmetic', () => {
it("AF9 Fast pair rejects the strict interval bound and meets 1 + 2^-44", () => {

  const a = 0.0004999999999999999, b = 0.9994999999999999
  const requestedA = exactDecimal('0.0004999999999999999'), requestedB = exactDecimal('0.9994999999999999')
  const ea = exactDouble(a), eb = exactDouble(b)
  const ta = fastTick(a), tb = fastTick(b)
  const da = R.of(ta.ms).sub(THOUSAND.mul(ea)), db = R.of(tb.ms).sub(THOUSAND.mul(eb))
  const interval = R.of(tb.ms - ta.ms).sub(THOUSAND.mul(eb.sub(ea)))
  const expectedInterval = new R(1152921504606911375n, 1152921504606846976n)
  // The wrong method: treating the decimal strings as the inputs.
  const decimalInterval = R.of(tb.ms - ta.ms).sub(THOUSAND.mul(requestedB.sub(requestedA)))
  check(!ea.eq(requestedA) && !eb.eq(requestedB), 'A: encoded binary64 inputs differ from the requested decimals')
  check(ta.ms === 0n && tb.ms === 1000n, 'A: Node executes ticks 0 and 1000 ms')
  check(tb.s === 1n && tb.m === 0n, 'A: second boundary carries to s = 1, m = 0 (packed tick exactly 1)')
  check(interval.eq(expectedInterval), 'A: interval error is exactly 1152921504606911375/1152921504606846976 ms')
  check(interval.gt(BOUNDS.af8.fastIntervalStrictBelow), 'A: AF8 strict Fast interval bound (< 1 ms) is rejected')
  check(fastIntervalOk(interval), 'A: replacement Fast interval bound holds')
  check(db.gt(HALF) && fastEndpointOk(db) && fastEndpointOk(da), 'A: both endpoints inside the Fast endpoint bound; the second exceeds 1/2')
  check(da.le(R.of(0)), 'A: first endpoint error lies in (-1/2, 0]')
  check(!fastIntervalOk(decimalInterval), 'A: misreading the decimals as exact inputs would report a false violation')
  // Binary64 neighbours of both endpoints.
  const neighbours: Array<{ k: number; e: string; exact: string; tickMs: string; endpointErrorMs: string; endpointErrorApprox: string }> = []
  const points: Array<{ x: R; t: bigint }> = []
  for (const base of [a, b]) for (let k = -4; k <= 4; k++) {
    const e = ulps(base, k), x = exactDouble(e), t = fastTick(e).ms, d = R.of(t).sub(THOUSAND.mul(x))
    check(fastEndpointOk(d), `A: neighbour ${base}${k >= 0 ? '+' : ''}${k} ulp endpoint bound`)
    neighbours.push({ k, e: e.toPrecision(17), exact: x.toString(), tickMs: t.toString(), endpointErrorMs: d.toString(), endpointErrorApprox: d.approx() })
    points.push({ x, t })
  }
  let pairs = 0, overOne = 0, maxPair = R.of(0)
  for (const p of points) for (const q of points) {
    const D = R.of(q.t - p.t).sub(THOUSAND.mul(q.x.sub(p.x)))
    pairs++
    if (D.gt(ONE)) overOne++
    if (D.gt(maxPair)) maxPair = D
    check(fastIntervalOk(D), 'A: neighbour pair interval bound')
  }
  check(overOne > 0, 'A: at least one neighbour pair exceeds 1 ms')
  results.counterexample = {
    requested: { a: requestedA.toString(), b: requestedB.toString() },
    encoded: { a: ea.toString(), b: eb.toString(), aMinusRequested: ea.sub(requestedA).toString(), bMinusRequested: eb.sub(requestedB).toString() },
    tickMs: { a: ta.ms.toString(), b: tb.ms.toString() }, carryAtB: { s: tb.s.toString(), m: tb.m.toString() },
    endpointErrorMs: { a: da.toString(), aApprox: da.approx(), b: db.toString(), bApprox: db.approx() },
    intervalErrorMs: interval.toString(), intervalErrorApprox: interval.approx(),
    intervalMarginBelowReplacement: BOUNDS.fast.intervalExclusive.sub(interval).toString(),
    decimalMisreadingIntervalMs: decimalInterval.toString(), decimalMisreadingApprox: decimalInterval.approx(),
    neighbours, neighbourPairs: pairs, neighbourPairsOverOneMs: overOne, maxNeighbourPairIntervalMs: maxPair.toString(),
  }
})

// ------------- B. Fast, every register in every half-ms threshold band, e < 64 s

// For each whole second s < 64 and each threshold N - 1/2 (N = 1..1000), every
// binary64 e = s + f with 1000*f within +-2^-43 of N - 1/2. The proof (design
// 6.1) says tick = halfUp + 1 can only occur with 1000*f in [N-1/2-2^-44, N-1/2);
// the band is twice that width, so its edges are tested too.
const W = pow2(-43), PROVEN_BAND = pow2(-44)
function bandRegisters(s: number, N: number): number[] {
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
it("Fast tick_now is expression-defined with endpoint error in (-1/2, 1/2 + 2^-44]", () => {

  let points = 0, disagreements = 0, disagreementsBelow1s = 0, outsideProvenBand = 0
  let maxD = R.of(-1), minD = R.of(1), maxWitness = '', minWitness = ''
  const maxBySecond: string[] = []
  for (let s = 0; s < 64; s++) {
    let maxS = R.of(-1)
    for (let N = 1; N <= 1000; N++) for (const e of bandRegisters(s, N)) {
      points++
      const x = THOUSAND.mul(exactDouble(e)), T = fastTick(e).ms, M = halfUp(x), d = R.of(T).sub(x)
      if (!check(T === M || T === M + 1n, `B: s=${s} N=${N} tick is halfUp or halfUp+1`)) continue
      if (T === M + 1n) {
        disagreements++
        if (s === 0) disagreementsBelow1s++
        const threshold = R.of(1000n * BigInt(s) + BigInt(N)).sub(HALF)
        if (!(x.ge(threshold.sub(PROVEN_BAND)) && x.lt(threshold))) outsideProvenBand++
      }
      check(fastEndpointOk(d), `B: s=${s} N=${N} e=${e} Fast endpoint bound`)
      if (d.gt(maxD)) { maxD = d; maxWitness = `e=${e.toPrecision(17)} exact=${exactDouble(e)} tick=${T}` }
      if (d.lt(minD)) { minD = d; minWitness = `e=${e.toPrecision(17)} exact=${exactDouble(e)} tick=${T}` }
      if (d.gt(maxS)) maxS = d
    }
    maxBySecond.push(maxS.toString())
  }
  check(outsideProvenBand === 0, 'B: every halfUp+1 tick lies in [N-1/2-2^-44, N-1/2)')
  check(disagreements > 0, 'B: Fast disagrees with exact half-up on some registers (AF8 "0 disagreements" was a sampling artefact)')
  expect({ points, disagreements }).toEqual({ points: 19059, disagreements: 1448 })
  check(maxD.eq(BOUNDS.fast.endpointHigh), 'B: the Fast endpoint maximum 1/2 + 2^-44 is attained exactly')
  const witness = 87749823989547 / 2 ** 47
  expect(exactDouble(witness).toString()).toBe('87749823989547/140737488355328')
  expect(fastTick(witness).ms).toBe(624n)
  check(R.of(624).sub(THOUSAND.mul(exactDouble(witness))).eq(BOUNDS.fast.endpointHigh), 'B: named witness attains the exact endpoint maximum')
  const D = maxD.sub(minD)
  check(D.gt(ONE) && fastIntervalOk(D), 'B: band extremes form a pair over 1 ms and inside the replacement bound')
  results.fastBands = {
    seconds: '0..63', thresholds: '1..1000', bandMs: '+-2^-43', points, disagreementsWithHalfUp: disagreements, disagreementsBelow1s,
    disagreementsOutsideProvenBand: outsideProvenBand, maxEndpointErrorMs: maxD.toString(), maxEndpointErrorApprox: maxD.approx(), maxWitness,
    minEndpointErrorMs: minD.toString(), minEndpointErrorApprox: minD.approx(), minWitness,
    extremePairIntervalMs: D.toString(), extremePairIntervalApprox: D.approx(), maxEndpointErrorBySecond: maxBySecond,
  }
})

it("Fast random corroboration obeys the exact endpoint bound", () => {

  let seed = 1211
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  let samples = 0, plusOne = 0, outsideBand = 0, bad = 0
  for (const span of [32767, 64, 1]) for (let k = 0; k < 100000; k++) {
    const e = rnd() * span, x = THOUSAND.mul(exactDouble(e)), T = fastTick(e).ms, M = halfUp(x)
    samples++
    if (T === M + 1n) { plusOne++; if (!R.of(M).add(HALF).sub(PROVEN_BAND).le(x)) outsideBand++ }
    else if (T !== M) bad++
    if (!fastEndpointOk(R.of(T).sub(x))) bad++
  }
  check(bad === 0 && outsideBand === 0, 'B2: random registers obey the Fast tick characterization')
  results.fastRandom = { samples, spans: [32767, 64, 1], halfUpPlusOne: plusOne, outsideProvenBand: outsideBand, violations: bad }
})

it("Fast upper-domain ties and carry neighbours are exact half-up", () => {

  let ties = 0, tieBad = 0, carry = 0, carryBad = 0, upper = 0, upperBad = 0
  const nearest = (s: number, N: number) => {
    const t = R.of(N).sub(HALF)
    const xOf = (e: number) => THOUSAND.mul(exactDouble(e).sub(R.of(s)))
    let e = s + (N - 0.5) / 1000
    while (xOf(e).ge(t)) e = ulps(e, -1)
    while (xOf(ulps(e, 1)).lt(t)) e = ulps(e, 1)
    return [e, ulps(e, 1)] // last below the threshold, first at or above it
  }
  const exactHalfUp = (e: number) => { const x = THOUSAND.mul(exactDouble(e)), T = fastTick(e).ms; return { ok: T === halfUp(x), d: R.of(T).sub(x) } }
  for (let s = 64; s <= 32766; s++) {
    for (let j = 0; j < 8; j++) {
      const e = s + (2 * j + 1) / 16
      ties++
      const x = THOUSAND.mul(exactDouble(e)), T = fastTick(e).ms
      if (!(x.sub(HALF).floor() + 1n === T && x.add(HALF).floor() === T && R.of(T).sub(x).eq(HALF))) tieBad++
    }
    for (const e of nearest(s, 1000)) {
      carry++
      const r = exactHalfUp(e)
      if (!r.ok || !(r.d.gt(R.of(0).sub(HALF)) && r.d.le(HALF))) carryBad++
    }
  }
  for (const s of [64, 65, 127, 128, 1000, 16383, 16384, 32760, 32761, 32762, 32763, 32764, 32765, 32766]) {
    for (let N = 1; N <= 1000; N++) for (const e of nearest(s, N)) {
      upper++
      const r = exactHalfUp(e)
      if (!r.ok || !(r.d.gt(R.of(0).sub(HALF)) && r.d.le(HALF))) upperBad++
    }
  }
  const top = ulps(32767, -1), topTick = fastTick(top)
  check(tieBad === 0, 'C: every exact tie at s = 64..32766 rounds up (endpoint error exactly 1/2)')
  check(carryBad === 0, 'C: the carry threshold is exact half-up at every s = 64..32766')
  check(upperBad === 0, 'C: all threshold neighbours near the upper domain are exact half-up')
  check(topTick.ms === 32767000n && topTick.s === 32767n && topTick.m === 0n, 'C: the largest register below L = 32767 s carries to the packed instant L')
  results.fastUpperDomain = {
    tieRegisters: ties, tieMismatches: tieBad, carryNeighbourRegisters: carry, carryMismatches: carryBad,
    upperThresholdNeighbourRegisters: upper, upperMismatches: upperBad,
    largestBelow32767: { e: top.toPrecision(17), exact: exactDouble(top).toString(), tickMs: topTick.ms.toString() },
  }
})

it("Precise tick_now is exact half-up with endpoint error in [-4095/8192, 1/2]", () => {

  const deltaTimes8192 = (phi: number) => { const rho = (125 * phi) % 8192; return BigInt((rho >= 4096 ? 8192 : 0) - rho) }
  let evaluated = 0, tickBad = 0, identityBad = 0, ties = 0, tiesUp = 0
  let min = 1n << 40n, max = -(1n << 40n), phiMin = -1, phiMax = -1
  for (const s of [0, 1, 63, 64, 16383, 32766]) {
    for (let phi = 0; phi < 65536; phi++) {
      evaluated++
      const raw = s * 65536 + phi, T = preciseTick(raw).ms
      if (T !== 1000n * BigInt(s) + (1000n * BigInt(phi) + 32768n) / 65536n) tickBad++
      const exactD = (T * 65536n - 1000n * BigInt(raw)) // = delta * 65536
      if (exactD !== deltaTimes8192(phi) * 8n) identityBad++
      const d = deltaTimes8192(phi)
      if (d < min) { min = d; phiMin = phi }
      if (d > max) { max = d; phiMax = phi }
      if ((125 * phi) % 8192 === 4096) { ties++; if (d === 4096n) tiesUp++ }
    }
  }
  const extremal: number[] = []
  for (let phi = 0; phi < 65536; phi++) { const rho = (125 * phi) % 8192; if (rho === 0 || rho === 4095 || rho === 4096 || rho === 8191) extremal.push(phi) }
  extremal.push(65503, 65504, 65535) // carry threshold: 1000*phi + 32768 >= 65536000 iff phi >= 65504
  let everySecond = 0, everySecondBad = 0, carries = 0
  for (let s = 0; s <= 32766; s++) for (const phi of extremal) {
    everySecond++
    const t = preciseTick(s * 65536 + phi)
    if (t.ms !== 1000n * BigInt(s) + (1000n * BigInt(phi) + 32768n) / 65536n) everySecondBad++
    if (phi >= 65504 && t.s === BigInt(s + 1) && t.m === 0n) carries++
  }
  const lo = new R(min, 8192n), hi = new R(max, 8192n)
  // Executed witness pair across the whole domain: rho = 4095 at s = 0, rho = 4096 at s = 32766.
  const r4095 = extremal.find(phi => (125 * phi) % 8192 === 4095)!, r4096 = extremal.find(phi => (125 * phi) % 8192 === 4096)!
  const e1 = 0 * 65536 + r4095, e2 = 32766 * 65536 + r4096
  expect([e1, e2, extremal.length]).toEqual([5931, 32766 * 65536 + 4096, 35])
  const witness = R.of(preciseTick(e2).ms - preciseTick(e1).ms).sub(new R(1000n * BigInt(e2 - e1), 65536n))
  check(tickBad === 0 && identityBad === 0, 'D: executed Precise tick is exact half-up and matches the integer identity')
  check(lo.eq(BOUNDS.precise.endpointLow) && hi.eq(BOUNDS.precise.endpointHigh), 'D: Precise endpoint range is exactly [-4095/8192, 1/2]')
  check(ties === 6 * 8 && tiesUp === ties, 'D: eight exact ties per second, all rounded up')
  check(everySecondBad === 0 && carries === 2 * 32767, 'D: extremal and carry registers exact at every whole second 0..32766')
  check(witness.eq(BOUNDS.precise.interval) && hi.sub(lo).eq(BOUNDS.precise.interval), 'D: Precise interval bound 8191/8192 is attained and is max - min')
  results.precise = {
    exhaustiveSeconds: [0, 1, 63, 64, 16383, 32766], registers: evaluated, tickMismatches: tickBad, identityMismatches: identityBad,
    endpointMinMs: lo.toString(), phiAtMin: phiMin, endpointMaxMs: hi.toString(), phiAtMax: phiMax, exactTies: ties, tiesRoundedUp: tiesUp,
    extremalPhiPerSecond: extremal.length, everySecondRegisters: everySecond, everySecondMismatches: everySecondBad, carriesObserved: carries,
    intervalWitness: { raw1: e1, raw2: e2, intervalErrorMs: witness.toString() },
  }
})

it("AF7 overflow expectations stay independent integers", () => {

  const wrap16 = (v: bigint) => ((v + 32768n) % 65536n + 65536n) % 65536n - 32768n
  const pieces = [16000n, 16000n, 16000n, 12000n]
  const L = 32767n, at = 32759n, r = 60n
  const consumed = L - at, carried = r - consumed
  check(wrap16(60000n) === -5536n, 'E: AF7-1 old 60 s conversion wraps to -5536 (integer)')
  check(pieces.every(p => p <= 16000n) && pieces.reduce((x, y) => x + y) === 60000n, 'E: AF7-1 split 16000+16000+16000+12000 = 60000 (integer)')
  check(wrap16(at + r) === -32717n, 'E: AF7-2 old 32759+60 s wraps to -32717 (integer)')
  check(consumed === 8n && carried === 52n && carried <= L, 'E: AF7-2 8 s tail consumed, boundary 52 s into the next loop (integer)')
  // Executed reproduction in Precise, judged against the integers above.
  const p = precise
  const oldMs = BigInt(p.dec(p.fns.old_tick_ms(p.enc(0), p.enc(60))))
  const split = pieces.map(ms => BigInt(p.dec(p.fns.h_ms(p.enc(Number(ms) / 1000))))).reduce((x, y) => x + y)
  const oldAdd = BigInt(p.dec(p.fns.h_add(p.enc(32759), p.enc(60))))
  check(oldMs === wrap16(60000n) && split === 60000n && oldAdd === wrap16(at + r), 'E: executed Precise forms match the integer expectations')
  results.af7Integers = { wrap60000: '-5536', pieces: pieces.map(String), wrap32819: '-32717', consumedS: '8', carriedS: '52', executed: { oldTickMs_0_60: oldMs.toString(), split: split.toString(), oldTickAdd_32759_60: oldAdd.toString() } }
})

it("endpoint and interval bounds are distinct and mode-specific", () => {

  const out: Record<string, unknown> = {}
  for (const mode of ['fast', 'precise'] as const) {
    const enc = (v: number) => mode === 'fast' ? { t: fastTick(v).ms, x: THOUSAND.mul(exactDouble(v)) } : (() => { const raw = Math.round(v * 65536); return { t: preciseTick(raw).ms, x: new R(1000n * BigInt(raw), 65536n) } })()
    const a = enc(0.00049), b = enc(0.00051)
    const D = R.of(b.t - a.t).sub(b.x.sub(a.x)), endpointB = R.of(b.t).sub(b.x)
    check(a.t === 0n && b.t === 1n, `F: ${mode} 0.49 -> 0.51 ms projects to ticks 0 -> 1`)
    check(mode === 'fast' ? fastIntervalOk(D) && fastEndpointOk(endpointB) : D.le(BOUNDS.precise.interval) && preciseEndpointOk(endpointB), `F: ${mode} inside its own bounds`)
    check(!D.eq(endpointB), `F: ${mode} interval error differs from the endpoint error`)
    if (mode === 'precise') {
      expect([precise.enc(0.00049), precise.enc(0.00051)]).toEqual([32, 33])
      check(D.eq(new R(8067n, 8192n)), 'F: Precise interval is exactly 8067/8192')
    }
    out[mode] = { ticks: [a.t.toString(), b.t.toString()], registerSpanMs: b.x.sub(a.x).approx(6), intervalErrorMs: D.toString(), intervalErrorApprox: D.approx(6), endpointErrorMs: endpointB.toString() }
  }
  results.af7Finding3 = out
})

it('oracle self-checks', () => { oracleSelfTests() })
})

const packedToMs = (v: number) => { const s = Math.floor(v); return s * 1000 + Math.round((v - s) * 1024) }

function emitBoundedStepMotion(p: string, elapsedName: string, beforeRenderName: string): string {
  return [
    `var ${p}_step_pending_delta_blocks = 0`,
    `var ${p}_step_pending_delta_ms = 0`,
    `function ${p}_addSteppedMotionChunk(scaledDeltaMs) {
  var blocks = floor(scaledDeltaMs / 16000)
  var remainder = scaledDeltaMs - blocks * 16000
  remainder = ${p}_step_pending_delta_ms + remainder
  if (remainder >= 16000) {
    remainder = remainder - 16000
    blocks = blocks + 1
  }
  ${p}_step_pending_delta_blocks = ${p}_step_pending_delta_blocks + blocks
  ${p}_step_pending_delta_ms = remainder
}`,
    `function ${p}_addSteppedMotion(delta) {
  while (delta > 8000) {
    ${p}_addSteppedMotionChunk(8000 * ${p}_adapt_timeScale)
    delta = delta - 8000
  }
  ${p}_addSteppedMotionChunk(delta * ${p}_adapt_timeScale)
}`,
    `function ${p}_deliverStepped(blocks, remainderMs) {\n  h_deliveries = h_deliveries + 1
  var called = 0
  while (blocks >= 2) {
    ${elapsedName} = ${elapsedName} + 32
    ${beforeRenderName}(32000)
    blocks = blocks - 2
    called = 1
  }
  var finalDeltaMs = blocks * 16000 + remainderMs
  if (finalDeltaMs > 0 || called == 0) {
    ${elapsedName} = ${elapsedName} + finalDeltaMs / 1000
    ${beforeRenderName}(finalDeltaMs)
  }

}`,
  ].join('\n')
}

function rewriteOnce(source: string, from: string, to: string): string {
  expect(source.split(from).length - 1, from).toBe(1)
  return source.replace(from, to)
}

function calendarProgram(spec: StepCalendarSpec): string {
  const p = spec.prefix
  let shared = emitStepCalendarSharedHelpers()
  shared = rewriteOnce(shared, 'function __pxlblz_show_tick_ms(d) {',
    'function __pxlblz_show_tick_ms(d) {\n  if (d > h_max_ms_arg) h_max_ms_arg = d')
  shared = rewriteOnce(shared, '  return c\n}\n// Canonical a >= b.',
    '  if (c > h_max_abs) h_max_abs = c\n  if (c < h_min_abs) h_min_abs = c\n  return c\n}\n// Canonical a >= b.')
  return [
    'var h_s = 0', 'var h_ms = 0', 'var h_calls = 0', 'var h_deliveries = 0',
    'var h_max_abs = 0', 'var h_min_abs = 0', 'var h_max_ms_arg = 0',
    'var __pxlblz_show_elapsed_s = 0',
    `var ${p}_adapt_timeScale = 1`, `var ${p}_elapsed = 0`,
    `function ${p}_beforeRender(delta) {
  h_calls = h_calls + 1
  var q = floor(delta / 1000)
  h_s = h_s + q
  h_ms = h_ms + delta - q * 1000
  if (h_ms >= 1000) {
    h_ms = h_ms - 1000
    h_s = h_s + 1
  }
}`,
    emitBoundedStepMotion(p, `${p}_elapsed`, `${p}_beforeRender`),
    shared, emitStepCalendarMember(spec),
    `function h_frame(delta) {\n  ${emitStepCalendarLoopPrelude(spec.loopMs, [p])}\n}`,
    `function h_advance() {
  h_s = 0
  h_ms = 0
  h_calls = 0
  h_deliveries = 0
  ${p}_calAdvance()
}`,
    `function h_restart() {
  ${stepCalendarResetLines(spec).join('\n  ')}
  ${stepCalendarOriginLines(spec, 32759000).join('\n  ')}
}`,
    'export function beforeRender(delta) {}',
    'export function render(index) { rgb(0, 0, 0) }',
  ].join('\n')
}

it.each(['fast', 'precise'] as const)('tick helpers are exact over their whole precondition domain (%s)', mode => {
    const { fns, enc, dec } = load(mode)
    const ms = (v: number) => dec(fns.h_ms(enc(v)))
    let msBad = 0
    for (let s = 0; s <= 16; s++) for (let m = 0; m < (s === 16 ? 1 : 1000); m++) {
      if (ms(s + m / 1024) !== s * 1000 + m) msBad++
    }
    let ofBad = 0
    for (let v = 0; v <= 16000; v++) if (packedToMs(dec(fns.h_of_ms(enc(v)))) !== v || dec(fns.h_of_ms(enc(v))) !== packedMs(v)) ofBad++
    const rnd = mulberry32(1211)
    let addBad = 0, subBad = 0, pairs = 0
    const L = 32767000
    const edges = [0, 1, 999, 1000, 16000, 59999, 60000, 60001, 32706999, 32707000, 32759000, 32766999, 32767000]
    const sample = (k: number) => k < edges.length * edges.length ? [edges[Math.floor(k / edges.length)], edges[k % edges.length]] : [Math.floor(rnd() * (L + 1)), Math.floor(rnd() * 60002)]
    for (let k = 0; k < 120000; k++) {
      const [x, y] = sample(k)
      if (x + y <= L) {
        pairs++
        if (dec(fns.h_add(enc(packedMs(x)), enc(packedMs(y)))) !== packedMs(x + y)) addBad++
      }
      const [hi, lo] = x >= y ? [x, y] : [y, x]
      if (dec(fns.h_sub(enc(packedMs(hi)), enc(packedMs(lo)))) !== packedMs(hi - lo)) subBad++
    }

    expect({ msBad, ofBad, addBad, subBad, pairs }).toEqual({
      msBad: 0, ofBad: 0, addBad: 0, subBad: 0, pairs: 119830,
    })
})

it.each(['fast', 'precise'] as const)('no conversion or absolute instant leaves its proven range (%s)', mode => {
  const L = 32767000
  for (const windowOnly of [false, true]) {
    const spec: StepCalendarSpec = {
      prefix: 'p', loopMs: L, initialStepMs: 60000, changes: [],
      windows: [{ startMs: windowOnly ? 32759000 : 0, endMs: L }],
    }
    const { handle, fns, enc, dec } = load(mode, calendarProgram(spec))
    let total = 0, seams = 0, upperCursorSeen = false
    while (total < L * (windowOnly ? 9 : 3) + (windowOnly ? 0 : 200000)) {
      const before = handle.getRuntimeState() as Record<string, number>
      const prev = dec(before.__pxlblz_show_elapsed_s)
      const delta = prev * 1000 > L - 32000 ? 500 : 30000
      total += delta
      fns.h_frame(enc(delta))
      const frame = handle.getRuntimeState() as Record<string, number>
      const now = dec(frame.__pxlblz_show_elapsed_s), wraps = dec(frame.__pxlblz_show_wraps)
      seams += wraps
      if (!windowOnly && ((prev < 32759 && now >= 32759) || (wraps > 0 && prev < 32759))) fns.h_restart()
      fns.h_advance()
      const advanced = handle.getRuntimeState() as Record<string, number>
      if (dec(advanced.p_cal_t) > 32759) upperCursorSeen = true
    }
    const state = handle.getRuntimeState() as Record<string, number>
    expect(seams).toBeGreaterThanOrEqual(windowOnly ? 9 : 3)
    expect(upperCursorSeen).toBe(true)
    expect(dec(state.h_max_ms_arg)).toBeLessThanOrEqual(16)
    expect(dec(state.h_max_ms_arg)).toBeGreaterThan(0)
    expect(dec(state.h_max_abs)).toBeLessThanOrEqual(packedMs(L))
    expect(dec(state.h_max_abs)).toBeGreaterThan(0)
    expect(dec(state.h_min_abs)).toBeGreaterThanOrEqual(0)
  }
})

it.each(['fast', 'precise'] as const)('1001-ms loop keeps exact epoch endpoint and interval bounds across seams (%s)', mode => {
  // A = exact register ms + observed wraps * authored integer-ms loop.
  // P = executed tick ms + the same epoch. Neither wall time nor delta sums is an oracle.
  const spec: StepCalendarSpec = {
    prefix: 'p', loopMs: 1001, initialStepMs: 0, changes: [],
    windows: [{ startMs: 0, endMs: 1001 }],
  }
  const { handle, fns, enc, dec } = load(mode, calendarProgram(spec))
  let epoch = 0n, delivered = 0n
  let previous: { authority: R; projection: bigint } | undefined
  const authorityTicks: Q[] = []
  const observed: number[] = []
  for (let i = 0; i < 900; i++) {
    fns.h_frame(enc([0.49, 0.02, 125, 333.333, 16.666666666666668][i % 5]))
    fns.h_advance()
    const state = handle.getRuntimeState() as Record<string, number>
    epoch += BigInt(dec(state.__pxlblz_show_wraps))
    const register = mode === 'fast' ? exactDouble(state.__pxlblz_show_elapsed_s)
      : new R(BigInt(state.__pxlblz_show_elapsed_s), 65536n)
    const authority = THOUSAND.mul(register).add(R.of(epoch * 1001n))
    const projection = BigInt(packedToMs(dec(state.__pxlblz_show_tick))) + epoch * 1001n
    const endpoint = R.of(projection).sub(authority)
    expect(mode === 'fast' ? fastEndpointOk(endpoint) : preciseEndpointOk(endpoint)).toBe(true)
    if (previous) {
      const interval = R.of(projection - previous.projection).sub(authority.sub(previous.authority))
      expect(mode === 'fast' ? fastIntervalOk(interval) :
        interval.le(BOUNDS.precise.interval) && interval.ge(R.of(0).sub(BOUNDS.precise.interval))).toBe(true)
    }
    delivered += BigInt(dec(state.h_s) * 1000 + dec(state.h_ms))
    expect(delivered).toBe(projection)
    expect(dec(state.h_deliveries)).toBe(1)
    authorityTicks.push(Q.int(projection))
    observed.push(Number(delivered))
    previous = { authority, projection }
  }
  expect(epoch).toBeGreaterThan(50n)
  const oracle = new CalendarOracle({
    loopMs: Q.int(1001), windows: [{ start: Q0, end: Q.int(1001) }],
    initial: Q0, changes: [],
  }, Q0)
  const calls = oracleCalls(oracle, authorityTicks)
  expect(calls.map(call => call.D.toNumber())).toEqual(observed)
})

it('calendar exports retain the template state, reset and request domains', () => {
  const spec: StepCalendarSpec = {
    prefix: 'p', loopMs: 1001, initialStepMs: 1000 / 7,
    windows: [{ startMs: 1, endMs: 1000 }],
    changes: [{ atMs: 0, stepMs: 16 }, { atMs: 200, stepMs: 250 }, { atMs: 1001, stepMs: 500 }],
  }
  expect(splitStepRequest(1000 / 7)).toEqual({ whole: 142, residue: 56174 / 65536 })
  expect(stepCalendarNeedsResidue(spec)).toBe(true)
  const member = emitStepCalendarMember(spec)
  expect(stepCalendarStateVars(spec)).toEqual(
    [...member.matchAll(/^var (p_cal_\w+) =/gm)].map(match => match[1]))
  expect(stepCalendarResetLines(spec)).toContain('p_cal_phi = 0')
  expect(stepCalendarOriginLines(spec, 500)).toEqual([
    'p_cal_t = 0.48828125', 'if (0.5 > __pxlblz_show_elapsed_s) p_cal_lag = 1', 'else p_cal_lag = 0',
  ])
  expect(STEP_CALENDAR_TICK_LINE).toBe('__pxlblz_show_tick = __pxlblz_show_tick_now()')
  expect(member).not.toContain('return 0.015625')
  expect(member).not.toContain('return 0.48828125')
  expect(member).toContain('if (k >= 0.1953125)')
})

