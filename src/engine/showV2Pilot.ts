import { compileLibraries } from './libraries'
import type { LibraryRecord, MapRecord, PatternRecord, ShowPatternRef, ShowRecord } from './personalContentRecords'
import { prepareShowV2ForCompile, lowerShowCompositionV2ForCompile } from './showCompositionLoweringV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { compileShow } from './showCompiler'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import type { ShowPreparedStageBundleV2 } from './showPreparedStageV2'
import { parseEpe } from './epeImport'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import { applyShowImportPlanV2, planShowImportV2 } from './showImportPlanV2'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'

export interface ShowV2PilotAssets {
  patterns: readonly PatternRecord[]
  maps: readonly MapRecord[]
  libraries: readonly LibraryRecord[]
}

export interface ShowV2PilotArtifacts {
  importedShow: ShowRecordV2
  pxlshowBytes: Uint8Array
  epeText: string
  epeSource: string
}

export function lowerShowV2PilotPreview(record: ShowRecordV2, patterns: readonly PatternRecord[]): ShowRecord {
  return lowerShowCompositionV2ForCompile(record, sourceLookup(record, patterns)).show
}

export function compileShowV2PilotArtifact(record: ShowRecordV2, assets: ShowV2PilotAssets) {
  const lookup = sourceLookup(record, assets.patterns)
  const libraries = compileLibraries(LIBRARIES, assets.libraries)
  const prepared = prepareShowV2ForCompile(record, lookup, { libraries })
  if (prepared.status !== 'ready') throw new Error(prepared.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '))
  return compileShow(prepared.recipe, libraries)
}

export async function qualifyShowV2PilotArtifacts(
  captured: ShowPreparedStageBundleV2,
  options: { appVersion: string; exportedAt?: string } = { appVersion: 'v2-route-pilot' },
): Promise<ShowV2PilotArtifacts> {
  const { record, assets, artifact } = captured
  const capturedOptions = { ...options }
  // Construct authored bytes and native metadata from one capture before any await.
  const file = buildShowFileBundle(record, assets, capturedOptions)
  const epe = buildShowEpeExportV2(record, artifact.code, { userMaps: assets.maps, stampedAt: capturedOptions.exportedAt })
  if (epe.status === 'refused') throw new Error(epe.message)
  const reopenedEpe = parseEpe(epe.text)
  if (!reopenedEpe.src.includes(artifact.code)) throw new Error('The reopened .epe did not contain the compiled Show.')

  const pxlshowBytes = await serializeShowFileBundle(file.bundle)
  const reopened = await parseShowFileBundle(pxlshowBytes, { acceptV2: true })
  if (reopened.version !== 2) throw new Error('The reopened Show file was not version 2.')
  let nextId = 0
  const plan = planShowImportV2(reopened, {
    ...assets,
    showNames: [record.name],
  }, { createId: () => `v2-pilot-import-${nextId++}`, now: record.updatedAt + 1 })
  const importedShow = applyShowImportPlanV2(plan).show
  return { importedShow, pxlshowBytes, epeText: epe.text, epeSource: reopenedEpe.src }
}

function sourceLookup(record: ShowRecordV2, patterns: readonly PatternRecord[]) {
  const instances = [
    ...record.composition.patternInstances,
    ...record.composition.groupDefinitions.flatMap(definition => definition.patternInstances),
  ]
  const byPatternInstanceId = Object.fromEntries(instances.flatMap(instance => {
    const source = exactPatternSource(instance.pattern, patterns)
    return source === undefined ? [] : [[instance.id, source]]
  }))
  return {
    byCellId: {},
    byPatternInstanceId,
    stageDimension: 2 as const,
  }
}

function exactPatternSource(reference: ShowPatternRef, patterns: readonly PatternRecord[]): string | undefined {
  if (reference.kind === 'stock') {
    const id = resolveStockPatternId(reference.id)
    return Object.prototype.hasOwnProperty.call(DEMOS, id) ? DEMOS[id] : undefined
  }
  return patterns.find(pattern => pattern.id === reference.id)?.src
}
