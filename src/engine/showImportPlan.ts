import { artifactHash } from './artifactStamp'
import { mapFingerprintForPoints } from './mapFingerprint'
import { STOCK_MAP_SPECS } from './maps'
import { newPersonalContentId } from './personalContentMetadata'
import type { MapRecord, PatternRecord, ShowPatternRef, ShowRecord } from './personalContentRecords'
import type { ShowFileBundleV1 } from './showFileBundle'
import { buildShowArtifactAttribution } from './showPreviewArtifact'
import { normalizeShowEntryState, normalizeShowTransitionState } from './showModel'
import {
  normalizeShowComposition,
  validateShowComposition,
  validateShowCompositionTimelineMetadata,
} from './showCompositionModel'
import { requireShowOutputContract } from './showOutputContract'
import { DEMOS } from '@/pixelblaze/stock/patterns'

export interface ShowImportLibrary {
  patterns: readonly PatternRecord[]
  maps: readonly MapRecord[]
  showNames: readonly string[]
}

export interface ShowImportPlanOptions {
  createId?: () => string
  now?: number
}

export interface ShowImportPlanItem {
  id: string
  name: string
}

export interface ShowImportCopyPlanItem extends ShowImportPlanItem {
  targetId: string
  targetName: string
}

export interface ShowImportPlan {
  bundle: ShowFileBundleV1
  show: { id: string; name: string }
  patterns: {
    builtIn: ShowImportPlanItem[]
    reused: ShowImportPlanItem[]
    added: ShowImportPlanItem[]
    copied: ShowImportCopyPlanItem[]
  }
  maps: {
    reused: ShowImportPlanItem[]
    added: ShowImportPlanItem[]
    copied: ShowImportCopyPlanItem[]
  }
  now: number
}

export interface AppliedShowImport {
  show: ShowRecord
  newPatterns: PatternRecord[]
  newMaps: MapRecord[]
}

export type ShowImportPlanErrorCode =
  | 'unknown_stock_pattern'
  | 'missing_bundled_pattern'
  | 'missing_bundled_map'
  | 'invalid_show'

export class ShowImportPlanError extends Error {
  constructor(
    readonly code: ShowImportPlanErrorCode,
    message: string,
    readonly entityId?: string,
  ) {
    super(message)
    this.name = 'ShowImportPlanError'
  }
}

export function planShowImport(
  bundle: ShowFileBundleV1,
  library: ShowImportLibrary,
  options: ShowImportPlanOptions = {},
): ShowImportPlan {
  const createId = options.createId ?? newPersonalContentId
  const show = {
    id: createId(),
    name: uniqueImportedName(bundle.show.name, library.showNames),
  }
  const bundledById = new Map(bundle.patterns.map((pattern) => [pattern.id, pattern]))
  const libraryById = new Map(library.patterns.map((pattern) => [pattern.id, pattern]))
  const patterns: ShowImportPlan['patterns'] = { builtIn: [], reused: [], added: [], copied: [] }
  for (const reference of buildShowArtifactAttribution(bundle.show, bundle.patterns).patterns) {
    if (reference.kind === 'stock') {
      if (DEMOS[reference.id] === undefined) {
        throw new ShowImportPlanError(
          'unknown_stock_pattern',
          `Show "${bundle.show.name}" needs the built-in Pattern "${reference.id}", which this version of PXLBLZ does not include. Update PXLBLZ or re-export from a matching version.`,
          reference.id,
        )
      }
      patterns.builtIn.push({ id: reference.id, name: reference.name })
      continue
    }
    const bundled = bundledById.get(reference.id)
    if (!bundled) {
      throw new ShowImportPlanError(
        'missing_bundled_pattern',
        `Show "${bundle.show.name}" is missing the embedded Pattern "${reference.id}".`,
        reference.id,
      )
    }
    const existing = libraryById.get(reference.id)
    if (!existing) {
      patterns.added.push({ id: bundled.id, name: bundled.name })
    } else if (artifactHash(existing.src) === artifactHash(bundled.src)) {
      patterns.reused.push({ id: bundled.id, name: bundled.name })
    } else {
      patterns.copied.push({
        id: bundled.id,
        name: bundled.name,
        targetId: createId(),
        targetName: uniqueImportedName(
          `${bundled.name} (${bundle.show.name})`,
          [
            ...library.patterns.map((pattern) => pattern.name),
            ...patterns.added.map((pattern) => pattern.name),
            ...patterns.copied.map((pattern) => pattern.targetName),
          ],
        ),
      })
    }
  }
  const bundledMapById = new Map(bundle.maps.map((map) => [map.id, map]))
  const libraryMapById = new Map(library.maps.map((map) => [map.id, map]))
  const stockMapIds = new Set(STOCK_MAP_SPECS.map((map) => map.id))
  const maps: ShowImportPlan['maps'] = { reused: [], added: [], copied: [] }
  for (const id of referencedMapIds(bundle.show)) {
    if (stockMapIds.has(id)) continue
    const bundled = bundledMapById.get(id)
    if (!bundled) {
      throw new ShowImportPlanError(
        'missing_bundled_map',
        `Show "${bundle.show.name}" is missing the embedded custom Map "${id}".`,
        id,
      )
    }
    const existing = libraryMapById.get(id)
    if (!existing) {
      maps.added.push({ id: bundled.id, name: bundled.name })
    } else if (mapContentFingerprint(existing) === mapContentFingerprint(bundled)) {
      maps.reused.push({ id: bundled.id, name: bundled.name })
    } else {
      maps.copied.push({
        id: bundled.id,
        name: bundled.name,
        targetId: createId(),
        targetName: uniqueImportedName(
          `${bundled.name} (${bundle.show.name})`,
          [
            ...library.maps.map((map) => map.name),
            ...maps.added.map((map) => map.name),
            ...maps.copied.map((map) => map.targetName),
          ],
        ),
      })
    }
  }
  return {
    bundle: structuredClone(bundle),
    show,
    patterns,
    maps,
    now: options.now ?? Date.now(),
  }
}

