import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { stockShowCatalogueById } from '@/pixelblaze/stock/showCatalogueV2'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { showLessonAuthoredSlotPatternV2 } from './showLessonNarration'

describe('lesson authored slot pattern (#1066 11c2a)', () => {
  it('shows the selected Pattern declared first by the blend and fade reference guide (#1110)', () => {
    const entry = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-blend-fade-transitions')!
    const record = stockShowV2ById(entry.id)!
    const referenceV2 = stockShowCatalogueById(entry.id)?.reference
    expect(showLessonAuthoredSlotPatternV2(record, referenceV2!.patternSlots!)).toEqual({
      kind: 'stock', id: 'MetaballGarden',
    })
  })
})
