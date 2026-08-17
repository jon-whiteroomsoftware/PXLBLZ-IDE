// Bench snapshot for a hardware campaign: Controller config, program inventory,
// and exported vars, written as JSON. Diagnosis and cleanup comparison only; it
// never grades a goal. Run from the repo root:
//   npx tsx docs/agents/manual-test-campaigns/harness/bench-snapshot.ts <out.json>
// Pair it with `curl http://<ip>/pixelmap.dat` for the installed map blob.
import { writeFileSync } from 'node:fs'
import WebSocket from 'ws'
import {
  PixelblazeConnection,
  type WebSocketLike,
} from '../../../../src/engine/PixelblazeConnection'

const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const out = process.argv[2] ?? `bench-snapshot-${Date.now()}.json`

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
const config = await connection.getConfig()
const programs = await connection.listPrograms()
// A failed variable read is recorded as an error, never as an empty (valid)
// variable set, so before/after comparisons cannot mistake "not observed" for
// "no exported variables".
let vars: Record<string, number> | null = null
let varsError: string | null = null
try {
  vars = await connection.getVars()
} catch (error) {
  varsError = error instanceof Error ? error.message : String(error)
}
connection.close()
const snapshot = {
  takenAt: new Date().toISOString(),
  ip,
  config,
  programs: programs
    .map((program) => ({ id: program.id, name: program.name }))
    .sort((left, right) => left.id.localeCompare(right.id)),
  vars,
  varsError,
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
  varsError,
}))
if (varsError) process.exitCode = 2
