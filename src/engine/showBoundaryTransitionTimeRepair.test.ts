import { describe, expect, it } from 'vitest'
import type {
  ShowCompositionV1,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
  ShowRecord,
} from './personalContentRecords'
import { validateShowComposition } from './showCompositionModel'
import { applyShowCommand } from './showCommands/registry'
import { evaluateShowPropertyTrack } from './showPropertyAnimation'
import { createDefaultShow, projectShowTimeline, showLoopDurationMs } from './showModel'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import { removeShowBoundaryTransitionPreservingTime } from './showBoundaryTransitionTimeRepair'
import { deleteShowClipWithLayerTransitions } from './showLayerTransitionAuthoring'

const commandContext = {
  source: () => 'export function render(index) { hsv(0, 1, 1) }',
  libraries: {},
}

function starterDeletionFixture(): ShowRecord {
  const show = createDefaultShow('transition-time-repair', 'Transition time repair', 1)
  const instanceIds = ['starter-a', 'starter-b', 'overlay-a', 'overlay-b', 'overlay-c', 'overlay-d']
  const composition: ShowCompositionV1 = {
    version: 1,
    durationMs: 62_000,
    markers: [
      { id: 'before', timeMs: 1_000 },
      { id: 'inside', timeMs: 31_000 },
      { id: 'after', timeMs: 33_000 },
      { id: 'dormant', timeMs: 63_000 },
    ],
    patternInstances: instanceIds.map((id) => ({
      id: `instance-${id}`,
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: id,
      time: { timeScale: 1, timeOffsetMs: 0 },
    })),
    scenes: [
      {
        sceneId: 'scene-1',
        zones: [{
          zoneId: 'zone-1',
          main: [placement('starter-a', 0, 30_000)],
          overlays: ['a', 'b', 'c', 'd'].map((suffix) => ({
            id: `layer-${suffix}-scene-1`,
            name: `Layer ${suffix.toUpperCase()}`,
            placements: [{
              ...placement(`overlay-${suffix}`, 0, 30_000),
              opacity: 1,
            }],
          })),
        }],
      },
      {
        sceneId: 'scene-2',
        zones: [{
          zoneId: 'zone-1',
          main: [placement('starter-b', 0, 30_000)],
          overlays: ['a', 'b', 'c', 'd'].map((suffix) => ({
            id: `layer-${suffix}-scene-2`,
            name: `Layer ${suffix.toUpperCase()}`,
            placements: [],
          })),
        }],
      },
    ],
  }
  return { ...show, composition }
}

function placement(id: string, startMs: number, durationMs: number) {
  return {
    id,
    instanceId: `instance-${id}`,
    startMs,
    durationMs,
    view: { mirror: false, phase: 0, brightness: 1 },
  }
}

function propertyTrack(
  id: string,
  target: ShowPropertyAnimationTarget,
  firstTimeMs = 8_621,
  secondTimeMs = 9_621,
): ShowPropertyAnimationTrack {
  return {
    id,
    target,
    keyframes: [
      { id: `${id}-first`, timeMs: firstTimeMs, value: 0.2, easing: { curve: 'quadratic', direction: 'in-out' } },
      { id: `${id}-second`, timeMs: secondTimeMs, value: 0.8, easing: { curve: 'linear' } },
    ],
  }
}

