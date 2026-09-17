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
import { createGuardedOpenAiTestFixture, functionCall, MOCKED_MODEL } from './support/guardedOpenAiTestFixture.js'

async function harness() {
  const store = createSessionStore()
  const server = createShowsServer({ sessions: store })
  const client = new Client({ name: 'abnormal-turn-test', version: '0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  const opened = store.open(dictationFixture('empty-tail'))
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
    const openai = createGuardedOpenAiTestFixture('turn-limit exhaustion')
    try {
      const { store, sessionId, clipId, run, toolLog } = await harness()
      const before = exported(store, sessionId)
      const modelCalls: number[] = []
      const agent = createOpenAiAgent({
        model: MOCKED_MODEL,
        maxTurns: 3,
        budget: openai.budget,
        transport: openai.transport,
        onEvent: (event) => {
          if (event.kind === 'model-call') modelCalls.push(event.toolCalls)
        },
      })
      // Three rounds, each requesting work and none finishing: a mutation,
      // a read, another mutation. The adapter's round limit then trips.
      openai.queue.push(
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
      expect(openai.queue).toHaveLength(0)
      expect(openai.requests).toHaveLength(3)
      expect(openai.budget.status().run).toMatchObject({ entries: 3, settled: 3, reserved: 0, ambiguous: 0 })

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
      openai.close()
      vi.unstubAllEnvs()
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
          // Accepted by every owner, refused by the turn's final validation:
          // the compiler cannot split a participant Transition across the
          // derived section boundary a section-scoped activation needs.
          const first = context.listing.clips[0]
          const created = await context.callTool('create_clips', {
            session_id: context.sessionId,
            clips: [{
              zone_id: first.zoneId, layer_id: first.layerId,
              start_ms: first.endMs, duration_ms: 10_000,
              pattern: { kind: 'stock', id: 'TestPattern2D' },
            }],
          })
          if (created.isError) throw new Error('fixture create_clips refused')
          const createdClipId = ((created.payload as { changes?: Array<{ details?: { clips?: string[] } }> })
            .changes?.[0]?.details?.clips ?? []).find((id) => id !== first.clipId)!
          await context.callTool('add_property_tracks', {
            session_id: context.sessionId,
            tracks: [{
              target: { kind: 'view-brightness', clip_id: createdClipId },
              keyframes: [{ at_ms: first.endMs, value: 1 }, { at_ms: first.endMs + 10_000, value: 0.2 }],
            }],
          })
          const inserted = await context.callTool('insert_transition', {
            session_id: context.sessionId,
            from_clip_id: first.clipId, to_clip_id: createdClipId,
            duration_ms: 2_000, kind: 'crossfade',
          })
          if (inserted.isError) throw new Error('fixture insert_transition refused')
          return { finalText: 'Added the crossfade.', completion: { intent: 'apply', reply: 'Added the crossfade.' } }
        }
        return { finalText: 'The turn limit was reached before the edit completed.', incomplete: { reason: 'turn-limit' } }
      },
    }
    const result = await run(agent, 'Crossfade into an animated Clip.')
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
