import type { ShowRenderTargetPlan } from './showRenderTargetArena'
import { emitShowRenderTargetRead, emitShowRenderTargetWrite } from './showRenderTargetArena'
import type {
  ShowRenderTargetCandidate,
  ShowRenderTargetExactness,
  ShowRenderTargetLifetime,
} from './showRenderTargetPlanner'

export type ShowScalarFieldCoordinateDomainKind =
  | 'stage-sample-2d'
  | 'zone-local-2d'
  | 'physical-local-1d'

export interface ShowScalarFieldCoordinateDomain {
  kind: ShowScalarFieldCoordinateDomainKind
  /** Stable identity for the map, Zone, or local sample domain. */
  key: string
}

export interface ShowScalarFieldProducer {
  id: string
  /** Canonical semantics including every property that can change the value. */
  semanticKey: string
  operationsPerPixel: number
}

export interface ShowScalarFieldConsumer {
  id: string
  coordinateDomainKey: string
  lifetimeKey: string
}

export interface ShowScalarFieldDefinition {
  id: string
  producer: ShowScalarFieldProducer
  coordinateDomain: ShowScalarFieldCoordinateDomain
  lifetime: ShowRenderTargetLifetime
  invalidatedBy: string[]
  exactness: ShowRenderTargetExactness
  expectedFrameCount: number
  readsPerPixelPerFrame: number
  consumers: ShowScalarFieldConsumer[]
}

export type ShowScalarFieldCompatibilityReason =
  | 'coordinate-domain-mismatch'
  | 'lifetime-mismatch'

export interface ShowScalarFieldAnalysis {
  compatibleConsumerIds: string[]
  excluded: Array<{
    consumerId: string
    reason: ShowScalarFieldCompatibilityReason
  }>
}

/** Identity excludes only the cache id and cost estimates. */
export function showScalarFieldIdentity(field: ShowScalarFieldDefinition): string {
  return JSON.stringify({
    producer: field.producer.semanticKey,
    coordinateDomain: field.coordinateDomain,
    lifetime: {
      kind: field.lifetime.kind,
      key: field.lifetime.key,
    },
    invalidatedBy: [...field.invalidatedBy].sort(),
    exactness: field.exactness,
    consumers: [...field.consumers]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((consumer) => ({
        id: consumer.id,
        coordinateDomainKey: consumer.coordinateDomainKey,
        lifetimeKey: consumer.lifetimeKey,
      })),
  })
}

export function analyzeShowScalarField(field: ShowScalarFieldDefinition): ShowScalarFieldAnalysis {
  const compatibleConsumerIds: string[] = []
  const excluded: ShowScalarFieldAnalysis['excluded'] = []
  for (const consumer of field.consumers) {
    if (consumer.coordinateDomainKey !== field.coordinateDomain.key) {
      excluded.push({ consumerId: consumer.id, reason: 'coordinate-domain-mismatch' })
    } else if (consumer.lifetimeKey !== field.lifetime.key) {
      excluded.push({ consumerId: consumer.id, reason: 'lifetime-mismatch' })
    } else {
      compatibleConsumerIds.push(consumer.id)
    }
  }
  return { compatibleConsumerIds, excluded }
}

export function buildShowScalarFieldCandidate(
  field: ShowScalarFieldDefinition,
  pixelCount: number,
): ShowRenderTargetCandidate {
  const elements = Math.max(0, Math.floor(pixelCount))
  const operations = Math.max(0, field.producer.operationsPerPixel)
  const reads = Math.max(0, field.readsPerPixelPerFrame)
  return {
    id: `scalar-field:${field.id}`,
    kind: 'scalar-field',
    lifetime: field.lifetime,
    invalidatedBy: [...field.invalidatedBy],
    exactness: field.exactness,
    setupCost: elements * (operations + 1),
    perFrameSavings: elements * operations,
    replayCost: elements * reads,
    expectedReuseCount: Math.max(0, Math.floor(field.expectedFrameCount)),
  }
}

export function emitShowScalarFieldAccess(input: {
  target: ShowRenderTargetPlan<'scalar-field'>
  indexExpression: string
  readyExpression: string
  valueName: string
  producerLines: string[]
}): string {
  return `if (${input.readyExpression}) {
  ${input.valueName} = ${emitShowRenderTargetRead(input.target, 'value', input.indexExpression)}
} else {
  ${input.producerLines.join('\n  ')}
  ${emitShowRenderTargetWrite(input.target, 'value', input.indexExpression, input.valueName)}
}`
}
