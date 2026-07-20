// Op-cost profiler round two for issue #556 (epic #554).
//
// Extends the #532 native operation-cost table with the prices the wave-2
// emission slices hinge on: division/modulo (constant and variable divisor),
// comparisons and selects, native built-ins against same-shape multiply
// baselines, calls through function-valued variables, and the native
// hsv()/rgb() color sinks.
//
// Probe sources are GENERATED from the op table below so tests can prove each
// probe/baseline pair differs only by the exchanged operation. The method is
// #532's exactly: temporary probe Pattern, per-fn tight loops with dispatch
// hoisted out of the loop, EMA frame time read over getVars, paired-baseline
// subtraction, restore in finally, pixel map untouched.

import { profileStats, type ProfileStats } from './profilerModel'

export interface Profile2Op {
  fn: number
  name: string
  group: string
  baselineFn: number
  baseline?: boolean
  /** before-render ops loop `iters` times per frame; render-sink ops loop `reps` times per pixel. */
  kind: 'before-render' | 'render-sink'
  body: string
  /** Non-baseline ops declare the exchanged snippet; body.replace(probe, baseline) === baseline body. */
  exchange?: { probe: string; baseline: string }
}

const wrap = (expression: string) => `x = frac(${expression} + 0.123)`

function baselineOp(
  fn: number,
  name: string,
  group: string,
  body: string,
  kind: Profile2Op['kind'] = 'before-render',
): Profile2Op {
  return { fn, name, group, baselineFn: fn, baseline: true, kind, body }
}

function probeOp(
  fn: number,
  name: string,
  group: string,
  baselineFn: number,
  probe: string,
  baseline: string,
  kind: Profile2Op['kind'] = 'before-render',
  bodyBuilder: (expression: string) => string = wrap,
): Profile2Op {
  return {
    fn,
    name,
    group,
    baselineFn,
    kind,
    body: bodyBuilder(probe),
    exchange: { probe, baseline },
  }
}

const selectBody = (expression: string) => `k = (x < 0.5)\n${wrap(expression)}`
const sinkBody = (statement: string) => statement

