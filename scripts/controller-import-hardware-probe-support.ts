import { createHash } from 'node:crypto'
import type { PixelblazeConnection, WebSocketLike } from '../src/engine/PixelblazeConnection'
import type { ControllerPatternImportExecutionDeps } from '../src/engine/controllerPatternImportExecution'
import { recoverSavedProgram, type RecoveredSavedProgram } from '../src/engine/controllerSavedProgramRead'
import { CONTROLLER_DRAIN_PATTERN_SOURCE } from '../src/engine/pushPattern'

export const PROBE_HOST = '192.168.8.196'
export const PROBE_FIDELITY = 'Direct engine/protocol probe without extension relay, UI or store guards; probe HTTP scheduling and cancellation differ.'
export type ProbePhase = 'setup' | 'import' | 'observation' | 'restore'
export type ProbeFields = Record<string, unknown>
class ProbeSavedProgramDecodeError extends Error {}

export class ProbeHttpQueue {
  private readonly owners = new Set<object>()
  private readonly listeners = new Set<(held: boolean) => void>()
  get saveHeld() { return this.owners.size > 0 }
  beginSave(owner: object) {
    const held = this.saveHeld; this.owners.add(owner)
    if (!held) for (const listener of this.listeners) listener(true)
  }
  endSave(owner: object) {
    if (!this.owners.delete(owner) || this.saveHeld) return
    for (const listener of this.listeners) listener(false)
    this.wake()
  }
  onSaveHoldChange(listener: (held: boolean) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener) }
  }
  private wake() { for (const turn of this.waiting.splice(0)) turn() }
  private waitForSave(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => { unsubscribe(); signal?.removeEventListener('abort', abort) }
      const abort = () => { cleanup(); reject(signal?.reason ?? new Error('HTTP turn cancelled')) }
      const unsubscribe = this.onSaveHoldChange((held) => { if (!held) { cleanup(); resolve() } })
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      else if (!this.saveHeld) { cleanup(); resolve() }
    })
  }
  private active = 0
  private readonly waiting: (() => void)[] = []
  readonly stats = { admitted: 0, cancelled: 0, maxConcurrent: 0, totalWaitMs: 0, maxWaitMs: 0 }
  constructor(readonly mode: 'overlap' | 'serial', readonly recorder: ProbeEventRecorder,
    private readonly now = () => performance.now()) {}
  run<T>(operation: string, fields: ProbeFields, action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const queuedAt = this.now()
    return this.recorder.span('http.queue', { ...fields, requestOperation: operation, mode: this.mode }, async (details) => {
      try { await new Promise<void>((resolve, reject) => {
        const abort = () => {
          const index = this.waiting.indexOf(admit)
          if (index >= 0) this.waiting.splice(index, 1)
          this.stats.cancelled++
          reject(signal?.reason ?? new Error('HTTP turn cancelled'))
        }
        const admit = () => {
          if (this.saveHeld || (this.mode === 'serial' && this.active > 0)) { this.waiting.push(admit); return }
          signal?.removeEventListener('abort', abort)
          if (signal?.aborted) { abort(); return }
          this.active++; this.stats.admitted++
          this.stats.maxConcurrent = Math.max(this.stats.maxConcurrent, this.active)
          resolve()
        }
        if (signal?.aborted) { abort(); return }
        signal?.addEventListener('abort', abort, { once: true })
        if (!this.saveHeld && (this.mode === 'overlap' || this.active === 0)) admit()
        else this.waiting.push(admit)
      }) } finally {
        const waitMs = this.now() - queuedAt
        details.queueWaitMs = waitMs
        this.stats.totalWaitMs += waitMs; this.stats.maxWaitMs = Math.max(this.stats.maxWaitMs, waitMs)
      }
      // End the explicit queue span at admission; request service time is separate.
    }).then(async () => {
      try {
        while (this.saveHeld) await this.waitForSave(signal)
        signal?.throwIfAborted(); return await action()
      }
      finally { this.active--; this.wake() }
    })
  }
}

