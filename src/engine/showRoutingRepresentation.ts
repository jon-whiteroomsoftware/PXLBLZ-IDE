export interface RoutingRangeShape {
  start: number
  end: number
}

export interface RoutingRouteShape {
  ranges: RoutingRangeShape[]
}

export interface RoutingLayoutShape {
  routes: RoutingRouteShape[]
}

export type GeneratedRoutingFormula =
  | { kind: 'contiguous'; pixelCount: number; routeCount: number; blockSize: number; layoutShifts: number[] }
  | { kind: 'row-bands'; pixelCount: number; routeCount: number; rowWidth: number; layoutShifts: number[] }
  | { kind: 'interleaved'; pixelCount: number; routeCount: number; layoutShifts: number[] }

export interface RoutingRepresentationEstimate {
  pixelCount: number
  layoutCount: number
  runCount: number
  arrayElements: number
  estimatedArrayBytes: number
  estimatedSourceBytes: number
  estimatedBytecodeBytes: number
}

export type PhysicalRoutingRepresentationPlan = RoutingRepresentationEstimate & (
  | { representation: 'generated-formula'; formula: GeneratedRoutingFormula }
  | { representation: 'packed-pixels' | 'range-branches'; formula?: undefined }
)

const MAX_PACKED_ARRAY_ELEMENTS = 2048
const PACKED_FIXED_BYTECODE_ESTIMATE = 344
const PACKED_BYTECODE_BYTES_PER_ELEMENT = 20

export function planPhysicalRoutingRepresentation(
  layouts: RoutingLayoutShape[],
  measuredDeviceBudgetBytes: number,
): PhysicalRoutingRepresentationPlan {
  const pixelCount = routingPixelCount(layouts)
  const layoutCount = layouts.length
  const runCount = layouts.reduce((sum, layout) => (
    sum + layout.routes.reduce((routeSum, route) => routeSum + route.ranges.length, 0)
  ), 0)
  const packedArrayElements = pixelCount * layoutCount
  const packedEstimatedBytecodeBytes = PACKED_FIXED_BYTECODE_ESTIMATE
    + packedArrayElements * PACKED_BYTECODE_BYTES_PER_ELEMENT
  const shape = {
    pixelCount,
    layoutCount,
    runCount,
  }
  const formula = recognizeGeneratedRoutingFormula(layouts, pixelCount)
  if (formula) {
    return {
      ...shape,
      representation: 'generated-formula',
      formula,
      arrayElements: 0,
      estimatedArrayBytes: 0,
      estimatedSourceBytes: 256 + layoutCount * 48,
      estimatedBytecodeBytes: 512 + layoutCount * 32,
    }
  }
  const packedFits = pixelCount > 0
    && packedArrayElements <= MAX_PACKED_ARRAY_ELEMENTS
    && packedEstimatedBytecodeBytes <= measuredDeviceBudgetBytes
    && runCount >= 64
  if (packedFits) {
    return {
      ...shape,
      representation: 'packed-pixels',
      arrayElements: packedArrayElements,
      estimatedArrayBytes: packedArrayElements * 4,
      estimatedSourceBytes: 96 + packedArrayElements * 48,
      estimatedBytecodeBytes: packedEstimatedBytecodeBytes,
    }
  }
  return {
    ...shape,
    representation: 'range-branches',
    arrayElements: 0,
    estimatedArrayBytes: 0,
    estimatedSourceBytes: 96 + runCount * 112,
    estimatedBytecodeBytes: 256 + runCount * 80,
  }
}

function recognizeGeneratedRoutingFormula(
  layouts: RoutingLayoutShape[],
  pixelCount: number,
): GeneratedRoutingFormula | null {
  const routeCount = layouts[0]?.routes.length ?? 0
  if (pixelCount < 1 || routeCount < 2 || layouts.some((layout) => layout.routes.length !== routeCount)) return null
  const pixels = layouts.map((layout) => materializeLayout(layout, pixelCount))
  if (pixels.some((layout) => layout === null)) return null
  const complete = pixels as Array<Array<{ route: number; local: number }>>

  if (pixelCount % routeCount === 0) {
    const blockSize = pixelCount / routeCount
    const shifts = recognizeShifts(complete, routeCount, (index) => ({
      route: Math.floor(index / blockSize),
      local: index % blockSize,
    }))
    if (shifts) return { kind: 'contiguous', pixelCount, routeCount, blockSize, layoutShifts: shifts }
  }

  for (let rowWidth = 2; rowWidth < pixelCount; rowWidth += 1) {
    if (pixelCount % rowWidth !== 0) continue
    const shifts = recognizeShifts(complete, routeCount, (index) => {
      const row = Math.floor(index / rowWidth)
      return {
        route: row % routeCount,
        local: Math.floor(row / routeCount) * rowWidth + index % rowWidth,
      }
    })
    if (shifts) return { kind: 'row-bands', pixelCount, routeCount, rowWidth, layoutShifts: shifts }
  }

  const shifts = recognizeShifts(complete, routeCount, (index) => ({
    route: index % routeCount,
    local: Math.floor(index / routeCount),
  }))
  return shifts
    ? { kind: 'interleaved', pixelCount, routeCount, layoutShifts: shifts }
    : null
}

function recognizeShifts(
  layouts: Array<Array<{ route: number; local: number }>>,
  routeCount: number,
  expectedAt: (index: number) => { route: number; local: number },
): number[] | null {
  const shifts: number[] = []
  for (const layout of layouts) {
    const base = expectedAt(0)
    const shift = (layout[0].route - base.route + routeCount) % routeCount
    const matches = layout.every((pixel, index) => {
      const expected = expectedAt(index)
      return pixel.route === (expected.route + shift) % routeCount && pixel.local === expected.local
    })
    if (!matches) return null
    shifts.push(shift)
  }
  return shifts
}

function materializeLayout(
  layout: RoutingLayoutShape,
  pixelCount: number,
): Array<{ route: number; local: number }> | null {
  const pixels: Array<{ route: number; local: number } | undefined> = Array.from({ length: pixelCount })
  for (let routeIndex = 0; routeIndex < layout.routes.length; routeIndex += 1) {
    let localOffset = 0
    for (const range of layout.routes[routeIndex].ranges) {
      if (range.start < 0 || range.end < range.start || range.end >= pixelCount) return null
      for (let index = range.start; index <= range.end; index += 1) {
        if (pixels[index]) return null
        pixels[index] = { route: routeIndex, local: localOffset + index - range.start }
      }
      localOffset += range.end - range.start + 1
    }
  }
  return pixels.every(Boolean) ? pixels as Array<{ route: number; local: number }> : null
}

function routingPixelCount(layouts: RoutingLayoutShape[]): number {
  return layouts.reduce((largest, layout) => layout.routes.reduce((layoutLargest, route) => (
    Math.max(layoutLargest, ...route.ranges.map((range) => range.end + 1))
  ), largest), 0)
}
