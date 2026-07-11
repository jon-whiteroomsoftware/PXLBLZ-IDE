export type RoutingFixtureKind =
  | 'contiguous'
  | 'serpentine-bands'
  | 'interleaved'
  | 'sparse-exceptions'

export type RoutingRepresentation =
  | 'range-branches'
  | 'rle-table'
  | 'packed-pixels'
  | 'generated-formula'

export interface RoutingPixel {
  route: number
  localIndex: number
}

export interface RoutingFixture {
  kind: RoutingFixtureKind
  pixelCount: number
  layoutCount: number
  routeCount: number
  width: number
  layouts: RoutingPixel[][]
}

export interface RoutingPressure {
  globals: number
  arrays: number
  arrayElements: number
}

export interface RoutingProbe {
  representation: RoutingRepresentation
  source: string
  sourceBytes: number
  pressure: RoutingPressure
  runCount: number
}

interface RoutingRun extends RoutingPixel {
  start: number
  end: number
}

const ROUTE_COUNT = 4

export function makeRoutingFixture(options: {
  kind: RoutingFixtureKind
  pixelCount: number
  layoutCount: number
}): RoutingFixture {
  const { kind, pixelCount, layoutCount } = options
  if (pixelCount < ROUTE_COUNT || pixelCount % ROUTE_COUNT !== 0) {
    throw new Error('Routing fixtures require a pixel count divisible by four.')
  }
  if (layoutCount < 1) throw new Error('Routing fixtures require at least one layout.')

  const width = gridWidth(pixelCount)
  const layouts = Array.from({ length: layoutCount }, (_, layoutIndex) => {
    const routeIds = Array.from({ length: pixelCount }, (_, index) => (
      routeFor(kind, index, layoutIndex, pixelCount, width)
    ))
    const nextLocal = Array.from({ length: ROUTE_COUNT }, () => 0)
    return routeIds.map((route) => ({ route, localIndex: nextLocal[route]++ }))
  })

  return { kind, pixelCount, layoutCount, routeCount: ROUTE_COUNT, width, layouts }
}

export function representationKindsFor(fixture: RoutingFixture): RoutingRepresentation[] {
  const kinds: RoutingRepresentation[] = ['range-branches', 'rle-table', 'packed-pixels']
  if (fixture.kind !== 'sparse-exceptions') kinds.push('generated-formula')
  return kinds
}

export function buildRoutingProbe(
  fixture: RoutingFixture,
  representation: RoutingRepresentation,
  options: { switchEveryMs?: number } = {},
): RoutingProbe {
  if (!representationKindsFor(fixture).includes(representation)) {
    throw new Error(`${representation} is not valid for ${fixture.kind}.`)
  }

  const runs = fixture.layouts.map(toRuns)
  const emitted = representation === 'range-branches'
    ? emitRangeBranches(fixture, runs)
    : representation === 'rle-table'
      ? emitRleTable(fixture, runs)
      : representation === 'packed-pixels'
        ? emitPackedPixels(fixture)
        : emitGeneratedFormula(fixture)
  const source = `${emitted.prelude}${emitProbeRuntime(fixture, emitted.body, options.switchEveryMs)}`

  return {
    representation,
    source,
    sourceBytes: new TextEncoder().encode(source).length,
    pressure: emitted.pressure,
    runCount: runs.reduce((sum, layoutRuns) => sum + layoutRuns.length, 0),
  }
}

function gridWidth(pixelCount: number): number {
  const square = Math.sqrt(pixelCount)
  return Number.isInteger(square) ? square : Math.min(32, pixelCount)
}

function routeFor(
  kind: RoutingFixtureKind,
  index: number,
  layoutIndex: number,
  pixelCount: number,
  width: number,
): number {
  if (kind === 'contiguous') {
    return (Math.floor(index / (pixelCount / ROUTE_COUNT)) + layoutIndex) % ROUTE_COUNT
  }
  if (kind === 'serpentine-bands') {
    return (Math.floor(index / width) + layoutIndex) % ROUTE_COUNT
  }
  if (kind === 'interleaved') return (index + layoutIndex) % ROUTE_COUNT

  const shifted = (index + layoutIndex * 3) % pixelCount
  if (shifted % 43 === 0) return 3
  if (shifted % 29 === 0) return 2
  if (shifted % 17 === 0) return 1
  return 0
}

function toRuns(layout: RoutingPixel[]): RoutingRun[] {
  const runs: RoutingRun[] = []
  for (let index = 0; index < layout.length; index += 1) {
    const current = layout[index]
    const previous = runs.at(-1)
    if (
      previous
      && previous.route === current.route
      && previous.localIndex + (previous.end - previous.start) + 1 === current.localIndex
    ) {
      previous.end = index
    } else {
      runs.push({ start: index, end: index, ...current })
    }
  }
  return runs
}