function richTimelineFixture(): ShowRecord {
  const show = createDefaultShow('rich-time-repair', 'Rich time repair', 7)
  show.scenes = [
    { id: 'scene-1', name: 'Outgoing', durationMs: 30_000 },
    { id: 'scene-2', name: 'Destination', durationMs: 10_000 },
    { id: 'scene-3', name: 'Later empty section', durationMs: 20_000 },
  ]
  show.zones = [
    { id: 'zone-1', name: 'main', nominalPixelCount: 60 },
    { id: 'zone-2', name: 'other', nominalPixelCount: 20 },
  ]
  show.routingLayouts = [
    { id: 'layout-1', name: 'Default', zones: [] },
    { id: 'layout-2', name: 'Alternate', zones: [] },
  ]
  show.transitions = [
    {
      id: 'boundary-1', afterSceneId: 'scene-1', kind: 'crossfade', durationMs: 1_379,
      easing: { curve: 'quadratic', direction: 'out' }, crossfadePolicy: 'snapshot-live',
    },
    {
      id: 'route-1', afterSceneId: 'scene-1', kind: 'routing', durationMs: 0,
      easing: { curve: 'linear' }, layoutId: 'layout-2',
    },
    {
      id: 'boundary-2', afterSceneId: 'scene-2', kind: 'wipe', durationMs: 777,
      easing: { curve: 'linear' }, direction: 0, feather: 0.1,
    },
    {
      id: 'route-2', afterSceneId: 'scene-2', kind: 'routing', durationMs: 0,
      easing: { curve: 'linear' }, layoutId: 'layout-1',
    },
  ]
  show.composition = {
    version: 1,
    executionModel: 'deterministic-loop',
    durationMs: 70_000,
    markers: [
      { id: 'before', timeMs: 1_000 },
      { id: 'inside', timeMs: 30_500 },
      { id: 'after', timeMs: 40_500 },
      { id: 'beyond-end', timeMs: 71_000 },
    ],
    patternInstances: ['outgoing', 'destination', 'layer-from', 'layer-to', 'other-zone'].map((id, index) => ({
      id: `instance-${id}`,
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: id,
      time: { timeScale: 1 + index / 10, timeOffsetMs: 111 + index },
      ...(id === 'destination' ? { controlTargets: { sliderSpeed: 0.4 } } : {}),
    })),
    scenes: [
      {
        sceneId: 'scene-1',
        zones: [
          { zoneId: 'zone-1', main: [placement('outgoing', 0, 30_000)], overlays: [] },
          { zoneId: 'zone-2', main: [], overlays: [] },
        ],
      },
      {
        sceneId: 'scene-2',
        propertyTracks: [
          propertyTrack('track-time-scale', { kind: 'instance-time-scale', instanceId: 'instance-destination' }),
          propertyTrack('track-control', { kind: 'instance-control', instanceId: 'instance-destination', exportName: 'sliderSpeed' }),
          propertyTrack('track-opacity', { kind: 'placement-opacity', placementId: 'layer-from' }),
          propertyTrack('track-view', { kind: 'placement-view', placementId: 'destination', property: 'brightness' }),
          propertyTrack('track-transform', { kind: 'placement-transform', placementId: 'destination', property: 'positionX' }),
          propertyTrack('track-viewport', { kind: 'placement-viewport', placementId: 'destination', property: 'width' }),
          propertyTrack('track-effect', {
            kind: 'placement-effect', placementId: 'destination', effectId: 'opacity-fx', effectKind: 'opacity', parameterId: 'opacity',
          }),
        ],
        zones: [
          {
            zoneId: 'zone-1',
            main: [{
              ...placement('destination', 8_621, 1_000),
              transform: { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
              viewport: { enabled: true, x: 0, y: 0, width: 1, height: 1 },
              effects: [{ id: 'opacity-fx', kind: 'opacity', opacity: 0.6 }],
            }],
            overlays: [{
              id: 'destination-layer',
              name: 'Destination transition layer',
              placements: [
                { ...placement('layer-from', 1_000, 1_000), opacity: 0.7 },
                { ...placement('layer-to', 2_500, 1_000), opacity: 0.9 },
              ],
            }],
          },
          {
            zoneId: 'zone-2',
            main: [placement('other-zone', 5_000, 1_000)],
            overlays: [],
          },
        ],
      },
      {
        sceneId: 'scene-3',
        zones: [
          { zoneId: 'zone-1', main: [], overlays: [] },
          { zoneId: 'zone-2', main: [], overlays: [] },
        ],
      },
    ],
    transitions: [{
      id: 'layer-transition',
      fromPlacementId: 'layer-from',
      toPlacementId: 'layer-to',
      kind: 'crossfade',
      durationMs: 500,
      easing: { curve: 'quadratic', direction: 'in' },
      crossfadePolicy: 'snapshot-live',
    }],
    groupDefinitions: [{
      id: 'group-definition',
      name: 'Reusable group',
      patternInstances: [{
        id: 'group-instance', pattern: { kind: 'stock', id: 'Rings' }, patternName: 'group',
        time: { timeScale: 0.75, timeOffsetMs: 321 },
      }],
      placements: [{
        ...placement('group-placement', 0, 500),
        instanceId: 'group-instance',
        layerOffset: 0,
        opacity: 1,
      }],
      propertyTracks: [propertyTrack(
        'group-track',
        { kind: 'instance-time-scale', instanceId: 'group-instance' },
        0,
        500,
      )],
    }],
    groupOccurrences: [{
      id: 'group-occurrence', definitionId: 'group-definition', sceneId: 'scene-2', zoneId: 'zone-1',
      startMs: 3_000, baseLayer: 0, translationX: 0.1, translationY: -0.2,
    }],
  }
  return show
}

function removeClip(show: ShowRecord, clipId: string): ShowRecord {
  const owner = clipId === 'starter-a'
    ? { kind: 'main' as const, sceneId: 'scene-1', zoneId: 'zone-1', placementId: clipId }
    : { kind: 'main' as const, sceneId: 'scene-2', zoneId: 'zone-1', placementId: clipId }
  const composition = deleteShowClipWithLayerTransitions(show, show.composition!, owner)
  expect(composition).not.toBe(show.composition)
  return { ...show, composition }
}

function reproduceReservedBoundary(order: readonly string[]) {
  const input = starterDeletionFixture()
  const frozenInput = structuredClone(input)
  const result = order.reduce(removeClip, input)
  const timeline = projectShowTimeline(result)
  const clips = projectShowUnifiedTimeline(result, result.composition!).zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
    .map((clip) => ({ id: clip.id, startMs: clip.startMs, endMs: clip.endMs }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const insertion = applyShowCommand(result, 'create_clips', {
    schema_version: 1,
    clips: ['a', 'b', 'c', 'd'].map((suffix, layer) => ({
      zone_id: 'zone-1',
      layer,
      start_ms: 30_000,
      duration_ms: 30_000,
      pattern: { kind: 'stock', id: suffix === 'a' ? 'Rings' : 'CometLoom' },
    })),
  }, commandContext)
  return { input, frozenInput, result, timeline, clips, insertion }
}

describe('boundary Transition time-preservation reproduction (#1023)', () => {
  it.each([
    ['starter-a', 'starter-b'],
    ['starter-b', 'starter-a'],
  ])('reaches the invisible reserved interval after underlying composition removal order %j', (...order) => {
    const { input, frozenInput, result, timeline, clips, insertion } = reproduceReservedBoundary(order)

    expect(input).toEqual(frozenInput)
    expect(clips).toEqual(['a', 'b', 'c', 'd'].map((suffix) => ({
      id: `overlay-${suffix}`,
      startMs: 0,
      endMs: 30_000,
    })))
    expect(timeline.boundaryTransitions.map(({ id, kind, startMs, endMs }) => ({ id, kind, startMs, endMs })))
      .toEqual([{ id: 'transition-scene-1', kind: 'crossfade', startMs: 30_000, endMs: 32_000 }])
    expect(timeline.durationMs).toBe(62_000)
    expect(result.composition?.durationMs).toBe(62_000)
    expect(result.composition?.markers?.map((marker) => marker.timeMs)).toEqual([1_000, 31_000, 33_000, 63_000])
    expect(validateShowComposition(result, result.composition!)).toEqual([])
    expect(insertion).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'occupied' })] })
  })
})

