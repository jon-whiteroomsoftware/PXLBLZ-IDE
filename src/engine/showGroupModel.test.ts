import { describe, expect, it } from 'vitest'
import type {
  ShowCompositionV1,
  ShowGroupDefinition,
  ShowGroupOccurrence,
  ShowRecord,
} from './personalContentRecords'
import {
  completeShowGroupSelection,
  createShowGroupFromSelection,
  deleteShowGroupOccurrence,
  duplicateShowGroupOccurrence,
  makeShowGroupOccurrenceUnique,
  materializeShowGroupOccurrences,
  translateShowGroupOccurrence,
  updateShowGroupOccurrencePlacement,
  ungroupShowGroupOccurrence,
  validateShowGroupSelection,
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
  it('auto-completes a marquee seed through the full non-Cut Transition chain', () => {
    const { composition } = fixture()
    composition.patternInstances = [patternInstance('outside')]
    composition.scenes[0].zones[0].main = [
      { id: 'left', instanceId: 'outside', startMs: 0, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } },
      { id: 'right', instanceId: 'outside', startMs: 1_250, durationMs: 750, view: { mirror: false, phase: 0, brightness: 1 } },
    ]
    composition.transitions = [{
      id: 'transition-left-right',
      fromPlacementId: 'left',
      toPlacementId: 'right',
      kind: 'crossfade',
      durationMs: 250,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]

    expect(completeShowGroupSelection(composition, ['left'])).toEqual({
      placementIds: ['left', 'right'],
      transitionIds: ['transition-left-right'],
    })
    expect(validateShowGroupSelection(composition, {
      placementIds: ['left'],
      transitionIds: ['transition-left-right'],
    })).toMatchObject({
      enabled: false,
      code: 'partial-transition-chain',
    })
  })

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

  it('moves only the occurrence shell while preserving the linked definition', () => {
    const { composition } = fixture()
    composition.groupOccurrences!.push(occurrence('group-use-2'))

    const updated = updateShowGroupOccurrencePlacement(composition, {
      occurrenceId: 'group-use-1',
      startMs: 3_000,
      baseLayer: 2,
    })

    expect(updated.groupOccurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'group-use-1', startMs: 3_000, baseLayer: 2 }),
      expect.objectContaining({ id: 'group-use-2', startMs: 2_000, baseLayer: 0 }),
    ]))
    expect(updated.groupDefinitions).toBe(composition.groupDefinitions)
  })

  it('deletes one occurrence and removes its definition only after the last use', () => {
    const { composition } = fixture()
    composition.groupOccurrences!.push(occurrence('group-use-2'))

    const linked = deleteShowGroupOccurrence(composition, 'group-use-1')
    expect(linked.groupOccurrences?.map((candidate) => candidate.id)).toEqual(['group-use-2'])
    expect(linked.groupDefinitions).toHaveLength(1)

    const last = deleteShowGroupOccurrence(linked, 'group-use-2')
    expect(last.groupOccurrences).toBeUndefined()
    expect(last.groupDefinitions).toBeUndefined()
  })

  it('duplicates a linked occurrence but keeps runtime Pattern identities occurrence-local', () => {
    const { composition } = fixture()
    const duplicated = duplicateShowGroupOccurrence(composition, {
      occurrenceId: 'group-use-1',
      newOccurrenceId: 'group-use-2',
      startMs: 5_000,
    })

    expect(duplicated.groupDefinitions).toHaveLength(1)
    expect(duplicated.groupOccurrences).toEqual([
      occurrence(),
      { ...occurrence('group-use-2'), startMs: 5_000 },
    ])
    const materialized = materializeShowGroupOccurrences(duplicated)
    expect(materialized.patternInstances.map((instance) => instance.id)).toEqual([
      'group-use-1:inside-1',
      'group-use-2:inside-1',
    ])
  })

  it('makes one occurrence unique without removing its Group container', () => {
    const { composition } = fixture()
    composition.groupOccurrences!.push({ ...occurrence('group-use-2'), startMs: 5_000 })
    const unique = makeShowGroupOccurrenceUnique(composition, {
      occurrenceId: 'group-use-2',
      newDefinitionId: 'group-def-2',
      name: 'Pulse phrase variation',
    })

    expect(unique.groupDefinitions).toHaveLength(2)
    expect(unique.groupOccurrences?.find((item) => item.id === 'group-use-1')?.definitionId).toBe('group-def-1')
    expect(unique.groupOccurrences?.find((item) => item.id === 'group-use-2')?.definitionId).toBe('group-def-2')
    expect(unique.groupDefinitions?.find((item) => item.id === 'group-def-2')?.name).toBe('Pulse phrase variation')
  })

  it('applies only X/Y occurrence translation and materializes children without a Group shell', () => {
    const { composition } = fixture()
    const translated = translateShowGroupOccurrence(composition, {
      occurrenceId: 'group-use-1',
      translationX: 0.25,
      translationY: -0.1,
    })
    const materialized = materializeShowGroupOccurrences(translated)
    const zone = materialized.scenes[0].zones[0]

    expect(materialized.groupOccurrences).toBeUndefined()
    expect(materialized.groupDefinitions).toBeUndefined()
    expect(zone.main.map((placement) => [placement.id, placement.startMs])).toEqual([
      ['group-use-1:a', 2_000],
      ['group-use-1:b', 3_250],
    ])
    expect(zone.overlays).toHaveLength(1)
    expect(zone.overlays[0].placements[0]).toMatchObject({
      id: 'group-use-1:accent',
      startMs: 2_500,
      transform: { positionX: 0.25, positionY: -0.1, rotation: 0, scaleX: 1, scaleY: 1 },
    })
    expect(materialized.transitions?.[0]).toMatchObject({
      id: 'group-use-1:ab',
      fromPlacementId: 'group-use-1:a',
      toPlacementId: 'group-use-1:b',
    })
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

  it('extracts a cross-Layer selection into one occurrence and ungroups it back into ordinary Clips', () => {
    const { composition } = fixture()
    composition.groupDefinitions = []
    composition.groupOccurrences = []
    composition.patternInstances = [patternInstance('shared')]
    composition.scenes[0].zones[0] = {
      zoneId: 'zone-1',
      main: [
        { id: 'left', instanceId: 'shared', startMs: 1_000, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } },
        { id: 'right', instanceId: 'shared', startMs: 2_250, durationMs: 750, view: { mirror: false, phase: 0, brightness: 1 } },
      ],
      overlays: [{
        id: 'overlay',
        name: 'Overlay',
        placements: [{
          id: 'accent', instanceId: 'shared', startMs: 1_500, durationMs: 500, opacity: 0.5,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
      }],
    }
    composition.transitions = [{
      id: 'left-right', fromPlacementId: 'left', toPlacementId: 'right', kind: 'crossfade',
      durationMs: 250, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
    }]

    const grouped = createShowGroupFromSelection(composition, {
      selection: completeShowGroupSelection(composition, ['left', 'accent']),
      definitionId: 'phrase',
      occurrenceId: 'phrase-use',
      name: 'Phrase',
    })

    expect(grouped.patternInstances).toEqual([])
    expect(grouped.scenes[0].zones[0].main).toEqual([])
    expect(grouped.scenes[0].zones[0].overlays[0].placements).toEqual([])
    expect(grouped.transitions).toEqual([])
    expect(grouped.groupOccurrences).toEqual([{
      id: 'phrase-use', definitionId: 'phrase', sceneId: 'scene-1', zoneId: 'zone-1',
      startMs: 1_000, baseLayer: 0, translationX: 0, translationY: 0,
    }])
    expect(grouped.groupDefinitions?.[0]).toMatchObject({
      id: 'phrase',
      placements: expect.arrayContaining([
        expect.objectContaining({ id: 'left', startMs: 0, layerOffset: 0 }),
        expect.objectContaining({ id: 'right', startMs: 1_250, layerOffset: 0 }),
        expect.objectContaining({ id: 'accent', startMs: 500, layerOffset: 1 }),
      ]),
      transitions: [expect.objectContaining({ id: 'left-right' })],
    })

    const ungrouped = ungroupShowGroupOccurrence(grouped, 'phrase-use')
    expect(ungrouped.groupDefinitions).toBeUndefined()
    expect(ungrouped.groupOccurrences).toBeUndefined()
    expect(ungrouped.patternInstances.map((instance) => instance.id)).toEqual(['phrase-use:shared'])
    expect(ungrouped.scenes[0].zones[0].main.map((placement) => placement.id)).toEqual([
      'phrase-use:left',
      'phrase-use:right',
    ])
    expect(ungrouped.scenes[0].zones[0].overlays[0].placements[0].id).toBe('phrase-use:accent')
  })

  it('copies shared-instance animation into a Group without stealing it from unselected Clips', () => {
    const { composition } = fixture()
    composition.groupDefinitions = []
    composition.groupOccurrences = []
    composition.patternInstances = [patternInstance('shared')]
    composition.scenes[0].zones[0].main = [
      { id: 'selected', instanceId: 'shared', startMs: 1_000, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } },
      { id: 'outside', instanceId: 'shared', startMs: 3_000, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } },
    ]
    composition.scenes[0].propertyTracks = [{
      id: 'speed',
      target: { kind: 'instance-time-scale', instanceId: 'shared' },
      keyframes: [
        { id: 'speed-a', timeMs: 1_000, value: 0.5, easing: { curve: 'linear' } },
        { id: 'speed-b', timeMs: 1_500, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    const grouped = createShowGroupFromSelection(composition, {
      selection: { placementIds: ['selected'], transitionIds: [] },
      definitionId: 'phrase',
      occurrenceId: 'phrase-use',
      name: 'Phrase',
    })

    expect(grouped.groupDefinitions?.[0].propertyTracks?.[0]).toMatchObject({
      id: 'speed',
      target: { kind: 'instance-time-scale', instanceId: 'shared' },
      keyframes: [{ id: 'speed-a', timeMs: 0 }, { id: 'speed-b', timeMs: 500 }],
    })
    expect(grouped.scenes[0].propertyTracks?.[0].id).toBe('speed')
    expect(grouped.patternInstances.map((instance) => instance.id)).toEqual(['shared'])
  })
})