export const PROFILE2_OPS: Profile2Op[] = [
  baselineOp(0, 'identity baseline', 'baseline', wrap('x')),
  probeOp(1, 'mul', 'arithmetic', 0, 'x * 1.0001', 'x'),

  // Division and modulo: baseline pair is the same expression with `*`
  // substituted (issue #556 shape), constant and variable operands.
  baselineOp(2, 'constant-multiply baseline', 'baseline', wrap('x * 1.61803')),
  probeOp(3, 'div by constant', 'arithmetic', 2, 'x / 1.61803', 'x * 1.61803'),
  baselineOp(4, 'variable-multiply baseline', 'baseline', wrap('x * probeDivisor')),
  probeOp(5, 'div by variable', 'arithmetic', 4, 'x / probeDivisor', 'x * probeDivisor'),
  baselineOp(6, 'constant-mod-multiply baseline', 'baseline', wrap('x * 0.37')),
  probeOp(7, 'mod by constant', 'arithmetic', 6, 'x % 0.37', 'x * 0.37'),
  baselineOp(8, 'variable-mod-multiply baseline', 'baseline', wrap('x * probeModulus')),
  probeOp(9, 'mod by variable', 'arithmetic', 8, 'x % probeModulus', 'x * probeModulus'),

  // Comparisons and selects.
  baselineOp(10, 'comparison-multiply baseline', 'baseline', wrap('(x * 0.5)')),
  probeOp(11, 'less-than', 'comparison', 10, '(x < 0.5)', '(x * 0.5)'),
  baselineOp(12, 'single-bound baseline', 'baseline', wrap('(x >= 0.2)')),
  probeOp(13, 'range check (&&)', 'comparison', 12, '(x >= 0.2 && x <= 0.8)', '(x >= 0.2)'),
  baselineOp(14, 'arithmetic select baseline', 'baseline', selectBody('(k * (x * 1.0001) + (1 - k) * (x * 0.9999))')),
  probeOp(
    15,
    'ternary select',
    'comparison',
    14,
    '(k ? x * 1.0001 : x * 0.9999)',
    '(k * (x * 1.0001) + (1 - k) * (x * 0.9999))',
    'before-render',
    selectBody,
  ),

  // Native built-ins against same-shape multiply baselines: the baseline
  // replaces the call with one multiply of the same argument expression, so
  // the net is "builtin minus one multiply" directly.
  baselineOp(16, 'scaled-angle multiply baseline', 'baseline', wrap('(x * 6.283) * 1.0001')),
  probeOp(17, 'sin', 'builtin', 16, 'sin(x * 6.283)', '(x * 6.283) * 1.0001'),
  probeOp(18, 'cos', 'builtin', 16, 'cos(x * 6.283)', '(x * 6.283) * 1.0001'),
  baselineOp(19, 'scaled-index multiply baseline', 'baseline', wrap('(x * 8) * 1.0001')),
  probeOp(20, 'floor', 'builtin', 19, 'floor(x * 8)', '(x * 8) * 1.0001'),
  probeOp(21, 'frac', 'builtin', 19, 'frac(x * 8)', '(x * 8) * 1.0001'),
  baselineOp(22, 'offset multiply baseline', 'baseline', wrap('(x - 0.5) * 1.0001')),
  probeOp(23, 'abs', 'builtin', 22, 'abs(x - 0.5)', '(x - 0.5) * 1.0001'),
  baselineOp(24, 'unit multiply baseline', 'baseline', wrap('x * 1.0001')),
  probeOp(25, 'clamp', 'builtin', 24, 'clamp(x, 0.1, 0.9)', 'x * 1.0001'),
  probeOp(26, 'min', 'builtin', 24, 'min(x, 0.5)', 'x * 1.0001'),
  probeOp(27, 'max', 'builtin', 24, 'max(x, 0.5)', 'x * 1.0001'),
  probeOp(28, 'wave', 'builtin', 24, 'wave(x)', 'x * 1.0001'),
  probeOp(29, 'triangle', 'builtin', 24, 'triangle(x)', 'x * 1.0001'),
  probeOp(30, 'square', 'builtin', 24, 'square(x, 0.5)', 'x * 1.0001'),
  probeOp(31, 'hypot', 'builtin', 24, 'hypot(x, 0.5)', 'x * 1.0001'),
  probeOp(32, 'atan2', 'builtin', 24, 'atan2(x, 0.5)', 'x * 1.0001'),
  baselineOp(33, 'domain-offset multiply baseline', 'baseline', wrap('(x + 0.001) * 1.0001')),
  probeOp(34, 'sqrt', 'builtin', 33, 'sqrt(x + 0.001)', '(x + 0.001) * 1.0001'),
  probeOp(35, 'pow', 'builtin', 33, 'pow(x + 0.001, 2.3)', '(x + 0.001) * 1.0001'),
  // time/random have no loop-carried argument; a persistent-global read keeps
  // the baseline shape (scalar reads are free per #532) and defeats constant
  // folding in the device compiler.
  baselineOp(36, 'frame-source multiply baseline', 'baseline', 'x = frac(probeConst * 1.0001 + x * 0.0001 + 0.123)'),
  probeOp(
    37,
    'time',
    'builtin',
    36,
    'time(0.015)',
    'probeConst * 1.0001',
    'before-render',
    (expression) => `x = frac(${expression} + x * 0.0001 + 0.123)`,
  ),
  probeOp(
    38,
    'random',
    'builtin',
    36,
    'random(1)',
    'probeConst * 1.0001',
    'before-render',
    (expression) => `x = frac(${expression} + x * 0.0001 + 0.123)`,
  ),

  // Native color sinks run in render(index): per-pixel, `reps` calls per
  // pixel. The hsv probe pairs against the rgb probe — that delta is the
  // firmware-internal conversion price, the #557 prize.
  baselineOp(39, 'sink keep baseline', 'baseline', sinkBody('sinkKeep = probeH'), 'render-sink'),
  probeOp(40, 'native rgb sink', 'color', 39, 'rgb(probeR, probeG, probeB)', 'sinkKeep = probeH', 'render-sink', sinkBody),
  probeOp(41, 'native hsv sink', 'color', 40, 'hsv(probeH, probeS, probeV)', 'rgb(probeR, probeG, probeB)', 'render-sink', sinkBody),
]

