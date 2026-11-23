// Headless device compile shared by the hardware harnesses (devbench.ts,
// controllerBulkDelete.ts): fetch the Controller's own web UI, extract its
// compiler and run it in a Node vm context.
import vm from 'node:vm'
import {
  v3AdapterV3,
  buildCompilerEnv,
  missingComponents,
} from '../../src/engine/compilerExtraction'
import { bytecodeHeaderReconciles } from '../../src/engine/bytecodePush'

// ── device compile (the headless half of the extension's compile path) ───────

/** Fetch + gunzip + BOM-strip the device web UI. Mirrors background.js fetchWebUI. */
export async function fetchWebUI(ip: string): Promise<string> {
  const resp = await fetch(`http://${ip}/index.html.gz`)
  if (!resp.ok) throw new Error(`GET index.html.gz -> ${resp.status}`)
  const gzBuf = await resp.arrayBuffer()
  const stream = new Response(gzBuf).body!.pipeThrough(new DecompressionStream('gzip'))
  let text = await new Response(stream).text()
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text
}

interface CompiledProgram {
  exports: { name: string; address: number }[]
  compiled: number[]
}

/** Build the device bytecode blob (mirrors extension/sandbox.js buildBytecode):
 *  DWORD opcodeBytes | DWORD exportBytes | int32 opcodes… | (DWORD addr + ascii + NUL)… */
function buildBytecode(program: CompiledProgram): Uint8Array {
  const { compiled: opcodes, exports } = program
  let exportSize = 0
  for (const s of exports) exportSize += 4 + s.name.length + 1
  const total = 8 + 4 * opcodes.length + exportSize
  const buf = new ArrayBuffer(total)
  const dv = new DataView(buf)
  let o = 0
  dv.setUint32(o, 4 * opcodes.length, true); o += 4
  dv.setUint32(o, exportSize, true); o += 4
  for (const op of opcodes) { dv.setInt32(o, op, true); o += 4 }
  for (const s of exports) {
    dv.setUint32(o, s.address, true); o += 4
    for (let k = 0; k < s.name.length; k++) { dv.setUint8(o, s.name.charCodeAt(k)); o += 1 }
    dv.setUint8(o, 0); o += 1
  }
  return new Uint8Array(buf)
}

/** Extract the device's compiler from its web UI and run it in a Node vm context
 *  (with a `window` shim) to turn flat device-dialect source into bytecode. */
export function makeDeviceCompiler(webUI: string): (deviceSrc: string) => Uint8Array {
  const components = v3AdapterV3(webUI)
  const missing = missingComponents(components)
  if (missing.length > 0) {
    throw new Error(`compiler extraction miss: ${missing.join(', ')} — firmware adapter mismatch?`)
  }
  const env = buildCompilerEnv(components)
  // vm contexts get the standard intrinsics (Object/Array/Math/JSON); the device
  // compiler only additionally expects a writable `window` to attach itself to.
  const context = vm.createContext({ window: {} })
  vm.runInContext(env, context, { filename: 'device-compiler.js' })
  const compilePattern = (context as { compilePattern?: (s: string) => unknown }).compilePattern
  if (typeof compilePattern !== 'function') {
    throw new Error('compilePattern not defined after eval (extraction wrong?)')
  }
  return (deviceSrc: string) => {
    const out = compilePattern(deviceSrc) as
      | { status: 'OK'; exports: { name: string; address: number }[]; compiled: number[] }
      | { status: string }
    if (out.status !== 'OK') throw new Error(`device compiler: ${out.status}`)
    const bytecode = buildBytecode(out as CompiledProgram)
    if (!bytecodeHeaderReconciles(bytecode)) {
      throw new Error('compiled bytecode failed its header sanity check')
    }
    return bytecode
  }
}
