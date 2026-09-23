import { describe, expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { projectShowEditorInspectorPresentationV2 } from './showEditorInspectorPresentation'
import {
  applyShowGroupPropertyAnimationChange,
  type ShowPropertyAnimationChange,
} from './showPropertyAnimationEditorModel'
import { editShowPropertyV2 } from './showPropertyEditsV2'
import { planShowV2GroupPropertyAnimationChange } from './showV2PropertyAnimationPlanning'
import type { ShowRecord } from './personalContentRecords'

function fixedIds(): () => string {
  let count = 0
  return () => `new-${(count += 1)}`
}

function g4aV1Before(withTrack = false): ShowRecord {
  const source = convertibleV1Show()
  source.scenes[0].durationMs = 30000
  source.composition!.durationMs = 30000
  source.composition!.scenes[0].zones[0].overlays = [{ id: 'ov1', name: 'ov', placements: [] }]
  const inst = { ...structuredClone(source.composition!.patternInstances[0]), id: 'g-inst' }
  source.composition!.groupDefinitions = [{
    id: 'def-1',
    name: 'D',
    patternInstances: [inst],
    placements: [
      { id: 'g-a', instanceId: 'g-inst', layerOffset: 0, startMs: 0, durationMs: 4000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
      { id: 'g-b', instanceId: 'g-inst', layerOffset: 0, startMs: 4000, durationMs: 3000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
    ],
    ...(withTrack ? {
      propertyTracks: [{
        id: 'trk',
        target: { kind: 'placement-opacity', placementId: 'g-b' },
        keyframes: [
          { id: 'k1', timeMs: 4000, value: 0.2, easing: { curve: 'linear' } },
          { id: 'k2', timeMs: 4500, value: 0.8, easing: { curve: 'linear' } },
        ],
      }],
    } : {}),
  }]
  source.composition!.groupOccurrences = [
    { id: 'occ-1', definitionId: 'def-1', sceneId: 'scene-a', zoneId: 'zone', startMs: 0, baseLayer: 1, translationX: 0, translationY: 0 },
    { id: 'occ-2', definitionId: 'def-1', sceneId: 'scene-a', zoneId: 'zone', startMs: 10000, baseLayer: 1, translationX: 0, translationY: 0 },
  ]
  return source
}

function g4aV2Before(withTrack: boolean): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(g4aV1Before(withTrack))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

function definitionTracks(record: ShowRecordV2) {
  return record.composition.groupDefinitions[0].propertyTracks
}

/** v1 write then convert, compared against the new planner plus the property owner. */
function checkGroupOracle(options: { withTrack: boolean; change: ShowPropertyAnimationChange }): void {
  const v1before = g4aV1Before(options.withTrack)
  const v1next = applyShowGroupPropertyAnimationChange(
    v1before,
    v1before.composition!,
    { kind: 'group', definitionId: 'def-1', occurrenceId: 'occ-1' },
    structuredClone(options.change),
    fixedIds(),
  )
  const v1converted = convertShowRecordV1ToV2({ ...v1before, composition: v1next })
  if (v1converted.status !== 'converted') throw new Error(JSON.stringify(v1converted.issues))
  expect(validateShowRecordV2(v1converted.record)).toEqual([])

  const v2before = g4aV2Before(options.withTrack)
  const plan = planShowV2GroupPropertyAnimationChange(v2before, 'occ-1', 'g-b', structuredClone(options.change), fixedIds())
  let v2tracks: ShowRecordV2['composition']['groupDefinitions'][number]['propertyTracks']
  if (plan.kind === 'edit') {
    expect(plan.propertyOwner).toEqual({ kind: 'group-definition', definitionId: 'def-1' })
    const applied = editShowPropertyV2(v2before, plan.propertyOwner, plan.intent)
    expect(applied.status).toBe('changed')
    if (applied.status !== 'changed') throw new Error(applied.status === 'refused' ? applied.message : applied.status)
    expect(validateShowRecordV2(applied.record)).toEqual([])
    v2tracks = definitionTracks(applied.record)
  } else {
    expect(plan.kind).toBe('no-op')
    v2tracks = definitionTracks(v2before)
  }
  expect(v2tracks).toEqual(definitionTracks(v1converted.record))
}

describe('group-child property animation oracle (#1075 G3)', () => {
  it('matches v1-then-convert for add-track with explicit keys', () => {
    checkGroupOracle({
      withTrack: false,
      change: {
        kind: 'add-track',
        target: { kind: 'placement-opacity', placementId: 'g-b' },
        initialValue: 1,
        keyframes: [
          { timeMs: 4000, value: 0.2, easing: { curve: 'linear' } },
          { timeMs: 4500, value: 0.8, easing: { curve: 'linear' } },
        ],
      },
    })
  })

  it('matches v1-then-convert for add-keyframe', () => {
    checkGroupOracle({
      withTrack: true,
      change: {
        kind: 'add-keyframe',
        trackId: 'trk',
        keyframe: { timeMs: 4250, value: 0.5, easing: { curve: 'linear' } },
      },
    })
  })

  it('matches v1-then-convert for a key move', () => {
    checkGroupOracle({
      withTrack: true,
      change: { kind: 'update-keyframe', trackId: 'trk', keyframeId: 'k2', changes: { timeMs: 4600 } },
    })
  })

  it('matches v1-then-convert for a value change', () => {
    checkGroupOracle({
      withTrack: true,
      change: { kind: 'update-keyframe', trackId: 'trk', keyframeId: 'k2', changes: { value: 0.9 } },
    })
  })

  it('matches v1-then-convert for a curve change', () => {
    checkGroupOracle({
      withTrack: true,
      change: {
        kind: 'update-keyframe',
        trackId: 'trk',
        keyframeId: 'k2',
        changes: { easing: { curve: 'quadratic', direction: 'in-out' } },
      },
    })
  })

  it('matches v1-then-convert for a refused delete-keyframe on a two-key track', () => {
    checkGroupOracle({
      withTrack: true,
      change: { kind: 'delete-keyframe', trackId: 'trk', keyframeId: 'k1' },
    })
  })

  it('matches v1-then-convert for delete-track', () => {
    checkGroupOracle({ withTrack: true, change: { kind: 'delete-track', trackId: 'trk' } })
  })
})

describe('group-child property animation refusals (#1075 G3)', () => {
  it('refuses an unknown occurrence or definition as a missing group occurrence', () => {
    const record = g4aV2Before(false)
    expect(planShowV2GroupPropertyAnimationChange(record, 'nope', 'g-b', {
      kind: 'add-track',
      target: { kind: 'placement-opacity', placementId: 'g-b' },
      initialValue: 1,
    }, fixedIds())).toEqual({
      kind: 'refuse',
      code: 'missing-clip',
      message: 'Group occurrence "nope" does not exist.',
    })
    const orphan = structuredClone(record)
    orphan.composition.groupOccurrences[0].definitionId = 'missing-definition'
    expect(planShowV2GroupPropertyAnimationChange(orphan, 'occ-1', 'g-b', {
      kind: 'add-track',
      target: { kind: 'placement-opacity', placementId: 'g-b' },
      initialValue: 1,
    }, fixedIds())).toEqual({
      kind: 'refuse',
      code: 'missing-clip',
      message: 'Group occurrence "occ-1" does not exist.',
    })
  })

  it('refuses an unknown clip and a foreign track with the existing messages', () => {
    const record = g4aV2Before(true)
    expect(planShowV2GroupPropertyAnimationChange(record, 'occ-1', 'missing', {
      kind: 'delete-track',
      trackId: 'trk',
    }, fixedIds())).toEqual({
      kind: 'refuse',
      code: 'missing-clip',
      message: 'Clip "missing" does not exist.',
    })
    expect(planShowV2GroupPropertyAnimationChange(record, 'occ-1', 'g-b', {
      kind: 'delete-track',
      trackId: 'nope',
    }, fixedIds())).toEqual({
      kind: 'refuse',
      code: 'missing-track',
      message: 'Track "nope" does not belong to Clip "g-b".',
    })
  })
})

describe('group-child property animation materialization (#1075 G3)', () => {
  function stockLookup(record: ShowRecordV2) {
    return {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(record.composition.patternInstances.map(instance => [instance.id, DEMOS[resolveStockPatternId((instance.pattern as { id: string }).id)]])),
      stageDimension: 2 as const,
    }
  }

  it('fans an added track out to both occurrences and prepares ready', () => {
    const before = g4aV2Before(false)
    const plan = planShowV2GroupPropertyAnimationChange(before, 'occ-1', 'g-b', {
      kind: 'add-track',
      target: { kind: 'placement-opacity', placementId: 'g-b' },
      initialValue: 1,
      keyframes: [
        { timeMs: 4000, value: 0.2, easing: { curve: 'linear' } },
        { timeMs: 4500, value: 0.8, easing: { curve: 'linear' } },
      ],
    }, fixedIds())
    if (plan.kind !== 'edit') throw new Error(`expected edit, got ${plan.kind}`)
    const intent = plan.intent
    expect(intent.kind).toBe('add-track')
    if (intent.kind !== 'add-track') throw new Error('expected add-track')
    expect([intent.track.activeStartMs, intent.track.activeDurationMs]).toEqual([0, 7000])
    const applied = editShowPropertyV2(before, plan.propertyOwner, intent)
    if (applied.status !== 'changed') throw new Error('expected changed')
    const materialized = materializeShowGroupsV2(applied.record)
    const occurrences = materialized.composition.propertyTracks.filter(track => track.id.endsWith(`:${intent.track.id}`))
    expect(occurrences.map(track => track.id).sort()).toEqual([`occ-1:${intent.track.id}`, `occ-2:${intent.track.id}`])
    expect(occurrences.find(track => track.id.startsWith('occ-1'))!.keyframes.map(key => key.timeMs)).toEqual([4000, 4500])
    expect(occurrences.find(track => track.id.startsWith('occ-2'))!.keyframes.map(key => key.timeMs)).toEqual([14000, 14500])
    const prepared = prepareShowV2ForCompile(applied.record, stockLookup(materialized), { libraries: LIBRARIES })
    expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : '')).toBe('ready')
  })
})

describe('group-child property animation hold inversion (#1075 G3)', () => {
  function heldRecordWithKeys(localTimes: number[]): ShowRecordV2 {
    const record = propertyEditGroupRecord()
    record.composition.groupDefinitions[0].propertyTracks = [{
      id: 'held-track',
      target: { kind: 'clip-opacity', clipId: 'child' },
      activeStartMs: 0,
      activeDurationMs: 400,
      keyframes: localTimes.map((timeMs, index) => ({ id: `hk-${index}`, timeMs, value: 0.5, easing: { curve: 'linear' as const } })),
    }]
    return record
  }

  it('returns the stored local time for every editor time the held fixture presents', () => {
    const stored = [0, 150, 200, 250, 400]
    const record = heldRecordWithKeys(stored)
    const presented = projectShowEditorInspectorPresentationV2(record, 0)
    const editorKeys = presented!.groupsByOccurrenceId['occ-0']!.clipsById['child']!.animation.tracks[0]!.editor.keyframes
    expect(editorKeys.map(key => key.timeMs)).toEqual([0, 150, 300, 350, 500])
    for (const [index, editorKey] of editorKeys.entries()) {
      const plan = planShowV2GroupPropertyAnimationChange(record, 'occ-0', 'child', {
        kind: 'update-keyframe',
        trackId: 'held-track',
        keyframeId: editorKey.id,
        changes: { timeMs: editorKey.timeMs },
      }, fixedIds())
      expect(plan).toEqual({
        kind: 'edit',
        propertyOwner: { kind: 'group-definition', definitionId: 'definition' },
        intent: { kind: 'update-key', trackId: 'held-track', keyId: editorKey.id, patch: { timeMs: stored[index] } },
      })
    }
  })

  it('stores the default end key at the definition extent on a held occurrence (#1075 G3 corrective)', () => {
    const record = propertyEditGroupRecord()
    const plan = planShowV2GroupPropertyAnimationChange(record, 'occ-0', 'child', {
      kind: 'add-track',
      target: { kind: 'placement-opacity', placementId: 'child' },
      initialValue: 0.5,
    }, fixedIds())
    if (plan.kind !== 'edit') throw new Error(`expected edit, got ${plan.kind}`)
    expect(plan.intent.kind).toBe('add-track')
    if (plan.intent.kind !== 'add-track') throw new Error('expected add-track')
    expect(plan.intent.track.keyframes.map(key => key.timeMs)).toEqual([0, 400])
  })
})
