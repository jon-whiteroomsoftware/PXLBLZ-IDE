import { describe, expect, it } from 'vitest'
import { measureNeonOrchardCompositionSpike } from './show-scene-composition-measure'

describe('Neon orchard Scene-composition spike measurement (#462)', () => {
  it('records document size and an honestly labeled generated-cost lower bound', () => {
    const measurement = measureNeonOrchardCompositionSpike()

    expect(measurement.candidateDocumentBytes).toBeGreaterThan(0)
    expect(measurement.protectedWriteRatio).toBeLessThan(0.01)
    expect(measurement.patternInstanceCount).toBe(4)
    expect(measurement.placementCount).toBeGreaterThanOrEqual(7)
    expect(measurement.keyframeCount).toBeGreaterThanOrEqual(3)
    expect(measurement.exactCompositionCompilableByCurrentFlatCompiler).toBe(false)
    expect(measurement.generatedCostProxy).toMatchObject({
      meaning: 'two-active-source lower bound; overlays and local cuts are not yet lowerable',
      clipCount: 2,
    })
    expect(measurement.generatedCostProxy.artifactBytes).toBeGreaterThan(0)
  })
})
