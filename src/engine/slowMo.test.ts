import {
  emitSlowMoWrapper,
  planSlowMo,
  slowMoArrayWords,
  slowMoTunables,
  type SlowMoSettings,
  type SlowMoStructure,
} from './slowMo'

const settings: SlowMoSettings = Object.freeze({
  rate: 0.25,
  stepMs: 20,
  inBetween: 'blend',
  stagger: Object.freeze({ shape: 'sweep', width: 0 }),
  persistence: null,
})
const renderer = 'export function render(index) { rgb(1, 0, 0) }'
const structures: Array<[SlowMoStructure, SlowMoSettings, number, number]> = [
  ['clock', { ...settings, inBetween: 'clock' }, 0, 0],
  ['blend', settings, 1560, 24],
  ['blend-persistence', { ...settings, persistence: { attackMs: 0, decayMs: 500 } }, 2340, 36],
  ['persistence-only', { ...settings, inBetween: 'clock', persistence: { attackMs: 0, decayMs: 500 } }, 780, 12],
]

describe('slow-mo memory accounting', () => {
  it.each(structures)('counts %s arrays including empty headers', (structure, input, words, headers) => {
    expect(slowMoArrayWords(256, structure)).toBe(words)
    expect(slowMoArrayWords(0, structure)).toBe(headers)
    expect(planSlowMo(renderer, input, 256)).toEqual({ structure, arrayWords: words, renderFns: ['render'] })
  })

  it.each([-1, 0.5, NaN, Infinity, -Infinity])('rejects invalid pixel count %s for every structure', (count) => {
    for (const [structure, input] of structures) {
      expect(() => slowMoArrayWords(count, structure)).toThrow(RangeError)
      expect(() => planSlowMo(renderer, input, count)).toThrow(RangeError)
    }
  })

  it.each([
    [structures[1], 1702, 1703, 10236, 10242],
    [structures[2], 1133, 1134, 10233, 10242],
    [structures[3], 3409, 3410, 10239, 10242],
  ] as const)('accepts the last fitting count for %s and declines the next', ([structure, input], accepted, declined, below, above) => {
    expect(planSlowMo(renderer, input, accepted)).toEqual({ structure, arrayWords: below, renderFns: ['render'] })
    expect(planSlowMo(renderer, input, declined)).toEqual({
      structure, arrayWords: above, renderFns: ['render'],
      declined: { reason: 'array-budget', message: `Slow-mo needs ${above} array words; the VM budget is 10240.` },
    })
  })
})

