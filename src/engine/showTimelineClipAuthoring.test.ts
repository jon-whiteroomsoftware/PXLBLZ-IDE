import { describe, expect, it } from 'vitest'
import { addShowZone, createDefaultShow } from './showModel'
import {
  addShowClipAtGlobalTime,
  addShowOverlayLayerAcrossTimeline,
  addShowMainClipAtGlobalTime,
  duplicateLinkedShowClipAfter,
  duplicateShowClipAfter,
  makeShowClipPatternIndependent,
  moveShowClipAtGlobalTime,
  planShowClipPatternRejoin,
  planShowClipAtGlobalTime,
  planShowMainClipAtGlobalTime,
  projectShowClipPatternInstanceOwnership,
  rejoinShowClipPatternInstance,
  resizeShowClipAtGlobalTime,
  splitShowClipAtGlobalTime,
} from './showTimelineClipAuthoring'
import type { ShowCompositionV1, ShowPatternInstance } from './personalContentRecords'

function emptyComposition(show: ReturnType<typeof createDefaultShow>): ShowCompositionV1 {
  return {
    version: 1,
    patternInstances: [],
    scenes: show.scenes.map((scene) => ({
      sceneId: scene.id,
      zones: show.zones.map((zone) => ({ zoneId: zone.id, main: [], overlays: [] })),
    })),
  }
}

const instance: ShowPatternInstance = {
  id: 'instance-new',
  pattern: { kind: 'user', id: 'pattern-new' },
  patternName: 'New Pattern',
  time: { timeScale: 1, timeOffsetMs: 0 },
}

