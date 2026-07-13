import type { ControllerZone } from './controllerProfile'
import { installationCoverageBlockingMessage, validateInstallationCoverage } from './showInstallationCoverage'
import { portableCompatibilityBlockingMessage, validatePortableShowCompatibility } from './showPortableCompatibility'
import type { PatternRecord, ShowCell, ShowRecord } from './personalContentRecords'
import { compileShow, type GeneratedShowArtifact } from './showCompiler'
import { showRecordToCompileRecipe } from './showModel'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'

export interface CompiledShowState {
  artifact: GeneratedShowArtifact | null
  error: string | null
}

export function compileShowForPreview(
  show: ShowRecord,
  userPatterns: PatternRecord[],
  controllerZones: ControllerZone[] | undefined,
  libraries: Record<string, string>,
  options: { stageDimension?: 1 | 2 | 3 } = {},
): CompiledShowState {
  try {
    const byCellId = Object.fromEntries(
      show.cells.map((cell) => [cell.id, sourceForShowCell(cell, userPatterns)]),
    )
    const recipe = showRecordToCompileRecipe(show, {
      byCellId,
      controllerZones,
      stageDimension: options.stageDimension,
    })
    return { artifact: compileShow(recipe, { ...LIBRARIES, ...libraries }), error: null }
  } catch (error) {
    return { artifact: null, error: error instanceof Error ? error.message : 'Show compile failed' }
  }
}

export function compileShowForArtifact(
  show: ShowRecord,
  userPatterns: PatternRecord[],
  controllerZones: ControllerZone[] | undefined,
  libraries: Record<string, string>,
  options: { stageDimension?: 1 | 2 | 3 } = {},
): CompiledShowState {
  const coverageError = installationCoverageBlockingMessage(validateInstallationCoverage(show))
  if (coverageError) return { artifact: null, error: coverageError }
  const portableError = portableCompatibilityBlockingMessage(validatePortableShowCompatibility(
    show,
    show.cells.map((cell) => ({
      cellId: cell.id,
      patternName: cell.patternName,
      source: sourceForShowCell(cell, userPatterns),
    })),
    options.stageDimension,
  ))
  return portableError
    ? { artifact: null, error: portableError }
    : compileShowForPreview(show, userPatterns, controllerZones, libraries, options)
}

export function sourceForShowCell(cell: ShowCell, userPatterns: PatternRecord[]): string {
  if (cell.pattern.kind === 'stock') return DEMOS[cell.pattern.id] ?? DEMOS.TestPattern1D
  return userPatterns.find((pattern) => pattern.id === cell.pattern.id)?.src ?? DEMOS.TestPattern1D
}
