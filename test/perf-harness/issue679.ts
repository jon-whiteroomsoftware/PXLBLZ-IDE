// Issue #679 shaped-aperture hardware measurement matrix.
//   npm run issue679                     (compile-only: bytes, disclosure, Fast/Precise ms)
//   PIXELBLAZE_IP=192.168.8.224 npm run issue679 -- --hardware
//
// Matrix: aperture shape x edge x output density over one eligible two-layer
// stack, plus a no-viewport baseline and a coverage-disabled counterfactual.
// The runner is reversible: active pattern and pixel count restore in finally.

import { writeFileSync } from 'node:fs'
import vm from 'node:vm'
import WebSocket from 'ws'
import { compileShow } from '../../src/engine/showCompiler'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { buildCompilerEnv, missingComponents, v3AdapterV3 } from '../../src/engine/compilerExtraction'
import { PixelblazeConnection, type WebSocketLike } from '../../src/engine/PixelblazeConnection'
import { benchOne } from './benchCore'

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const REPORT = 'docs/plans/archive/issue-679-aperture-hardware-matrix.md'
const SHAPES = ['rectangle', 'ellipse', 'rounded-box'] as const
const EDGES = ['hard', 'soft', 'dither'] as const
const PIXEL_COUNTS = [256, 1000, 2000] as const

type Shape = typeof SHAPES[number]
type Edge = typeof EDGES[number]

interface CompiledProgram { exports: { name: string; address: number }[]; compiled: number[]; status: string }
interface Fps { mean: number; min: number; max: number; samples: number }
interface Cell {
  label: string
  shape: Shape | 'none'
  edge: Edge | '-'
  pixels: number
  coverage: string
  sourceBytes: number
  bytecodeBytes: number | null
  fastMs: number
  preciseMs: number
  fps: Fps | null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const LOWER_SOURCE = `var t = 0
export function beforeRender(delta) { t = t + delta * 0.001 }
export function render2D(index, x, y) {
  rgb(0.2 + 0.8 * triangle(x * 3 + t * 0.11), 0.1 + 0.3 * triangle(y * 4 - t * 0.07), 0.15 + 0.4 * triangle(x + y + t * 0.05))
}`

const UPPER_SOURCE = `var t = 0
export function beforeRender(delta) { t = t + delta * 0.001 }
export function render2D(index, x, y) {
  rgb(0.1 + 0.2 * triangle(y * 5 + t * 0.06), 0.2 + 0.8 * triangle(x * 4 - t * 0.09), 0.3 + 0.5 * triangle(x - y + t * 0.04))
}`

function apertureViewport(shape: Shape, edge: Edge): Record<string, unknown> {
  return {
    enabled: true,
    x: 0.2,
    y: 0.15,
    width: 0.55,
    height: 0.6,
    ...(shape === 'rectangle' ? {} : { aperture: shape }),
    edge,
    // Authored width keeps the band identical across densities so FPS deltas
    // isolate the formula cost rather than band population.
    ...(edge === 'hard' ? {} : { feather: 0.08 }),
    ...(shape === 'rounded-box' ? { cornerRadius: 0.35 } : {}),
  }
}

function matrixRecipe(pixels: number, viewport: Record<string, unknown> | null) {
  const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: pixels - 1 }] }]
  return {
    clips: [
      { id: 'lower', source: LOWER_SOURCE },
      { id: 'upper', source: UPPER_SOURCE },
    ],
    zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    routedSceneSequence: {
      scenes: [{
        holdMs: 8_000,
        placements: [
          { placementId: 'lower-placement', zoneName: 'main', clipId: 'lower', stackOrder: 0 },
          {
            placementId: 'upper-placement',
            zoneName: 'main',
            clipId: 'upper',
            stackOrder: 1,
            ...(viewport ? { viewport } : {}),
          },
        ],
        transitionOut: { kind: 'cut' as const, durationMs: 0 },
      }, {
        holdMs: 8_000,
        placements: [{ zoneName: 'main', clipId: 'lower' }],
      }],
    },
    loopDurationMs: 16_000,
  }
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

function coverageLabel(artifact: ReturnType<typeof compileShow>): string {
  const stack = artifact.summary.specializations.viewportCoverage?.stacks[0]
  if (!stack) return 'no-viewport'
  return stack.status === 'selected' ? `coverage:${stack.edge}` : `fallback:${stack.reason}`
}

