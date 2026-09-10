import { describe, expect, it } from 'vitest'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { runUtterance } from '../bridge/service.js'
import { showFacts } from '../bridge/smoke.js'
import { dictationFixture } from '../experiment/fixtures.js'
import type { DictationAgent, TurnCompletion } from '../experiment/runner.js'
import { runToolRound } from '../experiment/turn.js'

// Consumer boundary: a typed bridge result only exports validated private work.
// The candidate is checked after .pxlshow serialization/reopen; no live admission claim.
function agentWith(finish: unknown, inline: boolean): DictationAgent & { calls: number } {
  const agent = { name: 'typed-service-test', calls: 0, run: async (context: Parameters<DictationAgent['run']>[0]) => {
    agent.calls += 1
    const args = { session_id: context.sessionId, clip_id: context.listing.clips[0].clipId, duration_ms: 12000 }
    const round = await runToolRound(context, [
      { id: 'edit', name: 'resize_clip', args: { ...args, ...(inline && finish !== undefined ? { finish_turn_reply: finish } : {}) } },
      ...(!inline && finish !== undefined ? [{ id: 'finish', name: 'finish_turn', args: finish as Record<string, unknown> }] : []),
    ])
    return { finalText: round.ended?.finalText ?? 'No typed completion.' }
  } }
  return agent
}

describe('bridge typed private outcome', () => {
  it.each([false, true])('exports a reopened candidate from apply with question punctuation, inline=%s', async (inline) => {
    const fixture = dictationFixture('empty-second-scene')
    const before = structuredClone(fixture)
    const agent = agentWith({ intent: 'apply', reply: 'Twelve seconds. Anything else?' }, inline)
    const result = await runUtterance(agent, { show: { ...fixture }, utterance: 'Resize' })
    expect(agent.calls).toBe(1)
    expect(result.privateOutcome.kind).toBe('committed')
    expect(result.changed).toBe(true)
    expect(result.summaries).toHaveLength(1)
    expect(fixture).toEqual(before)
    const candidate = result.show as ShowRecord
    const { bundle } = buildShowFileBundle(candidate, { patterns: [], maps: [] }, { appVersion: 'typed-outcomes', exportedAt: '2026-09-08T00:00:00.000Z' })
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle))
    // Import normalizes the fixture's legacy defaults; every other field is preserved.
    expect(reopened.show).toEqual({
      ...bundle.show,
      cells: bundle.show.cells.map((clip) => ({ ...clip, restartOnEntry: false })),
      transitions: [{ id: 'transition-s1', afterSceneId: 's1', durationMs: 0, kind: 'cut', easing: { curve: 'linear' } }],
    })
    expect(showFacts(reopened.show).firstClipDurationMs).toBe(12000)
    expect(showFacts(reopened.show).clipCount).toBe(showFacts(fixture).clipCount)
  })
  it.each([
    [{ intent: 'ask', reply: 'Choose a target.' }, 'asked'],
    [{ intent: 'refuse', reply: 'The target is unavailable.' }, 'refused'],
    [{ intent: 'incomplete', reply: 'Work did not finish.' }, 'incomplete'],
    [undefined, 'incomplete'], [{}, 'incomplete'], [{ intent: 'apply', reply: 5 }, 'incomplete'],
  ])('does not expose a candidate for %j', async (finish, kind) => {
    const agent = agentWith(finish, false)
    const result = await runUtterance(agent, { show: { ...dictationFixture('empty-second-scene') }, utterance: 'Resize' })
    expect(agent.calls).toBe(1)
    expect(result.privateOutcome.kind).toBe(kind)
    expect(result.changed).toBe(false)
    expect(result.show).toBeUndefined()
    expect(result.summaries).toEqual([])
  })
  it('reports successful no-change apply without exporting a candidate', async () => {
    const result = await runUtterance({ name: 'no-change', run: async (context) => {
      const completion: TurnCompletion = { intent: 'apply', reply: 'Already as requested?' }
      context.finishTurn!(completion)
      return { finalText: completion.reply! }
    } }, { show: { ...dictationFixture('base') }, utterance: 'No change' })
    expect(result.privateOutcome.kind).toBe('nothing-applied')
    expect(result.changed).toBe(false)
    expect(result.show).toBeUndefined()
  })
})

it('never exports an invalid final candidate after the one repair opportunity', async () => {
  let calls = 0
  const result = await runUtterance({ name: 'unrepaired', run: async (context) => {
    calls += 1
    if (calls === 1) {
      await context.callTool('add_clip', {
        session_id: context.sessionId, zone_id: 'z1', start_ms: 35000,
        duration_ms: 10000, pattern_kind: 'stock', pattern_id: 'missing-pattern',
      })
    }
    return { finalText: 'Added.', completion: { intent: 'apply' } }
  } }, { show: { ...dictationFixture('empty-second-scene') }, utterance: 'Add unavailable Pattern' })
  expect(calls).toBe(2)
  expect(result.privateOutcome.kind).toBe('commit-refused')
  expect(result.changed).toBe(false)
  expect(result.show).toBeUndefined()
  expect(result.summaries).toEqual([])
})

it.each([
  { duration: 1000.4, finish: 'apply', expected: { startMs: 30000, endMs: 31000 } },
  { duration: -1000, finish: 'apply', expected: undefined },
  { duration: 1000, finish: 'refuse', expected: undefined },
])('exports insertion attribution only for committed registry work: $duration/$finish', async ({ duration, finish, expected }) => {
  const result = await runUtterance({ name: 'insertion-attribution', run: async context => {
    await runToolRound(context, [
      { id: 'insert', name: 'insert_time', args: { session_id: context.sessionId, at_ms: 30000.4, duration_ms: duration } },
      { id: 'finish', name: 'finish_turn', args: { intent: finish, reply: 'Done.' } },
    ])
    return { finalText: 'Done.' }
  } }, { show: { ...dictationFixture('empty-second-scene') }, utterance: 'Insert time' })
  expect(result.changes?.find(change => change.range)?.range).toEqual(expected)
  if (!expected) expect(result.changes).toBeUndefined()
})
