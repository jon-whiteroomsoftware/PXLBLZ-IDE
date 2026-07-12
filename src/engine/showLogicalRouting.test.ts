import { routeShowLogicalPoint } from './showLogicalRouting'

describe('Show logical routing (#409)', () => {
  it('moves a two-zone split while renormalizing each side (#405)', () => {
    const routing = {
      kind: 'split' as const,
      zoneIds: ['left', 'right'] as [string, string],
      axis: 'x' as const,
    }

    expect(routeShowLogicalPoint(routing, 0.125, 0.4, { splitPosition: 0.25 })).toEqual({
      zoneId: 'left',
      localX: 0.5,
      localY: 0.4,
    })
    expect(routeShowLogicalPoint(routing, 0.625, 0.4, { splitPosition: 0.25 })).toEqual({
      zoneId: 'right',
      localX: 0.5,
      localY: 0.4,
    })
  })

  it('gives one zone the complete domain at moving-split endpoints (#405)', () => {
    const routing = {
      kind: 'split' as const,
      zoneIds: ['top', 'bottom'] as [string, string],
      axis: 'y' as const,
    }

    expect(routeShowLogicalPoint(routing, 0.3, 0, { splitPosition: 0 })).toEqual({
      zoneId: 'bottom',
      localX: 0.3,
      localY: 0,
    })
    expect(routeShowLogicalPoint(routing, 0.3, 1, { splitPosition: 1 })).toEqual({
      zoneId: 'top',
      localX: 0.3,
      localY: 1,
    })
  })

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
