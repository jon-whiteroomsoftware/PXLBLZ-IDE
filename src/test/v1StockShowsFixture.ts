import type { ShowRecord } from '@/engine/personalContentRecords'
import type { ShowReferenceGuide } from '@/engine/showReferenceShow'
import type {
  StockShowCollection,
  StockShowNote,
  StockShowTrack,
} from '@/pixelblaze/stock/showCatalogueV2'
import fixture from './fixtures/v1StockShows.json'

// Historical v1 stock Show entries, frozen from the v1 builder before its
// deletion (#1042). v1 import and conversion tests read them as a corpus.
export interface V1StockShowFixtureEntry {
  id: string
  /** Earlier source IDs that may still identify compiled Controller artifacts. */
  legacySourceIds?: readonly string[]
  name: string
  track: StockShowTrack
  collection: StockShowCollection
  level: 100 | 200 | 300 | null
  order: number
  lesson: string
  description: string
  note: StockShowNote
  zonesOpenByDefault?: boolean
  patternSlots?: readonly { cellIds: readonly string[]; instanceIds: readonly string[] }[]
  reference?: ShowReferenceGuide
  show: ShowRecord
}

export const V1_STOCK_SHOWS: readonly V1StockShowFixtureEntry[] =
  fixture.entries as unknown as readonly V1StockShowFixtureEntry[]

export function v1StockShowById(id: string): V1StockShowFixtureEntry | undefined {
  return V1_STOCK_SHOWS.find((entry) => entry.id === id)
}
