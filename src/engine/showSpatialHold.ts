// #937: spatial hold-and-lerp as a compile option (the #926 spike, built).
//
// Every stride-th pixel is an anchor. At an anchor the dispatcher is
// evaluated one stride AHEAD (index + stride, clamped to the last physical
// pixel so no generated arena access runs past its bounds), the previous lookahead
// becomes the current anchor sample, and the stride pixels from the anchor
// paint a linear blend between the two samples. Evaluations per frame fall
// to N / stride + 1; measured on heavy members at 256 px, +79% at x2 and
// +227% at x4 for about half the plain hold's visual drift (#926).
//
// This is an authored, disclosed approximation, never inferred: it runs only
// when `spatialHold` is set on the compile options, and it is off by default.
//
// Eligibility is proven here, not assumed: the lookahead calls the
// dispatcher with index + stride, so the dispatcher must synthesize its
// coordinates from the index. A dispatcher that reads the firmware's x/y
// (coordinate-routed Portable Shows) is declined with a reason and the
// artifact is left unchanged. Member sinks must already capture into RGB
// globals (the compiler forces `directColorSinks: false` when the option is
// set), so the only native paints are in generated code, and every one of
// them routes through the latch; a native hsv paint anywhere in generated
// code declines the option.
//
// Runs last, after every other generated-code pass and before symbol
// compaction, so it wraps the final dispatcher.
import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export interface SpatialHoldOptions {
  stride: 2 | 4
  mode: 'lerp'
}

export type SpatialHoldReason =
  | 'selected'
  | 'disabled'
  | 'coordinate-routed'
  | 'hsv-direct-paint'
  | 'stateful-cache'
  | 'no-dispatcher'

/** Generated machinery that marks itself ready at the terminal pixel index
 *  (Freeze, Refresh, Rolling Refresh, Trails, snapshot captures): under a
 *  hold the inner dispatcher never sees pixelCount - 1 in order, so these
 *  Shows are declined rather than left with a cache that never completes. */
const STATEFUL_CACHE_MARKERS = /__pxlblz_show_(freeze|refresh|rolling|trails|snapshot|capture_complete|stage_rgb|previous_rgb)/

export interface SpatialHoldResult {
  code: string
  selected: boolean
  reason: SpatialHoldReason
  latchedPaints: number
}

const LATCH = '__pxlblz_show_hold'

