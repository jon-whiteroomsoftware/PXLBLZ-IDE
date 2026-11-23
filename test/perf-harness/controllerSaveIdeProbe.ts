// IDE-path Controller Save probe on a test Controller (#1268).
//
// Runs the production ExtensionControllerProvider (1 s ping, 4000 ms liveness
// watchdog, reconnect loop) and the production `pushPattern` Save against a real
// Controller, through a Node relay that stands in for extension/background.js:
// it opens the ws://<ip>:81 socket and, like the helper, re-downloads the
// Controller's compiler for every compile. Every provider status change and every
// Save outcome is logged with its time, so a drop shows as `connecting`.
// Logs the final source frame's socket write, the firmware acknowledgement, the
// provider Save return, the push-record write and the queued editor Save return.
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
//   --panel-store  instead of --panel-poll, run the production controllerPanelStore
//              (start(ip): its 1000 ms poll with the in-flight guard and the
//              write-queue pause) and queue each Save through the production
//              device write queue, as the IDE does (#1268 slice 1). Every poll
//              request's reply time is recorded, with the peak number of poll
//              requests outstanding at once. Reads back the active id after each
//              Save, along with its Saved list entry. Run the store's Vite globs
//              through Vite's module runner: node test/perf-harness/
//              controllerSaveViteRun.mjs test/perf-harness/controllerSaveIdeProbe.ts ...
//   --induce failed-after-store:N | unconfirmed:N  (with --panel-store) make
//              editor Save N (1-based) fail after its PBP frames were sent, or
//              report activation unconfirmed right after its bytecode was sent.
//              The failed Save then runs the store's rereadAfterFailedWrite and
//              compares the panel's Saved list and active Pattern with a direct
//              read of the Controller.
//
// Safety: refuses when the prefix is already listed or the sequencer runs;
// appends each created program id to --manifest; restores the starting active
// Pattern (volatile) and deletes only created ids; compares the final list with
// the starting one. One socket, closed with code 1000 on exit.
//
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/controllerSaveIdeProbe.ts --mode editor --count 10 --manifest /tmp/x.jsonl
//
// Fidelity: uses a Node relay and in-memory push records in place of Chrome,
// the MV3 service worker, the editor dialog and workspace persistence. The
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
import { ControllerActivationTimeoutError } from '../../src/engine/PixelblazeConnection'
import { queueControllerDeviceWrite } from '../../src/engine/controllerDeviceWriteQueue'
import { setControllerProvider } from '../../src/engine/controllerProviderRegistry'
import type { ControllerPushRecords } from '../../src/engine/controllerPushRecord'
import { fetchControllerCompiler, sleep } from './controllerHardware'
import { compareReadBack, isFinalSaveFrame, readSaveAcknowledgement, sourcePadding } from './controllerSaveProbeCore'

const HERE = dirname(fileURLToPath(import.meta.url))
const IP = process.env.PIXELBLAZE_IP
const t0 = performance.now()
const traceAt = () => performance.now() - t0
const at = () => Math.round(traceAt())
const log = (message: string) => console.error(`[+${at()}ms] ${message}`)

/** A stock Pattern name, or a .js path (the #1268 load Pattern). */
const readPattern = (name: string) =>
  readFileSync(name.endsWith('.js') ? name : join(HERE, '../../src/pixelblaze/stock/patterns', `${name}.js`), 'utf8')

function arg(argv: string[], flag: string, fallback: string): string {
  const index = argv.indexOf(flag)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}

type SaveWireEvent =
  | { kind: 'frames-sent' }
  | { kind: 'frame-send-error'; error: string }
  | { kind: 'save-ack'; acknowledged: boolean }

