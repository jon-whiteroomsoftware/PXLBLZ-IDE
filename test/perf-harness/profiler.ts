// Native Pixelblaze operation profiler (#532).
//
// The runner compiles and loads profiler.js temporarily, measures each probe
// against its declared paired baseline, writes costs.md, and restores the
// Controller's active Pattern and pixel count even when a probe fails. It never
// reads or writes the Controller's pixel map.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import {
  buildProfileReport,
  isStableProfileWindow,
  PROFILE_OPS,
  summarizeProfileMeasurements,
} from './profilerModel'

const HERE = dirname(fileURLToPath(import.meta.url))
const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const OUTPUT_PROFILE = process.env.PIXELBLAZE_OUTPUT_PROFILE
  ?? 'Controller-native output (topology is not exposed by getConfig)'
// Keep the expensive HSV/noise probes comfortably below the watchdog as well
// as the cheap baseline loop.
const TARGET_MS = readPositiveNumber('PROFILE_TARGET_MS', 20)
const SETTLE_MS = readPositiveInteger('PROFILE_SETTLE_MS', 1_800)
const SAMPLE_INTERVAL_MS = readPositiveInteger('PROFILE_SAMPLE_INTERVAL_MS', 350)
const REPETITIONS = readPositiveInteger('PROFILE_REPETITIONS', 5)
const SHOW_RUNTIME_ONLY = process.env.PROFILE_SHOW_RUNTIME === '1'
// PROFILE_ONLY=56,57 limits the run to those probes plus their baselines and
// the multiply unit; PROFILE_OUTPUT redirects the table so a targeted round
// never overwrites the committed full tables.
const ONLY_FNS = process.env.PROFILE_ONLY ? parseProfileOnly(process.env.PROFILE_ONLY) : null
const OUTPUT_OVERRIDE = process.env.PROFILE_OUTPUT
const STABILIZE_INTERVAL_MS = readPositiveInteger('PROFILE_STABILIZE_INTERVAL_MS', 250)
const MAX_STABILIZE_MS = readPositiveInteger('PROFILE_MAX_STABILIZE_MS', 6_000)
const STABILITY_TOLERANCE_MS = readPositiveNumber('PROFILE_STABILITY_TOLERANCE_MS', 0.15)
const MAX_ITERS = 20_000
const MIN_ITERS = 20

async function measureSamples(
  connection: PixelblazeConnection,
  fn: number,
  iterations: number,
  repetitions = REPETITIONS,
): Promise<number[]> {
  connection.setVars({ fn, iters: iterations })
  await sleep(SETTLE_MS)
  const stableSample = await waitForStableProfile(connection, fn)
  const samples = [stableSample]
  for (let sample = 1; sample < repetitions; sample += 1) {
    await sleep(SAMPLE_INTERVAL_MS)
    samples.push(await readProfileMs(connection, fn))
  }
  return samples
}

async function waitForStableProfile(
  connection: PixelblazeConnection,
  fn: number,
): Promise<number> {
  const deadline = Date.now() + MAX_STABILIZE_MS
  const window: number[] = []
  while (Date.now() < deadline) {
    const value = await readProfileMs(connection, fn)
    window.push(value)
    const tolerance = Math.max(STABILITY_TOLERANCE_MS, value * 0.002)
    if (isStableProfileWindow(window, tolerance)) return value
    await sleep(STABILIZE_INTERVAL_MS)
  }
  throw new Error(
    `Profiler fn=${fn} did not stabilize within ${MAX_STABILIZE_MS}ms (last=${window.slice(-3).join(', ')}).`,
  )
}

async function readProfileMs(connection: PixelblazeConnection, fn: number): Promise<number> {
  const variables = await connection.getVars()
  if (!Number.isFinite(variables.ms)) {
    throw new Error(`Profiler fn=${fn} did not expose a finite ms value.`)
  }
  return variables.ms
}

async function autoTuneIterations(connection: PixelblazeConnection): Promise<number> {
  let iterations = 200
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [frameMs] = await measureSamples(connection, 0, iterations, 1)
    console.log(`  auto-tune: iterations=${iterations} -> frame=${frameMs.toFixed(2)}ms`)
    if (frameMs >= TARGET_MS * 0.8 && frameMs <= TARGET_MS * 1.5) break
    const scale = Math.max(0.2, Math.min(8, TARGET_MS / Math.max(frameMs, 0.5)))
    iterations = Math.round(iterations * scale)
    iterations = Math.max(MIN_ITERS, Math.min(MAX_ITERS, iterations))
  }
  return iterations
}

async function restoreController(
  connection: PixelblazeConnection,
  original: { activeProgramId: string; pixelCount?: number },
): Promise<void> {
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
    throw new Error(
      `Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount}).`,
    )
  }
}

