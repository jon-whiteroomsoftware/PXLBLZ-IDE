import { emitPackedRoutingTable, planPhysicalRoutingRepresentation, type RoutingLayoutShape } from './showRoutingRepresentation'

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
// Two routes alternating 50-pixel blocks, swapped in the second layout: 80
// loop-friendly runs whose packed values stay far inside the 16.16 integer
// range (stride 2,001, two routes), with a ~20-deep expected branch chain
// that clears the #573 FPS gate.
function interleavedTwoRouteLayouts(pixelCount: number, blockSize: number): RoutingLayoutShape[] {
  // An enlarged first block (and shrunk second) defeats the generated-formula
  // recognizer, exactly like the contiguous fixture below.
  const boundary = (block: number) => (
    block === 0 ? 0 : block === 1 ? blockSize + 8 : block * blockSize
  )
  const blockCount = pixelCount / blockSize
  const ranges = (parity: 0 | 1) => {
    const out: Array<{ start: number; end: number }> = []
    for (let block = 0; block < blockCount; block += 1) {
      if (block % 2 !== parity) continue
      const end = block === blockCount - 1 ? pixelCount - 1 : boundary(block + 1) - 1
      out.push({ start: boundary(block), end })
    }
    return out
  }
  return [
    { routes: [{ ranges: ranges(0) }, { ranges: ranges(1) }] },
    { routes: [{ ranges: ranges(1) }, { ranges: ranges(0) }] },
  ]
}

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
    // #717 literal emission prices this 130-element table at 128 + 553 bytes,
    // so the budget must sit below that to exercise the rejection path.
    const plan = planPhysicalRoutingRepresentation([
      alternatingLayout(false),
      {
        routes: [
          { ranges: [{ start: 0, end: 0 }, { start: 3, end: 3 }, ...Array.from({ length: 31 }, (_, index) => ({ start: index * 2 + 4, end: index * 2 + 4 }))] },
          { ranges: [{ start: 1, end: 2 }, ...Array.from({ length: 30 }, (_, index) => ({ start: index * 2 + 5, end: index * 2 + 5 }))] },
        ],
      },
    ], 500)

    expect(plan.representation).toBe('range-branches')
    expect(plan.arrayElements).toBe(0)
    expect(plan.estimatedArrayBytes).toBe(0)
  })

  it('prices packed tables from the #569 run-length emission model (#573)', () => {
    const layouts = interleavedTwoRouteLayouts(2_000, 50)
    const plan = planPhysicalRoutingRepresentation(layouts, 68_384)
    expect(plan.representation).toBe('packed-pixels')
    expect(plan.arrayElements).toBe(4_000)
    expect(plan.estimatedArrayBytes).toBe(16_000)
    // 80 loop runs at the measured 80 bytes/run over the 128-byte header:
    // the #717 chooser keeps loops here because they beat the literal
    // (4,000 x 4.25 = 17,000 bytes) by a wide margin.
    expect(plan.estimatedBytecodeBytes).toBe(128 + 80 * 80)
    const emitted = emitPackedRoutingTable(layouts)
    expect(plan.estimatedSourceBytes).toBe(
      96 + emitted.split('\n').reduce((sum, line) => sum + line.length + 1, 0),
    )
  })

  it('keeps the representability gate active under legacy repricing mode (review P2)', () => {
    // The emitter is strict regardless of pricing mode; without the
    // unconditional gate this selection would throw at emission time.
    const plan = planPhysicalRoutingRepresentation(
      contiguousZoneLayouts(2_000, 40),
      68_384,
      { repricedPackedTables: false },
    )
    expect(plan.representation).toBe('range-branches')
  })

  it('falls back to range branches when packed values overflow the 16.16 integer range (#717)', () => {
    // 40 routes x (2,000 + 1) stride packs values up to ~78,000 - beyond the
    // 32,767 integer ceiling. Pre-#717 the planner admitted this table and
    // the emitted constants would have corrupted silently on device.
    const plan = planPhysicalRoutingRepresentation(contiguousZoneLayouts(2_000, 40), 68_384)
    expect(plan.representation).toBe('range-branches')
    expect(plan.arrayElements).toBe(0)
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

  it('prices irregular singleton tables at the measured literal cost (#717)', () => {
    // Irregular all-singleton layouts never form a loop run. Pre-#717 they
    // priced at 20 bytes per routed element (assignments); the cost-based
    // emitter now chooses an array literal at 4.25 bytes per element across
    // the whole 130-element table.
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
    // 130 table elements (65 px x 2 layouts) at 4.25 bytes each, rounded up.
    expect(plan.estimatedBytecodeBytes).toBe(128 + Math.ceil(130 * 4.25))
  })
})