/** Node stand-in for the helper's service worker (extension/background.js). */
function nodeRelay(ip: string) {
  const listeners = new Set<(message: RelayMessage) => void>()
  const sockets = new Map<string, WebSocket>()
  const counters = { compiles: 0, compileMs: [] as number[], closesByDevice: [] as Array<{ at: number; code: number }> }
  const saveWire: Array<SaveWireEvent & { at: number; connId: string }> = []
  const noteSaveWire = (connId: string, event: SaveWireEvent) => {
    const entry = { at: traceAt(), connId, ...event }
    saveWire.push(entry)
    log(`save wire: ${JSON.stringify(entry)}`)
  }
  const emit = (message: RelayMessage) => listeners.forEach((listener) => listener(message))
  const transport: RelayTransport = {
    post(msg) {
      if (msg.type === 'detect') return void queueMicrotask(() => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'detect-ack' }))
      if (msg.type === 'connect') {
        if (sockets.size > 0) {
          const message = 'Previous probe socket has not closed; refusing another connection'
          log(message)
          emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message })
          return
        }
        const ws = new WebSocket(msg.url)
        ws.binaryType = 'arraybuffer'
        sockets.set(msg.connId, ws)
        ws.on('open', () => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId: msg.connId }))
        ws.on('message', (data, isBinary) => {
          const payload = isBinary
            ? { binary: bytesToBase64(new Uint8Array(data as ArrayBuffer)) }
            : { text: data.toString() }
          if (payload.text !== undefined) {
            const acknowledged = readSaveAcknowledgement(payload.text)
            if (acknowledged !== undefined) noteSaveWire(msg.connId, { kind: 'save-ack', acknowledged })
          }
          emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId: msg.connId, payload })
        })
        ws.on('close', (code) => {
          sockets.delete(msg.connId)
          counters.closesByDevice.push({ at: at(), code })
          log(`socket ${msg.connId} closed with code ${code}`)
          emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId, code })
        })
        ws.on('error', (error) => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: error.message }))
        return
      }
      if (msg.type === 'send') {
        const ws = sockets.get(msg.connId)
        if (ws?.readyState !== WebSocket.OPEN) return
        const payload = 'binary' in msg.payload ? base64ToBytes(msg.payload.binary) : msg.payload.text
        if (typeof payload === 'string' || !isFinalSaveFrame(payload)) {
          ws.send(payload)
          return
        }
        ws.send(payload, (error) => {
          noteSaveWire(msg.connId, error ? { kind: 'frame-send-error', error: error.message } : { kind: 'frames-sent' })
        })
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
  return { transport, counters, saveWire, closeAll }
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
  const panelStore = argv.includes('--panel-store')
  if (panelStore && (argv.includes('--panel-poll') || mode !== 'editor')) throw new Error('--panel-store needs --mode editor and no --panel-poll')
  const [induceKind, induceAt] = arg(argv, '--induce', ':').split(':')
  const induceIndex = induceAt ? Number(induceAt) - 1 : -1
  if (induceKind && induceKind !== 'failed-after-store' && induceKind !== 'unconfirmed') throw new Error('--induce failed-after-store:N|unconfirmed:N')
  if (induceKind && !panelStore) throw new Error('--induce needs --panel-store')

  // Refuse before any upload when a chosen Pattern does not compile on this Controller.
  const precompile = await fetchControllerCompiler(IP)
  for (const name of patterns) {
    try {
      precompile(readPattern(name))
    } catch (error) {
      throw new Error(`${name} does not compile on this Controller: ${(error as Error).message}`, { cause: error })
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
  // The production panel store, polling through the production provider (#1268).
  const storePoll = {
    requests: 0,
    outstanding: 0,
    peakOutstanding: 0,
    replies: [] as Array<{ at: number; method: string; ms: number; error?: string }>,
    // Every listPrograms reply (store refreshes and the probe's own reads), so a
    // re-read whose list read failed is told apart from a stale one.
    lists: [] as Array<{ at: number; ms: number; error?: string }>,
  }
  let panelStoreModule: typeof import('../../src/store/controllerPanelStore') | null = null
  try {
    const starting = await provider.listPrograms()
    log(`starting list: ${starting.length}`)
    if (starting.some((program) => program.name.startsWith(prefix))) throw new Error(`"${prefix}" already listed; refusing`)
    const config = await provider.getConfig()
    if (config.runSequencer) throw new Error('sequencer running; refusing')
    const startingActive = config.activeProgramId
    if (mode === 'editor' && !startingActive) throw new Error('starting active Pattern unavailable; refusing')

    if (panelStore) {
      // Time the three poll reads. Activation confirmation reads go straight to
      // the connection and the probe's own reads use listPrograms, so these
      // counters see the panel poll and the store's re-read only.
      const originalList = provider.listPrograms.bind(provider)
      provider.listPrograms = async () => {
        const sent = performance.now()
        try {
          const programs = await originalList()
          storePoll.lists.push({ at: at(), ms: Math.round(performance.now() - sent) })
          return programs
        } catch (error) {
          storePoll.lists.push({ at: at(), ms: Math.round(performance.now() - sent), error: (error as Error).message.replace(/[0-9]+ms/g, 'Nms') })
          throw error
        }
      }
      for (const method of ['getConfig', 'getTelemetry', 'getVars'] as const) {
        const original = (provider[method] as () => Promise<unknown>).bind(provider)
        ;(provider as unknown as Record<string, () => Promise<unknown>>)[method] = async () => {
          storePoll.requests += 1
          storePoll.outstanding += 1
          storePoll.peakOutstanding = Math.max(storePoll.peakOutstanding, storePoll.outstanding)
          const sent = performance.now()
          try {
            const value = await original()
            storePoll.replies.push({ at: at(), method, ms: Math.round(performance.now() - sent) })
            return value
          } catch (error) {
            storePoll.replies.push({ at: at(), method, ms: Math.round(performance.now() - sent), error: (error as Error).message.replace(/[0-9]+ms/g, 'Nms') })
            throw error
          } finally {
            storePoll.outstanding -= 1
          }
        }
      }
      setControllerProvider(provider)
      panelStoreModule = await import('../../src/store/controllerPanelStore')
      panelStoreModule.useControllerPanelStore.getState().start(IP)
      log('panel store started (production poll)')
    }

    let bindings = {}
    let records: ControllerPushRecords = {}
    const sources = patterns.map((name) => readPattern(name) + sourcePadding(pad))
    const saves: Array<Record<string, unknown>> = []
    // `attempt` is the 0-based Save number --induce matches; editor mode saves
    // the same Pattern (index 0) every time.
    const save = async (index: number, patternId: string, activate: boolean, attempt = index) => {
      const name = `${prefix}${String(index + 1).padStart(2, '0')}`
      const started = performance.now()
      const record: Record<string, unknown> = { name, startedAt: at() }
      const induce = panelStore && attempt === induceIndex ? induceKind : ''
      // Always wrapped, so a Save's id reaches the manifest before activation can
      // fail; the induced failures apply only to the --induce Save.
      // Every other method runs bound to the real provider, so its state (compile
      // request ids, the known active bytecode) carries from one Save to the next
      // instead of landing on a per-Save prototype copy.
      const overrides: Partial<typeof provider> = {
        saveProgram: async (blob: Uint8Array, opts: { id: string }) => {
          if (!created.has(opts.id)) appendFileSync(manifest, `${JSON.stringify({ id: opts.id, name })}\n`)
          created.add(opts.id)
          record.programId = opts.id
          const payloadBytes = new TextEncoder().encode(opts.id).byteLength + blob.byteLength
          record.payloadBytes = payloadBytes
          record.deadlineMs = 10_000 + 100 * Math.ceil(payloadBytes / 1024)
          record.saveProgramStartedAt = traceAt()
          const completion = await provider.saveProgram(blob, opts)
          record.saveProgramReturnedAt = traceAt()
          record.saveProgramResult = completion
          if (induce === 'failed-after-store') throw new Error('induced failure after the PBP Save returned')
          return completion
        },
        pushBytecode: async (bytecode: Uint8Array, opts: { id: string; name?: string }) => {
          if (induce !== 'unconfirmed') return provider.pushBytecode(bytecode, opts)
          // Send for real, but stop waiting at once: the Controller decides.
          void provider.pushBytecode(bytecode, opts).catch(() => undefined)
          throw new ControllerActivationTimeoutError('induced: activation not confirmed')
        },
      }
      const deviceProvider = new Proxy(provider, {
        get(target, key) {
          if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key as keyof typeof overrides]
          const value = Reflect.get(target, key, target) as unknown
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
        },
      })
      const run = <T,>(write: () => Promise<T>) => (panelStore ? queueControllerDeviceWrite(IP, write) : write())
      try {
        const result = await run(() => pushPattern({
          provider: deviceProvider,
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
          savePushRecords: async (next) => {
            records = next
            record.pushRecordedAt = traceAt()
            record.pushRecord = records[IP]?.[patternId] ?? null
          },
          mintId: undefined,
          onCompiledArtifact: () => undefined,
        }))
        record.pushPatternReturnedAt = traceAt()
        if (result.save) record.save = result.save
        if (result.activation) record.activation = result.activation
        if (!created.has(result.programId)) appendFileSync(manifest, `${JSON.stringify({ id: result.programId, name })}\n`)
        created.add(result.programId)
        record.programId = result.programId
        record.ok = true
      } catch (error) {
        record.ok = false
        record.error = (error as Error).message
      }
      record.ms = Math.round(performance.now() - started)
      if (panelStoreModule && (record.ok === false || record.save === 'unconfirmed' || record.activation === 'unconfirmed')) {
        // The IDE's failure path (#1268): one re-read once the queue is idle, then
        // compare what the panel shows with a direct read of the Controller.
        const panelState = () => panelStoreModule!.useControllerPanelStore.getState()
        const before = { active: panelState().activeProgramId, ids: panelState().programs.map((program) => program.id).sort() }
        const listsBefore = storePoll.lists.length
        await panelStoreModule.useControllerPanelStore.getState().rereadAfterFailedWrite(IP)
        const rereadLists = storePoll.lists.slice(listsBefore)
        const after = { active: panelState().activeProgramId, ids: panelState().programs.map((program) => program.id).sort() }
        // A failed direct read is recorded as unavailable and never counts as a match.
        const directConfig = await provider.getConfig().catch(() => null)
        const directList = await provider.listPrograms().catch(() => null)
        const direct = {
          active: directConfig ? directConfig.activeProgramId : 'unavailable',
          ids: directList ? directList.map((program) => program.id).sort() : 'unavailable',
        }
        record.reread = {
          before,
          after,
          direct,
          rereadLists,
          activeMatches: directConfig !== null && after.active === direct.active,
          listMatches: directList !== null && JSON.stringify(after.ids) === JSON.stringify(direct.ids),
        }
      }
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
        const record = await save(0, 'ide-probe-pattern-1', true, index)
        let listed: boolean | null = null
        try {
          const read = await provider.listPrograms()
          const saved = read.find((program) => program.id === record.programId)
          record.listedName = saved?.name ?? null
          listed = saved !== undefined && saved.name === record.name
        } catch (error) {
          record.readBackError = (error as Error).message
        }
        record.listed = listed
        if (panelStore) {
          try {
            const active = await provider.getConfig()
            record.activeReadBackId = active.activeProgramId || null
            record.activeMatches = !!active.activeProgramId && active.activeProgramId === record.programId
          } catch (error) {
            record.activeReadBackError = (error as Error).message
          }
        }
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

    panelStoreModule?.useControllerPanelStore.getState().stop()
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
      saveWire: relay.saveWire,
      statuses,
      deviceCloses: relay.counters.closesByDevice,
      compiles: relay.counters.compiles,
      compileMs: relay.counters.compileMs,
      readBack,
      startingActive,
      restoredActiveId: restoredConfig?.activeProgramId,
      restoredActive: mode !== 'editor' || restoredConfig?.activeProgramId === startingActive,
      afterMatchesStarting: after.length === startingKeys.length && after.every((program) => startingKeys.includes(key(program))),
      panel: panel.polls ? panel : undefined,
      panelStore: panelStore ? {
        requests: storePoll.requests,
        peakOutstanding: storePoll.peakOutstanding,
        timeouts: storePoll.replies.filter((reply) => reply.error).length,
        maxReplyMs: Math.max(0, ...storePoll.replies.map((reply) => reply.ms)),
        replies: storePoll.replies,
        lists: storePoll.lists,
      } : undefined,
      listTimings,
      stoppedAt,
      recoveredAt,
    }, null, 2))
  } finally {
    if (pollTimer) clearInterval(pollTimer)
    panelStoreModule?.useControllerPanelStore.getState().stop()
    await provider.disconnect()
    relay.closeAll()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
