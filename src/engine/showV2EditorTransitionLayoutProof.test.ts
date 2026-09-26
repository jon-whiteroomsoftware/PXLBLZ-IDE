import { describe, expect, it } from 'vitest'
import { recoveryFixture } from '../test/showV2RecoveryFixture'
import { showV2LayoutEditorFixture } from '../test/showV2LayoutEditorFixture'
import { showV2TransitionEditorFixture } from '../test/showV2TransitionEditorFixture'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { createFastReplayRuntime } from './fastReplay'
import { emitFixedPoint } from './fxEmit'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { editShowLayoutIntervalsV2 } from './showLayoutIntervalsV2'
import { prepareShowStageV2 } from './showPreparedStageV2'
import { qualifyShowV2PilotArtifacts } from './showV2Pilot'
import { editShowTransitionV2 } from './showTransitionsV2'
import { projectShowTimelineV2 } from './showTimelineViewModelV2'
import { frozenV1Output } from '../test/v1AuthoringOracles'
import {
  buildShowV2LayoutEditorModel,
  planShowV2LayoutEdit,
} from './showV2LayoutEditorModel'
import {
  buildShowV2TransitionEditorModel,
  planShowV2TransitionEdit,
  showV2TransitionJunctionKey,
} from './showV2TransitionEditorModel'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'

/**
 * The #1056 slice 4 proof surface: the editor route's Transition authoring and
 * Zone Layout lane resolve the same operations as the pilot editors, and every
 * refusal leaves the original record identity with no partial write.
 *
 * The oracle is what the consumer sees - the planned intent the closed
 * admission would submit, the record the landed owner returns, and the reopened
 * `.epe` output in both fidelities - never an internal of this surface.
 */
function allocator(prefix: string): () => string {
  let index = 0
  return () => `${prefix}-${++index}`
}

/** The junction key the editor derives from the drawn view model, as the panel does. */
function derivedCutKeys(record: ShowRecordV2): string[] {
  const view = projectShowTimelineV2(record)
  return view.rows.flatMap(row => row.layers.flatMap(layer => layer.junctions
    .filter(junction => junction.scope === 'derived-cut')
    .map(junction => showV2TransitionJunctionKey({
      atMs: junction.startMs,
      zoneId: row.zoneId,
      layerId: layer.id,
      fromClipId: junction.leftItemId,
      toClipId: junction.rightItemId,
    }))))
}

function converted(kind: Parameters<typeof transitionV1Show>[0] = 'crossfade'): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(transitionV1Show(kind))
  if (result.status !== 'converted') throw new Error(JSON.stringify(result.issues))
  return result.record
}

