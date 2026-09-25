import { STOCK_SHOW_IDS, isStockShowId } from '@/pixelblaze/stock/showIds'
import { STOCK_SHOWS_V2 } from '@/pixelblaze/stock/showsV2'
it('keeps the server stock identity index equal to the actual catalogue', () => {
  expect(STOCK_SHOW_IDS).toEqual(STOCK_SHOWS_V2.map(item => item.id))
  expect(new Set(STOCK_SHOW_IDS).size).toBe(STOCK_SHOW_IDS.length)
  expect(isStockShowId('stock-show-made-up')).toBe(false)
  expect(isStockShowId('__proto__')).toBe(false)
})
