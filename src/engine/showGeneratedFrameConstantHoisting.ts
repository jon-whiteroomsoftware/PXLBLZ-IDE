// #928: hoist frame-constant generated expressions out of per-pixel code.
//
// The Show emitter writes routing arms that recompute the same values for
// every pixel: `ceil(sqrt(pixelCount))`, `max(1, floor(pixelCount * split))`,
// and their relatives. The wave-5 census over all 40 stock Shows counted 189
// `ceil(sqrt(...))` and 169 `floor(pixelCount * ...)` sites inside render2D
// bodies. Every one of them depends only on `pixelCount`, literals, and
// globals the scheduler writes once per frame, so each is a frame constant.
//
// This pass runs on the assembled generated code before symbol compaction.
// It finds maximal pure built-in subtrees in per-pixel functions whose free
// identifiers are all frame-stable, replaces each distinct subtree with one
// per-frame global, and refreshes those globals at the very end of
// `beforeRender` — after every scheduler write. Exact by construction: the
// same operations run in the same order once per frame instead of once per
// pixel, and the firmware (and the preview) call `beforeRender` before any
// render call of the frame.
//
// Soundness rules, in order of what each protects against:
//   1. Only scalar globals declared at module scope (plus `pixelCount`) can
//      be frame-stable, and only when every write to them is lexically in
//      module scope, in `beforeRender`, or in a function reachable ONLY from
//      `beforeRender`. A write anywhere else (a per-pixel arm, a boundary
//      block, a control handler) makes the identifier unstable.
//   2. Functions reachable from `beforeRender` are never rewritten: a helper
//      that runs before the scheduler's later writes must keep computing its
//      own values.
//   3. Exported control handlers are never rewritten: they can run before the
//      first frame's `beforeRender`.
//   4. A local (parameter or `var`) that shadows a stable global disqualifies
//      the identifier inside that function.
//   5. If `beforeRender` contains a `return`, the refresh block is also
//      placed in front of that return, so no exit path skips it.
//   6. Authored member source is never rewritten (the caller passes each
//      member's Pattern code as an excluded block), and the number of new
//      globals is capped by the persistent-global residual.
import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export interface GeneratedFrameConstantHoist {
  name: string
  expression: string
  sites: number
}

export interface GeneratedFrameConstantHoistingResult {
  code: string
  hoists: GeneratedFrameConstantHoist[]
  replacedSites: number
}

export const GENERATED_FRAME_CONSTANT_PREFIX = '__pxlblz_show_frame_const_'
const BUILTIN_FRAME_STABLE = new Set(['pixelCount'])
const PURE_BUILTINS = new Set(['ceil', 'sqrt', 'floor', 'max', 'min', 'abs', 'round', 'clamp'])
const BINARY_OPERATORS = new Set(['+', '-', '*', '/', '%'])
const RENDER_EXPORTS = new Set(['render', 'render2D', 'render3D'])

interface TopLevelFunction {
  name: string
  node: Node
  statement: Node
  exported: boolean
}

export interface GeneratedFrameConstantHoistingOptions {
  /** Verbatim source blocks (authored member Patterns) that must stay
   * untouched: functions starting inside any of them are never rewritten,
   * so a member still reads like the Pattern its author wrote and the
   * source inventory can find it byte-for-byte. */
  excludeSources?: readonly string[]
  /** Cap on distinct globals introduced (the persistent-global budget
   * residual); hoists are taken in descending site count. */
  maxHoists?: number
}

