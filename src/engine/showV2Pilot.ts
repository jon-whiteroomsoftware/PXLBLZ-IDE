import { compileLibraries } from './libraries'
import type { LibraryRecord, MapRecord, PatternRecord, ShowRecord } from './personalContentRecords'
import { sourceForShowPatternRef } from './showPreviewArtifact'
import { prepareShowV2ForCompile, lowerShowCompositionV2ForCompile } from './showCompositionLoweringV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { compileShow } from './showCompiler'
import { buildShowEpeExport } from './showEpeExport'
import { parseEpe } from './epeImport'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import { applyShowImportPlanV2, planShowImportV2 } from './showImportPlanV2'
import { LIBRARIES } from '@/pixelblaze/libs'

export interface ShowV2PilotAssets {
  patterns: readonly PatternRecord[]
  maps: readonly MapRecord[]
  libraries: readonly LibraryRecord[]
}

export interface ShowV2PilotArtifacts {
  previewShow: ShowRecord
  importedShow: ShowRecordV2
  pxlshowBytes: Uint8Array
  epeText: string
  epeSource: string
}

export function lowerShowV2PilotPreview(record: ShowRecordV2, patterns: readonly PatternRecord[]): ShowRecord {
  return lowerShowCompositionV2ForCompile(record, sourceLookup(record, patterns)).show
}

export async function qualifyShowV2PilotArtifacts(
  record: ShowRecordV2,
  assets: ShowV2PilotAssets,
  options: { appVersion: string; exportedAt?: string } = { appVersion: 'v2-route-pilot' },
): Promise<ShowV2PilotArtifacts> {
  const lookup = sourceLookup(record, assets.patterns)
  const prepared = prepareShowV2ForCompile(record, lookup)
  if (prepared.status !== 'ready') throw new Error(prepared.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '))
  const libraries = compileLibraries(LIBRARIES, assets.libraries)
  const artifact = compileShow(prepared.recipe, libraries)
  const previewShow = lowerShowCompositionV2ForCompile(record, lookup).show
  const epe = buildShowEpeExport(previewShow, artifact.code, { stampedAt: options.exportedAt })
  const reopenedEpe = parseEpe(epe.text)
  if (!reopenedEpe.src.includes(artifact.code)) throw new Error('The reopened .epe did not contain the compiled Show.')

  const file = buildShowFileBundle(record, assets, options)
  const pxlshowBytes = await serializeShowFileBundle(file.bundle)
  const reopened = await parseShowFileBundle(pxlshowBytes, { acceptV2: true })
  if (reopened.version !== 2) throw new Error('The reopened Show file was not version 2.')
  let nextId = 0
  const plan = planShowImportV2(reopened, {
    ...assets,
    showNames: [record.name],
  }, { createId: () => `v2-pilot-import-${nextId++}`, now: record.updatedAt + 1 })
  const importedShow = applyShowImportPlanV2(plan).show
  return { previewShow, importedShow, pxlshowBytes, epeText: epe.text, epeSource: reopenedEpe.src }
}

function sourceLookup(record: ShowRecordV2, patterns: readonly PatternRecord[]) {
  const instances = [
    ...record.composition.patternInstances,
    ...record.composition.groupDefinitions.flatMap(definition => definition.patternInstances),
  ]
  return {
    byCellId: {},
    byPatternInstanceId: Object.fromEntries(instances.map(instance => [
      instance.id,
      sourceForShowPatternRef(instance.pattern, [...patterns]),
    ])),
    stageDimension: 2 as const,
  }
}