describe('slow-mo planner', () => {
  it.each(['clock', 'hold', 'blend', 'eased'] as const)('plans %s without mutating arbitrary explicit steps', (inBetween) => {
    const input: SlowMoSettings = Object.freeze({
      ...settings, inBetween, stepMs: 45,
      persistence: Object.freeze({ attackMs: 70, decayMs: 900 }),
    })
    const before = structuredClone(input)
    expect(planSlowMo(renderer, input, 256)).toEqual({
      structure: inBetween === 'clock' ? 'persistence-only' : 'blend-persistence',
      arrayWords: inBetween === 'clock' ? 780 : 2340,
      renderFns: ['render'],
    })
    expect(input).toEqual(before)
    expect(settings.stepMs).toBe(20)
  })

  it.each([
    ['function render(i) {}', ['render']],
    ['export function render2D(i, x, y) {}', ['render2D']],
    ['export function render3D(i, x, y, z) {}', ['render3D']],
    ['export function render3D(i) {}\nfunction render(i) {}\nexport function render2D(i) {}', ['render', 'render2D', 'render3D']],
  ])('orders only top-level function entry points: %s', (code, renderFns) => {
    expect(planSlowMo(code as string, settings, 256)).toEqual({ structure: 'blend', arrayWords: 1560, renderFns })
  })

  it.each([
    '',
    'var render = function(i) {}',
    'function helper() { function render(i) {} }',
  ])('declines missing top-level renderer: %s', (code) => {
    expect(planSlowMo(code, settings, 256)).toEqual({
      structure: 'blend', arrayWords: 1560, renderFns: [],
      declined: { reason: 'no-renderer', message: 'Slow-mo requires render, render2D, or render3D.' },
    })
  })

  it.each(['paint', 'setPalette'])('declines unshadowed %s calls in helpers and beforeRender', (name) => {
    for (const fn of ['helper', 'beforeRender']) {
      expect(planSlowMo(`function ${fn}() { ${name}(0) }\n${renderer}`, settings, 256)).toEqual({
        structure: 'blend', arrayWords: 1560, renderFns: ['render'],
        declined: { reason: 'palette-output', message: 'Slow-mo does not capture palette output (paint/setPalette).' },
      })
    }
  })

  it.each(['time', 'rgb', 'hsv', 'hsv24'])('declines top-level variable and function %s bindings', (name) => {
    for (const declaration of [`var ${name} = 0`, `export var ${name} = 0`, `function ${name}() {}`, `export function ${name}() {}`]) {
      expect(planSlowMo(`${declaration}\n${renderer}`, settings, 256)).toEqual({
        structure: 'blend', arrayWords: 1560, renderFns: ['render'],
        declined: { reason: 'shadowed-builtin', message: `Slow-mo cannot wrap a top-level binding named ${name}.` },
      })
    }
  })

  it('declines reserved identifiers', () => {
    expect(planSlowMo(`var __pxlblz_slowmo_value = 0\n${renderer}`, settings, 256)).toEqual({
      structure: 'blend', arrayWords: 1560, renderFns: ['render'],
      declined: { reason: 'reserved-prefix', message: 'Slow-mo source uses the reserved __pxlblz_slowmo_ prefix.' },
    })
  })

  it.each([
    'function helper(time, hsv) { time(); hsv() }',
    'function helper() { var time = custom; var hsv = custom; time(); hsv() }',
    'function helper(paint, setPalette) { paint(); setPalette() }',
    'function helper() { var paint = custom; var setPalette = custom; paint(); setPalette() }',
    '// paint( setPalette( __pxlblz_slowmo_value\nvar text = "paint( setPalette( __pxlblz_slowmo_value"',
    'function helper() { obj.paint(); obj.setPalette() }',
    'var __pxlblz_slowmo = 0',
    'var authored = array(100000)',
  ])('accepts local shadowing and non-builtin text: %s', (code) => {
    expect(planSlowMo(`${code}\n${renderer}`, settings, 256)).toEqual({ structure: 'blend', arrayWords: 1560, renderFns: ['render'] })
  })

  it('returns the first applicable refusal in specification order', () => {
    const reserved = 'var __pxlblz_slowmo_value = 0'
    const bindings = 'var hsv24 = 0, hsv = 0, rgb = 0, time = 0'
    expect(planSlowMo(`paint(); ${bindings}; ${reserved}`, settings, 5000).declined).toEqual({
      reason: 'palette-output', message: 'Slow-mo does not capture palette output (paint/setPalette).',
    })
    expect(planSlowMo(`${bindings}; ${reserved}`, settings, 5000).declined).toEqual({
      reason: 'no-renderer', message: 'Slow-mo requires render, render2D, or render3D.',
    })
    expect(planSlowMo(`${bindings}; ${reserved}; ${renderer}`, settings, 5000).declined).toEqual({
      reason: 'shadowed-builtin', message: 'Slow-mo cannot wrap a top-level binding named time.',
    })
    expect(planSlowMo(`${reserved}; ${renderer}`, settings, 5000).declined).toEqual({
      reason: 'reserved-prefix', message: 'Slow-mo source uses the reserved __pxlblz_slowmo_ prefix.',
    })
  })

  it('throws syntax errors rather than a named refusal', () => {
    expect(() => planSlowMo('export function render(', settings, 256)).toThrow(SyntaxError)
  })

  it('exposes incomplete emitter and tunables functions without claiming an artifact', () => {
    expect(() => emitSlowMoWrapper(renderer, settings, 256)).toThrow('This increment has not implemented slow-mo emission.')
    expect(() => slowMoTunables(settings)).toThrow('This increment has not implemented slow-mo tunables.')
  })
})
