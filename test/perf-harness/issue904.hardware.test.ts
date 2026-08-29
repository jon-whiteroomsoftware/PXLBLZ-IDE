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
import {
  PROFILE904_OPS,
  blendProbeSection,
  buildBlendProbeSource,
  projectBlendSavings,
  type BlendProbeRow,
} from './issue904'
import { isStableProfileWindow, summarizeProfileMeasurements } from './profilerModel'

const runHardware = process.env.ISSUE904_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
// Same inner-loop count as #532/#556 so the tables are directly comparable.
const iterations = Number(process.env.PROFILE904_ITERATIONS ?? 2_593)
const repetitions = 5
const SETTLE_MS = 1_800
const SAMPLE_INTERVAL_MS = 350
const STABILIZE_INTERVAL_MS = 250
const MAX_STABILIZE_MS = 8_000
const STABILITY_TOLERANCE_MS = 0.15

async function measureSamples(connection: PixelblazeConnection, fn: number): Promise<number[]> {
  connection.setVars({ fn, iters: iterations })
  await sleep(SETTLE_MS)
  const deadline = Date.now() + MAX_STABILIZE_MS
  const window: number[] = []
  let stable: number | undefined
  while (Date.now() < deadline) {
    const variables = await connection.getVars()
    if (!Number.isFinite(variables.ms)) throw new Error(`Probe fn=${fn} did not expose a finite ms value.`)
    window.push(variables.ms)
    const tolerance = Math.max(STABILITY_TOLERANCE_MS, variables.ms * 0.002)
    if (isStableProfileWindow(window, tolerance)) {
      stable = variables.ms
      break
    }
    await sleep(STABILIZE_INTERVAL_MS)
  }
  if (stable == null) {
    throw new Error(`Probe fn=${fn} did not stabilize within ${MAX_STABILIZE_MS}ms (last=${window.slice(-3).join(', ')}).`)
  }
  const samples = [stable]
  for (let sample = 1; sample < repetitions; sample += 1) {
    await sleep(SAMPLE_INTERVAL_MS)
    const variables = await connection.getVars()
    samples.push(variables.ms)
  }
  return samples
}

describe('identity-blend fold probe on hardware (#904)', () => {
  it.skipIf(!runHardware)('prices the emitted blend against its folded form and restores Controller state', async () => {
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
    // Restoration reselects a *saved* Pattern; a transient run-only Pattern
    // would be destroyed by the probe push. Refuse unless the active id is
    // in the device inventory.
    const savedPrograms = await connection.listPrograms()
    if (!savedPrograms.some((program) => program.id === original.activeProgramId)) {
      connection.close()
      throw new Error(
        `Active Pattern ${original.activeProgramId} is not in the saved inventory; refusing a non-restorable probe.`,
      )
    }

    let runError: unknown
    let sectionText = ''
    try {
      const bytecode = compile(buildBlendProbeSource())
      const programId = makeProgramId()
      connection.pushByteCode(bytecode, { id: programId, name: '' })
      const activated = await waitForControllerConfig(
        () => connection.getConfig(),
        { activeProgramId: programId },
      )
      if (activated.activeProgramId !== programId) throw new Error(`Probe Pattern ${programId} did not activate.`)

      const frameMsByFn = new Map<number, number[]>()
      for (const op of PROFILE904_OPS) {
        process.stdout.write(`  ${op.name} (fn=${op.fn}) ... `)
        const samples = await measureSamples(connection, op.fn)
        frameMsByFn.set(op.fn, samples)
        console.log(samples.map((sample) => sample.toFixed(2)).join(', '))
      }

      const results = summarizeProfileMeasurements({
        operations: PROFILE904_OPS,
        frameMsByFn,
        iterations,
        multiplyFn: 1,
      })
      const rows: BlendProbeRow[] = results.map((result) => ({
        name: result.op.name,
        baselineName: result.baselineName,
        medianNetUs: result.netPerIterationUs.median,
        meanNetUs: result.netPerIterationUs.mean,
        minNetUs: result.netPerIterationUs.min,
        maxNetUs: result.netPerIterationUs.max,
        relativeToMultiply: result.relativeToMultiply,
      }))

      const report = {
        generatedAt: new Date().toISOString().slice(0, 10),
        device: original.name ?? ip,
        boardType: original.boardType,
        firmwareVersion: original.firmwareVersion ?? 'unknown',
        outputProfile: declaredOutputProfileStamp(),
        pixelCount: original.pixelCount ?? 0,
        iterations,
        repetitions,
        rows,
        rawSamplesByFn: Object.fromEntries(
          [...frameMsByFn.entries()].map(([fn, samples]) => [String(fn), samples]),
        ),
        projections: projectBlendSavings(rows),
      }
      sectionText = blendProbeSection(report)
      const outputPath = join(process.cwd(), 'test/perf-harness/issue904-blend-probe.json')
      writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
      console.log(`\nWrote ${outputPath}\n`)
      console.log(sectionText)
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
        const restored = await waitForControllerConfig(
          () => connection.getConfig(),
          { activeProgramId: original.activeProgramId },
        )
        if (restored.activeProgramId !== original.activeProgramId) {
          const restoreError = new Error(`Controller state did not restore (program=${restored.activeProgramId}).`)
          runError = runError == null
            ? restoreError
            : new AggregateError([runError, restoreError], 'Probe and restoration both failed.')
        }
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(sectionText).toContain('## Identity-blend fold probe')
  }, 600_000)
})
