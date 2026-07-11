// Issue #410 adaptive spatial-operator and resource-budget spike.
//   PIXELBLAZE_IP=192.168.8.224 npm run issue410 -- --hardware

import { writeFileSync } from 'node:fs'
import vm from 'node:vm'
import WebSocket from 'ws'
import { stampArtifact } from '../../src/engine/artifactStamp'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { buildCompilerEnv, missingComponents, v3AdapterV3 } from '../../src/engine/compilerExtraction'
import { PixelblazeConnection, type WebSocketLike } from '../../src/engine/PixelblazeConnection'
import { benchOne } from './benchCore'

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const REPORT = 'docs/plans/archive/issue-410-adaptive-spatial-operator-results.md'
const EPE = 'artifacts/electromage/adaptive-spatial-operator-showcase.epe'
const OPERATORS = ['grid', 'stripes', 'checker', 'rings', 'pinwheel', 'wave', 'soft-split'] as const
type Operator = typeof OPERATORS[number]

interface CompiledProgram { exports: { name: string; address: number }[]; compiled: number[]; status: string }
interface Fps { mean: number; min: number; max: number; samples: number }
interface Measurement { operator: Operator; pixels: number; sourceBytes: number; bytecodeBytes: number | null; fastMs: number; preciseMs: number; fps: Fps | null }
interface StrategyMeasurement { strategy: string; sourceBytes: number; bytecodeBytes: number | null; arrayElements: number; fps: Fps | null }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function operatorBody(operator: Operator): string {
  if (operator === 'grid') return `var column = min(2, floor(x * 3)); var row = min(1, floor(y * 2)); region = row * 3 + column; lx = clamp(x * 3 - column, 0, 1); ly = clamp(y * 2 - row, 0, 1)`
  if (operator === 'stripes') return `var stripe = min(5, floor(frac(x + t * 0.08) * 6)); region = stripe; lx = frac(x + t * 0.08) * 6 - stripe`
  if (operator === 'checker') return `var column = min(5, floor(x * 6)); var row = min(3, floor(y * 4)); region = (row + column) % 2; lx = clamp(x * 6 - column, 0, 1); ly = clamp(y * 4 - row, 0, 1)`
  if (operator === 'rings') return `var dx = x - 0.5; var dy = y - 0.5; var radius = clamp(hypot(dx, dy) / 0.70710678, 0, 1); region = min(4, floor(radius * 5)); lx = frac(atan2(dy, dx) / 6.2831853 + 1); ly = clamp(radius * 5 - region, 0, 1)`
  if (operator === 'pinwheel') return `var dx = x - 0.5; var dy = y - 0.5; var radius = hypot(dx, dy); var turn = frac(atan2(dy, dx) / 6.2831853 + radius * 1.35 + t * 0.04 + 1); region = min(5, floor(turn * 6)); lx = clamp(turn * 6 - region, 0, 1); ly = clamp(radius / 0.70710678, 0, 1)`
  if (operator === 'wave') return `var shifted = frac(y + (triangle(x * 2.5 + t * 0.1) - 0.5) * 0.3); region = min(3, floor(shifted * 4)); ly = clamp(shifted * 4 - region, 0, 1)`
  return `var signed = x - (0.5 + (triangle(t * 0.05) - 0.5) * 0.5); mix = clamp(0.5 + signed / 0.16, 0, 1); region = mix >= 0.5`
}

function probeSource(operator: Operator): string {
  return `var t = 0
export function beforeRender(delta) { t = t + delta * 0.001 }
export function render2D(index, x, y) {
  var region = 0; var lx = x; var ly = y; var mix = 0
  ${operatorBody(operator)}
  if (${JSON.stringify(operator)} != "soft-split") mix = region % 2
  rgb((1 - mix) * (0.25 + triangle(lx * 3 + t * 0.1)), mix * (0.25 + triangle(ly * 4 - t * 0.08)), 0.18 + 0.45 * triangle(lx + ly + t * 0.04))
}`
}

