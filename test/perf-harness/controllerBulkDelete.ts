// Bulk saved-Pattern delete timing on a test Controller (#1266).
//
// Uploads N throwaway saved Patterns named `<prefix><n>`, then deletes exactly
// those with one of two wire sequences and times it:
//
//   per-delete  the pre-#1266 bulk path: the single-delete check per Pattern
//               (list, getConfig, deleteProgram, list), then one refresh list.
//   batch       the #1266 path: list and getConfig once, N deleteProgram sends,
//               one final list that confirms them all.
//
// After the sequence it reads the list again after a pause, independently of
// the timed read, and checks that both reads hold exactly the starting list.
// It refuses to start when the Controller already lists a Pattern with the
// prefix, and it deletes only ids it uploaded in this run. Each upload's id and
// name is appended to --manifest before it is sent; `cleanup` deletes only
// manifest entries the Controller still lists under the recorded name.
//
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/controllerBulkDelete.ts --mode batch --count 20 --manifest /tmp/run.jsonl
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/controllerBulkDelete.ts --mode cleanup --manifest /tmp/run.jsonl
//
// Fidelity: this talks to the Controller directly over PixelblazeConnection. It
// omits the app's extension relay, store and managed metadata cleanup, so it
// measures the wire sequence, not the dialog. HUMAN-IN-THE-LOOP, OUT-OF-BAND:
// needs a physical Pixelblaze on the LAN; never part of a commit gate.

import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import WebSocket from 'ws'
import {
  PixelblazeConnection,
  type ProgramListEntry,
  type WebSocketLike,
} from '../../src/engine/PixelblazeConnection'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { encodePbp } from '../../src/engine/pbpEncode'
import { fetchWebUI, makeDeviceCompiler } from './deviceCompiler'

const IP = process.env.PIXELBLAZE_IP
const SOURCE = 'export function render(index) { rgb(0, 0, 0) }\n'

type Mode = 'per-delete' | 'batch' | 'cleanup'
const progress = (message: string) => console.error(`[${new Date().toISOString()}] ${message}`)

