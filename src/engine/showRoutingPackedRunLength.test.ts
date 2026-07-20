import {
  compileShow,
  computeLinearRuns,
  emitPackedRoutingTable,
  type PackedRoutingLayoutShape,
  type ShowRecipe,
} from './showCompiler'

describe('packed routing run-length initialization (#569)', () => {
  describe('computeLinearRuns', () => {
    it('returns no runs for empty or all-zero tables', () => {
      expect(computeLinearRuns([])).toEqual([])
      expect(computeLinearRuns([0, 0, 0])).toEqual([])
    })

    it('collapses consecutive incrementing values into one run', () => {
      // values[i] = base + i with base 5 over indices 1..3
      expect(computeLinearRuns([0, 6, 7, 8])).toEqual([{ start: 1, end: 3, base: 5 }])
    })

    it('splits runs at zeros (gaps) and at base changes (route boundaries)', () => {
      // indices 0..1 follow base 1; index 2 is unrouted; indices 3..4 follow base 40.
      expect(computeLinearRuns([1, 2, 0, 43, 44])).toEqual([
        { start: 0, end: 1, base: 1 },
        { start: 3, end: 4, base: 40 },
      ])
      // A value jump without a zero also splits: 1,2 then 10 at index 2.
      expect(computeLinearRuns([1, 2, 12])).toEqual([
        { start: 0, end: 1, base: 1 },
        { start: 2, end: 2, base: 10 },
      ])
    })

    it('preserves index ordering across many runs', () => {
      const values = [3, 0, 9, 10, 0, 21]
      expect(computeLinearRuns(values)).toEqual([
        { start: 0, end: 0, base: 3 },
        { start: 2, end: 3, base: 7 },
        { start: 5, end: 5, base: 16 },
      ])
    })
  })

  describe('emitted table initialization', () => {
    it('emits O(ranges) source for a 2,000-pixel multi-layout table', () => {
      // Direct emitter check: the capacity story of #569. Two layouts of
      // contiguous halves over 2,000 pixels was 4,000 per-pixel lines before;
      // the run list is four loops.
      const half = { start: 0, end: 999 }
      const rest = { start: 1_000, end: 1_999 }
      const layouts: PackedRoutingLayoutShape[] = [
        { routes: [{ zone: { ranges: [half] } }, { zone: { ranges: [rest] } }] },
        { routes: [{ zone: { ranges: [rest] } }, { zone: { ranges: [half] } }] },
      ]
      const emitted = emitPackedRoutingTable(layouts)
      const lines = emitted.split('\n')
      expect(lines[0]).toBe('var __pxlblz_show_route_pixels = array(4000)')
      expect(lines.length).toBeLessThan(10)
      expect(lines.filter((line) => line.startsWith('for ('))).toHaveLength(4)
      // The old emission was one line per pixel per layout: ~4,000 lines and
      // tens of kilobytes. The loop emission stays under a kilobyte.
      expect(emitted.length).toBeLessThan(1_024)
    })

    it('compiles a packed Show whose table initialization is O(ranges)', () => {
      const recipe = packedRecipe(1_024)
      const artifact = compileShow(recipe, {})
      expect(artifact.summary.routingRepresentation).toBe('packed-pixels')
      const initLines = tableInitLines(artifact.expandedCode)
      // 2 layouts x 1,024 pixels was 2,048 per-pixel lines before #569. The
      // fixture has ~68 ranges, so the run list stays within that order.
      expect(initLines.length).toBeLessThan(160)
      expect(initLines.some((line) => line.startsWith('for ('))).toBe(true)
    })

    it('produces element-for-element identical table contents', () => {
      const recipe = packedRecipe(1_024)
      const artifact = compileShow(recipe, {})
      expect(artifact.summary.routingRepresentation).toBe('packed-pixels')
      expect(evaluateTable(artifact.expandedCode)).toEqual(referenceTable(recipe))
    })

    it('preserves first-writer-wins semantics for overlapping ranges', () => {
      const recipe = overlappingPackedRecipe()
      const artifact = compileShow(recipe, {})
      expect(artifact.summary.routingRepresentation).toBe('packed-pixels')
      const table = evaluateTable(artifact.expandedCode)
      expect(table).toEqual(referenceTable(recipe))
      // The overlapped tail (pixels 24..39 of the first layout) must belong to
      // the first-writing red route (route 0), not blue.
      const stride = 129
      for (let index = 24; index <= 39; index += 1) {
        expect(Math.floor((table[index] - 1) / stride)).toBe(0)
      }
    })

    it('matches the reference for irregular singleton layouts', () => {
      const recipe = irregularPackedRecipe()
      const artifact = compileShow(recipe, {})
      expect(artifact.summary.routingRepresentation).toBe('packed-pixels')
      expect(evaluateTable(artifact.expandedCode)).toEqual(referenceTable(recipe))
    })
  })
})