/** Observe ownership independently of protocol parsing; relay the original event. */
export function gateProbeSaveSocket(socket: WebSocketLike, queue: ProbeHttpQueue, _fields?: () => ProbeFields): WebSocketLike {
  const wrapped: WebSocketLike = {
    get readyState() { return socket.readyState },
    set readyState(value) { socket.readyState = value },
    send(data) {
      if (data instanceof Uint8Array && data[0] === 1 && (data[1] & 1) !== 0) queue.beginSave(socket)
      socket.send(data)
    },
    close() { socket.close() },
    onopen: socket.onopen, onclose: socket.onclose, onerror: socket.onerror, onmessage: socket.onmessage,
  }
  socket.onopen = (event) => wrapped.onopen?.(event)
  socket.onerror = (event) => wrapped.onerror?.(event)
  socket.onclose = (event) => { queue.endSave(socket); wrapped.onclose?.(event) }
  socket.onmessage = (event) => {
    if (typeof event.data === 'string') {
      try {
        const message: unknown = JSON.parse(event.data)
        if (message !== null && typeof message === 'object' &&
          'saveProgramSourceFile' in message && message.saveProgramSourceFile !== undefined) queue.endSave(socket)
      } catch { /* Malformed observations still reach the protocol unchanged. */ }
    }
    wrapped.onmessage?.(event)
  }
  return wrapped
}

export type ProbeStop = { phase: ProbePhase; operation: string; saveOrdinal?: number; slot?: string;
  savePhase?: ProbePhase; saveCorrelation?: 'last-attempt' | 'none' }
export type ProbeBatchResult = {
  success: boolean; httpStopped: boolean; connected: boolean; qualified: boolean;
  firstStop?: ProbeStop
}
export async function runProbeBatches<T extends ProbeBatchResult>(repeat: number, runBatch: (batchIndex: number) => Promise<T>) {
  if (!Number.isSafeInteger(repeat) || repeat < 1) throw new Error('Invalid repeat count')
  const batches: T[] = []
  const outcomes: { batchIndex: number; status: string }[] = []
  let firstStop: (ProbeStop & { batchIndex: number }) | undefined
  for (let batchIndex = 1; batchIndex <= repeat; batchIndex++) {
    let result: T
    try { result = await runBatch(batchIndex) }
    catch {
      outcomes.push({ batchIndex, status: 'setup-failed' })
      firstStop = { batchIndex, phase: 'setup', operation: 'batch.setup', saveCorrelation: 'none' }; break
    }
    batches.push(result)
    outcomes.push({ batchIndex, status: result.httpStopped ? 'stopped-http-unavailable' : !result.connected ? 'lost-connection' :
      !result.qualified ? 'unqualified' : !result.success ? 'failed' : 'qualified' })
    if (!result.success || result.httpStopped || !result.connected || !result.qualified) {
      firstStop = { batchIndex, phase: 'setup', operation: result.connected ? 'batch.result' : 'connection.lost', ...result.firstStop }
      break
    }
  }
  return { requested: repeat, completed: batches.length, batches, outcomes, firstStop,
    success: !firstStop && batches.length === repeat }
}
export type ProbeEvent = ProbeFields & {
  spanId: string; event: 'start' | 'end' | 'error'; operation: string; utc: string; elapsedMs: number; durationMs?: number
}

