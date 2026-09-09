import { updateShowBoundaryTransition } from '@/engine/showModel'
import { showBoundaryTransitionParameterChanges, showTransitionChangesForPresentation } from '@/engine/showTransitionAuthoring'
import type { ShowToolkitPresentationItem } from '@/engine/showVisualToolkitPresentation'
import { showBoundaryCommandFixture, BOUNDARY_VARIANT_CASES } from '@/test/showBoundaryCommandFixture'
import { moveShowClipExactly } from '@/engine/showExactClipMove'
import { resizeShowClipManually } from '@/engine/showManualClipResize'
import { editShowMarkerFromUI } from '@/engine/showExactTimelineMarker'
import type { ShowGrammarDocument } from '../grammar/types'
import { describe, expect, it } from 'vitest'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { applyShowCommand, runShowCommandTransaction, type ShowCommandOutcome } from '@/engine/showCommands/registry'
import { markerCommandOutcome } from '@/engine/showCommands/timeline'
import { showSplitClipFixture } from '@/test/showSplitClipFixture'
import { showRemoveClipFixture } from '@/test/showRemoveClipFixture'
import { showOverlayLayerFixture } from '@/test/showOverlayLayerFixture'
import { overlayLayerCommandOutcome } from '@/engine/showCommands/overlayLayer'
import { splitClipCommandOutcome } from '@/engine/showCommands/splitClip'
import { duplicateClipCommandOutcome } from '@/engine/showCommands/duplicateClip'
import { addClipCommandOutcome, independentClipCommandOutcome } from '@/engine/showCommands/clips'
import { insertTimeCommandOutcome } from '@/engine/showCommands/timeline'
import { insertShowTime, planShowTimeInsertion, setShowEndMs } from '@/engine/showTimelineAuthoring'
import { addShowOverlayLayerAcrossTimeline, splitShowClipAtGlobalTime, duplicateShowClipAfter, duplicateLinkedShowClipAfter, addShowClipAtGlobalTime, addShowClipAtGlobalTimeExtendingShow, makeShowClipPatternIndependent, rejoinShowClipPatternInstance } from '@/engine/showTimelineClipAuthoring'
import { deleteShowClipWithLayerTransitions } from '@/engine/showLayerTransitionAuthoring'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { validateShowComposition, normalizeShowComposition } from '@/engine/showCompositionModel'
import { applyShowGrammarOperation } from '../grammar/registry'
import { openShowDocument } from '../grammar/openShow'
import { openGrammarFixture } from './support/grammarFixture'
import { resizeBoundaryShow } from '../baseline/fixtures'
import { createScriptedAgent, runUtterance } from '../bridge/service'
import { runToolRound } from '../experiment/turn'
import { createSessionStore } from '../grammar/session'


it('shares canonical input and domain refusals without mutation', () => {
  const opened = openShowDocument(showSplitClipFixture())
  if (!opened.ok) throw new Error('open')
  const before = structuredClone(opened.document)
  for (const args of [{ clip_id: 'absent', at_ms: 16000 }, { clip_id: 'group-use:group-main', at_ms: 42500 }, { clip_id: 'clip-b', at_ms: 30000 }, { clip_id: 'clip-b', at_ms: 12000.1 }, { clip_id: 'clip-b', at_ms: NaN }, { clip_id: 'clip-b', at_ms: 16000, extra: true }, {}]) {
    expect(applyShowGrammarOperation(opened.document, 'split_clip', args).ok).toBe(false)
    expect(opened.document).toEqual(before)
  }
})



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


it('both registries reject invalid input, protected/full/animated tails and Group children immutably', () => {
  const opened = openShowDocument(showSplitClipFixture())
  if (!opened.ok) throw new Error('open')
  const before = structuredClone(opened.document)
  for (const args of [{ clip_id: 'absent' }, { clip_id: 'group-use:group-main' }, { clip_id: 'clip-b' }, { clip_id: 'clip-ov', linked: 1 }, { clip_id: 'clip-ov', linked: null }, { clip_id: 'clip-ov', extra: true }, {}]) {
    expect(applyShowCommand(opened.document.show, 'duplicate_clip', args).ok).toBe(false)
    expect(applyShowGrammarOperation(opened.document, 'duplicate_clip', args).ok).toBe(false)
    expect(opened.document).toStrictEqual(before)
  }
})


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



type ParityRow = {
  command: string
  args: Record<string, unknown>
  fixture: () => ShowRecord
  canonical?: (show: ShowRecord, args: Record<string, unknown>) => ShowCommandOutcome
  manualOwner?: (show: ShowRecord, args: Record<string, unknown>) => ShowRecord | ShowRecord['composition']
  expectedFacts?: (before: ShowRecord, after: ShowRecord) => void
  followup?: (document: ShowGrammarDocument) => void
  refusals?: Record<string, unknown>[]
}

