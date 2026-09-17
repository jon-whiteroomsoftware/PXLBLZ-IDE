import { describe, expect, it } from 'vitest'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
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
    const fixture = dictationFixture('empty-tail')
    const before = structuredClone(fixture)
    const agent = agentWith({ intent: 'apply', reply: 'Twelve seconds. Anything else?' }, inline)
    const result = await runUtterance(agent, { show: { ...fixture }, utterance: 'Resize' })
    expect(agent.calls).toBe(1)
    expect(result.privateOutcome.kind).toBe('committed')
    expect(result.changed).toBe(true)
    expect(result.summaries).toHaveLength(1)
    expect(fixture).toEqual(before)
    const candidate = result.show as ShowRecordV2
    const { bundle } = buildShowFileBundle(candidate, { patterns: [], maps: [], libraries: [] }, { appVersion: 'typed-outcomes', exportedAt: '2026-09-08T00:00:00.000Z' })
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle), { acceptV2: true })
    expect(reopened.version).toBe(2)
    if (reopened.version !== 2) return
    // A v2 record round-trips whole: the portable file carries the authored
    // record and the importer normalizes nothing away.
    expect(reopened.show).toEqual(bundle.show)
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
    const result = await runUtterance(agent, { show: { ...dictationFixture('empty-tail') }, utterance: 'Resize' })
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

// The candidate every command owner accepts and only the turn's final
// validation refuses: a participant Transition beside a section-scoped Property
// activation, which the compiler cannot split across a derived section
// boundary. v2 catches an unavailable Pattern at the command instead, so this
// is the remaining deferred-validation failure.
async function buildUnsplittableCandidate(context: Parameters<DictationAgent['run']>[0]): Promise<void> {
  const first = context.listing.clips[0]
  const created = await context.callTool('create_clips', {
    session_id: context.sessionId,
    clips: [{
      zone_id: first.zoneId, layer_id: first.layerId,
      start_ms: first.endMs, duration_ms: 10_000,
      pattern: { kind: 'stock', id: 'TestPattern2D' },
    }],
  })
  const createdClipId = ((created.payload as { changes?: Array<{ details?: { clips?: string[] } }> })
    .changes?.[0]?.details?.clips ?? []).find((id) => id !== first.clipId)!
  await context.callTool('add_property_tracks', {
    session_id: context.sessionId,
    tracks: [{
      target: { kind: 'view-brightness', clip_id: createdClipId },
      keyframes: [{ at_ms: first.endMs, value: 1 }, { at_ms: first.endMs + 10_000, value: 0.2 }],
    }],
  })
  await context.callTool('insert_transition', {
    session_id: context.sessionId,
    from_clip_id: first.clipId, to_clip_id: createdClipId,
    duration_ms: 2_000, kind: 'crossfade',
  })
}

it('never exports an invalid final candidate after the one repair opportunity', async () => {
  let calls = 0
  const result = await runUtterance({ name: 'unrepaired', run: async (context) => {
    calls += 1
    if (calls === 1) await buildUnsplittableCandidate(context)
    return { finalText: 'Added.', completion: { intent: 'apply' } }
  } }, { show: { ...dictationFixture('empty-tail') }, utterance: 'Crossfade into an animated Clip' })
  expect(calls).toBe(2)
  expect(result.privateOutcome.kind).toBe('commit-refused')
  expect(result.changed).toBe(false)
  expect(result.show).toBeUndefined()
  expect(result.summaries).toEqual([])
})

// v2 global times are exact safe integers, so the fractional-time and negative
// -duration partitions are refused by the tool schema before the owner runs;
// the protocol-domain case in showsMcpServer.e2e covers those. What remains
// here is attribution: a committed insertion reports its band, an uncommitted
// turn reports nothing.
it.each([
  { duration: 1000, finish: 'apply', expected: { startMs: 30000, endMs: 31000 } },
  { duration: 1000, finish: 'refuse', expected: undefined },
])('exports insertion attribution only for committed registry work: $duration/$finish', async ({ duration, finish, expected }) => {
  const result = await runUtterance({ name: 'insertion-attribution', run: async context => {
    await runToolRound(context, [
      { id: 'insert', name: 'insert_time', args: { session_id: context.sessionId, at_ms: 30000, duration_ms: duration } },
      { id: 'finish', name: 'finish_turn', args: { intent: finish, reply: 'Done.' } },
    ])
    return { finalText: 'Done.' }
  } }, { show: { ...dictationFixture('empty-tail') }, utterance: 'Insert time' })
  expect(result.changes?.find(change => change.range)?.range).toEqual(expected)
  if (!expected) expect(result.changes).toBeUndefined()
})
