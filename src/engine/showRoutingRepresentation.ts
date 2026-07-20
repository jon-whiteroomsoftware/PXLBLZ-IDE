export interface RoutingRangeShape {
  start: number
  end: number
}

/** Logical (portable Stage-space) Zone Layout shapes. Owned here with their
 * validation; physical Controller Zone ranges are a separate concern. */
export type ShowLogicalRoutingRecipe =
  | { kind: 'single'; zoneNames: [string] }
  | { kind: 'grid'; zoneNames: string[]; columns: number; rows: number }
  | { kind: 'stripes'; zoneNames: string[]; axis: 'x' | 'y' }
  | { kind: 'checker'; zoneNames: [string, string]; columns: number; rows: number }
  | { kind: 'rings'; zoneNames: string[]; rings: number }
  | { kind: 'wave'; zoneNames: string[]; axis: 'x' | 'y'; bands: number; amplitude: number; frequency: number; phase: number }
  | { kind: 'split'; zoneNames: [string, string]; axis: 'x' | 'y' }
  | { kind: 'soft-split'; zoneNames: [string, string]; axis: 'x' | 'y'; feather: number }
  | { kind: 'pinwheel'; zoneNames: string[]; arms: number; twist: number; rotation: number }

export function validateLogicalRoutingRecipe(name: string, logical: ShowLogicalRoutingRecipe): void {
  const prefix = `compileShow routing layout "${name}"`
  const positiveInteger = (value: number) => Number.isInteger(value) && value >= 1
  const finite = (value: number) => Number.isFinite(value)
  if (logical.zoneNames.length === 0) throw new Error(`${prefix} requires at least one Zone.`)
  if (logical.kind === 'single' && logical.zoneNames.length !== 1) {
    throw new Error(`${prefix} Full Surface requires exactly one Zone.`)
  }
  if (logical.kind === 'grid') {
    if (!positiveInteger(logical.columns) || !positiveInteger(logical.rows)) {
      throw new Error(`${prefix} Grid requires positive whole-number columns and rows.`)
    }
    if (logical.zoneNames.length !== logical.columns * logical.rows) {
      throw new Error(`${prefix} Grid requires one Zone per cell.`)
    }
  }
  if (logical.kind === 'checker') {
    if (logical.zoneNames.length !== 2) throw new Error(`${prefix} Checker requires exactly two Zones.`)
    if (!positiveInteger(logical.columns) || !positiveInteger(logical.rows)) {
      throw new Error(`${prefix} Checker requires positive whole-number columns and rows.`)
    }
  }
  if (logical.kind === 'rings' && !positiveInteger(logical.rings)) {
    throw new Error(`${prefix} Rings requires a positive whole-number ring count.`)
  }
  if (logical.kind === 'wave') {
    if (!positiveInteger(logical.bands)) throw new Error(`${prefix} Wave requires a positive whole-number band count.`)
    if (!finite(logical.amplitude) || logical.amplitude < 0 || logical.amplitude > 1) {
      throw new Error(`${prefix} Wave requires amplitude between 0 and 1.`)
    }
    if (!finite(logical.frequency) || logical.frequency < 0 || !finite(logical.phase)) {
      throw new Error(`${prefix} Wave requires finite non-negative frequency and finite phase.`)
    }
  }
  if (logical.kind === 'split' && logical.zoneNames.length !== 2) {
    throw new Error(`${prefix} Moving Split requires exactly two Zones.`)
  }
  if (logical.kind === 'soft-split') {
    if (logical.zoneNames.length !== 2) throw new Error(`${prefix} Soft Split requires exactly two Zones.`)
    if (!finite(logical.feather) || logical.feather < 0 || logical.feather > 1) {
      throw new Error(`${prefix} requires Soft Split feather between 0 and 1.`)
    }
  }
  if (logical.kind === 'pinwheel') {
    if (!positiveInteger(logical.arms)) throw new Error(`${prefix} Pinwheel requires a positive whole-number arm count.`)
    if (!finite(logical.twist) || !finite(logical.rotation)) {
      throw new Error(`${prefix} Pinwheel requires finite twist and rotation.`)
    }
  }
}

/** Zone-local index assignment lines: the physical decode from output index
 * to a zone-local coordinate, preserving authored range order and offsets. */
