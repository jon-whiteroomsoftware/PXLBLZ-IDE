import type {
  ShowSourceInventory,
  ShowSourceInventoryCategory,
  ShowSourceInventoryChunk,
} from './showCompiler'
import type { ShowRecord } from './personalContentRecords'
import { materializeShowGroupOccurrences } from './showGroupModel'

export type DeliveredShowSourceInventoryCategory = ShowSourceInventoryCategory | 'provenance'

export interface DeliveredShowSourceInventoryChunk extends Omit<ShowSourceInventoryChunk, 'category'> {
  category: DeliveredShowSourceInventoryCategory
}

export interface DeliveredShowSourceInventory {
  totalBytes: number
  generatedSourceBytes: number
  provenanceBytes: number
  chunks: DeliveredShowSourceInventoryChunk[]
}

export interface ShowArtifactInventoryPattern {
  key: string
  name: string
  ownerIds: string[]
  logicalInstanceCount: number
  authoredReferenceCount: number
}

export interface ShowArtifactInventoryRow {
  id: string
  category: DeliveredShowSourceInventoryCategory
  label: string
  bytes: number
  percentage: number
  creatorEditable: boolean
  physicalMachineCount?: number
  logicalInstanceCount?: number
  authoredReferenceCount?: number
  patternBreakdown?: {
    baseCopies: Array<{ ownerId: string; bytes: number }>
    baseBytes: number
    generatedBytes: number
  }
}

export interface ShowArtifactInventoryModel {
  totalBytes: number
  artifactBytes: number
  provenanceBytes: number
  budgetBytes: number
  rows: ShowArtifactInventoryRow[]
}

export function buildDeliveredShowSourceInventory(
  generatedInventory: ShowSourceInventory,
  generatedSource: string,
  deliveredSource: string,
): DeliveredShowSourceInventory {
  if (!deliveredSource.endsWith(generatedSource)) {
    throw new Error('Delivered Show source must end with the compiler-generated source.')
  }
  const generatedSourceBytes = byteLength(generatedSource)
  if (generatedInventory.totalBytes !== generatedSourceBytes) {
    throw new Error('Generated Show source inventory does not reconcile to the generated source.')
  }

  const prefix = deliveredSource.slice(0, deliveredSource.length - generatedSource.length)
  const provenanceBytes = byteLength(prefix)
  const chunks: DeliveredShowSourceInventoryChunk[] = []
  if (provenanceBytes > 0) {
    chunks.push({
      id: 'source-chunk-provenance',
      category: 'provenance',
      label: 'Show provenance and delivery header',
      bytes: provenanceBytes,
      startByte: 0,
      endByte: provenanceBytes,
    })
  }
  chunks.push(...generatedInventory.chunks.map((chunk) => ({
    ...chunk,
    startByte: chunk.startByte + provenanceBytes,
    endByte: chunk.endByte + provenanceBytes,
  })))
  return {
    totalBytes: provenanceBytes + generatedSourceBytes,
    generatedSourceBytes,
    provenanceBytes,
    chunks,
  }
}

export function buildShowArtifactInventoryModel(
  inventory: DeliveredShowSourceInventory,
  options: {
    patterns: readonly ShowArtifactInventoryPattern[]
    budgetBytes: number
  },
): ShowArtifactInventoryModel {
  const budgetBytes = Math.max(1, options.budgetBytes)
  const patternByOwnerId = new Map(options.patterns.flatMap((pattern) => (
    pattern.ownerIds.map((ownerId) => [ownerId, pattern] as const)
  )))
  const patternBytes = new Map<string, number>()
  const patternParts = new Map<string, Map<string, { baseBytes: number; generatedBytes: number }>>()
  const categoryBytes = new Map<DeliveredShowSourceInventoryCategory, number>()
  for (const chunk of inventory.chunks) {
    if (chunk.category === 'pattern' && chunk.ownerId) {
      const pattern = patternByOwnerId.get(chunk.ownerId)
      if (pattern) {
        patternBytes.set(pattern.key, (patternBytes.get(pattern.key) ?? 0) + chunk.bytes)
        const byOwner = patternParts.get(pattern.key) ?? new Map()
        const contribution = byOwner.get(chunk.ownerId) ?? { baseBytes: 0, generatedBytes: 0 }
        if (chunk.patternPart === 'compiled-pattern') contribution.baseBytes += chunk.bytes
        else contribution.generatedBytes += chunk.bytes
        byOwner.set(chunk.ownerId, contribution)
        patternParts.set(pattern.key, byOwner)
        continue
      }
    }
    categoryBytes.set(chunk.category, (categoryBytes.get(chunk.category) ?? 0) + chunk.bytes)
  }

  const rows: ShowArtifactInventoryRow[] = options.patterns.flatMap((pattern) => {
    const bytes = patternBytes.get(pattern.key) ?? 0
    if (bytes <= 0) return []
    const parts = patternParts.get(pattern.key) ?? new Map()
    const baseCopies = pattern.ownerIds.map((ownerId) => ({
      ownerId,
      bytes: parts.get(ownerId)?.baseBytes ?? 0,
    }))
    const baseBytes = baseCopies.reduce((sum, copy) => sum + copy.bytes, 0)
    const generatedBytes = pattern.ownerIds.reduce((sum, ownerId) => (
      sum + (parts.get(ownerId)?.generatedBytes ?? 0)
    ), 0)
    return [{
      id: `pattern:${pattern.key}`,
      category: 'pattern' as const,
      label: pattern.name,
      bytes,
      percentage: bytes / budgetBytes,
      creatorEditable: true,
      physicalMachineCount: pattern.ownerIds.length,
      logicalInstanceCount: pattern.logicalInstanceCount,
      authoredReferenceCount: pattern.authoredReferenceCount,
      patternBreakdown: { baseCopies, baseBytes, generatedBytes },
    }]
  })
  const categoryLabels: Record<Exclude<DeliveredShowSourceInventoryCategory, 'pattern'>, string> = {
    provenance: 'Provenance and delivery header',
    'runtime-scheduler': 'PXLBLZ Show infrastructure',
    'routing-render-plans': 'Routing, render plans, and caches',
    'effects-transitions': 'Effects and Transitions',
    'score-data': 'Show score data',
    exports: 'Pixelblaze exports',
    remainder: 'Other generated source',
  }
  const categoryOrder: Array<Exclude<DeliveredShowSourceInventoryCategory, 'pattern'>> = [
    'runtime-scheduler',
    'routing-render-plans',
    'effects-transitions',
    'score-data',
    'exports',
    'provenance',
    'remainder',
  ]
  for (const category of categoryOrder) {
    const bytes = categoryBytes.get(category) ?? 0
    if (bytes <= 0) continue
    rows.push({
      id: `category:${category}`,
      category,
      label: categoryLabels[category],
      bytes,
      percentage: bytes / budgetBytes,
      creatorEditable: ['routing-render-plans', 'effects-transitions', 'score-data'].includes(category),
    })
  }

  return {
    totalBytes: inventory.totalBytes,
    artifactBytes: inventory.generatedSourceBytes,
    provenanceBytes: inventory.provenanceBytes,
    budgetBytes,
    rows,
  }
}

