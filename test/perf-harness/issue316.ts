// Issue #316 hardware tracer bullet. Builds a generated two-clip Show artifact,
// compiles it with the connected Pixelblaze's own compiler, pushes it as a
// run-only program, and leaves the single crossfade visible for a short window.
//
//   PIXELBLAZE_IP=192.168.8.224 npm run issue316
//   PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=direct-fade npm run issue316
//   PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=pulse-fade FORCE_BRIGHTNESS=0.3 npm run issue316
//   PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=time-fade npm run issue316
//   PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=delta-ms-fade npm run issue316
//   PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=capture-fade npm run issue316
//   PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=stock WATCH_MS=12000 npm run issue316
//   PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=adaptation-ramp SAMPLE_VARS=1 npm run issue316
//   PIXELBLAZE_IP=192.168.8.224 npm run issue332
//   PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=plain-dither SAMPLE_VARS=1 npm run issue332
//   PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=pattern-crossfade-baseline SAMPLE_VARS=1 npm run issue332
//   PIXELBLAZE_IP=192.168.8.224 SAMPLE_VARS=1 npm run issue317

import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import WebSocket from 'ws'
import {
  PixelblazeConnection,
  type ControllerConfig,
  type WebSocketLike,
} from '../../src/engine/PixelblazeConnection'
import {
  v3AdapterV3,
  buildCompilerEnv,
  missingComponents,
} from '../../src/engine/compilerExtraction'
import { bytecodeHeaderReconciles, makeProgramId } from '../../src/engine/bytecodePush'
import { compileShow } from '../../src/engine/showCompiler'
import {
  buildRouteTransitionFixtureSource,
  routeTransitionFixtureList,
  type FixtureSource,
} from './showRouteTransitionFixtures'

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const DEFAULT_FIXTURE = process.env.npm_lifecycle_event === 'issue332'
  ? 'pattern-wipe'
  : process.env.npm_lifecycle_event === 'issue317'
    ? 'zone-repeat'
    : 'diagnostic'
const SHOW_FIXTURE = process.env.SHOW_FIXTURE ?? DEFAULT_FIXTURE
const WATCH_MS = parseInt(process.env.WATCH_MS ?? String(defaultWatchMs(SHOW_FIXTURE)), 10)
const SAMPLE_VARS = process.env.SAMPLE_VARS === '1'
const FORCE_BRIGHTNESS = process.env.FORCE_BRIGHTNESS

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface CompiledProgram {
  exports: { name: string; address: number }[]
  compiled: number[]
}

interface CompileOk {
  ok: true
  bytecode: Uint8Array
  exports: { name: string; address: number }[]
}

interface CompileFail {
  ok: false
  error: string
}

type CompileResult = CompileOk | CompileFail

function defaultWatchMs(fixture: string): number {
  if (fixture === 'stock') return 9000
  if (fixture === 'adaptation-ramp') return 9000
  if (
    fixture === 'plain-wipe' ||
    fixture === 'plain-dither' ||
    fixture === 'pattern-wipe' ||
    fixture === 'pattern-dither' ||
    fixture === 'pattern-crossfade-baseline' ||
    fixture === 'pattern-decimate' ||
    fixture === 'zone-repeat'
  ) {
    return 12000
  }
  if (fixture === 'pulse-fade') return 12000
  if (fixture === 'direct-fade' || fixture === 'time-fade' || fixture === 'delta-ms-fade' || fixture === 'capture-fade') return 14000
  return 22000
}

function nodeFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

async function fetchWebUI(ip: string): Promise<string> {
  const resp = await fetch(`http://${ip}/index.html.gz`)
  if (!resp.ok) throw new Error(`GET index.html.gz -> ${resp.status}`)
  const gzBuf = await resp.arrayBuffer()
  const stream = new Response(gzBuf).body!.pipeThrough(new DecompressionStream('gzip'))
  let text = await new Response(stream).text()
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text
}

function buildBytecode(program: CompiledProgram): Uint8Array {
  const { compiled: opcodes, exports } = program
  let exportSize = 0
  for (const item of exports) exportSize += 4 + item.name.length + 1
  const total = 8 + 4 * opcodes.length + exportSize
  const buf = new ArrayBuffer(total)
  const dv = new DataView(buf)
  let offset = 0
  dv.setUint32(offset, 4 * opcodes.length, true)
  offset += 4
  dv.setUint32(offset, exportSize, true)
  offset += 4
  for (const op of opcodes) {
    dv.setInt32(offset, op, true)
    offset += 4
  }
  for (const item of exports) {
    dv.setUint32(offset, item.address, true)
    offset += 4
    for (let i = 0; i < item.name.length; i++) {
      dv.setUint8(offset, item.name.charCodeAt(i))
      offset += 1
    }
    dv.setUint8(offset, 0)
    offset += 1
  }
  return new Uint8Array(buf)
}

