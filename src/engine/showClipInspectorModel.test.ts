import { describe, expect, it } from 'vitest'
import { createShowClipEffect } from './showEffectAuthoring'
import { buildShowToolkitPresentationCatalogue } from './showVisualToolkitPresentation'
import { createDefaultShow } from './showModel'
import {
  projectShowClipInspector,
  showClipInspectorCapabilities,
  updateShowClipInspector,
  type ShowClipInspectorOwner,
} from './showClipInspectorModel'
import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'

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
