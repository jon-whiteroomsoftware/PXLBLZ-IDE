import { expect, it } from 'vitest'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { resizeBoundaryShow } from '../baseline/fixtures'
import { createScriptedAgent, runUtterance } from '../bridge/service'
import { runToolRound } from '../experiment/turn'
import { createSessionStore } from '../grammar/session'

async function reopen(show: ShowRecord) {
  const { bundle } = buildShowFileBundle(show, { patterns: [], maps: [] }, { appVersion: '950-resize', exportedAt: '2026-09-08T00:00:00Z' })
  return (await parseShowFileBundle(await serializeShowFileBundle(bundle))).show
}

it.each([[4000], [7999], [8000], [8001], [12000], [4000, 8000], [8000, 8000]])('exports exact scripted private resize or no candidate for %j', async (...values) => {
  const durations = values as number[]
  const show = resizeBoundaryShow()
  const original = structuredClone(show)
  const result = await runUtterance({ name: 'canonical-resize-script', run: async context => {
    const round = await runToolRound(context, durations.map((duration_ms, index) => ({ id: `resize-${index}`, name: 'resize_clip', args: { clip_id: 'resize-a', duration_ms, session_id: context.sessionId } })))
    if (!round.ended) context.finishTurn!({ intent: durations.some(value => value > 8000) ? 'refuse' : 'apply', reply: 'Exact resize result.' })
    return { finalText: 'Exact resize result.' }
  } }, { show: { ...show }, utterance: 'Exact resize' })
  const duration = durations[durations.length - 1]
  if (duration === 4000 || duration > 8000) {
    expect(result.changed).toBe(false)
    expect(result.show).toBeUndefined()
    expect(result.privateOutcome.kind).toBe(duration === 4000 ? 'nothing-applied' : 'refused')
  } else {
    expect(result.privateOutcome.kind).toBe('committed')
    const expected = structuredClone(show)
    expected.composition!.scenes[0].zones[0].main[0].durationMs = duration
    const reopened = await reopen(result.show as ShowRecord)
    expect(reopened).toEqual({ ...await reopen(expected), updatedAt: reopened.updatedAt })
  }
  expect(show).toEqual(original)
})

it('moves B then resizes A in one valid-intermediate private transaction with exact undo/redo', () => {
  const store = createSessionStore()
  const source = resizeBoundaryShow()
  source.composition!.scenes[0].zones[0].main[1].durationMs = 4000
  const original = structuredClone(source)
  const opened = store.open(source)
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues))
  const id = opened.sessionId
  const before = store.export(id)
  expect(store.begin(id, 'Move B then resize A').ok).toBe(true)
  expect(store.apply(id, 'move_clip', { clip_id: 'resize-b', start_ms: 16000 }).ok).toBe(true)
  expect(store.apply(id, 'resize_clip', { clip_id: 'resize-a', duration_ms: 12000 }).ok).toBe(true)
  expect(store.export(id)).toEqual(before)
  expect(store.describeChanges(id)).toMatchObject({ ok: true, entries: [] })
  expect(source).toEqual(original)
  expect(store.commit(id)).toMatchObject({ ok: true, changes: [{ op: 'move_clip' }, { op: 'resize_clip' }] })
  const after = store.export(id)
  expect(after.ok).toBe(true)
  if (after.ok && before.ok) {
    const expected = structuredClone(before.show)
    expected.composition!.scenes[0].zones[0].main[0].durationMs = 12000
    expected.composition!.scenes[0].zones[0].main[1].startMs = 16000
    expect(after.show).toEqual({ ...expected, updatedAt: after.show.updatedAt })
  }
  expect(store.describeChanges(id)).toMatchObject({ ok: true, entries: [{ label: 'Move B then resize A' }] })
  expect(store.undo(id).ok).toBe(true)
  expect(store.export(id)).toEqual(before)
  expect(store.undo(id)).toMatchObject({ ok: false, issues: [{ code: 'history-exhausted' }] })
  expect(store.redo(id).ok).toBe(true)
  expect(store.export(id)).toEqual(after)
  expect(store.redo(id)).toMatchObject({ ok: false, issues: [{ code: 'history-exhausted' }] })
})

// #950 finite mixed batch: B is four seconds here; existing baseline R stays intact.
it('exports the complete scripted move-then-resize candidate', async () => {
  const show = resizeBoundaryShow()
  show.composition!.scenes[0].zones[0].main[1].durationMs = 4000
  const before = structuredClone(show)
  const result = await runUtterance(createScriptedAgent(), {
    show: { ...show }, utterance: 'move the second Clip to sixteen seconds then make the first Clip twelve seconds',
  }, undefined, true)
  expect(result.privateOutcome.kind).toBe('committed')
  expect(result.changed).toBe(true)
  expect(result.timing.toolCalls.filter(call => call.name !== 'describe_show').map(call => call.name)).toEqual(['move_clip', 'resize_clip'])
  expect(result.summaries).toHaveLength(1)
  const expected = structuredClone(show)
  expected.composition!.scenes[0].zones[0].main[0].durationMs = 12000
  expected.composition!.scenes[0].zones[0].main[1].startMs = 16000
  const reopened = await reopen(result.show as ShowRecord)
  expect(reopened).toEqual({ ...await reopen(expected), updatedAt: reopened.updatedAt })
  expect(show).toEqual(before)
})

