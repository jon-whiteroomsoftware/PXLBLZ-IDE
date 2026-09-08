import { describe, expect, it } from 'vitest'
import { applyShowCommand, runShowCommandTransaction } from '@/engine/showCommands/registry'
import { applyShowGrammarOperation } from '../grammar/registry'
import { openGrammarFixture } from './support/grammarFixture'

function fixture(overlay = false) {
  const { document } = openGrammarFixture({ emptySecondScene: true })
  document.show.scenes = [{ ...document.show.scenes[0], durationMs: 20_000 }]
  document.show.composition!.scenes = [document.show.composition!.scenes[0]]
  const zone = document.show.composition!.scenes[0].zones[0]
  const a = { ...zone.main[0], id: 'a', durationMs: 4_000 }
  const b = { ...a, id: 'b', startMs: 8_000, durationMs: 2_000 }
  zone.main = overlay ? [] : [a, b]
  zone.overlays = overlay ? [{ id: 'overlay', name: 'Overlay', placements: [a, b].map(p => ({ ...p, opacity: 1 })) }] : []
  return document
}

describe('canonical registry and diagnostic resize adapters', () => {
  it.each([false, true])('accepts exact fixture R bounds and preserves complete records (overlay=%s)', overlay => {
    const document = fixture(overlay)
    const original = structuredClone(document)
    for (const duration_ms of [7999, 8000]) {
      const registry = applyShowCommand(document.show, 'resize_clip', { clip_id: 'a', duration_ms })
      const grammar = applyShowGrammarOperation(document, 'resize_clip', { clip_id: 'a', duration_ms })
      expect(registry.ok).toBe(true)
      expect(grammar.ok).toBe(true)
      if (!registry.ok || !grammar.ok) continue
      const expected = structuredClone(document.show)
      const zone = expected.composition!.scenes[0].zones[0]
      ;(overlay ? zone.overlays[0].placements : zone.main)[0].durationMs = duration_ms
      expect(registry.record).toEqual({ ...expected, updatedAt: expect.any(Number) })
      expect(grammar.document).toEqual({ ...document, show: { ...expected, updatedAt: expect.any(Number) } })
    }
    for (const duration_ms of [8001, 12000]) {
      for (const result of [applyShowCommand(document.show, 'resize_clip', { clip_id: 'a', duration_ms }), applyShowGrammarOperation(document, 'resize_clip', { clip_id: 'a', duration_ms })]) {
        expect(result).toMatchObject({ ok: false, issues: [{ code: 'no-space', availableRange: { startMs: 0, endMs: 8000 } }] })
      }
    }
    expect(document).toEqual(original)
  })
  it('returns untouched valid no-op identities and keeps mixed transactions valid', () => {
    const document = fixture()
    expect(applyShowCommand(document.show, 'resize_clip', { clip_id: 'a', duration_ms: 4000 })).toEqual({ ok: true, record: document.show, changes: [] })
    const grammar = applyShowGrammarOperation(document, 'resize_clip', { clip_id: 'a', duration_ms: 4000 })
    expect(grammar).toEqual({ ok: true, document, changes: [] })
    if (grammar.ok) expect(grammar.document).toBe(document)
    for (const durations of [[4000, 8000], [8000, 8000]]) {
      const result = runShowCommandTransaction(document.show, durations.map(duration_ms => ({ name: 'resize_clip', input: { clip_id: 'a', duration_ms } })))
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.changes).toHaveLength(1)
    }
  })
})

it('rejects malformed schema identically at both adapter boundaries', () => {
  const document = fixture()
  const inputs = [
    { clip_id: 'a' }, { clip_id: 'a', duration_ms: 4000, end_ms: 4000 },
    ...[0, -1, 4000.1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity].map(duration_ms => ({ clip_id: 'a', duration_ms })),
    { clip_id: 'a', duration_ms: 4000, surprise: true },
    { clip_id: 'a', duration_ms: 4000, start_ms: 0.5 },
  ]
  const original = structuredClone(document)
  for (const input of inputs) {
    expect(applyShowCommand(document.show, 'resize_clip', input)).toMatchObject({ ok: false, issues: [{ code: 'invalid-argument' }] })
    expect(applyShowGrammarOperation(document, 'resize_clip', input)).toMatchObject({ ok: false, issues: [{ code: 'invalid-argument' }] })
  }
  expect(document).toEqual(original)
})


