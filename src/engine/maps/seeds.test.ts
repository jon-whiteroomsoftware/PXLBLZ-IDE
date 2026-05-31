import { SEED_STOCK_MAPS, SEED_MAP_IDS } from './seeds'

describe('SEED_STOCK_MAPS', () => {
  it('exposes both 3D point clouds and an irregular 2D arrangement', () => {
    const dims = SEED_STOCK_MAPS.map((m) => m.dim).sort()
    expect(dims).toEqual([2, 3, 3])
  })

  it('builds non-builtin (custom-replay) maps with a baked count', () => {
    for (const m of SEED_STOCK_MAPS) {
      expect(m.builtin).toBe(false)
      expect(m.bakedCount).toBeGreaterThan(0)
    }
  })

  it('bakes normalized [0,1] coordinates', () => {
    for (const m of SEED_STOCK_MAPS) {
      for (const pt of m.resolve(m.bakedCount ?? 0)) {
        for (const c of pt.pos ?? []) {
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('exposes stable ids matching the stock maps', () => {
    expect(SEED_MAP_IDS).toEqual(SEED_STOCK_MAPS.map((m) => m.id))
  })
})
