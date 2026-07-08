// Issue #316 hardware tracer bullet. Builds a generated two-clip Show artifact,
// compiles it with the connected Pixelblaze's own compiler, pushes it as a
// run-only program, and leaves the single crossfade visible for a short window.
//
//   PIXELBLAZE_IP=192.168.8.224 npm run issue316
//   PIXELBLAZE_IP=192.168.8.224 WATCH_MS=12000 npm run issue316

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

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const WATCH_MS = parseInt(process.env.WATCH_MS ?? '9000', 10)

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

async function main(): Promise<void> {
  const artifact = compileShow({
    clips: [
      { id: 'TestPattern1D', source: stockPattern('TestPattern1D') },
      { id: 'CometLoom', source: stockPattern('CometLoom') },
    ],
    crossfade: { startMs: 2500, durationMs: 3000 },
  }, {})

  console.log(`Generated Show source: ${artifact.summary.artifactBytes} bytes`)
  console.log(
    `Measured budget ratio: ${(artifact.summary.artifactBudgetRatio * 100).toFixed(1)}% of ${artifact.summary.measuredDeviceBudgetBytes} bytes`,
  )
  console.log(`Fetching device compiler from http://${IP} ...`)
  const compile = makeDeviceCompiler(await fetchWebUI(IP))
  const compiled = compile(artifact.code)
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
    const pushed = await pushActive(conn, compiled.bytecode)
    if (!pushed.active) throw new Error('pushed show did not become the active program')
    console.log(
      `Active on controller: ${pushed.programId}; firmware=${pushed.config.firmwareVersion ?? 'unknown'} pixels=${pushed.config.pixelCount ?? 'unknown'}`,
    )
    console.log(`Watching for ${WATCH_MS} ms; crossfade starts at 2500 ms and lasts 3000 ms ...`)
    await sleep(WATCH_MS)
  } finally {
    conn.close()
  }
}

main().catch((error) => {
  console.error('\nissue316 failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
