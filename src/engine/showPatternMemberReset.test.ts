import { describe, expect, it } from 'vitest'
import { analyzeShowPatternMemberReset } from './showPatternMemberReset'

describe('Show Pattern member reset analysis (#546)', () => {
  it('replays deterministic scalar declarations in source order', () => {
    expect(analyzeShowPatternMemberReset(`
      var a = 1
      var b = -a * 2
      var c
      function render(index) { rgb(a, b, c) }
    `)).toEqual({
      resettable: true,
      assignments: ['a = 1', 'b = -a * 2', 'c = 0'],
      reason: null,
    })
  })

  it.each([
    ['array literal', 'var values = [1, 2, 3]'],
    ['array allocation', 'var values = array(3)'],
    ['call initializer', 'var seed = random(1)'],
    ['top-level side effect', 'var seed = 1\nseed = seed + 1'],
  ])('rejects %s state rather than approximating its reset', (_label, source) => {
    const result = analyzeShowPatternMemberReset(source)
    expect(result.resettable).toBe(false)
    expect(result.assignments).toEqual([])
  })
})