// Two layouts of 16-pixel blocks alternating between the routes (a strip
// interleave, the shape the packed table serves): loop-friendly runs, and a
// branch chain deep enough for the #573 expected-comparisons gate. A shifted
// first boundary defeats the generated-formula recognizer.
function packedRecipe(pixelCount: number): ShowRecipe {
  const blockSize = 16
  const blockRanges = (parity: 0 | 1) => {
    const ranges: Array<{ start: number; end: number }> = []
    for (let start = 0; start < pixelCount; start += blockSize) {
      const block = start / blockSize
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
    clips: [
      { id: 'red', zone: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
      { id: 'blue', zone: 'blue', source: 'export function render(index) { rgb(0, 0, 1) }' },
    ],
    zones: striped.zones,
    routingLayouts: [striped, layout('swapped', 1)],
    routingSwitches: [{ atMs: 1_000, layoutId: 'swapped' }],
    loopDurationMs: 2_000,
  }
}

// One layout whose second zone's range overlaps the first zone's tail: the
// overlapped pixels must stay with the first writer. A singleton tail pushes
// the plan over the packed threshold.
function overlappingPackedRecipe(): ShowRecipe {
  const pixelCount = 128
  const tailStart = 64
  const evenTail = Array.from({ length: 32 }, (_, index) => ({
    start: tailStart + index * 2,
    end: tailStart + index * 2,
  }))
  const oddTail = Array.from({ length: 32 }, (_, index) => ({
    start: tailStart + index * 2 + 1,
    end: tailStart + index * 2 + 1,
  }))
  const overlap = {
    id: 'overlap',
    name: 'overlap',
    zones: [
      { id: 'overlap-red', name: 'red', ranges: [{ start: 0, end: 39 }, ...evenTail] },
      // Starts inside red's range: pixels 24..39 must stay red.
      { id: 'overlap-blue', name: 'blue', ranges: [{ start: 24, end: 63 }, ...oddTail] },
    ],
  }
  // Keep the second layout interleaved too so the pixel-weighted branch
  // depth stays above the #573 packed gate.
  const swappedBlocks = (parity: 0 | 1) => Array.from({ length: pixelCount / 4 }, (_, block) => ({
    start: block * 4,
    end: block * 4 + 3,
  })).filter((_, block) => block % 2 === parity)
  const swapped = {
    id: 'swapped',
    name: 'swapped',
    zones: [
      { id: 'swapped-red', name: 'red', ranges: swappedBlocks(1) },
      { id: 'swapped-blue', name: 'blue', ranges: swappedBlocks(0) },
    ],
  }
  return {
    clips: [
      { id: 'red', zone: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
      { id: 'blue', zone: 'blue', source: 'export function render(index) { rgb(0, 0, 1) }' },
    ],
    zones: overlap.zones,
    routingLayouts: [overlap, swapped],
    routingSwitches: [{ atMs: 1_000, layoutId: 'swapped' }],
    loopDurationMs: 2_000,
  }
}

function irregularPackedRecipe(): ShowRecipe {
  const singletonRanges = (indices: number[]) => indices.map((index) => ({ start: index, end: index }))
  const even = Array.from({ length: 32 }, (_, index) => index * 2)
  const odd = Array.from({ length: 32 }, (_, index) => index * 2 + 1)
  const irregularRed = [0, ...odd.filter((index) => index !== 1)]
  const irregularBlue = [1, ...even.filter((index) => index !== 0)]
  const layout = (id: string, red: number[], blue: number[]) => ({
    id,
    name: id,
    zones: [
      { id: `${id}-red`, name: 'red', ranges: singletonRanges(red) },
      { id: `${id}-blue`, name: 'blue', ranges: singletonRanges(blue) },
    ],
  })
  return {
    clips: [
      { id: 'red', zone: 'red', source: 'export function render(index) { rgb(1, index / 100, 0) }' },
      { id: 'blue', zone: 'blue', source: 'export function render(index) { rgb(0, index / 100, 1) }' },
    ],
    zones: layout('base', even, odd).zones,
    routingLayouts: [
      layout('alternating', even, odd),
      layout('irregular', irregularRed, irregularBlue),
    ],
    routingSwitches: [{ atMs: 1_000, layoutId: 'irregular' }],
    loopDurationMs: 2_000,
  }
}

function tableInitLines(expandedCode: string): string[] {
  return expandedCode.split('\n').filter((line) => (
    line.startsWith('__pxlblz_show_route_pixels[')
    || (line.startsWith('for (') && line.includes('__pxlblz_show_route_pixels['))
  ))
}

function evaluateTable(expandedCode: string): number[] {
  const declaration = expandedCode.split('\n').find((line) => (
    line.startsWith('var __pxlblz_show_route_pixels = array(')
  ))
  if (!declaration) throw new Error('missing packed routing table declaration')
  const runIndex = expandedCode.includes('var __pxlblz_show_route_run_i = 0')
    ? ['var __pxlblz_show_route_run_i = 0']
    : []
  const snippet = [declaration, ...runIndex, ...tableInitLines(expandedCode)].join('\n')
  const evaluate = new Function('array', `${snippet}\nreturn __pxlblz_show_route_pixels`)
  return [...evaluate((length: number) => new Array(length).fill(0)) as number[]]
}

// Independent reimplementation of the pre-#569 per-pixel table computation:
// first writer wins, value = routeIndex * stride + localOffset + index -
// range.start + 1, flattened across layouts.
function referenceTable(recipe: ShowRecipe): number[] {
  const layouts = recipe.routingLayouts!
  const pixelCount = layouts.reduce((largest, layout) => layout.zones.reduce((zoneLargest, zone) => (
    Math.max(zoneLargest, ...zone.ranges.map((range) => range.end + 1))
  ), largest), 0)
  const stride = pixelCount + 1
  return layouts.flatMap((layout) => {
    const values = Array.from({ length: pixelCount }, () => 0)
    layout.zones.forEach((zone, routeIndex) => {
      let localOffset = 0
      for (const range of zone.ranges) {
        for (let index = range.start; index <= range.end; index += 1) {
          if (values[index] === 0) {
            values[index] = routeIndex * stride + localOffset + index - range.start + 1
          }
        }
        localOffset += range.end - range.start + 1
      }
    })
    return values
  })
}
