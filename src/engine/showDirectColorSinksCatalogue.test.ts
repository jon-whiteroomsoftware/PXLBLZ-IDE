// #557 stock-catalogue neutrality sweep: with direct color sinks on by
// default, every stock Show without a direct-eligible member must compile
// byte-for-byte identically to a directColorSinks:false build, and the set of
// Shows that do change is pinned here so a reviewer sees exactly which
// artifacts moved and why.
import { installationPhysicalZones } from './showInstallationCoverage'
import { compileShow, type ShowRecipe } from './showCompiler'
import { showRecordToCompileRecipe } from './showModel'
import { sourceForShowCell, sourceForShowPatternRef } from './showPreviewArtifact'
import { LIBRARIES } from '../pixelblaze/libs'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'

function stockRecipe(stock: (typeof STOCK_SHOWS)[number]): ShowRecipe {
  return showRecordToCompileRecipe(stock.show, {
    byCellId: Object.fromEntries(stock.show.cells.map((cell) => [
      cell.id,
      sourceForShowCell(cell, []),
    ])),
    byPatternInstanceId: Object.fromEntries(
      (stock.show.composition?.patternInstances ?? []).map((instance) => [
        instance.id,
        sourceForShowPatternRef(instance.pattern, []),
      ]),
    ),
    controllerZones: installationPhysicalZones(stock.show),
    stageDimension: 2,
  })
}

describe('direct color sinks across the stock Show catalogue (#557)', () => {
  // Compiles the entire stock catalogue twice; runtime scales with catalogue
  // size and casting, so it gets an explicit generous timeout.
  it('keeps every ineligible stock Show byte-for-byte unchanged and pins the eligible set', { timeout: 30_000 }, () => {
    const eligible: string[] = []
    for (const stock of STOCK_SHOWS) {
      const recipe = stockRecipe(stock)
      const withSinks = compileShow(recipe, LIBRARIES)
      const withoutSinks = compileShow(recipe, LIBRARIES, { directColorSinks: false })
      const members = withSinks.summary.specializations.directColorSinks?.members ?? []
      if (members.length === 0) {
        expect(withSinks.expandedCode, stock.id).toBe(withoutSinks.expandedCode)
        expect(withSinks.code, stock.id).toBe(withoutSinks.code)
      } else {
        eligible.push(stock.id)
      }
    }
    // Reviewed expectation: no bundled stock Show currently has a
    // direct-eligible (member, scene) pair - they all compose, share Pattern
    // slots, or carry Effects. New stock content that lands here must be
    // reviewed for the named Precise-mode approximation before being added.
    expect(eligible).toEqual([])
  })
})
