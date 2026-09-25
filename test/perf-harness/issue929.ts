// #929 paired fixtures: generated wrapper inlining on versus off, measured
// at 256 and 500 px (#555 convention, master 2,000 px).
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { acceptanceRecipe } from './issue520'
import { effectTaxRecipe, hsvSteadyStateRecipe } from './issue555'
import { stockShowV2Recipe } from './showV2Fixture'

export const ISSUE929_PIXEL_COUNTS = [256, 500] as const

export interface Issue929Fixture {
  id: string
  off: GeneratedShowArtifact
  on: GeneratedShowArtifact
  byteIdentical: boolean
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
    pair('redline-reference', stockShowV2Recipe('stock-show-showcase-redline-installation')),
    pair('portable-zones', stockShowV2Recipe('stock-show-105-portable-zones')),
    pair('five-pattern-acceptance', acceptanceRecipe('snapshot-live')),
  ]
  return cached
}
