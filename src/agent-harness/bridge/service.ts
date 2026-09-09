// Provenance: extracted from pxlblz-v3 src/bridge/server.ts at 9ecd481f (see src/agent-harness/PROVENANCE.md)
// The local dictation bridge's request path (V3 #30; V2 #945): a
// loopback-only HTTP service that runs an agent over the grammar MCP surface
// against the Show the V2 editor currently has open. The editor's dev-only
// tooling hook (window.__pxlblzEditor) hands the record and the editor's
// focus in; the chat overlay this service serves at /chat.js applies the
// returned record back as one persisted update - one undo step. The service
// binds to loopback only and is never deployed.
//
// #945 adaptation: the request path and the HTTP server are exported here so
// the smoke oracle and later browser sequences can start a bridge on an
// ephemeral port in-process; `server.ts` is the process entry point. A
// scripted mode routes the corpus's fake agent through this same path with a
// per-request script and an optional completion delay, so the bridge can be
// exercised end to end without a paid model call.
//
// Browser-baseline additions (#945): every NDJSON line and log line names
// the request it belongs to (the overlay's id, or one minted here), the done
// event carries the bridge-side phase clock, and in scripted mode an
// utterance the overlay sends without a script resolves through the
// baseline catalogue and the dictation corpus.
import { readFileSync } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { scriptForUtterance } from '../baseline/scripts.js'
import type { ScriptStep } from '../experiment/corpus.js'
import type { PaidCallGuard } from '../experiment/paidCallGuard.js'
import { createFakeAgent, type DictationAgent } from '../experiment/runner.js'
import { dictationTools, projectionForAgent, runDictationTurn, type TurnDisposition } from '../experiment/turn.js'
import { DICTATION_RULES, type EditorContext } from '../grammar/read.js'
import { createSessionStore, type GrammarSessionStore } from '../grammar/session.js'
import { createShowsServer } from '../mcp/showsServer.js'
import { runTargetedResizeTurn } from '../experiment/targetedResizeTurn.js'
import { parseAgentResizeIntent, type AgentResizeIntent } from '../../dev/agentResizeProtocol.js'

const here = dirname(fileURLToPath(import.meta.url))

export interface UtteranceRequest {
  show: Record<string, unknown>
  utterance: string
  /**
   * Correlation id minted by the caller at submission (#945). Echoed on
   * every event and log line; the bridge mints one when absent.
   */
  requestId?: string
  /** Prior exchanges of this conversation, oldest first. */
  history?: Array<{ role: 'user' | 'assistant'; text: string }>
  context?: {
    hoveredClipId?: string | null
    selectedClipIds?: string[]
    playheadMs?: number
    activeZoneId?: string
  }
  /**
   * Scripted mode only (#945): the fake agent's solution, executed through
   * the same MCP tool path a live model uses. Ignored by a live agent.
   */
  script?: ScriptStep[]
  /**
   * Scripted mode only: hold the turn open this long before the agent runs,
   * so a browser sequence can act on the live editor while this candidate is
   * still pending. Ignored by a live agent.
   */
  delayMs?: number
  /** Explicit binding retained from a successful original private turn. */
  retryResize?: AgentResizeIntent
}

export interface UtteranceResponse {
  /** Private session outcome only; never a live application or save receipt. */
  privateOutcome: TurnDisposition | { kind: 'service-refused' | 'service-error' }
  reply: string
  changed: boolean
  summaries: string[]
  show?: unknown
  /** Executed canonical binding; absent for mixed, repaired or uncommitted work. */
  retryResize?: AgentResizeIntent
}

/** The bridge-side phase clock of one turn, in `Date.now()` milliseconds. */
export interface BridgeTurnTiming {
  /** The request body was parsed and the turn admitted. */
  acceptedAt: number
  /** Scripted completion delay applied before the agent ran. */
  delayMs: number
  /** The first agent `run` began (after the one scripted delay). */
  agentStartedAt: number
  /** The final agent `run` returned, including a validation-repair pass. */
  agentEndedAt: number
  /** The candidate was exported from the private session. */
  exportedAt: number
  toolCalls: Array<{ name: string; at: number; ms: number; isError?: boolean; issue?: string }>
  /** Final validation inside the session commit, when the turn reached it. */
  validation?: { at: number; ms: number; ok: boolean }
}

