import type {
  ShowSourceInventory,
  ShowSourceInventoryCategory,
  ShowSourceInventoryChunk,
} from './showCompiler'
import type { ShowRecord } from './personalContentRecords'

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
}

export interface ShowArtifactSlimmingTip {
  contributorId: string
  currentBytes: number
  message: string
}

export interface ShowArtifactInventoryModel {
  totalBytes: number
  rows: ShowArtifactInventoryRow[]
  slimmingTips: ShowArtifactSlimmingTip[]
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
  options: { patterns: readonly ShowArtifactInventoryPattern[] },
): ShowArtifactInventoryModel {
  const patternByOwnerId = new Map(options.patterns.flatMap((pattern) => (
    pattern.ownerIds.map((ownerId) => [ownerId, pattern] as const)
  )))
  const patternBytes = new Map<string, number>()
  const categoryBytes = new Map<DeliveredShowSourceInventoryCategory, number>()
  for (const chunk of inventory.chunks) {
    if (chunk.category === 'pattern' && chunk.ownerId) {
      const pattern = patternByOwnerId.get(chunk.ownerId)
      if (pattern) {
        patternBytes.set(pattern.key, (patternBytes.get(pattern.key) ?? 0) + chunk.bytes)
        continue
      }
    }
    categoryBytes.set(chunk.category, (categoryBytes.get(chunk.category) ?? 0) + chunk.bytes)
  }

  const rows: ShowArtifactInventoryRow[] = options.patterns.flatMap((pattern) => {
    const bytes = patternBytes.get(pattern.key) ?? 0
    if (bytes <= 0) return []
    return [{
      id: `pattern:${pattern.key}`,
      category: 'pattern' as const,
      label: pattern.name,
      bytes,
      percentage: bytes / Math.max(1, inventory.totalBytes),
      creatorEditable: true,
      physicalMachineCount: pattern.ownerIds.length,
      logicalInstanceCount: pattern.logicalInstanceCount,
      authoredReferenceCount: pattern.authoredReferenceCount,
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
      percentage: bytes / Math.max(1, inventory.totalBytes),
      creatorEditable: ['routing-render-plans', 'effects-transitions', 'score-data'].includes(category),
    })
  }

  const slimmingTips = rows.flatMap((row): ShowArtifactSlimmingTip[] => {
    if (!row.creatorEditable) return []
    if (row.category === 'pattern') {
      const machines = row.physicalMachineCount ?? 1
      const logical = row.logicalInstanceCount ?? machines
      return [{
        contributorId: row.id,
        currentBytes: row.bytes,
        message: machines > 1
          ? `${row.label} needs ${machines} physical machines for ${logical} logical instances. Reduce simultaneous independent instances or reuse compatible configurations.`
          : logical > 1
            ? `${row.label} already reuses one physical machine across ${logical} logical instances; there is no duplicate executable copy to remove.`
            : `${row.label} uses one physical machine; there is no duplicate executable copy to remove. Swap, simplify, or remove it only if that visual tradeoff is worthwhile.`,
      }]
    }
    if (row.category === 'effects-transitions') return [{
      contributorId: row.id,
      currentBytes: row.bytes,
      message: 'Consolidate unique Effect or Transition variants when the same visual structure can be reused.',
    }]
    if (row.category === 'score-data') return [{
      contributorId: row.id,
      currentBytes: row.bytes,
      message: 'Shorten or simplify data-heavy choreography if transport size matters more than duration.',
    }]
    if (row.category === 'routing-render-plans') return [{
      contributorId: row.id,
      currentBytes: row.bytes,
      message: 'Simplify unique Zone Layout and render-plan structure where the choreography permits it.',
    }]
    return []
  }).sort((left, right) => right.currentBytes - left.currentBytes)

  return { totalBytes: inventory.totalBytes, rows, slimmingTips }
}

export function describeShowArtifactPatterns(
  show: ShowRecord,
  inventory: DeliveredShowSourceInventory,
): ShowArtifactInventoryPattern[] {
  const logical = show.composition
    ? show.composition.patternInstances.map((instance) => ({
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
  const authoredReferencesByLogicalId = new Map<string, number>()
  if (show.composition) {
    for (const scene of show.composition.scenes) {
      for (const zone of scene.zones) {
        for (const placement of zone.main) {
          authoredReferencesByLogicalId.set(placement.instanceId, (authoredReferencesByLogicalId.get(placement.instanceId) ?? 0) + 1)
        }
        for (const layer of zone.overlays) {
          for (const placement of layer.placements) {
            authoredReferencesByLogicalId.set(placement.instanceId, (authoredReferencesByLogicalId.get(placement.instanceId) ?? 0) + 1)
          }
        }
      }
    }
  } else {
    for (const entry of logical) authoredReferencesByLogicalId.set(entry.id, 1)
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
    current.authoredReferenceCount += authoredReferencesByLogicalId.get(entry.id) ?? 0
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

function byteLength(source: string): number {
  return new TextEncoder().encode(source).length
}
