// #933: integer-exponent `pow` lowered to multiplies in member source.
//
// Priced on the pb32 (fw 3.67, issue933-probe-rows.md): `pow(base, 3)` and
// `pow(base, 4)` cost 7.63 us against 3.62 / 4.70 us for the multiply chain
// with the base hoisted to one local, or ~1.6 / 2.4 us when the base is a
// plain name and needs no hoist. `pow(base, 2)` has a firmware fast path
// (2.28 us) that beats a hoisted chain (2.54 us) and only loses to `b * b`
// on a plain name (0.79 us), so k = 2 is rewritten only without a temp.
//
// This is a DISPLAY-EXACT pass, not a checksum-exact one: the firmware's
// pow rounds differently from the multiply chain by a 16.16 LSB (measured:
// pow(-0.37, 3) = -0.050644, chain -0.050659), and Fast float64 pow and
// repeated multiply differ by ULPs. The tier is proven per artifact by the
// drift tool (max 8-bit channel delta 0 in both modes, benchCore
// `qualifyDisplayExact`), never assumed from this transform. The option is
// off by default and never on at the Exact stop.
//
// Two firmware facts bound eligibility (measured 2026-09-01, bench probe):
//   - a negative base with an integer exponent follows C powf (pow(-2, 3) =
//     -8, pow(-2, 2) = 4), so sign is not a domain difference;
//   - overflow diverges: pow(200, 2) reports 32768 while 200 * 200 wraps to
//     -25536. The rewrite therefore needs a provable magnitude bound on the
//     base with bound^k <= 32767; an unbounded base is declined.
import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export interface ShowMemberPowLoweringOptions {
  /** Largest exponent lowered (default 4). */
  maxExponent?: number
}

export interface ShowMemberPowLoweringResult {
  source: string
  rewrittenSites: number
  hoistedTemps: number
  skipped: Array<{ line: number; reason: PowLoweringSkipReason }>
}

export type PowLoweringSkipReason =
  | 'shadowed-builtin'
  | 'non-integer-exponent'
  | 'exponent-out-of-range'
  | 'impure-base'
  | 'unbounded-base'
  | 'range-overflow'
  | 'k2-needs-temp'
  | 'no-statement-context'

const FIXED_POINT_MAX = 32767
const TEMP_PREFIX = '__pxlblz_pow_'
const RENDER_ENTRY_NAMES = new Set(['render', 'render2D', 'render3D'])
/** Authored coordinate transforms run before the renderer sees x/y/z, so a
 *  member that calls any of them gets no [0, 1] coordinate bound. */
const COORDINATE_TRANSFORM_BUILTINS = new Set([
  'translate', 'scale', 'rotate', 'resetTransform', 'translate3D', 'scale3D',
  'rotateX', 'rotateY', 'rotateZ', 'transform', 'setPerspective',
])

/** Built-ins whose result depends only on their arguments. */
const PURE_BUILTINS = new Set([
  'abs', 'wave', 'square', 'triangle', 'sin', 'cos', 'tan', 'sqrt', 'frac', 'floor', 'ceil',
  'round', 'min', 'max', 'clamp', 'hypot', 'mod', 'exp', 'log', 'log2', 'pow', 'atan', 'atan2',
  'asin', 'acos', 'trunc',
])

