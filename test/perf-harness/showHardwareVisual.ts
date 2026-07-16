// Reversible visual/FPS probes for the remaining Show hardware gates.
//
//   PIXELBLAZE_IP=192.168.8.224 npx tsx test/perf-harness/showHardwareVisual.ts --probe span
//
// The runner uses the production Show compiler, the Controller's own embedded
// compiler, and a run-only bytecode push. It always restores the previously
// active Pattern before releasing the socket.

import vm from 'node:vm'
import WebSocket from 'ws'
import { bytecodeHeaderReconciles, makeProgramId } from '../../src/engine/bytecodePush'
import {
  buildCompilerEnv,
  missingComponents,
  v3AdapterV3,
} from '../../src/engine/compilerExtraction'
import {
  PixelblazeConnection,
  type WebSocketLike,
} from '../../src/engine/PixelblazeConnection'
import { compileShow, type ShowCompileRecipe } from '../../src/engine/showCompiler'

type ProbeName = 'span' | 'progressive-routing' | 'moving-split' | 'tiling'

interface Args {
  probe: ProbeName
  observeMs: number
  compileOnly: boolean
}

interface CompiledProgram {
  exports: { name: string; address: number }[]
  compiled: number[]
}

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function parseArgs(argv: string[]): Args {
  const args: Args = { probe: 'span', observeMs: 20_000, compileOnly: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--probe') {
      const probe = argv[++index] as ProbeName | undefined
      if (!probe || !['span', 'progressive-routing', 'moving-split', 'tiling'].includes(probe)) {
        throw new Error('--probe must be span, progressive-routing, moving-split, or tiling')
      }
      args.probe = probe
    } else if (arg === '--observe') {
      const value = Number.parseInt(argv[++index] ?? '', 10)
      if (!Number.isFinite(value) || value < 1000) throw new Error('--observe needs milliseconds >= 1000')
      args.observeMs = value
    } else if (arg === '--compile-only') {
      args.compileOnly = true
    } else {
      throw new Error(`unknown argument ${arg}`)
    }
  }
  return args
}

function halves() {
  return [
    { id: 'left', name: 'left', ranges: [{ start: 0, end: 127 }] },
    { id: 'right', name: 'right', ranges: [{ start: 128, end: 255 }] },
  ]
}

function spanRecipe(): ShowCompileRecipe {
  const zones = halves()
  const placements = (clipId: string, zoneMode: 'span' | 'repeat') => (
    ['left', 'right'].map((zoneName) => ({
      zoneName,
      clipId,
      domainZoneNames: ['left', 'right'],
      zoneMode,
    }))
  )
  return {
    clips: [
      {
        id: 'repeat-ramp',
        source: 'export function render(index) { rgb(index / max(1, pixelCount - 1), 0, 0) }',
      },
      {
        id: 'span-ramp',
        source: 'export function render(index) { rgb(0, 0, index / max(1, pixelCount - 1)) }',
      },
    ],
    zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 4000,
          placements: placements('repeat-ramp', 'repeat'),
          transitionOut: { kind: 'cut', durationMs: 0 },
        },
        { holdMs: 4000, placements: placements('span-ramp', 'span') },
      ],
    },
    loopDurationMs: 8000,
  }
}

function progressiveRoutingRecipe(): ShowCompileRecipe {
  const zones = halves()
  return {
    clips: [
      {
        id: 'red',
        zone: 'left',
        source: 'var t = 0\nexport function beforeRender(delta) { t += delta / 1000 }\nexport function render(index) { rgb(0.45 + 0.2 * wave(t / 4), 0, 0) }',
      },
      {
        id: 'blue',
        zone: 'right',
        source: 'var t = 0\nexport function beforeRender(delta) { t += delta / 1000 }\nexport function render(index) { rgb(0, 0, 0.45 + 0.2 * wave(t / 4)) }',
      },
    ],
    zones,
    routingLayouts: [
      { id: 'original', name: 'Red then blue', zones },
      {
        id: 'swapped',
        name: 'Blue then red',
        zones: [
          { id: 'left-swapped', name: 'left', ranges: [{ start: 128, end: 255 }] },
          { id: 'right-swapped', name: 'right', ranges: [{ start: 0, end: 127 }] },
        ],
      },
    ],
    routingSwitches: [{
      atMs: 4000,
      layoutId: 'swapped',
      durationMs: 3000,
      easing: 'linear',
      direction: 'forward',
    }],
    loopDurationMs: 10_000,
  }
}

