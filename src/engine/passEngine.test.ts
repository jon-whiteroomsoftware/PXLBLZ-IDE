import { bundle } from './bundle'
import { bundleWithPasses } from './passEngine'

describe('pass engine - recipe entrypoint', () => {
  it('keeps the no-recipe path byte-identical to bundle()', () => {
    const source = `export var hue = 0\nexport function render(index) { hsv(hue, 1, 1) }`
    const libraries = { sdf: `function circle(x, y, r) { return sqrt(x*x + y*y) - r }` }

    expect(bundleWithPasses(source, libraries, [])).toEqual({
      ...bundle(source, libraries),
      summary: {
        passes: [],
        callSitesWrapped: {},
        beforeRender: 'unchanged',
        globalsAdded: [],
        exportsAdded: [],
        bindingsApplied: [],
        estimatedPixelCost: 0,
      },
      warnings: [],
    })
  })
})

describe('pass engine - inject passes', () => {
  it('substitutes params and wraps an existing beforeRender without losing user behavior', () => {
    const source = [
      `export var speed = 0`,
      `export function beforeRender(delta) { speed += delta }`,
      `export function render(index) { hsv(speed, 1, 1) }`,
    ].join('\n')
    const mixin = [
      `// @param VALUE source value`,
      `// @target speed`,
      `// @wraps beforeRender`,
      `export function beforeRender(delta) { sliderSpeed(VALUE) }`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [
      { id: 'pot', kind: 'inject', source: mixin, params: { VALUE: 'analogRead(32)' } },
    ])

    expect(result.code).toContain('sliderSpeed(analogRead(32))')
    expect(result.code).toContain('function __pxlblz_pot_original_beforeRender(delta)')
    expect(result.code).toContain('export function beforeRender(delta)')
    expect(result.code.lastIndexOf('__pxlblz_pot_original_beforeRender(delta)')).toBeLessThan(
      result.code.lastIndexOf('__pxlblz_pot_beforeRender(delta)'),
    )
    expect(result.summary.beforeRender).toBe('wrapped')
    expect(result.summary.globalsAdded).toEqual([
      '__pxlblz_pot_beforeRender',
      '__pxlblz_pot_original_beforeRender',
    ])
    expect(result.warnings).toEqual([])
  })

  it('synthesizes beforeRender when the pattern has none', () => {
    const result = bundleWithPasses(`export function render(index) { hsv(0, 1, 1) }`, {}, [
      {
        id: 'pulse',
        kind: 'inject',
        source: `// @param VALUE v\n// @target pulse\n// @wraps beforeRender\nexport function beforeRender(delta) { pulse = VALUE }`,
        params: { VALUE: 0.5 },
      },
    ])

    expect(result.code).toContain('export function beforeRender(delta)')
    expect(result.code).toContain('__pxlblz_pulse_beforeRender(delta)')
    expect(result.summary.beforeRender).toBe('synthesized')
    expect(result.summary.exportsAdded).toEqual(['beforeRender'])
  })
})

