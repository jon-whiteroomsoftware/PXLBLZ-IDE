import { describe, expect, it } from 'vitest'
import { addShowZone, createDefaultShow, showLoopDurationMs } from './showModel'
import { projectFlatShowToCompositionV1, validateShowComposition } from './showCompositionModel'
import {
  addShowClipAtGlobalTime,
  addShowClipAtGlobalTimeExtendingShow,
  addShowOverlayLayerAcrossTimeline,
  addShowMainClipAtGlobalTime,
  duplicateLinkedShowClipAfter,
  duplicateShowClipAfter,
  makeShowClipPatternIndependent,
  moveShowClipAtGlobalTime,
  planShowClipAtTopmostAvailableLayer,
  planShowClipDuplicateAfter,
  planShowClipSplitAtGlobalTime,
  planShowClipPatternRejoin,
  planShowClipAtGlobalTime,
  planShowMainClipAtGlobalTime,
  projectShowClipPatternInstanceOwnership,
  rejoinShowClipPatternInstance,
  resizeShowClipAtGlobalTime,
  splitShowClipAtGlobalTime,
} from './showTimelineClipAuthoring'
import type { ShowCompositionV1, ShowPatternInstance } from './personalContentRecords'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

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

  it('chooses the topmost available Layer when a higher Layer is occupied (#594)', () => {
    const show = createDefaultShow('show-auto-layer', 'Automatic layer', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push({ ...instance, id: 'instance-occupied' })
    composition.scenes[0].zones[0].overlays = [{
      id: 'top-layer',
      name: 'Top',
      placements: [{
        id: 'occupied',
        instanceId: 'instance-occupied',
        startMs: 0,
        durationMs: 5_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }, {
      id: 'lower-layer',
      name: 'Lower',
      placements: [],
    }]

    expect(planShowClipAtTopmostAvailableLayer(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 2_000,
    })).toMatchObject({
      target: { kind: 'overlay', layerIndex: 1 },
      plan: { enabled: true, localStartMs: 2_000, durationMs: 5_000 },
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

  it('adds a Clip at Show End by extending the final interval', () => {
    const show = createDefaultShow('show-add-at-end', 'Add at end', 1000)
    const composition = projectFlatShowToCompositionV1(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [
        cell.id,
        'export function render(index) { rgb(0, 0, 0) }',
      ])),
    })
    const basis = { ...show, composition }

    expect(planShowClipAtGlobalTime(basis, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 62_000,
      target: { kind: 'main' },
    })).toMatchObject({ enabled: true, localStartMs: 30_000, durationMs: 5_000 })

    const next = addShowClipAtGlobalTimeExtendingShow(basis, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 62_000,
      target: { kind: 'main' },
      instance,
      placementId: 'placement-at-end',
    })

    expect(showLoopDurationMs(next)).toBe(67_000)
    expect(next.composition?.scenes[1].zones[0].main).toContainEqual(expect.objectContaining({
      id: 'placement-at-end',
      startMs: 30_000,
      durationMs: 5_000,
    }))
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

  it('partitions one visible Clip when a move straddles hidden internal Scene owners', () => {
    const show = createDefaultShow('show-move-spanning-owner', 'Move spanning owner', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-spanning-move',
      instanceId: instance.id,
      startMs: 20_000,
      durationMs: 5_000,
      view: { mirror: false, phase: 0.25, brightness: 0.8 },
    })

    const next = moveShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-spanning-move',
      },
      target: {
        kind: 'main',
        zoneId: show.zones[0].id,
        globalStartMs: 28_000,
      },
    })

    expect(next).not.toBe(composition)
    expect(next.scenes[0].zones[0].main).toContainEqual(expect.objectContaining({
      id: 'placement-spanning-move',
      startMs: 28_000,
      durationMs: 2_000,
    }))
    expect(next.scenes[1].zones[0].main).toContainEqual(expect.objectContaining({
      logicalClipId: 'placement-spanning-move',
      startMs: 0,
      durationMs: 1_000,
    }))
    const movedLayers = projectShowUnifiedTimeline(show, next).zones[0].layers
    expect(movedLayers[movedLayers.length - 1]?.clips).toContainEqual(
      expect.objectContaining({
        id: 'placement-spanning-move',
        startMs: 28_000,
        durationMs: 5_000,
        endMs: 33_000,
      }),
    )
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

  it('moves sole-use instance automation with a Clip across an internal Scene boundary', () => {
    const show = createDefaultShow('show-move-instance-keyframes', 'Move instance keyframes', 1000)
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
      id: 'track-speed',
      target: { kind: 'instance-time-scale', instanceId: instance.id },
      keyframes: [
        { id: 'key-a', timeMs: 1_500, value: 1, easing: { curve: 'linear' } },
        { id: 'key-b', timeMs: 3_000, value: 2, easing: { curve: 'linear' } },
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
      id: 'track-speed',
      target: { kind: 'instance-time-scale', instanceId: instance.id },
      keyframes: [
        { id: 'key-a', timeMs: 2_500 },
        { id: 'key-b', timeMs: 4_000 },
      ],
    })
  })

  it('partitions sole-use instance automation when a moved Clip spans hidden Scene owners (#63)', () => {
    const show = createDefaultShow('show-move-spanning-instance-keyframes', 'Move spanning instance keyframes', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-move',
      instanceId: instance.id,
      startMs: 20_000,
      durationMs: 5_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].propertyTracks = [{
      id: 'track-speed',
      target: { kind: 'instance-time-scale', instanceId: instance.id },
      keyframes: [
        { id: 'key-a', timeMs: 20_000, value: 1, easing: { curve: 'linear' } },
        { id: 'key-b', timeMs: 25_000, value: 2, easing: { curve: 'linear' } },
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
        globalStartMs: 28_000,
      },
    })

    expect(next).not.toBe(composition)
    expect(next.scenes[0].propertyTracks?.[0]).toMatchObject({
      target: { kind: 'instance-time-scale', instanceId: instance.id },
      keyframes: [
        { timeMs: 28_000, value: 1 },
        { timeMs: 30_000, value: 1.4 },
      ],
    })
    expect(next.scenes[1].propertyTracks?.[0]).toMatchObject({
      target: { kind: 'instance-time-scale', instanceId: instance.id },
      keyframes: [
        { timeMs: 0, value: 1.8 },
        { timeMs: 1_000, value: 2 },
      ],
    })
  })

  it('refuses to move a logical Clip when repartitioning would linearize nonlinear instance animation (#63)', () => {
    const show = createDefaultShow('show-move-spanning-nonlinear', 'Move spanning nonlinear', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-move',
      instanceId: instance.id,
      startMs: 28_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[1].zones[0].main.push({
      id: `placement-move--span-${show.scenes[1].id}`,
      logicalClipId: 'placement-move',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].propertyTracks = [{
      id: 'track-speed',
      target: { kind: 'instance-time-scale', instanceId: instance.id },
      keyframes: [
        { id: 'key-a', timeMs: 0, value: 1, easing: { curve: 'sine', direction: 'in-out' } },
        { id: 'key-b', timeMs: 30_000, value: 2, easing: { curve: 'linear' } },
      ],
    }]

    expect(moveShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-move',
      },
      target: {
        kind: 'main',
        zoneId: show.zones[0].id,
        globalStartMs: 10_000,
      },
    })).toBe(composition)
  })

  it('moves a logical Clip again after its instance automation was partitioned by Scene (#63)', () => {
    const show = createDefaultShow('show-move-spanning-instance-again', 'Move spanning instance again', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-move',
      instanceId: instance.id,
      startMs: 20_000,
      durationMs: 5_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].propertyTracks = [{
      id: 'track-speed',
      target: { kind: 'instance-time-scale', instanceId: instance.id },
      keyframes: [
        { id: 'key-a', timeMs: 20_000, value: 1, easing: { curve: 'linear' } },
        { id: 'key-b', timeMs: 25_000, value: 2, easing: { curve: 'linear' } },
      ],
    }]
    const owner = {
      kind: 'main' as const,
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      placementId: 'placement-move',
    }
    const first = moveShowClipAtGlobalTime(show, composition, {
      owner,
      target: { kind: 'main', zoneId: show.zones[0].id, globalStartMs: 28_000 },
    })

    const second = moveShowClipAtGlobalTime(show, first, {
      owner,
      target: { kind: 'main', zoneId: show.zones[0].id, globalStartMs: 29_000 },
    })

    expect(second).not.toBe(first)
    expect(second.scenes[0].zones[0].main[0]).toMatchObject({
      id: 'placement-move',
      startMs: 29_000,
      durationMs: 1_000,
    })
    expect(second.scenes[1].zones[0].main[0]).toMatchObject({
      logicalClipId: 'placement-move',
      startMs: 0,
      durationMs: 2_000,
    })
    expect(second.scenes[1].propertyTracks?.[0].keyframes).toEqual([
      expect.objectContaining({ timeMs: 0, value: 1.6 }),
      expect.objectContaining({ timeMs: 1_000, value: 1.8 }),
      expect.objectContaining({ timeMs: 2_000, value: 2 }),
    ])
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

  it('splits one logical Clip on either side of a hidden Scene boundary (#63)', () => {
    const show = createDefaultShow('show-split-spanning-clip', 'Split spanning clip', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-spanning',
      instanceId: instance.id,
      startMs: 28_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[1].zones[0].main.push({
      id: 'placement-spanning--span-scene-2',
      logicalClipId: 'placement-spanning',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })

    const next = splitShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-spanning',
      },
      globalTimeMs: 33_000,
      newPlacementId: 'placement-right',
    })

    const clips = projectShowUnifiedTimeline(show, next).zones[0].layers
      .flatMap((layer) => layer.clips)
    expect(clips).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'placement-spanning',
        startMs: 28_000,
        durationMs: 5_000,
        endMs: 33_000,
      }),
      expect.objectContaining({
        id: 'placement-right',
        startMs: 33_000,
        durationMs: 2_000,
        endMs: 35_000,
      }),
    ]))
  })

  it('splits placement animation and retargets the outgoing Transition of a logical Clip (#63)', () => {
    const show = createDefaultShow('show-split-animated-spanning-clip', 'Split animated spanning clip', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-spanning',
      instanceId: instance.id,
      startMs: 28_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[1].zones[0].main.push({
      id: 'placement-spanning--span-scene-2',
      logicalClipId: 'placement-spanning',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    }, {
      id: 'placement-next',
      instanceId: instance.id,
      startMs: 4_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[1].propertyTracks = [{
      id: 'track-brightness',
      target: {
        kind: 'placement-view',
        placementId: 'placement-spanning--span-scene-2',
        property: 'brightness',
      },
      keyframes: [
        { id: 'brightness-a', timeMs: 0, value: 0, easing: { curve: 'linear' } },
        { id: 'brightness-b', timeMs: 3_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]
    composition.transitions = [{
      id: 'transition-spanning-next',
      fromPlacementId: 'placement-spanning--span-scene-2',
      toPlacementId: 'placement-next',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]

    const next = splitShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-spanning',
      },
      globalTimeMs: 33_000,
      newPlacementId: 'placement-right',
    })

    expect(next).not.toBe(composition)
    expect(next.scenes[1].propertyTracks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: expect.objectContaining({ placementId: 'placement-spanning--span-scene-2' }),
      }),
      expect.objectContaining({
        target: expect.objectContaining({ placementId: 'placement-right' }),
      }),
    ]))
    expect(next.transitions).toEqual([
      expect.objectContaining({
        id: 'transition-spanning-next',
        fromPlacementId: 'placement-right',
        toPlacementId: 'placement-next',
      }),
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

  it('duplicates the full duration of one logical Clip after its hidden Scene segments (#63)', () => {
    const show = createDefaultShow('show-duplicate-spanning-clip', 'Duplicate spanning clip', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-spanning',
      instanceId: instance.id,
      startMs: 28_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[1].zones[0].main.push({
      id: 'placement-spanning--span-scene-2',
      logicalClipId: 'placement-spanning',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })

    const next = duplicateShowClipAfter(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-spanning',
      },
      newPlacementId: 'placement-copy',
      newInstanceId: 'instance-copy',
    })

    expect(next.patternInstances).toContainEqual(expect.objectContaining({ id: 'instance-copy' }))
    const clips = projectShowUnifiedTimeline(show, next).zones[0].layers
      .flatMap((layer) => layer.clips)
    expect(clips).toContainEqual(expect.objectContaining({
      id: 'placement-copy',
      instanceId: 'instance-copy',
      startMs: 35_000,
      durationMs: 7_000,
      endMs: 42_000,
    }))
  })

  it('disables Split inside the hidden Scene Transition gap of a logical Clip (#63)', () => {
    const show = createDefaultShow('show-split-transition-gap', 'Split transition gap', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-spanning',
      instanceId: instance.id,
      startMs: 29_000,
      durationMs: 1_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[1].zones[0].main.push({
      id: `placement-spanning--span-${show.scenes[1].id}`,
      logicalClipId: 'placement-spanning',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    const owner = {
      kind: 'main' as const,
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      placementId: 'placement-spanning',
    }

    expect(planShowClipSplitAtGlobalTime(show, composition, {
      owner,
      globalTimeMs: 31_000,
    })).toMatchObject({
      enabled: false,
      code: 'transition-gap',
    })
    expect(splitShowClipAtGlobalTime(show, composition, {
      owner,
      globalTimeMs: 31_000,
      newPlacementId: 'placement-right',
    })).toBe(composition)
  })

  it('rounds one fractional logical Clip split boundary for both resulting halves (#63)', () => {
    const show = createDefaultShow('show-split-fractional', 'Split fractional', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-spanning',
      instanceId: instance.id,
      startMs: 29_000,
      durationMs: 1_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[1].zones[0].main.push({
      id: `placement-spanning--span-${show.scenes[1].id}`,
      logicalClipId: 'placement-spanning',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    const split = splitShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-spanning',
      },
      globalTimeMs: 33_000.5,
      newPlacementId: 'placement-right',
    })

    expect(split).not.toBe(composition)
    expect(validateShowComposition(show, split)).toEqual([])
    expect(projectShowUnifiedTimeline(show, split).zones[0].layers
      .flatMap((layer) => layer.clips)
      .filter((clip) => clip.id === 'placement-spanning' || clip.id === 'placement-right')
      .map((clip) => [clip.id, clip.startMs, clip.endMs])).toEqual([
        ['placement-spanning', 29_000, 33_001],
        ['placement-right', 33_001, 35_000],
      ])
  })

  it('disables Clone when the duplicate would end inside a Scene Transition (#63)', () => {
    const show = createDefaultShow('show-clone-transition-end', 'Clone transition end', 1000)
    show.scenes.push({ id: 'scene-3', name: 'Scene 3', durationMs: 30_000 })
    show.transitions!.push({
      id: 'transition-scene-2',
      afterSceneId: show.scenes[1].id,
      kind: 'crossfade',
      durationMs: 2_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'snapshot-live',
    })
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-spanning',
      instanceId: instance.id,
      startMs: 29_000,
      durationMs: 1_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[1].zones[0].main.push({
      id: `placement-spanning--span-${show.scenes[1].id}`,
      logicalClipId: 'placement-spanning',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 14_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    const owner = {
      kind: 'main' as const,
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      placementId: 'placement-spanning',
    }

    expect(planShowClipDuplicateAfter(show, composition, {
      owner,
      independent: true,
    })).toMatchObject({
      enabled: false,
      code: 'transition-boundary',
    })
    expect(duplicateShowClipAfter(show, composition, {
      owner,
      newPlacementId: 'placement-copy',
      newInstanceId: 'instance-copy',
    })).toBe(composition)
  })

  it('disables Clone when a multi-Scene logical Clip has unsupported placement animation (#63)', () => {
    const show = createDefaultShow('show-duplicate-spanning-animation', 'Duplicate spanning animation', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-spanning',
      instanceId: instance.id,
      startMs: 28_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[1].zones[0].main.push({
      id: 'placement-spanning--span-scene-2',
      logicalClipId: 'placement-spanning',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 3_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[1].propertyTracks = [{
      id: 'brightness-spanning',
      target: {
        kind: 'placement-view',
        placementId: 'placement-spanning--span-scene-2',
        property: 'brightness',
      },
      keyframes: [
        { id: 'brightness-a', timeMs: 0, value: 0.5, easing: { curve: 'linear' } },
        { id: 'brightness-b', timeMs: 3_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]
    const owner = {
      kind: 'main' as const,
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      placementId: 'placement-spanning',
    }

    expect(planShowClipDuplicateAfter(show, composition, {
      owner,
      independent: true,
    })).toMatchObject({
      enabled: false,
      code: 'unsupported-animation',
    })
    expect(duplicateShowClipAfter(show, composition, {
      owner,
      newPlacementId: 'placement-copy',
      newInstanceId: 'instance-copy',
    })).toBe(composition)
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

  it('makes every segment of one logical Clip Pattern-independent with its Scene-local automation (#63)', () => {
    const show = createDefaultShow('show-make-logical-independent', 'Make logical independent', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[0].zones[0].main.push({
      id: 'placement-spanning',
      instanceId: instance.id,
      startMs: 29_000,
      durationMs: 1_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[1].zones[0].main.push({
      id: 'placement-spanning--span-scene-2',
      logicalClipId: 'placement-spanning',
      instanceId: instance.id,
      startMs: 0,
      durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].propertyTracks = [{
      id: 'speed-first',
      target: { kind: 'instance-time-scale', instanceId: instance.id },
      keyframes: [{ id: 'speed-first-key', timeMs: 29_500, value: 2, easing: { curve: 'linear' } }],
    }]
    composition.scenes[1].propertyTracks = [{
      id: 'speed-second',
      target: { kind: 'instance-time-scale', instanceId: instance.id },
      keyframes: [{ id: 'speed-second-key', timeMs: 500, value: 3, easing: { curve: 'linear' } }],
    }]

    const next = makeShowClipPatternIndependent(composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-spanning',
      },
      newInstanceId: 'instance-independent',
    })

    expect(next.scenes[0].zones[0].main[0].instanceId).toBe('instance-independent')
    expect(next.scenes[1].zones[0].main[0].instanceId).toBe('instance-independent')
    expect(next.scenes[0].propertyTracks).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: { kind: 'instance-time-scale', instanceId: 'instance-independent' } }),
    ]))
    expect(next.scenes[1].propertyTracks).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: { kind: 'instance-time-scale', instanceId: 'instance-independent' } }),
    ]))
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

  it('partitions one visible Clip when its start resize crosses hidden Scene owners', () => {
    const show = createDefaultShow('show-resize-spanning-owner', 'Resize spanning owner', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push(instance)
    composition.scenes[1].zones[0].main.push({
      id: 'placement-spanning-resize',
      instanceId: instance.id,
      startMs: 3_000,
      durationMs: 5_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })

    const next = resizeShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[1].id,
        zoneId: show.zones[0].id,
        placementId: 'placement-spanning-resize',
      },
      globalStartMs: 29_000,
      durationMs: 11_000,
    })

    expect(next).not.toBe(composition)
    const resizedLayers = projectShowUnifiedTimeline(show, next).zones[0].layers
    expect(resizedLayers[resizedLayers.length - 1]?.clips).toContainEqual(
      expect.objectContaining({
        id: 'placement-spanning-resize',
        startMs: 29_000,
        durationMs: 11_000,
        endMs: 40_000,
      }),
    )
  })
})
