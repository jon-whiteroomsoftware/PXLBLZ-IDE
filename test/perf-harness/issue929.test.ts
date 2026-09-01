import { describe, expect, it } from 'vitest'
import { compileShow } from '../../src/engine/showCompiler'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { acceptanceRecipe } from './issue520'
import { issue929Fixtures } from './issue929'

describe('#929 safety boundaries', () => {
  it('leaves every #520 transition helper byte-identical and keeps the wrappers they reference', () => {
    const pair = issue929Fixtures().find((fixture) => fixture.id === 'five-pattern-acceptance')!
    const helpers = (code: string) => [...code.matchAll(/function (__pxlblz_show_routed_transition_k\d+)\([^)]*\) \{[\s\S]*?\n\}\n/g)].map((match) => match[0])
    const offHelpers = helpers(pair.off.expandedCode)
    expect(offHelpers.length).toBeGreaterThan(0)
    expect(helpers(pair.on.expandedCode)).toEqual(offHelpers)
    expect(pair.on.summary.specializations.wrapperInlining.reason).toBe('selected')
  })

  it('keeps the wrapper form with a reason when the inlined artifact alone would cross the byte scale', () => {
    const off = compileShow(acceptanceRecipe('snapshot-live'), LIBRARIES, { generatedWrapperInlining: false })
    const gated = compileShow(acceptanceRecipe('snapshot-live'), LIBRARIES, { generatedWrapperInliningBudgetBytes: off.summary.artifactBytes })
    expect(gated.summary.specializations.wrapperInlining).toMatchObject({ selected: false, reason: 'artifact-budget', inlinedCalls: 0 })
    expect(gated.code).toBe(off.code)
  })
})

describe('#929 paired fixtures', () => {
  it('changes every fixture and keeps the artifacts clean', () => {
    for (const fixture of issue929Fixtures()) {
      expect(fixture.byteIdentical, fixture.id).toBe(false)
      expect(fixture.on.summary.resources.blockers, fixture.id).toEqual([])
    }
  })
})