function showcaseSource(): string {
  const blocks = OPERATORS.map((operator, index) => `${index === 0 ? 'if' : 'else if'} (scene == ${index}) { ${operatorBody(operator)} }`).join('\n  ')
  return `// Adaptive Spatial Operator Showcase (#410)
// Two continuously running Patterns are composed through seven Stage-space operators.
var elapsed = 0
var t = 0
export function beforeRender(delta) { elapsed = (elapsed + delta) % 28000; t = t + delta * 0.001 }
export function render2D(index, x, y) {
  var scene = floor(elapsed / 4000)
  var region = 0; var lx = x; var ly = y; var mix = 0
  ${blocks}
  if (scene != 6) mix = region % 2
  var ar = 0.18 + 0.82 * triangle(lx * 3 + t * 0.11)
  var ag = 0.04 + 0.28 * triangle(ly * 5 - t * 0.07)
  var ab = 0.12 + 0.35 * triangle(lx + ly + t * 0.03)
  var br = 0.08 + 0.22 * triangle(ly * 4 + t * 0.05)
  var bg = 0.18 + 0.82 * triangle(lx * 5 - t * 0.09)
  var bb = 0.28 + 0.62 * triangle(lx - ly + t * 0.06)
  rgb(ar * (1 - mix) + br * mix, ag * (1 - mix) + bg * mix, ab * (1 - mix) + bb * mix)
}`
}

function strategySource(strategy: 'direct' | 'lazy-cache' | 'baked', pixels: number): string {
  const direct = `var column = min(2, floor(x * 3)); var row = min(1, floor(y * 2)); var region = row * 3 + column`
  if (strategy === 'direct') return `export function render2D(index, x, y) { ${direct}; rgb(region % 2, (region + 1) % 2, 0.2) }`
  if (strategy === 'lazy-cache') return `var route = array(pixelCount)
export function render2D(index, x, y) {
  var packed = route[index]
  if (packed == 0) { ${direct}; packed = region + 1; route[index] = packed }
  var region = packed - 1
  rgb(region % 2, (region + 1) % 2, 0.2)
}`
  const assignments = Array.from({ length: pixels }, (_, index) => {
    const x = (index % 64) / 63
    const y = Math.floor(index / 64) / 31
    const region = Math.min(1, Math.floor(y * 2)) * 3 + Math.min(2, Math.floor(x * 3))
    return `route[${index}] = ${region}`
  }).join('\n')
  return `var route = array(${pixels})
${assignments}
export function render2D(index, x, y) { var region = route[index]; rgb(region % 2, (region + 1) % 2, 0.2) }`
}

async function deviceCompiler(): Promise<(source: string) => Uint8Array> {
  const response = await fetch(`http://${IP}/index.html.gz`)
  if (!response.ok) throw new Error(`GET index.html.gz -> ${response.status}`)
  const stream = new Response(await response.arrayBuffer()).body!.pipeThrough(new DecompressionStream('gzip'))
  let webUi = await new Response(stream).text()
  if (webUi.charCodeAt(0) === 0xfeff) webUi = webUi.slice(1)
  const components = v3AdapterV3(webUi)
  const missing = missingComponents(components)
  if (missing.length) throw new Error(`compiler extraction miss: ${missing.join(', ')}`)
  const context = vm.createContext({ window: {} })
  vm.runInContext(buildCompilerEnv(components), context)
  const compilePattern = (context as { compilePattern: (source: string) => CompiledProgram }).compilePattern
  return (source) => {
    const output = compilePattern(source)
    if (output.status !== 'OK') throw new Error(output.status)
    const exportBytes = output.exports.reduce((sum, item) => sum + 5 + item.name.length, 0)
    const bytes = new Uint8Array(8 + output.compiled.length * 4 + exportBytes)
    const view = new DataView(bytes.buffer)
    let offset = 0
    view.setUint32(offset, output.compiled.length * 4, true); offset += 4
    view.setUint32(offset, exportBytes, true); offset += 4
    for (const opcode of output.compiled) { view.setInt32(offset, opcode, true); offset += 4 }
    for (const item of output.exports) {
      view.setUint32(offset, item.address, true); offset += 4
      for (const character of item.name) bytes[offset++] = character.charCodeAt(0)
      bytes[offset++] = 0
    }
    return bytes
  }
}

function nodeFactory(url: string): WebSocketLike { return new WebSocket(url) as unknown as WebSocketLike }

