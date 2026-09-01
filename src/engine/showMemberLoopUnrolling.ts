// #931: loop machinery in member render paths.
//
// #924 priced a `for` iteration's compare + branch + increment at 2.90 us
// with `i++` and 4.6 us with the catalogue's dominant `i = i + 1` idiom.
// Two exact rewrites over authored member source, run after tiny-helper
// inlining and before frame-invariant analysis (an unrolled copy turns
// `sin(t + i)` into `sin(t + 3)`, which the hoist can then lift):
//
//   1. Idiom rewrite: every `for` update of the form `i = i + 1` becomes
//      `i++`. Same value, one fewer expression to evaluate per iteration.
//   2. Unrolling: a render-reachable `for` loop whose induction variable
//      starts at an integer literal, is bounded by an integer literal or a
//      module constant that nothing ever writes, steps by one, and whose
//      body neither writes the induction variable nor breaks, continues,
//      returns, declares a function, or contains another loop, is replaced
//      by its body repeated once per trip with the induction variable
//      substituted by the trip's literal. The first copy keeps its `var`
//      declarations; later copies assign, so no name is declared twice.
//      If the function reads the induction variable after the loop, the
//      loop's exit value is assigned once after the block.
//
// Both rewrites preserve every operation and its order, so Fast and Precise
// checksums hold; the compiled-Show parity test over the stock catalogue is
// the oracle. Unrolling is gated by trip count and a source-growth
// allowance because bytecode grows by trip x body.
import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export interface ShowMemberLoopUnrollingOptions {
  /** Largest trip count unrolled (default 16). */
  maxTripCount?: number
  /** Net source-growth allowance per member (default 8,192 bytes). Loops
   * are taken in source order until the next one would exceed it. */
  growthAllowanceBytes?: number
  /** Unroll at all (the idiom rewrite always runs). */
  unroll?: boolean
}

export interface ShowMemberLoopUnrollingResult {
  source: string
  rewrittenIncrements: number
  unrolledLoops: number
  unrolledTrips: number
  addedSourceBytes: number
  skipped: Array<{ line: number; reason: string }>
}

const RENDER_ENTRY_NAMES = ['render', 'render2D', 'render3D']
const MAX_ROUNDS = 3

export function unrollShowMemberLoops(
  source: string,
  options: ShowMemberLoopUnrollingOptions = {},
): ShowMemberLoopUnrollingResult {
  const maxTripCount = options.maxTripCount ?? 16
  const allowance = options.growthAllowanceBytes ?? 8_192
  const unroll = options.unroll ?? true
  const result: ShowMemberLoopUnrollingResult = {
    source,
    rewrittenIncrements: 0,
    unrolledLoops: 0,
    unrolledTrips: 0,
    addedSourceBytes: 0,
    skipped: [],
  }
  const originalLength = source.length
  // Round 0: the idiom rewrite everywhere. Rounds 1..n: unroll innermost
  // eligible loops, re-parsing between rounds so an outer loop whose inner
  // loop just disappeared becomes eligible.
  let current = rewriteIncrementIdiom(source, result)
  if (unroll) {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      // Each round re-analyzes every loop; only the final round's verdicts
      // describe the delivered source.
      result.skipped = []
      const next = unrollOnce(current, { maxTripCount, allowance, originalLength }, result)
      if (next === current) break
      current = next
    }
  }
  result.source = current
  result.addedSourceBytes = current.length - originalLength
  return result
}

function parse(source: string): Node | null {
  try {
    return acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  } catch {
    return null
  }
}

function rewriteIncrementIdiom(source: string, result: ShowMemberLoopUnrollingResult): string {
  const ast = parse(source)
  if (!ast) return source
  const edits: Array<{ start: number; end: number; text: string }> = []
  walk(ast, (node) => {
    if (node.type !== 'ForStatement' || !node.update) return
    const update = node.update
    if (
      update.type === 'AssignmentExpression'
      && update.operator === '='
      && update.left.type === 'Identifier'
      && update.right.type === 'BinaryExpression'
      && update.right.operator === '+'
      && update.right.left.type === 'Identifier'
      && update.right.left.name === update.left.name
      && update.right.right.type === 'Literal'
      && update.right.right.value === 1
    ) {
      edits.push({ start: update.start, end: update.end, text: `${update.left.name}++` })
    }
  })
  result.rewrittenIncrements += edits.length
  return applyEdits(source, edits)
}

