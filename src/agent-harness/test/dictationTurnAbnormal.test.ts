// V2-authored for #945 (integration review correction 1): a turn that ends
// abnormally never commits. Boundary: runDictationTurn over a real session
// store and the in-memory MCP client, driven by (a) the OpenAI adapter over a
// mocked transport and (b) scripted agents. Invariants: a turn whose agent
// exhausts its round limit, returns a typed incompletion, or throws leaves
// the session's document byte-identical, its history empty, and no
// transaction open. Partitions: exhaustion after mutations (the reviewed
// defect), exhaustion during the repair turn, a transport failure after a
// mutation, and the typed path without any provider.
import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { dictationFixture } from '../experiment/fixtures.js'
import { createOpenAiAgent } from '../experiment/openaiAgent.js'
import type { AgentTurnContext, DictationAgent } from '../experiment/runner.js'
import { dictationTools, runDictationTurn } from '../experiment/turn.js'
import { DICTATION_RULES } from '../grammar/read.js'
import { createSessionStore, type GrammarSessionStore } from '../grammar/session.js'
import { createShowsServer } from '../mcp/showsServer.js'

// The provider transport, replaced wholesale: no network, no credential. Each
// queued entry is one model response; the adapter's own loop, tool-round and
// finish handling run unchanged over it.
const transport = vi.hoisted(() => ({
  queue: [] as Array<(input: unknown[]) => { output: unknown[]; output_text?: string }>,
  requests: [] as unknown[][],
}))

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    responses = {
      create: (params: { input: unknown[] }) => ({
        withResponse: async () => {
          const next = transport.queue.shift()
          if (!next) throw new Error('the mocked transport has no response left')
          transport.requests.push([...params.input])
          const data = {
            ...next(params.input),
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens_details: { reasoning_tokens: 0 },
            },
          }
          return { data, response: { headers: { get: () => null } } }
        },
      }),
    }
  },
}))

const functionCall = (id: string, name: string, args: Record<string, unknown>) => ({
  type: 'function_call',
  call_id: id,
  name,
  arguments: JSON.stringify(args),
})

async function harness() {
  const store = createSessionStore()
  const server = createShowsServer({ sessions: store })
  const client = new Client({ name: 'abnormal-turn-test', version: '0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  const opened = store.open(dictationFixture('empty-second-scene'))
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues))
  const described = store.describe(opened.sessionId)
  const toolList = await client.listTools()
  const tools = dictationTools(toolList.tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }))
  const toolLog: Array<{ name: string; ok: boolean }> = []
  const callTool: AgentTurnContext['callTool'] = async (name, args) => {
    const result = await client.callTool({ name, arguments: args })
    const content = result.content as Array<{ type: string; text: string }>
    const text = content?.[0]?.type === 'text' ? content[0].text : null
    const payload = text === null ? null : JSON.parse(text)
    toolLog.push({ name, ok: result.isError !== true })
    return { payload, isError: result.isError === true }
  }
  const clipId = opened.listing.clips[0].clipId
  const run = (agent: DictationAgent, utterance: string) =>
    runDictationTurn({
      store,
      sessionId: opened.sessionId,
      agent,
      utterance,
      history: [],
      listing: opened.listing,
      description: described.ok ? described.description : null,
      instructions: DICTATION_RULES,
      editorContext: {},
      tools,
      callTool,
    })
  return { store, sessionId: opened.sessionId, clipId, run, toolLog }
}

function history(store: GrammarSessionStore, sessionId: string) {
  const described = store.describeChanges(sessionId)
  return described.ok ? described.entries : []
}

function exported(store: GrammarSessionStore, sessionId: string): string {
  const result = store.export(sessionId)
  return result.ok ? JSON.stringify(result.show) : 'export failed'
}