export function hoistGeneratedFrameConstants(
  source: string,
  options: GeneratedFrameConstantHoistingOptions = {},
): GeneratedFrameConstantHoistingResult {
  const unchanged = { code: source, hoists: [], replacedSites: 0 }
  if (options.maxHoists !== undefined && options.maxHoists <= 0) return unchanged
  const excluded = excludedRanges(source, options.excludeSources ?? [])
  let ast: Node
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  } catch {
    return unchanged
  }
  const functions = topLevelFunctions(ast)
  const beforeRender = functions.find((entry) => entry.name === 'beforeRender' && entry.exported)
  if (!beforeRender) return unchanged
  const byName = new Map(functions.map((entry) => [entry.name, entry]))
  const moduleVars = moduleScopeVariables(ast)

  // Call graph and the frame-only set (rule 2 and the writer rule 1).
  const callees = new Map<string, Set<string>>()
  for (const entry of functions) callees.set(entry.name, directCallees(entry.node, byName))
  const reachableFromBeforeRender = reachable('beforeRender', callees)
  const frameOnly = new Set(reachableFromBeforeRender)
  let shrank = true
  while (shrank) {
    shrank = false
    for (const name of [...frameOnly]) {
      const outsideCaller = functions.some((caller) => (
        caller.name !== 'beforeRender'
        && !frameOnly.has(caller.name)
        && callees.get(caller.name)!.has(name)
      ))
      if (outsideCaller) {
        frameOnly.delete(name)
        shrank = true
      }
    }
  }

  // Writers per identifier: 'module', or the owning top-level function name.
  const writers = new Map<string, Set<string>>()
  const recordWrite = (name: string, owner: string) => {
    let set = writers.get(name)
    if (!set) writers.set(name, (set = new Set()))
    set.add(owner)
  }
  for (const statement of ast.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type === 'FunctionDeclaration') {
      walk(declaration.body, (node) => collectWrites(node, (name) => recordWrite(name, declaration.id.name)))
    } else {
      walk(statement, (node) => collectWrites(node, (name) => recordWrite(name, 'module')))
    }
  }
  const stableWriters = new Set(['module', 'beforeRender', ...frameOnly])
  const frameStable = (name: string): boolean => {
    if (BUILTIN_FRAME_STABLE.has(name)) return true
    if (!moduleVars.has(name)) return false
    const owners = writers.get(name)
    if (!owners) return true
    for (const owner of owners) if (!stableWriters.has(owner)) return false
    return true
  }

  // Candidate sites in per-pixel functions (rules 2-4).
  interface Site { start: number; end: number; expression: string }
  const sites: Site[] = []
  for (const entry of functions) {
    if (entry.name === 'beforeRender' || reachableFromBeforeRender.has(entry.name)) continue
    if (entry.exported && !RENDER_EXPORTS.has(entry.name)) continue
    if (excluded.some(([start, end]) => entry.statement.start >= start && entry.statement.end <= end)) continue
    const locals = localNames(entry.node)
    const stableHere = (name: string) => !locals.has(name) && frameStable(name)
    collectSites(entry.node.body, stableHere, source, sites)
  }
  if (sites.length === 0) return unchanged

  // Distinct expressions, ranked by site count, capped by the global budget.
  const siteCounts = new Map<string, number>()
  for (const site of sites) siteCounts.set(site.expression, (siteCounts.get(site.expression) ?? 0) + 1)
  const firstSeen = [...siteCounts.keys()]
  const ranked = firstSeen
    .map((expression, order) => ({ expression, order, count: siteCounts.get(expression)! }))
    .sort((left, right) => right.count - left.count || left.order - right.order)
    .slice(0, options.maxHoists ?? Number.POSITIVE_INFINITY)
  const nameByExpression = new Map<string, string>()
  const hoists: GeneratedFrameConstantHoist[] = ranked.map((entry, index) => {
    const name = `${GENERATED_FRAME_CONSTANT_PREFIX}${index}`
    nameByExpression.set(entry.expression, name)
    return { name, expression: entry.expression, sites: entry.count }
  })
  const selectedSites = sites.filter((site) => nameByExpression.has(site.expression))
  if (selectedSites.length === 0) return unchanged

  // Text edits, applied from the end so earlier offsets stay valid.
  const edits: Array<{ start: number; end: number; text: string }> = selectedSites.map((site) => ({
    start: site.start,
    end: site.end,
    text: nameByExpression.get(site.expression)!,
  }))
  const declarations = hoists.map((hoist) => `var ${hoist.name} = 0`).join('\n')
  const refresh = hoists.map((hoist) => `  ${hoist.name} = ${hoist.expression}`).join('\n')
  edits.push({ start: beforeRender.statement.start, end: beforeRender.statement.start, text: `${declarations}\n` })
  const bodyEnd = beforeRender.node.body.end - 1
  edits.push({ start: bodyEnd, end: bodyEnd, text: `${refresh}\n` })
  // Rule 5: an early `return` inside beforeRender gets the refresh block in
  // front of it, so no exit path skips it. The exported signature and body
  // shape stay where later passes and the source inventory expect them.
  for (const statement of returnStatements(beforeRender.node.body)) {
    edits.push({
      start: statement.start,
      end: statement.end,
      text: `{\n${refresh}\n${source.slice(statement.start, statement.end)}\n}`,
    })
  }
  edits.sort((left, right) => right.start - left.start || right.end - left.end)
  let code = source
  for (const edit of edits) code = `${code.slice(0, edit.start)}${edit.text}${code.slice(edit.end)}`
  return { code, hoists, replacedSites: selectedSites.length }
}

function topLevelFunctions(ast: Node): TopLevelFunction[] {
  const result: TopLevelFunction[] = []
  for (const statement of ast.body) {
    if (statement.type === 'FunctionDeclaration') {
      result.push({ name: statement.id.name, node: statement, statement, exported: false })
    } else if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'FunctionDeclaration') {
      result.push({ name: statement.declaration.id.name, node: statement.declaration, statement, exported: true })
    }
  }
  return result
}

function moduleScopeVariables(ast: Node): Set<string> {
  const names = new Set<string>()
  for (const statement of ast.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const declarator of declaration.declarations) {
      if (declarator.id.type === 'Identifier') names.add(declarator.id.name)
    }
  }
  return names
}

