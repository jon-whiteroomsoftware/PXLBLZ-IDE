/** Explicit, operator-run hardware diagnostic. Never imported by a suite. */
import { chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createInterface } from 'node:readline/promises'
import { BenchWorkerObservations, parseBenchArgs, validateBenchSessions, assertBenchArtifact, assertBenchImportedPattern, assertBenchMutation, assertBenchProfile, observeBenchImportRead, requireBenchSavedSlot, type BenchAdmissionState, type BenchMutation, type BenchSession } from './controller-import-hardware-policy'
import { installBenchSocketWitness, type BenchSocketGlobal } from './controller-import-hardware-sockets'
import { installBenchPageAccess } from './controller-import-hardware-page'
import { awaitBenchOperator, benchRoleUrl, benchSnapshot, closeBenchConnection, finalizeBenchResources, pinBenchRevision, runBenchCleanup, runSelectedBenchSteps, selectBenchDismiss, type BenchCleanupMetadata, type BenchCleanupProof, type BenchRole } from './controller-import-hardware-orchestration'
import { readControllerPatternImportLedger } from '../src/engine/controllerPatternImport'
import { CONTROLLER_DRAIN_PATTERN_SOURCE } from '../src/engine/pushPattern'
import { decodePbp } from '../src/engine/pbpEncode'
import { benchExtensionFiles, prepareBenchExtension } from './controller-import-hardware-extension'
import { parsePxlblzBanner } from '../src/engine/artifactStamp'
import type { ControllerConfig, ControllerStatus, ProgramListEntry } from '../src/engine/ControllerProvider'
import type { ControllerProfile } from '../src/engine/controllerProfile'
import type { PatternRecord } from '../src/engine/personalContentRecords'

const help = `Explicit #1221 S4 Controller import diagnostic; never automated hardware qualification.
  npm run diagnostic:controller-import -- --device 192.168.8.196 \\
    --url-a http://localhost:5174/PXLBLZ-IDE/ --url-b http://localhost:5179/PXLBLZ-IDE/ \\
    --steps 2,1,3,4,5,6 --session-a <private.json> \\
    --session-b <private.json> --out <fresh-ignored-directory> --run
REQUIRED --steps is a nonempty prefix of 2,1,3,4,5,6,7, in that exact order.
Preparation-only prefixes are supported; a new process cannot resume in-memory prerequisites.
Selecting 7 additionally REQUIRES --cleanup-inventory <private.json>.
Before B4: terminal operator must return READY <run-id> and attend through cleanup.
Before A7: terminal operator must return PROOF <run-id> S2 S3 POT LIT.
Optional: --headless (full Chromium), --run-id <ASCII-alphanumeric-hyphen>
Uses a temporary pre-granted extension copy and real production Save/Import paths. No hardware runs
are part of automated verification. Read docs/reference/controller-import-hardware-bench.md.
`
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const fidelityCost = "Fidelity cost: the agent bench does not exercise the grant UI or the shipped match list. Jon's manual bench on 2026-10-27 exercised the grant on real Chrome."
type Device = { config: ControllerConfig; status: ControllerStatus; list: ProgramListEntry[]; map?: number[][] | null }
type Event = Record<string, unknown>
type SpanMessage = { phase: 'start' | 'execute' | 'end' | 'error'; method: string; span: number; time: number; utc: string; args?: unknown[]; bytes?: number[]; source?: string; result?: unknown; status?: ControllerStatus; error?: string }