export function lowerShowMemberPow(
  source: string,
  options: ShowMemberPowLoweringOptions = {},
): ShowMemberPowLoweringResult {
  const maxExponent = options.maxExponent ?? 4
  const result: ShowMemberPowLoweringResult = { source, rewrittenSites: 0, hoistedTemps: 0, skipped: [] }
  let ast: Node
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module', locations: true }) as unknown as Node
  } catch {
    return result
  }
  const usedNames = collectIdentifierNames(ast)
  // Lexical bindings win over built-in spellings: a declared `pow` is the
  // author's function, and a declared `abs`/`wave`/... is neither pure nor
  // bounded. Declarations anywhere in the module count (functions, vars,
  // parameters), and so do implicit globals - Pixelblaze lets `pow =
  // custom` rebind a built-in by plain assignment - conservatively.
  const declared = new Set([...allDeclaredNames(ast), ...assignedNames(ast)])
  const powShadowed = declared.has('pow')
  const shadowedBuiltin = (name: string): boolean => declared.has(name)
  // Any mention of a transform built-in counts - a call, an alias
  // (`move = translate`), or a value passed along - so an aliased transform
  // cannot leave the coordinates marked unit-bounded.
  const coordinatesTransformed = mentionsAny(ast, COORDINATE_TRANSFORM_BUILTINS)
  let tempCounter = 0
  const nextTemp = (): string => {
    let name: string
    do { name = `${TEMP_PREFIX}${tempCounter++}` } while (usedNames.has(name))
    usedNames.add(name)
    return name
  }

  const edits: Array<{ start: number; end: number; text: string }> = []
  // Temps inserted before a statement, keyed by the statement start.
  const insertions = new Map<number, string[]>()

  walkWithContext(ast, coordinatesTransformed, (node, context) => {
    if (!isPowCall(node)) return
    const line: number = node.loc?.start.line ?? 0
    if (powShadowed) { result.skipped.push({ line, reason: 'shadowed-builtin' }); return }
    const exponent = integerExponent(node.arguments[1])
    if (exponent === null) { result.skipped.push({ line, reason: 'non-integer-exponent' }); return }
    if (exponent < 2 || exponent > maxExponent) { result.skipped.push({ line, reason: 'exponent-out-of-range' }); return }
    const base = node.arguments[0]
    if (!isPure(base, shadowedBuiltin)) { result.skipped.push({ line, reason: 'impure-base' }); return }
    const bound = magnitudeBound(base, { ...context.bounds, shadowed: shadowedBuiltin })
    if (bound === null) { result.skipped.push({ line, reason: 'unbounded-base' }); return }
    if (bound ** exponent > FIXED_POINT_MAX) { result.skipped.push({ line, reason: 'range-overflow' }); return }
    const simple = base.type === 'Identifier' || (base.type === 'Literal' && typeof base.value === 'number')
    if (simple) {
      const name = source.slice(base.start, base.end)
      edits.push({ start: node.start, end: node.end, text: `(${Array(exponent).fill(name).join(' * ')})` })
      result.rewrittenSites += 1
      return
    }
    if (exponent === 2) { result.skipped.push({ line, reason: 'k2-needs-temp' }); return }
    const statement = context.hoistStatement
    if (!statement) { result.skipped.push({ line, reason: 'no-statement-context' }); return }
    const temp = nextTemp()
    const baseText = source.slice(base.start, base.end)
    const list = insertions.get(statement.start) ?? []
    list.push(`var ${temp} = ${baseText}\n${context.statementIndent}`)
    insertions.set(statement.start, list)
    edits.push({ start: node.start, end: node.end, text: `(${Array(exponent).fill(temp).join(' * ')})` })
    result.rewrittenSites += 1
    result.hoistedTemps += 1
  })

  for (const [start, texts] of insertions) edits.push({ start, end: start, text: texts.join('') })
  result.source = applyEdits(source, edits)
  return result
}

function isPowCall(node: Node): boolean {
  return node.type === 'CallExpression'
    && node.callee.type === 'Identifier'
    && node.callee.name === 'pow'
    && node.arguments.length === 2
}

function integerExponent(node: Node): number | null {
  if (node.type !== 'Literal' || typeof node.value !== 'number') return null
  return Number.isInteger(node.value) ? node.value : null
}

/** True when evaluating the expression twice or earlier cannot change any
 *  observable state: names, numbers, array reads, arithmetic, and pure
 *  built-in calls only. */
function isPure(node: Node, shadowed: (name: string) => boolean = () => false): boolean {
  const pure = (child: Node): boolean => isPure(child, shadowed)
  switch (node.type) {
    case 'Identifier':
      return true
    case 'Literal':
      return typeof node.value === 'number'
    case 'MemberExpression':
      return pure(node.object) && (node.computed ? pure(node.property) : true)
    case 'UnaryExpression':
      return (node.operator === '-' || node.operator === '+') && pure(node.argument)
    case 'BinaryExpression':
      return ['+', '-', '*', '/', '%', '<', '<=', '>', '>=', '==', '!=', '===', '!=='].includes(node.operator)
        && pure(node.left) && pure(node.right)
    case 'ConditionalExpression':
      return pure(node.test) && pure(node.consequent) && pure(node.alternate)
    case 'LogicalExpression':
      return pure(node.left) && pure(node.right)
    case 'CallExpression':
      return node.callee.type === 'Identifier'
        && PURE_BUILTINS.has(node.callee.name)
        && !shadowed(node.callee.name)
        && node.arguments.every((argument: Node) => pure(argument))
    default:
      return false
  }
}

function literalNumber(node: Node): number | null {
  if (node.type === 'Literal' && typeof node.value === 'number') return node.value
  if (node.type === 'UnaryExpression' && node.operator === '-') {
    const inner = literalNumber(node.argument)
    return inner === null ? null : -inner
  }
  return null
}