export function describeShowArtifactPatterns(
  show: ShowRecord,
  inventory: DeliveredShowSourceInventory,
): ShowArtifactInventoryPattern[] {
  const composition = show.composition ? materializeShowGroupOccurrences(show.composition) : null
  const logical = composition
    ? composition.patternInstances.map((instance) => ({
        id: instance.id,
        key: `${instance.pattern.kind}:${instance.pattern.id}`,
        name: instance.patternName,
      }))
    : show.cells.map((cell) => ({
        id: cell.id,
        key: `${cell.pattern.kind}:${cell.pattern.id}`,
        name: cell.patternName,
      }))
  const logicalById = new Map(logical.map((entry) => [entry.id, entry]))
  const physicalOwnerIds = [...new Set(inventory.chunks.flatMap((chunk) => (
    chunk.category === 'pattern' && chunk.ownerId ? [chunk.ownerId] : []
  )))]
  const authoredReferencesByLogicalId = new Map<string, Set<string>>()
  const addAuthoredReference = (instanceId: string, placementId: string) => {
    const placementIds = authoredReferencesByLogicalId.get(instanceId) ?? new Set<string>()
    placementIds.add(placementId)
    authoredReferencesByLogicalId.set(instanceId, placementIds)
  }
  if (composition) {
    for (const scene of composition.scenes) {
      for (const zone of scene.zones) {
        for (const placement of zone.main) {
          addAuthoredReference(placement.instanceId, placement.logicalClipId ?? placement.id)
        }
        for (const layer of zone.overlays) {
          for (const placement of layer.placements) {
            addAuthoredReference(placement.instanceId, placement.logicalClipId ?? placement.id)
          }
        }
      }
    }
  } else {
    for (const entry of logical) addAuthoredReference(entry.id, entry.id)
  }

  const groups = new Map<string, ShowArtifactInventoryPattern>()
  for (const entry of logical) {
    const current = groups.get(entry.key) ?? {
      key: entry.key,
      name: entry.name,
      ownerIds: [],
      logicalInstanceCount: 0,
      authoredReferenceCount: 0,
    }
    current.logicalInstanceCount += 1
    current.authoredReferenceCount += authoredReferencesByLogicalId.get(entry.id)?.size ?? 0
    groups.set(entry.key, current)
  }
  for (const ownerId of physicalOwnerIds) {
    const entry = logicalById.get(ownerId)
    const key = entry?.key ?? `member:${ownerId}`
    const current = groups.get(key) ?? {
      key,
      name: entry?.name ?? ownerId,
      ownerIds: [],
      logicalInstanceCount: 1,
      authoredReferenceCount: 1,
    }
    current.ownerIds.push(ownerId)
    groups.set(key, current)
  }
  return [...groups.values()].filter((group) => group.ownerIds.length > 0)
}

/** UTF-8 byte length of a delivered Show source string — the numerator the
 * compile-pressure rule and gauge share (#63). */
export function deliveredShowSourceBytes(source: string): number {
  return byteLength(source)
}

function byteLength(source: string): number {
  return new TextEncoder().encode(source).length
}