export type ProgressEvent =
  | { kind: 'tool'; name: string; requestId?: string; at?: number }
  | { kind: 'thinking'; requestId?: string; at?: number }
  | { kind: 'validation'; requestId?: string; at: number; ms: number; ok: boolean }

/** One NDJSON line of an /utterance response. */
export type BridgeEvent =
  | { kind: 'accepted'; requestId: string; at: number }
  | ProgressEvent
  | ({ kind: 'done'; requestId?: string; timing: BridgeTurnTiming } & UtteranceResponse)

/** The corpus's scripted fake agent as a bridge agent: no model, no credential. */
export function createScriptedAgent(): DictationAgent {
  return createFakeAgent()
}

function timedAgent(
  agent: DictationAgent,
  delayMs: number,
  onStart: () => void,
  onEnd: () => void,
): DictationAgent {
  let started = false
  return {
    name: agent.name,
    run: async (context) => {
      // The scripted completion delay holds the turn open before the first
      // agent pass. A validation repair remains part of the same agent phase.
      if (!started) {
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
        started = true
        onStart()
      }
      try {
        return await agent.run(context)
      } finally {
        onEnd()
      }
    },
  }
}

/**
 * Observe pending validation and final commit validation without changing
 * the grammar session or its private transaction ownership.
 */
function observedSessionStore(
  store: GrammarSessionStore,
  onValidation: (event: { at: number; ms: number; ok: boolean }) => void,
  onApply: (operation: string, args: Record<string, unknown>, ok: boolean) => void,
): GrammarSessionStore {
  return {
    ...store,
    apply: (sessionId, operation, args) => {
      const captured = structuredClone(args)
      const result = store.apply(sessionId, operation, args)
      onApply(operation, captured, result.ok)
      return result
    },
    validatePending: (sessionId) => {
      const at = Date.now()
      const result = store.validatePending(sessionId)
      onValidation({ at, ms: Date.now() - at, ok: result.ok })
      return result
    },
    commit: (sessionId) => {
      const at = Date.now()
      const result = store.commit(sessionId)
      onValidation({ at, ms: Date.now() - at, ok: result.ok })
      return result
    },
  }
}

