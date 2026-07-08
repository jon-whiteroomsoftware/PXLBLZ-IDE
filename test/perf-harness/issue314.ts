// Issue #314 hardware perf spikes. This is an out-of-band runner: it fetches
// the connected Pixelblaze's own compiler, opens one WebSocket, runs generated
// measurement probes, and writes a committed findings note.
//
//   PIXELBLAZE_IP=192.168.8.224 npm run issue314
//   PIXELBLAZE_IP=192.168.8.224 npm run issue314 -- --out /tmp/issue314.md

import { writeFileSync } from 'node:fs'
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

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const FW = process.env.PIXELBLAZE_FW
const DEFAULT_OUT = 'docs/plans/archive/issue-314-perf-harness-spikes.md'

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

interface FpsStats {
  mean: number
  min: number
  max: number
  samples: number
}

interface Measurement {
  label: string
  bytecodeBytes: number
  fps: FpsStats
  frameMs: number
  programId: string
}

interface LimitResult {
  label: string
  unit: string
  maxOk: number
  firstFail?: number
  failure?: string
  bytecodeBytes?: number
  sourceBytes?: number
  lowerBound: boolean
}

interface ProbeOk {
  ok: true
  bytecodeBytes: number
  sourceBytes: number
}

interface ProbeFail {
  ok: false
  error: string
}

type ProbeResult = ProbeOk | ProbeFail

interface Args {
  out: string
  settleMs: number
  sampleMs: number
  wrapperRepeats: number
  maxFillerStatements: number
  maxGlobals: number
  maxArrayLength: number
  maxControls: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    out: DEFAULT_OUT,
    settleMs: 3000,
    sampleMs: 5000,
    wrapperRepeats: 12,
    maxFillerStatements: 20000,
    maxGlobals: 2048,
    maxArrayLength: 8192,
    maxControls: 512,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out') args.out = requiredValue(arg, argv[++i])
    else if (arg === '--settle') args.settleMs = intArg(arg, argv[++i])
    else if (arg === '--sample') args.sampleMs = intArg(arg, argv[++i])
    else if (arg === '--wrapper-repeats') args.wrapperRepeats = intArg(arg, argv[++i])
    else if (arg === '--max-filler') args.maxFillerStatements = intArg(arg, argv[++i])
    else if (arg === '--max-globals') args.maxGlobals = intArg(arg, argv[++i])
    else if (arg === '--max-array') args.maxArrayLength = intArg(arg, argv[++i])
    else if (arg === '--max-controls') args.maxControls = intArg(arg, argv[++i])
    else throw new Error(`unknown arg ${arg}`)
  }
  return args
}

function requiredValue(flag: string, raw: string | undefined): string {
  if (!raw) throw new Error(`${flag} needs a value`)
  return raw
}