it.each([
  ['move the second Clip to sixteen seconds then try seventeen seconds for the first', 'refused'],
  ['move the second Clip to sixteen seconds but leave the batch incomplete', 'incomplete'],
])('discards the complete private mixed batch for %s', async (utterance, kind) => {
  const show = resizeBoundaryShow()
  show.composition!.scenes[0].zones[0].main[1].durationMs = 4000
  const original = structuredClone(show)
  const result = await runUtterance(createScriptedAgent(), { show: { ...show }, utterance }, undefined, true)
  expect(result.privateOutcome.kind).toBe(kind)
  expect(result.changed).toBe(false)
  expect(result.show).toBeUndefined()
  expect(result.summaries).toEqual([])
  expect(result.timing.toolCalls.find(call => call.name === 'move_clip')).toMatchObject({ name: 'move_clip' })
  expect(result.timing.toolCalls.find(call => call.name === 'move_clip')?.isError).not.toBe(true)
  if (kind === 'refused') expect(result.timing.toolCalls.find(call => call.name === 'resize_clip')).toMatchObject({ isError: true })
  expect(show).toEqual(original)
})

it('commits a move beside an already-satisfied resize as one complete candidate', async () => {
  const show = resizeBoundaryShow()
  show.composition!.scenes[0].zones[0].main[1].durationMs = 4000
  const result = await runUtterance(createScriptedAgent(), { show: { ...show }, utterance: 'Move with a no-op resize', script: [
    { tool: 'move_clip', args: { clip_id: 'resize-b', start_ms: 16000 } },
    { tool: 'resize_clip', args: { clip_id: 'resize-a', duration_ms: 4000, finish_turn_reply: { intent: 'apply', reply: 'Moved B; A already has the requested duration.' } } },
  ] }, undefined, true)
  expect(result.privateOutcome.kind).toBe('committed')
  expect(result.summaries).toHaveLength(1)
  const expected = structuredClone(show)
  expected.composition!.scenes[0].zones[0].main[1].startMs = 16000
  const reopened = await reopen(result.show as ShowRecord)
  expect(reopened).toEqual({ ...await reopen(expected), updatedAt: reopened.updatedAt })
})

it('rolls back the earlier private move after an exact resize refusal without history', () => {
  const store = createSessionStore()
  const show = resizeBoundaryShow()
  show.composition!.scenes[0].zones[0].main[1].durationMs = 4000
  const opened = store.open(show)
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues))
  const id = opened.sessionId
  const before = store.export(id)
  expect(store.begin(id, 'refused mixed batch').ok).toBe(true)
  expect(store.apply(id, 'move_clip', { clip_id: 'resize-b', start_ms: 16000 }).ok).toBe(true)
  expect(store.apply(id, 'resize_clip', { clip_id: 'resize-a', duration_ms: 17000 }).ok).toBe(false)
  expect(store.export(id)).toEqual(before)
  expect(store.rollback(id)).toMatchObject({ ok: true, discardedChanges: 1 })
  expect(store.export(id)).toEqual(before)
  expect(store.describeChanges(id)).toMatchObject({ ok: true, entries: [] })
  expect(store.undo(id).ok).toBe(false)
  expect(store.redo(id).ok).toBe(false)
})

it('does not export an earlier move when final validation refuses the mixed batch', async () => {
  const show = resizeBoundaryShow()
  show.composition!.scenes[0].zones[0].main[1].durationMs = 4000
  const original = structuredClone(show)
  let calls = 0
  const result = await runUtterance({ name: 'mixed-final-refusal', run: async context => {
    if (++calls === 1) {
      await context.callTool('move_clip', { session_id: context.sessionId, clip_id: 'resize-b', start_ms: 16000 })
      await context.callTool('add_clip', { session_id: context.sessionId, zone_id: 'z1', start_ms: 12000, duration_ms: 4000, pattern_kind: 'stock', pattern_id: 'missing-pattern' })
    }
    return { finalText: 'Apply the batch.', completion: { intent: 'apply' } }
  } }, { show: { ...show }, utterance: 'Mixed final refusal' })
  expect(calls).toBe(2) // Existing one repair opportunity was exhausted.
  expect(result.privateOutcome.kind).toBe('commit-refused')
  expect(result.changed).toBe(false)
  expect(result.show).toBeUndefined()
  expect(result.summaries).toEqual([])
  expect(show).toEqual(original)
})