export function emitZoneLocalAssignments(
  zone: { ranges: RoutingRangeShape[] },
  localName: string,
): string[] {
  const lines: string[] = []
  let offset = 0
  for (const range of zone.ranges) {
    const length = range.end - range.start + 1
    const assignment = offset === 0
      ? `index - ${range.start}`
      : `${offset} + index - ${range.start}`
    lines.push(`  if (index >= ${range.start} && index <= ${range.end}) ${localName} = ${assignment}`)
    offset += length
  }
  return lines
}

/**
 * Zone-local 2D sample coordinates from a zone-local index under the
 * square-fill convention: width = ceil(sqrt(n)), height = ceil(n / width),
 * degenerate axes centered at 0.5. One rule shared by the packed,
 * short-circuit, and range-branch dispatch blocks.
 */
export function zoneLocal2DCoordinateExpressions(
  pixelCount: number,
  localIndexExpression: string,
): { x: string; y: string } {
  const width = Math.max(1, Math.ceil(Math.sqrt(pixelCount)))
  const height = Math.max(1, Math.ceil(pixelCount / width))
  const bareIdentifier = /^[A-Za-z_$][\w$]*$/.test(localIndexExpression)
  const wrapped = bareIdentifier ? localIndexExpression : `(${localIndexExpression})`
  // Both axes wrap compound expressions: the pre-#570 short-circuit block
  // interpolated the x index unparenthesized, so `(index - 64 % 8)` parsed
  // as `index - 0` and every multi-row zone received a garbage local X.
  return {
    x: width === 1 ? '0.5' : `(${wrapped} % ${width}) / ${width - 1}`,
    y: height === 1 ? '0.5' : `floor(${wrapped} / ${width}) / ${height - 1}`,
  }
}

/** Physical coverage diagnostics: gaps render black and stay warned. */
export function routingLayoutGapWarnings(
  name: string,
  routes: Array<{ ranges: RoutingRangeShape[] }>,
  physicalPixelCount: number,
): string[] {
  if (physicalPixelCount <= 0) return []
  const assigned = new Set<number>()
  for (const route of routes) {
    for (const range of route.ranges) {
      for (let index = Math.max(0, range.start); index <= Math.min(physicalPixelCount - 1, range.end); index += 1) {
        assigned.add(index)
      }
    }
  }
  const missing = physicalPixelCount - assigned.size
  return missing > 0
    ? [`Routing layout "${name}" leaves ${missing} of ${physicalPixelCount} physical pixels unassigned; those pixels render black.`]
    : []
}

/** Overlap diagnostics: ordered first-match, the first route wins. */
export function routingLayoutOverlapWarnings(
  name: string,
  routes: Array<{ ownerId: string; ranges: RoutingRangeShape[] }>,
): string[] {
  const warnings: string[] = []
  for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
      const left = routes[leftIndex]
      const right = routes[rightIndex]
      const overlaps = left.ranges.some((leftRange) => right.ranges.some((rightRange) => (
        leftRange.start <= rightRange.end && rightRange.start <= leftRange.end
      )))
      if (overlaps) {
        warnings.push(
          `Routing layout "${name}" assigns overlapping pixels to clips "${left.ownerId}" and "${right.ownerId}"; the first route wins.`,
        )
      }
    }
  }
  return warnings
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

