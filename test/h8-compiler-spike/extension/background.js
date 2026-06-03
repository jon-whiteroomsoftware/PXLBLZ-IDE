// H8 spike service worker (#200) — orchestrates the compile-in-extension proof.
//
// The one open question (the rest of the pipeline is proven by the #112 Python
// PoC): can the device's own minified JS compiler run inside an MV3-legal host
// and emit accepted bytecode, WITHOUT remote eval in the service worker (which
// MV3 CSP forbids)? The escape hatch is a *sandboxed iframe* (relaxed CSP), and
// the SW has no DOM, so the iframe is hosted by an offscreen document.
//
// Flow on toolbar click:
//   1. [SW]        HTTP GET http://<ip>/index.html.gz  -> gunzip -> decode
//   2. [SW]        extract compiler + constants (v3AdapterV3, fw > 3.4)
//   3. [SW->off->sandbox]  eval compiler in the sandboxed iframe, run
//                          compilePattern(src), build the bytecode blob
//   4. [SW]        frame + push over ws://<ip>:81  (pause/setCode/putByteCode/
//                  setControls/run) — the #112 save sequence
//   5. watch the strip: a moving rainbow == GO.
//
// Throwaway spike code, hardcoded IP, no UI. Excluded from the commit gate.

const DEVICE_IP = '192.168.8.224' // <-- set to your Controller's LAN IP
const PATTERN_SRC =
  'export function render(index) { hsv(time(.1) + index/pixelCount, 1, 1) }'

const log = (...a) => console.log('[H8]', ...a)
const err = (...a) => console.error('[H8]', ...a)

chrome.action.onClicked.addListener(() => {
  runSpike().catch((e) => err('FAILED:', e && e.stack ? e.stack : e))
})

async function runSpike() {
  log('starting. device =', DEVICE_IP)

  // 1. Fetch + gunzip + decode the device web UI.
  const webUI = await fetchWebUI(DEVICE_IP)
  log('fetched index.html.gz, decoded chars =', webUI.length)

  // 2. Extract the compiler pieces (fw 3.67 => v3AdapterV3).
  const components = v3AdapterV3(webUI)
  for (const k of ['hardwareVariant', 'extendedOperators', 'constants', 'compiler']) {
    if (!components[k]) throw new Error(`extraction MISS: ${k} empty — adapter mismatch?`)
    log(`extracted ${k}: ${components[k].length} chars`)
  }
  const compilerEnv = buildCompilerEnv(components)
  log('assembled compiler env =', compilerEnv.length, 'chars')

  // 3. Compile inside the sandboxed iframe (the spike's actual unknown).
  const result = await compileInSandbox(compilerEnv, PATTERN_SRC)
  if (!result.ok) throw new Error(`compile FAILED in sandbox: ${result.error}`)
  const bytecode = new Uint8Array(result.bytecode)
  log(
    'compiled in sandboxed iframe. bytecode len =',
    bytecode.length,
    'head =',
    toHex(bytecode.slice(0, 12)),
  )
  // Header sanity (mirrors the #112 PoC): 8 + opcodeBytes + exportBytes == len.
  const dv = new DataView(bytecode.buffer)
  const opBytes = dv.getUint32(0, true)
  const expBytes = dv.getUint32(4, true)
  const headerOk = 8 + opBytes + expBytes === bytecode.length
  log(`header: opcodeBytes=${opBytes} exportBytes=${expBytes} matchesLen=${headerOk}`)
  if (!headerOk) throw new Error('bytecode header does not reconcile with length')

  // 4. Push to the renderer (no flash write).
  await pushToRenderer(DEVICE_IP, bytecode)
  log('OK -- pushed via putByteCode. WATCH THE STRIP: a moving rainbow == GO.')
}

// ---- 1. fetch + gunzip + decode (utf-8-sig: strip BOM) -------------------

async function fetchWebUI(ip) {
  const resp = await fetch(`http://${ip}/index.html.gz`)
  if (!resp.ok) throw new Error(`GET index.html.gz -> ${resp.status}`)
  const gzBuf = await resp.arrayBuffer()
  const stream = new Response(gzBuf).body.pipeThrough(new DecompressionStream('gzip'))
  let text = await new Response(stream).text()
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // strip BOM
  return text
}

