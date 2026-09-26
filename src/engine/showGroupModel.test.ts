import { describe, expect, it } from 'vitest'
import type {
  ShowCompositionV1,
  ShowGroupDefinition,
  ShowGroupOccurrence,
  ShowRecord,
} from './personalContentRecords'
import {
  materializeShowGroupOccurrences,
  validateShowGroups,
} from './showGroupModel'
import { createDefaultShow } from './showModel'

function patternInstance(id: string) {
  return {
    id,
    pattern: { kind: 'stock' as const, id: 'hue-wave' },
    patternName: 'Hue Wave',
    time: { timeScale: 1, timeOffsetMs: 0 },
  }
}

function definition(id = 'group-def-1'): ShowGroupDefinition {
  return {
    id,
    name: 'Pulse phrase',
    patternInstances: [patternInstance('inside-1')],
    placements: [
      {
        id: 'a',
        instanceId: 'inside-1',
        layerOffset: 0,
        startMs: 0,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
      {
        id: 'b',
        instanceId: 'inside-1',
        layerOffset: 0,
        startMs: 1_250,
        durationMs: 750,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
      {
        id: 'accent',
        instanceId: 'inside-1',
        layerOffset: 1,
        startMs: 500,
        durationMs: 500,
        opacity: 0.6,
        view: { mirror: false, phase: 0, brightness: 0.8 },
      },
    ],
    transitions: [{
      id: 'ab',
      fromPlacementId: 'a',
      toPlacementId: 'b',
      kind: 'crossfade',
      durationMs: 250,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }],
  }
}

function occurrence(id = 'group-use-1', definitionId = 'group-def-1'): ShowGroupOccurrence {
  return {
    id,
    definitionId,
    sceneId: 'scene-1',
    zoneId: 'zone-1',
    startMs: 2_000,
    baseLayer: 0,
    translationX: 0,
    translationY: 0,
  }
}

function fixture(): { show: ShowRecord; composition: ShowCompositionV1 } {
  const show = createDefaultShow('show-groups', 'Groups', 1)
  show.scenes[0].durationMs = 10_000
  return {
    show,
    composition: {
      version: 1,
      executionModel: 'deterministic-loop',
      patternInstances: [],
      scenes: [{
        sceneId: 'scene-1',
        zones: [{ zoneId: 'zone-1', main: [], overlays: [] }],
      }],
      groupDefinitions: [definition()],
      groupOccurrences: [occurrence()],
    },
  }
}

describe('Show Group model', () => {
  it('rejects cross-Zone, cross-Scene, nested, and partial-Transition structures', () => {
    const { show, composition } = fixture()
    composition.groupOccurrences!.push(
      { ...occurrence('wrong-zone'), zoneId: 'missing-zone' },
      { ...occurrence('wrong-scene'), sceneId: 'missing-scene' },
    )
    composition.groupDefinitions![0].placements[1].layerOffset = 1

    expect(validateShowGroups(show, composition).map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'missing-zone',
      'missing-scene',
      'cross-layer',
    ]))
  })

  it('rejects a globally valid Zone that is absent from the occurrence Scene composition', () => {
    const { show, composition } = fixture()
    show.zones.push({ ...show.zones[0], id: 'zone-2', name: 'Second Zone' })
    composition.groupOccurrences![0].zoneId = 'zone-2'

    expect(validateShowGroups(show, composition)).toContainEqual(expect.objectContaining({
      path: 'groupOccurrences[0].zoneId',
      code: 'missing-zone',
    }))
  })

  it('adds occurrence translation to animated Transform and Viewport coordinates', () => {
    const { composition } = fixture()
    composition.groupOccurrences![0] = {
      ...composition.groupOccurrences![0],
      translationX: 0.25,
      translationY: -0.1,
    }
    composition.groupDefinitions![0].propertyTracks = [{
      id: 'move-x',
      target: { kind: 'placement-transform', placementId: 'accent', property: 'positionX' },
      keyframes: [
        { id: 'move-x-a', timeMs: 500, value: 0.1, easing: { curve: 'linear' } },
        { id: 'move-x-b', timeMs: 900, value: 0.4, easing: { curve: 'linear' } },
      ],
    }, {
      id: 'viewport-y',
      target: { kind: 'placement-viewport', placementId: 'accent', property: 'y' },
      keyframes: [
        { id: 'viewport-y-a', timeMs: 500, value: -0.2, easing: { curve: 'linear' } },
        { id: 'viewport-y-b', timeMs: 900, value: 0.3, easing: { curve: 'linear' } },
      ],
    }]

    const tracks = materializeShowGroupOccurrences(composition).scenes[0].propertyTracks!

    expect(tracks.find((track) => track.id === 'group-use-1:move-x')?.keyframes.map((keyframe) => keyframe.value))
      .toEqual([0.35, 0.65])
    const viewportValues = tracks.find((track) => track.id === 'group-use-1:viewport-y')!.keyframes
      .map((keyframe) => keyframe.value)
    expect(viewportValues[0]).toBeCloseTo(-0.3)
    expect(viewportValues[1]).toBeCloseTo(0.2)
  })
})
