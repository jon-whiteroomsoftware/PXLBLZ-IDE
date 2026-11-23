// Controller Save stability probe on a test Controller (#1268).
//
// Measures what the Controller does on the socket while saved-Pattern uploads
// (`putSourceCode`, type 1) are written: per-chunk acks, the
// `saveProgramSourceFile` completion, and above all the longest stretch with no
// inbound frame. The IDE's liveness watchdog drops the socket after 4000 ms of
// inbound silence (ExtensionControllerProvider default), so every Save reports
// `maxGapMs` and whether that watchdog would have fired.
//
//   idle    socket open, no writes: the inbound cadence baseline.
//   single  N Saves one at a time, each as the editor sends it today: list,
//           Save, optionally activate (--activate), then wait for completion
//           and read the list back.
//   burst   N Saves as background reconciliation sends them today: list, Save,
//           next job, with no wait (--pacing none), or waiting for completion
//           (--pacing completion), or ack-paced chunks then completion
//           (--pacing ack). One final read-back names every missing Pattern.
//   --pattern takes a stock Pattern name or a .js path (the load Pattern, so an
//   activating Save keeps the Controller loaded).
//   cleanup delete manifest entries the Controller still lists under the
//           recorded name, then compare with the list the run started from.
//
// Every run also times the compiler download (`/index.html.gz`, which the helper
// fetches on every IDE compile) with the socket open, and reports the inbound
// gap during it.
//
// Safety: refuses to start when the Controller already lists a Pattern with the
// prefix or runs its sequencer. Each upload's id and name is appended to
// --manifest before it is sent. A single/burst run restores the starting active
// Pattern (volatile, `save: false`), deletes only its own uploads and compares
// the final list with the starting one, immediately and after --settle. No
// settings, firmware, map or reboot. One socket, closed with code 1000.
//
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/controllerSaveProbe.ts --mode idle --seconds 20
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/controllerSaveProbe.ts --mode single --count 10 --activate --manifest /tmp/1268-single.jsonl
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/controllerSaveProbe.ts --mode burst --count 20 --pacing none --manifest /tmp/1268-burst.jsonl
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/controllerSaveProbe.ts --mode cleanup --manifest /tmp/1268-burst.jsonl
//
// Fidelity: Node `ws` straight to the Controller. It omits the extension relay,
// the store and the JPEG preview (approximated by --pad bytes of incompressible
// source comment), so it measures firmware behaviour on the wire, not the
// dialog. HUMAN-IN-THE-LOOP, OUT-OF-BAND: needs a physical Pixelblaze on the
// LAN; never part of a commit gate.

import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import {
  encodeBinaryFrames,
  MessageType,
  PixelblazeConnection,
  type ProgramListEntry,
  type WebSocketLike,
} from '../../src/engine/PixelblazeConnection'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { encodePbp } from '../../src/engine/pbpEncode'
import { fetchControllerCompiler, sleep } from './controllerHardware'
import { compareReadBack, maxInboundGapMs, sourcePadding } from './controllerSaveProbeCore'

const HERE = dirname(fileURLToPath(import.meta.url))
const IP = process.env.PIXELBLAZE_IP
const IDE_WATCHDOG_MS = 4000
const COMPLETION_TIMEOUT_MS = 20_000
const ACK_TIMEOUT_MS = 5000
const ACTIVATION_TIMEOUT_MS = 15_000

type Mode = 'idle' | 'single' | 'burst' | 'cleanup'
type Pacing = 'none' | 'completion' | 'ack'
type Inbound = { at: number; kind: string; value?: unknown }

const progress = (message: string) => console.error(`[${new Date().toISOString()}] ${message}`)
const now = () => performance.now()
const round = (ms: number) => Math.round(ms)
const key = (program: ProgramListEntry) => `${program.id}\t${program.name}`