export interface BoundScope {
  /** Coordinate parameters of the enclosing render entry: the firmware and
   *  the Show dispatcher both feed [0, 1], unless the member applies an
   *  authored coordinate transform (then this set is empty). */
  coordinateParams: ReadonlySet<string>
  /** Names the module declares itself, which are never built-ins. */
  shadowed?: (name: string) => boolean
  /** Names with exactly one `var name = init` and no other write in their
   *  scope (function locals, or module globals that nothing writes and no
   *  export exposes to controls): their bound is the initializer's. */
  singleAssignments: ReadonlyMap<string, Node>
}

/** An upper bound on |value| of a pure expression, or null when none is
 *  provable. Every name outside the scope's known set is unbounded. */
export function magnitudeBound(node: Node, scope: BoundScope, visiting: Set<string> = new Set()): number | null {
  const lit = literalNumber(node)
  if (lit !== null) return Math.abs(lit)
  const bound = (child: Node): number | null => magnitudeBound(child, scope, visiting)
  switch (node.type) {
    case 'Identifier': {
      if (scope.coordinateParams.has(node.name)) return 1
      const init = scope.singleAssignments.get(node.name)
      if (!init || visiting.has(node.name)) return null
      visiting.add(node.name)
      const value = isPure(init, scope.shadowed) ? bound(init) : null
      visiting.delete(node.name)
      return value
    }
    case 'UnaryExpression':
      return bound(node.argument)
    case 'BinaryExpression': {
      if (['<', '<=', '>', '>=', '==', '!=', '===', '!=='].includes(node.operator)) return 1
      const left = bound(node.left)
      const right = bound(node.right)
      switch (node.operator) {
        case '+':
        case '-':
          return left === null || right === null ? null : left + right
        case '*':
          return left === null || right === null ? null : left * right
        case '/': {
          const divisor = literalNumber(node.right)
          return left === null || divisor === null || divisor === 0 ? null : left / Math.abs(divisor)
        }
        case '%': {
          const modulus = literalNumber(node.right)
          return modulus === null ? null : Math.abs(modulus)
        }
        default:
          return null
      }
    }
    case 'ConditionalExpression': {
      const a = bound(node.consequent)
      const b = bound(node.alternate)
      return a === null || b === null ? null : Math.max(a, b)
    }
    case 'CallExpression': {
      if (node.callee.type !== 'Identifier' || scope.shadowed?.(node.callee.name)) return null
      const args: Node[] = node.arguments
      const bounds = args.map((argument) => bound(argument))
      switch (node.callee.name) {
        case 'wave':
        case 'square':
        case 'triangle':
        case 'sin':
        case 'cos':
        case 'frac':
          return 1
        case 'abs':
          return bounds[0] ?? null
        case 'floor':
        case 'ceil':
        case 'round':
        case 'trunc':
          return bounds[0] === null || bounds[0] === undefined ? null : bounds[0] + 1
        case 'sqrt':
          return bounds[0] === null || bounds[0] === undefined ? null : Math.sqrt(bounds[0])
        case 'clamp': {
          const lo = args[1] ? literalNumber(args[1]) : null
          const hi = args[2] ? literalNumber(args[2]) : null
          return lo === null || hi === null ? null : Math.max(Math.abs(lo), Math.abs(hi))
        }
        case 'min': {
          const known = bounds.filter((bound): bound is number => bound !== null)
          // min(a, b) <= every argument only for non-negative values; |min|
          // can still be as large as the largest |argument|, so both must be known.
          return known.length === bounds.length && known.length > 0 ? Math.max(...known) : null
        }
        case 'max': {
          const known = bounds.filter((bound): bound is number => bound !== null)
          return known.length === bounds.length && known.length > 0 ? Math.max(...known) : null
        }
        case 'mod': {
          const modulus = args[1] ? literalNumber(args[1]) : null
          return modulus === null ? null : Math.abs(modulus)
        }
        case 'hypot': {
          const known = bounds.filter((bound): bound is number => bound !== null)
          return known.length === bounds.length && known.length > 0
            ? Math.sqrt(known.reduce((sum, bound) => sum + bound * bound, 0))
            : null
        }
        default:
          return null
      }
    }
    default:
      return null
  }
}

interface WalkContext {
  bounds: BoundScope
  /** The statement a temp may be inserted before: a single-assignment
   *  expression statement, a single-declarator `var`, or a `return`, whose
   *  parent is a block or the program. */
  hoistStatement: Node | null
  statementIndent: string
}

