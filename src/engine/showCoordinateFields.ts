import type {
  ShowRenderTargetCandidate,
  ShowRenderTargetExactness,
  ShowRenderTargetLifetime,
} from './showRenderTargetPlanner'

export type ShowCoordinateFieldCompatibilityReason =
  | 'sample-domain'
  | 'transform'
  | 'controls'
  | 'lifetime'
  | 'exactness'

export interface ShowCoordinateFieldConsumer {
  id: string
  sampleDomainKey: string
  transformIdentity: string
  controlIdentity: string
  lifetimeKey: string
  exactness: ShowRenderTargetExactness
}

export interface ShowCoordinateFieldDefinition {
  id: string
  producer: {
    id: string
    operationsPerPixel: number
  }
  sampleDomain: {
    mapKey: string
    sampleKey: string
  }
  transformIdentity: string
  controlIdentity: string
  lifetime: ShowRenderTargetLifetime
  invalidatedBy: string[]
  exactness: ShowRenderTargetExactness
  pixelCount: number
  expectedFrameCount: number
  directOperationsPerPixelPerFrame: number
  readsPerPixelPerFrame: number
  consumers: ShowCoordinateFieldConsumer[]
}

export interface ShowCoordinateFieldCompatibility {
  compatible: boolean
  reasons: ShowCoordinateFieldCompatibilityReason[]
}

export function coordinateFieldIdentityKey(field: ShowCoordinateFieldDefinition): string {
  return JSON.stringify({
    producer: field.producer.id,
    sampleDomain: field.sampleDomain,
    transformIdentity: field.transformIdentity,
    controlIdentity: field.controlIdentity,
    lifetime: field.lifetime,
    invalidatedBy: field.invalidatedBy,
    exactness: field.exactness,
  })
}

export function compareShowCoordinateFieldConsumers(
  left: ShowCoordinateFieldConsumer,
  right: ShowCoordinateFieldConsumer,
): ShowCoordinateFieldCompatibility {
  const reasons: ShowCoordinateFieldCompatibilityReason[] = []
  if (left.sampleDomainKey !== right.sampleDomainKey) reasons.push('sample-domain')
  if (left.transformIdentity !== right.transformIdentity) reasons.push('transform')
  if (left.controlIdentity !== right.controlIdentity) reasons.push('controls')
  if (left.lifetimeKey !== right.lifetimeKey) reasons.push('lifetime')
  if (left.exactness !== right.exactness) reasons.push('exactness')
  return { compatible: reasons.length === 0, reasons }
}

/**
 * Prices a lazily populated exact X/Y pair. The first frame already pays the
 * direct transform in the baseline, so setup only charges the two plane writes.
 * Later frames exchange the direct transform for two reads per consumer.
 */
export function buildShowCoordinateFieldCandidate(
  field: ShowCoordinateFieldDefinition,
): ShowRenderTargetCandidate {
  const pixelCount = finiteNonNegativeInteger(field.pixelCount)
  const expectedReuseCount = Math.max(0, finiteNonNegativeInteger(field.expectedFrameCount) - 1)
  return {
    id: field.id,
    kind: 'sample-xy',
    lifetime: field.lifetime,
    invalidatedBy: [...field.invalidatedBy],
    exactness: field.exactness,
    setupCost: pixelCount * 2,
    perFrameSavings: pixelCount * Math.max(0, field.directOperationsPerPixelPerFrame),
    replayCost: pixelCount * 2 * Math.max(0, field.readsPerPixelPerFrame),
    expectedReuseCount,
  }
}

function finiteNonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}
