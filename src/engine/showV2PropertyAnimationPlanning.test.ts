import { describe, expect, it } from 'vitest'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { addShowPropertyTrack } from './showPropertyAnimation'
import { projectShowEditorInspectorPresentationV2 } from './showEditorInspectorPresentation'
import {
  planShowV2PropertyAnimationChange,
  type ShowV2PropertyAnimationFrame,
} from './showV2PropertyAnimationPlanning'
import { editShowPropertyV2 } from './showPropertyEditsV2'
import type { ShowPropertyAnimationChange } from './showPropertyAnimationEditorModel'
import type { ShowRecord } from './personalContentRecords'

function newIds(): () => string {
  let count = 0
  return () => `id-${(count += 1)}`
}

const FRAME: ShowV2PropertyAnimationFrame = { showTimeOffsetMs: 2000, storageDurationMs: 3000 }

/** convertibleV1Show's single Clip shifted to 2000-5000 so editor and record times differ. */
function offsetRecord(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  const clip = record.composition.clips.find(candidate => candidate.id === 'clip')
  if (!clip) throw new Error('expected clip')
  clip.startMs = 2000
  clip.durationMs = 3000
  for (const key of clip.appearance.keys) key.timeMs += 2000
  record.composition.showEndMs = 8000
  for (const occurrence of record.composition.layoutOccurrences) occurrence.durationMs = 8000
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function boundaryRecord(): ShowRecordV2 {
  const record = offsetRecord()
  const clip = record.composition.clips.find(candidate => candidate.id === 'clip')
  if (!clip) throw new Error('expected clip')
  const firstKey = clip.appearance.keys[0]
  if (!firstKey) throw new Error('expected appearance key')
  const prev = structuredClone(clip)
  prev.id = 'prev'
  prev.startMs = 0
  prev.durationMs = 1000
  prev.appearance.keys = [{ ...structuredClone(firstKey), id: 'prev-key', timeMs: 0 }]
  const next = structuredClone(clip)
  next.id = 'next'
  next.startMs = 5500
  next.durationMs = 1500
  next.appearance.keys = [{ ...structuredClone(firstKey), id: 'next-key', timeMs: 5500 }]
  record.composition.clips.push(prev, next)
  record.composition.transitions.push(
    {
      id: 'in-boundary',
      kind: 'crossfade',
      durationMs: 1000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
      origin: 'converted-boundary-transition',
      wholeOutput: { startMs: 1000, fromClipIds: ['prev'], toClipIds: ['clip'] },
      participants: [],
      propertyRamps: [],
    },
    {
      id: 'out-boundary',
      kind: 'crossfade',
      durationMs: 500,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
      origin: 'converted-boundary-transition',
      wholeOutput: { startMs: 5000, fromClipIds: ['clip'], toClipIds: ['next'] },
      participants: [],
      propertyRamps: [],
    },
  )
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function layerTransitionRecord(): ShowRecordV2 {
  const record = boundaryRecord()
  for (const transition of record.composition.transitions) {
    if (transition.id === 'in-boundary') {
      delete transition.wholeOutput
      transition.origin = 'converted-layer-transition'
      transition.participants = [{
        id: 'in-boundary:p1',
        zoneId: 'zone',
        layerId: 'layer:zone:main',
        fromClipId: 'prev',
        toClipId: 'clip',
      }]
    }
    if (transition.id === 'out-boundary') {
      delete transition.wholeOutput
      transition.origin = 'converted-layer-transition'
      transition.participants = [{
        id: 'out-boundary:p1',
        zoneId: 'zone',
        layerId: 'layer:zone:main',
        fromClipId: 'clip',
        toClipId: 'next',
      }]
    }
  }
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function trackedRecord(): ShowRecordV2 {
  const record = offsetRecord()
  record.composition.propertyTracks.push({
    id: 't1',
    target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
    activeStartMs: 2000,
    activeDurationMs: 3000,
    keyframes: [
      { id: 'k1', timeMs: 2000, value: 0.2, easing: { curve: 'linear' } },
      { id: 'k2', timeMs: 5000, value: 0.8, easing: { curve: 'linear' } },
    ],
  })
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

it('adds a clip track with default keys converted to record time', () => {
  const plan = planShowV2PropertyAnimationChange(offsetRecord(), 'clip', FRAME, {
    kind: 'add-track',
    target: { kind: 'placement-view', placementId: 'clip', property: 'brightness' },
    initialValue: 0.8,
  }, newIds())
  expect(plan).toEqual({
    kind: 'edit',
    propertyOwner: { kind: 'show' },
    intent: {
      kind: 'add-track',
      track: {
        id: 'id-1',
        target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
        activeStartMs: 2000,
        activeDurationMs: 3000,
        keyframes: [
          { id: 'id-2', timeMs: 2000, value: 0.8, easing: { curve: 'linear' } },
          { id: 'id-3', timeMs: 5000, value: 0.8, easing: { curve: 'linear' } },
        ],
      },
    },
  })
})

it('rounds supplied add-track keyframe times into record time', () => {
  const plan = planShowV2PropertyAnimationChange(offsetRecord(), 'clip', FRAME, {
    kind: 'add-track',
    target: { kind: 'placement-opacity', placementId: 'clip' },
    initialValue: 1,
    keyframes: [
      { timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
      { timeMs: 1500.4, value: 0.9, easing: { curve: 'linear' } },
    ],
  }, newIds())
  if (plan.kind !== 'edit' || plan.intent.kind !== 'add-track') throw new Error('expected add-track')
  expect(plan.intent.track.keyframes.map(key => key.timeMs)).toEqual([2000, 3500])
})

it('widens clip-target activation across converted boundaries but not instance targets', () => {
  const record = boundaryRecord()
  const clipPlan = planShowV2PropertyAnimationChange(record, 'clip', FRAME, {
    kind: 'add-track',
    target: { kind: 'placement-view', placementId: 'clip', property: 'brightness' },
    initialValue: 1,
  }, newIds())
  if (clipPlan.kind !== 'edit' || clipPlan.intent.kind !== 'add-track') throw new Error('expected add-track')
  expect(clipPlan.intent.track.activeStartMs).toBe(1000)
  expect(clipPlan.intent.track.activeDurationMs).toBe(4500)

  const instancePlan = planShowV2PropertyAnimationChange(record, 'clip', FRAME, {
    kind: 'add-track',
    target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderSpeed' },
    initialValue: 0.5,
  }, newIds())
  if (instancePlan.kind !== 'edit' || instancePlan.intent.kind !== 'add-track') throw new Error('expected add-track')
  expect(instancePlan.intent.track.target).toEqual({ kind: 'instance-control', instanceId: 'instance', exportName: 'sliderSpeed' })
  expect(instancePlan.intent.track.activeStartMs).toBe(2000)
  expect(instancePlan.intent.track.activeDurationMs).toBe(3500)
})

it('ignores converted layer transitions when widening activation', () => {
  const plan = planShowV2PropertyAnimationChange(layerTransitionRecord(), 'clip', FRAME, {
    kind: 'add-track',
    target: { kind: 'placement-view', placementId: 'clip', property: 'brightness' },
    initialValue: 1,
  }, newIds())
  if (plan.kind !== 'edit' || plan.intent.kind !== 'add-track') throw new Error('expected add-track')
  expect(plan.intent.track.activeStartMs).toBe(2000)
  expect(plan.intent.track.activeDurationMs).toBe(3000)
})

it('refuses an add-track whose target belongs to another clip or instance', () => {
  const record = offsetRecord()
  expect(planShowV2PropertyAnimationChange(record, 'clip', FRAME, {
    kind: 'add-track',
    target: { kind: 'placement-view', placementId: 'other', property: 'brightness' },
    initialValue: 1,
  }, newIds())).toEqual({
    kind: 'refuse',
    code: 'foreign-target',
    message: 'Target placement "other" does not belong to Clip "clip".',
  })
  expect(planShowV2PropertyAnimationChange(record, 'clip', FRAME, {
    kind: 'add-track',
    target: { kind: 'instance-control', instanceId: 'other-instance', exportName: 'sliderSpeed' },
    initialValue: 0.5,
  }, newIds())).toEqual({
    kind: 'refuse',
    code: 'foreign-target',
    message: 'Target instance "other-instance" does not belong to Clip "clip".',
  })
})

it('converts update-keyframe times and no-ops an empty patch', () => {
  const record = trackedRecord()
  const timed = planShowV2PropertyAnimationChange(record, 'clip', FRAME, {
    kind: 'update-keyframe',
    trackId: 't1',
    keyframeId: 'k2',
    changes: { timeMs: 700.6 },
  }, newIds())
  expect(timed).toEqual({
    kind: 'edit',
    propertyOwner: { kind: 'show' },
    intent: { kind: 'update-key', trackId: 't1', keyId: 'k2', patch: { timeMs: 2701 } },
  })
  expect(planShowV2PropertyAnimationChange(record, 'clip', FRAME, {
    kind: 'update-keyframe',
    trackId: 't1',
    keyframeId: 'k2',
    changes: {},
  }, newIds())).toEqual({ kind: 'no-op' })
  const valued = planShowV2PropertyAnimationChange(record, 'clip', FRAME, {
    kind: 'update-keyframe',
    trackId: 't1',
    keyframeId: 'k2',
    changes: { value: 0.3 },
  }, newIds())
  expect(valued).toEqual({
    kind: 'edit',
    propertyOwner: { kind: 'show' },
    intent: { kind: 'update-key', trackId: 't1', keyId: 'k2', patch: { value: 0.3 } },
  })
})

it('no-ops a delete-keyframe on a two-key track but removes from a three-key track', () => {
  const record = trackedRecord()
  expect(planShowV2PropertyAnimationChange(record, 'clip', FRAME, {
    kind: 'delete-keyframe',
    trackId: 't1',
    keyframeId: 'k1',
  }, newIds())).toEqual({ kind: 'no-op' })

  const threeKey = trackedRecord()
  threeKey.composition.propertyTracks[0].keyframes.splice(1, 0, { id: 'k3', timeMs: 3500, value: 0.5, easing: { curve: 'linear' } })
  expect(validateShowRecordV2(threeKey)).toEqual([])
  expect(planShowV2PropertyAnimationChange(threeKey, 'clip', FRAME, {
    kind: 'delete-keyframe',
    trackId: 't1',
    keyframeId: 'k3',
  }, newIds())).toEqual({
    kind: 'edit',
    propertyOwner: { kind: 'show' },
    intent: { kind: 'remove-key', trackId: 't1', keyId: 'k3' },
  })
})

it('refuses track edits against another clip or an unknown track', () => {
  const record = trackedRecord()
  const other = structuredClone(record.composition.clips.find(candidate => candidate.id === 'clip'))
  if (!other) throw new Error('expected clip')
  other.id = 'other-clip'
  other.startMs = 5500
  other.durationMs = 1500
  for (const key of other.appearance.keys) key.timeMs += 3500
  record.composition.clips.push(other)
  record.composition.propertyTracks.push({
    id: 't-other',
    target: { kind: 'clip-view', clipId: 'other-clip', property: 'brightness' },
    activeStartMs: 5500,
    activeDurationMs: 1500,
    keyframes: [
      { id: 'o1', timeMs: 5500, value: 0.2, easing: { curve: 'linear' } },
      { id: 'o2', timeMs: 7000, value: 0.8, easing: { curve: 'linear' } },
    ],
  })
  expect(validateShowRecordV2(record)).toEqual([])
  const change: ShowPropertyAnimationChange = { kind: 'delete-track', trackId: 't-other' }
  expect(planShowV2PropertyAnimationChange(record, 'clip', FRAME, change, newIds())).toEqual({
    kind: 'refuse',
    code: 'missing-track',
    message: 'Track "t-other" does not belong to Clip "clip".',
  })
  expect(planShowV2PropertyAnimationChange(record, 'clip', FRAME, { kind: 'delete-track', trackId: 'nope' }, newIds())).toEqual({
    kind: 'refuse',
    code: 'missing-track',
    message: 'Track "nope" does not belong to Clip "clip".',
  })
  expect(planShowV2PropertyAnimationChange(record, 'missing', FRAME, change, newIds())).toEqual({
    kind: 'refuse',
    code: 'missing-clip',
    message: 'Clip "missing" does not exist.',
  })
})

it('round-trips every edit plan through the property owner', () => {
  const clean = offsetRecord()
  const cleanPlan = planShowV2PropertyAnimationChange(clean, 'clip', FRAME, {
    kind: 'add-track',
    target: { kind: 'placement-view', placementId: 'clip', property: 'brightness' },
    initialValue: 0.8,
  }, newIds())
  if (cleanPlan.kind !== 'edit') throw new Error('expected edit')
  const cleanResult = editShowPropertyV2(clean, cleanPlan.propertyOwner, cleanPlan.intent)
  expect(cleanResult.status).toBe('changed')
  if (cleanResult.status !== 'changed') throw new Error(cleanResult.status === 'refused' ? cleanResult.message : cleanResult.status)
  expect(validateShowRecordV2(cleanResult.record)).toEqual([])

  const record = boundaryRecord()
  record.composition.propertyTracks.push({
    id: 't1',
    target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
    activeStartMs: 2000,
    activeDurationMs: 3000,
    keyframes: [
      { id: 'k1', timeMs: 2000, value: 0.2, easing: { curve: 'linear' } },
      { id: 'k3', timeMs: 3500, value: 0.5, easing: { curve: 'linear' } },
      { id: 'k2', timeMs: 5000, value: 0.8, easing: { curve: 'linear' } },
    ],
  })
  expect(validateShowRecordV2(record)).toEqual([])
  const changes: ShowPropertyAnimationChange[] = [
    {
      kind: 'add-track',
      target: { kind: 'placement-view', placementId: 'clip', property: 'brightness' },
      initialValue: 1,
    },
    {
      kind: 'add-track',
      target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderSpeed' },
      initialValue: 0.5,
    },
    { kind: 'update-keyframe', trackId: 't1', keyframeId: 'k2', changes: { timeMs: 700.6 } },
    { kind: 'delete-keyframe', trackId: 't1', keyframeId: 'k3' },
  ]
  let current = record
  const fresh = newIds()
  for (const change of changes) {
    const plan = planShowV2PropertyAnimationChange(current, 'clip', FRAME, change, fresh)
    if (plan.kind !== 'edit') throw new Error(`expected edit for ${change.kind}`)
    const result = editShowPropertyV2(current, plan.propertyOwner, plan.intent)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') throw new Error(result.status === 'refused' ? result.message : result.status)
    expect(validateShowRecordV2(result.record)).toEqual([])
    current = result.record
  }
})

describe('matches v1 then convert', () => {
  function singleSceneShow(): ShowRecord {
    const show = convertibleV1Show()
    show.composition!.patternInstances[0].controlTargets = { gain: 0.5 }
    return show
  }

  function twoSceneBoundaryShow(): ShowRecord {
    const show = transitionV1Show('crossfade')
    const composition = show.composition!
    const [out, incoming] = composition.scenes[0].zones[0].main
    show.scenes = [
      { id: 'scene-a', name: 'Outgoing', durationMs: 3000 },
      { id: 'scene-b', name: 'Incoming', durationMs: 3000 },
    ]
    composition.scenes = [
      { sceneId: 'scene-a', zones: [{ zoneId: 'zone', main: [{ ...out, startMs: 0, durationMs: 3000 }], overlays: [] }] },
      { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: [{ ...incoming, startMs: 0, durationMs: 3000 }], overlays: [] }] },
    ]
    const { fromPlacementId: _from, toPlacementId: _to, ...settings } = composition.transitions![0]
    show.transitions = [{ ...settings, afterSceneId: 'scene-a', durationMs: 1000 }]
    composition.durationMs = 7000
    delete composition.transitions
    composition.patternInstances.find(instance => instance.id === 'in-instance')!.controlTargets = { gain: 0.5 }
    return show
  }

  function trackShape(track: ShowRecordV2['composition']['propertyTracks'][number]) {
    return {
      target: track.target,
      activeStartMs: track.activeStartMs,
      activeDurationMs: track.activeDurationMs,
      keyframes: track.keyframes.map(key => ({ timeMs: key.timeMs, value: key.value, easing: key.easing })),
    }
  }

  function checkOracle(options: {
    show: ShowRecord
    sceneId: string
    sceneDurationMs: number
    placementId: string
    instanceId: string
    clipStartMs: number
    target: Extract<ShowPropertyAnimationChange, { kind: 'add-track' }>['target']
    initialValue: number
  }): void {
    const { show, sceneId, sceneDurationMs, clipStartMs, target, initialValue } = options
    const keyframes = [
      { id: 'v1-k1', timeMs: 0, value: initialValue, easing: { curve: 'linear' as const } },
      { id: 'v1-k2', timeMs: sceneDurationMs, value: initialValue, easing: { curve: 'linear' as const } },
    ]
    const v1Composition = addShowPropertyTrack(show, show.composition!, sceneId, { id: 'v1-track', target, keyframes })
    expect(v1Composition.scenes.find(scene => scene.sceneId === sceneId)?.propertyTracks).toHaveLength(1)
    const v1Converted = convertShowRecordV1ToV2({ ...show, composition: v1Composition })
    if (v1Converted.status !== 'converted') throw new Error(JSON.stringify(v1Converted.issues))
    expect(validateShowRecordV2(v1Converted.record)).toEqual([])
    expect(v1Converted.record.composition.propertyTracks).toHaveLength(1)

    const v2Converted = convertShowRecordV1ToV2(show)
    if (v2Converted.status !== 'converted') throw new Error(JSON.stringify(v2Converted.issues))
    const record = v2Converted.record
    const clip = record.composition.clips.find(candidate => candidate.startMs === clipStartMs)
    if (!clip) throw new Error(`no clip at ${clipStartMs}: ${JSON.stringify(record.composition.clips.map(candidate => candidate.startMs))}`)
    const animation = projectShowEditorInspectorPresentationV2(record, clip.startMs).clipsById[clip.id]?.animation
    if (!animation) throw new Error(`no presentation for ${clip.id}`)
    const change: ShowPropertyAnimationChange = {
      kind: 'add-track',
      target: structuredClone(target),
      initialValue,
      keyframes: keyframes.map(({ id: _id, ...keyframe }) => keyframe),
    }
    const plan = planShowV2PropertyAnimationChange(
      record,
      clip.id,
      { showTimeOffsetMs: animation.showTimeOffsetMs, storageDurationMs: animation.storageDurationMs },
      change,
      newIds(),
    )
    if (plan.kind !== 'edit' || plan.intent.kind !== 'add-track') throw new Error(`expected add-track, got ${JSON.stringify(plan)}`)
    const applied = editShowPropertyV2(record, plan.propertyOwner, plan.intent)
    expect(applied.status).toBe('changed')
    if (applied.status !== 'changed') throw new Error(applied.status === 'refused' ? applied.message : applied.status)
    expect(validateShowRecordV2(applied.record)).toEqual([])
    expect(applied.record.composition.propertyTracks).toHaveLength(1)
    expect(trackShape(applied.record.composition.propertyTracks[0])).toEqual(
      trackShape(v1Converted.record.composition.propertyTracks[0]),
    )
  }

  it('matches a brightness track on a single scene', () => {
    checkOracle({
      show: singleSceneShow(),
      sceneId: 'scene-a',
      sceneDurationMs: 1000,
      placementId: 'clip',
      instanceId: 'instance',
      clipStartMs: 0,
      target: { kind: 'placement-view', placementId: 'clip', property: 'brightness' },
      initialValue: 1,
    })
  })

  it('matches an instance-control track on a single scene', () => {
    checkOracle({
      show: singleSceneShow(),
      sceneId: 'scene-a',
      sceneDurationMs: 1000,
      placementId: 'clip',
      instanceId: 'instance',
      clipStartMs: 0,
      target: { kind: 'instance-control', instanceId: 'instance', exportName: 'gain' },
      initialValue: 0.5,
    })
  })

  it('matches a brightness track on the second scene across a crossfade', () => {
    checkOracle({
      show: twoSceneBoundaryShow(),
      sceneId: 'scene-b',
      sceneDurationMs: 3000,
      placementId: 'in',
      instanceId: 'in-instance',
      clipStartMs: 4000,
      target: { kind: 'placement-view', placementId: 'in', property: 'brightness' },
      initialValue: 1,
    })
  })

  it('matches an instance-control track on the second scene across a crossfade', () => {
    checkOracle({
      show: twoSceneBoundaryShow(),
      sceneId: 'scene-b',
      sceneDurationMs: 3000,
      placementId: 'in',
      instanceId: 'in-instance',
      clipStartMs: 4000,
      target: { kind: 'instance-control', instanceId: 'in-instance', exportName: 'gain' },
      initialValue: 0.5,
    })
  })
})
