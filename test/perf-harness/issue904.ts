// Identity-blend fold probe for issue #904 (epic #903).
//
// The stack-blend emitter writes `M = z * (1) + M * (1 - (1))` per channel
// plus dead local initializations for static-opacity-1 placements (666 lines
// across 36 of 40 stock Shows), and the device compiler performs no constant
// folding, so every word executes as written. This probe prices the exact
// production shape against its folded form with the #556 paired-baseline
// method: same generated probe Pattern, per-fn tight loops, EMA frame time
// over getVars, paired subtraction, restore in finally.
//
// Two pairs:
// - one channel: the marginal price of a single identity-blend line over a
//   direct assignment;
// - three channels + dead inits: the whole per-placement sink block exactly
//   as the emitter spells it, against the folded block #904's pass would emit.

import type { Profile2Op } from './issue556'

const CHANNEL_SOURCES = ['x', 'x * 0.618', 'x * 0.382'] as const

const EMITTED_BLOCK = [
  'm = 0',
  'l = 0',
  'w = 0',
  `m = ${CHANNEL_SOURCES[0]} * (1) + m * (1 - (1))`,
  `l = (${CHANNEL_SOURCES[1]}) * (1) + l * (1 - (1))`,
  `w = (${CHANNEL_SOURCES[2]}) * (1) + w * (1 - (1))`,
].join('\n')

const FOLDED_BLOCK = [
  `m = ${CHANNEL_SOURCES[0]}`,
  `l = ${CHANNEL_SOURCES[1]}`,
  `w = ${CHANNEL_SOURCES[2]}`,
].join('\n')

const SINK_TAIL = 'x = frac(m + l * 0.5 + w * 0.25 + 0.123)'

export const PROFILE904_OPS: Profile2Op[] = [
  {
    fn: 0, name: 'identity baseline', group: 'baseline', baselineFn: 0, baseline: true,
    kind: 'before-render', body: 'x = frac(x + 0.123)',
  },
  {
    fn: 1, name: 'mul', group: 'arithmetic', baselineFn: 0, kind: 'before-render',
    body: 'x = frac(x * 1.0001 + 0.123)',
    exchange: { probe: 'x * 1.0001', baseline: 'x' },
  },
  {
    fn: 2, name: 'direct assignment (1 channel)', group: 'baseline', baselineFn: 2, baseline: true,
    kind: 'before-render', body: 'm = x\nx = frac(m + 0.123)',
  },
  {
    fn: 3, name: 'identity blend (1 channel)', group: 'blend', baselineFn: 2, kind: 'before-render',
    body: 'm = x * (1) + m * (1 - (1))\nx = frac(m + 0.123)',
    exchange: { probe: 'x * (1) + m * (1 - (1))', baseline: 'x' },
  },
  {
    fn: 4, name: 'folded three-channel sink', group: 'baseline', baselineFn: 4, baseline: true,
    kind: 'before-render', body: `${FOLDED_BLOCK}\n${SINK_TAIL}`,
  },
  {
    fn: 5, name: 'emitted three-channel blend (dead inits + identity blends)', group: 'blend',
    baselineFn: 4, kind: 'before-render',
    body: `${EMITTED_BLOCK}\n${SINK_TAIL}`,
    exchange: { probe: EMITTED_BLOCK, baseline: FOLDED_BLOCK },
  },
]

function dispatchChain(ops: Profile2Op[]): string {
  return ops
    .map((op) => {
      const body = op.body.split('\n').map((line) => `    ${line}`).join('\n')
      return `  if (f == ${op.fn}) for (i = 0; i < n; i++) {\n${body}\n  }`
    })
    .join('\n')
}

export function buildBlendProbeSource(): string {
  return `// Generated identity-blend fold probe Pattern (#904). Source of truth: issue904.ts.
export var fn = 0
export var iters = 2593
export var ms = 0
export var acc = 0

export function beforeRender(delta) {
  ms = ms + (delta - ms) * 0.2

  var x = acc
  var f = fn
  var n = iters
  var i = 0
  var m = 0
  var l = 0
  var w = 0

${dispatchChain(PROFILE904_OPS)}

  acc = frac(x + 0.0001)
}

export function render(index) {
  hsv(0, 0, 0.02)
}
`
}

export interface BlendProbeRow {
  name: string
  baselineName: string
  medianNetUs: number
  meanNetUs: number
  minNetUs: number
  maxNetUs: number
  relativeToMultiply: number
}

export interface BlendProbeReport {
  generatedAt: string
  device: string
  boardType?: string
  firmwareVersion: string
  outputProfile: string
  pixelCount: number
  iterations: number
  repetitions: number
  rows: BlendProbeRow[]
  rawSamplesByFn: Record<string, readonly number[]>
  projections: {
    perLineUs: number
    perPlacementBlockUs: number
    msPerFrameAt2000px: number
  }
}

/** The per-placement projection: one emitted block runs once per pixel per placement sink. */
export function projectBlendSavings(rows: BlendProbeRow[]): BlendProbeReport['projections'] {
  const perLine = rows.find((row) => row.name === 'identity blend (1 channel)')
  const perBlock = rows.find((row) => row.name.startsWith('emitted three-channel'))
  if (!perLine || !perBlock) throw new Error('Blend probe rows are incomplete.')
  return {
    perLineUs: perLine.medianNetUs,
    perPlacementBlockUs: perBlock.medianNetUs,
    msPerFrameAt2000px: (perBlock.medianNetUs * 2_000) / 1_000,
  }
}

export function blendProbeSection(report: BlendProbeReport): string {
  const device = report.boardType ? `${report.device} (\`${report.boardType}\`)` : report.device
  return [
    `## Identity-blend fold probe - ${report.generatedAt} (#904)`,
    '',
    `**Device:** ${device} | **Firmware:** ${report.firmwareVersion} | **Output profile:** ${report.outputProfile}`,
    `**Pixel count:** ${report.pixelCount.toLocaleString('en-US')} | **Inner-loop count:** ${report.iterations.toLocaleString('en-US')} | **Samples per operation:** ${report.repetitions}`,
    '',
    '| operation | paired baseline | mean net us | median net | min-max net | relative to mul |',
    '|---|---|---:|---:|---:|---:|',
    ...report.rows.map((row) => (
      `| \`${row.name}\` | \`${row.baselineName}\` | ${row.meanNetUs.toFixed(3)} | ${row.medianNetUs.toFixed(3)} | `
      + `${row.minNetUs.toFixed(3)}-${row.maxNetUs.toFixed(3)} | ${row.relativeToMultiply.toFixed(1)}x |`
    )),
    '',
    `Projection: ${report.projections.perLineUs.toFixed(3)} us per emitted blend line; `
    + `${report.projections.perPlacementBlockUs.toFixed(3)} us per placement sink block per pixel; `
    + `${report.projections.msPerFrameAt2000px.toFixed(2)} ms/frame at 2,000 px for one always-on placement.`,
    '',
  ].join('\n')
}
