import { describe, expect, it } from 'vitest'
import { createDefaultShow, showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'
import { lowerShowCompositionForCompile } from './showCompositionLowering'
import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'
import { insertShowLayerTransition } from './showLayerTransitionAuthoring'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import { stockShowById } from '../pixelblaze/stock/shows'

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

  it('materializes linked Group occurrences into ordinary compiler cells with occurrence-local instances (#587)', () => {
    const show = fixture()
    show.composition = {
      version: 1,
      executionModel: 'deterministic-loop',
      patternInstances: [],
      scenes: [{
        sceneId: 'scene-1',
        zones: [{ zoneId: 'zone-1', main: [], overlays: [] }],
      }],
      groupDefinitions: [{
        id: 'phrase',
        name: 'Phrase',
        patternInstances: [{
          id: 'inside-instance',
          pattern: { kind: 'stock', id: 'TestPattern1D' },
          patternName: 'TestPattern1D',
          time: { timeScale: 1, timeOffsetMs: 0 },
        }],
        placements: [{
          id: 'inside-clip',
          instanceId: 'inside-instance',
          layerOffset: 0,
          startMs: 0,
          durationMs: 1_000,
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
      }],
      groupOccurrences: [
        { id: 'use-a', definitionId: 'phrase', sceneId: 'scene-1', zoneId: 'zone-1', startMs: 1_000, baseLayer: 0, translationX: 0, translationY: 0 },
        { id: 'use-b', definitionId: 'phrase', sceneId: 'scene-1', zoneId: 'zone-1', startMs: 4_000, baseLayer: 0, translationX: 0, translationY: 0 },
      ],
    }
    const sources = {
      ...lookup(show),
      byPatternInstanceId: {
        'use-a:inside-instance': SOURCE_A,
        'use-b:inside-instance': SOURCE_A,
      },
    }

    const lowered = lowerShowCompositionForCompile(show, sources)

    expect(lowered.show.cells.map((cell) => cell.id)).toEqual([
      'use-a:inside-clip@scene-1--local-1000-2000',
      'use-b:inside-clip@scene-1--local-4000-5000',
    ])
    expect(Object.values(lowered.lookup.instanceIdByCellId ?? {})).toEqual([
      'use-a:inside-instance',
      'use-b:inside-instance',
    ])
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

  it('lowers a Zone-scoped Transition across a coincident Cut in another Zone (#630)', () => {
    const show = structuredClone(stockShowById('stock-show-105-portable-zones')!.show)
    const composition = show.composition!
    // Rebuild the first scene with two Clips per Zone: both Zones cut at the
    // same 5s boundary, and the Left Zone's second Clip is shortened so a 2s
    // crossfade fits inside the 10s scene. (The lesson itself now runs one
    // Clip per Zone, so the coincident-Cut topology is authored here.)
    const swapPlacement = (id: string, instanceId: string, startMs: number, durationMs: number) => ({
      id,
      instanceId,
      startMs,
      durationMs,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes[0].zones[0].main = [
      swapPlacement('clip-left-ribbons', 'ribbons', 0, 5_000),
      swapPlacement('clip-left-water', 'water', 5_000, 3_000),
    ]
    composition.scenes[0].zones[1].main = [
      swapPlacement('clip-right-water', 'water', 0, 5_000),
      swapPlacement('clip-right-ribbons', 'ribbons', 5_000, 5_000),
    ]
    const junction = projectShowUnifiedTimeline(show, composition).zones[0].layers[0].junctions[0]
    show.composition = insertShowLayerTransition(show, composition, {
      id: 'transition-left-zone',
      fromPlacementId: junction.fromPlacementId,
      toPlacementId: junction.toPlacementId,
      kind: 'crossfade',
      durationMs: 2_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, SOURCE_A])),
      byPatternInstanceId: { ribbons: SOURCE_A, water: SOURCE_B },
    })

    expect(recipe.routedSceneSequence?.scenes[0].transitionOut).toMatchObject({
      kind: 'crossfade',
      durationMs: 2_000,
      scopeZoneName: 'Left',
    })
    expect(() => compileShow(recipe, {})).not.toThrow()
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

  it('keeps Freeze/Strobe/Blink placement-owned when one Pattern instance has multiple appearances (#586)', () => {
    const show = fixture()
    const first = show.composition!.scenes[0].zones[0].main[0]
    first.presentation = { mode: 'freeze' }
    first.blink = { rateHz: 2, duty: 0.5, phase: 0.25 }

    const recipe = showRecordToCompileRecipe(show, lookup(show))
    expect(recipe.clips.find((clip) => clip.id === 'instance-a')?.evaluationPolicy).toBeUndefined()
    expect(recipe.routedSceneSequence?.scenes[0].placements[0]).toMatchObject({
      placementId: 'placement-a-1',
      clipId: 'instance-a',
      presentation: { mode: 'freeze' },
      blink: { rateHz: 2, duty: 0.5, phase: 0.25 },
    })
    expect(recipe.routedSceneSequence?.scenes[3].placements[0]).toMatchObject({
      placementId: 'placement-a-2',
      clipId: 'instance-a',
    })
    expect(recipe.routedSceneSequence?.scenes[3].placements[0].presentation).toBeUndefined()
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

  it.each([
    ['Freeze', { mode: 'freeze' } as const],
    ['Strobe', { mode: 'strobe', cadenceMs: 1_000 } as const],
  ])('compiles a held %s logical Clip spanning the authored Scene boundary (#693)', (_label, presentation) => {
    const show = fixture()
    show.composition!.scenes = [
      {
        sceneId: 'scene-1',
        zones: [{
          zoneId: 'zone-1',
          main: [{
            id: 'held',
            instanceId: 'instance-a',
            startMs: 0,
            durationMs: 30_000,
            view: { mirror: false, phase: 0, brightness: 1 },
            presentation,
          }],
          overlays: [],
        }],
      },
      {
        sceneId: 'scene-2',
        zones: [{
          zoneId: 'zone-1',
          main: [{
            id: 'held--span-scene-2',
            logicalClipId: 'held',
            instanceId: 'instance-a',
            startMs: 0,
            durationMs: 10_000,
            view: { mirror: false, phase: 0, brightness: 1 },
            presentation,
          }, {
            id: 'after',
            instanceId: 'instance-b',
            startMs: 10_000,
            durationMs: 20_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      },
    ]

    const recipe = showRecordToCompileRecipe(show, lookup(show))
    const spanPlacement = recipe.routedSceneSequence?.scenes[1].placements[0]

    expect(spanPlacement).toMatchObject({
      placementId: 'held--span-scene-2',
      logicalClipId: 'held',
      clipId: 'instance-a',
    })
    expect(recipe.routedSceneSequence?.scenes[0].placements[0].logicalClipId).toBeUndefined()
    expect(() => compileShow(recipe, {})).not.toThrow()
  })
})
