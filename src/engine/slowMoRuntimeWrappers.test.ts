import * as acorn from 'acorn'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import { bundle } from './bundle'
import { createFastReplayRuntime } from './fastReplay'
import { loadPattern } from './loadPattern'
import { bundleWithPasses, type PassRecipe } from './passEngine'
import { createFxShim, createShim } from './shim'
import { emitPatternWrappers, type PatternWrapper } from './slowMo'

const render = 'export function render(i) { rgb(0.8,0.3,0.1) }'
const both = ['slow-mo', 'dreamy'] as const

function measuredAllocations(code: string, pixelCount: number) {
  const lengths: number[] = []
  const edits: { position: number; text: string }[] = []
  // Wrap literals only to observe their lengths at runtime, including nesting.
  function instrument(node: unknown) {
    if (!node || typeof node !== 'object') return
    const expression = node as acorn.Node
    if (expression.type === 'ArrayExpression') {
      edits.push({ position: expression.start, text: '__testMeasureLiteral(' })
      edits.push({ position: expression.end, text: ')' })
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(instrument)
      else instrument(child)
    }
  }
  instrument(acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module' }))
  for (const { position, text } of edits.sort((a, b) => b.position - a.position)) {
    code = code.slice(0, position) + text + code.slice(position)
  }
  const shim = createShim({ mapPoints: [], pixelCount, dimensions: 1, getVirtualTime: () => 0 })
  const original = shim.builtins.array as (size: number) => unknown[]
  function measure<T extends unknown[]>(array: T): T {
    lengths.push(array.length)
    return array
  }
  const artifact = bundle(code, {})
  const runtime = loadPattern(artifact.code, artifact.metadata, {
    ...shim.builtins,
    array: (size: number) => measure(original(size)),
    __testMeasureLiteral: measure,
  })
  runtime.beforeRender(0)
  runtime.render(0)
  runtime.beforeRender(16)
  runtime.render(0)
  runtime.beforeRender(32)
  runtime.render(0)
  return { lengths, words: lengths.reduce((total, length) => total + length + 4, 0) }
}

describe('Pattern Wrapper memory decisions', () => {
  it('leaves an empty set byte-identical, without parsing or reserving anything', () => {
    const source = ' // left intact\nvar __pxlblz_slowmo_used = 0\n'
    expect(emitPatternWrappers(source, 256, [])).toMatchObject({ code: source, applied: [], skipped: {} })
  })

  it.each<[number, readonly PatternWrapper[], readonly PatternWrapper[], number]>([
    [1133, both, both, 9],
    [1134, both, ['slow-mo'], 6],
    [1702, ['slow-mo'], ['slow-mo'], 6],
    [1703, ['slow-mo'], [], 0],
    [3409, ['dreamy'], ['dreamy'], 3],
    [3410, ['dreamy'], [], 0],
  ])('at %d pixels with %j applies %j and allocates %d buffers', (pixels, requested, applied, buffers) => {
    const result = emitPatternWrappers(render, pixels, requested)
    expect(result.applied).toEqual(applied)
    expect(measuredAllocations(result.code, pixels)).toEqual({
      lengths: Array(buffers).fill(pixels), words: buffers * (pixels + 4),
    })
    for (const wrapper of requested.filter(wrapper => !applied.includes(wrapper))) {
      expect(result.skipped[wrapper]?.reason).toBe('array-budget')
    }
  })

  it.each<[number, readonly PatternWrapper[], number]>([
    [7900, both, 9],
    [7901, ['slow-mo'], 6],
    [8681, ['dreamy'], 3],
    [9461, [], 0],
  ])('charges %i authored words before visiting Slow-mo then Dreamy', (authored, applied, buffers) => {
    const source = `var occupied = array(${authored - 4})\n${render}`
    const result = emitPatternWrappers(source, 256, ['dreamy', 'slow-mo'])
    expect(result.applied).toEqual(applied)
    expect(measuredAllocations(result.code, 256).words).toBe(authored + buffers * 260)
    if (!applied.includes('slow-mo')) {
      expect(result.skipped['slow-mo']).toMatchObject({ reason: 'array-budget', neededWords: 1560, freeWords: 10240 - authored })
    }
    if (!applied.includes('dreamy')) {
      expect(result.skipped.dreamy).toMatchObject({
        reason: 'array-budget', neededWords: 780, freeWords: 10240 - authored - (applied.includes('slow-mo') ? 1560 : 0),
      })
    }
  })

  it('counts nested literal headers and once-executed pixelCount arithmetic', () => {
    const source = `var dimension = 2, n = pixelCount + dimension
var a = array(n), b = [[0,1], [2,3]]
${render}`
    const result = emitPatternWrappers(source, 256, both)
    expect(result.applied).toEqual(both)
    expect(measuredAllocations(result.code, 256)).toEqual({
      lengths: [...Array(9).fill(256), 258, 2, 2, 2], words: 2340 + 262 + 18,
    })
  })

  it('moves the both-on boundary by charging an authored array', () => {
    const source = `var own = array(4)\n${render}`
    const below = emitPatternWrappers(source, 1132, both)
    const above = emitPatternWrappers(source, 1133, both)
    expect(below.applied).toEqual(both)
    expect(above.applied).toEqual(['slow-mo'])
    expect(above.skipped.dreamy).toMatchObject({ neededWords: 3411, freeWords: 3410 })
    expect(measuredAllocations(below.code, 1132).words).toBe(10232)
    expect(measuredAllocations(above.code, 1133).words).toBe(6830)
  })

  it.each([
    `var a = array(random(pixelCount))\n${render}`,
    `var slots = [0,0]; for (var i = 0; i < 2; i++) slots[i] = array(3)\n${render}`,
    `export function beforeRender(delta) { var perFrame = array(3) }\n${render}`,
    `var allocate = array, a = allocate(3)\n${render}`,
    `var n = 4; function init() { n = 9000 }; init(); var a = array(n)\n${render}`,
    `var ready = 0, a
function init() { a = array(3); ready = 1 }
export function beforeRender(d) { if (!ready) init() }
export function sliderReset(v) { ready = 0 }
${render}`,
    `var ready = 0, a
export function beforeRender(d) { if (!ready) { a = array(3); if (d > 0) return; ready = 1 } }
${render}`,
    `var ready = 0, a
function init() { a = array(3); ready = 1 }
var callback = init
export function beforeRender(d) { if (!ready) init(); callback() }
${render}`,
    `var a = array(2)
function init() { for (var i = 0; i < 2; i++) { a[i] = array(3); i-- } }
init()
${render}`,
    `var a = array(2)
function init() { for (row = 0; row < 2; row++) { a[row] = array(3); var row = 0 } }
init()
${render}`,
    `var a = array(2)
function init() { for (var row = 0; row < 2; row++) { a[row] = array(3); var [row] = [0] } }
init()
${render}`,
    `var a = array(2), keys = array(1)
function init() { for (row = 0; row < 2; row++) { a[row] = array(3); for (var row in keys) {} } }
init()
${render}`,
    `var a
function init() { a = array(18 - width) }
init()
var width = 3
${render}`,
  ])('keeps an unbounded allocation unchanged (%s)', source => {
    const result = emitPatternWrappers(source, 256, both)
    expect(result.code).toBe(source)
    expect(result.applied).toEqual([])
    expect(result.skipped['slow-mo']?.reason).toBe('array-budget')
    expect(result.skipped.dreamy?.reason).toBe('array-budget')
  })

  it.each([
    ['private initializer chain', `var a, n = 7
function setup() { allocate() }
function allocate() { a = array(n) }
setup()`, [7]],
    ['init-once flag', `var ready = 0, a
function setup() { a = array(3); ready = 1 }
export function beforeRender(d) { if (!ready) setup() }`, [3]],
    ['flag set before a bounded allocation', `var ready = 0, a
export function beforeRender(d) {
  if (!ready) { ready = 1; var count = 3; a = array(count) }
}`, [3]],
    ['lazy pixelCount cache', `var built = 0, a
export function beforeRender(d) {
  if (pixelCount > 0 && built != pixelCount) { a = array(pixelCount); built = pixelCount }
}`, [256]],
    ['nested setup', `var rows = 3, matrix = array(rows)
function setup() {
  for (var row = 0; row < rows; row++) {
    matrix[row] = array(pixelCount)
  }
}
setup()`, [3, 256, 256, 256]],
  ] as const)('charges %s through load and repeated frames', (_shape, source, lengths) => {
    const result = emitPatternWrappers(`${source}\n${render}`, 256, both)
    expect(result.applied).toEqual(both)
    expect(measuredAllocations(result.code, 256)).toEqual({
      lengths: [...Array(9).fill(256), ...lengths],
      words: 2340 + lengths.reduce<number>((sum, length) => sum + length + 4, 0),
    })
    // Leave one word less than the both-on budget after the real allocation.
    const pad = 10240 - 2340 - lengths.reduce<number>((sum, length) => sum + length + 4, 0) + 1
    const scarce = emitPatternWrappers(`${source}\nvar spare = array(${pad - 4})\n${render}`, 256, both)
    expect(scarce.applied).toEqual(['slow-mo'])
    expect(scarce.skipped.dreamy).toMatchObject({ reason: 'array-budget', neededWords: 780, freeWords: 779 })
  })

  it('measures skips across the bundled stock catalogue', () => {
    const sources = Object.entries(DEMOS).map(([id, source]) => [id, bundle(source, LIBRARIES).code] as const)
    expect(sources.length).toBeGreaterThan(100)
    const rows = [
      [256, both], [1133, both], [1134, both],
      [1702, ['slow-mo']], [1703, ['slow-mo']], [3409, ['dreamy']], [3410, ['dreamy']],
    ] as const
    const census = rows.map(([pixels, requested]) => {
      const byReason: Record<string, string[]> = {}
      for (const [id, code] of sources) {
        const result = emitPatternWrappers(code, pixels, requested)
        expect(result.applied.length + Object.keys(result.skipped).length, id).toBe(requested.length)
        for (const [wrapper, skip] of Object.entries(result.skipped)) {
          const reason = skip.reason === 'array-budget' && skip.freeWords === undefined ? 'array-use-unbounded' : skip.reason
          ;(byReason[`${wrapper}/${reason}`] ??= []).push(id)
        }
      }
      return { pixels, ...Object.fromEntries(Object.entries(byReason).map(([reason, ids]) => [reason, ids.length])),
        ...(pixels === 256 ? { byReason } : {}) }
    })
    if (process.env.WRAPPER_CENSUS === '1') process.stdout.write(JSON.stringify({ patterns: sources.length, census }, null, 2))
  })
})

describe('Pattern Wrapper refusals and Controls', () => {
  it.each([
    ['no-renderer', 'export var state = 1'],
    ['shadowed-builtin', `var time = 0; ${render}`],
    ['reserved-prefix', `var __pxlblz_slowmo_authored = 0; ${render}`],
  ])('returns unchanged artifacts with %s for each enabled Wrapper', (reason, source) => {
    const base = bundle(source, {})
    const result = wrapperArtifact(source, both)
    expect(result).toMatchObject(base)
    expect(result.summary.passes[0]?.wrappers).toMatchObject({
      applied: [], skipped: { 'slow-mo': { reason }, dreamy: { reason } },
    })
  })

  it('refuses a second wrap and preserves the first output', () => {
    const first = emitPatternWrappers(render, 256, ['dreamy'])
    const repeated = emitPatternWrappers(first.code, 256, both)
    expect(repeated.code).toBe(first.code)
    expect(repeated.applied).toEqual([])
    expect(repeated.skipped).toMatchObject({
      'slow-mo': { reason: 'reserved-prefix' }, dreamy: { reason: 'reserved-prefix' },
    })
  })

  it.each([
    ['sliderSlowMo', 'slow-mo', 'sliderDreamy', 'dreamy', 1703],
    ['sliderDreamy', 'dreamy', 'sliderSlowMo', 'slow-mo', 1134],
  ] as const)('keeps the authored %s and budgets its sibling', (name, clashing, otherName, other, pixels) => {
    const source = `export var authored = 0
export function ${name}(v) { authored = v }
${render}`
    const result = wrapperArtifact(source, both, pixels)
    expect(result.summary.passes[0]?.wrappers).toMatchObject({
      applied: [other],
      skipped: { [clashing]: { reason: 'control-name-taken', message: expect.stringContaining(name) } },
    })
    expect(result.metadata.controls.map(control => control.exportName)).toEqual([name, otherName])
    const runtime = directFrames(result, 'fast', pixels)
    runtime.set(name, 0.5)
    expect(runtime.exports().authored).toBe(0.5)
  })

  it('does not reserve the names of disabled Wrappers', () => {
    const source = `export function sliderSlowMo(v) {}\n${render}`
    expect(emitPatternWrappers(source, 256, ['dreamy'])).toMatchObject({ applied: ['dreamy'], skipped: {} })
  })
})

function wrapperArtifact(source: string, enabled: readonly PatternWrapper[], pixelCount = 3) {
  return bundleWithPasses(source, {}, [{ kind: 'wrappers', enabled, pixelCount }])
}

const modes = ['fast', 'fidelity'] as const
const points = [{ sample: [0, 0.1, 0.3] }, { sample: [0.5, 0.3, 0.7] }, { sample: [0.9, 0.8, 0.5] }]
const deltas = [0, 8.7, 33.3, 17, 0, 102.25, 16, 9, 47.9, 27]

function directFrames(
  artifact: ReturnType<typeof bundle>,
  mode: typeof modes[number],
  pixelCount = points.length,
) {
  let clock = 0
  const config = { mapPoints: points, pixelCount, dimensions: 1 as const, getVirtualTime: () => clock }
  const shim = mode === 'fast' ? createShim(config) : createFxShim(config)
  const handle = loadPattern(mode === 'fast' ? artifact.code : artifact.fxCode, artifact.metadata, shim.builtins)
  return {
    set(name: string, value: number) { handle.controls[name](shim.encodeScalar(value)) },
    exports: () => handle.getExports(),
    frame(delta: number) {
      clock += delta
      handle.beforeRender(shim.encodeScalar(delta))
      return points.map((_, index) => {
        shim.resetCapturedPixel()
        handle.render(shim.encodeScalar(index))
        return [...shim.capturedPixel()]
      })
    },
  }
}

const renderSources = [
  [1, `export function render(i) { rgb(time(0.027), random(), 0.2) }`],
  [2, `var period = 0.043, hue = time(period)
export function beforeRender(delta) { hue = time(period) }
export function render2D(i,x,y) { hsv(hue+time(0.081), x, y) }`],
  [3, `var colors = [0, 0.3,0,0, 1, 0,0.6,1]
setPalette(colors)
export function render3D(i,x,y,z) { paint(time(0.0623) + z) }`],
  [3, `export function render(i) { rgb(0.9,0,0) }
export function render2D(i,x,y) { hsv24(time(0.046)+y, 0.7, 0.6) }`],
] as const

for (const fidelity of modes) {
  describe(`native Wrapper frames (${fidelity})`, () => {
    const sameFrame = (source: string, enabled: readonly PatternWrapper[], dimension: 1 | 2 | 3) => {
      const artifact = wrapperArtifact(source, enabled)
      if (enabled.length === 0) expect(artifact).toMatchObject(bundle(source, {}))
      else expect(artifact.summary.passes[0]?.wrappers?.applied).toEqual(enabled)
      const initial = { mapPoints: points, randomSeed: 17, fidelity }
      const plain = createFastReplayRuntime({ ...bundle(source, {}), dimension }, initial)
      const wrapped = createFastReplayRuntime({ ...artifact, dimension }, initial)
      for (const delta of deltas) expect(wrapped.advanceLive(delta).frame).toEqual(plain.advanceLive(delta).frame)
    }

    it.each([{ enabled: [] }, { enabled: ['slow-mo'] }, { enabled: ['dreamy'] }, { enabled: both }]
      .map(({ enabled }) => ({ enabled: enabled as readonly PatternWrapper[] })))('matches unwrapped frames with untouched $enabled', ({ enabled }) => {
      for (const [dimension, source] of renderSources) sameFrame(source, enabled, dimension)
    })

    it('matches unwrapped frames after writing an amount of zero to both Controls', () => {
      const source = 'export function render(i) { rgb(time(0.044), 0, 0) }'
      const base = directFrames(bundle(source, {}), fidelity)
      const wrapped = directFrames(wrapperArtifact(source, both), fidelity)
      wrapped.set('sliderSlowMo', 0)
      wrapped.set('sliderDreamy', 0)
      for (const delta of deltas) expect(wrapped.frame(delta)).toEqual(base.frame(delta))
    })

    it.each([[0, 0.5], [0.01, 0.5], [0.25, 0.5], [0.5, 1], [1, 0.25]])('matches existing playback at amounts %s / %s', (amount, dreamy) => {
      const source = `var t = 0
export function beforeRender(d) { t = time(0.029) }
export function render(i) { rgb(t, i/4, 0.3) }`
      const legacy = directFrames(bundleWithPasses(source, {}, [
        { kind: 'slowmo', pixelCount: points.length, settings: { position: 1 - amount, dreamy } },
      ]), fidelity)
      const wrapped = directFrames(wrapperArtifact(source, both), fidelity)
      wrapped.set('sliderSlowMo', amount)
      wrapped.set('sliderDreamy', dreamy)
      for (const delta of deltas) expect(wrapped.frame(delta)).toEqual(legacy.frame(delta))
    })
  })
}

it('captures the Pattern binding before Dreamy, then applies Brightness and Power limit', () => {
  const source = 'export var level = 0; export function render(i) { rgb(level, 0, 0) }'
  const recipe: PassRecipe = [
    { kind: 'inject', id: 'input', source: 'var gain = 1; function beforeRender(delta) { if (delta > 0) gain = 0.25 }' },
    { kind: 'bind', target: 'level', value: 1 },
    { kind: 'wrappers', enabled: ['dreamy'], pixelCount: points.length },
    { kind: 'intercept', id: 'brightness', target: 'rgb', source: 'function scale(r,g,b) { rgb(r*gain,g*gain,b*gain) }' },
    { kind: 'intercept', id: 'power', target: 'rgb', source: 'function cap(r,g,b) { rgb(min(r,0.5),min(g,0.5),min(b,0.5)) }' },
  ]
  const artifact = bundleWithPasses(source, {}, recipe)
  expect(artifact.warnings).toEqual([])
  const runtime = directFrames(artifact, 'fast')
  runtime.set('sliderDreamy', 0.5)
  expect(runtime.frame(0)).toEqual(points.map(() => [0.5, 0, 0]))
  expect(runtime.frame(16)).toEqual(points.map(() => [0.25, 0, 0]))
})
