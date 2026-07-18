import { planShowRenderTargetArena } from './showRenderTargetArena'
import {
  analyzeShowScalarField,
  buildShowScalarFieldCandidate,
  emitShowScalarFieldAccess,
  showScalarFieldIdentity,
  type ShowScalarFieldDefinition,
} from './showScalarField'

function field(overrides: Partial<ShowScalarFieldDefinition> = {}): ShowScalarFieldDefinition {
  return {
    id: 'noise-0',
    producer: {
      id: 'coherent-noise',
      semanticKey: 'coherent-noise:seed=3:scale=6',
      operationsPerPixel: 48,
    },
    coordinateDomain: { kind: 'stage-sample-2d', key: 'stage-map' },
    lifetime: { kind: 'transition', start: 1_000, end: 2_500, key: 'boundary-0' },
    invalidatedBy: ['field-plane-reassigned', 'map-change'],
    exactness: 'exact',
    expectedFrameCount: 45,
    readsPerPixelPerFrame: 1,
    consumers: [
      { id: 'outgoing-mask', coordinateDomainKey: 'stage-map', lifetimeKey: 'boundary-0' },
      { id: 'incoming-mask', coordinateDomainKey: 'stage-map', lifetimeKey: 'boundary-0' },
    ],
    ...overrides,
  }
}

describe('Show scalar fields (#519)', () => {
  it('gives equal producers in the same domain and invalidation epoch one identity', () => {
    const left = field()
    const right = field({ id: 'noise-copy' })

    expect(showScalarFieldIdentity(left)).toBe(showScalarFieldIdentity(right))
    expect(showScalarFieldIdentity(field({
      coordinateDomain: { kind: 'zone-local-2d', key: 'target-a' },
    }))).not.toBe(showScalarFieldIdentity(left))
    expect(showScalarFieldIdentity(field({
      invalidatedBy: ['field-plane-reassigned', 'property-change'],
    }))).not.toBe(showScalarFieldIdentity(left))
  })

  it('accepts multiple compatible consumers and reports mismatched domains and epochs', () => {
    const analysis = analyzeShowScalarField(field({
      consumers: [
        { id: 'compatible-a', coordinateDomainKey: 'stage-map', lifetimeKey: 'boundary-0' },
        { id: 'compatible-b', coordinateDomainKey: 'stage-map', lifetimeKey: 'boundary-0' },
        { id: 'wrong-domain', coordinateDomainKey: 'zone-a', lifetimeKey: 'boundary-0' },
        { id: 'wrong-epoch', coordinateDomainKey: 'stage-map', lifetimeKey: 'boundary-1' },
      ],
    }))

    expect(analysis.compatibleConsumerIds).toEqual(['compatible-a', 'compatible-b'])
    expect(analysis.excluded).toEqual([
      { consumerId: 'wrong-domain', reason: 'coordinate-domain-mismatch' },
      { consumerId: 'wrong-epoch', reason: 'lifetime-mismatch' },
    ])
  })

  it('turns profitable reuse into a one-plane planner candidate and leaves short fields unprofitable', () => {
    const profitable = buildShowScalarFieldCandidate(field(), 2_000)
    const oneFrame = buildShowScalarFieldCandidate(field({
      id: 'one-frame',
      expectedFrameCount: 1,
    }), 2_000)

    expect(profitable).toMatchObject({
      id: 'scalar-field:noise-0',
      kind: 'scalar-field',
      setupCost: 98_000,
      perFrameSavings: 96_000,
      replayCost: 2_000,
      expectedReuseCount: 45,
    })
    expect(oneFrame.setupCost + (oneFrame.replayCost ?? 0)).toBeGreaterThanOrEqual(
      oneFrame.perFrameSavings * oneFrame.expectedReuseCount,
    )
  })

  it('emits exact first-frame production and later reads from the planner-selected plane', () => {
    const target = planShowRenderTargetArena(64, 'scalar-field', [2])
    const source = emitShowScalarFieldAccess({
      target,
      indexExpression: 'index',
      readyExpression: '__field_ready',
      valueName: '__field_value',
      producerLines: ['var __field_value = expensiveGeometry(x, y)'],
    })

    expect(source).toContain('if (__field_ready)')
    expect(source).toContain('__field_value = __pxlblz_show_rt_plane_2[index]')
    expect(source).toContain('var __field_value = expensiveGeometry(x, y)')
    expect(source).toContain('__pxlblz_show_rt_plane_2[index] = __field_value')
  })
})