async function run() {
  // Parse opt-in before reading sessions, creating directories, or loading a browser.
  let options
  try { options = parseBenchArgs(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Invalid diagnostic arguments'); process.exitCode = 1; return }
  if (options.help) { console.log(help); return }
  const root = process.cwd()
  const out = resolve(options.out)
  const within = relative(root, out)
  if (!within || within.startsWith('..') || !within.split('/').every((part) => /^[A-Za-z0-9._-]+$/.test(part))) throw new Error('Output must be a private ignored directory within this checkout')
  try { execFileSync('git', ['check-ignore', '--quiet', '--', within], { stdio: 'ignore' }) } catch { throw new Error('Output directory must be git-ignored before this run') }
  if (existsSync(out)) throw new Error('Output directory already exists; choose a fresh ignored directory')
  const sessions = validateBenchSessions(JSON.parse(readFileSync(options.sessionA, 'utf8')), JSON.parse(readFileSync(options.sessionB, 'utf8')))
  const cleanupInventory: unknown = options.cleanupInventory ? JSON.parse(readFileSync(options.cleanupInventory, 'utf8')) : undefined
  const secrets = [sessions.a.cookie.value, sessions.b.cookie.value]
  const clean = (value: unknown): string => {
    let text = value instanceof Error ? value.message : String(value)
    for (const secret of secrets) for (const form of [secret, encodeURIComponent(secret)]) text = text.split(form).join('[redacted]')
    return text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
  }
  mkdirSync(out, { recursive: true, mode: 0o700 })
  const events: Event[] = []
  const event = (kind: string, details: Event = {}) => {
    const item = { kind, utc: new Date().toISOString(), monotonicMs: performance.now(), ...details }
    const safe = JSON.parse(clean(JSON.stringify(item))) as Event
    events.push(safe); appendFileSync(join(out, 'events.jsonl'), `${JSON.stringify(safe)}\n`, { mode: 0o600 })
  }
  const sourceExtension = join(root, 'extension')
  const extension = join(out, 'extension')
  const extensionCopyProof = prepareBenchExtension(sourceExtension, extension, options.urlB)
  const sourceExtensionHashes = benchExtensionFiles(sourceExtension)
  const hashes = Object.fromEntries(Object.entries(sourceExtensionHashes).map(([path, sha]) => [`extension/${path}`, sha]))
  event('temporary-extension-prepared', { extensionCopyProof, fidelityCost })
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const servedRevisions: Partial<Record<BenchRole, string>> = {}
  const report: Event = { version: 2, diagnosticRevision: revision, servedRevisions, selectedSteps: options.steps,
    extensionHashes: hashes, extensionCopyProof, fidelityCost, accounts: { a: sessions.a.user.userId, b: sessions.b.user.userId },
    outcome: 'blocked', cleanup: 'held: step 7 and bound operator proof required', screenshots: [], hardwareProofAttested: false,
    residualGaps: ['Offline checks do not prove browser integration, native permission behavior or physical S2/S3/POT/LIT observations', fidelityCost] }
  const names = [1, 2, 3].map((n) => `Test pat I20-${options.runId} ${n}`)
  const state: BenchAdmissionState = { target: options.device, scope: 'idle', allowedNames: names, pendingSaveName: null, pendingImport: null, pendingPattern: null,
    savedSlots: {}, admittedSlots: {}, priorActiveIds: [], usedDrainIds: [], drainDigest: null, allowNewSaveSlot: false }
  report.fixtureNames = names
  let refused = false
  let readOnly = false
  let probe: Promise<void> | null = null
  const contexts = new Set<BrowserContext>()
  const contextRoles = new Map<BrowserContext, BenchRole>()
  const pageRoles = new Map<Page, BenchRole>()
  const connections = new Map<BrowserContext, { page: Page; worker: Worker; connected: boolean }>()
  const url = (owner: BrowserContext | Page, path: string) => {
    const role = contextRoles.get(owner as BrowserContext) ?? pageRoles.get(owner as Page)
    if (!role) throw new Error('Unmapped role/origin')
    return benchRoleUrl(role, path)
  }
  const completed: number[] = []
  const bImported: PatternRecord[] = []
  let proof: BenchCleanupProof | undefined
  const operator = async (expectedToken: string, request: string) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Operator terminal input required; no default attendance')
    console.log(request)
    const input = createInterface({ input: process.stdin, output: process.stdout })
    try {
      return await awaitBenchOperator(async () => {
        const eof = new Promise<null>(resolve => input.once('close', () => resolve(null)))
        try { return await Promise.race([input.question(`${expectedToken}\n> `), eof]) } catch { return null }
      }, expectedToken, value => event('operator-response', { ...value }))
    } finally { input.close() }
  }
  const profiles: string[] = []
  const workerObservations = new BenchWorkerObservations<Worker>()
  const pendingRelay = new Map<string, { slot: string; start: number }>()
  const slots = new Map<string, string>()
  const fixtures: PatternRecord[] = []
  let aSaved: PatternRecord[] = []
  let aProfile: ControllerProfile | undefined
  let bProfile: ControllerProfile | undefined
  let device: Device | undefined
  const selectedImports: { id: string; name: string }[] = []

  const httpProbe = async (label: string) => {
    if (probe) throw new Error('Overlapping HTTP availability probe refused')
    const start = performance.now()
    probe = (async () => {
      event('http-probe-start', { label })
      try {
        const response = await fetch(`http://${options.device}/list`, { headers: { Connection: 'close' }, signal: AbortSignal.timeout(10_000) })
        const headerMs = performance.now() - start
        const body = await response.text()
        event('http-probe-end', { label, path: '/list', status: response.status, headerMs, durationMs: performance.now() - start,
          declaredLength: response.headers.get('content-length'), contentEncoding: response.headers.get('content-encoding'),
          transferEncoding: response.headers.get('transfer-encoding'), actualBytes: Buffer.byteLength(body), body })
        if (!response.ok) throw new Error(`HTTP health ${response.status}`)
      } catch (error) { event('http-probe-error', { label, durationMs: performance.now() - start, error: clean(error) }); throw error }
    })()
    try { await probe } finally { probe = null }
  }

  const flushWorkers = async () => {
    for (const worker of workerObservations.active) {
      try {
        const rows = await worker.evaluate(() => {
          const g = globalThis as unknown as BenchSocketGlobal & { __i20Http?: unknown[] }
          if (!g.__benchSockets) throw new Error('Socket witness disappeared')
          let failure: string | null = null
          try { g.__benchSockets.assertHealthy() } catch (error) { failure = error instanceof Error ? error.message : 'Socket failed' }
          return { http: g.__i20Http ?? [], sockets: g.__benchSockets.events(), failure }
        })
        if (!workerObservations.active.has(worker)) continue
        const count = workerObservations.counts.get(worker) ?? 0
        for (const row of rows.http.slice(count)) event('worker-http', row as Event)
        workerObservations.counts.set(worker, rows.http.length)
        event('worker-socket-witnesses', { rows: rows.sockets })
        if (rows.failure) { readOnly = true; throw new Error(rows.failure) }
      } catch (error) {
        event('worker-observation-gap', { reason: clean(error) })
        workerObservations.failed(worker)
        readOnly ||= workerObservations.readOnly
        throw error
      }
    }
  }
  const installWorker = async (worker: Worker) => {
    if (workerObservations.active.has(worker)) return
    workerObservations.add(worker)
    await worker.evaluate(installBenchSocketWitness, options.device)
    event('worker-start', { instance: workerObservations.active.size, observationGap: true })
    worker.on('close', () => {
      const expected = workerObservations.closing.has(worker)
      workerObservations.closed(worker)
      readOnly ||= workerObservations.readOnly
      event('worker-stop', { expected, observationGap: !expected })
    })
    await worker.evaluate((ip) => {
      const g = globalThis as unknown as { __i20Http?: unknown[] }
      g.__i20Http = []
      const original = globalThis.fetch
      globalThis.fetch = function (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
        const input = args[0]
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
        if (url.hostname !== ip || url.protocol !== 'http:' || !(/^\/$|^\/list$|^\/p\/[^/]+$/.test(url.pathname))) return original.apply(this, args)
        const start = performance.now(); const utc = new Date().toISOString()
        return original.apply(this, args).then((response) => {
          const record: Record<string, unknown> = { path: url.pathname, utc, startMs: start, headersMs: performance.now(), status: response.status,
            declaredLength: response.headers.get('content-length'), contentEncoding: response.headers.get('content-encoding'), transferEncoding: response.headers.get('transfer-encoding') }
          g.__i20Http!.push(record)
          // Observe a clone without delaying, replacing, or consuming the returned body.
          void response.clone().arrayBuffer().then((body) => {
            g.__i20Http!.push({ ...record, bodyCompleteMs: performance.now(), actualBytes: body.byteLength })
          }, () => { g.__i20Http!.push({ ...record, bodyCompleteMs: performance.now(), error: 'Response clone body read failed' }) })
          return response
        }, (error: unknown) => { g.__i20Http!.push({ path: url.pathname, utc, startMs: start, errorMs: performance.now(), error: error instanceof Error ? error.message : 'fetch failed' }); throw error })
      }
    }, options.device)
  }

  const installPage = async (page: Page) => {
    await page.exposeBinding('__i20Relay', (_source, message: { kind: string; reqId: string; slot?: string; time: number; utc: string; data?: string; ok?: boolean; error?: string }) => {
      if (message.kind === 'get-program' && message.slot && (Object.prototype.hasOwnProperty.call(state.savedSlots, message.slot) || Object.prototype.hasOwnProperty.call(state.admittedSlots, message.slot))) {
        pendingRelay.set(message.reqId, { slot: message.slot, start: message.time })
        event('relay-get-program', { reqId: message.reqId, slot: message.slot, pageMs: message.time, pageUtc: message.utc })
      } else if (message.kind === 'program-data') {
        const pending = pendingRelay.get(message.reqId)
        if (!pending) return
        pendingRelay.delete(message.reqId)
        // Only this run's fixture payloads may be persisted.
        if (!names.includes(state.savedSlots[pending.slot] ?? state.admittedSlots[pending.slot])) return
        const bytes = message.data ? Buffer.from(message.data, 'base64') : null
        let decoded = null
        let error = message.error
        try { decoded = bytes ? decodePbp(bytes) : null } catch { error = 'decodePbp threw' }
        const sha = bytes ? digest(bytes) : null
        const file = bytes ? `pbp-${pending.slot}-${sha}.bin` : null
        if (bytes && file) writeFileSync(join(out, file), bytes, { mode: 0o600 })
        event('relay-program-data', { reqId: message.reqId, slot: pending.slot, pageMs: message.time, pageUtc: message.utc,
          durationMs: message.time - pending.start, ok: message.ok, bytes: bytes?.length ?? null, sha256: sha, file,
          decoded: decoded ? { name: decoded.name, source: decoded.sourceCode, stamp: parsePxlblzBanner(decoded.sourceCode), bytecodeBytes: decoded.byteCode.length } : null,
          error: error ?? (bytes && !decoded ? `Saved program ${pending.slot} is not a readable PBP blob.` : null) })
      }
    })
    await page.exposeBinding('__i20Span', async (_source, message: SpanMessage) => {
      const start = performance.now()
      if (message.phase === 'start' && message.method === 'readSavedProgram'
        && observeBenchImportRead(state, selectedImports, String(message.args?.[0] ?? ''))) {
        event('import-row-observed', { pair: state.pendingImport, span: message.span })
      }
      if (message.phase === 'start' && ['saveProgram', 'pushBytecode', 'setVars', 'setRendererPaused', 'setControls', 'setBrightness', 'setName', 'setPixelCount', 'setActiveProgram', 'deleteProgram', 'setPixelMap'].includes(message.method)) {
        try {
          if (refused || readOnly) throw new Error('Writes stopped for this run')
          const connection = connections.get(_source.page.context())
          if (!connection) throw new Error('Unmapped hardware context')
          await connection.worker.evaluate(() => {
            const gate = (globalThis as unknown as BenchSocketGlobal).__benchSockets
            if (!gate) throw new Error('Socket witness unavailable')
            gate.assertHealthy()
          })
          if (message.status?.kind !== 'connected' || message.status.controller.address !== options.device
            || message.status.controller.deviceId !== (device?.status.kind === 'connected' ? device.status.controller.deviceId : undefined)) throw new Error('Connected physical target changed')
          const opts = message.args?.[1] as { id?: string; name?: string; save?: boolean } | undefined
          const mutation = message.method === 'saveProgram' ? { method: 'saveProgram', id: opts?.id ?? '', pbp: new Uint8Array(message.bytes ?? []) } as const
            : message.method === 'pushBytecode' ? { method: 'pushBytecode', id: opts?.id ?? '', name: opts?.name, digest: digest(new Uint8Array(message.bytes ?? [])) } as const
              : message.method === 'setActiveProgram' ? { method: 'setActiveProgram', id: message.args?.[0], save: opts?.save } as BenchMutation
                : message.method === 'deleteProgram' ? { method: 'deleteProgram', id: message.args?.[0] } as BenchMutation
                  : { method: message.method } as BenchMutation
          assertBenchMutation(mutation, state)
          event('admission', { method: message.method, span: message.span, id: opts?.id, name: opts?.name, overheadMs: performance.now() - start })
        } catch (error) {
          refused = true; readOnly = true; state.scope = 'idle'
          event('admission-refused', { method: message.method, span: message.span, overheadMs: performance.now() - start, error: clean(error) })
          throw new Error('Hardware admission refused; abort run', { cause: error })
        }
      }
      if (message.phase === 'end' && message.method === 'compile' && message.source === CONTROLLER_DRAIN_PATTERN_SOURCE) state.drainDigest = digest(new Uint8Array(message.bytes ?? []))
      if (message.phase === 'error' && state.scope === 'import') {
        event('import-provider-error', { method: message.method, pair: state.pendingImport, error: message.error })
      }
      event('provider-span', { phase: message.phase, method: message.method, span: message.span, pageMs: message.time, pageUtc: message.utc,
        byteLength: message.bytes?.length, sha256: message.bytes ? digest(new Uint8Array(message.bytes)) : undefined,
        result: message.result, error: message.error, overheadMs: performance.now() - start })
    })
    await page.addInitScript(() => {
      const w = window as unknown as { __i20Relay: (message: unknown) => Promise<void> }
      window.addEventListener('message', (ev: MessageEvent) => {
        if (ev.source !== window || ev.data?.source !== 'pblz-relay') return
        const m = ev.data
        if (m.type === 'get-program') void w.__i20Relay({ kind: m.type, reqId: m.reqId, slot: m.programId, time: performance.now(), utc: new Date().toISOString() })
        if (m.type === 'program-data') void w.__i20Relay({ kind: m.type, reqId: m.reqId, data: m.programData, ok: m.ok, error: m.error, time: performance.now(), utc: new Date().toISOString() })
      })
    })
  }
  const wrapProvider = async (page: Page) => {
    await page.evaluate(() => window.__benchPageAccess.assertReady())
  }

  const open = async (role: BenchRole, profile: string, session: BenchSession) => {
    const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: options.headless,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`], viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, baseURL: benchRoleUrl(role, '') })
    contexts.add(context)
    contextRoles.set(context, role)
    await context.addCookies([session.cookie])
    // Disposable diagnostic profiles only: suppress remembered startup connects.
    // The real provider is instrumented after navigation, before explicit Connect.
    await context.addInitScript(() => {
      localStorage.removeItem('pixelblaze-controller')
    })
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
    await installWorker(worker)
    context.on('serviceworker', (replacement) => {
      if (replacement !== worker) { readOnly = true; event('worker-observation-gap', { reason: 'Unexpected replacement worker; run stopped' }) }
    })
    const me = await context.request.get(url(context, '/api/me'))
    const identity = await me.json() as { authenticated?: boolean; user?: { id?: string } }
    if (!me.ok() || !identity.authenticated || identity.user?.id !== session.user.userId) throw new Error('Synthetic /api/me identity mismatch')
    event('identity-verified', { role, userId: session.user.userId })
    if (role === 'b') await context.route('**/api/controllers', async route => {
      if (route.request().method() !== 'POST') { await route.continue(); return }
      // Connecting the wrong physical identity must not auto-seed B's account.
      readOnly = true
      event('B-profile-creation-refused', { reason: 'Only a preexisting physical profile is admitted' })
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Diagnostic requires a preexisting B physical profile' }) })
    })
    const served = await context.request.get(url(context, '/__identity'))
    if (!served.ok()) throw new Error('Served product revision cannot be verified')
    const runtime = await served.json() as { project?: string; commit?: string; worktree?: string }
    if (runtime.project !== 'pxlblz-ide' || !runtime.commit || !/^[a-f0-9]{40}$/.test(runtime.commit)) throw new Error('Invalid served product identity')
    pinBenchRevision(servedRevisions, role, runtime.commit)
    try {
      const rows = execFileSync('git', ['ls-tree', '-r', '-z', runtime.commit, '--', 'extension/'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
      const servedHashes: Record<string, string> = {}
      for (const row of rows) {
        const match = /^(100644|100755) blob [a-f0-9]+\textension\/(.+)$/.exec(row)
        if (!match) throw new Error('Non-regular served extension file')
        servedHashes[match[2]] = digest(execFileSync('git', ['show', `${runtime.commit}:extension/${match[2]}`], { cwd: root }))
      }
      const current = benchExtensionFiles(sourceExtension)
      for (const actual of [current, servedHashes]) {
        if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(sourceExtensionHashes).sort())) throw new Error('Extension identity mismatch')
      }
    } catch { throw new Error('Served extension differs from the diagnostic source extension') }
    event('served-extension-identity-verified', { role, commit: runtime.commit, diagnosticRevision: revision, sourceHashes: hashes })
    event('served-product', { role, commit: runtime.commit, worktree: runtime.worktree })
    const page = context.pages()[0] ?? await context.newPage()
    pageRoles.set(page, role)
    connections.set(context, { page, worker, connected: false })
    await installPage(page)
    await installBenchPageAccess(page, new URL(benchRoleUrl(role, '')).origin)
    return { context, page, worker }
  }
  const destroyContext = async (context: BrowserContext): Promise<void> => {
    const closingWorkers = context.serviceWorkers()
    workerObservations.beginClose(closingWorkers)
    await context.close()
    for (const worker of closingWorkers) workerObservations.closed(worker)
    readOnly ||= workerObservations.readOnly
    contexts.delete(context)
    connections.delete(context)
  }
  const close = async (context: BrowserContext) => {
    await disconnectGate(context)
    await destroyContext(context)
  }
  const disconnectGate = async (context: BrowserContext) => {
    const connection = connections.get(context)
    if (!connection) throw new Error('Unproved context ownership; destruction held')
    await closeBenchConnection({
      disconnect: async () => {
        if (connection.connected) await connection.page.evaluate(async () => {
          await window.__benchPageAccess.getProvider().disconnect()
        })
      },
      closeAndWait: async () => { await connection.worker.evaluate(async () => {
        const gate = (globalThis as unknown as BenchSocketGlobal).__benchSockets
        if (!gate) throw new Error('Socket witness unavailable')
        await gate.closeAndWait(); gate.assertSafe()
      }) },
      flush: flushWorkers,
    }).catch(error => { readOnly = true; report.failure ??= clean(error); report.outcome = 'failed'; throw error })
    connection.connected = false
  }
  const navigate = async (page: Page, path: string) => {
    const connection = connections.get(page.context())
    if (connection?.connected) await disconnectGate(page.context())
    if (readOnly) throw new Error('Navigation refused after run stop')
    await page.goto(url(page, path))
  }
  const api = async <T>(context: BrowserContext, resource: string): Promise<T> => {
    const response = await context.request.get(url(context, `/api/${resource}`))
    if (!response.ok()) throw new Error(`Account GET ${resource} failed (${response.status()})`)
    return response.json() as Promise<T>
  }
  const post = async (context: BrowserContext, resource: string, data: unknown) => {
    if (refused || readOnly) throw new Error('Account setup refused after stop')
    const response = await context.request.post(url(context, `/api/${resource}`), { data })
    if (!response.ok()) throw new Error(`Account setup ${resource} failed (${response.status()})`)
  }
  const account = async (context: BrowserContext) => ({ patterns: await api<{ patterns: PatternRecord[] }>(context, 'patterns'),
    controllers: await api<{ controllers: ControllerProfile[] }>(context, 'controllers'), bindings: await api(context, 'controller-metadata/controller-bindings'),
    pushes: await api(context, 'controller-metadata/controller-push-records'), receipts: await api(context, 'controller-metadata/controller-pattern-imports'), labels: await api(context, 'controller-metadata/controller-program-labels') })
  const capture = async (page: Page, label: string) => {
    for (const width of [1440, 760]) {
      await page.setViewportSize({ width, height: 1000 })
      const file = `${label}-${width}.png`; await page.screenshot({ path: join(out, file) })
      ;(report.screenshots as string[]).push(file)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  const connect = async (page: Page, worker: Worker) => {
    if (readOnly || refused || workerObservations.readOnly) throw new Error('Connection refused after run stop')
    await wrapProvider(page)
    const origins = [`http://${options.device}/*`, `ws://${options.device}/*`]
    const permission = await worker.evaluate(async (origins) => {
      const chrome = (globalThis as unknown as { chrome: { permissions: { contains: (arg: { origins: string[] }) => Promise<boolean> } } }).chrome
      return chrome.permissions.contains({ origins })
    }, origins)
    if (!permission) {
      event('missing-grant', { origins })
      throw new Error('Temporary bench extension lacks required Cark HTTP/WebSocket host permissions')
    }
    event('temporary-extension-pre-grant-verified', { origins })
    const connectButton = page.getByRole('button', { name: 'Connect a Controller', exact: true })
    await expect(connectButton).toBeVisible()
    await connectButton.click()
    await page.getByRole('textbox', { name: 'Controller IP address' }).fill(options.device)
    await worker.evaluate(() => {
      const gate = (globalThis as unknown as BenchSocketGlobal).__benchSockets
      if (!gate) throw new Error('Socket witness unavailable')
      gate.arm()
    })
    connections.get(page.context())!.connected = true
    await page.getByTestId('controller-go').click()
    await expect(page.getByTestId('controller-pill')).toHaveAttribute('data-phase', 'live')
    event('pre-granted-controller-live', { origins, phase: 'live' })
  }
  const snapshotDevice = async (page: Page, label: string, map = false) => {
    const snapshot = await page.evaluate(async (map) => {
      const provider = window.__benchPageAccess.getProvider()
      return { status: provider.getStatus(), config: await provider.getConfig(), list: await provider.listPrograms(), ...(map ? { map: await provider.getPixelMap() } : {}) }
    }, map) as Device
    event('device-snapshot', { label, ...snapshot })
    const active = snapshot.config.activeProgramId
    if (active && !state.priorActiveIds.includes(active)) state.priorActiveIds.push(active)
    return snapshot
  }
  const activeWitness = async (page: Page, label: string) => {
    try {
      const config = await page.evaluate(async () => {
        return window.__benchPageAccess.getProvider().getConfig()
      }) as ControllerConfig
      event('active-witness', { label, activeProgramId: config.activeProgramId ?? null, config })
      if (config.activeProgramId && !state.priorActiveIds.includes(config.activeProgramId)) state.priorActiveIds.push(config.activeProgramId)
    } catch (error) { event('active-read-failed', { label, activeProgramId: null, error: clean(error) }) }
  }
  const readSlot = async (page: Page, slot: string, label: string) => {
    try {
      const result = await page.evaluate(async (slot) => {
        const saved = await window.__benchPageAccess.getProvider().readSavedProgram(slot)
        return saved?.storedArtifact ? Array.from(saved.storedArtifact.pbp as Uint8Array) : null
      }, slot)
      const bytes = result ? new Uint8Array(result) : null; const decoded = bytes ? decodePbp(bytes) : null
      if (bytes) writeFileSync(join(out, `${label}-${slot}.bin`), bytes, { mode: 0o600 })
      event('slot-readback', { label, slot, bytes: bytes?.length ?? null, sha256: bytes ? digest(bytes) : null,
        decoded: decoded ? { name: decoded.name, source: decoded.sourceCode, stamp: parsePxlblzBanner(decoded.sourceCode), bytecodeBytes: decoded.byteCode.length } : null })
      return decoded
    } catch (error) { event('slot-readback-failed', { label, slot, error: clean(error) }); return null }
  }
  const profile = async (context: BrowserContext, role: 'a' | 'b'): Promise<ControllerProfile> => {
    const status = device!.status
    if (status.kind !== 'connected' || !status.controller.deviceId) throw new Error('Physical device identity is unavailable')
    const expected: ControllerProfile = { id: `i20-${options.runId}-${role}`, name: `I20 ${role.toUpperCase()} Cark`, deviceId: status.controller.deviceId,
      lastKnownDeviceName: device!.config.name, lastSeenIp: options.device, board: { kind: 'pixelblaze-v3-standard' },
      inputs: role === 'a' ? [] : [{ id: 'pot', name: 'Brightness', pin: 35, signal: 'analog', smoothing: 1, fallback: 0.5, invert: false }],
      globalTransforms: role === 'a' ? [] : [{ id: 'hardware-brightness', type: 'hardware-brightness', enabled: true, mixinId: 'builtin:hardware-brightness', inputId: 'pot', mode: 'multiply-output' }],
      patternBindings: [], keepPatternsUpToDate: false, updatedAt: Date.now() }
    let matches: ControllerProfile[] = []
    const readMatches = async () => {
      const records = await api<{ controllers: ControllerProfile[] }>(context, 'controllers')
      matches = records.controllers.filter((p) => p.deviceId === expected.deviceId)
      return matches.length
    }
    if (role === 'a') {
      await expect.poll(readMatches, { timeout: 10_000, message: 'A must have exactly one auto-created physical profile after first live Connect; zero or multiple profiles block without creating a duplicate' }).toBe(1)
    } else await readMatches()
    if (matches.length > 1) throw new Error('Multiple physical profiles require operator resolution')
    if (matches.length) {
      const existing = matches[0]
      event('existing-profile', { role, profile: existing })
      assertBenchProfile(existing, role)
      return existing
    }
    throw new Error('Required preexisting physical profile is missing; preserved without overwrite or seed')
  }
  const step = async (number: number, action: () => Promise<void>) => {
    const start = performance.now(); event('step-start', { step: number })
    try {
      if (readOnly || refused || workerObservations.readOnly) throw new Error('Run already stopped')
      await action(); await flushWorkers()
      if (readOnly || refused || workerObservations.readOnly) throw new Error('Run stopped during step')
      completed.push(number); event('step-end', { step: number, status: 'complete', durationMs: performance.now() - start })
    }
    catch (error) { event('step-end', { step: number, status: 'blocked', durationMs: performance.now() - start, error: clean(error) }); throw error }
  }
  const uiSave = async (page: Page, name: string, newSlot: boolean) => {
    await httpProbe(`before-Studio-Save-${name}`)
    state.scope = 'save'; state.pendingSaveName = name; state.allowNewSaveSlot = newSlot
    try {
      const row = page.getByTestId('controller-action-row')
      if (!await row.isVisible()) await page.getByTestId('controller-pill').click()
      const button = row.getByRole('button', { name: 'Save', exact: true })
      await expect(button).toBeEnabled(); await button.click(); await expect(button).toBeDisabled()
      await expect.poll(async () => page.evaluate(() => {
        const current = window.__benchPageAccess.getSaveState()
        return current.pushing ? 'pending' : current.pushResult?.ok ? 'saved' : current.pushResult ? 'failed' : 'pending'
      }), { timeout: 90_000 }).not.toBe('pending')
      if (refused) throw new Error('Admission refused during Save')
      const saved = await page.evaluate(() => window.__benchPageAccess.getSaveState().pushResult)
      const admittedSlot = Object.entries(state.admittedSlots).find(([, n]) => n === name)?.[0]
      event('studio-save-result', { name, ok: saved?.ok ?? null, message: saved && 'message' in saved ? saved.message : null, admittedSlot: admittedSlot ?? null })
      // This is an admitted pair, not a claim of persistence. Capture real list separately.
      const slot = requireBenchSavedSlot(saved, admittedSlot)
      slots.set(name, slot)
      const listed = await snapshotDevice(page, `saved-list-${name}`)
      for (const entry of listed.list) state.savedSlots[entry.id] = entry.name
      const decoded = await readSlot(page, slot, `save-${names.indexOf(name) + 1}`)
      if (decoded?.name !== name) throw new Error('Initial Save flash readback is unproved')
      if (pageRoles.get(page) === 'a') assertBenchArtifact(decoded, 'a', fixtures.find(p => p.name === name)!.id)
      event('save-account', { name, snapshot: await account(page.context()) })
      await httpProbe(`after-Studio-Save-${name}`)
      await activeWitness(page, `after-save-${name}`)
    } finally { state.scope = 'idle'; state.allowNewSaveSlot = false }
  }

  let a: Awaited<ReturnType<typeof open>> | undefined
  let b: Awaited<ReturnType<typeof open>> | undefined
  let aDisk = ''
  let bDisk = ''
  const assertImported = async (page: Page, slot: string, expectedId?: string, edit?: string, completedTarget = slot) => {
    const context = page.context()
    const patterns = (await api<{ patterns: PatternRecord[] }>(context, 'patterns')).patterns
    const rawLedger = await api<{ value?: unknown }>(context, 'controller-metadata/controller-pattern-imports')
    const ledger = readControllerPatternImportLedger(rawLedger.value)
    const receipts = Object.values(ledger.byPatternId).filter(r => r.programId === slot && r.controllerDeviceId === bProfile!.deviceId)
    if (receipts.length !== 1) throw new Error('Missing or ambiguous B import receipt')
    const receipt = receipts[0]
    if (expectedId && receipt.patternId !== expectedId) throw new Error('Import account Pattern identity changed')
    const pattern = patterns.find(p => p.id === receipt.patternId)
    const bindings = await api<{ value?: Record<string, Record<string, string>> }>(context, 'controller-metadata/controller-bindings')
    const current = await snapshotDevice(page, 'B-import-complete')
    assertBenchImportedPattern({ pattern, receipt, binding: bindings.value?.[bProfile!.deviceId!]?.[receipt.patternId], activeId: current.config.activeProgramId, slot, deviceId: bProfile!.deviceId!, completedTarget })
    const artifact = await readSlot(page, slot, `B-reopened-${slot}`)
    assertBenchArtifact(artifact, 'b', receipt.patternId)
    if (edit && (!artifact!.sourceCode.includes(edit) || !pattern!.src.includes(edit))) throw new Error('Same-slot edit persistence is unproved')
    event('S3-asserted', { slot, pattern, receipt, binding: slot, artifactSource: artifact!.sourceCode, physicalQualification: 'operator attestation required' })
    const index = bImported.findIndex(p => p.id === pattern!.id)
    if (index === -1) bImported.push(pattern!); else bImported[index] = pattern!
    return pattern!
  }
  const dismiss = async (page: Page, label: string) => {
    const dialog = page.getByRole('alertdialog')
    const buttons = dialog.getByRole('button')
    const candidates = await buttons.evaluateAll(rows => rows.map(button => ({ label: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
      secondary: button.classList.contains('border-zinc-600'), type: button.getAttribute('type') })))
    const button = buttons.nth(selectBenchDismiss(candidates))
    event('dialog-dismiss-label', { label, text: await button.innerText(), accessibleLabel: await button.getAttribute('aria-label') })
    await capture(page, label); await button.click()
  }
  try {
    aDisk = mkdtempSync(join(tmpdir(), 'pxlblz-i20-a-')); profiles.push(aDisk)
    bDisk = mkdtempSync(join(tmpdir(), 'pxlblz-i20-b-')); profiles.push(bDisk)
    const actions: Record<number, () => Promise<void>> = {
    2: () => step(2, async () => {
      a = await open('a', aDisk, sessions.a)
      b = await open('b', bDisk, sessions.b)
      event('account-baseline', { role: 'a', snapshot: await account(a.context) })
      event('account-baseline', { role: 'b', snapshot: await account(b.context) })
      const preexisting = (await api<{ controllers: ControllerProfile[] }>(b.context, 'controllers')).controllers
      const candidates = preexisting.filter(p => p.lastSeenIp === options.device)
      if (candidates.length !== 1) throw new Error('Preexisting B physical profile unavailable or ambiguous; no connect or seed')
      bProfile = candidates[0]; assertBenchProfile(bProfile, 'b')
      await close(a.context); a = undefined
      await navigate(b.page, `studio/controllers/${bProfile.id}`)
      await connect(b.page, b.worker)
      device = await snapshotDevice(b.page, 'original-B-read-only-health', true)
      report.device = device
      if (device.status.kind !== 'connected' || !device.status.controller.deviceId || device.config.name !== '#2 Cark'
        || device.config.firmwareVersion !== '3.70' || device.config.pixelCount !== 256 || device.map?.length !== 256
        || device.map.some((point) => point.length !== 2)) throw new Error('Target is not the qualified #2 Cark / 3.70 / 256px / 2D Controller')
      if (device.status.controller.deviceId !== bProfile.deviceId) throw new Error('B preexisting profile does not match physical identity')
      await profile(b.context, 'b')
      report.originalActiveId = device.config.activeProgramId ?? null
      report.operatorConfirmedStartup = (cleanupInventory as { startup?: unknown } | undefined)?.startup ?? null
      event('original-startup-evidence', { activeId: device.config.activeProgramId ?? null, operatorConfirmed: report.operatorConfirmedStartup, savedInventory: device.list,
        note: 'Config has no configured-startup field; active ID never implies startup' })
      state.savedSlots = Object.fromEntries(device.list.map((p) => [p.id, p.name]))
      if (Object.values(state.savedSlots).some((n) => names.includes(n))) throw new Error('Run fixture names already exist')
      await httpProbe('baseline')
      await close(b.context); b = undefined
    }),
    1: () => step(1, async () => {
      a = await open('a', aDisk, sessions.a)
      await navigate(a.page, 'studio/patterns'); await connect(a.page, a.worker)
      aProfile = await profile(a.context, 'a')
      for (let index = 0; index < names.length; index++) {
        const color = ['1,0,0', '0,1,0', '0,0,1'][index]
        const record: PatternRecord = { id: `i20-${options.runId}-${index + 1}`, name: names[index], src: `export function render(index) { rgb(${color}) }\nexport function render2D(index,x,y) { rgb(${color}) }`, controls: {}, updatedAt: Date.now() }
        const existing = await api<{ patterns: PatternRecord[] }>(a.context, 'patterns')
        if (existing.patterns.some((p) => p.id === record.id || p.name === record.name)) throw new Error('Run Pattern identity already exists')
        await post(a.context, 'patterns', record); fixtures.push(record)
        await navigate(a.page, `studio/patterns/${record.id}`)
        // A full route load creates a fresh provider; install before its explicit Connect.
        await connect(a.page, a.worker)
        await uiSave(a.page, record.name, true)
      }
      aSaved = (await api<{ patterns: PatternRecord[] }>(a.context, 'patterns')).patterns.filter((p) => fixtures.some((f) => f.id === p.id))
      report.aSavedSnapshot = aSaved
      await close(a.context); a = undefined
    }),
    3: () => step(3, async () => {
      b = await open('b', bDisk, sessions.b)
      await navigate(b.page, `studio/controllers/${bProfile!.id}`)
      await connect(b.page, b.worker); await snapshotDevice(b.page, 'B-connected', true)
      const table = b!.page.getByRole('table', { name: 'Unimported PXLBLZ Patterns', exact: true })
      for (const name of names) await expect(table).toContainText(name)
      event('unimported-rows', { classification: 'Unimported PXLBLZ Patterns', rows: await table.locator('tr').evaluateAll((rows) => rows.map((row) => ({ text: row.textContent, className: row.className }))) })
      await capture(b!.page, 'unimported')
    }),
    4: () => step(4, async () => {
      const page = b!.page
      const initial = await readSlot(page, slots.get(names[0])!, 'before-single-import')
      assertBenchArtifact(initial, 'a', fixtures[0].id)
      await operator(`READY ${options.runId}`, 'Jon must attend through bulk import and cleanup, observe that B’s pot changes T1 brightness and that LEDs are never left dark; return a minimum pot to lit.')
      await httpProbe('before-single-import')
      state.scope = 'import'; state.pendingImport = { id: slots.get(names[0])!, name: names[0] }
      selectedImports.push(state.pendingImport)
      try {
        await page.getByRole('button', { name: `Import ${names[0]}`, exact: true }).click()
        const dialog = page.getByRole('alertdialog')
        await dialog.getByRole('button', { name: 'Import and save', exact: true }).click()
        await expect.poll(async () => /\/studio\/patterns\//.test(page.url()) || await dialog.getByRole('button', { name: 'Retry', exact: true }).isVisible(), { timeout: 120_000 }).toBe(true)
        event('single-import-outcome', { url: new URL(page.url()).pathname, visible: await page.locator('body').innerText(), snapshot: await account(b!.context) })
        if (refused) throw new Error('Admission refused during Import')
        if (!/\/studio\/patterns\//.test(page.url())) throw new Error('Single import did not complete')
        const imported = await assertImported(page, slots.get(names[0])!)
        await httpProbe('after-single-import')
        const editor = page.locator('.monaco-editor').first().getByRole('textbox', { name: 'Editor content', exact: true })
        const pathParts = new URL(page.url()).pathname.split('/')
        const importedId = pathParts[pathParts.length - 1]
        const saved = page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname.endsWith(`/api/patterns/${importedId}`) && response.ok())
        const edit = `// I50 bench edit ${options.runId}`
        await editor.focus(); await editor.press('Control+End'); await editor.press('End'); await editor.press('Enter'); await page.keyboard.type(edit); await saved
        await uiSave(page, names[0], false)
        await assertImported(page, slots.get(names[0])!, imported.id, edit)
        await capture(page, 'single-import')
        await activeWitness(page, 'after-single-import')
      } finally { state.scope = 'idle'; selectedImports.length = 0 }
    }),
    5: () => step(5, async () => {
      const page = b!.page
      await navigate(page, `studio/controllers/${bProfile!.id}`)
      await connect(page, b!.worker)
      await httpProbe('before-bulk')
      event('bulk-footprint', { reason: 'Full reload creates a fresh real provider; known active footprint remains null so production requiresControllerDrain(incoming,null) is exercised' })
      const table = page.getByRole('table', { name: 'Unimported PXLBLZ Patterns', exact: true })
      await page.getByRole('button', { name: 'Select Unimported PXLBLZ Patterns', exact: true }).click()
      const before = await account(b!.context); const writesBefore = events.filter((e) => e.kind === 'admission').length
      await table.getByRole('checkbox', { name: 'Select all Unimported PXLBLZ Patterns', exact: true }).check()
      const openImport = page.getByRole('button', { name: 'Import', exact: true })
      await openImport.click(); await dismiss(page, 'bulk-cancel-confirmation')
      if (benchSnapshot(await account(b!.context)) !== benchSnapshot(before) || events.filter((e) => e.kind === 'admission').length !== writesBefore) throw new Error('Cancellation changed account records or device writes')
      event('bulk-cancel-preservation', { unchanged: true })
      await capture(page, 'B-after-cancel')
      await table.getByRole('checkbox', { name: 'Select all Unimported PXLBLZ Patterns', exact: true }).uncheck()
      for (const name of names.slice(1)) {
        assertBenchArtifact(await readSlot(page, slots.get(name)!, `before-bulk-${name}`), 'a', fixtures.find(p => p.name === name)!.id)
        const checkbox = table.getByRole('checkbox', { name: `Select ${name}`, exact: true })
        if (!await checkbox.isEnabled()) throw new Error('Required T2/T3 group-local selection is disabled')
        await checkbox.check()
      }
      await openImport.click()
      const dialog = page.getByRole('alertdialog')
      await expect(dialog.getByRole('listitem')).toHaveText(names.slice(1)); await capture(page, 'bulk-confirmation')
      selectedImports.push(...names.slice(1).map((name) => ({ id: slots.get(name)!, name })))
      state.scope = 'import'; state.pendingImport = selectedImports[0]
      try {
        await dialog.getByRole('button', { name: 'Import and save', exact: true }).click()
        await expect(dialog.getByRole('heading')).toHaveText('Import results', { timeout: 120_000 })
        const text = await dialog.innerText()
        event('bulk-results', { text, snapshot: await account(b!.context) }); await capture(page, 'bulk-results')
        if (refused) throw new Error('Admission refused during bulk Import')
        if (!text.includes('2 imported')) throw new Error('Bulk did not report exactly two imports')
        const rows = dialog.locator('p').filter({ hasText: /: Import completed\.$/ })
        await expect(rows).toHaveCount(2)
        await expect(rows).toHaveText(names.slice(1).map(name => `${name}: Import completed.`))
        // T2 is no longer active after T3. Assert each completed row's persisted
        // binding/artifact, and the completed batch target is T3.
        const final = await snapshotDevice(page, 'bulk-final')
        if (final.config.activeProgramId !== slots.get(names[2])) throw new Error('Bulk final target is not T3')
        for (const name of names.slice(1)) await assertImported(page, slots.get(name)!, undefined, undefined, slots.get(names[2])!)
        await dismiss(page, 'bulk-complete-dismiss')
        const savedTable = page.getByRole('table', { name: 'Saved PXLBLZ Patterns', exact: true })
        for (const name of names) await expect(savedTable).toContainText(name)
        event('saved-classification', { text: await page.getByTestId('controller-saved-programs-pane').innerText() })
        const runningRow = savedTable.getByRole('row').filter({ hasText: names[2] })
        const deleteButton = runningRow.getByRole('button', { name: `Delete ${names[2]} from the Controller`, exact: true })
        await expect(deleteButton).toHaveAttribute('aria-disabled', 'true')
        const reason = await deleteButton.evaluate(button => document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent)
        if (!reason) throw new Error('Running-row Delete reason is missing')
        event('running-delete-only-reason', { text: await runningRow.innerText(), reason })
        await capture(page, 'B-saved-after-bulk')
        await activeWitness(page, 'after-bulk')
      } finally { state.scope = 'idle'; selectedImports.length = 0 }
      await httpProbe('after-bulk')
    }),
    6: () => step(6, async () => {
      await close(b!.context); b = undefined
      a = await open('a', aDisk, sessions.a)
      const records = (await api<{ patterns: PatternRecord[] }>(a.context, 'patterns')).patterns.filter((p) => fixtures.some((f) => f.id === p.id))
      const unchanged = benchSnapshot(records) === benchSnapshot(aSaved)
      event('A-preservation', { unchanged, before: aSaved, after: records }); report.aPreservation = unchanged
      if (!unchanged) throw new Error('Account A fixtures changed')
      await navigate(a.page, `studio/controllers/${aProfile!.id}`)
      await connect(a.page, a.worker)
      for (const name of names) await expect(a.page.getByTestId('controller-saved-programs-pane')).toContainText(name)
      event('A-saved-classification', { text: await a.page.getByTestId('controller-saved-programs-pane').innerText() })
      await capture(a.page, 'A-final'); await activeWitness(a.page, 'final')
    }),
    7: () => step(7, async () => {
      const response = await operator(`PROOF ${options.runId} S2 S3 POT LIT`, 'Attest software S2/S3 qualification and the combined physical pot/lit observations for this run.')
      proof = { ...response, runId: options.runId, diagnosticRevision: revision, servedRevisions: { ...servedRevisions } }
      event('hardware-proof-attestation', { ...proof }); report.hardwareProofAttested = true
      // B account API access has no Controller connection and creates no socket.
      b = await open('b', bDisk, sessions.b)
      const byRole = (role: BenchRole) => role === 'a' ? a!.context : b!.context
      const readMetadata = async (role: BenchRole): Promise<BenchCleanupMetadata> => {
        const context = byRole(role)
        const get = async <T>(key: string, fallback: T): Promise<T> => (await api<{ value?: T }>(context, `controller-metadata/${key}`)).value ?? fallback
        const metadata = { bindings: await get('controller-bindings', {}), pushes: await get('controller-push-records', {}),
          receipts: readControllerPatternImportLedger((await api<{ value?: unknown }>(context, 'controller-metadata/controller-pattern-imports')).value), labels: await get('controller-program-labels', {}) }
        event('cleanup-metadata-read', { role, metadata }); return metadata
      }
      await runBenchCleanup({ inventory: cleanupInventory, known: { controller: Array.from(slots, ([name, id]) => ({ id, name })), a: aSaved.map(({ id, name }) => ({ id, name })), b: bImported.map(({ id, name }) => ({ id, name })) },
        original: device!.list, completed, proof, runId: options.runId, diagnosticRevision: revision, servedRevisions, deviceId: aProfile!.deviceId!,
        record: inventory => { report.cleanupInventory = inventory; state.cleanup = { proof: true, startup: inventory.startup, controller: inventory.controller }; event('cleanup-admitted', { inventory }) },
        ports: {
          read: async () => {
            const inventories = { controller: (await snapshotDevice(a!.page, 'cleanup-fresh')).list,
              a: (await api<{ patterns: PatternRecord[] }>(a!.context, 'patterns')).patterns, b: (await api<{ patterns: PatternRecord[] }>(b!.context, 'patterns')).patterns }
            event('cleanup-inventories-read', { inventories }); return inventories
          },
          activate: async pair => {
            state.scope = 'pattern'; state.pendingPattern = pair; state.savedSlots[pair.id] = pair.name
            try { await a!.page.evaluate(async id => { await window.__benchPageAccess.getProvider().setActiveProgram(id, { save: false }) }, pair.id) }
            finally { state.scope = 'idle'; state.pendingPattern = null }
          },
          active: async () => (await snapshotDevice(a!.page, 'cleanup-active')).config.activeProgramId,
          deleteController: async pair => {
            state.scope = 'pattern'; state.pendingPattern = pair; state.savedSlots[pair.id] = pair.name
            try { await a!.page.evaluate(async id => { await window.__benchPageAccess.getProvider().deleteProgram(id) }, pair.id) }
            finally { state.scope = 'idle'; state.pendingPattern = null }
          },
          deleteAccount: async (role, pair) => {
            const response = await byRole(role).request.delete(url(byRole(role), `/api/patterns/${encodeURIComponent(pair.id)}`))
            if (!response.ok()) throw new Error(`Cleanup ${role} account DELETE failed (${response.status()})`)
          },
          readMetadata,
          writeMetadata: async (role, metadata) => {
            for (const [field, key] of [['bindings', 'controller-bindings'], ['pushes', 'controller-push-records'], ['receipts', 'controller-pattern-imports'], ['labels', 'controller-program-labels']] as const) {
              const response = await byRole(role).request.put(url(byRole(role), `/api/controller-metadata/${key}`), { data: { value: metadata[field] } })
              if (!response.ok()) throw new Error(`Cleanup ${role} metadata PUT failed (${response.status()})`)
            }
          },
        } })
      report.cleanup = 'completed'; await close(b.context); b = undefined
    }),
    }
    await runSelectedBenchSteps(options.steps, actions)
    report.outcome = 'completed-selected-prefix'
  } catch (error) {
    readOnly = true; state.scope = 'idle'
    report.failure ??= clean(error); report.outcome = refused ? 'blocked' : 'failed'
    event('run-stopped', { error: clean(error), admissionRefusal: refused })
    // Finalization collects retained worker evidence and closes existing sockets only.
  } finally {
    state.scope = 'idle'; readOnly = true
    try { await flushWorkers() } catch (error) { report.failure ??= clean(error); report.outcome = 'failed' }
    const failures = await finalizeBenchResources(
      [...contexts].map(context => ({ disconnectGate: () => disconnectGate(context), destroy: () => destroyContext(context) })),
      profiles.map(directory => () => rmSync(directory, { recursive: true, force: true })),
    )
    for (const { stage, error } of failures) {
      event('context-close-error', { stage, error: clean(error) }); report.failure ??= clean(error); report.outcome = 'failed'
    }
    report.completedSteps = completed
    report.fixtureSlots = Object.fromEntries(slots); report.admissionRefused = refused; report.events = events
    writeFileSync(join(out, 'report.json'), `${clean(JSON.stringify(report, null, 2))}\n`, { mode: 0o600 })
    const steps = events.filter((e) => e.kind === 'step-end').map((e) => `- Step ${e.step}: ${e.status}; ${Number(e.durationMs).toFixed(1)} ms${e.error ? `; ${e.error}` : ''}`).join('\n')
    const readbacks = events.filter((e) => e.kind === 'slot-readback' || e.kind === 'slot-readback-failed').map((e) => `- ${e.label}: ${e.slot}; SHA-256 ${e.sha256 ?? 'unproved'}${e.error ? `; ${e.error}` : ''}`).join('\n')
    writeFileSync(join(out, 'report.md'), clean(`# Controller import S4 diagnostic\n\nOutcome: ${report.outcome}\n\nDiagnostic revision: ${revision}\n\nServed revisions: ${JSON.stringify(servedRevisions)}\n\n${fidelityCost}\n\n## Temporary extension copy proof\n\n\`\`\`json\n${JSON.stringify(extensionCopyProof, null, 2)}\n\`\`\`\n\n${report.failure ?? ''}\n\nCleanup: ${report.cleanup}\n\nHardware proof attested: ${report.hardwareProofAttested}\n\n${steps}\n\n## Readbacks\n\n${readbacks}\n\nAccount A preservation: ${report.aPreservation ?? 'unproved'}.\n\nA save promise is not flash persistence proof. Artifact assertions prove source integrity, not physical pot/LED behavior. Operator attestation is recorded separately and bound to the run and revisions.\n\nInspect report.json and events.jsonl for exact account/profile snapshots, row messages, source policy, receipt stages, socket event UTC/code witnesses, device identity and screenshot paths. Offline verification leaves real browser integration, native permissions and physical S2/S3 observations unproved.\n`), { mode: 0o600 })
  }
  console.log(`Controller diagnostic ${report.outcome}; private evidence: ${within}/report.md`)
  if (report.outcome !== 'completed-selected-prefix') process.exitCode = 1
}

void run().catch(() => { console.error('Controller diagnostic refused before completion; check arguments and private session inputs. No credentials are printed.'); process.exitCode = 1 })
