// #928 paired fixtures: the generated frame-constant hoist on versus off.
// Artifacts compile at master 2,000 px and are measured at 256 and 500
// physical pixels (#555 convention). Fixtures without a hoisted site must
// compile byte-identically with the pass on and off; the runner skips their
// hardware pair and records `byte-identical`.
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { acceptanceRecipe } from './issue520'
import { hsvSteadyStateRecipe } from './issue555'
import { stockShowV2Recipe } from './showV2Fixture'

export const ISSUE928_PIXEL_COUNTS = [256, 500] as const

export interface Issue928Fixture {
  id: string
  off: GeneratedShowArtifact
  on: GeneratedShowArtifact
  byteIdentical: boolean
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
    pair('portable-zones', stockShowV2Recipe('stock-show-105-portable-zones')),
    pair('aperture-shapes', stockShowV2Recipe('stock-show-reference-aperture-shapes')),
    pair('zone-layouts-stripes-grid', stockShowV2Recipe('stock-show-showcase-zone-layouts-stripes-grid')),
    // Index-routed controls: expected byte-identical (literal zone sizes).
    pair('redline-reference', stockShowV2Recipe('stock-show-showcase-redline-installation')),
    pair('five-pattern-acceptance', acceptanceRecipe('snapshot-live')),
    pair('hsv-steady-light', hsvSteadyStateRecipe()),
  ]
  return cached
}
