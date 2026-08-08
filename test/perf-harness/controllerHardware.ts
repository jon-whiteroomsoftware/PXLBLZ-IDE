import vm from 'node:vm'
import WebSocket from 'ws'
import { bytecodeHeaderReconciles, makeProgramId } from '../../src/engine/bytecodePush'
import { buildCompilerEnv, missingComponents, v3AdapterV3 } from '../../src/engine/compilerExtraction'
import { PixelblazeConnection, type WebSocketLike } from '../../src/engine/PixelblazeConnection'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'

const PERFORMANCE_OUTPUT_PROFILES = [
  'native-serial',
  'output-expander',
  'pro-expander',
  'clocked',
] as const

/**
 * The output profile stamped into every measurement header (#567). Runners
 * read the user's declaration from PIXELBLAZE_OUTPUT_PROFILE; an absent
 * declaration is stamped as an explicit assumption, never a silent default.
 * Measurements on differently-declared profiles are different qualification
 * envelopes and must never be averaged together.
 */
export function declaredOutputProfileStamp(
  declared = process.env.PIXELBLAZE_OUTPUT_PROFILE,
): string {
  if (!declared) return 'native-serial (assumed)'
  if ((PERFORMANCE_OUTPUT_PROFILES as readonly string[]).includes(declared)) return declared
  throw new Error(
    `PIXELBLAZE_OUTPUT_PROFILE must be one of ${PERFORMANCE_OUTPUT_PROFILES.join(', ')}; got "${declared}".`,
  )
}

interface CompiledProgram {
  exports: { name: string; address: number }[]
  compiled: number[]
  status: string
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function waitForControllerConfig(
  readConfig: () => Promise<{ activeProgramId?: string; pixelCount?: number }>,
  expected: { activeProgramId: string; pixelCount?: number },
  timeoutMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs
  let config = await readConfig()
  while (
    Date.now() < deadline
    && (config.activeProgramId !== expected.activeProgramId
      || (expected.pixelCount != null && config.pixelCount !== expected.pixelCount))
  ) {
    await sleep(250)
    config = await readConfig()
  }
  return config
}

export function nodeWebSocketFactory(url: string): WebSocketLike {
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

async function fetchControllerCompilerEnvironment(ip: string): Promise<string> {
  let webUi = ''
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`http://${ip}/index.html.gz`)
      if (!response.ok) throw new Error(`GET index.html.gz -> ${response.status}`)
      const stream = new Response(await response.arrayBuffer()).body!.pipeThrough(new DecompressionStream('gzip'))
      webUi = await new Response(stream).text()
      break
    } catch (error) {
      lastError = error
      if (attempt < 3) await sleep(500)
    }
  }
  if (!webUi) throw lastError instanceof Error ? lastError : new Error('Controller compiler download failed')
  if (webUi.charCodeAt(0) === 0xfeff) webUi = webUi.slice(1)
  const components = v3AdapterV3(webUi)
  const missing = missingComponents(components)
  if (missing.length > 0) throw new Error(`compiler extraction miss: ${missing.join(', ')}`)
  return buildCompilerEnv(components)
}

export async function fetchControllerCompiler(ip: string): Promise<(source: string) => Uint8Array> {
  const context = vm.createContext({ window: {} })
  vm.runInContext(await fetchControllerCompilerEnvironment(ip), context, { filename: 'device-compiler.js' })
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

export interface ControllerCompilerInspection {
  programKeys: string[]
  memSize: number | null
  identifierCount: number
  identifiers: Array<{
    name: string
    type: string | null
    address: number | null
  }>
  exportCount: number
  compiledWordCount: number
}

/** Read-only view of the device compiler's own symbol allocation. */
export async function fetchControllerCompilerInspector(
  ip: string,
): Promise<(source: string) => ControllerCompilerInspection> {
  const context = vm.createContext({ window: {} })
  const inspectionSource = `
    var inspectPattern = function (src) {
      var compilerOptions = { predefinedGlobals: predefinedGlobals, extendedOperators: extendedOperators, constants: constants };
      var program = window.compile(src, compilerOptions);
      var identifiers = program.identifiers || {};
      return JSON.stringify({
        programKeys: Object.keys(program),
        memSize: typeof program.memSize === "number" ? program.memSize : null,
        identifierCount: Object.keys(identifiers).length,
        identifiers: Object.keys(identifiers).map(function (name) {
          var identifier = identifiers[name];
          return {
            name: name,
            type: identifier && typeof identifier.type === "string" ? identifier.type : null,
            address: identifier && typeof identifier.address === "number" ? identifier.address : null
          };
        }),
        exportCount: Object.keys(program.exports || {}).reduce(function (sum, key) {
          return sum + Object.keys(program.exports[key] || {}).length;
        }, 0),
        compiledWordCount: (program.compiled || []).length
      });
    };
  `
  vm.runInContext(
    `${await fetchControllerCompilerEnvironment(ip)}\n${inspectionSource}`,
    context,
    { filename: 'device-compiler-inspector.js' },
  )
  const inspectPattern = (context as { inspectPattern?: (source: string) => string }).inspectPattern
  if (!inspectPattern) throw new Error('device compiler did not define inspectPattern')
  return (source: string) => JSON.parse(inspectPattern(source)) as ControllerCompilerInspection
}

export async function pushAndMeasureControllerArtifact(
  connection: PixelblazeConnection,
  artifact: GeneratedShowArtifact,
  compile: (source: string) => Uint8Array,
  options: ControllerMeasurementOptions = {},
) {
  const measured = await pushAndMeasureControllerSource(connection, artifact.code, compile, 0, options)
  return {
    ...measured,
    sourceBytes: artifact.summary.artifactBytes,
    ledgerVmWords: artifact.summary.resources.totalWords,
  }
}

export interface ControllerMeasurementOptions {
  activationTimeoutMs?: number
  /** Optional delay after activation so an earlier Pattern's last FPS packet cannot enter the sample window. */
  settleMs?: number
  sampleMs?: number
}

export async function pushAndMeasureControllerSource(
  connection: PixelblazeConnection,
  source: string,
  compile: (source: string) => Uint8Array,
  ledgerVmWords = 0,
  options: ControllerMeasurementOptions = {},
) {
  const bytecode = compile(source)
  const programId = makeProgramId()
  const activationStartedMs = Date.now()
  connection.pushByteCode(bytecode, { id: programId, name: '' })
  const activationTimeoutMs = options.activationTimeoutMs ?? 10_000
  const activationDeadline = Date.now() + activationTimeoutMs
  let activeProgramId: string | undefined
  while (Date.now() < activationDeadline) {
    await sleep(500)
    const active = await connection.getConfig()
    activeProgramId = active.activeProgramId
    if (activeProgramId === programId) break
  }
  if (activeProgramId !== programId) throw new Error(`probe ${programId} did not activate within ${activationTimeoutMs}ms`)
  const activationMs = Date.now() - activationStartedMs
  if ((options.settleMs ?? 0) > 0) await sleep(options.settleMs!)
  const values: number[] = []
  const end = Date.now() + (options.sampleMs ?? 6_000)
  while (Date.now() < end) {
    if (connection.fps && connection.fps > 0) values.push(connection.fps)
    await sleep(250)
  }
  if (values.length === 0) throw new Error('Controller did not report FPS')
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
  return {
    sourceBytes: new TextEncoder().encode(source).length,
    bytecodeBytes: bytecode.length,
    activationMs,
    ledgerVmWords,
    fps: {
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      median,
      min: Math.min(...values),
      max: Math.max(...values),
      samples: values.length,
    },
  }
}
