// Provenance: pxlblz-v3 test/grammarTransactions.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { createSessionStore, type GrammarSessionStore } from '../grammar/session.js'
import { grammarFixtureShow } from './support/grammarFixture.js'

// Test model (issue #20). Boundary: the session store's transaction surface.
// Invariants: one committed transaction is exactly one history entry; undo
// restores the pre-transaction document and redo reapplies it; a new commit
// after undo clears the redo stack; rollback and a refused commit leave the
// committed document and history untouched; auto-wrapped operations behave
// exactly as in #17 (one validated entry each). Sequences interleave
// begin/apply/commit/undo/redo/rollback, including refusal-then-fix-then-
// commit, undo past the beginning, redo past the end, and mixed transaction
// and auto-wrapped operations.

function openSession(store: GrammarSessionStore) {
  const opened = store.open(grammarFixtureShow({ emptyTail: true }))
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues))
  const clip = opened.listing.clips.find((candidate) => candidate.startMs === 0)
  if (!clip) throw new Error('no clip at 0 ms')
  return { sessionId: opened.sessionId, clipId: clip.clipId }
}

function exported(store: GrammarSessionStore, sessionId: string): ShowRecordV2 {
  const result = store.export(sessionId)
  if (!result.ok) throw new Error(JSON.stringify(result.issues))
  return result.show
}

function firstClipDuration(show: ShowRecordV2): number {
  const first = [...show.composition.clips].sort((left, right) => left.startMs - right.startMs)[0]
  if (!first) throw new Error('the Show has no Clips')
  return first.durationMs
}

function historyLength(store: GrammarSessionStore, sessionId: string): number {
  const described = store.describeChanges(sessionId)
  if (!described.ok) throw new Error('describeChanges failed')
  return described.entries.length
}

