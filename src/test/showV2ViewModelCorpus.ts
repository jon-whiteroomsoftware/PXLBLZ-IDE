import { BASELINE_FIXTURES, resolveBaselineFixtureRecord, type BaselineFixture } from '../agent-harness/baseline/fixtures'
import { stockMapSpec } from '../engine/maps'
import type { PatternRecord, ShowCompositionV1, ShowPatternRef, ShowRecord } from '../engine/personalContentRecords'
import { projectFlatShowToCompositionV1WithCellOrigins } from '../engine/showCompositionModel'
import { projectShowGroupRuntimePatternInstances } from '../engine/showGroupModel'
import type { ShowCompileRecipeSourceLookup } from '../engine/showModel'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { STOCK_SHOWS, stockShowById } from '../pixelblaze/stock/shows'

export interface ShowV2CorpusEntry {
  corpus: 'stock' | 'agent-baseline'
  corpusId: string
  show: ShowRecord
  lookup: ShowCompileRecipeSourceLookup
  /** Personal Pattern records a baseline fixture depends on; stock Shows need none. */
  patterns: PatternRecord[]
  /**
   * The composition the Show editor resolves for the timeline: the persisted
   * sidecar, or the flat projection the route builds when none exists.
   */
  editorComposition: ShowCompositionV1 | null
}

/**
 * The pinned 47-record conversion corpus: forty stock Shows and seven agent
 * baseline fixtures, built exactly as `scripts/show-v2-parity.ts` builds it.
 */
export function showV2ViewModelCorpus(): ShowV2CorpusEntry[] {
  const entries: ShowV2CorpusEntry[] = [
    ...STOCK_SHOWS.map((item) => buildEntry('stock', item.id, structuredClone(item.show))),
    ...BASELINE_FIXTURES.map((fixture) => buildEntry(
      'agent-baseline',
      fixture.id,
      resolveBaselineFixtureRecord(fixture, (id) => stockShowById(id)?.show),
      fixture,
    )),
  ]
  if (STOCK_SHOWS.length !== 40 || BASELINE_FIXTURES.length !== 7) {
    throw new Error('The pinned corpus census changed; review the inventory before updating expected counts.')
  }
  return entries
}

function buildEntry(
  corpus: ShowV2CorpusEntry['corpus'],
  corpusId: string,
  show: ShowRecord,
  fixture?: BaselineFixture,
): ShowV2CorpusEntry {
  const lookup = sourceLookup(show, fixture)
  return {
    corpus,
    corpusId,
    show,
    lookup,
    patterns: fixture?.patterns ?? [],
    editorComposition: show.composition ?? projectFlatShowToCompositionV1WithCellOrigins(show, {
      byCellId: lookup.byCellId,
      stageDimension: lookup.stageDimension,
    }).composition,
  }
}

function sourceLookup(show: ShowRecord, fixture?: BaselineFixture): ShowCompileRecipeSourceLookup {
  const patterns = new Map((fixture?.patterns ?? []).map((pattern) => [pattern.id, pattern]))
  const source = (ref: ShowPatternRef) => {
    const found = patternSource(ref, patterns)
    if (!found) throw new Error(`Missing exact Pattern source ${ref.kind}:${ref.id}.`)
    return found.source
  }
  return {
    byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source(cell.pattern)])),
    byPatternInstanceId: Object.fromEntries([
      ...(show.composition?.patternInstances ?? []),
      ...(show.composition?.groupDefinitions ?? []).flatMap((group) => group.patternInstances),
      ...(show.composition ? projectShowGroupRuntimePatternInstances(show.composition) : []),
    ].map((instance) => [instance.id, source(instance.pattern)])),
    stageDimension: outputDimension(show),
  }
}

function patternSource(
  ref: ShowPatternRef,
  patterns: Map<string, PatternRecord>,
): { id: string; source: string } | undefined {
  if (ref.kind === 'stock') {
    const id = resolveStockPatternId(ref.id)
    return Object.prototype.hasOwnProperty.call(DEMOS, id) ? { id, source: DEMOS[id] } : undefined
  }
  const record = patterns.get(ref.id)
  return record ? { id: record.id, source: record.src } : undefined
}

function outputDimension(show: ShowRecord): 1 | 2 | 3 {
  if (show.outputContract.kind === 'portable-2d') return 2
  return (show.stageMapId ? stockMapSpec(show.stageMapId) : undefined)?.dim ?? 2
}
