import { describe, expect, it } from 'vitest'
import * as acorn from 'acorn'
import { compactGeneratedShowSymbols } from '../../src/engine/showCompiler'
import { issue546Artifacts, issue546Report, stripPatternSlotRuntimeForDiagnostic } from './issue546'

describe('Restart Pattern machine-slot qualification (#546)', () => {
  it('pins the exact source and VM exchange for the two compatible Shows', () => {
    // Refreshed 2026-07-20 after the wave-2/3 emission changes; the slot
    // exchange itself (17 -> 8 and 12 -> 10 machines) is unchanged. The
    // Property Animation fixture reflects the #559 byte-budget fallback
    // (shared HSV chain, 2,146 B headroom); the 205 fixture moved from 692 B
    // over the activation ceiling to 300 B under it.
    expect(issue546Report.fixtures).toMatchObject([
      {
        id: 'stock-show-reference-property-animation',
        baseline: { sourceBytes: 82_815, physicalMachines: 17 },
        selected: {
          sourceBytes: 66_238,
          physicalMachines: 8,
          auxiliaryCacheWords: 228,
          persistentGlobals: 197,
          remainingArtifactBytes: 2_146,
        },
        sourceChangePercent: expect.closeTo(-20.02, 1),
      },
      {
        id: 'fixture-installation-composition',
        baseline: { sourceBytes: 75_386, physicalMachines: 12 },
        selected: {
          sourceBytes: 68_084,
          physicalMachines: 10,
          auxiliaryCacheWords: 216,
          persistentGlobals: 251,
          remainingArtifactBytes: 300,
        },
        sourceChangePercent: expect.closeTo(-9.69, 1),
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
    const selected = issue546Artifacts['stock-show-reference-property-animation'].selected
    const source = stripPatternSlotRuntimeForDiagnostic(selected.expandedCode)
    const compacted = compactGeneratedShowSymbols(source).code

    expect(source).not.toMatch(/_(?:slot_|switchOwner|resetPattern)/)
    expect(compacted.length).toBeLessThan(source.length)
    expect(source).toContain('export function render2D')
    expect(() => acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' })).not.toThrow()
    expect(() => acorn.parse(compacted, { ecmaVersion: 2020, sourceType: 'module' })).not.toThrow()
  })
})
