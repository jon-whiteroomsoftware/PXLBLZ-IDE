import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import {
  addShowMainClipAtGlobalTime,
  moveShowClipAtGlobalTime,
  planShowMainClipAtGlobalTime,
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
})
