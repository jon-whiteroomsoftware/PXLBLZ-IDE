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

    // Recensused with the ZRanger1 collection (#721): nine newly bundled
    // originals join the existing CoronalMassEjection. None introduces the
    // reusable expensive scalar producer this historical prototype gate asks
    // for, so the larger denominator now falls just below its 10% threshold.
    expect(issue540Report.summary).toMatchObject({
      patternCount: 72,
      reviewedCount: 72,
      credibleCandidateCount: 7,
      unreviewedIds: [],
      invalidClassificationIds: [],
      proceedWithPrototype: false,
      decision: 'stop-insufficient-incidence',
    })
    expect(issue540Report.summary.credibleCandidateRatio).toBeCloseTo(7 / 72)
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
