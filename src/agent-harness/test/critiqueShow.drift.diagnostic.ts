// Provenance: pxlblz-v3 test/critiqueShow.test.ts at 9ecd481f, one case isolated (see src/agent-harness/PROVENANCE.md)
//
// Known-drift diagnostic (#945), deliberately outside the `*.test.ts`
// discovery pattern: `npm run agent:diagnostics` runs it. The V3 oracle
// asserted that the curated stock Shows critique clean. Against the V2
// compiler at ad8ad651 the artifact for "Blend and Fade Transitions" is
// smaller than it was at the V3 pin (09550be; #928-#937 compiler options
// landed in between), so the `budget-headroom` heuristic now fires:
// "uses only 25% of the device budget with 2 distinct Patterns". The
// assertion is kept verbatim as the recorded discrepancy; it is neither a
// V2 defect nor a blessed new expectation until #947 decides which
// heuristics survive.
import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { critiqueShow } from '../shows/critique.js'
import { compileShowDocument } from '../shows/evaluate.js'

describe('V3 critique oracle against the live V2 compiler (#945 diagnostic)', () => {
  it('returns zero findings for curated good stock Shows (V3 golden at 9ecd481f)', () => {
    for (const name of ['106 Built from Basics', 'Blend and Fade Transitions']) {
      const item = STOCK_SHOWS.find((entry) => entry.name === name)
      expect(item, name).toBeDefined()
      const compiled = compileShowDocument(structuredClone(item!.show))
      const findings = critiqueShow(item!.show, {
        budgetRatio: compiled.ok ? compiled.summary.artifactBudgetRatio : undefined,
      })
      expect(findings, `${name}: ${JSON.stringify(findings.map((f) => f.rule))}`).toEqual([])
    }
  })
})
