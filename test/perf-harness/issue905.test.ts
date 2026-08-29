import { parse } from 'acorn'
import { buildTransitionHeavyArtifact, dedupTransitionArms } from './issue905'

describe('transition-arm hand-dedup (#905 stage 1)', () => {
  // Regression guard: with the #905 emitter dedupe landed, the compiler
  // emits the deduped form natively — the hand transform (which measured
  // the pre-pass counts of 2 arms and 2 wrapper chains on this fixture,
  // issue905-dedup-ladder.json) finds nothing left.
  it('finds nothing left to dedup in the compiled fixture', () => {
    const artifact = buildTransitionHeavyArtifact()
    const result = dedupTransitionArms(artifact.code)
    expect(result.dedupedArms).toBe(0)
    expect(result.wrapperCopyChains).toBe(0)
    expect(result.code).toBe(artifact.code)
    expect(artifact.code).not.toContain('_to_index')
    expect(artifact.code).not.toContain('_capture_r')
    expect(() => parse(artifact.code, { ecmaVersion: 2020, sourceType: 'module' })).not.toThrow()
  })

  it('is idempotent on the synthetic pre-pass shape', () => {
    const source = [
      'function armOne(index, x, y) {',
      'var __pxlblz_z = -1',
      '  if (index >= 0 && index <= 99) __pxlblz_z = index - 0',
      'var __pxlblz_A = -1',
      '  if (index >= 0 && index <= 99) __pxlblz_A = index - 0',
      'if (__pxlblz_z >= 0 && __pxlblz_A >= 0) {',
      '  var __pxlblz_B = (__pxlblz_z % 10) / 9',
      '  var __pxlblz_C = floor(__pxlblz_z / 10) / 9',
      '  var __pxlblz_T = (__pxlblz_A % 10) / 9',
      '  var __pxlblz_U = floor(__pxlblz_A / 10) / 9',
      '  use(__pxlblz_A, __pxlblz_T, __pxlblz_U)',
      '}',
      '}',
    ].join('\n')
    const once = dedupTransitionArms(source)
    const twice = dedupTransitionArms(once.code)
    expect(once.dedupedArms).toBe(1)
    expect(twice.dedupedArms).toBe(0)
    expect(twice.code).toBe(once.code)
  })

  it('renames only inside the enclosing block, never a reused sibling name', () => {
    // Mangled names recur across generated helpers; the second function's
    // own `__pxlblz_A` must survive the first function's arm dedupe.
    const source = [
      'function armOne(index, x, y) {',
      'var __pxlblz_z = -1',
      '  if (index >= 0 && index <= 99) __pxlblz_z = index - 0',
      'var __pxlblz_A = -1',
      '  if (index >= 0 && index <= 99) __pxlblz_A = index - 0',
      'if (__pxlblz_z >= 0 && __pxlblz_A >= 0) {',
      '  var __pxlblz_B = (__pxlblz_z % 10) / 9',
      '  var __pxlblz_C = floor(__pxlblz_z / 10) / 9',
      '  var __pxlblz_T = (__pxlblz_A % 10) / 9',
      '  var __pxlblz_U = floor(__pxlblz_A / 10) / 9',
      '  use(__pxlblz_z, __pxlblz_B, __pxlblz_C)',
      '  use(__pxlblz_A, __pxlblz_T, __pxlblz_U)',
      '}',
      '}',
      'function armTwo(index, x, y) {',
      'var __pxlblz_A = -1',
      '  if (index >= 0 && index <= 99) __pxlblz_A = index - 0',
      'use(__pxlblz_A)',
      '}',
    ].join('\n')
    const result = dedupTransitionArms(source)
    expect(result.dedupedArms).toBe(1)
    expect(result.code).toContain('use(__pxlblz_z, __pxlblz_B, __pxlblz_C)\n  use(__pxlblz_z, __pxlblz_B, __pxlblz_C)')
    expect(result.code).toContain('if (__pxlblz_z >= 0) {')
    // armTwo keeps its own reused name untouched.
    expect(result.code).toContain('function armTwo(index, x, y) {\nvar __pxlblz_A = -1')
    expect(result.code).toContain('use(__pxlblz_A)\n}')
  })
})