// Function-valued call probes live in a separate generated Pattern so a
// compile rejection becomes a recorded finding instead of killing the main
// run (it would foreclose the #557 rebinding refinement).
export const PROFILE2_FN_OPS: Profile2Op[] = [
  baselineOp(0, 'identity baseline', 'baseline', wrap('x')),
  probeOp(1, 'mul', 'arithmetic', 0, 'x * 1.0001', 'x'),
  baselineOp(2, 'direct call baseline (0 args)', 'baseline', 'x = frac(probeCall0() + x * 0.0001 + 0.123)'),
  probeOp(
    3,
    'call via function-valued var (0 args)',
    'call',
    2,
    'fvScalar0()',
    'probeCall0()',
    'before-render',
    (expression) => `x = frac(${expression} + x * 0.0001 + 0.123)`,
  ),
  baselineOp(4, 'direct call baseline (1 arg)', 'baseline', wrap('probeCall1(x)')),
  probeOp(5, 'call via function-valued var (1 arg)', 'call', 4, 'fvScalar1(x)', 'probeCall1(x)'),
  probeOp(
    6,
    'call via function-valued array element (0 args)',
    'call',
    2,
    'fvArray[0]()',
    'probeCall0()',
    'before-render',
    (expression) => `x = frac(${expression} + x * 0.0001 + 0.123)`,
  ),
  probeOp(7, 'call via function-valued array element (1 arg)', 'call', 4, 'fvArray[1](x)', 'probeCall1(x)'),
]

function dispatchChain(ops: Profile2Op[]): string {
  return ops
    .filter((op) => op.kind === 'before-render')
    .map((op) => {
      const body = op.body.split('\n').map((line) => `    ${line}`).join('\n')
      return `  if (f == ${op.fn}) for (i = 0; i < n; i++) {\n${body}\n  }`
    })
    .join('\n')
}

function sinkChain(ops: Profile2Op[]): string {
  return ops
    .filter((op) => op.kind === 'render-sink')
    .map((op) => `  if (f == ${op.fn}) { for (j = 0; j < reps; j++) { ${op.body} } return }`)
    .join('\n')
}

export function buildProfiler2Source(): string {
  return `// Generated round-two profiler Pattern (#556). Source of truth: issue556.ts.
export var fn = 0
export var iters = 2593
export var reps = 16
export var ms = 0
export var acc = 0

var probeConst = 0.314159
var probeDivisor = 1.61803
var probeModulus = 0.37
var probeH = 0.1
var probeS = 0.7
var probeV = 0.8
var probeR = 0.3
var probeG = 0.5
var probeB = 0.7
var sinkKeep = 0

export function beforeRender(delta) {
  ms = ms + (delta - ms) * 0.2
  probeH = frac(probeH + 0.003)

  var x = acc
  var f = fn
  var n = iters
  var i = 0
  var k = 0

${dispatchChain(PROFILE2_OPS)}

  acc = frac(x + 0.0001)
}

export function render(index) {
  var f = fn
  var j = 0
${sinkChain(PROFILE2_OPS)}
  hsv(0, 0, 0.02)
}
`
}

export function buildFunctionValueProbeSource(): string {
  return `// Generated function-valued call probe Pattern (#556). Source of truth: issue556.ts.
export var fn = 0
export var iters = 2593
export var ms = 0
export var acc = 0

var probeConst = 0.314159

function probeCall0() { return 0.314159 }
function probeCall1(a) { return a * 1.0001 }

var fvScalar0 = probeCall0
var fvScalar1 = probeCall1
var fvArray = array(2)
fvArray[0] = probeCall0
fvArray[1] = probeCall1

export function beforeRender(delta) {
  ms = ms + (delta - ms) * 0.2

  var x = acc
  var f = fn
  var n = iters
  var i = 0
  var k = 0

${dispatchChain(PROFILE2_FN_OPS)}

  acc = frac(x + 0.0001)
}

export function render(index) {
  hsv(0, 0, 0.02)
}
`
}