describe('removeShowBoundaryTransitionPreservingTime', () => {
  it('turns the reproduced 2-second effect into ordinary authorable time without moving the surviving schedule', () => {
    const reproduced = reproduceReservedBoundary(['starter-a', 'starter-b']).result
    const before = structuredClone(reproduced)

    const outcome = removeShowBoundaryTransitionPreservingTime(reproduced, 'transition-scene-1')

    expect(outcome.status).toBe('applied')
    if (outcome.status !== 'applied') throw new Error(outcome.reason)
    expect(outcome).toMatchObject({
      transitionId: 'transition-scene-1',
      destinationSceneId: 'scene-2',
      boundaryStartMs: 30_000,
      removedDurationMs: 2_000,
    })
    expect(reproduced).toEqual(before)
    expect(outcome.record.updatedAt).toBe(reproduced.updatedAt)
    expect(outcome.record.scenes.map((scene) => scene.durationMs)).toEqual([30_000, 32_000])
    expect(outcome.record.transitions).toContainEqual({
      id: 'transition-scene-1',
      afterSceneId: 'scene-1',
      kind: 'cut',
      durationMs: 0,
      easing: { curve: 'linear' },
    })
    expect(projectShowTimeline(outcome.record).transitions).toEqual([])
    expect(projectShowTimeline(outcome.record).durationMs).toBe(62_000)
    expect(projectShowUnifiedTimeline(outcome.record, outcome.record.composition!).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .map((clip) => [clip.id, clip.startMs, clip.endMs])
      .sort(([left], [right]) => String(left).localeCompare(String(right))))
      .toEqual(['a', 'b', 'c', 'd'].map((suffix) => [`overlay-${suffix}`, 0, 30_000]))
    expect(outcome.record.composition?.durationMs).toBe(62_000)
    expect(outcome.record.composition?.markers).toEqual(reproduced.composition?.markers)
    expect(validateShowComposition(outcome.record, outcome.record.composition!)).toEqual([])

    const insertion = applyShowCommand(outcome.record, 'create_clips', {
      schema_version: 1,
      clips: ['a', 'b', 'c', 'd'].map((suffix, layer) => ({
        zone_id: 'zone-1',
        layer,
        start_ms: 30_000,
        duration_ms: 30_000,
        pattern: { kind: 'stock', id: suffix === 'a' ? 'Rings' : 'CometLoom' },
      })),
    }, commandContext)
    expect(insertion.ok, JSON.stringify(insertion)).toBe(true)
  })

  it('preserves global destination schedules across every Scene-local owner for a non-round duration', () => {
    const show = richTimelineFixture()
    const before = structuredClone(show)
    expect(validateShowComposition(show, show.composition!)).toEqual([])
    const beforeTimeline = projectShowTimeline(show)
    const beforeClips = projectShowUnifiedTimeline(show, show.composition!).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .map((clip) => [clip.id, clip.startMs, clip.endMs])
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
    const beforeGroup = projectShowUnifiedTimeline(show, show.composition!).zones
      .flatMap((zone) => zone.groups).find((group) => group.id === 'group-occurrence')
    const beforeTracks = show.composition!.scenes[1].propertyTracks!
    const beforeTrackValues = beforeTracks.map((track) => evaluateShowPropertyTrack(track, 9_121))
    const beforeInstanceTime = show.composition!.patternInstances.find((instance) => instance.id === 'instance-destination')!.time
    const beforeDefinition = show.composition!.groupDefinitions![0]

    const outcome = removeShowBoundaryTransitionPreservingTime(show, 'boundary-1')

    expect(outcome.status).toBe('applied')
    if (outcome.status !== 'applied') throw new Error(outcome.reason)
    const repaired = outcome.record
    const destination = repaired.composition!.scenes[1]
    const afterTimeline = projectShowTimeline(repaired)
    const afterClips = projectShowUnifiedTimeline(repaired, repaired.composition!).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .map((clip) => [clip.id, clip.startMs, clip.endMs])
      .sort(([left], [right]) => String(left).localeCompare(String(right)))

    expect(show).toEqual(before)
    expect(repaired.scenes.map((scene) => scene.durationMs)).toEqual([30_000, 11_379, 20_000])
    expect(destination.zones.flatMap((zone) => [
      ...zone.main,
      ...zone.overlays.flatMap((layer) => layer.placements),
    ]).map((candidate) => [candidate.id, candidate.startMs])).toEqual([
      ['destination', 10_000],
      ['layer-from', 2_379],
      ['layer-to', 3_879],
      ['other-zone', 6_379],
    ])
    expect(destination.propertyTracks?.every((track, index) => (
      track.keyframes.every((keyframe, keyIndex) => (
        keyframe.timeMs === beforeTracks[index].keyframes[keyIndex].timeMs + 1_379
      ))
    ))).toBe(true)
    expect(destination.propertyTracks?.map((track) => evaluateShowPropertyTrack(track, 10_500)))
      .toEqual(beforeTrackValues)
    expect(repaired.composition!.groupOccurrences![0]).toMatchObject({
      id: 'group-occurrence', startMs: 4_379, translationX: 0.1, translationY: -0.2,
    })
    expect(repaired.composition!.groupDefinitions![0]).toEqual(beforeDefinition)
    expect(repaired.composition!.patternInstances).toEqual(show.composition!.patternInstances)
    expect(repaired.composition!.patternInstances.find((instance) => instance.id === 'instance-destination')!.time)
      .toEqual(beforeInstanceTime)
    expect(repaired.composition!.transitions).toEqual(show.composition!.transitions)
    expect(destination.propertyTracks?.map((track) => ({
      ...track,
      keyframes: track.keyframes.map(({ timeMs: _timeMs, ...keyframe }) => keyframe),
    }))).toEqual(beforeTracks.map((track) => ({
      ...track,
      keyframes: track.keyframes.map(({ timeMs: _timeMs, ...keyframe }) => keyframe),
    })))
    expect(repaired.transitions.find((transition) => transition.id === 'boundary-1')).toEqual({
      id: 'boundary-1',
      afterSceneId: 'scene-1',
      kind: 'cut',
      durationMs: 0,
      easing: { curve: 'quadratic', direction: 'out' },
    })
    expect(afterClips).toEqual(beforeClips)
    expect(afterClips).toContainEqual(['destination', 40_000, 41_000])
    expect(projectShowUnifiedTimeline(repaired, repaired.composition!).zones
      .flatMap((zone) => zone.groups).find((group) => group.id === 'group-occurrence'))
      .toEqual(beforeGroup)
    expect(afterTimeline.boundaryTransitions.find((transition) => transition.id === 'boundary-2'))
      .toEqual(beforeTimeline.boundaryTransitions.find((transition) => transition.id === 'boundary-2'))
    expect(repaired.transitions.filter((transition) => transition.kind === 'routing'))
      .toEqual(show.transitions.filter((transition) => transition.kind === 'routing'))
    expect(repaired.composition!.durationMs).toBe(70_000)
    expect(showLoopDurationMs(repaired)).toBe(70_000)
    expect(repaired.composition!.markers).toEqual(show.composition!.markers)
    expect(repaired.composition!.executionModel).toBe('deterministic-loop')
    expect(validateShowComposition(repaired, repaired.composition!)).toEqual([])
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'refuses invalid visual duration %s atomically',
    (durationMs) => {
      const show = richTimelineFixture()
      show.transitions[0].durationMs = durationMs
      const before = structuredClone(show)

      const outcome = removeShowBoundaryTransitionPreservingTime(show, 'boundary-1')

      expect(outcome).toEqual({ status: 'refused', record: show, reason: 'invalid-duration' })
      expect(show).toEqual(before)
    },
  )

  it('refuses a Pattern instance shared across the removed boundary without changing the record', () => {
    const show = richTimelineFixture()
    show.composition!.scenes[0].zones[0].main[0].instanceId = 'instance-destination'
    const before = structuredClone(show)

    const outcome = removeShowBoundaryTransitionPreservingTime(show, 'boundary-1')

    expect(outcome).toMatchObject({
      status: 'refused',
      reason: 'cross-boundary-shared-instance',
      details: ['instance-destination'],
    })
    expect(outcome.record).toBe(show)
    expect(show).toEqual(before)

    const reusedLater = richTimelineFixture()
    reusedLater.composition!.scenes[2].zones[0].main = [placement('later-outgoing', 0, 1_000)]
    reusedLater.composition!.scenes[2].zones[0].main[0].instanceId = 'instance-outgoing'
    expect(removeShowBoundaryTransitionPreservingTime(reusedLater, 'boundary-1')).toMatchObject({
      status: 'refused',
      reason: 'cross-boundary-shared-instance',
      details: ['instance-outgoing'],
    })
  })

  it('refuses unsupported or malformed targets atomically and treats a repeated conversion as a no-op', () => {
    const propertyCarrier = richTimelineFixture()
    propertyCarrier.transitions[0].propertyTransitions = {
      timeScale: { fromByCellId: { destination: 0.5 } },
    }
    const invalidComposition = richTimelineFixture()
    invalidComposition.composition!.scenes[1].zones[0].main[0].instanceId = 'missing-instance'
    const ambiguous = richTimelineFixture()
    ambiguous.transitions.push({ ...structuredClone(ambiguous.transitions[0]) })
    const ambiguousVisualBoundary = richTimelineFixture()
    ambiguousVisualBoundary.transitions.push({
      ...structuredClone(ambiguousVisualBoundary.transitions[0]),
      id: 'boundary-1-sibling',
    })
    const routing = richTimelineFixture()
    const missingComposition = richTimelineFixture()
    delete missingComposition.composition
    const invalidDuration = richTimelineFixture()
    invalidDuration.transitions[0].durationMs = 0
    const invalidSceneDuration = richTimelineFixture()
    invalidSceneDuration.scenes[1].durationMs = -1_000
    invalidSceneDuration.composition!.scenes[1].zones.forEach((zone) => {
      zone.main = []
      zone.overlays.forEach((layer) => { layer.placements = [] })
    })
    invalidSceneDuration.composition!.groupOccurrences = []
    invalidSceneDuration.composition!.transitions = []
    invalidSceneDuration.composition!.scenes[1].propertyTracks = []
    const missingBoundaryScene = richTimelineFixture()
    missingBoundaryScene.transitions[0].afterSceneId = 'absent-scene'
    const ambiguousBoundaryScene = richTimelineFixture()
    ambiguousBoundaryScene.scenes.splice(1, 0, structuredClone(ambiguousBoundaryScene.scenes[0]))
    const missingDestinationScene = richTimelineFixture()
    missingDestinationScene.transitions[0].afterSceneId = 'scene-3'
    const ambiguousDestinationScene = richTimelineFixture()
    ambiguousDestinationScene.scenes.push(structuredClone(ambiguousDestinationScene.scenes[1]))
    const ambiguousUnrelatedScene = richTimelineFixture()
    ambiguousUnrelatedScene.scenes.push(structuredClone(ambiguousUnrelatedScene.scenes[2]))
    const ambiguousCompositionScene = richTimelineFixture()
    ambiguousCompositionScene.composition!.scenes.push({
      sceneId: 'scene-2',
      zones: [
        { zoneId: 'zone-1', main: [], overlays: [] },
        { zoneId: 'zone-2', main: [], overlays: [] },
      ],
    })
    const destinationEntry = richTimelineFixture()
    destinationEntry.composition!.scenes[1].zones[0].main[0].startMs = 0
    const groupAtEntry = richTimelineFixture()
    groupAtEntry.composition!.groupOccurrences![0].startMs = 0
    const outputFeedback = richTimelineFixture()
    outputFeedback.outputEffects = [{ id: 'trails', kind: 'trails', retention: 0.8 }]

    const refusals = [
      { show: propertyCarrier, id: 'boundary-1', reason: 'property-transitions' },
      { show: invalidComposition, id: 'boundary-1', reason: 'invalid-composition' },
      { show: ambiguous, id: 'boundary-1', reason: 'ambiguous-transition' },
      { show: ambiguousVisualBoundary, id: 'boundary-1', reason: 'ambiguous-visual-boundary' },
      { show: routing, id: 'route-1', reason: 'routing-transition' },
      { show: missingComposition, id: 'boundary-1', reason: 'missing-composition' },
      { show: invalidDuration, id: 'boundary-1', reason: 'invalid-duration' },
      { show: invalidSceneDuration, id: 'boundary-1', reason: 'invalid-scene-duration' },
      { show: missingBoundaryScene, id: 'boundary-1', reason: 'missing-boundary-scene' },
      { show: ambiguousBoundaryScene, id: 'boundary-1', reason: 'ambiguous-boundary-scene' },
      { show: missingDestinationScene, id: 'boundary-1', reason: 'missing-destination-scene' },
      { show: ambiguousDestinationScene, id: 'boundary-1', reason: 'ambiguous-destination-scene' },
      { show: ambiguousUnrelatedScene, id: 'boundary-1', reason: 'ambiguous-show-scene' },
      { show: ambiguousCompositionScene, id: 'boundary-1', reason: 'ambiguous-composition-scene' },
      { show: destinationEntry, id: 'boundary-1', reason: 'destination-entry-content' },
      { show: groupAtEntry, id: 'boundary-1', reason: 'destination-entry-content' },
      { show: outputFeedback, id: 'boundary-1', reason: 'output-feedback-state' },
      { show: richTimelineFixture(), id: 'absent', reason: 'missing-transition' },
    ] as const
    for (const specimen of refusals) {
      const before = structuredClone(specimen.show)
      const outcome = removeShowBoundaryTransitionPreservingTime(specimen.show, specimen.id)
      expect(outcome).toMatchObject({ status: 'refused', reason: specimen.reason })
      expect(outcome.record).toBe(specimen.show)
      expect(specimen.show).toEqual(before)
    }

    const once = removeShowBoundaryTransitionPreservingTime(richTimelineFixture(), 'boundary-1')
    expect(once.status).toBe('applied')
    if (once.status !== 'applied') throw new Error(once.reason)
    const twice = removeShowBoundaryTransitionPreservingTime(once.record, 'boundary-1')
    expect(twice).toEqual({ status: 'noop', record: once.record, reason: 'already-cut' })
  })

  it('preserves an implicit Show End and composes adjacent conversions identically in either order', () => {
    const implicit = richTimelineFixture()
    delete implicit.composition!.durationMs
    const implicitDuration = showLoopDurationMs(implicit)
    const implicitResult = removeShowBoundaryTransitionPreservingTime(implicit, 'boundary-1')
    expect(implicitResult.status).toBe('applied')
    if (implicitResult.status !== 'applied') throw new Error(implicitResult.reason)
    expect(implicitResult.record.composition!.durationMs).toBeUndefined()
    expect(showLoopDurationMs(implicitResult.record)).toBe(implicitDuration)

    const applyBoth = (order: readonly string[]) => order.reduce((record, transitionId) => {
      const outcome = removeShowBoundaryTransitionPreservingTime(record, transitionId)
      expect(outcome.status).toBe('applied')
      if (outcome.status !== 'applied') throw new Error(outcome.reason)
      return outcome.record
    }, richTimelineFixture())
    const forward = applyBoth(['boundary-1', 'boundary-2'])
    const reverse = applyBoth(['boundary-2', 'boundary-1'])

    expect(forward).toEqual(reverse)
    expect(forward.scenes.map((scene) => scene.durationMs)).toEqual([30_000, 11_379, 20_777])
    expect(forward.transitions.map((transition) => [transition.id, transition.kind, transition.durationMs]))
      .toEqual([
        ['boundary-1', 'cut', 0],
        ['route-1', 'routing', 0],
        ['boundary-2', 'cut', 0],
        ['route-2', 'routing', 0],
      ])
    expect(projectShowTimeline(forward).boundaryTransitions.map((transition) => [
      transition.id,
      transition.startMs,
      transition.endMs,
    ])).toEqual([
      ['boundary-1', 30_000, 30_000],
      ['route-1', 30_000, 30_000],
      ['boundary-2', 41_379, 41_379],
      ['route-2', 41_379, 41_379],
    ])
    expect(showLoopDurationMs(forward)).toBe(70_000)
    expect(validateShowComposition(forward, forward.composition!)).toEqual([])
  })
})
