// #573: packed-routing selection re-priced for the #569 run-length emission.
// A 2,000-pixel two-layout Show (4,000 table words) was rejected by the old
// element cap and 20-byte/element pricing; the run-length model admits it.
// Shows that keep their representation are byte-for-byte unchanged.
import { createFastReplayRuntime } from './fastReplay'
import { compileShow, type ShowRecipe } from './showCompiler'

// 16-pixel blocks alternating between two routes (a strip interleave, the
// shape packed tables serve): deep branch chains, loop-friendly runs, and an
// uneven first block so the generated-formula recognizer rejects it. The
// second layout swaps the parities.
function largePackedRecipe(pixelCount: number, blockSize = 16): ShowRecipe {
  const blockRanges = (parity: 0 | 1) => {
    const ranges: Array<{ start: number; end: number }> = []
    for (let start = 0; start < pixelCount; start += blockSize) {
      const block = start / blockSize
      // Shift the first boundary by four pixels to defeat formula recognition.
      const begin = block === 0 ? 0 : block === 1 ? start - 4 : start
      const end = block === 0 ? start + blockSize - 5 : Math.min(pixelCount, start + blockSize) - 1
      if (block % 2 === parity) ranges.push({ start: begin, end })
    }
    return ranges
  }
  const layout = (id: string, redParity: 0 | 1) => ({
    id,
    name: id,
    zones: [
      { id: `${id}-red`, name: 'red', ranges: blockRanges(redParity) },
      { id: `${id}-blue`, name: 'blue', ranges: blockRanges(redParity === 0 ? 1 : 0) },
    ],
  })
  const striped = layout('striped', 0)
  return {
    masterPixelCount: pixelCount,
    clips: [
      { id: 'red', zone: 'red', source: 'export function render(index) { rgb(1, index / pixelCount, 0) }' },
      { id: 'blue', zone: 'blue', source: 'export function render(index) { rgb(0, index / pixelCount, 1) }' },
    ],
    zones: striped.zones,
    routingLayouts: [striped, layout('swapped', 1)],
    routingSwitches: [{ atMs: 1_000, layoutId: 'swapped' }],
    loopDurationMs: 2_000,
  }
}

function checksums(artifact: ReturnType<typeof compileShow>, fidelity: 'fast' | 'fidelity'): string[] {
  const replay = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 1,
  }, {
    mapPoints: Array.from({ length: 256 }, (_, index) => ({ sample: [index / 255] })),
    randomSeed: 573,
    fidelity,
  })
  return [100, 900, 1_100, 1_900].map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
}

describe('packed-routing selection re-pricing (#573)', () => {
  it('newly qualifies a 2,000-pixel two-layout Show for the packed table', () => {
    const artifact = compileShow(largePackedRecipe(2_000), {})
    expect(artifact.summary.routingRepresentation).toBe('packed-pixels')
    // #717 cost-based emission: the 16-px interleave's many short runs price
    // the 4,000-element table cheapest as an array literal.
    expect(artifact.expandedCode).toContain('var __pxlblz_show_route_pixels = [')
    const counterfactual = compileShow(largePackedRecipe(2_000), {}, { packedRoutingRepricing: false })
    expect(counterfactual.summary.routingRepresentation).toBe('range-branches')
  })

  it('renders the flipped Show identically to the range-branches build in both fidelities', () => {
    const packed = compileShow(largePackedRecipe(2_000), {})
    const branches = compileShow(largePackedRecipe(2_000), {}, { packedRoutingRepricing: false })
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const packedSums = checksums(packed, fidelity)
      expect(packedSums).toEqual(checksums(branches, fidelity))
      expect(new Set(packedSums).size).toBeGreaterThan(1)
    }
  })

  it('keeps shallow contiguous splits on range-branches despite many ranges', () => {
    // Contiguous halves plus a 64-singleton tail: 67 ranges (past the old
    // runCount >= 64 gate) but ~1.5 expected comparisons per pixel. Measured
    // on the pb32 at 15.059 FPS as branches versus 9.891 packed
    // (issue573-depth-negative.json), so the depth gate keeps branches.
    const tailStart = 2_000 - 64
    const evenTail = Array.from({ length: 32 }, (_, index) => ({
      start: tailStart + index * 2,
      end: tailStart + index * 2,
    }))
    const oddTail = Array.from({ length: 32 }, (_, index) => ({
      start: tailStart + index * 2 + 1,
      end: tailStart + index * 2 + 1,
    }))
    const mostly = {
      id: 'mostly',
      name: 'mostly',
      zones: [
        { id: 'mostly-red', name: 'red', ranges: [{ start: 0, end: tailStart - 1 }, ...evenTail] },
        { id: 'mostly-blue', name: 'blue', ranges: oddTail },
      ],
    }
    const swapped = {
      id: 'swapped',
      name: 'swapped',
      zones: [
        { id: 'swapped-red', name: 'red', ranges: [{ start: tailStart, end: 1_999 }] },
        { id: 'swapped-blue', name: 'blue', ranges: [{ start: 0, end: tailStart - 1 }] },
      ],
    }
    const recipe: ShowRecipe = {
      masterPixelCount: 2_000,
      clips: [
        { id: 'red', zone: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'blue', zone: 'blue', source: 'export function render(index) { rgb(0, 0, 1) }' },
      ],
      zones: mostly.zones,
      routingLayouts: [mostly, swapped],
      routingSwitches: [{ atMs: 1_000, layoutId: 'swapped' }],
      loopDurationMs: 2_000,
    }
    expect(compileShow(recipe, {}).summary.routingRepresentation).toBe('range-branches')
  })

  it('keeps Shows that retain their representation byte-for-byte unchanged', () => {
    // Already packed under the old pricing (1,024 px x 2 layouts).
    const kept = largePackedRecipe(1_024)
    const repriced = compileShow(kept, {})
    const counterfactual = compileShow(kept, {}, { packedRoutingRepricing: false })
    expect(repriced.summary.routingRepresentation).toBe('packed-pixels')
    expect(repriced.expandedCode).toBe(counterfactual.expandedCode)
    expect(repriced.code).toBe(counterfactual.code)
  })
})
