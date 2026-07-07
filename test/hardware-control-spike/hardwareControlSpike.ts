// Hardware/control dialect spike for issue #289.
//
// Runs a sequential set of compile + push probes against one physical
// Pixelblaze. The controller has a very small WebSocket pool, so this harness
// opens one connection, runs each fixture in order, and always closes it in a
// finally block.

import vm from 'node:vm'
import WebSocket from 'ws'
import {
  PixelblazeConnection,
  type WebSocketLike,
} from '../../src/engine/PixelblazeConnection'
import { bytecodeHeaderReconciles, makeProgramId } from '../../src/engine/bytecodePush'
import {
  buildCompilerEnv,
  missingComponents,
  v3AdapterV3,
} from '../../src/engine/compilerExtraction'

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface CompiledProgram {
  exports: { name: string; address: number }[]
  compiled: number[]
}

interface CompileOk {
  ok: true
  bytecode: Uint8Array
}

interface CompileFailure {
  ok: false
  error: string
}

type CompileResult = CompileOk | CompileFailure

interface RuntimeFixture {
  name: string
  source: string
  settleMs?: number
  vars?: string[]
  sampleFps?: boolean
}

interface RuntimeResult {
  name: string
  compile: 'ok' | string
  active?: boolean
  programId?: string
  vars?: Record<string, number>
  fps?: FpsStats
  error?: string
}

interface FpsStats {
  mean: number
  min: number
  max: number
  samples: number
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
  for (const s of exports) exportSize += 4 + s.name.length + 1
  const total = 8 + 4 * opcodes.length + exportSize
  const buf = new ArrayBuffer(total)
  const dv = new DataView(buf)
  let o = 0
  dv.setUint32(o, 4 * opcodes.length, true)
  o += 4
  dv.setUint32(o, exportSize, true)
  o += 4
  for (const op of opcodes) {
    dv.setInt32(o, op, true)
    o += 4
  }
  for (const s of exports) {
    dv.setUint32(o, s.address, true)
    o += 4
    for (let k = 0; k < s.name.length; k++) {
      dv.setUint8(o, s.name.charCodeAt(k))
      o += 1
    }
    dv.setUint8(o, 0)
    o += 1
  }
  return new Uint8Array(buf)
}

