import type { ShowPatternRef, ShowRecord } from '@/engine/personalContentRecords'
import { projectFlatShowToCompositionV1 } from '@/engine/showCompositionModel'

/** Private transport projection only. Callers retain the original Show as the
 * revision/Undo base and guard the metadata used here for the request lifetime. */
export function captureAgentShowSnapshot(show: ShowRecord, source: (ref: ShowPatternRef) => string | undefined, stageDimension: 1 | 2 | 3 = 2): ShowRecord | undefined {
  if (show.composition) return structuredClone(show)
  const sources: Array<[string, string]> = []
  for (const cell of show.cells) {
    const src = source(cell.pattern)
    if (src === undefined) return undefined
    sources.push([cell.id, src])
  }
  try {
    return structuredClone({ ...show, composition: { ...projectFlatShowToCompositionV1(show, { byCellId: Object.fromEntries(sources), stageDimension }), executionModel: 'deterministic-loop' } })
  } catch { return undefined }
}
