import { describe, expect, it } from 'vitest'
import { createShowClipEffect } from './showEffectAuthoring'
import { buildShowToolkitPresentationCatalogue } from './showVisualToolkitPresentation'
import { createDefaultShow, projectShowTimeline } from './showModel'
import {
  projectShowClipInspector,
  showClipInspectorCapabilities,
  updateShowClipInspector,
  type ShowClipInspectorOwner,
} from './showClipInspectorModel'
import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'
import { validateShowComposition } from './showCompositionModel'

function fixture(): ShowRecord {
  const show = createDefaultShow('clip-inspector-model', 'Clip inspector model', 1)
  const firstCell = show.cells[0]
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [{
      id: 'instance-main',
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }, {
      id: 'instance-overlay',
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
      time: { timeScale: 0.5, timeOffsetMs: 25 },
      controlTargets: { sliderSpeed: 0.4 },
    }],
    scenes: [{
      sceneId: show.scenes[0].id,
      zones: [{
        zoneId: show.zones[0].id,
        main: [{
          id: 'placement-main',
          instanceId: 'instance-main',
          startMs: 0,
          durationMs: show.scenes[0].durationMs,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
        overlays: [{
          id: 'layer-front',
          name: 'Front',
          placements: [{
            id: 'placement-overlay',
            instanceId: 'instance-overlay',
            startMs: 1_000,
            durationMs: 2_000,
            opacity: 0.75,
            view: { mirror: true, phase: 0.25, brightness: 0.8 },
          }],
        }],
      }],
    }],
  }
  return { ...show, cells: [{ ...firstCell }], composition }
}

function logicalClipFixture(): ShowRecord {
  const show = fixture()
  const composition = structuredClone(show.composition!)
  const source = composition.scenes[0].zones[0].overlays[0].placements[0]
  source.startMs = show.scenes[0].durationMs - 1_000
  source.durationMs = 1_000
  composition.scenes.push({
    sceneId: show.scenes[1].id,
    zones: [{
      zoneId: show.zones[0].id,
      main: [],
      overlays: [{
        id: 'layer-front-continuation',
        name: 'Front',
        placements: [{
          ...structuredClone(source),
          id: 'placement-overlay--span-scene-2',
          logicalClipId: 'placement-overlay',
          startMs: 0,
          durationMs: 2_000,
        }],
      }],
    }],
  })
  return { ...show, composition }
}

const globalOwner = (show: ShowRecord): ShowClipInspectorOwner => ({
  kind: 'global',
  cellId: show.cells[0].id,
})

const mainOwner = (show: ShowRecord): ShowClipInspectorOwner => ({
  kind: 'scene-main',
  sceneId: show.scenes[0].id,
  zoneId: show.zones[0].id,
  placementId: 'placement-main',
})

const overlayOwner = (show: ShowRecord): ShowClipInspectorOwner => ({
  kind: 'scene-overlay',
  sceneId: show.scenes[0].id,
  zoneId: show.zones[0].id,
  layerId: 'layer-front',
  placementId: 'placement-overlay',
})

describe('shared Clip inspector owner model (#498)', () => {
  it('describes structural and local capabilities without leaking storage shapes', () => {
    expect(showClipInspectorCapabilities('global')).toMatchObject({
      structural: true,
      localTiming: false,
      layerAssignment: false,
      sourceOverOpacity: false,
      propertyAnimation: 'boundary-ramp',
    })
    expect(showClipInspectorCapabilities('scene-main')).toMatchObject({
      structural: false,
      localTiming: true,
      layerAssignment: false,
      sourceOverOpacity: false,
      propertyAnimation: 'local-keyframes',
    })
    expect(showClipInspectorCapabilities('scene-overlay')).toMatchObject({
      structural: false,
      localTiming: true,
      layerAssignment: true,
      sourceOverOpacity: true,
      propertyAnimation: 'local-keyframes',
    })
  })

  it('projects global, Main, and overlay owners into one normalized value', () => {
    const show = fixture()
    expect(projectShowClipInspector(show, globalOwner(show))).toMatchObject({
      scope: 'global',
      patternName: 'TestPattern1D',
      simulation: { timeScale: 1 },
      view: { brightness: 1 },
    })
    expect(projectShowClipInspector(show, mainOwner(show))).toMatchObject({
      scope: 'scene-main',
      placementId: 'placement-main',
      simulation: { timeScale: 1 },
      local: { startMs: 0, durationMs: show.scenes[0].durationMs },
    })
    expect(projectShowClipInspector(show, overlayOwner(show))).toMatchObject({
      scope: 'scene-overlay',
      placementId: 'placement-overlay',
      layerId: 'layer-front',
      simulation: { timeScale: 0.5, controlTargets: { sliderSpeed: 0.4 } },
      view: { mirror: true, phase: 0.25, brightness: 0.8 },
      local: { startMs: 1_000, durationMs: 2_000, opacity: 0.75 },
    })
  })

  it('projects and edits a later Clip Start in Show-global time (#634)', () => {
    const show = fixture()
    const composition = structuredClone(show.composition!)
    const placement = composition.scenes[0].zones[0].overlays[0].placements.shift()!
    placement.startMs = 1_250
    composition.scenes.push({
      sceneId: show.scenes[1].id,
      zones: [{
        zoneId: show.zones[0].id,
        main: [],
        overlays: [{
          id: 'layer-later',
          name: 'Later',
          placements: [placement],
        }],
      }],
    })
    const laterShow = { ...show, composition }
    const owner: ShowClipInspectorOwner = {
      kind: 'scene-overlay',
      sceneId: show.scenes[1].id,
      zoneId: show.zones[0].id,
      layerId: 'layer-later',
      placementId: placement.id,
    }
    const sceneStartMs = projectShowTimeline(laterShow).scenes[1].startMs
    const original = structuredClone(laterShow)

    expect(projectShowClipInspector(laterShow, owner)?.local).toMatchObject({
      startMs: sceneStartMs + 1_250,
      durationMs: 2_000,
    })

    const updated = updateShowClipInspector(laterShow, owner, {
      local: { startMs: sceneStartMs + 2_250 },
    })

    expect(laterShow).toEqual(original)
    expect(updated).not.toBe(laterShow)
    expect(updated.composition?.scenes[1].zones[0].overlays[0].placements[0].startMs).toBe(2_250)
    expect(projectShowClipInspector(updated, owner)?.local).toMatchObject({
      startMs: sceneStartMs + 2_250,
      durationMs: 2_000,
    })
    expect(validateShowComposition(updated, updated.composition!)).toEqual([])
  })

  it('defaults legacy Clips to Live and persists authored evaluation policies for every owner', () => {
    for (const ownerFor of [globalOwner, mainOwner, overlayOwner]) {
      const show = fixture()
      expect(projectShowClipInspector(show, ownerFor(show))).toMatchObject({
        evaluationPolicy: 'live',
      })
      const frozen = updateShowClipInspector(show, ownerFor(show), {
        evaluationPolicy: 'freeze-at-entry',
      })
      expect(projectShowClipInspector(frozen, ownerFor(frozen))).toMatchObject({
        evaluationPolicy: 'freeze-at-entry',
      })
      const refreshed = updateShowClipInspector(frozen, ownerFor(frozen), {
        evaluationPolicy: 'rolling-refresh',
      })
      expect(projectShowClipInspector(refreshed, ownerFor(refreshed))).toMatchObject({
        evaluationPolicy: 'rolling-refresh',
      })
    }
  })

  it('commits the same normalized simulation and view patch to every owner', () => {
    for (const ownerFor of [globalOwner, mainOwner, overlayOwner]) {
      const show = fixture()
      const updated = updateShowClipInspector(show, ownerFor(show), {
        simulation: { timeScale: 2.5 },
        view: { mirror: true, phase: 0.6, brightness: 0.35 },
      })
      expect(projectShowClipInspector(updated, ownerFor(updated))).toMatchObject({
        simulation: { timeScale: 2.5 },
        view: { mirror: true, phase: 0.6, brightness: 0.35 },
      })
    }
  })

  it('applies placement-owned inspector edits to every segment of one logical Clip (#63)', () => {
    const show = logicalClipFixture()
    const updated = updateShowClipInspector(show, overlayOwner(show), {
      presentation: { mode: 'freeze' },
      view: { brightness: 0.35 },
      transform: { positionX: 0.2 },
      effects: [{ id: 'brightness', kind: 'brightness', brightness: 0.5 }],
    })

    const placements = updated.composition!.scenes.flatMap((scene) => (
      scene.zones[0].overlays.flatMap((layer) => layer.placements)
    ))
    expect(placements).toHaveLength(2)
    expect(placements).toEqual([
      expect.objectContaining({
        presentation: { mode: 'freeze' },
        view: expect.objectContaining({ brightness: 0.35 }),
        transform: expect.objectContaining({ positionX: 0.2 }),
        effects: [{ id: 'brightness', kind: 'brightness', brightness: 0.5 }],
      }),
      expect.objectContaining({
        presentation: { mode: 'freeze' },
        view: expect.objectContaining({ brightness: 0.35 }),
        transform: expect.objectContaining({ positionX: 0.2 }),
        effects: [{ id: 'brightness', kind: 'brightness', brightness: 0.5 }],
      }),
    ])
  })

  it('projects and atomically edits timing and opacity for one multi-Scene logical Clip (#63)', () => {
    const show = logicalClipFixture()

    expect(projectShowClipInspector(show, overlayOwner(show))?.local).toEqual({
      startMs: show.scenes[0].durationMs - 1_000,
      durationMs: 5_000,
      opacity: 0.75,
    })

    const updated = updateShowClipInspector(show, overlayOwner(show), {
      local: {
        durationMs: 6_000,
        opacity: 0.4,
      },
    })
    const placements = updated.composition!.scenes.flatMap((scene) => (
      scene.zones[0].overlays.flatMap((layer) => layer.placements)
    ))

    expect(placements).toEqual([
      expect.objectContaining({ startMs: show.scenes[0].durationMs - 1_000, durationMs: 1_000, opacity: 0.4 }),
      expect.objectContaining({ startMs: 0, durationMs: 3_000, opacity: 0.4 }),
    ])
    expect(projectShowClipInspector(updated, overlayOwner(updated))?.local).toEqual({
      startMs: show.scenes[0].durationMs - 1_000,
      durationMs: 6_000,
      opacity: 0.4,
    })
  })

  it('rejects opacity together with an invalid logical Clip timing edit (#63)', () => {
    const show = logicalClipFixture()

    expect(updateShowClipInspector(show, overlayOwner(show), {
      local: {
        durationMs: 1_000_000,
        opacity: 0.4,
      },
    })).toBe(show)
    expect(projectShowClipInspector(show, overlayOwner(show))?.local?.opacity).toBe(0.75)
  })

  it('accepts a colocated opacity edit when the supplied Start is an exact no-op (#597)', () => {
    const show = fixture()
    const layer = show.composition!.scenes[0].zones[0].overlays[0]
    layer.placements.push({
      id: 'placement-overlay-next',
      instanceId: 'instance-overlay',
      startMs: 4_000,
      durationMs: 2_000,
      opacity: 0.75,
      view: { mirror: true, phase: 0.25, brightness: 0.8 },
    })
    show.composition!.transitions = [{
      id: 'transition-overlay-next',
      fromPlacementId: 'placement-overlay',
      toPlacementId: 'placement-overlay-next',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]
    const local = projectShowClipInspector(show, overlayOwner(show))!.local!

    const updated = updateShowClipInspector(show, overlayOwner(show), {
      local: {
        startMs: local.startMs,
        opacity: 0.4,
      },
    })

    expect(updated).not.toBe(show)
    expect(projectShowClipInspector(updated, overlayOwner(updated))?.local).toMatchObject({
      startMs: local.startMs,
      durationMs: local.durationMs,
      opacity: 0.4,
    })
  })

  it('rejects a colocated opacity edit when Start is invalid even if Duration is unchanged (#597)', () => {
    const show = logicalClipFixture()
    const local = projectShowClipInspector(show, overlayOwner(show))!.local!

    expect(updateShowClipInspector(show, overlayOwner(show), {
      local: {
        startMs: 1_000_000,
        durationMs: local.durationMs,
        opacity: 0.4,
      },
    })).toBe(show)
    expect(projectShowClipInspector(show, overlayOwner(show))?.local?.opacity).toBe(0.75)
  })

  it('preserves opacity when a timing edit moves the logical Clip root into another Scene (#63)', () => {
    const show = logicalClipFixture()

    const updated = updateShowClipInspector(show, overlayOwner(show), {
      local: {
        startMs: 32_000,
        opacity: 0.4,
      },
    })
    const placements = updated.composition!.scenes.flatMap((scene) => (
      scene.zones[0].overlays.flatMap((layer) => layer.placements)
    ))

    expect(updated).not.toBe(show)
    expect(updated.composition!.scenes[0].zones[0].overlays[0].placements).toEqual([])
    expect(placements).toEqual([
      expect.objectContaining({
        id: 'placement-overlay',
        startMs: 0,
        durationMs: 5_000,
        opacity: 0.4,
      }),
    ])
  })

  it('retargets an outgoing Transition after an exact logical Clip duration edit (#63)', () => {
    const show = logicalClipFixture()
    show.scenes.push({ id: 'scene-3', name: 'Scene 3', durationMs: 30_000 })
    show.transitions.push({
      id: 'cut-scene-2',
      afterSceneId: show.scenes[1].id,
      kind: 'cut',
      durationMs: 0,
      easing: { curve: 'linear' },
    })
    const continuation = show.composition!.scenes[1].zones[0].overlays[0].placements[0]
    continuation.durationMs = 28_000
    show.composition!.scenes.push({
      sceneId: 'scene-3',
      zones: [{
        zoneId: show.zones[0].id,
        main: [],
        overlays: [{
          id: 'layer-front-third',
          name: 'Front',
          placements: [{
            id: 'placement-next',
            instanceId: continuation.instanceId,
            startMs: 0,
            durationMs: 2_000,
            opacity: 0.75,
            view: { mirror: true, phase: 0.25, brightness: 0.8 },
          }],
        }],
      }],
    })
    show.composition!.transitions = [{
      id: 'transition-logical-next',
      fromPlacementId: continuation.id,
      toPlacementId: 'placement-next',
      kind: 'crossfade',
      durationMs: 2_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]

    const updated = updateShowClipInspector(show, overlayOwner(show), {
      local: { durationMs: 34_000 },
    })

    expect(updated).not.toBe(show)
    expect(updated.composition!.transitions).toContainEqual(expect.objectContaining({
      id: 'transition-logical-next',
      fromPlacementId: 'placement-overlay--span-scene-3',
      toPlacementId: 'placement-next',
    }))
    expect(updated.composition!.scenes[2].zones[0].overlays[0].placements).toEqual([
      expect.objectContaining({
        id: 'placement-overlay--span-scene-3',
        logicalClipId: 'placement-overlay',
        durationMs: 1_000,
      }),
      expect.objectContaining({ id: 'placement-next', startMs: 3_000 }),
    ])
    expect(validateShowComposition(updated, updated.composition!)).toEqual([])
  })

  it('moves the complete Transition-connected chain after an exact Start edit (#63)', () => {
    const show = fixture()
    const layer = show.composition!.scenes[0].zones[0].overlays[0]
    layer.placements.push({
      id: 'placement-overlay-next',
      instanceId: 'instance-overlay',
      startMs: 4_000,
      durationMs: 2_000,
      opacity: 0.75,
      view: { mirror: true, phase: 0.25, brightness: 0.8 },
    })
    show.composition!.transitions = [{
      id: 'transition-overlay-next',
      fromPlacementId: 'placement-overlay',
      toPlacementId: 'placement-overlay-next',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]

    const updated = updateShowClipInspector(show, overlayOwner(show), {
      local: { startMs: 2_000 },
    })

    expect(updated).not.toBe(show)
    expect(updated.composition!.scenes[0].zones[0].overlays[0].placements
      .map((placement) => [placement.id, placement.startMs])).toEqual([
      ['placement-overlay', 2_000],
      ['placement-overlay-next', 5_000],
    ])
    expect(updated.composition!.transitions).toEqual(show.composition!.transitions)
    expect(validateShowComposition(updated, updated.composition!)).toEqual([])
  })

  it('keeps Freeze, Strobe, and Blink on the placement while Stutter stays on the Pattern instance (#586)', () => {
    const show = fixture()
    const updated = updateShowClipInspector(show, overlayOwner(show), {
      presentation: { mode: 'strobe', cadenceMs: 750 },
      blink: { rateHz: 2, duty: 0.4, phase: 0.1 },
      simulation: { steppedClock: { stepMs: 250 } },
    })

    expect(projectShowClipInspector(updated, overlayOwner(updated))).toMatchObject({
      presentation: { mode: 'strobe', cadenceMs: 750 },
      blink: { rateHz: 2, duty: 0.4, phase: 0.1 },
      simulation: { steppedClock: { stepMs: 250 } },
    })
    expect(updated.composition?.patternInstances.find((instance) => instance.id === 'instance-overlay')).toMatchObject({
      time: { steppedClock: { stepMs: 250 } },
    })
    expect(updated.composition?.scenes[0].zones[0].overlays[0].placements[0]).toMatchObject({
      presentation: { mode: 'strobe', cadenceMs: 750 },
      blink: { rateHz: 2, duty: 0.4, phase: 0.1 },
    })
  })

  it('projects a neutral canonical Transform and persists one through every Clip owner', () => {
    for (const ownerFor of [globalOwner, mainOwner, overlayOwner]) {
      const show = fixture()
      expect(projectShowClipInspector(show, ownerFor(show))?.transform).toEqual({
        positionX: 0,
        positionY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      })

      const updated = updateShowClipInspector(show, ownerFor(show), {
        transform: {
          positionX: 0.25,
          positionY: -0.4,
          rotation: 0.125,
          scaleX: 1.5,
          scaleY: 0.75,
        },
      })
      expect(projectShowClipInspector(updated, ownerFor(updated))?.transform).toEqual({
        positionX: 0.25,
        positionY: -0.4,
        rotation: 0.125,
        scaleX: 1.5,
        scaleY: 0.75,
      })
    }
  })

  it('keeps Content placement separate from an optional preserved Clip Viewport (#585)', () => {
    for (const ownerFor of [globalOwner, mainOwner, overlayOwner]) {
      const show = fixture()
      expect(projectShowClipInspector(show, ownerFor(show))).toMatchObject({
        transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        viewport: { enabled: false, x: 0, y: 0, width: 1, height: 1 },
      })

      const enabled = updateShowClipInspector(show, ownerFor(show), {
        transform: { positionX: 0.2, positionY: -0.1, scaleX: 1.4, scaleY: 0.8 },
        viewport: { enabled: true, x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
      })
      expect(projectShowClipInspector(enabled, ownerFor(enabled))).toMatchObject({
        transform: { positionX: 0.2, positionY: -0.1, scaleX: 1.4, scaleY: 0.8 },
        viewport: { enabled: true, x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
      })

      const disabled = updateShowClipInspector(enabled, ownerFor(enabled), {
        viewport: { enabled: false },
      })
      expect(projectShowClipInspector(disabled, ownerFor(disabled))?.viewport).toEqual({
        enabled: false,
        x: 0.1,
        y: 0.2,
        width: 0.6,
        height: 0.5,
      })
    }
  })

  it('commits Pattern, controls, Effects, and local overlay fields through its owner adapter', () => {
    const show = fixture()
    const item = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
      .find((candidate) => candidate.kind === 'effect' && candidate.compatible)!
    const effect = createShowClipEffect(item, 'effect-1')
    const updated = updateShowClipInspector(show, overlayOwner(show), {
      pattern: { ref: { kind: 'stock', id: 'Caustics' }, name: 'Caustics' },
      simulation: { controlTargets: { sliderSpeed: 0.9 } },
      effects: [effect],
      local: { startMs: 2_000, durationMs: 3_000, opacity: 0.4 },
    })
    expect(projectShowClipInspector(updated, overlayOwner(updated))).toMatchObject({
      patternName: 'Caustics',
      simulation: { controlTargets: { sliderSpeed: 0.9 } },
      effects: [{ id: 'effect-1' }],
      local: { startMs: 2_000, durationMs: 3_000, opacity: 0.4 },
    })
  })

  it('prunes only Effect Property tracks whose referent the inspector removes (#607)', () => {
    const show = fixture()
    const scene = show.composition!.scenes[0]
    const placement = scene.zones[0].overlays[0].placements[0]
    placement.effects = [{ id: 'move', kind: 'translate', x: 0, y: 0 }]
    scene.propertyTracks = [
      {
        id: 'track-effect-x',
        target: {
          kind: 'placement-effect',
          placementId: placement.id,
          effectId: 'move',
          effectKind: 'translate',
          parameterId: 'translateX',
        },
        keyframes: [
          { id: 'effect-x-start', timeMs: 0, value: 0, easing: { curve: 'linear' } },
          { id: 'effect-x-end', timeMs: 1_000, value: 0.2, easing: { curve: 'linear' } },
        ],
      },
      {
        id: 'track-brightness',
        target: { kind: 'placement-view', placementId: placement.id, property: 'brightness' },
        keyframes: [
          { id: 'brightness-start', timeMs: 0, value: 0.5, easing: { curve: 'linear' } },
          { id: 'brightness-end', timeMs: 1_000, value: 0.8, easing: { curve: 'linear' } },
        ],
      },
    ]
    const original = structuredClone(show)
    expect(validateShowComposition(show, show.composition!)).toEqual([])

    const updated = updateShowClipInspector(show, overlayOwner(show), { effects: [] })

    expect(show).toEqual(original)
    expect(updated.composition!.scenes[0].propertyTracks?.map((track) => track.id)).toEqual(['track-brightness'])
    expect(validateShowComposition(updated, updated.composition!)).toEqual([])
  })

  it('keeps only replacement-Pattern controls and their Property tracks (#828)', () => {
    const show = fixture()
    show.composition!.patternInstances.find((instance) => instance.id === 'instance-overlay')!.controlTargets = {
      sliderSpeed: 0.4,
      sliderOrphaned: 0.6,
    }
    const scene = show.composition!.scenes[0]
    scene.propertyTracks = [
      {
        id: 'track-control-speed',
        target: { kind: 'instance-control', instanceId: 'instance-overlay', exportName: 'sliderSpeed' },
        keyframes: [
          { id: 'control-speed-start', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
          { id: 'control-speed-end', timeMs: 1_000, value: 0.8, easing: { curve: 'linear' } },
        ],
      },
      {
        id: 'track-control-orphaned',
        target: { kind: 'instance-control', instanceId: 'instance-overlay', exportName: 'sliderOrphaned' },
        keyframes: [
          { id: 'control-orphaned-start', timeMs: 0, value: 0.1, easing: { curve: 'linear' } },
          { id: 'control-orphaned-end', timeMs: 1_000, value: 0.9, easing: { curve: 'linear' } },
        ],
      },
      {
        id: 'track-brightness',
        target: { kind: 'placement-view', placementId: 'placement-overlay', property: 'brightness' },
        keyframes: [
          { id: 'brightness-start', timeMs: 0, value: 0.5, easing: { curve: 'linear' } },
          { id: 'brightness-end', timeMs: 1_000, value: 0.8, easing: { curve: 'linear' } },
        ],
      },
    ]
    const original = structuredClone(show)
    expect(validateShowComposition(show, show.composition!)).toEqual([])

    const updated = updateShowClipInspector(show, overlayOwner(show), {
      pattern: { ref: { kind: 'stock', id: 'Caustics' }, name: 'Caustics' },
    }, new Set(['sliderSpeed']))

    expect(show).toEqual(original)
    expect(updated.composition!.patternInstances.find((instance) => instance.id === 'instance-overlay')?.controlTargets)
      .toEqual({ sliderSpeed: 0.4 })
    expect(updated.composition!.scenes[0].propertyTracks?.map((track) => track.id))
      .toEqual(['track-control-speed', 'track-brightness'])
    expect(validateShowComposition(updated, updated.composition!)).toEqual([])
  })

  it('clamps normalized and speed fields at the adapter boundary', () => {
    const show = fixture()
    const updated = updateShowClipInspector(show, overlayOwner(show), {
      simulation: { timeScale: 12 },
      view: { phase: -2, brightness: 5 },
      local: { opacity: -1 },
    })
    expect(projectShowClipInspector(updated, overlayOwner(updated))).toMatchObject({
      simulation: { timeScale: 4 },
      view: { phase: 0, brightness: 1 },
      local: { opacity: 0 },
    })
  })
})
