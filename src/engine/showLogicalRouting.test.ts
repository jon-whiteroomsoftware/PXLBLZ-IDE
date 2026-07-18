import { routeShowLogicalPoint, validateShowLogicalRouting } from './showLogicalRouting'

describe('Show logical routing (#409)', () => {
  it('explains invalid adaptive operator parameters before preview or compile (#507)', () => {
    expect(validateShowLogicalRouting({
      kind: 'wave',
      zoneIds: [],
      axis: 'x',
      bands: 0,
      amplitude: 1.2,
      frequency: -1,
      phase: Number.NaN,
    })).toEqual([
      'Wave needs at least one Zone.',
      'Wave band count must be a positive whole number.',
      'Wave amplitude must be between 0 and 1.',
      'Wave frequency must be finite and non-negative, and phase must be finite.',
    ])
  })

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

  it('alternates two ordered zones across checker cells with normalized local coordinates (#507)', () => {
    const routing = {
      kind: 'checker' as const,
      zoneIds: ['red', 'black'] as [string, string],
      columns: 4,
      rows: 2,
    }

    expect(routeShowLogicalPoint(routing, 0.125, 0.25)).toEqual({
      zoneId: 'red',
      localX: 0.5,
      localY: 0.5,
    })
    expect(routeShowLogicalPoint(routing, 0.375, 0.25)).toEqual({
      zoneId: 'black',
      localX: 0.5,
      localY: 0.5,
    })
    expect(routeShowLogicalPoint(routing, 0.125, 0.75)).toEqual({
      zoneId: 'black',
      localX: 0.5,
      localY: 0.5,
    })
  })

  it('cycles ordered zones across radial rings with angular and ring-local coordinates (#507)', () => {
    const routing = {
      kind: 'rings' as const,
      zoneIds: ['red', 'cyan'],
      rings: 4,
    }
    const ringCenterX = (ring: number) => 0.5 + Math.SQRT1_2 * (ring + 0.5) / routing.rings

    expect(routeShowLogicalPoint(routing, ringCenterX(1), 0.5)).toEqual({
      zoneId: 'cyan',
      localX: 0,
      localY: 0.5,
    })
    expect(routeShowLogicalPoint(routing, ringCenterX(2), 0.5)).toEqual({
      zoneId: 'red',
      localX: 0,
      localY: 0.5,
    })
  })

  it('cycles ordered zones across independently configured Pinwheel arms and rotation (#507)', () => {
    const routing = {
      kind: 'pinwheel' as const,
      zoneIds: ['red', 'cyan'],
      arms: 4,
      twist: 0,
      rotation: Math.PI / 2,
    }

    const right = routeShowLogicalPoint(routing, 0.75, 0.5)
    expect(right.zoneId).toBe('cyan')
    expect(right.localX).toBe(0)
    expect(right.localY).toBeCloseTo(Math.SQRT1_2 / 2)

    const lower = routeShowLogicalPoint(routing, 0.5, 0.75)
    expect(lower.zoneId).toBe('red')
    expect(lower.localX).toBe(0)
    expect(lower.localY).toBeCloseTo(Math.SQRT1_2 / 2)
  })

  it('cycles ordered zones across displaced Wave bands with band-local coordinates (#507)', () => {
    const routing = {
      kind: 'wave' as const,
      zoneIds: ['red', 'cyan'],
      axis: 'y' as const,
      bands: 4,
      amplitude: 0.5,
      frequency: 1,
      phase: 0,
    }

    expect(routeShowLogicalPoint(routing, 0, 0.375)).toEqual({
      zoneId: 'red',
      localX: 0,
      localY: 0.5,
    })
    expect(routeShowLogicalPoint(routing, 0.5, 0.125)).toEqual({
      zoneId: 'cyan',
      localX: 0.5,
      localY: 0.5,
    })
  })

  it('returns a bounded blend only inside the Soft Split feather (#507)', () => {
    const routing = {
      kind: 'soft-split' as const,
      zoneIds: ['red', 'cyan'] as [string, string],
      axis: 'x' as const,
      feather: 0.2,
    }

    expect(routeShowLogicalPoint(routing, 0.2, 0.4, { splitPosition: 0.5 })).toEqual({
      zoneId: 'red',
      localX: 0.2,
      localY: 0.4,
      mix: 0,
    })
    expect(routeShowLogicalPoint(routing, 0.5, 0.4, { splitPosition: 0.5 })).toEqual({
      zoneId: 'cyan',
      localX: 0.5,
      localY: 0.4,
      mix: 0.5,
    })
    expect(routeShowLogicalPoint(routing, 0.8, 0.4, { splitPosition: 0.5 })).toEqual({
      zoneId: 'cyan',
      localX: 0.8,
      localY: 0.4,
      mix: 1,
    })
  })
})