function intArg(flag: string, raw: string | undefined): number {
  const value = parseInt(raw ?? '', 10)
  if (!Number.isFinite(value) || value < 1) throw new Error(`${flag} needs a positive integer`)
  return value
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

async function sampleFps(
  conn: PixelblazeConnection,
  settleMs: number,
  sampleMs: number,
): Promise<FpsStats> {
  await sleep(settleMs)
  const vals: number[] = []
  let last = -1
  const end = Date.now() + sampleMs
  while (Date.now() < end) {
    const fps = conn.fps
    if (typeof fps === 'number' && fps > 0 && fps !== last) {
      vals.push(fps)
      last = fps
    }
    await sleep(250)
  }
  if (vals.length === 0) throw new Error('device never reported usable FPS')
  const mean = vals.reduce((sum, fps) => sum + fps, 0) / vals.length
  return { mean, min: Math.min(...vals), max: Math.max(...vals), samples: vals.length }
}

async function pushActive(
  conn: PixelblazeConnection,
  bytecode: Uint8Array,
  settleMs = 2200,
): Promise<{ active: boolean; programId: string; config: ControllerConfig }> {
  const programId = makeProgramId()
  conn.pushByteCode(bytecode, { id: programId, name: '' })
  await sleep(settleMs)
  const config = await conn.getConfig()
  return { active: config.activeProgramId === programId, programId, config }
}

async function measureSource(
  conn: PixelblazeConnection,
  compile: (source: string) => CompileResult,
  label: string,
  source: string,
  args: Args,
): Promise<Measurement> {
  const compiled = compile(source)
  if (!compiled.ok) throw new Error(`${label} compile failed: ${compiled.error}`)
  process.stdout.write(`  ${label}: push ${compiled.bytecode.length} B ... `)
  const pushed = await pushActive(conn, compiled.bytecode)
  if (!pushed.active) throw new Error(`${label} did not become active`)
  process.stdout.write('active, sample FPS ...\n')
  const fps = await sampleFps(conn, args.settleMs, args.sampleMs)
  return {
    label,
    bytecodeBytes: compiled.bytecode.length,
    fps,
    frameMs: 1000 / fps.mean,
    programId: pushed.programId,
  }
}

async function confirmCompileAndPush(
  conn: PixelblazeConnection,
  compile: (source: string) => CompileResult,
  source: string,
): Promise<ProbeResult> {
  const compiled = compile(source)
  if (!compiled.ok) return { ok: false, error: `compile: ${compiled.error}` }
  try {
    const pushed = await pushActive(conn, compiled.bytecode, 2600)
    if (!pushed.active) return { ok: false, error: 'push: pattern did not become active' }
  } catch (error) {
    return { ok: false, error: `push: ${error instanceof Error ? error.message : String(error)}` }
  }
  return { ok: true, bytecodeBytes: compiled.bytecode.length, sourceBytes: source.length }
}

async function findLimit(
  probe: (source: string) => Promise<ProbeResult>,
  label: string,
  unit: string,
  maxProbe: number,
  makeSource: (n: number) => string,
): Promise<LimitResult> {
  let low = 0
  let high = 1
  let lowerBound = false
  let failure: string | undefined
  let lastOk: ProbeOk | undefined

  while (high <= maxProbe) {
    const source = makeSource(high)
    const result = await probe(source)
    if (!result.ok) {
      failure = result.error
      break
    }
    low = high
    lastOk = result
    high *= 2
  }

  if (high > maxProbe) {
    lowerBound = true
    high = maxProbe
  }

  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2)
    const source = makeSource(mid)
    const result = await probe(source)
    if (result.ok) {
      low = mid
      lastOk = result
    } else {
      high = mid
      failure = result.error
      lowerBound = false
    }
  }

  if (!lastOk && low === 0) {
    const source = makeSource(0)
    const result = await probe(source)
    if (result.ok) {
      lastOk = result
    }
  }

  return {
    label,
    unit,
    maxOk: low,
    firstFail: lowerBound ? undefined : high,
    failure,
    bytecodeBytes: lastOk?.bytecodeBytes,
    sourceBytes: lastOk?.sourceBytes,
    lowerBound,
  }
}

function directWrapperSource(repeats: number, wrapped: boolean): string {
  const call = wrapped ? '__pxlblz_hsv(h, 1, v)' : 'hsv(h, 1, v)'
  return `
${wrapped ? 'function __pxlblz_hsv(h, s, v) { hsv(h, s, v) }' : ''}
export var frames = 0

export function beforeRender(delta) {
  frames = frames + 1
}

export function render(index) {
  var h = index / pixelCount
  var v = 0.025
  for (var i = 0; i < ${repeats}; i = i + 1) {
    ${call}
    h = frac(h + 0.037)
    v = 0.025 + i * 0.001
  }
}
`
}

function fillerSource(statements: number): string {
  const lines = ['export var sink = 0', 'function filler() {', '  var x = 0']
  for (let i = 0; i < statements; i++) lines.push(`  x = x + ${((i % 19) + 1) / 1000}`)
  lines.push('  return x', '}', 'export function render(index) { hsv(0, 0, 0.01) }')
  return lines.join('\n')
}

function globalsSource(count: number): string {
  const lines: string[] = []
  for (let i = 0; i < count; i++) lines.push(`var g${i} = ${i % 7}`)
  lines.push('export function render(index) { hsv(0, 0, 0.01) }')
  return lines.join('\n')
}

function arraySource(length: number): string {
  return `
var values = array(${length})
export var probe = 0

export function beforeRender(delta) {
  if (${length} > 0) {
    values[0] = 0.25
    probe = values[0]
  }
}

export function render(index) {
  hsv(0, 0, 0.01)
}
`
}

function controlsSource(count: number): string {
  const lines = ['export var touched = 0']
  for (let i = 0; i < count; i++) {
    lines.push(`export function sliderControl${i}(v) { touched = v }`)
  }
  lines.push('export function render(index) { hsv(0, 0, 0.01) }')
  return lines.join('\n')
}