function movingSplitRecipe(): ShowCompileRecipe {
  const zones = halves()
  return {
    clips: [
      { id: 'left', zone: 'left', source: 'export function render2D(index, x, y) { rgb(0.25 + 0.5 * x, 0, 0) }' },
      { id: 'right', zone: 'right', source: 'export function render2D(index, x, y) { rgb(0, 0, 0.25 + 0.5 * x) }' },
    ],
    zones,
    routingLayouts: [{
      id: 'split',
      name: 'Moving split',
      zones,
      logical: { kind: 'split', zoneNames: ['left', 'right'], axis: 'x' },
    }],
    routingPropertyRamps: {
      splitPosition: {
        initial: 0.2,
        ramps: [
          { atMs: 2000, from: 0.2, to: 0.8, durationMs: 4000, easing: 'linear' },
          { atMs: 8000, from: 0.8, to: 0.2, durationMs: 4000, easing: 'linear' },
        ],
      },
    },
    loopDurationMs: 14_000,
  }
}

function tilingRecipe(): ShowCompileRecipe {
  return {
    clips: [{
      id: 'gradient',
      source: 'export function render2D(index, x, y) { rgb(0.1 + 0.8 * x, 0.1 + 0.8 * y, 0.08) }',
    }],
    samplePropertyRamps: {
      repeatScale: {
        initial: 1,
        ramps: [
          { atMs: 2000, from: 1, to: 4, durationMs: 5000, easing: 'linear' },
          { atMs: 9000, from: 4, to: 1, durationMs: 5000, easing: 'linear' },
        ],
      },
    },
    loopDurationMs: 16_000,
  }
}

function recipeFor(probe: ProbeName): ShowCompileRecipe {
  if (probe === 'span') return spanRecipe()
  if (probe === 'progressive-routing') return progressiveRoutingRecipe()
  if (probe === 'moving-split') return movingSplitRecipe()
  return tilingRecipe()
}

async function fetchDeviceCompiler(): Promise<(source: string) => Uint8Array> {
  const response = await fetch(`http://${IP}/index.html.gz`)
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
    const output = compilePattern(source) as CompiledProgram & { status: string }
    if (output.status !== 'OK') throw new Error(`device compiler: ${output.status}`)
    const bytecode = buildBytecode(output)
    if (!bytecodeHeaderReconciles(bytecode)) throw new Error('compiled bytecode failed header sanity check')
    return bytecode
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
    for (let index = 0; index < item.name.length; index += 1) view.setUint8(offset++, item.name.charCodeAt(index))
    view.setUint8(offset++, 0)
  }
  return new Uint8Array(buffer)
}

function nodeFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

async function observeFps(connection: PixelblazeConnection, observeMs: number): Promise<number[]> {
  const values: number[] = []
  const end = Date.now() + observeMs
  while (Date.now() < end) {
    if (typeof connection.fps === 'number' && connection.fps > 0) values.push(connection.fps)
    await sleep(250)
  }
  return values
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const artifact = compileShow(recipeFor(args.probe), {})
  console.log(JSON.stringify({ probe: args.probe, summary: artifact.summary }, null, 2))
  if (args.compileOnly) return

  const compile = await fetchDeviceCompiler()
  const bytecode = compile(artifact.code)
  const connection = new PixelblazeConnection({
    host: IP,
    webSocketFactory: nodeFactory,
    requestTimeoutMs: 15_000,
    pingIntervalMs: 0,
  })
  connection.on('error', (error) => console.error('controller socket:', error))
  await connection.connect()
  const original = await connection.getConfig()
  if (!original.activeProgramId) {
    connection.close()
    throw new Error('controller did not report an active program; refusing a non-reversible probe')
  }

  let runError: unknown
  try {
    const programId = makeProgramId()
    connection.pushByteCode(bytecode, { id: programId, name: '' })
    await sleep(2000)
    const active = await connection.getConfig()
    if (active.activeProgramId !== programId) throw new Error(`probe did not activate (active=${active.activeProgramId})`)
    console.log(`ACTIVE ${args.probe}; observe for ${(args.observeMs / 1000).toFixed(1)} seconds`)
    const fps = await observeFps(connection, args.observeMs)
    if (fps.length === 0) throw new Error('controller did not report FPS')
    console.log(JSON.stringify({
      probe: args.probe,
      bytecodeBytes: bytecode.length,
      fps: {
        mean: fps.reduce((sum, value) => sum + value, 0) / fps.length,
        min: Math.min(...fps),
        max: Math.max(...fps),
        samples: fps.length,
      },
    }, null, 2))
  } catch (error) {
    runError = error
  } finally {
    try {
      connection.setActiveProgram(original.activeProgramId)
      await sleep(500)
      const restored = await connection.getConfig()
      if (restored.activeProgramId !== original.activeProgramId) {
        const restoreError = new Error(`original active program did not restore (active=${restored.activeProgramId})`)
        runError = runError == null
          ? restoreError
          : new AggregateError([runError, restoreError], 'probe and restoration both failed')
      } else {
        console.log(`RESTORED ${original.activeProgramId}`)
      }
    } finally {
      connection.close()
    }
  }
  if (runError != null) throw runError
}

main().catch((error) => {
  console.error('showHardwareVisual failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
