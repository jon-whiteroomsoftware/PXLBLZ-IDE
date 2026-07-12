import { planPhysicalRoutingRepresentation, type RoutingLayoutShape } from './showRoutingRepresentation'

function alternatingLayout(swapped: boolean): RoutingLayoutShape {
  const ranges = (parity: number) => Array.from({ length: 32 }, (_, index) => ({
    start: index * 2 + parity,
    end: index * 2 + parity,
  }))
  return {
    routes: [
      { ranges: ranges(swapped ? 1 : 0) },
      { ranges: ranges(swapped ? 0 : 1) },
    ],
  }
}

describe('planPhysicalRoutingRepresentation', () => {
  it('rejects a packed table when its estimated bytecode exceeds the supplied device budget (#408)', () => {
    const plan = planPhysicalRoutingRepresentation([
      alternatingLayout(false),
      {
        routes: [
          { ranges: [{ start: 0, end: 0 }, { start: 3, end: 3 }, ...Array.from({ length: 31 }, (_, index) => ({ start: index * 2 + 4, end: index * 2 + 4 }))] },
          { ranges: [{ start: 1, end: 2 }, ...Array.from({ length: 30 }, (_, index) => ({ start: index * 2 + 5, end: index * 2 + 5 }))] },
        ],
      },
    ], 1_000)

    expect(plan.representation).toBe('range-branches')
    expect(plan.arrayElements).toBe(0)
    expect(plan.estimatedArrayBytes).toBe(0)
  })
})
