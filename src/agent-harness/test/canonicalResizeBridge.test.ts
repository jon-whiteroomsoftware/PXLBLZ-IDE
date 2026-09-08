import { expect, it } from 'vitest'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { resizeBoundaryShow } from '../baseline/fixtures'
import { runUtterance } from '../bridge/service'
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
  const opened = store.open(resizeBoundaryShow())
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues))
  const id = opened.sessionId
  const before = store.export(id)
  expect(store.begin(id, 'Move B then resize A').ok).toBe(true)
  expect(store.apply(id, 'move_clip', { clip_id: 'resize-b', start_ms: 16000 }).ok).toBe(true)
  expect(store.apply(id, 'resize_clip', { clip_id: 'resize-a', duration_ms: 12000 }).ok).toBe(true)
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
  expect(store.redo(id).ok).toBe(true)
  expect(store.export(id)).toEqual(after)
})
