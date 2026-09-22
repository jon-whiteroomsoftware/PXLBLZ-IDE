import { describe, expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import type { ShowRecord } from './personalContentRecords'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { createDefaultShow, removeShowBoundaryTransition, updateShowBoundaryTransition } from './showModel'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import {
  buildShowV2TransitionEditorModel,
  planShowV2TransitionEdit,
  planShowV2BoundaryTransitionChanges,
  planShowV2BoundaryPaletteApply,
  planShowV2TransitionReset,
} from './showV2TransitionEditorModel'
import {
  replaceShowBoundaryTransition,
  showBoundaryTransitionParameterChanges,
  showBoundaryTransitionPresentationKey,
  showTransitionChangesForPresentation,
  type ShowTransitionChanges,
} from './showTransitionAuthoring'
import { buildShowToolkitPresentationCatalogue } from './showVisualToolkitPresentation'
import { getShowToolkitFamily } from './showVisualToolkit'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
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
    // A kind change does not change which v1 collection this Transition came
    // from, and only the converter may write or clear that provenance, so the
    // plan carries it through an ordinary settings edit unchanged (#1065).
    expect(current.origin).toBe('converted-layer-transition')
    expect(plan.intent.transition.origin).toBe(current.origin)
    const applied = editShowTransitionV2(source, plan.intent)
    expect(applied).toMatchObject({ status: 'changed', affectedClipIds: [], affectedTransitionIds: [current.id] })
    if (applied.status !== 'changed') return
    expect(applied.record.composition.transitions[0].origin).toBe(current.origin)
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

/** Boundary copy of the conversion spec's helper: Layer settings lowered to a boundary Transition (#1066 slice 5a). */
function boundaryShow(kind: Parameters<typeof transitionV1Show>[0] = 'crossfade'): ShowRecord {
  const show = transitionV1Show(kind)
  const composition = show.composition!
  const [out, incoming] = composition.scenes[0].zones[0].main
  show.scenes = [{ id: 'scene-a', name: 'Outgoing', durationMs: 400 }, { id: 'scene-b', name: 'Incoming', durationMs: 400 }]
  composition.scenes = [
    { sceneId: 'scene-a', zones: [{ zoneId: 'zone', main: [out], overlays: [] }] },
    { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: [{ ...incoming, startMs: 0 }], overlays: [] }] },
  ]
  const { fromPlacementId: _from, toPlacementId: _to, ...settings } = composition.transitions![0]
  show.transitions = [{ ...settings, afterSceneId: 'scene-a' }]
  delete composition.transitions
  return show
}

const COMPILE_LOOKUP = { byCellId: {}, byPatternInstanceId: {
  'out-instance': 'export var calls=0; export var elapsed=0; export function beforeRender(delta) { calls++; elapsed+=delta/1000 } export function render2D(index,x,y) { rgb(1,x,y) }',
  'in-instance': 'export var calls=0; export var elapsed=0; export function beforeRender(delta) { calls++; elapsed+=delta/1000 } export function render2D(index,x,y) { rgb(x,y,1) }',
}, stageDimension: 2 as const }

function convertedBoundaryRecord(kind: Parameters<typeof transitionV1Show>[0] = 'crossfade'): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(boundaryShow(kind))
  if (result.status !== 'converted') throw new Error(JSON.stringify(result.issues))
  return result.record
}

function wipeDirectionChanges(): { record: ShowRecordV2; transitionId: string; changes: ShowTransitionChanges } {
  const record = converted('wipe')
  const current = record.composition.transitions[0]
  const item = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    .find(candidate => candidate.key === showBoundaryTransitionPresentationKey(current))
  if (!item) throw new Error('wipe catalogue item missing')
  const changes = showBoundaryTransitionParameterChanges(current, item, 'direction', 0.25)
  if (!changes) throw new Error('direction is not a wipe parameter')
  return { record, transitionId: current.id, changes }
}

