import { report } from './issue536'

describe('Restart-instance global-liveness census (#536)', () => {
  it('covers the full saved-Show catalogue and the acceptance composition', () => {
    expect(report.schemaVersion).toBe(1)
    expect(report.issue).toBe(536)
    // Recensused with the #363 Learn recast, which replaced the ten 100/200
    // level lessons with six.
    expect(report.summary.savedShowCount).toBe(15)
    expect(report.cases.some((entry) => entry.kind === 'five-pattern-acceptance')).toBe(true)
    expect(report.summary.compileFailures).toEqual([])
  })

  it('records every capacity and initialization-work axis used by the gate', () => {
    expect(report.cases.every((entry) => (
      Number.isInteger(entry.persistentGlobalsBefore)
      && Number.isInteger(entry.persistentGlobalsAfter)
      && Number.isInteger(entry.memberGlobalsBefore)
      && Number.isInteger(entry.memberGlobalsAfter)
      && Number.isInteger(entry.reclaimedGlobals)
      && Number.isInteger(entry.remainingGlobalsBefore)
      && Number.isInteger(entry.remainingGlobalsAfter)
      && Number.isInteger(entry.entryInitializationAssignments)
      && Number.isInteger(entry.addedInitializerSymbols)
      && Number.isInteger(entry.estimatedInitializerSourceBytes)
      && Number.isInteger(entry.artifactBytesBefore)
      && Number.isInteger(entry.artifactBytesAfterUpperBound)
      && Number.isInteger(entry.remainingArtifactBytesBefore)
      && Number.isInteger(entry.remainingArtifactBytesAfterUpperBound)
      && Array.isArray(entry.excludedOwners)
    ))).toBe(true)
  })

  it('proves the coloring boundary with disjoint and overlapping Restart fixtures', () => {
    const disjoint = report.cases.find((entry) => entry.id === 'fixture:five-disjoint-restarts')
    const overlapping = report.cases.find((entry) => entry.id === 'fixture:five-overlapping-restarts')

    expect(disjoint?.reclaimedGlobals).toBeGreaterThan(0)
    expect(disjoint?.memberGlobalsAfter).toBeLessThan(disjoint!.memberGlobalsBefore)
    expect(overlapping?.reclaimedGlobals).toBe(0)
    expect(overlapping?.memberGlobalsAfter).toBe(overlapping?.memberGlobalsBefore)
  })

  it('keeps the existing five-Pattern acceptance members isolated because they Continue', () => {
    const acceptance = report.cases.find((entry) => entry.kind === 'five-pattern-acceptance')

    expect(acceptance?.memberGlobalsBefore).toBeGreaterThan(0)
    expect(acceptance?.reclaimedGlobals).toBe(0)
    expect(acceptance?.excludedOwners.some((owner) => owner.reasons.includes('continue'))).toBe(true)
  })

  it('applies the 15% gate mechanically without converting it into a product invariant', () => {
    expect(report.decision.threshold).toBe(0.15)
    // Recensused with the #363 Learn recast. The gate still reads the
    // unweighted percent, so the verdict below is unchanged even though the
    // weighted figure now sits above the threshold.
    expect(report.summary).toMatchObject({
      representativeMemberGlobals: 2_092,
      representativeReclaimedGlobals: 371,
    })
    expect(report.decision.representativeReclaimPercent).toBeCloseTo(0.00925926, 8)
    expect(report.decision.weightedRepresentativeReclaimPercent).toBeCloseTo(0.17734226, 8)
    expect(report.decision.ceilingRescues).toEqual([])
    expect(report.decision.proceedWithEmission).toBe(false)
    expect(report.decision.proceedWithEmission).toBe(
      report.decision.representativeReclaimPercent >= report.decision.threshold
      || report.decision.ceilingRescues.length > 0,
    )
  })
})