function parseArgs(argv: string[]) {
  const value = (flag: string, fallback: string) => {
    const index = argv.indexOf(flag)
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
  }
  const mode = value('--mode', '') as Mode
  if (!['idle', 'single', 'burst', 'cleanup'].includes(mode)) throw new Error('--mode idle|single|burst|cleanup is required')
  const pacing = value('--pacing', 'none') as Pacing
  if (!['none', 'completion', 'ack'].includes(pacing)) throw new Error('--pacing none|completion|ack')
  const count = Number(value('--count', mode === 'burst' ? '20' : '10'))
  if (!Number.isInteger(count) || count < 1 || count > 40) throw new Error('--count must be 1..40')
  const manifest = value('--manifest', '')
  if (mode !== 'idle' && !manifest) throw new Error('--manifest <path> is required')
  if ((mode === 'single' || mode === 'burst') && existsSync(manifest)) {
    throw new Error(`--manifest ${manifest} already exists; use a new path`)
  }
  return {
    mode,
    pacing,
    count,
    manifest,
    activate: argv.includes('--activate'),
    prefix: value('--prefix', 'zz-1268-tmp-'),
    pattern: value('--pattern', 'LumaSpiral'),
    pad: Number(value('--pad', '12000')),
    seconds: Number(value('--seconds', '20')),
    settleMs: Number(value('--settle', '3000')),
    listTimeoutMs: Number(value('--list-timeout', '5000')),
  }
}