function mintRequestId(): string {
  return `bridge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** The first human-readable message of a refused tool call's payload, if any. */
function firstIssueMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const record = payload as { issues?: Array<{ message?: string }>; message?: string; error?: string }
  return record.issues?.[0]?.message ?? record.message ?? record.error
}

export interface UtteranceRun extends UtteranceResponse {
  timing: BridgeTurnTiming
}

export async function runUtterance(
  agent: DictationAgent,
  request: UtteranceRequest,
  onProgress: (event: ProgressEvent) => void = () => {},
  scripted = false,
  clock: { acceptedAt?: number; delayMs?: number } = {},
): Promise<UtteranceRun> {
  const requestId = request.requestId
  const acceptedAt = clock.acceptedAt ?? Date.now()
  const timing: BridgeTurnTiming = {
    acceptedAt,
    delayMs: clock.delayMs ?? 0,
    agentStartedAt: acceptedAt,
    agentEndedAt: acceptedAt,
    exportedAt: acceptedAt,
    toolCalls: [],
  }
  const rawStore = createSessionStore({ authoringValidation: true })
  let executedResize: AgentResizeIntent | undefined
  let applyAttempts = 0
  let mutationCalls = 0
  let agentRuns = 0
  const readOnlyTools = new Set(['describe_show', 'export_show', 'resolve_reference', 'get_editor_context', 'list_stock_patterns', 'get_stock_pattern', 'evaluate_property_at', 'validate_show', 'describe_changes'])
  const store = observedSessionStore(rawStore, (validation) => {
    timing.validation = validation
    onProgress({ kind: 'validation', ...(requestId ? { requestId } : {}), ...validation })
  }, (operation, args, ok) => {
    applyAttempts += 1
    if (operation === 'resize_clip' && ok && Object.keys(args).length === 2 && Object.prototype.hasOwnProperty.call(args, 'clip_id') && Object.prototype.hasOwnProperty.call(args, 'duration_ms')) {
      executedResize = parseAgentResizeIntent({ clipId: args.clip_id, durationMs: args.duration_ms })
    }
  })
  const server = createShowsServer({ sessions: store })
  const client = new Client({ name: 'dictation-bridge', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    // Preserve identical missing references in an existing composition. Operations
    // needing unavailable metadata (including flat projection) still refuse;
    // the editor validates the candidate against its exact current metadata.
    const opened = store.open(request.show, [], { allowUnresolvedUserPatterns: true })
    if (!opened.ok) {
      return {
        reply: `The Show did not open for editing: ${opened.issues[0]?.message ?? 'unknown issue'}`,
        privateOutcome: { kind: 'service-refused' },
        changed: false,
        summaries: [],
        timing,
      }
    }
    const sessionId = opened.sessionId

    // Scripted mode runs the request's script, else the script the baseline
    // catalogue or the corpus records for this exact utterance. A live model
    // never sees any of this.
    const script = scripted ? (request.script ?? scriptForUtterance(request.utterance) ?? null) : null
    if (scripted && !script) {
      return {
        reply: 'This scripted bridge has no script for that utterance; use a baseline or corpus utterance, or send a script.',
        privateOutcome: { kind: 'service-refused' },
        changed: false,
        summaries: [],
        timing,
      }
    }

    const editorContext: EditorContext = {}
    const context = request.context ?? {}
    if (context.hoveredClipId) editorContext.hoveredClipId = context.hoveredClipId
    if (context.selectedClipIds?.length) editorContext.selectedClipIds = context.selectedClipIds
    if (context.playheadMs !== undefined) editorContext.playheadMs = context.playheadMs
    if (context.activeZoneId) editorContext.activeZoneId = context.activeZoneId
    store.setContext(sessionId, editorContext)

    const described = store.describe(sessionId)
    const toolList = await client.listTools()

    // The dialogue thread carries across turns (capped); the Show state is
    // re-read fresh each turn, so mouse edits between utterances are seen.
    const dialogue = (request.history ?? [])
      .filter((entry) => (entry.role === 'user' || entry.role === 'assistant') && typeof entry.text === 'string')
      .slice(-12)
    const { finalText, disposition } = await runDictationTurn({
      store,
      sessionId,
      agent: timedAgent(
        agent,
        timing.delayMs,
        () => { timing.agentStartedAt = Date.now() },
        () => { agentRuns += 1; timing.agentEndedAt = Date.now() },
      ),
      utterance: request.utterance,
      history: dialogue,
      listing: opened.listing,
      description: projectionForAgent(described.ok ? (described.description as unknown as Record<string, unknown>) : null),
      instructions: DICTATION_RULES,
      editorContext,
      onMalformedToolCall: () => { mutationCalls += 1 },
      tools: dictationTools(toolList.tools).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
      callTool: async (name, args) => {
        if (!readOnlyTools.has(name)) mutationCalls += 1
        if (name === 'resize_clip' && Object.keys(args).some(key => !['session_id', 'clip_id', 'clip', 'duration_ms'].includes(key))) mutationCalls += 1
        const at = Date.now()
        onProgress({ kind: 'tool', name, ...(requestId ? { requestId } : {}), at })
        const result = await client.callTool({ name, arguments: args })
        const content = result.content as Array<{ type: string; text: string }>
        const payload = content?.[0]?.type === 'text' ? JSON.parse(content[0].text) : null
        const isError = result.isError === true
        const issue = isError ? firstIssueMessage(payload) : undefined
        timing.toolCalls.push({ name, at, ms: Date.now() - at, ...(isError ? { isError, ...(issue ? { issue } : {}) } : {}) })
        return { payload, isError }
      },
      ...(script ? { script } : {}),
    })

    const history = store.describeChanges(sessionId)
    const summaries = history.ok ? history.entries.map((entry) => entry.summary) : []
    const changed = disposition.kind === 'committed'
    const exported = changed ? store.export(sessionId) : null
    timing.exportedAt = Date.now()
    return {
      reply: finalText || '(no reply)',
      privateOutcome: disposition,
      changed,
      summaries,
      ...(changed && exported?.ok ? { show: exported.show } : {}),
      ...(changed && exported?.ok && agentRuns === 1 && mutationCalls === 1 && applyAttempts === 1 && executedResize ? { retryResize: executedResize } : {}),
      timing,
    }
  } finally {
    await client.close().catch(() => {})
    await server.close().catch(() => {})
  }
}

export async function runRetryUtterance(
  agent: DictationAgent,
  request: UtteranceRequest,
  onProgress: (event: ProgressEvent) => void = () => {},
  scripted = false,
  clock: { acceptedAt?: number; delayMs?: number } = {},
): Promise<UtteranceRun> {
  const acceptedAt = clock.acceptedAt ?? Date.now()
  const timing: BridgeTurnTiming = { acceptedAt, delayMs: clock.delayMs ?? 0, agentStartedAt: acceptedAt, agentEndedAt: acceptedAt, exportedAt: acceptedAt, toolCalls: [] }
  const refuse = (reply: string): UtteranceRun => ({ privateOutcome: { kind: 'service-refused' }, reply, changed: false, summaries: [], timing })
  const intent = parseAgentResizeIntent(request.retryResize)
  if (!intent) return refuse('The retained resize is unavailable.')
  if (timing.delayMs > 0) await new Promise(resolve => setTimeout(resolve, timing.delayMs))
  timing.agentStartedAt = Date.now()
  const proposed = await runTargetedResizeTurn(agent, intent, scripted)
  timing.agentEndedAt = Date.now()
  if (proposed.kind !== 'proposal') return refuse('The exact resize was not proposed.')
  const store = createSessionStore({ authoringValidation: true })
  const opened = store.open(request.show, [], { allowUnresolvedUserPatterns: true })
  if (!opened.ok) return refuse('The current Show did not open for editing.')
  const id = opened.sessionId
  try {
    if (!store.begin(id, 'Retry exact Clip duration').ok) return refuse('The retry did not start.')
    const applied = store.apply(id, 'resize_clip', { clip_id: intent.clipId, duration_ms: intent.durationMs })
    if (!applied.ok) return refuse(applied.issues[0]?.message ?? 'The original Clip cannot be resized.')
    const at = Date.now()
    const committed = store.commit(id)
    timing.validation = { at, ms: Date.now() - at, ok: committed.ok }
    onProgress({ kind: 'validation', requestId: request.requestId, ...timing.validation })
    if (!committed.ok) return refuse('The current Show refused the exact resize.')
    if (!committed.changes.length) return { ...refuse('The Clip already has that duration.'), privateOutcome: { kind: 'nothing-applied' } }
    const exported = store.export(id)
    if (!exported.ok) return refuse('The private retry could not be exported.')
    timing.exportedAt = Date.now()
    return { privateOutcome: { kind: 'committed', summary: committed.summary }, reply: `Resize the original Clip to ${intent.durationMs / 1000}s.`, changed: true, summaries: [committed.summary], show: exported.show, retryResize: intent, timing }
  } finally { store.close(id) }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  response.end(payload)
}

export interface BridgeOptions {
  agent: DictationAgent
  /**
   * Honour per-request `script` and `delayMs`. Only meaningful with the
   * scripted fake agent; a live agent never runs a script.
   */
  scripted?: boolean
  /**
   * The paid-call guard (#945) the live agent dispatches through. The
   * server begins one accounting unit per /utterance turn, so the per-unit
   * call ceiling is per bridge turn, repair turn included. Absent for the
   * scripted agent, which never dispatches.
   */
  guard?: PaidCallGuard
  /**
   * Scripted mode: the completion delay applied when a request names none
   * (#945 browser sequences). Defaults to `BRIDGE_DELAY_MS`, else 0.
   */
  defaultDelayMs?: number
  /**
   * The current request's progress sink, for an agent whose model-call
   * events are wired at construction time (the OpenAI adapter's onEvent).
   * The server sets it while a turn runs and clears it afterwards.
   */
  progress?: { current: ((event: ProgressEvent) => void) | null }
  /** Operational log line sink; defaults to console.log. */
  log?: (line: string) => void
}

/** The bridge's HTTP server, created but not yet listening. */
export function createBridgeServer(options: BridgeOptions): Server {
  const { agent } = options
  const log = options.log ?? ((line: string) => console.log(line))
  const progress = options.progress ?? { current: null }
  const chatScript = readFileSync(join(here, 'chat.js'), 'utf8')
  const envDelay = Number(process.env.BRIDGE_DELAY_MS ?? 0)
  const defaultDelayMs = options.defaultDelayMs ?? (Number.isFinite(envDelay) && envDelay > 0 ? envDelay : 0)

  // One utterance at a time: the editor applies each result before the next
  // turn, and interleaved edits of the same record would race.
  let busy = false
  let turns = 0

  return createServer((request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      response.end()
      return
    }
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { ok: true, model: agent.name, scripted: options.scripted === true, defaultDelayMs })
      return
    }
    if (request.method === 'GET' && request.url === '/chat.js') {
      response.writeHead(200, {
        'Content-Type': 'text/javascript',
        'Access-Control-Allow-Origin': '*',
      })
      response.end(chatScript)
      return
    }
    if (request.method === 'POST' && request.url === '/resize') {
      if (busy) { sendJson(response, 429, { kind: 'refused' }); return }
      busy = true
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        void (async () => {
          try {
            const intent: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            turns += 1
            options.guard?.beginUnit(`bridge-turn-${turns}`)
            if (options.scripted && defaultDelayMs > 0) await new Promise(resolve => setTimeout(resolve, defaultDelayMs))
            sendJson(response, 200, await runTargetedResizeTurn(agent, intent, options.scripted === true))
          } catch { sendJson(response, 200, { kind: 'service-error' }) }
          finally { busy = false }
        })()
      })
      request.on('error', () => { busy = false })
      return
    }
    if (request.method === 'POST' && request.url === '/utterance') {
      if (busy) {
        sendJson(response, 429, { reply: 'One moment — still working on the previous request.', changed: false, summaries: [] })
        return
      }
      busy = true
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        void (async () => {
          // NDJSON stream: progress lines as the turn runs, then one final
          // line carrying the ordinary response payload - so the overlay can
          // narrate what is happening instead of showing a wait cursor.
          response.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
          })
          const emit = (payload: BridgeEvent) => response.write(`${JSON.stringify(payload)}\n`)
          let requestId = mintRequestId()
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as UtteranceRequest
            if (typeof body?.requestId === 'string' && body.requestId.trim()) requestId = body.requestId.trim()
            body.requestId = requestId
            const acceptedAt = Date.now()
            if (!body?.show || typeof body.utterance !== 'string' || body.utterance.trim().length === 0) {
              emit({
                kind: 'done',
                requestId,
                reply: 'The request needs a show and an utterance.',
                privateOutcome: { kind: 'service-refused' },
                changed: false,
                summaries: [],
                timing: { acceptedAt, delayMs: 0, agentStartedAt: acceptedAt, agentEndedAt: acceptedAt, exportedAt: acceptedAt, toolCalls: [] },
              })
              return
            }
            emit({ kind: 'accepted', requestId, at: acceptedAt })
            log(`[${requestId}] turn: "${body.utterance.slice(0, 80)}"`)
            turns += 1
            options.guard?.beginUnit(`bridge-turn-${turns}`)
            progress.current = (event) => emit({ ...event, requestId })
            const delayMs = options.scripted
              ? (typeof body.delayMs === 'number' && body.delayMs >= 0 ? body.delayMs : defaultDelayMs)
              : 0
            const run = Object.prototype.hasOwnProperty.call(body, 'retryResize') ? runRetryUtterance : runUtterance
            const result = await run(agent, body, (event) => emit(event), options.scripted === true, { acceptedAt, delayMs })
            log(`[${requestId}] turn done in ${((Date.now() - acceptedAt) / 1000).toFixed(1)}s (changed: ${result.changed})`)
            log(`[${requestId}]   reply: ${result.reply.slice(0, 400)}`)
            emit({ kind: 'done', requestId, ...result })
          } catch (error) {
            const at = Date.now()
            emit({
              kind: 'done',
              requestId,
              reply: `The bridge hit an error: ${error instanceof Error ? error.message : String(error)}`,
              privateOutcome: { kind: 'service-error' },
              changed: false,
              summaries: [],
              timing: { acceptedAt: at, delayMs: 0, agentStartedAt: at, agentEndedAt: at, exportedAt: at, toolCalls: [] },
            })
          } finally {
            progress.current = null
            busy = false
            response.end()
          }
        })()
      })
      return
    }
    sendJson(response, 404, { error: 'not found' })
  })
}

export interface StartedBridge {
  server: Server
  port: number
  url: string
  close: () => Promise<void>
}

/**
 * Listen on loopback. `port` 0 (the default) takes an ephemeral port owned
 * by this process; the coordinator's rule is never to assume 8791 is free.
 */
export async function startBridge(options: BridgeOptions & { port?: number }): Promise<StartedBridge> {
  const server = createBridgeServer(options)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const { port } = server.address() as AddressInfo
  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections?.()
      }),
  }
}

/** Split an /utterance NDJSON body into its events. */
export function parseBridgeEvents(ndjson: string): BridgeEvent[] {
  return ndjson
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as BridgeEvent)
}
