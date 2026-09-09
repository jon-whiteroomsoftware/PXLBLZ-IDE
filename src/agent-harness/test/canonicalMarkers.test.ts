import { expect, it, vi } from 'vitest'
import { applyShowCommand } from '@/engine/showCommands/registry'
import { applyShowGrammarOperation } from '../grammar/registry'
import { openGrammarFixture } from './support/grammarFixture'

it('shares exact marker no-ops and malformed time refusal across canonical and diagnostic surfaces', () => {
  const { document } = openGrammarFixture()
  document.show.composition!.markers = [{ id: 'm', timeMs: 100, name: 'A' }]
  for (const command of ['move_marker', 'update_marker']) {
    const args = { marker_id: 'm', at_ms: 100 }
    expect(applyShowGrammarOperation(document, command, args)).toEqual({ ok: true, document, changes: [] })
  }
  for (const at_ms of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    for (const command of ['add_marker', 'move_marker', 'update_marker']) {
      const args = { ...(command === 'add_marker' ? {} : { marker_id: 'm' }), at_ms }
      expect(applyShowCommand(document.show, command, args).ok).toBe(false)
      expect(applyShowGrammarOperation(document, command, args).ok).toBe(false)
    }
  }
})

it('pairs complete results under deterministic marker IDs', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('marker-1' as ReturnType<typeof crypto.randomUUID>)
  const { document } = openGrammarFixture()
  const args = { at_ms: 70_000, name: 'Beyond', color: 'anything' }
  const canonical = applyShowCommand(document.show, 'add_marker', args)
  const diagnostic = applyShowGrammarOperation(document, 'add_marker', args)
  expect(canonical.ok).toBe(true)
  expect(diagnostic.ok).toBe(true)
  if (canonical.ok && diagnostic.ok) expect({ ...diagnostic.document.show, updatedAt: canonical.record.updatedAt }).toEqual(canonical.record)
  vi.restoreAllMocks()
})

it('keeps mixed changed/no-op transactions atomic and preserves complete history on refusal', async () => {
  const { createSessionStore } = await import('../grammar/session')
  const { document } = openGrammarFixture()
  document.show.composition!.markers = [{ id: 'm', timeMs: 100, name: 'A' }]
  const store = createSessionStore()
  const opened = store.open(document.show)
  expect(opened.ok).toBe(true)
  if (!opened.ok) throw new Error('open')
  const id = opened.sessionId
  const before = store.export(id)
  expect(store.begin(id, 'Markers').ok).toBe(true)
  expect(store.apply(id, 'move_marker', { marker_id: 'm', at_ms: 100 }).ok).toBe(true)
  expect(store.apply(id, 'update_marker', { marker_id: 'm', name: 'B', at_ms: 1000 }).ok).toBe(true)
  expect(store.apply(id, 'move_marker', { marker_id: 'm', at_ms: 1000 }).ok).toBe(true)
  expect(store.commit(id).ok).toBe(true)
  const changed = store.export(id)
  expect(store.apply(id, 'remove_marker', { marker_id: 'absent' }).ok).toBe(false)
  expect(store.apply(id, 'update_marker', { marker_id: 'm' }).ok).toBe(false)
  expect(store.export(id)).toEqual(changed)
  expect(store.undo(id).ok).toBe(true)
  expect(store.export(id)).toEqual(before)
  expect(store.redo(id).ok).toBe(true)
  expect(store.export(id)).toEqual(changed)
})
