/** Explicit, operator-run hardware diagnostic. Never imported by a suite. */
import { chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { parseBenchArgs, validateBenchSessions, assertBenchMutation, type BenchAdmissionState, type BenchMutation, type BenchSession } from './controller-import-hardware-policy'
import { CONTROLLER_DRAIN_PATTERN_SOURCE } from '../src/engine/pushPattern'
import { decodePbp } from '../src/engine/pbpEncode'
import { parsePxlblzBanner } from '../src/engine/artifactStamp'
import type { ControllerConfig, ControllerStatus, ProgramListEntry } from '../src/engine/ControllerProvider'
import type { ControllerProfile } from '../src/engine/controllerProfile'
import type { PatternRecord } from '../src/engine/personalContentRecords'

const help = `Explicit #1221 Controller import diagnostic (no cleanup in S1).
  npm run diagnostic:controller-import -- --device 192.168.8.196 \\
    --url http://localhost:5174/PXLBLZ-IDE/ --session-a <private.json> \\
    --session-b <private.json> --out <ignored-directory> --run
Optional: --headless (full Chromium), --run-id <ASCII-alphanumeric-hyphen>
Uses the real extension and real production Save/Import paths. No hardware runs
are part of automated verification. Read docs/reference/controller-import-hardware-bench.md.
`
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
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
  const hashes: Record<string, string> = {}
  const hashTree = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) hashTree(path)
      else hashes[relative(root, path)] = digest(readFileSync(path))
    }
  }
  hashTree(join(root, 'extension'))
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const report: Event = { version: 1, baseRevision: 'c35e8b767b7acf71bccfdb9600d895234ad7bc8c', productRevision: revision,
    extensionHashes: hashes, accounts: { a: sessions.a.user.userId, b: sessions.b.user.userId },
    outcome: 'blocked', cleanup: 'deferred: S2/S3 hardware proof required', screenshots: [],
    residualGaps: ['S2 hardware persistence/readback qualification pending', 'S3 B brightness-wrapper qualification pending', 'Native permission interaction requires a real operator-capable Chromium host'] }
  const names = [1, 2, 3].map((n) => `Test pat I20-${options.runId} ${n}`)
  const state: BenchAdmissionState = { target: options.device, scope: 'idle', allowedNames: names, pendingSaveName: null, pendingImport: null,
    savedSlots: {}, admittedSlots: {}, priorActiveIds: [], usedDrainIds: [], drainDigest: null, allowNewSaveSlot: false }
  report.fixtureNames = names
  let refused = false
  let readOnly = false
  let importFailed = false
  let probe: Promise<void> | null = null
  const contexts = new Set<BrowserContext>()
  const profiles: string[] = []
  const workers = new Set<Worker>()
  const workerCounts = new Map<Worker, number>()
  const pendingRelay = new Map<string, { slot: string; start: number }>()
  const slots = new Map<string, string>()
  const fixtures: PatternRecord[] = []
  let aSaved: PatternRecord[] = []
  let aProfile: ControllerProfile | undefined
  let bProfile: ControllerProfile | undefined
  let device: Device | undefined
  const selectedImports: { id: string; name: string }[] = []

  const httpProbe = async (label: string, targetMs?: number, completedAt?: number) => {
    if (probe) throw new Error('Overlapping HTTP availability probe refused')
    const start = performance.now()
    probe = (async () => {
      event('http-probe-start', { label, targetMs, elapsedMs: completedAt === undefined ? null : start - completedAt })
      try {
        const response = await fetch(`http://${options.device}/`, { headers: { Connection: 'close' }, signal: AbortSignal.timeout(10_000) })
        const headerMs = performance.now() - start
        const body = await response.arrayBuffer()
        event('http-probe-end', { label, status: response.status, headerMs, durationMs: performance.now() - start, bytes: body.byteLength })
      } catch (error) { event('http-probe-error', { label, durationMs: performance.now() - start, error: clean(error) }) }
    })()
    try { await probe } finally { probe = null }
  }

  const flushWorkers = async () => {
    for (const worker of workers) {
      try {
        const rows = await worker.evaluate(() => {
          const g = globalThis as unknown as { __i20Http?: unknown[] }
          return g.__i20Http ?? []
        })
        const count = workerCounts.get(worker) ?? 0
        for (const row of rows.slice(count)) event('worker-http', row as Event)
        workerCounts.set(worker, rows.length)
      } catch { event('worker-observation-gap', { reason: 'Worker unavailable while collecting observations' }) }
    }
  }
  const installWorker = async (worker: Worker) => {
    if (workers.has(worker)) return
    workers.add(worker)
    event('worker-start', { instance: workers.size, observationGap: true })
    worker.on('close', () => event('worker-stop', { observationGap: true }))
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
          const record: Record<string, unknown> = { path: url.pathname, utc, startMs: start, headersMs: performance.now(), status: response.status, declaredLength: response.headers.get('content-length') }
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
      if (message.kind === 'get-program' && message.slot && (Object.hasOwn(state.savedSlots, message.slot) || Object.hasOwn(state.admittedSlots, message.slot))) {
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
      if (message.phase === 'start' && ['saveProgram', 'pushBytecode', 'setVars', 'setRendererPaused', 'setControls', 'setBrightness', 'setName', 'setPixelCount', 'setActiveProgram', 'deleteProgram', 'setPixelMap'].includes(message.method)) {
        if (readOnly && importFailed && !refused) {
          event('write-sequence-stopped', { method: message.method, span: message.span, reason: 'Earlier import failed; only read-only finalization remains' })
          throw new Error('Earlier import failed; no subsequent device writes admitted')
        }
        try {
          if (refused || readOnly) throw new Error('Writes stopped for this run')
          if (message.status?.kind !== 'connected' || message.status.controller.address !== options.device
            || message.status.controller.deviceId !== (device?.status.kind === 'connected' ? device.status.controller.deviceId : undefined)) throw new Error('Connected physical target changed')
          const opts = message.args?.[1] as { id?: string; name?: string } | undefined
          const mutation = message.method === 'saveProgram' ? { method: 'saveProgram', id: opts?.id ?? '', pbp: new Uint8Array(message.bytes ?? []) } as const
            : message.method === 'pushBytecode' ? { method: 'pushBytecode', id: opts?.id ?? '', name: opts?.name, digest: digest(new Uint8Array(message.bytes ?? [])) } as const
              : { method: message.method } as BenchMutation
          assertBenchMutation(mutation, state)
          event('admission', { method: message.method, span: message.span, id: opts?.id, name: opts?.name, overheadMs: performance.now() - start })
          if (message.method === 'saveProgram') {
            if (!probe) void httpProbe(`concurrent-save-${message.span}`)
            else event('http-probe-skipped', { span: message.span, reason: 'Previous availability probe remains in flight; one-in-flight boundary preserved' })
          }
        } catch (error) {
          refused = true; readOnly = true; state.scope = 'idle'
          event('admission-refused', { method: message.method, span: message.span, overheadMs: performance.now() - start, error: clean(error) })
          throw new Error('Hardware admission refused; abort run', { cause: error })
        }
      }
      if (message.phase === 'end' && message.method === 'compile' && message.source === CONTROLLER_DRAIN_PATTERN_SOURCE) state.drainDigest = digest(new Uint8Array(message.bytes ?? []))
      if (message.phase === 'error' && state.scope === 'import') {
        importFailed = true; readOnly = true
        event('import-write-sequence-stopped', { method: message.method, reason: 'Provider error; subsequent operations are read-only' })
      }
      if (message.phase === 'end' && message.method === 'pushBytecode' && state.scope === 'import') {
        const opts = message.args?.[1] as { id: string; name?: string }
        if (opts.name && selectedImports[0]?.id === opts.id) {
          selectedImports.shift(); state.pendingImport = selectedImports[0] ?? null
        }
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
    await page.evaluate(async (moduleUrl) => {
      const { ExtensionControllerProvider } = await import(/* @vite-ignore */ moduleUrl)
      const prototype = ExtensionControllerProvider.prototype
      if (prototype.__i20Wrapped) throw new Error('Provider already wrapped')
      prototype.__i20Wrapped = true
      const w = window as unknown as { __i20Span: (message: unknown) => Promise<void> }
      let span = 0
      for (const method of ['compile', 'getActiveProgramBytecodeSize', 'saveProgram', 'pushBytecode', 'readSavedProgram', 'getConfig', 'listPrograms', 'setVars', 'setRendererPaused', 'setControls', 'setBrightness', 'setName', 'setPixelCount', 'setActiveProgram', 'deleteProgram', 'setPixelMap']) {
        const original = prototype[method]
        if (typeof original !== 'function') throw new Error(`Missing real provider method ${method}`)
        prototype[method] = async function (...args: unknown[]) {
          const id = ++span
          const common = { method, span: id, args: ['saveProgram', 'pushBytecode'].includes(method) ? [null, args[1]] : [], source: method === 'compile' ? args[0] : undefined }
          const bytes = ['saveProgram', 'pushBytecode'].includes(method) ? Array.from(args[0] as Uint8Array) : undefined
          await w.__i20Span({ ...common, phase: 'start', time: performance.now(), utc: new Date().toISOString(), bytes, status: this.getStatus() })
          try {
            void w.__i20Span({ ...common, phase: 'execute', time: performance.now(), utc: new Date().toISOString() })
            const result = await original.apply(this, args)
            await w.__i20Span({ ...common, phase: 'end', time: performance.now(), utc: new Date().toISOString(), bytes: method === 'compile' ? Array.from(result as Uint8Array) : undefined,
              result: ['getActiveProgramBytecodeSize', 'getConfig', 'listPrograms'].includes(method) ? result : undefined })
            return result
          } catch (error) {
            await w.__i20Span({ ...common, phase: 'error', time: performance.now(), utc: new Date().toISOString(), error: error instanceof Error ? error.message : 'Provider rejected' })
            throw error
          }
        }
      }
    }, new URL('src/engine/ExtensionControllerProvider.ts', options.url).href)
  }

  const open = async (profile: string, session: BenchSession) => {
    const extension = resolve(root, 'extension')
    const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: options.headless,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`], viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, baseURL: options.url })
    contexts.add(context)
    await context.addCookies([session.cookie])
    // Disposable diagnostic profiles only: suppress remembered startup connects.
    // The real provider is instrumented after navigation, before explicit Connect.
    await context.addInitScript(() => {
      localStorage.removeItem('pixelblaze-controller')
    })
    context.on('serviceworker', (worker) => { void installWorker(worker).catch(() => { event('worker-observation-gap', { reason: 'Worker instrumentation failed' }); readOnly = true }) })
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
    await installWorker(worker)
    const me = await context.request.get('http://localhost:5174/api/me')
    const identity = await me.json() as { authenticated?: boolean; user?: { id?: string } }
    if (!me.ok() || !identity.authenticated || identity.user?.id !== session.user.userId) throw new Error('Synthetic /api/me identity mismatch')
    event('identity-verified', { userId: session.user.userId })
    const served = await context.request.get('http://localhost:5174/__identity')
    if (!served.ok()) throw new Error('Served product revision cannot be verified')
    const runtime = await served.json() as { project?: string; commit?: string; worktree?: string }
    if (runtime.project !== 'pxlblz-ide' || !runtime.commit || !/^[a-f0-9]{40}$/.test(runtime.commit)) throw new Error('Invalid served product identity')
    if (report.servedRevision && report.servedRevision !== runtime.commit) throw new Error('Served product changed during the diagnostic')
    report.diagnosticRevision = revision; report.productRevision = runtime.commit; report.servedRevision = runtime.commit
    event('served-product', { commit: runtime.commit, worktree: runtime.worktree })
    const page = context.pages()[0] ?? await context.newPage()
    await installPage(page)
    return { context, page, worker }
  }
  const close = async (context: BrowserContext) => { await flushWorkers(); await context.close(); contexts.delete(context) }
  const api = async <T>(context: BrowserContext, resource: string): Promise<T> => {
    const response = await context.request.get(`http://localhost:5174/api/${resource}`)
    if (!response.ok()) throw new Error(`Account GET ${resource} failed (${response.status()})`)
    return response.json() as Promise<T>
  }
  const post = async (context: BrowserContext, resource: string, data: unknown) => {
    if (refused || readOnly) throw new Error('Account setup refused after stop')
    const response = await context.request.post(`http://localhost:5174/api/${resource}`, { data })
    if (!response.ok()) throw new Error(`Account setup ${resource} failed (${response.status()})`)
  }
  const account = async (context: BrowserContext) => ({ patterns: await api<{ patterns: PatternRecord[] }>(context, 'patterns'),
    controllers: await api<{ controllers: ControllerProfile[] }>(context, 'controllers'), bindings: await api(context, 'controller-metadata/controller-bindings'),
    pushes: await api(context, 'controller-metadata/controller-push-records'), receipts: await api(context, 'controller-metadata/controller-pattern-imports') })
  const capture = async (page: Page, label: string) => {
    for (const width of [1440, 760]) {
      await page.setViewportSize({ width, height: 1000 })
      const file = `${label}-${width}.png`; await page.screenshot({ path: join(out, file) })
      ;(report.screenshots as string[]).push(file)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  const connect = async (page: Page, worker: Worker) => {
    await wrapProvider(page)
    const connectButton = page.getByRole('button', { name: 'Connect a Controller', exact: true })
    await expect(connectButton).toBeVisible()
    await connectButton.click()
    await page.getByRole('textbox', { name: 'Controller IP address' }).fill(options.device)
    await page.getByTestId('controller-go').click()
    const origins = [`http://${options.device}/*`, `ws://${options.device}/*`]
    const permission = await worker.evaluate(async (origins) => {
      const chrome = (globalThis as unknown as { chrome: { permissions: { contains: (arg: { origins: string[] }) => Promise<boolean> } } }).chrome
      return chrome.permissions.contains({ origins })
    }, origins)
    if (!permission) {
      await expect(page.getByTestId('controller-pill')).toHaveAttribute('data-phase', /connecting|authorizing/)
      const popup = await page.context().newPage()
      await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`)
      const grant = popup.getByRole('button', { name: 'Grant access', exact: true })
      await expect(grant).toBeVisible()
      await grant.click()
      // Chromium's native host-permission prompt is intentionally not bypassed.
      const granted = await worker.evaluate(async (origins) => {
        const chrome = (globalThis as unknown as { chrome: { permissions: { contains: (arg: { origins: string[] }) => Promise<boolean> } } }).chrome
        return chrome.permissions.contains({ origins })
      }, origins)
      if (!granted) throw new Error('Native Chromium host-permission grant did not complete after real Grant access click')
      if (!popup.isClosed()) await popup.close()
    }
    await expect(page.getByTestId('controller-pill')).toHaveAttribute('data-phase', 'live')
  }
  const snapshotDevice = async (page: Page, label: string, map = false) => {
    const snapshot = await page.evaluate(async ({ moduleUrl, map }) => {
      const { getControllerProvider } = await import(/* @vite-ignore */ moduleUrl)
      const providerUrl = moduleUrl.replace('controllerProviderRegistry.ts', 'ExtensionControllerProvider.ts')
      const { ExtensionControllerProvider } = await import(/* @vite-ignore */ providerUrl)
      const provider = getControllerProvider()
      if (!(provider instanceof ExtensionControllerProvider)) throw new Error('Real ExtensionControllerProvider is required')
      return { status: provider.getStatus(), config: await provider.getConfig(), list: await provider.listPrograms(), ...(map ? { map: await provider.getPixelMap() } : {}) }
    }, { moduleUrl: new URL('src/engine/controllerProviderRegistry.ts', options.url).href, map }) as Device
    event('device-snapshot', { label, ...snapshot })
    const active = snapshot.config.activeProgramId
    if (active && !state.priorActiveIds.includes(active)) state.priorActiveIds.push(active)
    return snapshot
  }
  const activeWitness = async (page: Page, label: string) => {
    try {
      const config = await page.evaluate(async (moduleUrl) => {
        const { getControllerProvider } = await import(/* @vite-ignore */ moduleUrl)
        return getControllerProvider().getConfig()
      }, new URL('src/engine/controllerProviderRegistry.ts', options.url).href) as ControllerConfig
      event('active-witness', { label, activeProgramId: config.activeProgramId ?? null, config })
      if (config.activeProgramId && !state.priorActiveIds.includes(config.activeProgramId)) state.priorActiveIds.push(config.activeProgramId)
    } catch (error) { event('active-read-failed', { label, activeProgramId: null, error: clean(error) }) }
  }
  const readSlot = async (page: Page, slot: string, label: string) => {
    try {
      const result = await page.evaluate(async ({ slot, moduleUrl }) => {
        const { getControllerProvider } = await import(/* @vite-ignore */ moduleUrl)
        const saved = await getControllerProvider().readSavedProgram(slot)
        return saved?.storedArtifact ? Array.from(saved.storedArtifact.pbp as Uint8Array) : null
      }, { slot, moduleUrl: new URL('src/engine/controllerProviderRegistry.ts', options.url).href })
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
    const records = await api<{ controllers: ControllerProfile[] }>(context, 'controllers')
    const matches = records.controllers.filter((p) => p.deviceId === expected.deviceId)
    if (matches.length > 1) throw new Error('Multiple physical profiles require operator resolution')
    if (matches.length) {
      const existing = matches[0]
      event('existing-profile', { role, profile: existing })
      const input = existing.inputs[0]
      const transform = existing.globalTransforms[0]
      const aShape = existing.inputs.length === 0 && existing.globalTransforms.length === 0
      const bShape = existing.inputs.length === 1 && existing.globalTransforms.length === 1
        && input.pin === 35 && input.signal === 'analog' && input.smoothing === 1 && input.fallback === 0.5 && !input.invert
        && transform.type === 'hardware-brightness' && transform.enabled && transform.inputId === input.id && transform.mode === 'multiply-output'
      if (!(role === 'a' ? aShape : bShape) || existing.keepPatternsUpToDate === true
        || existing.patternBindings.length !== 0 || existing.electricalProfile !== undefined) throw new Error('Existing synthetic profile differs; preserved without overwrite')
      return existing
    }
    await post(context, 'controllers', expected)
    event('profile-created', { role, profile: expected })
    return expected
  }
  const step = async (number: number, action: () => Promise<void>) => {
    const start = performance.now(); event('step-start', { step: number })
    try { await action(); event('step-end', { step: number, status: 'complete', durationMs: performance.now() - start }) }
    catch (error) { event('step-end', { step: number, status: 'blocked', durationMs: performance.now() - start, error: clean(error) }); throw error }
    finally { await flushWorkers() }
  }
  const uiSave = async (page: Page, name: string, newSlot: boolean) => {
    state.scope = 'save'; state.pendingSaveName = name; state.allowNewSaveSlot = newSlot
    try {
      const row = page.getByTestId('controller-action-row')
      if (!await row.isVisible()) await page.getByTestId('controller-pill').click()
      const button = row.getByRole('button', { name: 'Save', exact: true })
      await expect(button).toBeEnabled(); await button.click(); await expect(button).toBeDisabled()
      await expect.poll(async () => page.evaluate(async (moduleUrl) => {
        const { useControllerStore } = await import(/* @vite-ignore */ moduleUrl)
        const current = useControllerStore.getState()
        return current.pushing ? 'pending' : current.pushResult?.ok ? 'saved' : current.pushResult ? 'failed' : 'pending'
      }, new URL('src/store/controllerStore.ts', options.url).href), { timeout: 90_000 }).not.toBe('pending')
      if (refused) throw new Error('Admission refused during Save')
      const slot = Object.entries(state.admittedSlots).find(([, n]) => n === name)?.[0]
      // This is an admitted pair, not a claim of persistence. Capture real list separately.
      if (!slot) throw new Error('Save did not admit the pending fixture')
      const saved = await page.evaluate(async (moduleUrl) => {
        const { useControllerStore } = await import(/* @vite-ignore */ moduleUrl)
        return useControllerStore.getState().pushResult
      }, new URL('src/store/controllerStore.ts', options.url).href)
      if (!saved?.ok) throw new Error('Studio Save failed; no automatic retry')
      slots.set(name, slot)
      const listed = await snapshotDevice(page, `saved-list-${name}`)
      for (const entry of listed.list) state.savedSlots[entry.id] = entry.name
      const decoded = await readSlot(page, slot, `save-${names.indexOf(name) + 1}`)
      if (decoded?.name !== name) throw new Error('Initial Save flash readback is unproved')
      event('save-account', { name, snapshot: await account(page.context()) })
    } finally { state.scope = 'idle'; state.allowNewSaveSlot = false; await activeWitness(page, `after-save-${name}`) }
  }

  let a: Awaited<ReturnType<typeof open>> | undefined
  let b: Awaited<ReturnType<typeof open>> | undefined
  let aDisk = ''
  let bDisk = ''
  try {
    aDisk = mkdtempSync(join(tmpdir(), 'pxlblz-i20-a-')); profiles.push(aDisk)
    bDisk = mkdtempSync(join(tmpdir(), 'pxlblz-i20-b-')); profiles.push(bDisk)
    await step(1, async () => {
      a = await open(aDisk, sessions.a)
      // Verify B before the first account or hardware setup. Never connect B concurrently.
      b = await open(bDisk, sessions.b)
      event('account-baseline', { role: 'a', snapshot: await account(a.context) })
      event('account-baseline', { role: 'b', snapshot: await account(b.context) })
      await close(b.context); b = undefined
      await a.page.goto(new URL('studio/patterns', options.url).href)
      await connect(a.page, a.worker)
      device = await snapshotDevice(a.page, 'baseline', true)
      report.device = device
      if (device.status.kind !== 'connected' || !device.status.controller.deviceId || device.config.name !== 'Cark'
        || device.config.firmwareVersion !== '3.70' || device.config.pixelCount !== 256 || device.map?.length !== 256
        || device.map.some((point) => point.length !== 2)) throw new Error('Target is not the qualified #2 Cark / 3.70 / 256px / 2D Controller')
      state.savedSlots = Object.fromEntries(device.list.map((p) => [p.id, p.name]))
      if (Object.values(state.savedSlots).some((n) => names.includes(n))) throw new Error('Run fixture names already exist')
      await httpProbe('baseline')
      aProfile = await profile(a.context, 'a')
      for (let index = 0; index < names.length; index++) {
        const color = ['1,0,0', '0,1,0', '0,0,1'][index]
        const record: PatternRecord = { id: `i20-${options.runId}-${index + 1}`, name: names[index], src: `export function render(index) { rgb(${color}) }\nexport function render2D(index,x,y) { rgb(${color}) }`, controls: {}, updatedAt: Date.now() }
        const existing = await api<{ patterns: PatternRecord[] }>(a.context, 'patterns')
        if (existing.patterns.some((p) => p.id === record.id || p.name === record.name)) throw new Error('Run Pattern identity already exists')
        await post(a.context, 'patterns', record); fixtures.push(record)
        await a.page.goto(new URL(`studio/patterns/${record.id}`, options.url).href)
        // A full route load creates a fresh provider; install before its explicit Connect.
        await connect(a.page, a.worker)
        await uiSave(a.page, record.name, true)
      }
      aSaved = (await api<{ patterns: PatternRecord[] }>(a.context, 'patterns')).patterns.filter((p) => fixtures.some((f) => f.id === p.id))
      report.aSavedSnapshot = aSaved
      await close(a.context); a = undefined
    })
    await step(2, async () => {
      b = await open(bDisk, sessions.b); bProfile = await profile(b.context, 'b')
      await b.page.goto(new URL(`studio/controllers/${bProfile.id}`, options.url).href)
      await connect(b.page, b.worker); await snapshotDevice(b.page, 'B-connected', true)
    })
    await step(3, async () => {
      const table = b!.page.getByRole('table', { name: 'Unimported PXLBLZ Patterns', exact: true })
      for (const name of names) await expect(table).toContainText(name)
      event('unimported-rows', { classification: 'Unimported PXLBLZ Patterns', rows: await table.locator('tr').evaluateAll((rows) => rows.map((row) => ({ text: row.textContent, className: row.className }))) })
      await capture(b!.page, 'unimported')
    })
    const observeImportFailure = (error: unknown) => {
      if (refused) throw error
      readOnly = true; state.scope = 'idle'
      if (!importFailed) { report.failure = clean(error); report.outcome = 'blocked' }
      event(importFailed ? 'import-error' : 'import-verification-blocked', { error: clean(error), followingActions: 'read-only' })
    }
    await step(4, async () => {
      const page = b!.page
      state.scope = 'import'; state.pendingImport = { id: slots.get(names[0])!, name: names[0] }
      selectedImports.push(state.pendingImport)
      try {
        await page.getByRole('button', { name: `Import ${names[0]}`, exact: true }).click()
        const dialog = page.getByRole('alertdialog')
        await dialog.getByRole('button', { name: 'Import and save', exact: true }).click()
        await expect.poll(async () => /\/studio\/patterns\//.test(page.url()) || await dialog.getByRole('button', { name: 'Retry', exact: true }).isVisible(), { timeout: 120_000 }).toBe(true)
        event('single-import-outcome', { url: new URL(page.url()).pathname, visible: await page.locator('body').innerText(), snapshot: await account(b!.context) })
        if (refused) throw new Error('Admission refused during Import')
        if (!/\/studio\/patterns\//.test(page.url())) { importFailed = true; readOnly = true; return }
        const source = await readSlot(page, slots.get(names[0])!, 'single-import')
        event('wrapper-qualification', { source: source?.sourceCode ?? null, literalAnalogRead35: source ? /analogRead\s*\(\s*35\s*\)/.test(source.sourceCode) : null,
          expected: 'Current stored/wrapped behavior; missing B brightness wrapper is S3 qualification pending' })
        const editor = page.locator('.monaco-editor').first().getByRole('textbox', { name: 'Editor content', exact: true })
        const importedId = new URL(page.url()).pathname.split('/').at(-1)!
        const saved = page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname.endsWith(`/api/patterns/${importedId}`) && response.ok())
        await editor.focus(); await editor.press('Control+End'); await editor.press('End'); await editor.press('Enter'); await page.keyboard.type('// I20 bench edit'); await saved
        await uiSave(page, names[0], false)
        await capture(page, 'single-import')
      } finally { state.scope = 'idle'; selectedImports.length = 0; await activeWitness(page, 'after-single-import') }
    }).catch(observeImportFailure)
    await step(5, async () => {
      if (readOnly) { event('bulk-interaction-skipped', { reason: 'Prior import failure; remaining actions are read-only' }); return }
      const page = b!.page
      await page.goto(new URL(`studio/controllers/${bProfile!.id}`, options.url).href)
      await connect(page, b!.worker)
      event('bulk-footprint', { reason: 'Full reload creates a fresh real provider; known active footprint remains null so production requiresControllerDrain(incoming,null) is exercised' })
      const table = page.getByRole('table', { name: 'Unimported PXLBLZ Patterns', exact: true })
      await page.getByRole('button', { name: 'Select Unimported PXLBLZ Patterns', exact: true }).click()
      const before = await account(b!.context); const writesBefore = events.filter((e) => e.kind === 'admission').length
      await table.getByRole('checkbox', { name: 'Select all Unimported PXLBLZ Patterns', exact: true }).check()
      const openImport = page.getByRole('button', { name: 'Import', exact: true })
      await openImport.click(); await capture(page, 'bulk-cancel-confirmation')
      await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
      if (JSON.stringify(await account(b!.context)) !== JSON.stringify(before) || events.filter((e) => e.kind === 'admission').length !== writesBefore) throw new Error('Cancellation changed account records or device writes')
      event('bulk-cancel-preservation', { unchanged: true })
      await table.getByRole('checkbox', { name: 'Select all Unimported PXLBLZ Patterns', exact: true }).uncheck()
      for (const name of names.slice(1)) {
        const checkbox = table.getByRole('checkbox', { name: `Select ${name}`, exact: true })
        if (!await checkbox.isEnabled()) { event('bulk-selection-blocked', { name, reason: 'Running row disabled by current selection policy; no alternate Pattern played' }); readOnly = true; report.outcome = 'blocked'; return }
        await checkbox.check()
      }
      if (readOnly) { event('bulk-write-skipped', { reason: 'Prior import failure; remaining actions are read-only' }); return }
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
        if (!text.includes('2 imported')) { importFailed = true; readOnly = true }
      } finally { state.scope = 'idle'; selectedImports.length = 0; await activeWitness(page, 'after-bulk') }
    }).catch(observeImportFailure)
    const batchCompletedAt = performance.now()
    for (const target of [0, 5_000, 15_000, 30_000]) {
      await delay(Math.max(0, batchCompletedAt + target - performance.now()))
      if (probe) await probe
      await httpProbe(`post-import-${target}`, target, batchCompletedAt)
    }
    for (const [name, slot] of slots) await readSlot(b!.page, slot, `post-batch-${names.indexOf(name) + 1}`)
    await step(6, async () => {
      await close(b!.context); b = undefined
      a = await open(aDisk, sessions.a)
      const records = (await api<{ patterns: PatternRecord[] }>(a.context, 'patterns')).patterns.filter((p) => fixtures.some((f) => f.id === p.id))
      const unchanged = JSON.stringify(records) === JSON.stringify(aSaved)
      event('A-preservation', { unchanged, before: aSaved, after: records }); report.aPreservation = unchanged
      if (!unchanged) throw new Error('Account A fixtures changed')
      await a.page.goto(new URL(`studio/controllers/${aProfile!.id}`, options.url).href)
      await connect(a.page, a.worker)
      event('A-saved-classification', { text: await a.page.getByTestId('controller-saved-programs-pane').innerText() })
      await capture(a.page, 'A-final'); await activeWitness(a.page, 'final')
    })
    await step(7, async () => { event('cleanup-deferred', { reason: 'S2/S3 hardware proof required; DELETE NOTHING in S1' }) })
    if (importFailed) report.outcome = 'reproduced'
    else if (!readOnly) report.outcome = 'not-reproduced'
  } catch (error) {
    readOnly = true; state.scope = 'idle'
    report.failure = clean(error); report.outcome = refused ? 'blocked' : importFailed ? 'reproduced' : 'blocked'
    event('run-stopped', { error: clean(error), admissionRefusal: refused })
    // A verification failure never licenses another write. Preserve available read witnesses.
    const page = b?.page ?? a?.page
    if (page && !page.isClosed()) await activeWitness(page, 'stopped-final')
  } finally {
    state.scope = 'idle'; readOnly = true
    if (probe) await probe
    await flushWorkers()
    for (const context of contexts) { try { await context.close() } catch { event('context-close-error') } }
    for (const directory of profiles) rmSync(directory, { recursive: true, force: true })
    report.fixtureSlots = Object.fromEntries(slots); report.admissionRefused = refused; report.events = events
    writeFileSync(join(out, 'report.json'), `${clean(JSON.stringify(report, null, 2))}\n`, { mode: 0o600 })
    const steps = events.filter((e) => e.kind === 'step-end').map((e) => `- Step ${e.step}: ${e.status}; ${Number(e.durationMs).toFixed(1)} ms${e.error ? `; ${e.error}` : ''}`).join('\n')
    const readbacks = events.filter((e) => e.kind === 'slot-readback' || e.kind === 'slot-readback-failed').map((e) => `- ${e.label}: ${e.slot}; SHA-256 ${e.sha256 ?? 'unproved'}${e.error ? `; ${e.error}` : ''}`).join('\n')
    writeFileSync(join(out, 'report.md'), clean(`# Controller import hardware diagnostic\n\nOutcome: ${report.outcome}\n\nRevision: ${revision}\n\n${report.failure ?? ''}\n\nCleanup: ${report.cleanup}\n\n${steps}\n\n## Readbacks\n\n${readbacks}\n\nAccount A preservation: ${report.aPreservation ?? 'unproved'}.\n\nNo causal claim follows from temporal correlation. A save promise is not flash persistence proof. The relay PBP bytes are the authoritative artifact witness; worker clones and HTTP probes are timing observations.\n\nInspect report.json and events.jsonl for exact account/profile snapshots, row messages, source policy, receipt stages, timing spans, device identity and screenshot paths. S2 persistence/readback and S3 B wrapper hardware proof remain pending.\n`), { mode: 0o600 })
  }
  console.log(`Controller diagnostic ${report.outcome}; private evidence: ${within}/report.md`)
  if (report.outcome === 'blocked' || importFailed) process.exitCode = 1
}

void run().catch(() => { console.error('Controller diagnostic refused before completion; check arguments and private session inputs. No credentials are printed.'); process.exitCode = 1 })
