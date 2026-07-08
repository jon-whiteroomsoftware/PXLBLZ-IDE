import type { ControllerZone } from './controllerProfile'
import type { PatternRecord, ShowCell, ShowRecord } from './personalContentRecords'
import { compileShow, type GeneratedShowArtifact } from './showCompiler'
import { showRecordToCompileRecipe } from './showModel'
import { DEMOS } from '@/pixelblaze/stock/patterns'

export interface CompiledShowState {
  artifact: GeneratedShowArtifact | null
  error: string | null
}

export function compileShowForPreview(
  show: ShowRecord,
  userPatterns: PatternRecord[],
  controllerZones: ControllerZone[] | undefined,
  libraries: Record<string, string>,
): CompiledShowState {
  try {
    const byCellId = Object.fromEntries(
      show.cells.map((cell) => [cell.id, sourceForShowCell(cell, userPatterns)]),
    )
    const recipe = showRecordToCompileRecipe(show, { byCellId, controllerZones })
    return { artifact: compileShow(recipe, libraries), error: null }
  } catch (error) {
    return { artifact: null, error: error instanceof Error ? error.message : 'Show compile failed' }
  }
}

export function sourceForShowCell(cell: ShowCell, userPatterns: PatternRecord[]): string {
  if (cell.pattern.kind === 'stock') return DEMOS[cell.pattern.id] ?? DEMOS.TestPattern1D
  return userPatterns.find((pattern) => pattern.id === cell.pattern.id)?.src ?? DEMOS.TestPattern1D
}
