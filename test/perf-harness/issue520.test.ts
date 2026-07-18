import { describe, expect, it } from 'vitest'
import {
  acceptanceArtifacts,
  ISSUE520_PIXEL_COUNT,
  report,
} from './issue520'

describe('five-Pattern acceptance Show qualification (#520)', () => {
  it('builds the representative 36-second, five-Pattern, five-Zone score', () => {
    expect(report.fixture).toBe('five-pattern-acceptance-show')
    expect(report.pixelCount).toBe(2_000)
    expect(report.durationMs).toBe(36_000)
    expect(report.patternCount).toBe(5)
    expect(report.zoneCount).toBe(5)
    expect(ISSUE520_PIXEL_COUNT).toBe(2_000)
  })

  it('keeps the selected artifact inside the Pixelblaze VM and source budgets', () => {
    expect(report.selected.resources.renderTargetWords).toBe(6_012)
    expect(report.selected.resources.totalWords).toBeLessThanOrEqual(10_240)
    expect(report.selected.artifactBudgetRatio).toBeLessThanOrEqual(1)
    expect(acceptanceArtifacts.selected.summary.clipCount).toBe(5)
  })

  it('records exact rollback variants and deterministic Fast/Precise playback', () => {
    expect(report.layers.map((layer) => layer.id)).toEqual([
      'baseline',
      'exact-routing-capture',
      'frame-invariants',
      'arena',
      'shared-motion-kernels',
      'pattern-output-reuse',
      'scalar-fields',
    ])
    expect(report.layers.every((layer) => layer.rollbackAvailable)).toBe(true)
    expect(report.determinism).toEqual([
      expect.objectContaining({ fidelity: 'fast', repeatMatches: true }),
      expect.objectContaining({ fidelity: 'fidelity', repeatMatches: true }),
    ])
  })

  it('qualifies snapshot/live against live/live without calling the authored difference exact', () => {
    expect(report.crossfadeReview.snapshot.renderPolicy).toBe('snapshot-outgoing-transition-live-incoming')
    expect(report.crossfadeReview.live.renderPolicy).toBe('steady-active-transition-both')
    expect(report.crossfadeReview.visualPolicy).toBe('authored-difference')
    expect(report.crossfadeReview.rollbackAvailable).toBe(true)
  })

  it('reports selected cache roles and understandable rejected alternatives', () => {
    expect(report.selected.renderTargetPlan.assignments.some((item) => item.kind === 'rgb-snapshot')).toBe(true)
    expect(report.selected.renderTargetPlan.assignments.some((item) => item.kind === 'scalar-field')).toBe(true)
    expect(report.selected.scalarFields.selectedFieldCount).toBeGreaterThan(0)
    expect(report.selected.patternOutputReuse.excluded).toEqual([
      expect.objectContaining({
        consumerId: 'routed-sequence',
        reasons: expect.arrayContaining(['output-dimension', 'non-cut-transition']),
      }),
    ])
  })

  it('isolates routed transition execution frames so later field locals cannot poison snapshot capture', () => {
    expect(acceptanceArtifacts.selected.expandedCode).toContain('function __pxlblz_show_routed_transition_0(')
    expect(acceptanceArtifacts.selected.expandedCode).toContain('function __pxlblz_show_routed_transition_1(')
  })

  it('retains the unsupported 4,000-pixel Redline evidence separately from production results', () => {
    expect(report.redline.production.pixelCount).toBe(2_000)
    expect(report.redline.stress.pixelCount).toBe(4_000)
    expect(report.redline.stress.support).toBe('unsupported-stress-only')
    expect(report.redline.stress.historicalCombinedFps).toBe(1.502)
  })
})
