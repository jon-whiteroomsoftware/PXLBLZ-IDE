import { describe, expect, it } from 'vitest'
import {
  buildIssue540PrototypeCase,
  compareIssue540FieldConsumers,
  ISSUE540_FIELD_DECLARATION,
} from './issue540.prototype'

describe('issue #540 diagnostic Pattern field/shading prototype', () => {
  it('declares the scalar producer boundary and its exact dependency classes', () => {
    expect(ISSUE540_FIELD_DECLARATION).toEqual({
      id: 'metaball-density',
      output: 'scalar',
      coordinateDomain: 'normalized-map-2d',
      lifetime: 'frame',
      exactness: 'exact',
      renderPurity: 'pure',
      fieldControls: ['blobCount', 'speed'],
      shadingControls: ['palette', 'threshold'],
    })
  })

  it('shares geometry across shading-only changes but not field changes', () => {
    const base = { speed: 0.4, blobCount: 4, palette: 0.1, threshold: 1.1 }

    expect(compareIssue540FieldConsumers(base, { ...base, palette: 0.8, threshold: 1.3 })).toEqual({
      compatible: true,
      changedFieldControls: [],
      changedShadingControls: ['palette', 'threshold'],
    })
    expect(compareIssue540FieldConsumers(base, { ...base, speed: 0.7 })).toEqual({
      compatible: false,
      changedFieldControls: ['speed'],
      changedShadingControls: [],
    })
  })

  it.each([2, 5])('matches direct and shared execution for %i differently shaded consumers', (consumerCount) => {
    const result = buildIssue540PrototypeCase(consumerCount, 64)

    expect(result.parity).toEqual({ fast: true, precise: true })
    expect(result.direct.producerCount).toBe(consumerCount)
    expect(result.shared.producerCount).toBe(1)
    expect(result.direct.rendererCount).toBe(consumerCount)
    expect(result.shared.rendererCount).toBe(consumerCount)
    expect(result.shared.vmWords - result.direct.vmWords).toBe(68)
    expect(result.software.fast.directMedianMsPerFrame).toBeGreaterThan(0)
    expect(result.software.fast.sharedMedianMsPerFrame).toBeGreaterThan(0)
    expect(result.software.precise.directMedianMsPerFrame).toBeGreaterThan(0)
    expect(result.software.precise.sharedMedianMsPerFrame).toBeGreaterThan(0)
  })
})
