import { bundle } from './bundle'
import { stockMixinSpec } from './mixins'
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
        rendererAdaptations: [],
        estimatedPixelCost: 0,
      },
      warnings: [],
    })
  })
})

describe('pass engine - renderer adapter passes', () => {
  it('emits an exact render2D adapter that supplies centered z to a 3D-only Pattern', () => {
    const source = `export function render3D(index, x, y, z) { hsv(z, 1, 1) }`

    const result = bundleWithPasses(source, {}, [
      { id: 'renderer-adapter', kind: 'renderer-adapter', mapDim: 2 },
    ])

    expect(result.code).toContain('export function render2D(index, x, y)')
    expect(result.code).toContain('render3D(index, x, y, 0.5)')
    expect(result.fxCode).toContain('render3D(index, x, y, 32768)')
    expect(result.summary.rendererAdaptations).toEqual([{
      mapDimension: 2,
      sourceRenderer: 'render3D',
      adapterRenderer: 'render2D',
      missingCoordinates: ['z'],
    }])
    expect(result.summary.estimatedPixelCost).toBe(1)
  })

  it('emits a 1D adapter with every missing coordinate centered', () => {
    const source = `export function render3D(index, x, y, z) { hsv(y + z, 1, 1) }`

    const result = bundleWithPasses(source, {}, [
      { id: 'renderer-adapter', kind: 'renderer-adapter', mapDim: 1 },
    ])

    expect(result.code).toContain('export function render(index, x)')
    expect(result.code).toContain('render3D(index, x, 0.5, 0.5)')
    expect(result.summary.rendererAdaptations[0]).toMatchObject({
      sourceRenderer: 'render3D',
      adapterRenderer: 'render',
      missingCoordinates: ['y', 'z'],
    })
  })

  it('uses the firmware preference when several higher-dimensional renderers exist', () => {
    const source = [
      `export function render2D(index, x, y) { hsv(y, 1, 1) }`,
      `export function render3D(index, x, y, z) { hsv(z, 1, 1) }`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [
      { id: 'renderer-adapter', kind: 'renderer-adapter', mapDim: 1 },
    ])

    expect(result.code).toContain('render3D(index, x, 0.5, 0.5)')
    expect(result.code).not.toContain('render2D(index, x, 0.5)')
  })

  it('emits no adapter for an exact renderer or a lower-dimensional fallback', () => {
    const exact = `export function render2D(index, x, y) { hsv(x, 1, 1) }`
    const lower = `export function render(index, x) { hsv(x, 1, 1) }`

    const exactResult = bundleWithPasses(exact, {}, [
      { id: 'renderer-adapter', kind: 'renderer-adapter', mapDim: 2 },
    ])
    const lowerResult = bundleWithPasses(lower, {}, [
      { id: 'renderer-adapter', kind: 'renderer-adapter', mapDim: 3 },
    ])

    expect(exactResult.code).toBe(exact)
    expect(exactResult.summary.passes).toEqual([])
    expect(lowerResult.code).toBe(lower)
    expect(lowerResult.code).not.toContain('render3D')
    expect(lowerResult.summary.passes).toEqual([])
  })

  it('refuses to collide with a user binding that occupies the exact adapter name', () => {
    const source = [
      `var render2D = 1`,
      `export function render3D(index, x, y, z) { hsv(z, 1, 1) }`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [
      { id: 'renderer-adapter', kind: 'renderer-adapter', mapDim: 2 },
    ])

    expect(result.code).toBe(source)
    expect(result.code.match(/render2D/g)).toHaveLength(1)
    expect(result.warnings).toContainEqual({
      passId: 'renderer-adapter',
      code: 'renderer-adapter-name-collision',
      message: 'Cannot generate render2D because that name is already bound by the Pattern or a library.',
    })
  })

  it('does not treat a nested local name as a top-level renderer collision', () => {
    const source = [
      `function helper(render2D) { return render2D }`,
      `export function render3D(index, x, y, z) { hsv(z, 1, 1) }`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [
      { id: 'renderer-adapter', kind: 'renderer-adapter', mapDim: 2 },
    ])

    expect(result.code).toContain('export function render2D(index, x, y)')
    expect(result.warnings).toEqual([])
  })

  it('composes after output interception and binding passes', () => {
    const source = [
      `export var amount = 1`,
      `export function render3D(index, x, y, z) { hsv(z, 1, amount) }`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [
      { id: 'dim', kind: 'intercept', target: 'hsv' },
      { id: 'amount', kind: 'bind', target: 'amount', value: 0.5 },
      { id: 'renderer-adapter', kind: 'renderer-adapter', mapDim: 2 },
    ])

    expect(result.code).toContain('__pxlblz_dim_hsv(z, 1, amount)')
    expect(result.code).toContain('amount = 0.5')
    expect(result.code).toContain('render3D(index, x, y, 0.5)')
    expect(result.summary.passes.map((pass) => pass.kind)).toEqual([
      'intercept',
      'bind',
      'renderer-adapter',
    ])
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

  it.each([
    ['function declaration', `function callSink(rgb) { rgb(0.8, 0.4, 0.2) }`],
    ['function expression', `var callSink = function(rgb) { rgb(0.8, 0.4, 0.2) }`],
    ['arrow function', `var callSink = (rgb) => rgb(0.8, 0.4, 0.2)`],
    ['object destructuring', `function callSink({ rgb }) { rgb(0.8, 0.4, 0.2) }`],
    ['array destructuring', `function callSink([rgb]) { rgb(0.8, 0.4, 0.2) }`],
    ['rest parameter', `function callSink(...rgb) { rgb(0.8, 0.4, 0.2) }`],
  ])('does not rewrite an output name shadowed by a %s parameter (#850)', (_kind, localFunction) => {
    const source = [
      localFunction,
      `export function render(index) {`,
      `  callSink(customSink)`,
      `  rgb(0.6, 0.3, 0.1)`,
      `}`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [{
      id: 'dim-rgb',
      kind: 'intercept',
      target: 'rgb',
      source: `function dimRgb(r, g, b) { rgb(r * 0.5, g * 0.5, b * 0.5) }`,
      wrapperName: 'dimRgb',
    }])

    expect(result.code).toContain('rgb(0.8, 0.4, 0.2)')
    expect(result.code).toContain('__pxlblz_dim_rgb_rgb(0.6, 0.3, 0.1)')
    expect(result.summary.callSitesWrapped).toEqual({ rgb: 1 })
    expect(result.warnings).toEqual([])
  })

  it.each([
    ['function declaration', `function sample(value = rgb(0.8, 0.4, 0.2)) { return value }`],
    ['function expression', `var sample = function(value = rgb(0.8, 0.4, 0.2)) { return value }`],
    ['arrow function', `var sample = (value = rgb(0.8, 0.4, 0.2)) => value`],
  ])('rewrites an unshadowed output call in a %s parameter initializer (#850)', (_kind, localFunction) => {
    const source = [
      localFunction,
      `export function render(index) { sample() }`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [{
      id: 'dim-rgb',
      kind: 'intercept',
      target: 'rgb',
      source: `function dimRgb(r, g, b) { rgb(r * 0.5, g * 0.5, b * 0.5) }`,
      wrapperName: 'dimRgb',
    }])

    expect(result.code).toContain('__pxlblz_dim_rgb_rgb(0.8, 0.4, 0.2)')
    expect(result.summary.callSitesWrapped).toEqual({ rgb: 1 })
    expect(result.warnings).toEqual([])
  })

  it.each([
    [
      'function declaration',
      `function sample(rgb = customSink, value = rgb(0.8, 0.4, 0.2)) { return value }`,
    ],
    [
      'function expression',
      `var sample = function(rgb = customSink, value = rgb(0.8, 0.4, 0.2)) { return value }`,
    ],
    [
      'arrow function',
      `var sample = (rgb = customSink, value = rgb(0.8, 0.4, 0.2)) => value`,
    ],
  ])('does not rewrite a default-parameter call through a shadowed output binding in a %s (#850)', (
    _kind,
    localFunction,
  ) => {
    const source = [
      localFunction,
      `export function render(index) {`,
      `  sample()`,
      `  rgb(0.6, 0.3, 0.1)`,
      `}`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [{
      id: 'dim-rgb',
      kind: 'intercept',
      target: 'rgb',
      source: `function dimRgb(r, g, b) { rgb(r * 0.5, g * 0.5, b * 0.5) }`,
      wrapperName: 'dimRgb',
    }])

    expect(result.code).toContain('value = rgb(0.8, 0.4, 0.2)')
    expect(result.code).toContain('__pxlblz_dim_rgb_rgb(0.6, 0.3, 0.1)')
    expect(result.summary.callSitesWrapped).toEqual({ rgb: 1 })
    expect(result.warnings).toEqual([])
  })

  it('can wire the stock power-measure source as a measurement-only hsv intercept', () => {
    const powerMeasure = stockMixinSpec('power-measure')
    expect(powerMeasure).toBeDefined()

    const result = bundleWithPasses(`export function render(index) { hsv(0, 0.5, 0.8) }`, {}, [
      {
        id: 'power-measure',
        kind: 'intercept',
        target: 'hsv',
        source: powerMeasure!.src,
        wrapperName: '__px_powerMeasureHsv',
        params: {
          FULL_WHITE_MILLIAMPS: 12000,
          RECENT_WINDOW_MS: 2000,
          SINCE_START_MAX_FRAMES: 16384,
        },
      },
    ])

    expect(result.code).toContain('export var __px_powerDutyRecent = 0')
    expect(result.code).toContain('export var __px_powerDutySinceStart = 0')
    expect(result.code).toContain('function __px_powerMeasureHsv(h, s, v)')
    expect(result.code).not.toContain('export function __px_powerMeasureHsv')
    expect(result.code).toContain('__px_powerMilliAmps = __px_powerDutyRecent * 12000')
    expect(result.code).toContain('__pxlblz_power_measure_hsv(0, 0.5, 0.8)')
    expect(result.summary.callSitesWrapped).toEqual({ hsv: 1 })
    expect(result.summary.beforeRender).toBe('synthesized')
  })

  it('composes a frame hook supplied by an intercept mixin with the authored beforeRender', () => {
    const source = [
      `export function beforeRender(delta) { phase = phase + delta }`,
      `export function render(index) { hsv(0, 0, 1) }`,
    ].join('\n')
    const mixin = [
      `var frameCount = 0`,
      `function measuredHsv(h, s, v) { hsv(h, s, v) }`,
      `export function beforeRender(delta) { frameCount = frameCount + 1 }`,
    ].join('\n')

    const result = bundleWithPasses(source, {}, [{
      id: 'power-frame',
      kind: 'intercept',
      target: 'hsv',
      source: mixin,
      wrapperName: 'measuredHsv',
    }])

    expect(result.code.match(/export function beforeRender/g)).toHaveLength(1)
    expect(result.code).toContain('function __pxlblz_power_frame_original_beforeRender(delta)')
    expect(result.code).toContain('function __pxlblz_power_frame_beforeRender(delta)')
    expect(result.code.lastIndexOf('__pxlblz_power_frame_original_beforeRender(delta)')).toBeLessThan(
      result.code.lastIndexOf('__pxlblz_power_frame_beforeRender(delta)'),
    )
    expect(result.summary.beforeRender).toBe('wrapped')
  })

  it('can wire the stock power-cap source as an hsv scaling intercept', () => {
    const powerCap = stockMixinSpec('power-cap')
    expect(powerCap).toBeDefined()

    const result = bundleWithPasses(`export function render(index) { hsv(0, 1, 1) }`, {}, [
      {
        id: 'power-cap',
        kind: 'intercept',
        target: 'hsv',
        source: powerCap!.src,
        wrapperName: '__px_cappedHsv',
        params: {
          MAX_DUTY: 0.35,
          RECENT_WINDOW_MS: 2000,
          CAP_RESPONSE_MS: 250,
          SINCE_START_MAX_FRAMES: 16384,
        },
      },
    ])

    expect(result.code).toContain('export var __px_powerLimit = 0.35')
    expect(result.code).toContain('export var __px_powerDutyRecent = 0')
    expect(result.code).toContain('export var __px_powerDutySinceStart = 0')
    expect(result.code).toContain('function __px_cappedHsv(h, s, v)')
    expect(result.code).not.toContain('export function __px_cappedHsv')
    expect(result.code).toContain('export var __px_powerLimit = 0.35')
    expect(result.code).toContain('__px_powerCapDuty > __px_powerLimit')
    expect(result.code).toContain('__px_powerLimit / __px_powerCapDuty')
    expect(result.code).not.toContain('__px_powerCapDuty > 0.35')
    expect(result.code).toContain('min(1, elapsed / 250)')
    expect(result.code).toContain('min(16384, __px_powerSinceFrames + 1)')
    expect(result.code).not.toContain('__px_powerMilliAmps')
    expect(powerCap!.src).not.toMatch(/\[[^\]]*\]/)
    expect(result.code).toContain('hsv(h, s, v * __px_powerScale)')
    expect(result.summary.callSitesWrapped).toEqual({ hsv: 1 })
    expect(result.summary.beforeRender).toBe('synthesized')
  })

  it('can wire one stock power-cap source across hsv and rgb output calls', () => {
    const powerCap = stockMixinSpec('power-cap')
    expect(powerCap).toBeDefined()

    const result = bundleWithPasses(
      `export function render(index) {
        if (index % 2) hsv(0, 1, 1)
        else rgb(0.2, 0.4, 0.6)
      }`,
      {},
      [{
        id: 'power-cap',
        kind: 'intercept',
        target: ['hsv', 'rgb'],
        source: powerCap!.src,
        wrapperName: {
          hsv: '__px_cappedHsv',
          rgb: '__px_cappedRgb',
        },
        params: {
          MAX_DUTY: 0.35,
          RECENT_WINDOW_MS: 2000,
          CAP_RESPONSE_MS: 250,
          SINCE_START_MAX_FRAMES: 16384,
        },
      }],
    )

    expect(result.code).toContain('__pxlblz_power_cap_hsv(0, 1, 1)')
    expect(result.code).toContain('__pxlblz_power_cap_rgb(0.2, 0.4, 0.6)')
    expect(result.code).toContain('function __px_cappedRgb(r, g, b)')
    expect(result.code).toContain('rgb(r * __px_powerScale, g * __px_powerScale, b * __px_powerScale)')
    expect(result.summary.callSitesWrapped).toEqual({ hsv: 1, rgb: 1 })
    expect(result.summary.exportsAdded).toEqual(['beforeRender'])
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

    expect(result.code).toContain('brightness = (0.1 + floor(((0.1 + (analogRead(33)) * 0.8) - 0.1) / 0.05 + 0.5) * 0.05)')
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