describe('pass engine - intercept passes', () => {
  it('wraps supported output call sites with arity-specific helpers only at AST call sites', () => {
    const source = [
      `var label = "hsv(should stay text)"`,
      `var sink = { hsv: 1 }`,
      `export function render(index) {`,
      `  // hsv(should stay comment)`,
      `  hsv(0, 1, 1)`,
      `  paint(index)`,
      `  paint(index, 0.5)`,
      `  sink.hsv(1, 1, 1)`,
      `}`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [
      {
        id: 'dim',
        kind: 'intercept',
        target: 'hsv',
        source: `function dimHsv(h, s, v) { hsv(h, s, v * 0.5) }`,
        wrapperName: 'dimHsv',
      },
      { id: 'paint-pass', kind: 'intercept', target: 'paint' },
    ])

    expect(result.code).toContain('var label = "hsv(should stay text)"')
    expect(result.code).toContain('// hsv(should stay comment)')
    expect(result.code).toContain('sink.hsv(1, 1, 1)')
    expect(result.code).toContain('__pxlblz_dim_hsv(0, 1, 1)')
    expect(result.code).toContain('__pxlblz_paint_pass_paintv(index)')
    expect(result.code).toContain('__pxlblz_paint_pass_paintv_b(index, 0.5)')
    expect(result.summary.callSitesWrapped).toEqual({ hsv: 1, 'paint(v)': 1, 'paint(v,b)': 1 })
    expect(result.summary.estimatedPixelCost).toBe(3)
  })

  it('does not rewrite locally shadowed output names and warns on unsupported arity', () => {
    const source = [
      `function hsv(h, s, v) { return h }`,
      `export function render(index) {`,
      `  hsv(0, 1, 1)`,
      `  rgb(1, 1)`,
      `}`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [
      { id: 'shadowed', kind: 'intercept', target: 'hsv' },
      { id: 'bad-rgb', kind: 'intercept', target: 'rgb' },
    ])

    expect(result.code).toContain('  hsv(0, 1, 1)')
    expect(result.code).not.toContain('__pxlblz_shadowed')
    expect(result.warnings).toEqual([
      { passId: 'shadowed', code: 'no-call-sites', message: 'No hsv call sites were wrapped.' },
      {
        passId: 'bad-rgb',
        code: 'unsupported-output-shape',
        message: 'Unsupported rgb call with 2 arguments was left unchanged.',
      },
    ])
  })
})

describe('pass engine - bind passes', () => {
  it('calls exported slider functions from beforeRender', () => {
    const source = [
      `export function sliderSpeed(v) { speed = v }`,
      `export function beforeRender(delta) { t1 = time(1) }`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [
      { id: 'speed-pot', kind: 'bind', target: 'sliderSpeed', value: 'analogRead(32)' },
    ])

    expect(result.code).toContain('sliderSpeed(analogRead(32))')
    expect(result.summary.bindingsApplied).toEqual([
      { target: 'sliderSpeed', mode: 'function-call' },
    ])
    expect(result.summary.beforeRender).toBe('wrapped')
  })

  it('assigns variables with min max and quantize constraints', () => {
    const source = `export var brightness = 0`

    const result = bundleWithPasses(source, {}, [
      {
        id: 'brightness-pot',
        kind: 'bind',
        target: 'brightness',
        value: 'analogRead(33)',
        min: 0.1,
        max: 0.9,
        quantize: 0.05,
      },
    ])

    expect(result.code).toContain('brightness = (0.1 + floor((min(0.9, max(0.1, analogRead(33))) - 0.1) / 0.05 + 0.5) * 0.05)')
    expect(result.summary.bindingsApplied).toEqual([
      { target: 'brightness', mode: 'variable-assignment' },
    ])
    expect(result.summary.beforeRender).toBe('synthesized')
  })

  it('warns when a bind target is missing', () => {
    const result = bundleWithPasses(`export var brightness = 0`, {}, [
      { id: 'missing', kind: 'bind', target: 'sliderMissing', value: 0.25 },
    ])

    expect(result.warnings).toEqual([
      { passId: 'missing', code: 'missing-bind-target', message: 'Bind target sliderMissing was not found.' },
    ])
    expect(result.summary.bindingsApplied).toEqual([])
  })
})

describe('pass engine - generated name hygiene', () => {
  it('detects reserved prefix collisions and avoids generated name collisions', () => {
    const source = [
      `var __pxlblz_pot_beforeRender = 1`,
      `export function beforeRender(delta) {}`,
    ].join('\n')
    const result = bundleWithPasses(source, {}, [
      {
        id: 'pot',
        kind: 'inject',
        source: `// @param VALUE v\n// @target x\n// @wraps beforeRender\nexport function beforeRender(delta) { x = VALUE }`,
        params: { VALUE: 1 },
      },
    ])

    expect(result.code).toContain('function __pxlblz_pot_beforeRender_2(delta)')
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'reserved-prefix-collision',
      'generated-name-collision',
    ])
  })
})
