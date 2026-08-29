// Native array-helper pricing for issue #909 (epic #903).
//
// Ben Hencke states the v3 array helpers run 2-3x faster than an
// interpreted `for` loop (forum 806/31, 1891/6); no local measurement
// exists. The probe times full passes over a 512-element array per frame:
// the for-loop and helper forms of a write fill and a read accumulation,
// plus the native sum. Per-element cost is the frame-time delta over an
// idle baseline divided by (passes x elements).
//
// API surface verified against the fw 3.67 compiler before probing:
// mutate, forEach, sum, reduce, and mapTo compile; average does not.
// Helper callbacks cannot close over locals (no closures on this VM), so
// the accumulator callback writes a global — the exact constraint any
// generated lowering will live under.

export const ARRAY_PROBE_ELEMENTS = 512

export interface ArrayProbeMode {
  fn: number
  name: string
  /** Mode 0 is the idle baseline every other mode pairs against. */
  baseline?: boolean
  /** The for-loop counterpart this helper mode compares to, if any. */
  pairsWith?: number
}

export const ARRAY_PROBE_MODES: ArrayProbeMode[] = [
  { fn: 0, name: 'idle baseline', baseline: true },
  { fn: 1, name: 'for-loop write fill' },
  { fn: 2, name: 'mutate write fill', pairsWith: 1 },
  { fn: 3, name: 'for-loop read accumulate' },
  { fn: 4, name: 'forEach read accumulate', pairsWith: 3 },
  { fn: 5, name: 'native sum', pairsWith: 3 },
]

export function buildArrayProbeSource(): string {
  return `// Generated array-helper probe Pattern (#909). Source of truth: issue909.ts.
export var fn = 0
export var passes = 4
export var ms = 0

var arr = array(${ARRAY_PROBE_ELEMENTS})
var n = ${ARRAY_PROBE_ELEMENTS}
var gSum = 0

function mutFn(v, i) { return frac(v + 0.01) }
function eachFn(v, i) { gSum = gSum + v }

export var once = 1
export var probeA = -1
export var probeB = -1
export var probeSum = -1

export function beforeRender(delta) {
  ms = ms + (delta - ms) * 0.2

  var f = fn
  var p = passes
  var k = 0
  var i = 0

  // One-shot correctness modes: reset to a known ramp, apply exactly one
  // pass of a mode, and export witness slots so the paired forms can be
  // proven to produce identical values before their timings are compared.
  if (once == 0) {
    for (i = 0; i < n; i = i + 1) { arr[i] = i / n }
    if (f == 1) { for (i = 0; i < n; i = i + 1) { arr[i] = frac(arr[i] + 0.01) } }
    if (f == 2) { arr.mutate(mutFn) }
    if (f == 3) { gSum = 0
      for (i = 0; i < n; i = i + 1) { gSum = gSum + arr[i] } }
    if (f == 4) { gSum = 0
      arr.forEach(eachFn) }
    if (f == 5) { gSum = arr.sum() }
    probeA = arr[3]
    probeB = arr[500]
    probeSum = gSum
    once = 1
    return
  }

  if (f == 1) for (k = 0; k < p; k = k + 1) {
    for (i = 0; i < n; i = i + 1) { arr[i] = frac(arr[i] + 0.01) }
  }
  if (f == 2) for (k = 0; k < p; k = k + 1) {
    arr.mutate(mutFn)
  }
  if (f == 3) for (k = 0; k < p; k = k + 1) {
    gSum = 0
    for (i = 0; i < n; i = i + 1) { gSum = gSum + arr[i] }
  }
  if (f == 4) for (k = 0; k < p; k = k + 1) {
    gSum = 0
    arr.forEach(eachFn)
  }
  if (f == 5) for (k = 0; k < p; k = k + 1) {
    gSum = arr.sum()
  }
}

export function render(index) {
  hsv(0, 0, 0.02)
}
`
}

export interface ArrayProbeRow {
  name: string
  perElementUs: number
  minPerElementUs: number
  maxPerElementUs: number
  /** helper time / paired for-loop time; below 1.0 means the helper wins. */
  vsForLoop: number | null
}

export function summarizeArrayProbe(
  frameMsByFn: ReadonlyMap<number, readonly number[]>,
  passes: number,
): ArrayProbeRow[] {
  const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const baseline = frameMsByFn.get(0)
  if (!baseline) throw new Error('Array probe baseline samples missing.')
  const baselineMedian = median(baseline)
  const perElement = new Map<number, number>()
  const rows: ArrayProbeRow[] = []
  for (const mode of ARRAY_PROBE_MODES) {
    if (mode.baseline) continue
    const samples = frameMsByFn.get(mode.fn)
    if (!samples) throw new Error(`Array probe samples missing for "${mode.name}".`)
    const scale = 1_000 / (passes * ARRAY_PROBE_ELEMENTS)
    const nets = samples.map((sample) => (sample - baselineMedian) * scale)
    const value = median(nets)
    perElement.set(mode.fn, value)
    rows.push({
      name: mode.name,
      perElementUs: value,
      minPerElementUs: Math.min(...nets),
      maxPerElementUs: Math.max(...nets),
      vsForLoop: mode.pairsWith != null ? value / perElement.get(mode.pairsWith)! : null,
    })
  }
  return rows
}
