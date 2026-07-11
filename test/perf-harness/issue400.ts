// Issue #400 routing-representation spike. Generates deterministic routing
// fixtures, measures every candidate in both emulators and with the device's
// own compiler, then optionally pushes viable 256-pixel cases through one
// socket for hardware FPS sampling.
//
//   PIXELBLAZE_IP=192.168.8.224 npm run issue400 -- --hardware

import { writeFileSync } from 'node:fs'
import vm from 'node:vm'
import WebSocket from 'ws'
import { bundle } from '../../src/engine/bundle'
import {
  PixelblazeConnection,
  type WebSocketLike,
} from '../../src/engine/PixelblazeConnection'
import {
  buildCompilerEnv,
  missingComponents,
  v3AdapterV3,
} from '../../src/engine/compilerExtraction'
import { bytecodeHeaderReconciles, makeProgramId } from '../../src/engine/bytecodePush'
import { benchOne } from './benchCore'
import {
  buildRoutingProbe,
  makeRoutingFixture,
  representationKindsFor,
  type RoutingFixtureKind,
  type RoutingRepresentation,
} from './routingRepresentations'

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const DEFAULT_OUT = 'docs/plans/archive/issue-400-routing-representation-results.md'
const MEASURED_DEVICE_BYTECODE_BUDGET = 68384
const FIXTURE_KINDS: RoutingFixtureKind[] = [
  'contiguous',
  'serpentine-bands',
  'interleaved',
  'sparse-exceptions',
]

interface Args {
  out: string
  hardware: boolean
  settleMs: number
  sampleMs: number
}

interface DeviceCompileOk {
  ok: true
  bytecode: Uint8Array
}

interface DeviceCompileFail {
  ok: false
  error: string
}

type DeviceCompileResult = DeviceCompileOk | DeviceCompileFail

interface Measurement {
  pixelCount: number
  layoutCount: number
  fixture: RoutingFixtureKind
  representation: RoutingRepresentation
  sourceBytes: number
  bytecodeBytes: number | null
  compileError: string | null
  globals: number
  arrays: number
  arrayElements: number
  fastMs: number
  preciseMs: number
}

interface FpsStats {
  mean: number
  min: number
  max: number
  samples: number
}

interface HardwareMeasurement {
  fixture: RoutingFixtureKind
  representation: RoutingRepresentation
  bytecodeBytes: number
  fps: FpsStats | null
  error: string | null
}

