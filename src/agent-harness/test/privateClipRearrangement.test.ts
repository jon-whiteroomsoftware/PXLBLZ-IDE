import { expect, it } from 'vitest'
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'
import { createSessionStore } from '../grammar/session.js'
import { openGrammarFixture } from './support/grammarFixture.js'
import { createPrivateClipPairMove, moveShowClipAtGlobalTime, type ShowTimelineClipOwner } from '@/engine/showTimelineClipAuthoring'
import { validateShowComposition } from '@/engine/showCompositionModel'
import { runUtterance } from '../bridge/service.js'

function pairFixture(overlay = false) {
  const { document } = openGrammarFixture({ emptySecondScene: true })
  const composition = document.show.composition!
  const zone = composition.scenes[0].zones[0]
  const base = zone.main[0]
  const placements = [
    { ...base, id: 'a', startMs: 0, durationMs: 4000, ...(overlay ? { opacity: 1 } : {}) },
    { ...base, id: 'b', startMs: 8000, durationMs: 6000, ...(overlay ? { opacity: 1 } : {}) },
  ]
  zone.main = overlay ? [] : placements
  zone.overlays = overlay ? [{ id: 'ov', name: 'Overlay', placements: placements.map(p => ({ ...p, opacity: 1 })) }] : []
  return document.show
}

function sessionFor(overlay = false, authoringValidation = false) {
  const show = pairFixture(overlay)
  const store = createSessionStore({ authoringValidation })
  const opened = store.open(show)
  if (!opened.ok) throw new Error(JSON.stringify(opened))
  const id = opened.sessionId
  const before = store.export(id)
  expect(store.begin(id).ok).toBe(true)
  return { show, store, id, before }
}

