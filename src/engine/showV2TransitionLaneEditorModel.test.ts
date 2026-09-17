import { describe, expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { projectShowTimelineV2 } from './showTimelineViewModelV2'
import {
  buildShowV2TransitionEditorModel,
  planShowV2TransitionEdit,
  showV2TransitionJunctionKey,
} from './showV2TransitionEditorModel'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'

/**
 * The derived Cut junctions and parameter edits the v2 editor route offers
 * (#1056 slice 4). A Cut is the absence of a Transition at exact adjacency, so
 * the surface addresses a junction by the view model's own identity.
 */
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

describe('v2 Transition lane editor model', () => {
  it('addresses each drawn derived Cut junction by the view model selection', () => {
    const record = cutShow()
    const junctions = projectShowTimelineV2(record).rows
      .flatMap(row => row.layers.flatMap(layer => layer.junctions))
      .filter(junction => junction.scope === 'derived-cut')
    expect(junctions).toHaveLength(1)

    const selection = junctions[0].selection
    if (selection.kind !== 'cut') throw new Error('derived Cut selection')
    const key = showV2TransitionJunctionKey(selection)

    expect(buildShowV2TransitionEditorModel(record, 2).junctions.map(junction => junction.key)).toContain(key)
    const plan = planShowV2TransitionEdit(record, {
      kind: 'insert', junctionKey: key, kindKey: 'transition:blend:crossfade', durationMs: 200, crossfadePolicy: 'live-live',
    }, () => 'fresh', 2)
    expect(plan.status).toBe('ready')
  })

  it('refuses a junction key that names no exact adjacency', () => {
    const record = cutShow()
    const gapped = structuredClone(record)
    const incoming = gapped.composition.clips.find(clip => clip.id === 'in')!
    incoming.startMs = 401
    incoming.appearance.keys.forEach(key => { key.timeMs += 1 })

    const key = showV2TransitionJunctionKey({
      zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'out', toClipId: 'in', atMs: 400,
    })

    expect(projectShowTimelineV2(gapped).rows.flatMap(row => row.layers.flatMap(layer => layer.junctions))).toEqual([])
    expect(planShowV2TransitionEdit(gapped, {
      kind: 'insert', junctionKey: key, kindKey: 'transition:blend:crossfade', durationMs: 200, crossfadePolicy: 'live-live',
    }, () => 'fresh', 2)).toMatchObject({ status: 'refused' })
  })

  it('changes one parameter while identity, endpoints, window and ramps stay exact', () => {
    const record = converted('wipe')
    const current = record.composition.transitions[0]
    expect(current).toMatchObject({ kind: 'wipe', wipeVariant: 'linear', feather: 0.15 })

    const plan = planShowV2TransitionEdit(record, {
      kind: 'parameter', transitionId: current.id, parameterId: 'feather', value: 0.5,
    }, () => { throw new Error('a parameter edit allocates no identity') }, 2)

    if (plan.status !== 'ready' || plan.intent.kind !== 'update-transition') throw new Error('parameter plan')
    expect(plan.intent.transition).toEqual({ ...current, feather: 0.5 })
    const applied = editShowTransitionV2(record, plan.intent)
    expect(applied).toMatchObject({ status: 'changed', affectedClipIds: [], affectedTransitionIds: [current.id] })
    if (applied.status !== 'changed') return
    expect(applied.record.composition.clips).toEqual(record.composition.clips)
    expect(applied.record.composition.transitions[0]).toMatchObject({ id: current.id, kind: 'wipe', feather: 0.5 })
    expect(validateShowRecordV2(applied.record)).toEqual([])
  })

  it('refuses duration, unknown parameters and an unknown Transition through the parameter surface', () => {
    const record = converted('wipe')
    const id = record.composition.transitions[0].id
    const plan = (parameterId: string, transitionId = id) => planShowV2TransitionEdit(
      record, { kind: 'parameter', transitionId, parameterId, value: 1 }, () => 'unused', 2,
    )

    // Duration is the resize owner's, which ripples the downstream affected set.
    expect(plan('durationMs')).toMatchObject({ status: 'refused', message: expect.stringContaining('duration') })
    expect(plan('notAParameter')).toMatchObject({ status: 'refused' })
    expect(plan('feather', 'absent')).toMatchObject({ status: 'refused' })
  })

  it('offers every catalogue kind so a bounded compiler restriction refuses with its own message', () => {
    const record = cutShow()
    record.composition.showEndMs = 1_500
    record.composition.layoutOccurrences[0].durationMs = 1_500
    const overlay = record.composition.layers.find(layer => layer.rank === 1)!
    const spanning = structuredClone(record.composition.clips.find(clip => clip.id === 'out')!)
    Object.assign(spanning, { id: 'spanning', layerId: overlay.id, startMs: 0, durationMs: 1_500 })
    spanning.appearance.keys = [{ ...structuredClone(spanning.appearance.keys[0]), id: 'spanning:1', timeMs: 0 }]
    record.composition.clips.push(spanning)
    expect(validateShowRecordV2(record)).toEqual([])

    const model = buildShowV2TransitionEditorModel(record, 2)
    expect(model.kinds.map(kind => kind.key)).toEqual(expect.arrayContaining([
      'transition:fade:through-color', 'transition:motion:cover',
    ]))
    const junctionKey = model.junctions.find(junction => junction.scope === 'participant')!.key

    const plan = planShowV2TransitionEdit(record, {
      kind: 'insert', junctionKey, kindKey: 'transition:fade:through-color', durationMs: 200, crossfadePolicy: 'live-live',
    }, () => 'fade-1', 2)
    if (plan.status !== 'ready') throw new Error(plan.message)
    const applied = editShowTransitionV2(record, plan.intent)

    expect(applied).toMatchObject({ status: 'refused', code: 'compiler-ineligible', message: expect.stringContaining('RL08') })
    expect(applied.record).toBe(record)
  })
})
