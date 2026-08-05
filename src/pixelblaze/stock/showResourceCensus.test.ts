// #716: whole-catalogue resource census. One row per stock Show covering both
// budget axes — VM words (ledger categories) and artifact bytes (inventory
// categories plus the bytecode-axis estimate) — printed as a stable TSV and
// optionally written as JSON to SHOW_CENSUS_OUT. Run via `npm run census`.
// Doubles as the regression guard that every stock Show stays artifact-clean.
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileShowForArtifact } from '@/engine/showPreviewArtifact'
import { STOCK_SHOWS } from './shows'

interface CensusRow {
  id: string
  track: string
  collection: string
  pixelCount: number
  renderTargetWords: number
  memberPatternWords: number
  routingWords: number
  planWords: number
  auxiliaryCacheWords: number
  totalWords: number
  remainingWords: number
  artifactBytes: number
  /** Bytecode-axis estimate (#715 pricing); equals artifactBytes when no
   * repriced data construct appears in the delivered source. */
  estimatedBytecodeBytes: number
  budgetPercent: number
  byteCategories: Record<string, number>
  planSceneBytes: Record<string, number>
}

function buildCensus(): CensusRow[] {
  return STOCK_SHOWS.map((item) => {
    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error, item.id).toBeNull()
    expect(compiled.artifactBlocker ?? null, item.id).toBeNull()
    const summary = compiled.artifact!.summary
    const resources = summary.resources
    expect(resources.blockers, item.id).toEqual([])
    const byteCategories: Record<string, number> = {}
    const planSceneBytes: Record<string, number> = {}
    for (const chunk of summary.sourceInventory.chunks) {
      byteCategories[chunk.category] = (byteCategories[chunk.category] ?? 0) + chunk.bytes
      if (chunk.category === 'routing-render-plans' && chunk.ownerId) {
        planSceneBytes[chunk.ownerId] = (planSceneBytes[chunk.ownerId] ?? 0) + chunk.bytes
      }
    }
    return {
      id: item.id,
      track: item.track,
      collection: item.collection,
      pixelCount: resources.pixelCount,
      renderTargetWords: resources.renderTargetWords,
      memberPatternWords: resources.memberPatternWords,
      routingWords: resources.routingWords,
      planWords: resources.planWords,
      auxiliaryCacheWords: resources.auxiliaryCacheWords,
      totalWords: resources.totalWords,
      remainingWords: resources.remainingWords,
      artifactBytes: resources.artifactBytes,
      estimatedBytecodeBytes: resources.estimatedArtifactBytecodeBytes,
      budgetPercent: +(100 * resources.artifactBytes / resources.artifactByteBudget).toFixed(1),
      byteCategories,
      planSceneBytes,
    }
  })
}

describe('stock Show resource census (#716)', () => {
  it('keeps every stock Show artifact-clean on both budget axes and reports the census', () => {
    const rows = buildCensus()
    expect(rows).toHaveLength(STOCK_SHOWS.length)
    const columns = [
      'id', 'track', 'pixelCount', 'renderTargetWords', 'memberPatternWords', 'routingWords',
      'planWords', 'auxiliaryCacheWords', 'totalWords', 'remainingWords',
      'artifactBytes', 'estimatedBytecodeBytes', 'budgetPercent',
    ] as const
    const lines = [columns.join('\t')]
    for (const row of rows) {
      lines.push(columns.map((column) => String(row[column as keyof CensusRow] ?? '')).join('\t'))
    }
    lines.push('')
    lines.push('per-scene routing-render-plans bytes')
    for (const row of rows) {
      const scenes = Object.entries(row.planSceneBytes).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      if (scenes.length > 0) {
        lines.push(`${row.id}\t${scenes.map(([scene, bytes]) => `${scene}:${bytes}`).join(' ')}`)
      }
    }
    console.log(lines.join('\n'))
    if (process.env.SHOW_CENSUS_OUT) {
      writeFileSync(process.env.SHOW_CENSUS_OUT, `${JSON.stringify(rows, null, 2)}\n`)
    }
    // Compiling all 37 shows takes ~2.5 s alone and can exceed the 5 s
    // default under full-suite worker contention.
  }, 30_000)
})
