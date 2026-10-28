/** Explicit operator diagnostic. Never import from application, hooks, CI or gates. */
import { appendFileSync, existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PixelblazeConnection } from '../src/engine/PixelblazeConnection'
import { fetchControllerCompiler } from '../test/perf-harness/controllerHardware'
import { importControllerPattern, type ControllerPatternImportExecutionDeps } from '../src/engine/controllerPatternImportExecution'
import { runControllerPatternBatch } from '../src/engine/controllerPatternBatch'
import { readControllerPatternImportLedger } from '../src/engine/controllerPatternImport'
import type { ControllerMetadataStorage } from '../src/engine/controllerMetadataStorage'
import type { PatternRecord } from '../src/engine/personalContentRecords'
import type { BindingStore, ProgramLabelStore } from '../src/engine/controllerBinding'
import type { ControllerPushRecords } from '../src/engine/controllerPushRecord'
import { makeProgramId } from '../src/engine/bytecodePush'
import { stampArtifact } from '../src/engine/artifactStamp'
import { decodePbp, encodePbp } from '../src/engine/pbpEncode'
import { NodeControllerImportProvider, ProbeEventRecorder, ProbeHttpQueue, ProbeLivenessMonitor, PROBE_FIDELITY, PROBE_HOST,
  boundedAction, byteSummary, parseProbeArgs, runProbeBatches, sanitizedTimingTable, waitForFixtureReadback, type ProbeArgs, type ProbeStop } from './controller-import-hardware-probe-support'
import { closeProbeResources, createProbeRuntime } from './controller-import-hardware-probe-runtime'

const HELP = 'npx tsx scripts/controller-import-hardware-probe.ts --device 192.168.8.196 --case drain|control --run-id <ASCII-token> --run [--http overlap|serial] [--repeat N]\nDefaults: --http overlap --repeat 1. Repeat must be a positive safe integer; control permits only 1.'
const luminousSource = 'export function render(i) { rgb(0.02,0.02,0) }\nexport function render2D(i,x,y) { rgb(0.02,0.02,0) }'
const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

async function run(args: ProbeArgs) {
  // Refuse symlink escapes and reuse, including dangling links. mkdir is exclusive.
  const cwd = realpathSync(process.cwd())
  if (cwd !== realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))) throw new Error('Run from the probe worktree')
  const privateRoot = resolve(cwd, '.wrsp')
  if (existsSync(privateRoot) && (lstatSync(privateRoot).isSymbolicLink() || realpathSync(privateRoot) !== privateRoot)) throw new Error('Invalid private root')
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 })
  const root = resolve(privateRoot, args.runId)
  mkdirSync(root, { mode: 0o700 })
  const result = await runProbeBatches(args.repeat, async (batchIndex) => {
    const batchRoot = args.repeat === 1 ? root : resolve(root, `batch-${String(batchIndex).padStart(3, '0')}`)
    if (args.repeat > 1) mkdirSync(batchRoot, { mode: 0o700 })
    return runBatch(args, batchRoot, batchIndex)
  })
  const summary = { case: args.case, runId: args.runId, http: args.http, requested: result.requested,
    completed: result.completed, success: result.success, outcomes: result.outcomes, firstStop: result.firstStop,
    batches: args.repeat === 1 ? result.batches : result.batches.map((batch) => {
      const requests = batch.timing.filter((event) => event.operation === 'http.read' || event.operation === 'compiler.http')
      const durations = requests.map((event) => event.durationMs ?? 0)
      return { batchIndex: batch.batchIndex, identity: batch.identity, status: batch.status, success: batch.success,
        qualified: batch.qualified, connected: batch.connected, httpStopped: batch.httpStopped, firstStop: batch.firstStop,
        queue: batch.queue, cleanupErrors: batch.cleanupErrors, drainActivations: batch.drainActivations,
        rows: { complete: batch.rows.filter((row) => row.outcome === 'complete').length,
          failed: batch.rows.filter((row) => row.outcome !== 'complete').length },
        httpRequests: { count: requests.length, totalDurationMs: durations.reduce((sum, duration) => sum + duration, 0),
          maxDurationMs: Math.max(0, ...durations) } }
    }) }
  if (args.repeat > 1) writeFileSync(resolve(root, 'report.json'), JSON.stringify(summary, null, 2), { mode: 0o600 })
  console.log(JSON.stringify(summary, null, 2))
  if (!result.success) process.exitCode = 1
}

