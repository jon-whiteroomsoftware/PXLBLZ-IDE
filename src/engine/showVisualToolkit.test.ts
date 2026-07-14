import {
  applyShowEasing,
  emitShowEasingExpression,
  normalizeShowEasing,
  showEasingFromOptionId,
  showEasingOptionId,
} from './showEasing'
import { createDefaultShow, normalizeShowTransitionState } from './showModel'
import { compileShow } from './showCompiler'
import { evaluateFadeThroughColor, showTransitionColorToRgb } from './showFadeThroughColor'
import {
  SHOW_VISUAL_TOOLKIT_REGISTRY,
  evaluateShowCostAtPixelCount,
  getShowToolkitFamily,
  resolveShowToolkitParameters,
  validateShowToolkitRegistry,
} from './showVisualToolkit'
import {
  captureShowToolkitFixture,
  createShowToolkitFixtureRecipes,
  createShowToolkitParameterSweep,
  roundTripShowToolkitFixtureRecord,
} from './showVisualToolkitFixtures'

describe('Show visual-toolkit contract', () => {
  it('normalizes legacy easing names into the shared structured representation (#443)', () => {
    const easing = normalizeShowEasing('ease-in-out')

    expect(easing).toEqual({ curve: 'quadratic', direction: 'in-out' })
    expect(applyShowEasing(easing, 0.25)).toBe(0.125)

    const expression = emitShowEasingExpression(easing, 't')
    const evaluate = new Function('t', `return ${expression}`) as (t: number) => number
    expect(evaluate(0.75)).toBeCloseTo(applyShowEasing(easing, 0.75), 12)
  })

  it.each([
    [{ curve: 'quadratic', direction: 'in' } as const, 0.25, 0.0625],
    [{ curve: 'cubic', direction: 'out' } as const, 0.25, 0.578125],
    [{ curve: 'sine', direction: 'in-out' } as const, 0.25, (1 - Math.cos(Math.PI / 4)) / 2],
  ])('evaluates and emits the structured %j curve', (easing, progress, expected) => {
    expect(applyShowEasing(easing, progress)).toBeCloseTo(expected, 12)

    const expression = emitShowEasingExpression(easing, 't')
    const evaluate = new Function('t', 'cos', 'PI', `return ${expression}`) as (
      t: number,
      cos: typeof Math.cos,
      pi: number,
    ) => number
    expect(evaluate(progress, Math.cos, Math.PI)).toBeCloseTo(expected, 12)
  })

  it('round-trips structured curves through stable option identifiers', () => {
    expect(showEasingOptionId(normalizeShowEasing('ease-out'))).toBe('ease-out')
    expect(showEasingFromOptionId('sine-in')).toEqual({ curve: 'sine', direction: 'in' })
  })

  it('migrates boundary and property easing to the structured persisted form', () => {
    const show = createDefaultShow('structured-easing', 'Structured easing', 1)
    show.transitions![0] = {
      ...show.transitions![0],
      easing: 'ease-out',
      propertyTransitions: {
        brightness: {
          fromByCellId: { 'cell-2': 1 },
          durationMs: 800,
          easing: 'ease-in',
        },
      },
    }

    const normalized = normalizeShowTransitionState(show)

    expect(normalized.transitions![0].easing).toEqual({ curve: 'quadratic', direction: 'out' })
    expect(normalized.transitions![0].propertyTransitions?.brightness?.easing)
      .toEqual({ curve: 'quadratic', direction: 'in' })
    expect(normalizeShowTransitionState(normalized)).toEqual(normalized)
  })

  it('round-trips custom, discrete, and overshooting easing on every property path (#455)', () => {
    const custom = { curve: 'cubic-bezier' as const, x1: 0.13, y1: -0.5, x2: 0.87, y2: 1.5 }
    const show = createDefaultShow('complete-easing', 'Complete easing', 455)
    show.transitions![0] = {
      ...show.transitions![0],
      easing: custom,
      propertyTransitions: {
        brightness: { fromByCellId: { 'cell-2': 1 }, easing: { curve: 'steps', steps: 6, position: 'end' } },
        effects: {
          fade: {
            opacity: { fromByCellId: { 'cell-2': 1 }, easing: { curve: 'back', direction: 'out', overshoot: 1.8 } },
          },
        },
      },
    }

    const normalized = normalizeShowTransitionState(show)
    expect(normalized.transitions![0].easing).toEqual(custom)
    expect(normalized.transitions![0].propertyTransitions?.brightness?.easing)
      .toEqual({ curve: 'steps', steps: 6, position: 'end' })
    expect(normalized.transitions![0].propertyTransitions?.effects?.fade.opacity.easing)
      .toEqual({ curve: 'back', direction: 'out', overshoot: 1.8 })
    expect(normalizeShowTransitionState(JSON.parse(JSON.stringify(normalized)))).toEqual(normalized)
  })

  it('describes current families and conditional parameters without UI rules', () => {
    expect(validateShowToolkitRegistry()).toEqual([])
    expect(getShowToolkitFamily('transition', 'shape-reveal')).toMatchObject({
      label: 'Shape reveal',
      variants: expect.arrayContaining([
        expect.objectContaining({ id: 'circle' }),
        expect.objectContaining({ id: 'ring' }),
      ]),
    })

    expect(resolveShowToolkitParameters('transition', 'shape-reveal', 'circle', {}))
      .not.toContainEqual(expect.objectContaining({ id: 'ringWidth' }))
    expect(resolveShowToolkitParameters('transition', 'shape-reveal', 'ring', {}))
      .toContainEqual(expect.objectContaining({ id: 'ringWidth', defaultValue: 0.12 }))
    expect(getShowToolkitFamily('transition', 'shape-reveal')?.variants)
      .toContainEqual(expect.objectContaining({ id: 'box', label: 'Box' }))
    expect(resolveShowToolkitParameters('transition', 'shape-reveal', 'box', {})).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'aspect', defaultValue: 1 }),
      expect.objectContaining({ id: 'rotation', defaultValue: 0 }),
      expect.objectContaining({ id: 'revealMode', options: expect.arrayContaining([
        { value: 'grow-incoming', label: 'Grow incoming' },
        { value: 'shrink-outgoing', label: 'Shrink outgoing' },
      ]) }),
    ]))
    expect(getShowToolkitFamily('transition', 'shape-reveal')?.variants.map((variant) => variant.id))
      .toEqual([
        'circle', 'ellipse', 'box', 'rounded-box', 'diamond', 'cross', 'ring',
        'heart', 'star', 'crescent', 'polygon', 'cat-head', 'cat-side-profile', 'bastet',
      ])
    expect(resolveShowToolkitParameters('transition', 'shape-reveal', 'star', {}).map((parameter) => parameter.id))
      .toEqual(expect.arrayContaining(['starPoints', 'starInner', 'aspect', 'rotation']))
    expect(resolveShowToolkitParameters('transition', 'shape-reveal', 'crescent', {}).map((parameter) => parameter.id))
      .toContain('crescentOffset')
    expect(resolveShowToolkitParameters('transition', 'shape-reveal', 'polygon', {}).map((parameter) => parameter.id))
      .toContain('polygonSides')
    const catParameters = resolveShowToolkitParameters('transition', 'shape-reveal', 'cat-head', {}).map((parameter) => parameter.id)
    expect(catParameters).not.toContain('starPoints')
    expect(catParameters).not.toContain('polygonSides')
    expect(catParameters).not.toContain('ringWidth')

    expect(getShowToolkitFamily('transition', 'blend')?.variants.find((variant) => variant.id === 'crossfade')?.presets)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'quick' }),
        expect.objectContaining({ id: 'smooth' }),
      ]))

    const fade = getShowToolkitFamily('transition', 'fade')
    expect(fade?.variants.find((variant) => variant.id === 'through-color')).toMatchObject({
      costPolicies: ['single-source'],
      presets: [
        { id: 'black', label: 'Black', values: { color: '#000000' } },
        { id: 'white', label: 'White', values: { color: '#ffffff' } },
        { id: 'custom', label: 'Custom', values: { color: '#7c3aed' } },
      ],
    })
    expect(resolveShowToolkitParameters('transition', 'fade', 'through-color', {}))
      .toContainEqual(expect.objectContaining({ id: 'color', kind: 'color', defaultValue: '#000000' }))

    const output = getShowToolkitFamily('effect', 'output')
    expect(output?.variants.map((variant) => variant.id)).toEqual([
      'opacity', 'brightness', 'hue', 'saturation', 'contrast', 'invert', 'threshold', 'posterize', 'color-map',
    ])
    expect(resolveShowToolkitParameters('effect', 'output', 'hue', {}).map((parameter) => parameter.id))
      .toEqual(['turns', 'easing'])
    expect(resolveShowToolkitParameters('effect', 'output', 'posterize', {}).map((parameter) => parameter.id))
      .toEqual(['amount', 'levels', 'easing'])
    expect(resolveShowToolkitParameters('effect', 'output', 'color-map', {}).map((parameter) => parameter.id))
      .toEqual(['amount', 'shadowR', 'shadowG', 'shadowB', 'highlightR', 'highlightG', 'highlightB', 'easing'])

    const distortion = getShowToolkitFamily('effect', 'distortion')
    expect(distortion?.variants.map((variant) => variant.id)).toEqual([
      'ripple', 'swirl', 'bulge', 'pixelate', 'kaleidoscope',
    ])
    expect(distortion?.variants).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'bulge', presets: expect.arrayContaining([
        { id: 'bulge', label: 'Bulge', values: { amount: 0.65 } },
        { id: 'pinch', label: 'Pinch', values: { amount: -0.65 } },
      ]) }),
      expect.objectContaining({ id: 'pixelate', qualityPolicy: 'cheap' }),
      expect.objectContaining({ id: 'kaleidoscope', qualityPolicy: 'smooth' }),
    ]))
    expect(resolveShowToolkitParameters('effect', 'distortion', 'pixelate', {}))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'amount', defaultValue: 0, min: 0, max: 1 }),
        expect.objectContaining({ id: 'columns', defaultValue: 12, min: 1, max: 128 }),
        expect.objectContaining({ id: 'rows', defaultValue: 12, min: 1, max: 128 }),
      ]))
    expect(distortion?.variants.some((variant) => variant.id === 'stretch' || variant.id === 'glitch')).toBe(false)

    const easingDescriptor = resolveShowToolkitParameters('transition', 'blend', 'crossfade', {})
      .find((parameter) => parameter.id === 'easing')
    expect(easingDescriptor?.easingOptions?.find((option) => option.id === 'css-ease')).toMatchObject({
      label: 'CSS ease',
      controls: expect.arrayContaining([expect.objectContaining({ id: 'x1', min: 0, max: 1 })]),
      samples: expect.arrayContaining([expect.objectContaining({ progress: 0.5 })]),
    })

    const wipe = getShowToolkitFamily('transition', 'wipe')
    expect(wipe?.variants[0].presets?.map((preset) => [preset.id, preset.values.direction])).toEqual([
      ['east', 0], ['south-east', 0.125], ['south', 0.25], ['south-west', 0.375],
      ['west', 0.5], ['north-west', 0.625], ['north', 0.75], ['north-east', 0.875],
    ])
    expect(resolveShowToolkitParameters('transition', 'wipe', 'linear', {})).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'direction', defaultValue: 0, compatibility: { stageDimensions: [2] } }),
      expect.objectContaining({ id: 'edgePolicy', defaultValue: 'hard' }),
    ]))
    expect(wipe?.variants.map((variant) => variant.id)).toEqual([
      'linear', 'split', 'barn-doors', 'blinds', 'clock', 'checker', 'grid',
    ])
    expect(resolveShowToolkitParameters('transition', 'wipe', 'split', {}).map((parameter) => parameter.id))
      .toEqual(['durationMs', 'easing', 'wipeMode', 'orientation', 'edgePolicy', 'feather'])
    expect(resolveShowToolkitParameters('transition', 'wipe', 'clock', {}).map((parameter) => parameter.id))
      .toEqual(['durationMs', 'easing', 'centerX', 'centerY', 'phase', 'clockwise', 'edgePolicy', 'feather'])
    expect(resolveShowToolkitParameters('transition', 'wipe', 'checker', {}).map((parameter) => parameter.id))
      .toEqual(['durationMs', 'easing', 'count', 'edgePolicy', 'feather'])

    const dissolve = getShowToolkitFamily('transition', 'dissolve')
    expect(dissolve?.variants).toEqual([
      expect.objectContaining({ id: 'pixel', label: 'Pixel' }),
      expect.objectContaining({ id: 'block', label: 'Block' }),
      expect.objectContaining({ id: 'coherent-noise', label: 'Coherent noise' }),
      expect.objectContaining({ id: 'soft-threshold', label: 'Soft threshold' }),
    ])
    expect(resolveShowToolkitParameters('transition', 'dissolve', 'pixel', {})).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'seed', defaultValue: 0 }),
      expect.objectContaining({ id: 'edgePolicy', defaultValue: 'dither' }),
    ]))
    expect(resolveShowToolkitParameters('transition', 'dissolve', 'block', {}))
      .toContainEqual(expect.objectContaining({ id: 'blockSize', unit: 'pixels', defaultValue: 8 }))
    expect(resolveShowToolkitParameters('transition', 'dissolve', 'coherent-noise', {}))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'scale', min: 1, max: 32 }),
        expect.objectContaining({ id: 'edgePolicy', defaultValue: 'hard', options: [{ value: 'hard', label: 'Hard' }] }),
      ]))
    expect(resolveShowToolkitParameters('transition', 'dissolve', 'soft-threshold', {}))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'softness', min: 0, max: 1 }),
        expect.objectContaining({ id: 'edgePolicy', options: expect.arrayContaining([
          expect.objectContaining({ value: 'hard' }),
          expect.objectContaining({ value: 'dither' }),
          expect.objectContaining({ value: 'blend' }),
        ]) }),
      ]))

    const motion = getShowToolkitFamily('transition', 'motion')
    expect(motion?.variants.map((variant) => variant.id)).toEqual([
      'cover', 'reveal', 'push', 'content-grow', 'content-shrink', 'zoom-in', 'zoom-out',
    ])
    expect(motion?.variants.find((variant) => variant.id === 'zoom-in')?.presets).toEqual([
      expect.objectContaining({ id: 'zoom', values: expect.objectContaining({ contentScale: 0.2, rotation: 0 }) }),
      expect.objectContaining({ id: 'spin-clockwise', values: expect.objectContaining({ rotation: 1, spinDirection: 'clockwise' }) }),
      expect.objectContaining({ id: 'spin-counterclockwise', values: expect.objectContaining({ rotation: 1, spinDirection: 'counterclockwise' }) }),
      expect.objectContaining({ id: 'zoom-spin-clockwise', values: expect.objectContaining({ contentScale: 0.25, rotation: 0.5, spinDirection: 'clockwise' }) }),
      expect.objectContaining({ id: 'zoom-spin-counterclockwise', values: expect.objectContaining({ contentScale: 0.25, rotation: 0.5, spinDirection: 'counterclockwise' }) }),
    ])
    expect(resolveShowToolkitParameters('transition', 'motion', 'zoom-in', {}).map((parameter) => parameter.id))
      .toEqual(['durationMs', 'easing', 'anchorX', 'anchorY', 'contentScale', 'rotation', 'spinDirection', 'addressPolicy', 'edgePolicy'])
    expect(motion?.variants.find((variant) => variant.id === 'zoom-in')?.costPolicies)
      .toEqual(['selector', 'full-blend'])
  })

  it('rejects descriptors whose conditions or presets reference private parameters', () => {
    const invalid = structuredClone(SHOW_VISUAL_TOOLKIT_REGISTRY)
    invalid[0].parameters.push({
      id: 'conditional',
      label: 'Conditional',
      kind: 'number',
      defaultValue: 0,
      when: { parameterId: 'missing', equals: true },
    })
    invalid[0].variants[0].presets = [{ id: 'invalid', label: 'Invalid', values: { missing: 1 } }]

    expect(validateShowToolkitRegistry(invalid)).toEqual(expect.arrayContaining([
      expect.stringMatching(/unknown condition parameter.*missing/i),
      expect.stringMatching(/unknown preset parameter.*missing/i),
    ]))
  })

  it('compiles factual renderer math that can be evaluated for a target pixel count', () => {
    const source = 'export function render(index) { rgb(1, 0, 0) }'
    const artifact = compileShow({
      clips: [
        { id: 'outgoing', source },
        { id: 'incoming', source },
      ],
      crossfade: { startMs: 1000, durationMs: 500 },
    }, {})

    expect(artifact.summary.cost.cpu.patternEvaluations).toEqual({ formula: '2N', basePerPixel: 2 })
    expect(artifact.summary.cost.code).toMatchObject({
      artifactBytes: artifact.summary.artifactBytes,
      budgetBytes: artifact.summary.measuredDeviceBudgetBytes,
    })
    expect(evaluateShowCostAtPixelCount(artifact.summary.cost, { pixelCount: 512 }))
      .toMatchObject({ patternEvaluations: 1024, expression: '2 × 512' })
  })

  it('keeps bounded edge work explicit until the edge coverage is known', () => {
    const source = 'export function render2D(index, x, y) { rgb(x, y, 0) }'
    const artifact = compileShow({
      clips: [
        { id: 'outgoing', source },
        { id: 'incoming', source },
      ],
      routeTransition: {
        kind: 'portal',
        startMs: 1000,
        durationMs: 500,
        feather: 0.1,
        featherPolicy: 'blend',
        centerX: 0.5,
        centerY: 0.5,
      },
    }, {})

    expect(artifact.summary.cost.cpu.patternEvaluations).toEqual({
      formula: 'N + E',
      basePerPixel: 1,
      additionalPerEdgePixel: 1,
    })
    expect(evaluateShowCostAtPixelCount(artifact.summary.cost, { pixelCount: 512 }))
      .toMatchObject({ patternEvaluations: null, expression: '512 + E' })
    expect(evaluateShowCostAtPixelCount(artifact.summary.cost, { pixelCount: 512, edgePixels: 64 }))
      .toMatchObject({ patternEvaluations: 576, expression: '512 + 64' })
  })

  it('builds deterministic compilable fixtures and parameter sweeps for every current Transition family', () => {
    const fixtures = createShowToolkitFixtureRecipes()
    expect(fixtures.map((fixture) => fixture.id)).toEqual([
      'blend-cut',
      'blend-crossfade',
      'fade-color-black',
      'fade-color-white',
      'fade-color-custom',
      'wipe-linear',
      'wipe-direction-east',
      'wipe-direction-south-east',
      'wipe-direction-south',
      'wipe-direction-south-west',
      'wipe-direction-west',
      'wipe-direction-north-west',
      'wipe-direction-north',
      'wipe-direction-north-east',
      'wipe-arbitrary-dither',
      'wipe-arbitrary-blend',
      'wipe-split-center-out',
      'wipe-split-center-in',
      'wipe-barn-doors',
      'wipe-blinds-horizontal',
      'wipe-blinds-vertical',
      'wipe-clock',
      'wipe-checker',
      'wipe-grid',
      'dissolve-pixel',
      'dissolve-pixel-seeded',
      'dissolve-block-8',
      'dissolve-block-32',
      'dissolve-coherent-noise-4',
      'dissolve-coherent-noise-9',
      'dissolve-soft-threshold-dither',
      'dissolve-soft-threshold-blend',
      'shape-reveal-circle',
      'shape-reveal-diamond',
      'shape-reveal-ring',
      'shape-reveal-circle-grow-incoming',
      'shape-reveal-box-grow-incoming',
      'shape-reveal-circle-shrink-outgoing',
      'shape-reveal-box-shrink-outgoing',
      ...['ellipse', 'rounded-box', 'cross', 'heart', 'star', 'crescent', 'cat-head', 'cat-side-profile', 'bastet']
        .map((shape) => `shape-reveal-${shape}-grow-incoming`),
      ...['ellipse', 'rounded-box', 'cross', 'heart', 'star', 'crescent', 'cat-head', 'cat-side-profile', 'bastet']
        .map((shape) => `shape-reveal-${shape}-shrink-outgoing`),
      ...[3, 4, 5, 6, 7, 8].map((sides) => `shape-reveal-polygon-${sides}-grow-incoming`),
      ...[3, 4, 5, 6, 7, 8].map((sides) => `shape-reveal-polygon-${sides}-shrink-outgoing`),
      'motion-cover',
      'motion-reveal',
      'motion-push',
      'motion-content-grow',
      'motion-content-shrink',
      'motion-zoom-in-zoom',
      'motion-zoom-in-spin-clockwise',
      'motion-zoom-in-spin-counterclockwise',
      'motion-zoom-in-zoom-spin-clockwise',
      'motion-zoom-in-zoom-spin-counterclockwise',
      'motion-zoom-out-zoom',
    ])

    for (const fixture of fixtures) {
      expect(compileShow(fixture.recipe, {}).code).toBe(compileShow(fixture.recipe, {}).code)
      expect(fixture.progressSamples).toEqual([0, 0.25, 0.5, 0.75, 1])
    }

    expect(createShowToolkitParameterSweep('transition', 'shape-reveal', 'ring'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ ringWidth: 0.02 }),
        expect.objectContaining({ ringWidth: 0.12 }),
        expect.objectContaining({ ringWidth: 1 }),
      ]))
  })

  it('captures deterministic generated preview frames and round-trips persisted fixture records', () => {
    const fixtures = createShowToolkitFixtureRecipes()
    for (const fixture of fixtures) {
      const first = captureShowToolkitFixture(fixture)
      expect(first).toEqual(captureShowToolkitFixture(fixture))
      expect(first.frames).toHaveLength(5)
      expect(first.generatedCode).toContain('export function render2D')
      expect(roundTripShowToolkitFixtureRecord(fixture)).toEqual(fixture.persistedRecord)
    }

    const crossfade = captureShowToolkitFixture(fixtures.find((fixture) => fixture.id === 'blend-crossfade')!)
    expect(new Set(crossfade.frames.map((frame) => frame.checksum)).size).toBeGreaterThan(2)
    expect(crossfade.frames[0].representativePixels[0]).toEqual([0, 0, 0])
    expect(crossfade.frames[crossfade.frames.length - 1].representativePixels[0]).toEqual([1, 0, 1])
    expect(fixtures.find((fixture) => fixture.id === 'blend-crossfade')?.persistedRecord.transitions?.[0]).toMatchObject({
      kind: 'crossfade',
      easing: { curve: 'linear' },
    })

    const fade = captureShowToolkitFixture(fixtures.find((fixture) => fixture.id === 'fade-color-custom')!)
    const y = 8 / 15
    for (const frame of fade.frames) {
      const eased = applyShowEasing({ curve: 'sine', direction: 'in-out' }, frame.progress)
      const expected = evaluateFadeThroughColor([0, 0, y], [1, 0, 1 - y], showTransitionColorToRgb('#7c3aed'), eased)
      frame.representativePixels[1].forEach((channel, index) => {
        expect(channel).toBeCloseTo(expected[index], 10)
      })
    }
  })
})
