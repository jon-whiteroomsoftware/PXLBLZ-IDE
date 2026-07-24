import { describe, expect, it } from 'vitest'
import { createDefaultShow, showLoopDurationMs } from './showModel'
import { projectFlatShowToCompositionV1 } from './showCompositionModel'
import {
  addShowTimelineMarker,
  insertShowTime,
  moveShowTimelineMarker,
  planShowTimeInsertion,
  removeShowTimelineMarker,
  setShowEndMs,
  updateShowTimelineMarker,
} from './showTimelineAuthoring'

function showWithComposition() {
  const show = createDefaultShow('show-timing', 'Timing')
  return {
    ...show,
    composition: projectFlatShowToCompositionV1(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [
        cell.id,
        'export function render(index) { rgb(0, 0, 0) }',
      ])),
    }),
  }
}

describe('Show timeline authoring', () => {
  it('persists an explicit Show End while keeping the internal final interval aligned', () => {
    const show = showWithComposition()

    const changed = setShowEndMs(show, 70_000)

    expect(showLoopDurationMs(changed)).toBe(70_000)
    expect(changed.composition?.durationMs).toBe(70_000)
    expect(changed.scenes[changed.scenes.length - 1]?.durationMs).toBe(38_000)
  })

  it('clamps Show End to authored content without counting dormant Markers', () => {
    const show = showWithComposition()
    const finalScene = show.composition!.scenes[show.composition!.scenes.length - 1]!
    finalScene.zones[0].main = [{
      id: 'late-clip',
      instanceId: show.composition!.patternInstances[0].id,
      startMs: 10_000,
      durationMs: 15_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    }]
    show.composition!.markers = [{ id: 'later-guide', timeMs: 90_000, name: 'Later' }]

    const changed = setShowEndMs(show, 40_000)

    expect(showLoopDurationMs(changed)).toBe(57_000)
    expect(changed.composition?.markers).toEqual(show.composition!.markers)
  })

  it('adds and moves Show-owned Markers at millisecond precision', () => {
    const show = showWithComposition()
    const added = addShowTimelineMarker(show, {
      id: 'chorus',
      timeMs: 4_023,
      name: 'Chorus',
      color: '#f59e0b',
    })

    const moved = moveShowTimelineMarker(added, 'chorus', 6_500)

    expect(moved.composition?.markers).toEqual([{
      id: 'chorus',
      timeMs: 6_500,
      name: 'Chorus',
      color: '#f59e0b',
    }])
    expect(showLoopDurationMs(moved)).toBe(62_000)
  })

  it('edits and removes Marker metadata without changing content', () => {
    const show = addShowTimelineMarker(showWithComposition(), { id: 'beat', timeMs: 1_000 })

    const edited = updateShowTimelineMarker(show, 'beat', {
      timeMs: 2_025,
      name: 'Beat drop',
      color: '#22c55e',
    })
    const removed = removeShowTimelineMarker(edited, 'beat')

    expect(edited.composition?.markers).toEqual([{
      id: 'beat',
      timeMs: 2_025,
      name: 'Beat drop',
      color: '#22c55e',
    }])
    expect(removed.composition?.markers).toBeUndefined()
    expect(showLoopDurationMs(removed)).toBe(showLoopDurationMs(show))
  })

  it('inserts blank time globally by splitting crossing Clips and shifting later timing', () => {
    const show = showWithComposition()
    const firstScene = show.composition!.scenes[0]
    const instanceId = show.composition!.patternInstances[0].id
    firstScene.zones[0].main = [
      {
        id: 'crossing',
        instanceId,
        startMs: 1_000,
        durationMs: 8_000,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
      {
        id: 'later',
        instanceId,
        startMs: 10_000,
        durationMs: 2_000,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
    ]
    firstScene.propertyTracks = [{
      id: 'brightness-track',
      target: { kind: 'placement-view', placementId: 'crossing', property: 'brightness' },
      keyframes: [
        { id: 'dark', timeMs: 1_000, value: 0, easing: { curve: 'linear' } },
        { id: 'bright', timeMs: 9_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]
    show.composition!.markers = [
      { id: 'before', timeMs: 4_000 },
      { id: 'at', timeMs: 5_000 },
    ]

    const changed = insertShowTime(show, {
      atMs: 5_000,
      durationMs: 2_000,
      newPlacementIdBySourceId: { crossing: 'crossing-right' },
    })

    const clips = changed.composition!.scenes[0].zones[0].main
    expect(clips.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['crossing', 1_000, 4_000],
      ['crossing-right', 7_000, 4_000],
      ['later', 12_000, 2_000],
    ])
    expect(changed.composition!.markers).toEqual([
      { id: 'before', timeMs: 4_000 },
      { id: 'at', timeMs: 7_000 },
    ])
    expect(changed.composition!.scenes[0].propertyTracks?.map((track) => ({
      placementId: 'placementId' in track.target ? track.target.placementId : null,
      times: track.keyframes.map((keyframe) => keyframe.timeMs),
    }))).toEqual([
      { placementId: 'crossing', times: [1_000, 5_000, 7_000, 11_000] },
      { placementId: 'crossing-right', times: [1_000, 5_000, 7_000, 11_000] },
    ])
    expect(changed.scenes[0].durationMs).toBe(32_000)
    expect(showLoopDurationMs(changed)).toBe(64_000)
  })

  it('shifts every linked Group occurrence that starts at or after Insert Time', () => {
    const show = showWithComposition()
    const firstScene = show.composition!.scenes[0]
    show.composition!.groupDefinitions = [{
      id: 'phrase',
      name: 'Phrase',
      patternInstances: [{
        id: 'group-instance',
        pattern: { kind: 'stock', id: 'Murmuration' },
        patternName: 'Murmuration',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'group-clip',
        instanceId: 'group-instance',
        startMs: 0,
        durationMs: 2_000,
        layerOffset: 1,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]
    show.composition!.groupOccurrences = [
      {
        id: 'phrase-a',
        definitionId: 'phrase',
        sceneId: firstScene.sceneId,
        zoneId: firstScene.zones[0].zoneId,
        startMs: 10_000,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      },
      {
        id: 'phrase-b',
        definitionId: 'phrase',
        sceneId: firstScene.sceneId,
        zoneId: firstScene.zones[0].zoneId,
        startMs: 20_000,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      },
    ]

    const changed = insertShowTime(show, {
      atMs: 5_000,
      durationMs: 2_000,
      newPlacementIdBySourceId: {
        [firstScene.zones[0].main[0].id]: 'split-main-after-groups',
      },
    })

    expect(changed.composition?.groupOccurrences?.map((occurrence) => occurrence.startMs)).toEqual([
      12_000,
      22_000,
    ])
  })

  it('refuses Insert Time through one segment of a multi-Scene logical Clip (#63)', () => {
    const show = showWithComposition()
    const instanceId = show.composition!.patternInstances[0].id
    show.composition!.scenes[0].zones[0].main = [{
      id: 'logical-root',
      instanceId,
      startMs: 1_000,
      durationMs: 29_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    }]
    show.composition!.scenes[1].zones[0].main = [{
      id: `logical-root--span-${show.scenes[1].id}`,
      logicalClipId: 'logical-root',
      instanceId,
      startMs: 0,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    }]

    expect(planShowTimeInsertion(show, 5_000, 2_000)).toEqual({
      enabled: false,
      code: 'logical-clip',
      reason: 'Insert Time is unavailable inside a multi-Scene Clip.',
    })
    expect(insertShowTime(show, {
      atMs: 5_000,
      durationMs: 2_000,
      newPlacementIdBySourceId: { 'logical-root': 'logical-root-right' },
    })).toBe(show)
  })

  it('explains why Insert Time is unavailable inside a Group occurrence', () => {
    const show = showWithComposition()
    const firstScene = show.composition!.scenes[0]
    show.composition!.groupDefinitions = [{
      id: 'phrase',
      name: 'Phrase',
      patternInstances: [],
      placements: [{
        id: 'group-clip',
        instanceId: 'missing-for-plan-only',
        startMs: 0,
        durationMs: 2_000,
        layerOffset: 0,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]
    show.composition!.groupOccurrences = [{
      id: 'phrase-a',
      definitionId: 'phrase',
      sceneId: firstScene.sceneId,
      zoneId: firstScene.zones[0].zoneId,
      startMs: 10_000,
      baseLayer: 0,
      translationX: 0,
      translationY: 0,
    }]

    expect(planShowTimeInsertion(show, 11_000, 2_000)).toEqual({
      enabled: false,
      code: 'group',
      reason: 'Insert Time is unavailable inside a Group. Move or Ungroup it first.',
    })
  })

  it('explains why Insert Time is unavailable inside a Transition', () => {
    const show = showWithComposition()

    expect(planShowTimeInsertion(show, 31_000, 2_000)).toEqual({
      enabled: false,
      code: 'transition',
      reason: 'Insert Time is unavailable inside a Transition.',
    })
    expect(planShowTimeInsertion(show, 32_000, 2_000)).toEqual({
      enabled: false,
      code: 'transition',
      reason: 'Insert Time is unavailable inside a Transition.',
    })
  })

  it('refuses Insert Time through a nonlinear Property animation segment', () => {
    const show = showWithComposition()
    const firstScene = show.composition!.scenes[0]
    const placement = firstScene.zones[0].main[0]
    firstScene.propertyTracks = [{
      id: 'brightness-track',
      target: { kind: 'placement-view', placementId: placement.id, property: 'brightness' },
      keyframes: [
        { id: 'start', timeMs: 1_000, value: 0, easing: { curve: 'sine', direction: 'in-out' } },
        { id: 'end', timeMs: 9_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    expect(planShowTimeInsertion(show, 5_000, 2_000)).toEqual({
      enabled: false,
      code: 'nonlinear-property-animation',
      reason: 'Add a keyframe at the playhead or change the crossing segment to Linear before inserting time.',
    })
  })
})
