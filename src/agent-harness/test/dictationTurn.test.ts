// Provenance: pxlblz-v3 test/dictationTurn.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { dictationFixture } from '../experiment/fixtures.js'
import type { AgentTurnContext, DictationAgent } from '../experiment/runner.js'
import { DICTATION_READ_TOOLS, FINISH_ARGUMENT, dictationTools, projectionForAgent, runDictationTurn, runToolRound } from '../experiment/turn.js'
import { runCase } from '../experiment/runner.js'
import { DICTATION_CASES } from '../experiment/cases.js'
import { DICTATION_RULES, OPERATING_RULES, evaluatePropertyAt } from '../grammar/read.js'
import { SHOW_GRAMMAR_OPERATIONS } from '../grammar/registry.js'
import { createSessionStore, type GrammarSessionStore } from '../grammar/session.js'
import { createShowsServer } from '../mcp/showsServer.js'

// Test model (issue #34). Boundary: one dictation turn over a real session
// store and the in-memory MCP client, driven by scripted agents; the
// animation operations through the registry. Invariants: exactly one
// history entry per committing turn and none per asking turn; a rolled-back
// turn leaves the document byte-identical; the model never sees a ceremony
// tool; evaluated values in results equal the engine evaluator over the
// exported document. Partitions: applied+statement, applied+question,
// nothing+statement, invalid working copy with a successful repair, with a
// failed repair, and with a repair that asks; two turns of one conversation.

type Step = { tool: string; args: Record<string, unknown> } | { say: string }

/** An agent that plays one scripted turn per run call, in order. */
function scriptedTurns(turns: Step[][]): DictationAgent & { prompts: string[]; finishRefusals: string[][] } {
  const prompts: string[] = []
  const finishRefusals: string[][] = []
  // The last change target survives across turns, as a model's memory would.
  let lastTarget: string | undefined
  return {
    name: 'scripted-turns',
    prompts,
    finishRefusals,
    run: async (context: AgentTurnContext) => {
      prompts.push(context.utterance)
      const steps = turns.shift() ?? []
      let finalText = ''
      for (const step of steps) {
        if ('say' in step) {
          finalText = step.say
          continue
        }
        const args = Object.fromEntries(
          Object.entries(step.args).map(([key, value]) => [key, value === '$last' ? lastTarget : value]),
        )
        if (step.tool === 'finish_turn') {
          const ended = context.finishTurn!(args.reply as string | undefined)
          if (ended.ok) return { finalText: ended.finalText, timing: { calls: [{ ms: 1, toolCalls: steps.length }], rateLimitWaitMs: 0 } }
          finishRefusals.push(ended.issues.map((issue) => issue.code))
          continue
        }
        const { payload, isError } = await context.callTool(step.tool, { session_id: context.sessionId, ...args })
        if (!isError && payload && typeof payload === 'object' && 'changes' in payload) {
          lastTarget = (payload as { changes: Array<{ targetId: string }> }).changes[0]?.targetId
        }
      }
      return { finalText, timing: { calls: [{ ms: 1, toolCalls: steps.length }], rateLimitWaitMs: 0 } }
    },
  }
}