export function byteSummary(bytes: Uint8Array) {
  return { byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/** Fixture staging only; production import reads never retry. */
export async function waitForFixtureReadback(
  read: (remainingMs: number) => Promise<RecoveredSavedProgram | null>, expected: Uint8Array,
  options: { now: () => number; wait: (ms: number) => Promise<void>; assertCurrent: () => void; timeoutMs?: number },
): Promise<void> {
  const deadline = options.now() + (options.timeoutMs ?? 5000)
  const expectedHash = byteSummary(expected).sha256
  while (true) {
    options.assertCurrent()
    const remaining = deadline - options.now()
    if (remaining <= 0) throw new Error('Setup read deadline exceeded')
    let saved: RecoveredSavedProgram | null = null
    try { saved = await read(remaining) }
    catch (error) {
      if (!(error instanceof ProbeSavedProgramDecodeError)) throw error
    }
    options.assertCurrent()
    if (options.now() >= deadline) throw new Error('Setup read deadline exceeded')
    if (saved?.storedArtifact && byteSummary(saved.storedArtifact.pbp).sha256 === expectedHash) return
    await options.wait(Math.min(100, deadline - options.now()))
  }
}

/** Only explicit metadata is recorded. Action results (config/source/PBP) are never serialized. */
export class ProbeEventRecorder {
  private sequence = 0
  private readonly origin: number
  readonly events: ProbeEvent[] = []
  constructor(private readonly sink: (jsonLine: string) => void,
    private readonly wall = () => new Date(), private readonly monotonic = () => performance.now()) {
    this.origin = monotonic()
  }
  async span<T>(operation: string, fields: ProbeFields, action: (details: ProbeFields) => Promise<T> | T): Promise<T> {
    const spanId = `span-${++this.sequence}`
    const start = this.monotonic()
    const emit = (event: ProbeEvent['event'], extra: ProbeFields = {}) => {
      const now = this.monotonic()
      const row: ProbeEvent = { ...fields, ...extra, spanId, event, operation, utc: this.wall().toISOString(),
        elapsedMs: now - this.origin, ...(event === 'start' ? {} : { durationMs: now - start }) }
      this.events.push(row); this.sink(JSON.stringify(row))
    }
    emit('start')
    const details: ProbeFields = {}
    try { const result = await action(details); emit('end', details); return result }
    catch (error) { emit('error', { ...details, error: error instanceof Error ? error.message : String(error) }); throw error }
  }
}

/** Deliberately excludes raw error text and arbitrary event fields from stdout. */
export function sanitizedTimingTable(events: readonly ProbeEvent[]) {
  return events.filter((e) => e.event !== 'start').map((e) => ({
    operation: e.operation, phase: e.phase, case: e.case, spanId: e.spanId, utc: e.utc,
    elapsedMs: e.elapsedMs, durationMs: e.durationMs, outcome: e.event,
    status: e.status, byteLength: e.byteLength, sha256: e.sha256,
    slot: e.slot, name: e.name, activation: e.activation, mode: e.mode,
    path: e.path, requestOperation: e.requestOperation, queueWaitMs: e.queueWaitMs,
    saveOrdinal: e.saveOrdinal, savePhase: e.savePhase, saveSlot: e.saveSlot,
  }))
}

export function successfulProbeSaves(events: readonly ProbeEvent[]) {
  const completions = events.filter((event) => event.operation === 'saveProgram' && event.event === 'end')
    .map(({ saveOrdinal, phase, slot, durationMs }) => ({ saveOrdinal, phase, slot, durationMs }))
  return { completions, count: completions.length, maxDurationMs: Math.max(0, ...completions.map((save) => save.durationMs ?? 0)) }
}

export type ProbeArgs = { device: typeof PROBE_HOST; case: 'drain' | 'control'; runId: string; run: true; http: 'overlap' | 'serial'; repeat: number }
export function parseProbeArgs(argv: string[]): ProbeArgs | { help: true } {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { help: true }
  const values = new Map<string, string | true>()
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!['--device', '--case', '--run-id', '--run', '--http', '--repeat'].includes(key) || values.has(key)) throw new Error('Unknown or repeated argument')
    if (key === '--run') values.set(key, true)
    else { const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error('Missing argument'); values.set(key, value) }
  }
  if (values.get('--device') !== PROBE_HOST || values.get('--run') !== true) throw new Error('Exact device and explicit --run required')
  const mode = values.get('--case'); const runId = values.get('--run-id')
  if (mode !== 'drain' && mode !== 'control') throw new Error('Case must be drain or control')
  if (typeof runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(runId)) throw new Error('Invalid ASCII run id')
  const http = values.get('--http') ?? 'overlap'
  const repeatText = values.get('--repeat') ?? '1'
  const repeat = Number(repeatText)
  if (http !== 'overlap' && http !== 'serial') throw new Error('Invalid HTTP mode')
  if (typeof repeatText !== 'string' || !/^\d+$/.test(repeatText) || !Number.isSafeInteger(repeat) || repeat < 1 || (mode === 'control' && repeat > 1)) throw new Error('Invalid repeat count')
  return { device: PROBE_HOST, case: mode, runId, run: true, http, repeat }
}