function directCallees(fn: Node, byName: Map<string, TopLevelFunction>): Set<string> {
  const names = new Set<string>()
  walk(fn.body, (node) => {
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && byName.has(node.callee.name)) {
      names.add(node.callee.name)
    }
    // A function value passed or stored anywhere counts as a potential call
    // site of unknown owner; treat it as reachable from everywhere by
    // marking it a callee here AND leaving it unstable via the writer rule.
    if (node.type === 'Identifier' && byName.has(node.name)) names.add(node.name)
  })
  return names
}

function reachable(root: string, callees: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>()
  const stack = [...(callees.get(root) ?? [])]
  while (stack.length > 0) {
    const name = stack.pop()!
    if (seen.has(name)) continue
    seen.add(name)
    for (const next of callees.get(name) ?? []) if (!seen.has(next)) stack.push(next)
  }
  return seen
}

function collectWrites(node: Node, record: (name: string) => void): void {
  if (node.type === 'AssignmentExpression') {
    for (const name of patternIdentifiers(node.left)) record(name)
  } else if (node.type === 'UpdateExpression') {
    for (const name of patternIdentifiers(node.argument)) record(name)
  } else if (node.type === 'VariableDeclarator' && node.init) {
    for (const name of patternIdentifiers(node.id)) record(name)
  }
}

function patternIdentifiers(pattern: Node): string[] {
  if (pattern.type === 'Identifier') return [pattern.name]
  if (pattern.type === 'MemberExpression') return [] // array element writes never retarget a scalar
  const names: string[] = []
  walk(pattern, (node) => { if (node.type === 'Identifier') names.push(node.name) })
  return names
}

function localNames(fn: Node): Set<string> {
  const names = new Set<string>()
  for (const param of fn.params) for (const name of patternIdentifiers(param)) names.add(name)
  walk(fn.body, (node) => {
    if (node.type === 'VariableDeclarator') for (const name of patternIdentifiers(node.id)) names.add(name)
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      for (const param of node.params) for (const name of patternIdentifiers(param)) names.add(name)
      if (node.id) names.add(node.id.name)
    }
  })
  return names
}

function returnStatements(body: Node): Node[] {
  const found: Node[] = []
  walk(body, (node) => {
    if (node.type === 'ReturnStatement') found.push(node)
  }, (node) => node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression')
  return found
}

/** Byte ranges of every verbatim occurrence of each excluded source block,
 *  searched in order the way the source inventory does. */
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

function collectSites(
  body: Node,
  stable: (name: string) => boolean,
  source: string,
  sites: Array<{ start: number; end: number; expression: string }>,
): void {
  const visit = (node: Node, parent: Node | null, key: string | null): void => {
    if (!node || typeof node.type !== 'string') return
    if (isExpressionPosition(parent, key) && isInvariant(node, stable) && containsCall(node)) {
      sites.push({ start: node.start, end: node.end, expression: source.slice(node.start, node.end) })
      return
    }
    for (const childKey of Object.keys(node)) {
      if (childKey === 'type' || childKey === 'start' || childKey === 'end') continue
      const child = node[childKey]
      if (Array.isArray(child)) {
        for (const item of child) if (item && typeof item.type === 'string') visit(item, node, childKey)
      } else if (child && typeof child.type === 'string') {
        visit(child, node, childKey)
      }
    }
  }
  visit(body, null, null)
}

/** Only rewrite nodes that sit in value position: never a declarator id,
 *  an assignment target, a callee, or a member-expression property. */
function isExpressionPosition(parent: Node | null, key: string | null): boolean {
  if (!parent || !key) return false
  if (parent.type === 'VariableDeclarator') return key === 'init'
  if (parent.type === 'AssignmentExpression') return key === 'right'
  if (parent.type === 'CallExpression') return key === 'arguments'
  if (parent.type === 'MemberExpression') return key === 'object' || (key === 'property' && parent.computed === true)
  if (parent.type === 'UpdateExpression') return false
  return true
}

function isInvariant(node: Node, stable: (name: string) => boolean): boolean {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'number'
    case 'Identifier':
      return stable(node.name)
    case 'UnaryExpression':
      return (node.operator === '-' || node.operator === '+') && isInvariant(node.argument, stable)
    case 'BinaryExpression':
      return BINARY_OPERATORS.has(node.operator) && isInvariant(node.left, stable) && isInvariant(node.right, stable)
    case 'CallExpression':
      return node.callee.type === 'Identifier'
        && PURE_BUILTINS.has(node.callee.name)
        && node.arguments.every((argument: Node) => isInvariant(argument, stable))
    default:
      return false
  }
}

function containsCall(node: Node): boolean {
  let found = false
  walk(node, (child) => { if (child.type === 'CallExpression') found = true })
  return found
}

function walk(node: Node, visit: (node: Node) => void, stopAt?: (node: Node) => boolean): void {
  if (!node || typeof node.type !== 'string') return
  visit(node)
  if (stopAt?.(node)) return
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) if (item && typeof item.type === 'string') walk(item, visit, stopAt)
    } else if (child && typeof child.type === 'string') {
      walk(child, visit, stopAt)
    }
  }
}
