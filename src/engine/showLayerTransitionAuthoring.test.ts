import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import {
  deleteShowClipWithLayerTransitions,
  insertShowLayerTransition,
  moveShowConnectedClipAtGlobalTime,
  moveShowConnectedClipInShowAtGlobalTime,
  planShowGroupLayerTransitionInsertion,
  planShowLayerTransitionInsertion,
  resizeShowConnectedClipAtGlobalTime,
  resizeShowLayerTransition,
  resetShowLayerTransitionToCut,
  showLayerTransitionConnectedClosure,
  showLayerTransitionsConnectedToClip,
} from './showLayerTransitionAuthoring'
import type { ShowCompositionV1 } from './personalContentRecords'
import { splitShowClipAtGlobalTime } from './showTimelineClipAuthoring'
import { validateShowComposition } from './showCompositionModel'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

function fixture(): {
  show: ReturnType<typeof createDefaultShow>
  composition: ShowCompositionV1
} {
  const show = createDefaultShow('show-layer-transition', 'Layer transition', 1_000)
  const scene = show.scenes[0]
  const zoneId = show.zones[0].id
  const placement = (id: string, startMs: number, durationMs: number) => ({
    id,
    instanceId: 'instance-a',
    startMs,
    durationMs,
    view: { mirror: false, phase: 0, brightness: 1 },
  })
  return {
    show,
    composition: {
      version: 1,
      patternInstances: [{
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      transitions: [{
        id: 'transition-b-c',
        fromPlacementId: 'clip-b',
        toPlacementId: 'clip-c',
        kind: 'crossfade',
        durationMs: 1_000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
      }],
      scenes: [{
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: [
            placement('clip-a', 0, 2_000),
            placement('clip-b', 2_000, 2_000),
            placement('clip-c', 5_000, 2_000),
            placement('obstruction', 9_000, 1_000),
          ],
          overlays: [],
        }],
      }],
    },
  }
}