/** Deadline covers headers, body and decode; settling late can never replace a timeout. */
export async function boundedAction<T>(action: (signal: AbortSignal) => Promise<T>, timeoutMs: number, message: string,
  options: { settle?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(new Error(message)); controller.abort() }, timeoutMs)
  })
  let cancel!: () => void
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancel = () => { controller.abort(); reject(options.signal?.reason ?? new Error('HTTP operation cancelled')) }
    if (options.signal?.aborted) cancel()
    else options.signal?.addEventListener('abort', cancel, { once: true })
  })
  const task = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return action(controller.signal) })
  try { return await Promise.race([task, deadline, cancelled]) }
  finally {
    clearTimeout(timer); options.signal?.removeEventListener('abort', cancel)
    // Serial ownership outlives the deadline race until the aborted operation
    // actually settles. An abort-ignoring body cannot admit another HTTP turn.
    if (options.settle) await task.catch(() => undefined)
  }
}

export async function boundedHttpRead<T>(options: {
  path: string; fetcher: typeof fetch; recorder: ProbeEventRecorder; fields: ProbeFields;
  timeoutMs: number; timeoutMessage: string; decode: (bytes: Uint8Array, status: number) => T;
  queue?: ProbeHttpQueue; signal?: AbortSignal
}): Promise<T> {
  if (!(options.path === '/list' || /^\/p\/[^/]+$/.test(options.path))) throw new Error('Unapproved HTTP path')
  const fields = { ...options.fields, path: options.path }
  const action = () => options.recorder.span('http.read', fields, (details) => boundedAction(async (signal) => {
    const response = await options.fetcher(`http://${PROBE_HOST}${options.path}`, { signal, redirect: 'error' })
    signal.throwIfAborted()
    details.status = response.status
    await options.recorder.span('http.headers', { ...options.fields, path: options.path, status: response.status }, () => undefined)
    if (!response.ok) {
      // These paths do not decode a body. Cancel it before relinquishing the turn.
      await response.body?.cancel()
      signal.throwIfAborted()
      if (response.status === 404 && options.path.startsWith('/p/')) return options.decode(new Uint8Array(), response.status)
      throw new Error(`GET ${options.path} -> ${response.status}`)
    }
    // Record bytes even when recovery rejects empty or corrupt successful responses.
    const bytes = new Uint8Array(await response.arrayBuffer())
    signal.throwIfAborted()
    Object.assign(details, byteSummary(bytes))
    return options.decode(bytes, response.status)
  }, options.timeoutMs, options.timeoutMessage, { settle: options.queue?.mode === 'serial', signal: options.signal }))
  return options.queue ? options.queue.run('http.read', fields, action, options.signal) : action()
}

