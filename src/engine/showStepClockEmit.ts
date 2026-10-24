// #1211: ported from AF8's .wrsp/1211-af8-design/calendar-emit.ts.
// Normative semantics and corrected bounds: AF9 af9-revised-design.md.
// Packed ticks K = s + m/1024 are exact in Fast and Precise. Absolute instants
// stay within L; callers bound packed durations to 16 s before converting to ms.
export interface StepCalendarWindow { startMs: number; endMs: number }
export interface StepCalendarSpec {
  prefix: string
  /** Positive integer Show milliseconds, at most 32767000. */
  loopMs: number
  /** Merged, sorted, half-open intervals within [0, loopMs]. */
  windows: readonly StepCalendarWindow[]
  /** 0 or 16..60000; a finite non-integer static base uses the residue path. */
  initialStepMs: number
  /** Emission retains only changes strictly inside the loop. */
  changes: readonly { atMs: number; stepMs: number }[]
}

export function packedMs(ms: number): number {
  if (!Number.isInteger(ms) || ms < 0) throw new Error(`packed tick needs a non-negative integer ms, got ${ms}`)
  const s = Math.floor(ms / 1000)
  return s + (ms - s * 1000) / 1024
}

const lit = (value: number) => {
  const text = String(value)
  if (!Number.isFinite(value) || /e/i.test(text)) throw new Error(`literal ${text} is not emittable`)
  return text
}

/** Split a request into whole ms and a 2^-16 ms residue (both modes use the quantized residue). */
export function splitStepRequest(stepMs: number): { whole: number; residue: number } {
  if (stepMs === 0) return { whole: 0, residue: 0 }
  const q = Math.round(stepMs * 65536)
  const whole = Math.floor(q / 65536)
  return { whole, residue: (q - whole * 65536) / 65536 }
}

export function stepCalendarNeedsResidue(spec: StepCalendarSpec): boolean {
  return [spec.initialStepMs, ...spec.changes.map(change => change.stepMs)]
    .some(value => splitStepRequest(value).residue !== 0)
}

const ONE_MS = '0.0009765625'

export function emitStepCalendarSharedHelpers(): string {
  return `var __pxlblz_show_tick = 0
var __pxlblz_show_wraps = 0
// Packed ticks: K = s + m/1024. The register's nearest whole ms (D1/D2).
function __pxlblz_show_tick_now() {
  var s = floor(__pxlblz_show_elapsed_s)
  var m = floor(frac(__pxlblz_show_elapsed_s) * 1000 + 0.5)
  if (m >= 1000) {
    s = s + 1
    m = 0
  }
  return s + m / 1024
}
// Canonical a, b; callers prove a + b <= L before calling.
function __pxlblz_show_tick_add(a, b) {
  var c = a + b
  if (frac(a) + frac(b) >= 0.9765625) c = c + 0.0234375
  return c
}
// Canonical a >= b.
function __pxlblz_show_tick_sub(a, b) {
  var c = a - b
  if (frac(a) < frac(b)) c = c - 0.0234375
  return c
}
// Canonical duration d <= 16 s; callers bound before converting.
function __pxlblz_show_tick_ms(d) {
  return floor(d) * 1000 + frac(d) * 1024
}
// Integer ms in 0..16000.
function __pxlblz_show_tick_of_ms(ms) {
  var s = floor(ms / 1000)
  return s + (ms - s * 1000) / 1024
}`
}

