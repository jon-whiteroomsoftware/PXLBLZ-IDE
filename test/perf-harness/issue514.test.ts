import { report } from './issue514'

describe('Show render-target residual-headroom census (#514)', () => {
  it('pins the complete stock Pattern corpus and its known array-heavy exceptions', () => {
    expect(report.summary.stockPatternCount).toBe(59)
    expect(report.summary.stockPatternsWithNoMemberArrays).toBe(42)
    expect(report.summary.stockPatternsFittingResidualBudget).toBe(55)
    expect(report.summary.stockPatternRejections).toHaveLength(4)
    expect(report.summary.stockPatternRejections.map((entry) => entry.id)).toEqual([
      'pattern:AuroraSphere',
      'pattern:FireflyChoir',
      'pattern:PulseLoom',
      'pattern:RivalryRing',
    ])
    expect(report.summary.stockPatternRejections.every((entry) => entry.rejectionReasons.length > 0)).toBe(true)
  })

  it('records every resource axis required by the headroom decision', () => {
    expect(report.cases.length).toBeGreaterThan(59)
    expect(report.cases.every((entry) => (
      Number.isInteger(entry.memberPatternWords)
      && Number.isInteger(entry.generatedOverheadWords)
      && Number.isInteger(entry.remainingWords)
      && entry.pixelCount === 2_000
      && Array.isArray(entry.rejectionReasons)
    ))).toBe(true)
    // Recensused with the #363 Learn recast, again when the Learn 200
    // composition lessons landed, again with the Learn 300 lessons (303
    // joins as portable-2d while the two 160-pixel sunflower Installations
    // sit outside this census's 2,000-pixel render-target question), and
    // again with the 100 tour, 207, and the Aperture Shapes reference, and
    // again with the showcase repartition (fourteen references, every one
    // clearing the render-target reservation and activation ceiling after
    // the Shape Reveals split and the Property Animation consolidation that
    // this census itself forced).
    expect(report.summary.savedShowCount).toBe(31)
    expect(report.summary.savedShowRejections).toHaveLength(0)
    expect(report.summary.savedShowRejections.every((entry) => !entry.failsSolelyBecauseOfReservation)).toBe(true)
  })

  it('keeps the five-Pattern acceptance composition inside every artifact budget', () => {
    const acceptance = report.cases.find((entry) => entry.id === 'acceptance:five-clockwork-members')

    expect(acceptance).toMatchObject({
      kind: 'five-pattern-acceptance',
      memberCount: 5,
      memberPatternWords: 0,
      rejectionReasons: [],
    })
    expect(acceptance!.remainingWords).toBe(4_228)
  })

  it('pins both sides of the residual array boundary', () => {
    expect(report.cases.find((entry) => entry.id === 'fixture:array-residual-edge')).toMatchObject({
      remainingWords: 0,
      rejectionReasons: [],
    })
    expect(report.cases.find((entry) => entry.id === 'fixture:array-residual-overflow')).toMatchObject({
      remainingWords: -1,
      rejectionReasons: [expect.stringContaining('over the 10,240-word budget')],
    })
  })

  it('allows arena implementation only when representative compositions fit the reservation', () => {
    expect(report.decision).toEqual({
      allowArenaImplementation: true,
      representativeReservationFailures: [],
    })
  })
})
