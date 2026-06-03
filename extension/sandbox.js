// Sandboxed iframe — the MV3-legal eval host for the device's remote compiler.
//
// Receives the assembled compiler env + pattern source, eval()s the device's
// compiler (remote code, only legal under this relaxed sandbox CSP), runs
// compilePattern(src), builds the bytecode blob, and posts it back.
//
// Ported verbatim from the H8 spike (test/h8-compiler-spike/extension), proven
// GO in #200. MV3 CSP crux: remote code may only `eval` in a sandbox.pages
// iframe, hosted by an offscreen doc — never the service worker.

window.addEventListener('message', (ev) => {
  const { id, compilerEnv, patternSrc } = ev.data || {}
  if (typeof id === 'undefined') return
  let result
  try {
    // Define the compiler + a `compilePattern` wrapper in this scope.
    // eslint-disable-next-line no-eval
    ;(0, eval)(compilerEnv)
    if (typeof compilePattern !== 'function') {
      throw new Error('compilePattern not defined after eval (extraction wrong?)')
    }
    const out = compilePattern(patternSrc)
    if (out.status !== 'OK') {
      result = { ok: false, error: 'compiler: ' + out.status }
    } else {
      const bytecode = buildBytecode(out)
      // Uint8Array does not survive structured clone across the sandbox boundary
      // cleanly in all Chromes; send a plain array.
      result = { ok: true, bytecode: Array.from(bytecode) }
    }
  } catch (e) {
    result = { ok: false, error: String(e && e.message ? e.message : e) }
  }
  // Reply to the offscreen parent.
  ev.source.postMessage({ id, result }, '*')
})

// Build the Pixelblaze bytecode blob (mirrors pixelblaze-client compilePattern):
//   DWORD opcodeBytes | DWORD exportBytes | int32 opcodes... | exports...
//   export = DWORD address + ascii name + NUL
function buildBytecode(program) {
  const opcodes = program.compiled
  const exports = program.exports
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
