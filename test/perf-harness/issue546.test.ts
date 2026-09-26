import { describe, expect, it } from 'vitest'
import * as acorn from 'acorn'
import { compactGeneratedShowSymbols } from '../../src/engine/showCompiler'
import { issue546Artifacts, issue546Report, stripPatternSlotRuntimeForDiagnostic } from './issue546'

describe('Restart Pattern machine-slot qualification (#546)', () => {
  it('pins the exact source and VM exchange for the two compatible Shows', () => {
    // Refreshed 2026-07-20 after the wave-2/3 emission changes, and
    // re-measured 2026-08-02 against the preserved per-scene qualification
    // fixture after the shipping Property Animation reference consolidated
    // to shared voices (#514/#536 ceilings). The exchange grows to 19 -> 7
    // machines with the recast; the fixture keeps the #559 byte-budget
    // fallback (shared HSV chain); the 205 fixture sits 2,454 B (post-#907)
    // under the activation ceiling.
    // Re-measured 2026-09-07 after #848: the qualification fixture preserves
    // the qualified CompassRose casting and twin columns (see
    // showPatternSlotTestFixture.ts), so the 19 -> 7 exchange, 181 globals
    // and 264 cache words are unchanged; only the byte figures moved with the
    // shipping reference's linear ramps and lower speed values.
    // Re-measured 2026-09-25 (#1042 4-4c): both subjects now convert through the v1 import adapter and compile on the v2 path. The qualification fixture is byte-identical; the 205 fixture drops its two boundary brightness ramps, which v2 does not convert off the flat route (#1091), and its figures are byte-equal to the v1 compile of the same stripped subject.
    expect(issue546Report.fixtures).toMatchObject([
      {
        id: 'fixture-property-slot-qualification',
        baseline: { sourceBytes: 78_966, physicalMachines: 19 },
        selected: {
          sourceBytes: 52_721,
          physicalMachines: 7,
          auxiliaryCacheWords: 264,
          persistentGlobals: 181,
          remainingArtifactBytes: 15_663,
        },
        sourceChangePercent: expect.closeTo(-33.24, 1),
      },
      {
        id: 'fixture-installation-composition',
        baseline: { sourceBytes: 66_876, physicalMachines: 12 },
        selected: {
          sourceBytes: 59_491,
          physicalMachines: 10,
          auxiliaryCacheWords: 216,
          persistentGlobals: 251,
          remainingArtifactBytes: 8893,
        },
        sourceChangePercent: expect.closeTo(-11.04, 1),
      },
    ])
  })

  it('reports local 2,000-pixel timing without turning scheduler noise into a gate', () => {
    for (const fixture of issue546Report.fixtures) {
      for (const representation of [fixture.baseline, fixture.selected]) {
        expect(representation.local2000.fast.medianFrameMs).toBeGreaterThan(0)
        expect(representation.local2000.precise.medianFrameMs).toBeGreaterThan(0)
      }
    }
  })

  it('can isolate the physical-machine remap from all owner-switch runtime', () => {
    const selected = issue546Artifacts['fixture-property-slot-qualification'].selected
    const source = stripPatternSlotRuntimeForDiagnostic(selected.expandedCode)
    const compacted = compactGeneratedShowSymbols(source).code

    expect(source).not.toMatch(/_(?:slot_|switchOwner|resetPattern)/)
    expect(compacted.length).toBeLessThan(source.length)
    expect(source).toContain('export function render2D')
    expect(() => acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' })).not.toThrow()
    expect(() => acorn.parse(compacted, { ecmaVersion: 2020, sourceType: 'module' })).not.toThrow()
  })
})
