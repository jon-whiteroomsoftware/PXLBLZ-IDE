import { describe, expect, it } from 'vitest'
import {
  buildPatternFieldCensus,
  type PatternFieldCensusInput,
} from './showPatternFieldCensus'

function candidate(id: string, reviewed = true, producerOperationScore = 80): PatternFieldCensusInput {
  return {
    id,
    name: id,
    provenance: 'bundled',
    source: `
      export function render2D(index, x, y) {
        var field = perlinTurbulence(x, y, 0, 1.5, 0.25, 3)
        hsv(field, 1, field)
      }
    `,
    review: reviewed
      ? {
          geometry: 'expensive',
          shading: 'separable',
          coverage: 'none',
          renderPurity: 'pure',
          fieldControls: [],
          shadingControls: [],
          mixedControls: [],
          timeDependencies: [],
          stateDependencies: [],
          expectedConsumerMultiplicity: 2,
          producerOperationScore,
          notes: 'Synthetic separable field candidate.',
        }
      : null,
  }
}

describe('Pattern field/shading census', () => {
  it('holds the proceed gate closed until every Pattern has a reviewed classification', () => {
    const report = buildPatternFieldCensus([
      candidate('reviewed'),
      candidate('unreviewed', false),
    ], {
      minimumCandidateCount: 1,
      minimumCandidateRatio: 0,
      minimumProducerOperationScore: 1,
    })

    expect(report.summary).toMatchObject({
      patternCount: 2,
      reviewedCount: 1,
      credibleCandidateCount: 1,
      unreviewedIds: ['unreviewed'],
      proceedWithPrototype: false,
      decision: 'stop-incomplete-census',
    })
  })

  it('counts only producers whose reviewed cost clears the cache threshold', () => {
    const report = buildPatternFieldCensus([
      candidate('high-cost', true, 80),
      candidate('low-cost', true, 8),
    ], {
      minimumCandidateCount: 1,
      minimumCandidateRatio: 0.5,
      minimumProducerOperationScore: 40,
    })

    expect(report.entries.map((entry) => [entry.id, entry.credibleCandidate])).toEqual([
      ['high-cost', true],
      ['low-cost', false],
    ])
    expect(report.summary).toMatchObject({
      credibleCandidateCount: 1,
      credibleCandidateRatio: 0.5,
      proceedWithPrototype: true,
      decision: 'proceed-prototype',
    })
  })

  it('does not treat a stateful render path as a reusable producer', () => {
    const pure = candidate('pure')
    const stateful = candidate('stateful')
    stateful.review = { ...stateful.review!, renderPurity: 'render-mutating' }

    const report = buildPatternFieldCensus([pure, stateful], {
      minimumCandidateCount: 1,
      minimumCandidateRatio: 0,
      minimumProducerOperationScore: 1,
    })

    expect(report.entries.map((entry) => [entry.id, entry.credibleCandidate])).toEqual([
      ['pure', true],
      ['stateful', false],
    ])
  })

  it('rejects reviewed control partitions that overlap or omit authored controls', () => {
    const input = candidate('invalid-controls')
    input.source = `
      export function sliderGeometry(value) { geometry = value }
      export function sliderPalette(value) { palette = value }
      export function render2D(index, x, y) { hsv(x * geometry, 1, palette) }
    `
    input.review = {
      ...input.review!,
      fieldControls: ['sliderGeometry'],
      shadingControls: ['sliderGeometry'],
    }

    const report = buildPatternFieldCensus([input], {
      minimumCandidateCount: 1,
      minimumCandidateRatio: 0,
      minimumProducerOperationScore: 1,
    })

    expect(report.entries[0]).toMatchObject({
      controlExportNames: ['sliderGeometry', 'sliderPalette'],
      classificationErrors: [
        'Control sliderGeometry appears in more than one dependency class.',
        'Control sliderPalette has no dependency classification.',
      ],
    })
    expect(report.summary).toMatchObject({
      invalidClassificationIds: ['invalid-controls'],
      proceedWithPrototype: false,
      decision: 'stop-invalid-classification',
    })
  })
})