export function emitStepCalendarMember(spec: StepCalendarSpec): string {
  const p = spec.prefix
  const residue = stepCalendarNeedsResidue(spec)
  const L = lit(packedMs(spec.loopMs))
  const full = spec.windows.length === 1 && spec.windows[0].startMs === 0 && spec.windows[0].endMs >= spec.loopMs
  const changes = spec.changes.filter(change => change.atMs > 0 && change.atMs < spec.loopMs)
  const request = (stepMs: number) => {
    const { whole, residue: res } = splitStepRequest(stepMs)
    return { packed: lit(packedMs(whole)), res: lit(res) }
  }

  const reqLines: string[] = [`  if (k >= ${L}) k = 0`]
  for (const change of [...changes].reverse()) {
    const r = request(change.stepMs)
    reqLines.push(residue
      ? `  if (k >= ${lit(packedMs(change.atMs))}) {\n    ${p}_cal_req_res = ${r.res}\n    return ${r.packed}\n  }`
      : `  if (k >= ${lit(packedMs(change.atMs))}) return ${r.packed}`)
  }
  const initial = request(spec.initialStepMs)
  if (residue) reqLines.push(`  ${p}_cal_req_res = ${initial.res}`)
  reqLines.push(`  return ${initial.packed}`)

  const nextChangeLines = [
    ...changes.map(change => `  if (k < ${lit(packedMs(change.atMs))}) return ${lit(packedMs(change.atMs))}`),
    `  return ${L}`,
  ]

  const edgeLines: string[] = []
  for (const window of spec.windows) {
    if (window.startMs > 0) edgeLines.push(`  if (a < ${lit(packedMs(window.startMs))}) {\n    ${p}_cal_in = 0\n    return ${lit(packedMs(window.startMs))}\n  }`)
    edgeLines.push(`  if (a < ${lit(packedMs(Math.min(window.endMs, spec.loopMs)))}) {\n    ${p}_cal_in = 1\n    return ${lit(packedMs(Math.min(window.endMs, spec.loopMs)))}\n  }`)
  }
  edgeLines.push(`  ${p}_cal_in = 0`, `  return ${L}`)

  const nextLen = residue ? `${p}_calNextLen()` : `${p}_cal_inc`
  const resetPhi = residue ? `\n    ${p}_cal_phi = 0` : ''
  const sampleLines = residue
    ? `var s = at
        if (${p}_cal_phi > 0) s = __pxlblz_show_tick_sub(at, ${ONE_MS})`
    : 'var s = at'
  const boundTest = `var d = __pxlblz_show_tick_sub(b, a)
      if (d > 16) {
        d = 16
        b = __pxlblz_show_tick_add(a, 16)
      }`
  const ownership = `${p}_cal_r > d`
  const limit = `__pxlblz_show_tick_sub(${p}_calNextChange(s), ${ONE_MS})`
  const inTest = full ? `${p}_cal_t < ${L}` : `${p}_cal_in`
  const edgeProbe = full ? '' : `\n    ${p}_calEdge(${p}_cal_t)`

  const batchBody = residue
    ? `      var stepMs = __pxlblz_show_tick_ms(${p}_cal_inc) + ${p}_cal_inc_res
      var spanMs = __pxlblz_show_tick_ms(span)
      var n = floor((spanMs + ${p}_cal_phi) / stepMs)
      if (n * stepMs - ${p}_cal_phi > spanMs) n = n - 1
      if (n > 0) {
        var y = n * stepMs - ${p}_cal_phi
        var moved = ceil(y)
        ${p}_cal_phi = moved - y
        ${p}_addSteppedMotion(moved)
        ${p}_calCommit()
        ${p}_cal_t = __pxlblz_show_tick_add(at, __pxlblz_show_tick_of_ms(moved))
      }`
    : `      var stepMs = __pxlblz_show_tick_ms(${p}_cal_inc)
      var moved = floor(__pxlblz_show_tick_ms(span) / stepMs) * stepMs
      ${p}_addSteppedMotion(moved)
      ${p}_calCommit()
      ${p}_cal_t = __pxlblz_show_tick_add(at, __pxlblz_show_tick_of_ms(moved))`

  const steppedGapBranch = full ? '' : ` else if (${p}_cal_in == 0) {
      ${p}_cal_t = b
    }`
  const continuousMotion = full
    ? `${p}_calMotion(__pxlblz_show_tick_sub(b, a))`
    : `if (${p}_cal_in) ${p}_calMotion(__pxlblz_show_tick_sub(b, a))`

  return [
    `var ${p}_cal_t = 0`,
    `var ${p}_cal_lag = 0`,
    `var ${p}_cal_primed = 0`,
    `var ${p}_cal_inc = 0`,
    `var ${p}_cal_r = 0`,
    `var ${p}_cal_due = 0`,
    `var ${p}_cal_ready_blocks = 0`,
    `var ${p}_cal_ready_ms = 0`,
    ...(residue ? [`var ${p}_cal_inc_res = 0`, `var ${p}_cal_phi = 0`, `var ${p}_cal_req_res = 0`] : []),
    ...(full ? [] : [`var ${p}_cal_in = 0`]),
    `// Right-continuous request at packed instant k; L is the next loop's 0.
function ${p}_calReq(k) {
${reqLines.join('\n')}
}`,
    `// First request change strictly after k; the loop seam L is a change.
function ${p}_calNextChange(k) {
${nextChangeLines.join('\n')}
}`,
    ...(full ? [] : [`// End of the advancing interval containing a, else the next start.
function ${p}_calEdge(a) {
${edgeLines.join('\n')}
}`]),
    ...(residue ? [`// Whole-ms length of the step starting now; carries the 2^-16 ms residue.
function ${p}_calNextLen() {
  if (${p}_cal_inc_res > ${p}_cal_phi) {
    ${p}_cal_phi = ${p}_cal_phi + 1 - ${p}_cal_inc_res
    return __pxlblz_show_tick_add(${p}_cal_inc, ${ONE_MS})
  }
  ${p}_cal_phi = ${p}_cal_phi - ${p}_cal_inc_res
  return ${p}_cal_inc
}`] : []),
    `// Pending motion up to an owned boundary becomes ready for this frame.
function ${p}_calCommit() {
  var ms = ${p}_cal_ready_ms + ${p}_step_pending_delta_ms
  var blocks = ${p}_cal_ready_blocks + ${p}_step_pending_delta_blocks
  if (ms >= 16000) {
    ms = ms - 16000
    blocks = blocks + 1
  }
  ${p}_cal_ready_ms = ms
  ${p}_cal_ready_blocks = blocks
  ${p}_step_pending_delta_ms = 0
  ${p}_step_pending_delta_blocks = 0
  ${p}_cal_due = 1
}`,
    `// Sample the request at k; a step or continuous span begins there.
function ${p}_calStart(k) {
  ${p}_cal_inc = ${p}_calReq(k)${residue ? `\n  ${p}_cal_inc_res = ${p}_cal_req_res` : ''}
  ${p}_cal_r = 0
  if (${p}_cal_inc > 0) ${p}_cal_r = ${nextLen}
}`,
    `// Continuous motion over a packed duration, in bounded chunks.
function ${p}_calMotion(d) {
  while (d > 16) {
    ${p}_addSteppedMotion(16000)
    d = __pxlblz_show_tick_sub(d, 16)
  }
  ${p}_addSteppedMotion(__pxlblz_show_tick_ms(d))
}`,
    `// Later boundaries sharing request s's value, strictly before its next change.
function ${p}_calBatch(at, s, b) {
  var lim = ${limit}
  if (lim > b) lim = b
  if (lim > at) {
    var span = __pxlblz_show_tick_sub(lim, at)
    if (${p}_cal_inc <= span) {
${batchBody}
    }
  }
}`,
    `// Boundary zero at the cursor when it lies in the advancing set.
function ${p}_calPrime() {
  if (${p}_cal_primed == 0) {${edgeProbe}
    if (${inTest}) {
      ${p}_cal_primed = 1${resetPhi.replace('\n    ', '\n      ')}
      ${p}_calStart(${p}_cal_t)
      ${p}_cal_due = 1
    }
  }
}`,
    `// Process (cursor, z] of the cursor's loop, z <= L.
function ${p}_calRun(z) {
  ${p}_calPrime()
  while (${p}_cal_t < z) {
    var a = ${p}_cal_t
    var b = ${full ? L : `${p}_calEdge(a)`}
    if (b > z) b = z
    if (${p}_cal_primed == 0) {
      ${p}_cal_t = b
      ${p}_calPrime()
    } else if (${p}_cal_inc == 0) {
      var c = ${p}_calNextChange(a)
      if (c < b) b = c
      ${continuousMotion}
      ${p}_calCommit()
      ${p}_cal_t = b
      if (b == c) {${resetPhi.replace('\n    ', '\n        ')}
        ${p}_calStart(c)
      }
    }${steppedGapBranch} else {
      ${boundTest}
      if (${ownership}) {
        ${p}_cal_r = __pxlblz_show_tick_sub(${p}_cal_r, d)
        ${p}_addSteppedMotion(__pxlblz_show_tick_ms(d))
        ${p}_cal_t = b
      } else {
        var at = __pxlblz_show_tick_add(a, ${p}_cal_r)
        ${p}_addSteppedMotion(__pxlblz_show_tick_ms(${p}_cal_r))
        ${p}_calCommit()
        ${p}_cal_t = at
        ${sampleLines}
        ${p}_cal_inc = ${p}_calReq(s)${residue ? `\n        ${p}_cal_inc_res = ${p}_cal_req_res` : ''}
        ${p}_cal_r = 0
        if (${p}_cal_inc > 0) {
          ${p}_calBatch(at, s, b)
          ${p}_cal_r = ${nextLen}
        }
      }
    }
  }
}`,
    `// Finish loops the cursor is behind (non-reset loop continuation).
function ${p}_calCatchUp() {
  if (${p}_cal_lag > 0) {
    ${p}_calRun(${L})
    while (${p}_cal_lag > 1) {
      ${p}_cal_t = 0
      ${p}_calRun(${L})
      ${p}_cal_lag = ${p}_cal_lag - 1
    }
    ${p}_cal_t = 0
    ${p}_cal_lag = 0
  }
}`,
    `// One aggregated delivery per advance (D6).
function ${p}_calAdvance() {
  ${p}_calCatchUp()
  var z = __pxlblz_show_tick
  if (z > ${L}) z = ${L}
  ${p}_calRun(z)
  if (${p}_cal_primed == 1 && ${p}_cal_inc == 0) ${p}_cal_due = 1
  if (${p}_cal_due) {
    var blocks = ${p}_cal_ready_blocks
    var ms = ${p}_cal_ready_ms
    ${p}_cal_due = 0
    ${p}_cal_ready_blocks = 0
    ${p}_cal_ready_ms = 0
    ${p}_deliverStepped(blocks, ms)
  }
}`,
  ].join('\n')
}