/** Diagnostic liveness observer; mutations make a later unavailable verdict irreversible. */
export class ProbeLivenessMonitor {
  private started = false
  private stopped = false
  private unavailable = false
  private pollOk = false
  private mutated = false
  private pollTimer: ReturnType<typeof setTimeout> | undefined
  private verdictTimer: ReturnType<typeof setTimeout> | undefined
  private pending: Promise<void> | undefined
  private readonly shutdown = new AbortController()
  private unsubscribe: (() => void) | undefined
  private budget = 20_000
  private clockStarted = 0
  firstStop: ProbeStop | undefined
  private readonly now: () => number
  readonly polls = { attempted: 0, succeeded: 0, failed: 0, skippedAtCapacity: 0, maxConcurrent: 0 }
  constructor(private readonly options: {
    fetcher: typeof fetch; recorder: ProbeEventRecorder; fields: () => ProbeFields; now?: () => number; queue?: ProbeHttpQueue;
    stopFields?: () => ProbeStop
  }) { this.now = options.now ?? Date.now }
  get httpUnavailable() { return this.unavailable }
  get lastPollOk() { return this.pollOk }
  get mutationsStarted() { return this.mutated }
  assertCurrent() { if (this.unavailable) throw new Error('stopped-http-unavailable') }
  markMutationStarted() { this.assertCurrent(); this.mutated = true }
  start() {
    if (this.started || this.stopped) return
    this.started = true
    this.unsubscribe = this.options.queue?.onSaveHoldChange((held) => {
      if (held) {
        this.budget = Math.max(0, this.budget - (this.now() - this.clockStarted))
        clearTimeout(this.verdictTimer); clearTimeout(this.pollTimer)
      } else {
        this.armVerdict(this.now(), false)
        if (!this.pending) this.pollTimer = setTimeout(() => this.poll(), 1000)
      }
    })
    this.armVerdict(this.now())
    this.poll()
  }
  async stop() {
    this.stopped = true
    this.unsubscribe?.(); this.unsubscribe = undefined
    clearTimeout(this.pollTimer)
    clearTimeout(this.verdictTimer)
    if (this.options.queue) this.shutdown.abort()
    await this.pending
  }
  private armVerdict(lastSuccessOrStart: number, reset = true) {
    clearTimeout(this.verdictTimer)
    if (reset) this.budget = 20_000
    this.clockStarted = lastSuccessOrStart
    if (this.stopped || this.options.queue?.saveHeld) return
    this.verdictTimer = setTimeout(() => {
      this.unavailable = true
      this.firstStop ??= this.options.stopFields?.() ?? { phase: this.options.fields().phase as ProbePhase, operation: 'poll.list', saveCorrelation: 'none' }
    },
      Math.max(0, this.budget - (this.now() - lastSuccessOrStart)))
  }
  private poll() {
    if (this.stopped || this.options.queue?.saveHeld) return
    this.polls.attempted++
    this.polls.maxConcurrent = 1
    const fields = this.options.fields()
    this.pending = this.options.recorder.span('poll.list', fields, () => boundedHttpRead({
      path: '/list', fetcher: this.options.fetcher, recorder: this.options.recorder, fields,
      queue: this.options.queue, signal: this.shutdown.signal,
      timeoutMs: 5000, timeoutMessage: 'GET /list timed out.', decode: () => undefined,
    })).then(() => {
      this.polls.succeeded++; this.pollOk = true
      if (!this.mutated) { this.unavailable = false; this.firstStop = undefined }
      this.armVerdict(this.now())
    }, () => {
      if (!this.shutdown.signal.aborted) { this.polls.failed++; this.pollOk = false }
    }).finally(() => {
      this.pending = undefined
      if (!this.stopped && !this.options.queue?.saveHeld) this.pollTimer = setTimeout(() => this.poll(), 1000)
    })
  }
}

export type ProbeConnection = Pick<PixelblazeConnection,
  'isConnected' | 'connect' | 'close' | 'getConfig' | 'listPrograms' | 'setActiveProgram' | 'saveProgram' | 'pushByteCodeAndWait'>