const clipOwner = (clipId: string) => clipId === 'clip-ov'
  ? { kind: 'overlay' as const, sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-1', placementId: clipId }
  : { kind: 'main' as const, sceneId: 'scene-1', zoneId: 'zone-1', placementId: clipId }

// Shared seam: complete canonical/diagnostic/manual records, immutable input,
// then the actual file importer. Rows retain their independent semantic facts.
const PARITY_ROWS: ParityRow[] = [
  ...BOUNDARY_VARIANT_CASES.map(({ kind, familyId, variant }): ParityRow => ({
    command: 'set_boundary_transition', args: { transition_id: 'transition-scene-1', kind, variant, duration_ms: 1500 }, fixture: showBoundaryCommandFixture,
    manualOwner: show => updateShowBoundaryTransition(show, 'transition-scene-1', { ...showTransitionChangesForPresentation({ kind: 'transition', familyId, variantId: variant, key: `transition:${familyId}:${variant}` } as ShowToolkitPresentationItem), durationMs: 1500 }),
    expectedFacts: (before, after) => { expect(after.transitions[0]).toMatchObject({ id: 'transition-scene-1', afterSceneId: 'scene-1', kind, durationMs: 1500 }); expect(after.composition).toStrictEqual(before.composition) },
  })),
  {
    command: 'set_boundary_transition_timing', args: { after_clip_id: 'clip-c', duration_ms: 1500, easing: 'ease-in' }, fixture: showBoundaryCommandFixture,
    manualOwner: show => updateShowBoundaryTransition(show, 'transition-scene-1', { durationMs: 1500, easing: { curve: 'quadratic', direction: 'in' } }),
  },
  {
    command: 'update_boundary_transition_parameter', args: { at_ms: 31000, parameter: 'easing', value: 'sine-in' }, fixture: showBoundaryCommandFixture,
    manualOwner: show => updateShowBoundaryTransition(show, 'transition-scene-1', showBoundaryTransitionParameterChanges(show.transitions[0], { kind: 'transition', familyId: 'blend', variantId: 'crossfade', key: 'transition:blend:crossfade' } as ShowToolkitPresentationItem, 'easing', 'sine-in')!),
  },
  { command: 'set_boundary_layout', args: { transition_id: 'transition-scene-1', layout_id: 'layout-2' }, fixture: showBoundaryCommandFixture },

  ...[false, true].flatMap(reverse => [false, true].map((extend): ParityRow => ({
    command: 'add_clip',
    args: { zone_id: 'zone-1', start_ms: extend ? 62000.4 : 29000.4, duration_ms: 5000, overlay_layer_index: 0, pattern_kind: 'stock', pattern_id: 'CometLoom', extend_show: extend },
    fixture: () => { const show = showOverlayLayerFixture(); if (reverse) show.composition!.patternInstances.reverse(); return show },
    canonical: (show, args) => addClipCommandOutcome(show, args, kind => `${kind}-1`),
    manualOwner: (show, args) => {
      const input = { zoneId: 'zone-1', globalTimeMs: args.start_ms as number, target: { kind: 'overlay' as const, zoneId: 'zone-1', layerIndex: 0, globalStartMs: args.start_ms as number }, defaultDurationMs: 5000, instance: { id: 'instance-1', pattern: { kind: 'stock' as const, id: 'CometLoom' }, patternName: 'CometLoom', time: { timeScale: 1, timeOffsetMs: 0 } }, placementId: 'clip-1' }
      return extend ? addShowClipAtGlobalTimeExtendingShow(show, show.composition!, input).composition : addShowClipAtGlobalTime(show, show.composition!, input)
    },
    expectedFacts: (before, after) => {
      const originalIds = before.composition!.patternInstances.map(instance => instance.id)
      expect(after.composition!.patternInstances.filter(instance => instance.id !== 'instance-1').map(instance => instance.id)).toEqual(originalIds)
      if (!reverse) expect(after.composition!.patternInstances.map(instance => instance.id)).toEqual(['instance-1', ...originalIds])
      const added = after.composition!.scenes.flatMap(scene => scene.zones.flatMap(zone => zone.overlays.flatMap(layer => layer.placements))).find(clip => clip.id === 'clip-1')!
      expect(added.startMs).toBe(extend ? 30000 : 29000)
      expect(added.durationMs).toBe(extend ? 5000 : 1000)
    },
    refusals: [{ zone_id: 'absent', start_ms: 0, pattern_kind: 'stock' }, { zone_id: 'zone-1', start_ms: NaN, pattern_kind: 'stock' }, { zone_id: 'zone-1', start_ms: 0, pattern_kind: 'stock', overlay_layer_index: 99 }, {}],
  }))),
  ...[false, true].map((reverse): ParityRow => ({
    command: 'make_clip_pattern_independent', args: { clip_id: 'clip-c' },
    fixture: () => { const show = showOverlayLayerFixture(); if (reverse) show.composition!.patternInstances.reverse(); return show },
    canonical: (show, args) => independentClipCommandOutcome(show, args, () => 'instance-1'),
    manualOwner: show => makeShowClipPatternIndependent(show.composition!, { owner: clipOwner('clip-c'), newInstanceId: 'instance-1' }),
    expectedFacts: (before, after) => {
      const ids = before.composition!.patternInstances.map(instance => instance.id)
      expect(after.composition!.patternInstances.filter(instance => instance.id !== 'instance-1').map(instance => instance.id)).toEqual(ids)
      if (!reverse) expect(after.composition!.patternInstances.map(instance => instance.id)).toEqual(['instance-1', ...ids])
      expect(after.composition!.scenes[0].zones[0].main.find(clip => clip.id === 'clip-c')!.instanceId).toBe('instance-1')
    },
    refusals: [{ clip_id: 'absent' }, { clip_id: 'clip-ov' }, { clip_id: 'group-use:group-main' }, { clip_id: 'clip-c', extra: true }, {}],
  })),
  {
    command: 'rejoin_clip_pattern_instance', args: { clip_id: 'clip-b', target_clip_id: 'clip-a' }, fixture: showOverlayLayerFixture,
    manualOwner: show => rejoinShowClipPatternInstance(show.composition!, { owner: clipOwner('clip-b'), targetInstanceId: 'instance-a' }),
    expectedFacts: (_before, after) => {
      expect(after.composition!.patternInstances.some(instance => instance.id === 'instance-b')).toBe(false)
      expect(after.composition!.scenes[0].zones[0].main.find(clip => clip.id === 'clip-b')!.instanceId).toBe('instance-a')
    },
    refusals: [{ clip_id: 'clip-c', target_clip_id: 'clip-a' }, { clip_id: 'clip-b', target_clip_id: 'absent' }, { clip_id: 'group-use:group-main', target_clip_id: 'clip-a' }, {}],
  },
  ...[4000.4, 29000.4].map((atMs): ParityRow => ({
    command: 'insert_time', args: { at_ms: atMs, duration_ms: 1000.4 }, fixture: showOverlayLayerFixture,
    canonical: (show, args) => { let id = 0; return insertTimeCommandOutcome(show, args, () => `clip-${++id}`) },
    manualOwner: show => {
      const plan = planShowTimeInsertion(show, atMs, 1000.4)
      if (!plan.enabled) throw new Error(plan.reason)
      return insertShowTime(show, { atMs, durationMs: 1000.4, newPlacementIdBySourceId: Object.fromEntries(plan.crossingPlacementIds.map((id, index) => [id, `clip-${index + 1}`])) }).composition
    },
    expectedFacts: (before, after) => {
      expect(after.scenes[0].durationMs).toBe(before.scenes[0].durationMs + 1000)
      expect(after.composition!.patternInstances).toStrictEqual(before.composition!.patternInstances)
    },
    refusals: [{ at_ms: -1, duration_ms: 1000 }, { at_ms: 0, duration_ms: 0 }, { at_ms: Infinity, duration_ms: 1000 }, {}],
  })),
  {
    command: 'set_show_end', args: { end_ms: 70000.4 }, fixture: showOverlayLayerFixture,
    manualOwner: show => setShowEndMs(show, 70000.4).composition,
    expectedFacts: (before, after) => { expect(after.scenes[1].durationMs).toBe(38000); expect(after.composition!.scenes).toStrictEqual(before.composition!.scenes) },
    refusals: [{ end_ms: 62000 }, { end_ms: NaN }, { end_ms: 70000, extra: true }, {}],
  },
  ...[false, true].flatMap(overlay => [7999, 8000].map((durationMs): ParityRow => ({
    command: 'resize_clip', args: { clip_id: 'a', duration_ms: durationMs }, fixture: () => fixture(overlay).show,
    manualOwner: show => resizeShowClipManually(show, show.composition!, { clipId: 'a', durationMs }).composition,
    expectedFacts: (before, after) => {
      const expected = structuredClone(before)
      const zone = expected.composition!.scenes[0].zones[0]
      ;(overlay ? zone.overlays[0].placements : zone.main)[0].durationMs = durationMs
      expect(after).toEqual({ ...expected, updatedAt: after.updatedAt })
    },
  }))),
  {
    command: 'move_clip', args: { clip_id: 'a', start_ms: 5000, layer: 0 },
    fixture: () => { const show = fixture().show; show.composition!.scenes[0].zones[0].overlays = [{ id: 'destination', name: 'Destination', placements: [] }]; return show },
    manualOwner: show => {
      const result = moveShowClipExactly(show, show.composition!, { clipId: 'a', globalStartMs: 5000, layer: 0 })
      if (result.status === 'refused') throw new Error(result.reason)
      return result.composition
    },
  },
  ...[['clip-b', 16000.4], ['clip-b', 33000.4], ['clip-ov', 4000.4]].map(([clipId, atMs]): ParityRow => ({
    command: 'split_clip', args: { clip_id: clipId, at_ms: atMs }, fixture: showSplitClipFixture,
    canonical: (show, args) => splitClipCommandOutcome(show, args, () => 'clip-1'),
    manualOwner: (show, args) => splitShowClipAtGlobalTime(show, show.composition!, { owner: clipOwner(args.clip_id as string), globalTimeMs: args.at_ms as number, newPlacementId: 'clip-1' }),
    followup: document => {
      if (clipId !== 'clip-ov') return
      const edited = applyShowGrammarOperation(document, 'set_clip_view', { clip_id: 'clip-1', brightness: 0.4 })
      if (!edited.ok) throw new Error(JSON.stringify(edited))
      const moved = applyShowGrammarOperation(edited.document, 'move_clip', { clip_id: 'clip-1', start_ms: 9000 })
      expect(moved.ok, JSON.stringify(moved)).toBe(true)
      if (!moved.ok) throw new Error('move')
      expect(moved.document.show.composition!.scenes[0].zones[0].overlays[0].placements).toEqual([
        { ...document.show.composition!.scenes[0].zones[0].overlays[0].placements[0], durationMs: 2000 },
        { id: 'clip-1', instanceId: 'instance-ov', startMs: 9000, durationMs: 4000, opacity: 1, view: { mirror: false, phase: 0, brightness: 0.4 } },
      ])
    },
  })),
  ...['clip-a', 'clip-b', 'clip-ov'].map((clipId): ParityRow => ({
    command: 'remove_clip', args: { clip_id: clipId }, fixture: showRemoveClipFixture,
    manualOwner: (show, args) => deleteShowClipWithLayerTransitions(show, show.composition!, clipOwner(args.clip_id as string)),
    refusals: [{ clip_id: 'absent' }, { clip_id: 'group-use:group-main' }, { clip_id: 1 }, { clip_id: clipId, extra: true }, {}],
  })),
  ...[false, true].map((sparse): ParityRow => ({
    command: 'add_overlay_layer', args: { zone_id: 'zone-1' },
    fixture: () => { const show = showOverlayLayerFixture(); if (sparse) show.composition!.scenes[1].zones[0].overlays = []; return show },
    canonical: (show, args) => { let index = 0; return overlayLayerCommandOutcome(show, args, () => `layer-${++index}`) },
    manualOwner: show => addShowOverlayLayerAcrossTimeline(show, show.composition!, { zoneId: 'zone-1', layers: [{ sceneId: 'scene-1', layerId: 'layer-1' }, { sceneId: 'scene-2', layerId: 'layer-2' }] }),
    followup: document => {
      const clipped = applyShowGrammarOperation(document, 'add_clip', { zone_id: 'zone-1', overlay_layer_index: 0, start_ms: 0, duration_ms: 1000, pattern_kind: 'stock', pattern_id: 'CometLoom' })
      expect(clipped.ok).toBe(true)
      if (!clipped.ok) throw new Error('add Clip')
      expect(clipped.document.show.composition!.scenes[0].zones[0].overlays[0].placements).toHaveLength(1)
      expect(validateShowComposition(clipped.document.show, clipped.document.show.composition!)).toEqual([])
    },
  })),
  ...[undefined, false, true].map((linked): ParityRow => ({
    command: 'duplicate_clip', args: { clip_id: 'clip-ov', ...(linked === undefined ? {} : { linked }) },
    fixture: () => { const show = showSplitClipFixture(); show.composition!.executionModel = 'deterministic-loop'; return show },
    canonical: (show, args) => duplicateClipCommandOutcome(show, args, kind => `${kind}-1`),
    manualOwner: show => linked
      ? duplicateLinkedShowClipAfter(show, show.composition!, { owner: clipOwner('clip-ov'), newPlacementId: 'clip-1' })
      : duplicateShowClipAfter(show, show.composition!, { owner: clipOwner('clip-ov'), newPlacementId: 'clip-1', newInstanceId: 'instance-1' }),
    expectedFacts: (before, after) => {
      const expected = structuredClone(before)
      if (!linked) {
        delete expected.composition!.executionModel
        expected.composition!.patternInstances.push({ ...structuredClone(before.composition!.patternInstances.find(instance => instance.id === 'instance-ov')!), id: 'instance-1' })
      }
      expected.composition!.scenes[0].zones[0].overlays[0].placements.push({ id: 'clip-1', instanceId: linked ? 'instance-ov' : 'instance-1', startMs: 8000, durationMs: 6000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } })
      expect(after).toStrictEqual({ ...expected, updatedAt: after.updatedAt })
    },
    followup: document => {
      const edited = applyShowGrammarOperation(document, 'set_clip_view', { clip_id: 'clip-1', brightness: 0.4 })
      if (!edited.ok) throw new Error(JSON.stringify(edited))
      const moved = applyShowGrammarOperation(edited.document, 'move_clip', { clip_id: 'clip-1', start_ms: 16000 })
      expect(moved.ok, JSON.stringify(moved)).toBe(true)
      if (!moved.ok) throw new Error('move')
      const expected = structuredClone(document.show)
      expected.composition!.scenes[0].zones[0].overlays[0].placements[1].startMs = 16000
      expected.composition!.scenes[0].zones[0].overlays[0].placements[1].view!.brightness = 0.4
      expect(moved.document.show).toEqual({ ...expected, composition: normalizeShowComposition(expected, expected.composition!), updatedAt: moved.document.show.updatedAt })
    },
  })),
  ...['add_marker', 'move_marker', 'update_marker', 'remove_marker'].map((command): ParityRow => ({
    command, args: command === 'add_marker' ? { at_ms: 70000, name: 'Beyond', color: 'anything' } : command === 'remove_marker' ? { marker_id: 'm' } : { marker_id: 'm', at_ms: 200, ...(command === 'update_marker' ? { name: 'B' } : {}) },
    fixture: () => { const { document } = openGrammarFixture(); document.show.composition!.markers = [{ id: 'm', timeMs: 100, name: 'A' }]; return document.show },
    canonical: (show, args) => markerCommandOutcome(show, command, args, () => 'marker-1'),
    manualOwner: show => {
      const result = editShowMarkerFromUI(show, command === 'add_marker' ? { kind: 'add', marker: { id: 'marker-1', timeMs: 70000, name: 'Beyond', color: 'anything' } } : command === 'move_marker' ? { kind: 'move', markerId: 'm', timeMs: 200 } : command === 'update_marker' ? { kind: 'update', markerId: 'm', patch: { timeMs: 200, name: 'B' } } : { kind: 'remove', markerId: 'm' })
      if (result.status === 'refused') throw new Error(result.reason)
      return result.record.composition
    },
  })),
]

