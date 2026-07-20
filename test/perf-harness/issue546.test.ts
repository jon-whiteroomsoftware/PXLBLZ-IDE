import { describe, expect, it } from 'vitest'
import * as acorn from 'acorn'
import { compactGeneratedShowSymbols } from '../../src/engine/showCompiler'
import { issue546Artifacts, issue546Report, stripPatternSlotRuntimeForDiagnostic } from './issue546'

describe('Restart Pattern machine-slot qualification (#546)', () => {
  it('pins the exact source and VM exchange for the two compatible Shows', () => {
    expect(issue546Report.fixtures).toMatchObject([
      {
        id: 'stock-show-reference-property-animation',
        baseline: { sourceBytes: 81_499, physicalMachines: 17 },
        selected: {
          sourceBytes: 64_922,
          physicalMachines: 8,
          auxiliaryCacheWords: 228,
          persistentGlobals: 197,
          remainingArtifactBytes: 3_462,
        },
        sourceChangePercent: expect.closeTo(-20.34, 1),
      },
      {
        id: 'stock-show-205-installation-composition',
        baseline: { sourceBytes: 76_383, physicalMachines: 12 },
        selected: {
          sourceBytes: 69_076,
          physicalMachines: 10,
          auxiliaryCacheWords: 216,
          persistentGlobals: 239,
          remainingArtifactBytes: -692,
        },
        sourceChangePercent: expect.closeTo(-9.57, 1),
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