export function applyShowImportPlan(plan: ShowImportPlan): AppliedShowImport {
  const copiedPatternById = new Map(plan.patterns.copied.map((item) => [item.id, item]))
  const rewritePattern = (ref: ShowPatternRef, patternName: string) => {
    if (ref.kind !== 'user') return { ref, patternName }
    const copied = copiedPatternById.get(ref.id)
    return copied
      ? { ref: { kind: 'user' as const, id: copied.targetId }, patternName: copied.targetName }
      : { ref, patternName }
  }
  const source = structuredClone(plan.bundle.show)
  const copiedMapById = new Map(plan.maps.copied.map((item) => [item.id, item]))
  const rewriteMapId = (id: string | null | undefined): string | null | undefined => (
    id ? copiedMapById.get(id)?.targetId ?? id : id
  )
  const cells = source.cells.map((cell) => {
    const rewritten = rewritePattern(cell.pattern, cell.patternName)
    return { ...cell, pattern: rewritten.ref, patternName: rewritten.patternName }
  })
  const composition = source.composition
    ? {
        ...source.composition,
        patternInstances: source.composition.patternInstances.map((instance) => {
          const rewritten = rewritePattern(instance.pattern, instance.patternName)
          return { ...instance, pattern: rewritten.ref, patternName: rewritten.patternName }
        }),
        ...(source.composition.groupDefinitions
          ? {
              groupDefinitions: source.composition.groupDefinitions.map((definition) => ({
                ...definition,
                patternInstances: definition.patternInstances.map((instance) => {
                  const rewritten = rewritePattern(instance.pattern, instance.patternName)
                  return { ...instance, pattern: rewritten.ref, patternName: rewritten.patternName }
                }),
              })),
            }
          : {}),
      }
    : undefined
  let show = normalizeShowEntryState(normalizeShowTransitionState({
    ...source,
    id: plan.show.id,
    name: plan.show.name,
    cells,
    stageMapId: rewriteMapId(source.stageMapId),
    outputContract: requireShowOutputContract(
      source.outputContract.kind === 'installation'
        ? { ...source.outputContract, outputMapId: rewriteMapId(source.outputContract.outputMapId) ?? null }
        : { ...source.outputContract, referenceMapId: rewriteMapId(source.outputContract.referenceMapId) ?? null },
      plan.show.id,
    ),
    importMetadata: {
      kind: 'show-file',
      originalShowId: plan.bundle.provenance.originalShowId,
      appVersion: plan.bundle.provenance.appVersion,
      exportedAt: plan.bundle.provenance.exportedAt,
      importedAt: plan.now,
    },
    ...(composition ? { composition } : {}),
    updatedAt: plan.now,
  }))
  if (composition) {
    if (validateShowCompositionTimelineMetadata(composition).length > 0) {
      throw new ShowImportPlanError('invalid_show', 'The imported Show has invalid timeline metadata.')
    }
    const normalizedComposition = normalizeShowComposition(show, composition)
    if (validateShowComposition(show, normalizedComposition).length > 0) {
      throw new ShowImportPlanError('invalid_show', 'The imported Show has an invalid composition.')
    }
    show = { ...show, composition: normalizedComposition }
  }
  const bundledById = new Map(plan.bundle.patterns.map((pattern) => [pattern.id, pattern]))
  const newPatterns = [
    ...plan.patterns.added.map((item) => ({ ...structuredClone(bundledById.get(item.id)!), updatedAt: plan.now })),
    ...plan.patterns.copied.map((item) => ({
      ...structuredClone(bundledById.get(item.id)!),
      id: item.targetId,
      name: item.targetName,
      updatedAt: plan.now,
    })),
  ]
  const bundledMapById = new Map(plan.bundle.maps.map((map) => [map.id, map]))
  const newMaps = [
    ...plan.maps.added.map((item) => ({ ...structuredClone(bundledMapById.get(item.id)!), updatedAt: plan.now })),
    ...plan.maps.copied.map((item) => ({
      ...structuredClone(bundledMapById.get(item.id)!),
      id: item.targetId,
      name: item.targetName,
      updatedAt: plan.now,
    })),
  ]
  return { show, newPatterns, newMaps }
}

function uniqueImportedName(base: string, existing: readonly string[]): string {
  const normalized = new Set(existing.map((name) => name.toLocaleLowerCase()))
  if (!normalized.has(base.toLocaleLowerCase())) return base
  let suffix = 2
  while (normalized.has(`${base} (${suffix})`.toLocaleLowerCase())) suffix += 1
  return `${base} (${suffix})`
}

function referencedMapIds(show: ShowRecord): string[] {
  const ids = new Set<string>()
  if (show.stageMapId) ids.add(show.stageMapId)
  const contractMapId = show.outputContract.kind === 'installation'
    ? show.outputContract.outputMapId
    : show.outputContract.referenceMapId
  if (contractMapId) ids.add(contractMapId)
  return [...ids]
}

function mapContentFingerprint(map: MapRecord): string {
  return artifactHash(JSON.stringify({
    dim: map.dim,
    generator: map.generator,
    params: Object.fromEntries(Object.entries(map.params).sort(([a], [b]) => a.localeCompare(b))),
    source: map.source ?? null,
    gridDims: map.gridDims ? { cols: map.gridDims.cols, rows: map.gridDims.rows } : null,
    points: map.points && map.points.length > 0 ? mapFingerprintForPoints(map.points) : null,
  }))
}