function boundaryMoveFixture(): ReturnType<typeof createDefaultShow> {
  const show = createDefaultShow('show-boundary-move', 'Boundary move', 1_000)
  const zoneId = show.zones[0].id
  const [leftScene, rightScene] = show.scenes
  show.transitions.push({
    id: 'routing-scene-1',
    afterSceneId: leftScene.id,
    kind: 'routing',
    durationMs: 0,
    easing: { curve: 'linear' },
    layoutId: show.routingLayouts[0].id,
  })
  show.composition = {
    version: 1,
    patternInstances: [{
      id: 'instance-a',
      pattern: { kind: 'stock', id: 'Rings' },
      patternName: 'Rings',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    scenes: [leftScene, rightScene].map((scene, index) => ({
      sceneId: scene.id,
      zones: [{
        zoneId,
        main: [{
          id: index === 0 ? 'clip-left' : 'clip-right',
          instanceId: 'instance-a',
          startMs: 0,
          durationMs: scene.durationMs,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
        overlays: [{ id: `layer-${index}`, name: 'Layer 1', placements: [] }],
      }],
    })),
  }
  return show
}

describe('literal per-Layer Transition authoring (#583)', () => {
  it('inserts duration between Clips and shifts the complete connected downstream chain', () => {
    const { show, composition } = fixture()

    const changed = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'wipe',
      durationMs: 1_000,
      easing: { curve: 'sine', direction: 'in-out' },
      direction: 0,
    })

    expect(changed).not.toBe(composition)
    expect(changed.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 3_000, 2_000],
      ['clip-c', 6_000, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
    expect(changed.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'transition-a-b', durationMs: 1_000, kind: 'wipe' }),
      expect.objectContaining({ id: 'transition-b-c', durationMs: 1_000 }),
    ]))
  })

  it('refuses growth when the connected chain would collide with unrelated content', () => {
    const { show, composition } = fixture()

    expect(insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 2_001,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })).toBe(composition)
  })

  it('bounds insertion by the endpoint Scene instead of later Show intervals', () => {
    const { show, composition } = fixture()
    show.scenes[0].durationMs = 5_000
    show.scenes.push({ ...show.scenes[0], id: 'later-scene', name: 'Later', durationMs: 30_000 })
    show.transitions = [{
      id: 'scene-boundary-transition',
      afterSceneId: show.scenes[0].id,
      kind: 'crossfade',
      durationMs: 2_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]
    composition.transitions = []
    composition.scenes[0].zones[0].main = composition.scenes[0].zones[0].main.slice(0, 2)
    composition.scenes.push({
      sceneId: 'later-scene',
      zones: [{
        zoneId: show.zones[0].id,
        main: [{
          id: 'later-clip', instanceId: 'instance-a', startMs: 0, durationMs: 1_000,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
        overlays: [],
      }],
    })

    expect(planShowLayerTransitionInsertion(show, composition, {
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
    })).toEqual({ enabled: true, maxDurationMs: 1_000 })
  })

  it('authors a Transition from the physical ending segment of a logical Clip (#63)', () => {
    const { show, composition } = fixture()
    composition.transitions = []
    composition.scenes[0].zones[0].main = [{
      ...composition.scenes[0].zones[0].main[0],
      id: 'clip-spanning',
      startMs: 28_000,
      durationMs: 2_000,
    }]
    composition.scenes.push({
      sceneId: show.scenes[1].id,
      zones: [{
        zoneId: show.zones[0].id,
        main: [{
          ...composition.scenes[0].zones[0].main[0],
          id: 'clip-spanning--span-scene-2',
          logicalClipId: 'clip-spanning',
          startMs: 0,
          durationMs: 3_000,
        }, {
          ...composition.scenes[0].zones[0].main[0],
          id: 'clip-next',
          startMs: 3_000,
          durationMs: 2_000,
        }],
        overlays: [],
      }],
    })

    expect(planShowLayerTransitionInsertion(show, composition, {
      fromPlacementId: 'clip-spanning--span-scene-2',
      toPlacementId: 'clip-next',
    })).toEqual({ enabled: true, maxDurationMs: 25_000 })

    composition.transitions = [{
      id: 'transition-spanning-next',
      fromPlacementId: 'clip-spanning--span-scene-2',
      toPlacementId: 'clip-next',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]
    expect(showLayerTransitionsConnectedToClip(composition, 'clip-spanning')).toEqual([
      composition.transitions[0],
    ])
  })

  it('refuses a chain shift that would move content into another Layer transition window', () => {
    const { show, composition } = fixture()
    composition.transitions = [{
      id: 'overlay-transition',
      fromPlacementId: 'overlay-a',
      toPlacementId: 'overlay-b',
      kind: 'wipe',
      durationMs: 1_000,
      easing: { curve: 'linear' },
    }]
    composition.scenes[0].zones[0].main = [
      { ...composition.scenes[0].zones[0].main[0], id: 'clip-a', startMs: 0, durationMs: 2_000 },
      { ...composition.scenes[0].zones[0].main[1], id: 'clip-b', startMs: 2_000, durationMs: 4_000 },
    ]
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [
        {
          id: 'overlay-a', instanceId: 'instance-a', startMs: 5_000, durationMs: 2_000, opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
        {
          id: 'overlay-b', instanceId: 'instance-a', startMs: 8_000, durationMs: 1_000, opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
      ],
    }]

    expect(insertShowLayerTransition(show, composition, {
      id: 'main-transition',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_500,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })).toBe(composition)
  })

  it('refuses a simultaneous transition on another Layer until independent render targets land', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [
        {
          id: 'overlay-a',
          instanceId: 'instance-a',
          startMs: 0,
          durationMs: 4_000,
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
        {
          id: 'overlay-b',
          instanceId: 'instance-a',
          startMs: 4_000,
          durationMs: 2_000,
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
      ],
    }]

    expect(planShowLayerTransitionInsertion(show, composition, {
      fromPlacementId: 'overlay-a',
      toPlacementId: 'overlay-b',
    })).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'Another Layer is already running a Transition across this moment. Only one Layer can transition at a time, so move this junction or shorten that Transition.',
    })
    expect(insertShowLayerTransition(show, composition, {
      id: 'overlapping-transition',
      fromPlacementId: 'overlay-a',
      toPlacementId: 'overlay-b',
      kind: 'wipe',
      durationMs: 1_000,
      easing: { curve: 'linear' },
    })).toBe(composition)
  })

  it('refuses a Group Cut when another Layer starts a Clip at the same time', () => {
    const { show, composition } = fixture()
    composition.transitions = []
    composition.scenes[0].zones[0].main = []
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        id: 'unrelated-overlay',
        instanceId: 'instance-a',
        startMs: 1_000,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]
    composition.groupDefinitions = [{
      id: 'group-definition',
      name: 'Phrase',
      patternInstances: [{
        id: 'group-instance',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'left',
        instanceId: 'group-instance',
        layerOffset: 0,
        startMs: 0,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }, {
        id: 'right',
        instanceId: 'group-instance',
        layerOffset: 0,
        startMs: 1_000,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]
    composition.groupOccurrences = [{
      id: 'group-use-obstructed',
      definitionId: 'group-definition',
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      startMs: 0,
      baseLayer: 0,
      translationX: 0,
      translationY: 0,
    }, {
      id: 'group-use-clear',
      definitionId: 'group-definition',
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      startMs: 3_000,
      baseLayer: 0,
      translationX: 0,
      translationY: 0,
    }]

    expect(planShowGroupLayerTransitionInsertion(show, composition, {
      occurrenceId: 'group-use-clear',
      fromPlacementId: 'group-use-clear:left',
      toPlacementId: 'group-use-clear:right',
    })).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'Another Layer starts a Clip at exactly this moment. Making room here would slide this Layer out of step with it, so move one of them first.',
    })
  })

  it('allows a Transition over a stable unrelated Clip and stops before its end boundary', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        id: 'overlay-through-cut',
        instanceId: 'instance-a',
        startMs: 1_000,
        durationMs: 1_500,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]

    expect(planShowLayerTransitionInsertion(show, composition, {
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
    })).toEqual({
      enabled: true,
      maxDurationMs: 499,
    })

    composition.scenes[0].zones[0].overlays[0].placements[0].durationMs = 1_000
    expect(planShowLayerTransitionInsertion(show, composition, {
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
    })).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.',
    })
  })

  it('resets a Transition to Cut by removing its duration and preserving Clip durations', () => {
    const { show, composition } = fixture()
    const inserted = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    const reset = resetShowLayerTransitionToCut(show, inserted, 'transition-a-b')

    expect(reset.transitions?.some((transition) => transition.id === 'transition-a-b')).toBe(false)
    expect(reset.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 2_000, 2_000],
      ['clip-c', 5_000, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
  })

  it('resizes Transition duration by moving its downstream chain, not either Clip edge', () => {
    const { show, composition } = fixture()

    const resized = resizeShowLayerTransition(show, composition, 'transition-b-c', 1_500)

    expect(resized.transitions?.find((transition) => transition.id === 'transition-b-c')?.durationMs).toBe(1_500)
    expect(resized.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 2_000, 2_000],
      ['clip-c', 5_500, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
  })

  it('moves an entire transition-connected sequence when any member Clip moves', () => {
    const { show, composition } = fixture()
    const connected = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    const moved = moveShowConnectedClipAtGlobalTime(show, connected, {
      owner: { kind: 'main', sceneId: show.scenes[0].id, zoneId: show.zones[0].id, placementId: 'clip-b' },
      target: { kind: 'main', zoneId: show.zones[0].id, globalStartMs: 4_000 },
    })

    expect(moved.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs])).toEqual([
      ['clip-a', 1_000],
      ['clip-b', 4_000],
      ['clip-c', 7_000],
      ['obstruction', 9_000],
    ])
  })

  it('repartitions every segment when a transition-connected logical Clip moves (#63)', () => {
    const { show, composition } = fixture()
    composition.transitions = [{
      id: 'transition-a-spanning',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-spanning',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]
    composition.scenes[0].zones[0].main = [
      {
        ...composition.scenes[0].zones[0].main[0],
        id: 'clip-a',
        startMs: 25_000,
        durationMs: 2_000,
      },
      {
        ...composition.scenes[0].zones[0].main[1],
        id: 'clip-spanning',
        startMs: 28_000,
        durationMs: 2_000,
      },
    ]
    composition.scenes.push({
      sceneId: show.scenes[1].id,
      zones: [{
        zoneId: show.zones[0].id,
        main: [{
          ...composition.scenes[0].zones[0].main[1],
          id: 'clip-spanning--span-scene-2',
          logicalClipId: 'clip-spanning',
          startMs: 0,
          durationMs: 3_000,
        }],
        overlays: [],
      }],
    })

    const moved = moveShowConnectedClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'clip-spanning',
      },
      target: { kind: 'main', zoneId: show.zones[0].id, globalStartMs: 27_000 },
    })

    expect(moved.scenes[0].zones[0].main).toEqual([
      expect.objectContaining({ id: 'clip-a', startMs: 24_000, durationMs: 2_000 }),
      expect.objectContaining({ id: 'clip-spanning', startMs: 27_000, durationMs: 3_000 }),
    ])
    expect(moved.scenes[1].zones[0].main).toEqual([
      expect.objectContaining({
        id: 'clip-spanning--span-scene-2',
        logicalClipId: 'clip-spanning',
        startMs: 0,
        durationMs: 2_000,
      }),
    ])
  })

  it('retargets durable Transition endpoints after a connected logical Clip changes segments (#63)', () => {
    const { show, composition } = fixture()
    composition.transitions = [{
      id: 'transition-spanning-next',
      fromPlacementId: 'clip-spanning--span-scene-2',
      toPlacementId: 'clip-next',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]
    composition.scenes[0].zones[0].main = [{
      ...composition.scenes[0].zones[0].main[0],
      id: 'clip-spanning',
      startMs: 28_000,
      durationMs: 2_000,
    }]
    composition.scenes.push({
      sceneId: show.scenes[1].id,
      zones: [{
        zoneId: show.zones[0].id,
        main: [{
          ...composition.scenes[0].zones[0].main[0],
          id: 'clip-spanning--span-scene-2',
          logicalClipId: 'clip-spanning',
          startMs: 0,
          durationMs: 3_000,
        }, {
          ...composition.scenes[0].zones[0].main[0],
          id: 'clip-next',
          startMs: 4_000,
          durationMs: 2_000,
        }],
        overlays: [],
      }],
    })

    const moved = moveShowConnectedClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'clip-spanning',
      },
      target: { kind: 'main', zoneId: show.zones[0].id, globalStartMs: 33_000 },
    })

    expect(moved).not.toBe(composition)
    expect(moved.scenes[0].zones[0].main).toEqual([])
    expect(moved.scenes[1].zones[0].main).toEqual([
      expect.objectContaining({ id: 'clip-spanning', startMs: 1_000, durationMs: 7_000 }),
      expect.objectContaining({ id: 'clip-next', startMs: 9_000, durationMs: 2_000 }),
    ])
    expect(moved.transitions).toEqual([
      expect.objectContaining({
        id: 'transition-spanning-next',
        fromPlacementId: 'clip-spanning',
        toPlacementId: 'clip-next',
      }),
    ])
  })

  it('breaks connected Transitions when their Clip moves into another Layer', () => {
    const { show, composition } = fixture()
    const connected = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })
    connected.scenes[0].zones[0].overlays = [{
      id: 'new-layer',
      name: 'Layer 1',
      placements: [],
    }]

    const moved = moveShowConnectedClipAtGlobalTime(show, connected, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'clip-b',
      },
      target: {
        kind: 'overlay',
        zoneId: show.zones[0].id,
        layerIndex: 0,
        globalStartMs: 3_000,
      },
    })

    expect(moved).not.toBe(connected)
    expect(moved.scenes[0].zones[0].main.map((clip) => clip.id)).toEqual([
      'clip-a',
      'clip-c',
      'obstruction',
    ])
    expect(moved.scenes[0].zones[0].overlays[0].placements.map((clip) => [clip.id, clip.startMs]))
      .toEqual([
        ['clip-b', 3_000],
      ])
    expect(moved.transitions).toBeUndefined()
  })

  it('does not restore a removed Transition after its endpoint returns to the Layer (#635)', () => {
    const { show, composition } = fixture()
    const connected = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })
    connected.scenes[0].zones[0].overlays = [{
      id: 'new-layer',
      name: 'Layer 1',
      placements: [],
    }]
    const beforeMove = structuredClone(connected)

    const movedAway = moveShowConnectedClipAtGlobalTime(show, connected, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'clip-a',
      },
      target: {
        kind: 'overlay',
        zoneId: show.zones[0].id,
        layerIndex: 0,
        globalStartMs: 0,
      },
    })
    const movedBack = moveShowConnectedClipAtGlobalTime(show, movedAway, {
      owner: {
        kind: 'overlay',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        layerId: 'new-layer',
        placementId: 'clip-a',
      },
      target: {
        kind: 'main',
        zoneId: show.zones[0].id,
        globalStartMs: 0,
      },
    })

    expect(connected).toEqual(beforeMove)
    expect(validateShowComposition(show, movedAway)).toEqual([])
    expect(validateShowComposition(show, movedBack)).toEqual([])
    expect(movedAway.transitions).toEqual([
      expect.objectContaining({ id: 'transition-b-c' }),
    ])
    expect(movedBack.transitions).toEqual([
      expect.objectContaining({ id: 'transition-b-c' }),
    ])
    expect(projectShowUnifiedTimeline(show, movedBack).zones[0].layers
      .find((layer) => layer.kind === 'main')?.junctions.map((junction) => junction.id))
      .toEqual(['transition-b-c'])
  })

  it('atomically deletes an unmappable Scene-boundary Transition when its endpoint changes Layers (#635)', () => {
    const show = boundaryMoveFixture()
    const zoneId = show.zones[0].id
    const leftScene = show.scenes[0]
    const before = structuredClone(show)

    const rejected = moveShowConnectedClipInShowAtGlobalTime(show, show.composition!, {
      owner: { kind: 'main', sceneId: leftScene.id, zoneId, placementId: 'clip-left' },
      target: { kind: 'main', zoneId: 'missing-zone', globalStartMs: 0 },
    })
    expect(rejected).toBe(show)
    expect(show).toEqual(before)

    const movedAway = moveShowConnectedClipInShowAtGlobalTime(show, show.composition!, {
      owner: { kind: 'main', sceneId: leftScene.id, zoneId, placementId: 'clip-left' },
      target: { kind: 'overlay', zoneId, layerIndex: 0, globalStartMs: 0 },
    })

    expect(show).toEqual(before)
    expect(movedAway).not.toBe(show)
    expect(movedAway.transitions).toEqual([
      expect.objectContaining({
        id: `transition-${leftScene.id}`,
        kind: 'cut',
        durationMs: 0,
      }),
      expect.objectContaining({ id: 'routing-scene-1', kind: 'routing' }),
    ])
    expect(movedAway.composition?.scenes[0].zones[0].overlays[0].placements)
      .toEqual([expect.objectContaining({ id: 'clip-left' })])
    expect(validateShowComposition(movedAway, movedAway.composition!)).toEqual([])

    const movedBack = moveShowConnectedClipInShowAtGlobalTime(movedAway, movedAway.composition!, {
      owner: {
        kind: 'overlay',
        sceneId: leftScene.id,
        zoneId,
        layerId: 'layer-0',
        placementId: 'clip-left',
      },
      target: { kind: 'main', zoneId, globalStartMs: 0 },
    })
    expect(movedBack.transitions).toEqual(movedAway.transitions)
    expect(projectShowUnifiedTimeline(movedBack, movedBack.composition!).zones[0].layers
      .flatMap((layer) => layer.junctions).map((junction) => junction.kind))
      .toEqual(['cut'])
  })

  it('plans a right-endpoint move against the original Scene-boundary timing (#635)', () => {
    const show = boundaryMoveFixture()
    const zoneId = show.zones[0].id
    const rightScene = show.scenes[1]

    const moved = moveShowConnectedClipInShowAtGlobalTime(show, show.composition!, {
      owner: { kind: 'main', sceneId: rightScene.id, zoneId, placementId: 'clip-right' },
      target: { kind: 'overlay', zoneId, layerIndex: 0, globalStartMs: 32_000 },
    })

    expect(moved).not.toBe(show)
    expect(moved.transitions).toEqual([
      expect.objectContaining({ id: 'transition-scene-1', kind: 'cut', durationMs: 0 }),
      expect.objectContaining({ id: 'routing-scene-1', kind: 'routing' }),
    ])
    expect(moved.composition?.scenes[1].zones[0].overlays[0].placements).toEqual([
      expect.objectContaining({ id: 'clip-right', startMs: 0 }),
    ])
    expect(projectShowUnifiedTimeline(moved, moved.composition!).zones[0].layers
      .find((layer) => layer.kind === 'overlay' && layer.layerIndex === 0)?.clips[0].startMs)
      .toBe(30_000)
  })

  it('persists the first edit when the Show record has no stored Composition (#635)', () => {
    const authoredShow = boundaryMoveFixture()
    const timelineComposition = authoredShow.composition!
    const show = { ...authoredShow }
    delete show.composition
    const zoneId = show.zones[0].id
    const leftScene = show.scenes[0]

    const moved = moveShowConnectedClipInShowAtGlobalTime(show, timelineComposition, {
      owner: { kind: 'main', sceneId: leftScene.id, zoneId, placementId: 'clip-left' },
      target: { kind: 'overlay', zoneId, layerIndex: 0, globalStartMs: 0 },
    })

    expect(moved).not.toBe(show)
    expect(moved.composition?.scenes[0].zones[0].overlays[0].placements).toEqual([
      expect.objectContaining({ id: 'clip-left', startMs: 0 }),
    ])
    expect(moved.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'transition-scene-1', kind: 'cut', durationMs: 0 }),
    ]))
  })

  it('keeps an intact Scene-boundary Transition for an exact no-op move (#635)', () => {
    const show = boundaryMoveFixture()
    const zoneId = show.zones[0].id
    const leftScene = show.scenes[0]

    const unchanged = moveShowConnectedClipInShowAtGlobalTime(show, show.composition!, {
      owner: { kind: 'main', sceneId: leftScene.id, zoneId, placementId: 'clip-left' },
      target: { kind: 'main', zoneId, globalStartMs: 0 },
    })

    expect(unchanged).toBe(show)
    expect(show.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'transition-scene-1', kind: 'crossfade', durationMs: 2_000 }),
    ]))
  })

  it('expands a partial selection to the complete transition-connected sequence', () => {
    const { composition } = fixture()
    composition.transitions!.push({
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    expect(showLayerTransitionConnectedClosure(composition, ['clip-b'])).toEqual([
      'clip-a', 'clip-b', 'clip-c',
    ])
  })

  it('deletes a Clip and every Transition directly connected to it', () => {
    const { show, composition } = fixture()
    const connected = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    const deleted = deleteShowClipWithLayerTransitions(show, connected, {
      kind: 'main',
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      placementId: 'clip-b',
    })

    expect(deleted.scenes[0].zones[0].main.map((clip) => clip.id)).toEqual([
      'clip-a', 'clip-c', 'obstruction',
    ])
    expect(deleted.transitions).toEqual([])
  })

  it('keeps an outgoing Transition attached to the outer half when its Clip is split', () => {
    const { show, composition } = fixture()

    const split = splitShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'clip-b',
      },
      globalTimeMs: 3_000,
      newPlacementId: 'clip-b-right',
    })

    expect(split.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 2_000, 1_000],
      ['clip-b-right', 3_000, 1_000],
      ['clip-c', 5_000, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
    expect(split.transitions?.[0]).toMatchObject({
      fromPlacementId: 'clip-b-right',
      toPlacementId: 'clip-c',
    })
  })

  it('grows a connected Clip edge by shifting its Transition and downstream chain', () => {
    const { show, composition } = fixture()
    const connected = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    const resized = resizeShowConnectedClipAtGlobalTime(show, connected, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'clip-a',
      },
      globalStartMs: 0,
      durationMs: 2_500,
    })

    expect(resized.transitions?.map((transition) => transition.durationMs)).toEqual([1_000, 1_000])
    expect(resized.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-a', 0, 2_500],
      ['clip-b', 3_500, 2_000],
      ['clip-c', 6_500, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
  })

  it('retargets an outgoing Transition when logical Clip growth creates a new end segment (#63)', () => {
    const show = createDefaultShow('show-logical-resize-transition', 'Logical resize transition', 1_000)
    show.scenes.push({ id: 'scene-3', name: 'Scene 3', durationMs: 30_000 })
    show.transitions.push({
      id: 'cut-scene-2',
      afterSceneId: show.scenes[1].id,
      kind: 'cut',
      durationMs: 0,
      easing: { curve: 'linear' },
    })
    const zoneId = show.zones[0].id
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      transitions: [{
        id: 'transition-logical-next',
        fromPlacementId: `logical-root--span-${show.scenes[1].id}`,
        toPlacementId: 'clip-next',
        kind: 'crossfade',
        durationMs: 2_000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0
            ? [{
                id: 'logical-root',
                instanceId: 'instance-a',
                startMs: 29_000,
                durationMs: 1_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }]
            : index === 1
              ? [{
                  id: `logical-root--span-${scene.id}`,
                  logicalClipId: 'logical-root',
                  instanceId: 'instance-a',
                  startMs: 0,
                  durationMs: 28_000,
                  view: { mirror: false, phase: 0, brightness: 1 },
                }]
              : [{
                  id: 'clip-next',
                  instanceId: 'instance-a',
                  startMs: 0,
                  durationMs: 2_000,
                  view: { mirror: false, phase: 0, brightness: 1 },
                }],
          overlays: [],
        }],
      })),
    }

    const resized = resizeShowConnectedClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId,
        placementId: 'logical-root',
      },
      globalStartMs: 29_000,
      durationMs: 34_000,
    })

    expect(resized).not.toBe(composition)
    expect(resized.transitions).toContainEqual(expect.objectContaining({
      id: 'transition-logical-next',
      fromPlacementId: `logical-root--span-${show.scenes[2].id}`,
      toPlacementId: 'clip-next',
    }))
    expect(resized.scenes[2].zones[0].main).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `logical-root--span-${show.scenes[2].id}`,
        logicalClipId: 'logical-root',
        durationMs: 1_000,
      }),
      expect.objectContaining({ id: 'clip-next', startMs: 3_000 }),
    ]))
    expect(validateShowComposition(show, resized)).toEqual([])
  })

  it('retargets an outgoing Transition when trimming removes the logical Clip root Scene (#63)', () => {
    const show = createDefaultShow('show-logical-trim-transition', 'Logical trim transition', 1_000)
    const zoneId = show.zones[0].id
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      transitions: [{
        id: 'transition-logical-next',
        fromPlacementId: `logical-root--span-${show.scenes[1].id}`,
        toPlacementId: 'clip-next',
        kind: 'crossfade',
        durationMs: 2_000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0
            ? [{
                id: 'logical-root',
                instanceId: 'instance-a',
                startMs: 29_000,
                durationMs: 1_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }]
            : [{
                id: `logical-root--span-${scene.id}`,
                logicalClipId: 'logical-root',
                instanceId: 'instance-a',
                startMs: 0,
                durationMs: 3_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }, {
                id: 'clip-next',
                instanceId: 'instance-a',
                startMs: 5_000,
                durationMs: 2_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }],
          overlays: [],
        }],
      })),
    }

    const resized = resizeShowConnectedClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId,
        placementId: 'logical-root',
      },
      globalStartMs: 32_000,
      durationMs: 3_000,
    })

    expect(resized).not.toBe(composition)
    expect(resized.scenes[0].zones[0].main).toEqual([])
    expect(resized.scenes[1].zones[0].main).toContainEqual(expect.objectContaining({
      id: 'logical-root',
      startMs: 0,
      durationMs: 3_000,
    }))
    expect(resized.scenes[1].zones[0].main.find((placement) => placement.id === 'logical-root'))
      .not.toHaveProperty('logicalClipId')
    expect(resized.transitions).toContainEqual(expect.objectContaining({
      id: 'transition-logical-next',
      fromPlacementId: 'logical-root',
      toPlacementId: 'clip-next',
    }))
    expect(validateShowComposition(show, resized)).toEqual([])
  })

  it('trims a middle Clip start without shifting its outgoing Transition chain (#63)', () => {
    const { show, composition } = fixture()
    const connected = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    const resized = resizeShowConnectedClipAtGlobalTime(show, connected, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'clip-b',
      },
      globalStartMs: 3_500,
      durationMs: 1_500,
    })

    expect(resized).not.toBe(connected)
    expect(resized.transitions?.map((transition) => [transition.id, transition.durationMs])).toEqual([
      ['transition-a-b', 1_500],
      ['transition-b-c', 1_000],
    ])
    expect(resized.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 3_500, 1_500],
      ['clip-c', 6_000, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
  })
})

