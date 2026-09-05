// Provenance: pxlblz-v3 test/stockCatalogue.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import {
  extractHeaderDescription,
  getStockPattern,
  listStockPatterns,
} from '../shows/stockCatalogue.js'

describe('stock catalogue (#10)', () => {
  const listing = listStockPatterns()

  it('lists the full catalogue with dimensionality and clean descriptions', () => {
    expect(listing.length).toBeGreaterThan(50)
    expect(new Set(listing.map((entry) => entry.id)).size).toBe(listing.length)
    for (const entry of listing) {
      expect([1, 2, 3]).toContain(entry.dimensions)
      // Banner and rights boilerplate never leaks into listings.
      expect(entry.description).not.toMatch(/built with|https?:\/\/|license|redistributed/i)
    }
    // The catalogue is not silently description-free: most stock patterns
    // carry a descriptive header paragraph.
    const described = listing.filter((entry) => entry.description.length > 0)
    expect(described.length / listing.length).toBeGreaterThan(0.5)
  })

  it('covers every stock pattern the stock Shows reference', () => {
    const ids = new Set(listing.map((entry) => entry.id))
    for (const item of STOCK_SHOWS) {
      for (const cell of item.show.cells) {
        if (cell.pattern.kind === 'stock') {
          expect(ids.has(cell.pattern.id), `${item.name}: ${cell.pattern.id}`).toBe(true)
        }
      }
    }
  })

  it('fetches one pattern with source and render entry points', () => {
    const detail = getStockPattern(listing.find((entry) => entry.dimensions === 2)!.id)
    expect(detail.source.length).toBeGreaterThan(0)
    expect(detail.sourceBytes).toBe(detail.source.length)
    expect(detail.renderFns.hasRender2D).toBe(true)
  })

  it('rejects unknown ids with near matches and a remedy', () => {
    expect(() => getStockPattern('compassrose')).toThrowError(/Unknown stock pattern "compassrose"/)
    expect(() => getStockPattern('compassrose')).toThrowError(/CompassRose/)
    expect(() => getStockPattern('zzz-nope')).toThrowError(/list_stock_patterns/)
  })

  it('extracts the descriptive paragraph, not the banner or sections', () => {
    const header = [
      '// Pattern: Example Thing',
      '// Built with PXLBLZ-IDE https://example.invalid/',
      '//',
      '// A luminous example paragraph',
      '// spanning two lines.',
      '// Runs on: 2D maps.',
      '// Controls: Speed — how fast.',
      '',
      'export function render2D(i, x, y) {}',
    ].join('\n')
    expect(extractHeaderDescription(header)).toBe('A luminous example paragraph spanning two lines.')
    expect(extractHeaderDescription('export function render(i) {}')).toBe('')
  })
})
