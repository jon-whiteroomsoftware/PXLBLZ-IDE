// IDE-path Controller Save probe on a test Controller (#1268).
//
// Runs the production ExtensionControllerProvider (1 s ping, 4000 ms liveness
// watchdog, reconnect loop) and the production `pushPattern` Save against a real
// Controller, through a Node relay that stands in for extension/background.js:
// it opens the ws://<ip>:81 socket and, like the helper, re-downloads the
// Controller's compiler for every compile. Every provider status change and every
// Save outcome is logged with its time, so a drop shows as `connecting`.
//
//   editor     N editor Saves of one Pattern (save, activate), each read back.
//   reconcile  N Patterns saved back to back with activateOnSave: false, as
//              background reconciliation sends them, then one read-back.
//   poll       no Saves: hold the socket for --seconds (default 215) with the
//              panel poll on, timing a listPrograms every 10 s (idle control).
//   --stop-on-timeout  editor mode: end the Saves and the poll at the first
//              Save or read-back that fails with a request timeout, then keep
//              listing every 3 s for up to --recover-seconds (default 120) to
//              record whether the Controller recovers on the same socket.
//   --panel-poll  also run the open Controller panel's poll during the run:
//              getConfig, getTelemetry and getVars every 1000 ms with no
//              in-flight guard (controllerPanelStore CONTROLLER_POLL_INTERVAL_MS),
//              reporting failures, latency and the active ids it saw.
//
// Safety: refuses when the prefix is already listed or the sequencer runs;
// appends each created program id to --manifest; restores the starting active
// Pattern (volatile) and deletes only created ids; compares the final list with
// the starting one. One socket, closed with code 1000 on exit.
//
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/controllerSaveIdeProbe.ts --mode editor --count 10 --manifest /tmp/x.jsonl
//
// Fidelity: omits Chrome, the MV3 service worker, the store and the dialog. The
// preview JPEG is --preview bytes of random data. HUMAN-IN-THE-LOOP: needs a
// physical Pixelblaze; never part of a commit gate.

import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import { ExtensionControllerProvider } from '../../src/engine/ExtensionControllerProvider'
import { RELAY_SOURCE, base64ToBytes, bytesToBase64, type RelayMessage, type RelayTransport } from '../../src/engine/RelayWebSocket'
import { pushPattern } from '../../src/engine/pushPattern'
import { fetchControllerCompiler, sleep } from './controllerHardware'
import { compareReadBack, sourcePadding } from './controllerSaveProbeCore'

const HERE = dirname(fileURLToPath(import.meta.url))
const IP = process.env.PIXELBLAZE_IP
const t0 = performance.now()
const at = () => Math.round(performance.now() - t0)
const log = (message: string) => console.error(`[+${at()}ms] ${message}`)

/** A stock Pattern name, or a .js path (the #1268 load Pattern). */
const readPattern = (name: string) =>
  readFileSync(name.endsWith('.js') ? name : join(HERE, '../../src/pixelblaze/stock/patterns', `${name}.js`), 'utf8')

function arg(argv: string[], flag: string, fallback: string): string {
  const index = argv.indexOf(flag)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}

/** Node stand-in for the helper's service worker (extension/background.js). */
function nodeRelay(ip: string) {
  const listeners = new Set<(message: RelayMessage) => void>()
  const sockets = new Map<string, WebSocket>()
  const counters = { compiles: 0, compileMs: [] as number[], closesByDevice: [] as Array<{ at: number; code: number }> }
  const emit = (message: RelayMessage) => listeners.forEach((listener) => listener(message))
  const transport: RelayTransport = {
    post(msg) {
      if (msg.type === 'detect') return void queueMicrotask(() => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'detect-ack' }))
      if (msg.type === 'connect') {
        const ws = new WebSocket(msg.url)
        ws.binaryType = 'arraybuffer'
        sockets.set(msg.connId, ws)
        ws.on('open', () => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId: msg.connId }))
        ws.on('message', (data, isBinary) => emit({
          source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId: msg.connId,
          payload: isBinary ? { binary: bytesToBase64(new Uint8Array(data as ArrayBuffer)) } : { text: data.toString() },
        }))
        ws.on('close', (code) => {
          sockets.delete(msg.connId)
          counters.closesByDevice.push({ at: at(), code })
          emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId, code })
        })
        ws.on('error', (error) => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: error.message }))
        return
      }
      if (msg.type === 'send') {
        const ws = sockets.get(msg.connId)
        if (ws?.readyState !== WebSocket.OPEN) return
        ws.send('binary' in msg.payload ? base64ToBytes(msg.payload.binary) : msg.payload.text)
        return
      }
      if (msg.type === 'close') {
        log(`page closed socket ${msg.connId}`)
        sockets.get(msg.connId)?.close(1000)
        return
      }
      if (msg.type === 'compile') {
        const started = performance.now()
        counters.compiles += 1
        void fetchControllerCompiler(ip).then(
          (compile) => {
            counters.compileMs.push(Math.round(performance.now() - started))
            let bytecode: string
            try {
              bytecode = bytesToBase64(compile(msg.patternSrc))
            } catch (error) {
              return emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'compile-result', reqId: msg.reqId, ok: false, error: (error as Error).message })
            }
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'compile-result', reqId: msg.reqId, ok: true, bytecode })
          },
          (error: Error) => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'compile-result', reqId: msg.reqId, ok: false, error: error.message }),
        )
        return
      }
      if (msg.type === 'get-wifi-status') {
        return void queueMicrotask(() => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'wifi-status', reqId: msg.reqId, ok: true, status: {} }))
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const closeAll = () => sockets.forEach((ws) => ws.close(1000))
  return { transport, counters, closeAll }
}