async function main(): Promise<void> {
  const hardware = process.argv.includes('--hardware')
  const compile = hardware ? await deviceCompiler() : null
  const connection = hardware ? new PixelblazeConnection({ host: IP, webSocketFactory: nodeFactory, requestTimeoutMs: 15000 }) : null
  if (connection) await connection.connect()
  const cells: Cell[] = []
  let originalPixelCount: number | undefined
  let originalProgramId: string | undefined
  try {
    if (connection) {
      const config = await connection.getConfig()
      originalPixelCount = config.pixelCount
      originalProgramId = config.activeProgramId
    }
    for (const pixels of PIXEL_COUNTS) {
      if (connection) {
        connection.setPixelCount(pixels, false)
        await sleep(1000)
      }
      const variants: Array<{ label: string; shape: Shape | 'none'; edge: Edge | '-'; artifact: ReturnType<typeof compileShow> }> = [
        {
          label: 'baseline (no viewport)',
          shape: 'none',
          edge: '-',
          artifact: compileShow(matrixRecipe(pixels, null) as never, {}),
        },
        ...SHAPES.flatMap((shape) => EDGES.map((edge) => ({
          label: `${shape} / ${edge}`,
          shape,
          edge,
          artifact: compileShow(matrixRecipe(pixels, apertureViewport(shape, edge)) as never, {}),
        }))),
        {
          label: 'ellipse / hard, coverage disabled',
          shape: 'ellipse',
          edge: 'hard',
          artifact: compileShow(
            matrixRecipe(pixels, apertureViewport('ellipse', 'hard')) as never,
            {},
            { coverageDirectedComposition: false },
          ),
        },
      ]
      for (const variant of variants) {
        const source = variant.artifact.code
        const bytecode = compile?.(source) ?? null
        cells.push({
          label: variant.label,
          shape: variant.shape,
          edge: variant.edge,
          pixels,
          coverage: coverageLabel(variant.artifact),
          sourceBytes: new TextEncoder().encode(source).length,
          bytecodeBytes: bytecode?.length ?? null,
          fastMs: benchOne(source, {}, 'fast', { frames: 8, warmup: 2, grid: { rows: 25, cols: 40 } }).meanFrameMs,
          preciseMs: benchOne(source, {}, 'precise', { frames: 8, warmup: 2, grid: { rows: 25, cols: 40 } }).meanFrameMs,
          fps: connection && bytecode ? await pushAndMeasure(connection, bytecode) : null,
        })
        console.log(`${variant.label} @ ${pixels}px -> ${cells[cells.length - 1].coverage}, ${cells[cells.length - 1].sourceBytes}B${cells[cells.length - 1].fps ? `, ${cells[cells.length - 1].fps!.mean.toFixed(1)} FPS` : ''}`)
      }
    }
  } finally {
    if (connection) {
      if (originalPixelCount !== undefined) connection.setPixelCount(originalPixelCount, false)
      if (originalProgramId) {
        try { connection.setActiveProgram(originalProgramId) } catch { /* manual restore via web UI */ }
      }
      connection.close()
    }
  }

  const rows = cells.map((cell) => (
    `| ${cell.pixels} | ${cell.label} | ${cell.coverage} | ${cell.sourceBytes} | ${cell.bytecodeBytes ?? '-'} | ${cell.fastMs.toFixed(2)} | ${cell.preciseMs.toFixed(2)} | ${cell.fps ? `${cell.fps.mean.toFixed(1)} (${cell.fps.min}-${cell.fps.max}, n=${cell.fps.samples})` : '-'} |`
  )).join('\n')
  const report = `# Shaped-aperture hardware measurement matrix (#679)

Generated by \`npm run issue679${hardware ? ' -- --hardware' : ''}\`${hardware ? ` against ${IP}` : ' (compile-only run; hardware columns pending)'}.

One eligible two-layer routed stack (animated lower and upper Patterns), frame
x 0.2, y 0.15, width 0.55, height 0.6. Soft and Dither use an authored 0.08
band so the band population is density-independent. The rounded-box cell is
the complex-silhouette representative (per-pixel hypot + min/max); the star
silhouette remains cut pending this matrix's verdict on angular SDF cost.

| Pixels | Variant | Evaluation | Source bytes | Bytecode bytes | Fast ms/frame | Precise ms/frame | Controller FPS |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}
`
  writeFileSync(REPORT, report)
  console.log(`\nreport -> ${REPORT}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
