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
    // fallback (shared HSV chain); the 205 fixture sits 2,498 B (post-#905)
    // under the activation ceiling.
    expect(issue546Report.fixtures).toMatchObject([
      {
        id: 'fixture-property-slot-qualification',
        baseline: { sourceBytes: 82_727, physicalMachines: 19 },
        selected: {
          sourceBytes: 57_701,
          physicalMachines: 7,
          auxiliaryCacheWords: 264,
          persistentGlobals: 172,
          remainingArtifactBytes: 10_683,
        },
        sourceChangePercent: expect.closeTo(-30.25, 1),
      },
      {
        id: 'fixture-installation-composition',
        baseline: { sourceBytes: 73_188, physicalMachines: 12 },
        selected: {
          sourceBytes: 65_886,
          physicalMachines: 10,
          auxiliaryCacheWords: 216,
          persistentGlobals: 251,
          remainingArtifactBytes: 2498,
        },
        sourceChangePercent: expect.closeTo(-9.98, 1),
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
