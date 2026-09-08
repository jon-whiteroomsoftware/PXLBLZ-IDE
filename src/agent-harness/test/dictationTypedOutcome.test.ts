import { describe, expect, it } from 'vitest'
import { dictationFixture } from '../experiment/fixtures.js'
import type { DictationAgent } from '../experiment/runner.js'
import { runDictationTurn } from '../experiment/turn.js'
import { createSessionStore } from '../grammar/session.js'

// #949 B1: the finish protocol, not reply punctuation, owns the private transaction.
async function exercise(finish: unknown) {
  const store = createSessionStore()
  const opened = store.open(dictationFixture('empty-second-scene'))
  if (!opened.ok) throw new Error('fixture refused')
  const sessionId = opened.sessionId
  const before = store.export(sessionId)
  const history = store.describeChanges(sessionId)
  const agent: DictationAgent = { name: 'typed-finish-test', run: async (context) => {
    const result = store.apply(sessionId, 'resize_clip', { clip_id: opened.listing.clips[0].clipId, duration_ms: 12000 })
    expect(result.ok).toBe(true)
    if (finish !== undefined) context.finishTurn!(finish as never)
    return { finalText: 'A plain reply cannot authorize a commit.' }
  } }
  const result = await runDictationTurn({ store, sessionId, agent, utterance: 'Resize', history: [], listing: opened.listing, description: {}, instructions: '', editorContext: {}, tools: [], callTool: async () => { throw new Error('unused') } })
  return { store, sessionId, before, history, result }
}

describe('explicit private turn outcomes', () => {
  it('commits apply even when its reply contains a question mark', async () => {
    const { store, sessionId, result } = await exercise({ intent: 'apply', reply: 'Twelve seconds. Anything else?' })
    expect(result.disposition.kind).toBe('committed')
    const history = store.describeChanges(sessionId)
    expect(history.ok && history.entries).toHaveLength(1)
  })
  it.each(['ask', 'refuse', 'incomplete'])('discards pending edits for %s without question punctuation', async (intent) => {
    const { store, sessionId, before, history, result } = await exercise({ intent, reply: 'Choose a different target.' })
    expect(result.disposition.kind).toBe(intent === 'ask' ? 'asked' : intent === 'refuse' ? 'refused' : 'incomplete')
    expect(store.export(sessionId)).toEqual(before)
    expect(store.describeChanges(sessionId)).toEqual(history)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: null })
  })
  it.each([undefined, {}, { intent: 'save' }, { intent: 'apply', reply: 1 }, { intent: 'apply', outcome: 'ask' }])('fails closed for absent or malformed completion %j', async (finish) => {
    const { store, sessionId, before, history, result } = await exercise(finish)
    expect(result.disposition.kind).toBe('incomplete')
    expect(store.export(sessionId)).toEqual(before)
    expect(store.describeChanges(sessionId)).toEqual(history)
  })
})

// Seed both past and future, then traverse the public undo/redo API to inspect
// complete history records. Entry counts alone would miss corrupted redo state.
it.each(['ask', 'refuse', 'incomplete', 'missing', 'malformed'])('preserves complete past/future through %s', async (intent) => {
  const store = createSessionStore()
  const opened = store.open(dictationFixture('empty-second-scene'))
  if (!opened.ok) throw new Error('fixture refused')
  const sessionId = opened.sessionId
  const clip_id = opened.listing.clips[0].clipId
  const initial = store.export(sessionId)
  expect(store.apply(sessionId, 'resize_clip', { clip_id, duration_ms: 20000 }).ok).toBe(true)
  const past = store.export(sessionId)
  const pastEntries = store.describeChanges(sessionId)
  expect(store.apply(sessionId, 'add_marker', { at_ms: 5000, name: 'Existing future' }).ok).toBe(true)
  const future = store.export(sessionId)
  const allEntries = store.describeChanges(sessionId)
  expect(store.undo(sessionId).ok).toBe(true)
  const result = await runDictationTurn({
    store, sessionId, utterance: 'Private edit', history: [], listing: opened.listing,
    description: {}, instructions: '', editorContext: {}, tools: [],
    callTool: async () => { throw new Error('unused') },
    agent: { name: 'history-preservation', run: async (context) => {
      expect(store.apply(sessionId, 'resize_clip', { clip_id, duration_ms: 12000 }).ok).toBe(true)
      if (intent !== 'missing') context.finishTurn!((intent === 'malformed' ? { intent: 'apply', reply: false } : { intent, reply: 'Choose a target.' }) as never)
      return { finalText: 'Plain text.' }
    } },
  })
  expect(result.disposition.kind).not.toBe('committed')
  expect(store.export(sessionId)).toEqual(past)
  expect(store.describeChanges(sessionId)).toEqual(pastEntries)
  expect(store.redo(sessionId).ok).toBe(true)
  expect(store.export(sessionId)).toEqual(future)
  expect(store.describeChanges(sessionId)).toEqual(allEntries)
  expect(store.redo(sessionId).ok).toBe(false)
  expect(store.undo(sessionId).ok).toBe(true)
  expect(store.export(sessionId)).toEqual(past)
  expect(store.undo(sessionId).ok).toBe(true)
  expect(store.export(sessionId)).toEqual(initial)
  expect(store.undo(sessionId).ok).toBe(false)
})