describe('v2 boundary Transition settings planner (#1066 slice 5a)', () => {
  it('plans a crossfade-policy change as a complete update-transition', () => {
    const record = convertedBoundaryRecord('crossfade')
    const current = record.composition.transitions[0]
    expect(current.crossfadePolicy).toBe('snapshot-live')

    const plan = planShowV2BoundaryTransitionChanges(record, current.id, { crossfadePolicy: 'live-live' })
    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready') return
    expect(plan.intent).toEqual({
      kind: 'update-transition',
      transition: { ...structuredClone(current), crossfadePolicy: 'live-live' },
    })
  })

  it('agrees with the parameter path on a spatial wipe change', () => {
    const { record, transitionId, changes } = wipeDirectionChanges()

    const plan = planShowV2BoundaryTransitionChanges(record, transitionId, changes)
    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready') return
    const parameterPlan = planShowV2TransitionEdit(record, {
      kind: 'parameter', transitionId, parameterId: 'direction', value: 0.25,
    }, () => 'unused', 2)
    expect(parameterPlan.status).toBe('ready')
    if (parameterPlan.status !== 'ready') return
    expect(plan.intent).toEqual(parameterPlan.intent)
  })

  it('reports an unchanged settings write as a no-op', () => {
    const record = convertedBoundaryRecord('crossfade')
    const current = record.composition.transitions[0]
    expect(planShowV2BoundaryTransitionChanges(record, current.id, { crossfadePolicy: current.crossfadePolicy }))
      .toEqual({ status: 'no-op' })
  })

  it.each([
    [{ kind: 'crossfade' } as ShowTransitionChanges, 'kind'],
    [{ durationMs: 200 } as ShowTransitionChanges, 'durationMs'],
    [{ propertyTransitions: { sample: {} } } as ShowTransitionChanges, 'propertyTransitions'],
  ])('refuses a %s write owned by another surface', (changes, key) => {
    const record = convertedBoundaryRecord('crossfade')
    const current = record.composition.transitions[0]
    const plan = planShowV2BoundaryTransitionChanges(record, current.id, changes)
    expect(plan).toEqual({ status: 'refused', code: 'unsupported-field', message: expect.stringContaining(key) })
  })

  it('refuses an unknown Transition before reading any field', () => {
    const record = convertedBoundaryRecord('crossfade')
    expect(planShowV2BoundaryTransitionChanges(record, 'absent', { crossfadePolicy: 'live-live' }))
      .toEqual({ status: 'refused', code: 'missing-transition', message: expect.stringContaining('absent') })
  })

  it('drops a key cleared to undefined', () => {
    const record = convertedBoundaryRecord('crossfade')
    const current = record.composition.transitions[0]
    expect(current.crossfadePolicy).toBe('snapshot-live')

    const plan = planShowV2BoundaryTransitionChanges(record, current.id, { crossfadePolicy: undefined })
    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready') return
    expect('crossfadePolicy' in plan.intent.transition).toBe(false)
    expect(plan.intent.transition).toEqual((() => {
      const next = structuredClone(current)
      delete (next as unknown as Record<string, unknown>).crossfadePolicy
      return next
    })())
  })

  it('round-trips every settings intent through the transition owner', () => {
    const first = convertedBoundaryRecord('crossfade')
    const firstCurrent = first.composition.transitions[0]
    const firstPlan = planShowV2BoundaryTransitionChanges(first, firstCurrent.id, { crossfadePolicy: 'live-live' })
    if (firstPlan.status !== 'ready') throw new Error('crossfade-policy plan not ready')
    expect(editShowTransitionV2(first, firstPlan.intent)).toMatchObject({ status: 'changed' })

    const { record: second, transitionId, changes } = wipeDirectionChanges()
    const secondPlan = planShowV2BoundaryTransitionChanges(second, transitionId, changes)
    if (secondPlan.status !== 'ready') throw new Error('wipe direction plan not ready')
    expect(editShowTransitionV2(second, secondPlan.intent)).toMatchObject({ status: 'changed' })

    const third = convertedBoundaryRecord('crossfade')
    const thirdCurrent = third.composition.transitions[0]
    const thirdPlan = planShowV2BoundaryTransitionChanges(third, thirdCurrent.id, { crossfadePolicy: undefined })
    if (thirdPlan.status !== 'ready') throw new Error('clear-policy plan not ready')
    expect(editShowTransitionV2(third, thirdPlan.intent)).toMatchObject({ status: 'changed' })
  })

  it('matches the v1 owner on the crossfade-policy and wipe-direction cases', () => {
    for (const [kind, transitionId, changes] of [
      ['crossfade', 'transition-crossfade', { crossfadePolicy: 'live-live' } as ShowTransitionChanges],
      ['wipe', 'transition-wipe', (() => {
        const source = boundaryShow('wipe')
        const boundary = source.transitions[0]
        const item = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
          .find(candidate => candidate.key === showBoundaryTransitionPresentationKey(boundary))
        if (!item) throw new Error('wipe catalogue item missing')
        const produced = showBoundaryTransitionParameterChanges(boundary, item, 'direction', 0.25)
        if (!produced) throw new Error('direction is not a wipe parameter')
        return produced
      })()],
    ] as Array<[Parameters<typeof transitionV1Show>[0], string, ShowTransitionChanges]>) {
      const v1First = updateShowBoundaryTransition(boundaryShow(kind), transitionId, changes)
      const convertedFirst = convertShowRecordV1ToV2(v1First)
      if (convertedFirst.status !== 'converted') throw new Error(JSON.stringify(convertedFirst.issues))
      const v1Transition = convertedFirst.record.composition.transitions.find(candidate => candidate.id === transitionId)
      expect(v1Transition).toBeDefined()

      const record = convertedBoundaryRecord(kind)
      const plan = planShowV2BoundaryTransitionChanges(record, transitionId, changes)
      expect(plan.status).toBe('ready')
      if (plan.status !== 'ready') return
      const applied = editShowTransitionV2(record, plan.intent)
      expect(applied.status).toBe('changed')
      if (applied.status !== 'changed') return
      const v2Transition = applied.record.composition.transitions.find(candidate => candidate.id === transitionId)
      expect(v2Transition).toEqual(v1Transition)
    }
  })

  it('prepares every owner-applied settings record for compile', () => {
    const first = convertedBoundaryRecord('crossfade')
    const firstCurrent = first.composition.transitions[0]
    const firstPlan = planShowV2BoundaryTransitionChanges(first, firstCurrent.id, { crossfadePolicy: 'live-live' })
    if (firstPlan.status !== 'ready') throw new Error('crossfade-policy plan not ready')
    const firstApplied = editShowTransitionV2(first, firstPlan.intent)
    if (firstApplied.status !== 'changed') throw new Error('crossfade-policy owner refused')

    const { record: second, transitionId, changes } = wipeDirectionChanges()
    const secondPlan = planShowV2BoundaryTransitionChanges(second, transitionId, changes)
    if (secondPlan.status !== 'ready') throw new Error('wipe direction plan not ready')
    const secondApplied = editShowTransitionV2(second, secondPlan.intent)
    if (secondApplied.status !== 'changed') throw new Error('wipe direction owner refused')

    const third = convertedBoundaryRecord('crossfade')
    const thirdCurrent = third.composition.transitions[0]
    const thirdPlan = planShowV2BoundaryTransitionChanges(third, thirdCurrent.id, { crossfadePolicy: undefined })
    if (thirdPlan.status !== 'ready') throw new Error('clear-policy plan not ready')
    const thirdApplied = editShowTransitionV2(third, thirdPlan.intent)
    if (thirdApplied.status !== 'changed') throw new Error('clear-policy owner refused')

    for (const applied of [firstApplied, secondApplied, thirdApplied]) {
      expect(prepareShowV2ForCompile(applied.record, COMPILE_LOOKUP).status).toBe('ready')
    }
  })
})

