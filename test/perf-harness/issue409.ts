// Issue #409 adaptive Show routing spike.
//
//   npm run issue409
//   PIXELBLAZE_IP=192.168.8.224 npm run issue409 -- --hardware

import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'
import WebSocket from 'ws'
import { makeProgramId } from '../../src/engine/bytecodePush'
import {
  buildCompilerEnv,
  missingComponents,
  v3AdapterV3,
} from '../../src/engine/compilerExtraction'
import { parseEpe } from '../../src/engine/epeImport'
import {
  PixelblazeConnection,
  type WebSocketLike,
} from '../../src/engine/PixelblazeConnection'
import { createAdaptivePatternPrismShow, createPatternPrismShow } from '../../src/engine/patternPrismShow'
import { compileShow } from '../../src/engine/showCompiler'
import { buildShowEpeExport } from '../../src/engine/showEpeExport'
import { showRecordToCompileRecipe } from '../../src/engine/showModel'
import { benchOne } from './benchCore'

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const FIXED_EPE = 'artifacts/electromage/pattern-prism.epe'
const ADAPTIVE_EPE = 'artifacts/electromage/pattern-prism-adaptive.epe'
const REPORT = 'docs/plans/archive/issue-409-adaptive-show-routing-results.md'

interface DeviceCompileResult {
  bytecode: Uint8Array
  error: string | null
}

interface CompiledProgram {
  exports: { name: string; address: number }[]
  compiled: number[]
  status: string
}

interface FpsStats {
  mean: number
  min: number
  max: number
  samples: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function compileCatalogShow(adaptive: boolean) {
  const show = adaptive ? createAdaptivePatternPrismShow() : createPatternPrismShow()
  const ribbonSource = readFileSync('src/pixelblaze/stock/patterns/RibbonLoom.js', 'utf8')
  const recipe = showRecordToCompileRecipe(show, {
    byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, ribbonSource])),
    stageDimension: 2,
  })
  return { show, artifact: compileShow(recipe, {}) }
}

