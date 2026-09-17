// Re-authored onto the version-2 record and catalogue for #1039.
//
// `resizeBoundaryShow` stays a pinned legacy record — it is also the subject of
// three product suites — so the harness reads it through the app's own
// converter, which preserves the Clip identities this suite binds to.
import { expect, it } from 'vitest'
import { resizeBoundaryShow } from '../baseline/fixtures'
import { createScriptedAgent, runRetryUtterance, runUtterance } from '../bridge/service'
import { runToolRound } from '../experiment/turn'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { toShowRecordV2 } from './support/convertFixture'

const resizeBoundaryShowV2 = () => toShowRecordV2(resizeBoundaryShow())

it('retains the executed logical Clip identity after ordinal resolution', async () => {
  const result = await runUtterance(createScriptedAgent(), {
    show: { ...resizeBoundaryShowV2() }, utterance: 'resize first',
    script: [{ tool: 'resize_clip', args: { clip: { ordinal: 1 }, duration_ms: 6000, finish_turn_reply: { intent: 'apply' } } }],
  }, undefined, true)
  expect(result.privateOutcome.kind, JSON.stringify(result.reply)).toBe('committed')
  expect(result).toHaveProperty('retryResize', { clipId: 'resize-a', durationMs: 6000 })
})

it.each(['noop', 'other-mutation', 'unknown', 'lifecycle', 'malformed', 'extra-argument'])('does not retain a binding after an additional %s attempt', async kind => {
  const result = await runUtterance({ name: 'eligibility-probe', run: async context => {
    if (kind === 'malformed') await runToolRound(context, [{ id: 'bad', name: 'update_clips', args: {}, parseError: 'bad JSON' }])
    else if (kind !== 'extra-argument') {
      // The second mutation is a move through the v2 bulk Clip owner; a noop is
      // the same resize again, and lifecycle/unknown exercise the non-mutating
      // and unknown-tool paths.
      const [name, args] = kind === 'noop'
        ? ['resize_clip', { clip_id: 'resize-a', duration_ms: 4000 }] as const
        : kind === 'other-mutation'
          ? ['update_clips', { updates: [{ clip_id: 'resize-a', start_ms: 1_000 }] }] as const
          : kind === 'lifecycle'
            ? ['undo', {}] as const
            : ['unknown_operation', { clip_id: 'resize-a' }] as const
      await context.callTool(name, { session_id: context.sessionId, ...args })
        .catch(error => { if (kind !== 'unknown') throw error })
    }
    await context.callTool('resize_clip', { session_id: context.sessionId, clip_id: 'resize-a', duration_ms: 6000, ...(kind === 'extra-argument' ? { unknown: 'ignored by MCP' } : {}) })
    return { finalText: 'done', completion: { intent: 'apply' } }
  } }, { show: { ...resizeBoundaryShowV2() }, utterance: 'change' })
  expect(result.privateOutcome.kind).toBe('committed')
  expect(result.retryResize).toBeUndefined()
})

it.each([null, {}, { clipId: 'resize-a', durationMs: 0 }, { clipId: 'absent', durationMs: 6000 }])('refuses invalid or missing retry target %j without a candidate', async retryResize => {
  const show = resizeBoundaryShowV2()
  const original = structuredClone(show)
  const result = await runRetryUtterance(createScriptedAgent(), { show: { ...show }, utterance: 'old', retryResize: retryResize as never }, undefined, true)
  expect(result.changed).toBe(false)
  expect(result.show).toBeUndefined()
  expect(show).toEqual(original)
})

it('re-executes the exact binding on fresh state without resolving the old ordinal', async () => {
  const show = resizeBoundaryShowV2()
  show.name = 'Manual name'
  show.composition.patternInstances[0].patternName = 'Renamed original Pattern'
  // The bound Clip has moved and the collection order has changed since the
  // original turn: the retry must still reach exactly `resize-a`.
  const moved = show.composition.clips.find(clip => clip.id === 'resize-a')!
  moved.startMs = 12_000
  // A held appearance key lives inside its Clip's bar, so it travels with it.
  for (const key of moved.appearance.keys) key.timeMs = 12_000
  show.composition.clips.reverse()
  const before = structuredClone(show)
  const result = await runRetryUtterance(createScriptedAgent(), { show: { ...show }, utterance: 'old first', retryResize: { clipId: 'resize-a', durationMs: 6000 } }, undefined, true)
  expect(result.privateOutcome.kind, JSON.stringify(result.reply)).toBe('committed')
  const expected = structuredClone(show)
  expected.composition.clips.find(clip => clip.id === 'resize-a')!.durationMs = 6000
  expect(result.show).toEqual({ ...expected, updatedAt: (result.show as ShowRecordV2).updatedAt })
  expect(show).toEqual(before)
})

it.each(['end', 'start', 'noop', 'refused', 'incomplete'] as const)('keeps unsupported or uncommitted %s resize ineligible', async kind => {
  const result = await runUtterance({ name: 'shape-probe', run: async context => {
    // Only the exact { clip_id, duration_ms } pair is an eligible binding: a
    // leading or trailing edge names a different shape, and an uncommitted turn
    // never binds at all.
    await context.callTool('resize_clip', { session_id: context.sessionId, clip_id: 'resize-a',
      ...(kind === 'end' ? { end_ms: 6000 } : kind === 'start' ? { start_ms: 1000 } : { duration_ms: kind === 'noop' ? 4000 : 6000 }),
    })
    return { finalText: 'done', completion: { intent: kind === 'refused' ? 'refuse' : kind === 'incomplete' ? 'incomplete' : 'apply' } }
  } }, { show: { ...resizeBoundaryShowV2() }, utterance: 'change' })
  expect(result.retryResize).toBeUndefined()
  expect(result.changed).toBe(kind === 'end' || kind === 'start')
})
