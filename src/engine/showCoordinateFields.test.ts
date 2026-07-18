import { describeShowRenderTargetArena } from './showRenderTargetArena'
import { planShowRenderTargetCaches } from './showRenderTargetPlanner'
import {
  buildShowCoordinateFieldCandidate,
  compareShowCoordinateFieldConsumers,
  coordinateFieldIdentityKey,
  type ShowCoordinateFieldDefinition,
} from './showCoordinateFields'

const definition = (patch: Partial<ShowCoordinateFieldDefinition> = {}): ShowCoordinateFieldDefinition => ({
  id: 'scene:0:sample-xy',
  producer: {
    id: 'routed-scene-sample-transform',
    operationsPerPixel: 18,
  },
  sampleDomain: {
    mapKey: 'redline-stage-2d',
    sampleKey: 'physical-stage-sample-2d',
  },
  transformIdentity: 'scene-0-placement-transforms',
  controlIdentity: 'static-controls',
  lifetime: { kind: 'scene', start: 0, end: 7_500, key: 'scene-0' },
  invalidatedBy: ['scene-exit', 'map-change', 'transform-change', 'control-change'],
  exactness: 'exact',
  pixelCount: 2_000,
  expectedFrameCount: 225,
  directOperationsPerPixelPerFrame: 18,
  readsPerPixelPerFrame: 1,
  consumers: [
    {
      id: 'scene:0:zone:hero',
      sampleDomainKey: 'redline-stage-2d:physical-stage-sample-2d',
      transformIdentity: 'scene-0-placement-transforms',
      controlIdentity: 'static-controls',
      lifetimeKey: 'scene-0',
      exactness: 'exact',
    },
    {
      id: 'scene:0:zone:targets',
      sampleDomainKey: 'redline-stage-2d:physical-stage-sample-2d',
      transformIdentity: 'scene-0-placement-transforms',
      controlIdentity: 'static-controls',
      lifetimeKey: 'scene-0',
      exactness: 'exact',
    },
  ],
  ...patch,
})

describe('exact Show coordinate fields (#528)', () => {
  it('gives identical producers and consumers one stable semantic key', () => {
    const field = definition()
    expect(coordinateFieldIdentityKey(field)).toBe(coordinateFieldIdentityKey({ ...field }))
    expect(compareShowCoordinateFieldConsumers(field.consumers[0], field.consumers[1])).toEqual({
      compatible: true,
      reasons: [],
    })
  })

  it.each([
    ['sample-domain', { sampleDomainKey: 'other-map:physical-stage-sample-2d' }],
    ['transform', { transformIdentity: 'other-transform' }],
    ['controls', { controlIdentity: 'animated-controls' }],
    ['lifetime', { lifetimeKey: 'scene-1' }],
    ['exactness', { exactness: 'authored-approximate' as const }],
  ] as const)('rejects an incompatible %s with an understandable reason', (reason, patch) => {
    expect(compareShowCoordinateFieldConsumers(
      definition().consumers[0],
      { ...definition().consumers[1], ...patch },
    )).toEqual({ compatible: false, reasons: [reason] })
  })

  it('prices first-frame writes and later two-plane reads against recomputation', () => {
    const candidate = buildShowCoordinateFieldCandidate(definition())

    expect(candidate).toEqual(expect.objectContaining({
      id: 'scene:0:sample-xy',
      kind: 'sample-xy',
      setupCost: 4_000,
      perFrameSavings: 36_000,
      replayCost: 4_000,
      expectedReuseCount: 224,
      exactness: 'exact',
    }))
    expect(candidate.invalidatedBy).toEqual([
      'scene-exit',
      'map-change',
      'transform-change',
      'control-change',
    ])
  })

  it('declines a coordinate field when plane traffic costs more than the transform', () => {
    const candidate = buildShowCoordinateFieldCandidate(definition({
      producer: { id: 'identity', operationsPerPixel: 1 },
      directOperationsPerPixelPerFrame: 1,
      expectedFrameCount: 2,
    }))
    const plan = planShowRenderTargetCaches([candidate], {
      arena: describeShowRenderTargetArena(2_000),
    })

    expect(plan.assignments).toEqual([])
    expect(plan.decisions).toContainEqual(expect.objectContaining({
      candidateId: 'scene:0:sample-xy',
      reason: 'non-profitable',
    }))
  })

  it('shares the existing arena with non-overlapping RGB and scalar lifetimes', () => {
    const coordinate = buildShowCoordinateFieldCandidate(definition())
    const plan = planShowRenderTargetCaches([
      coordinate,
      {
        id: 'transition:snapshot',
        kind: 'rgb-snapshot',
        lifetime: { kind: 'transition', start: 7_500, end: 8_500, key: 'boundary-0' },
        invalidatedBy: ['transition-exit'],
        exactness: 'authored-snapshot',
        authorSelected: true,
        required: true,
        setupCost: 2_000,
        perFrameSavings: 2_000,
        expectedReuseCount: 30,
      },
      {
        id: 'transition:mask',
        kind: 'scalar-field',
        lifetime: { kind: 'transition', start: 7_500, end: 8_500, key: 'boundary-0' },
        invalidatedBy: ['transition-exit'],
        exactness: 'exact',
        setupCost: 2_000,
        perFrameSavings: 20_000,
        replayCost: 2_000,
        expectedReuseCount: 30,
      },
    ])

    expect(plan.assignments.map(({ candidateId, planes }) => ({ candidateId, planes }))).toEqual([
      { candidateId: 'scene:0:sample-xy', planes: [0, 1] },
      { candidateId: 'transition:snapshot', planes: [0, 1, 2] },
    ])
    expect(plan.decisions).toContainEqual(expect.objectContaining({
      candidateId: 'transition:mask',
      reason: 'insufficient-overlap-capacity',
    }))
    expect(plan.resources?.additionalArrayWords ?? 0).toBe(0)
  })
})