function emitProbeRuntime(
  fixture: RoutingFixture,
  selectionBody: string,
  switchEveryMs: number | undefined,
): string {
  const clock = switchEveryMs
    ? `var __route_elapsed = 0

export function beforeRender(delta) {
  __route_elapsed = __route_elapsed + delta
  if (__route_elapsed >= ${switchEveryMs}) {
    __route_elapsed = __route_elapsed - ${switchEveryMs}
    __route_layout = (__route_layout + 1) % ${fixture.layoutCount}
  }
}`
    : `export function beforeRender(delta) {
  __route_layout = (__route_layout + 1) % ${fixture.layoutCount}
}`

  return `var __route_layout = 0

${clock}

export function render(index) {
  var route = -1
  var local = -1
${indent(selectionBody, 2)}
  if (route >= 0) hsv(route / ${fixture.routeCount}, 1, 0.25 + 0.75 * frac(local / 17))
  else rgb(0, 0, 0)
}
`
}

function emitRangeBranches(
  _fixture: RoutingFixture,
  layouts: RoutingRun[][],
): { prelude: string; body: string; pressure: RoutingPressure } {
  const body = layouts.map((runs, layoutIndex) => {
    const assignments = runs.map((run) => (
      `if (index >= ${run.start} && index <= ${run.end}) { route = ${run.route}; local = ${run.localIndex} + index - ${run.start} }`
    )).join('\n')
    return `${layoutIndex === 0 ? 'if' : 'else if'} (__route_layout == ${layoutIndex}) {\n${indent(assignments, 2)}\n}`
  }).join('\n')
  return { prelude: '', body, pressure: { globals: 1, arrays: 0, arrayElements: 0 } }
}

function emitRleTable(
  fixture: RoutingFixture,
  layouts: RoutingRun[][],
): { prelude: string; body: string; pressure: RoutingPressure } {
  const runs = layouts.flat()
  const offsets = [0]
  for (const layout of layouts) offsets.push(offsets.at(-1)! + layout.length)
  const stride = fixture.pixelCount + 1
  const prelude = [
    emitArray('__route_offsets', offsets),
    emitArray('__route_starts', runs.map((run) => run.start)),
    emitArray('__route_ends', runs.map((run) => run.end)),
    emitArray('__route_values', runs.map((run) => run.route * stride + run.localIndex)),
  ].join('\n')
  const body = `var run = __route_offsets[__route_layout]
var stop = __route_offsets[__route_layout + 1]
while (run < stop) {
  if (index >= __route_starts[run] && index <= __route_ends[run]) {
    var packed = __route_values[run]
    route = floor(packed / ${stride})
    local = packed - route * ${stride} + index - __route_starts[run]
    run = stop
  }
  run = run + 1
}`
  return {
    prelude,
    body,
    pressure: {
      globals: 5,
      arrays: 4,
      arrayElements: offsets.length + runs.length * 3,
    },
  }
}

function emitPackedPixels(
  fixture: RoutingFixture,
): { prelude: string; body: string; pressure: RoutingPressure } {
  const stride = fixture.pixelCount + 1
  const values = fixture.layouts.flatMap((layout) => (
    layout.map((pixel) => pixel.route * stride + pixel.localIndex)
  ))
  return {
    prelude: emitArray('__route_pixels', values),
    body: `var packed = __route_pixels[__route_layout * ${fixture.pixelCount} + index]
route = floor(packed / ${stride})
local = packed - route * ${stride}`,
    pressure: { globals: 2, arrays: 1, arrayElements: values.length },
  }
}

function emitGeneratedFormula(
  fixture: RoutingFixture,
): { prelude: string; body: string; pressure: RoutingPressure } {
  let body: string
  if (fixture.kind === 'contiguous') {
    const block = fixture.pixelCount / fixture.routeCount
    body = `route = (floor(index / ${block}) + __route_layout) % ${fixture.routeCount}
local = index % ${block}`
  } else if (fixture.kind === 'serpentine-bands') {
    body = `var row = floor(index / ${fixture.width})
route = (row + __route_layout) % ${fixture.routeCount}
local = floor(row / ${fixture.routeCount}) * ${fixture.width} + index % ${fixture.width}`
  } else {
    body = `route = (index + __route_layout) % ${fixture.routeCount}
local = floor(index / ${fixture.routeCount})`
  }
  return { prelude: '', body, pressure: { globals: 1, arrays: 0, arrayElements: 0 } }
}

function emitArray(name: string, values: number[]): string {
  return [
    `var ${name} = array(${values.length})`,
    ...values.map((value, index) => `${name}[${index}] = ${value}`),
  ].join('\n') + '\n'
}

function indent(value: string, spaces: number): string {
  const prefix = ' '.repeat(spaces)
  return value.split('\n').map((line) => `${prefix}${line}`).join('\n')
}
