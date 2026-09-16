import { describe, expect, it } from 'vitest'
import { planShowPatternRestart } from './showPatternRestartPlan'

describe('Show Pattern Restart plan (#1037)', () => {
  const plan = (source: string, options: Parameters<typeof planShowPatternRestart>[1] = {}) => (
    planShowPatternRestart(source, { baselinePrefix: '__restart', ...options })
  )

  it('captures startup scalar values instead of replaying dependent initializers', () => {
    expect(plan('var saved = counter || 0\nvar counter = 0\nfunction render(index) { rgb(saved, counter, 0) }'))
      .toEqual({
        status: 'ready',
        bindings: ['saved', 'counter'],
        captureDeclarations: ['var __restart_0 = saved', 'var __restart_1 = counter'],
        restoreAssignments: ['saved = __restart_0', 'counter = __restart_1'],
      })
  })

  it('keeps ordinary functions and lexical shadows while refusing writes to top-level function state', () => {
    expect(plan('function mode() { return 0 }\nfunction beforeRender(mode) { mode = mode + 1 }\nfunction render(i) { rgb(mode(), 0, 0) }').status)
      .toBe('ready')

    for (const write of [
      'mode = alternate',
      'mode += 1',
      'mode++',
      'buffer[(mode = alternate, 0)] = 1',
    ]) {
      const result = plan(`var buffer = 0\nfunction mode() { return 0 }\nfunction alternate() { return 1 }\nfunction beforeRender(delta) { ${write} }\nfunction render(i) { rgb(mode(), 0, 0) }`)
      expect(result).toMatchObject({ status: 'refused', reason: 'function-binding-write' })
    }
  })

  it('keeps block and loop shadows local instead of hiding later writes', () => {
    expect(plan('function mode() { return 0 }\nfunction beforeRender() { { let mode = 1; mode++ } }').status)
      .toBe('ready')
    expect(plan('function mode() { return 0 }\nfunction beforeRender() { for (let mode = 0; mode < 1; mode++) {} }').status)
      .toBe('ready')
    expect(plan('function mode() { return 0 }\nfunction beforeRender() { { let mode = 1 } mode = 0 }'))
      .toMatchObject({ status: 'refused', reason: 'function-binding-write' })
    expect(plan('function mode() { return 0 }\nfunction beforeRender() { for (let mode = 0; mode < 1; mode++) {} mode = 0 }'))
      .toMatchObject({ status: 'refused', reason: 'function-binding-write' })
  })

  it('uses one mutable baseline per binding and refuses top-level binding collisions', () => {
    expect(plan('var value = 1\nvar value\nfunction render(i) { rgb(value, 0, 0) }')).toMatchObject({
      status: 'ready',
      bindings: ['value'],
      captureDeclarations: ['var __restart_0 = value'],
    })
    expect(plan('const value = 1\nfunction render(i) { rgb(value, 0, 0) }'))
      .toMatchObject({ status: 'refused', reason: 'unsupported-binding' })
    expect(plan('function mode() { return 0 }\nvar mode'))
      .toMatchObject({ status: 'refused', reason: 'parse-error' })
    expect(plan('var mode\nfunction mode() { return 0 }'))
      .toMatchObject({ status: 'refused', reason: 'parse-error' })
  })

  it.each([
    'async function sample() { return 1 }\nfunction render(index) { rgb(sample(), 0, 0) }',
    'function* sample() { return 1 }\nfunction render(index) { rgb(sample(), 0, 0) }',
  ])('refuses non-synchronous declared function forms', source => {
    expect(plan(source)).toMatchObject({
      status: 'refused',
      reason: 'unsupported-binding',
      message: expect.stringContaining('ordinary synchronous declared functions'),
    })
  })

  it('does not treat a local variable with a builtin spelling as the builtin', () => {
    expect(plan('function beforeRender() { var random = 0; random() }'))
      .toMatchObject({ status: 'refused', reason: 'dynamic-call' })
    expect(plan('function render(i) { var rgb = 0; rgb(1, 0, 0) }'))
      .toMatchObject({ status: 'refused', reason: 'dynamic-call' })
  })

  it.each([
    ['implicit persistent binding', 'var frame = 0\nfunction beforeRender(delta) { hidden = frame }', 'implicit-persistent-binding'],
    ['runtime array allocation', 'var state\nfunction beforeRender(delta) { state = array(2) }', 'array-or-object-state'],
    ['member state', 'var state = 0\nfunction beforeRender(delta) { state[0] = 1 }', 'array-or-object-state'],
    ['closure value', 'var fn\nfunction beforeRender(delta) { fn = function () { return delta } }', 'first-class-function'],
    ['dynamic call', 'var fn = 0\nfunction beforeRender(delta) { fn(delta) }', 'dynamic-call'],
    ['destructuring', 'function beforeRender(delta) { var [value] = delta }', 'unsupported-binding'],
  ])('refuses %s without a partial plan', (_label, source, reason) => {
    expect(plan(source)).toMatchObject({ status: 'refused', reason })
  })

  it('enumerates supported external calls while preserving random as shared environment input', () => {
    expect(plan('var sample = 0\nfunction beforeRender(delta) { sample = random(1) }\nfunction render(i) { rgb(sample, 0, 0) }').status)
      .toBe('ready')
    expect(plan('var sample = 0\nfunction beforeRender(delta) { sample = mystery(1) }'))
      .toMatchObject({ status: 'refused', reason: 'unclassified-builtin' })
  })

  it.each(['palette', 'private-prng', 'perlin-wrap', 'freeze-capture', 'refresh-capture', 'rolling-refresh-capture'] as const)(
    'refuses compiler runtime facility %s until it has an explicit reset implementation',
    (facility) => {
      expect(plan('var value = 0', { runtimeFacilities: [facility] }))
        .toMatchObject({ status: 'refused', reason: 'unsupported-runtime-facility' })
    },
  )
})