interface UnrollBudget { maxTripCount: number; allowance: number; originalLength: number }

function unrollOnce(source: string, budget: UnrollBudget, result: ShowMemberLoopUnrollingResult): string {
  const ast = parse(source)
  if (!ast) return source
  const functions = topLevelFunctions(ast)
  const byName = new Map(functions.map((entry) => [entry.name, entry.node]))
  const renderReachable = reachableFrom(RENDER_ENTRY_NAMES.filter((name) => byName.has(name)), byName)
  const constants = moduleConstants(ast)
  const edits: Array<{ start: number; end: number; text: string }> = []
  let growth = source.length - budget.originalLength
  for (const name of renderReachable) {
    const fn = byName.get(name)!
    const locals = localNames(fn)
    const loops: Node[] = []
    walk(fn.body, (node) => { if (node.type === 'ForStatement') loops.push(node) })
    for (const loop of loops) {
      const verdict = analyzeLoop(loop, source, constants, locals, budget.maxTripCount)
      if ('reason' in verdict) {
        // Only report loops that could plausibly have been meant for
        // unrolling: literal or constant bounds.
        if (verdict.reason !== 'variable-bound') result.skipped.push({ line: lineOf(source, loop.start), reason: verdict.reason })
        continue
      }
      const usedAfter = inductionReadOutsideLoop(fn, loop, verdict.induction)
      const text = expandLoop(source, loop, verdict, usedAfter)
      const delta = text.length - (loop.end - loop.start)
      if (growth + delta > budget.allowance) {
        result.skipped.push({ line: lineOf(source, loop.start), reason: 'growth-allowance' })
        continue
      }
      growth += delta
      edits.push({ start: loop.start, end: loop.end, text })
      result.unrolledLoops += 1
      result.unrolledTrips += verdict.trip
    }
  }
  return applyEdits(source, edits)
}

interface LoopVerdict {
  induction: string
  from: number
  trip: number
  exitValue: number
}

function analyzeLoop(
  loop: Node,
  source: string,
  constants: Map<string, number>,
  locals: Set<string>,
  maxTripCount: number,
): LoopVerdict | { reason: string } {
  const init = loop.init
  let induction: string | null = null
  let from: number | null = null
  if (init?.type === 'VariableDeclaration' && init.declarations.length === 1) {
    const declarator = init.declarations[0]
    if (declarator.id.type === 'Identifier' && isIntegerLiteral(declarator.init)) {
      induction = declarator.id.name
      from = declarator.init.value
    }
  } else if (init?.type === 'AssignmentExpression' && init.operator === '=' && init.left.type === 'Identifier' && isIntegerLiteral(init.right)) {
    // An assignment initializer may target a module global that other
    // functions observe (`var i = 0; function f() { total += i }`); only a
    // local of this function is safe to erase.
    if (!locals.has(init.left.name)) return { reason: 'global-induction' }
    induction = init.left.name
    from = init.right.value
  }
  if (induction == null || from == null) return { reason: 'init-shape' }
  const bodyStatements: Node[] = loop.body.type === 'BlockStatement' ? loop.body.body : [loop.body]
  if (bodyStatements.length === 0 || (loop.body.type === 'EmptyStatement')) return { reason: 'empty-body' }
  const test = loop.test
  if (!test || test.type !== 'BinaryExpression' || test.left.type !== 'Identifier' || test.left.name !== induction) {
    return { reason: 'test-shape' }
  }
  const bound: number | undefined = isIntegerLiteral(test.right)
    ? test.right.value
    : test.right.type === 'Identifier' && !locals.has(test.right.name)
      ? constants.get(test.right.name)
      : undefined
  if (bound === undefined) return { reason: 'variable-bound' }
  let trip: number
  let exitValue: number
  if (test.operator === '<') { trip = bound - from; exitValue = bound }
  else if (test.operator === '<=') { trip = bound - from + 1; exitValue = bound + 1 }
  else return { reason: 'test-operator' }
  const update = loop.update
  const stepsByOne = update && (
    (update.type === 'UpdateExpression' && update.operator === '++' && update.argument.type === 'Identifier' && update.argument.name === induction)
    || (update.type === 'AssignmentExpression' && update.operator === '+=' && update.left.type === 'Identifier' && update.left.name === induction && isIntegerLiteral(update.right) && update.right.value === 1)
  )
  if (!stepsByOne) return { reason: 'update-shape' }
  if (!Number.isInteger(trip) || trip < 2) return { reason: 'trip-count' }
  if (trip > maxTripCount) return { reason: 'trip-count' }
  let hazard: string | null = null
  walk(loop.body, (node) => {
    if (hazard) return
    if (node.type === 'BreakStatement' || node.type === 'ContinueStatement' || node.type === 'ReturnStatement') hazard = 'control-flow'
    else if (node.type === 'ForStatement' || node.type === 'WhileStatement' || node.type === 'DoWhileStatement') hazard = 'nested-loop'
    else if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') hazard = 'nested-function'
    else if (node.type === 'AssignmentExpression' && patternIdentifiers(node.left).includes(induction!)) hazard = 'writes-induction'
    else if (node.type === 'UpdateExpression' && patternIdentifiers(node.argument).includes(induction!)) hazard = 'writes-induction'
    else if (node.type === 'VariableDeclarator' && patternIdentifiers(node.id).includes(induction!)) hazard = 'writes-induction'
  })
  if (hazard) return { reason: hazard }
  void source
  return { induction, from, trip, exitValue }
}

