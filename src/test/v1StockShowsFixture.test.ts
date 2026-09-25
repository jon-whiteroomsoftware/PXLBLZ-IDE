import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { V1_STOCK_SHOWS } from './v1StockShowsFixture'

const BUILDER_UPDATED_AT = 364
// The builder stamps these entries' show.updatedAt with Date.now(); the
// fixture freezes them at the builder constant.
const CLOCK_STAMPED_IDS: ReadonlySet<string> = new Set([
  'stock-show-reference-blend-fade-transitions',
  'stock-show-reference-wipe-transitions',
  'stock-show-reference-dissolve-transitions',
  'stock-show-reference-shape-reveal-transitions',
  'stock-show-reference-shape-reveal-figures',
  'stock-show-reference-slide-transitions',
  'stock-show-reference-zoom-spin-transitions',
  'stock-show-reference-easing',
])

describe('v1 stock Show fixture', () => {
  it('matches the live v1 builder output', () => {
    const live = JSON.parse(JSON.stringify(STOCK_SHOWS)) as { id: string; show: { updatedAt: number } }[]
    for (const entry of live) {
      if (CLOCK_STAMPED_IDS.has(entry.id)) entry.show.updatedAt = BUILDER_UPDATED_AT
      else expect(entry.show.updatedAt, entry.id).toBe(BUILDER_UPDATED_AT)
    }
    expect(live.filter((entry) => CLOCK_STAMPED_IDS.has(entry.id))).toHaveLength(CLOCK_STAMPED_IDS.size)
    expect(V1_STOCK_SHOWS).toHaveLength(40)
    expect(V1_STOCK_SHOWS).toEqual(live)
  })
})