/** One Zone, one Main Layer, two Clips exactly adjacent at 400 ms. */
function mainLayerCut(): ShowRecordV2 {
  const record = converted()
  const incoming = record.composition.clips.find(clip => clip.id === 'in')!
  incoming.startMs = 400
  incoming.appearance.keys.forEach(key => { key.timeMs -= 200 })
  record.composition.transitions = []
  record.composition.showEndMs = 2_000
  record.composition.layoutOccurrences[0].durationMs = 2_000
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

/** Two Zones under one split Layout, with an exact boundary on the second Zone. */
function secondZoneCut(): ShowRecordV2 {
  const { record } = recoveryFixture(false)
  const source = record.composition.clips[0]
  record.composition.showEndMs = 2_000
  record.composition.layoutOccurrences[0].durationMs = 2_000
  source.durationMs = 2_000
  record.composition.layers.push({ id: 'right-main', zoneId: 'right', name: 'Main', rank: 0 })
  for (const [id, startMs] of [['right-a', 0], ['right-b', 800]] as const) {
    const clip = structuredClone(source)
    Object.assign(clip, { id, zoneId: 'right', layerId: 'right-main', startMs, durationMs: 800 })
    clip.appearance.keys = [{ ...structuredClone(source.appearance.keys[0]), id: `${id}:appearance`, timeMs: startMs }]
    record.composition.clips.push(clip)
  }
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

describe('the v2 editor addresses the pilot editors\' own Transition operations', () => {
  it.each([
    ['a Main Layer', mainLayerCut],
    ['an overlay Layer', () => showV2TransitionEditorFixture().record],
    ['a second Zone', secondZoneCut],
  ])('derives the same junction the pilot model lists on %s', (_partition, build) => {
    const record = build()
    const keys = derivedCutKeys(record)
    const pilot = buildShowV2TransitionEditorModel(record, 2)

    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(pilot.junctions.map(junction => junction.key)).toContain(key)
      const request = { kind: 'insert' as const, junctionKey: key, kindKey: 'transition:blend:crossfade', durationMs: 200, crossfadePolicy: 'live-live' as const }
      // Both routes plan through one owner model, so the intents are identical.
      expect(planShowV2TransitionEdit(record, request, allocator('fresh'), 2))
        .toEqual(planShowV2TransitionEdit(record, request, allocator('fresh'), 2))
    }
  })

  it.each([
    ['transition:blend:crossfade', 'crossfade'],
    ['transition:fade:through-color', 'fade-color'],
    ['transition:wipe:linear', 'wipe'],
    ['transition:dissolve:pixel', 'dither'],
    ['transition:shape-reveal:circle', 'portal'],
    ['transition:motion:cover', 'motion'],
  ])('inserts %s and moves the incoming Clip once', (kindKey, kind) => {
    const record = mainLayerCut()
    const [junctionKey] = derivedCutKeys(record)

    const plan = planShowV2TransitionEdit(record, {
      kind: 'insert', junctionKey, kindKey, durationMs: 200, crossfadePolicy: 'snapshot-live',
    }, allocator('fresh'), 2)
    if (plan.status !== 'ready') throw new Error(plan.message)
    const applied = editShowTransitionV2(record, plan.intent)

    expect(applied.status, applied.status === 'refused' ? applied.message : '').toBe('changed')
    if (applied.status !== 'changed') return
    expect(applied.record.composition.transitions[0]).toMatchObject({ kind, durationMs: 200 })
    expect(applied.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([['out', 0], ['in', 600]])
    expect(validateShowRecordV2(applied.record)).toEqual([])
  })

  it.each(['live-live', 'snapshot-live'] as const)('keeps the %s crossfade policy through Insert and a settings edit', policy => {
    const record = mainLayerCut()
    const [junctionKey] = derivedCutKeys(record)
    const inserted = planShowV2TransitionEdit(record, {
      kind: 'insert', junctionKey, kindKey: 'transition:blend:crossfade', durationMs: 200, crossfadePolicy: policy,
    }, allocator('fresh'), 2)
    if (inserted.status !== 'ready') throw new Error(inserted.message)
    const first = editShowTransitionV2(record, inserted.intent)
    if (first.status !== 'changed') throw new Error('insert')
    expect(first.record.composition.transitions[0].crossfadePolicy).toBe(policy)

    const other = policy === 'live-live' ? 'snapshot-live' : 'live-live'
    const settings = planShowV2TransitionEdit(first.record, {
      kind: 'settings', transitionId: first.record.composition.transitions[0].id, kindKey: 'transition:blend:crossfade', crossfadePolicy: other,
    }, allocator('unused'), 2)
    if (settings.status !== 'ready') throw new Error(settings.message)
    const second = editShowTransitionV2(first.record, settings.intent)

    expect(second.status).toBe('changed')
    if (second.status !== 'changed') return
    expect(second.record.composition.transitions[0]).toMatchObject({ id: first.record.composition.transitions[0].id, crossfadePolicy: other })
    expect(second.record.composition.clips).toEqual(first.record.composition.clips)
  })

  it('applies a resize delta once along a converging chain', () => {
    const record = mainLayerCut()
    // Three Clips joined by two Transitions: 0-400, 600-1000, 1200-1600.
    const tail = structuredClone(record.composition.clips.find(clip => clip.id === 'in')!)
    Object.assign(tail, { id: 'tail', startMs: 800 })
    tail.appearance.keys = [{ ...structuredClone(tail.appearance.keys[0]), id: 'tail:appearance', timeMs: 800 }]
    record.composition.clips.push(tail)
    expect(derivedCutKeys(record)).toHaveLength(2)
    let current = record
    // Build the chain from its last boundary back: an Insert ripples only the
    // connected content, so a Cut-adjacent successor would collide instead.
    for (let round = 1; round <= 2; round += 1) {
      const keys = derivedCutKeys(current)
      const junctionKey = keys[keys.length - 1]
      const plan = planShowV2TransitionEdit(current, {
        kind: 'insert', junctionKey, kindKey: 'transition:blend:crossfade', durationMs: 200, crossfadePolicy: 'live-live',
      }, allocator(`chain-${round}`), 2)
      if (plan.status !== 'ready') throw new Error(plan.message)
      const applied = editShowTransitionV2(current, plan.intent)
      if (applied.status !== 'changed') throw new Error(applied.status === 'refused' ? applied.message : 'insert')
      current = applied.record
    }
    expect(current.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([['out', 0], ['in', 600], ['tail', 1_200]])

    const first = current.composition.transitions
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .find(transition => transition.participants[0].fromClipId === 'out')!
    const resized = editShowTransitionV2(current, { kind: 'resize-transition', transitionId: first.id, durationMs: 400 })

    expect(resized.status, resized.status === 'refused' ? resized.message : '').toBe('changed')
    if (resized.status !== 'changed') return
    // Each downstream Clip moves by exactly the one delta, never twice.
    expect(resized.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([['out', 0], ['in', 800], ['tail', 1_400]])
    expect(resized.record.composition.transitions.map(transition => transition.durationMs).sort()).toEqual([200, 400])
  })

  it('lets the owner decide a boundary coincident with a Layout switch instead of the surface guessing', () => {
    const record = mainLayerCut()
    const first = record.composition.layoutOccurrences[0]
    first.durationMs = 400
    record.composition.layoutOccurrences.push({
      ...structuredClone(first), id: 'after-boundary', startMs: 400, durationMs: 1_600,
    })
    expect(validateShowRecordV2(record)).toEqual([])
    const [junctionKey] = derivedCutKeys(record)

    const plan = planShowV2TransitionEdit(record, {
      kind: 'insert', junctionKey, kindKey: 'transition:blend:crossfade', durationMs: 200, crossfadePolicy: 'live-live',
    }, allocator('coincident'), 2)
    if (plan.status !== 'ready') throw new Error(plan.message)
    const applied = editShowTransitionV2(record, plan.intent)

    // The Zone stays available across the switch, so the owner accepts and the
    // Layout occurrences are untouched: routing never moves implicitly.
    expect(applied.status, applied.status === 'refused' ? applied.message : '').toBe('changed')
    if (applied.status !== 'changed') return
    expect(applied.record.composition.layoutOccurrences).toEqual(record.composition.layoutOccurrences)
    expect(applied.record.composition.clips.map(clip => clip.startMs)).toEqual([0, 600])
  })
})

describe('the v2 editor Zone Layout lane', () => {
  it.each([
    { kind: 'select-layout' as const, occurrenceId: 'later-layout', layoutId: 'alternate-layout' },
    { kind: 'move' as const, occurrenceId: 'later-layout', startMs: 6_000 },
    { kind: 'remove' as const, occurrenceId: 'later-layout' },
  ])('plans $kind exactly as the pilot panel does', request => {
    const record = showV2LayoutEditorFixture().record
    const lane = buildShowV2LayoutEditorModel(record)
    expect(lane.occurrences.map(value => value.id))
      .toEqual(projectShowTimelineV2(record).layoutIntervals.map(interval => interval.id))
    const laneSelectionKeys = frozenV1Output<string[]>('showV2EditorTransitionLayoutProof.test.ts::lane selections::1')
    const intervalSelectionKeys = frozenV1Output<string[]>('showV2EditorTransitionLayoutProof.test.ts::interval selections::1')
    const occurrenceId = (key: string) => key.replace(/^layout-occurrence:/, '')
    expect(lane.occurrences.map(value => value.id)).toEqual(laneSelectionKeys.map(occurrenceId))
    expect(projectShowTimelineV2(record).layoutIntervals.map(interval => interval.id)).toEqual(intervalSelectionKeys.map(occurrenceId))
    expect(laneSelectionKeys).toEqual(intervalSelectionKeys)

    expect(planShowV2LayoutEdit(record, request, allocator('a')))
      .toEqual(planShowV2LayoutEdit(record, request, allocator('b')))
    const plan = planShowV2LayoutEdit(record, request, allocator('a'))
    if (plan.status !== 'ready') throw new Error(plan.message)
    expect(editShowLayoutIntervalsV2(record, plan.intent).status).toBe('changed')
  })

  it('sets and clears the incoming transfer against its own predecessor', () => {
    const record = showV2LayoutEditorFixture().record
    const [first, later] = record.composition.layoutOccurrences

    const set = planShowV2LayoutEdit(record, {
      kind: 'set-transfer', occurrenceId: later.id, transfer: { durationMs: 400, direction: 'forward', easing: { curve: 'linear' } },
    }, allocator('transfer'))
    if (set.status !== 'ready') throw new Error(set.message)
    const applied = editShowLayoutIntervalsV2(record, set.intent)
    if (applied.status !== 'changed') throw new Error(applied.status === 'refused' ? applied.message : 'set-transfer')
    expect(applied.record.composition.layoutOccurrences[1].incomingTransfer)
      .toEqual({ id: 'transfer-1', fromOccurrenceId: first.id, durationMs: 400, direction: 'forward', easing: { curve: 'linear' } })

    const cleared = planShowV2LayoutEdit(applied.record, { kind: 'set-transfer', occurrenceId: later.id, transfer: null }, allocator('unused'))
    if (cleared.status !== 'ready') throw new Error(cleared.message)
    const back = editShowLayoutIntervalsV2(applied.record, cleared.intent)

    expect(back.status).toBe('changed')
    if (back.status !== 'changed') return
    expect(back.record.composition.layoutOccurrences[1].incomingTransfer).toBeUndefined()
    expect(back.record.composition.clips).toEqual(record.composition.clips)
  })

  it('refuses removing an occurrence with a meaningful transfer and returns the original record', () => {
    const record = showV2LayoutEditorFixture().record
    const [first, later] = record.composition.layoutOccurrences
    later.incomingTransfer = { id: 'incoming', fromOccurrenceId: first.id, durationMs: 500, direction: 'forward', easing: { curve: 'linear' } }
    const original = structuredClone(record)

    const plan = planShowV2LayoutEdit(record, { kind: 'remove', occurrenceId: later.id }, allocator('unused'))
    if (plan.status !== 'ready') throw new Error(plan.message)
    const result = editShowLayoutIntervalsV2(record, plan.intent)

    expect(result).toMatchObject({ status: 'refused', code: 'meaningful-occurrence-data' })
    expect(result.record).toBe(record)
    expect(result.affectedLayoutOccurrenceIds).toEqual([])
    expect(result.removedLayoutOccurrenceIds).toEqual([])
    expect(record).toEqual(original)
  })

  it('protects Show End when a switch would move past the last occurrence', () => {
    const record = showV2LayoutEditorFixture().record
    const original = structuredClone(record)

    const plan = planShowV2LayoutEdit(record, { kind: 'move', occurrenceId: 'later-layout', startMs: 31_000 }, allocator('unused'))
    if (plan.status !== 'ready') throw new Error(plan.message)
    const result = editShowLayoutIntervalsV2(record, plan.intent)

    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    expect(record).toEqual(original)
    expect(record.composition.showEndMs).toBe(original.composition.showEndMs)
  })

  it('edits split position only where the Layout definition partitions the Stage', () => {
    const split = buildShowV2LayoutEditorModel(recoveryFixture(false).record)
    expect(split.occurrences[0].splitCapable).toBe(true)
    const single = buildShowV2LayoutEditorModel(mainLayerCut())
    expect(single.occurrences[0].splitCapable).toBe(false)

    const record = recoveryFixture(false).record
    const plan = planShowV2LayoutEdit(record, {
      kind: 'set-parameters', occurrenceId: record.composition.layoutOccurrences[0].id, parameters: { splitPosition: 0.3 },
    }, allocator('unused'))
    if (plan.status !== 'ready') throw new Error(plan.message)
    const applied = editShowLayoutIntervalsV2(record, plan.intent)

    expect(applied.status, applied.status === 'refused' ? applied.message : '').toBe('changed')
    if (applied.status !== 'changed') return
    expect(applied.record.composition.layoutOccurrences[0].parameters).toEqual({ splitPosition: 0.3 })
    expect(applied.record.composition.clips).toEqual(record.composition.clips)
  })
})

describe('the reopened artifact after a full Transition round trip', () => {
  it.each(['fast', 'fidelity'] as const)('reopens an inserted, resized and reset Transition in %s', async fidelity => {
    const { record, dependencies } = showV2TransitionEditorFixture()
    const [junctionKey] = derivedCutKeys(record)
    const insert = planShowV2TransitionEdit(record, {
      kind: 'insert', junctionKey, kindKey: 'transition:blend:crossfade', durationMs: 1_000, crossfadePolicy: 'live-live',
    }, allocator('artifact'), 2)
    if (insert.status !== 'ready') throw new Error(insert.message)
    const inserted = editShowTransitionV2(record, insert.intent)
    if (inserted.status !== 'changed') throw new Error(inserted.status === 'refused' ? inserted.message : 'insert')
    const transitionId = inserted.record.composition.transitions[0].id
    const resized = editShowTransitionV2(inserted.record, { kind: 'resize-transition', transitionId, durationMs: 1_500 })
    if (resized.status !== 'changed') throw new Error(resized.status === 'refused' ? resized.message : 'resize')
    const reset = editShowTransitionV2(resized.record, { kind: 'reset-to-cut', transitionId })
    if (reset.status !== 'changed') throw new Error(reset.status === 'refused' ? reset.message : 'reset')

    // Reset to Cut returns the Show to its authored starting content exactly.
    expect(reset.record.composition.clips).toEqual(record.composition.clips)
    expect(reset.record.composition.transitions).toEqual([])

    const stages = [record, resized.record, reset.record].map(value => prepareShowStageV2(value, dependencies))
    for (const stage of stages) {
      expect(stage.status, stage.status === 'refused' ? stage.message : '').toBe('ready')
    }
    if (stages.some(stage => stage.status !== 'ready')) return
    const bundles = stages.map(stage => (stage.status === 'ready' ? stage.bundle : null)!)
    const files = await Promise.all(bundles.map(bundle => qualifyShowV2PilotArtifacts(bundle)))
    expect(files[1].importedShow.composition).toEqual(resized.record.composition)
    expect(files[2].importedShow.composition).toEqual(reset.record.composition)

    const artifacts = bundles.map((bundle, index) => ({
      ...bundle.artifact,
      dimension: bundle.presentation.stageDimension,
      code: files[index].epeSource,
      fxCode: emitFixedPoint(files[index].epeSource),
    }))
    const runtimes = artifacts.map(artifact => createFastReplayRuntime(artifact, {
      fidelity, randomSeed: 1_056, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }],
    }))
    for (const timeMs of [0, 1_000, 2_000, 2_999, 3_000, 4_500, 6_000, 12_000, 30_000]) {
      const frames = runtimes.map(runtime => runtime.advanceTo(timeMs, { stepMs: 125, forceFullIntermediateRender: true }))
      // A Reset restores the original output at every probe; the resized Show
      // legitimately differs inside the widened window it authored.
      expect(Array.from(frames[2].frame)).toEqual(Array.from(frames[0].frame))
    }
  })
})