it.each([false, true])('moves owned placement tracks and only sole-use instance tracks, shared=%s', shared => {
  const show = pairFixture()
  const composition = show.composition!
  const scene = composition.scenes[0]
  const instance = composition.patternInstances[0]
  if (!shared) {
    composition.patternInstances.push({ ...structuredClone(instance), id: 'instance-b' })
    scene.zones[0].main[1].instanceId = 'instance-b'
  }
  scene.propertyTracks = [
    { id: 'placement-a', target: { kind: 'placement-view', placementId: 'a', property: 'brightness' }, keyframes: [
      { id: 'pa0', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
      { id: 'pa1', timeMs: 4000, value: 0.8, easing: { curve: 'linear' } },
    ] },
    { id: 'instance-a', target: { kind: 'instance-time-scale', instanceId: instance.id }, keyframes: [
      { id: 'ia0', timeMs: 0, value: 1, easing: { curve: 'linear' } },
      { id: 'ia1', timeMs: 4000, value: 2, easing: { curve: 'linear' } },
    ] },
  ]
  const store = createSessionStore({ authoringValidation: true })
  const inputBefore = structuredClone(show)
  const opened = store.open(show)
  if (!opened.ok) throw new Error(JSON.stringify(opened))
  const id = opened.sessionId
  const before = store.export(id)
  if (!before.ok) throw new Error('export failed')
  store.begin(id)
  expect(store.apply(id, 'move_clip', { clip_id: 'a', start_ms: 8000 }).ok).toBe(true)
  expect(store.apply(id, 'move_clip', { clip_id: 'b', start_ms: 0 }).ok).toBe(true)
  expect(store.commit(id).ok).toBe(true)
  const after = store.export(id)
  if (!after.ok) throw new Error('export failed')
  const expected = structuredClone(before.show)
  const expectedScene = expected.composition!.scenes[0]
  const [a, b] = expectedScene.zones[0].main
  expectedScene.zones[0].main = [{ ...b, startMs: 0 }, { ...a, startMs: 8000 }]
  for (const track of expectedScene.propertyTracks!) {
    if (track.id === 'placement-a' || !shared) track.keyframes = [
      { ...track.keyframes[0], timeMs: 8000 }, { ...track.keyframes[1], timeMs: 12000 },
    ]
  }
  expectedScene.propertyTracks!.sort((a, b) => a.id.localeCompare(b.id))
  expect(after.show).toEqual({ ...expected, updatedAt: after.show.updatedAt })
  expect(show).toEqual(inputBefore)
})

it.each(['duplicate', 'missing-instance', 'logical-segment', 'missing-owner', 'connected'] as const)('does not mint authority from %s participants', fault => {
  const show = pairFixture()
  const composition = show.composition!
  const clips = composition.scenes[0].zones[0].main
  if (fault === 'duplicate') clips.push({ ...clips[0], startMs: 16000 })
  if (fault === 'missing-instance') clips[0].instanceId = 'absent'
  if (fault === 'logical-segment') clips[0].logicalClipId = 'other'
  if (fault === 'missing-owner') composition.scenes[0].sceneId = 'absent'
  if (fault === 'connected') composition.transitions = [{ id: 't', fromPlacementId: 'a', toPlacementId: 'b', kind: 'crossfade', durationMs: 4000, easing: { curve: 'linear' } }]
  const before = structuredClone(show)
  const a: ShowTimelineClipOwner = { kind: 'main', sceneId: 's1', zoneId: 'z1', placementId: 'a' }
  expect(createPrivateClipPairMove(show, composition, [a, { ...a, placementId: 'b' }])).toBeNull()
  expect(show).toEqual(before)
})

it.each([false, true])('preserves unrelated Groups and refuses affected Scene/Zone Groups, affected=%s', affected => {
  const show = pairFixture()
  const composition = show.composition!
  const instance = composition.patternInstances[0]
  composition.groupDefinitions = [{ id: 'g', name: 'Group', patternInstances: [{ ...structuredClone(instance), id: 'gi' }], placements: [{
    ...structuredClone(composition.scenes[0].zones[0].main[0]), id: 'gp', instanceId: 'gi', startMs: 0, durationMs: 1000, opacity: 1, layerOffset: 0,
  }] }]
  composition.groupOccurrences = [{ id: 'go', definitionId: 'g', sceneId: affected ? 's1' : 's2', zoneId: 'z1', startMs: 20000, baseLayer: 0, translationX: 0, translationY: 0 }]
  expect(validateShowComposition(show, composition)).toEqual([])
  const before = structuredClone(show)
  const a: ShowTimelineClipOwner = { kind: 'main', sceneId: 's1', zoneId: 'z1', placementId: 'a' }
  const pair = createPrivateClipPairMove(show, composition, [a, { ...a, placementId: 'b' }])
  if (affected) expect(pair).toBeNull()
  else {
    expect(pair!.move(a, { kind: 'main', zoneId: 'z1', globalStartMs: 8000 })).not.toBeNull()
    const next = pair!.move({ ...a, placementId: 'b' }, { kind: 'main', zoneId: 'z1', globalStartMs: 0 })!
    const expected = structuredClone(composition)
    const [first, second] = expected.scenes[0].zones[0].main
    expected.scenes[0].zones[0].main = [{ ...second, startMs: 0 }, { ...first, startMs: 8000 }]
    expect(next).toEqual(expected)
  }
  expect(show).toEqual(before)
})

it.each(['incomplete', 'refuse', 'ask', 'unresolved', 'late-incomplete'] as const)('service exposes no partial candidate after %s', action => {
  const show = pairFixture()
  const before = structuredClone(show)
  return runUtterance({ name: 'private-pair-proof', run: async context => {
    if (context.utterance === 'swap') {
      const result = await context.callTool('move_clip', { session_id: context.sessionId, clip_id: 'a', start_ms: 8000 })
      expect(result.isError).not.toBe(true)
      if (action === 'late-incomplete') {
        await context.callTool('move_clip', { session_id: context.sessionId, clip_id: 'b', start_ms: 0 })
        context.finishTurn!({ intent: 'apply' })
        return { finalText: 'Interrupted', incomplete: { reason: 'model-incomplete' as const } }
      }
    }
    return { finalText: 'Done', completion: { intent: action === 'unresolved' ? 'apply' : action === 'late-incomplete' ? 'incomplete' : action } }
  } }, { show: { ...show }, utterance: 'swap' }).then(result => {
    expect(result.changed).toBe(false)
    expect(result.show).toBeUndefined()
    expect(result.summaries).toEqual([])
    expect(show).toEqual(before)
  })
})

it.each([false, true])('keeps final validation strict under authoring policy=%s', policy => {
  const { store, id, before } = sessionFor(false, policy)
  expect(store.apply(id, 'move_clip', { clip_id: 'a', start_ms: 8000 }).ok).toBe(true)
  expect(store.validatePending(id).ok).toBe(false)
  expect(store.commit(id).ok).toBe(false)
  expect(store.export(id)).toEqual(before)
  expect(store.rollback(id).ok).toBe(true)
  expect(store.export(id)).toEqual(before)
  expect(store.describeChanges(id)).toMatchObject({ entries: [] })
})

it.each([false, true])('retains pair-only authority even after resolution, overlay=%s', overlay => {
  const { store, id } = sessionFor(overlay)
  expect(store.apply(id, 'move_clip', { clip_id: 'a', start_ms: 8000 }).ok).toBe(true)
  expect(store.apply(id, 'move_clip', { clip_id: 'b', start_ms: 0 }).ok).toBe(true)
  expect(store.apply(id, 'add_marker', { at_ms: 2000, name: 'Escape' }).ok).toBe(false)
  expect(store.apply(id, 'resize_clip', { clip_id: 'a', duration_ms: 2000 }).ok).toBe(false)
  expect(store.apply(id, 'move_clip', { clip_id: 'missing', start_ms: 16000 }).ok).toBe(false)
  expect(store.apply(id, 'move_clip', { clip_id: 'a', start_ms: 16000, layer: overlay ? 'main' : 0 }).ok).toBe(false)
  expect(store.apply(id, 'move_clip', { clip_id: 'a', start_ms: 16000 }).ok).toBe(true)
  expect(store.commit(id).ok).toBe(true)
})

it.each([-1, 0.5, 29999, 30000, Number.MAX_SAFE_INTEGER, Infinity])('refuses invalid private start %s and preserves the pending pair', start => {
  const { store, id, before } = sessionFor()
  expect(store.apply(id, 'move_clip', { clip_id: 'a', start_ms: 8000 }).ok).toBe(true)
  expect(store.apply(id, 'move_clip', { clip_id: 'b', start_ms: start }).ok).toBe(false)
  expect(store.export(id)).toEqual(before)
  expect(store.apply(id, 'move_clip', { clip_id: 'b', start_ms: 0 }).ok).toBe(true)
  expect(store.commit(id).ok).toBe(true)
})

it.each([false, true])('rejects third-Clip collisions hidden by a nested pair, overlay=%s', overlay => {
  const show = pairFixture(overlay)
  const zone = show.composition!.scenes[0].zones[0]
  const clips = overlay ? zone.overlays[0].placements : zone.main
  clips[0].durationMs = 12000
  clips[1].startMs = 16000
  clips[1].durationMs = 1000
  clips.push({ ...clips[1], id: 'c', startMs: 20000 })
  const store = createSessionStore()
  const opened = store.open(show)
  if (!opened.ok) throw new Error(JSON.stringify(opened))
  const id = opened.sessionId
  const before = store.export(id)
  store.begin(id)
  expect(store.apply(id, 'move_clip', { clip_id: 'a', start_ms: 16000 }).ok).toBe(false)
  expect(store.export(id)).toEqual(before)
  expect(store.pending(id)).toMatchObject({ open: { changes: 0 } })
})

it('ordinary moves refuse overlap and engine authority accepts reordered equivalent owners', () => {
  const show = pairFixture()
  const composition = show.composition!
  const before = structuredClone(show)
  const a: ShowTimelineClipOwner = { kind: 'main', sceneId: 's1', zoneId: 'z1', placementId: 'a' }
  const b: ShowTimelineClipOwner = { ...a, placementId: 'b' }
  const target = { kind: 'main' as const, zoneId: 'z1', globalStartMs: 8000 }
  expect(moveShowClipAtGlobalTime(show, composition, { owner: a, target })).toBe(composition)
  const pair = createPrivateClipPairMove(show, composition, [a, b])!
  const moved = pair.move({ placementId: 'a', zoneId: 'z1', sceneId: 's1', kind: 'main' }, target)
  expect(moved).not.toBeNull()
  expect(validateShowComposition(show, moved!).some(issue => issue.code === 'overlap')).toBe(true)
  expect(show).toEqual(before)
  const store = createSessionStore()
  const opened = store.open(show)
  if (!opened.ok) throw new Error('open failed')
  expect(store.apply(opened.sessionId, 'move_clip', { clip_id: 'a', start_ms: 8000 }).ok).toBe(false)
})

// Consumer seam: explicit private session -> final complete record/history.
// Two unequal plain Clips swap starts; the first step may overlap only its pair.
it('keeps an overlapping first move private and commits both moves as one record', () => {
  const { document } = openGrammarFixture({ emptySecondScene: true })
  const composition = document.show.composition as ShowCompositionV1
  const zone = composition.scenes[0].zones[0]
  const base = zone.main[0]
  zone.main = [
    { ...base, id: 'a', startMs: 0, durationMs: 4000 },
    { ...base, id: 'b', startMs: 8000, durationMs: 6000 },
  ]
  const store = createSessionStore()
  const opened = store.open(document.show)
  if (!opened.ok) throw new Error(JSON.stringify(opened))
  const id = opened.sessionId
  const before = store.export(id)
  expect(store.begin(id).ok).toBe(true)
  expect(store.apply(id, 'move_clip', { clip_id: 'a', start_ms: 8000 }).ok).toBe(true)
  expect(store.export(id)).toEqual(before)
  expect(store.describeChanges(id)).toMatchObject({ entries: [] })
  expect(store.validatePending(id).ok).toBe(false)
  expect(store.apply(id, 'move_clip', { clip_id: 'b', start_ms: 0 }).ok).toBe(true)
  expect(store.commit(id).ok).toBe(true)
  const after = store.export(id)
  if (!before.ok || !after.ok) throw new Error('export refused')
  const expected = structuredClone(before.show)
  expected.composition!.scenes[0].zones[0].main = [
    { ...base, id: 'b', startMs: 0, durationMs: 6000 },
    { ...base, id: 'a', startMs: 8000, durationMs: 4000 },
  ]
  expect(after.show).toEqual({ ...expected, updatedAt: after.show.updatedAt })
  expect(store.describeChanges(id)).toMatchObject({ entries: [expect.anything()] })
  expect(store.undo(id).ok).toBe(true)
  expect(store.export(id)).toEqual(before)
})