describe('turn-limit exhaustion through the OpenAI adapter (#945)', () => {
  it('rolls back the mutated transaction instead of committing a partial candidate', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key-not-a-credential')
    try {
      const { store, sessionId, clipId, run, toolLog } = await harness()
      const before = exported(store, sessionId)
      const modelCalls: number[] = []
      const agent = createOpenAiAgent({
        model: 'mocked-model',
        maxTurns: 3,
        onEvent: (event) => {
          if (event.kind === 'model-call') modelCalls.push(event.toolCalls)
        },
      })
      // Three rounds, each requesting work and none finishing: a mutation,
      // a read, another mutation. The adapter's round limit then trips.
      transport.queue.push(
        () => ({ output: [functionCall('r1', 'resize_clip', { session_id: sessionId, clip_id: clipId, duration_ms: 12_000 })] }),
        () => ({ output: [functionCall('r2', 'describe_show', { session_id: sessionId })] }),
        () => ({ output: [functionCall('r3', 'add_marker', { session_id: sessionId, at_ms: 5_000, name: 'Drop' })] }),
      )

      const result = await run(agent, 'Make the first clip twelve seconds and drop a marker at five.')

      // The transaction really was mutated before the limit tripped.
      expect(toolLog).toEqual([
        { name: 'resize_clip', ok: true },
        { name: 'describe_show', ok: true },
        { name: 'add_marker', ok: true },
      ])
      expect(modelCalls).toHaveLength(3)
      expect(transport.queue).toHaveLength(0)

      // Abnormal completion: typed, rolled back, reported.
      expect(result.disposition).toEqual({ kind: 'incomplete', reason: 'turn-limit', discardedChanges: 2 })
      expect(result.finalText).toMatch(/turn limit/i)
      expect(result.finalText).toMatch(/discarded/i)
      expect(result.finalText).not.toContain('?')
      expect(history(store, sessionId)).toEqual([])
      expect(exported(store, sessionId)).toBe(before)
      expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
      expect(result.timings).toHaveLength(1)
      expect(result.timings[0].calls).toHaveLength(3)
    } finally {
      vi.unstubAllEnvs()
      transport.queue.length = 0
      transport.requests.length = 0
    }
  })
})

describe('abnormal turn completion through the turn runner (#945)', () => {
  const mutateThen = (
    outcome: () => Promise<{ finalText: string; incomplete?: { reason: 'turn-limit' } }>,
  ): DictationAgent => ({
    name: 'mutate-then',
    run: async (context) => {
      const clipId = context.listing.clips[0].clipId
      const applied = await context.callTool('resize_clip', { session_id: context.sessionId, clip_id: clipId, duration_ms: 12_000 })
      if (applied.isError) throw new Error('fixture resize refused')
      return outcome()
    },
  })

  it('treats a typed incompletion as a discard, whatever the reply text says', async () => {
    const { store, sessionId, run } = await harness()
    const before = exported(store, sessionId)
    const result = await run(
      mutateThen(async () => ({ finalText: 'The clip is now twelve seconds.', incomplete: { reason: 'turn-limit' } })),
      'Make the first clip twelve seconds.',
    )
    expect(result.disposition).toEqual({ kind: 'incomplete', reason: 'turn-limit', discardedChanges: 1 })
    expect(result.finalText).toMatch(/discarded/i)
    expect(history(store, sessionId)).toEqual([])
    expect(exported(store, sessionId)).toBe(before)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('reports an incompletion with nothing applied as nothing applied', async () => {
    const { store, sessionId, run } = await harness()
    const agent: DictationAgent = {
      name: 'exhausted-reader',
      run: async () => ({ finalText: 'The turn limit was reached before the edit completed.', incomplete: { reason: 'turn-limit' } }),
    }
    const result = await run(agent, 'Do something complicated.')
    expect(result.disposition).toEqual({ kind: 'incomplete', reason: 'turn-limit', discardedChanges: 0 })
    expect(history(store, sessionId)).toEqual([])
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('discards the edit when the repair turn exhausts its limit', async () => {
    const { store, sessionId, run } = await harness()
    const before = exported(store, sessionId)
    let turn = 0
    const agent: DictationAgent = {
      name: 'bad-then-exhausted',
      run: async (context) => {
        turn += 1
        if (turn === 1) {
          const added = await context.callTool('add_clip', {
            session_id: context.sessionId,
            zone_id: 'z1',
            start_ms: 35_000,
            duration_ms: 10_000,
            pattern_kind: 'user',
            pattern_id: 'nope',
          })
          if (added.isError) throw new Error('fixture add_clip refused')
          return { finalText: 'Added the clip.' }
        }
        return { finalText: 'The turn limit was reached before the edit completed.', incomplete: { reason: 'turn-limit' } }
      },
    }
    const result = await run(agent, 'Add my library pattern at 35 seconds.')
    expect(turn).toBe(2)
    expect(result.disposition).toMatchObject({ kind: 'incomplete', reason: 'turn-limit' })
    expect(result.finalText).toMatch(/discarded/i)
    expect(history(store, sessionId)).toEqual([])
    expect(exported(store, sessionId)).toBe(before)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('rolls the transaction back before propagating an agent failure', async () => {
    const { store, sessionId, run } = await harness()
    const before = exported(store, sessionId)
    await expect(
      run(mutateThen(async () => { throw new Error('transport dropped') }), 'Make the first clip twelve seconds.'),
    ).rejects.toThrow('transport dropped')
    expect(history(store, sessionId)).toEqual([])
    expect(exported(store, sessionId)).toBe(before)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
    // The session is still usable: a later turn opens its own transaction.
    expect(store.begin(sessionId, 'next turn').ok).toBe(true)
    expect(store.rollback(sessionId).ok).toBe(true)
  })
})