async function main(): Promise<void> {
  console.log(`Connecting to Pixelblaze at ws://${IP}:81 ...`)
  const connection = new PixelblazeConnection({
    host: IP,
    webSocketFactory: nodeWebSocketFactory,
    requestTimeoutMs: 15_000,
    pingIntervalMs: 0,
  })
  connection.on('error', (error) => console.error('controller socket:', error))
  await connection.connect()
  const original = await connection.getConfig()
  if (!original.activeProgramId) {
    connection.close()
    throw new Error('Controller did not report an active Pattern; refusing a non-reversible profile.')
  }

  let runError: unknown
  try {
    const source = readFileSync(join(HERE, 'profiler.js'), 'utf8')
    const compile = await fetchControllerCompiler(IP)
    const bytecode = compile(source)
    const profilerId = makeProgramId()
    connection.pushByteCode(bytecode, { id: profilerId, name: '' })
    const activated = await waitForControllerConfig(
      () => connection.getConfig(),
      { activeProgramId: profilerId },
    )
    if (activated.activeProgramId !== profilerId) {
      throw new Error(`Profiler Pattern ${profilerId} did not activate.`)
    }

    const profilerVariables = await connection.getVars()
    if (!('ms' in profilerVariables) || !('acc' in profilerVariables)) {
      throw new Error('Loaded Pattern does not expose the profiler ms/acc variables.')
    }

    console.log('Auto-tuning inner-loop count ...')
    const iterations = await autoTuneIterations(connection)
    console.log(`Using iterations=${iterations}; repetitions=${REPETITIONS}.`)

    const operations = ONLY_FNS
      ? PROFILE_OPS.filter((operation) => (
          operation.fn <= 1
          || ONLY_FNS.has(operation.fn)
          || PROFILE_OPS.some((selected) => ONLY_FNS.has(selected.fn) && selected.baselineFn === operation.fn)
        ))
      : SHOW_RUNTIME_ONLY
        ? PROFILE_OPS.filter((operation) => operation.fn <= 1 || operation.fn >= 31)
        : PROFILE_OPS
    const frameMsByFn = new Map<number, number[]>()
    for (const operation of operations) {
      process.stdout.write(`  profiling ${operation.name} ... `)
      const samples = await measureSamples(connection, operation.fn, iterations)
      frameMsByFn.set(operation.fn, samples)
      console.log(`${samples.map((sample) => sample.toFixed(2)).join(', ')} ms`)
    }

    const results = summarizeProfileMeasurements({
      operations,
      frameMsByFn,
      iterations,
      multiplyFn: 1,
    })
    const report = buildProfileReport(results, {
      generatedAt: localDate(new Date()),
      device: original.name ?? IP,
      boardType: original.boardType,
      firmwareVersion: original.firmwareVersion ?? process.env.PIXELBLAZE_FW ?? 'unknown',
      outputProfile: OUTPUT_PROFILE,
      pixelCount: original.pixelCount ?? 0,
      iterations,
      repetitions: REPETITIONS,
    })
    const outputPath = OUTPUT_OVERRIDE ?? join(HERE, SHOW_RUNTIME_ONLY ? 'show-runtime-costs.md' : 'costs.md')
    writeFileSync(outputPath, report)
    console.log(`Cost table written to ${outputPath}`)
    // Raw per-repetition frame times beside the table, so every net row can
    // be recomputed from committed samples.
    const samplesPath = outputPath.replace(/\.md$/, '') + '.samples.json'
    writeFileSync(samplesPath, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      device: original.name ?? IP,
      firmwareVersion: original.firmwareVersion ?? null,
      pixelCount: original.pixelCount ?? null,
      iterations,
      repetitions: REPETITIONS,
      operations: operations.map((operation) => ({
        fn: operation.fn,
        name: operation.name,
        baselineFn: operation.baselineFn,
        frameMs: frameMsByFn.get(operation.fn) ?? [],
      })),
    }, null, 2)}\n`)
    console.log(`Raw samples written to ${samplesPath}`)
  } catch (error) {
    runError = error
  } finally {
    try {
      await restoreController(connection, {
        activeProgramId: original.activeProgramId,
        pixelCount: original.pixelCount,
      })
      console.log('Restored the original active Pattern and pixel count; the pixel map was untouched.')
    } catch (restoreError) {
      runError = runError == null
        ? restoreError
        : new AggregateError([runError, restoreError], 'Profile and Controller restoration both failed.')
    } finally {
      connection.close()
    }
  }
  if (runError != null) throw runError
}

/** Every requested id must name a known non-baseline probe; a typo must fail
 *  the run rather than silently produce a table of just the multiply unit. */
function parseProfileOnly(value: string): Set<number> {
  const known = new Map(PROFILE_OPS.map((operation) => [operation.fn, operation]))
  const ids = value.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (ids.length === 0) throw new Error('PROFILE_ONLY must list at least one probe id.')
  const selected = new Set<number>()
  for (const id of ids) {
    const fn = Number(id)
    const operation = Number.isInteger(fn) ? known.get(fn) : undefined
    if (!operation) throw new Error(`PROFILE_ONLY names unknown probe "${id}"; known ids are 0-${Math.max(...known.keys())}.`)
    if (operation.baseline) throw new Error(`PROFILE_ONLY probe ${fn} is a baseline; name the operation that uses it instead.`)
    selected.add(fn)
  }
  return selected
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`)
  return value
}

function localDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function readPositiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`)
  return value
}

main().catch((error) => {
  console.error('\nProfiler failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