// #573 packed-table word cap. The table is RAM, not code: pixelCount x
// layoutCount VM words competing with the 10,240-word budget. The worst-case
// three-plane stage-rgb arena at 2,000 px reserves 6,012 words (#514),
// leaving a 4,228-word residual; capping the table at 4,096 words admits the
// flagship 2,000 px x 2 layout shape while keeping a 132-word member floor
// under a full arena. The resource ledger remains the final arbiter against
// member arrays. (Pre-#573 the cap was 2,048 elements, doubling as a
// bytecode proxy for the per-pixel initialization #569 removed.)
const MAX_PACKED_ARRAY_WORDS = 4_096
const LEGACY_MAX_PACKED_ARRAY_ELEMENTS = 2_048
const LEGACY_PACKED_FIXED_BYTECODE_ESTIMATE = 344
const LEGACY_PACKED_BYTECODE_BYTES_PER_ELEMENT = 20
// #573 device-compiler measurements of the #569 run-length emission (pb32,
// fw 3.67): a loop line compiles to 80 bytes and a short-run element
// assignment to 20 bytes over a 128-byte fixed header; loop source lines run
// ~223 bytes. Short runs (< PACKED_ROUTING_LOOP_MIN_RUN) emit per-element
// assignments, which is exactly the legacy per-element pricing.
const PACKED_FIXED_BYTECODE_ESTIMATE = 128
const PACKED_BYTECODE_BYTES_PER_LOOP_RUN = 80
const PACKED_BYTECODE_BYTES_PER_SHORT_ELEMENT = 20
const PACKED_SOURCE_BYTES_PER_LOOP_RUN = 224
const PACKED_SOURCE_BYTES_PER_SHORT_ELEMENT = 48
// #573 FPS gate. The packed render pays table-read plus route-decode
// arithmetic on every pixel; the range-branch chain pays ~1.5 us per tested
// branch (#532) but most pixels of shallow layouts match early. Measured on
// the pb32 (issue573-depth-negative.json): a contiguous-halves 2,000 px
// fixture with ~1.5 expected comparisons ran 15.059 FPS as branches versus
// 9.891 packed (-34%, ~17.3 us/pixel packed overhead), putting break-even
// near 13 expected comparisons. Deep interleaves (strips, pinwheels,
// alternating tails) sit far above it; contiguous zone splits far below.
const PACKED_MIN_EXPECTED_COMPARISONS = 13

/** Loops only pay off once they replace a few per-pixel lines; shared with
 * the #569 emitter so the plan prices exactly what will be emitted. */
export const PACKED_ROUTING_LOOP_MIN_RUN = 4

export interface PackedRoutingRun {
  start: number
  end: number
  /** values[i] = base + i for every i in [start, end]. */
  base: number
}

/**
 * Extracts maximal slope-one runs of nonzero values: each run covers indices
 * whose value increments by exactly one per index. Zero entries (unrouted
 * pixels) are skipped entirely because `array(n)` zero-initializes. Overlap
 * semantics are already resolved in the value array (first writer wins), so
 * the runs are disjoint by construction and need no runtime guard.
 */
export function computeLinearRuns(values: readonly number[]): PackedRoutingRun[] {
  const runs: PackedRoutingRun[] = []
  let active: PackedRoutingRun | null = null
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === 0) {
      active = null
      continue
    }
    const base = value - index
    if (active && active.base === base) {
      active.end = index
      continue
    }
    active = { start: index, end: index, base }
    runs.push(active)
  }
  return runs
}

/**
 * The exact per-pixel value array the packed emitter initializes: first
 * writer wins across overlapping ranges, value = routeIndex * stride +
 * local + 1, flattened across layouts. Shared by the #569 emitter and the
 * #573 pricing so the estimate is the emission model.
 */
export function buildPackedRoutingValues(
  layouts: RoutingLayoutShape[],
  pixelCount: number,
): number[] {
  const stride = pixelCount + 1
  return layouts.flatMap((layout) => {
    const layoutValues = Array.from({ length: pixelCount }, () => 0)
    layout.routes.forEach((route, routeIndex) => {
      let localOffset = 0
      for (const range of route.ranges) {
        for (let index = range.start; index <= range.end; index += 1) {
          if (layoutValues[index] === 0) {
            layoutValues[index] = routeIndex * stride + localOffset + index - range.start + 1
          }
        }
        localOffset += range.end - range.start + 1
      }
    })
    return layoutValues
  })
}

/**
 * Packed-table initialization: `array(n)` plus the #569 run-length loop
 * list. Identical table contents to the historical per-pixel emission -
 * first writer wins across overlaps, O(ranges) source lines.
 */
