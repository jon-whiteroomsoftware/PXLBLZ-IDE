// V2-authored for #945 (candidate review of a4e11cc0, P2): finish_turn stages
// the turn's outcome; nothing commits until the agent returns normally.
// Before, finishTurn committed inside agent.run, so an agent that finished
// and then reported a typed incompletion, threw, or finished a second time
// left a committed entry (or overwrote the recorded outcome) behind an
// "incomplete" or failed turn. Boundary: runDictationTurn over a real session
// store and the in-memory MCP client with scripted agents. Invariants: after
// finish_turn the session's history is still empty and its transaction still
// open; a normal return commits exactly once; an abnormal return (typed
// incompletion or exception) after finish_turn leaves the exported document
// byte-identical with an empty history and no open transaction; a second
// finish_turn in the same turn is refused and does not disturb the first.
import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { dictationFixture } from '../experiment/fixtures.js'
import type { AgentTurnContext, DictationAgent } from '../experiment/runner.js'
import { dictationTools, runDictationTurn } from '../experiment/turn.js'
import { DICTATION_RULES } from '../grammar/read.js'
import { createSessionStore, type GrammarSessionStore } from '../grammar/session.js'
import { createShowsServer } from '../mcp/showsServer.js'

async function harness() {
  const store = createSessionStore()
  const server = createShowsServer({ sessions: store })
  const client = new Client({ name: 'staged-finish-test', version: '0' })
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
  const callTool: AgentTurnContext['callTool'] = async (name, args) => {
    const result = await client.callTool({ name, arguments: args })
    const content = result.content as Array<{ type: string; text: string }>
    const text = content?.[0]?.type === 'text' ? content[0].text : null
    return { payload: text === null ? null : JSON.parse(text), isError: result.isError === true }
  }
  const clipId = opened.listing.clips[0].clipId
  const run = (agent: DictationAgent) =>
    runDictationTurn({
      store,
      sessionId: opened.sessionId,
      agent,
      utterance: 'Make the first clip twelve seconds.',
      history: [],
      listing: opened.listing,
      description: described.ok ? described.description : null,
      instructions: DICTATION_RULES,
      editorContext: {},
      tools,
      callTool,
    })
  return { store, sessionId: opened.sessionId, clipId, run }
}

function history(store: GrammarSessionStore, sessionId: string) {
  const described = store.describeChanges(sessionId)
  return described.ok ? described.entries : []
}

function exported(store: GrammarSessionStore, sessionId: string): string {
  const result = store.export(sessionId)
  return result.ok ? JSON.stringify(result.show) : 'export failed'
}

type FinishResult = ReturnType<NonNullable<AgentTurnContext['finishTurn']>>

/** Resize the first clip, call finish_turn, then hand the outcome to `after`. */
function resizeThenFinish(
  after: (finish: FinishResult, context: AgentTurnContext) => Promise<{ finalText: string; incomplete?: { reason: 'turn-limit' } }>,
): DictationAgent {
  return {
    name: 'resize-then-finish',
    run: async (context) => {
      const clipId = context.listing.clips[0].clipId
      const applied = await context.callTool('resize_clip', { session_id: context.sessionId, clip_id: clipId, duration_ms: 12_000 })
      if (applied.isError) throw new Error('fixture resize refused')
      const finish = context.finishTurn!({ intent: 'apply', reply: 'The first clip is now twelve seconds.' })
      return after(finish, context)
    },
  }
}

describe('finish_turn stages the outcome until the agent returns (#945 repair)', () => {
  it('commits once on a normal return, and not before', async () => {
    const { store, sessionId, run } = await harness()
    const before = exported(store, sessionId)
    let seenAtFinish: { history: number; pending: unknown } | null = null
    const result = await run(resizeThenFinish(async (finish) => {
      expect(finish.ok).toBe(true)
      seenAtFinish = { history: history(store, sessionId).length, pending: store.pending(sessionId) }
      return { finalText: finish.ok ? finish.finalText : '' }
    }))
    expect(seenAtFinish).toEqual({ history: 0, pending: { ok: true, open: { label: 'Make the first clip twelve seconds.', changes: 1 } } })
    expect(result.disposition.kind).toBe('committed')
    expect(result.finalText).toBe('The first clip is now twelve seconds.')
    expect(history(store, sessionId).map((entry) => entry.label)).toEqual(['Make the first clip twelve seconds.'])
    expect(exported(store, sessionId)).not.toBe(before)
    expect(exported(store, sessionId)).toContain('"durationMs":12000')
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('discards a finished turn that then reports a typed incompletion', async () => {
    const { store, sessionId, run } = await harness()
    const before = exported(store, sessionId)
    const result = await run(resizeThenFinish(async (finish) => {
      expect(finish.ok).toBe(true)
      return { finalText: 'The turn limit was reached before the edit completed.', incomplete: { reason: 'turn-limit' } }
    }))
    expect(result.disposition).toEqual({ kind: 'incomplete', reason: 'turn-limit', discardedChanges: 1 })
    expect(result.finalText).toMatch(/discarded/i)
    expect(history(store, sessionId)).toEqual([])
    expect(exported(store, sessionId)).toBe(before)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('discards a finished turn whose agent then throws', async () => {
    const { store, sessionId, run } = await harness()
    const before = exported(store, sessionId)
    await expect(run(resizeThenFinish(async (finish) => {
      expect(finish.ok).toBe(true)
      throw new Error('transport dropped after finish')
    }))).rejects.toThrow('transport dropped after finish')
    expect(history(store, sessionId)).toEqual([])
    expect(exported(store, sessionId)).toBe(before)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
    expect(store.begin(sessionId, 'next turn').ok).toBe(true)
    expect(store.rollback(sessionId).ok).toBe(true)
  })

  it('refuses a second finish_turn and keeps the first outcome', async () => {
    const { store, sessionId, run } = await harness()
    let second: FinishResult | null = null
    const result = await run(resizeThenFinish(async (first, context) => {
      expect(first.ok).toBe(true)
      second = context.finishTurn!({ intent: 'apply', reply: 'Nothing was changed after all.' })
      return { finalText: first.ok ? first.finalText : '' }
    }))
    expect(second).toMatchObject({ ok: false })
    expect((second as unknown as { issues: Array<{ message: string }> }).issues[0].message).toMatch(/already/i)
    expect(result.disposition.kind).toBe('committed')
    expect(result.finalText).toBe('The first clip is now twelve seconds.')
    expect(history(store, sessionId)).toHaveLength(1)
    expect(exported(store, sessionId)).toContain('"durationMs":12000')
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('discards a finish that asked, then went abnormal, without touching the document', async () => {
    const { store, sessionId, run } = await harness()
    const before = exported(store, sessionId)
    const agent: DictationAgent = {
      name: 'ask-then-throw',
      run: async (context) => {
        const clipId = context.listing.clips[0].clipId
        await context.callTool('resize_clip', { session_id: context.sessionId, clip_id: clipId, duration_ms: 12_000 })
        const finish = context.finishTurn!({ intent: 'ask', reply: 'Did you mean the first clip?' })
        expect(finish.ok).toBe(true)
        throw new Error('dropped after asking')
      },
    }
    await expect(run(agent)).rejects.toThrow('dropped after asking')
    expect(history(store, sessionId)).toEqual([])
    expect(exported(store, sessionId)).toBe(before)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })
})
