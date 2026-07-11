import { applyShowEasing, emitShowEasingExpression } from './showEasing'

describe('show easing', () => {
  it.each([
    ['linear', [0, 0.25, 0.5, 0.75, 1]],
    ['ease-in', [0, 0.0625, 0.25, 0.5625, 1]],
    ['ease-out', [0, 0.4375, 0.75, 0.9375, 1]],
    ['ease-in-out', [0, 0.125, 0.5, 0.875, 1]],
  ] as const)('samples %s deterministically', (easing, expected) => {
    expect([0, 0.25, 0.5, 0.75, 1].map((value) => applyShowEasing(easing, value)))
      .toEqual(expected)
  })

  it('clamps progress before easing', () => {
    expect(applyShowEasing('ease-in-out', -1)).toBe(0)
    expect(applyShowEasing('ease-in-out', 2)).toBe(1)
  })

  it('emits an expression with the same sampled values as the editor', () => {
    for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      const expression = emitShowEasingExpression(easing, 't')
      const evaluate = new Function('t', `return ${expression}`) as (t: number) => number
      for (const progress of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
        expect(evaluate(progress)).toBeCloseTo(applyShowEasing(easing, progress), 12)
      }
    }
  })
})