describe('global timeline Clip authoring (#580)', () => {
  it('adds one visible overlay Layer across every internal Scene owner', () => {
    const show = createDefaultShow('show-add-layer', 'Add layer', 1000)
    const composition = emptyComposition(show)

    const next = addShowOverlayLayerAcrossTimeline(show, composition, {
      zoneId: show.zones[0].id,
      layers: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        layerId: `layer-${index}`,
      })),
    })

    expect(next).not.toBe(composition)
    expect(next.scenes.map((scene) => scene.zones[0].overlays)).toEqual([
      [{ id: 'layer-0', name: 'Layer 1', placements: [] }],
      [{ id: 'layer-1', name: 'Layer 1', placements: [] }],
    ])
  })

  it('plans and adds a Clip to an explicitly chosen overlay Layer', () => {
    const show = createDefaultShow('show-add-overlay-global', 'Add overlay global', 1000)
    const empty = emptyComposition(show)
    const composition = addShowOverlayLayerAcrossTimeline(show, empty, {
      zoneId: show.zones[0].id,
      layers: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        layerId: `layer-${index}`,
      })),
    })
    const target = { kind: 'overlay' as const, layerIndex: 0 }

    expect(planShowClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 2_000,
      target,
    })).toMatchObject({
      enabled: true,
      sceneId: show.scenes[0].id,
      localStartMs: 2_000,
      durationMs: 5_000,
    })

    const next = addShowClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 2_000,
      target,
      instance,
      placementId: 'placement-overlay',
    })

    expect(next.scenes[0].zones[0].main).toEqual([])
    expect(next.scenes[0].zones[0].overlays[0].placements).toContainEqual({
      id: 'placement-overlay',
      instanceId: instance.id,
      startMs: 2_000,
      durationMs: 5_000,
      opacity: 1,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
  })

  it('plans a five-second Clip from empty global time', () => {
    const show = createDefaultShow('show-add-global', 'Add global', 1000)
    const composition = emptyComposition(show)

    expect(planShowMainClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 2_000,
    })).toEqual({
      enabled: true,
      code: 'ready',
      sceneId: show.scenes[0].id,
      localStartMs: 2_000,
      durationMs: 5_000,
    })
  })

  it('fills a shorter empty gap without overwriting the next Clip', () => {
    const show = createDefaultShow('show-gap-global', 'Gap global', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push({ ...instance, id: 'instance-existing' })
    composition.scenes[0].zones[0].main.push({
      id: 'placement-existing',
      instanceId: 'instance-existing',
      startMs: 4_500,
      durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })

    expect(planShowMainClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 2_000,
    })).toMatchObject({ enabled: true, localStartMs: 2_000, durationMs: 2_500 })
  })

  it('rejects occupied time and literal Transition time with reasons', () => {
    const show = createDefaultShow('show-disabled-global', 'Disabled global', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push({ ...instance, id: 'instance-existing' })
    composition.scenes[0].zones[0].main.push({
      id: 'placement-existing',
      instanceId: 'instance-existing',
      startMs: 1_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })

    expect(planShowMainClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 1_500,
    })).toEqual({
      enabled: false,
      code: 'occupied',
      reason: 'The selected Layer already has a Clip at the playhead.',
    })
    expect(planShowMainClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 30_500,
    })).toEqual({
      enabled: false,
      code: 'transition',
      reason: 'A Clip cannot begin inside a Transition.',
    })
  })

  it('disables Add Clip where a Group child occupies Main or an overlay Layer', () => {
    const show = createDefaultShow('show-group-occupied-add', 'Group occupied Add', 1000)
    const composition = emptyComposition(show)
    composition.scenes.forEach((scene, sceneIndex) => {
      scene.zones[0].overlays = [{
        id: `overlay-${sceneIndex}`,
        name: 'Overlay',
        placements: [],
      }]
    })
    composition.groupDefinitions = [{
      id: 'group-definition',
      name: 'Group',
      patternInstances: [{
        id: 'group-instance',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'group-child',
        instanceId: 'group-instance',
        startMs: 1_000,
        durationMs: 2_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
        layerOffset: 0,
      }],
    }]
    composition.groupOccurrences = [
      {
        id: 'main-group-use',
        definitionId: 'group-definition',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        startMs: 0,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      },
      {
        id: 'overlay-group-use',
        definitionId: 'group-definition',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        startMs: 0,
        baseLayer: 1,
        translationX: 0,
        translationY: 0,
      },
    ]

    expect(planShowClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 1_500,
      target: { kind: 'main' },
    })).toMatchObject({ enabled: false, code: 'occupied' })
    expect(planShowClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 1_500,
      target: { kind: 'overlay', layerIndex: 0 },
    })).toMatchObject({ enabled: false, code: 'occupied' })
  })

  it('keeps an authored overlay target stable when a Group materializes a higher virtual Layer', () => {
    const show = createDefaultShow('show-group-virtual-layer-add', 'Group virtual Layer Add', 1000)
    const composition = emptyComposition(show)
    composition.scenes.forEach((scene, sceneIndex) => {
      scene.zones[0].overlays = [{
        id: `authored-overlay-${sceneIndex}`,
        name: 'Authored overlay',
        placements: [],
      }]
    })
    composition.groupDefinitions = [{
      id: 'higher-group-definition',
      name: 'Higher Group',
      patternInstances: [{
        id: 'group-instance',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'higher-child',
        instanceId: 'group-instance',
        startMs: 1_000,
        durationMs: 2_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
        layerOffset: 0,
      }],
    }]
    composition.groupOccurrences = [{
      id: 'higher-group-use',
      definitionId: 'higher-group-definition',
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      startMs: 0,
      baseLayer: 2,
      translationX: 0,
      translationY: 0,
    }]

    expect(planShowClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 1_500,
      target: { kind: 'overlay', layerIndex: 0 },
    })).toMatchObject({
      enabled: true,
      code: 'ready',
      localStartMs: 1_500,
    })
  })

  it('adds the fresh Pattern instance and placement to the resolved owner', () => {
    const show = createDefaultShow('show-commit-global', 'Commit global', 1000)
    const composition = emptyComposition(show)

    const next = addShowMainClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 33_000,
      instance,
      placementId: 'placement-new',
    })

    expect(next).not.toBe(composition)
    expect(next.patternInstances).toContainEqual(instance)
    expect(next.scenes[1].zones[0].main).toContainEqual({
      id: 'placement-new',
      instanceId: instance.id,
      startMs: 1_000,
      durationMs: 5_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
  })

  it('moves a Clip in global time without changing its Pattern instance', () => {
    const show = createDefaultShow('show-move-global', 'Move global', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-move',
      instanceId: instance.id,
      startMs: 1_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0.25, brightness: 0.8 },
    })

    const next = moveShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-move',
      },
      target: {
        kind: 'main',
        zoneId: show.zones[0].id,
        globalStartMs: 5_000,
      },
    })

    expect(next).not.toBe(composition)
    expect(next.patternInstances).toEqual(composition.patternInstances)
    expect(next.scenes[0].zones[0].main).toContainEqual({
      id: 'placement-move',
      instanceId: instance.id,
      startMs: 5_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0.25, brightness: 0.8 },
    })
  })

  it('rejects a move that would overwrite another Clip on the Layer', () => {
    const show = createDefaultShow('show-move-collision', 'Move collision', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance, { ...instance, id: 'instance-obstruction' })
    composition.scenes[0].zones[0].main.push(
      {
        id: 'placement-move',
        instanceId: instance.id,
        startMs: 1_000,
        durationMs: 2_000,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
      {
        id: 'placement-obstruction',
        instanceId: 'instance-obstruction',
        startMs: 5_000,
        durationMs: 2_000,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
    )

    const next = moveShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-move',
      },
      target: {
        kind: 'main',
        zoneId: show.zones[0].id,
        globalStartMs: 5_500,
      },
    })

    expect(next).toBe(composition)
  })

  it('moves a Clip across an internal Scene boundary while preserving its placement', () => {
    const show = createDefaultShow('show-move-owner', 'Move owner', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-move',
      instanceId: instance.id,
      startMs: 1_000,
      durationMs: 2_000,
      view: { mirror: true, phase: 0.4, brightness: 0.6 },
      effects: [{ id: 'invert', kind: 'invert', amount: 1 }],
    })

    const next = moveShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-move',
      },
      target: {
        kind: 'main',
        zoneId: show.zones[0].id,
        globalStartMs: 35_000,
      },
    })

    expect(next).not.toBe(composition)
    expect(next.scenes[0].zones[0].main).toEqual([])
    expect(next.scenes[1].zones[0].main).toContainEqual({
      id: 'placement-move',
      instanceId: instance.id,
      startMs: 3_000,
      durationMs: 2_000,
      view: { mirror: true, phase: 0.4, brightness: 0.6 },
      effects: [{ id: 'invert', kind: 'invert', amount: 1 }],
    })
  })

  it('moves a Clip vertically between Main and overlay Layers', () => {
    const show = createDefaultShow('show-move-layer', 'Move layer', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-move',
      instanceId: instance.id,
      startMs: 1_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0.25, brightness: 0.8 },
    })
    composition.scenes[0].zones[0].overlays.push({
      id: 'layer-front',
      name: 'Front',
      placements: [],
    })

    const overlay = moveShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-move',
      },
      target: {
        kind: 'overlay',
        zoneId: show.zones[0].id,
        layerIndex: 0,
        globalStartMs: 4_000,
      },
    })

    expect(overlay.scenes[0].zones[0].main).toEqual([])
    expect(overlay.scenes[0].zones[0].overlays[0].placements).toContainEqual({
      id: 'placement-move',
      instanceId: instance.id,
      startMs: 4_000,
      durationMs: 2_000,
      opacity: 1,
      view: { mirror: false, phase: 0.25, brightness: 0.8 },
    })

    const main = moveShowClipAtGlobalTime(show, overlay, {
      owner: {
        kind: 'overlay',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        layerId: 'layer-front',
        placementId: 'placement-move',
      },
      target: {
        kind: 'main',
        zoneId: show.zones[0].id,
        globalStartMs: 7_000,
      },
    })

    expect(main.scenes[0].zones[0].overlays[0].placements).toEqual([])
    expect(main.scenes[0].zones[0].main[0]).not.toHaveProperty('opacity')
    expect(main.scenes[0].zones[0].main[0]).toMatchObject({
      id: 'placement-move',
      startMs: 7_000,
      durationMs: 2_000,
    })
  })

  it('moves a Clip to exactly one other Zone without changing its Pattern instance (#581)', () => {
    const show = addShowZone(createDefaultShow('show-move-zone', 'Move zone', 1000), {
      name: 'accent',
    })
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-move',
      instanceId: instance.id,
      startMs: 1_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0.25, brightness: 0.8 },
    })

    const next = moveShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-move',
      },
      target: {
        kind: 'main',
        zoneId: show.zones[1].id,
        globalStartMs: 4_000,
      },
    })

    expect(next).not.toBe(composition)
    expect(next.patternInstances).toEqual([instance])
    expect(next.scenes[0].zones[0].main).toEqual([])
    expect(next.scenes[0].zones[1].main).toEqual([
      expect.objectContaining({
        id: 'placement-move',
        instanceId: instance.id,
        startMs: 4_000,
        durationMs: 2_000,
      }),
    ])
  })

  it('keeps placement animation aligned when a Clip changes time and owner', () => {
    const show = createDefaultShow('show-move-keyframes', 'Move keyframes', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-move',
      instanceId: instance.id,
      startMs: 1_000,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].propertyTracks = [{
      id: 'track-brightness',
      target: { kind: 'placement-view', placementId: 'placement-move', property: 'brightness' },
      keyframes: [
        { id: 'key-a', timeMs: 1_500, value: 0, easing: { curve: 'linear' } },
        { id: 'key-b', timeMs: 3_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    const next = moveShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-move',
      },
      target: {
        kind: 'main',
        zoneId: show.zones[0].id,
        globalStartMs: 34_000,
      },
    })

    expect(next.scenes[0].propertyTracks).toBeUndefined()
    expect(next.scenes[1].propertyTracks?.[0]).toMatchObject({
      id: 'track-brightness',
      target: { placementId: 'placement-move' },
      keyframes: [
        { id: 'key-a', timeMs: 2_500 },
        { id: 'key-b', timeMs: 4_000 },
      ],
    })
  })

  it('splits a Clip at global time while preserving its shared Pattern instance', () => {
    const show = createDefaultShow('show-split-clip', 'Split clip', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-left',
      instanceId: instance.id,
      startMs: 2_000,
      durationMs: 6_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })

    const next = splitShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main', sceneId: show.scenes[0].id, zoneId: show.zones[0].id, placementId: 'placement-left',
      },
      globalTimeMs: 5_000,
      newPlacementId: 'placement-right',
    })

    expect(next.patternInstances).toEqual([instance])
    expect(next.scenes[0].zones[0].main).toEqual([
      expect.objectContaining({ id: 'placement-left', instanceId: instance.id, startMs: 2_000, durationMs: 3_000 }),
      expect.objectContaining({ id: 'placement-right', instanceId: instance.id, startMs: 5_000, durationMs: 3_000 }),
    ])
  })

  it('duplicates a Clip immediately after itself with an independent Pattern instance and copied property tracks', () => {
    const show = createDefaultShow('show-duplicate-clip', 'Duplicate clip', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-source',
      instanceId: instance.id,
      startMs: 2_000,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].propertyTracks = [{
      id: 'track-source',
      target: { kind: 'placement-view', placementId: 'placement-source', property: 'brightness' },
      keyframes: [
        { id: 'key-source-a', timeMs: 2_000, value: 0, easing: { curve: 'linear' } },
        { id: 'key-source-b', timeMs: 5_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    const next = duplicateShowClipAfter(show, composition, {
      owner: {
        kind: 'main', sceneId: show.scenes[0].id, zoneId: show.zones[0].id, placementId: 'placement-source',
      },
      newPlacementId: 'placement-copy',
      newInstanceId: 'instance-copy',
    })

    expect(next.patternInstances).toEqual(expect.arrayContaining([
      instance,
      expect.objectContaining({ id: 'instance-copy', pattern: instance.pattern, time: instance.time }),
    ]))
    expect(next.scenes[0].zones[0].main[1]).toMatchObject({
      id: 'placement-copy', instanceId: 'instance-copy', startMs: 5_000, durationMs: 3_000,
    })
    expect(next.scenes[0].propertyTracks?.[1]).toMatchObject({
      target: { placementId: 'placement-copy' },
      keyframes: [{ timeMs: 5_000 }, { timeMs: 8_000 }],
    })
  })

  it('copies instance-owned animation onto the independent duplicate', () => {
    const show = createDefaultShow('show-duplicate-instance-track', 'Duplicate instance track', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-source',
      instanceId: instance.id,
      startMs: 2_000,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].propertyTracks = [{
      id: 'speed-source',
      target: { kind: 'instance-time-scale', instanceId: instance.id },
      keyframes: [
        { id: 'speed-a', timeMs: 2_000, value: 1, easing: { curve: 'linear' } },
        { id: 'speed-b', timeMs: 5_000, value: 2, easing: { curve: 'linear' } },
      ],
    }]

    const next = duplicateShowClipAfter(show, composition, {
      owner: {
        kind: 'main', sceneId: show.scenes[0].id, zoneId: show.zones[0].id, placementId: 'placement-source',
      },
      newPlacementId: 'placement-copy',
      newInstanceId: 'instance-copy',
    })

    expect(next.scenes[0].propertyTracks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: { kind: 'instance-time-scale', instanceId: 'instance-copy' },
        keyframes: [
          expect.objectContaining({ timeMs: 5_000 }),
          expect.objectContaining({ timeMs: 8_000 }),
        ],
      }),
    ]))
  })

  it('duplicates a Clip Linked only through the explicit linked operation', () => {
    const show = createDefaultShow('show-duplicate-linked', 'Duplicate linked', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-source',
      instanceId: instance.id,
      startMs: 2_000,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })

    const next = duplicateLinkedShowClipAfter(show, composition, {
      owner: {
        kind: 'main', sceneId: show.scenes[0].id, zoneId: show.zones[0].id, placementId: 'placement-source',
      },
      newPlacementId: 'placement-copy',
    })

    expect(next.patternInstances).toEqual([instance])
    expect(next.scenes[0].zones[0].main[1]).toMatchObject({
      id: 'placement-copy', instanceId: instance.id, startMs: 5_000, durationMs: 3_000,
    })
  })

  it('makes one overlay Clip Pattern-independent without changing its placement', () => {
    const show = createDefaultShow('show-make-independent', 'Make independent', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-main',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].zones[0].overlays.push({
      id: 'layer-1',
      name: 'Layer 2',
      placements: [{
        id: 'placement-overlay',
        instanceId: instance.id,
        startMs: 4_000,
        durationMs: 3_000,
        opacity: 0.75,
        view: { mirror: true, phase: 0.2, brightness: 0.8 },
      }],
    })

    const next = makeShowClipPatternIndependent(composition, {
      owner: {
        kind: 'overlay',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        layerId: 'layer-1',
        placementId: 'placement-overlay',
      },
      newInstanceId: 'instance-independent',
    })

    expect(next.patternInstances).toHaveLength(2)
    expect(next.scenes[0].zones[0].main[0].instanceId).toBe(instance.id)
    expect(next.scenes[0].zones[0].overlays[0].placements[0]).toMatchObject({
      id: 'placement-overlay',
      instanceId: 'instance-independent',
      startMs: 4_000,
      durationMs: 3_000,
      opacity: 0.75,
      view: { mirror: true, phase: 0.2, brightness: 0.8 },
    })
  })

  it('plans and rejoins a compatible shared Pattern instance without guessing the target', () => {
    const show = createDefaultShow('show-rejoin-instance', 'Rejoin instance', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(
      instance,
      { ...structuredClone(instance), id: 'instance-independent', time: { timeScale: 0.5, timeOffsetMs: 2_000 } },
    )
    composition.scenes[0].zones[0].main.push({
      id: 'placement-main',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].zones[0].overlays.push({
      id: 'layer-1',
      name: 'Layer 2',
      placements: [{
        id: 'placement-overlay',
        instanceId: 'instance-independent',
        startMs: 4_000,
        durationMs: 3_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    })
    const owner = {
      kind: 'overlay' as const,
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      layerId: 'layer-1',
      placementId: 'placement-overlay',
    }

    expect(planShowClipPatternRejoin(composition, { owner, targetInstanceId: instance.id })).toEqual({
      enabled: true,
      code: 'ready',
      sourceInstanceId: 'instance-independent',
      targetInstanceId: instance.id,
      targetUseCount: 1,
      discardsSourceState: true,
    })

    const next = rejoinShowClipPatternInstance(composition, { owner, targetInstanceId: instance.id })
    expect(next.patternInstances).toEqual([instance])
    expect(next.scenes[0].zones[0].overlays[0].placements[0].instanceId).toBe(instance.id)
  })

  it('projects Pattern-instance ownership and only compatible explicit rejoin targets', () => {
    const show = createDefaultShow('show-instance-ownership', 'Instance ownership', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(
      instance,
      { ...structuredClone(instance), id: 'instance-independent' },
      {
        ...structuredClone(instance),
        id: 'instance-other-pattern',
        pattern: { kind: 'user', id: 'different-pattern' },
        patternName: 'Different Pattern',
      },
    )
    composition.scenes[0].zones[0].main.push({
      id: 'placement-main',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].zones[0].overlays.push({
      id: 'layer-1',
      name: 'Layer 2',
      placements: [{
        id: 'placement-overlay',
        instanceId: 'instance-independent',
        startMs: 4_000,
        durationMs: 3_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }, {
        id: 'placement-other',
        instanceId: 'instance-other-pattern',
        startMs: 8_000,
        durationMs: 2_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    })

    expect(projectShowClipPatternInstanceOwnership(composition, {
      kind: 'overlay',
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      layerId: 'layer-1',
      placementId: 'placement-overlay',
    })).toEqual({
      instanceId: 'instance-independent',
      useCount: 1,
      compatibleTargets: [{
        instanceId: instance.id,
        patternName: 'New Pattern',
        useCount: 1,
      }],
    })
  })

  it('resizes either Clip edge while keeping local animation aligned to the left edge', () => {
    const show = createDefaultShow('show-resize-clip', 'Resize clip', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-resize',
      instanceId: instance.id,
      startMs: 2_000,
      durationMs: 5_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].propertyTracks = [{
      id: 'track-resize',
      target: { kind: 'placement-view', placementId: 'placement-resize', property: 'brightness' },
      keyframes: [
        { id: 'key-resize-a', timeMs: 2_500, value: 0, easing: { curve: 'linear' } },
        { id: 'key-resize-b', timeMs: 6_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]
    const owner = {
      kind: 'main' as const,
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      placementId: 'placement-resize',
    }

    const fromLeft = resizeShowClipAtGlobalTime(show, composition, {
      owner,
      globalStartMs: 3_000,
      durationMs: 4_000,
    })
    expect(fromLeft.scenes[0].zones[0].main[0]).toMatchObject({ startMs: 3_000, durationMs: 4_000 })
    expect(fromLeft.scenes[0].propertyTracks?.[0].keyframes.map((keyframe) => keyframe.timeMs)).toEqual([3_500, 7_000])

    const fromRight = resizeShowClipAtGlobalTime(show, fromLeft, {
      owner,
      globalStartMs: 3_000,
      durationMs: 6_000,
    })
    expect(fromRight.scenes[0].zones[0].main[0]).toMatchObject({ startMs: 3_000, durationMs: 6_000 })
    expect(fromRight.scenes[0].propertyTracks?.[0].keyframes.map((keyframe) => keyframe.timeMs)).toEqual([3_500, 7_000])
  })
})