function parseArgs(argv: string[]) {
  const value = (flag: string, fallback: string) => {
    const index = argv.indexOf(flag)
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
  }
  const mode = value('--mode', '') as Mode
  if (mode !== 'per-delete' && mode !== 'batch' && mode !== 'cleanup') throw new Error('--mode per-delete|batch|cleanup is required')
  const count = Number(value('--count', '20'))
  if (!Number.isInteger(count) || count < 1 || count > 40) throw new Error('--count must be 1..40')
  const manifest = value('--manifest', '')
  if (!manifest) throw new Error('--manifest <path> is required')
  if (mode !== 'cleanup' && existsSync(manifest)) throw new Error(`--manifest ${manifest} already exists; use a new path`)
  return { mode, count, manifest, prefix: value('--prefix', 'zz-1266-tmp-'), settleMs: Number(value('--settle', '3000')) }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const key = (program: ProgramListEntry) => `${program.id}\t${program.name}`

async function timed<T>(log: { step: string; ms: number }[], step: string, run: () => Promise<T> | T): Promise<T> {
  const started = performance.now()
  progress(step)
  const result = await run()
  log.push({ step, ms: Math.round(performance.now() - started) })
  return result
}

async function main(): Promise<void> {
  if (!IP) throw new Error('set PIXELBLAZE_IP to the test Controller')
  const { mode, count, manifest, prefix, settleMs } = parseArgs(process.argv.slice(2))
  const compile = makeDeviceCompiler(await fetchWebUI(IP))
  const byteCode = compile(SOURCE)

  let socket: WebSocket | null = null
  const conn = new PixelblazeConnection({
    host: IP,
    webSocketFactory: (url: string): WebSocketLike => {
      socket = new WebSocket(url)
      return socket as unknown as WebSocketLike
    },
    requestTimeoutMs: 15000,
  })
  conn.on('error', (error) => console.error('socket error:', error))
  await conn.connect()
  try {
    const starting = await conn.listPrograms()
    progress(`starting list: ${starting.length} Patterns`)
    if (mode === 'cleanup') {
      // Removes leftovers of an interrupted run: only uploads its manifest recorded.
      const recorded = new Set(readFileSync(manifest, 'utf8').split('\n').filter(Boolean)
        .map((line) => key(JSON.parse(line) as ProgramListEntry)))
      const leftovers = starting.filter((program) => recorded.has(key(program)))
      for (const program of leftovers) {
        conn.deleteProgram(program.id)
        progress(`cleanup sent ${program.name}`)
        await sleep(500)
      }
      await sleep(settleMs)
      const after = await conn.listPrograms()
      const expected = starting.filter((program) => !leftovers.includes(program)).map(key)
      console.log(JSON.stringify({
        ip: IP, mode, before: starting.map(key), after: after.map(key),
        matchesExpected: after.length === expected.length && after.every((program) => expected.includes(key(program))),
      }, null, 2))
      return
    }
    const leftovers = starting.filter((program) => program.name.startsWith(prefix))
    if (leftovers.length > 0) throw new Error(`Controller already lists ${leftovers.length} "${prefix}" Patterns; refusing`)
    const config = await conn.getConfig()
    if (config.runSequencer) throw new Error('Controller sequencer is running; refusing')

    const uploaded = Array.from({ length: count }, (_, index) => ({
      id: makeProgramId(),
      name: `${prefix}${String(index + 1).padStart(2, '0')}`,
    }))
    // Uploads are paced one at a time; they are setup, not the measurement.
    let listed: ProgramListEntry[] = []
    for (const pattern of uploaded) {
      appendFileSync(manifest, `${JSON.stringify(pattern)}\n`)
      conn.saveProgram(pattern.id, encodePbp({ ...pattern, sourceCode: SOURCE, byteCode }))
      await sleep(300)
      for (let attempt = 0; attempt < 10; attempt += 1) {
        listed = await conn.listPrograms()
        if (listed.some((program) => program.id === pattern.id)) break
        await sleep(500)
      }
      progress(`uploaded ${pattern.name}`)
    }
    const missingUploads = uploaded.filter(({ id }) => !listed.some((program) => program.id === id))
    if (missingUploads.length > 0) throw new Error(`${missingUploads.length} uploads never listed`)
    await sleep(settleMs)

    const steps: { step: string; ms: number }[] = []
    const started = performance.now()
    let sendsDoneMs = 0
    let finalRead: ProgramListEntry[]
    if (mode === 'per-delete') {
      for (const pattern of uploaded) {
        await timed(steps, 'list-before', () => conn.listPrograms())
        await timed(steps, 'getConfig', () => conn.getConfig())
        await timed(steps, 'deleteProgram', () => conn.deleteProgram(pattern.id))
        await timed(steps, 'list-after', () => conn.listPrograms())
      }
      sendsDoneMs = performance.now() - started
      finalRead = await timed(steps, 'refresh-list', () => conn.listPrograms())
    } else {
      await timed(steps, 'list-before', () => conn.listPrograms())
      await timed(steps, 'getConfig', () => conn.getConfig())
      for (const pattern of uploaded) await timed(steps, 'deleteProgram', () => conn.deleteProgram(pattern.id))
      sendsDoneMs = performance.now() - started
      finalRead = await timed(steps, 'final-list', () => conn.listPrograms())
    }
    const totalMs = performance.now() - started

    await sleep(settleMs)
    const later = await conn.listPrograms()
    const uploadedIds = new Set(uploaded.map(({ id }) => id))
    const stillListedImmediately = uploaded.filter(({ id }) => finalRead.some((program) => program.id === id))
    const stillListedLater = uploaded.filter(({ id }) => later.some((program) => program.id === id))
    const startingKeys = new Set(starting.map(key))
    // Each read, timed and delayed, must hold exactly the starting list.
    const compare = (read: ProgramListEntry[]) => {
      const keys = new Set(read.filter(({ id }) => !uploadedIds.has(id)).map(key))
      return {
        untouchedMissing: starting.filter((program) => !keys.has(key(program))),
        unexpected: read.filter((program) => !uploadedIds.has(program.id) && !startingKeys.has(key(program))),
      }
    }
    const immediate = compare(finalRead)
    const delayed = compare(later)
    const matches = (stillListed: unknown[], diff: ReturnType<typeof compare>) =>
      stillListed.length === 0 && diff.untouchedMissing.length === 0 && diff.unexpected.length === 0

    const byStep = new Map<string, number[]>()
    for (const { step, ms } of steps) byStep.set(step, [...(byStep.get(step) ?? []), ms])
    console.log(JSON.stringify({
      ip: IP, mode, count, startingCount: starting.length,
      totalMs: Math.round(totalMs), sendsDoneMs: Math.round(sendsDoneMs),
      steps: Object.fromEntries([...byStep].map(([step, values]) => [step, {
        calls: values.length,
        totalMs: values.reduce((sum, ms) => sum + ms, 0),
        meanMs: Math.round(values.reduce((sum, ms) => sum + ms, 0) / values.length),
      }])),
      stillListedImmediately: stillListedImmediately.map(({ name }) => name),
      stillListedLater: stillListedLater.map(({ name }) => name),
      immediate, delayed,
      immediateMatchesStarting: matches(stillListedImmediately, immediate),
      delayedMatchesStarting: matches(stillListedLater, delayed),
    }, null, 2))
  } finally {
    ;(socket as WebSocket | null)?.close(1000, 'done')
    conn.close()
  }
}

main().catch((error) => {
  console.error('controllerBulkDelete failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
