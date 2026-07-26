import { describe, expect, it } from 'vitest'
import { presentShowDiagnostic } from './showDiagnosticPresentation'

describe('Show diagnostic presentation (#634)', () => {
  it('preserves a diagnostic already written in the user model', () => {
    expect(presentShowDiagnostic('A Clip overlaps another Clip on this Layer.'))
      .toBe('A Clip overlaps another Clip on this Layer.')
  })

  it('maps internal Scene paths and vocabulary to an actionable public error', () => {
    expect(presentShowDiagnostic(
      'Show composition scenes[1].zones[0].main[2]: Main placements in one Scene and Zone cannot overlap.',
    )).toBe('Show compilation failed because one or more Clips have invalid timing, Layer, or boundary configuration.')
  })

  it('reframes the known static-Clip compiler fallback without losing its constraint', () => {
    expect(presentShowDiagnostic(
      'Freeze at entry for clip "rings" fell back to Live because this release requires one static, unkeyed placement on a single-zone routed Scene.',
    )).toBe(
      'Freeze at entry for clip "rings" fell back to Live because this release requires one static, unkeyed Clip on a single Zone for its full interval.',
    )
  })
})