type ImportProvider = ControllerPatternImportExecutionDeps['provider']
export class NodeControllerImportProvider implements ImportProvider {
  phase: ProbePhase = 'setup'
  private saveOrdinal = 0
  lastSave: { saveOrdinal: number; slot: string; savePhase: ProbePhase } | undefined
  firstHttpFailure: ProbeStop | undefined
  private known: { id: string; size: number } | null = null
  private drainDigest: string | null = null
  private readonly connection: ProbeConnection
  constructor(private readonly options: {
    connection: ProbeConnection; fetcher: typeof fetch; compiler: (source: string) => Promise<Uint8Array> | Uint8Array;
    recorder: ProbeEventRecorder; case?: 'drain' | 'control'; assertMutation?: () => void; queue?: ProbeHttpQueue
  }) { this.connection = options.connection }
  get isConnected() { return this.connection.isConnected }
  private fields(extra: ProbeFields = {}) { return { case: this.options.case, phase: this.phase,
    saveOrdinal: this.lastSave?.saveOrdinal, savePhase: this.lastSave?.savePhase, saveSlot: this.lastSave?.slot, ...extra } }
  stopFields(operation: string): ProbeStop {
    return { phase: this.phase, operation, ...this.lastSave, saveCorrelation: this.lastSave ? 'last-attempt' : 'none' }
  }
  private span<T>(operation: string, fields: ProbeFields, action: (details: ProbeFields) => Promise<T> | T) {
    return this.options.recorder.span(operation, this.fields(fields), action)
  }
  connect() { return this.span('connect', {}, () => this.connection.connect()) }
  disconnect() { this.known = null; return this.span('disconnect', {}, () => this.connection.close()) }
  getConfig() { return this.span('getConfig', {}, async (details) => {
    const config = await this.connection.getConfig(); details.activeProgramId = config.activeProgramId; return config
  }) }
  listPrograms() { return this.span('listPrograms', {}, async (details) => {
    const entries = await this.connection.listPrograms(); details.count = entries.length; return entries
  }) }
  compile(source: string) { return this.span('compile', { drain: source === CONTROLLER_DRAIN_PATTERN_SOURCE }, async (details) => {
    const bytes = await this.options.compiler(source); Object.assign(details, byteSummary(bytes))
    if (source === CONTROLLER_DRAIN_PATTERN_SOURCE) this.drainDigest = byteSummary(bytes).sha256
    return bytes
  }) }
  getActiveProgramBytecodeSize(): Promise<number | null> {
    return this.span('getActiveProgramBytecodeSize', {}, async (details) => {
      const known = this.known
      if (known && (await this.getConfig()).activeProgramId !== known.id) this.known = null
      const size = this.known?.size ?? null; details.byteLength = size; details.known = size !== null; return size
    })
  }
  pushBytecode(bytes: Uint8Array, opts: { id: string; name?: string }) {
    return this.span('pushBytecode', { slot: opts.id, name: opts.name, ...byteSummary(bytes),
      activation: byteSummary(bytes).sha256 === this.drainDigest ? 'drain' : 'target' }, async () => {
      this.options.assertMutation?.()
      this.known = null
      await this.connection.pushByteCodeAndWait(bytes, opts)
      this.known = { id: opts.id, size: bytes.length }
    })
  }
  saveProgram(bytes: Uint8Array, opts: { id: string }) {
    this.lastSave = { saveOrdinal: ++this.saveOrdinal, slot: opts.id, savePhase: this.phase }
    const recovered = recoverSavedProgram(opts.id, bytes)
    return this.span('saveProgram', { slot: opts.id, name: recovered.ok ? recovered.value.deviceName : undefined, ...byteSummary(bytes) }, () => {
      this.options.assertMutation?.(); return this.connection.saveProgram(opts.id, bytes)
    })
  }
  setActiveProgram(id: string, opts: { save: boolean }) {
    this.known = null
    return this.span('setActiveProgram', { slot: id }, () => {
      this.options.assertMutation?.(); this.connection.setActiveProgram(id, opts.save)
    })
  }
  async readSavedProgram(programId: string, timeoutMs = 5000, signal?: AbortSignal) {
    const id = programId.trim()
    if (!id) throw new Error('Saved program id is required')
    return this.span('readSavedProgram', { slot: id }, () => boundedHttpRead({
      path: `/p/${encodeURIComponent(id)}`, fetcher: this.options.fetcher, recorder: this.options.recorder,
      queue: this.options.queue, signal,
      fields: this.fields({ slot: id }), timeoutMs, timeoutMessage: `Saved program ${id} read timed out.`,
      decode: (bytes, status) => {
        if (status === 404) return null
        const recovery = recoverSavedProgram(id, bytes)
        if (!recovery.ok) throw new ProbeSavedProgramDecodeError(recovery.error.message)
        return recovery.value
      },
    })).catch((error: unknown) => {
      // Setup may retry this one known recovery error; it is not an HTTP stop.
      if (!(error instanceof ProbeSavedProgramDecodeError)) {
        this.firstHttpFailure ??= this.stopFields('readSavedProgram')
      }
      throw error
    })
  }
}
