import { expect, vi } from 'vitest'
import { useShowStore } from '@/store/showStore'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { validateShowRecordV2, type ShowRecordV2 } from '@/engine/showCompositionV2'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import type { ShowRecord } from '@/engine/personalContentRecords'

/**
 * The shared v2 Show editor harness (#1042). Component tests open the editor on
 * a v2 pilot row with `openV2EditorForRecord`, then render
 * `<ShowEditor showId={editor.showId} recordVersion={2} />`.
 */

export interface EditorState {
  record: ShowRecordV2
  history: { past: ShowRecordV2[]; future: ShowRecordV2[] }
  revision: number
  v2Writes: number
  legacyWrites: number
  legacyShows: readonly ShowRecord[]
  legacyHistories: Record<string, unknown>
}

export interface OpenV2Editor {
  readonly showId: string
  state(): EditorState
}

/**
 * Opens one v2 pilot on a provider that records both persistence doors. The
 * legacy door is spied separately from the v2 door so an unconnected write that
 * silently reaches a legacy owner is a failure, not an invisible no-op.
 */
export function openV2EditorForRecord(record: ShowRecordV2): OpenV2Editor {
  const v2Writes = vi.fn(async (_id: string, _next: ShowRecordV2) => {})
  const legacyWrites = vi.fn(async () => {})
  setPersonalContentProvider({
    id: 'tracer-guard-provider',
    listPatterns: async () => [],
    listMaps: async () => [],
    listMixins: async () => [],
    listShows: async () => [],
    listControllerProfiles: async () => [],
    createShow: legacyWrites,
    updateShow: legacyWrites,
    deleteShow: legacyWrites,
    replaceShowV2: v2Writes,
    getLastActive: async () => undefined,
    setLastActive: async () => {},
  } as unknown as PersonalContentProvider)
  useShowStore.setState({
    shows: [],
    showsLoaded: true,
    activeShowId: null,
    showV2Pilots: { [record.id]: record },
    showV2Histories: { [record.id]: { past: [], future: [] } },
    showRevisions: { [record.id]: 0 },
  })
  return {
    showId: record.id,
    state: () => {
      const store = useShowStore.getState()
      return {
        record: store.showV2Pilots[record.id],
        history: store.showV2Histories[record.id],
        revision: store.showRevisions[record.id] ?? 0,
        v2Writes: v2Writes.mock.calls.length,
        legacyWrites: legacyWrites.mock.calls.length,
        legacyShows: store.shows,
        legacyHistories: store.showHistories,
      }
    },
  }
}

/**
 * The real converter on a v1 test Show, with the exact Pattern source each
 * flat cell needs. Stock Patterns resolve through `DEMOS`; personal Patterns
 * resolve through `personalSources`, keyed by Pattern id. A refusal throws, and
 * the converted record must pass the domain validator.
 */
export function convertForTest(
  source: ShowRecord,
  personalSources: Readonly<Record<string, string>> = {},
): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(source, {
    byCellId: Object.fromEntries(source.cells.map((cell) => {
      const patternSource = cell.pattern.kind === 'stock'
        ? DEMOS[resolveStockPatternId(cell.pattern.id)]
        : personalSources[cell.pattern.id]
      if (patternSource === undefined) throw new Error(`${source.id}: missing ${cell.pattern.kind} source ${cell.pattern.id}`)
      return [cell.id, patternSource]
    })),
  })
  if (result.status !== 'converted') throw new Error(`${source.id} refused: ${JSON.stringify(result.issues)}`)
  expect(validateShowRecordV2(result.record), `${source.id} converted`).toEqual([])
  return result.record
}