function mergedRenderersSource(mode: 'time-sliced' | 'both-running'): string {
  return `
export var t = 0
var invPixels, p0, p1, p2, falloff

export function beforeRender(delta) {
  t = t + delta * 0.001
  invPixels = 1 / (pixelCount - 1)
  p0 = frac(t * 0.070)
  p1 = frac(t * -0.091 + 0.21)
  p2 = frac(t * 0.112 + 0.43)
  falloff = 18
}

function comet(pos, p) {
  var d = abs(pos - p)
  d = min(d, 1 - d)
  var v = clamp(1 - d * falloff, 0, 1)
  return v * v
}

function renderTestPattern(index) {
  var pos = index / (pixelCount - 1)
  var head = frac(t * 0.1)
  var c = clamp(1 - abs(pos - head) * 12, 0, 1)
  hsv(pos, 1 - c, max(0.15, c))
}

function renderCometLoom(index) {
  var pos = index * invPixels
  var val = comet(pos, p0)
  var hue = 0.70
  var v = comet(pos, p1)
  if (v > val) { val = v; hue = 0.83 }
  v = comet(pos, p2)
  if (v > val) { val = v; hue = 0.96 }
  var base = triangle(pos * 3 - t * 0.035) * 0.10
  hsv(frac(hue + val * 0.06), 0.86, clamp(val + base, 0, 1))
}

export function render(index) {
  ${
    mode === 'time-sliced'
      ? `if (frac(t * 0.05) < 0.5) renderTestPattern(index)
  else renderCometLoom(index)`
      : `renderTestPattern(index)
  renderCometLoom(index)`
  }
}
`
}

function fmt(n: number | undefined, digits = 2): string {
  return n === undefined || !Number.isFinite(n) ? 'n/a' : n.toFixed(digits)
}

function limitText(result: LimitResult): string {
  const bound = result.lowerBound ? '>=' : ''
  const fail = result.firstFail === undefined
    ? 'not reached'
    : `${result.firstFail} ${result.unit} (${result.failure ?? 'failed'})`
  return `| ${result.label} | ${bound}${result.maxOk} ${result.unit} | ${result.bytecodeBytes ?? 'n/a'} | ${result.sourceBytes ?? 'n/a'} | ${fail} |`
}