function assertParity(row: ParityRow, source: ShowRecord) {
  const opened = openShowDocument(source)
  if (!opened.ok) throw new Error(JSON.stringify(opened))
  const document = opened.document
  const before = structuredClone(document)
  const canonical = row.canonical ? row.canonical(document.show, row.args) : applyShowCommand(document.show, row.command, row.args)
  const diagnostic = applyShowGrammarOperation(document, row.command, row.args)
  expect(canonical.ok, JSON.stringify(canonical)).toBe(true)
  expect(diagnostic.ok, JSON.stringify(diagnostic)).toBe(true)
  if (!canonical.ok || !diagnostic.ok) throw new Error('parity refused')
  expect({ ...diagnostic.document.show, updatedAt: canonical.record.updatedAt }).toStrictEqual(canonical.record)
  for (const change of diagnostic.changes) {
    expect(typeof change.targetId).toBe('string')
    expect(change.targetId.length).toBeGreaterThan(0)
  }
  const expectedChanges = canonical.changes.map(({ command, ...change }) => ({ op: command, ...change }))
  expect(diagnostic.changes).toStrictEqual(expectedChanges)
  expect(JSON.parse(JSON.stringify(diagnostic.changes))).toStrictEqual(JSON.parse(JSON.stringify(expectedChanges)))
  if (row.manualOwner) {
    const manual = row.manualOwner(document.show, row.args)
    if (manual && 'id' in manual) expect({ ...manual, updatedAt: canonical.record.updatedAt }).toStrictEqual(canonical.record)
    else expect(manual).toStrictEqual(canonical.record.composition)
  }
  row.expectedFacts?.(before.show, canonical.record)
  expect(document).toStrictEqual(before)
  for (const args of row.refusals ?? []) {
    expect(applyShowCommand(document.show, row.command, args).ok).toBe(false)
    expect(applyShowGrammarOperation(document, row.command, args).ok).toBe(false)
    expect(document).toStrictEqual(before)
  }
  return diagnostic.document
}

