import { describe, expect, it } from 'vitest'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import { issue540Report } from './issue540'

describe('issue #540 Pattern field/shading census', () => {
  it('covers every bundled Pattern exactly once', () => {
    const expected = Object.keys(DEMOS).sort()
    const actual = issue540Report.entries
      .filter((entry) => entry.provenance === 'bundled')
      .map((entry) => entry.name)
      .sort()

    expect(actual).toEqual(expected)
    expect(new Set(actual).size).toBe(actual.length)
  })

  it('includes a documented community sample spanning noise, iteration, and polar geometry', () => {
    const community = issue540Report.entries
      .filter((entry) => entry.provenance === 'community')
      .map((entry) => ({ name: entry.name, renderFunction: entry.renderFunction }))

    expect(community).toEqual([
      { name: 'Coronal Mass Ejection 2D', renderFunction: 'render2D' },
      { name: 'Line Dancer 2D', renderFunction: 'render2D' },
      { name: 'Mandelbrot Set 2D', renderFunction: 'render2D' },
    ])
  })

  it('records a complete conservative census before opening the prototype gate', () => {
    const candidates = issue540Report.entries
      .filter((entry) => entry.credibleCandidate)
      .map((entry) => entry.name)

    // Recensused with the published ZRanger1 3+-favorite collection (#723):
    // 23 more originals join the first ten (#721), followed by the map and
    // analog diagnostics. Neither introduces the reusable expensive scalar
    // producer this historical prototype gate asks for, so the larger
    // denominator remains below its 10% threshold.
    // Recensused with the seven Luma key-source Patterns (#819): cheap
    // periodic crest fields, none a credible expensive-scalar candidate, so
    // the candidate list holds at 7 over a 105-Pattern denominator (#840
    // adds LumaMarquee, a flat grayscale field with no shading) and the
    // stop verdict is unchanged.
    // Recensused after retiring Doom Fire v1 (#63): a convolution buffer,
    // never a candidate, so the denominator drops to 104 and the verdict
    // holds.
    expect(issue540Report.summary).toMatchObject({
      patternCount: 104,
      reviewedCount: 104,
      credibleCandidateCount: 7,
      unreviewedIds: [],
      invalidClassificationIds: [],
      proceedWithPrototype: false,
      decision: 'stop-insufficient-incidence',
    })
    expect(issue540Report.summary.credibleCandidateRatio).toBeCloseTo(7 / 104, 10)
    expect(candidates).toEqual([
      'Caustics',
      'GyroidGlow3D',
      'KaleidoBloom',
      'MagneticFilaments',
      'MetaballGarden',
      'ShapeShifter',
      'TopographicBloom',
    ])
  })
})
