// #929: inline trivial generated wrappers on the per-pixel path.
//
// #924 measured the simplest Show's machinery at ~16 us/pixel, and #532
// priced every user-function boundary at 1.9-3.4 us. The steady path walks
// several generated wrappers whose whole body is one or two trivial
// statements: `_renderCapture2D(index, x, y) { c_render2D(index, x, y) }`,
// `_emit() { rgb(c_r, c_g, c_b) }`, `_clear() { c_r = 0; c_g = 0; c_b = 0 }`.
//
// This pass runs on the assembled generated code (before symbol compaction)
// and inlines such wrappers at call sites that are standalone expression
// statements inside generated per-pixel functions:
//
//   - the wrapper is a non-exported generated function outside every
//     authored member's source block, not recursive, whose body is one to
//     three statements, each a call whose arguments are identifiers or
//     numeric literals, or an assignment of an identifier or literal to a
//     global;
//   - every call-site argument is an identifier or numeric literal, so
//     substituting it for the parameter evaluates nothing twice and nothing
//     out of order;
//   - no free identifier of the body is shadowed by a local of the caller.
//
// A wrapper with no remaining references is removed. Transition helpers are
// never inlined themselves (#520 keeps them isolated); inlining a trivial
// wrapper *into* one is fine. Exact by construction: the same calls run
// with the same arguments, minus the boundary.
import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export interface GeneratedWrapperInliningOptions {
  /** Verbatim authored member source blocks: functions inside them are
   * neither inlined nor rewritten. */
  excludeSources?: readonly string[]
  /** Generated functions whose bodies must stay byte-identical (the #520
   * transition helpers): never a caller, and wrappers they reference are
   * kept. Matched against the function name. */
  excludeCallers?: RegExp
  /** Maximum statements in an inlinable body (default 3). */
  maxBodyStatements?: number
}

/** #520: routed transition bodies are isolated in helpers whose shape is a
 *  hardware-activation boundary; nothing rewrites them. */
export const GENERATED_TRANSITION_HELPER_PATTERN = /transition/

export interface GeneratedWrapperInliningResult {
  code: string
  inlinedCalls: number
  removedWrappers: number
  wrappers: Array<{ name: string; sites: number; removed: boolean }>
}

const RENDER_EXPORTS = new Set(['render', 'render2D', 'render3D'])
const PURE_BUILTINS = new Set([
  'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'clamp', 'cos', 'exp', 'floor',
  'frac', 'hypot', 'log', 'max', 'min', 'pow', 'round', 'sin', 'sqrt', 'square',
  'tan', 'triangle', 'wave', 'rgb', 'hsv',
])

interface TopLevelFunction {
  name: string
  node: Node
  statement: Node
  exported: boolean
}

const MAX_ROUNDS = 4

export function inlineGeneratedWrappers(
  source: string,
  options: GeneratedWrapperInliningOptions = {},
): GeneratedWrapperInliningResult {
  // Wrappers nest (renderCapture -> render -> rgb), and a wrapper's own body
  // is never edited in the round that may remove it; rounds re-parse so a
  // chain collapses one link at a time without overlapping edits.
  const total: GeneratedWrapperInliningResult = { code: source, inlinedCalls: 0, removedWrappers: 0, wrappers: [] }
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const step = inlineOnce(total.code, options)
    if (step.code === total.code) break
    total.code = step.code
    total.inlinedCalls += step.inlinedCalls
    total.removedWrappers += step.removedWrappers
    for (const wrapper of step.wrappers) {
      const existing = total.wrappers.find((entry) => entry.name === wrapper.name)
      if (existing) {
        existing.sites += wrapper.sites
        existing.removed = existing.removed || wrapper.removed
      } else {
        total.wrappers.push({ ...wrapper })
      }
    }
  }
  return total
}

