// #557 stock-catalogue neutrality sweep: with direct color sinks on by
// default, every stock Show without a direct-eligible member must compile
// byte-for-byte identically to a directColorSinks:false build, and the set of
// Shows that do change is pinned here so a reviewer sees exactly which
// artifacts moved and why.
import { installationPhysicalZones } from './showInstallationCoverage'
import { compileShow, type ShowRecipe } from './showCompiler'
import { showRecordToCompileRecipe } from './showModel'
import { sourceForShowCell, sourceForShowPatternRef } from './showPreviewArtifact'
import { projectShowGroupRuntimePatternInstances } from './showGroupModel'
import { LIBRARIES } from '../pixelblaze/libs'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'

function stockRecipe(stock: (typeof STOCK_SHOWS)[number]): ShowRecipe {
  return showRecordToCompileRecipe(stock.show, {
    byCellId: Object.fromEntries(stock.show.cells.map((cell) => [
      cell.id,
      sourceForShowCell(cell, []),
    ])),
    // Group occurrences materialize occurrence-local runtime instances (205
    // Groups and Linked Reuse), so the lookup mirrors the production artifact
    // path and includes them alongside the authored instances.
    byPatternInstanceId: Object.fromEntries([
      ...(stock.show.composition?.patternInstances ?? []),
      ...(stock.show.composition ? projectShowGroupRuntimePatternInstances(stock.show.composition) : []),
    ].map((instance) => [
      instance.id,
      sourceForShowPatternRef(instance.pattern, []),
    ])),
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
    // Reviewed expectation: no current stock Show carries a direct-eligible
    // (member, scene) pair. The old sunflower 302 was the one exemplar; its
    // Redline rebuild (#706) attaches per-satellite Effects to the shared
    // MetaballGarden member, which disqualifies the pair on purpose - the
    // Effect voices are the lesson. The specialization keeps its own
    // mechanism coverage in showDirectColorSinks.test.ts, the whole
    // catalogue stays byte-for-byte neutral, and new stock content that
    // lands here must be reviewed the same way as #363's original pass.
    expect(eligible).toEqual([])
  })
})
