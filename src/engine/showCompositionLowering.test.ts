import { describe, expect, it } from 'vitest'
import { createDefaultShow, showRecordToCompileRecipe } from './showModel'
import { lowerShowCompositionForCompile } from './showCompositionLowering'
import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'

const SOURCE_A = 'export function render(index) { rgb(1, 0, 0) }'
const SOURCE_B = 'export function render(index) { rgb(0, 0, 1) }'

function composition(): ShowCompositionV1 {
  return {
    version: 1,
    patternInstances: [
      {
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'TestPattern1D' },
        patternName: 'TestPattern1D',
        time: { timeScale: 0.5, timeOffsetMs: 25 },
      },
      {
        id: 'instance-b',
        pattern: { kind: 'stock', id: 'CometLoom' },
        patternName: 'CometLoom',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
    ],
    scenes: [
      {
        sceneId: 'scene-1',
        zones: [{
          zoneId: 'zone-1',
          main: [
            {
              id: 'placement-a-1',
              instanceId: 'instance-a',
              startMs: 0,
              durationMs: 4_000,
              view: { mirror: false, phase: 0, brightness: 0.8 },
            },
            {
              id: 'placement-b',
              instanceId: 'instance-b',
              startMs: 5_000,
              durationMs: 3_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            },
            {
              id: 'placement-a-2',
              instanceId: 'instance-a',
              startMs: 8_000,
              durationMs: 2_000,
              view: { mirror: false, phase: 0, brightness: 0.6 },
            },
          ],
          overlays: [],
        }],
      },
      {
        sceneId: 'scene-2',
        zones: [{
          zoneId: 'zone-1',
          main: [{
            id: 'placement-b-2',
            instanceId: 'instance-b',
            startMs: 0,
            durationMs: 30_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      },
    ],
  }
}

function fixture(): ShowRecord {
  return {
    ...createDefaultShow('composition-lowering', 'Composition lowering', 1),
    composition: composition(),
  }
}

function lookup(show: ShowRecord) {
  return {
    byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, SOURCE_A])),
    byPatternInstanceId: {
      'instance-a': SOURCE_A,
      'instance-b': SOURCE_B,
    },
  }
}

describe('Show composition compiler lowering (#488)', () => {
  it('leaves flat Shows and their source lookup untouched', () => {
    const show = createDefaultShow('flat', 'Flat', 1)
    const sources = lookup(show)

    expect(lowerShowCompositionForCompile(show, sources)).toEqual({ show, lookup: sources })
  })

  it('expands local Main boundaries into deterministic cut Scenes while preserving gaps', () => {
    const show = fixture()
    const lowered = lowerShowCompositionForCompile(show, lookup(show))

    expect(lowered.show.composition).toBeUndefined()
    expect(lowered.show.scenes.map((scene) => scene.durationMs)).toEqual([
      4_000, 1_000, 3_000, 2_000, 20_000, 30_000,
    ])
    expect(lowered.show.scenes.map((scene) => (
      lowered.show.transitions.find((transition) => transition.afterSceneId === scene.id)?.kind ?? null
    ))).toEqual(['cut', 'cut', 'cut', 'cut', 'crossfade', null])
    expect(lowered.show.cells.map((cell) => cell.patternName)).toEqual([
      'TestPattern1D', 'CometLoom', 'TestPattern1D', 'CometLoom',
    ])
    expect(Object.values(lowered.lookup.instanceIdByCellId ?? {})).toEqual([
      'instance-a', 'instance-b', 'instance-a', 'instance-b',
    ])
  })

  it('lowers a literal Layer transition interval instead of compiling its gap as dead air (#583)', () => {
    const show = fixture()
    show.composition!.transitions = [{
      id: 'layer-transition-a-b',
      fromPlacementId: 'placement-a-1',
      toPlacementId: 'placement-b',
      kind: 'wipe',
      durationMs: 1_000,
      easing: { curve: 'sine', direction: 'in-out' },
      wipeVariant: 'linear',
      direction: 0,
    }]

    const lowered = lowerShowCompositionForCompile(show, lookup(show))

    expect(lowered.show.scenes.map((scene) => scene.durationMs)).toEqual([
      4_000, 3_000, 2_000, 20_000, 30_000,
    ])
    expect(lowered.show.transitions.map((transition) => [transition.kind, transition.durationMs])).toEqual([
      ['wipe', 1_000],
      ['cut', 0],
      ['cut', 0],
      ['crossfade', 2_000],
    ])
    expect(showRecordToCompileRecipe(show, lookup(show)).routedSceneSequence?.scenes[0].transitionOut).toMatchObject({
      kind: 'wipe',
      durationMs: 1_000,
    })
  })

  it('lifts a Layer transition over unrelated content that spans its complete interval', () => {
    const show = fixture()
    show.composition!.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        id: 'overlay-through-transition',
        instanceId: 'instance-a',
        startMs: 0,
        durationMs: 8_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]
    show.composition!.transitions = [{
      id: 'layer-transition-a-b',
      fromPlacementId: 'placement-a-1',
      toPlacementId: 'placement-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]

    const recipe = showRecordToCompileRecipe(show, lookup(show))

    expect(recipe.routedSceneSequence?.scenes[0]).toMatchObject({
      transitionOut: { kind: 'crossfade', durationMs: 1_000 },
      placements: expect.arrayContaining([
        expect.objectContaining({ placementId: 'placement-a-1', stackOrder: 0 }),
        expect.objectContaining({ placementId: 'overlay-through-transition', stackOrder: 1 }),
      ]),
    })
    expect(recipe.routedSceneSequence?.scenes[1].placements).toEqual(expect.arrayContaining([
      expect.objectContaining({ placementId: 'placement-b', stackOrder: 0 }),
      expect.objectContaining({ placementId: 'overlay-through-transition', stackOrder: 1 }),
    ]))
  })

  it('defensively rejects Fade and Motion transitions over unrelated spanning content', () => {
    const show = fixture()
    show.composition!.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        id: 'overlay-through-transition',
        instanceId: 'instance-a',
        startMs: 0,
        durationMs: 8_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]

    for (const transition of [
      {
        id: 'fade-a-b',
        fromPlacementId: 'placement-a-1',
        toPlacementId: 'placement-b',
        kind: 'fade-color' as const,
        durationMs: 1_000,
        easing: { curve: 'linear' as const },
        color: '#000000',
      },
      {
        id: 'motion-a-b',
        fromPlacementId: 'placement-a-1',
        toPlacementId: 'placement-b',
        kind: 'motion' as const,
        motionVariant: 'cover' as const,
        durationMs: 1_000,
        easing: { curve: 'linear' as const },
      },
    ]) {
      show.composition!.transitions = [transition]
      expect(() => lowerShowCompositionForCompile(show, lookup(show))).toThrow(
        'Fade and Motion Layer transitions cannot pass over an unrelated Clip.',
      )
    }
  })

  it('blocks a Layer transition when unrelated content changes inside its interval', () => {
    const show = fixture()
    show.composition!.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        id: 'overlay-partial-transition',
        instanceId: 'instance-a',
        startMs: 3_500,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]
    show.composition!.transitions = [{
      id: 'layer-transition-a-b',
      fromPlacementId: 'placement-a-1',
      toPlacementId: 'placement-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]

    expect(() => lowerShowCompositionForCompile(show, lookup(show))).toThrow(
      'An unrelated Clip cannot start or stop at or inside a Layer transition.',
    )
  })

  it('compiles one member per explicit Pattern instance across cuts and gaps', () => {
    const show = fixture()
    const recipe = showRecordToCompileRecipe(show, lookup(show))

    expect(recipe.clips.map((clip) => clip.id).sort()).toEqual([
      '__pxlblz_empty-routed',
      'instance-a',
      'instance-b',
    ].sort())
    expect(recipe.routedSceneSequence?.scenes.map((scene) => scene.placements[0].clipId)).toEqual([
      'instance-a',
      '__pxlblz_empty-routed',
      'instance-b',
      'instance-a',
      '__pxlblz_empty-routed',
      'instance-b',
    ])
    expect(recipe.routedSceneSequence?.scenes.map((scene) => scene.placements[0].brightness ?? 1)).toEqual([
      0.8, 1, 1, 0.6, 1, 1,
    ])
  })

  it('preserves the qualified Rolling Refresh policy on an explicit Pattern instance', () => {
    const show = fixture()
    show.composition!.patternInstances[0].evaluationPolicy = 'rolling-refresh'

    const recipe = showRecordToCompileRecipe(show, lookup(show))

    expect(recipe.clips.find((clip) => clip.id === 'instance-a')).toMatchObject({
      evaluationPolicy: 'rolling-refresh',
      rollingRefreshSlices: 4,
    })
  })

  it('carries stable typed tracks and source-Scene offsets through derived local holds (#490)', () => {
    const show = fixture()
    show.composition!.scenes[0].propertyTracks = [{
      id: 'speed-track',
      target: { kind: 'instance-time-scale', instanceId: 'instance-a' },
      keyframes: [
        { id: 'speed-a', timeMs: 0, value: 0.5, easing: { curve: 'linear' } },
        { id: 'speed-b', timeMs: 10_000, value: 2, easing: { curve: 'linear' } },
      ],
    }]

    const recipe = showRecordToCompileRecipe(show, lookup(show))
    const scenes = recipe.routedSceneSequence?.scenes ?? []

    expect(scenes.slice(0, 4).map((scene) => scene.localTimeOffsetMs)).toEqual([0, 4_000, 5_000, 8_000])
    expect(scenes.slice(0, 4).map((scene) => scene.propertyTracks?.[0].id)).toEqual([
      'speed-track', 'speed-track', 'speed-track', 'speed-track',
    ])
    expect(scenes[0].placements[0]).toMatchObject({ placementId: 'placement-a-1', clipId: 'instance-a' })
    expect(scenes[3].placements[0]).toMatchObject({ placementId: 'placement-a-2', clipId: 'instance-a' })
  })

  it('emits a placement-owned track only while that placement is active (#492)', () => {
    const show = fixture()
    show.composition!.scenes[0].propertyTracks = [{
      id: 'brightness-track',
      target: { kind: 'placement-view', placementId: 'placement-a-1', property: 'brightness' },
      keyframes: [
        { id: 'brightness-a', timeMs: 0, value: 0.25, easing: { curve: 'linear' } },
        { id: 'brightness-b', timeMs: 10_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    const recipe = showRecordToCompileRecipe(show, lookup(show))
    const scenes = recipe.routedSceneSequence?.scenes ?? []

    expect(scenes[0].propertyTracks?.map((track) => track.id)).toEqual(['brightness-track'])
    expect(scenes.slice(1, 4).every((scene) => scene.propertyTracks === undefined)).toBe(true)
  })

  it('lowers Main plus ordered overlays into one routed Zone stack (#489)', () => {
    const show = fixture()
    const firstZone = show.composition!.scenes[0].zones[0]
    firstZone.overlays = [
      {
        id: 'front-fx',
        name: 'Front FX',
        placements: [{
          id: 'overlay-front',
          instanceId: 'instance-b',
          startMs: 0,
          durationMs: 4_000,
          opacity: 0.25,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
      },
      {
        id: 'back-fx',
        name: 'Back FX',
        placements: [{
          id: 'overlay-back',
          instanceId: 'instance-a',
          startMs: 0,
          durationMs: 4_000,
          opacity: 0.5,
          view: { mirror: false, phase: 0, brightness: 0.7 },
        }],
      },
    ]

    const recipe = showRecordToCompileRecipe(show, lookup(show))
    const firstScene = recipe.routedSceneSequence?.scenes[0]

    expect(firstScene?.placements).toEqual([
      expect.objectContaining({ clipId: 'instance-a', stackOrder: 0, opacity: 1 }),
      expect.objectContaining({ clipId: 'instance-a', stackOrder: 1, opacity: 0.5 }),
      expect.objectContaining({ clipId: 'instance-b', stackOrder: 2, opacity: 0.25 }),
    ])
    expect(recipe.clips.map((clip) => clip.id)).toEqual(expect.arrayContaining(['instance-a', 'instance-b']))
    expect(recipe.clips.filter((clip) => clip.id === 'instance-a')).toHaveLength(1)
  })

  it('remaps parent-boundary property starts onto the first derived local cell', () => {
    const show = fixture()
    show.transitions = show.transitions?.map((transition) => transition.afterSceneId === 'scene-1'
      ? {
          ...transition,
          propertyTransitions: {
            brightness: {
              fromByCellId: { 'cell-2': 0.25 },
              durationMs: 500,
              easing: { curve: 'linear' },
            },
          },
        }
      : transition)

    const lowered = lowerShowCompositionForCompile(show, lookup(show))
    const boundary = lowered.show.transitions?.find((transition) => (
      transition.id === 'transition-scene-1'
    ))
    const target = lowered.show.cells.find((cell) => (
      cell.sceneId === 'scene-2' && cell.zoneId === 'zone-1'
    ))

    expect(target).toBeDefined()
    expect(boundary?.propertyTransitions?.brightness?.fromByCellId).toEqual({ [target!.id]: 0.25 })
  })
})