function buildReport(opts: {
  args: Args
  config: ControllerConfig
  wrapperDirect: Measurement
  wrapperWrapped: Measurement
  limits: LimitResult[]
  timeSliced: Measurement
  bothRunning: Measurement
}): string {
  const now = new Date().toISOString().slice(0, 10)
  const pixelCount = opts.config.pixelCount ?? 0
  const wrapperDeltaMs = opts.wrapperWrapped.frameMs - opts.wrapperDirect.frameMs
  const wrapperCallsPerFrame = pixelCount * opts.args.wrapperRepeats
  const wrapperUsPerPixelCall = wrapperCallsPerFrame > 0
    ? (wrapperDeltaMs * 1000) / wrapperCallsPerFrame
    : Number.NaN
  const mergedDelta = opts.bothRunning.frameMs - opts.timeSliced.frameMs
  return [
    '# Issue 314 perf-harness findings',
    '',
    `Date: ${now}`,
    '',
    `Controller: Pixelblaze at \`${IP}\``,
    `Firmware: ${opts.config.firmwareVersion ?? FW ?? 'unknown'}`,
    `Board type: ${opts.config.boardType ?? 'unknown'}`,
    `Pixel count during FPS runs: ${opts.config.pixelCount ?? 'unknown'}`,
    '',
    '## Wrapper indirection cost',
    '',
    `Probe: ${opts.args.wrapperRepeats} output calls per pixel in \`render(index)\`, direct \`hsv\` versus a one-function wrapper that forwards to \`hsv\`.`,
    '',
    '| variant | bytecode bytes | FPS mean | frame ms | samples |',
    '|---|---:|---:|---:|---:|',
    `| direct hsv | ${opts.wrapperDirect.bytecodeBytes} | ${fmt(opts.wrapperDirect.fps.mean)} | ${fmt(opts.wrapperDirect.frameMs, 3)} | ${opts.wrapperDirect.fps.samples} |`,
    `| wrapped hsv | ${opts.wrapperWrapped.bytecodeBytes} | ${fmt(opts.wrapperWrapped.fps.mean)} | ${fmt(opts.wrapperWrapped.frameMs, 3)} | ${opts.wrapperWrapped.fps.samples} |`,
    '',
    `Delta: ${fmt(wrapperDeltaMs, 3)} ms/frame = ${fmt(wrapperUsPerPixelCall, 4)} us per wrapped output call per pixel at ${pixelCount} pixels.`,
    '',
    '## Device budget probes',
    '',
    'These probes compile with the controller firmware compiler, push the generated bytecode, and require the device to report the pushed program as active. The bytecode/source columns record the largest successful generated probe in that search.',
    '',
    '| question | max observed OK | bytecode bytes | source bytes | first failure |',
    '|---|---:|---:|---:|---|',
    ...opts.limits.map(limitText),
    '',
    '## Hand-merged renderer FPS',
    '',
    'Probe: two 1D stock-renderer shapes merged by hand from `TestPattern1D` and `CometLoom`. Time-sliced mode runs one renderer per frame; both-running mode evaluates both renderers each pixel and leaves the second output active.',
    '',
    '| emission strategy | bytecode bytes | FPS mean | frame ms | samples |',
    '|---|---:|---:|---:|---:|',
    `| time-sliced | ${opts.timeSliced.bytecodeBytes} | ${fmt(opts.timeSliced.fps.mean)} | ${fmt(opts.timeSliced.frameMs, 3)} | ${opts.timeSliced.fps.samples} |`,
    `| both-running | ${opts.bothRunning.bytecodeBytes} | ${fmt(opts.bothRunning.fps.mean)} | ${fmt(opts.bothRunning.frameMs, 3)} | ${opts.bothRunning.fps.samples} |`,
    '',
    `Delta: both-running costs ${fmt(mergedDelta, 3)} ms/frame versus time-sliced in this probe.`,
    '',
    '## Notes',
    '',
    '- The runner opens one WebSocket and closes it in `finally`, matching the socket-frugal hardware-spike pattern.',
    '- Generated budget probes are synthetic ceilings, not ergonomic authoring targets. The Show budget bar should keep a conservative margin below these numbers.',
    '- Wrapper cost is measured as an output-call indirection delta. A real power cap will do more work than this passthrough wrapper; this number is the lower bound for interception overhead.',
    '- `>=` budget rows are lower bounds: the probe still compiled, pushed, and became active at the configured search cap.',
    '- This run used the controller as currently configured at 256 pixels. Rerun the harness on a 300+ pixel configuration before treating the FPS rows as the final large-rig budget.',
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  console.log(`Fetching device compiler from http://${IP} ...`)
  const compile = makeDeviceCompiler(await fetchWebUI(IP))
  console.log(`Connecting to Pixelblaze at ws://${IP}:81 ...`)
  const conn = new PixelblazeConnection({
    host: IP,
    webSocketFactory: nodeFactory,
    requestTimeoutMs: 15000,
  })
  conn.on('error', (error) => console.error('socket error:', error))
  await conn.connect()

  try {
    const config = await conn.getConfig()
    console.log(
      `Connected: firmware=${config.firmwareVersion ?? FW ?? 'unknown'} board=${config.boardType ?? 'unknown'} pixels=${config.pixelCount ?? 'unknown'}\n`,
    )

    console.log('Wrapper cost probes')
    const wrapperDirect = await measureSource(
      conn,
      compile,
      'direct-hsv',
      directWrapperSource(args.wrapperRepeats, false),
      args,
    )
    const wrapperWrapped = await measureSource(
      conn,
      compile,
      'wrapped-hsv',
      directWrapperSource(args.wrapperRepeats, true),
      args,
    )

    console.log('\nCompiler budget probes')
    const runtimeProbe = (source: string) => confirmCompileAndPush(conn, compile, source)
    const limits = [
      await findLimit(runtimeProbe, 'filler bytecode size', 'filler statements', args.maxFillerStatements, fillerSource),
      await findLimit(runtimeProbe, 'top-level globals', 'globals', args.maxGlobals, globalsSource),
      await findLimit(runtimeProbe, 'single array length', 'array slots', args.maxArrayLength, arraySource),
      await findLimit(runtimeProbe, 'exported slider controls', 'controls', args.maxControls, controlsSource),
    ]
    for (const limit of limits) {
      console.log(`  ${limit.label}: ${limit.lowerBound ? '>=' : ''}${limit.maxOk} ${limit.unit}`)
    }

    console.log('\nMerged renderer probes')
    const timeSliced = await measureSource(
      conn,
      compile,
      'merged-time-sliced',
      mergedRenderersSource('time-sliced'),
      args,
    )
    const bothRunning = await measureSource(
      conn,
      compile,
      'merged-both-running',
      mergedRenderersSource('both-running'),
      args,
    )

    const report = buildReport({
      args,
      config,
      wrapperDirect,
      wrapperWrapped,
      limits,
      timeSliced,
      bothRunning,
    })
    writeFileSync(args.out, report)
    console.log(`\nWrote ${args.out}`)
  } finally {
    conn.close()
  }
}

main().catch((error) => {
  console.error('\nissue314 failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
