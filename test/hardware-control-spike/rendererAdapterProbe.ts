// Real-Controller renderer-adapter probe for issue #393.
//
// HUMAN-IN-THE-LOOP, OUT-OF-BAND. Temporarily replaces the Controller's map and
// active run-only Pattern, then restores the original map bytes and active
// program in a finally block. Nothing is added to Saved Patterns.
//
//   PIXELBLAZE_IP=192.168.8.224 npx tsx test/hardware-control-spike/rendererAdapterProbe.ts

import vm from 'node:vm'
import WebSocket from 'ws'
import { PixelblazeConnection, type WebSocketLike } from '../../src/engine/PixelblazeConnection'
import { bundleWithPasses } from '../../src/engine/passEngine'
import { bytecodeHeaderReconciles, makeProgramId } from '../../src/engine/bytecodePush'
import { buildCompilerEnv, missingComponents, v3AdapterV3 } from '../../src/engine/compilerExtraction'
import { encodeMapData } from '../../src/engine/mapPush'

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const SETTLE_MS = 2200
const MAP_SETTLE_MS = 700
const TOLERANCE = 2 / 65535

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface CompiledProgram {
  exports: { name: string; address: number }[]
  compiled: number[]
}

interface ProbeCase {
  name: string
  mapDim: 1 | 2 | 3
  source: string
  expected: Record<string, number>
  expectsAdapter: boolean
}

function nodeFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(`http://${IP}${path}`)
  if (!response.ok) throw new Error(`GET ${path} -> ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function fetchWebUI(): Promise<string> {
  const gzip = await fetchBytes('/index.html.gz')
  const stream = new Response(gzip).body!.pipeThrough(new DecompressionStream('gzip'))
  let text = await new Response(stream).text()
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text
}

function buildBytecode(program: CompiledProgram): Uint8Array {
  let exportSize = 0
  for (const exported of program.exports) exportSize += 4 + exported.name.length + 1
  const buffer = new ArrayBuffer(8 + 4 * program.compiled.length + exportSize)
  const view = new DataView(buffer)
  let offset = 0
  view.setUint32(offset, 4 * program.compiled.length, true); offset += 4
  view.setUint32(offset, exportSize, true); offset += 4
  for (const opcode of program.compiled) {
    view.setInt32(offset, opcode, true)
    offset += 4
  }
  for (const exported of program.exports) {
    view.setUint32(offset, exported.address, true); offset += 4
    for (const character of exported.name) view.setUint8(offset++, character.charCodeAt(0))
    view.setUint8(offset++, 0)
  }
  return new Uint8Array(buffer)
}

function makeDeviceCompiler(webUI: string): (source: string) => Uint8Array {
  const components = v3AdapterV3(webUI)
  const missing = missingComponents(components)
  if (missing.length > 0) throw new Error(`compiler extraction miss: ${missing.join(', ')}`)
  const context = vm.createContext({ window: {} })
  vm.runInContext(buildCompilerEnv(components), context, { filename: 'device-compiler.js' })
  const compilePattern = (context as { compilePattern?: (source: string) => unknown }).compilePattern
  if (typeof compilePattern !== 'function') throw new Error('compilePattern was not created')
  return (source: string) => {
    const result = compilePattern(source) as
      | { status: 'OK'; exports: CompiledProgram['exports']; compiled: number[] }
      | { status: string }
    if (result.status !== 'OK') throw new Error(`device compiler: ${result.status}`)
    const bytecode = buildBytecode(result as CompiledProgram)
    if (!bytecodeHeaderReconciles(bytecode)) throw new Error('compiled bytecode header is invalid')
    return bytecode
  }
}

function mapPoints(dim: 1 | 2 | 3, pixelCount: number): number[][] {
  const first = [0.125, 0.25, 0.75].slice(0, dim)
  return Array.from({ length: pixelCount }, (_, index) => {
    if (index === 0) return first
    const x = pixelCount <= 1 ? 0 : index / (pixelCount - 1)
    return [x, (x * 0.73) % 1, (x * 0.41) % 1].slice(0, dim)
  })
}

function probeCases(): ProbeCase[] {
  return [
    {
      name: '1D map -> render2D',
      mapDim: 1,
      source: `
export var observedY = -1
export function render2D(index, x, y) {
  if (index == 0) observedY = y
  hsv(0, 0, 0.01)
}`,
      expected: { observedY: 0.5 },
      expectsAdapter: true,
    },
    {
      name: '1D map -> render3D',
      mapDim: 1,
      source: `
export var observedY = -1
export var observedZ = -1
export function render3D(index, x, y, z) {
  if (index == 0) { observedY = y; observedZ = z }
  hsv(0, 0, 0.01)
}`,
      expected: { observedY: 0.5, observedZ: 0.5 },
      expectsAdapter: true,
    },
    {
      name: '2D map -> render3D',
      mapDim: 2,
      source: `
export var observedZ = -1
export function render3D(index, x, y, z) {
  if (index == 0) observedZ = z
  hsv(0, 0, 0.01)
}`,
      expected: { observedZ: 0.5 },
      expectsAdapter: true,
    },
    {
      name: '3D map -> render2D',
      mapDim: 3,
      source: `
export var observedX = -1
export var observedY = -1
export function render2D(index, x, y) {
  if (index == 0) { observedX = x; observedY = y }
  hsv(0, 0, 0.01)
}`,
      expected: { observedX: 0.125, observedY: 0.25 },
      expectsAdapter: false,
    },
  ]
}

function assertObserved(name: string, vars: Record<string, number>, expected: Record<string, number>): void {
  for (const [key, value] of Object.entries(expected)) {
    const observed = vars[key]
    if (!Number.isFinite(observed) || Math.abs(observed - value) > TOLERANCE) {
      throw new Error(`${name}: ${key}=${observed}; expected ${value} +/- ${TOLERANCE}`)
    }
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

async function main(): Promise<void> {
  console.log(`Fetching compiler and original map from ${IP} ...`)
  const [webUI, originalMap] = await Promise.all([fetchWebUI(), fetchBytes('/pixelmap.dat')])
  const compile = makeDeviceCompiler(webUI)
  const conn = new PixelblazeConnection({
    host: IP,
    webSocketFactory: nodeFactory,
    requestTimeoutMs: 15000,
  })
  await conn.connect()
  const originalConfig = await conn.getConfig()
  const pixelCount = originalConfig.pixelCount
  if (!pixelCount || !originalConfig.activeProgramId) {
    conn.close()
    throw new Error('Controller must report pixelCount and activeProgramId for reversible probing')
  }

  console.log(
    `Connected: firmware=${originalConfig.firmwareVersion ?? 'unknown'} pixels=${pixelCount}; ` +
    `will restore active=${originalConfig.activeProgramId}`,
  )
  try {
    for (const probe of probeCases()) {
      conn.putPixelMap(encodeMapData(mapPoints(probe.mapDim, pixelCount)), { save: true })
      await sleep(MAP_SETTLE_MS)

      const artifact = bundleWithPasses(probe.source, {}, [{
        id: 'renderer-adapter',
        kind: 'renderer-adapter',
        mapDim: probe.mapDim,
      }])
      const adapted = artifact.summary.rendererAdaptations.length > 0
      if (adapted !== probe.expectsAdapter) {
        throw new Error(`${probe.name}: adapter=${adapted}; expected ${probe.expectsAdapter}`)
      }

      const bytecode = compile(artifact.code)
      const programId = makeProgramId()
      conn.pushByteCode(bytecode, { id: programId, name: '' })
      await sleep(SETTLE_MS)
      const config = await conn.getConfig()
      if (config.activeProgramId !== programId) {
        throw new Error(`${probe.name}: pushed Pattern did not become active`)
      }
      const vars = await conn.getVars()
      assertObserved(probe.name, vars, probe.expected)
      console.log(`PASS ${probe.name}: ${JSON.stringify(probe.expected)}`)
    }
  } finally {
    console.log('Restoring original map and active Pattern ...')
    try {
      conn.putPixelMap(originalMap, { save: true })
      await sleep(MAP_SETTLE_MS)
      conn.setActiveProgram(originalConfig.activeProgramId)
      await sleep(500)
      const [restoredMap, restoredConfig] = await Promise.all([
        fetchBytes('/pixelmap.dat'),
        conn.getConfig(),
      ])
      if (!bytesEqual(restoredMap, originalMap)) throw new Error('original map did not restore byte-for-byte')
      if (restoredConfig.activeProgramId !== originalConfig.activeProgramId) {
        throw new Error('original active Pattern did not restore')
      }
      console.log('Restore verified byte-for-byte.')
    } finally {
      conn.close()
    }
  }
}

main().catch((error) => {
  console.error('rendererAdapterProbe failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