// Resize is how an author moves a junction: the Cut itself is not draggable, so
// shortening the Clip beside it is the gesture. These pin what each edge drag
// does across a Cut, across a Transition that owns real time, and at the end of
// the timeline (#363).
describe('resizing Clips by their edges (#363)', () => {
  const main = (composition: ShowCompositionV1) =>
    composition.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])
  const owner = (show: ReturnType<typeof createDefaultShow>, placementId: string) => ({
    kind: 'main' as const,
    sceneId: show.scenes[0].id,
    zoneId: show.zones[0].id,
    placementId,
  })

  it('opens a gap when the Clip before a Cut is shortened', () => {
    const { show, composition } = fixture()
    // clip-a ends exactly where clip-b starts, so their junction is a Cut.
    const changed = resizeShowConnectedClipAtGlobalTime(show, composition, {
      owner: owner(show, 'clip-a'),
      globalStartMs: 0,
      durationMs: 1_500,
    })

    expect(main(changed)).toEqual([
      ['clip-a', 0, 1_500],
      ['clip-b', 2_000, 2_000],
      ['clip-c', 5_000, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
  })

  it('carries the downstream chain when the Clip before a Transition is shortened', () => {
    const { show, composition } = fixture()
    // clip-b hands off to clip-c through a 1s Transition occupying 4000-5000.
    const changed = resizeShowConnectedClipAtGlobalTime(show, composition, {
      owner: owner(show, 'clip-b'),
      globalStartMs: 2_000,
      durationMs: 1_000,
    })

    expect(main(changed)).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 2_000, 1_000],
      ['clip-c', 4_000, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
    // The Transition keeps its authored duration and still spans the gap.
    expect(changed.transitions?.find((transition) => transition.id === 'transition-b-c')?.durationMs)
      .toBe(1_000)
  })

  it('lengthens the last connected Clip into free time and refuses past an obstruction', () => {
    const { show, composition } = fixture()
    const grown = resizeShowConnectedClipAtGlobalTime(show, composition, {
      owner: owner(show, 'clip-c'),
      globalStartMs: 5_000,
      durationMs: 4_000,
    })
    expect(main(grown)).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 2_000, 2_000],
      ['clip-c', 5_000, 4_000],
      ['obstruction', 9_000, 1_000],
    ])

    const blocked = resizeShowConnectedClipAtGlobalTime(show, composition, {
      owner: owner(show, 'clip-c'),
      globalStartMs: 5_000,
      durationMs: 5_000,
    })
    expect(blocked, 'occupied time refuses the resize').toBe(composition)
  })

  it('pushes the downstream chain when the Clip before a Transition is lengthened', () => {
    const { show, composition } = fixture()
    const changed = resizeShowConnectedClipAtGlobalTime(show, composition, {
      owner: owner(show, 'clip-b'),
      globalStartMs: 2_000,
      durationMs: 3_000,
    })

    expect(main(changed)).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 2_000, 3_000],
      ['clip-c', 6_000, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
  })
})
