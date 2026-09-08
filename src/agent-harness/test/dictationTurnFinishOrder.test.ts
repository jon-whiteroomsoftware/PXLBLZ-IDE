// V2-authored for #945 (second candidate review of the corrections, P2): the
// finishes of one tool round take effect in the order they occur, and the
// first one that succeeds ends the turn. Before, runToolRound collected the
// first inline finish_turn_reply but ran every explicit finish_turn call
// first, so an operation that asked ("Did you mean the first clip?") followed
// by an explicit finish_turn("Done.") committed the edit the model had just
// put in doubt. Boundary: the OpenAI adapter over a mocked transport driving
// runDictationTurn over a real session store and the in-memory MCP client
// (the path a live model takes), plus runToolRound with a turn-module-shaped
// stub for the refusal payloads. Invariants: operations run first, in order;
// an inline finish occurs when its operation completes and an explicit
// finish_turn after every operation, in listed order; the first successful
// finish stands and every later one is refused as a duplicate; a turn ended
// by an ask discards its operations and commits nothing; a turn ended by a
// statement commits exactly once.
import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { dictationFixture } from '../experiment/fixtures.js'
import { createOpenAiAgent } from '../experiment/openaiAgent.js'
import type { AgentTurnContext, TurnCompletion } from '../experiment/runner.js'
import { FINISH_ARGUMENT, dictationTools, runDictationTurn, runToolRound } from '../experiment/turn.js'
import { DICTATION_RULES } from '../grammar/read.js'
import { createSessionStore, type GrammarSessionStore } from '../grammar/session.js'
import { createShowsServer } from '../mcp/showsServer.js'
import { createGuardedOpenAiTestFixture, functionCall, MOCKED_MODEL } from './support/guardedOpenAiTestFixture.js'

const ASK = 'Did you mean the first clip?'
const STATEMENT = 'The first clip is now twelve seconds.'

