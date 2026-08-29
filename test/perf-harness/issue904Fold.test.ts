import { parse } from 'acorn'
import { wave2Fixtures } from './issue555'
import { FOLD_EXPECTED_BLENDS, FOLD_FIXTURE_IDS, foldIdentityBlends } from './issue904Fold'

describe('identity-blend hand-fold (#904 stage 2)', () => {
  it('folds a single blend line to its direct assignment and bares the dead init', () => {
    const source = [
      'var __pxlblz_B = 0',
      'function wrapper() {',
      '  __pxlblz_B = __pxlblz_e * (1) + __pxlblz_B * (1 - (1))',
      '}',
    ].join('\n')
    const folded = foldIdentityBlends(source)
    expect(folded.blendCount).toBe(1)
    expect(folded.initCount).toBe(1)
    expect(folded.code).toContain('__pxlblz_B = __pxlblz_e')
    expect(folded.code).toContain('var __pxlblz_B\n')
    expect(folded.code).not.toContain('* (1) +')
  })

  it('does not touch real blends with non-identity coefficients', () => {
    const source = 'a = b * (0.75) + a * (1 - (0.75))'
    const folded = foldIdentityBlends(source)
    expect(folded.blendCount).toBe(0)
    expect(folded.code).toBe(source)
  })

  // Regression guard: with the #904 direct-assignment path in the emitter,
  // no fixture artifact carries a foldable identity blend any more. The
  // pre-pass counts (hsv-steady 6, effect-tax 6, acceptance 18) and the
  // measured fold ladder live in issue904-fold-ladder.json and on #904.
  it('finds nothing left to fold in the compiled fixtures', () => {
    for (const fixture of wave2Fixtures) {
      const folded = foldIdentityBlends(fixture.artifact.code)
      expect(folded.blendCount, fixture.id).toBe(0)
      expect(folded.code, fixture.id).toBe(fixture.artifact.code)
      expect(() => parse(fixture.artifact.code, { ecmaVersion: 2020, sourceType: 'module' })).not.toThrow()
    }
  })

  it('records the pre-pass fixture counts the ladder measured', () => {
    expect(FOLD_FIXTURE_IDS).toEqual(['hsv-steady-state', 'effect-tax', 'five-pattern-acceptance'])
    expect(FOLD_EXPECTED_BLENDS['five-pattern-acceptance']).toBe(18)
  })

  it('is idempotent', () => {
    const source = 'var b = 0\nb = e * (1) + b * (1 - (1))'
    const once = foldIdentityBlends(source)
    const twice = foldIdentityBlends(once.code)
    expect(once.blendCount).toBe(1)
    expect(twice.blendCount).toBe(0)
    expect(twice.code).toBe(once.code)
  })
})
