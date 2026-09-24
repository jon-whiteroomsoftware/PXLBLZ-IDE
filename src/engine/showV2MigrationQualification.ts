// #1039: the section 10 runbook's "read back, reopen and compile" step.
//
// The migration owner already proves a converted row survives storage
// byte-for-byte. That says nothing about whether the row is still a usable
// Show: a record can round-trip through D1 and still fail to resolve its
// Pattern dependencies, refuse compiler preparation, or decline to reopen from
// its own portable bytes. This module answers that question over the record as
// it was read back, using the same production codecs and compiler path the
// editor and the exporters use, and reports a typed refusal instead of
// throwing, so a failed row stays reported and recoverable.
import { artifactHash } from './artifactStamp'
import { compileLibraries } from './libraries'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { isShowRecordV2, type ShowDocument } from './showDocument'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import { applyShowImportPlanV2, planShowImportV2 } from './showImportPlanV2'
import type { LibraryRecord, MapRecord, PatternRecord, ShowPatternRef, ShowRecord } from './personalContentRecords'
import type { ShowCompileRecipeSourceLookup } from './showModel'
import type { ShowV2MigrationQualification } from './showV2Migration'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { SOURCE_STOCK_MAPS } from '@/pixelblaze/stock/maps/stockCatalogue'

export interface ShowV2MigrationAssets {
  patterns: readonly PatternRecord[]
  maps: readonly MapRecord[]
  libraries: readonly LibraryRecord[]
}

export interface ShowV2MigrationQualificationOptions {
  /** Stamped into the portable bytes so the round trip is deterministic. */
  appVersion?: string
  exportedAt?: string
}

/**
 * Reopen and compile one migrated record.
 *
 * Reopen is the real portable round trip: build the `.pxlshow` bundle from the
 * stored record and the owner's assets, serialize it, parse it back with v2
 * accepted, require version 2, and resolve its dependencies through the
 * ordinary v2 import planner. Compile is the real preparation and compiler
 * path, so a record whose Patterns no longer resolve or whose lowering the
 * compiler refuses is reported rather than silently accepted.
 */
export async function qualifyMigratedShowV2Record(
  record: ShowDocument,
  assets: ShowV2MigrationAssets,
  options: ShowV2MigrationQualificationOptions = {},
): Promise<ShowV2MigrationQualification> {
  if (!isShowRecordV2(record)) {
    return { status: 'refused', detail: 'The stored record is not a version-2 Show.' }
  }
  const appVersion = options.appVersion ?? 'show-v2-migrate'
  try {
    const built = buildShowFileBundle(record, assets, {
      appVersion,
      ...(options.exportedAt ? { exportedAt: options.exportedAt } : {}),
    })
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(built.bundle), { acceptV2: true })
    if (reopened.version !== 2) {
      return { status: 'refused', detail: `The reopened Show file is version ${String(reopened.version)}, not 2.` }
    }
    if (JSON.stringify(reopened.show) !== JSON.stringify(record)) {
      return { status: 'refused', detail: 'The reopened Show file did not match the stored record.' }
    }
    let nextId = 0
    const imported = applyShowImportPlanV2(planShowImportV2(reopened, {
      ...assets,
      showNames: [record.name],
    }, { createId: () => `show-v2-migrate-${nextId++}`, now: record.updatedAt + 1 })).show
    if (imported.composition.clips.length !== record.composition.clips.length) {
      return { status: 'refused', detail: 'Reimporting the Show file did not preserve its Clips.' }
    }
  } catch (error) {
    return { status: 'refused', detail: `Reopen failed: ${message(error)}` }
  }

  try {
    const libraries = compileLibraries(LIBRARIES, assets.libraries)
    const prepared = prepareShowV2ForCompile(record, sourceLookup(record, assets.patterns, assets.maps), { libraries })
    if (prepared.status !== 'ready') {
      const first = prepared.issues[0]
      return { status: 'refused', detail: `Compile preparation refused: ${first ? `${first.path}: ${first.message}` : 'no reason reported'}` }
    }
    const artifact = compileShow(prepared.recipe, libraries)
    return { status: 'qualified', compiled: { hash: artifactHash(artifact.code), codeBytes: artifact.code.length } }
  } catch (error) {
    return { status: 'refused', detail: `Compile failed: ${message(error)}` }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The Stage dimension a Show actually compiles at (#1039).
 *
 * A 3D Stage lowers differently from a 2D one, so qualifying every migrated row
 * at 2 would compile a 3D Show against geometry the editor never uses and
 * report a pass nothing reproduces. The resolution is the editor's own: the
 * record's Stage map, looked up among the built-in maps and then the owner's,
 * with 2 for a Show that names no Stage map or names one that is gone.
 */
export function resolveShowStageDimensionV2(
  stageMapId: string | null | undefined,
  maps: readonly MapRecord[],
): 2 | 3 {
  if (!stageMapId) return 2
  const stock = SOURCE_STOCK_MAPS.find(map => map.id === stageMapId)
  if (stock) return stock.dim === 3 ? 3 : 2
  return maps.find(map => map.id === stageMapId)?.dim === 3 ? 3 : 2
}

function sourceLookup(record: ShowRecordV2, patterns: readonly PatternRecord[], maps: readonly MapRecord[]) {
  const instances = [
    ...record.composition.patternInstances,
    ...record.composition.groupDefinitions.flatMap(definition => definition.patternInstances),
  ]
  const byPatternInstanceId = Object.fromEntries(instances.flatMap(instance => {
    const source = exactPatternSource(instance.pattern, patterns)
    return source === undefined ? [] : [[instance.id, source]]
  }))
  return { byCellId: {}, byPatternInstanceId, stageDimension: resolveShowStageDimensionV2(record.stageMapId, maps) }
}

/**
 * The source lookup a version-1 Show converts against, resolved exactly as the
 * operator migration resolves a stored row (#1042): every flat Cell and
 * composition Pattern instance by its exact source, and the Stage dimension
 * from the Show's own Stage map. An unresolvable reference contributes nothing,
 * so conversion refuses by name instead of converting against a guess.
 */
export function showV1ConversionSources(
  show: ShowRecord,
  patterns: readonly PatternRecord[],
  maps: readonly MapRecord[],
): ShowCompileRecipeSourceLookup {
  const instances = [
    ...(show.composition?.patternInstances ?? []),
    ...(show.composition?.groupDefinitions ?? []).flatMap(definition => definition.patternInstances),
  ]
  return {
    byCellId: Object.fromEntries(show.cells.flatMap(cell => {
      const source = exactPatternSource(cell.pattern, patterns)
      return source === undefined ? [] : [[cell.id, source]]
    })),
    byPatternInstanceId: Object.fromEntries(instances.flatMap(instance => {
      const source = exactPatternSource(instance.pattern, patterns)
      return source === undefined ? [] : [[instance.id, source]]
    })),
    stageDimension: resolveShowStageDimensionV2(show.stageMapId, maps),
  }
}

function exactPatternSource(reference: ShowPatternRef, patterns: readonly PatternRecord[]): string | undefined {
  if (reference.kind === 'stock') {
    const id = resolveStockPatternId(reference.id)
    return Object.prototype.hasOwnProperty.call(DEMOS, id) ? DEMOS[id] : undefined
  }
  return patterns.find(pattern => pattern.id === reference.id)?.src
}
