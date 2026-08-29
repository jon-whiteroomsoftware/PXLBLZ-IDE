// Hardware confirmation for the two runtime-sensitive #907 families. The
// static oracle counts words present, not words executed, so a branch that
// skips work can be a static loser and a runtime winner (the #556 ternary
// finding). Production-shaped bodies, #556 paired-baseline method.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  declaredOutputProfileStamp,
  fetchControllerCompiler,
  nodeWebSocketFactory,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import type { Profile2Op } from './issue556'
import { isStableProfileWindow, summarizeProfileMeasurements } from './profilerModel'

const runHardware = process.env.ISSUE907_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const iterations = Number(process.env.PROFILE907_ITERATIONS ?? 2_593)
const repetitions = 5
const SETTLE_MS = 1_800
const SAMPLE_INTERVAL_MS = 350
const STABILIZE_INTERVAL_MS = 250
const MAX_STABILIZE_MS = 8_000
const STABILITY_TOLERANCE_MS = 0.15

// Posterize shape from the member capture body (#558 coefficients as
// globals): identity when q == 1 (flag k precomputed per frame). The probe
// runs the identity case — the case the branch is meant to make cheap.
export const PROFILE907_OPS: Profile2Op[] = [
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
    fn: 2, name: 'posterize identity blend (current)', group: 'baseline', baselineFn: 2, baseline: true,
    kind: 'before-render',
    body: 'm = x * pF + floor(x * pP + 0.5) / pP * pQ\nx = frac(m + 0.123)',
  },
  {
    fn: 3, name: 'posterize endpoint branch', group: 'effect-endpoint', baselineFn: 2, kind: 'before-render',
    body: 'm = pK ? x : x * pF + floor(x * pP + 0.5) / pP * pQ\nx = frac(m + 0.123)',
    exchange: { probe: 'pK ? x : x * pF + floor(x * pP + 0.5) / pP * pQ', baseline: 'x * pF + floor(x * pP + 0.5) / pP * pQ' },
  },
  {
    fn: 4, name: 'hsv eager q and t (current)', group: 'baseline', baselineFn: 4, baseline: true,
    kind: 'before-render',
    body: 'm = pV * (1 - pS * x)\nl = pV * (1 - (1 - pS) * x)\nw = pK ? m : l\nx = frac(w + 0.123)',
  },
  {
    fn: 5, name: 'hsv lane in branch', group: 'hsv-dead-lane', baselineFn: 4, kind: 'before-render',
    body: 'w = pK ? pV * (1 - pS * x) : pV * (1 - (1 - pS) * x)\nx = frac(w + 0.123)',
    exchange: {
      probe: 'w = pK ? pV * (1 - pS * x) : pV * (1 - (1 - pS) * x)',
      baseline: 'm = pV * (1 - pS * x)\nl = pV * (1 - (1 - pS) * x)\nw = pK ? m : l',
    },
  },
]

export function buildIdiomProbeSource(): string {
  const chain = PROFILE907_OPS
    .map((op) => {
      const body = op.body.split('\n').map((line) => `    ${line}`).join('\n')
      return `  if (f == ${op.fn}) for (i = 0; i < n; i++) {\n${body}\n  }`
    })
    .join('\n')
  return `// Generated idiom probe Pattern (#907). Source of truth: issue907.hardware.test.ts.
export var fn = 0
export var iters = 2593
export var ms = 0
export var acc = 0

var pF = 0
var pP = 6
var pQ = 1
var pK = 1
var pV = 0.8
var pS = 0.7

export function beforeRender(delta) {
  ms = ms + (delta - ms) * 0.2

  var x = acc
  var f = fn
  var n = iters
  var i = 0
  var m = 0
  var l = 0
  var w = 0

${chain}

  acc = frac(x + 0.0001)
}

export function render(index) {
  hsv(0, 0, 0.02)
}
`
}

