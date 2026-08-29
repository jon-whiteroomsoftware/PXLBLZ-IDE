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
import { ARRAY_PROBE_ELEMENTS, ARRAY_PROBE_MODES, buildArrayProbeSource, summarizeArrayProbe } from './issue909'
import { isStableProfileWindow } from './profilerModel'

const runHardware = process.env.ISSUE909_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const passes = Number(process.env.PROFILE909_PASSES ?? 4)
const repetitions = 5
const SETTLE_MS = 1_800
const SAMPLE_INTERVAL_MS = 350
const STABILIZE_INTERVAL_MS = 250
const MAX_STABILIZE_MS = 8_000
const STABILITY_TOLERANCE_MS = 0.15

describe('array-helper pricing on hardware (#909)', () => {
  it.skipIf(!runHardware)('prices mutate/forEach/sum against for loops and restores Controller state', async () => {
    const compile = await fetchControllerCompiler(ip)
    const connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeWebSocketFactory,
      requestTimeoutMs: 15_000,
      pingIntervalMs: 0,
    })
    connection.on('error', (error) => console.error('controller socket:', error))
    await connection.connect()
    let runError: unknown
    let original: Awaited<ReturnType<typeof connection.getConfig>> | undefined
    try {
      original = await connection.getConfig()
      if (!original.activeProgramId) {
        throw new Error('Controller did not report an active Pattern; refusing a non-reversible probe.')
      }
      // Restoration reselects a *saved* Pattern; a transient run-only Pattern
      // would be destroyed by the probe push.
      const savedPrograms = await connection.listPrograms()
      if (!savedPrograms.some((program) => program.id === original.activeProgramId)) {
        throw new Error(
          `Active Pattern ${original.activeProgramId} is not in the saved inventory; refusing a non-restorable probe.`,
        )
      }

      const bytecode = compile(buildArrayProbeSource())
      const programId = makeProgramId()
      connection.pushByteCode(bytecode, { id: programId, name: '' })
      const activated = await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: programId })
      if (activated.activeProgramId !== programId) throw new Error(`Probe ${programId} did not activate.`)

      // Correctness phase: each paired mode applies one pass from an
      // identical reset ramp; witnesses must match its counterpart's.
      const witnesses = new Map<number, { probeA: number; probeB: number; probeSum: number }>()
      for (const mode of ARRAY_PROBE_MODES) {
        if (mode.baseline) continue
        connection.setVars({ fn: mode.fn, passes, once: 0 })
        await sleep(600)
        const variables = await connection.getVars()
        if (variables.once !== 1) throw new Error(`One-shot verify for fn=${mode.fn} did not run.`)
        witnesses.set(mode.fn, { probeA: variables.probeA, probeB: variables.probeB, probeSum: variables.probeSum })
      }
      for (const mode of ARRAY_PROBE_MODES) {
        if (mode.pairsWith == null) continue
        const mine = witnesses.get(mode.fn)!
        const theirs = witnesses.get(mode.pairsWith)!
        const same = mode.fn <= 2
          ? mine.probeA === theirs.probeA && mine.probeB === theirs.probeB
          : Math.abs(mine.probeSum - theirs.probeSum) < 0.01
        if (!same) {
          throw new Error(
            `Mode "${mode.name}" diverges from its for-loop pair: ${JSON.stringify(mine)} vs ${JSON.stringify(theirs)}.`,
          )
        }
      }
      console.log('  correctness witnesses match across paired modes')

      const frameMsByFn = new Map<number, number[]>()
      for (const mode of ARRAY_PROBE_MODES) {
        process.stdout.write(`  ${mode.name} (fn=${mode.fn}) ... `)
        connection.setVars({ fn: mode.fn, passes })
        await sleep(SETTLE_MS)
        const deadline = Date.now() + MAX_STABILIZE_MS
        const window: number[] = []
        let stable: number | undefined
        while (Date.now() < deadline) {
          const variables = await connection.getVars()
          if (!Number.isFinite(variables.ms)) throw new Error(`Probe fn=${mode.fn} did not expose a finite ms value.`)
          window.push(variables.ms)
          if (isStableProfileWindow(window, Math.max(STABILITY_TOLERANCE_MS, variables.ms * 0.002))) {
            stable = variables.ms
            break
          }
          await sleep(STABILIZE_INTERVAL_MS)
        }
        if (stable == null) throw new Error(`Probe fn=${mode.fn} did not stabilize.`)
        const samples = [stable]
        for (let sample = 1; sample < repetitions; sample += 1) {
          await sleep(SAMPLE_INTERVAL_MS)
          samples.push((await connection.getVars()).ms)
        }
        frameMsByFn.set(mode.fn, samples)
        console.log(samples.map((value) => value.toFixed(2)).join(', '))
      }

      const rows = summarizeArrayProbe(frameMsByFn, passes)
      const report = {
        generatedAt: new Date().toISOString().slice(0, 10),
        device: original.name ?? ip,
        boardType: original.boardType,
        firmwareVersion: original.firmwareVersion ?? 'unknown',
        outputProfile: declaredOutputProfileStamp(),
        elements: ARRAY_PROBE_ELEMENTS,
        passes,
        repetitions,
        rows,
        rawSamplesByFn: Object.fromEntries([...frameMsByFn.entries()].map(([fn, samples]) => [String(fn), samples])),
      }
      writeFileSync(join(process.cwd(), 'test/perf-harness/issue909-array-probe.json'), `${JSON.stringify(report, null, 2)}\n`)
      for (const row of rows) {
        console.log(
          `${row.name}: ${row.perElementUs.toFixed(3)} us/element${row.vsForLoop != null ? ` (${row.vsForLoop.toFixed(2)}x the for loop)` : ''}`,
        )
      }
    } catch (error) {
      runError = error
    } finally {
      // A dropped PixelblazeConnection is never reused: restoration builds a
      // fresh connection object when the probe's socket died (#906 pattern).
      let restore = connection
      try {
        if (original?.activeProgramId) {
          try {
            await connection.getConfig()
          } catch {
            connection.close()
            await sleep(2_000)
            restore = new PixelblazeConnection({
              host: ip,
              webSocketFactory: nodeWebSocketFactory,
              requestTimeoutMs: 15_000,
              pingIntervalMs: 0,
            })
            restore.on('error', (error) => console.error('restore socket:', error))
            await restore.connect()
          }
          restore.setActiveProgram(original.activeProgramId)
          const restored = await waitForControllerConfig(
            () => restore.getConfig(),
            { activeProgramId: original.activeProgramId },
          )
          if (restored.activeProgramId !== original.activeProgramId) {
            const restoreError = new Error(`Controller state did not restore (program=${restored.activeProgramId}).`)
            runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Probe and restore failed.')
          }
        }
      } finally {
        if (restore !== connection) restore.close()
        connection.close()
      }
    }
    if (runError != null) throw runError
  }, 600_000)
})
