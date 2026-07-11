import { routeShowLogicalPoint } from './showLogicalRouting'

describe('Show logical routing (#409)', () => {
  it.each([16, 32])('routes a %sx%s grid without encoding its pixel count', (size) => {
    const routing = {
      kind: 'grid' as const,
      zoneIds: ['nw', 'ne', 'sw', 'se'],
      columns: 2,
      rows: 2,
    }
    const counts = new Map(routing.zoneIds.map((zoneId) => [zoneId, 0]))

    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const routed = routeShowLogicalPoint(
          routing,
          column / (size - 1),
          row / (size - 1),
        )
        counts.set(routed.zoneId, counts.get(routed.zoneId)! + 1)
        expect(routed.localX).toBeGreaterThanOrEqual(0)
        expect(routed.localX).toBeLessThanOrEqual(1)
        expect(routed.localY).toBeGreaterThanOrEqual(0)
        expect(routed.localY).toBeLessThanOrEqual(1)
      }
    }

    expect([...counts.values()]).toEqual(Array.from({ length: 4 }, () => size * size / 4))
  })
})