it.each(PARITY_ROWS)('$command pairs full records and reopens $args', async row => {
  // Raw authored fixtures still exercise owner preservation before any file normalization.
  const raw = assertParity(row, row.fixture())
  row.followup?.(raw)
  // The importer adds legacy entry defaults and implicit Cuts. A stable input
  // lets the output comparison remain literal apart from composition ordering.
  const diagnostic = assertParity(row, await reopen(row.fixture()))
  const reopened = await reopen(diagnostic.show)
  expect(reopened).toEqual({ ...diagnostic.show, composition: normalizeShowComposition(diagnostic.show, diagnostic.show.composition!) })
  expect(validateShowComposition(reopened, reopened.composition!)).toEqual([])
})


it.each(['add_clip', 'make_clip_pattern_independent', 'insert_time'])('%s refuses a colliding caller-local identity atomically', command => {
  const before = showOverlayLayerFixture()
  const original = structuredClone(before)
  const result = command === 'add_clip'
    ? addClipCommandOutcome(before, { zone_id: 'zone-1', start_ms: 29000, overlay_layer_index: 0, pattern_kind: 'stock', pattern_id: 'CometLoom' }, kind => kind === 'instance' ? 'instance-a' : 'new-clip')
    : command === 'make_clip_pattern_independent'
      ? independentClipCommandOutcome(before, { clip_id: 'clip-c' }, () => 'instance-a')
      : insertTimeCommandOutcome(before, { at_ms: 4000, duration_ms: 1000 }, () => 'clip-a')
  expect(result.ok).toBe(false)
  expect(before).toStrictEqual(original)
})


