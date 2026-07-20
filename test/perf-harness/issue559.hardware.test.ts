// #559 probe: price the production HSV capture chain (slot-dispatched
// two-call shape) against the per-member specialized conversion, both over
// the same direct-write RGB baseline, with the #532/#556 method.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { isStableProfileWindow, profileStats } from './profilerModel'

const runHardware = process.env.ISSUE559_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const iterations = Number(process.env.PROFILE2_ITERATIONS ?? 2_593)
const repetitions = 5

// fn 0: direct-write RGB baseline (round-one fn 51 shape).
// fn 1: production shared chain - slot through two 4-arg calls + dispatch.
// fn 2: #559 per-member specialized conversion (arms write globals directly).
const PROBE_SOURCE = `
export var fn = 0
export var iters = 2593
export var ms = 0
export var acc = 0

var m0_r = 0
var m0_g = 0
var m0_b = 0
var m1_r = 0
var m1_g = 0
var m1_b = 0

function captureRgb(slot, r, g, b) {
  if (slot == 0) { m0_r = r; m0_g = g; m0_b = b }
  else { m1_r = r; m1_g = g; m1_b = b }
}
function captureHsv(slot, h, s, v) {
  h = h - floor(h)
  var i = floor(h * 6)
  var f = h * 6 - i
  var p = v * (1 - s)
  var q = v * (1 - f * s)
  var t = v * (1 - (1 - f) * s)
  if (i == 0) captureRgb(slot, v, t, p)
  else if (i == 1) captureRgb(slot, q, v, p)
  else if (i == 2) captureRgb(slot, p, v, t)
  else if (i == 3) captureRgb(slot, p, q, v)
  else if (i == 4) captureRgb(slot, t, p, v)
  else captureRgb(slot, v, p, q)
}
function sharedSink(h, s, v) { captureHsv(1, h, s, v) }
function specializedSink(h, s, v) {
  h = h - floor(h)
  var i = floor(h * 6)
  var f = h * 6 - i
  var p = v * (1 - s)
  if (i == 0) { m1_r = v; m1_g = v * (1 - (1 - f) * s); m1_b = p }
  else if (i == 1) { m1_r = v * (1 - f * s); m1_g = v; m1_b = p }
  else if (i == 2) { m1_r = p; m1_g = v; m1_b = v * (1 - (1 - f) * s) }
  else if (i == 3) { m1_r = p; m1_g = v * (1 - f * s); m1_b = v }
  else if (i == 4) { m1_r = v * (1 - (1 - f) * s); m1_g = p; m1_b = v }
  else { m1_r = v; m1_g = p; m1_b = v * (1 - f * s) }
}

export function beforeRender(delta) {
  ms = ms + (delta - ms) * 0.2
  var x = acc
  var f = fn
  var n = iters
  var i = 0
  if (f == 0) for (i = 0; i < n; i++) { captureRgb(1, x, 0.7, 0.8); x = frac(m1_r + m1_g + m1_b + x * 0.0001 + 0.123) }
  if (f == 1) for (i = 0; i < n; i++) { sharedSink(x, 0.7, 0.8); x = frac(m1_r + m1_g + m1_b + x * 0.0001 + 0.123) }
  if (f == 2) for (i = 0; i < n; i++) { specializedSink(x, 0.7, 0.8); x = frac(m1_r + m1_g + m1_b + x * 0.0001 + 0.123) }
  acc = frac(x + 0.0001)
}

export function render(index) {
  hsv(0, 0, 0.02)
}
`

describe('specialized HSV conversion probe (#559)', () => {
  it.skipIf(!runHardware)('prices shared versus specialized conversion and restores state', async () => {
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
    let runError: unknown
    let report: Record<string, unknown> | undefined
    try {
      const bytecode = compile(PROBE_SOURCE)
      const programId = makeProgramId()
      connection.pushByteCode(bytecode, { id: programId, name: '' })
      const activated = await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: programId })
      if (activated.activeProgramId !== programId) throw new Error('probe did not activate')

      async function measure(fn: number): Promise<number[]> {
        connection.setVars({ fn, iters: iterations })
        await sleep(1_800)
        const deadline = Date.now() + 8_000
        const window: number[] = []
        let stable: number | undefined
        while (Date.now() < deadline) {
          const variables = await connection.getVars()
          window.push(variables.ms as number)
          if (isStableProfileWindow(window, Math.max(0.15, (variables.ms as number) * 0.002))) {
            stable = variables.ms as number
            break
          }
          await sleep(250)
        }
        if (stable == null) throw new Error(`fn=${fn} did not stabilize`)
        const samples = [stable]
        for (let s = 1; s < repetitions; s += 1) {
          await sleep(350)
          samples.push((await connection.getVars()).ms as number)
        }
        return samples
      }

      const baseline = await measure(0)
      const shared = await measure(1)
      const specialized = await measure(2)
      const net = (probe: number[], base: number[]) => profileStats(
        probe.map((sample, index) => ((sample - base[index]) / iterations) * 1_000),
      )
      report = {
        generatedAt: new Date().toISOString().slice(0, 10),
        device: { name: original.name, firmwareVersion: original.firmwareVersion },
        iterations,
        sharedNetUs: net(shared, baseline),
        specializedNetUs: net(specialized, baseline),
        deltaUs: net(shared, specialized),
      }
      writeFileSync(join(process.cwd(), 'test/perf-harness/issue559-probe.json'), `${JSON.stringify(report, null, 2)}\n`)
      console.log(JSON.stringify(report))
    } catch (error) {
      runError = error
    } finally {
      try {
        try {
          await connection.getConfig()
        } catch {
          await sleep(2_000)
          await connection.connect()
        }
        connection.setActiveProgram(original.activeProgramId)
        const restored = await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: original.activeProgramId })
        if (restored.activeProgramId !== original.activeProgramId) {
          const restoreError = new Error('Controller did not restore')
          runError = runError == null ? restoreError : new AggregateError([runError, restoreError])
        }
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(report).toBeTruthy()
  }, 600_000)
})