async function fetchDeviceCompiler(): Promise<(source: string) => DeviceCompileResult> {
  const response = await fetch(`http://${IP}/index.html.gz`)
  if (!response.ok) throw new Error(`GET index.html.gz -> ${response.status}`)
  const stream = new Response(await response.arrayBuffer()).body!.pipeThrough(new DecompressionStream('gzip'))
  let webUi = await new Response(stream).text()
  if (webUi.charCodeAt(0) === 0xfeff) webUi = webUi.slice(1)
  const components = v3AdapterV3(webUi)
  const missing = missingComponents(components)
  if (missing.length > 0) throw new Error(`compiler extraction miss: ${missing.join(', ')}`)
  const context = vm.createContext({ window: {} })
  vm.runInContext(buildCompilerEnv(components), context, { filename: 'device-compiler.js' })
  const compilePattern = (context as { compilePattern?: (source: string) => CompiledProgram }).compilePattern
  if (!compilePattern) throw new Error('device compiler did not define compilePattern')
  return (source) => {
    try {
      const output = compilePattern(source)
      return output.status === 'OK'
        ? { bytecode: buildBytecode(output), error: null }
        : { bytecode: new Uint8Array(), error: output.status }
    } catch (error) {
      return { bytecode: new Uint8Array(), error: error instanceof Error ? error.message : String(error) }
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
    for (const character of item.name) view.setUint8(offset++, character.charCodeAt(0))
    view.setUint8(offset++, 0)
  }
  return new Uint8Array(buffer)
}

function routingArrayElements(source: string): number {
  return [...source.matchAll(/__pxlblz_show_route_pixels = array\((\d+)\)/g)]
    .reduce((sum, match) => sum + Number(match[1]), 0)
}

function benchmark(source: string, size: number, mode: 'fast' | 'precise'): number {
  return benchOne(source, {}, mode, {
    frames: 8,
    warmup: 2,
    frameDeltaMs: 5000,
    grid: { rows: size, cols: size },
  }).meanFrameMs
}

function nodeFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

async function sampleFps(connection: PixelblazeConnection): Promise<FpsStats> {
  await sleep(1500)
  const samples: number[] = []
  let previous = -1
  const end = Date.now() + 3500
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

async function pushAndMeasure(connection: PixelblazeConnection, bytecode: Uint8Array): Promise<FpsStats> {
  const id = makeProgramId()
  connection.pushByteCode(bytecode, { id, name: '' })
  await sleep(1800)
  const config = await connection.getConfig()
  if (config.activeProgramId !== id) throw new Error(`pushed ${id}, active is ${config.activeProgramId}`)
  return sampleFps(connection)
}

async function main(): Promise<void> {
  const hardware = process.argv.includes('--hardware')
  const fixed = compileCatalogShow(false)
  const adaptive = compileCatalogShow(true)
  const fixedEnvelope = JSON.parse(readFileSync(FIXED_EPE, 'utf8')) as { preview: string }
  const adaptiveExport = buildShowEpeExport(adaptive.show, adaptive.artifact.code, {
    id: 'pxb409AdptvPrsm',
    preview: fixedEnvelope.preview,
    stampedAt: '2026-07-11T13:30:00.000Z',
  })
  writeFileSync(ADAPTIVE_EPE, adaptiveExport.text)

  const fixedSource = parseEpe(readFileSync(FIXED_EPE, 'utf8')).src
  const adaptiveSource = adaptiveExport.source
  let compile: ((source: string) => DeviceCompileResult) | null = null
  try {
    compile = await fetchDeviceCompiler()
  } catch (error) {
    console.warn(`Device compiler unavailable: ${error instanceof Error ? error.message : String(error)}`)
  }
  const fixedDevice = compile?.(fixedSource) ?? null
  const adaptiveDevice = compile?.(adaptiveSource) ?? null
  if (fixedDevice?.error) throw new Error(`fixed device compile: ${fixedDevice.error}`)
  if (adaptiveDevice?.error) throw new Error(`adaptive device compile: ${adaptiveDevice.error}`)

  const rows = [
    { variant: 'fixed packed', pixels: 256, size: 16, source: fixed.artifact.code },
    { variant: 'adaptive predicates', pixels: 256, size: 16, source: adaptive.artifact.code },
    { variant: 'adaptive predicates', pixels: 1024, size: 32, source: adaptive.artifact.code },
    { variant: 'adaptive predicates', pixels: 4096, size: 64, source: adaptive.artifact.code },
  ].map((row) => ({
    ...row,
    fastMs: benchmark(row.source, row.size, 'fast'),
    preciseMs: benchmark(row.source, row.size, 'precise'),
  }))

  let fixedFps: FpsStats | null = null
  let adaptiveFps: FpsStats | null = null
  if (hardware) {
    if (!fixedDevice || !adaptiveDevice) throw new Error('--hardware requires a reachable Pixelblaze compiler')
    const connection = new PixelblazeConnection({ host: IP, webSocketFactory: nodeFactory, requestTimeoutMs: 15000 })
    connection.on('error', (error) => console.error('controller socket:', error))
    await connection.connect()
    try {
      fixedFps = await pushAndMeasure(connection, fixedDevice.bytecode)
      adaptiveFps = await pushAndMeasure(connection, adaptiveDevice.bytecode)
    } finally {
      connection.close()
    }
  }

  const report = [
    '# Issue 409 adaptive Show routing results',
    '',
    'Pattern Prism was compiled in two forms from the same visual design. Emulator timings are operation-count proxies; controller FPS is authoritative.',
    '',
    '## Resource comparison',
    '',
    '| Variant | Source B | Device bytecode B | Routing arrays | Routing elements |',
    '| --- | ---: | ---: | ---: | ---: |',
    `| Fixed packed | ${new TextEncoder().encode(fixedSource).length} | ${fixedDevice?.bytecode.length ?? '25,838 (prior firmware 3.67 run)'} | 1 | ${routingArrayElements(fixedSource)} |`,
    `| Adaptive predicates | ${new TextEncoder().encode(adaptiveSource).length} | ${adaptiveDevice?.bytecode.length ?? 'pending live compiler'} | 0 | ${routingArrayElements(adaptiveSource)} |`,
    '',
    'The packed form permanently allocates one 1,024-element routing array. The adaptive form uses scalar temporaries only, so routing RAM is constant with pixel count.',
    '',
    'A lazy cache was rejected for this artifact. Caching owner plus local coordinates would reduce repeated predicate work, but restores pixel-count-proportional arrays, adds initialization cost, and those arrays cannot be freed during the Pixelblaze program\'s lifetime. It remains a possible bounded optimization when measured CPU pressure matters more than RAM.',
    '',
    '## Emulator matrix',
    '',
    '| Variant | Pixels | Fast ms/frame | Precise ms/frame |',
    '| --- | ---: | ---: | ---: |',
    ...rows.map((row) => `| ${row.variant} | ${row.pixels} | ${row.fastMs.toFixed(3)} | ${row.preciseMs.toFixed(3)} |`),
    '',
    '## Controller FPS',
    '',
    hardware
      ? `At the controller\'s configured pixel count, fixed packed measured ${fixedFps!.mean.toFixed(2)} FPS (${fixedFps!.min.toFixed(2)}-${fixedFps!.max.toFixed(2)}), while adaptive predicates measured ${adaptiveFps!.mean.toFixed(2)} FPS (${adaptiveFps!.min.toFixed(2)}-${adaptiveFps!.max.toFixed(2)}). The adaptive artifact was left active.`
      : 'Not measured. Run `npm run issue409 -- --hardware` with the controller reachable to push both run-only artifacts and sample controller FPS.',
    '',
    '## Compatibility boundary',
    '',
    '- Automated: normalized 2D maps at 16x16 and 32x32, arbitrary wiring order, full coverage, non-black output in every phase, continuous member clocks, and no fixed maximum index.',
    '- Expected with changed composition: rectangular 2D maps. The geometry still fills the map, but grids, stripes, and radial sectors inherit the map aspect ratio.',
    '- Approximate: patterns that use `index` or `pixelCount` for 2D structure. The compiler synthesizes a square route-local index from local coordinates.',
    '- Not represented by this spike: explicit physical-pixel exceptions, disconnected surfaces, 1D strips, 3D volumes, overlapping logical zones, or logical zones with unequal pixel density.',
    hardware
      ? '- The generated report requires a separate human visual check; record that result here after inspection.'
      : '- Pending human/hardware verification: recognizable composition on the external matrix, controller bytecode for the adaptive artifact, live FPS, and visual confirmation that switches do not flash.',
    '',
    '## Recommendation',
    '',
    'Keep all three compiler strategies. Use coordinate predicates for supported logical geometry, fixed range/formula routing for installation-specific layouts, and packed tables only for irregular layouts that fit the explicit element budget. Compatibility should be derived from authored routing semantics and surfaced as Recommended, runnable with caveats, or fixed/incompatible.',
    '',
    `Artifact: \`${ADAPTIVE_EPE}\``,
    '',
  ].join('\n')
  writeFileSync(REPORT, report)
  console.log(`Wrote ${ADAPTIVE_EPE} and ${REPORT}`)
}

main().catch((error) => {
  console.error('issue409 failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