function makeDeviceCompiler(webUI: string): (deviceSrc: string) => CompileResult {
  const components = v3AdapterV3(webUI)
  const missing = missingComponents(components)
  if (missing.length > 0) {
    throw new Error(`compiler extraction miss: ${missing.join(', ')}`)
  }
  const env = buildCompilerEnv(components)
  const context = vm.createContext({ window: {} })
  vm.runInContext(env, context, { filename: 'device-compiler.js' })
  const compilePattern = (context as { compilePattern?: (s: string) => unknown }).compilePattern
  if (typeof compilePattern !== 'function') {
    throw new Error('compilePattern not defined after eval')
  }
  return (deviceSrc: string) => {
    try {
      const out = compilePattern(deviceSrc) as
        | { status: 'OK'; exports: { name: string; address: number }[]; compiled: number[] }
        | { status: string }
      if (out.status !== 'OK') return { ok: false, error: out.status }
      const bytecode = buildBytecode(out as CompiledProgram)
      if (!bytecodeHeaderReconciles(bytecode)) {
        return { ok: false, error: 'compiled bytecode failed header sanity check' }
      }
      return { ok: true, bytecode }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}

async function sampleFps(conn: PixelblazeConnection, sampleMs: number): Promise<FpsStats> {
  const vals: number[] = []
  let last = -1
  const end = Date.now() + sampleMs
  while (Date.now() < end) {
    const f = conn.fps
    if (typeof f === 'number' && f > 0 && f !== last) {
      vals.push(f)
      last = f
    }
    await sleep(250)
  }
  if (vals.length === 0) throw new Error('device never reported a usable FPS')
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return { mean, min: Math.min(...vals), max: Math.max(...vals), samples: vals.length }
}

function pickVars(vars: Record<string, number>, names: string[] | undefined): Record<string, number> {
  if (!names) return vars
  const out: Record<string, number> = {}
  for (const name of names) out[name] = vars[name]
  return out
}

async function pushAndRead(
  conn: PixelblazeConnection,
  fixture: RuntimeFixture,
  bytecode: Uint8Array,
): Promise<RuntimeResult> {
  const programId = makeProgramId()
  conn.pushByteCode(bytecode, { id: programId, name: '' })
  await sleep(fixture.settleMs ?? 2200)
  const cfg = await conn.getConfig()
  const active = cfg.activeProgramId === programId
  const vars = await conn.getVars()
  const fps = fixture.sampleFps ? await sampleFps(conn, 3000) : undefined
  return {
    name: fixture.name,
    compile: 'ok',
    active,
    programId,
    vars: pickVars(vars, fixture.vars),
    fps,
  }
}

const runtimeFixtures: RuntimeFixture[] = [
  {
    name: 'fps-baseline-no-analog',
    vars: ['frames'],
    sampleFps: true,
    source: `
export var frames = 0

export function beforeRender(delta) {
  frames = frames + 1
}

export function render(index) {
  hsv(0, 0, 0)
}
`,
  },
  {
    name: 'wrap-before-render',
    vars: ['calls', 'originalDelta', 'wrappedDelta'],
    source: `
export var calls = 0
export var originalDelta = 0
export var wrappedDelta = 0

function __pxlblz_original_beforeRender(delta) {
  calls = calls + 1
  originalDelta = delta
}

export function beforeRender(delta) {
  wrappedDelta = delta
  __pxlblz_original_beforeRender(delta)
}

export function render(index) {
  hsv(0, 0, 0)
}
`,
  },
  {
    name: 'call-exported-slider',
    vars: ['frames', 'level'],
    source: `
export var frames = 0
export var level = 0

export function sliderLevel(v) {
  level = v
}

export function beforeRender(delta) {
  frames = frames + 1
  sliderLevel(0.375)
}

export function render(index) {
  hsv(level, 1, 0.05)
}
`,
  },
  {
    name: 'assign-var-and-export-var',
    vars: ['plainProbe', 'exportedTarget'],
    source: `
var plainTarget = 0
export var exportedTarget = 0
export var plainProbe = 0

export function beforeRender(delta) {
  plainTarget = 0.25
  exportedTarget = 0.75
  plainProbe = plainTarget
}

export function render(index) {
  hsv(0.6, 1, 0.04)
}
`,
  },
  {
    name: 'digital-input-drives-slider',
    vars: ['pot0Digital', 'pot1Digital', 'level', 'pot0Changes', 'pot1Changes'],
    settleMs: 15000,
    source: `
export var pot0Digital = 0
export var pot1Digital = 0
export var level = 0
export var pot0Changes = 0
export var pot1Changes = 0

var lastPot0 = -1
var lastPot1 = -1

export function sliderLevel(v) {
  level = v
}

export function beforeRender(delta) {
  pinMode(25, INPUT)
  pinMode(26, INPUT)
  pot0Digital = digitalRead(25)
  pot1Digital = digitalRead(26)
  if (lastPot0 >= 0 && pot0Digital != lastPot0) pot0Changes = pot0Changes + 1
  if (lastPot1 >= 0 && pot1Digital != lastPot1) pot1Changes = pot1Changes + 1
  lastPot0 = pot0Digital
  lastPot1 = pot1Digital
  sliderLevel(pot0Digital ? 0.12 : 0.02)
}

export function render(index) {
  hsv(pot1Digital ? 0.62 : 0.08, 1, level)
}
`,
  },
  {
    name: 'alias-builtin-hsv',
    vars: ['frames'],
    source: `
export var frames = 0
var oldHsv = hsv

export function beforeRender(delta) {
  frames = frames + 1
}

export function render(index) {
  oldHsv(0.12, 1, 0.04)
}
`,
  },
  {
    name: 'shadow-builtin-hsv',
    vars: ['shadowHit'],
    source: `
export var shadowHit = 0

function hsv(h, s, v) {
  shadowHit = 1
}

export function render(index) {
  hsv(0.12, 1, 0.04)
}
`,
  },
  {
    name: 'output-wrapper-shapes',
    vars: ['frames'],
    sampleFps: true,
    source: `
export var frames = 0

function __pxlblz_hsv(h, s, v) {
  hsv(h, s, v * 0.5)
}

function __pxlblz_hsv24(h, s, v) {
  hsv24(h, s, v * 0.5)
}

function __pxlblz_rgb(r, g, b) {
  rgb(r * 0.5, g * 0.5, b * 0.5)
}

function __pxlblz_paint1(pos) {
  paint(pos)
}

function __pxlblz_paint2(pos, brightness) {
  paint(pos, brightness * 0.5)
}

export function beforeRender(delta) {
  frames = frames + 1
}

export function render(index) {
  var x = index / pixelCount
  if (x < 0.25) {
    __pxlblz_hsv(x, 1, 0.08)
  } else if (x < 0.5) {
    __pxlblz_hsv24(x, 1, 0.08)
  } else if (x < 0.75) {
    __pxlblz_rgb(0.08, x, 0.02)
  } else if (x < 0.875) {
    __pxlblz_paint1(x)
  } else {
    __pxlblz_paint2(x, 0.08)
  }
}
`,
  },
  {
    name: 'missing-arg-user-function',
    vars: ['seenB'],
    source: `
export var seenB = 0.5

function record(a, b) {
  seenB = b
}

export function beforeRender(delta) {
  record(0.25)
}

export function render(index) {
  hsv(0, 0, 0)
}
`,
  },
  {
    name: 'paint-with-undefined',
    vars: ['frames'],
    source: `
export var frames = 0

export function beforeRender(delta) {
  frames = frames + 1
}

export function render(index) {
  paint(0.2, undefined)
}
`,
  },
]

const compileOnlySources: Record<string, string> = {
  'analog-api-a1': `
export var raw = 0
export function beforeRender(delta) {
  pinMode(A1, ANALOG)
  raw = analogRead(A1)
}
export function render(index) { hsv(0, 0, 0) }
`,
  'analog-api-gpio32': `
export var raw = 0
export function beforeRender(delta) {
  pinMode(32, ANALOG)
  raw = analogRead(32)
}
export function render(index) { hsv(0, 0, 0) }
`,
  'read-adc-v2': `
export var raw = 0
export function beforeRender(delta) {
  raw = readAdc()
}
export function render(index) { hsv(0, 0, 0) }
`,
}

const candidateConstants = [
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'A7',
  'GP0',
  'GP1',
  'GP2',
  'GP3',
  'GP4',
  'GP5',
  'GP12',
  'GP13',
  'GP14',
  'GP15',
  'GP16',
  'GP17',
  'GP18',
  'GP19',
  'GP21',
  'GP22',
  'GP23',
  'GP25',
  'GP26',
  'GP27',
  'GP32',
  'GP33',
  'GP34',
  'GP35',
  'GP36',
  'GP39',
  'T0',
  'T2',
  'T4',
  'T6',
  'T7',
]

// Analog runtime probes are opt-in so this harness never brute-forces hardware
// pins. Example: PIXELBLAZE_ANALOG_PINS=33,34 npx tsx ...
const analogRuntimePins = (process.env.PIXELBLAZE_ANALOG_PINS ?? '')
  .split(',')
  .map((raw) => parseInt(raw.trim(), 10))
  .filter((pin) => Number.isFinite(pin))

function constantProbeSource(name: string): string {
  return `
export var value = ${name}
export function render(index) { hsv(0, 0, 0) }
`
}

function analogRuntimeSource(pin: number): string {
  return `
export var raw = 0
export var minRaw = 1
export var maxRaw = 0
export var avgRaw = 0
export var samples = 0

export function beforeRender(delta) {
  pinMode(${pin}, ANALOG)
  raw = analogRead(${pin})
  minRaw = min(minRaw, raw)
  maxRaw = max(maxRaw, raw)
  avgRaw = avgRaw + (raw - avgRaw) * 0.05
  samples = samples + 1
}

export function render(index) {
  hsv(0.33, 1, raw * 0.08)
}
`
}

function analogNumericCompileSource(pin: number): string {
  return `
export var raw = 0
export function beforeRender(delta) {
  pinMode(${pin}, ANALOG)
  raw = analogRead(${pin})
}
export function render(index) { hsv(0, 0, 0) }
`
}

async function main(): Promise<void> {
  console.log(`Fetching device compiler from http://${IP} ...`)
  const compile = makeDeviceCompiler(await fetchWebUI(IP))

  const compileOnly = Object.entries(compileOnlySources).map(([name, source]) => ({
    name,
    result: compile(source),
  }))

  const constants = candidateConstants.map((name) => ({
    name,
    result: compile(constantProbeSource(name)),
  }))
  const onlyFixture = process.env.PIXELBLAZE_ONLY
  const selectedRuntimeFixtures =
    onlyFixture == null ? runtimeFixtures : runtimeFixtures.filter((f) => f.name === onlyFixture)
  if (onlyFixture != null && selectedRuntimeFixtures.length === 0) {
    throw new Error(`unknown PIXELBLAZE_ONLY fixture "${onlyFixture}"`)
  }

  const runtimeResults: RuntimeResult[] = []
  console.log(`Connecting to Pixelblaze at ws://${IP}:81 ...`)
  const conn = new PixelblazeConnection({
    host: IP,
    webSocketFactory: nodeFactory,
    connectTimeoutMs: 5000,
    requestTimeoutMs: 15000,
    pingIntervalMs: 0,
  })
  conn.on('error', (e) => console.error('socket error:', e))
  await conn.connect()
  try {
    for (const fixture of selectedRuntimeFixtures) {
      process.stdout.write(`  ${fixture.name}: compile ... `)
      const compiled = compile(fixture.source)
      if (!compiled.ok) {
        console.log(`failed (${compiled.error})`)
        runtimeResults.push({ name: fixture.name, compile: compiled.error })
        continue
      }
      process.stdout.write('push ... ')
      try {
        const result = await pushAndRead(conn, fixture, compiled.bytecode)
        runtimeResults.push(result)
        console.log(result.active ? 'active' : 'not active')
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        runtimeResults.push({ name: fixture.name, compile: 'ok', error })
        console.log(`failed (${error})`)
      }
    }

    for (const pin of analogRuntimePins) {
      const fixture: RuntimeFixture = {
        name: `analog-floating-${pin}`,
        source: analogRuntimeSource(pin),
        vars: ['raw', 'minRaw', 'maxRaw', 'avgRaw', 'samples'],
        sampleFps: true,
        settleMs: 3000,
      }
      process.stdout.write(`  ${fixture.name}: compile ... `)
      const compiled = compile(fixture.source)
      if (!compiled.ok) {
        console.log(`failed (${compiled.error})`)
        runtimeResults.push({ name: fixture.name, compile: compiled.error })
        continue
      }
      process.stdout.write('push ... ')
      try {
        const result = await pushAndRead(conn, fixture, compiled.bytecode)
        runtimeResults.push(result)
        console.log(result.active ? 'active' : 'not active')
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        runtimeResults.push({ name: fixture.name, compile: 'ok', error })
        console.log(`failed (${error})`)
      }
    }
  } finally {
    conn.close()
  }

  console.log('\n## Compile-only checks')
  for (const { name, result } of compileOnly) {
    console.log(`- ${name}: ${result.ok ? 'OK' : result.error}`)
  }

  console.log('\n## Constants accepted by device compiler')
  for (const { name, result } of constants) {
    if (result.ok) console.log(`- ${name}`)
  }

  console.log('\n## Runtime fixtures')
  for (const result of runtimeResults) {
    const parts = [`- ${result.name}: compile=${result.compile}`]
    if (result.active != null) parts.push(`active=${result.active}`)
    if (result.vars) parts.push(`vars=${JSON.stringify(result.vars)}`)
    if (result.fps) {
      parts.push(
        `fps=${result.fps.mean.toFixed(2)} min=${result.fps.min.toFixed(1)} max=${result.fps.max.toFixed(1)} n=${result.fps.samples}`,
      )
    }
    if (result.error) parts.push(`error=${JSON.stringify(result.error)}`)
    console.log(parts.join(' '))
  }
}

main().catch((err) => {
  console.error('\nhardware-control-spike failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