describe('idiom probes on hardware (#907)', () => {
  it('keeps every probe/baseline pair exchange-consistent', () => {
    for (const op of PROFILE907_OPS) {
      if (op.baseline) continue
      const baseline = PROFILE907_OPS.find((candidate) => candidate.fn === op.baselineFn)!
      expect(op.body).toContain(op.exchange!.probe)
      expect(op.body.replace(op.exchange!.probe, op.exchange!.baseline)).toBe(baseline.body)
    }
  })

  it.skipIf(!runHardware)('prices the endpoint branch and dead-lane families', async () => {
    const compile = await fetchControllerCompiler(ip)
    const connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeWebSocketFactory,
      requestTimeoutMs: 15_000,
      pingIntervalMs: 0,
    })
    connection.on('error', (error) => console.error('controller socket:', error))
    await connection.connect()
    const original = await connection.getConfig()
    if (!original.activeProgramId) {
      connection.close()
      throw new Error('Controller did not report an active Pattern; refusing a non-reversible probe.')
    }
    const savedPrograms = await connection.listPrograms()
    if (!savedPrograms.some((program) => program.id === original.activeProgramId)) {
      connection.close()
      throw new Error(
        `Active Pattern ${original.activeProgramId} is not in the saved inventory; refusing a non-restorable probe.`,
      )
    }

    let runError: unknown
    try {
      const bytecode = compile(buildIdiomProbeSource())
      const programId = makeProgramId()
      connection.pushByteCode(bytecode, { id: programId, name: '' })
      const activated = await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: programId })
      if (activated.activeProgramId !== programId) throw new Error(`Probe ${programId} did not activate.`)

      const frameMsByFn = new Map<number, number[]>()
      for (const op of PROFILE907_OPS) {
        process.stdout.write(`  ${op.name} (fn=${op.fn}) ... `)
        connection.setVars({ fn: op.fn, iters: iterations })
        await sleep(SETTLE_MS)
        const deadline = Date.now() + MAX_STABILIZE_MS
        const window: number[] = []
        let stable: number | undefined
        while (Date.now() < deadline) {
          const variables = await connection.getVars()
          window.push(variables.ms)
          if (isStableProfileWindow(window, Math.max(STABILITY_TOLERANCE_MS, variables.ms * 0.002))) {
            stable = variables.ms
            break
          }
          await sleep(STABILIZE_INTERVAL_MS)
        }
        if (stable == null) throw new Error(`Probe fn=${op.fn} did not stabilize.`)
        const samples = [stable]
        for (let sample = 1; sample < repetitions; sample += 1) {
          await sleep(SAMPLE_INTERVAL_MS)
          samples.push((await connection.getVars()).ms)
        }
        frameMsByFn.set(op.fn, samples)
        console.log(samples.map((value) => value.toFixed(2)).join(', '))
      }

      const results = summarizeProfileMeasurements({
        operations: PROFILE907_OPS,
        frameMsByFn,
        iterations,
        multiplyFn: 1,
      })
      const report = {
        generatedAt: new Date().toISOString().slice(0, 10),
        device: original.name ?? ip,
        boardType: original.boardType,
        firmwareVersion: original.firmwareVersion ?? 'unknown',
        outputProfile: declaredOutputProfileStamp(),
        iterations,
        repetitions,
        rows: results.map((result) => ({
          name: result.op.name,
          baselineName: result.baselineName,
          medianNetUs: result.netPerIterationUs.median,
          meanNetUs: result.netPerIterationUs.mean,
          minNetUs: result.netPerIterationUs.min,
          maxNetUs: result.netPerIterationUs.max,
          relativeToMultiply: result.relativeToMultiply,
        })),
        rawSamplesByFn: Object.fromEntries([...frameMsByFn.entries()].map(([fn, samples]) => [String(fn), samples])),
      }
      writeFileSync(join(process.cwd(), 'test/perf-harness/issue907-idiom-probe.json'), `${JSON.stringify(report, null, 2)}\n`)
      for (const row of report.rows) {
        console.log(`${row.name}: ${row.medianNetUs.toFixed(3)} us median vs ${row.baselineName}`)
      }
    } catch (error) {
      runError = error
    } finally {
      try {
        connection.setActiveProgram(original.activeProgramId)
        const restored = await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: original.activeProgramId })
        if (restored.activeProgramId !== original.activeProgramId) {
          const restoreError = new Error(`Controller state did not restore (program=${restored.activeProgramId}).`)
          runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Probe and restore failed.')
        }
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
  }, 600_000)
})
