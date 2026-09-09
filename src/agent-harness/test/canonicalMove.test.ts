import { expect, it } from 'vitest'
import { applyShowCommand } from '@/engine/showCommands/registry'
import { applyShowGrammarOperation } from '../grammar/registry'
import { openGrammarFixture } from './support/grammarFixture'

it('shares exact move destination and validated no-op outcomes across adapters', () => {
  const { document } = openGrammarFixture({ emptySecondScene: true })
  const composition = document.show.composition!
  const zone = composition.scenes[0].zones[0]
  zone.main[0].durationMs = 2_000
  zone.overlays = [{ id: 'destination', name: 'Destination', placements: [] }]
  const args = { clip_id: zone.main[0].id, start_ms: 5_000, layer: 0 }
  const registry = applyShowCommand(document.show, 'move_clip', args)
  const grammar = applyShowGrammarOperation(document, 'move_clip', args)
  expect(registry.ok).toBe(true)
  expect(grammar.ok).toBe(true)
  if (!registry.ok || !grammar.ok) return
  expect({ ...grammar.document.show, updatedAt: registry.record.updatedAt }).toEqual(registry.record)
  expect(applyShowCommand(registry.record, 'move_clip', args)).toEqual({ ok: true, record: registry.record, changes: [] })
  expect(applyShowGrammarOperation(grammar.document, 'move_clip', args)).toEqual({ ok: true, document: grammar.document, changes: [] })
  for (const start_ms of [0.5, Number.MAX_SAFE_INTEGER + 1, -1]) {
    expect(applyShowCommand(document.show, 'move_clip', { ...args, start_ms }).ok).toBe(false)
    expect(applyShowGrammarOperation(document, 'move_clip', { ...args, start_ms }).ok).toBe(false)
  }
})

it('rejects every malformed Layer in both adapters and retires the connected spelling', () => {
  const { document } = openGrammarFixture({ emptySecondScene: true })
  const clip_id = document.show.composition!.scenes[0].zones[0].main[0].id
  for (const layer of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0', 'overlay', null, {}, true]) {
    const args = { clip_id, start_ms: 0, layer }
    expect(applyShowCommand(document.show, 'move_clip', args)).toMatchObject({ ok: false, issues: [{ code: 'invalid-argument' }] })
    expect(applyShowGrammarOperation(document, 'move_clip', args)).toMatchObject({ ok: false, issues: [{ code: 'invalid-argument' }] })
  }
  expect(applyShowCommand(document.show, 'move_connected_clip', { clip_id, start_ms: 0 })).toMatchObject({ ok: false })
  expect(applyShowGrammarOperation(document, 'move_connected_clip', { clip_id, start_ms: 0 })).toMatchObject({ ok: false, issues: [{ code: 'unknown-operation' }] })
})

it('moves a chain across its former member positions inside an explicit transaction', async () => {
  const { createSessionStore } = await import('../grammar/session')
  const { resizeBoundaryShow } = await import('../baseline/fixtures')
  const show = resizeBoundaryShow()
  const zone = show.composition!.scenes[0].zones[0]
  zone.main[0].durationMs = 2000
  zone.main[1].startMs = 3000
  show.composition!.transitions = [{ id: 'ab', fromPlacementId: 'resize-a', toPlacementId: 'resize-b', kind: 'crossfade', durationMs: 1000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
  const store = createSessionStore()
  const opened = store.open(show)
  expect(opened.ok).toBe(true)
  if (!opened.ok) return
  expect(store.begin(opened.sessionId, 'Move chain').ok).toBe(true)
  expect(store.apply(opened.sessionId, 'move_clip', { clip_id: 'resize-a', start_ms: 3000 }).ok).toBe(true)
  expect(store.commit(opened.sessionId).ok).toBe(true)
  const result = store.export(opened.sessionId)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  const expected = structuredClone(show)
  expected.composition!.scenes[0].zones[0].main[0].startMs = 3000
  expected.composition!.scenes[0].zones[0].main[1].startMs = 6000
  expect(result.show.composition).toEqual(expected.composition)
})