function walkWithContext(ast: Node, coordinatesTransformed: boolean, visit: (node: Node, context: WalkContext) => void): void {
  const recurse = (node: Node, parent: Node | null, context: WalkContext): void => {
    if (!node || typeof node.type !== 'string') return
    let next = context
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      const params = new Set<string>()
      if (node.type === 'FunctionDeclaration' && node.id && RENDER_ENTRY_NAMES.has(node.id.name) && !coordinatesTransformed) {
        // A coordinate the renderer reassigns (`x = 200`) is no longer the
        // firmware's [0, 1] value anywhere in the function.
        const written = assignedNames(node.body)
        for (const param of node.params.slice(1)) if (param.type === 'Identifier' && !written.has(param.name)) params.add(param.name)
      }
      // Function locals shadow module names; a parameter is a write.
      const locals = singleAssignmentsIn(node.body, new Set(node.params.map((param: Node) => param.name)))
      const merged = new Map(context.bounds.singleAssignments)
      for (const name of allDeclaredNames(node.body)) merged.delete(name)
      for (const param of node.params) if (param.type === 'Identifier') merged.delete(param.name)
      for (const [name, init] of locals) merged.set(name, init)
      next = { ...context, bounds: { coordinateParams: params, singleAssignments: merged }, hoistStatement: null }
    }
    if (isHoistableStatement(node, parent)) {
      next = { ...next, hoistStatement: node, statementIndent: indentOf(node) }
    } else if (node.type.endsWith('Statement') || node.type === 'VariableDeclaration') {
      // Any other statement shape (loop headers, unbraced conditionals,
      // multi-declarator vars) offers no insertion point.
      next = { ...next, hoistStatement: null }
    }
    visit(node, next)
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'type') continue
      const value = node[key]
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') recurse(child, node, next)
      } else if (value && typeof value.type === 'string') {
        recurse(value, node, next)
      }
    }
  }
  const moduleGlobals = singleAssignmentsIn(ast, exportedNames(ast))
  recurse(ast, null, { bounds: { coordinateParams: new Set(), singleAssignments: moduleGlobals }, hoistStatement: null, statementIndent: '' })
}

/** `var name = init` declared exactly once inside `root` (any depth, but not
 *  inside nested functions for the declaration count) and never assigned,
 *  updated, or redeclared anywhere under `root` including nested functions. */
function singleAssignmentsIn(root: Node, excluded: ReadonlySet<string>): Map<string, Node> {
  const declarations = new Map<string, Node[]>()
  const written = new Set<string>()
  const visit = (node: Node, insideNested: boolean): void => {
    if (!node || typeof node.type !== 'string') return
    const nested = insideNested || (node !== root && (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression'))
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      if (nested) written.add(node.id.name)
      else declarations.set(node.id.name, [...(declarations.get(node.id.name) ?? []), node])
    }
    if (node.type === 'FunctionDeclaration' && node.id) written.add(node.id.name)
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') written.add(node.left.name)
    if (node.type === 'UpdateExpression' && node.argument.type === 'Identifier') written.add(node.argument.name)
    if (nested && (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression')) {
      for (const param of node.params) if (param.type === 'Identifier') written.add(param.name)
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'type') continue
      const value = node[key]
      if (Array.isArray(value)) value.forEach((child) => visit(child, nested))
      else if (value && typeof value.type === 'string') visit(value, nested)
    }
  }
  visit(root, false)
  const out = new Map<string, Node>()
  for (const [name, nodes] of declarations) {
    if (nodes.length === 1 && nodes[0].init && !written.has(name) && !excluded.has(name)) out.set(name, nodes[0].init)
  }
  return out
}

/** Every name the tree writes anywhere: assignments, updates, and `var`
 *  declarators (a `var x = 200` inside the renderer rebinds the coordinate
 *  as surely as `x = 200` does); implicit globals included. */
function assignedNames(root: Node): Set<string> {
  const names = new Set<string>()
  const visit = (node: Node): void => {
    if (!node || typeof node.type !== 'string') return
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') names.add(node.left.name)
    if (node.type === 'UpdateExpression' && node.argument.type === 'Identifier') names.add(node.argument.name)
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') names.add(node.id.name)
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'type') continue
      const value = node[key]
      if (Array.isArray(value)) value.forEach((child) => visit(child))
      else if (value && typeof value.type === 'string') visit(value)
    }
  }
  visit(root)
  return names
}

