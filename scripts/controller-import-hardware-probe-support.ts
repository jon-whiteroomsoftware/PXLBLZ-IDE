import { createHash } from 'node:crypto'
import type { PixelblazeConnection } from '../src/engine/PixelblazeConnection'
import type { ControllerPatternImportExecutionDeps } from '../src/engine/controllerPatternImportExecution'
import { recoverSavedProgram, type RecoveredSavedProgram } from '../src/engine/controllerSavedProgramRead'
import { CONTROLLER_DRAIN_PATTERN_SOURCE } from '../src/engine/pushPattern'

export const PROBE_HOST = '192.168.8.196'
export const PROBE_FIDELITY = 'No extension relay, UI or store guards; the Controller sees the same request sequence.'
export type ProbePhase = 'setup' | 'import' | 'observation' | 'restore'
export type ProbeFields = Record<string, unknown>
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
      if (!(error instanceof Error && /^Saved program .+ is not a readable PBP blob\.$/.test(error.message))) throw error
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
    slot: e.slot, name: e.name, activation: e.activation,
  }))
}

export type ProbeArgs = { device: typeof PROBE_HOST; case: 'drain' | 'control'; runId: string; run: true }
export function parseProbeArgs(argv: string[]): ProbeArgs | { help: true } {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { help: true }
  const values = new Map<string, string | true>()
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!['--device', '--case', '--run-id', '--run'].includes(key) || values.has(key)) throw new Error('Unknown or repeated argument')
    if (key === '--run') values.set(key, true)
    else { const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error('Missing argument'); values.set(key, value) }
  }
  if (values.get('--device') !== PROBE_HOST || values.get('--run') !== true) throw new Error('Exact device and explicit --run required')
  const mode = values.get('--case'); const runId = values.get('--run-id')
  if (mode !== 'drain' && mode !== 'control') throw new Error('Case must be drain or control')
  if (typeof runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(runId)) throw new Error('Invalid ASCII run id')
  return { device: PROBE_HOST, case: mode, runId, run: true }
}

/** Deadline covers headers, body and decode; settling late can never replace a timeout. */
export async function boundedAction<T>(action: (signal: AbortSignal) => Promise<T>, timeoutMs: number, message: string): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(new Error(message)); controller.abort() }, timeoutMs)
  })
  try { return await Promise.race([Promise.resolve().then(() => action(controller.signal)), deadline]) }
  finally { clearTimeout(timer) }
}

export async function boundedHttpRead<T>(options: {
  path: string; fetcher: typeof fetch; recorder: ProbeEventRecorder; fields: ProbeFields;
  timeoutMs: number; timeoutMessage: string; decode: (bytes: Uint8Array, status: number) => T
}): Promise<T> {
  if (!(options.path === '/list' || /^\/p\/[^/]+$/.test(options.path))) throw new Error('Unapproved HTTP path')
  return options.recorder.span('http.read', { ...options.fields, path: options.path }, (details) => boundedAction(async (signal) => {
    const response = await options.fetcher(`http://${PROBE_HOST}${options.path}`, { signal, redirect: 'error' })
    signal.throwIfAborted()
    details.status = response.status
    await options.recorder.span('http.headers', { ...options.fields, path: options.path, status: response.status }, () => undefined)
    if (response.status === 404 && options.path.startsWith('/p/')) return options.decode(new Uint8Array(), response.status)
    if (!response.ok) throw new Error(`GET ${options.path} -> ${response.status}`)
    // Record bytes even when recovery rejects empty or corrupt successful responses.
    const bytes = new Uint8Array(await response.arrayBuffer())
    signal.throwIfAborted()
    Object.assign(details, byteSummary(bytes))
    return options.decode(bytes, response.status)
  }, options.timeoutMs, options.timeoutMessage))
}

export type ProbeConnection = Pick<PixelblazeConnection,
  'isConnected' | 'connect' | 'close' | 'getConfig' | 'listPrograms' | 'setActiveProgram' | 'saveProgram' | 'pushByteCodeAndWait'>

type ImportProvider = ControllerPatternImportExecutionDeps['provider']
export class NodeControllerImportProvider implements ImportProvider {
  phase: ProbePhase = 'setup'
  private known: { id: string; size: number } | null = null
  private drainDigest: string | null = null
  private readonly connection: ProbeConnection
  constructor(private readonly options: {
    connection: ProbeConnection; fetcher: typeof fetch; compiler: (source: string) => Promise<Uint8Array> | Uint8Array;
    recorder: ProbeEventRecorder; case?: 'drain' | 'control'; assertMutation?: () => void
  }) { this.connection = options.connection }
  get isConnected() { return this.connection.isConnected }
  private fields(extra: ProbeFields = {}) { return { case: this.options.case, phase: this.phase, ...extra } }
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
    const recovered = recoverSavedProgram(opts.id, bytes)
    return this.span('saveProgram', { slot: opts.id, name: recovered.ok ? recovered.value.deviceName : undefined, ...byteSummary(bytes) }, () => {
      this.options.assertMutation?.(); this.connection.saveProgram(opts.id, bytes)
    })
  }
  setActiveProgram(id: string, opts: { save: boolean }) {
    this.known = null
    return this.span('setActiveProgram', { slot: id }, () => {
      this.options.assertMutation?.(); this.connection.setActiveProgram(id, opts.save)
    })
  }
  async readSavedProgram(programId: string, timeoutMs = 5000) {
    const id = programId.trim()
    if (!id) throw new Error('Saved program id is required')
    return this.span('readSavedProgram', { slot: id }, () => boundedHttpRead({
      path: `/p/${encodeURIComponent(id)}`, fetcher: this.options.fetcher, recorder: this.options.recorder,
      fields: this.fields({ slot: id }), timeoutMs, timeoutMessage: `Saved program ${id} read timed out.`,
      decode: (bytes, status) => {
        if (status === 404) return null
        const recovery = recoverSavedProgram(id, bytes)
        if (!recovery.ok) throw new Error(recovery.error.message)
        return recovery.value
      },
    }))
  }
}
