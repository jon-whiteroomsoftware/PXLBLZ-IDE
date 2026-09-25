// Compile a native v2 stock Show exactly as the v2 Stage does (#1042), so
// perf harnesses measure the product compile without the retired v1 catalogue.
import type { GeneratedShowArtifact, ShowCompileOptions, ShowRecipe } from '../../src/engine/showCompiler'
import { prepareShowV2ForCompile } from '../../src/engine/showCompositionLoweringV2'
import { compileShowRecipeCached } from '../../src/engine/showPreviewArtifact'
import { stockShowV2ById } from '../../src/pixelblaze/stock/showsV2'
import { nativeStockSourceLookupV2 } from '../../src/pixelblaze/stock/showsV2Compile'

export function stockShowV2Recipe(id: string): ShowRecipe {
  const record = stockShowV2ById(id)
  if (!record) throw new Error(`Stock v2 Show "${id}" is missing.`)
  const prepared = prepareShowV2ForCompile(record, nativeStockSourceLookupV2(record), { libraries: {} })
  if (prepared.status !== 'ready') {
    throw new Error(`Stock v2 Show "${id}" did not prepare: ${prepared.issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`)
  }
  return prepared.recipe
}

/** The Stage dimension comes from the record; callers never pass one. */
export function compileStockShowV2(id: string, options: ShowCompileOptions): GeneratedShowArtifact {
  return compileShowRecipeCached(stockShowV2Recipe(id), {}, options)
}