async function main(): Promise<void> {
  if (!IP) throw new Error('set PIXELBLAZE_IP to the test Controller')
  const argv = process.argv.slice(2)
  const mode = arg(argv, '--mode', '')
  if (mode !== 'editor' && mode !== 'reconcile' && mode !== 'poll') throw new Error('--mode editor|reconcile|poll')
  const seconds = Number(arg(argv, '--seconds', '215'))
  const stopOnTimeout = argv.includes('--stop-on-timeout')
  const recoverSeconds = Number(arg(argv, '--recover-seconds', '120'))
  const count = Number(arg(argv, '--count', mode === 'editor' ? '10' : '20'))
  const manifest = arg(argv, '--manifest', '')
  if (!manifest || existsSync(manifest)) throw new Error('--manifest <new path> is required')
  const prefix = arg(argv, '--prefix', 'zz-1268-tmp-')
  const previewBytes = Number(arg(argv, '--preview', '8000'))
  const patterns = arg(argv, '--patterns', 'LumaSpiral').split(',')
  // Trailing-comment padding (no bytecode change) to model large Show artifacts.
  const pad = Number(arg(argv, '--pad', '0'))

  // Refuse before any upload when a chosen Pattern does not compile on this Controller.
  const precompile = await fetchControllerCompiler(IP)
  for (const name of patterns) {
    try {
      precompile(readPattern(name))
    } catch (error) {
      throw new Error(`${name} does not compile on this Controller: ${(error as Error).message}`)
    }
  }

  const relay = nodeRelay(IP)
  const provider = new ExtensionControllerProvider({ transport: relay.transport })
  const statuses: Array<{ at: number; kind: string; message?: string }> = []
  provider.subscribe((status) => {
    const entry = { at: at(), kind: status.kind, ...('message' in status ? { message: String(status.message) } : {}) }
    statuses.push(entry)
    log(`status ${entry.kind}${entry.message ? `: ${entry.message}` : ''}`)
  })

  await provider.connect({ address: IP })
  const created = new Set<string>()

  // The panel's 1 Hz poll, as controllerPanelStore.poll sends it.
  const panel = {
    polls: 0,
    configOk: 0,
    maxConfigMs: 0,
    errors: {} as Record<string, number>,
    activeSeen: [] as Array<{ at: number; active?: string; ms: number }>,
  }
  const failed = (what: string) => (error: Error) => {
    const message = `${what}: ${error.message.replace(/[0-9]+ms/g, 'Nms')}`
    panel.errors[message] = (panel.errors[message] ?? 0) + 1
  }
  let pollTimer: ReturnType<typeof setInterval> | null = argv.includes('--panel-poll') || mode === 'poll'
    ? setInterval(() => {
      panel.polls += 1
      const sent = performance.now()
      void provider.getConfig().then((config) => {
        const ms = Math.round(performance.now() - sent)
        panel.configOk += 1
        panel.maxConfigMs = Math.max(panel.maxConfigMs, ms)
        const last = panel.activeSeen.at(-1)
        if (last?.active !== config.activeProgramId) panel.activeSeen.push({ at: at(), active: config.activeProgramId, ms })
      }, failed('getConfig'))
      void provider.getTelemetry().catch(failed('getTelemetry'))
      void provider.getVars().catch(failed('getVars'))
    }, 1000)
    : null
  try {
    const starting = await provider.listPrograms()
    log(`starting list: ${starting.length}`)
    if (starting.some((program) => program.name.startsWith(prefix))) throw new Error(`"${prefix}" already listed; refusing`)
    const config = await provider.getConfig()
    if (config.runSequencer) throw new Error('sequencer running; refusing')
    const startingActive = config.activeProgramId

    let bindings = {}
    let records = {}
    const sources = patterns.map((name) => readPattern(name) + sourcePadding(pad))
    const saves: Array<Record<string, unknown>> = []
    const save = async (index: number, patternId: string, activate: boolean) => {
      const name = `${prefix}${String(index + 1).padStart(2, '0')}`
      const started = performance.now()
      const record: Record<string, unknown> = { name, startedAt: at() }
      try {
        const result = await pushPattern({
          provider,
          controllerId: IP,
          patternId,
          source: sources[index % sources.length],
          name,
          persist: true,
          activateOnSave: activate,
          previewImage: new Uint8Array(randomBytes(previewBytes)),
          loadBindings: async () => bindings,
          saveBindings: async (next) => { bindings = next },
          loadPushRecords: async () => records,
          savePushRecords: async (next) => { records = next },
          mintId: undefined,
          onCompiledArtifact: () => undefined,
        })
        if (!created.has(result.programId)) appendFileSync(manifest, `${JSON.stringify({ id: result.programId, name })}\n`)
        created.add(result.programId)
        record.programId = result.programId
        record.ok = true
      } catch (error) {
        record.ok = false
        record.error = (error as Error).message
      }
      record.ms = Math.round(performance.now() - started)
      return record
    }

    const listTimings: Array<{ at: number; ms: number; error?: string }> = []
    const timedList = async () => {
      const sent = performance.now()
      const entry: { at: number; ms: number; error?: string } = { at: at(), ms: 0 }
      try {
        await provider.listPrograms()
      } catch (error) {
        entry.error = (error as Error).message
      }
      entry.ms = Math.round(performance.now() - sent)
      listTimings.push(entry)
      log(`list ${entry.error ? `failed: ${entry.error}` : 'ok'} ${entry.ms}ms`)
      return !entry.error
    }
    let stoppedAt: number | null = null
    let recoveredAt: number | null = null
    if (mode === 'poll') {
      const until = performance.now() + seconds * 1000
      while (performance.now() < until) {
        await timedList()
        await sleep(10000)
      }
    } else if (mode === 'editor') {
      for (let index = 0; index < count; index += 1) {
        const record = await save(0, 'ide-probe-pattern-1', true)
        let listed: boolean | null = null
        try {
          const read = await provider.listPrograms()
          listed = read.some((program) => program.id === record.programId)
        } catch (error) {
          record.readBackError = (error as Error).message
        }
        record.listed = listed
        saves.push(record)
        log(`save ${index + 1}: ${JSON.stringify(record)}`)
        const timedOut = [record.error, record.readBackError].some((message) => typeof message === 'string' && /timed? ?out/i.test(message))
        if (stopOnTimeout && timedOut) {
          stoppedAt = at()
          if (pollTimer) clearInterval(pollTimer)
          pollTimer = null
          log('stop-on-timeout: Saves and poll stopped; listing until recovery')
          const until = performance.now() + recoverSeconds * 1000
          while (performance.now() < until) {
            if (await timedList()) { recoveredAt = at(); break }
            await sleep(3000)
          }
          break
        }
        await sleep(2000)
      }
    } else {
      for (let index = 0; index < count; index += 1) {
        const record = await save(index, `ide-probe-pattern-${index + 1}`, false)
        saves.push(record)
        log(`save ${index + 1}: ${JSON.stringify(record)}`)
      }
    }

    await sleep(3000)
    let finalRead = null
    for (let attempt = 0; attempt < 6 && !finalRead; attempt += 1) {
      finalRead = await provider.listPrograms().catch((error: Error) => { log(`final list failed: ${error.message}`); return null })
      if (!finalRead) await sleep(3000)
    }
    const readBack = finalRead ? compareReadBack(starting, finalRead, [...created]) : null

    if (mode === 'editor' && startingActive) {
      await provider.setActiveProgram(startingActive, { save: false }).catch((error: Error) => log(`restore active failed: ${error.message}`))
      await sleep(1000)
    }
    for (const id of created) {
      await provider.deleteProgram(id).catch((error: Error) => log(`delete ${id} failed: ${error.message}`))
      await sleep(500)
    }
    await sleep(3000)
    const after = await provider.listPrograms()
    const key = (program: { id: string; name: string }) => `${program.id}\t${program.name}`
    const startingKeys = starting.map(key)
    const restoredConfig = await provider.getConfig().catch(() => null)
    console.log(JSON.stringify({
      ip: IP, mode, count, patterns, previewBytes, pad,
      saves,
      statuses,
      deviceCloses: relay.counters.closesByDevice,
      compiles: relay.counters.compiles,
      compileMs: relay.counters.compileMs,
      readBack,
      restoredActive: mode !== 'editor' || restoredConfig?.activeProgramId === startingActive,
      afterMatchesStarting: after.length === startingKeys.length && after.every((program) => startingKeys.includes(key(program))),
      panel: panel.polls ? panel : undefined,
      listTimings,
      stoppedAt,
      recoveredAt,
    }, null, 2))
  } finally {
    if (pollTimer) clearInterval(pollTimer)
    await provider.disconnect()
    relay.closeAll()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