interface CompiledProgram {
  exports: { name: string; address: number }[]
  compiled: number[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function parseArgs(argv: string[]): Args {
  const args: Args = { out: DEFAULT_OUT, hardware: false, settleMs: 1500, sampleMs: 2500 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--out') args.out = argv[++index] ?? DEFAULT_OUT
    else if (arg === '--hardware') args.hardware = true
    else if (arg === '--settle') args.settleMs = positiveInt(arg, argv[++index])
    else if (arg === '--sample') args.sampleMs = positiveInt(arg, argv[++index])
    else throw new Error(`unknown argument ${arg}`)
  }
  return args
}

function positiveInt(flag: string, raw: string | undefined): number {
  const value = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(value) || value < 1) throw new Error(`${flag} needs a positive integer`)
  return value
}

async function fetchDeviceCompiler(ip: string): Promise<(source: string) => DeviceCompileResult> {
  const response = await fetch(`http://${ip}/index.html.gz`)
  if (!response.ok) throw new Error(`GET index.html.gz -> ${response.status}`)
  const compressed = await response.arrayBuffer()
  const stream = new Response(compressed).body!.pipeThrough(new DecompressionStream('gzip'))
  let webUi = await new Response(stream).text()
  if (webUi.charCodeAt(0) === 0xfeff) webUi = webUi.slice(1)

  const components = v3AdapterV3(webUi)
  const missing = missingComponents(components)
  if (missing.length > 0) throw new Error(`compiler extraction miss: ${missing.join(', ')}`)
  const context = vm.createContext({ window: {} })
  vm.runInContext(buildCompilerEnv(components), context, { filename: 'device-compiler.js' })
  const compilePattern = (context as { compilePattern?: (source: string) => unknown }).compilePattern
  if (typeof compilePattern !== 'function') throw new Error('device compiler did not define compilePattern')

  return (source: string) => {
    try {
      const output = compilePattern(source) as CompiledProgram & { status: string }
      if (output.status !== 'OK') return { ok: false, error: output.status }
      const bytecode = buildBytecode(output)
      if (!bytecodeHeaderReconciles(bytecode)) return { ok: false, error: 'invalid bytecode header' }
      return { ok: true, bytecode }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

function buildBytecode(program: CompiledProgram): Uint8Array {
  const exportBytes = program.exports.reduce((sum, item) => sum + 5 + item.name.length, 0)
  const buffer = new ArrayBuffer(8 + program.compiled.length * 4 + exportBytes)
  const view = new DataView(buffer)
  let offset = 0
  view.setUint32(offset, program.compiled.length * 4, true); offset += 4
  view.setUint32(offset, exportBytes, true); offset += 4
  for (const opcode of program.compiled) {
    view.setInt32(offset, opcode, true)
    offset += 4
  }
  for (const item of program.exports) {
    view.setUint32(offset, item.address, true); offset += 4
    for (let index = 0; index < item.name.length; index += 1) {
      view.setUint8(offset++, item.name.charCodeAt(index))
    }
    view.setUint8(offset++, 0)
  }
  return new Uint8Array(buffer)
}

function measureAll(compile: (source: string) => DeviceCompileResult): Measurement[] {
  const measurements: Measurement[] = []
  for (const pixelCount of [256, 1024]) {
    for (const layoutCount of [2, 4, 8]) {
      for (const fixtureKind of FIXTURE_KINDS) {
        const fixture = makeRoutingFixture({ kind: fixtureKind, pixelCount, layoutCount })
        for (const representation of representationKindsFor(fixture)) {
          process.stdout.write(`  ${pixelCount}px ${layoutCount}L ${fixtureKind} ${representation} ... `)
          const probe = buildRoutingProbe(fixture, representation)
          const frames = layoutCount * 3
          const fast = benchOne(probe.source, {}, 'fast', {
            frames,
            warmup: 0,
            grid: { rows: 1, cols: pixelCount },
          })
          const precise = benchOne(probe.source, {}, 'precise', {
            frames,
            warmup: 0,
            grid: { rows: 1, cols: pixelCount },
          })
          const deviceSource = bundle(probe.source, {}).code
          const compiled = compile(deviceSource)
          measurements.push({
            pixelCount,
            layoutCount,
            fixture: fixtureKind,
            representation,
            sourceBytes: probe.sourceBytes,
            bytecodeBytes: compiled.ok ? compiled.bytecode.length : null,
            compileError: compiled.ok ? null : compiled.error,
            globals: probe.pressure.globals,
            arrays: probe.pressure.arrays,
            arrayElements: probe.pressure.arrayElements,
            fastMs: fast.meanFrameMs,
            preciseMs: precise.meanFrameMs,
          })
          console.log(compiled.ok ? `${compiled.bytecode.length} B` : `compile failed: ${compiled.error}`)
        }
      }
    }
  }
  return measurements
}

function viableHardwareCases(measurements: Measurement[]): Measurement[] {
  return FIXTURE_KINDS.flatMap((fixture) => {
    const rows = measurements.filter((row) => (
      row.pixelCount === 256 && row.layoutCount === 8 && row.fixture === fixture && !row.compileError
    ))
    const branch = rows.find((row) => row.representation === 'range-branches')
    if (!branch) return []
    return rows.filter((row) => (
      row.representation === 'range-branches'
      || (
        (row.bytecodeBytes ?? Number.POSITIVE_INFINITY) <= MEASURED_DEVICE_BYTECODE_BUDGET
        &&
        row.arrayElements <= 2048
        && row.preciseMs <= branch.preciseMs * 2
      )
    )).filter((row) => (
      (row.bytecodeBytes ?? Number.POSITIVE_INFINITY) <= MEASURED_DEVICE_BYTECODE_BUDGET
    ))
  })
}

function nodeFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

async function sampleFps(
  connection: PixelblazeConnection,
  settleMs: number,
  sampleMs: number,
): Promise<FpsStats> {
  await sleep(settleMs)
  const samples: number[] = []
  let previous = -1
  const end = Date.now() + sampleMs
  while (Date.now() < end) {
    const fps = connection.fps
    if (typeof fps === 'number' && fps > 0 && fps !== previous) {
      samples.push(fps)
      previous = fps
    }
    await sleep(250)
  }
  if (samples.length === 0) throw new Error('controller did not report FPS')
  return {
    mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    min: Math.min(...samples),
    max: Math.max(...samples),
    samples: samples.length,
  }
}

async function pushAndMeasure(
  connection: PixelblazeConnection,
  bytecode: Uint8Array,
  settleMs: number,
  sampleMs: number,
): Promise<FpsStats> {
  const id = makeProgramId()
  connection.pushByteCode(bytecode, { id, name: '' })
  await sleep(1800)
  const config = await connection.getConfig()
  if (config.activeProgramId !== id) throw new Error(`pushed ${id}, active is ${config.activeProgramId}`)
  return sampleFps(connection, settleMs, sampleMs)
}

async function measureHardware(
  compile: (source: string) => DeviceCompileResult,
  candidates: Measurement[],
  args: Args,
): Promise<HardwareMeasurement[]> {
  const connection = new PixelblazeConnection({
    host: IP,
    webSocketFactory: nodeFactory,
    requestTimeoutMs: 15000,
  })
  connection.on('error', (error) => console.error('controller socket:', error))
  await connection.connect()
  const results: HardwareMeasurement[] = []
  try {
    for (const candidate of candidates) {
      const fixture = makeRoutingFixture({
        kind: candidate.fixture,
        pixelCount: candidate.pixelCount,
        layoutCount: candidate.layoutCount,
      })
      const probe = buildRoutingProbe(fixture, candidate.representation, { switchEveryMs: 3000 })
      const compiled = compile(bundle(probe.source, {}).code)
      if (!compiled.ok) continue
      process.stdout.write(`  hardware ${candidate.fixture} ${candidate.representation} ... `)
      try {
        const fps = await pushAndMeasure(connection, compiled.bytecode, args.settleMs, args.sampleMs)
        console.log(`${fps.mean.toFixed(2)} FPS`)
        results.push({
          fixture: candidate.fixture,
          representation: candidate.representation,
          bytecodeBytes: compiled.bytecode.length,
          fps,
          error: null,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.log(`activation failed: ${message}`)
        results.push({
          fixture: candidate.fixture,
          representation: candidate.representation,
          bytecodeBytes: compiled.bytecode.length,
          fps: null,
          error: message,
        })
      }
    }

    const visualFixture = makeRoutingFixture({ kind: 'contiguous', pixelCount: 256, layoutCount: 8 })
    const visualProbe = buildRoutingProbe(visualFixture, 'generated-formula', { switchEveryMs: 3000 })
    const visualCompiled = compile(bundle(visualProbe.source, {}).code)
    if (!visualCompiled.ok) throw new Error(`final visual probe failed: ${visualCompiled.error}`)
    await pushAndMeasure(connection, visualCompiled.bytecode, 500, 1000)
  } finally {
    connection.close()
  }
  return results
}

function renderReport(measurements: Measurement[], hardware: HardwareMeasurement[]): string {
  const lines = [
    '# Issue 400 routing-representation measurements',
    '',
    'Generated by `npm run issue400 -- --hardware` using deterministic four-route fixtures.',
    'Emulator timings are operation-count proxies; hardware FPS is the device source of truth.',
    '',
    '## Decision',
    '',
    '- Keep generated range branches as the general default. They preserve arbitrary pixel sets, consume no arrays, and remain compact and fast when layouts contain few runs.',
    '- Do not adopt RLE tables. They add four globals/arrays, still scale with run count, and were consistently much slower than branches or direct lookup.',
    '- A future compiler may recognize regular contiguous, row-band, and interleaved layouts and emit formulas. The 256-pixel formula probes compiled to 292-408 bytes and sustained 121-125 FPS on hardware with no arrays.',
    '- A packed per-pixel table is a proven fallback for irregular layouts only when a formula is unavailable, branch output would exceed the measured 68,384-byte device budget or impose unacceptable route-scan cost, and the table fits an explicit array-element budget. At 256 pixels x 8 layouts it used 2,048 elements and about 41 KB of bytecode while sustaining about 124 FPS.',
    '- Packed lookup is not a blanket default: at 1,024 pixels x 8 layouts it grows to 8,192 elements and about 164 KB of bytecode. Representation selection should therefore happen per layout or Show from measured run count, formula eligibility, estimated artifact size, and array pressure.',
    '- Device-compiler success alone is insufficient. During the exploratory pass the 256 x 8 interleaved branch artifact compiled to about 156 KB but the controller refused to activate it, matching the earlier measured device budget.',
    '',
    'This spike records the selector policy but deliberately leaves the production emitter unchanged. Follow-up #408 owns formula recognition and the bounded packed fallback together with real Show fixtures, so optimization cannot weaken arbitrary-set semantics.',
    '',
    '## Compile and emulator matrix',
    '',
    '| Pixels | Layouts | Fixture | Representation | Source B | Bytecode B | Globals | Arrays | Elements | Fast ms | Precise ms | Compile |',
    '| ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ]
  for (const row of measurements) {
    lines.push(`| ${row.pixelCount} | ${row.layoutCount} | ${row.fixture} | ${row.representation} | ${row.sourceBytes} | ${row.bytecodeBytes ?? '-'} | ${row.globals} | ${row.arrays} | ${row.arrayElements} | ${row.fastMs.toFixed(3)} | ${row.preciseMs.toFixed(3)} | ${row.compileError ? inline(row.compileError) : 'ok'} |`)
  }
  lines.push('', '## Hardware matrix', '')
  if (hardware.length === 0) {
    lines.push('Hardware FPS was not requested.')
  } else {
    lines.push(
      '| Fixture | Representation | Bytecode B | Mean FPS | Min | Max | Samples | Result |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    )
    for (const row of hardware) {
      lines.push(`| ${row.fixture} | ${row.representation} | ${row.bytecodeBytes} | ${row.fps?.mean.toFixed(2) ?? '-'} | ${row.fps?.min.toFixed(2) ?? '-'} | ${row.fps?.max.toFixed(2) ?? '-'} | ${row.fps?.samples ?? '-'} | ${row.error ? inline(row.error) : 'active'} |`)
    }
  }
  lines.push(
    '',
    '## Visual probe',
    '',
    hardware.length > 0
      ? 'The runner left the 256-pixel contiguous generated-formula probe active. Four colored blocks rotate route ownership every three seconds without restarting their local gradients.'
      : 'No visual probe was pushed.',
    '',
  )
  return lines.join('\n')
}

function inline(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  console.log(`Fetching Pixelblaze compiler from ${IP} ...`)
  const compile = await fetchDeviceCompiler(IP)
  console.log('Measuring source, device bytecode, and emulator cost ...')
  const measurements = measureAll(compile)
  const hardware = args.hardware
    ? await measureHardware(compile, viableHardwareCases(measurements), args)
    : []
  writeFileSync(args.out, renderReport(measurements, hardware))
  console.log(`\nWrote ${args.out}`)
}

main().catch((error) => {
  console.error('issue400 failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
