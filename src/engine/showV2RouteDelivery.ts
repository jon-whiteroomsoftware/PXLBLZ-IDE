import { parseEpe } from './epeImport'
import type { ShowEpeExport } from './showEpeExport'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { preparedShowPatternSourceV2, type ShowPreparedStageBundleV2 } from './showPreparedStageV2'
import { portableCompatibilityBlockingMessage } from './showPortableCompatibility'
import { showPortablePatternSitesV2, validatePortableShowCompatibilityV2 } from './showPortableCompatibilityV2'
import {
  buildDeliveredShowSourceInventory,
  buildShowArtifactInventoryModel,
  deliveredShowSourceBytes,
  type DeliveredShowSourceInventory,
  type ShowArtifactInventoryModel,
  type ShowArtifactInventoryPattern,
} from './showSourceInventory'

/**
 * What the v2 editor route delivers and exports (#1056 slice 6).
 *
 * Everything here reads one prepared capture, so the Stage preview, the
 * artifact inventory, the `.epe` a Controller receives and the `.epe` a
 * download writes describe the same compiled Show. Nothing in this module
 * writes a store, a file or a provider, and nothing allocates identity.
 */
export interface ShowV2RouteArtifacts {
  /** The canonical export: what a download writes and a Controller receives. */
  epe: ShowEpeExport
  inventory: DeliveredShowSourceInventory
  model: ShowArtifactInventoryModel
  vmWords: { used: number; budget: number; remaining: number }
  renderers: {
    controller: { steady: number; worst: number }
    perPixel: { steady: number; worst: number }
  }
  structure: { transitionCount: number }
  deliveredBytes: number
  budgetBytes: number
}

export type ShowV2RouteArtifactsResult =
  | { status: 'ready'; artifacts: ShowV2RouteArtifacts }
  | { status: 'refused'; message: string }

export function buildShowV2RouteArtifacts(
  bundle: ShowPreparedStageBundleV2,
  options: {
    appVersion?: string
    exportedAt?: string | Date
    /** A fresh program id and preview image, for a download the firmware reads. */
    id?: string
    preview?: string
  } = {},
): ShowV2RouteArtifactsResult {
  const { record, assets, artifact } = bundle
  // The Portable 2D capability gate `compileShowForArtifact` applies to a v1
  // Show. Preparation compiles a Portable Show the way v1 preview does, without
  // this gate; delivery is where v1 refuses one, so delivery is where v2 refuses
  // it too. Nothing is written or adopted here: the caller receives a refusal
  // and the record it already held.
  const portable = portableCompatibilityBlockingMessage(validatePortableShowCompatibilityV2(
    record,
    showPortablePatternSitesV2(record, ref => preparedShowPatternSourceV2(ref, assets.patterns), { scope: 'effective' }),
    bundle.presentation.stageDimension,
  ))
  if (portable) return { status: 'refused', message: portable }
  const exported = buildShowEpeExportV2(record, artifact.code, {
    userMaps: assets.maps,
    ...(options.exportedAt === undefined ? {} : { stampedAt: options.exportedAt }),
    ...(options.id === undefined ? {} : { id: options.id }),
    ...(options.preview === undefined ? {} : { preview: options.preview }),
    attribution: artifact.attribution,
  })
  if (exported.status === 'refused') return { status: 'refused', message: exported.message }
  const { status: _status, ...epe } = exported
  // The reopened source is what the inventory measures: an export the
  // importer rejects would describe bytes nothing can deliver.
  const reopened = parseEpe(epe.text)
  if (!reopened.src.includes(artifact.code)) {
    return { status: 'refused', message: 'The exported .epe did not contain the compiled Show.' }
  }
  const inventory = buildDeliveredShowSourceInventory(artifact.summary.sourceInventory, artifact.code, epe.source)
  return {
    status: 'ready',
    artifacts: {
      epe,
      inventory,
      model: buildShowArtifactInventoryModel(inventory, {
        patterns: describeShowArtifactPatternsV2(record, inventory),
        budgetBytes: artifact.summary.measuredDeviceBudgetBytes,
      }),
      vmWords: {
        used: artifact.summary.resources.totalWords,
        budget: artifact.summary.resources.vmWordBudget,
        remaining: artifact.summary.resources.remainingWords,
      },
      renderers: {
        controller: { ...artifact.summary.creatorPatternPressure.patternCopiesRunning },
        perPixel: { ...artifact.summary.creatorPatternPressure.patternCalculationsPerPixel },
      },
      structure: { transitionCount: artifact.summary.transitionCount },
      deliveredBytes: deliveredShowSourceBytes(epe.source),
      budgetBytes: artifact.summary.measuredDeviceBudgetBytes,
    },
  }
}

