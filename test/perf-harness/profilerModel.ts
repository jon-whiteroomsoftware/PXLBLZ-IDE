export interface ProfileOp {
  fn: number
  name: string
  group: string
  baselineFn: number
  baseline?: boolean
}

export const PROFILE_OPS: ProfileOp[] = [
  { fn: 0, name: 'identity baseline', group: 'baseline', baselineFn: 0, baseline: true },
  { fn: 1, name: 'mul', group: 'arithmetic', baselineFn: 0 },
  { fn: 2, name: 'add', group: 'arithmetic', baselineFn: 0 },
  { fn: 3, name: 'sub', group: 'arithmetic', baselineFn: 0 },
  { fn: 4, name: 'div', group: 'arithmetic', baselineFn: 0 },
  { fn: 5, name: 'mod (%)', group: 'arithmetic', baselineFn: 0 },
  { fn: 6, name: 'abs', group: 'rounding', baselineFn: 0 },
  { fn: 7, name: 'floor', group: 'rounding', baselineFn: 0 },
  { fn: 8, name: 'ceil', group: 'rounding', baselineFn: 0 },
  { fn: 9, name: 'frac', group: 'rounding', baselineFn: 0 },
  { fn: 10, name: 'sin', group: 'trig', baselineFn: 0 },
  { fn: 11, name: 'cos', group: 'trig', baselineFn: 0 },
  { fn: 12, name: 'tan', group: 'trig', baselineFn: 0 },
  { fn: 13, name: 'wave', group: 'waveform', baselineFn: 0 },
  { fn: 14, name: 'triangle', group: 'waveform', baselineFn: 0 },
  { fn: 15, name: 'square', group: 'waveform', baselineFn: 0 },
  { fn: 16, name: 'sqrt', group: 'transcendental', baselineFn: 0 },
  { fn: 17, name: 'pow', group: 'transcendental', baselineFn: 0 },
  { fn: 18, name: 'exp', group: 'transcendental', baselineFn: 0 },
  { fn: 19, name: 'log', group: 'transcendental', baselineFn: 0 },
  { fn: 20, name: 'hypot', group: 'transcendental', baselineFn: 0 },
  { fn: 21, name: 'atan2', group: 'inverse-trig', baselineFn: 0 },
  { fn: 22, name: 'atan', group: 'inverse-trig', baselineFn: 0 },
  { fn: 23, name: 'asin', group: 'inverse-trig', baselineFn: 0 },
  { fn: 24, name: 'acos', group: 'inverse-trig', baselineFn: 0 },
  { fn: 25, name: 'clamp', group: 'utility', baselineFn: 0 },
  { fn: 26, name: 'min', group: 'utility', baselineFn: 0 },
  { fn: 27, name: 'max', group: 'utility', baselineFn: 0 },
  { fn: 28, name: 'perlin', group: 'noise', baselineFn: 0 },
  { fn: 29, name: 'perlinTurbulence', group: 'noise', baselineFn: 0 },
  { fn: 30, name: 'perlinRidge', group: 'noise', baselineFn: 0 },
  { fn: 31, name: 'local access baseline', group: 'baseline', baselineFn: 31, baseline: true },
  { fn: 32, name: 'local read', group: 'memory', baselineFn: 31 },
  { fn: 33, name: 'local write', group: 'memory', baselineFn: 31 },
  { fn: 34, name: 'persistent read baseline', group: 'baseline', baselineFn: 34, baseline: true },
  { fn: 35, name: 'persistent global read', group: 'memory', baselineFn: 34 },
  { fn: 36, name: 'persistent write baseline', group: 'baseline', baselineFn: 36, baseline: true },
  { fn: 37, name: 'persistent global write', group: 'memory', baselineFn: 36 },
  { fn: 38, name: 'array access baseline', group: 'baseline', baselineFn: 38, baseline: true },
  { fn: 39, name: 'array read', group: 'memory', baselineFn: 38 },
  { fn: 40, name: 'array write', group: 'memory', baselineFn: 38 },
  { fn: 41, name: 'direct zero-arg expression', group: 'baseline', baselineFn: 41, baseline: true },
  { fn: 42, name: 'user function call (0 args)', group: 'call', baselineFn: 41 },
  { fn: 43, name: 'direct one-arg expression', group: 'baseline', baselineFn: 43, baseline: true },
  { fn: 44, name: 'user function call (1 arg)', group: 'call', baselineFn: 43 },
  { fn: 45, name: 'direct two-arg expression', group: 'baseline', baselineFn: 45, baseline: true },
  { fn: 46, name: 'user function call (2 args)', group: 'call', baselineFn: 45 },
  { fn: 47, name: 'direct three-arg expression', group: 'baseline', baselineFn: 47, baseline: true },
  { fn: 48, name: 'user function call (3 args)', group: 'call', baselineFn: 47 },
  { fn: 49, name: 'branch baseline', group: 'baseline', baselineFn: 49, baseline: true },
  { fn: 50, name: 'global flag branch', group: 'dispatch', baselineFn: 49 },
  { fn: 51, name: 'RGB capture baseline', group: 'baseline', baselineFn: 51, baseline: true },
  { fn: 52, name: 'generated HSV conversion', group: 'color', baselineFn: 51 },
  { fn: 53, name: 'bit operation baseline', group: 'baseline', baselineFn: 53, baseline: true },
  { fn: 54, name: 'bit shift', group: 'fixed-point', baselineFn: 53 },
  { fn: 55, name: 'bit mask', group: 'fixed-point', baselineFn: 53 },
  { fn: 56, name: 'loop iteration, i = i + 1 idiom', group: 'loop', baselineFn: 0 },
  { fn: 60, name: 'unrolled-pair baseline (i++ loop, n8 * 8 trips)', group: 'baseline', baselineFn: 60, baseline: true },
  { fn: 57, name: 'unrolled x8 body (net = -7/8 iteration machinery)', group: 'loop', baselineFn: 60 },
  { fn: 58, name: 'fused expression baseline', group: 'baseline', baselineFn: 58, baseline: true },
  { fn: 59, name: 'single-use local', group: 'memory', baselineFn: 58 },
]