function inlineOnce(
  source: string,
  options: GeneratedWrapperInliningOptions,
): GeneratedWrapperInliningResult {
  const unchanged = { code: source, inlinedCalls: 0, removedWrappers: 0, wrappers: [] }
  let ast: Node
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  } catch {
    return unchanged
  }
  const maxBody = options.maxBodyStatements ?? 3
  const functions = topLevelFunctions(ast)
  const excluded = excludedRanges(source, options.excludeSources ?? [])
  const inExcluded = (entry: TopLevelFunction) => excluded.some(([start, end]) => entry.statement.start >= start && entry.statement.end <= end)

  // Wrapper candidates.
  interface Wrapper { entry: TopLevelFunction; params: string[]; statements: Node[]; freeNames: Set<string>; assigned: Set<string>; hazardParams: Set<string> }
  const wrappers = new Map<string, Wrapper>()
  for (const entry of functions) {
    if (entry.exported || inExcluded(entry)) continue
    if ((options.excludeCallers ?? GENERATED_TRANSITION_HELPER_PATTERN).test(entry.name)) continue
    if (!entry.node.params.every((param: Node) => param.type === 'Identifier')) continue
    const params: string[] = entry.node.params.map((param: Node) => param.name)
    const statements: Node[] = entry.node.body.body
    if (statements.length < 1 || statements.length > maxBody) continue
    const freeNames = new Set<string>()
    const assigned = new Set<string>()
    let trivial = true
    // A wrapper that references its own name (as a value) is not a
    // candidate: the copied body would keep the reference after removal.
    let selfReference = false
    walk(entry.node.body, (node, parent) => {
      if (node.type === 'Identifier' && node.name === entry.name && !(parent?.type === 'CallExpression' && parent.callee === node)) selfReference = true
    })
    if (selfReference) continue
    for (const statement of statements) {
      if (statement.type !== 'ExpressionStatement') { trivial = false; break }
      const expression = statement.expression
      if (expression.type === 'CallExpression') {
        if (expression.callee.type !== 'Identifier' || expression.callee.name === entry.name) { trivial = false; break }
        if (!expression.arguments.every((argument: Node) => isSimple(argument))) { trivial = false; break }
        freeNames.add(expression.callee.name)
        for (const argument of expression.arguments) if (argument.type === 'Identifier' && !params.includes(argument.name)) freeNames.add(argument.name)
      } else if (expression.type === 'AssignmentExpression') {
        if (expression.operator !== '=' || expression.left.type !== 'Identifier' || !isSimple(expression.right)) { trivial = false; break }
        if (params.includes(expression.left.name)) { trivial = false; break }
        freeNames.add(expression.left.name)
        assigned.add(expression.left.name)
        if (expression.right.type === 'Identifier' && !params.includes(expression.right.name)) freeNames.add(expression.right.name)
      } else {
        trivial = false
        break
      }
    }
    if (!trivial) continue
    // A parameter read AFTER a user call has completed (a call that ends
    // before the read starts) may observe a global the callee wrote; a
    // caller-global argument cannot be substituted for such a parameter.
    // A parameter read as that call's own argument is bound first and is safe.
    const userCallEnds: number[] = []
    walk(entry.node.body, (node) => {
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && !PURE_BUILTINS.has(node.callee.name)) userCallEnds.push(node.end)
    })
    const hazardParams = new Set<string>()
    walk(entry.node.body, (node) => {
      if (node.type === 'Identifier' && params.includes(node.name) && userCallEnds.some((end) => end <= node.start)) hazardParams.add(node.name)
    })
    wrappers.set(entry.name, { entry, params, statements, freeNames, assigned, hazardParams })
  }
  if (wrappers.size === 0) return unchanged

  // Call sites: standalone expression statements inside generated functions
  // (members excluded), never inside the wrapper's own definition.
  const edits: Array<{ start: number; end: number; text: string }> = []
  const siteCounts = new Map<string, number>()
  const excludeCallers = options.excludeCallers ?? GENERATED_TRANSITION_HELPER_PATTERN
  for (const caller of functions) {
    if (inExcluded(caller)) continue
    if (excludeCallers.test(caller.name)) continue
    if (caller.exported && !RENDER_EXPORTS.has(caller.name) && caller.name !== 'beforeRender') continue
    // A wrapper's own body waits for a later round, after it is either
    // inlined away or proven to stay.
    if (wrappers.has(caller.name)) continue
    const locals = localNames(caller.node)
    walk(caller.node.body, (node, parent) => {
      if (node.type !== 'ExpressionStatement' || node.expression.type !== 'CallExpression') return
      const call = node.expression
      if (call.callee.type !== 'Identifier') return
      const wrapper = wrappers.get(call.callee.name)
      if (!wrapper || wrapper.entry.name === caller.name) return
      if (call.arguments.length !== wrapper.params.length) return
      if (!call.arguments.every((argument: Node) => isSimple(argument))) return
      // A multi-statement body can only replace a statement that lives in a
      // block: as the bare consequent of `if (c) w()` or an `else` arm it
      // would spill past the branch.
      if (wrapper.statements.length > 1 && parent?.type !== 'BlockStatement') return
      for (const name of wrapper.freeNames) if (locals.has(name)) return
      // A parameter is bound at entry; substituting the caller's identifier
      // would re-read it after the body's own writes. Refuse a site whose
      // argument names anything the body assigns.
      for (const [position, argument] of call.arguments.entries()) {
        if (argument.type !== 'Identifier') continue
        if (wrapper.assigned.has(argument.name)) return
        // A caller global substituted for a parameter read after a user
        // call could observe that call's writes; the caller's own locals
        // cannot (no closures on this VM).
        if (wrapper.hazardParams.has(wrapper.params[position]) && !locals.has(argument.name)) return
        // A wrapper passed as an argument would survive in the copy.
        if (wrappers.has(argument.name)) return
      }
      const substitution = new Map<string, string>()
      wrapper.params.forEach((param, index) => {
        substitution.set(param, source.slice(call.arguments[index].start, call.arguments[index].end))
      })
      const indent = indentationAt(source, node.start)
      const text = wrapper.statements
        .map((statement) => substituteIdentifiers(source, statement, wrapper.params, substitution))
        .join(`\n${indent}`)
      edits.push({ start: node.start, end: node.end, text })
      siteCounts.set(wrapper.entry.name, (siteCounts.get(wrapper.entry.name) ?? 0) + 1)
    })
  }
  if (edits.length === 0) return unchanged

  // Remove wrappers that no longer have any reference outside their own
  // definition once the inlined sites are gone.
  const removed = new Set<string>()
  for (const [name, wrapper] of wrappers) {
    if (!siteCounts.has(name)) continue
    let references = 0
    walk(ast, (node, parent) => {
      if (node.type !== 'Identifier' || node.name !== name) return
      if (parent?.type === 'FunctionDeclaration' && parent.id === node) return
      if (node.start >= wrapper.entry.statement.start && node.end <= wrapper.entry.statement.end) return
      // A call site being inlined no longer references the wrapper through
      // its callee, but its arguments are copied into the replacement.
      const site = edits.find((edit) => node.start >= edit.start && node.end <= edit.end)
      if (site && parent?.type === 'CallExpression' && parent.callee === node) return
      references += 1
    })
    if (references === 0) {
      removed.add(name)
      const statement = wrapper.entry.statement
      const end = source[statement.end] === '\n' ? statement.end + 1 : statement.end
      edits.push({ start: statement.start, end, text: '' })
    }
  }
  const sorted = [...edits].sort((left, right) => right.start - left.start || right.end - left.end)
  let code = source
  for (const edit of sorted) code = `${code.slice(0, edit.start)}${edit.text}${code.slice(edit.end)}`
  return {
    code,
    inlinedCalls: edits.length - removed.size,
    removedWrappers: removed.size,
    wrappers: [...siteCounts].map(([name, sites]) => ({ name, sites, removed: removed.has(name) })),
  }
}