async function runBatch(args: ProbeArgs, root: string, batchIndex: number) {
  const identity = args.repeat === 1 ? args.runId : `${args.runId}-batch-${String(batchIndex).padStart(3, '0')}`
  const recorder = new ProbeEventRecorder((line) => appendFileSync(resolve(root, 'events.jsonl'), `${line}\n`, { mode: 0o600 }))
  const runtime = createProbeRuntime()
  const queue = new ProbeHttpQueue(args.http, recorder)
  const connection = new PixelblazeConnection({ host: PROBE_HOST, webSocketFactory: (url) => {
    if (url !== `ws://${PROBE_HOST}:81`) throw new Error('Unapproved Controller WebSocket')
    return runtime.webSocketFactory(url)
  }, requestTimeoutMs: 5000, connectTimeoutMs: 5000 })
  const rawFetch = globalThis.fetch
  // This guard also pins the reused compiler helper's fetches and refuses redirects.
  const pinnedFetch: typeof fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.origin !== `http://${PROBE_HOST}` || (init?.method && init.method !== 'GET')) return Promise.reject(new Error('Unapproved Controller HTTP request'))
    return runtime.fetch(input, { ...init, redirect: 'error' })
  }
  let compilerReady = false
  const writes: { id: string; name: string; kind: string }[] = []
  const observed: { utc: string; phase: string; activeProgramId?: string; error?: string }[] = []
  const rowOutcomes: { id: string; name: string; outcome: string; stage?: string }[] = []
  const accountsA = new Map<string, PatternRecord>()
  const accountsB = new Map<string, PatternRecord>()
  let allocatedB = 0
  let ledger = readControllerPatternImportLedger(undefined)
  let bindings: BindingStore = {}; let pushRecords: ControllerPushRecords = {}; let labels: ProgramLabelStore = {}
  let failure: unknown; let batchEnded = false; let qualified = false
  let connected: boolean
  let cleanupErrors: string[]
  let firstCompilerFailure: ProbeStop | undefined
  let failureStop: ProbeStop | undefined
  let outgoing: { measuredBytecodeSize: number; residentSize: number | null; activeId: string } | undefined
  const assertCurrent = () => {
    monitor.assertCurrent()
    if (!connection.isConnected) throw new Error('Controller connection is not open')
  }
  const provider = new NodeControllerImportProvider({ connection, fetcher: pinnedFetch,
    compiler: acquireAndCompile,
    recorder, queue, case: args.case, assertMutation: () => { assertCurrent(); monitor.markMutationStarted() } })
  const fields = () => ({ case: args.case, phase: provider.phase })
  const monitor = new ProbeLivenessMonitor({ fetcher: pinnedFetch, recorder, fields, queue,
    stopFields: () => provider.stopFields('poll.list') })
  async function acquireAndCompile(source: string): Promise<Uint8Array> {
    return queue.run('compiler.acquire', { ...fields(), path: '/index.html.gz' }, () => compileAdmitted(source))
  }
  async function compileAdmitted(source: string): Promise<Uint8Array> {
    let task: Promise<Uint8Array> | undefined
    try {
      return await recorder.span('compiler.acquire', fields(), () => boundedAction(async (signal) => {
        globalThis.fetch = (input, init) => {
          signal.throwIfAborted()
          const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname
          return recorder.span('compiler.http', { ...fields(), path }, async (details) => {
            const response = await pinnedFetch(input, { ...init, signal })
            details.status = response.status
            const bytes = new Uint8Array(await response.arrayBuffer())
            signal.throwIfAborted(); Object.assign(details, byteSummary(bytes))
            return new Response(bytes, { status: response.status, headers: response.headers })
          })
        }
        task = (async () => {
          const compile = await fetchControllerCompiler(PROBE_HOST)
          signal.throwIfAborted()
          const bytes = compile(source)
          signal.throwIfAborted()
          return bytes
        })()
        return await task
      }, 5000, 'Controller compiler load timed out.', { settle: true }))
    } catch (error) {
      firstCompilerFailure ??= provider.stopFields('compiler.acquire')
      throw error
    } finally {
      // Keep the abort guard installed until the helper finishes all its attempts.
      if (task) await task.catch(() => undefined)
      globalThis.fetch = rawFetch
    }
  }
  const mintUsed = new Set<string>()
  const mint = () => { let id: string; do { id = makeProgramId() } while (mintUsed.has(id)); mintUsed.add(id); return id }
  const observe = async () => {
    const utc = new Date().toISOString()
    try { const config = await provider.getConfig(); observed.push({ utc, phase: provider.phase, activeProgramId: config.activeProgramId }) }
    catch (error) { observed.push({ utc, phase: provider.phase, error: error instanceof Error ? error.message : String(error) }) }
  }
  const metadataStorage: ControllerMetadataStorage = {
    id: 'i24-memory', getPatternImports: async () => structuredClone(ledger), setPatternImports: async (next) => { ledger = structuredClone(next) },
    getControllerBindings: async () => structuredClone(bindings), setControllerBindings: async (next) => { bindings = structuredClone(next) },
    getPushRecords: async () => structuredClone(pushRecords), setPushRecords: async (next) => { pushRecords = structuredClone(next) },
    getProgramLabels: async () => structuredClone(labels), setProgramLabels: async (next) => { labels = structuredClone(next) },
  }
  try {
    await provider.connect()
    const initialConfig = await provider.getConfig()
    observed.push({ utc: new Date().toISOString(), phase: 'setup', activeProgramId: initialConfig.activeProgramId })
    const initialList = await provider.listPrograms()
    for (const item of initialList) mintUsed.add(item.id)
    if (initialConfig.activeProgramId) mintUsed.add(initialConfig.activeProgramId)
    const fixtureNames = ['T2', 'T3'].map((suffix) => `Test pat I24 ${identity} ${suffix}`)
    if (initialList.some((item) => fixtureNames.includes(item.name))) throw new Error('Fixture name already exists')
    const candidates = initialList.filter((item) => /LineDancer2D/i.test(item.name))
    if (args.case === 'drain' && candidates.length !== 1) throw new Error('Expected exactly one saved LineDancer2D Pattern')
    const tiny = await provider.compile(luminousSource)
    compilerReady = true
    monitor.start()
    const targets: { id: string; name: string }[] = []
    for (const [index, name] of fixtureNames.entries()) {
      assertCurrent()
      const id = mint(); const accountId = `i24-${identity}-A-T${index + 2}`
      const source = `export function render(i) { rgb(${index === 0 ? '0,0.2,0' : '0,0,0.2'}) }\nexport function render2D(i,x,y) { rgb(${index === 0 ? '0,0.2,0' : '0,0,0.2'}) }`
      const record: PatternRecord = { id: accountId, name, src: source, controls: {}, updatedAt: Date.now() }
      accountsA.set(accountId, structuredClone(record))
      const stamped = stampArtifact(source, { kind: 'pattern', id: accountId, name, transforms: [] })
      const pbp = encodePbp({ id, name, sourceCode: stamped, byteCode: await provider.compile(stamped) })
      writeFileSync(resolve(root, `${index + 2}-${id}.pbp`), pbp, { mode: 0o600 })
      writes.push({ id, name, kind: 'fixture-save' })
      await provider.saveProgram(pbp, { id })
      await recorder.span('setup.readiness', { ...fields(), slot: id, name }, () =>
        boundedAction((signal) => waitForFixtureReadback((remaining) => provider.readSavedProgram(id, remaining, signal), pbp,
          { now: Date.now, wait, assertCurrent: () => { signal.throwIfAborted(); assertCurrent() } }),
        5000, 'Setup read deadline exceeded', { settle: true }))
      targets.push({ id, name })
    }
    if (args.case === 'drain') {
      const saved = await provider.readSavedProgram(candidates[0].id)
      const decoded = saved?.storedArtifact && decodePbp(saved.storedArtifact.pbp)
      if (!decoded) throw new Error('LineDancer2D bytecode unavailable')
      await provider.setActiveProgram(candidates[0].id, { save: false })
      const active = await provider.getConfig()
      if (active.activeProgramId !== candidates[0].id) throw new Error('LineDancer2D activation unconfirmed')
      outgoing = { measuredBytecodeSize: decoded.byteCode.length, residentSize: await provider.getActiveProgramBytecodeSize(), activeId: candidates[0].id }
    } else {
      const id = mint(); const name = `Test pat I24 ${identity} control`
      writes.push({ id, name, kind: 'control-transient' }); await provider.pushBytecode(tiny, { id, name })
      outgoing = { measuredBytecodeSize: tiny.length, residentSize: await provider.getActiveProgramBytecodeSize(), activeId: id }
      if (outgoing.residentSize !== tiny.length) throw new Error('Known small control resident unconfirmed')
    }
    const deps: ControllerPatternImportExecutionDeps = {
      provider, controllerId: PROBE_HOST, metadataStorage,
      personalContent: { listPatterns: async () => [...accountsB.values()].map((r) => structuredClone(r)),
        createPattern: async (record) => { if (accountsB.has(record.id)) throw new Error('Duplicate Pattern id'); accountsB.set(record.id, structuredClone(record)) } },
      assertCurrent, resolveKnownSource: async () => undefined, waitForProfileWrites: async () => {},
      loadProfile: async () => ({ profile: null, signature: 'i24-memory-profile' }),
      assertProfileCurrent: (_id, signature) => { if (signature !== 'i24-memory-profile') throw new Error('Profile changed') },
      libraries: {}, mapDim: 2, firmwareVersion: initialConfig.firmwareVersion ?? '3.70',
      allocatePatternId: () => `i24-${identity}-B-${++allocatedB}`, now: () => Date.now(),
      mintDrainId: () => { const id = mint(); writes.push({ id, name: '', kind: 'drain-transient' }); return id },
    }
    provider.phase = 'import'
    const batch = await runControllerPatternBatch(targets, async (row) => {
      if (monitor.httpUnavailable) { rowOutcomes.push({ ...row, outcome: 'stopped-http-unavailable' }); throw new Error('stopped-http-unavailable') }
      try {
        await importControllerPattern({ programId: row.id, controllerDeviceId: PROBE_HOST }, deps)
        rowOutcomes.push({ ...row, outcome: 'complete', stage: 'complete' })
      } catch (error) {
        failureStop ??= provider.firstHttpFailure ?? firstCompilerFailure ?? provider.stopFields('importControllerPattern')
        rowOutcomes.push({ ...row, outcome: monitor.httpUnavailable ? 'stopped-http-unavailable' : 'failed',
          stage: error && typeof error === 'object' && 'stage' in error ? String(error.stage) : undefined })
        throw error
      }
    })
    batchEnded = true
    writeFileSync(resolve(root, 'batch.json'), JSON.stringify(batch, null, 2), { mode: 0o600 })
    const drainCount = recorder.events.filter((e) => e.event === 'end' && e.operation === 'pushBytecode' && e.activation === 'drain' && e.phase === 'import').length
    qualified = args.case === 'drain' ? drainCount > 0 : drainCount === 0
    if (!qualified) { failure = new Error('Case precondition unproved'); failureStop ??= provider.stopFields('batch.qualification') }
    else if (batch.failed.length) { failure = new Error('Import row failure reproduced'); failureStop ??= provider.stopFields('importControllerPattern') }
  } catch (error) {
    failure = error
    failureStop ??= provider.firstHttpFailure ?? firstCompilerFailure ?? provider.stopFields('batch.setup')
  }
  try {
    // Even failed imports retain a full 60-second independent liveness window.
    if (batchEnded || monitor.httpUnavailable) {
      provider.phase = 'observation'
      const until = Date.now() + 60_000
      await observe()
      while (Date.now() < until - 5000) await wait(Math.min(250, until - 5000 - Date.now()))
      await observe()
      while (Date.now() < until) await wait(Math.min(250, until - Date.now()))
      if (!monitor.httpUnavailable && monitor.lastPollOk && compilerReady && connection.isConnected) {
        provider.phase = 'restore'
        try {
          const bytes = await provider.compile(luminousSource); const id = mint()
          const name = `Test pat I24 ${identity} restore`
          writes.push({ id, name, kind: 'restore-transient' })
          await provider.pushBytecode(bytes, { id, name }); await observe()
        } catch (error) { failure ??= error; failureStop ??= firstCompilerFailure ?? provider.stopFields('restore') }
      }
    }
  } catch (error) { failure ??= error; failureStop ??= provider.stopFields('observation') }
  finally {
    connected = connection.isConnected
    const cleanupFailures = await closeProbeResources({ stopMonitor: () => monitor.stop(),
      disconnectProvider: () => provider.disconnect(), closeRuntime: () => runtime.close(),
      restoreFetch: () => { globalThis.fetch = rawFetch } })
    failure ??= cleanupFailures[0]?.error
    if (cleanupFailures.length) failureStop ??= provider.stopFields(cleanupFailures[0].operation)
    cleanupErrors = cleanupFailures.map((item) => item.operation)
  }
  const status = monitor.httpUnavailable ? 'stopped-http-unavailable' : failure || !connected ? 'failed' : 'qualified'
  const summary = {
    case: args.case, runId: args.runId, batchIndex, identity, status, qualified: qualified && !monitor.httpUnavailable,
    http: args.http, queue: queue.stats, cleanupErrors, connected,
    success: !failure && !monitor.httpUnavailable && qualified && connected,
    httpStopped: monitor.httpUnavailable,
    firstStop: failure || monitor.httpUnavailable || !qualified || !connected
      ? failureStop ?? (monitor.httpUnavailable ? monitor.firstStop :
        provider.stopFields(connected ? 'batch.result' : 'connection.lost')) : undefined,
    mutationsStarted: monitor.mutationsStarted,
    fidelity: PROBE_FIDELITY,
    residentQualification: args.case === 'drain' ? 'Unknown resident cache after observed saved-program switch.' : 'Known small resident seeded by confirmed push.',
    rows: rowOutcomes, timing: sanitizedTimingTable(recorder.events), polls: monitor.polls, writtenSlotsAndTransients: writes,
    drainActivations: recorder.events.filter((e) => e.event === 'end' && e.operation === 'pushBytecode' && e.activation === 'drain' && e.phase === 'import').length,
    deletedSlots: [], outgoing, observedActiveIds: observed.map(({ utc, phase, activeProgramId }) => ({ utc, phase, activeProgramId })),
    accountBCount: accountsB.size, receiptCount: Object.keys(ledger.byPatternId).length,
    failure: monitor.httpUnavailable ? 'HTTP unavailable; discuss observed liveness with the eng lead.' : failure || !connected ? 'Run failed; inspect private report and events.' : undefined,
  }
  writeFileSync(resolve(root, 'report.json'), JSON.stringify({ summary, failure: failure instanceof Error ? { message: failure.message, stack: failure.stack } : String(failure),
    accountsA: [...accountsA.values()], accountsB: [...accountsB.values()], ledger, bindings, pushRecords, labels, observed }, null, 2), { mode: 0o600 })
  return summary
}

try {
  const args = parseProbeArgs(process.argv.slice(2))
  if ('help' in args) console.log(HELP)
  else await run(args)
} catch {
  console.log(JSON.stringify({ status: 'refused', fidelity: PROBE_FIDELITY, error: 'Invalid arguments or private run directory; use --help and a fresh run id.' }))
  process.exitCode = 1
}
