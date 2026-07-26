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
    )).toBe(
      'Show composition timeline[1].zones[0].main[2]: Main placements in one Show interval and Zone cannot overlap.',
    )
  })

  it('preserves the actionable cause when adjacent Clip control targets are missing', () => {
    expect(presentShowDiagnostic('Show control "sliderSpeed" needs targets in both adjacent scenes.'))
      .toBe('Show control "sliderSpeed" needs targets in both adjacent Clips.')
  })

  it('removes a lowered internal interval suffix without turning a warning into a failure', () => {
    expect(presentShowDiagnostic(
      'Freeze at entry for clip "rings@scene-1" fell back to Live because this release requires one static, unkeyed placement on a single-zone routed Scene.',
    )).toBe(
      'Freeze at entry for clip "rings" fell back to Live because this release requires one static, unkeyed Clip on a single Zone for its full interval.',
    )
  })

  it('preserves comma-separated candidate boundaries while removing lowered interval suffixes', () => {
    expect(presentShowDiagnostic(
      'Conflicts with freeze:routed:0:0:use-a@scene-1, freeze:routed:0:1:use-b@scene-2 during an overlapping lifetime.',
    )).toBe(
      'Conflicts with freeze:routed:0:0:use-a, freeze:routed:0:1:use-b during an overlapping lifetime.',
    )
  })

  it('reframes a missing internal interval without inventing or corrupting an identifier', () => {
    expect(presentShowDiagnostic(
      'Show composition scenes[0].sceneId: Scene "scene-1" does not exist.',
    )).toBe(
      'Show composition timeline[0].intervalId: Referenced Show interval does not exist.',
    )
  })

  it('maps an internal lifetime token as a complete token', () => {
    expect(presentShowDiagnostic('Assigned plane 0 until scene-exit or show-loop.'))
      .toBe('Assigned plane 0 until interval-end or show-loop.')
  })

  it('reframes Scene-local placement bounds without matching hyphenated identifiers', () => {
    expect(presentShowDiagnostic(
      'Show composition scenes[0].zones[0].main[0]: Main placement must stay inside positive Scene-local time.',
    )).toBe(
      'Show composition timeline[0].zones[0].main[0]: Main Clip must stay inside its Show interval.',
    )
  })

  it('reframes the known static-Clip compiler fallback without losing its constraint', () => {
    expect(presentShowDiagnostic(
      'Freeze at entry for clip "rings" fell back to Live because this release requires one static, unkeyed placement on a single-zone routed Scene.',
    )).toBe(
      'Freeze at entry for clip "rings" fell back to Live because this release requires one static, unkeyed Clip on a single Zone for its full interval.',
    )
  })
})