it.each([
  { command: 'insert_time', args: { at_ms: 29000.4, duration_ms: 1000 }, targetId: 'at-29000', description: '1000 ms inserted at 29000 ms.', details: { splitClipIdsBySourceId: {} } },
  { command: 'set_show_end', args: { end_ms: 70000.4 }, targetId: 'show-end', description: 'Show End is now 70000 ms.', before: { durationMs: 62000 }, after: { durationMs: 70000 } },
  { command: 'set_show_end', args: { end_ms: 1 }, targetId: 'show-end', description: 'Show End is now 34000 ms.', before: { durationMs: 62000 }, after: { durationMs: 34000 } },
])('$command preserves its serialized timeline receipt', ({ command, args, ...expected }) => {
  const opened = openShowDocument(showOverlayLayerFixture())
  if (!opened.ok) throw new Error('fixture')
  const result = applyShowGrammarOperation(opened.document, command, args)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(JSON.stringify(result))
  expect(typeof result.changes[0].targetId).toBe('string')
  expect(result.changes[0].targetId.length).toBeGreaterThan(0)
  expect(JSON.parse(JSON.stringify(result.changes))).toStrictEqual([{ op: command, ...expected }])
})


it('resolves Boundary selectors without merging Layer or cross-Zone junction identities', () => {
  const show = showBoundaryCommandFixture()
  const original = structuredClone(show)
  const stable = applyShowCommand(show, 'set_boundary_transition_timing', { transition_id: 'transition-scene-1', duration_ms: 1500 })
  expect(stable.ok).toBe(true)
  for (const selector of [{ after_clip_id: 'clip-c' }, { at_ms: 31000 }]) {
    const result = applyShowCommand(show, 'set_boundary_transition_timing', { ...selector, duration_ms: 1500 })
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!stable.ok || !result.ok) throw new Error('Boundary selector')
    expect({ ...result.record, updatedAt: stable.record.updatedAt }).toStrictEqual(stable.record)
    expect(result.changes[0].targetId).toBe('transition-scene-1')
  }
  const ambiguous = structuredClone(show)
  for (const scene of ambiguous.composition!.scenes) {
    scene.zones[1].main = scene.zones[0].main.map(clip => ({ ...structuredClone(clip), id: `${clip.id}-other` }))
  }
  expect(applyShowCommand(ambiguous, 'set_boundary_transition_timing', { at_ms: 31000, duration_ms: 1500 })).toMatchObject({ ok: false, issues: [{ code: 'ambiguous-junction' }] })
  expect(applyShowCommand(ambiguous, 'set_boundary_transition_timing', { transition_id: 'transition-scene-1', duration_ms: 1500 }).ok).toBe(true)
  expect(applyShowCommand(show, 'set_boundary_transition_timing', { after_clip_id: 'clip-a', duration_ms: 1500 })).toMatchObject({ ok: false, issues: [{ code: 'missing-target' }] })
  expect(applyShowCommand(show, 'set_boundary_transition_timing', { transition_id: 'transition-scene-1', at_ms: 31000, duration_ms: 1500 })).toMatchObject({ ok: false, issues: [{ code: 'invalid-argument' }] })
  expect(show).toStrictEqual(original)
})


