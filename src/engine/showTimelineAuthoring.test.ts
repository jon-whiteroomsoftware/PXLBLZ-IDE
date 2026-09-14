import { describe, expect, it } from 'vitest'
import { createDefaultShow, showLoopDurationMs } from './showModel'
import { projectFlatShowToCompositionV1 } from './showCompositionModel'
import {
  addShowTimelineMarker,
  editShowEndMs,
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
  it('sets an exact Show End by pruning a composition-empty Scene across a Cut', () => {
    const show = showWithComposition()
    show.transitions = [{
      id: 'transition-scene-1',
      afterSceneId: 'scene-1',
      kind: 'cut',
      durationMs: 0,
      easing: { curve: 'linear' },
    }]
    show.composition!.scenes[1].zones.forEach((zone) => {
      zone.main = []
      zone.overlays = [{ id: 'empty-layer', name: 'Empty', placements: [] }]
    })
    show.composition!.markers = [{ id: 'later-guide', timeMs: 90_000, name: 'Later' }]
    const before = structuredClone(show)

    const result = editShowEndMs(show, 30_000)

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.removedSceneIds).toEqual(['scene-2'])
    expect(result.record.scenes.map((scene) => [scene.id, scene.durationMs])).toEqual([['scene-1', 30_000]])
    expect(result.record.composition?.scenes.map((scene) => scene.sceneId)).toEqual(['scene-1'])
    expect(result.record.cells.map((cell) => cell.id)).toEqual(['cell-1'])
    expect(result.record.transitions).toEqual([])
    expect(result.record.composition?.durationMs).toBe(30_000)
    expect(result.record.composition?.markers).toEqual(show.composition!.markers)
    expect(showLoopDurationMs(result.record)).toBe(30_000)
    expect(show).toEqual(before)
  })

  it('refuses an exact end that would discard a meaningful fade to an empty Scene', () => {
    const show = showWithComposition()
    show.composition!.scenes[1].zones.forEach((zone) => {
      zone.main = []
      zone.overlays = []
    })
    const before = structuredClone(show)

    const result = editShowEndMs(show, 32_000)

    expect(result).toMatchObject({
      status: 'refused',
      code: 'unsupported-topology',
      record: show,
      blockerIds: ['transition-scene-1', 'scene-2'],
    })
    if (result.status === 'refused') {
      expect(result.reason).toContain('2000 ms crossfade')
      expect(result.reason).toContain('Scene "scene-2"')
    }
    expect(show).toEqual(before)
  })

  it('refuses to prune a fade destination at the outgoing Scene edge', () => {
    const show = showWithComposition()
    show.composition!.scenes[1].zones.forEach((zone) => {
      zone.main = []
      zone.overlays = []
    })

    const result = editShowEndMs(show, 30_000)

    expect(result).toMatchObject({
      status: 'refused',
      code: 'unsupported-topology',
      blockerIds: ['transition-scene-1', 'scene-2'],
    })
  })

  it('keeps a positive final Scene when Show End is just after its start', () => {
    const show = showWithComposition()
    show.transitions = [{
      id: 'transition-scene-1',
      afterSceneId: 'scene-1',
      kind: 'cut',
      durationMs: 0,
      easing: { curve: 'linear' },
    }]
    show.composition!.scenes[1].zones.forEach((zone) => {
      zone.main = []
      zone.overlays = []
    })

    const result = editShowEndMs(show, 30_001)

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.removedSceneIds).toEqual([])
    expect(result.record.scenes.map((scene) => scene.durationMs)).toEqual([30_000, 1])
    expect(showLoopDurationMs(result.record)).toBe(30_001)
  })

  it('prunes multiple empty Scenes and clamps only flat cells that cross the removed suffix', () => {
    const show = showWithComposition()
    show.transitions = [{
      id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'cut', durationMs: 0,
      easing: { curve: 'linear' },
    }, {
      id: 'transition-scene-2', afterSceneId: 'scene-2', kind: 'cut', durationMs: 0,
      easing: { curve: 'linear' },
    }]
    show.cells[0].sceneSpan = 3
    show.scenes.push({ id: 'scene-3', name: 'Scene 3', durationMs: 30_000 })
    show.cells.push({ ...structuredClone(show.cells[1]), id: 'cell-3', sceneId: 'scene-3' })
    show.composition!.scenes.push({
      ...structuredClone(show.composition!.scenes[1]),
      sceneId: 'scene-3',
    })
    show.composition!.scenes.slice(1).forEach((scene) => {
      scene.zones.forEach((zone) => {
        zone.main = []
        zone.overlays = []
      })
    })

    const result = editShowEndMs(show, 30_000)

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.removedSceneIds).toEqual(['scene-2', 'scene-3'])
    expect(result.record.cells).toEqual([{ ...show.cells[0], sceneSpan: 1 }])
    expect(result.record.transitions).toEqual([])
    expect(showLoopDurationMs(result.record)).toBe(30_000)
  })

  it('does not normalize unrelated flat-cell spans when no Scene is pruned', () => {
    const show = showWithComposition()
    show.cells[0].sceneSpan = 99

    const result = editShowEndMs(show, 70_000)

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.removedSceneIds).toEqual([])
    expect(result.record.cells).toBe(show.cells)
    expect(result.record.cells[0].sceneSpan).toBe(99)
  })

  it('uses cause-specific remedies for routing and Scene-owned suffix blockers', () => {
    const routing = showWithComposition()
    routing.transitions = [{
      id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'cut', durationMs: 0,
      easing: { curve: 'linear' },
    }, {
      id: 'routing-scene-1', afterSceneId: 'scene-1', kind: 'routing', durationMs: 0,
      easing: { curve: 'linear' }, layoutId: 'layout-1',
    }]
    routing.composition!.scenes[1].zones.forEach((zone) => {
      zone.main = []
      zone.overlays = []
    })
    const routed = editShowEndMs(routing, 30_000)
    expect(routed).toMatchObject({
      status: 'refused',
      code: 'unsupported-topology',
      blockerIds: ['routing-scene-1', 'scene-2'],
    })
    if (routed.status === 'refused') {
      expect(routed.remedy).toContain('routing Boundary')
      expect(routed.remedy).not.toContain('set_boundary_transition')
    }

    const owned = showWithComposition()
    owned.transitions = [{
      id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'cut', durationMs: 0,
      easing: { curve: 'linear' },
    }]
    owned.composition!.scenes[1].zones.forEach((zone) => {
      zone.main = []
      zone.overlays = []
    })
    owned.scenes[1].routingTargets = { splitPosition: 0.25 }
    const blocked = editShowEndMs(owned, 30_000)
    expect(blocked).toMatchObject({
      status: 'refused',
      code: 'unsupported-topology',
      blockerIds: ['scene-2', 'scene-2:routingTargets'],
    })
    if (blocked.status === 'refused') {
      expect(blocked.remedy).toContain('remove its authored content explicitly')
      expect(blocked.remedy).not.toContain('set_boundary_transition')
    }
  })

  it.each([
    {
      label: 'Scene-local animation track',
      blockerIds: ['scene-2', 'suffix-track'],
      own: (show: ReturnType<typeof showWithComposition>) => {
        show.composition!.scenes[1].propertyTracks = [{
          id: 'suffix-track',
          target: { kind: 'instance-time-scale', instanceId: show.composition!.patternInstances[0].id },
          keyframes: [
            { id: 'suffix-key-1', timeMs: 0, value: 1, easing: { curve: 'linear' } },
            { id: 'suffix-key-2', timeMs: 1_000, value: 0.5, easing: { curve: 'linear' } },
          ],
        }]
      },
    },
    {
      label: 'Group occurrence',
      blockerIds: ['scene-2', 'suffix-group'],
      own: (show: ReturnType<typeof showWithComposition>) => {
        show.composition!.groupDefinitions = [{
          id: 'empty-group', name: 'Empty group', patternInstances: [], placements: [],
        }]
        show.composition!.groupOccurrences = [{
          id: 'suffix-group', definitionId: 'empty-group', sceneId: 'scene-2', zoneId: 'zone-1',
          startMs: 0, baseLayer: 0, translationX: 0, translationY: 0,
        }]
      },
    },
  ])('refuses to prune a suffix that owns a $label', ({ blockerIds, own }) => {
    const show = showWithComposition()
    show.transitions = [{
      id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'cut', durationMs: 0,
      easing: { curve: 'linear' },
    }]
    show.composition!.scenes[1].zones.forEach((zone) => {
      zone.main = []
      zone.overlays = []
    })
    own(show)
    const before = structuredClone(show)

    const result = editShowEndMs(show, 30_000)

    expect(result).toMatchObject({
      status: 'refused',
      code: 'unsupported-topology',
      blockerIds,
    })
    expect(show).toEqual(before)
  })

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
      reason: 'Insert Time is unavailable inside a multi-part Clip.',
    })
    expect(insertShowTime(show, {
      atMs: 5_000,
      durationMs: 2_000,
      newPlacementIdBySourceId: { 'logical-root': 'logical-root-right' },
    })).toBe(show)
  })

  it('refuses Insert Time between logical Clip segments at a Cut boundary (#63)', () => {
    const show = showWithComposition()
    show.transitions = show.transitions.map((transition) => (
      transition.kind === 'routing'
        ? transition
        : {
            ...transition,
            kind: 'cut' as const,
            durationMs: 0,
          }
    ))
    const instanceId = show.composition!.patternInstances[0].id
    show.composition!.scenes[0].zones[0].main = [{
      id: 'logical-root',
      instanceId,
      startMs: 29_000,
      durationMs: 1_000,
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

    expect(planShowTimeInsertion(show, 30_000, 2_000)).toEqual({
      enabled: false,
      code: 'logical-clip',
      reason: 'Insert Time is unavailable inside a multi-part Clip.',
    })
    expect(insertShowTime(show, {
      atMs: 30_000,
      durationMs: 2_000,
      newPlacementIdBySourceId: {},
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
