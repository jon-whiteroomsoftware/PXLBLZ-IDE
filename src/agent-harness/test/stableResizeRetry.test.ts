import { expect, it } from 'vitest'
import { resizeBoundaryShow } from '../baseline/fixtures'
import { createScriptedAgent, runRetryUtterance, runUtterance } from '../bridge/service'
import { runToolRound } from '../experiment/turn'
import type { ShowRecord } from '@/engine/personalContentRecords'

it('retains the executed logical Clip identity after ordinal resolution', async () => {
  const result = await runUtterance(createScriptedAgent(), {
    show: { ...resizeBoundaryShow() }, utterance: 'resize first',
    script: [{ tool: 'resize_clip', args: { clip: { ordinal: 1 }, duration_ms: 6000, finish_turn_reply: { intent: 'apply' } } }],
  }, undefined, true)
  expect(result.privateOutcome.kind).toBe('committed')
  expect(result).toHaveProperty('retryResize', { clipId: 'resize-a', durationMs: 6000 })
})

it.each(['noop', 'other-mutation', 'unknown', 'lifecycle', 'malformed', 'extra-argument'])('does not retain a binding after an additional %s attempt', async kind => {
  const result = await runUtterance({ name: 'eligibility-probe', run: async context => {
    if (kind === 'malformed') await runToolRound(context, [{ id: 'bad', name: 'move_clip', args: {}, parseError: 'bad JSON' }])
    else if (kind !== 'extra-argument') await context.callTool(kind === 'noop' ? 'resize_clip' : kind === 'other-mutation' ? 'move_clip' : kind === 'lifecycle' ? 'undo' : 'unknown_operation', {
      session_id: context.sessionId, clip_id: 'resize-a', ...(kind === 'noop' ? { duration_ms: 4000 } : { start_ms: 0 }),
    }).catch(error => { if (kind !== 'unknown') throw error })
    await context.callTool('resize_clip', { session_id: context.sessionId, clip_id: 'resize-a', duration_ms: 6000, ...(kind === 'extra-argument' ? { unknown: 'ignored by MCP' } : {}) })
    return { finalText: 'done', completion: { intent: 'apply' } }
  } }, { show: { ...resizeBoundaryShow() }, utterance: 'change' })
  expect(result.privateOutcome.kind).toBe('committed')
  expect(result.retryResize).toBeUndefined()
})

it.each([null, {}, { clipId: 'resize-a', durationMs: 0 }, { clipId: 'absent', durationMs: 6000 }])('refuses invalid or missing retry target %j without a candidate', async retryResize => {
  const show = resizeBoundaryShow()
  const original = structuredClone(show)
  const result = await runRetryUtterance(createScriptedAgent(), { show: { ...show }, utterance: 'old', retryResize: retryResize as never }, undefined, true)
  expect(result.changed).toBe(false)
  expect(result.show).toBeUndefined()
  expect(show).toEqual(original)
})

it('re-executes the exact binding on fresh state without resolving the old ordinal', async () => {
  const show = resizeBoundaryShow()
  show.name = 'Manual name'
  show.composition!.patternInstances[0].patternName = 'Renamed original Pattern'
  show.composition!.scenes[0].zones[0].main[0].startMs = 12000
  show.composition!.scenes[0].zones[0].main.reverse()
  const before = structuredClone(show)
  const result = await runRetryUtterance(createScriptedAgent(), { show: { ...show }, utterance: 'old first', retryResize: { clipId: 'resize-a', durationMs: 6000 } }, undefined, true)
  expect(result.privateOutcome.kind).toBe('committed')
  const expected = structuredClone(show)
  expected.composition!.scenes[0].zones[0].main.find(clip => clip.id === 'resize-a')!.durationMs = 6000
  expect(result.show).toEqual({ ...expected, updatedAt: (result.show as ShowRecord).updatedAt })
  expect(show).toEqual(before)
})

it.each(['end', 'start', 'noop', 'refused', 'incomplete'] as const)('keeps unsupported or uncommitted %s resize ineligible', async kind => {
  const result = await runUtterance({ name: 'shape-probe', run: async context => {
    await context.callTool('resize_clip', { session_id: context.sessionId, clip_id: 'resize-a',
      ...(kind === 'end' ? { end_ms: 6000 } : { duration_ms: kind === 'noop' ? 4000 : 6000 }),
      ...(kind === 'start' ? { start_ms: 0 } : {}),
    })
    return { finalText: 'done', completion: { intent: kind === 'refused' ? 'refuse' : kind === 'incomplete' ? 'incomplete' : 'apply' } }
  } }, { show: { ...resizeBoundaryShow() }, utterance: 'change' })
  expect(result.retryResize).toBeUndefined()
  expect(result.changed).toBe(kind === 'end' || kind === 'start')
})
