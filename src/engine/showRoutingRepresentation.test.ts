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

// 2,000 pixels, two layouts of 40 contiguous zones: unequal first zones and a
// transposed second layout defeat the generated-formula recognizer, so the
// packed path prices 80 loop-friendly runs over 4,000 table words. Rejected
// by the pre-#573 planner (element cap 2,048 and 20 bytes/element bytecode
// pricing); admitted by the #569 run-length emission model.
function contiguousZoneLayouts(pixelCount: number, zoneCount: number): RoutingLayoutShape[] {
  const base = Math.floor(pixelCount / zoneCount)
  const bounds: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (let zone = 0; zone < zoneCount; zone += 1) {
    const size = zone === 0 ? base + 8 : zone === 1 ? base - 8 : zone === zoneCount - 1 ? pixelCount - cursor : base
    bounds.push({ start: cursor, end: cursor + size - 1 })
    cursor += size
  }
  const swapped = [...bounds]
  ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
  return [
    { routes: bounds.map((bound) => ({ ranges: [bound] })) },
    { routes: swapped.map((bound) => ({ ranges: [bound] })) },
  ]
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

  it('prices packed tables from the #569 run-length emission model (#573)', () => {
    const plan = planPhysicalRoutingRepresentation(contiguousZoneLayouts(2_000, 40), 68_384)
    expect(plan.representation).toBe('packed-pixels')
    expect(plan.arrayElements).toBe(4_000)
    expect(plan.estimatedArrayBytes).toBe(16_000)
    // 80 loop runs at the measured 80 bytes/run over the 128-byte header.
    expect(plan.estimatedBytecodeBytes).toBe(128 + 80 * 80)
    expect(plan.estimatedSourceBytes).toBe(96 + 80 * 224)
  })

  it('keeps the pre-#573 element pricing under the counterfactual option', () => {
    const plan = planPhysicalRoutingRepresentation(
      contiguousZoneLayouts(2_000, 40),
      68_384,
      { repricedPackedTables: false },
    )
    expect(plan.representation).toBe('range-branches')
  })

  it('treats the packed cap as VM words against the render-target arena residual', () => {
    // 2,049 px x 2 layouts = 4,098 words: over the documented 4,096-word cap
    // (10,240-word budget minus the 6,012-word three-plane arena at 2,000 px
    // leaves 4,228; the cap keeps a 132-word member floor).
    const plan = planPhysicalRoutingRepresentation(contiguousZoneLayouts(2_049, 40), 68_384)
    expect(plan.representation).toBe('range-branches')
  })

  it('prices short singleton runs at the per-element assignment cost', () => {
    // Irregular all-singleton layouts never form a loop run: the old 20-byte
    // per-element pricing is exactly the #569 short-run emission cost.
    const plan = planPhysicalRoutingRepresentation([
      alternatingLayout(false),
      {
        routes: [
          { ranges: [{ start: 0, end: 0 }, { start: 3, end: 3 }, ...Array.from({ length: 31 }, (_, index) => ({ start: index * 2 + 4, end: index * 2 + 4 }))] },
          { ranges: [{ start: 1, end: 2 }, ...Array.from({ length: 30 }, (_, index) => ({ start: index * 2 + 5, end: index * 2 + 5 }))] },
        ],
      },
    ], 68_384)
    expect(plan.representation).toBe('packed-pixels')
    // 129 routed pixels across both layouts (the irregular layout spans 65).
    expect(plan.estimatedBytecodeBytes).toBe(128 + 129 * 20)
  })
})
