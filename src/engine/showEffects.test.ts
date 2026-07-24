import {
  applyShowEffectsToSample,
  applyShowColorEffects,
  applyShowOutputEffects,
  buildShowEffectSampleMatrix,
  normalizeShowClipEffects,
  sameShowEffectStructure,
  showEffectAnimatableParameterNames,
  showEffectParameterNames,
  showEffectsAreIdentity,
} from './showEffects'
import {
  addShowCellEffect,
  createDefaultShow,
  moveShowCellEffect,
  normalizeShowTransitionState,
  removeShowCellEffect,
  showRecordToCompileRecipe,
  updateShowBoundaryTransition,
  updateShowCellEffect,
  updateShowCellEffects,
  updateShowCellPattern,
} from './showModel'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import {
  captureShowToolkitFixture,
  createShowEffectToolkitFixtureRecipes,
  roundTripShowToolkitFixtureRecord,
} from './showVisualToolkitFixtures'

describe('Show clip Effects (#444)', () => {
  it('composes affine operations in authored order and samples through the inverse matrix', () => {
    const translateThenScale = [
      { id: 'move', kind: 'translate' as const, x: 0.25, y: 0 },
      { id: 'size', kind: 'scale' as const, x: 2, y: 1 },
    ]
    const scaleThenTranslate = [...translateThenScale].reverse()

    expect(applyShowEffectsToSample(translateThenScale, 0.5, 0.5).x).toBeCloseTo(0.25, 12)
    expect(applyShowEffectsToSample(scaleThenTranslate, 0.5, 0.5).x).toBeCloseTo(0.375, 12)
    expect(buildShowEffectSampleMatrix(translateThenScale)).not.toEqual(buildShowEffectSampleMatrix(scaleThenTranslate))
  })

  it('applies wrap once after affine composition and otherwise clips to a black-border sample', () => {
    const translate = [{ id: 'move', kind: 'translate' as const, x: 0.4, y: 0 }]
    const clipped = applyShowEffectsToSample(translate, 0.1, 0.5)
    const wrapped = applyShowEffectsToSample([...translate, { id: 'wrap', kind: 'wrap' as const }], 0.1, 0.5)

    expect(clipped).toMatchObject({ x: 0, y: 0.5, inside: false, addressPolicy: 'clip' })
    expect(wrapped).toMatchObject({ x: 0.7, y: 0.5, inside: true, addressPolicy: 'wrap' })
  })

  it('multiplies opacity toward the black Show background', () => {
    expect(applyShowEffectsToSample([
      { id: 'fade-a', kind: 'opacity', opacity: 0.5 },
      { id: 'fade-b', kind: 'opacity', opacity: 0.4 },
    ], 0.5, 0.5).opacity).toBeCloseTo(0.2, 12)
  })

  it('normalizes malformed values and duplicate ids without changing valid order', () => {
    expect(normalizeShowClipEffects([
      { id: 'move', kind: 'translate', x: Number.NaN, y: 9 },
      { id: 'move', kind: 'opacity', opacity: -1 },
    ])).toEqual([
      { id: 'move', kind: 'translate', x: 0, y: 2 },
      { id: 'move-2', kind: 'opacity', opacity: 0 },
    ])
  })

  it('normalizes and evaluates Vignette as an exact coordinate-aware output Effect (#539)', () => {
    const vignette = normalizeShowClipEffects([{
      id: 'edge',
      kind: 'vignette',
      amount: 2,
      radius: Number.NaN,
      softness: -1,
      centerX: 3,
      centerY: -2,
      aspect: 0,
    }])[0]

    expect(vignette).toEqual({
      id: 'edge', kind: 'vignette', amount: 1, radius: 0.35, softness: 0,
      centerX: 1, centerY: 0, aspect: 0.1,
    })
    const authored = {
      id: 'edge', kind: 'vignette' as const, amount: 1, radius: 0.25,
      softness: 0.25, centerX: 0.5, centerY: 0.5, aspect: 1,
    }
    expect(applyShowOutputEffects([authored], [1, 0.5, 0.25], 1, { x: 0.5, y: 0.5 }).color)
      .toEqual([1, 0.5, 0.25])
    expect(applyShowOutputEffects([authored], [1, 0.5, 0.25], 1, { x: 1, y: 1 }).color)
      .toEqual([0, 0, 0])
    expect(showEffectsAreIdentity([{ ...authored, amount: 0 }])).toBe(true)
    expect(showEffectParameterNames(authored)).toEqual([
      'amount', 'radius', 'softness', 'centerX', 'centerY', 'aspect',
    ])
  })

  it('recognizes identity stacks and stable animation-compatible structure', () => {
    const identity = [
      { id: 'move', kind: 'translate' as const, x: 0, y: 0 },
      { id: 'fade', kind: 'opacity' as const, opacity: 1 },
      { id: 'wrap', kind: 'wrap' as const },
    ]
    expect(showEffectsAreIdentity(identity)).toBe(true)
    expect(sameShowEffectStructure(identity, identity.map((effect) => ({ ...effect })))).toBe(true)
    expect(sameShowEffectStructure(identity, identity.slice().reverse())).toBe(false)
  })

  it('normalizes the selected distortion set and treats zero Amount as exact identity (#456)', () => {
    const normalized = normalizeShowClipEffects([
      { id: 'ripple', kind: 'ripple', amount: Number.NaN, frequency: 99, phase: 2, centerX: -1, centerY: 3 },
      { id: 'swirl', kind: 'swirl', amount: 9, radius: 0, centerX: 0.5, centerY: 0.5 },
      { id: 'bulge', kind: 'bulge', amount: -9, radius: 9, centerX: 0.5, centerY: 0.5 },
      { id: 'pixels', kind: 'pixelate', amount: 0, columns: 4.4, rows: 999 },
      { id: 'kaleido', kind: 'kaleidoscope', amount: 0, segments: 1, rotation: 9, centerX: 0.5, centerY: 0.5 },
    ])

    expect(normalized).toEqual([
      { id: 'ripple', kind: 'ripple', amount: 0, frequency: 32, phase: 2, centerX: 0, centerY: 1 },
      { id: 'swirl', kind: 'swirl', amount: 4, radius: 0.05, centerX: 0.5, centerY: 0.5 },
      { id: 'bulge', kind: 'bulge', amount: -0.95, radius: 2, centerX: 0.5, centerY: 0.5 },
      { id: 'pixels', kind: 'pixelate', amount: 0, columns: 4, rows: 128 },
      { id: 'kaleido', kind: 'kaleidoscope', amount: 0, segments: 2, rotation: 8, centerX: 0.5, centerY: 0.5 },
    ])
    expect(showEffectsAreIdentity(normalized.filter((effect) => (
      effect.kind === 'ripple' || effect.kind === 'pixelate' || effect.kind === 'kaleidoscope'
    )))).toBe(true)
    expect(showEffectParameterNames(normalized[0])).toEqual(['amount', 'frequency', 'phase', 'centerX', 'centerY'])
  })

  it('samples every selected distortion deterministically and stays finite at degenerate coordinates (#456)', () => {
    expect(applyShowEffectsToSample([
      { id: 'pixels', kind: 'pixelate', amount: 1, columns: 4, rows: 2 },
    ], 0.3, 0.7)).toMatchObject({ x: 0.375, y: 0.75, inside: true })

    const effects = [
      { id: 'ripple', kind: 'ripple' as const, amount: 0.1, frequency: 8, phase: 0.125, centerX: 0.5, centerY: 0.5 },
      { id: 'swirl', kind: 'swirl' as const, amount: 0.75, radius: 0.7, centerX: 0.5, centerY: 0.5 },
      { id: 'bulge', kind: 'bulge' as const, amount: -0.95, radius: 0.7, centerX: 0.5, centerY: 0.5 },
      { id: 'kaleido', kind: 'kaleidoscope' as const, amount: 1, segments: 6, rotation: 0.125, centerX: 0.5, centerY: 0.5 },
    ]
    for (const sample of [[0.5, 0.5], [0, 0], [1, 1], [0.51, 0.49]] as const) {
      const first = applyShowEffectsToSample(effects, sample[0], sample[1])
      expect(first).toEqual(applyShowEffectsToSample(effects, sample[0], sample[1]))
      expect(Number.isFinite(first.x)).toBe(true)
      expect(Number.isFinite(first.y)).toBe(true)
    }
    expect(applyShowEffectsToSample(effects, 0.2, 0.7)).not.toMatchObject({ x: 0.2, y: 0.7 })
    expect(applyShowEffectsToSample(effects.map((effect) => ({ ...effect, amount: 0 })), 0.2, 0.7))
      .toMatchObject({ x: 0.2, y: 0.7, inside: true })
  })

  it('persists, edits, reorders, removes, and reloads an ordered Effect stack', () => {
    const base = createDefaultShow('effects', 'Effects', 1)
    let authored = addShowCellEffect(base, 'cell-1', { id: 'move', kind: 'translate', x: 0.25, y: 0 })
    authored = addShowCellEffect(authored, 'cell-1', { id: 'size', kind: 'scale', x: 2, y: 1 })
    authored = addShowCellEffect(authored, 'cell-1', { id: 'wrap', kind: 'wrap' })
    const edited = updateShowCellEffect(authored, 'cell-1', 'move', { kind: 'translate', x: 0.5 })
    const moved = moveShowCellEffect(edited, 'cell-1', 'size', 0)
    const removed = removeShowCellEffect(moved, 'cell-1', 'wrap')
    const reloaded = normalizeShowTransitionState(JSON.parse(JSON.stringify(removed)))

    expect(reloaded.cells[0].effects).toEqual([
      { id: 'size', kind: 'scale', x: 2, y: 1 },
      { id: 'move', kind: 'translate', x: 0.5, y: 0 },
    ])
  })

  it('emits no generated behavior for an explicit identity stack', () => {
    const source = 'export function render2D(index, x, y) { rgb(x, y, 1) }'
    const plain = compileShow({ clips: [{ id: 'clip', source }] }, {})
    const identity = compileShow({
      clips: [{
        id: 'clip',
        source,
        effects: [
          { id: 'fade', kind: 'opacity', opacity: 1 },
          { id: 'move', kind: 'translate', x: 0, y: 0 },
          { id: 'size', kind: 'scale', x: 1, y: 1 },
          { id: 'ripple', kind: 'ripple', amount: 0, frequency: 8, phase: 0, centerX: 0.5, centerY: 0.5 },
          { id: 'swirl', kind: 'swirl', amount: 0, radius: 0.7, centerX: 0.5, centerY: 0.5 },
          { id: 'bulge', kind: 'bulge', amount: 0, radius: 0.7, centerX: 0.5, centerY: 0.5 },
          { id: 'pixels', kind: 'pixelate', amount: 0, columns: 12, rows: 12 },
          { id: 'kaleido', kind: 'kaleidoscope', amount: 0, segments: 6, rotation: 0, centerX: 0.5, centerY: 0.5 },
          { id: 'wrap', kind: 'wrap' },
        ],
      }],
    }, {})

    expect(identity.code).toBe(plain.code)
  })

  it('matches pure affine, wrap, clip-border, and opacity behavior in generated preview output', () => {
    const source = 'export function render2D(index, x, y) { rgb(x, y, 1) }'
    const render = (effects: Parameters<typeof applyShowEffectsToSample>[0], sample: [number, number]) => {
      const artifact = compileShow({ clips: [{ id: 'clip', source, effects: effects ? [...effects] : undefined }] }, {})
      return createFastReplayRuntime({
        code: artifact.code,
        metadata: artifact.metadata,
        dimension: nativeDimension(artifact.metadata.renderFns),
      }, { mapPoints: [{ sample }], randomSeed: 444 }).renderCurrentFrame().pixels[0]
    }
    const effects = [
      { id: 'move', kind: 'translate' as const, x: 0.4, y: 0 },
      { id: 'fade', kind: 'opacity' as const, opacity: 0.5 },
    ]

    expect(render(effects, [0.5, 0.5])).toEqual([
      expect.closeTo(0.05, 12),
      expect.closeTo(0.25, 12),
      expect.closeTo(0.5, 12),
    ])
    expect(render(effects, [0.1, 0.5])).toEqual([0, 0, 0])
    expect(render([...effects, { id: 'wrap', kind: 'wrap' }], [0.1, 0.5])).toEqual([
      expect.closeTo(0.35, 12),
      expect.closeTo(0.25, 12),
      expect.closeTo(0.5, 12),
    ])
  })

  it('keeps generated translate, rotate, scale, shear, and wrap sampling equivalent to the pure substrate', () => {
    const effects = [
      { id: 'move', kind: 'translate' as const, x: 0.2, y: -0.1 },
      { id: 'turn', kind: 'rotate' as const, turns: 0.125 },
      { id: 'size', kind: 'scale' as const, x: 1.5, y: 0.75 },
      { id: 'slant', kind: 'shear' as const, x: 0.2, y: -0.1 },
      { id: 'wrap', kind: 'wrap' as const },
      { id: 'fade', kind: 'opacity' as const, opacity: 0.6 },
    ]
    const sample: [number, number] = [0.3, 0.7]
    const expected = applyShowEffectsToSample(effects, ...sample)
    const artifact = compileShow({
      clips: [{ id: 'clip', source: 'export function render2D(index, x, y) { rgb(x, y, 1) }', effects }],
    }, {})
    const actual = createFastReplayRuntime({
      code: artifact.code,
      metadata: artifact.metadata,
      dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints: [{ sample }], randomSeed: 444 }).renderCurrentFrame().pixels[0]

    expect(actual).toEqual([
      expect.closeTo(expected.x * expected.opacity, 12),
      expect.closeTo(expected.y * expected.opacity, 12),
      expect.closeTo(expected.opacity, 12),
    ])
  })

  it('animates Effect parameters through the shared boundary-owned property path', () => {
    const source = 'export function render2D(index, x, y) { rgb(x, y, 1) }'
    let show = createDefaultShow('animated-effects', 'Animated Effects', 1)
    show = updateShowCellPattern(show, 'cell-2', {
      pattern: show.cells[0].pattern,
      patternName: show.cells[0].patternName,
    })
    show = updateShowCellEffects(show, 'cell-1', [
      { id: 'move', kind: 'translate', x: 0, y: 0 },
      { id: 'fade', kind: 'opacity', opacity: 1 },
    ])
    show = updateShowCellEffects(show, 'cell-2', [
      { id: 'move', kind: 'translate', x: 0.4, y: 0 },
      { id: 'fade', kind: 'opacity', opacity: 0.5 },
    ])
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        effects: {
          move: { x: { fromByCellId: { 'cell-2': 0 }, durationMs: 2000, easing: { curve: 'linear' } } },
          fade: { opacity: { fromByCellId: { 'cell-2': 1 }, durationMs: 2000, easing: { curve: 'linear' } } },
        },
      },
    })
    const recipe = showRecordToCompileRecipe(show, { byCellId: { 'cell-1': source, 'cell-2': source } })
    const artifact = compileShow(recipe, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      metadata: artifact.metadata,
      dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints: [{ sample: [0.5, 0.5] }], randomSeed: 444 })

    expect(recipe.adaptationRamp?.effectRamps).toMatchObject({
      move: { x: { from: 0, to: 0.4, durationMs: 2000 } },
      fade: { opacity: { from: 1, to: 0.5, durationMs: 2000 } },
    })
    expect(runtime.advanceTo(29_000, { stepMs: 50 }).pixels[0]).toEqual([0.5, 0.5, 1])
    expect(runtime.advanceTo(31_000, { stepMs: 50 }).pixels[0]).toEqual([
      expect.closeTo(0.225, 12), expect.closeTo(0.375, 12), expect.closeTo(0.75, 12),
    ])
    expect(runtime.advanceTo(32_000, { stepMs: 50 }).pixels[0]).toEqual([
      expect.closeTo(0.05, 12), expect.closeTo(0.25, 12), expect.closeTo(0.5, 12),
    ])
    expect(artifact.summary.cost.cpu).toMatchObject({
      patternEvaluations: { formula: 'N', basePerPixel: 1 },
      effects: {
        affineOperationsPerFrame: 1,
        animatedParametersPerFrame: 2,
        affineScalarOpsPerEvaluatedPixel: 8,
        opacityMultipliesPerEvaluatedPixel: 3,
        addressPolicy: 'clip',
      },
    })
    expect(artifact.summary.cost.memory.generatedScalarGlobals).toBeGreaterThan(13)
  })

  it('animates Color Map Amount while keeping its persisted colors available to the compiler', () => {
    const source = 'export function render2D(index, x, y) { rgb(0.5, 0.5, 0.5) }'
    let show = createDefaultShow('animated-color-map', 'Animated Color Map', 1)
    show = updateShowCellPattern(show, 'cell-2', {
      pattern: show.cells[0].pattern,
      patternName: show.cells[0].patternName,
    })
    show = updateShowCellEffects(show, 'cell-1', [{
      id: 'map', kind: 'color-map', amount: 0,
      shadowR: 0, shadowG: 0, shadowB: 0,
      highlightR: 1, highlightG: 1, highlightB: 1,
    }])
    show = updateShowCellEffects(show, 'cell-2', [{
      id: 'map', kind: 'color-map', amount: 1,
      shadowR: 0.2, shadowG: 0.1, shadowB: 0,
      highlightR: 1, highlightG: 0.8, highlightB: 0.6,
    }])
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        effects: {
          map: { amount: { fromByCellId: { 'cell-2': 0 }, durationMs: 2_000, easing: { curve: 'linear' } } },
        },
      },
    })
    const recipe = showRecordToCompileRecipe(show, { byCellId: { 'cell-1': source, 'cell-2': source } })
    const artifact = compileShow(recipe, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      metadata: artifact.metadata,
      dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints: [{ sample: [0.5, 0.5] }], randomSeed: 609 })

    expect(recipe.adaptationRamp?.effectRamps).toEqual({
      map: {
        amount: { from: 0, to: 1, durationMs: 2_000, easing: { curve: 'linear' } },
      },
    })
    expect(artifact.expandedCode).toMatch(/var __pxlblz_show_c\d+_fx_p0_shadowR = 0\.2/)
    expect(runtime.advanceTo(31_000, { stepMs: 50 }).pixels[0]).toEqual([
      expect.closeTo(0.55, 12),
      expect.closeTo(0.475, 12),
      expect.closeTo(0.4, 12),
    ])
  })

  it('renders Color Map channels from a routed placement without a property track', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 0 }] }]
    const artifact = compileShow({
      masterPixelCount: 1,
      clips: [{
        id: 'clip',
        source: 'export function render(index) { rgb(0.5, 0.5, 0.5) }',
        effects: [{
          id: 'map', kind: 'color-map', amount: 1,
          shadowR: 0.2, shadowG: 0.1, shadowB: 0,
          highlightR: 1, highlightG: 0.8, highlightB: 0.6,
        }],
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [0, 1].map((index) => ({
          holdMs: 1_000,
          placements: [{
            placementId: `placement-${index}`,
            zoneName: 'main',
            clipId: 'clip',
            effects: [{
              id: 'map', kind: 'color-map', amount: 1,
              shadowR: 0.2, shadowG: 0.1, shadowB: 0,
              highlightR: 1, highlightG: 0.8, highlightB: 0.6,
            }],
          }],
          ...(index === 0 ? { transitionOut: { kind: 'cut' as const, durationMs: 0 } } : {}),
        })),
      },
      loopDurationMs: 2_000,
    }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      metadata: artifact.metadata,
      dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints: [{ sample: [0.5] }], randomSeed: 609 })

    expect(runtime.advanceTo(500, { stepMs: 50 }).pixels[0]).toEqual([
      expect.closeTo(0.6, 12),
      expect.closeTo(0.45, 12),
      expect.closeTo(0.3, 12),
    ])
  })

  it('lowers every affine and opacity parameter through one generic Effect-ramp schema', () => {
    const identity = [
      { id: 'move', kind: 'translate' as const, x: 0, y: 0 },
      { id: 'turn', kind: 'rotate' as const, turns: 0 },
      { id: 'size', kind: 'scale' as const, x: 1, y: 1 },
      { id: 'slant', kind: 'shear' as const, x: 0, y: 0 },
      { id: 'fade', kind: 'opacity' as const, opacity: 1 },
    ]
    const target = [
      { id: 'move', kind: 'translate' as const, x: 0.2, y: -0.1 },
      { id: 'turn', kind: 'rotate' as const, turns: 0.25 },
      { id: 'size', kind: 'scale' as const, x: 2, y: 0.5 },
      { id: 'slant', kind: 'shear' as const, x: 0.3, y: -0.2 },
      { id: 'fade', kind: 'opacity' as const, opacity: 0.4 },
    ]
    let show = createDefaultShow('all-effect-ramps', 'All Effect ramps', 1)
    show = updateShowCellPattern(show, 'cell-2', { pattern: show.cells[0].pattern, patternName: show.cells[0].patternName })
    show = updateShowCellEffects(show, 'cell-1', identity)
    show = updateShowCellEffects(show, 'cell-2', target)
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        effects: Object.fromEntries(target.map((effect) => [
          effect.id,
          Object.fromEntries(Object.keys(effect).filter((key) => !['id', 'kind'].includes(key)).map((parameter) => [
            parameter,
            { fromByCellId: {} },
          ])),
        ])),
      },
    })
    const source = 'export function render2D(index, x, y) { rgb(x, y, 1) }'
    const recipe = showRecordToCompileRecipe(show, { byCellId: { 'cell-1': source, 'cell-2': source } })
    const artifact = compileShow(recipe, {})

    expect(recipe.adaptationRamp?.effectRamps).toMatchObject({
      move: { x: { to: 0.2 }, y: { to: -0.1 } },
      turn: { turns: { to: 0.25 } },
      size: { x: { to: 2 }, y: { to: 0.5 } },
      slant: { x: { to: 0.3 }, y: { to: -0.2 } },
      fade: { opacity: { to: 0.4 } },
    })
    expect(artifact.summary.cost.cpu.effects.animatedParametersPerFrame).toBe(8)
  })

  it('provides deterministic persisted and generated visual evidence for the Effect tracer set', () => {
    const fixtures = createShowEffectToolkitFixtureRecipes()
    expect(fixtures.map((fixture) => fixture.id)).toEqual([
      'effect-opacity',
      'effect-color-brightness',
      'effect-color-hue',
      'effect-color-saturation',
      'effect-color-contrast',
      'effect-color-invert',
      'effect-color-threshold',
      'effect-color-luma-key',
      'effect-color-chroma-key',
      'effect-color-posterize',
      'effect-color-vignette',
      'effect-color-color-map',
      'effect-affine-mirror',
      'effect-affine-wrap',
      'effect-distortion-ripple',
      'effect-distortion-swirl',
      'effect-distortion-bulge',
      'effect-distortion-pinch',
      'effect-distortion-pixelate',
      'effect-distortion-kaleidoscope',
      'effect-distortion-animated',
      'effect-animated',
      'effect-color-composed-animated',
    ])
    for (const fixture of fixtures) {
      expect(captureShowToolkitFixture(fixture)).toEqual(captureShowToolkitFixture(fixture))
      expect(roundTripShowToolkitFixtureRecord(fixture)).toEqual(fixture.persistedRecord)
    }
    const animated = captureShowToolkitFixture(fixtures.find((fixture) => fixture.id === 'effect-color-composed-animated')!)
    expect(new Set(animated.frames.map((frame) => frame.checksum)).size).toBeGreaterThan(2)
    const animatedDistortion = captureShowToolkitFixture(fixtures.find((fixture) => fixture.id === 'effect-distortion-animated')!)
    expect(new Set(animatedDistortion.frames.map((frame) => frame.checksum)).size).toBeGreaterThan(2)
  })

  it('applies the common output Effects in authored order (#454)', () => {
    const brightenThenThreshold = applyShowColorEffects([
      { id: 'light', kind: 'brightness', brightness: 2 },
      { id: 'cut', kind: 'threshold', threshold: 0.5, amount: 1 },
    ], [0.4, 0.4, 0.4])
    const thresholdThenBrighten = applyShowColorEffects([
      { id: 'cut', kind: 'threshold', threshold: 0.5, amount: 1 },
      { id: 'light', kind: 'brightness', brightness: 2 },
    ], [0.4, 0.4, 0.4])

    expect(brightenThenThreshold).toEqual([1, 1, 1])
    expect(thresholdThenBrighten).toEqual([0, 0, 0])
  })

  it('turns luma and chroma distance into an authored feathered matte (#527)', () => {
    const luma = { id: 'black-key', kind: 'luma-key' as const, target: 0, tolerance: 0.1, softness: 0.1 }
    expect(applyShowOutputEffects([luma], [0, 0, 0]).opacity).toBe(0)
    expect(applyShowOutputEffects([luma], [0.15, 0.15, 0.15]).opacity).toBeCloseTo(0.5, 12)
    expect(applyShowOutputEffects([luma], [0.3, 0.3, 0.3]).opacity).toBe(1)

    const chroma = {
      id: 'green-key', kind: 'chroma-key' as const, color: '#00ff00', tolerance: 0.1, softness: 0.1,
    }
    expect(applyShowOutputEffects([chroma], [0, 1, 0]).opacity).toBe(0)
    expect(applyShowOutputEffects([chroma], [1, 0, 1]).opacity).toBe(1)
    expect(applyShowOutputEffects([
      { id: 'light', kind: 'brightness', brightness: 2 },
      chroma,
    ], [0, 0.5, 0]).opacity).toBe(0)
    expect(applyShowOutputEffects([
      chroma,
      { id: 'light', kind: 'brightness', brightness: 2 },
    ], [0, 0.5, 0]).opacity).toBe(1)
  })

  it('matches feathered luma-key opacity in generated Show output (#527)', () => {
    const effect = { id: 'black-key', kind: 'luma-key' as const, target: 0, tolerance: 0.1, softness: 0.1 }
    const compiled = compileShow({
      clips: [{
        id: 'keyed',
        source: 'export function render2D(index, x, y) { rgb(x, x, x) }',
        effects: [effect],
      }],
    }, {})
    const runtime = createFastReplayRuntime({
      code: compiled.code,
      metadata: compiled.metadata,
      dimension: nativeDimension(compiled.metadata.renderFns),
    }, {
      mapPoints: [0, 0.15, 0.3].map((x) => ({ sample: [x, 0.5] })),
      randomSeed: 527,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([
      [0, 0, 0],
      [expect.closeTo(0.075, 12), expect.closeTo(0.075, 12), expect.closeTo(0.075, 12)],
      [0.3, 0.3, 0.3],
    ])
    expect(compiled.summary.cost.cpu.effects).toMatchObject({
      keyEffectsPerEvaluatedPixel: 1,
      keyScalarOpsPerEvaluatedPixel: 13,
      keySqrtCallsPerEvaluatedPixel: 0,
    })
  })

  it('matches chroma-key target removal in generated Show output (#527)', () => {
    const compiled = compileShow({
      clips: [{
        id: 'keyed',
        source: 'export function render(index) { if (index == 0) rgb(0, 1, 0); else rgb(1, 0, 1) }',
        effects: [{ id: 'green-key', kind: 'chroma-key', color: '#00ff00', tolerance: 0.05, softness: 0.05 }],
      }],
    }, {})
    const runtime = createFastReplayRuntime({
      code: compiled.code,
      metadata: compiled.metadata,
      dimension: nativeDimension(compiled.metadata.renderFns),
    }, {
      mapPoints: [{ sample: [0] }, { sample: [1] }],
      randomSeed: 527,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([
      [0, 0, 0],
      [1, 0, 1],
    ])
    expect(compiled.summary.cost.cpu.effects).toMatchObject({
      keyEffectsPerEvaluatedPixel: 1,
      keyScalarOpsPerEvaluatedPixel: 20,
      keySqrtCallsPerEvaluatedPixel: 0,
    })
  })

  it('evaluates hue, saturation, contrast, invert, posterize, and gradient color mapping (#454)', () => {
    expect(applyShowColorEffects([{ id: 'hue', kind: 'hue', turns: 0 }], [0.2, 0.4, 0.6]))
      .toEqual([0.2, 0.4, 0.6])
    expect(applyShowColorEffects([{ id: 'sat', kind: 'saturation', saturation: 0 }], [1, 0, 0]))
      .toEqual([expect.closeTo(0.2126, 12), expect.closeTo(0.2126, 12), expect.closeTo(0.2126, 12)])
    expect(applyShowColorEffects([{ id: 'contrast', kind: 'contrast', contrast: 2 }], [0.25, 0.5, 0.75]))
      .toEqual([0, 0.5, 1])
    expect(applyShowColorEffects([{ id: 'invert', kind: 'invert', amount: 1 }], [0.2, 0.4, 0.6]))
      .toEqual([0.8, 0.6, 0.4])
    expect(applyShowColorEffects([{ id: 'poster', kind: 'posterize', levels: 3, amount: 1 }], [0.2, 0.6, 0.9]))
      .toEqual([0, 0.5, 1])
    expect(applyShowColorEffects([{
      id: 'map', kind: 'color-map', amount: 1,
      shadowR: 1, shadowG: 0, shadowB: 0,
      highlightR: 0, highlightG: 0, highlightB: 1,
    }], [0, 0, 0])).toEqual([1, 0, 0])
  })

  it('normalizes every color parameter and recognizes exact neutral identities (#454)', () => {
    const neutral = normalizeShowClipEffects([
      { id: 'light', kind: 'brightness', brightness: Number.NaN },
      { id: 'hue', kind: 'hue', turns: 0 },
      { id: 'sat', kind: 'saturation', saturation: 1 },
      { id: 'contrast', kind: 'contrast', contrast: 1 },
      { id: 'invert', kind: 'invert', amount: 0 },
      { id: 'cut', kind: 'threshold', threshold: 0.5, amount: 0 },
      { id: 'poster', kind: 'posterize', levels: 8, amount: 0 },
      {
        id: 'map', kind: 'color-map', amount: 0,
        shadowR: 0, shadowG: 0, shadowB: 0,
        highlightR: 1, highlightG: 1, highlightB: 1,
      },
    ])
    expect(neutral[0]).toEqual({ id: 'light', kind: 'brightness', brightness: 1 })
    expect(showEffectsAreIdentity(neutral)).toBe(true)
  })

  it('persists, orders, animates, and reloads all common output Effects (#454)', () => {
    const effects = [
      { id: 'light', kind: 'brightness' as const, brightness: 1.2 },
      { id: 'hue', kind: 'hue' as const, turns: 0.2 },
      { id: 'sat', kind: 'saturation' as const, saturation: 0.7 },
      { id: 'contrast', kind: 'contrast' as const, contrast: 1.4 },
      { id: 'invert', kind: 'invert' as const, amount: 0.3 },
      { id: 'cut', kind: 'threshold' as const, threshold: 0.4, amount: 0.5 },
      { id: 'poster', kind: 'posterize' as const, levels: 6, amount: 0.8 },
      { id: 'map', kind: 'color-map' as const, amount: 0.6, shadowR: 0.1, shadowG: 0.2, shadowB: 0.3, highlightR: 1, highlightG: 0.8, highlightB: 0.6 },
    ]
    const show = updateShowCellEffects(createDefaultShow('colors', 'Colors', 454), 'cell-1', effects)
    expect(normalizeShowTransitionState(JSON.parse(JSON.stringify(show))).cells[0].effects).toEqual(effects)
    expect(showEffectParameterNames(effects[7])).toEqual([
      'amount', 'shadowR', 'shadowG', 'shadowB', 'highlightR', 'highlightG', 'highlightB',
    ])
    expect(showEffectAnimatableParameterNames(effects[7])).toEqual(['amount'])
  })

  it('keeps legacy brightness in the single ordered output evaluator (#454)', () => {
    const source = 'export function render2D(index, x, y) { rgb(0.4, 0.2, 0.1) }'
    const legacy = compileShow({ clips: [{ id: 'clip', source, adaptation: { brightness: 0.5 } }] }, {})
    const runtime = createFastReplayRuntime({
      code: legacy.code, metadata: legacy.metadata, dimension: nativeDimension(legacy.metadata.renderFns),
    }, { mapPoints: [{ sample: [0.5, 0.5] }], randomSeed: 454 })
    expect(runtime.renderCurrentFrame().pixels[0]).toEqual([0.2, 0.1, 0.05])
    expect(legacy.expandedCode).not.toMatch(/function __pxlblz_show_c0_rgb\([^)]*\) \{[^}]*adapt_brightness/)
    expect(legacy.expandedCode).not.toMatch(/function __pxlblz_show_c0_hsv\([^)]*\) \{[^}]*adapt_brightness/)
  })

  it('matches composed pure and generated color output and reports N plus color math (#454)', () => {
    const effects = [
      { id: 'hue', kind: 'hue' as const, turns: 0.125 },
      { id: 'sat', kind: 'saturation' as const, saturation: 0.5 },
      { id: 'invert', kind: 'invert' as const, amount: 0.25 },
      { id: 'poster', kind: 'posterize' as const, levels: 5, amount: 0.5 },
    ]
    const input: [number, number, number] = [0.2, 0.4, 0.7]
    const artifact = compileShow({
      clips: [{ id: 'clip', source: `export function render(index) { rgb(${input.join(',')}) }`, effects }],
    }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints: [{ sample: [0.5, 0.5] }], randomSeed: 454 })
    const actual = runtime.renderCurrentFrame().pixels[0]
    const expected = applyShowColorEffects(effects, input)
    expect(actual).toEqual(expected.map((value) => expect.closeTo(value, 10)))
    expect(artifact.summary.cost.cpu).toMatchObject({
      patternEvaluations: { formula: 'N', basePerPixel: 1 },
      effects: {
        colorEffectsPerEvaluatedPixel: 4,
        colorScalarOpsPerEvaluatedPixel: expect.any(Number),
        colorFloorCallsPerEvaluatedPixel: 3,
      },
    })
  })

  it('matches composed pure and generated distortion sampling and reports its literal math (#456)', () => {
    const effects = [
      { id: 'ripple', kind: 'ripple' as const, amount: 0.06, frequency: 7, phase: 0.1, centerX: 0.5, centerY: 0.5 },
      { id: 'swirl', kind: 'swirl' as const, amount: 0.35, radius: 0.8, centerX: 0.5, centerY: 0.5 },
      { id: 'bulge', kind: 'bulge' as const, amount: -0.4, radius: 0.75, centerX: 0.5, centerY: 0.5 },
      { id: 'pixels', kind: 'pixelate' as const, amount: 0.4, columns: 9, rows: 7 },
      { id: 'kaleido', kind: 'kaleidoscope' as const, amount: 0.7, segments: 6, rotation: 0.08, centerX: 0.5, centerY: 0.5 },
      { id: 'wrap', kind: 'wrap' as const },
    ]
    const sample: [number, number] = [0.32, 0.61]
    const expected = applyShowEffectsToSample(effects, ...sample)
    const artifact = compileShow({
      clips: [{ id: 'clip', source: 'export function render2D(index, x, y) { rgb(x, y, 1) }', effects }],
    }, {})
    const actual = createFastReplayRuntime({
      code: artifact.code, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints: [{ sample }], randomSeed: 456 }).renderCurrentFrame().pixels[0]

    expect(actual).toEqual([
      expect.closeTo(expected.x, 10),
      expect.closeTo(expected.y, 10),
      1,
    ])
    expect(artifact.summary.cost.cpu).toMatchObject({
      patternEvaluations: { formula: 'N', basePerPixel: 1 },
      effects: {
        distortionEffectsPerEvaluatedPixel: 5,
        distortionScalarOpsPerEvaluatedPixel: 84,
        distortionFloorCallsPerEvaluatedPixel: 3,
        distortionTrigCallsPerEvaluatedPixel: 5,
        distortionSqrtCallsPerEvaluatedPixel: 4,
        distortionAtan2CallsPerEvaluatedPixel: 1,
        distortionPolicies: { cheap: 1, smooth: 4 },
        addressPolicy: 'wrap',
      },
    })
  })

  it('animates distortion Amounts through the shared Effect property path (#456)', () => {
    const effects = [
      { id: 'ripple', kind: 'ripple' as const, amount: 0.1, frequency: 6, phase: 0, centerX: 0.5, centerY: 0.5 },
      { id: 'pixels', kind: 'pixelate' as const, amount: 1, columns: 5, rows: 7 },
    ]
    const artifact = compileShow({
      clips: [{ id: 'clip', source: 'export function render2D(index, x, y) { rgb(x, y, 1) }', effects }],
      adaptationRamp: {
        startMs: 0, durationMs: 1000, from: {}, to: {},
        effectRamps: {
          ripple: { amount: { from: 0, to: 0.1, durationMs: 1000, easing: { curve: 'linear' } } },
          pixels: { amount: { from: 0, to: 1, durationMs: 1000, easing: { curve: 'linear' } } },
        },
      },
    }, {})
    const sample: [number, number] = [0.31, 0.68]
    const runtime = createFastReplayRuntime({
      code: artifact.code, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints: [{ sample }], randomSeed: 456 })
    const expected = applyShowEffectsToSample([
      { ...effects[0], amount: 0.05 },
      { ...effects[1], amount: 0.5 },
    ], ...sample)

    expect(runtime.advanceTo(500, { stepMs: 50 }).pixels[0]).toEqual([
      expect.closeTo(expected.x, 10), expect.closeTo(expected.y, 10), 1,
    ])
    expect(artifact.summary.cost.cpu.effects).toMatchObject({
      animatedParametersPerFrame: 2,
      distortionEffectsPerEvaluatedPixel: 2,
      distortionPolicies: { cheap: 1, smooth: 1 },
    })
    expect(artifact.summary.cost.memory.generatedScalarGlobals).toBe(8)
  })

  it('persists the selected distortion set without admitting deferred candidates (#456)', () => {
    const effects = [
      { id: 'ripple', kind: 'ripple' as const, amount: 0.08, frequency: 7, phase: 0.1, centerX: 0.4, centerY: 0.6 },
      { id: 'swirl', kind: 'swirl' as const, amount: 0.7, radius: 0.8, centerX: 0.5, centerY: 0.5 },
      { id: 'bulge', kind: 'bulge' as const, amount: -0.65, radius: 0.7, centerX: 0.5, centerY: 0.5 },
      { id: 'pixelate', kind: 'pixelate' as const, amount: 1, columns: 8, rows: 10 },
      { id: 'kaleidoscope', kind: 'kaleidoscope' as const, amount: 1, segments: 6, rotation: 0.125, centerX: 0.5, centerY: 0.5 },
    ]
    const show = updateShowCellEffects(createDefaultShow('distortions', 'Distortions', 456), 'cell-1', effects)
    expect(normalizeShowTransitionState(JSON.parse(JSON.stringify(show))).cells[0].effects).toEqual(effects)
    expect(normalizeShowClipEffects([
      { id: 'stretch', kind: 'stretch', amount: 1 } as never,
      { id: 'glitch', kind: 'glitch', amount: 1 } as never,
    ])).toEqual([])
  })

  it('keeps selected distortions finite on one-pixel and corner-only maps (#456)', () => {
    const effects = [
      { id: 'ripple', kind: 'ripple' as const, amount: 0.5, frequency: 32, phase: 8, centerX: 0.5, centerY: 0.5 },
      { id: 'swirl', kind: 'swirl' as const, amount: 4, radius: 0.05, centerX: 0.5, centerY: 0.5 },
      { id: 'bulge', kind: 'bulge' as const, amount: -0.95, radius: 0.05, centerX: 0.5, centerY: 0.5 },
      { id: 'pixelate', kind: 'pixelate' as const, amount: 1, columns: 1, rows: 1 },
      { id: 'kaleidoscope', kind: 'kaleidoscope' as const, amount: 1, segments: 16, rotation: 8, centerX: 0.5, centerY: 0.5 },
      { id: 'wrap', kind: 'wrap' as const },
    ]
    const artifact = compileShow({
      clips: [{ id: 'clip', source: 'export function render2D(index, x, y) { rgb(x, y, 1) }', effects }],
    }, {})
    for (const mapPoints of [
      [{ sample: [0.5, 0.5] }],
      [{ sample: [0, 0] }, { sample: [1, 0] }, { sample: [0, 1] }, { sample: [1, 1] }],
    ]) {
      const pixels = createFastReplayRuntime({
        code: artifact.code, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns),
      }, { mapPoints, randomSeed: 456 }).renderCurrentFrame().pixels
      expect(pixels.flat().every(Number.isFinite)).toBe(true)
    }
  })
})