/**
 * The v2 counterpart of `describeShowArtifactPatterns`: it counts Pattern
 * instances and their effective Clip uses - ordinary Clips and materialized
 * Group Clip uses alike (specification section 4) - instead of Scene cells.
 */
export function describeShowArtifactPatternsV2(
  record: ShowRecordV2,
  inventory: DeliveredShowSourceInventory,
): ShowArtifactInventoryPattern[] {
  const effective = materializeShowGroupsV2(record)
  const logical = effective.composition.patternInstances.map((instance) => ({
    id: instance.id,
    key: `${instance.pattern.kind}:${instance.pattern.id}`,
    name: instance.patternName,
  }))
  const logicalById = new Map(logical.map((entry) => [entry.id, entry]))
  const usesByInstanceId = new Map<string, Set<string>>()
  for (const clip of effective.composition.clips) {
    const uses = usesByInstanceId.get(clip.instanceId) ?? new Set<string>()
    uses.add(clip.id)
    usesByInstanceId.set(clip.instanceId, uses)
  }
  const physicalOwnerIds = [...new Set(inventory.chunks.flatMap((chunk) => (
    chunk.category === 'pattern' && chunk.ownerId ? [chunk.ownerId] : []
  )))]

  const groups = new Map<string, ShowArtifactInventoryPattern>()
  for (const entry of logical) {
    const current = groups.get(entry.key) ?? {
      key: entry.key, name: entry.name, ownerIds: [], logicalInstanceCount: 0, authoredReferenceCount: 0,
    }
    current.logicalInstanceCount += 1
    current.authoredReferenceCount += usesByInstanceId.get(entry.id)?.size ?? 0
    groups.set(entry.key, current)
  }
  for (const ownerId of physicalOwnerIds) {
    const entry = logicalById.get(ownerId)
    const key = entry?.key ?? `member:${ownerId}`
    const current = groups.get(key) ?? {
      key, name: entry?.name ?? ownerId, ownerIds: [], logicalInstanceCount: 1, authoredReferenceCount: 1,
    }
    current.ownerIds.push(ownerId)
    groups.set(key, current)
  }
  return [...groups.values()].filter((group) => group.ownerIds.length > 0)
}

/** The Show summary the route's header reads, all of it derived, none stored. */
export interface ShowV2RouteSummary {
  name: string
  recordVersion: 2
  showEndMs: number
  zoneCount: number
  layerCount: number
  clipCount: number
  /** Effective Clip uses: ordinary Clips plus materialized Group Clip uses. */
  effectiveClipCount: number
  patternInstanceCount: number
  transitionCount: number
  layoutOccurrenceCount: number
  markerCount: number
  groupOccurrenceCount: number
}

export function buildShowV2RouteSummary(record: ShowRecordV2): ShowV2RouteSummary {
  const effective = materializeShowGroupsV2(record)
  return {
    name: record.name,
    recordVersion: 2,
    showEndMs: record.composition.showEndMs,
    zoneCount: record.zones.length,
    layerCount: record.composition.layers.length,
    clipCount: record.composition.clips.length,
    effectiveClipCount: effective.composition.clips.length,
    patternInstanceCount: effective.composition.patternInstances.length,
    transitionCount: record.composition.transitions.length,
    layoutOccurrenceCount: record.composition.layoutOccurrences.length,
    markerCount: record.composition.markers.length,
    groupOccurrenceCount: record.composition.groupOccurrences.length,
  }
}