export interface ProfileStats {
  mean: number
  median: number
  min: number
  max: number
}

export interface ProfileResult {
  op: ProfileOp
  baselineName: string
  sampleCount: number
  frameMs: ProfileStats
  baselineMs: ProfileStats
  netPerIterationUs: ProfileStats
  relativeToMultiply: number
}

export interface ProfileMeasurementInput {
  operations: ProfileOp[]
  frameMsByFn: ReadonlyMap<number, readonly number[]>
  iterations: number
  multiplyFn: number
}

export interface ProfileReportContext {
  generatedAt: string
  device: string
  boardType?: string
  firmwareVersion: string
  outputProfile: string
  pixelCount: number
  iterations: number
  repetitions: number
}

export function summarizeProfileMeasurements(input: ProfileMeasurementInput): ProfileResult[] {
  if (!Number.isInteger(input.iterations) || input.iterations <= 0) {
    throw new Error('Profile iterations must be a positive integer.')
  }

  const measured = input.operations.flatMap((op): Array<Omit<ProfileResult, 'relativeToMultiply'>> => {
    if (op.baseline) return []
    const samples = requiredSamples(input.frameMsByFn, op.fn, op.name)
    const baselineSamples = requiredSamples(input.frameMsByFn, op.baselineFn, `baseline for ${op.name}`)
    const baselineName = input.operations.find((candidate) => candidate.fn === op.baselineFn)?.name
    if (!baselineName) throw new Error(`Profile operation "${op.name}" references unknown baseline fn=${op.baselineFn}.`)
    if (samples.length !== baselineSamples.length) {
      throw new Error(`Profile operation "${op.name}" has ${samples.length} samples but its baseline has ${baselineSamples.length}.`)
    }
    const netPerIterationUs = samples.map((sample, index) => (
      ((sample - baselineSamples[index]) / input.iterations) * 1_000
    ))
    return [{
      op,
      baselineName,
      sampleCount: samples.length,
      frameMs: profileStats(samples),
      baselineMs: profileStats(baselineSamples),
      netPerIterationUs: profileStats(netPerIterationUs),
    }]
  })

  const multiply = measured.find((result) => result.op.fn === input.multiplyFn)
  const multiplyUs = multiply?.netPerIterationUs.median ?? Number.NaN
  return measured.map((result) => ({
    ...result,
    relativeToMultiply: multiplyUs > 0
      ? result.netPerIterationUs.median / multiplyUs
      : Number.NaN,
  }))
}

export function buildProfileReport(
  results: readonly ProfileResult[],
  context: ProfileReportContext,
): string {
  const device = context.boardType
    ? `${context.device} (\`${context.boardType}\`)`
    : context.device
  const lines = [
    '# Native operation cost table - Pixelblaze hardware',
    '',
    `**Generated:** ${context.generatedAt}`,
    `**Device:** ${device}`,
    `**Firmware:** ${context.firmwareVersion}`,
    `**Output profile:** ${context.outputProfile}`,
    `**Pixel count:** ${context.pixelCount.toLocaleString('en-US')}`,
    `**Inner-loop count:** ${context.iterations.toLocaleString('en-US')}`,
    `**Samples per operation:** ${context.repetitions.toLocaleString('en-US')}`,
    '',
    'Each operation is subtracted sample-by-sample from its declared paired baseline. ' +
      'The table reports net time per loop iteration and normalizes median cost to one multiply.',
    '',
    '| operation | group | paired baseline | mean net us/iteration | median net | min-max net | relative to mul |',
    '|---|---|---|---:|---:|---:|---:|',
    ...results.map((result) => (
      `| \`${result.op.name}\` | ${result.op.group} | \`${result.baselineName}\` | ` +
      `${formatNumber(result.netPerIterationUs.mean)} | ` +
      `${formatNumber(result.netPerIterationUs.median)} | ` +
      `${formatNumber(result.netPerIterationUs.min)}-${formatNumber(result.netPerIterationUs.max)} | ` +
      `${formatNumber(result.relativeToMultiply, 1)}× |`
    )),
    '',
    '## Method and caveats',
    '',
    '- Paired baselines preserve the loop, indexing, or direct-expression shape needed to isolate memory, call, and branch exchanges.',
    '- Near-zero or negative net values are indistinguishable from their paired baseline on this profile; they are not clamped into a claimed win.',
    '- Controller FPS remains authoritative for complete Show artifacts. Native micro-costs calibrate hypotheses but do not qualify production defaults by themselves.',
    '',
  ]
  return lines.join('\n')
}

export function profileStats(values: readonly number[]): ProfileStats {
  if (values.length === 0) throw new Error('Profile statistics require at least one sample.')
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    median: sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  }
}

export function isStableProfileWindow(
  values: readonly number[],
  toleranceMs: number,
  requiredSamples = 3,
): boolean {
  if (values.length < requiredSamples || toleranceMs < 0) return false
  const window = values.slice(-requiredSamples)
  return Math.max(...window) - Math.min(...window) <= toleranceMs
}

function requiredSamples(
  frameMsByFn: ReadonlyMap<number, readonly number[]>,
  fn: number,
  owner: string,
): readonly number[] {
  const samples = frameMsByFn.get(fn)
  if (!samples || samples.length === 0) throw new Error(`Missing profile samples for ${owner} (fn=${fn}).`)
  return samples
}

function formatNumber(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value)
}