it('edits Boundary easing alone and jointly with duration without changing kind or unrelated parameters', () => {
  const before = showBoundaryCommandFixture()
  const eased = applyShowCommand(before, 'set_boundary_transition_timing', { after_clip_id: 'clip-c', easing: 'ease-in' })
  expect(eased.ok, JSON.stringify(eased)).toBe(true)
  if (!eased.ok) throw new Error('easing')
  expect(eased.record.transitions![0]).toMatchObject({ id: 'transition-scene-1', kind: 'crossfade', durationMs: 2000, easing: { curve: 'quadratic', direction: 'in' } })
  const noop = applyShowCommand(eased.record, 'set_boundary_transition_timing', { transition_id: 'transition-scene-1', easing: 'ease-in' })
  expect(noop).toStrictEqual({ ok: true, record: eased.record, changes: [] })
  const both = applyShowCommand(before, 'set_boundary_transition_timing', { at_ms: 31000, duration_ms: 1500.4, easing: { curve: 'sine', direction: 'out' } })
  expect(both.ok).toBe(true)
  if (!both.ok) throw new Error('both')
  expect(both.record.transitions![0]).toMatchObject({ durationMs: 1500, easing: { curve: 'sine', direction: 'out' } })
  for (const input of [{ easing: 'wrong' }, { easing: { curve: 'wrong' } }, { easing: null }, { duration_ms: -1 }, {}]) {
    expect(applyShowCommand(before, 'set_boundary_transition_timing', { transition_id: 'transition-scene-1', ...input }).ok).toBe(false)
  }
})