describe('planShowV2TransitionReset (#1066 slice 5d)', () => {
  const LEFT = 'placement-cell-1-scene-1'
  const RIGHT = 'placement-cell-2-scene-2'

  function convertedDefaultShow(): ShowRecordV2 {
    const source = createDefaultShow('boundary-repair', 'Boundary repair', 1)
    const byCellId = Object.fromEntries(
      source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]]),
    )
    const converted = convertShowRecordV1ToV2(source, { byCellId })
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    expect(converted.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      [LEFT, 0, 30000],
      [RIGHT, 32000, 30000],
    ])
    expect(converted.record.composition.showEndMs).toBe(62000)
    return converted.record
  }

  it('plans Reset to Cut for the converted default boundary and matches v1 Remove then convert', () => {
    const record = convertedDefaultShow()
    const plan = planShowV2TransitionReset(record, 'transition-scene-1', () => 'unused')
    expect(plan).toEqual({ status: 'ready', intent: { kind: 'reset-to-cut', transitionId: 'transition-scene-1' } })
    if (plan.status !== 'ready') throw new Error('reset plan not ready')
    const edited = editShowTransitionV2(record, plan.intent)
    expect(edited.status).toBe('changed')
    if (edited.status !== 'changed') throw new Error('reset owner refused')
    const source = createDefaultShow('boundary-repair', 'Boundary repair', 1)
    const byCellId = Object.fromEntries(
      source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]]),
    )
    const v1Converted = convertShowRecordV1ToV2(removeShowBoundaryTransition(source, 'transition-scene-1'), { byCellId })
    expect(v1Converted.status).toBe('converted')
    if (v1Converted.status !== 'converted') throw new Error(JSON.stringify(v1Converted))
    expect(edited.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual(
      v1Converted.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs]),
    )
    expect(edited.record.composition.showEndMs).toEqual(v1Converted.record.composition.showEndMs)
    expect(edited.record.composition.transitions).toEqual([])
    expect(v1Converted.record.composition.transitions).toEqual([])
    expect(edited.record.composition.markers.map(marker => [marker.id, marker.timeMs])).toEqual(
      v1Converted.record.composition.markers.map(marker => [marker.id, marker.timeMs]),
    )
    expect(planShowV2TransitionReset(record, 'absent', () => 'x')).toEqual({ status: 'refused', message: 'Select an existing Transition.' })
  })
})