function makeDeviceCompiler(webUI: string): (source: string) => CompileResult {
  const components = v3AdapterV3(webUI)
  const missing = missingComponents(components)
  if (missing.length > 0) {
    throw new Error(`compiler extraction miss: ${missing.join(', ')}`)
  }
  const env = buildCompilerEnv(components)
  const context = vm.createContext({ window: {} })
  vm.runInContext(env, context, { filename: 'device-compiler.js' })
  const compilePattern = (context as { compilePattern?: (s: string) => unknown }).compilePattern
  if (typeof compilePattern !== 'function') throw new Error('compilePattern not defined after eval')

  return (source: string) => {
    try {
      const out = compilePattern(source) as
        | { status: 'OK'; exports: { name: string; address: number }[]; compiled: number[] }
        | { status: string }
      if (out.status !== 'OK') return { ok: false, error: out.status }
      const bytecode = buildBytecode(out as CompiledProgram)
      if (!bytecodeHeaderReconciles(bytecode)) {
        return { ok: false, error: 'compiled bytecode failed header sanity check' }
      }
      return { ok: true, bytecode, exports: out.exports }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

function stockPattern(name: string): string {
  return readFileSync(new URL(`../../src/pixelblaze/stock/patterns/${name}.js`, import.meta.url), 'utf8')
}

function diagnosticClipA(): string {
  return `
export var seconds = 0
export var calls = 0
export var last = 0

export function beforeRender(delta) {
  last = calls
  calls = 0
  seconds = seconds + delta * 0.001
}

export function render(index) {
  calls = calls + 1
  if (seconds < 3) {
    rgb(1, 0, 0)
  } else if (seconds < 6) {
    rgb(0, 1, 0)
  } else if (seconds < 9) {
    rgb(0, 0, 1)
  } else if (seconds < 12) {
    rgb(1 - (seconds - 9) / 3, 0, 0)
  } else if (seconds < 15) {
    rgb(0, 0, 1 - (seconds - 12) / 3)
  } else {
    rgb(1, 0, 0)
  }
}
`
}

function diagnosticClipB(): string {
  return `
export var ticks = 0
export var calls = 0
export var last = 0

export function beforeRender(delta) {
  last = calls
  calls = 0
  ticks = ticks + 1
}

export function render(index) {
  calls = calls + 1
  rgb(0, 0, 1)
}
`
}

function directFadeSource(): string {
  return `
export var seconds = 0
export var calls = 0
export var last = 0

export function beforeRender(delta) {
  last = calls
  calls = 0
  seconds = seconds + delta * 0.001
}

export function render(index) {
  calls = calls + 1
  if (seconds < 3) {
    rgb(1, 0, 0)
  } else if (seconds < 9) {
    var v = 1 - (seconds - 3) / 6
    rgb(v, 0, 0)
  } else {
    rgb(0, 0, 0)
  }
}
`
}

function pulseFadeSource(): string {
  return `
export var phase = 0
export var calls = 0
export var last = 0

export function beforeRender(delta) {
  last = calls
  calls = 0
  phase = phase + delta * 0.001
  if (phase >= 2) {
    phase = phase - 2
  }
}

export function render(index) {
  calls = calls + 1
  var v = phase
  if (phase > 1) {
    v = 2 - phase
  }
  rgb(v, 0, 0)
}
`
}

function timeFadeSource(): string {
  return `
export var calls = 0
export var last = 0

export function beforeRender(delta) {
  last = calls
  calls = 0
}

export function render(index) {
  calls = calls + 1
  rgb(1 - time(0.166667), 0, 0)
}
`
}

function deltaMsFadeSource(): string {
  return `
export var ms = 0
export var calls = 0
export var last = 0

export function beforeRender(delta) {
  last = calls
  calls = 0
  ms = ms + delta
}

export function render(index) {
  calls = calls + 1
  if (ms < 3000) {
    rgb(1, 0, 0)
  } else if (ms < 9000) {
    var v = 1 - (ms - 3000) / 6000
    rgb(v, 0, 0)
  } else {
    rgb(0, 0, 0)
  }
}
`
}

function captureFadeSource(): string {
  return `
export var seconds = 0
export var calls = 0
export var last = 0
var captureR = 0
var captureG = 0
var captureB = 0

function captureRgb(r, g, b) {
  captureR = r
  captureG = g
  captureB = b
}

function emitCapture() {
  rgb(captureR, captureG, captureB)
}

function memberBeforeRender(delta) {
  last = calls
  calls = 0
  seconds = seconds + delta * 0.001
}

function memberRender(index) {
  calls = calls + 1
  if (seconds < 3) {
    captureRgb(1, 0, 0)
  } else if (seconds < 9) {
    var v = 1 - (seconds - 3) / 6
    captureRgb(v, 0, 0)
  } else {
    captureRgb(0, 0, 0)
  }
}

export function beforeRender(delta) {
  memberBeforeRender(delta)
}

export function render(index) {
  captureR = 0
  captureG = 0
  captureB = 0
  memberRender(index)
  emitCapture()
}
`
}

function zoneRepeatClip(): string {
  return `
export var t = 0
export var calls = 0
export var last = 0
export var seenPixelCount = 0

export function beforeRender(delta) {
  last = calls
  calls = 0
  t = t + delta * 0.001
  seenPixelCount = pixelCount
}

export function render(index) {
  calls = calls + 1
  var x = index / pixelCount
  var sweep = wave(t * 0.8 + x * 2)
  rgb(x, sweep, 1 - x)
}
`
}

function buildFixtureSource(fixture: string): FixtureSource {
  const routeTransitionFixture = buildRouteTransitionFixtureSource(fixture)
  if (routeTransitionFixture) return routeTransitionFixture

  if (fixture === 'zone-repeat') {
    const source = zoneRepeatClip()
    const artifact = compileShow({
      zones: [
        { id: 'left-half', name: 'left-half', ranges: [{ start: 0, end: 127 }] },
        { id: 'right-half', name: 'right-half', ranges: [{ start: 128, end: 255 }] },
      ],
      clips: [
        { id: 'left-repeat', zone: 'left-half', source },
        { id: 'right-repeat', zone: 'right-half', source },
      ],
    }, {})
    return {
      source: artifact.code,
      description: 'zone route: the same pattern is compiled into two half-strip zones with zone-local index/pixelCount, so both halves repeat the same animation',
      sourceLabel: `Generated #317 routed Show source: ${artifact.summary.artifactBytes} bytes (${(artifact.summary.artifactBudgetRatio * 100).toFixed(1)}% of ${artifact.summary.measuredDeviceBudgetBytes}); warnings=${artifact.summary.warnings.length}`,
    }
  }

  if (fixture === 'stock') {
    const artifact = compileShow({
      clips: [
        { id: 'TestPattern1D', source: stockPattern('TestPattern1D') },
        { id: 'CometLoom', source: stockPattern('CometLoom') },
      ],
      crossfade: { startMs: 2500, durationMs: 3000 },
    }, {})
    return {
      source: artifact.code,
      description: 'stock TestPattern1D -> CometLoom, crossfade starts at 2500 ms and lasts 3000 ms',
      sourceLabel: `Generated Show source: ${artifact.summary.artifactBytes} bytes (${(artifact.summary.artifactBudgetRatio * 100).toFixed(1)}% of ${artifact.summary.measuredDeviceBudgetBytes})`,
    }
  }

  if (fixture === 'adaptation-ramp') {
    const artifact = compileShow({
      clips: [
        {
          id: 'ramp-source',
          source: `
export var t = 0
export var calls = 0
export var last = 0
export function beforeRender(delta) {
  last = calls
  calls = 0
  t = t + delta * 0.001
}
export function render(index) {
  calls = calls + 1
  var x = index / pixelCount
  hsv(t * 0.2 + x, 1, 1)
}
`,
        },
      ],
      adaptationRamp: {
        startMs: 1000,
        durationMs: 4000,
        from: { brightness: 1, phase: 0, timeScale: 1, mirror: false },
        to: { brightness: 0.2, phase: 0.25, timeScale: 1, mirror: false },
      },
    }, {})
    return {
      source: artifact.code,
      description: 'same-pattern adaptation ramp: one running renderer, brightness 1.0 -> 0.2 and phase +0.25 over 4s',
      sourceLabel: `Generated #335 adaptation-ramp Show source: ${artifact.summary.artifactBytes} bytes; renderPolicy=${artifact.summary.renderPolicy}; transitionCost=${artifact.summary.transitionCost}; worstInstantRenderersPerPixel=${artifact.summary.worstInstantRenderersPerPixel}`,
    }
  }

  if (fixture === 'direct-fade') {
    return {
      source: directFadeSource(),
      description: 'direct baseline: 0-3s solid red, 3-9s direct rgb(v,0,0) fade to black, then black',
      sourceLabel: 'Direct Pixelblaze source',
    }
  }

  if (fixture === 'pulse-fade') {
    return {
      source: pulseFadeSource(),
      description: 'looping direct pulse: 1s red fade in, 1s red fade out, repeats',
      sourceLabel: 'Direct Pixelblaze looping pulse source',
    }
  }

  if (fixture === 'time-fade') {
    return {
      source: timeFadeSource(),
      description: 'native time() baseline: repeating 6-second direct rgb(1-time(0.166667),0,0) fade',
      sourceLabel: 'Direct Pixelblaze time() source',
    }
  }

  if (fixture === 'delta-ms-fade') {
    return {
      source: deltaMsFadeSource(),
      description: 'delta-ms baseline: accumulates raw delta milliseconds, 0-3s red, 3-9s fade to black, then black',
      sourceLabel: 'Direct Pixelblaze raw-delta-ms source',
    }
  }

  if (fixture === 'capture-fade') {
    return {
      source: captureFadeSource(),
      description: 'capture baseline: same fade, but stores RGB channels in globals and re-emits them through rgb()',
      sourceLabel: 'Hand-written capture/re-emit source',
    }
  }

  if (fixture !== 'diagnostic') {
    throw new Error(`unknown SHOW_FIXTURE=${fixture}; expected diagnostic, direct-fade, pulse-fade, time-fade, delta-ms-fade, capture-fade, stock, adaptation-ramp, zone-repeat, or one of: ${routeTransitionFixtureList()}`)
  }

  const artifact = compileShow({
    clips: [
      { id: 'diagnostic-a', source: diagnosticClipA() },
      { id: 'diagnostic-b', source: diagnosticClipB() },
    ],
    crossfade: { startMs: 15000, durationMs: 3000 },
  }, {})
  return {
    source: artifact.code,
    description: [
      'diagnostic colors:',
      '0-3s red, 3-6s green, 6-9s blue,',
      '9-12s red fades to black, 12-15s blue fades to black,',
      '15-18s red crossfades to blue, then steady blue',
    ].join(' '),
    sourceLabel: `Generated Show source: ${artifact.summary.artifactBytes} bytes (${(artifact.summary.artifactBudgetRatio * 100).toFixed(1)}% of ${artifact.summary.measuredDeviceBudgetBytes})`,
  }
}

async function pushActive(
  conn: PixelblazeConnection,
  bytecode: Uint8Array,
): Promise<{ active: boolean; programId: string; config: ControllerConfig }> {
  const programId = makeProgramId()
  conn.pushByteCode(bytecode, { id: programId, name: '' })
  await sleep(2400)
  const config = await conn.getConfig()
  return { active: config.activeProgramId === programId, programId, config }
}

async function watchController(conn: PixelblazeConnection, watchMs: number): Promise<void> {
  const started = Date.now()
  let lastFps = -1
  let lastVars = ''
  while (Date.now() - started < watchMs) {
    const fps = conn.fps
    if (typeof fps === 'number' && fps > 0 && fps !== lastFps) {
      console.log(`  t=${((Date.now() - started) / 1000).toFixed(1)}s fps=${fps}`)
      lastFps = fps
    }
    if (SAMPLE_VARS) {
      const vars = await conn.getVars()
      const compact = Object.entries(vars)
        .map(([key, value]) => `${key}=${Number.isFinite(value) ? value.toFixed(6) : value}`)
        .join(' ')
      if (compact !== lastVars) {
        console.log(`  t=${((Date.now() - started) / 1000).toFixed(1)}s vars ${compact}`)
        lastVars = compact
      }
    }
    await sleep(250)
  }
}

async function main(): Promise<void> {
  const { source, description, sourceLabel } = buildFixtureSource(SHOW_FIXTURE)

  console.log(`Fixture: ${SHOW_FIXTURE}`)
  console.log(description)
  console.log(sourceLabel)
  console.log(`Fetching device compiler from http://${IP} ...`)
  const compile = makeDeviceCompiler(await fetchWebUI(IP))
  const compiled = compile(source)
  if (!compiled.ok) throw new Error(`device compile failed: ${compiled.error}`)
  console.log(`Device bytecode: ${compiled.bytecode.length} bytes; exports=${compiled.exports.length}`)

  const conn = new PixelblazeConnection({
    host: IP,
    webSocketFactory: nodeFactory,
    requestTimeoutMs: 15000,
  })
  conn.on('error', (error) => console.error('socket error:', error))
  console.log(`Connecting to Pixelblaze at ws://${IP}:81 ...`)
  await conn.connect()

  try {
    if (FORCE_BRIGHTNESS !== undefined) {
      const value = Number(FORCE_BRIGHTNESS)
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error('FORCE_BRIGHTNESS must be a number from 0 to 1')
      }
      console.log(`Setting temporary brightness=${value} (save=false) ...`)
      conn.setBrightness(value, false)
      await sleep(250)
    }
    const pushed = await pushActive(conn, compiled.bytecode)
    if (!pushed.active) throw new Error('pushed show did not become the active program')
    console.log(
      `Active on controller: ${pushed.programId}; firmware=${pushed.config.firmwareVersion ?? 'unknown'} pixels=${pushed.config.pixelCount ?? 'unknown'} brightness=${pushed.config.brightness ?? 'unknown'}`,
    )
    console.log(`Watching for ${WATCH_MS} ms ...`)
    await watchController(conn, WATCH_MS)
  } finally {
    conn.close()
  }
}

main().catch((error) => {
  console.error('\nissue316 failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
