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

    const wipe = getShowToolkitFamily('transition', 'wipe')
    expect(wipe?.variants[0].presets?.map((preset) => [preset.id, preset.values.direction])).toEqual([
      ['east', 0], ['south-east', 0.125], ['south', 0.25], ['south-west', 0.375],
      ['west', 0.5], ['north-west', 0.625], ['north', 0.75], ['north-east', 0.875],
    ])
    expect(resolveShowToolkitParameters('transition', 'wipe', 'linear', {})).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'direction', defaultValue: 0, compatibility: { stageDimensions: [2] } }),
      expect.objectContaining({ id: 'edgePolicy', defaultValue: 'hard' }),
    ]))

    const dissolve = getShowToolkitFamily('transition', 'dissolve')
    expect(dissolve?.variants).toEqual([
      expect.objectContaining({ id: 'pixel', label: 'Pixel' }),
      expect.objectContaining({ id: 'block', label: 'Block' }),
    ])
    expect(resolveShowToolkitParameters('transition', 'dissolve', 'pixel', {})).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'seed', defaultValue: 0 }),
      expect.objectContaining({ id: 'edgePolicy', defaultValue: 'dither' }),
    ]))
    expect(resolveShowToolkitParameters('transition', 'dissolve', 'block', {}))
      .toContainEqual(expect.objectContaining({ id: 'blockSize', unit: 'pixels', defaultValue: 8 }))
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
      'dissolve-pixel',
      'dissolve-pixel-seeded',
      'dissolve-block-8',
      'dissolve-block-32',
      'shape-reveal-circle',
      'shape-reveal-diamond',
      'shape-reveal-ring',
      'shape-reveal-circle-grow-incoming',
      'shape-reveal-box-grow-incoming',
      'shape-reveal-circle-shrink-outgoing',
      'shape-reveal-box-shrink-outgoing',
      'motion-cover',
      'motion-reveal',
      'motion-push',
      'motion-content-grow',
      'motion-content-shrink',
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