async function main(): Promise<void> {
  if (!IP) throw new Error('set PIXELBLAZE_IP to the test Controller')
  const args = parseArgs(process.argv.slice(2))

  let socket: WebSocket | null = null
  const inbound: Inbound[] = []
  const conn = new PixelblazeConnection({
    host: IP,
    webSocketFactory: (url: string): WebSocketLike => {
      const ws = new WebSocket(url)
      ws.addEventListener('message', (event) => {
        const at = now()
        if (typeof event.data !== 'string') return void inbound.push({ at, kind: 'binary' })
        try {
          const message = JSON.parse(event.data) as Record<string, unknown>
          const kind = 'saveProgramSourceFile' in message
            ? 'saveProgramSourceFile'
            : 'ack' in message ? 'ack' : 'fps' in message ? 'fps' : 'json'
          inbound.push({ at, kind, value: message[kind] })
        } catch {
          inbound.push({ at, kind: 'text' })
        }
      })
      socket = ws
      return ws as unknown as WebSocketLike
    },
    // The IDE pings every second; ack pacing counts acks, so it pings never.
    pingIntervalMs: args.pacing === 'ack' ? 0 : 1000,
    requestTimeoutMs: 15_000,
  })
  conn.on('error', (error) => console.error('socket error:', error))
  await conn.connect()
  const opened = now()

  const waitFor = async (since: number, kind: string, timeoutMs: number): Promise<Inbound | null> => {
    const deadline = now() + timeoutMs
    while (now() < deadline) {
      const found = inbound.find((frame) => frame.at >= since && frame.kind === kind)
      if (found) return found
      await sleep(10)
    }
    return null
  }
  const listWithin = async (timeoutMs: number) => {
    const started = now()
    try {
      const programs = await Promise.race([
        conn.listPrograms(),
        sleep(timeoutMs).then(() => { throw new Error('list timed out') }),
      ])
      return { programs: programs as ProgramListEntry[], ms: round(now() - started) }
    } catch {
      return { programs: null, ms: round(now() - started) }
    }
  }

  try {
    if (args.mode === 'idle') {
      await sleep(args.seconds * 1000)
      const end = now()
      const kinds = Object.fromEntries(['fps', 'ack', 'json', 'binary'].map((kind) => [kind, inbound.filter((f) => f.kind === kind).length]))
      console.log(JSON.stringify({ ip: IP, mode: 'idle', seconds: args.seconds, kinds, maxGapMs: round(maxInboundGapMs(inbound.map((f) => f.at), opened, end)) }, null, 2))
      return
    }

    const starting = await conn.listPrograms()
    progress(`starting list: ${starting.length} Patterns`)

    if (args.mode === 'cleanup') {
      const recorded = new Set(readFileSync(args.manifest, 'utf8').split('\n').filter(Boolean)
        .map((line) => key(JSON.parse(line) as ProgramListEntry)))
      const leftovers = starting.filter((program) => recorded.has(key(program)))
      for (const program of leftovers) {
        conn.deleteProgram(program.id)
        progress(`cleanup sent ${program.name}`)
        await sleep(500)
      }
      await sleep(args.settleMs)
      const after = await conn.listPrograms()
      const expected = starting.filter((program) => !leftovers.includes(program)).map(key)
      console.log(JSON.stringify({
        ip: IP, mode: 'cleanup', deleted: leftovers.map(key), after: after.map(key),
        matchesExpected: after.length === expected.length && after.every((program) => expected.includes(key(program))),
      }, null, 2))
      return
    }

    const leftovers = starting.filter((program) => program.name.startsWith(args.prefix))
    if (leftovers.length > 0) throw new Error(`Controller already lists ${leftovers.length} "${args.prefix}" Patterns; refusing`)
    const config = await conn.getConfig()
    if (config.runSequencer) throw new Error('Controller sequencer is running; refusing')
    const startingActive = config.activeProgramId

    // The compiler download the helper repeats on every IDE compile.
    const webUiStarted = now()
    const compile = await fetchControllerCompiler(IP)
    const webUiEnded = now()
    const webUi = {
      ms: round(webUiEnded - webUiStarted),
      maxGapMs: round(maxInboundGapMs(inbound.map((f) => f.at), webUiStarted, webUiEnded)),
    }
    progress(`compiler download ${webUi.ms} ms, max inbound gap ${webUi.maxGapMs} ms`)

    const patternSource = readFileSync(args.pattern.endsWith('.js') ? args.pattern : join(HERE, '../../src/pixelblaze/stock/patterns', `${args.pattern}.js`), 'utf8')
    const byteCode = compile(patternSource)
    const sourceCode = patternSource + sourcePadding(args.pad)

    const sendSave = async (id: string, blob: Uint8Array) => {
      if (args.pacing !== 'ack') return void conn.saveProgram(id, blob)
      const idBytes = new TextEncoder().encode(id)
      const payload = new Uint8Array(idBytes.length + blob.length)
      payload.set(idBytes, 0)
      payload.set(blob, idBytes.length)
      for (const frame of encodeBinaryFrames(MessageType.putSourceCode, payload)) {
        const sent = now()
        socket!.send(frame)
        if (!(await waitFor(sent, 'ack', ACK_TIMEOUT_MS))) throw new Error('chunk ack timed out')
      }
    }

    const uploads: Array<Record<string, unknown>> = []
    const ids: string[] = []
    let blobBytes = 0
    let frames = 0
    for (let index = 0; index < args.count; index += 1) {
      const pattern = { id: makeProgramId(), name: `${args.prefix}${String(index + 1).padStart(2, '0')}` }
      const blob = encodePbp({ ...pattern, sourceCode, byteCode })
      blobBytes = blob.length
      frames = encodeBinaryFrames(MessageType.putSourceCode, new Uint8Array(17 + blob.length)).length
      const record: Record<string, unknown> = { name: pattern.name }
      const started = now()
      // pushPattern lists before every Save; a rejected list fails the job unsent.
      const preList = await listWithin(args.listTimeoutMs)
      record.preListMs = preList.ms
      if (!preList.programs) {
        record.result = 'pre-list timed out; not sent'
        uploads.push(record)
        progress(`${pattern.name}: pre-list timed out`)
        continue
      }
      appendFileSync(args.manifest, `${JSON.stringify(pattern)}\n`)
      ids.push(pattern.id)
      const sent = now()
      try {
        await sendSave(pattern.id, blob)
      } catch (error) {
        record.result = `send failed: ${(error as Error).message}`
      }
      record.sendMs = round(now() - sent)
      if (args.mode === 'single' && args.activate) {
        const activateStarted = now()
        conn.pushByteCode(byteCode, pattern)
        let active: string | undefined
        while (now() - activateStarted < ACTIVATION_TIMEOUT_MS) {
          try {
            active = (await Promise.race([
              conn.getConfig(),
              sleep(2000).then(() => ({ activeProgramId: undefined })),
            ])).activeProgramId
          } catch {
            active = undefined
          }
          if (active === pattern.id) break
          await sleep(250)
        }
        record.activationMs = active === pattern.id ? round(now() - activateStarted) : null
      }
      if (args.mode === 'single' || args.pacing !== 'none') {
        const completion = await waitFor(sent, 'saveProgramSourceFile', COMPLETION_TIMEOUT_MS)
        record.completionMs = completion ? round(completion.at - sent) : null
        record.completionValue = completion?.value
      }
      if (args.mode === 'single') {
        let listed = false
        for (let attempt = 0; attempt < 5 && !listed; attempt += 1) {
          const read = await listWithin(args.listTimeoutMs)
          listed = Boolean(read.programs?.some((program) => program.id === pattern.id))
          if (!listed) await sleep(1000)
        }
        record.listed = listed
      }
      const ended = now()
      record.acks = inbound.filter((f) => f.at >= sent && f.at <= ended && f.kind === 'ack').length
      record.maxGapMs = round(maxInboundGapMs(inbound.map((f) => f.at), started, ended))
      record.ideWatchdogWouldFire = (record.maxGapMs as number) > IDE_WATCHDOG_MS
      uploads.push(record)
      progress(`${pattern.name}: ${JSON.stringify(record)}`)
      if (args.mode === 'single') await sleep(args.settleMs)
    }

    // Burst read-back: once, after the run, with time for the Controller to drain.
    const burstEnd = now()
    let finalRead: ProgramListEntry[] | null = null
    let finalReadMs = 0
    for (let attempt = 0; attempt < 6 && !finalRead; attempt += 1) {
      const read = await listWithin(15_000)
      finalRead = read.programs
      finalReadMs += read.ms
    }
    const runMaxGapMs = round(maxInboundGapMs(inbound.map((f) => f.at), opened, now()))
    const readBack = finalRead ? compareReadBack(starting, finalRead, ids) : null

    // Restore: starting active Pattern (volatile), then delete only our uploads.
    if (args.activate && startingActive) {
      conn.setActiveProgram(startingActive, false)
      await sleep(1000)
    }
    const present = new Set((finalRead ?? []).map((program) => program.id))
    for (const id of ids.filter((candidate) => present.has(candidate) || !finalRead)) {
      conn.deleteProgram(id)
      await sleep(500)
    }
    await sleep(args.settleMs)
    const afterCleanup = await conn.listPrograms()
    await sleep(args.settleMs)
    const later = await conn.listPrograms()
    const startingKeys = starting.map(key)
    const matches = (read: ProgramListEntry[]) =>
      read.length === startingKeys.length && read.every((program) => startingKeys.includes(key(program)))
    const restoredConfig = await conn.getConfig().catch(() => null)

    console.log(JSON.stringify({
      ip: IP,
      mode: args.mode,
      pacing: args.pacing,
      activate: args.activate,
      count: args.count,
      pattern: args.pattern,
      blobBytes,
      frames,
      webUi,
      uploads,
      runMaxGapMs,
      finalReadMs,
      finalReadAfterRunMs: round(now() - burstEnd),
      readBack,
      restoredActive: restoredConfig?.activeProgramId === startingActive,
      afterCleanupMatchesStarting: matches(afterCleanup),
      laterMatchesStarting: matches(later),
    }, null, 2))
  } finally {
    // Close with 1000 first; conn.close() then only stops the keepalive.
    ;(socket as WebSocket | null)?.close(1000)
    conn.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