describe('the first finish of a round stands, through the adapter (#945 second review, P2)', () => {
  it('an inline ask followed by an explicit finish_turn ends the turn as the ask and commits nothing', async () => {
    const { store, sessionId, resize, finish, runResponse, toolLog } = await harness()
    const before = exported(store, sessionId)
    const result = await runResponse([resize('r1', { [FINISH_ARGUMENT]: { intent: 'ask', reply: ASK } }), finish('f1', { intent: 'apply', reply: 'Done.' })])
    expect(toolLog).toEqual([{ name: 'resize_clip', ok: true }])
    expect(result.disposition).toEqual({ kind: 'asked' })
    expect(result.finalText).toBe(ASK)
    expect(history(store, sessionId)).toEqual([])
    expect(exported(store, sessionId)).toBe(before)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('the same pair with finish_turn listed first: operations still run first, so the inline ask is the first finish', async () => {
    const { store, sessionId, resize, finish, runResponse } = await harness()
    const before = exported(store, sessionId)
    const result = await runResponse([finish('f1', { intent: 'apply', reply: 'Done.' }), resize('r1', { [FINISH_ARGUMENT]: { intent: 'ask', reply: ASK } })])
    expect(result.disposition).toEqual({ kind: 'asked' })
    expect(result.finalText).toBe(ASK)
    expect(history(store, sessionId)).toEqual([])
    expect(exported(store, sessionId)).toBe(before)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('an inline statement followed by an explicit ask commits the statement once', async () => {
    const { store, sessionId, resize, finish, runResponse } = await harness()
    const result = await runResponse([resize('r1', { [FINISH_ARGUMENT]: { intent: 'apply', reply: STATEMENT } }), finish('f1', { intent: 'ask', reply: 'Which clip did you mean?' })])
    expect(result.disposition).toMatchObject({ kind: 'committed' })
    expect(result.finalText).toBe(STATEMENT)
    expect(history(store, sessionId).map((entry) => entry.label)).toEqual(['Make the first clip twelve seconds.'])
    expect(exported(store, sessionId)).toContain('"durationMs":12000')
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('several inline finishes: the earliest operation’s finish decides, whichever way round', async () => {
    const asked = await harness()
    const before = exported(asked.store, asked.sessionId)
    const askFirst = await asked.runResponse([
      asked.resize('r1', { [FINISH_ARGUMENT]: { intent: 'ask', reply: ASK } }),
      asked.marker('m1', { [FINISH_ARGUMENT]: { intent: 'apply', reply: 'Done.' } }),
    ])
    expect(asked.toolLog.map((call) => call.name)).toEqual(['resize_clip', 'add_marker'])
    expect(askFirst.disposition).toEqual({ kind: 'asked' })
    expect(askFirst.finalText).toBe(ASK)
    expect(history(asked.store, asked.sessionId)).toEqual([])
    expect(exported(asked.store, asked.sessionId)).toBe(before)

    const committed = await harness()
    const statementFirst = await committed.runResponse([
      committed.resize('r1', { [FINISH_ARGUMENT]: { intent: 'apply', reply: STATEMENT } }),
      committed.marker('m1', { [FINISH_ARGUMENT]: { intent: 'ask', reply: 'Which clip did you mean?' } }),
    ])
    expect(statementFirst.disposition).toMatchObject({ kind: 'committed' })
    expect(statementFirst.finalText).toBe(STATEMENT)
    const entries = history(committed.store, committed.sessionId)
    expect(entries).toHaveLength(1)
    expect(entries[0].changes.map((change) => change.op)).toEqual(['resize_clip', 'add_marker'])
    expect(transactionClosed(committed.store, committed.sessionId)).toBe(true)
  })
})

function transactionClosed(store: GrammarSessionStore, sessionId: string): boolean {
  const pending = store.pending(sessionId)
  return pending.ok && pending.open === null
}

describe('runToolRound attempts every finish in order and reports the duplicates', () => {
  /** A turn-module-shaped stub: the first finish stages, every later one is refused as already called. */
  function turnModule() {
    const attempts: Array<string | undefined> = []
    let staged: string | null = null
    const context = {
      callTool: async (name: string) => ({ payload: { ok: true, changes: [{ targetId: 'x', description: `${name} done.` }] }, isError: false }),
      finishTurn: (completion: TurnCompletion) => {
        const reply = completion.reply
        attempts.push(reply)
        if (staged !== null) {
          return { ok: false as const, issues: [{ code: 'invalid-argument' as const, message: 'finish_turn was already called this turn; the turn ends when you return, with the first finish.' }] }
        }
        staged = reply ?? 'from results'
        return { ok: true as const, finalText: staged }
      },
    }
    return { context, attempts }
  }

  it('inline finishes in operation order, then explicit ones in listed order; the first stands', async () => {
    const { context, attempts } = turnModule()
    const round = await runToolRound(context, [
      { id: 'a', name: 'resize_clip', args: { clip_id: 'c', duration_ms: 1, [FINISH_ARGUMENT]: { intent: 'ask', reply: ASK } } },
      { id: 'f', name: 'finish_turn', args: { intent: 'apply', reply: 'Done.' } },
      { id: 'b', name: 'add_marker', args: { at_ms: 5, [FINISH_ARGUMENT]: { intent: 'apply', reply: 'Marker added.' } } },
    ])
    expect(attempts).toEqual([ASK, 'Marker added.', 'Done.'])
    expect(round.ended).toEqual({ finalText: ASK })
    const byId = Object.fromEntries(round.outputs.map((output) => [output.id, output]))
    expect(byId.a.payload).not.toHaveProperty('finish_turn')
    expect(byId.b.payload).toMatchObject({ ok: true, finish_turn: { ok: false } })
    expect(byId.f).toMatchObject({ isError: true, payload: { ok: false } })
    expect(JSON.stringify(byId.f.payload)).toMatch(/already/)
  })

  it('an explicit finish listed before the operation is still second to the operation’s inline finish', async () => {
    const { context, attempts } = turnModule()
    const round = await runToolRound(context, [
      { id: 'f', name: 'finish_turn', args: { intent: 'apply', reply: 'Done.' } },
      { id: 'a', name: 'resize_clip', args: { clip_id: 'c', duration_ms: 1, [FINISH_ARGUMENT]: { intent: 'ask', reply: ASK } } },
    ])
    expect(attempts).toEqual([ASK, 'Done.'])
    expect(round.ended).toEqual({ finalText: ASK })
  })

  it('a refused first finish does not block a later one', async () => {
    const attempts: Array<string | undefined> = []
    let calls = 0
    const context = {
      callTool: async () => ({ payload: { ok: true, changes: [] }, isError: false }),
      finishTurn: (completion: TurnCompletion) => {
        const reply = completion.reply
        attempts.push(reply)
        calls += 1
        return calls === 1
          ? { ok: false as const, issues: [{ code: 'result-invalid' as const, message: 'invalid' }] }
          : { ok: true as const, finalText: reply ?? '' }
      },
    }
    const round = await runToolRound(context, [
      { id: 'a', name: 'resize_clip', args: { clip_id: 'c', duration_ms: 1, [FINISH_ARGUMENT]: { intent: 'apply', reply: 'First.' } } },
      { id: 'f', name: 'finish_turn', args: { intent: 'apply', reply: 'Second.' } },
    ])
    expect(attempts).toEqual(['First.', 'Second.'])
    expect(round.ended).toEqual({ finalText: 'Second.' })
  })
})

describe('#949 explicit finish session transport', () => {
  it.each(['apply', 'ask'] as const)('completes explicit %s with session transport in one provider call', async (intent) => {
    const { store, sessionId, resize, runResponse } = await harness()
    const before = exported(store, sessionId)
    const result = await runResponse([
      resize('r1'),
      functionCall('f1', 'finish_turn', { session_id: sessionId, intent, reply: 'Done.' }),
    ])
    expect(result.disposition).toMatchObject({ kind: intent === 'apply' ? 'committed' : 'asked' })
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
    if (intent === 'ask') {
      expect(exported(store, sessionId)).toBe(before)
      expect(history(store, sessionId)).toEqual([])
    } else {
      expect(exported(store, sessionId)).toContain('"durationMs":12000')
      expect(history(store, sessionId)).toHaveLength(1)
      const after = exported(store, sessionId)
      expect(store.undo(sessionId).ok).toBe(true)
      expect(exported(store, sessionId)).toBe(before)
      expect(store.redo(sessionId).ok).toBe(true)
      expect(exported(store, sessionId)).toBe(after)
      const reopened = store.open(JSON.parse(after))
      expect(reopened.ok).toBe(true)
      if (reopened.ok) expect(exported(store, reopened.sessionId)).toBe(after)
    }
  })

  it('checks the current session and passes only typed completion to its owner', async () => {
    const finishTurn = vi.fn(() => ({ ok: true as const, finalText: 'Done.' }))
    const round = await runToolRound({ sessionId: 'current', callTool: vi.fn(), finishTurn }, [
      { id: 'f', name: 'finish_turn', args: { session_id: 'current', intent: 'apply', reply: 'Done.' } },
    ])
    expect(round.ended).toEqual({ finalText: 'Done.' })
    expect(finishTurn).toHaveBeenCalledExactlyOnceWith({ intent: 'apply', reply: 'Done.' })
  })

  it.each([
    { session_id: 'other' },
    { session_id: 7 },
    { session_id: null },
    { session_id: undefined },
    { session_id: 'current', extra: true },
    { session_id: 'current', intent: 'unknown' },
  ])('refuses invalid explicit transport or completion %j', async (extra) => {
    const finishTurn = vi.fn(() => ({ ok: true as const, finalText: 'Done.' }))
    const round = await runToolRound({ sessionId: 'current', callTool: vi.fn(), finishTurn }, [
      { id: 'f', name: 'finish_turn', args: { intent: 'apply', reply: 'Done.', ...extra } },
    ])
    expect(round.ended).toBeNull()
    expect(round.outputs).toMatchObject([{ id: 'f', isError: true, payload: { ok: false } }])
    expect(finishTurn).not.toHaveBeenCalled()
  })

  it('refuses supplied session identity when the round has no current session', async () => {
    const finishTurn = vi.fn(() => ({ ok: true as const, finalText: 'Done.' }))
    const round = await runToolRound({ callTool: vi.fn(), finishTurn }, [
      { id: 'f', name: 'finish_turn', args: { session_id: 'current', intent: 'apply' } },
    ])
    expect(round.ended).toBeNull()
    expect(finishTurn).not.toHaveBeenCalled()
  })

  it('keeps session transport out of inline completion objects', async () => {
    const finishTurn = vi.fn(() => ({ ok: true as const, finalText: 'Done.' }))
    const round = await runToolRound({ sessionId: 'current', callTool: async () => ({ payload: { ok: true }, isError: false }), finishTurn }, [
      { id: 'r', name: 'resize_clip', args: { session_id: 'current', [FINISH_ARGUMENT]: { session_id: 'current', intent: 'apply' } } },
    ])
    expect(round.ended).toBeNull()
    expect(round.outputs[0].payload).toMatchObject({ finish_turn: { ok: false } })
    expect(finishTurn).not.toHaveBeenCalled()
  })

  it.each(['wrong-session', 'extra-key'])('rolls back the complete private edit after %s exhausts the provider round', async (kind) => {
    const { store, sessionId, resize, runResponse } = await harness()
    const before = exported(store, sessionId)
    const beforeHistory = history(store, sessionId)
    const result = await runResponse([
      resize('r1'),
      functionCall('f1', 'finish_turn', { session_id: kind === 'wrong-session' ? 'other' : sessionId, intent: 'apply', ...(kind === 'extra-key' ? { extra: true } : {}) }),
    ], 1)
    expect(result.disposition).toMatchObject({ kind: 'incomplete', reason: 'turn-limit' })
    expect(exported(store, sessionId)).toBe(before)
    expect(history(store, sessionId)).toEqual(beforeHistory)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })
})

async function harness() {
  const store = createSessionStore()
  const server = createShowsServer({ sessions: store })
  const client = new Client({ name: 'finish-order-test', version: '0' })
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
    toolLog.push({ name, ok: result.isError !== true })
    return { payload: text === null ? null : JSON.parse(text), isError: result.isError === true }
  }
  const sessionId = opened.sessionId
  const clipId = opened.listing.clips[0].clipId
  const resize = (id: string, extra: Record<string, unknown> = {}) =>
    functionCall(id, 'resize_clip', { session_id: sessionId, clip_id: clipId, duration_ms: 12_000, ...extra })
  const marker = (id: string, extra: Record<string, unknown> = {}) =>
    functionCall(id, 'add_marker', { session_id: sessionId, at_ms: 5_000, name: 'Drop', ...extra })
  const finish = (id: string, completion: TurnCompletion) => functionCall(id, 'finish_turn', { ...completion })
  const runResponse = async (output: unknown[], maxTurns = 3) => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key-not-a-credential')
    const openai = createGuardedOpenAiTestFixture('finish order')
    try {
      const agent = createOpenAiAgent({
        model: MOCKED_MODEL,
        maxTurns,
        budget: openai.budget,
        transport: openai.transport,
      })
      openai.queue.push(() => ({ output }))
      const result = await runDictationTurn({
        store,
        sessionId,
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
      expect(openai.queue).toHaveLength(0)
      expect(openai.requests).toHaveLength(1)
      expect(openai.budget.status().run).toMatchObject({ entries: 1, settled: 1, reserved: 0, ambiguous: 0 })
      return result
    } finally {
      openai.close()
      vi.unstubAllEnvs()
    }
  }
  return { store, sessionId, resize, marker, finish, runResponse, toolLog }
}

function history(store: GrammarSessionStore, sessionId: string) {
  const described = store.describeChanges(sessionId)
  return described.ok ? described.entries : []
}

function exported(store: GrammarSessionStore, sessionId: string): string {
  const result = store.export(sessionId)
  return result.ok ? JSON.stringify(result.show) : 'export failed'
}
