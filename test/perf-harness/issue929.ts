// #929 paired fixtures: generated wrapper inlining on versus off, measured
// at 256 and 500 px (#555 convention, master 2,000 px).
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'
import { installationPhysicalZones } from '../../src/engine/showInstallationCoverage'
import { showRecordToCompileRecipe } from '../../src/engine/showModel'
import { sourceForShowCell, sourceForShowPatternRef } from '../../src/engine/showPreviewArtifact'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'
import { acceptanceRecipe } from './issue520'
import { effectTaxRecipe, hsvSteadyStateRecipe } from './issue555'

export const ISSUE929_PIXEL_COUNTS = [256, 500] as const

export interface Issue929Fixture {
  id: string
  off: GeneratedShowArtifact
  on: GeneratedShowArtifact
  byteIdentical: boolean
}

function stockRecipe(id: string, routing: 'index' | 'coordinate'): ShowRecipe {
  const item = STOCK_SHOWS.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`Stock Show ${id} is missing.`)
  return showRecordToCompileRecipe(item.show, {
    byCellId: Object.fromEntries(item.show.cells.map((cell) => [cell.id, sourceForShowCell(cell, [])])),
    byPatternInstanceId: Object.fromEntries((item.show.composition?.patternInstances ?? []).map((instance) => [instance.id, sourceForShowPatternRef(instance.pattern, [])])),
    ...(routing === 'index' ? { controllerZones: installationPhysicalZones(item.show) } : {}),
    stageDimension: 2,
  })
}

function pair(id: string, recipe: ShowRecipe): Issue929Fixture {
  const off = compileShow(recipe, LIBRARIES, { generatedWrapperInlining: false })
  const on = compileShow(recipe, LIBRARIES, { generatedWrapperInlining: true })
  return { id, off, on, byteIdentical: off.code === on.code }
}

let cached: Issue929Fixture[] | null = null
export function issue929Fixtures(): Issue929Fixture[] {
  if (cached) return cached
  cached = [
    pair('hsv-steady-light', hsvSteadyStateRecipe()),
    pair('effect-tax', effectTaxRecipe()),
    pair('redline-reference', stockRecipe('stock-show-showcase-redline-installation', 'index')),
    pair('portable-zones', stockRecipe('stock-show-105-portable-zones', 'coordinate')),
    pair('five-pattern-acceptance', acceptanceRecipe('snapshot-live')),
  ]
  return cached
}
