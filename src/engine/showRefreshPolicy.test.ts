import { describe, expect, it } from 'vitest'
import { compileShow } from './showCompiler'
import { loadPattern } from './loadPattern'
import { projectFlatShowToCompositionV1 } from './showCompositionModel'
import { createDefaultShow, showRecordToCompileRecipe } from './showModel'
import {
  completeRollingRefreshCapture,
  completeWholeFrameRefreshCapture,
  createRollingRefreshState,
  createWholeFrameRefreshState,
  rollingRefreshPixelMode,
  stepRollingRefresh,
  stepWholeFrameRefresh,
} from './showRefreshPolicy'

describe('whole-frame Refresh policy (#535)', () => {
  it('lowers the saved Rolling Refresh policy as the qualified four-slice variant', () => {
    const show = createDefaultShow('rolling-refresh', 'Rolling Refresh', 1)
    show.cells[0].evaluationPolicy = 'rolling-refresh'
    const lookup = {
      byCellId: Object.fromEntries(show.cells.map((cell) => [
        cell.id,
        'export function render(index) { rgb(index / pixelCount, 0, 0) }',
      ])),
    }

    const recipe = showRecordToCompileRecipe(show, lookup)
    expect(recipe.clips.find((clip) => clip.id === show.cells[0].id)).toMatchObject({
      evaluationPolicy: 'rolling-refresh',
      rollingRefreshSlices: 4,
    })
    expect(projectFlatShowToCompositionV1(show, lookup).patternInstances).toEqual(expect.arrayContaining([
      expect.objectContaining({ evaluationPolicy: 'rolling-refresh' }),
    ]))
    expect(compileShow(recipe, {}).summary.specializations.rollingRefresh).toMatchObject({
      selectedSceneCount: 1,
      slices: [4],
      maxPixelAgeFrames: 3,
    })
  })

  it('captures only on entry and cadence boundaries, then replays complete frames', () => {
    let state = createWholeFrameRefreshState(1_000)

    let step = stepWholeFrameRefresh(state, { ownerToken: 7, elapsedMs: 0 })
    expect(step.mode).toBe('capture')
    state = completeWholeFrameRefreshCapture(step.state)

    step = stepWholeFrameRefresh(state, { ownerToken: 7, elapsedMs: 16 })
    expect(step.mode).toBe('replay')
    state = step.state

    step = stepWholeFrameRefresh(state, { ownerToken: 7, elapsedMs: 999 })
    expect(step.mode).toBe('replay')
    state = step.state

    step = stepWholeFrameRefresh(state, { ownerToken: 7, elapsedMs: 1_000 })
    expect(step.mode).toBe('capture')
    state = completeWholeFrameRefreshCapture(step.state)

    step = stepWholeFrameRefresh(state, { ownerToken: 7, elapsedMs: 1_016 })
    expect(step.mode).toBe('replay')
    state = step.state

    step = stepWholeFrameRefresh(state, { ownerToken: 7, elapsedMs: 10 })
    expect(step.mode).toBe('capture')
    state = completeWholeFrameRefreshCapture(step.state)

    step = stepWholeFrameRefresh(state, { ownerToken: 8, elapsedMs: 20 })
    expect(step.mode).toBe('capture')
  })

  it('compiles a diagnostic cadence that replays between complete refresh traversals', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      masterPixelCount: 4,
      clips: [{
        id: 'heavy',
        source: 'export var renders = 0\nexport function render(index) { renders = renders + 1; rgb(renders / 100, index / pixelCount, 0) }',
        evaluationPolicy: 'refresh',
        refreshIntervalMs: 1_000,
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [0, 1].map(() => ({
          holdMs: 2_000,
          placements: [{ placementId: 'background', zoneName: 'main', clipId: 'heavy', stackOrder: 0 }],
        })),
      },
      loopDurationMs: 4_000,
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
    const firstCapture = renderFrame()
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_renders: 4 })
    handle.beforeRender(16)
    expect(renderFrame()).toEqual(firstCapture)
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_renders: 4 })

    handle.beforeRender(968)
    const secondCapture = renderFrame()
    expect(secondCapture).not.toEqual(firstCapture)
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_renders: 8 })
    handle.beforeRender(16)
    expect(renderFrame()).toEqual(secondCapture)
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_renders: 8 })

    expect(artifact.summary.specializations.refresh).toMatchObject({
      selectedSceneCount: 2,
      cadenceMs: [1_000, 1_000],
      evaluationsAvoidedPerReplayFrame: 4,
    })
  })

  it('fills the first rolling frame completely, then updates one deterministic slice per frame', () => {
    let state = createRollingRefreshState(4)

    let step = stepRollingRefresh(state, { ownerToken: 3, elapsedMs: 0 })
    expect(Array.from({ length: 8 }, (_, index) => rollingRefreshPixelMode(step, index))).toEqual([
      'capture', 'capture', 'capture', 'capture', 'capture', 'capture', 'capture', 'capture',
    ])
    state = completeRollingRefreshCapture(step.state)

    step = stepRollingRefresh(state, { ownerToken: 3, elapsedMs: 16 })
    expect(step.maxPixelAgeFrames).toBe(3)
    expect(Array.from({ length: 8 }, (_, index) => rollingRefreshPixelMode(step, index))).toEqual([
      'replay', 'capture', 'replay', 'replay', 'replay', 'capture', 'replay', 'replay',
    ])
    state = step.state

    step = stepRollingRefresh(state, { ownerToken: 3, elapsedMs: 32 })
    expect(Array.from({ length: 8 }, (_, index) => rollingRefreshPixelMode(step, index))).toEqual([
      'replay', 'replay', 'capture', 'replay', 'replay', 'replay', 'capture', 'replay',
    ])
    state = step.state

    step = stepRollingRefresh(state, { ownerToken: 3, elapsedMs: 1 })
    expect(rollingRefreshPixelMode(step, 0)).toBe('capture')
    expect(rollingRefreshPixelMode(step, 1)).toBe('capture')
  })

  it('compiles a rolling diagnostic that evaluates one bounded pixel slice per frame', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      masterPixelCount: 4,
      clips: [{
        id: 'heavy',
        source: 'export var renders = 0\nexport function render(index) { renders = renders + 1; rgb(renders / 100, index / pixelCount, 0) }',
        evaluationPolicy: 'rolling-refresh',
        rollingRefreshSlices: 4,
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [0, 1].map(() => ({
          holdMs: 2_000,
          placements: [{ placementId: 'background', zoneName: 'main', clipId: 'heavy', stackOrder: 0 }],
        })),
      },
      loopDurationMs: 4_000,
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
    const initial = renderFrame()
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_renders: 4 })
    handle.beforeRender(16)
    const phaseOne = renderFrame()
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_renders: 5 })
    expect(phaseOne[0]).toEqual(initial[0])
    expect(phaseOne[1]).not.toEqual(initial[1])
    expect(phaseOne[2]).toEqual(initial[2])
    expect(phaseOne[3]).toEqual(initial[3])

    handle.beforeRender(16)
    const phaseTwo = renderFrame()
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_renders: 6 })
    expect(phaseTwo[2]).not.toEqual(initial[2])

    expect(artifact.summary.specializations.rollingRefresh).toMatchObject({
      selectedSceneCount: 2,
      slices: [4, 4],
      maxPixelAgeFrames: 3,
      evaluationsAvoidedPerFrame: 3,
    })
  })

  it.each([
    { policy: 'refresh' as const, specialization: 'refresh' as const },
    { policy: 'rolling-refresh' as const, specialization: 'rollingRefresh' as const },
  ])('falls back visibly when the RGB arena cannot serve $policy', ({ policy, specialization }) => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      masterPixelCount: 4,
      clips: [{
        id: 'heavy',
        source: 'export function render(index) { rgb(index / pixelCount, 0, 0) }',
        evaluationPolicy: policy,
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [0, 1].map(() => ({
          holdMs: 2_000,
          placements: [{ placementId: 'background', zoneName: 'main', clipId: 'heavy', stackOrder: 0 }],
        })),
      },
      loopDurationMs: 4_000,
    }, {}, { renderTargetArenaEmission: false })

    expect(artifact.summary.specializations[specialization]).toMatchObject({ selectedSceneCount: 0 })
    expect(artifact.summary.specializations[specialization].captures).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'rejected', reason: 'arena-unavailable' }),
    ]))
    expect(artifact.summary.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('fell back to Live (arena-unavailable)'),
    ]))
  })
})
