// #928 paired fixtures: the generated frame-constant hoist on versus off.
// Artifacts compile at master 2,000 px and are measured at 256 and 500
// physical pixels (#555 convention). Fixtures without a hoisted site must
// compile byte-identically with the pass on and off; the runner skips their
// hardware pair and records `byte-identical`.
import { installationPhysicalZones } from '../../src/engine/showInstallationCoverage'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'
import { showRecordToCompileRecipe } from '../../src/engine/showModel'
import { sourceForShowCell, sourceForShowPatternRef } from '../../src/engine/showPreviewArtifact'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'
import { acceptanceRecipe } from './issue520'
import { hsvSteadyStateRecipe } from './issue555'

export const ISSUE928_PIXEL_COUNTS = [256, 500] as const

export interface Issue928Fixture {
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
    byPatternInstanceId: Object.fromEntries(
      (item.show.composition?.patternInstances ?? []).map((instance) => [
        instance.id,
        sourceForShowPatternRef(instance.pattern, []),
      ]),
    ),
    ...(routing === 'index' ? { controllerZones: installationPhysicalZones(item.show) } : {}),
    stageDimension: 2,
  })
}

function pair(id: string, recipe: ShowRecipe): Issue928Fixture {
  const off = compileShow(recipe, LIBRARIES, { generatedFrameConstantHoisting: false })
  const on = compileShow(recipe, LIBRARIES, { generatedFrameConstantHoisting: true })
  return { id, off, on, byteIdentical: off.code === on.code }
}

let cached: Issue928Fixture[] | null = null
export function issue928Fixtures(): Issue928Fixture[] {
  if (cached) return cached
  cached = [
    pair('portable-zones', stockRecipe('stock-show-105-portable-zones', 'coordinate')),
    pair('aperture-shapes', stockRecipe('stock-show-reference-aperture-shapes', 'coordinate')),
    pair('zone-layouts-stripes-grid', stockRecipe('stock-show-showcase-zone-layouts-stripes-grid', 'coordinate')),
    // Index-routed controls: expected byte-identical (literal zone sizes).
    pair('redline-reference', stockRecipe('stock-show-showcase-redline-installation', 'index')),
    pair('five-pattern-acceptance', acceptanceRecipe('snapshot-live')),
    pair('hsv-steady-light', hsvSteadyStateRecipe()),
  ]
  return cached
}