function expandLoop(source: string, loop: Node, verdict: LoopVerdict, usedAfter: boolean): string {
  const body = loop.body
  const statements: Node[] = body.type === 'BlockStatement' ? body.body : [body]
  const sliceStart = statements[0].start
  const sliceEnd = statements[statements.length - 1].end
  // Induction-variable read sites, slice-relative.
  const reads: Array<{ start: number; end: number }> = []
  const declarations: Node[] = []
  for (const statement of statements) {
    walk(statement, (node, parent, key) => {
      if (node.type === 'Identifier' && node.name === verdict.induction && isReadPosition(parent, key)) {
        reads.push({ start: node.start - sliceStart, end: node.end - sliceStart })
      }
      if (node.type === 'VariableDeclaration' && node.declarations.length > 0) declarations.push(node)
    })
  }
  const slice = source.slice(sliceStart, sliceEnd)
  const substitute = (from: number, to: number, value: number): string => applyEdits(
    slice.slice(from, to),
    reads.filter((read) => read.start >= from && read.end <= to)
      .map((read) => ({ start: read.start - from, end: read.end - from, text: String(value) })),
  )
  const copies: string[] = []
  for (let k = 0; k < verdict.trip; k += 1) {
    const value = verdict.from + k
    if (k === 0) {
      copies.push(substitute(0, slice.length, value))
      continue
    }
    // Later copies assign instead of redeclaring, one statement per
    // declarator: the Controller compiler has no comma expression, so
    // `var a = 1, b = 2` becomes two assignment statements.
    const edits = declarations.map((declaration) => {
      const parts = declaration.declarations
        .filter((declarator: Node) => declarator.init)
        .map((declarator: Node) => (
          `${source.slice(declarator.id.start, declarator.id.end)} = ${substitute(declarator.init.start - sliceStart, declarator.init.end - sliceStart, value)}`
        ))
      return { start: declaration.start - sliceStart, end: declaration.end - sliceStart, text: parts.join('\n') }
    })
    const outsideDeclarations = reads
      .filter((read) => !declarations.some((declaration) => read.start >= declaration.start - sliceStart && read.end <= declaration.end - sliceStart))
      .map((read) => ({ start: read.start, end: read.end, text: String(value) }))
    copies.push(applyEdits(slice, [...edits, ...outsideDeclarations]))
  }
  const exit = usedAfter ? `\n${verdict.induction} = ${verdict.exitValue}` : ''
  const declared = loop.init?.type === 'VariableDeclaration'
  const declaration = declared && usedAfter ? `var ${verdict.induction}\n` : ''
  return `${declaration}{\n${copies.join('\n')}\n}${exit}`
}