function isSimple(node: Node): boolean {
  return node.type === 'Identifier' || (node.type === 'Literal' && typeof node.value === 'number')
}

function substituteIdentifiers(
  source: string,
  statement: Node,
  params: string[],
  substitution: Map<string, string>,
): string {
  const edits: Array<{ start: number; end: number; text: string }> = []
  walk(statement, (node, parent, key) => {
    if (node.type !== 'Identifier' || !params.includes(node.name)) return
    if (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) return
    edits.push({ start: node.start, end: node.end, text: substitution.get(node.name)! })
  })
  let text = source.slice(statement.start, statement.end)
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    text = `${text.slice(0, edit.start - statement.start)}${edit.text}${text.slice(edit.end - statement.start)}`
  }
  // One statement per line at the call site; the wrapper's inline `;` separators go.
  return text.replace(/;\s*$/, '')
}

function indentationAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1
  const line = source.slice(lineStart, offset)
  return /^\s*$/.test(line) ? line : ''
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

function localNames(fn: Node): Set<string> {
  const names = new Set<string>()
  for (const param of fn.params) if (param.type === 'Identifier') names.add(param.name)
  walk(fn.body, (node) => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') names.add(node.id.name)
  })
  return names
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
      if (Array.isArray(child)) {
        for (const item of child) if (item && typeof item.type === 'string') inner(item, current, childKey)
      } else if (child && typeof child.type === 'string') {
        inner(child, current, childKey)
      }
    }
  }
  inner(node, null, null)
}
