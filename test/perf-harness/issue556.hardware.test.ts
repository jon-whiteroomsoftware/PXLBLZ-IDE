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
  PROFILE2_FN_OPS,
  PROFILE2_OPS,
  buildFunctionValueProbeSource,
  buildProfiler2Source,
  roundTwoSection,
  summarizeSinkMeasurements,
  type Profile2Op,
  type RoundTwoRow,
} from './issue556'
import { isStableProfileWindow, summarizeProfileMeasurements } from './profilerModel'

const runHardware = process.env.ISSUE556_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
// #532 landed on 2,593 inner-loop iterations; round two pins the same count
// so the tables are directly comparable.
const iterations = Number(process.env.PROFILE2_ITERATIONS ?? 2_593)
const sinkReps = Number(process.env.PROFILE2_REPS ?? 16)
const repetitions = 5
const SETTLE_MS = 1_800
const SAMPLE_INTERVAL_MS = 350
const STABILIZE_INTERVAL_MS = 250
const MAX_STABILIZE_MS = 8_000
const STABILITY_TOLERANCE_MS = 0.15

async function readProfileMs(connection: PixelblazeConnection, fn: number): Promise<number> {
  const variables = await connection.getVars()
  if (!Number.isFinite(variables.ms)) throw new Error(`Probe fn=${fn} did not expose a finite ms value.`)
  return variables.ms
}

async function measureSamples(connection: PixelblazeConnection, fn: number): Promise<number[]> {
  connection.setVars({ fn, iters: iterations, reps: sinkReps })
  await sleep(SETTLE_MS)
  const deadline = Date.now() + MAX_STABILIZE_MS
  const window: number[] = []
  let stable: number | undefined
  while (Date.now() < deadline) {
    const value = await readProfileMs(connection, fn)
    window.push(value)
    const tolerance = Math.max(STABILITY_TOLERANCE_MS, value * 0.002)
    if (isStableProfileWindow(window, tolerance)) {
      stable = value
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
    samples.push(await readProfileMs(connection, fn))
  }
  return samples
}

async function activateProbe(
  connection: PixelblazeConnection,
  compile: (source: string) => Uint8Array,
  source: string,
): Promise<void> {
  const bytecode = compile(source)
  const programId = makeProgramId()
  connection.pushByteCode(bytecode, { id: programId, name: '' })
  const activated = await waitForControllerConfig(
    () => connection.getConfig(),
    { activeProgramId: programId },
  )
  if (activated.activeProgramId !== programId) throw new Error(`Probe Pattern ${programId} did not activate.`)
  const probeVariables = await connection.getVars()
  if (!('ms' in probeVariables) || !('acc' in probeVariables)) {
    throw new Error('Loaded probe Pattern does not expose ms/acc variables.')
  }
}

async function measureOps(
  connection: PixelblazeConnection,
  ops: Profile2Op[],
): Promise<Map<number, number[]>> {
  const frameMsByFn = new Map<number, number[]>()
  for (const op of ops) {
    process.stdout.write(`  ${op.name} (fn=${op.fn}) ... `)
    const samples = await measureSamples(connection, op.fn)
    frameMsByFn.set(op.fn, samples)
    console.log(samples.map((sample) => sample.toFixed(2)).join(', '))
  }
  return frameMsByFn
}

describe('op-cost profiler round two on hardware (#556)', () => {
  it.skipIf(!runHardware)('prices round-two probes with paired baselines and restores Controller state', async () => {
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
    let sectionText = ''
    try {
      const findings: string[] = []

      await activateProbe(connection, compile, buildProfiler2Source())
      const mainSamples = await measureOps(connection, PROFILE2_OPS)

      const beforeRenderOps = PROFILE2_OPS.filter((op) => op.kind === 'before-render')
      const beforeRenderResults = summarizeProfileMeasurements({
        operations: beforeRenderOps,
        frameMsByFn: mainSamples,
        iterations,
        multiplyFn: 1,
      })
      const multiplyUs = beforeRenderResults.find((result) => result.op.fn === 1)!.netPerIterationUs.median
      const rows: RoundTwoRow[] = beforeRenderResults.map((result) => ({
        name: result.op.name,
        group: result.op.group,
        baselineName: result.baselineName,
        netUs: result.netPerIterationUs,
        relativeToMultiply: result.relativeToMultiply,
        perCall: false,
      }))

      const pixelCount = original.pixelCount ?? 0
      const sinkRows = summarizeSinkMeasurements({
        operations: PROFILE2_OPS,
        frameMsByFn: mainSamples,
        pixelCount,
        reps: sinkReps,
        multiplyUs,
      })
      rows.push(...sinkRows)
      const hsvVsRgb = sinkRows.find((row) => row.name === 'native hsv sink')
      if (hsvVsRgb) {
        findings.push(
          `Native hsv() costs ${hsvVsRgb.netUs.median.toFixed(3)} us/call more than native rgb() with precomputed arguments; `
          + 'the generated VM conversion is 35.308 us/pixel (round one), so the delta is the steady-state direct-sink prize (#557).',
        )
      }

      let fnProbeAvailable = true
      try {
        compile(buildFunctionValueProbeSource())
      } catch (error) {
        fnProbeAvailable = false
        findings.push(
          `Function values cannot be stored/called on this firmware (device compiler: ${error instanceof Error ? error.message : String(error)}). `
          + 'This forecloses the rebinding refinement of the direct-sink slice; the flag-branch shape still works.',
        )
      }
      if (fnProbeAvailable) {
        await activateProbe(connection, compile, buildFunctionValueProbeSource())
        const fnSamples = await measureOps(connection, PROFILE2_FN_OPS)
        const fnResults = summarizeProfileMeasurements({
          operations: PROFILE2_FN_OPS.filter((op) => op.kind === 'before-render'),
          frameMsByFn: fnSamples,
          iterations,
          multiplyFn: 1,
        })
        rows.push(...fnResults.map((result) => ({
          name: result.op.name,
          group: result.op.group,
          baselineName: result.baselineName,
          netUs: result.netPerIterationUs,
          relativeToMultiply: result.relativeToMultiply,
          perCall: false,
        })))
        findings.push('Function values can be stored in scalars and array elements and called; rebinding is available (costs in the call rows above).')
      }

      const generatedAt = new Date().toISOString().slice(0, 10)
      sectionText = roundTwoSection({
        generatedAt,
        device: original.name ?? ip,
        boardType: original.boardType,
        firmwareVersion: original.firmwareVersion ?? 'unknown',
        outputProfile: declaredOutputProfileStamp(),
        pixelCount,
        iterations,
        repetitions,
        sinkReps,
        rows,
        findings,
      })
      const outputPath = join(process.cwd(), 'test/perf-harness/show-runtime-costs.round2.md')
      writeFileSync(outputPath, `${sectionText}\n`)
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
        if (original.pixelCount != null) connection.setPixelCount(original.pixelCount, false)
        const restored = await waitForControllerConfig(
          () => connection.getConfig(),
          { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount },
        )
        if (
          restored.activeProgramId !== original.activeProgramId
          || restored.pixelCount !== original.pixelCount
        ) {
          const restoreError = new Error(
            `Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount}).`,
          )
          runError = runError == null
            ? restoreError
            : new AggregateError([runError, restoreError], 'Probe and restoration both failed.')
        }
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(sectionText).toContain('## Round two')
  }, 1_200_000)
})
