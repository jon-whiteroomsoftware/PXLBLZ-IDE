import {
  DEFAULT_SLOW_MO_STEP_MS,
  SLOW_MO_STEP_STOPS,
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

  it.each([
    ['time', 'if(1){var time=0}'],
    ['rgb', 'for(var rgb=0;0;){}'],
    ['hsv', 'while(0){var hsv=0}'],
    ['hsv24', 'switch(1){case 1: var hsv24=0}'],
  ])('declines hoisted top-level %s bindings', (name, declaration) => {
    expect(planSlowMo(`${declaration}\n${renderer}`, settings, 256)).toEqual({
      structure: 'blend', arrayWords: 1560, renderFns: ['render'],
      declined: { reason: 'shadowed-builtin', message: `Slow-mo cannot wrap a top-level binding named ${name}.` },
    })
  })

  it.each(['paint', 'setPalette'])('accepts a hoisted top-level local %s call', name => {
    expect(planSlowMo(`if(1){var ${name}=custom} ${name}(); export function render(i){}`, settings, 256)).toEqual({
      structure: 'blend', arrayWords: 1560, renderFns: ['render'],
    })
  })

  it('does not hoist nested lexical bindings into the Program scope', () => {
    expect(planSlowMo(`if(1){let time=0;const hsv=0}\n${renderer}`, settings, 256)).toEqual({
      structure: 'blend', arrayWords: 1560, renderFns: ['render'],
    })
  })

  it('preserves calls before a later hoisted var declaration', () => {
    const local = 'function local(){if(0){time(1)} if(1){var time=custom}}'
    const result = emitSlowMoWrapper(`${local}\n${renderer}`, settings, 256)
    expect(result.code).toContain(local)
    expect(result.code).toContain('__pxlblz_slowmo_rgb(1, 0, 0)')
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

  it('pins the settled default and only lab stops', () => {
    expect(DEFAULT_SLOW_MO_STEP_MS).toBe(16)
    expect(SLOW_MO_STEP_STOPS).toEqual([16, 32])
  })

  it.each(['hold', 'blend', 'eased'] as const)('emits current %s tunable initializers', (inBetween) => {
    const input = { ...settings, inBetween }
    const tunables = slowMoTunables(input)
    expect(tunables).toEqual({
      __pxlblz_slowmo_rate: 0.25,
      __pxlblz_slowmo_step: 20,
      __pxlblz_slowmo_curve: ['hold', 'blend', 'eased'].indexOf(inBetween),
      __pxlblz_slowmo_shape: 0,
      __pxlblz_slowmo_width: 0,
    })
    const result = emitSlowMoWrapper(renderer, input, 3)
    expect(result.tunables).toEqual(tunables)
    for (const [name, value] of Object.entries(tunables)) expect(result.code).toContain(`var ${name} = ${value}`)
    expect(result.code).toContain('__pxlblz_slowmo_step * 0.0000152587890625')
    expect(result.code).not.toMatch(/\/\s*65536/)
    expect(result.code.match(/array\(pixelCount\)/g)).toHaveLength(6)
    expect(result.code).not.toMatch(/__pxlblz_slowmo_(attack|decay|pr|pg|pb|kUp|kDn)/)
  })

  it.each([0, -1, 1.01, NaN, Infinity, -Infinity])('rejects rate %s', rate => {
    expect(() => slowMoTunables({ ...settings, rate })).toThrow(RangeError)
    expect(() => emitSlowMoWrapper(renderer, { ...settings, rate }, 3)).toThrow(RangeError)
  })
  it.each([0, -1, 32768, NaN, Infinity, -Infinity])('rejects step %s', stepMs => {
    expect(() => slowMoTunables({ ...settings, stepMs })).toThrow(RangeError)
    expect(() => emitSlowMoWrapper(renderer, { ...settings, stepMs }, 3)).toThrow(RangeError)
  })
  it('keeps clock baseline and named declines byte-identical', () => {
    const clock = { ...settings, inBetween: 'clock' as const }
    expect(slowMoTunables(clock)).toEqual({})
    expect(emitSlowMoWrapper(renderer, clock, 3)).toEqual({ code: renderer, plan: planSlowMo(renderer, clock, 3), tunables: {} })
    const code = `paint(0); ${renderer}`
    expect(emitSlowMoWrapper(code, settings, 3)).toEqual({ code, plan: planSlowMo(code, settings, 3), tunables: {} })
  })
  it('guards accepted later-slice features after named budget declines', () => {
    const persistence = { ...settings, persistence: { attackMs: 0, decayMs: 100 } }
    expect(() => emitSlowMoWrapper(renderer, persistence, 1133)).toThrow(/not implemented/i)
    expect(emitSlowMoWrapper(renderer, persistence, 1134).plan.declined?.reason).toBe('array-budget')
    expect(emitSlowMoWrapper(renderer, { ...settings, stagger: { shape: 'scatter', width: 0.5 } }, 3).tunables.__pxlblz_slowmo_width).toBe(0.5)
  })
})
