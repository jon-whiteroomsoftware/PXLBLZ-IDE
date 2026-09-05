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
import { readFileSync } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { ScriptStep } from '../experiment/corpus.js'
import { createFakeAgent, type DictationAgent } from '../experiment/runner.js'
import { dictationTools, projectionForAgent, runDictationTurn } from '../experiment/turn.js'
import { DICTATION_RULES, type EditorContext } from '../grammar/read.js'
import { createSessionStore } from '../grammar/session.js'
import { createShowsServer } from '../mcp/showsServer.js'

const here = dirname(fileURLToPath(import.meta.url))

export interface UtteranceRequest {
  show: Record<string, unknown>
  utterance: string
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
}

export interface UtteranceResponse {
  reply: string
  changed: boolean
  summaries: string[]
  show?: unknown
}

export type ProgressEvent =
  | { kind: 'tool'; name: string }
  | { kind: 'thinking' }

/** One NDJSON line of an /utterance response. */
export type BridgeEvent = ProgressEvent | ({ kind: 'done' } & UtteranceResponse)

/** The corpus's scripted fake agent as a bridge agent: no model, no credential. */
export function createScriptedAgent(): DictationAgent {
  return createFakeAgent()
}

function withDelay(agent: DictationAgent, delayMs: number): DictationAgent {
  return {
    name: agent.name,
    run: async (context) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return agent.run(context)
    },
  }
}

export async function runUtterance(
  agent: DictationAgent,
  request: UtteranceRequest,
  onProgress: (event: ProgressEvent) => void = () => {},
  scripted = false,
): Promise<UtteranceResponse> {
  const store = createSessionStore()
  const server = createShowsServer({ sessions: store })
  const client = new Client({ name: 'dictation-bridge', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    // Editing-session mode: a personal-library pattern on a clip is fine to
    // edit around without its source; only compile needs sources.
    const opened = store.open(request.show, [], { allowUnresolvedUserPatterns: true })
    if (!opened.ok) {
      return {
        reply: `The Show did not open for editing: ${opened.issues[0]?.message ?? 'unknown issue'}`,
        changed: false,
        summaries: [],
      }
    }
    const sessionId = opened.sessionId

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
    const { finalText } = await runDictationTurn({
      store,
      sessionId,
      agent,
      utterance: request.utterance,
      history: dialogue,
      listing: opened.listing,
      description: projectionForAgent(described.ok ? (described.description as unknown as Record<string, unknown>) : null),
      instructions: DICTATION_RULES,
      editorContext,
      tools: dictationTools(toolList.tools).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
      callTool: async (name, args) => {
        onProgress({ kind: 'tool', name })
        const result = await client.callTool({ name, arguments: args })
        const content = result.content as Array<{ type: string; text: string }>
        const payload = content?.[0]?.type === 'text' ? JSON.parse(content[0].text) : null
        return { payload, isError: result.isError === true }
      },
      ...(scripted && request.script ? { script: request.script } : {}),
    })

    const history = store.describeChanges(sessionId)
    const summaries = history.ok ? history.entries.map((entry) => entry.summary) : []
    const changed = summaries.length > 0
    const exported = store.export(sessionId)
    return {
      reply: finalText || '(no reply)',
      changed,
      summaries,
      ...(changed && exported.ok ? { show: exported.show } : {}),
    }
  } finally {
    await client.close().catch(() => {})
    await server.close().catch(() => {})
  }
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

  // One utterance at a time: the editor applies each result before the next
  // turn, and interleaved edits of the same record would race.
  let busy = false

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
      sendJson(response, 200, { ok: true, model: agent.name, scripted: options.scripted === true })
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
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as UtteranceRequest
            if (!body?.show || typeof body.utterance !== 'string' || body.utterance.trim().length === 0) {
              emit({ kind: 'done', reply: 'The request needs a show and an utterance.', changed: false, summaries: [] })
              return
            }
            const turnStart = Date.now()
            log(`turn: "${body.utterance.slice(0, 80)}"`)
            progress.current = (event) => emit(event)
            const delayMs = options.scripted && typeof body.delayMs === 'number' && body.delayMs > 0 ? body.delayMs : 0
            const turnAgent = delayMs > 0 ? withDelay(agent, delayMs) : agent
            const result = await runUtterance(turnAgent, body, (event) => emit(event), options.scripted === true)
            log(`turn done in ${((Date.now() - turnStart) / 1000).toFixed(1)}s (changed: ${result.changed})`)
            log(`  reply: ${result.reply.slice(0, 400)}`)
            emit({ kind: 'done', ...result })
          } catch (error) {
            emit({
              kind: 'done',
              reply: `The bridge hit an error: ${error instanceof Error ? error.message : String(error)}`,
              changed: false,
              summaries: [],
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