it('preserves implicit Cuts while refusing removal of an authored visual Scene boundary', () => {
  for (const boundary of ['implicit', 'explicit', 'crossfade']) {
    const boundaryCrossfade = boundary === 'crossfade'
    const { document } = openGrammarFixture({ boundaryCrossfade })
    if (boundary === 'explicit') document.show.transitions = [{ id: 'authored-cut', afterSceneId: 's1', kind: 'cut', durationMs: 0, easing: { curve: 'sine', direction: 'in-out' } }]
    const original = structuredClone(document)
    const clip_id = document.show.composition!.scenes[0].zones[0].main[0].id
    const results = [applyShowCommand(document.show, 'resize_clip', { clip_id, duration_ms: 12000 }), applyShowGrammarOperation(document, 'resize_clip', { clip_id, duration_ms: 12000 })]
    for (const result of results) {
      if (boundaryCrossfade) expect(result).toMatchObject({ ok: false, issues: [{ code: 'unsupported-topology' }] })
      else {
        expect(result.ok).toBe(true)
        if (result.ok) {
          const show = 'record' in result ? result.record : result.document.show
          expect(show.transitions).toEqual(original.show.transitions)
          const expected = structuredClone(original.show)
          expected.composition!.scenes[0].zones[0].main[0].durationMs = 12000
          expect(show).toEqual({ ...expected, updatedAt: expect.any(Number) })
        }
      }
    }
    expect(document).toEqual(original)
  }
})

function compareAccepted(document: ReturnType<typeof fixture>, input: Record<string, unknown>, expected: typeof document.show, details?: Record<string, unknown>) {
  const original = structuredClone(document)
  const registry = applyShowCommand(document.show, 'resize_clip', input)
  const grammar = applyShowGrammarOperation(document, 'resize_clip', input)
  expect(registry.ok, JSON.stringify(registry)).toBe(true)
  expect(grammar.ok, JSON.stringify(grammar)).toBe(true)
  if (!registry.ok || !grammar.ok) throw new Error('resize refused')
  expect(registry.record).toEqual({ ...expected, updatedAt: expect.any(Number) })
  expect(grammar.document).toEqual({ ...original, show: { ...expected, updatedAt: expect.any(Number) } })
  expect(grammar.changes).toEqual(registry.changes.map(({ command, ...change }) => ({ ...change, op: command })))
  if (details) expect(registry.changes[0].details).toMatchObject(details)
  expect(document).toEqual(original)
  return grammar.document
}

it.each([false, true])('qualifies duration/end/start forms, Show End and other-Layer overlap (overlay=%s)', overlay => {
  const document = fixture(overlay)
  document.inlinePatterns = [{ id: 'retained-inline', name: 'Retained source', source: 'export function render2D(i,x,y){rgb(x,y,0)}' }]
  document.options = { stageDimension: 2, targetPixelCount: 256 }
  const zone = document.show.composition!.scenes[0].zones[0]
  const placements = overlay ? zone.overlays[0].placements : zone.main
  if (!overlay) zone.overlays.push({ id: 'other', name: 'Other', placements: [{ ...placements[0], id: 'other', durationMs: 10000, opacity: 1 }] })
  for (const input of [{ end_ms: 8000 }, { start_ms: 1000, end_ms: 8000 }, { start_ms: 1000, duration_ms: 7000 }]) {
    const expected = structuredClone(document.show)
    const expectedZone = expected.composition!.scenes[0].zones[0]
    Object.assign((overlay ? expectedZone.overlays[0].placements : expectedZone.main)[0], { startMs: input.start_ms ?? 0, durationMs: 8000 - (input.start_ms ?? 0) })
    compareAccepted(document, { clip_id: 'a', ...input }, expected)
  }
  placements.pop()
  const expected = structuredClone(document.show)
  const expectedZone = expected.composition!.scenes[0].zones[0]
  ;(overlay ? expectedZone.overlays[0].placements : expectedZone.main)[0].durationMs = 20000
  compareAccepted(document, { clip_id: 'a', end_ms: 20000 }, expected)
  for (const result of [applyShowCommand(document.show, 'resize_clip', { clip_id: 'a', end_ms: 20001 }), applyShowGrammarOperation(document, 'resize_clip', { clip_id: 'a', end_ms: 20001 })]) {
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'no-space', availableRange: { startMs: 0, endMs: 20000 } }] })
  }
})

