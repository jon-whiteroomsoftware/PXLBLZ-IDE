import { describe, expect, it } from 'vitest'
import { compileShow } from './showCompiler'
import { validateShowComposition } from './showCompositionModel'
import { createDefaultShow, showRecordToCompileRecipe } from './showModel'
import {
  projectShowGroupClipInspector,
  updateShowGroupClipInspector,
} from './showGroupClipInspectorModel'
import { validateShowGroups } from './showGroupModel'
import type {
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
  ShowRecord,
} from './personalContentRecords'

const SOURCE = `
export function sliderSpeed(value) {}
export function sliderOther(value) {}
export function render(index) { rgb(1, 0, 0) }
`

function propertyTrack(id: string, target: ShowPropertyAnimationTarget): ShowPropertyAnimationTrack {
  return {
    id,
    target,
    keyframes: [
      { id: `${id}-start`, timeMs: 250, value: 0.2, easing: { curve: 'linear' } },
      { id: `${id}-end`, timeMs: 1_000, value: 0.8, easing: { curve: 'linear' } },
    ],
  }
}

function expectValidAndCompilable(show: ShowRecord): void {
  expect(validateShowComposition(show, show.composition!)).toEqual([])
  const definitions = new Map(show.composition?.groupDefinitions?.map((definition) => [definition.id, definition]))
  const byPatternInstanceId = Object.fromEntries((show.composition?.groupOccurrences ?? []).flatMap((occurrence) => (
    definitions.get(occurrence.definitionId)?.patternInstances.map((instance) => (
      [`${occurrence.id}:${instance.id}`, SOURCE]
    )) ?? []
  )))
  expect(() => compileShow(showRecordToCompileRecipe(show, {
    byCellId: {},
    byPatternInstanceId,
  }), {})).not.toThrow()
}