export function emitPackedRoutingTable(layouts: RoutingLayoutShape[]): string {
  const pixelCount = routingPixelCount(layouts)
  const values = buildPackedRoutingValues(layouts, pixelCount)
  const runs = computeLinearRuns(values)
  const needsLoopIndex = runs.some((run) => run.end - run.start + 1 >= PACKED_ROUTING_LOOP_MIN_RUN)
  const lines = runs.flatMap((run) => {
    if (run.end - run.start + 1 >= PACKED_ROUTING_LOOP_MIN_RUN) {
      const offset = run.base === 0 ? '' : run.base > 0 ? ` + ${run.base}` : ` - ${-run.base}`
      return [
        `for (__pxlblz_show_route_run_i = ${run.start}; __pxlblz_show_route_run_i <= ${run.end}; __pxlblz_show_route_run_i = __pxlblz_show_route_run_i + 1) __pxlblz_show_route_pixels[__pxlblz_show_route_run_i] = __pxlblz_show_route_run_i${offset}`,
      ]
    }
    return Array.from({ length: run.end - run.start + 1 }, (_, offset) => (
      `__pxlblz_show_route_pixels[${run.start + offset}] = ${run.base + run.start + offset}`
    ))
  })
  return [
    `var __pxlblz_show_route_pixels = array(${values.length})`,
    ...(needsLoopIndex ? ['var __pxlblz_show_route_run_i = 0'] : []),
    ...lines,
  ].join('\n')
}

/**
 * Packed-table per-pixel decode: table read, route id and zone-local index
 * recovery, and per-layout dispatch. The caller supplies each route's render
 * body - member invocation never crosses into this module.
 */
export function emitPackedRoutingRenderDecode(
  layouts: RoutingLayoutShape[],
  renderLayoutName: string,
  emitRouteBody: (layoutIndex: number, routeIndex: number) => string,
): string {
  const pixelCount = routingPixelCount(layouts)
  const stride = pixelCount + 1
  const layoutsBody = layouts.map((layout, layoutIndex) => {
    const routeBody = layout.routes.map((_route, routeIndex) => (
      emitRouteBody(layoutIndex, routeIndex)
    )).join('\n')
    return `${layoutIndex === 0 ? '    if' : '    else if'} (${renderLayoutName} == ${layoutIndex}) {
${routeBody}
    }`
  }).join('\n')
  return `  if (index < ${pixelCount}) {
    var __pxlblz_show_route_packed = __pxlblz_show_route_pixels[${renderLayoutName} * ${pixelCount} + index]
    if (__pxlblz_show_route_packed > 0) {
      __pxlblz_show_route_packed = __pxlblz_show_route_packed - 1
      var __pxlblz_show_route_id = floor(__pxlblz_show_route_packed / ${stride})
      var __pxlblz_show_route_local = __pxlblz_show_route_packed - __pxlblz_show_route_id * ${stride}
${layoutsBody}
    }
  }`
}

/**
 * Generated-formula per-pixel decode: closed-form route id and zone-local
 * index for the recognized contiguous, row-band, and interleaved families,
 * with per-layout shifts. The caller supplies the shared route body.
 */
export function emitFormulaRoutingRenderDecode(
  formula: GeneratedRoutingFormula,
  renderLayoutName: string,
  routeBody: string,
): string {
  const shiftLines = formula.layoutShifts.slice(1).map((shift, layoutIndex) => (
    `    if (${renderLayoutName} == ${layoutIndex + 1}) __pxlblz_show_route_shift = ${shift}`
  ))
  const formulaLines = formula.kind === 'contiguous'
    ? [
        `    var __pxlblz_show_route_id = (floor(index / ${formula.blockSize}) + __pxlblz_show_route_shift) % ${formula.routeCount}`,
        `    var __pxlblz_show_route_local = index % ${formula.blockSize}`,
      ]
    : formula.kind === 'row-bands'
      ? [
          `    var __pxlblz_show_route_row = floor(index / ${formula.rowWidth})`,
          `    var __pxlblz_show_route_id = (__pxlblz_show_route_row + __pxlblz_show_route_shift) % ${formula.routeCount}`,
          `    var __pxlblz_show_route_local = floor(__pxlblz_show_route_row / ${formula.routeCount}) * ${formula.rowWidth} + index % ${formula.rowWidth}`,
        ]
      : [
          `    var __pxlblz_show_route_id = (index + __pxlblz_show_route_shift) % ${formula.routeCount}`,
          `    var __pxlblz_show_route_local = floor(index / ${formula.routeCount})`,
        ]
  return [
    `  if (index < ${formula.pixelCount}) {`,
    `    var __pxlblz_show_route_shift = ${formula.layoutShifts[0] ?? 0}`,
    ...shiftLines,
    ...formulaLines,
    routeBody,
    `  }`,
  ].join('\n')
}

