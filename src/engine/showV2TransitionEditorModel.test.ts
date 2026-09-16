import { describe, expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { buildShowV2TransitionEditorModel, planShowV2TransitionEdit } from './showV2TransitionEditorModel'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'

function converted(kind: Parameters<typeof transitionV1Show>[0] = 'crossfade'): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(transitionV1Show(kind))
  if (result.status !== 'converted') throw new Error(JSON.stringify(result.issues))
  return result.record
}

function cutShow(): ShowRecordV2 {
  const record = converted()
  const incoming = record.composition.clips.find(clip => clip.id === 'in')!
  incoming.startMs = 400
  incoming.appearance.keys.forEach(key => { key.timeMs -= 200 })
  record.composition.transitions = []
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function allocator(prefix: string): () => string {
  let index = 0
  return () => `${prefix}-${++index}`
}

describe('v2 Transition editor model', () => {
  it('offers participant and whole-output junctions at exact adjacency only', () => {
    const exact = cutShow()
    const model = buildShowV2TransitionEditorModel(exact, 2)
    expect(model.junctions.map(junction => [junction.scope, junction.atMs])).toEqual([
      ['participant', 400], ['whole-output', 400],
    ])
    expect(model.junctions[0].fromClipIds).toEqual(['out'])
    expect(model.kinds.some(kind => kind.key === 'transition:blend:cut')).toBe(false)
    expect(model.kinds.map(kind => kind.key)).toContain('transition:blend:crossfade')

    const gapped = cutShow()
    gapped.composition.clips.find(clip => clip.id === 'in')!.startMs = 401
    gapped.composition.clips.find(clip => clip.id === 'in')!.appearance.keys.forEach(key => { key.timeMs += 1 })
    expect(buildShowV2TransitionEditorModel(gapped, 2).junctions).toEqual([])
  })

  it.each([
    ['transition:blend:crossfade', 'crossfade'],
    ['transition:fade:through-color', 'fade-color'],
    ['transition:wipe:linear', 'wipe'],
    ['transition:dissolve:pixel', 'dither'],
    ['transition:shape-reveal:circle', 'portal'],
    ['transition:motion:cover', 'motion'],
  ])('plans an Insert of %s that the pure owner accepts', (kindKey, kind) => {
    const source = cutShow()
    source.composition.showEndMs = 1_500
    source.composition.layoutOccurrences[0].durationMs = 1_500
    const junctionKey = buildShowV2TransitionEditorModel(source, 2).junctions[0].key

    const plan = planShowV2TransitionEdit(source, {
      kind: 'insert', junctionKey, kindKey, durationMs: 200, crossfadePolicy: 'snapshot-live',
    }, allocator('fresh'), 2)

    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready' || plan.intent.kind !== 'insert') return
    expect(plan.intent.transition).toMatchObject({ id: 'fresh-1', kind, durationMs: 200 })
    expect(plan.intent.transition.participants).toEqual([
      { id: 'fresh-1:participant:1', zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'out', toClipId: 'in' },
    ])
    const applied = editShowTransitionV2(source, plan.intent)
    expect(applied).toMatchObject({ status: 'changed', affectedClipIds: ['in'], affectedTransitionIds: ['fresh-1'] })
    if (applied.status !== 'changed') return
    expect(applied.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([['out', 0], ['in', 600]])
    expect(validateShowRecordV2(applied.record)).toEqual([])
  })

  it('plans a whole-output Insert covering every boundary contributor', () => {
    const source = cutShow()
    source.composition.showEndMs = 1_500
    source.composition.layoutOccurrences[0].durationMs = 1_500
    const overlayLayerId = source.composition.layers.find(layer => layer.rank === 1)!.id
    const outgoing = source.composition.clips.find(clip => clip.id === 'out')!
    const incoming = source.composition.clips.find(clip => clip.id === 'in')!
    source.composition.clips.push(
      { ...structuredClone(outgoing), id: 'out-overlay', layerId: overlayLayerId, appearance: { keys: [{ ...structuredClone(outgoing.appearance.keys[0]), id: 'out-overlay:1' }] } },
      { ...structuredClone(incoming), id: 'in-overlay', layerId: overlayLayerId, appearance: { keys: [{ ...structuredClone(incoming.appearance.keys[0]), id: 'in-overlay:1' }] } },
    )
    expect(validateShowRecordV2(source)).toEqual([])
    const whole = buildShowV2TransitionEditorModel(source, 2).junctions.find(junction => junction.scope === 'whole-output')!
    expect(whole.fromClipIds).toEqual(['out', 'out-overlay'])

    const plan = planShowV2TransitionEdit(source, {
      kind: 'insert', junctionKey: whole.key, kindKey: 'transition:blend:crossfade', durationMs: 200, crossfadePolicy: 'live-live',
    }, allocator('whole'), 2)

    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready' || plan.intent.kind !== 'insert') return
    expect(plan.intent.transition.participants).toEqual([])
    expect(plan.intent.transition.wholeOutput).toEqual({ startMs: 400, fromClipIds: ['out', 'out-overlay'], toClipIds: ['in', 'in-overlay'] })
    const applied = editShowTransitionV2(source, plan.intent)
    expect(applied).toMatchObject({ status: 'changed', affectedClipIds: ['in', 'in-overlay'] })
  })

  it('changes kind and crossfade policy while retaining identity, timing and endpoints', () => {
    const source = converted('wipe')
    const current = source.composition.transitions[0]
    expect(current).toMatchObject({ kind: 'wipe', wipeVariant: 'linear' })

    const plan = planShowV2TransitionEdit(source, {
      kind: 'settings', transitionId: current.id, kindKey: 'transition:blend:crossfade', crossfadePolicy: 'live-live',
    }, allocator('unused'), 2)

    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready' || plan.intent.kind !== 'update-transition') return
    expect(plan.intent.transition).toMatchObject({
      id: current.id, kind: 'crossfade', crossfadePolicy: 'live-live', durationMs: current.durationMs,
    })
    // Stale kind parameters leave with their kind rather than persisting as dead fields.
    expect('wipeVariant' in plan.intent.transition).toBe(false)
    expect(plan.intent.transition.participants).toEqual(current.participants)
    const applied = editShowTransitionV2(source, plan.intent)
    expect(applied).toMatchObject({ status: 'changed', affectedClipIds: [], affectedTransitionIds: [current.id] })
    if (applied.status !== 'changed') return
    expect(applied.record.composition.clips).toEqual(source.composition.clips)
    expect(validateShowRecordV2(applied.record)).toEqual([])
  })

  it('plans Reset to Cut with derived projections for a global scalar carrier', () => {
    const source = converted()
    source.composition.transitions = [{
      id: 'boundary', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
      participants: [], wholeOutput: { startMs: 400, fromClipIds: ['out'], toClipIds: ['in'] },
      propertyRamps: [{ target: { kind: 'show-repeat-scale' }, from: 3, easing: { curve: 'linear' } }],
    }]
    expect(validateShowRecordV2(source)).toEqual([])

    const plan = planShowV2TransitionEdit(source, { kind: 'reset', transitionId: 'boundary' }, allocator('ramp'), 2)

    expect(plan).toEqual({
      status: 'ready',
      intent: {
        kind: 'reset-to-cut',
        transitionId: 'boundary',
        propertyRampProjections: [{
          rampIndex: 0, trackId: 'ramp-1', startKeyId: 'ramp-2', endKeyId: 'ramp-3',
          activeEndMs: 600, toValue: source.composition.sampleRemap.repeatScale,
        }],
      },
    })
    if (plan.status !== 'ready') return
    const applied = editShowTransitionV2(source, plan.intent)
    expect(applied).toMatchObject({ status: 'changed', affectedTrackIds: ['ramp-1'], removedIds: ['boundary'] })
    if (applied.status !== 'changed') return
    expect(applied.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([['out', 0], ['in', 400]])
    expect(applied.record.composition.propertyTracks[0]).toMatchObject({
      target: { kind: 'show-repeat-scale' }, activeStartMs: 400, activeDurationMs: 200,
    })
  })

  it('plans a plain Reset when no carrier exists and refuses an unprojectable target', () => {
    const plain = converted()
    expect(planShowV2TransitionEdit(plain, { kind: 'reset', transitionId: plain.composition.transitions[0].id }, allocator('x'), 2)).toEqual({
      status: 'ready', intent: { kind: 'reset-to-cut', transitionId: plain.composition.transitions[0].id },
    })

    const clipCarrier = converted()
    const transition = clipCarrier.composition.transitions[0]
    transition.propertyRamps = [{
      participantId: transition.participants[0].id,
      target: { kind: 'clip-view', clipId: 'in', property: 'brightness' }, from: 0.2,
    }]
    const refused = planShowV2TransitionEdit(clipCarrier, { kind: 'reset', transitionId: transition.id }, allocator('x'), 2)
    expect(refused).toMatchObject({ status: 'refused', message: expect.stringContaining('clip-view') })
  })

  it('refuses unknown junctions, unknown kinds, unusable durations and conflicting identity', () => {
    const source = cutShow()
    const junctionKey = buildShowV2TransitionEditorModel(source, 2).junctions[0].key
    const insert = (overrides: Partial<{ junctionKey: string; kindKey: string; durationMs: number }>, allocate = allocator('fresh')) => planShowV2TransitionEdit(source, {
      kind: 'insert', junctionKey, kindKey: 'transition:blend:crossfade', durationMs: 100, crossfadePolicy: 'live-live', ...overrides,
    }, allocate, 2)

    expect(insert({ junctionKey: 'participant:9999:zone:layer:a:b' })).toMatchObject({ status: 'refused' })
    expect(insert({ kindKey: 'transition:blend:cut' })).toMatchObject({ status: 'refused' })
    expect(insert({ durationMs: 0 })).toMatchObject({ status: 'refused' })
    expect(insert({ durationMs: 1.5 })).toMatchObject({ status: 'refused' })
    expect(planShowV2TransitionEdit(source, { kind: 'settings', transitionId: 'absent', kindKey: 'transition:blend:crossfade', crossfadePolicy: 'live-live' }, allocator('x'), 2)).toMatchObject({ status: 'refused' })
    expect(planShowV2TransitionEdit(source, { kind: 'reset', transitionId: 'absent' }, allocator('x'), 2)).toMatchObject({ status: 'refused' })

    const withExisting = cutShow()
    const existingPlan = planShowV2TransitionEdit(withExisting, { kind: 'insert', junctionKey, kindKey: 'transition:blend:crossfade', durationMs: 100, crossfadePolicy: 'live-live' }, allocator('fresh'), 2)
    if (existingPlan.status !== 'ready' || existingPlan.intent.kind !== 'insert') throw new Error('plan')
    withExisting.composition.transitions = [existingPlan.intent.transition]
    expect(planShowV2TransitionEdit(withExisting, { kind: 'insert', junctionKey, kindKey: 'transition:blend:crossfade', durationMs: 100, crossfadePolicy: 'live-live' }, () => 'fresh-1', 2)).toMatchObject({ status: 'refused', message: expect.stringContaining('identity') })
  })
})
