import { describe, expect, it } from 'vitest'
import { compileShow } from './showCompiler'
import { loadPattern } from './loadPattern'
import { createFastReplayRuntime } from './fastReplay'
import { createDefaultShow, showRecordToCompileRecipe } from './showModel'
import { projectFlatShowToCompositionV1 } from './showCompositionModel'
import type { ShowCompositionV1 } from './personalContentRecords'

const source = `
var t = 0
export function beforeRender(delta) { t = t + delta / 1000 }
export function render(index) { rgb(t, index / pixelCount, 0) }
`

describe('Freeze-at-entry clip evaluation policy (#533)', () => {
  it('keeps legacy and explicit Live artifacts byte-for-byte identical', () => {
    const legacy = createDefaultShow('freeze-legacy', 'Freeze legacy', 1)
    const explicitLive = {
      ...legacy,
      cells: legacy.cells.map((cell) => ({ ...cell, evaluationPolicy: 'live' as const })),
    }
    const lookup = { byCellId: Object.fromEntries(legacy.cells.map((cell) => [cell.id, source])) }
    const legacyArtifact = compileShow(showRecordToCompileRecipe(legacy, lookup), {})
    const liveArtifact = compileShow(showRecordToCompileRecipe(explicitLive, lookup), {})

    expect(liveArtifact.code).toBe(legacyArtifact.code)
    expect(liveArtifact.expandedCode).toBe(legacyArtifact.expandedCode)
  })

  it('lowers flat and composed Freeze policies into compile recipes', () => {
    const flat = createDefaultShow('freeze-flat', 'Freeze flat', 1)
    flat.cells[0].evaluationPolicy = 'freeze-at-entry'
    const flatRecipe = showRecordToCompileRecipe(flat, {
      byCellId: Object.fromEntries(flat.cells.map((cell) => [cell.id, source])),
    })
    expect(flatRecipe.clips[0]).toMatchObject({ evaluationPolicy: 'freeze-at-entry' })
    expect(compileShow(flatRecipe, {}).summary.specializations.freezeAtEntry).toMatchObject({
      authoredClipCount: 1,
      selectedSceneCount: 1,
    })
    expect(projectFlatShowToCompositionV1(flat, {
      byCellId: Object.fromEntries(flat.cells.map((cell) => [cell.id, source])),
    }).patternInstances[0]).toMatchObject({ evaluationPolicy: 'freeze-at-entry' })

    const composed = createDefaultShow('freeze-composed', 'Freeze composed', 1)
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-heavy',
        pattern: { kind: 'stock', id: 'heavy' },
        patternName: 'Heavy',
        evaluationPolicy: 'freeze-at-entry',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [{
        sceneId: composed.scenes[0].id,
        zones: [{
          zoneId: composed.zones[0].id,
          main: [{
            id: 'placement-heavy',
            instanceId: 'instance-heavy',
            startMs: 0,
            durationMs: composed.scenes[0].durationMs,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      }],
    }
    const recipe = showRecordToCompileRecipe({ ...composed, composition }, {
      byCellId: { [composed.cells[0].id]: source },
      byPatternInstanceId: { 'instance-heavy': source },
    })
    expect(recipe.clips[0]).toMatchObject({
      id: 'instance-heavy',
      evaluationPolicy: 'freeze-at-entry',
    })
  })

  it('captures one complete traversal, replays it, and invalidates it on loop re-entry', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      masterPixelCount: 4,
      clips: [{
        id: 'heavy',
        evaluationPolicy: 'freeze-at-entry',
        source: 'export var renders = 0\nexport function render(index) { renders = renders + 1; rgb(renders / 100, index / pixelCount, 0) }',
      }, {
        id: 'live-overlay',
        source: 'export function render(index) { rgb(0, 0, index / pixelCount) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [0, 1].map(() => ({
          holdMs: 1_000,
          placements: [
            { placementId: 'background', zoneName: 'main', clipId: 'heavy', stackOrder: 0 },
            { placementId: 'overlay', zoneName: 'main', clipId: 'live-overlay', stackOrder: 1, opacity: 0.25 },
          ],
        })),
      },
      loopDurationMs: 2_000,
    }, {})
    let pixel: [number, number, number] = [0, 0, 0]
    const handle = loadPattern(artifact.code, artifact.metadata, {
      pixelCount: 4,
      PI2: Math.PI * 2,
      rgb: (r: number, g: number, b: number) => { pixel = [r, g, b] },
      hsv: (h: number, s: number, v: number) => { pixel = [h, s, v] },
      abs: Math.abs,
      array: (length: number) => Array.from({ length }, () => 0),
      atan2: Math.atan2,
      ceil: Math.ceil,
      clamp: (value: number, low: number, high: number) => Math.min(Math.max(value, low), high),
      cos: Math.cos,
      floor: Math.floor,
      frac: (value: number) => value - Math.floor(value),
      hypot: Math.hypot,
      max: Math.max,
      min: Math.min,
      sin: Math.sin,
      sqrt: Math.sqrt,
    })
    const renderFrame = () => Array.from({ length: 4 }, (_, index) => {
      handle.render(index)
      return [...pixel] as [number, number, number]
    })

    handle.beforeRender(16)
    const captured = renderFrame()
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_renders: 4 })
    handle.beforeRender(16)
    expect(renderFrame()).toEqual(captured)
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_renders: 4 })
    handle.beforeRender(968)
    renderFrame()
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_renders: 8 })
    handle.beforeRender(1_000)
    renderFrame()
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_renders: 12 })
    expect(artifact.summary.specializations.freezeAtEntry).toMatchObject({
      authoredClipCount: 1,
      selectedSceneCount: 2,
      evaluationsAvoidedPerReplayFrame: 4,
    })
    expect(artifact.summary.specializations.freezeAtEntry.captures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clipId: 'heavy',
        lifetime: 'scene',
        planes: [0, 1, 2],
        status: 'selected',
      }),
    ]))
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const runtime = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: 1,
      }, {
        mapPoints: Array.from({ length: 4 }, () => ({ sample: [] })),
        randomSeed: 533,
        fidelity,
      })
      const firstReplay = runtime.advanceLive(16)
      const secondReplay = runtime.advanceLive(16)
      expect(secondReplay.checksum).toBe(firstReplay.checksum)
    }
  })

  it('falls back visibly to Live when the shared render-target arena is unavailable', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      masterPixelCount: 4,
      clips: [{ id: 'heavy', source, evaluationPolicy: 'freeze-at-entry' }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [0, 1].map(() => ({
          holdMs: 1_000,
          placements: [{ placementId: 'background', zoneName: 'main', clipId: 'heavy', stackOrder: 0 }],
        })),
      },
      loopDurationMs: 2_000,
    }, {}, { renderTargetArenaEmission: false })

    expect(artifact.summary.specializations.freezeAtEntry).toMatchObject({
      authoredClipCount: 1,
      selectedSceneCount: 0,
    })
    expect(artifact.summary.specializations.freezeAtEntry.captures).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'rejected', reason: 'arena-unavailable' }),
    ]))
    expect(artifact.summary.warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Freeze at entry .* fell back to Live \(arena-unavailable\):/),
    ]))
  })
})