it('uses typed presentation conversion for Boundary parameters and validates before no-op', () => {
  const before = showBoundaryCommandFixture()
  const result = applyShowCommand(before, 'update_boundary_transition_parameter', { transition_id: 'transition-scene-1', parameter: 'easing', value: 'sine-in' })
  expect(result.ok, JSON.stringify(result)).toBe(true)
  if (!result.ok) throw new Error('parameter')
  expect(result.record.transitions![0].easing).toStrictEqual({ curve: 'sine', direction: 'in' })
  expect(applyShowCommand(result.record, 'update_boundary_transition_parameter', { transition_id: 'transition-scene-1', parameter: 'easing', value: 'sine-in' })).toStrictEqual({ ok: true, record: result.record, changes: [] })
  for (const [parameter, value] of [['easing', 'invalid'], ['easing', 1], ['feather', true], ['unknown', 1]]) {
    expect(applyShowCommand(before, 'update_boundary_transition_parameter', { transition_id: 'transition-scene-1', parameter, value }).ok).toBe(false)
  }
})


it('sets, replaces and clears an agent-only Boundary Layout without rewriting visual state', () => {
  const before = showBoundaryCommandFixture()
  const original = structuredClone(before)
  let record = before
  for (const layout_id of ['layout-2', before.routingLayouts[0].id, null]) {
    const result = applyShowCommand(record, 'set_boundary_layout', { after_clip_id: 'clip-c', layout_id })
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) throw new Error('layout')
    expect(result.record.transitions.filter(transition => transition.kind !== 'routing')).toStrictEqual(before.transitions)
    expect(result.record.routingLayouts).toStrictEqual(before.routingLayouts)
    expect(result.record.transitions.find(transition => transition.kind === 'routing')?.layoutId ?? null).toBe(layout_id)
    expect(applyShowCommand(result.record, 'set_boundary_layout', { transition_id: 'transition-scene-1', layout_id })).toStrictEqual({ ok: true, record: result.record, changes: [] })
    record = result.record
  }
  expect(before).toStrictEqual(original)
  expect(applyShowCommand(before, 'set_boundary_layout', { at_ms: 31000, layout_id: 'absent' })).toMatchObject({ ok: false, issues: [{ code: 'unknown-layout' }] })
})

it.each([
  ['set_boundary_transition_timing', { duration_ms: 1500 }],
  ['update_boundary_transition_parameter', { parameter: 'easing', value: 'sine-in' }],
])('%s preserves unrelated raw entity fields', (command, args) => {
  const before = showBoundaryCommandFixture()
  before.cells[0].transform = undefined
  const result = applyShowCommand(before, command as string, { transition_id: 'transition-scene-1', ...args as object })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Boundary command')
  expect(result.record.cells).toStrictEqual(before.cells)
  expect(result.record.composition).toStrictEqual(before.composition)
  expect(result.record.scenes).toStrictEqual(before.scenes)
})

