// Plane-contention census for issue #718 (epic #903).
//
// The fourth-plane question was framed measurement-first: a fourth
// compiler-owned plane (2,004 words at 2,000 px) pays only where the
// three-plane arena forces role contention, and the issue demands a real
// stock contention scene, not a synthetic one. This census walks the
// render-target planner's decisions across every stock Show and the
// wave-2 fixtures and records every rejection whose reason is a
// contention class (`explicit-conflict`, `arena-unavailable`,
// `insufficient-overlap-capacity`).
//
// The current answer is zero: the lifetime-aware planner time-shares the
// three planes for the whole shipped catalogue (the acceptance Show's
// snapshot and scalar field, the closest coexistence, occupy disjoint
// lifetimes). The zero-assertion below is therefore a living falsifier:
// the day a Show class introduces a real collision, this test fails and
// the fourth-plane/packed-RGB question reopens with the evidence the
// issue demanded in hand.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compileShowForArtifact } from '@/engine/showPreviewArtifact'
import { installationPhysicalZones } from '@/engine/showInstallationCoverage'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { LIBRARIES } from '@/pixelblaze/libs'
import { wave2Fixtures } from './issue555'

const CONTENTION_REASONS = new Set([
  'explicit-conflict',
  'arena-unavailable',
  'insufficient-overlap-capacity',
])

interface ContentionRow {
  showId: string
  candidateId: string
  reason: string
  estimatedSavedWork: number
  conflictsWith: string[]
  detail: string
}

describe('render-target plane contention census (#718)', () => {
  it('finds no contention-class rejection in the stock catalogue or fixtures', () => {
    const rows: ContentionRow[] = []
    // Trails contention never surfaces as a rejection: the planner
    // deliberately SELECTS overlapping previous-rgb and snapshot roles and
    // resolves them by suspending Trails (an authored, disclosed policy,
    // #537). Those coexistences are enumerated here rather than asserted,
    // because the suspension is acceptable by design — but each listed Show
    // is exactly where packed one-plane RGB would remove the suspension if
    // it were ever judged visually unacceptable.
    const trailsSuspensionCoexistences: string[] = []
    const candidates: Array<{ showId: string; selected: number; rejected: number }> = []
    const record = (showId: string, plan: { decisions?: Array<ContentionRow & { status: string }> } | undefined) => {
      const decisions = plan?.decisions ?? []
      candidates.push({
        showId,
        selected: decisions.filter((decision) => decision.status === 'selected').length,
        rejected: decisions.filter((decision) => decision.status === 'rejected').length,
      })
      const assignments = (plan as { assignments?: Array<{ role: string }> })?.assignments ?? []
      if (assignments.some((entry) => entry.role === 'previous-rgb')
        && assignments.some((entry) => entry.role === 'stage-rgb')) {
        trailsSuspensionCoexistences.push(showId)
      }
      for (const decision of decisions) {
        if (decision.status === 'rejected' && CONTENTION_REASONS.has(decision.reason)) {
          rows.push({
            showId,
            candidateId: decision.candidateId,
            reason: decision.reason,
            estimatedSavedWork: decision.estimatedSavedWork,
            conflictsWith: decision.conflictsWith,
            detail: decision.detail,
          })
        }
      }
    }

    for (const stock of STOCK_SHOWS) {
      const compiled = compileShowForArtifact(
        stock.show,
        [],
        installationPhysicalZones(stock.show),
        LIBRARIES,
        { stageDimension: 2 },
      )
      expect(compiled.error, stock.id).toBeNull()
      record(stock.id, compiled.artifact!.summary.renderTargetPlan)
    }
    for (const fixture of wave2Fixtures) {
      record(`fixture:${fixture.id}`, fixture.artifact.summary.renderTargetPlan)
    }

    // Coverage invariant first: an empty contention list proves nothing if
    // candidate generation itself regressed to zero. Pin the known plane
    // population — the acceptance fixture must carry its snapshot and
    // scalar-field candidates, and the catalogue-wide count must not shrink.
    const withCandidates = candidates.filter((entry) => entry.selected + entry.rejected > 0)
    const acceptance = candidates.find((entry) => entry.showId === 'fixture:five-pattern-acceptance')
    expect(acceptance?.selected ?? 0).toBeGreaterThanOrEqual(2)
    expect(withCandidates.length).toBeGreaterThanOrEqual(5)
    const totalCandidates = candidates.reduce((sum, entry) => sum + entry.selected + entry.rejected, 0)
    expect(totalCandidates).toBeGreaterThanOrEqual(8)

    // The checked-in census JSON is a pinned artifact; refresh it
    // deliberately with ISSUE718_CENSUS_OUT=1 instead of dirtying every
    // ordinary test run with a fresh date stamp.
    if (process.env.ISSUE718_CENSUS_OUT === '1') {
      const report = {
        generatedAt: new Date().toISOString().slice(0, 10),
        showsCensused: candidates.length,
        contentionRejections: rows,
        trailsSuspensionCoexistences,
        candidateCounts: withCandidates,
      }
      writeFileSync(
        join(process.cwd(), 'test/perf-harness/issue718-contention-census.json'),
        `${JSON.stringify(report, null, 2)}\n`,
      )
    }

    if (trailsSuspensionCoexistences.length > 0) {
      console.log(`Trails-suspension coexistences (authored, not failures): ${trailsSuspensionCoexistences.join(', ')}`)
    }

    // The living falsifier for PLANNER rejections: a contention-class
    // rejection reopens #718 by failing here with the evidence collected
    // above. Designed Trails suspensions are enumerated, not asserted.
    expect(rows).toEqual([])
  })
})
