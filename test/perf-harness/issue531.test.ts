import { describe, expect, it } from 'vitest'
import { counterfactualArtifact as issue518Counterfactual } from './issue518'
import { counterfactualArtifact as issue519Counterfactual } from './issue519'
import { counterfactualArtifact as issue527Counterfactual } from './issue527'
import { counterfactualArtifact as issue528Counterfactual } from './issue528'
import { issue531Fixtures } from './issue531'

describe('Show frame-time attribution fixture matrix (#531)', () => {
  it('covers both reference Shows and every previously qualified optimization fixture', () => {
    expect(issue531Fixtures.map((fixture) => fixture.id)).toEqual([
      'redline-production',
      'five-pattern-acceptance',
      'pattern-output-reuse',
      'scalar-field-cache',
      'content-key-composition',
    ])
    for (const fixture of issue531Fixtures) {
      expect(fixture.pixelCount).toBe(2_000)
      expect(fixture.artifacts.trivialOutput.kind).toBe('trivial-output')
      expect(fixture.artifacts.constantMembers.kind).toBe('constant-members')
      expect(fixture.artifacts.full.kind).toBe('full')
    }
  })

  it('keeps known optimization counterfactuals byte-identical to their existing fixtures', () => {
    const byId = Object.fromEntries(issue531Fixtures.map((fixture) => [fixture.id, fixture]))
    expect(byId['redline-production'].artifacts.full.code).toBe(issue528Counterfactual.code)
    expect(byId['pattern-output-reuse'].artifacts.full.code).toBe(issue518Counterfactual.code)
    expect(byId['scalar-field-cache'].artifacts.full.code).toBe(issue519Counterfactual.code)
    expect(byId['content-key-composition'].artifacts.full.code).toBe(issue527Counterfactual.code)
  })

  it('claims capture elision only for the exact single-member output-reuse boundary', () => {
    const eligible = issue531Fixtures.filter((fixture) => fixture.artifacts.captureElided)
    expect(eligible.map((fixture) => fixture.id)).toEqual(['pattern-output-reuse'])
    expect(eligible[0].artifacts.captureElisionReason).toContain('one render-pure member')
    for (const fixture of issue531Fixtures.filter((candidate) => !candidate.artifacts.captureElided)) {
      expect(fixture.artifacts.captureElisionReason.length).toBeGreaterThan(20)
    }
  })

  it('names the measured component removed by each existing optimization', () => {
    const optimizations = issue531Fixtures.flatMap((fixture) => fixture.optimization ?? [])
    expect(optimizations.map((optimization) => [optimization.issue, optimization.component])).toEqual([
      [528, 'coordinate-capture-replay'],
      [518, 'pattern-evaluation'],
      [519, 'scalar-field-production'],
      [527, 'coverage-directed-composition'],
    ])
  })
})