/**
 * Logical (portable Stage-space) routing operators: per-pixel route id and
 * zone-local coordinates for every logical Zone Layout kind. Split kinds
 * read the runtime `__pxlblz_show_route_split_position`; everything else is
 * a closed form over the sample coordinates.
 */
export function emitLogicalRoutingSetup(logical: ShowLogicalRoutingRecipe): string {
  if (logical.kind === 'single') {
    return `var __pxlblz_show_route_id = 0
var __pxlblz_show_route_local_x = clamp(x, 0, 1)
var __pxlblz_show_route_local_y = clamp(y, 0, 1)`
  }
  if (logical.kind === 'grid') {
    return `var __pxlblz_show_route_column = min(${logical.columns - 1}, floor(clamp(x, 0, 1) * ${logical.columns}))
var __pxlblz_show_route_row = min(${logical.rows - 1}, floor(clamp(y, 0, 1) * ${logical.rows}))
var __pxlblz_show_route_id = __pxlblz_show_route_row * ${logical.columns} + __pxlblz_show_route_column
var __pxlblz_show_route_local_x = clamp(x * ${logical.columns} - __pxlblz_show_route_column, 0, 1)
var __pxlblz_show_route_local_y = clamp(y * ${logical.rows} - __pxlblz_show_route_row, 0, 1)`
  }
  if (logical.kind === 'stripes') {
    const coordinate = logical.axis === 'x' ? 'x' : 'y'
    const count = logical.zoneNames.length
    return `var __pxlblz_show_route_id = min(${count - 1}, floor(clamp(${coordinate}, 0, 1) * ${count}))
var __pxlblz_show_route_stripe_local = clamp(${coordinate} * ${count} - __pxlblz_show_route_id, 0, 1)
var __pxlblz_show_route_local_x = ${logical.axis === 'x' ? '__pxlblz_show_route_stripe_local' : 'clamp(x, 0, 1)'}
var __pxlblz_show_route_local_y = ${logical.axis === 'y' ? '__pxlblz_show_route_stripe_local' : 'clamp(y, 0, 1)'}`
  }
  if (logical.kind === 'checker') {
    return `var __pxlblz_show_route_column = min(${logical.columns - 1}, floor(clamp(x, 0, 1) * ${logical.columns}))
var __pxlblz_show_route_row = min(${logical.rows - 1}, floor(clamp(y, 0, 1) * ${logical.rows}))
var __pxlblz_show_route_id = (__pxlblz_show_route_row + __pxlblz_show_route_column) % 2
var __pxlblz_show_route_local_x = clamp(x * ${logical.columns} - __pxlblz_show_route_column, 0, 1)
var __pxlblz_show_route_local_y = clamp(y * ${logical.rows} - __pxlblz_show_route_row, 0, 1)`
  }
  if (logical.kind === 'rings') {
    const count = logical.zoneNames.length
    return `var __pxlblz_show_route_dx = clamp(x, 0, 1) - 0.5
var __pxlblz_show_route_dy = clamp(y, 0, 1) - 0.5
var __pxlblz_show_route_radius = clamp(hypot(__pxlblz_show_route_dx, __pxlblz_show_route_dy) / 0.7071067811865476, 0, 1)
var __pxlblz_show_route_ring = min(${logical.rings - 1}, floor(__pxlblz_show_route_radius * ${logical.rings}))
var __pxlblz_show_route_id = __pxlblz_show_route_ring % ${count}
var __pxlblz_show_route_angle = atan2(__pxlblz_show_route_dy, __pxlblz_show_route_dx) / 6.283185307179586
var __pxlblz_show_route_local_x = __pxlblz_show_route_angle - floor(__pxlblz_show_route_angle)
var __pxlblz_show_route_local_y = clamp(__pxlblz_show_route_radius * ${logical.rings} - __pxlblz_show_route_ring, 0, 1)`
  }
  if (logical.kind === 'wave') {
    const count = logical.zoneNames.length
    const along = logical.axis === 'x' ? 'clamp(x, 0, 1)' : 'clamp(y, 0, 1)'
    const across = logical.axis === 'x' ? 'clamp(y, 0, 1)' : 'clamp(x, 0, 1)'
    return `var __pxlblz_show_route_wave_raw = ${along} + (triangle(${across} * ${logical.frequency} + ${logical.phase}) - 0.5) * ${logical.amplitude}
var __pxlblz_show_route_wave = __pxlblz_show_route_wave_raw - floor(__pxlblz_show_route_wave_raw)
var __pxlblz_show_route_band = min(${logical.bands - 1}, floor(__pxlblz_show_route_wave * ${logical.bands}))
var __pxlblz_show_route_id = __pxlblz_show_route_band % ${count}
var __pxlblz_show_route_band_local = clamp(__pxlblz_show_route_wave * ${logical.bands} - __pxlblz_show_route_band, 0, 1)
var __pxlblz_show_route_local_x = ${logical.axis === 'x' ? '__pxlblz_show_route_band_local' : 'clamp(x, 0, 1)'}
var __pxlblz_show_route_local_y = ${logical.axis === 'y' ? '__pxlblz_show_route_band_local' : 'clamp(y, 0, 1)'}`
  }
  if (logical.kind === 'soft-split') {
    const coordinate = logical.axis === 'x' ? 'clamp(x, 0, 1)' : 'clamp(y, 0, 1)'
    const mix = logical.feather > 0
      ? `clamp(0.5 + (__pxlblz_show_route_split_coordinate - __pxlblz_show_route_split_position) / ${logical.feather}, 0, 1)`
      : '0'
    return `var __pxlblz_show_route_split_coordinate = ${coordinate}
var __pxlblz_show_route_mix = ${mix}
${logical.feather > 0 ? '' : `if (__pxlblz_show_route_split_coordinate >= __pxlblz_show_route_split_position) __pxlblz_show_route_mix = 1
`}var __pxlblz_show_route_id = 1
if (__pxlblz_show_route_mix < 0.5) __pxlblz_show_route_id = 0
var __pxlblz_show_route_local_x = clamp(x, 0, 1)
var __pxlblz_show_route_local_y = clamp(y, 0, 1)`
  }
  if (logical.kind === 'split') {
    const coordinate = logical.axis === 'x' ? 'clamp(x, 0, 1)' : 'clamp(y, 0, 1)'
    return `var __pxlblz_show_route_split_coordinate = ${coordinate}
var __pxlblz_show_route_id = 1
var __pxlblz_show_route_split_local = (__pxlblz_show_route_split_coordinate - __pxlblz_show_route_split_position) / max(0.000001, 1 - __pxlblz_show_route_split_position)
if (__pxlblz_show_route_split_position >= 1 || (__pxlblz_show_route_split_position > 0 && __pxlblz_show_route_split_coordinate < __pxlblz_show_route_split_position)) {
  __pxlblz_show_route_id = 0
  __pxlblz_show_route_split_local = __pxlblz_show_route_split_coordinate / max(0.000001, __pxlblz_show_route_split_position)
}
var __pxlblz_show_route_local_x = ${logical.axis === 'x' ? 'clamp(__pxlblz_show_route_split_local, 0, 1)' : 'clamp(x, 0, 1)'}
var __pxlblz_show_route_local_y = ${logical.axis === 'y' ? 'clamp(__pxlblz_show_route_split_local, 0, 1)' : 'clamp(y, 0, 1)'}`
  }
  const count = logical.zoneNames.length
  return `var __pxlblz_show_route_dx = clamp(x, 0, 1) - 0.5
var __pxlblz_show_route_dy = clamp(y, 0, 1) - 0.5
var __pxlblz_show_route_radius = hypot(__pxlblz_show_route_dx, __pxlblz_show_route_dy)
var __pxlblz_show_route_turn_raw = (atan2(__pxlblz_show_route_dy, __pxlblz_show_route_dx) + __pxlblz_show_route_radius * ${logical.twist} + ${logical.rotation}) / 6.283185307179586
var __pxlblz_show_route_turn = __pxlblz_show_route_turn_raw - floor(__pxlblz_show_route_turn_raw)
var __pxlblz_show_route_arm = min(${logical.arms - 1}, floor(__pxlblz_show_route_turn * ${logical.arms}))
var __pxlblz_show_route_id = __pxlblz_show_route_arm % ${count}
var __pxlblz_show_route_local_x = clamp(__pxlblz_show_route_turn * ${logical.arms} - __pxlblz_show_route_arm, 0, 1)
var __pxlblz_show_route_local_y = clamp(__pxlblz_show_route_radius / 0.7071067811865476, 0, 1)`
}