it.each([
  ['set_boundary_transition_timing', { duration_ms: 1500 }],
  ['update_boundary_transition_parameter', { parameter: 'easing', value: 'linear' }],
  ['set_boundary_layout', { layout_id: null }],
])('%s preserves private batch atomicity beside a valid no-op', (command, args) => {
  const store = createSessionStore()
  const source = showBoundaryCommandFixture()
  const original = structuredClone(source)
  const opened = store.open(source)
  if (!opened.ok) throw new Error('Boundary session')
  const id = opened.sessionId
  const before = store.export(id)
  expect(store.begin(id, 'Boundary edit and no-op').ok).toBe(true)
  expect(store.apply(id, 'set_boundary_transition_timing', { transition_id: 'transition-scene-1', duration_ms: 1500 }).ok).toBe(true)
  expect(store.apply(id, command as string, { transition_id: 'transition-scene-1', ...args as object })).toMatchObject({ ok: true, changes: [] })
  expect(store.export(id)).toStrictEqual(before)
  expect(store.commit(id)).toMatchObject({ ok: true, changes: [{ op: 'set_boundary_transition_timing' }] })
  const after = store.export(id)
  if (!after.ok || !before.ok) throw new Error('Boundary export')
  const expected = structuredClone(before.show)
  expected.transitions[0].durationMs = 1500
  expect(after.show).toStrictEqual({ ...expected, updatedAt: after.show.updatedAt })
  expect(store.undo(id).ok).toBe(true)
  expect(store.export(id)).toStrictEqual(before)
  expect(store.undo(id).ok).toBe(false)
  expect(store.redo(id).ok).toBe(true)
  expect(store.export(id)).toStrictEqual(after)
  expect(store.begin(id, 'Boundary refused batch').ok).toBe(true)
  expect(store.apply(id, 'set_boundary_transition_timing', { transition_id: 'transition-scene-1', duration_ms: 1000 }).ok).toBe(true)
  expect(store.apply(id, command as string, { transition_id: 'missing-boundary', ...args as object })).toMatchObject({ ok: false })
  expect(store.rollback(id)).toMatchObject({ ok: true, discardedChanges: 1 })
  expect(store.export(id)).toStrictEqual(after)
  expect(source).toStrictEqual(original)
})

it('preserves same-kind Boundary settings unless a variant explicitly selects defaults', () => {
  const before = showBoundaryCommandFixture()
  before.transitions[0] = { id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'wipe', durationMs: 1500, easing: { curve: 'sine', direction: 'in' }, wipeVariant: 'linear', direction: 0.25, feather: 0.4, edgePolicy: 'blend' }
  expect(applyShowCommand(before, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: 'wipe' })).toStrictEqual({ ok: true, record: before, changes: [] })
  const retimed = applyShowCommand(before, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: 'wipe', duration_ms: 1200.4 })
  expect(retimed.ok).toBe(true)
  if (!retimed.ok) throw new Error('same-kind duration')
  expect(retimed.record.transitions[0]).toStrictEqual({ ...before.transitions[0], durationMs: 1200 })
  const reset = applyShowCommand(before, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: 'wipe', variant: 'linear' })
  expect(reset.ok).toBe(true)
  if (!reset.ok) throw new Error('explicit variant')
  expect(reset.record.transitions[0]).toMatchObject({ kind: 'wipe', durationMs: 2000, easing: { curve: 'linear' }, wipeVariant: 'linear', direction: 0, feather: 0 })
  expect(applyShowCommand(reset.record, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: 'wipe', variant: 'linear' })).toStrictEqual({ ok: true, record: reset.record, changes: [] })
  expect(applyShowCommand(before, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: 'wipe', variant: 'missing' })).toMatchObject({ ok: false, issues: [{ code: 'invalid-argument' }] })
})

it('resets a Boundary to Cut without normalizing unrelated raw entities', () => {
  const before = showBoundaryCommandFixture()
  before.cells[0].transform = undefined
  const result = applyShowCommand(before, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: 'cut' })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Cut')
  expect(result.record).toStrictEqual({ ...before, transitions: [{ id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'cut', durationMs: 0, easing: before.transitions[0].easing }], updatedAt: result.record.updatedAt })
  expect(applyShowCommand(result.record, 'set_boundary_transition', { transition_id: 'transition-scene-1', kind: 'cut' })).toStrictEqual({ ok: true, record: result.record, changes: [] })
})