/** Runtime reset lines added to memberRuntimeResetLines (origin 0); Restart then sets the origin. */
export function stepCalendarResetLines(spec: StepCalendarSpec): string[] {
  const p = spec.prefix
  return [
    `${p}_cal_t = 0`,
    `${p}_cal_lag = 0`,
    `${p}_cal_primed = 0`,
    `${p}_cal_inc = 0`,
    `${p}_cal_r = 0`,
    `${p}_cal_due = 0`,
    `${p}_cal_ready_blocks = 0`,
    `${p}_cal_ready_ms = 0`,
    ...(stepCalendarNeedsResidue(spec) ? [`${p}_cal_inc_res = 0`, `${p}_cal_phi = 0`] : []),
  ]
}

export function emitStepCalendarLoopPrelude(loopMs: number, memberPrefixes: readonly string[]): string {
  const Ls = lit(loopMs / 1000)
  return `var __pxlblz_show_unwrapped_s = __pxlblz_show_elapsed_s + delta / 1000
  __pxlblz_show_elapsed_s = __pxlblz_show_unwrapped_s % ${Ls}
  __pxlblz_show_wraps = floor((__pxlblz_show_unwrapped_s - __pxlblz_show_elapsed_s) / ${Ls} + 0.5)
  if (__pxlblz_show_wraps > 0) {
${memberPrefixes.map(p => `    ${p}_calCatchUp()\n    ${p}_cal_lag = __pxlblz_show_wraps`).join('\n')}
  }
  __pxlblz_show_tick = __pxlblz_show_tick_now()`
}


/** Deterministic-loop projection runs after the calendar reset lines. */
export const STEP_CALENDAR_TICK_LINE = '__pxlblz_show_tick = __pxlblz_show_tick_now()'

/** Restart origin, including the tail of the previous loop when the event precedes a seam. */
export function stepCalendarOriginLines(spec: StepCalendarSpec, atMs: number): string[] {
  const p = spec.prefix
  return [
    `${p}_cal_t = ${packedMs(atMs)}`,
    `if (${atMs / 1000} > __pxlblz_show_elapsed_s) ${p}_cal_lag = 1`,
    `else ${p}_cal_lag = 0`,
  ]
}

/** Every member calendar global required by runtime checkpoints. */
export function stepCalendarStateVars(spec: StepCalendarSpec): string[] {
  const p = spec.prefix
  const full = spec.windows.length === 1 && spec.windows[0].startMs === 0 && spec.windows[0].endMs >= spec.loopMs
  return [
    't', 'lag', 'primed', 'inc', 'r', 'due', 'ready_blocks', 'ready_ms',
    ...(stepCalendarNeedsResidue(spec) ? ['inc_res', 'phi', 'req_res'] : []),
    ...(full ? [] : ['in']),
  ].map(name => `${p}_cal_${name}`)
}

