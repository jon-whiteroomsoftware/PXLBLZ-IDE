import {
  analyzeShowPatternCoverageRenderState,
  analyzeShowPatternRenderState,
  compareShowPatternOutputConsumers,
  groupCompatibleShowPatternOutputs,
  showPatternOutputCompatibilityKey,
  type ShowPatternOutputConsumer,
} from './showPatternOutputReuse'

describe('compatible Pattern output reuse (#518)', () => {
  const baseConsumer: ShowPatternOutputConsumer = {
    consumerId: 'base',
    patternIdentity: 'demo:TestPattern1D',
    patternInstanceId: 'clip-instance-0',
    clockDomainKey: 'member-clock-0',
    inputValuesKey: 'controls:{}',
    propertyValuesKey: 'brightness:1;phase:0;mirror:0',
    coordinateSpaceKey: 'zone:main;local-index',
    sampleDomainKey: 'pixelCount:2000;identity',
    renderFunction: 'render',
    preCacheEffectsKey: 'effects:identity',
    renderState: 'pure',
    postCacheConsumerKey: 'opacity:1',
  }

  it('shares an exact rendered value across consumers whose only difference is post-cache opacity', () => {
    const overlay: ShowPatternOutputConsumer = {
      ...baseConsumer,
      consumerId: 'overlay',
      postCacheConsumerKey: 'opacity:0.5',
    }

    expect(compareShowPatternOutputConsumers(baseConsumer, overlay)).toEqual({
      compatible: true,
      reasons: [],
      key: showPatternOutputCompatibilityKey(baseConsumer),
    })
    expect(showPatternOutputCompatibilityKey(baseConsumer)).toBe(showPatternOutputCompatibilityKey(overlay))
  })

  it.each([
    ['patternIdentity', 'user:other', 'pattern-identity'],
    ['patternInstanceId', 'clip-instance-1', 'pattern-instance'],
    ['clockDomainKey', 'member-clock-1', 'clock-domain'],
    ['inputValuesKey', 'controls:{speed:0.5}', 'input-values'],
    ['propertyValuesKey', 'brightness:0.5;phase:0;mirror:0', 'property-values'],
    ['coordinateSpaceKey', 'zone:other;local-index', 'coordinate-space'],
    ['sampleDomainKey', 'pixelCount:1000;identity', 'sample-domain'],
    ['renderFunction', 'render2D', 'render-function'],
    ['preCacheEffectsKey', 'effects:rotate-0.25', 'pre-cache-effects'],
  ] as const)('excludes a consumer with different %s', (field, value, reason) => {
    const other = { ...baseConsumer, consumerId: 'other', [field]: value }

    expect(compareShowPatternOutputConsumers(baseConsumer, other)).toEqual({
      compatible: false,
      reasons: [reason],
      key: null,
    })
  })

  it.each([
    ['render-mutating', 'render-mutating-state'],
    ['unknown', 'render-state-unknown'],
  ] as const)('excludes %s render state', (renderState, reason) => {
    const other: ShowPatternOutputConsumer = { ...baseConsumer, renderState }

    expect(showPatternOutputCompatibilityKey(other)).toBeNull()
    expect(compareShowPatternOutputConsumers(baseConsumer, other)).toEqual({
      compatible: false,
      reasons: [reason],
      key: null,
    })
  })

  it('scopes render-state analysis to the selected render function', () => {
    const source = `
var calls = 0
export function render(index) { rgb(index / pixelCount, 0, 0) }
export function render2D(index, x, y) { calls = calls + 1; rgb(x, y, 0) }
`

    expect(analyzeShowPatternRenderState(source, 'render')).toEqual({
      state: 'pure',
      mutatedBindings: [],
      unknownCalls: [],
    })
    expect(analyzeShowPatternRenderState(source, 'render2D')).toEqual({
      state: 'render-mutating',
      mutatedBindings: ['calls'],
      unknownCalls: [],
    })
  })

  it('conservatively excludes an unproved helper call', () => {
    const source = `
function color(index) { return index / pixelCount }
export function render(index) { rgb(color(index), 0, 0) }
`

    expect(analyzeShowPatternRenderState(source, 'render')).toEqual({
      state: 'unknown',
      mutatedBindings: [],
      unknownCalls: ['color'],
    })
  })

  it('keeps output reuse conservative while admitting deterministic coverage scratch state (#834)', () => {
    const source = `
var outX, outY
function sampleField(x, y) {
  outX = x + perlin(x, y, 0, 1)
  outY = y
}
export function render2D(index, x, y) {
  sampleField(x, y)
  rgb(outX, outY, 0)
}
`

    expect(analyzeShowPatternRenderState(source, 'render2D')).toEqual({
      state: 'unknown',
      mutatedBindings: [],
      unknownCalls: ['sampleField'],
    })
    expect(analyzeShowPatternRenderState(
      'export function render2D(index, x, y) { rgb(perlin(x, y, 0, 1), 0, 0) }',
      'render2D',
    )).toEqual({
      state: 'unknown',
      mutatedBindings: [],
      unknownCalls: ['perlin'],
    })
    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'pure',
      mutatedBindings: [],
      unknownCalls: [],
    })
  })

  it('admits scratch initialized on both sides of a render-local branch (#834)', () => {
    const source = `
var outX
function sample(x) {
  if (x > 0.5) outX = x
  else outX = 1 - x
}
export function render2D(index, x, y) { sample(x); rgb(outX, y, 0) }
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'pure',
      mutatedBindings: [],
      unknownCalls: [],
    })
  })

  it('rejects renderer scratch observed by beforeRender (#834)', () => {
    const source = `
var lastX, level
export function beforeRender() { level = lastX }
export function render2D(index, x, y) { lastX = x; rgb(level, 0, 0) }
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'render-mutating',
      mutatedBindings: ['lastX'],
      unknownCalls: [],
    })
  })

  it('rejects renderer scratch observed by non-exported beforeRender (#834)', () => {
    const source = `
var lastX, level
function beforeRender() { level = lastX }
export function render2D(index, x, y) { lastX = x; rgb(level, 0, 0) }
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'render-mutating',
      mutatedBindings: ['lastX'],
      unknownCalls: [],
    })
  })

  it('fails closed for unmodeled switch control flow (#834)', () => {
    const source = `
var outX
function sample(x) { switch (x > 0.5) { case 1: outX = x } }
export function render2D(index, x, y) { sample(x); rgb(outX, y, 0) }
`

    const analysis = analyzeShowPatternCoverageRenderState(source, 'render2D')
    expect(analysis.state).not.toBe('pure')
    expect(analysis.unknownCalls).toEqual(['<control-flow:SwitchStatement>'])
  })

  it('fails closed when a helper mutates through an array parameter alias (#834)', () => {
    const source = `
var state = [0]
function tick(a) { a[0] += 1 }
export function render2D(index, x, y) { tick(state); rgb(state[0], y, 0) }
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'unknown',
      mutatedBindings: [],
      unknownCalls: ['<parameter-member-write:tick.a>'],
    })
  })

  it('fails closed when a helper re-aliases an array parameter before mutation (#834)', () => {
    const source = `
var state = [0]
function tick(a) { var b = a; b[0] += 1 }
export function render2D(index, x, y) { tick(state); rgb(state[0], y, 0) }
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'unknown',
      mutatedBindings: [],
      unknownCalls: ['<local-member-write:tick.b>'],
    })
  })

  it('fails closed when a member-write root is dynamic (#834)', () => {
    const source = `
var state = [0]
function current() { return state }
export function render2D(index, x, y) { current()[0] += 1; rgb(state[0], y, 0) }
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'unknown',
      mutatedBindings: [],
      unknownCalls: ['<dynamic-member-write:render2D>'],
    })
  })

  it('fails closed when a top-level alias hides persistent member mutation (#834)', () => {
    const source = `
var state = [0], alias
function tick(a) { alias = a; alias[0] += 1 }
export function render2D(index, x, y) { tick(state); rgb(state[0], y, 0) }
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toMatchObject({
      state: 'unknown',
      unknownCalls: ['<persistent-member-write:tick.alias>'],
    })
  })

  it('fails closed for member writes nested in destructuring targets (#834)', () => {
    const source = `
var state = [0]
function tick(a) { var b = a; [b[0]] = [1] }
export function render2D(index, x, y) { tick(state); rgb(state[0], y, 0) }
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'unknown',
      mutatedBindings: [],
      unknownCalls: ['<local-member-write:tick.b>'],
    })
  })

  it('fails closed when a helper deletes through a parameter alias (#834)', () => {
    const source = `
var state = [1]
function tick(a, index) { delete a[index] }
export function render2D(index, x, y) { tick(state, index); rgb(state[0], y, 0) }
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'unknown',
      mutatedBindings: [],
      unknownCalls: ['<parameter-member-write:tick.a>'],
    })
  })

  it.each([
    [
      'an accumulator in a helper',
      `
var calls = 0
function paint() { calls = calls + 1 }
export function render2D(index, x, y) { paint(); rgb(calls, x, y) }
`,
      ['calls'],
    ],
    [
      'an exported binding mutated by a helper',
      `
export var phase = 0
function paint(x) { phase = x }
export function render2D(index, x, y) { paint(x); rgb(phase, y, 0) }
`,
      ['phase'],
    ],
  ])('rejects coverage skipping for %s (#834)', (_name, source, mutatedBindings) => {
    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'render-mutating',
      mutatedBindings,
      unknownCalls: [],
    })
  })

  it.each([
    [
      'compound assignment',
      `
var calls = 0
function paint() { calls += 1 }
export function render2D(index, x, y) { paint(); rgb(calls, x, y) }
`,
      'calls',
    ],
    [
      'a conditionally assigned out-var',
      `
var outX
function sample(x) { if (x > 0.5) outX = x }
export function render2D(index, x, y) { sample(x); rgb(outX, y, 0) }
`,
      'outX',
    ],
    [
      'an out-var assigned only after an early return',
      `
var outX
function sample(x) { if (x < 0.5) return; outX = x }
export function render2D(index, x, y) { sample(x); rgb(outX, y, 0) }
`,
      'outX',
    ],
    [
      'a member write that reads its scratch container',
      `
var out = [0]
function sample(x) { out[0] = x }
export function render2D(index, x, y) { sample(x); rgb(out[0], y, 0) }
`,
      'out',
    ],
  ])('rejects coverage skipping when scratch safety depends on %s (#834)', (_name, source, binding) => {
    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toMatchObject({
      state: 'render-mutating',
      mutatedBindings: [binding],
    })
  })

  it('keeps an opaque runtime call unknown for coverage skipping (#834)', () => {
    const source = `
export function render2D(index, x, y) {
  customNoise(x, y)
  rgb(x, y, 0)
}
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'unknown',
      mutatedBindings: [],
      unknownCalls: ['customNoise'],
    })
  })

  it('keeps a dynamic call unknown for coverage skipping (#834)', () => {
    const source = `
var helpers = [wave]
export function render2D(index, x, y) {
  helpers[0](x)
  rgb(x, y, 0)
}
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'unknown',
      mutatedBindings: [],
      unknownCalls: ['<dynamic-call>'],
    })
  })

  it('sorts coverage-state diagnostics deterministically (#834)', () => {
    const source = `
var zed = 0, alpha = 0
export function render2D(index, x, y) {
  zed = zed + 1
  alpha = alpha + 1
  zNoise(x)
  aNoise(y)
  rgb(x, y, 0)
}
`

    expect(analyzeShowPatternCoverageRenderState(source, 'render2D')).toEqual({
      state: 'render-mutating',
      mutatedBindings: ['alpha', 'zed'],
      unknownCalls: ['aNoise', 'zNoise'],
    })
  })

  it('forms deterministic sharing groups and explains near-compatible exclusions', () => {
    const overlay = { ...baseConsumer, consumerId: 'overlay', postCacheConsumerKey: 'opacity:0.5' }
    const otherZone = { ...baseConsumer, consumerId: 'other-zone', coordinateSpaceKey: 'zone:other;local-index' }
    const stateful = { ...baseConsumer, consumerId: 'stateful', renderState: 'render-mutating' as const }

    const result = groupCompatibleShowPatternOutputs([otherZone, stateful, overlay, baseConsumer])

    expect(result.groups).toEqual([{
      key: showPatternOutputCompatibilityKey(baseConsumer),
      producerId: 'base',
      consumerIds: ['base', 'overlay'],
      evaluationsAvoidedPerPixel: 1,
    }])
    expect(result.excluded).toEqual([
      { consumerId: 'other-zone', reasons: ['coordinate-space'] },
      { consumerId: 'stateful', reasons: ['render-mutating-state'] },
    ])
  })
})