export function applySpatialHold(
  source: string,
  options: SpatialHoldOptions,
  excludeSources: readonly string[] = [],
): SpatialHoldResult {
  let ast: Node
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  } catch {
    return { code: source, selected: false, reason: 'no-dispatcher', latchedPaints: 0 }
  }
  const excluded = excludedRanges(source, excludeSources)
  const inExcluded = (node: Node) => excluded.some(([start, end]) => node.start >= start && node.end <= end)
  const entry = ast.body.find((statement: Node) => (
    statement.type === 'ExportNamedDeclaration'
    && statement.declaration?.type === 'FunctionDeclaration'
    && (statement.declaration.id.name === 'render2D' || statement.declaration.id.name === 'render')
  ))
  if (!entry) return { code: source, selected: false, reason: 'no-dispatcher', latchedPaints: 0 }
  const fn = entry.declaration
  const params: string[] = fn.params.map((param: Node) => param.name)
  // Eligibility: neither the dispatcher nor any generated function it hands
  // its coordinate parameters to may consume them. Passing a coordinate
  // straight through as a call argument is not a read; the callee is
  // checked with its own parameter names. A member function receiving the
  // firmware coordinates is a read (members normally get synthesized ones).
  const generated = new Map<string, Node>()
  for (const statement of ast.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type === 'FunctionDeclaration' && !inExcluded(statement)) generated.set(declaration.id.name, declaration)
  }
  const visited = new Set<string>()
  const pending: Array<{ node: Node; coordinates: Set<string> }> = [{ node: fn, coordinates: new Set(params.slice(1)) }]
  let readsCoordinates = false
  while (pending.length > 0 && !readsCoordinates) {
    const { node, coordinates } = pending.pop()!
    const key = `${node.id.name}:${[...coordinates].sort().join(',')}`
    if (visited.has(key)) continue
    visited.add(key)
    const passThrough = new Set<Node>()
    walk(node.body, (child) => {
      if (child.type !== 'CallExpression' || child.callee.type !== 'Identifier') return
      const callee = generated.get(child.callee.name)
      child.arguments.forEach((argument: Node, position: number) => {
        if (argument.type !== 'Identifier' || !coordinates.has(argument.name)) return
        if (!callee) { readsCoordinates = true; return } // a member or builtin consumes it
        passThrough.add(argument)
        const target = callee.params[position]
        if (target?.type === 'Identifier') pending.push({ node: callee, coordinates: new Set([target.name]) })
      })
    })
    walk(node.body, (child, parent, childKey) => {
      if (child.type !== 'Identifier' || !coordinates.has(child.name)) return
      if (passThrough.has(child)) return
      if (parent?.type === 'MemberExpression' && childKey === 'property' && !parent.computed) return
      readsCoordinates = true
    })
  }
  if (readsCoordinates) return { code: source, selected: false, reason: 'coordinate-routed', latchedPaints: 0 }
  // Native paints in generated code (outside member source).
  const paints: Node[] = []
  let hsvPaint = false
  for (const statement of ast.body) {
    if (inExcluded(statement)) continue
    walk(statement, (node) => {
      if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return
      if (node.callee.name === 'hsv' && !inExcluded(node)) hsvPaint = true
      if (node.callee.name === 'rgb' && !inExcluded(node)) paints.push(node)
    })
  }
  if (hsvPaint) return { code: source, selected: false, reason: 'hsv-direct-paint', latchedPaints: 0 }
  // Generated code only: authored members may name anything.
  let stateful = false
  for (const statement of ast.body) {
    if (inExcluded(statement)) continue
    if (STATEFUL_CACHE_MARKERS.test(source.slice(statement.start, statement.end))) { stateful = true; break }
  }
  if (stateful) return { code: source, selected: false, reason: 'stateful-cache', latchedPaints: 0 }
  const edits: Array<{ start: number; end: number; text: string }> = paints.map((call) => ({
    start: call.callee.start,
    end: call.callee.end,
    text: `${LATCH}_emit`,
  }))
  // Demote the export to the inner dispatcher.
  edits.push({ start: entry.start, end: fn.id.end, text: `function ${LATCH}_inner` })
  const stride = options.stride
  const entryParams = params.join(', ')
  const innerArgs = (indexExpression: string) => [indexExpression, ...params.slice(1)].join(', ')
  const helper = `var ${LATCH}_r = 0
var ${LATCH}_g = 0
var ${LATCH}_b = 0
var ${LATCH}_cr = 0
var ${LATCH}_cg = 0
var ${LATCH}_cb = 0
function ${LATCH}_emit(${LATCH}_er, ${LATCH}_eg, ${LATCH}_eb) {
  ${LATCH}_r = ${LATCH}_er
  ${LATCH}_g = ${LATCH}_eg
  ${LATCH}_b = ${LATCH}_eb
}
`
  const wrapper = `
export function ${fn.id.name}(${entryParams}) {
  var ${LATCH}_t = ${params[0]} % ${stride}
  if (${LATCH}_t == 0) {
    if (${params[0]} == 0) {
      ${LATCH}_inner(${innerArgs('0')})
    }
    ${LATCH}_cr = ${LATCH}_r
    ${LATCH}_cg = ${LATCH}_g
    ${LATCH}_cb = ${LATCH}_b
    ${LATCH}_inner(${innerArgs(`min(${params[0]} + ${stride}, pixelCount - 1)`)})
  }
  ${LATCH}_t = ${LATCH}_t / ${stride}
  rgb(
    ${LATCH}_cr + (${LATCH}_r - ${LATCH}_cr) * ${LATCH}_t,
    ${LATCH}_cg + (${LATCH}_g - ${LATCH}_cg) * ${LATCH}_t,
    ${LATCH}_cb + (${LATCH}_b - ${LATCH}_cb) * ${LATCH}_t
  )
}
`
  const sorted = edits.sort((left, right) => right.start - left.start)
  let code = source
  for (const edit of sorted) code = `${code.slice(0, edit.start)}${edit.text}${code.slice(edit.end)}`
  return { code: `${helper}${code}${wrapper}`, selected: true, reason: 'selected', latchedPaints: paints.length }
}

function excludedRanges(source: string, blocks: readonly string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let cursor = 0
  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue
    const start = source.indexOf(trimmed, cursor)
    if (start < 0) continue
    ranges.push([start, start + trimmed.length])
    cursor = start + trimmed.length
  }
  return ranges
}

function walk(node: Node, visit: (node: Node, parent: Node | null, key: string | null) => void): void {
  const inner = (current: Node, parent: Node | null, key: string | null) => {
    if (!current || typeof current.type !== 'string') return
    visit(current, parent, key)
    for (const childKey of Object.keys(current)) {
      if (childKey === 'type' || childKey === 'start' || childKey === 'end') continue
      const child = current[childKey]
      if (Array.isArray(child)) { for (const item of child) if (item && typeof item.type === 'string') inner(item, current, childKey) }
      else if (child && typeof child.type === 'string') inner(child, current, childKey)
    }
  }
  inner(node, null, null)
}