it('rejects contradictory returned intent after staged apply', async () => {
  const store = createSessionStore()
  const opened = store.open(dictationFixture('empty-second-scene'))
  if (!opened.ok) throw new Error('fixture refused')
  const before = store.export(opened.sessionId)
  const result = await runDictationTurn({
    store, sessionId: opened.sessionId, utterance: 'Resize', history: [], listing: opened.listing,
    description: {}, instructions: '', editorContext: {}, tools: [], callTool: async () => { throw new Error('unused') },
    agent: { name: 'contradictory-return', run: async (context) => {
      store.apply(opened.sessionId, 'resize_clip', { clip_id: opened.listing.clips[0].clipId, duration_ms: 12000 })
      expect(context.finishTurn!({ intent: 'apply', reply: 'Ready.' }).ok).toBe(true)
      return { finalText: 'Choose a target.', completion: { intent: 'ask' } }
    } },
  })
  expect(result.disposition).toEqual({ kind: 'incomplete', reason: 'invalid-finish', discardedChanges: 1 })
  expect(store.export(opened.sessionId)).toEqual(before)
  expect(store.describeChanges(opened.sessionId)).toEqual({ ok: true, entries: [] })
})

it('adds one private entry over existing history, and undo/redo restore complete records', async () => {
  const store = createSessionStore()
  const opened = store.open(dictationFixture('empty-second-scene'))
  if (!opened.ok) throw new Error('fixture refused')
  const sessionId = opened.sessionId
  expect(store.apply(sessionId, 'add_marker', { at_ms: 5000, name: 'Existing marker' }).ok).toBe(true)
  const before = store.export(sessionId)
  const historyBefore = store.describeChanges(sessionId)
  const result = await runDictationTurn({
    store, sessionId, utterance: 'Resize and mark', history: [], listing: opened.listing,
    description: {}, instructions: '', editorContext: {}, tools: [], callTool: async () => { throw new Error('unused') },
    agent: { name: 'multi-operation', run: async (context) => {
      expect(store.apply(sessionId, 'resize_clip', { clip_id: opened.listing.clips[0].clipId, duration_ms: 12000 }).ok).toBe(true)
      expect(store.apply(sessionId, 'add_marker', { at_ms: 10000, name: 'New marker' }).ok).toBe(true)
      context.finishTurn!({ intent: 'apply', reply: 'Done. Anything else?' })
      return { finalText: 'Done.' }
    } },
  })
  expect(result.disposition.kind).toBe('committed')
  const after = store.export(sessionId)
  const historyAfter = store.describeChanges(sessionId)
  expect(historyAfter.ok && historyAfter.entries).toEqual([
    ...(historyBefore.ok ? historyBefore.entries : []),
    { index: 1, label: 'Resize and mark', summary: expect.any(String), changes: [expect.objectContaining({ op: 'resize_clip' }), expect.objectContaining({ op: 'add_marker' })] },
  ])
  expect(store.undo(sessionId).ok).toBe(true)
  expect(store.export(sessionId)).toEqual(before)
  expect(store.describeChanges(sessionId)).toEqual(historyBefore)
  expect(store.redo(sessionId).ok).toBe(true)
  expect(store.export(sessionId)).toEqual(after)
  expect(store.describeChanges(sessionId)).toEqual(historyAfter)
  expect(store.redo(sessionId).ok).toBe(false)
})