function inductionReadOutsideLoop(fn: Node, loop: Node, induction: string): boolean {
  let found = false
  walk(fn.body, (node, parent, key) => {
    if (found) return
    if (node.start >= loop.start && node.end <= loop.end) return
    if (node.type === 'Identifier' && node.name === induction && isReadPosition(parent, key)) found = true
    // Assignments to the induction variable after the loop are also reads
    // of position: they need the name declared, so keep the exit value.
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier' && node.left.name === induction) found = true
  })
  return found
}

function isReadPosition(parent: Node | null, key: string | null): boolean {
  if (!parent) return true
  if (parent.type === 'VariableDeclarator' && key === 'id') return false
  if (parent.type === 'AssignmentExpression' && key === 'left') return false
  if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) return false
  if (parent.type === 'Property' && key === 'key' && !parent.computed) return false
  if (parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression') return false
  return true
}

function isIntegerLiteral(node: Node | null | undefined): node is Node {
  return Boolean(node) && node!.type === 'Literal' && typeof node!.value === 'number' && Number.isInteger(node!.value)
}

function moduleConstants(ast: Node): Map<string, number> {
  const candidates = new Map<string, number>()
  for (const statement of ast.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const declarator of declaration.declarations) {
      if (declarator.id.type === 'Identifier' && isIntegerLiteral(declarator.init)) candidates.set(declarator.id.name, declarator.init.value)
    }
  }
  walk(ast, (node) => {
    if (node.type === 'AssignmentExpression') for (const name of patternIdentifiers(node.left)) candidates.delete(name)
    if (node.type === 'UpdateExpression') for (const name of patternIdentifiers(node.argument)) candidates.delete(name)
  })
  // A second declaration of the same name anywhere (a local shadow in some
  // function) is handled per function by `locals`; a second module-scope
  // declaration disqualifies.
  const seen = new Map<string, number>()
  for (const statement of ast.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== 'Identifier') continue
      seen.set(declarator.id.name, (seen.get(declarator.id.name) ?? 0) + 1)
    }
  }
  for (const [name, count] of seen) if (count > 1) candidates.delete(name)
  return candidates
}

function topLevelFunctions(ast: Node): Array<{ name: string; node: Node }> {
  const result: Array<{ name: string; node: Node }> = []
  for (const statement of ast.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type === 'FunctionDeclaration') result.push({ name: declaration.id.name, node: declaration })
  }
  return result
}

function reachableFrom(roots: string[], byName: Map<string, Node>): Set<string> {
  const seen = new Set<string>()
  const stack = [...roots]
  while (stack.length > 0) {
    const name = stack.pop()!
    if (seen.has(name)) continue
    seen.add(name)
    walk(byName.get(name)!.body, (node) => {
      if (node.type === 'Identifier' && byName.has(node.name) && !seen.has(node.name)) stack.push(node.name)
    })
  }
  return seen
}

function localNames(fn: Node): Set<string> {
  const names = new Set<string>()
  for (const param of fn.params) for (const name of patternIdentifiers(param)) names.add(name)
  walk(fn.body, (node) => {
    if (node.type === 'VariableDeclarator') for (const name of patternIdentifiers(node.id)) names.add(name)
  })
  return names
}

function patternIdentifiers(pattern: Node): string[] {
  if (!pattern) return []
  if (pattern.type === 'Identifier') return [pattern.name]
  if (pattern.type === 'MemberExpression') return []
  const names: string[] = []
  walk(pattern, (node) => { if (node.type === 'Identifier') names.push(node.name) })
  return names
}

function lineOf(source: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset && index < source.length; index += 1) if (source.charCodeAt(index) === 10) line += 1
  return line
}

function applyEdits(source: string, edits: Array<{ start: number; end: number; text: string }>): string {
  const sorted = [...edits].sort((left, right) => right.start - left.start || right.end - left.end)
  let out = source
  for (const edit of sorted) out = `${out.slice(0, edit.start)}${edit.text}${out.slice(edit.end)}`
  return out
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