describe('planShowV2BoundaryPaletteApply (#1066 slice 5b)', () => {
  function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, entry]) => [key, canonicalize(entry)]),
      )
    }
    return value
  }

  function convertWithStock(source: ShowRecord): ShowRecordV2 {
    const byCellId = Object.fromEntries(
      source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]]),
    )
    const converted = convertShowRecordV1ToV2(source, { byCellId })
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
    return converted.record
  }

  function buildFixtures(): ShowRecord[] {
    const base = (): ShowRecord => createDefaultShow('b', 'B', 1)
    const retimed = (): ShowRecord => updateShowBoundaryTransition(base(), 'transition-scene-1', { durationMs: 3000 })
    const dissolved = (): ShowRecord => updateShowBoundaryTransition(base(), 'transition-scene-1', { kind: 'dither', dissolveVariant: 'block', durationMs: 2500, blockSize: 4 })
    const scaled = (): ShowRecord => {
      const source = base()
      source.scenes[0].sampleTargets = { repeatScale: 1 }
      source.scenes[1].sampleTargets = { repeatScale: 2 }
      return source
    }
    return [base(), retimed(), dissolved(), scaled()]
  }

  it('matches v1 Apply then convert on Clips, Show End, Transitions, Layout and markers', () => {
    const items = buildShowToolkitPresentationCatalogue({ stageDimensions: 1 }).filter(item => item.kind === 'transition' && item.compatible)
    let compared = 0
    for (const source of buildFixtures()) {
      for (const item of items) {
        const presetIds = [undefined, ...(getShowToolkitFamily('transition', item.familyId)?.variants.find(variant => variant.id === item.variantId)?.presets?.map(preset => preset.id) ?? [])] as Array<string | undefined>
        for (const presetId of presetIds) {
          if (showTransitionChangesForPresentation(item, presetId).kind === 'cut') continue
          let v1Converted: ShowRecordV2
          try {
            const applied = replaceShowBoundaryTransition(source, 'transition-scene-1', item, presetId)
            v1Converted = convertWithStock(applied)
          } catch {
            continue
          }
          const record = convertWithStock(source)
          const plan = planShowV2BoundaryPaletteApply(record, 'transition-scene-1', showTransitionChangesForPresentation(item, presetId), () => 'unused')
          expect(plan.status).toBe('ready')
          if (plan.status !== 'ready') throw new Error('palette plan not ready')
          const edited = editShowTransitionV2(record, plan.intent)
          expect(['changed', 'unchanged']).toContain(edited.status)
          if (edited.status !== 'changed' && edited.status !== 'unchanged') throw new Error(JSON.stringify(edited))
          const actual = {
            clips: edited.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs]),
            showEndMs: edited.record.composition.showEndMs,
            transitions: canonicalize(edited.record.composition.transitions),
            occurrences: edited.record.composition.layoutOccurrences.map(occurrence => [occurrence.startMs, occurrence.durationMs]),
            markers: edited.record.composition.markers.map(marker => marker.timeMs),
            tracks: canonicalize(edited.record.composition.propertyTracks),
          }
          const expected = {
            clips: v1Converted.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs]),
            showEndMs: v1Converted.composition.showEndMs,
            transitions: canonicalize(v1Converted.composition.transitions),
            occurrences: v1Converted.composition.layoutOccurrences.map(occurrence => [occurrence.startMs, occurrence.durationMs]),
            markers: v1Converted.composition.markers.map(marker => marker.timeMs),
            tracks: canonicalize(v1Converted.composition.propertyTracks),
          }
          expect(actual).toEqual(expected)
          compared += 1
        }
      }
    }
    // Four fixtures times the nine compatible non-Cut 1D choices that convert.
    expect(compared).toBe(36)
  })

  it('refuses a duration-changing Fade choice that would pass over an unrelated Clip (RL08)', () => {
    const source = updateShowBoundaryTransition(createDefaultShow('b', 'B', 1), 'transition-scene-1', { durationMs: 3000 })
    const record = convertWithStock(source)
    const boundary = record.composition.transitions.find(transition => transition.id === 'transition-scene-1')!
    expect(boundary.wholeOutput).toBeUndefined()
    const outgoing = record.composition.clips.find(clip => clip.id === boundary.participants[0].fromClipId)!
    const windowStartMs = outgoing.startMs + outgoing.durationMs
    const zoneId = boundary.participants[0].zoneId
    const instance = record.composition.patternInstances.find(candidate => candidate.id === outgoing.instanceId)!
    record.composition.patternInstances.push({ ...structuredClone(instance), id: 'overlay-instance' })
    record.composition.layers.push({ id: 'overlay-layer', zoneId, name: 'Overlay', rank: Math.max(...record.composition.layers.map(layer => layer.rank)) + 1 })
    record.composition.clips.push({
      ...structuredClone(outgoing), id: 'overlay-span', instanceId: 'overlay-instance', layerId: 'overlay-layer',
      // Ending exactly at the 3000 ms window's end passes the repair's
      // straddle rule; after the 2000 ms retime it spans the new window.
      startMs: windowStartMs - 1000, durationMs: 1000 + boundary.durationMs,
      appearance: { keys: [{ ...structuredClone(outgoing.appearance.keys[0]), id: 'overlay-span-key', timeMs: windowStartMs - 1000 }] },
    })
    expect(validateShowRecordV2(record)).toEqual([])
    const fade = buildShowToolkitPresentationCatalogue({ stageDimensions: 1 })
      .find(item => item.kind === 'transition' && item.familyId === 'fade' && item.compatible)!
    const changes = showTransitionChangesForPresentation(fade)
    expect(changes.durationMs).not.toBe(boundary.durationMs)
    const plan = planShowV2BoundaryPaletteApply(record, 'transition-scene-1', changes, () => 'unused')
    if (plan.status !== 'ready') throw new Error(JSON.stringify(plan))
    expect(editShowTransitionV2(record, plan.intent)).toMatchObject({ status: 'refused', code: 'compiler-ineligible' })
    // The same Fade at the unchanged duration is refused the same way.
    const unchanged = planShowV2BoundaryPaletteApply(record, 'transition-scene-1', { ...changes, durationMs: boundary.durationMs }, () => 'unused')
    if (unchanged.status !== 'ready') throw new Error(JSON.stringify(unchanged))
    expect(editShowTransitionV2(record, unchanged.intent)).toMatchObject({ status: 'refused', code: 'compiler-ineligible' })
  })

  it('plans a Cut choice as Reset to Cut', () => {
    const record = convertWithStock(createDefaultShow('b', 'B', 1))
    expect(planShowV2BoundaryPaletteApply(record, 'transition-scene-1', { kind: 'cut' }, () => 'x')).toEqual(
      planShowV2TransitionReset(record, 'transition-scene-1', () => 'x'),
    )
  })
})