it.each([false, true])('preserves connected chain identities, tracks, leading edges and historical adapter (overlay=%s)', overlay => {
  const document = fixture(overlay)
  const composition = document.show.composition!
  const zone = composition.scenes[0].zones[0]
  const placements = overlay ? zone.overlays[0].placements : zone.main
  const seed = placements[0]
  placements.splice(0, placements.length, ...[['a', 0], ['b', 3000], ['c', 6000], ['obstruction', 9000]].map(([id, startMs]) => ({ ...seed, id: id as string, startMs: startMs as number, durationMs: id === 'obstruction' ? 1000 : 2000 })))
  composition.transitions = [['ab', 'a', 'b'], ['bc', 'b', 'c']].map(([id, fromPlacementId, toPlacementId]) => ({ id, fromPlacementId, toPlacementId, durationMs: 1000, kind: 'crossfade', easing: { curve: 'sine', direction: 'in-out' }, crossfadePolicy: 'live-live' }))
  composition.scenes[0].propertyTracks = [{ id: 'preserved-track', target: { kind: 'placement-view', placementId: 'obstruction', property: 'brightness' }, keyframes: [{ id: 'k1', timeMs: 9000, value: 0.3, easing: { curve: 'linear' } }, { id: 'k2', timeMs: 9500, value: 0.7, easing: { curve: 'linear' } }] }]
  for (const duration_ms of [1000, 3000]) {
    const expected = structuredClone(document.show)
    const expectedZone = expected.composition!.scenes[0].zones[0]
    const clips = overlay ? expectedZone.overlays[0].placements : expectedZone.main
    clips[1].durationMs = duration_ms
    clips[2].startMs = duration_ms === 1000 ? 5000 : 7000
    compareAccepted(document, { clip_id: 'b', duration_ms }, expected, { changedClipIds: ['b', 'c'], movedClipIds: ['c'], transitionChanges: [] })
  }
  const expected = structuredClone(document.show)
  const expectedZone = expected.composition!.scenes[0].zones[0]
  Object.assign((overlay ? expectedZone.overlays[0].placements : expectedZone.main)[1], { startMs: 3500, durationMs: 1500 })
  expected.composition!.transitions![0].durationMs = 1500
  const input = { clip_id: 'b', start_ms: 3500, end_ms: 5000 }
  const next = compareAccepted(document, input, expected, { changedClipIds: ['b'], movedClipIds: ['b'], transitionChanges: [{ transitionId: 'ab', previousDurationMs: 1000, durationMs: 1500 }] })
  const historical = applyShowGrammarOperation(document, 'resize_connected_clip', input)
  expect(historical.ok).toBe(true)
  if (historical.ok) expect(historical.document).toEqual({ ...next, show: { ...next.show, updatedAt: historical.document.show.updatedAt } })
  for (const input of [{ clip_id: 'b', start_ms: 2000, duration_ms: 3000 }, { clip_id: 'b', duration_ms: 3001 }]) {
    const original = structuredClone(document)
    const registry = applyShowCommand(document.show, 'resize_clip', input)
    const grammar = applyShowGrammarOperation(document, 'resize_clip', input)
    expect(registry.ok).toBe(false)
    expect(grammar).toEqual(registry)
    expect(document).toEqual(original)
  }
})

it('preserves multi-Scene logical Clip segments and refuses a segment id as a logical target', () => {
  const document = fixture()
  document.show.scenes[0].durationMs = 10000
  document.show.scenes.push({ id: 's2', name: 'Second', durationMs: 10000 })
  const composition = document.show.composition!
  const zone = composition.scenes[0].zones[0]
  const seed = zone.main[0]
  zone.main = [{ ...seed, startMs: 9000, durationMs: 1000 }]
  composition.scenes.push({ sceneId: 's2', zones: [{ ...zone, main: [{ ...seed, id: 'a--span-s2', logicalClipId: 'a', startMs: 0, durationMs: 3000 }, { ...seed, id: 'b', startMs: 8000, durationMs: 2000 }] }] })
  const expected = structuredClone(document.show)
  expected.composition!.scenes[1].zones[0].main[0].durationMs = 5000
  compareAccepted(document, { clip_id: 'a', end_ms: 15000 }, expected)
  expect(applyShowCommand(document.show, 'resize_clip', { clip_id: 'a--span-s2', duration_ms: 4000 }).ok).toBe(false)
  expect(applyShowGrammarOperation(document, 'resize_clip', { clip_id: 'a--span-s2', duration_ms: 4000 }).ok).toBe(false)
})

it('refuses Group and missing targets before no-op and preserves all metadata', () => {
  const document = fixture()
  const composition = document.show.composition!
  const seed = composition.scenes[0].zones[0].main[0]
  composition.scenes[0].zones[0].main = []
  composition.groupDefinitions = [{ id: 'definition', name: 'Group', patternInstances: structuredClone(composition.patternInstances), placements: [{ ...seed, id: 'inside', layerOffset: 0, opacity: 1 }] }]
  composition.groupOccurrences = [{ id: 'occurrence', definitionId: 'definition', sceneId: 's1', zoneId: 'z1', startMs: 0, baseLayer: 0, translationX: 0, translationY: 0 }]
  const original = structuredClone(document)
  for (const clip_id of ['occurrence:inside', 'missing']) for (const duration_ms of [4000, 5000]) {
    const registry = applyShowCommand(document.show, 'resize_clip', { clip_id, duration_ms })
    expect(registry.ok).toBe(false)
    expect(applyShowGrammarOperation(document, 'resize_clip', { clip_id, duration_ms })).toEqual(registry)
  }
  expect(document).toEqual(original)
})