describe('editing-session transactions (#20)', () => {
  it('commits a multi-operation transaction as one history entry with a prose summary', () => {
    const store = createSessionStore()
    const { sessionId, clipId } = openSession(store)
    const original = exported(store, sessionId)

    expect(store.begin(sessionId, 'owner example').ok).toBe(true)
    const resized = store.apply(sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 12_000 })
    expect(resized.ok).toBe(true)
    if (resized.ok) expect(resized.transaction).toBe('owner example')
    expect(store.apply(sessionId, 'add_property_tracks', {
      tracks: [{
        target: { kind: 'view-brightness', clip_id: clipId },
        keyframes: [
          { at_ms: 3_000, value: 0.8 },
          { at_ms: 8_000, value: 0.4 },
        ],
      }],
    }).ok).toBe(true)

    // Nothing committed yet: the document is unchanged and history empty.
    expect(firstClipDuration(exported(store, sessionId))).toBe(30_000)
    expect(historyLength(store, sessionId)).toBe(0)

    const committed = store.commit(sessionId)
    if (!committed.ok) throw new Error(JSON.stringify(committed.issues))
    expect(committed.label).toBe('owner example')
    expect(committed.changes).toHaveLength(2)
    expect(committed.summary).toContain('12')
    expect(committed.summary.toLowerCase()).toContain('track')
    expect(historyLength(store, sessionId)).toBe(1)
    expect(firstClipDuration(exported(store, sessionId))).toBe(12_000)

    // Undo restores the pre-transaction document; redo reapplies it.
    const undone = store.undo(sessionId)
    if (!undone.ok) throw new Error('undo failed')
    expect(undone.summary).toContain('owner example')
    expect(exported(store, sessionId)).toEqual(original)

    const redone = store.redo(sessionId)
    expect(redone.ok).toBe(true)
    expect(firstClipDuration(exported(store, sessionId))).toBe(12_000)

    // describe_changes returns the same summary afterward.
    const described = store.describeChanges(sessionId, 0)
    if (!described.ok) throw new Error('describe failed')
    expect(described.entries[0].label).toBe('owner example')
    expect(described.entries[0].summary).toBe(committed.summary)
  })

  it('clears the redo stack when a new commit lands after undo', () => {
    const store = createSessionStore()
    const { sessionId, clipId } = openSession(store)
    expect(store.apply(sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 12_000 }).ok).toBe(true)
    expect(store.undo(sessionId).ok).toBe(true)
    expect(store.apply(sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 20_000 }).ok).toBe(true)
    const redo = store.redo(sessionId)
    expect(redo.ok).toBe(false)
    if (!redo.ok) expect(redo.issues[0].code).toBe('history-exhausted')
    expect(firstClipDuration(exported(store, sessionId))).toBe(20_000)
  })

  it('rollback discards the working copy and leaves document and history untouched', () => {
    const store = createSessionStore()
    const { sessionId, clipId } = openSession(store)
    const original = exported(store, sessionId)

    expect(store.begin(sessionId, 'doomed').ok).toBe(true)
    expect(store.apply(sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 5_000 }).ok).toBe(true)
    const rolledBack = store.rollback(sessionId)
    if (!rolledBack.ok) throw new Error('rollback failed')
    expect(rolledBack.discardedChanges).toBe(1)
    expect(exported(store, sessionId)).toEqual(original)
    expect(historyLength(store, sessionId)).toBe(0)

    // The session accepts a new transaction afterwards.
    expect(store.begin(sessionId, 'next').ok).toBe(true)
    expect(store.rollback(sessionId).ok).toBe(true)
  })

  it('refuses the operation that would make the working copy invalid, leaving the transaction open', () => {
    // Under v1 an unresolvable Pattern reference was accepted into the working
    // copy and caught at commit, because tier-0 was deferred inside a
    // transaction. Every v2 owner validates its own complete candidate before
    // returning, so the refusal now arrives at the operation with the owner's
    // own code and the working copy never holds an invalid record. The
    // transaction stays open either way, which is the property this case owns.
    const store = createSessionStore()
    const { sessionId, clipId } = openSession(store)
    const original = exported(store, sessionId)

    expect(store.begin(sessionId, 'needs fixing').ok).toBe(true)
    const refused = store.apply(sessionId, 'create_clips', {
      clips: [{
        zone_id: 'z1',
        layer_id: 'layer:z1:main',
        start_ms: 35_000,
        duration_ms: 5_000,
        pattern: { kind: 'user', id: 'no-such-pattern' },
      }],
    })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.issues[0].code).toBe('missing-dependency')
    expect(exported(store, sessionId)).toEqual(original)
    expect(historyLength(store, sessionId)).toBe(0)

    // The transaction is still open: do the edit that works and commit.
    expect(store.apply(sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 12_000 }).ok).toBe(true)
    const committed = store.commit(sessionId)
    expect(committed.ok).toBe(true)
    expect(historyLength(store, sessionId)).toBe(1)
  })

  it('auto-wraps operations outside a transaction as one validated entry each', () => {
    const store = createSessionStore()
    const { sessionId, clipId } = openSession(store)

    expect(store.apply(sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 12_000 }).ok).toBe(true)
    expect(store.apply(sessionId, 'add_marker', { at_ms: 6_000, name: 'Mid' }).ok).toBe(true)
    expect(historyLength(store, sessionId)).toBe(2)

    // Outside a transaction the same owner refusal applies per operation.
    const invalid = store.apply(sessionId, 'create_clips', {
      clips: [{
        zone_id: 'z1',
        layer_id: 'layer:z1:main',
        start_ms: 35_000,
        duration_ms: 5_000,
        pattern: { kind: 'user', id: 'no-such-pattern' },
      }],
    })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.issues[0].code).toBe('missing-dependency')
    expect(historyLength(store, sessionId)).toBe(2)

    // Mixed history: undo twice returns to the original document.
    expect(store.undo(sessionId).ok).toBe(true)
    expect(store.undo(sessionId).ok).toBe(true)
    expect(firstClipDuration(exported(store, sessionId))).toBe(30_000)
    const spent = store.undo(sessionId)
    expect(spent.ok).toBe(false)
    if (!spent.ok) expect(spent.issues[0].code).toBe('history-exhausted')
  })

  it('refuses nested transactions and transaction commands without a transaction', () => {
    const store = createSessionStore()
    const { sessionId, clipId } = openSession(store)

    const commitWithout = store.commit(sessionId)
    expect(commitWithout.ok).toBe(false)
    if (!commitWithout.ok) expect(commitWithout.issues[0].code).toBe('no-transaction')
    const rollbackWithout = store.rollback(sessionId)
    expect(rollbackWithout.ok).toBe(false)
    if (!rollbackWithout.ok) expect(rollbackWithout.issues[0].code).toBe('no-transaction')

    expect(store.begin(sessionId, 'outer').ok).toBe(true)
    const nested = store.begin(sessionId, 'inner')
    expect(nested.ok).toBe(false)
    if (!nested.ok) {
      expect(nested.issues[0].code).toBe('transaction-open')
      expect(nested.issues[0].message).toContain('outer')
    }

    // Undo and redo refuse while a transaction is open.
    expect(store.apply(sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 12_000 }).ok).toBe(true)
    const undoOpen = store.undo(sessionId)
    expect(undoOpen.ok).toBe(false)
    if (!undoOpen.ok) expect(undoOpen.issues[0].code).toBe('transaction-open')
    const redoOpen = store.redo(sessionId)
    expect(redoOpen.ok).toBe(false)
    if (!redoOpen.ok) expect(redoOpen.issues[0].code).toBe('transaction-open')
  })

  it('describe_changes bounds its entry index and an empty commit preserves history', () => {
    const store = createSessionStore()
    const { sessionId } = openSession(store)
    const emptyIndex = store.describeChanges(sessionId, 0)
    expect(emptyIndex.ok).toBe(false)

    expect(store.begin(sessionId, 'noop').ok).toBe(true)
    const committed = store.commit(sessionId)
    if (!committed.ok) throw new Error('commit failed')
    expect(committed.summary).toBe('No operations were applied.')
    expect(historyLength(store, sessionId)).toBe(0)
    const outOfRange = store.describeChanges(sessionId, 5)
    expect(outOfRange.ok).toBe(false)
    if (!outOfRange.ok) expect(outOfRange.issues[0].message).toBe('The history is empty.')
  })
})

it('preserves session history and redo across valid no-op resize, including a wholly no-op batch', () => {
  const store = createSessionStore()
  const { sessionId, clipId } = openSession(store)
  const initial = exported(store, sessionId)
  expect(store.apply(sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 12000 }).ok).toBe(true)
  const future = exported(store, sessionId)
  expect(store.undo(sessionId).ok).toBe(true)
  expect(store.apply(sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 30000 })).toMatchObject({ ok: true, changes: [] })
  expect(store.begin(sessionId, 'Already requested').ok).toBe(true)
  expect(store.apply(sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 30000 })).toMatchObject({ ok: true, changes: [] })
  expect(store.commit(sessionId)).toMatchObject({ ok: true, changes: [] })
  expect(exported(store, sessionId)).toEqual(initial)
  expect(historyLength(store, sessionId)).toBe(0)
  expect(store.redo(sessionId).ok).toBe(true)
  expect(exported(store, sessionId)).toEqual(future)
})