export interface RoundTwoRow {
  name: string
  group: string
  baselineName: string
  netUs: ProfileStats
  relativeToMultiply: number
  /** true for render-sink rows normalized per call instead of per loop iteration. */
  perCall: boolean
}

export interface RoundTwoContext {
  generatedAt: string
  device: string
  boardType?: string
  firmwareVersion: string
  outputProfile: string
  pixelCount: number
  iterations: number
  repetitions: number
  sinkReps: number
  rows: RoundTwoRow[]
  findings: string[]
}

export function roundTwoSection(context: RoundTwoContext): string {
  const device = context.boardType ? `${context.device} (\`${context.boardType}\`)` : context.device
  const lines = [
    `## Round two - ${context.generatedAt} (#556)`,
    '',
    `**Device:** ${device} | **Firmware:** ${context.firmwareVersion} | **Output profile:** ${context.outputProfile}`,
    `**Pixel count:** ${context.pixelCount.toLocaleString('en-US')} | **Inner-loop count:** ${context.iterations.toLocaleString('en-US')} | **Samples per operation:** ${context.repetitions} | **Sink calls per pixel:** ${context.sinkReps}`,
    '',
    'Same paired-baseline method as round one. Built-in baselines replace the call with one same-shape multiply, so their net is "built-in minus one multiply". Rows marked *per call* run in `render(index)` and are normalized per native call (`pixelCount x reps` calls per frame); all other rows are per loop iteration in `beforeRender`.',
    '',
    '| operation | group | paired baseline | mean net us | median net | min-max net | relative to mul | unit |',
    '|---|---|---|---:|---:|---:|---:|---|',
    ...context.rows.map((row) => (
      `| \`${row.name}\` | ${row.group} | \`${row.baselineName}\` | ` +
      `${formatNumber(row.netUs.mean)} | ${formatNumber(row.netUs.median)} | ` +
      `${formatNumber(row.netUs.min)}-${formatNumber(row.netUs.max)} | ` +
      `${formatNumber(row.relativeToMultiply, 1)}x | ${row.perCall ? 'per call' : 'per iteration'} |`
    )),
    '',
    '### Round-two findings',
    '',
    ...context.findings.map((finding) => `- ${finding}`),
    '',
  ]
  return lines.join('\n')
}

export interface SinkMeasurementInput {
  operations: Profile2Op[]
  frameMsByFn: ReadonlyMap<number, readonly number[]>
  pixelCount: number
  reps: number
  multiplyUs: number
}

export function summarizeSinkMeasurements(input: SinkMeasurementInput): RoundTwoRow[] {
  const callsPerFrame = input.pixelCount * input.reps
  if (callsPerFrame <= 0) throw new Error('Sink measurement requires a positive pixelCount and reps.')
  return input.operations
    .filter((op) => op.kind === 'render-sink' && !op.baseline)
    .map((op) => {
      const samples = input.frameMsByFn.get(op.fn)
      const baselineSamples = input.frameMsByFn.get(op.baselineFn)
      const baselineName = input.operations.find((candidate) => candidate.fn === op.baselineFn)?.name
      if (!samples || !baselineSamples || !baselineName) {
        throw new Error(`Missing sink samples or baseline for "${op.name}".`)
      }
      if (samples.length !== baselineSamples.length) {
        throw new Error(`Sink probe "${op.name}" has ${samples.length} samples but its baseline has ${baselineSamples.length}.`)
      }
      const netUs = profileStats(samples.map((sample, index) => (
        ((sample - baselineSamples[index]) / callsPerFrame) * 1_000
      )))
      return {
        name: op.name,
        group: op.group,
        baselineName,
        netUs,
        relativeToMultiply: input.multiplyUs > 0 ? netUs.median / input.multiplyUs : Number.NaN,
        perCall: true,
      }
    })
}

function formatNumber(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value)
}