function fixture() {
  const show = createDefaultShow('group-inspector', 'Group inspector', 100)
  const sceneId = show.scenes[0].id
  const zoneId = show.zones[0].id
  show.composition = {
    version: 1,
    executionModel: 'deterministic-loop',
    patternInstances: [],
    scenes: show.scenes.map((scene) => ({
      sceneId: scene.id,
      zones: [{ zoneId, main: [], overlays: [] }],
    })),
    groupDefinitions: [{
      id: 'phrase',
      name: 'Phrase',
      patternInstances: [{
        id: 'inside-instance',
        pattern: { kind: 'stock', id: 'hue-wave' },
        patternName: 'Hue Wave',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'inside-clip',
        instanceId: 'inside-instance',
        layerOffset: 1,
        startMs: 250,
        durationMs: 1_000,
        opacity: 0.75,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }],
    groupOccurrences: [
      { id: 'use-a', definitionId: 'phrase', sceneId, zoneId, startMs: 0, baseLayer: 0, translationX: 0, translationY: 0 },
      { id: 'use-b', definitionId: 'phrase', sceneId, zoneId, startMs: 2_000, baseLayer: 0, translationX: 0, translationY: 0 },
    ],
  }
  return show
}

describe('Show Group Clip inspector model', () => {
  it('projects a definition child through one occurrence in Show-global time (#634)', () => {
    const value = projectShowGroupClipInspector(fixture(), {
      occurrenceId: 'use-b',
      placementId: 'inside-clip',
    })

    expect(value).toMatchObject({
      patternName: 'Hue Wave',
      placementId: 'inside-clip',
      instanceId: 'inside-instance',
      local: { startMs: 2_250, durationMs: 1_000, opacity: 0.75 },
    })
  })

  it('projects Opacity when a Group child lands on Main (#882)', () => {
    const show = fixture()
    show.composition!.groupDefinitions![0].placements[0].layerOffset = 0

    expect(projectShowGroupClipInspector(show, {
      occurrenceId: 'use-a',
      placementId: 'inside-clip',
    })).toMatchObject({
      scope: 'scene-main',
      local: { opacity: 0.75 },
    })
  })

  it('converts a Show-global Start edit back to the shared Group offset (#634)', () => {
    const show = fixture()
    const original = structuredClone(show)
    const updated = updateShowGroupClipInspector(show, {
      occurrenceId: 'use-b',
      placementId: 'inside-clip',
    }, {
      local: { startMs: 2_750 },
    })

    expect(show).toEqual(original)
    expect(updated.composition?.groupDefinitions?.[0].placements[0].startMs).toBe(750)
    expect(projectShowGroupClipInspector(updated, {
      occurrenceId: 'use-b',
      placementId: 'inside-clip',
    })?.local?.startMs).toBe(2_750)
    expect(projectShowGroupClipInspector(updated, {
      occurrenceId: 'use-a',
      placementId: 'inside-clip',
    })?.local?.startMs).toBe(750)
    expect(validateShowGroups(updated, updated.composition!)).toEqual([])
  })

  it('edits the shared definition so every linked occurrence receives the change', () => {
    const show = fixture()
    const updated = updateShowGroupClipInspector(show, {
      occurrenceId: 'use-a',
      placementId: 'inside-clip',
    }, {
      transform: { positionX: 0.2 },
      simulation: { timeOffsetMs: 500 },
      local: { durationMs: 1_500 },
    })

    expect(updated).not.toBe(show)
    expect(updated.composition?.groupDefinitions?.[0]).toMatchObject({
      patternInstances: [{ time: { timeScale: 1, timeOffsetMs: 500 } }],
      placements: [{ durationMs: 1_500, transform: { positionX: 0.2 } }],
    })
    expect(updated.composition?.groupOccurrences).toHaveLength(2)
  })

  it('keeps only replacement-Pattern controls and tracks in a shared Group definition (#828)', () => {
    const show = fixture()
    const definition = show.composition!.groupDefinitions![0]
    definition.patternInstances[0].controlTargets = { sliderSpeed: 0.5, sliderOrphaned: 0.7 }
    definition.propertyTracks = [
      propertyTrack('track-control-speed', {
        kind: 'instance-control', instanceId: 'inside-instance', exportName: 'sliderSpeed',
      }),
      propertyTrack('track-control-orphaned', {
        kind: 'instance-control', instanceId: 'inside-instance', exportName: 'sliderOrphaned',
      }),
      propertyTrack('track-brightness', {
        kind: 'placement-view', placementId: 'inside-clip', property: 'brightness',
      }),
    ]
    const original = structuredClone(show)
    expect(validateShowComposition(show, show.composition!)).toEqual([])

    const updated = updateShowGroupClipInspector(show, {
      occurrenceId: 'use-a',
      placementId: 'inside-clip',
    }, {
      pattern: { ref: { kind: 'stock', id: 'Caustics' }, name: 'Caustics' },
    }, new Set(['sliderSpeed']))

    expect(show).toEqual(original)
    expect(updated.composition?.groupDefinitions?.[0].patternInstances[0].controlTargets)
      .toEqual({ sliderSpeed: 0.5 })
    expect(updated.composition?.groupDefinitions?.[0].propertyTracks?.map((track) => track.id))
      .toEqual(['track-control-speed', 'track-brightness'])
    expect(updated.composition?.groupOccurrences?.map((occurrence) => occurrence.definitionId))
      .toEqual(['phrase', 'phrase'])
    expectValidAndCompilable(updated)
  })

  it('removes only control tracks omitted by an authored-control edit (#628)', () => {
    const show = fixture()
    const definition = show.composition!.groupDefinitions![0]
    definition.patternInstances[0].controlTargets = { sliderSpeed: 0.5, sliderOther: 0.4 }
    definition.propertyTracks = [
      propertyTrack('track-control-speed', {
        kind: 'instance-control', instanceId: 'inside-instance', exportName: 'sliderSpeed',
      }),
      propertyTrack('track-control-other', {
        kind: 'instance-control', instanceId: 'inside-instance', exportName: 'sliderOther',
      }),
    ]
    const original = structuredClone(show)

    const updated = updateShowGroupClipInspector(show, {
      occurrenceId: 'use-a',
      placementId: 'inside-clip',
    }, {
      simulation: { controlTargets: { sliderOther: 0.6 } },
    })

    expect(show).toEqual(original)
    expect(updated.composition?.groupDefinitions?.[0].propertyTracks?.map((track) => track.id))
      .toEqual(['track-control-other'])
    expectValidAndCompilable(updated)
  })

  it.each([
    ['removes', [], ['track-brightness']],
    ['replaces', [{ id: 'move-new', kind: 'translate' as const, x: 0.1, y: 0.2 }], ['track-brightness']],
    ['updates', [{ id: 'move', kind: 'translate' as const, x: 0.1, y: 0.2 }], ['track-effect-x', 'track-brightness']],
  ])('%s only the edited placement Effect tracks whose Effect identity disappears (#628)', (
    _operation,
    effects,
    expectedTrackIds,
  ) => {
    const show = fixture()
    const definition = show.composition!.groupDefinitions![0]
    definition.placements[0].effects = [{ id: 'move', kind: 'translate', x: 0, y: 0 }]
    definition.propertyTracks = [
      propertyTrack('track-effect-x', {
        kind: 'placement-effect',
        placementId: 'inside-clip',
        effectId: 'move',
        effectKind: 'translate',
        parameterId: 'translateX',
      }),
      propertyTrack('track-brightness', {
        kind: 'placement-view', placementId: 'inside-clip', property: 'brightness',
      }),
    ]
    const original = structuredClone(show)
    expect(validateShowComposition(show, show.composition!)).toEqual([])

    const updated = updateShowGroupClipInspector(show, {
      occurrenceId: 'use-a',
      placementId: 'inside-clip',
    }, { effects })

    expect(show).toEqual(original)
    expect(updated.composition?.groupDefinitions?.[0].propertyTracks?.map((track) => track.id))
      .toEqual(expectedTrackIds)
    expectValidAndCompilable(updated)
  })

  it('preserves tracks owned by other Group Clips and other Group definitions byte-for-byte (#628)', () => {
    const show = fixture()
    const definition = show.composition!.groupDefinitions![0]
    definition.patternInstances[0].controlTargets = { sliderSpeed: 0.5 }
    definition.patternInstances.push({
      id: 'other-instance',
      pattern: { kind: 'stock', id: 'hue-wave' },
      patternName: 'Other Hue Wave',
      time: { timeScale: 1, timeOffsetMs: 0 },
      controlTargets: { sliderOther: 0.4 },
    })
    definition.placements[0].effects = [{ id: 'move', kind: 'translate', x: 0, y: 0 }]
    definition.placements.push({
      id: 'other-clip',
      instanceId: 'other-instance',
      layerOffset: 2,
      startMs: 250,
      durationMs: 1_000,
      opacity: 0.6,
      view: { mirror: false, phase: 0, brightness: 0.9 },
      effects: [{ id: 'other-move', kind: 'translate', x: 0, y: 0 }],
    })
    definition.propertyTracks = [
      propertyTrack('remove-control', {
        kind: 'instance-control', instanceId: 'inside-instance', exportName: 'sliderSpeed',
      }),
      propertyTrack('remove-effect', {
        kind: 'placement-effect',
        placementId: 'inside-clip',
        effectId: 'move',
        effectKind: 'translate',
        parameterId: 'translateX',
      }),
      propertyTrack('keep-transform', {
        kind: 'placement-transform', placementId: 'inside-clip', property: 'positionX',
      }),
      propertyTrack('keep-other-control', {
        kind: 'instance-control', instanceId: 'other-instance', exportName: 'sliderOther',
      }),
      propertyTrack('keep-other-effect', {
        kind: 'placement-effect',
        placementId: 'other-clip',
        effectId: 'other-move',
        effectKind: 'translate',
        parameterId: 'translateX',
      }),
    ]
    show.composition!.groupDefinitions!.push({
      id: 'other-definition',
      name: 'Other definition',
      patternInstances: [{
        id: 'definition-instance',
        pattern: { kind: 'stock', id: 'hue-wave' },
        patternName: 'Definition Hue Wave',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'definition-clip',
        instanceId: 'definition-instance',
        layerOffset: 0,
        startMs: 0,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
      propertyTracks: [propertyTrack('definition-brightness', {
        kind: 'placement-view', placementId: 'definition-clip', property: 'brightness',
      })],
    })
    const preservedTracks = structuredClone(definition.propertyTracks.slice(2))
    const preservedDefinition = show.composition!.groupDefinitions![1]
    const original = structuredClone(show)

    const updated = updateShowGroupClipInspector(show, {
      occurrenceId: 'use-a',
      placementId: 'inside-clip',
    }, {
      pattern: { ref: { kind: 'stock', id: 'Caustics' }, name: 'Caustics' },
      effects: [],
    })

    expect(show).toEqual(original)
    expect(updated.composition?.groupDefinitions?.[0].propertyTracks).toEqual(preservedTracks)
    expect(updated.composition?.groupDefinitions?.[1]).toBe(preservedDefinition)
    expectValidAndCompilable(updated)
  })

  it('rejects edits when the occurrence, placement, or values are invalid', () => {
    const show = fixture()
    expect(updateShowGroupClipInspector(show, {
      occurrenceId: 'missing',
      placementId: 'inside-clip',
    }, { local: { durationMs: 500 } })).toBe(show)
    expect(updateShowGroupClipInspector(show, {
      occurrenceId: 'use-a',
      placementId: 'inside-clip',
    }, { local: { durationMs: 0 } })).toBe(show)
  })
})
