import { describe, expect, it } from 'vitest'
import { compileShow, type ShowRecipe } from './showCompiler'
import { loadPattern } from './loadPattern'

const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 2 }] }]

type RoutedPlacements = NonNullable<ShowRecipe['routedSceneSequence']>['scenes'][number]['placements']

function layeredRecipe(clips: ShowRecipe['clips'], placements: RoutedPlacements): ShowRecipe {
  return {
    masterPixelCount: 3,
    clips,
    zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    routedSceneSequence: {
      scenes: [0, 1].map((index) => ({
        holdMs: 1_000,
        placements,
        ...(index === 0 ? { transitionOut: { kind: 'cut' as const, durationMs: 0 } } : {}),
      })),
    },
    loopDurationMs: 2_000,
  }
}

function runtime(recipe: ShowRecipe, conditional = true, coverageDirectedComposition = true, wrapperInlining = true) {
  const artifact = compileShow(recipe, {}, {
    contentKeyConditionalEvaluation: conditional,
    coverageDirectedComposition,
    // Shape assertions on the renderCapture call sites read the wrapper
    // form; production folds those wrappers into their call sites (#929).
    generatedWrapperInlining: wrapperInlining,
  })
  let pixel: [number, number, number] = [0, 0, 0]
  const handle = loadPattern(artifact.code, artifact.metadata, {
    pixelCount: 3,
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
  return { artifact, handle, pixel: () => pixel }
}

describe('multi-layer coverage-directed composition (#534)', () => {
  it('renders an eligible three-layer keyed stack top-down and stops after opacity reaches one', () => {
    const recipe = layeredRecipe([
      { id: 'bottom', source: 'export function render(index) { rgb(1, 0, 0) }' },
      {
        id: 'middle',
        source: 'export function render(index) { if (index == 0) rgb(0, 0, 0); else rgb(0, 0, 1) }',
        effects: [{ id: 'middle-key', kind: 'luma-key', target: 0, tolerance: 0, softness: 0 }],
      },
      {
        id: 'top',
        source: 'export function render(index) { if (index < 2) rgb(0, 0, 0); else rgb(0, 1, 0) }',
        effects: [{ id: 'top-key', kind: 'luma-key', target: 0, tolerance: 0, softness: 0 }],
      },
    ], [
      { placementId: 'bottom', zoneName: 'main', clipId: 'bottom', stackOrder: 0 },
      { placementId: 'middle', zoneName: 'main', clipId: 'middle', stackOrder: 1 },
      { placementId: 'top', zoneName: 'main', clipId: 'top', stackOrder: 2 },
    ])
    const { artifact, handle, pixel } = runtime(recipe)
    const counterfactual = runtime(recipe, true, false)

    handle.beforeRender(0)
    handle.render(0)
    expect(pixel()).toEqual([1, 0, 0])
    handle.render(1)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render(2)
    expect(pixel()).toEqual([0, 1, 0])
    expect(artifact.summary.specializations.contentKeys).toMatchObject({
      selectedStackCount: 2,
      evaluationFormula: 'N + U1 + U2',
      bestCaseRenderersPerPixel: 1,
      worstCaseRenderersPerPixel: 3,
      featheredPixelsEvaluateBoth: true,
    })
    expect(artifact.expandedCode.match(/if \(__pxlblz_show_stack_0_remaining > 0\)/g)).toHaveLength(4)
    expect(counterfactual.artifact.summary.specializations.contentKeys.selectedStackCount).toBe(0)
    expect(counterfactual.artifact.expandedCode).not.toContain('__pxlblz_show_stack_0_remaining')
  })

  it('evaluates every source required by feather pixels and matches ordinary composition', () => {
    const key = { target: 0, tolerance: 0, softness: 1 }
    const recipe = layeredRecipe([
      { id: 'bottom', source: 'export function render(index) { rgb(1, 0, 0) }' },
      {
        id: 'middle',
        source: 'export function render(index) { rgb(0.5, 0.5, 0.5) }',
        effects: [{ id: 'middle-key', kind: 'luma-key', ...key }],
      },
      {
        id: 'top',
        source: 'export function render(index) { rgb(0.5, 0.5, 0.5) }',
        effects: [{ id: 'top-key', kind: 'luma-key', ...key }],
      },
    ], [
      { zoneName: 'main', clipId: 'bottom', stackOrder: 0 },
      { zoneName: 'main', clipId: 'middle', stackOrder: 1 },
      { zoneName: 'main', clipId: 'top', stackOrder: 2 },
    ])
    const selected = runtime(recipe)
    const ordinary = runtime(recipe, false)

    selected.handle.beforeRender(0)
    ordinary.handle.beforeRender(0)
    selected.handle.render(0)
    ordinary.handle.render(0)
    expect(selected.pixel()).toEqual(ordinary.pixel())
    expect(selected.pixel()).toEqual([
      expect.closeTo(0.625, 12),
      expect.closeTo(0.375, 12),
      expect.closeTo(0.375, 12),
    ])
  })

  it('falls back when conditional coverage would skip render-mutating lower state', () => {
    const recipe = layeredRecipe([
      {
        id: 'bottom',
        source: 'export var bottomRenders = 0; export function render(index) { bottomRenders = bottomRenders + 1; rgb(1, 0, 0) }',
      },
      {
        id: 'middle',
        source: 'export var middleRenders = 0; export function render(index) { middleRenders = middleRenders + 1; rgb(0, 0, 1) }',
      },
      {
        id: 'top',
        source: 'export function render(index) { rgb(0, 1, 0) }',
        effects: [{ id: 'top-key', kind: 'luma-key', target: 0, tolerance: 0, softness: 0 }],
      },
    ], [
      { zoneName: 'main', clipId: 'bottom', stackOrder: 0 },
      { zoneName: 'main', clipId: 'middle', stackOrder: 1 },
      { zoneName: 'main', clipId: 'top', stackOrder: 2 },
    ])
    const { artifact, handle } = runtime(recipe)

    handle.beforeRender(0)
    handle.render(0)
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_bottomRenders: 1,
      __pxlblz_show_c1_middleRenders: 1,
    })
    expect(artifact.summary.specializations.contentKeys.stacks).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'rejected', reason: 'render-mutating-lower-layer' }),
    ]))
  })

  it('reports unknown render state and repeated instances as exactness fallbacks', () => {
    const keyed = {
      id: 'top-key',
      kind: 'luma-key' as const,
      target: 0,
      tolerance: 0,
      softness: 0,
    }
    const unknown = layeredRecipe([
      {
        // A multi-statement helper: #565 inlines single-return helpers, so
        // this body must stay a call for the render state to remain unknown.
        id: 'bottom',
        source: 'function color(index) { var v = index / pixelCount; return v } export function render(index) { rgb(color(index), 0, 0) }',
      },
      { id: 'middle', source: 'export function render(index) { rgb(0, 0, 1) }' },
      { id: 'top', source: 'export function render(index) { rgb(0, 1, 0) }', effects: [keyed] },
    ], [
      { zoneName: 'main', clipId: 'bottom', stackOrder: 0 },
      { zoneName: 'main', clipId: 'middle', stackOrder: 1 },
      { zoneName: 'main', clipId: 'top', stackOrder: 2 },
    ])
    const repeated = layeredRecipe([
      { id: 'shared', source: 'export function render(index) { rgb(1, 0, 0) }' },
      { id: 'top', source: 'export function render(index) { rgb(0, 1, 0) }', effects: [keyed] },
    ], [
      { zoneName: 'main', clipId: 'shared', stackOrder: 0 },
      { zoneName: 'main', clipId: 'shared', stackOrder: 1 },
      { zoneName: 'main', clipId: 'top', stackOrder: 2 },
    ])

    expect(runtime(unknown).artifact.summary.specializations.contentKeys.stacks)
      .toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'render-state-unknown-lower-layer' })]))
    expect(runtime(repeated).artifact.summary.specializations.contentKeys.stacks)
      .toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'repeated-instance' })]))
  })

  it('skips pure zero-weight layers, retains stateful render calls, and bypasses full-weight blends', () => {
    const pure = layeredRecipe([
      { id: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
      { id: 'hidden', source: 'export function render(index) { rgb(0, 0, 1) }' },
      { id: 'green', source: 'export function render(index) { rgb(0, 1, 0) }' },
    ], [
      { zoneName: 'main', clipId: 'red', stackOrder: 0 },
      { zoneName: 'main', clipId: 'hidden', stackOrder: 1, opacity: 0 },
      { zoneName: 'main', clipId: 'green', stackOrder: 2, opacity: 1 },
    ])
    const stateful = layeredRecipe([
      { id: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
      {
        id: 'hidden',
        source: 'export var hiddenRenders = 0; export function render(index) { hiddenRenders = hiddenRenders + 1; rgb(0, 0, 1) }',
      },
    ], [
      { zoneName: 'main', clipId: 'red', stackOrder: 0 },
      { zoneName: 'main', clipId: 'hidden', stackOrder: 1, opacity: 0 },
    ])
    const pureRun = runtime(pure)
    const statefulRun = runtime(stateful)

    pureRun.handle.beforeRender(0)
    pureRun.handle.render(0)
    expect(pureRun.pixel()).toEqual([0, 1, 0])
    expect(pureRun.artifact.summary.specializations.contentKeys).toMatchObject({
      zeroWeightLayersSkipped: 2,
      fullWeightBlendBypasses: 4,
    })
    statefulRun.handle.beforeRender(0)
    statefulRun.handle.render(0)
    expect(statefulRun.handle.getExports()).toMatchObject({ __pxlblz_show_c1_hiddenRenders: 1 })
    expect(statefulRun.artifact.summary.specializations.contentKeys).toMatchObject({
      zeroWeightRequiredCallsRetained: 2,
    })
  })

  it('short-circuits exact opacity-track endpoints only for a proven-pure renderer', () => {
    const opacityTrack = (placementId: string) => ({
      id: `opacity-${placementId}`,
      target: { kind: 'placement-opacity' as const, placementId },
      keyframes: [
        { id: 'hidden', timeMs: 0, value: 0, easing: { curve: 'hold' as const, at: 0.5 } },
        { id: 'visible', timeMs: 1_000, value: 1, easing: { curve: 'linear' as const } },
      ],
    })
    const build = (overlaySource: string) => {
      const recipe = layeredRecipe([
        { id: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'overlay', source: overlaySource },
      ], [
        { placementId: 'red', zoneName: 'main', clipId: 'red', stackOrder: 0 },
        { placementId: 'overlay', zoneName: 'main', clipId: 'overlay', stackOrder: 1, opacity: 0 },
      ])
      recipe.routedSceneSequence!.scenes[0].propertyTracks = [opacityTrack('overlay')]
      return recipe
    }
    const pure = runtime(build('export function render(index) { rgb(0, 0, 1) }'), true, true, false)
    const stateful = runtime(build(
      'export var renders = 0; export function render(index) { renders = renders + 1; rgb(0, 0, 1) }',
    ))

    pure.handle.beforeRender(0)
    pure.handle.render(0)
    expect(pure.pixel()).toEqual([1, 0, 0])
    expect(pure.artifact.summary.specializations.contentKeys).toMatchObject({
      trackedEndpointLayersEligible: 1,
      trackedEndpointRequiredCallsRetained: 0,
    })
    expect(pure.artifact.expandedCode).toMatch(/if \(__pxlblz_show_stack_0_opacity_1 > 0\) \{[^]*__pxlblz_show_c1_renderCapture/)
    expect(pure.artifact.expandedCode).toContain('if (__pxlblz_show_stack_0_opacity_1 == 1)')

    stateful.handle.beforeRender(0)
    stateful.handle.render(0)
    expect(stateful.pixel()).toEqual([1, 0, 0])
    expect(stateful.handle.getExports()).toMatchObject({ __pxlblz_show_c1_renders: 1 })
    expect(stateful.artifact.summary.specializations.contentKeys).toMatchObject({
      trackedEndpointLayersEligible: 0,
      trackedEndpointRequiredCallsRetained: 1,
    })
  })

  it('leaves ordinary non-keyed and unsupported stacks byte-for-byte unchanged', () => {
    const ordinary = layeredRecipe([
      { id: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
      { id: 'blue', source: 'export function render(index) { rgb(0, 0, 1) }' },
    ], [
      { zoneName: 'main', clipId: 'red', stackOrder: 0, opacity: 0.5 },
      { zoneName: 'main', clipId: 'blue', stackOrder: 1, opacity: 1 },
    ])
    const unsupported = layeredRecipe([
      {
        id: 'bottom',
        source: 'export var renders = 0; export function render(index) { renders = renders + 1; rgb(1, 0, 0) }',
      },
      { id: 'middle', source: 'export function render(index) { rgb(0, 0, 1) }' },
      {
        id: 'top',
        source: 'export function render(index) { rgb(0, 1, 0) }',
        effects: [{ id: 'top-key', kind: 'luma-key', target: 0, tolerance: 0, softness: 0 }],
      },
    ], [
      { zoneName: 'main', clipId: 'bottom', stackOrder: 0 },
      { zoneName: 'main', clipId: 'middle', stackOrder: 1 },
      { zoneName: 'main', clipId: 'top', stackOrder: 2 },
    ])

    for (const recipe of [ordinary, unsupported]) {
      const selected = runtime(recipe, true, true).artifact
      const counterfactual = runtime(recipe, true, false).artifact
      expect(selected.code).toBe(counterfactual.code)
      expect(selected.expandedCode).toBe(counterfactual.expandedCode)
      expect(selected.fxCode).toBe(counterfactual.fxCode)
    }
  })

  it('keeps the qualified two-layer content-key artifact unchanged', () => {
    const recipe = layeredRecipe([
      { id: 'bottom', source: 'export function render(index) { rgb(1, 0, 0) }' },
      {
        id: 'top',
        source: 'export function render(index) { if (index == 0) rgb(0, 0, 0); else rgb(0, 1, 0) }',
        effects: [{ id: 'top-key', kind: 'luma-key', target: 0, tolerance: 0, softness: 0 }],
      },
    ], [
      { zoneName: 'main', clipId: 'bottom', stackOrder: 0 },
      { zoneName: 'main', clipId: 'top', stackOrder: 1 },
    ])

    expect(runtime(recipe, true, true).artifact.expandedCode)
      .toBe(runtime(recipe, true, false).artifact.expandedCode)
  })
})