export function planPhysicalRoutingRepresentation(
  layouts: RoutingLayoutShape[],
  measuredDeviceBudgetBytes: number,
  options: { repricedPackedTables?: boolean } = {},
): PhysicalRoutingRepresentationPlan {
  const repriced = options.repricedPackedTables ?? true
  const pixelCount = routingPixelCount(layouts)
  const layoutCount = layouts.length
  const runCount = layouts.reduce((sum, layout) => (
    sum + layout.routes.reduce((routeSum, route) => routeSum + route.ranges.length, 0)
  ), 0)
  const packedArrayElements = pixelCount * layoutCount
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
  const packed = repriced
    ? (() => {
        const runs = pixelCount > 0 ? computeLinearRuns(buildPackedRoutingValues(layouts, pixelCount)) : []
        let loopRuns = 0
        let shortElements = 0
        for (const run of runs) {
          const length = run.end - run.start + 1
          if (length >= PACKED_ROUTING_LOOP_MIN_RUN) loopRuns += 1
          else shortElements += length
        }
        return {
          maxElements: MAX_PACKED_ARRAY_WORDS,
          estimatedBytecodeBytes: PACKED_FIXED_BYTECODE_ESTIMATE
            + loopRuns * PACKED_BYTECODE_BYTES_PER_LOOP_RUN
            + shortElements * PACKED_BYTECODE_BYTES_PER_SHORT_ELEMENT,
          estimatedSourceBytes: 96
            + loopRuns * PACKED_SOURCE_BYTES_PER_LOOP_RUN
            + shortElements * PACKED_SOURCE_BYTES_PER_SHORT_ELEMENT,
        }
      })()
    : {
        maxElements: LEGACY_MAX_PACKED_ARRAY_ELEMENTS,
        estimatedBytecodeBytes: LEGACY_PACKED_FIXED_BYTECODE_ESTIMATE
          + packedArrayElements * LEGACY_PACKED_BYTECODE_BYTES_PER_ELEMENT,
        estimatedSourceBytes: 96 + packedArrayElements * 48,
      }
  // Pre-#573 the FPS gate was `runCount >= 64`, blind to where pixels fall
  // in the branch chain; the repriced gate uses the pixel-weighted expected
  // chain depth of the ordered short-circuit instead.
  const rendersFasterPacked = repriced
    ? expectedComparisonsPerPixel(layouts) >= PACKED_MIN_EXPECTED_COMPARISONS
    : runCount >= 64
  const packedFits = pixelCount > 0
    && packedArrayElements <= packed.maxElements
    && packed.estimatedBytecodeBytes <= measuredDeviceBudgetBytes
    && rendersFasterPacked
  if (packedFits) {
    return {
      ...shape,
      representation: 'packed-pixels',
      arrayElements: packedArrayElements,
      estimatedArrayBytes: packedArrayElements * 4,
      estimatedSourceBytes: packed.estimatedSourceBytes,
      estimatedBytecodeBytes: packed.estimatedBytecodeBytes,
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

/**
 * Pixel-weighted average branch-chain position under the ordered
 * short-circuit (#512): ranges sorted by physical start, one upper-bound
 * test each, so a pixel in the k-th sorted range costs k comparisons.
 * Layouts weigh equally; overlapped pixels count once per covering range
 * (a small conservative overcount for first-writer overlaps).
 */
function expectedComparisonsPerPixel(layouts: RoutingLayoutShape[]): number {
  let weighted = 0
  let pixels = 0
  for (const layout of layouts) {
    const ranges = layout.routes
      .flatMap((route) => route.ranges)
      .slice()
      .sort((left, right) => left.start - right.start)
    ranges.forEach((range, index) => {
      const covered = Math.max(0, range.end - range.start + 1)
      weighted += covered * (index + 1)
      pixels += covered
    })
  }
  return pixels > 0 ? weighted / pixels : 0
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