async function harness(fixture: 'base' | 'empty-second-scene' = 'empty-second-scene') {
  const store = createSessionStore()
  const server = createShowsServer({ sessions: store })
  const client = new Client({ name: 'turn-test', version: '0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  const opened = store.open(dictationFixture(fixture))
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
    let payload: unknown
    try {
      payload = text === null ? null : JSON.parse(text)
    } catch {
      payload = { error: text }
    }
    return { payload, isError: result.isError === true }
  }
  const clipId = opened.listing.clips[0].clipId
  const run = (agent: DictationAgent, utterance: string, history: Array<{ role: 'user' | 'assistant'; text: string }> = []) =>
    runDictationTurn({
      store,
      sessionId: opened.sessionId,
      agent,
      utterance,
      history,
      listing: opened.listing,
      description: described.ok ? described.description : null,
      instructions: DICTATION_RULES,
      editorContext: {},
      tools,
      callTool,
    })
  return { store, sessionId: opened.sessionId, clipId, run, serverToolNames: toolList.tools.map((tool) => tool.name) }
}

function history(store: GrammarSessionStore, sessionId: string) {
  const described = store.describeChanges(sessionId)
  return described.ok ? described.entries : []
}

function exported(store: GrammarSessionStore, sessionId: string): string {
  const result = store.export(sessionId)
  return result.ok ? JSON.stringify(result.show) : 'export failed'
}

async function harnessTools() {
  const client = new Client({ name: 'turn-test', version: '0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await createShowsServer({ sessions: createSessionStore() }).connect(serverTransport)
  await client.connect(clientTransport)
  const { tools } = await client.listTools()
  return { serverTools: tools }
}

describe('one tool round (#38)', () => {
  // A stub context records calls; finishTurn commits when told to.
  function stub(refuse: string[] = [], finishOk = true) {
    const called: Array<{ name: string; args: Record<string, unknown> }> = []
    const finishes: Array<string | undefined> = []
    const context = {
      callTool: async (name: string, args: Record<string, unknown>) => {
        called.push({ name, args })
        return refuse.includes(name)
          ? { payload: { ok: false, issues: [{ code: 'overlap', message: 'no' }] }, isError: true }
          : { payload: { ok: true, changes: [{ targetId: 'x', description: `${name} done.` }] }, isError: false }
      },
      finishTurn: (reply?: string) => {
        finishes.push(reply)
        return finishOk
          ? { ok: true as const, finalText: reply ?? 'from results' }
          : { ok: false as const, issues: [{ code: 'result-invalid' as const, message: 'invalid' }] }
      },
    }
    return { context, called, finishes }
  }

  it('runs operations in order, strips finish_turn_reply, and ends the turn after the last one', async () => {
    const { context, called, finishes } = stub()
    const round = await runToolRound(context, [
      { id: 'a', name: 'resize_clip', args: { clip_id: 'c', duration_ms: 1 } },
      { id: 'b', name: 'add_marker', args: { at_ms: 5, [FINISH_ARGUMENT]: 'Done both.' } },
    ])
    expect(called.map((call) => call.name)).toEqual(['resize_clip', 'add_marker'])
    expect(called[1].args).toEqual({ at_ms: 5 })
    expect(finishes).toEqual(['Done both.'])
    expect(round.ended).toEqual({ finalText: 'Done both.' })
  })

  it('an empty finish_turn_reply replies from the results', async () => {
    const { context, finishes } = stub()
    const round = await runToolRound(context, [{ id: 'a', name: 'add_marker', args: { at_ms: 5, [FINISH_ARGUMENT]: '' } }])
    expect(finishes).toEqual([undefined])
    expect(round.ended).toEqual({ finalText: 'from results' })
  })

  it('runs finish_turn after the operations whatever order the model listed them', async () => {
    const { context, called } = stub()
    const round = await runToolRound(context, [
      { id: 'f', name: 'finish_turn', args: { reply: 'Ok.' } },
      { id: 'a', name: 'resize_clip', args: { clip_id: 'c', duration_ms: 1 } },
    ])
    expect(called.map((call) => call.name)).toEqual(['resize_clip'])
    expect(round.ended).toEqual({ finalText: 'Ok.' })
    expect(round.outputs.map((output) => output.id)).toEqual(['a'])
  })

  it('never finishes a round in which an operation was refused', async () => {
    const { context, finishes } = stub(['resize_clip'])
    const round = await runToolRound(context, [
      { id: 'a', name: 'resize_clip', args: { clip_id: 'c', duration_ms: 1, [FINISH_ARGUMENT]: 'Done.' } },
      { id: 'f', name: 'finish_turn', args: {} },
    ])
    expect(finishes).toEqual([])
    expect(round.ended).toBeNull()
    expect(round.outputs.find((output) => output.id === 'f')).toMatchObject({ isError: true, payload: { ok: false } })
  })

  it('hands a refused commit back on the operation output when finishing by argument', async () => {
    const { context } = stub([], false)
    const round = await runToolRound(context, [{ id: 'a', name: 'add_marker', args: { at_ms: 5, [FINISH_ARGUMENT]: 'Done.' } }])
    expect(round.ended).toBeNull()
    expect(round.outputs[0].payload).toMatchObject({ ok: true, finish_turn: { ok: false } })
  })

  it('reports finish as unavailable without a turn module', async () => {
    const { context } = stub()
    const round = await runToolRound({ callTool: context.callTool }, [{ id: 'f', name: 'finish_turn', args: {} }])
    expect(round.ended).toBeNull()
    expect(round.outputs[0]).toMatchObject({ id: 'f', isError: true })
  })

  it('a parse error is an error output and blocks finishing', async () => {
    const { context, called } = stub()
    const round = await runToolRound(context, [
      { id: 'a', name: 'resize_clip', args: {}, parseError: 'bad json' },
      { id: 'f', name: 'finish_turn', args: {} },
    ])
    expect(called).toEqual([])
    expect(round.ended).toBeNull()
    expect(round.outputs[0].payload).toMatchObject({ error: expect.stringContaining('bad json') })
  })
})

describe('dictation tool list (#34)', () => {
  it('is the editing vocabulary: every registry operation plus the four read tools, no ceremony', async () => {
    const { serverToolNames } = await harness()
    const allowed = dictationTools(serverToolNames.map((name) => ({ name }))).map((tool) => tool.name)
    const expected = [
      ...serverToolNames.filter((name) => SHOW_GRAMMAR_OPERATIONS.some((operation) => operation.name === name)),
      ...serverToolNames.filter((name) => (DICTATION_READ_TOOLS as readonly string[]).includes(name)),
      'finish_turn',
    ].sort()
    expect([...allowed].sort()).toEqual(expected)
    // finish_turn is the harness's, never the server's (#38).
    expect(serverToolNames).not.toContain('finish_turn')
    expect(allowed[allowed.length - 1]).toBe('finish_turn')
    for (const ceremony of ['begin_edit', 'commit_edit', 'rollback_edit', 'undo', 'redo', 'open_show',
      'close_session', 'export_show', 'set_editor_context', 'get_editor_context', 'describe_changes',
      'validate_show', 'compile_show', 'measure_show', 'critique_show', 'list_stock_patterns']) {
      expect(serverToolNames, `${ceremony} stays on the server`).toContain(ceremony)
      expect(allowed, `${ceremony} is hidden from dictation`).not.toContain(ceremony)
    }
    // Every operation carries finish_turn_reply; read tools do not (#38).
    const { serverTools } = await harnessTools()
    const narrowed = dictationTools(serverTools)
    for (const tool of narrowed) {
      const properties = (tool.inputSchema as { properties: Record<string, unknown> }).properties
      const isOperation = SHOW_GRAMMAR_OPERATIONS.some((operation) => operation.name === tool.name)
      expect(FINISH_ARGUMENT in properties, tool.name).toBe(isOperation)
    }
    // Server order is preserved, so the list is byte-stable across turns.
    expect(allowed.slice(0, -1)).toEqual(serverToolNames.filter((name) => allowed.includes(name)))
  })

  it('states the harness-held transaction in the dictation rules only', () => {
    expect(DICTATION_RULES).toContain('held by the editor')
    expect(DICTATION_RULES).not.toContain('begin_edit … commit_edit')
    expect(OPERATING_RULES).toContain('begin_edit … commit_edit')
    for (const rules of [DICTATION_RULES, OPERATING_RULES]) {
      expect(rules).toContain('Operation results are authoritative')
      expect(rules).not.toContain('Confirm without rendering')
    }
  })
})

describe('one dictation turn (#34)', () => {
  it('commits applied operations as one entry labelled with the utterance', async () => {
    const { store, sessionId, clipId, run } = await harness()
    const result = await run(
      scriptedTurns([[{ tool: 'resize_clip', args: { clip_id: clipId, duration_ms: 12_000 } }, { say: 'The clip is 12 s.' }]]),
      'Make the first clip twelve seconds long.',
    )
    expect(result.disposition).toEqual({ kind: 'committed', summary: expect.stringContaining('12000 ms') })
    expect(result.finalText).toBe('The clip is 12 s.')
    expect(history(store, sessionId)).toEqual([
      { index: 0, label: 'Make the first clip twelve seconds long.', summary: expect.any(String), changes: [expect.objectContaining({ op: 'resize_clip' })] },
    ])
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
    expect(result.timings).toHaveLength(1)
  })

  it('discards the edits of a turn that ends by asking', async () => {
    const { store, sessionId, clipId, run } = await harness()
    const before = exported(store, sessionId)
    const result = await run(
      scriptedTurns([[{ tool: 'resize_clip', args: { clip_id: clipId, duration_ms: 12_000 } }, { say: 'Did you mean the first clip?' }]]),
      'Make that clip twelve seconds.',
    )
    expect(result.disposition).toEqual({ kind: 'asked' })
    expect(history(store, sessionId)).toEqual([])
    expect(exported(store, sessionId)).toBe(before)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('leaves no entry when nothing was applied', async () => {
    const { store, sessionId, run } = await harness()
    const before = exported(store, sessionId)
    const result = await run(scriptedTurns([[{ say: 'A main-layer clip cannot animate opacity.' }]]), 'Fade its opacity.')
    expect(result.disposition).toEqual({ kind: 'nothing-applied' })
    expect(history(store, sessionId)).toEqual([])
    expect(exported(store, sessionId)).toBe(before)
  })

  const badClip = { tool: 'add_clip', args: { zone_id: 'z1', start_ms: 35_000, duration_ms: 10_000, pattern_kind: 'user', pattern_id: 'nope' } }

  it('hands a refused commit back as one repair turn and commits the repaired edit', async () => {
    const { store, sessionId, run } = await harness()
    const agent = scriptedTurns([
      [badClip, { say: 'Added the clip.' }],
      [
        { tool: 'remove_clip', args: { clip_id: '$last' } },
        { tool: 'add_clip', args: { zone_id: 'z1', start_ms: 35_000, duration_ms: 10_000, pattern_kind: 'stock', pattern_id: 'CometLoom' } },
        { say: 'Added a CometLoom clip at 35 s instead.' },
      ],
    ])
    const result = await run(agent, 'Add my library pattern at 35 seconds.')
    expect(agent.prompts).toHaveLength(2)
    expect(agent.prompts[1]).toMatch(/^\[editor\] The edit could not be applied: .*user/i)
    expect(result.disposition.kind).toBe('committed')
    expect(result.finalText).toBe('Added a CometLoom clip at 35 s instead.')
    const entries = history(store, sessionId)
    expect(entries).toHaveLength(1)
    expect(entries[0].label).toBe('Add my library pattern at 35 seconds.')
    expect(result.timings).toHaveLength(2)
  })

  it('discards the edit and says so when the repair fails again', async () => {
    const { store, sessionId, run } = await harness()
    const before = exported(store, sessionId)
    const result = await run(
      scriptedTurns([[badClip, { say: 'Added the clip.' }], [{ say: 'The library pattern is not available here.' }]]),
      'Add my library pattern at 35 seconds.',
    )
    expect(result.disposition.kind).toBe('commit-refused')
    expect(result.finalText).toMatch(/^The library pattern is not available here\. The edit was discarded: /)
    expect(result.finalText).not.toContain('?')
    expect(history(store, sessionId)).toEqual([])
    expect(exported(store, sessionId)).toBe(before)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('discards the edit when the repair turn asks instead', async () => {
    const { store, sessionId, run } = await harness()
    const result = await run(
      scriptedTurns([[badClip, { say: 'Added the clip.' }], [{ say: 'Should I use a stock pattern instead?' }]]),
      'Add my library pattern at 35 seconds.',
    )
    expect(result.disposition.kind).toBe('commit-refused')
    expect(history(store, sessionId)).toEqual([])
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('counts entries per turn across a conversation', async () => {
    const { store, sessionId, clipId, run } = await harness()
    const asked = await run(scriptedTurns([[{ say: 'Which clip: the first or the second?' }]]), 'Make it longer.')
    expect(asked.disposition).toEqual({ kind: 'asked' })
    const answered = await run(
      scriptedTurns([[{ tool: 'resize_clip', args: { clip_id: clipId, duration_ms: 15_000 } }, { say: 'The first clip is 15 s.' }]]),
      'The first one.',
      [{ role: 'user', text: 'Make it longer.' }, { role: 'assistant', text: asked.finalText }],
    )
    expect(answered.disposition.kind).toBe('committed')
    expect(history(store, sessionId).map((entry) => entry.label)).toEqual(['The first one.'])
  })
})

describe('finish_turn ends the turn in the same response (#38)', () => {
  const badClip = { tool: 'add_clip', args: { zone_id: 'z1', start_ms: 35_000, duration_ms: 10_000, pattern_kind: 'user', pattern_id: 'nope' } }

  it('commits the operations and replies with the given line after one model call', async () => {
    const { store, sessionId, clipId, run } = await harness()
    const result = await run(
      scriptedTurns([[
        { tool: 'resize_clip', args: { clip_id: clipId, duration_ms: 12_000 } },
        { tool: 'finish_turn', args: { reply: 'The first clip is 12 s.' } },
        { say: 'never reached' },
      ]]),
      'Make the first clip twelve seconds long.',
    )
    expect(result.disposition.kind).toBe('committed')
    expect(result.finalText).toBe('The first clip is 12 s.')
    expect(history(store, sessionId).map((entry) => entry.label)).toEqual(['Make the first clip twelve seconds long.'])
    expect(result.timings).toHaveLength(1)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })

  it('replies from the change descriptions when no reply is given', async () => {
    const { clipId, run } = await harness()
    const result = await run(
      scriptedTurns([[{ tool: 'resize_clip', args: { clip_id: clipId, duration_ms: 12_000 } }, { tool: 'finish_turn', args: {} }]]),
      'Make the first clip twelve seconds long.',
    )
    expect(result.disposition.kind).toBe('committed')
    expect(result.finalText).toContain('12000 ms')
  })

  it('treats a finish_turn reply with a question mark as an ask and discards the edits', async () => {
    const { store, sessionId, clipId, run } = await harness()
    const before = exported(store, sessionId)
    const result = await run(
      scriptedTurns([[{ tool: 'resize_clip', args: { clip_id: clipId, duration_ms: 12_000 } }, { tool: 'finish_turn', args: { reply: 'Did you mean the first clip?' } }]]),
      'Make that clip twelve seconds.',
    )
    expect(result.disposition).toEqual({ kind: 'asked' })
    expect(exported(store, sessionId)).toBe(before)
    expect(history(store, sessionId)).toEqual([])
  })

  it('returns the tier-0 issues to the model and commits once the same turn repairs them', async () => {
    const { store, sessionId, run } = await harness()
    const agent = scriptedTurns([[
      badClip,
      { tool: 'finish_turn', args: { reply: 'Added the clip.' } },
      // The model's next round, after seeing the refusal:
      { tool: 'remove_clip', args: { clip_id: '$last' } },
      { tool: 'add_clip', args: { zone_id: 'z1', start_ms: 35_000, duration_ms: 10_000, pattern_kind: 'stock', pattern_id: 'CometLoom' } },
      { tool: 'finish_turn', args: { reply: 'Added a CometLoom clip at 35 s instead.' } },
    ]])
    const result = await run(agent, 'Add my library pattern at 35 seconds.')
    expect(agent.finishRefusals).toEqual([['result-invalid']])
    expect(agent.prompts).toHaveLength(1)
    expect(result.disposition.kind).toBe('committed')
    expect(result.finalText).toBe('Added a CometLoom clip at 35 s instead.')
    expect(history(store, sessionId)).toHaveLength(1)
  })

  it('ends a turn with nothing applied as a statement', async () => {
    const { store, sessionId, run } = await harness()
    const result = await run(
      scriptedTurns([[{ tool: 'finish_turn', args: { reply: 'A main-layer clip cannot animate opacity.' } }]]),
      'Fade its opacity.',
    )
    expect(result.disposition).toEqual({ kind: 'nothing-applied' })
    expect(result.finalText).toBe('A main-layer clip cannot animate opacity.')
    expect(history(store, sessionId)).toEqual([])
  })
})

describe('the projection carries the stock catalogue (#40)', () => {
  it('adds availableStockPatterns to any description', () => {
    const projected = projectionForAgent({ durationMs: 1 }) as { durationMs: number; availableStockPatterns: Array<{ id: string; dimensions: number }> }
    expect(projected.durationMs).toBe(1)
    expect(projected.availableStockPatterns).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'CometLoom' })]))
  })

  it('hands the runner\'s agent the same catalogue the bridge hands its model', async () => {
    let seen: unknown = null
    const probe: DictationAgent = {
      name: 'probe',
      run: async (context) => {
        seen = context.description
        return { finalText: 'Noted.' }
      },
    }
    await runCase(DICTATION_CASES.find((candidate) => candidate.id === 'clips-add-at-time')!, probe)
    const description = seen as { availableStockPatterns: Array<{ id: string }> }
    expect(description.availableStockPatterns.map((pattern) => pattern.id)).toContain('CometLoom')
  })
})

describe('results carry verification (#34)', () => {
  it('returns keyframes at global times and engine-evaluated samples on every animation result', async () => {
    const { store, sessionId, clipId } = await harness('base')
    // The base fixture's first clip sits in Scene 1 at 0 ms, so global == local here;
    // move the check to the second Scene's clip when one exists.
    const added = store.apply(sessionId, 'add_property_track', {
      clip_id: clipId,
      target: 'view-brightness',
      keyframes: [{ time_ms: 3_000, value: 0.8 }, { time_ms: 5_000, value: 0.6 }, { time_ms: 8_000, value: 0.4 }],
    })
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const details = added.changes[0].details as {
      keyframes: Array<{ keyframeId: string; timeMs: number; value: number; easing: string }>
      evaluated: Array<{ atMs: number; value: number }>
    }
    expect(details.keyframes.map((keyframe) => [keyframe.timeMs, keyframe.value])).toEqual([[3_000, 0.8], [5_000, 0.6], [8_000, 0.4]])
    expect(details.evaluated.map((sample) => sample.atMs)).toEqual([3_000, 4_000, 5_000, 6_500, 8_000])
    const exportedDocument = store.export(sessionId)
    if (!exportedDocument.ok) throw new Error('export failed')
    const reopened = createSessionStore()
    const again = reopened.open(exportedDocument.show)
    if (!again.ok) throw new Error('reopen failed')
    for (const sample of details.evaluated) {
      const evaluation = reopened.evaluate(again.sessionId, added.changes[0].targetId, sample.atMs)
      expect(evaluation.ok && evaluation.evaluation.value).toBe(sample.value)
    }

    const moved = store.apply(sessionId, 'move_keyframe', {
      track_id: added.changes[0].targetId,
      keyframe_id: details.keyframes[1].keyframeId,
      time_ms: 6_000,
    })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const movedDetails = moved.changes[0].details as typeof details
    expect(movedDetails.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([3_000, 6_000, 8_000])
    expect(movedDetails.evaluated.map((sample) => sample.atMs)).toEqual([3_000, 4_500, 6_000, 7_000, 8_000])

    const refused = store.apply(sessionId, 'delete_keyframe', {
      track_id: added.changes[0].targetId,
      keyframe_id: details.keyframes[0].keyframeId,
    })
    expect(refused.ok).toBe(true)
    const belowMinimum = store.apply(sessionId, 'delete_keyframe', {
      track_id: added.changes[0].targetId,
      keyframe_id: details.keyframes[1].keyframeId,
    })
    expect(belowMinimum.ok).toBe(false)
    if (!belowMinimum.ok) expect(belowMinimum.issues[0].code).toBe('minimum-keyframes')

    // describe_show lists the same keyframes, so a keyframe id never needs export_show.
    const described = store.describe(sessionId)
    if (!described.ok) throw new Error('describe failed')
    const track = described.description.zones.flatMap((zone) => zone.layers.flatMap((layer) => layer.clips)).flatMap((clip) => clip.tracks)[0]
    expect(track.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([6_000, 8_000])
    const evaluation = evaluatePropertyAt(
      (() => { const result = store.export(sessionId); if (!result.ok) throw new Error('x'); const opened = createSessionStore().open(result.show); if (!opened.ok) throw new Error('y'); return { show: result.show, inlinePatterns: [], options: {} } })(),
      track.trackId,
      7_000,
    )
    expect(evaluation.ok).toBe(true)
  })
})
