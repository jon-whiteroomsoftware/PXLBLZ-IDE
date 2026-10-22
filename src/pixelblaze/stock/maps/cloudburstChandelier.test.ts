import { describe, expect, it } from 'vitest'
import { SOURCE_STOCK_MAPS } from './stockCatalogue'

describe('Cloudburst chandelier (#1200)', () => {
  it.each([960, 480, 1920])('preserves 48 top-to-bottom tubes and ring order at %i pixels', (count) => {
    const map = SOURCE_STOCK_MAPS.find((candidate) => candidate.id === 'cloudburst-chandelier')
    expect(map?.dim).toBe(3)
    const points = map!.resolve(count)
    expect(points).toHaveLength(count)
    const perTube = count / 48
    for (let tube = 0; tube < 48; tube++) {
      const radius = (tube < 8 ? 0.2 : tube < 24 ? 0.4 : 0.6) / 1.2
      const first = points[tube * perTube].sample
      expect(Math.hypot(first[0] - 0.5, first[2] - 0.5)).toBeCloseTo(radius, 10)
      for (let p = 0; p < perTube; p++) {
        const point = points[tube * perTube + p]
        expect(point.sample).toEqual(point.pos)
        expect(point.sample[0]).toBe(first[0])
        expect(point.sample[2]).toBe(first[2])
        if (p) expect(point.sample[1]).toBeLessThan(points[tube * perTube + p - 1].sample[1])
      }
    }
  })

  it('matches the staggered LED height table and ring origins at 960 pixels', () => {
    const points = SOURCE_STOCK_MAPS.find((map) => map.id === 'cloudburst-chandelier')!.resolve(960)
    const rings = [
      { start: 0, tubes: 8, offset: 0.25, bottom: 0, top: 0.3958333333333333 },
      { start: 160, tubes: 16, offset: 0.5, bottom: 0.125, top: 0.5208333333333333 },
      { start: 480, tubes: 24, offset: 0, bottom: 0.25, top: 0.6458333333333333 },
    ]
    for (const ring of rings) for (let tube = 0; tube < ring.tubes; tube++) {
      const first = points[ring.start + tube * 20].sample
      const last = points[ring.start + tube * 20 + 19].sample
      const stagger = tube % 2 ? 0.05 : 0
      expect(first[1]).toBeCloseTo(ring.top + stagger, 10)
      expect(last[1]).toBeCloseTo(ring.bottom + stagger, 10)
      const angle = (tube + ring.offset) * Math.PI * 2 / ring.tubes
      expect(Math.atan2(first[2] - 0.5, first[0] - 0.5)).toBeCloseTo(Math.atan2(Math.sin(angle), Math.cos(angle)), 10)
    }
    expect(Math.min(...points.map((p) => p.sample[1]))).toBe(0)
    expect(Math.max(...points.map((p) => p.sample[1]))).toBeCloseTo(0.6958333333333333, 10)
  })
})
