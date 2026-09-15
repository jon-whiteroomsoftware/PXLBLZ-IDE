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

  it.each([
    ['direct assignment', 'mode = alternate'],
    ['compound assignment', 'mode += 1'],
    ['update expression', 'mode++'],
    ['destructuring assignment', ';[mode] = [alternate]'],
  ])('rejects %s to a declared function binding', (_label, write) => {
    const result = analyzeShowPatternMemberReset(`
      var frame = 0
      function mode() { return 0 }
      function alternate() { return 1 }
      function beforeRender(delta) {
        frame = frame + 1
        ${write}
      }
      function render(index) { rgb(mode(), frame, 0) }
    `)

    expect(result).toEqual({
      resettable: false,
      assignments: [],
      reason: 'reassigned-function-binding',
    })
  })

  it('accepts ordinary functions and assignments to shadowed local bindings', () => {
    expect(analyzeShowPatternMemberReset(`
      var frame = 0
      function mode() { return 0 }
      function helper(mode) {
        mode = mode + 1
        return mode
      }
      function hoistedShadow() {
        mode = 2
        var mode
        return mode
      }
      function beforeRender(delta) {
        var mode = helper(frame)
        mode = mode + 1
        {
          let mode = hoistedShadow()
          mode = mode + 1
        }
        frame = frame + mode
      }
      function render(index) { rgb(mode(), frame, 0) }
    `)).toEqual({
      resettable: true,
      assignments: ['frame = 0'],
      reason: null,
    })
  })

  it('rejects a top-level function write from a default-parameter expression', () => {
    expect(analyzeShowPatternMemberReset(`
      var frame = 0
      function mode() { return 0 }
      function alternate() { return 1 }
      function helper(value = (mode = alternate)) { return value }
      function beforeRender(delta) { frame = helper(frame) }
      function render(index) { rgb(mode(), frame, 0) }
    `)).toMatchObject({ resettable: false, reason: 'reassigned-function-binding' })
  })
})
