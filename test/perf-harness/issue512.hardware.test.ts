import vm from 'node:vm'
import WebSocket from 'ws'
import { bytecodeHeaderReconciles, makeProgramId } from '../../src/engine/bytecodePush'
import { buildCompilerEnv, missingComponents, v3AdapterV3 } from '../../src/engine/compilerExtraction'
import { PixelblazeConnection, type WebSocketLike } from '../../src/engine/PixelblazeConnection'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'

interface CompiledProgram {
  exports: { name: string; address: number }[]
  compiled: number[]
  status: string
}

const runHardware = process.env.ISSUE512_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function nodeFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
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

async function fetchDeviceCompiler(): Promise<(source: string) => Uint8Array> {
  const response = await fetch(`http://${ip}/index.html.gz`)
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
  return (source: string) => {
    const program = compilePattern(source)
    if (program.status !== 'OK') throw new Error(`Controller compiler: ${program.status}`)
    const bytecode = buildBytecode(program)
    if (!bytecodeHeaderReconciles(bytecode)) throw new Error('Controller compiler returned an invalid bytecode header')
    return bytecode
  }
}

async function pushAndMeasure(
  connection: PixelblazeConnection,
  artifact: GeneratedShowArtifact,
  compile: (source: string) => Uint8Array,
) {
  const bytecode = compile(artifact.code)
  const programId = makeProgramId()
  connection.pushByteCode(bytecode, { id: programId, name: '' })
  await sleep(2_000)
  const active = await connection.getConfig()
  if (active.activeProgramId !== programId) throw new Error(`probe ${programId} did not activate`)
  const values: number[] = []
  const end = Date.now() + 6_000
  while (Date.now() < end) {
    if (connection.fps > 0) values.push(connection.fps)
    await sleep(250)
  }
  if (values.length === 0) throw new Error('Controller did not report FPS')
  return {
    sourceBytes: artifact.summary.artifactBytes,
    bytecodeBytes: bytecode.length,
    vmWords: artifact.summary.resources.totalWords,
    fps: {
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      samples: values.length,
    },
  }
}

describe('Redline Controller counterfactual (#512)', () => {
  it.skipIf(!runHardware)('records source, bytecode, VM words, and FPS, restoring Controller state', async () => {
    const { selectedArtifact, counterfactualArtifact } = await import('./issue512')
    const compile = await fetchDeviceCompiler()
    const connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeFactory,
      requestTimeoutMs: 15_000,
      pingIntervalMs: 0,
    })
    connection.on('error', (error) => console.error('controller socket:', error))
    await connection.connect()
    const original = await connection.getConfig()
    if (!original.activeProgramId) {
      connection.close()
      throw new Error('Controller did not report an active program; refusing a non-reversible probe')
    }

    let runError: unknown
    let report: unknown
    try {
      if (original.pixelCount !== 2_000) {
        connection.setPixelCount(2_000, false)
        await sleep(1_000)
      }
      const counterfactual = await pushAndMeasure(connection, counterfactualArtifact, compile)
      const selected = await pushAndMeasure(connection, selectedArtifact, compile)
      report = {
        controller: {
          ip,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          originalPixelCount: original.pixelCount,
          measuredPixelCount: 2_000,
        },
        counterfactual,
        selected,
        fpsChangePercent: (selected.fps.mean / counterfactual.fps.mean - 1) * 100,
      }
      console.log(JSON.stringify(report, null, 2))
    } catch (error) {
      runError = error
    } finally {
      try {
        connection.setActiveProgram(original.activeProgramId)
        if (original.pixelCount) connection.setPixelCount(original.pixelCount, false)
        await sleep(1_000)
        const restored = await connection.getConfig()
        if (restored.activeProgramId !== original.activeProgramId || restored.pixelCount !== original.pixelCount) {
          const restoreError = new Error(`Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount})`)
          runError = runError == null
            ? restoreError
            : new AggregateError([runError, restoreError], 'probe and restoration both failed')
        }
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(report).toBeTruthy()
  }, 45_000)
})