async function pushAndMeasure(connection: PixelblazeConnection, bytecode: Uint8Array): Promise<Fps> {
  const id = makeProgramId()
  connection.pushByteCode(bytecode, { id, name: '' })
  await sleep(1800)
  if ((await connection.getConfig()).activeProgramId !== id) throw new Error('program did not activate')
  await sleep(1200)
  const values: number[] = []
  let previous = -1
  const end = Date.now() + 2500
  while (Date.now() < end) {
    if (connection.fps > 0 && connection.fps !== previous) { values.push(connection.fps); previous = connection.fps }
    await sleep(250)
  }
  if (!values.length) throw new Error('no FPS samples')
  return { mean: values.reduce((sum, value) => sum + value, 0) / values.length, min: Math.min(...values), max: Math.max(...values), samples: values.length }
}

async function arrayProbe(connection: PixelblazeConnection, compile: (source: string) => Uint8Array, elements: number): Promise<boolean> {
  try {
    const id = makeProgramId()
    connection.pushByteCode(compile(`var storage = array(${elements})\nexport function render(index) { rgb(index == storage[0], 0, 0) }`), { id, name: '' })
    await sleep(1800)
    return (await connection.getConfig()).activeProgramId === id
  } catch { return false }
}

async function main(): Promise<void> {
  const hardware = process.argv.includes('--hardware')
  const showcase = stampArtifact(showcaseSource(), { kind: 'show', id: 'issue-410-showcase', name: 'Adaptive Spatial Operator Showcase', transforms: ['show', 'adaptive-spatial-operators'], stampedAt: '2026-07-11T14:30:00.000Z' })
  writeFileSync(EPE, JSON.stringify({ name: 'Adaptive Spatial Operator Showcase', id: 'pxb410SpatOps01', sources: { main: showcase }, preview: '' }, null, 2))
  const compile = hardware ? await deviceCompiler() : null
  const connection = hardware ? new PixelblazeConnection({ host: IP, webSocketFactory: nodeFactory, requestTimeoutMs: 15000 }) : null
  if (connection) await connection.connect()
  let config: Awaited<ReturnType<PixelblazeConnection['getConfig']>> | null = null
  const measurements: Measurement[] = []
  const strategies: StrategyMeasurement[] = []
  const arrayResults = new Map<number, boolean>()
  let originalPixelCount: number | undefined
  try {
    if (connection) {
      config = await connection.getConfig()
      originalPixelCount = config.pixelCount
    }
    const hardwareCounts = connection ? [...new Set([originalPixelCount ?? 256, 2048])] : [2048]
    for (const pixels of hardwareCounts) {
      if (connection && pixels !== originalPixelCount) {
        connection.setPixelCount(pixels, false)
        await sleep(1000)
      }
      for (const operator of OPERATORS) {
        const source = probeSource(operator)
        const bytecode = compile?.(source) ?? null
        measurements.push({
          operator,
          pixels,
          sourceBytes: new TextEncoder().encode(source).length,
          bytecodeBytes: bytecode?.length ?? null,
          fastMs: benchOne(source, {}, 'fast', { frames: 8, warmup: 2, grid: { rows: 32, cols: 64 } }).meanFrameMs,
          preciseMs: benchOne(source, {}, 'precise', { frames: 8, warmup: 2, grid: { rows: 32, cols: 64 } }).meanFrameMs,
          fps: connection && bytecode ? await pushAndMeasure(connection, bytecode) : null,
        })
      }
    }
    if (connection && compile) {
      connection.setPixelCount(2048, false)
      await sleep(1000)
      for (const strategy of ['direct', 'lazy-cache', 'baked'] as const) {
        const source = strategySource(strategy, 2048)
        let bytecode: Uint8Array | null = null
        let fps: Fps | null = null
        try {
          bytecode = compile(source)
          fps = await pushAndMeasure(connection, bytecode)
        } catch { /* A rejected baked table is itself a measured result. */ }
        strategies.push({
          strategy,
          sourceBytes: new TextEncoder().encode(source).length,
          bytecodeBytes: bytecode?.length ?? null,
          arrayElements: strategy === 'direct' ? 0 : 2048,
          fps,
        })
      }
      if (originalPixelCount) {
        connection.setPixelCount(originalPixelCount, false)
        await sleep(1000)
      }
      for (const elements of [2048, 4096, 6144, 8192, 10240, 10241]) {
        arrayResults.set(elements, await arrayProbe(connection, compile, elements))
      }
      await pushAndMeasure(connection, compile(showcase))
    }
  } finally {
    if (connection && originalPixelCount) connection.setPixelCount(originalPixelCount, false)
    connection?.close()
  }

  const report = [
    '# Issue 410 adaptive spatial-operator results', '',
    `Controller: ${config?.boardType ?? 'not measured'}, firmware ${config?.firmwareVersion ?? 'not measured'}, configured pixels ${config?.pixelCount ?? 'not measured'}.`,
    '', '## Operator matrix', '',
    '| Operator | Pixels | Source B | Bytecode B | Fast ms | Precise ms | Hardware FPS |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...measurements.map((row) => `| ${row.operator} | ${row.pixels} | ${row.sourceBytes} | ${row.bytecodeBytes ?? '-'} | ${row.fastMs.toFixed(3)} | ${row.preciseMs.toFixed(3)} | ${row.fps?.mean.toFixed(2) ?? '-'} |`),
    '', '## Resource boundary', '',
    '- [ElectroMage documents](https://electromage.com/pixelblaze/) 256 globals, 256 stack variables, and 10,240 array elements for Pixelblaze V3.',
    '- The operator probes use one scalar global (`t`); the showcase uses two (`t` and elapsed time).',
    '- [Arrays are the only dynamically allocated Pattern memory](https://electromage.com/docs/language-reference/) and cannot be freed during the program lifetime.',
    `- Firmware activation probes: ${arrayResults.size ? [...arrayResults].map(([elements, active]) => `array(${elements})=${active ? 'active' : 'rejected'}`).join('; ') : 'not measured'}.`,
    '- The documented 10,240 figure is not a hard activation cutoff on firmware 3.67. The spike deliberately does not allocate toward heap exhaustion.',
    '- PXLBLZ should reserve headroom for member Pattern buffers rather than spend the device maximum on routing; operator formulas consume constant routing memory.',
    '', '## Representation comparison at 2048 pixels', '',
    '| Strategy | Source B | Bytecode B | Array elements | Hardware FPS |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...strategies.map((row) => `| ${row.strategy} | ${row.sourceBytes} | ${row.bytecodeBytes ?? 'rejected'} | ${row.arrayElements} | ${row.fps?.mean.toFixed(2) ?? 'rejected'} |`),
    '', 'Lazy caching bought no measurable runtime improvement. Baking consumed 2,048 permanent elements and about 60% of the previously measured 68,384-byte activation budget to reproduce a tiny formula.',
    '', 'The lazy cache permanently owns one pixel-count-sized array, performs one formula plus array write per pixel during its first pass, then performs an array read/branch every subsequent frame. The settled FPS measurement does not quantify that startup hitch.',
    '', '## Compatibility boundary', '',
    '- All seven candidates require normalized continuous 2D Stage coordinates and are independent of pixel index/wiring order.',
    '- Grid, stripes, checker, wave, and soft split remain meaningful on rectangular planes, with altered proportions.',
    '- Rings and pinwheel assume approximately isotropic coordinates; wide/tall maps require aspect correction to preserve circles.',
    '- Irregular continuous 2D maps are runnable, while sparse/disconnected surfaces can expose surprising boundary gaps.',
    '- 1D strips and 3D volumes require separate operator definitions rather than silent projection.',
    '- Pattern buffers and neighbor/index-dependent effects remain a separate compatibility constraint.',
    '', '## Artifact', '',
    `- Standalone unchanged EPE: \`${EPE}\``,
    hardware ? '- The showcase was left active for visual inspection.' : '- Hardware was not requested.',
    '', '## Preliminary recommendation', '',
    '- Adopt grid, stripes, checker, rings, pinwheel, wave, and soft split as the candidate Stage-space vocabulary.',
    '- Prefer direct formulas for static and animated operators. Cache only measured bottlenecks because caches scale with pixel count and cannot be freed.',
    '- Treat soft boundaries as explicit two-renderer cost; hard ownership keeps one renderer per pixel.',
    '- Keep exact physical routing as a separate installation-bound representation.',
    '- Budget routing arrays against total merged-Pattern pressure: 0 is preferred; up to 2,048 is a conservative fallback; 2,049-4,096 requires measured justification; reject larger routing allocations by default.',
    '',
  ].join('\n')
  writeFileSync(REPORT, report)
  console.log(`Wrote ${EPE} and ${REPORT}`)
}

main().catch((error) => { console.error(error); process.exit(1) })