// ---- 2. extraction (ported verbatim from pixelblaze-client compilePattern) ----

function getSubstring(text, startValue, endValue) {
  const start = text.indexOf(startValue)
  if (start === -1) return ''
  const finish = text.indexOf(endValue, start)
  if (finish === -1) return ''
  return text.slice(start, finish)
}

function extractCompiler(webUI) {
  let rest = webUI
  while (rest.length > 0) {
    const i = rest.indexOf('<script>')
    if (i === -1) break
    const after = rest.slice(i + '<script>'.length)
    const j = after.indexOf('</script>')
    const script = j === -1 ? after : after.slice(0, j)
    rest = j === -1 ? '' : after.slice(j + '</script>'.length)
    if (script.indexOf('window.compile') !== -1) return script
  }
  return ''
}

// fw > 3.4 adapter. Older firmwares need v2 / v3v1 / v3v2 (see pixelblaze-client).
function v3AdapterV3(webUI) {
  return {
    hardwareVariant: 'var ' + getSubstring(webUI, 'hardwareVariant=', ',varWatcherPoller') + ';',
    extendedOperators: getSubstring(webUI, 'extendedOperators={', ',lastErrorMarkers=') + ';',
    constants:
      'var constants;' + getSubstring(webUI, '"ESP8266"===hardwareVariant&&', ',[])') + ';',
    compiler: extractCompiler(webUI) + ';',
  }
}

// Assemble the string the sandboxed iframe will eval. NOTE: unlike the Python
// PoC we DO NOT prepend `window = {}` — in a browser host `window` is read-only
// and already present, and the compiler attaches itself to the real window.
function buildCompilerEnv(c) {
  return (
    'var predefinedGlobals = ["pixelCount"];\n' +
    c.hardwareVariant +
    '\n' +
    c.constants +
    '\n' +
    c.extendedOperators +
    '\n' +
    c.compiler +
    '\n' +
    `
    var compilePattern = function (src) {
      try {
        var compilerOptions = { predefinedGlobals: predefinedGlobals, extendedOperators: extendedOperators, constants: constants };
        var program = window.compile(src, compilerOptions);
        function surfaceList(list) { return Object.keys(list).reduce(function (r, k) { return r.concat(list[k]); }, []); }
        return { status: "OK", exports: surfaceList(program.exports), compiled: program.compiled };
      } catch (ex) {
        return { status: (ex && ex.description ? ex.description : String(ex)) };
      }
    };
    `
  )
}

// ---- 3. compile in the sandboxed iframe via the offscreen document ----------

async function compileInSandbox(compilerEnv, patternSrc) {
  await ensureOffscreen()
  return await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'compile',
    compilerEnv,
    patternSrc,
  })
}

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  })
  if (existing.length > 0) return
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['IFRAME_SCRIPTING'],
    justification: 'Host a sandboxed iframe that evaluates the device compiler (remote code).',
  })
  log('offscreen document created')
}

// ---- 4. push: pause / setCode / putByteCode / setControls / run -------------

async function pushToRenderer(ip, bytecode) {
  const ws = new WebSocket(`ws://${ip}:81`)
  ws.binaryType = 'arraybuffer'
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', () => rej(new Error('ws open failed')), { once: true })
  })
  ws.addEventListener('message', (ev) => {
    if (typeof ev.data === 'string') log('ws <-', ev.data.slice(0, 120))
  })
  log('ws open')

  const crc = crc32(bytecode)
  ws.send(
    JSON.stringify({
      pause: true,
      setCode: { size: bytecode.length, crc, name: '', id: makeId() },
    }),
  )
  await delay(150)

  // Binary frame: [type=3 putByteCode][flags=first|last=5] + bytecode (single
  // chunk; an 83-byte blob is well under the 1280-byte chunk limit).
  const frame = new Uint8Array(2 + bytecode.length)
  frame[0] = 3
  frame[1] = 1 | 4
  frame.set(bytecode, 2)
  ws.send(frame.buffer)
  await delay(250)

  ws.send(JSON.stringify({ setControls: {} }))
  ws.send(JSON.stringify({ pause: false }))
  await delay(250)
  log('save sequence sent')
}

// ---- helpers ----------------------------------------------------------------

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const ID_CHARS = '23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz'
function makeId() {
  let s = ''
  for (let i = 0; i < 17; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]
  return s
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
