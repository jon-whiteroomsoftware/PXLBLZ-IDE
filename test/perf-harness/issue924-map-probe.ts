// #924 review P1: what does the firmware feed render2D when pixelCount
// exceeds the installed map's point count? Pushes a run-only probe that
// records the coordinates seen at three indices and which renderer the
// firmware calls, at 256 (matching map), 500, and 2,000 pixels, then
// restores the original Pattern and count. Never touches the pixel map.
import { makeProgramId } from '../../src/engine/bytecodePush'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import { fetchControllerCompiler, nodeWebSocketFactory, sleep, waitForControllerConfig } from './controllerHardware'

const IP = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const PROBE = `export var calls2d = 0
export var calls1d = 0
export var x10 = -1
export var y10 = -1
export var x300 = -1
export var y300 = -1
export var x1500 = -1
export var y1500 = -1
export var maxIndex = -1
export function beforeRender(delta) { calls2d = 0; calls1d = 0; maxIndex = -1 }
export function render2D(index, x, y) {
  calls2d = calls2d + 1
  if (index > maxIndex) maxIndex = index
  if (index == 10) { x10 = x; y10 = y }
  if (index == 300) { x300 = x; y300 = y }
  if (index == 1500) { x1500 = x; y1500 = y }
  rgb(0, 0, 0.02)
}
`

async function main() {
  const compile = await fetchControllerCompiler(IP)
  const connection = new PixelblazeConnection({ host: IP, webSocketFactory: nodeWebSocketFactory, requestTimeoutMs: 15_000, pingIntervalMs: 0 })
  connection.on('error', (error) => console.error('socket:', error))
  await connection.connect()
  const original = await connection.getConfig()
  if (!original.activeProgramId) throw new Error('no active Pattern; refusing')
  // A run-only active Pattern is destroyed by the probe push and cannot be
  // reselected afterwards; refuse unless it is in the saved inventory.
  const savedPrograms = await connection.listPrograms()
  if (!savedPrograms.some((program) => program.id === original.activeProgramId)) {
    connection.close()
    throw new Error(`Active Pattern ${original.activeProgramId} is not in the saved inventory; refusing a non-restorable probe.`)
  }
  const results: unknown[] = []
  try {
    const id = makeProgramId()
    connection.pushByteCode(compile(PROBE), { id, name: '' })
    await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: id })
    for (const pixelCount of [256, 500, 2000, 256]) {
      connection.setPixelCount(pixelCount, false)
      await sleep(2_500)
      const config = await connection.getConfig()
      const vars = await connection.getVars()
      results.push({ requested: pixelCount, reported: config.pixelCount, vars })
      console.log(JSON.stringify({ requested: pixelCount, reported: config.pixelCount, vars }))
    }
  } finally {
    let restore = connection
    try { await connection.getConfig() } catch {
      connection.close()
      restore = new PixelblazeConnection({ host: IP, webSocketFactory: nodeWebSocketFactory, requestTimeoutMs: 15_000, pingIntervalMs: 0 })
      await restore.connect()
    }
    restore.setActiveProgram(original.activeProgramId)
    if (original.pixelCount != null) restore.setPixelCount(original.pixelCount, false)
    const restored = await waitForControllerConfig(() => restore.getConfig(), { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount })
    console.log('restored', restored.activeProgramId === original.activeProgramId, restored.pixelCount)
    restore.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
