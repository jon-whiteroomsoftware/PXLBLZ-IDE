// Bench snapshot for a hardware campaign: Controller config, program inventory,
// and exported vars, written as JSON. Diagnosis and cleanup comparison only; it
// never grades a goal. Run from the repo root:
//   npx tsx docs/agents/manual-test-campaigns/harness/bench-snapshot.ts <out.json>
// Pair it with `curl http://<ip>/pixelmap.dat` for the installed map blob.
import { writeFileSync } from 'node:fs'
import {
  PixelblazeConnection,
  type WebSocketLike,
} from '../../../../src/engine/PixelblazeConnection'

const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const out = process.argv[2] ?? `bench-snapshot-${Date.now()}.json`

function nodeWebSocket(url: string): WebSocketLike {
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'
  return ws as unknown as WebSocketLike
}

const connection = new PixelblazeConnection({
  host: ip,
  webSocketFactory: nodeWebSocket,
  requestTimeoutMs: 10_000,
  pingIntervalMs: 0,
})
connection.on('error', () => undefined)
await connection.connect()
const config = await connection.getConfig()
const programs = await connection.listPrograms()
const vars: Record<string, number> = await connection.getVars().catch(() => ({}))
connection.close()
const snapshot = {
  takenAt: new Date().toISOString(),
  ip,
  config,
  programs: programs
    .map((program) => ({ id: program.id, name: program.name }))
    .sort((left, right) => left.id.localeCompare(right.id)),
  vars,
}
writeFileSync(out, JSON.stringify(snapshot, null, 2))
console.log(JSON.stringify({
  out,
  programCount: programs.length,
  activeProgramId: config.activeProgramId,
  name: config.name,
  pixelCount: config.pixelCount,
  runSequencer: config.runSequencer,
  sequencerMode: config.sequencerMode,
}))
