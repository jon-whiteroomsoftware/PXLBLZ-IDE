import { DEFAULT_SLOW_MO_STEP_MS, emitSlowMoWrapper, planSlowMo, slowMoArrayWords, slowMoTunables, type SlowMoSettings } from './slowMo'

const settings: SlowMoSettings = Object.freeze({ position: 0.5, dreamy: 0 })
const renderer = 'export function render(index) { rgb(1, 0, 0) }'

describe('slow-mo memory accounting', () => {
  it('counts nine arrays including headers even at dreamy zero', () => {
    expect(slowMoArrayWords(256)).toBe(2340)
    expect(slowMoArrayWords(0)).toBe(36)
    expect(planSlowMo(renderer, settings, 256)).toEqual({ arrayWords: 2340, renderFns: ['render'] })
    expect(planSlowMo(renderer, settings, 1133).declined).toBeUndefined()
    expect(planSlowMo(renderer, settings, 1134).declined).toEqual({
      reason: 'array-budget', message: 'Slow-mo needs 10242 array words; the VM budget is 10240.',
    })
  })
  it.each([-1, 0.5, NaN, Infinity, -Infinity])('rejects invalid pixel count %s', count => {
    expect(() => slowMoArrayWords(count)).toThrow(RangeError)
    expect(() => planSlowMo(renderer, settings, count)).toThrow(RangeError)
  })
})

describe('slow-mo planner', () => {
  it.each([
    ['function render(i) {}', ['render']],
    ['export function render2D(i, x, y) {}', ['render2D']],
    ['export function render3D(i, x, y, z) {}', ['render3D']],
    ['export function render3D(i) {}\nfunction render(i) {}\nexport function render2D(i) {}', ['render', 'render2D', 'render3D']],
  ])('orders only top-level function entry points: %s', (code, renderFns) => {
    expect(planSlowMo(code as string, settings, 256)).toEqual({ arrayWords: 2340, renderFns })
  })

  it.each([
    '',
    'var render = function(i) {}',
    'function helper() { function render(i) {} }',
  ])('declines missing top-level renderer: %s', (code) => {
    expect(planSlowMo(code, settings, 256)).toEqual({
      arrayWords: 2340, renderFns: [],
      declined: { reason: 'no-renderer', message: 'Slow-mo requires render, render2D, or render3D.' },
    })
  })

  it.each(['paint', 'setPalette'])('declines unshadowed %s calls in helpers and beforeRender', (name) => {
    for (const fn of ['helper', 'beforeRender']) {
      expect(planSlowMo(`function ${fn}() { ${name}(0) }\n${renderer}`, settings, 256)).toEqual({
        arrayWords: 2340, renderFns: ['render'],
        declined: { reason: 'palette-output', message: 'Slow-mo does not capture palette output (paint/setPalette).' },
      })
    }
  })

  it.each(['time', 'rgb', 'hsv', 'hsv24'])('declines top-level variable and function %s bindings', (name) => {
    for (const declaration of [`var ${name} = 0`, `export var ${name} = 0`, `function ${name}() {}`, `export function ${name}() {}`]) {
      expect(planSlowMo(`${declaration}\n${renderer}`, settings, 256)).toEqual({
        arrayWords: 2340, renderFns: ['render'],
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
      arrayWords: 2340, renderFns: ['render'],
      declined: { reason: 'shadowed-builtin', message: `Slow-mo cannot wrap a top-level binding named ${name}.` },
    })
  })

  it.each(['paint', 'setPalette'])('accepts a hoisted top-level local %s call', name => {
    expect(planSlowMo(`if(1){var ${name}=custom} ${name}(); export function render(i){}`, settings, 256)).toEqual({
      arrayWords: 2340, renderFns: ['render'],
    })
  })

  it('does not hoist nested lexical bindings into the Program scope', () => {
    expect(planSlowMo(`if(1){let time=0;const hsv=0}\n${renderer}`, settings, 256)).toEqual({
      arrayWords: 2340, renderFns: ['render'],
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
      arrayWords: 2340, renderFns: ['render'],
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
    expect(planSlowMo(`${code}\n${renderer}`, settings, 256)).toEqual({ arrayWords: 2340, renderFns: ['render'] })
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


  it('does not mutate frozen settings', () => {
    const before = structuredClone(settings)
    emitSlowMoWrapper(renderer, settings, 3)
    expect(settings).toEqual(before)
    expect(DEFAULT_SLOW_MO_STEP_MS).toBe(16)
  })
  it.each([NaN, Infinity, -Infinity])('rejects nonfinite position %s', position => {
    expect(() => slowMoTunables({ ...settings, position })).toThrow(RangeError)
  })
  it.each([-0.001, 1.001, NaN, Infinity, -Infinity])('rejects dreamy %s', dreamy => {
    expect(() => emitSlowMoWrapper(renderer, { ...settings, dreamy }, 3)).toThrow(RangeError)
  })
  it('keeps named declines byte-identical', () => {
    const code = `paint(0); ${renderer}`
    expect(emitSlowMoWrapper(code, settings, 3)).toEqual({ code, plan: planSlowMo(code, settings, 3), tunables: {} })
  })
})