function mentionsAny(root: Node, names: ReadonlySet<string>): boolean {
  let found = false
  const visit = (node: Node): void => {
    if (found || !node || typeof node.type !== 'string') return
    if (node.type === 'Identifier' && names.has(node.name)) { found = true; return }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'type') continue
      const value = node[key]
      if (Array.isArray(value)) value.forEach((child) => visit(child))
      else if (value && typeof value.type === 'string') visit(value)
    }
  }
  visit(root)
  return found
}

/** Every name the module binds: `var`/`let`/`const` declarators, function
 *  declarations, and parameters of every function. */
function allDeclaredNames(root: Node): Set<string> {
  const names = new Set<string>()
  const visit = (node: Node): void => {
    if (!node || typeof node.type !== 'string') return
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') names.add(node.id.name)
    if (node.type === 'FunctionDeclaration' && node.id) names.add(node.id.name)
    if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') && node.params) {
      for (const param of node.params) if (param.type === 'Identifier') names.add(param.name)
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'type') continue
      const value = node[key]
      if (Array.isArray(value)) value.forEach((child) => visit(child))
      else if (value && typeof value.type === 'string') visit(value)
    }
  }
  visit(root)
  return names
}

/** Exported `var`s are control-writable on the device (and exported
 *  functions are not bounds anyway). */
function exportedNames(ast: Node): Set<string> {
  const names = new Set<string>()
  for (const statement of ast.body ?? []) {
    if (statement.type !== 'ExportNamedDeclaration') continue
    const declaration = statement.declaration
    if (declaration?.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) if (declarator.id.type === 'Identifier') names.add(declarator.id.name)
    }
    for (const specifier of statement.specifiers ?? []) if (specifier.local?.type === 'Identifier') names.add(specifier.local.name)
  }
  return names
}

function isHoistableStatement(node: Node, parent: Node | null): boolean {
  if (!parent || (parent.type !== 'BlockStatement' && parent.type !== 'Program')) return false
  if (node.type === 'ExpressionStatement') {
    const expression = node.expression
    return expression.type === 'AssignmentExpression' && !containsWrite(expression.right) && !containsWrite(expression.left)
  }
  if (node.type === 'VariableDeclaration') {
    return node.declarations.length === 1 && node.declarations[0].init != null && !containsWrite(node.declarations[0].init)
  }
  if (node.type === 'ReturnStatement') return node.argument != null && !containsWrite(node.argument)
  return false
}

/** True when the expression itself assigns, updates, or calls user code
 *  (whose writes cannot be seen), so hoisting a subexpression above it
 *  could reorder a write against the base's reads. */
function containsWrite(node: Node): boolean {
  let found = false
  const visit = (current: Node): void => {
    if (found || !current || typeof current.type !== 'string') return
    if (current.type === 'AssignmentExpression' || current.type === 'UpdateExpression') { found = true; return }
    if (current.type === 'CallExpression' && !(current.callee.type === 'Identifier' && PURE_BUILTINS.has(current.callee.name))) { found = true; return }
    if (current.type === 'FunctionExpression' || current.type === 'ArrowFunctionExpression') return
    for (const key of Object.keys(current)) {
      if (key === 'loc' || key === 'type') continue
      const value = current[key]
      if (Array.isArray(value)) value.forEach((child) => visit(child))
      else if (value && typeof value.type === 'string') visit(value)
    }
  }
  visit(node)
  return found
}

function indentOf(node: Node): string {
  // Statements begin at loc.column; reproduce that many spaces so the
  // inserted temp keeps the surrounding indentation readable. Tabs are
  // rare in member sources and a space indent still parses.
  return ' '.repeat(node.loc?.start.column ?? 0)
}

function collectIdentifierNames(ast: Node): Set<string> {
  const names = new Set<string>()
  const visit = (node: Node): void => {
    if (!node || typeof node.type !== 'string') return
    if (node.type === 'Identifier') names.add(node.name)
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'type') continue
      const value = node[key]
      if (Array.isArray(value)) value.forEach((child) => visit(child))
      else if (value && typeof value.type === 'string') visit(value)
    }
  }
  visit(ast)
  return names
}

function applyEdits(source: string, edits: Array<{ start: number; end: number; text: string }>): string {
  // Apply from the end so earlier offsets stay valid. For equal starts a
  // replacement (end > start) must land before an insertion at the same
  // offset; sorting by end descending after start descending gives that.
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end)
  let out = source
  for (const edit of ordered) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}
