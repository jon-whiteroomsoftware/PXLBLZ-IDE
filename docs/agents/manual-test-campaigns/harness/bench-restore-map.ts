// Campaign cleanup: re-install an exact /pixelmap.dat blob captured before the
// run, then verify by re-reading it. Run from the repo root:
//   npx tsx docs/agents/manual-test-campaigns/harness/bench-restore-map.ts <pixelmap.dat>
import { readFileSync } from 'node:fs'
import WebSocket from 'ws'
import {
  PixelblazeConnection,
  type WebSocketLike,
} from '../../../../src/engine/PixelblazeConnection'

const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const file = process.argv[2]
if (!file) throw new Error('Pass the path of the captured pixelmap.dat blob.')
const blob = new Uint8Array(readFileSync(file))

// The `ws` package (already a dependency) rather than the global WebSocket,
// which Node 20 does not enable by default; its Buffer frames satisfy the
// connection's binary normalisation.
function nodeWebSocket(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike
}

const connection = new PixelblazeConnection({
  host: ip,
  webSocketFactory: nodeWebSocket,
  requestTimeoutMs: 10_000,
  pingIntervalMs: 0,
})
connection.on('error', () => undefined)
await connection.connect()
connection.putPixelMap(blob, { save: true })
await new Promise((resolve) => setTimeout(resolve, 2500))
connection.close()

const readBack = new Uint8Array(await (await fetch(`http://${ip}/pixelmap.dat`)).arrayBuffer())
const identical = readBack.length === blob.length && readBack.every((byte, index) => byte === blob[index])
console.log(JSON.stringify({ restoredBytes: blob.length, readBackBytes: readBack.length, identical }))
if (!identical) process.exit(1)
