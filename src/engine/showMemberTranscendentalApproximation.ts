// #934: approximate-transcendental substitution in member source (lossy,
// perceptual stop; compile option, off by default; never at the Exact or
// Display-exact stops).
//
// Priced on the pb32 (fw 3.67, issue934-probe-rows*.md): `exp` costs
// 22.1 us and the Shader library's `tanh` (exp + divide) 46.1 us, against
// 0.8 us per multiply. Three substitutions pay:
//
//   exp(E), E provably <= 0        -> 1 / P5(t), t = clamp(-E, 0, 8), P5 the
//                                     degree-5 Taylor polynomial of e^t.
//                                     11.6 us for the quartic on the bench;
//                                     the quintic adds one multiply-add and
//                                     brings PhantomStar's drift to max 1
//                                     LSB (emulator, both modes).
//   pow(B, k), B provably in [0, 1], -> B * (a + (1 - a) * B), a the
//     k a non-integer literal in (1, 2)   least-squares coefficient fitted at
//                                     compile time (closed form below).
//                                     4.9 us against 8.5 us.
//   the library tanh helper body    -> the rational form ZippyZaps hand-won
//     `var e = exp(2 * clamp(x, -5, 5)); (x * (27 + x^2) / (27 + 9 x^2), x
//      return (e - 1) / (e + 1)`         clamped to [-3, 3]): 11.8 us against
//                                     46.1 us.
//
// Recorded negatives (same rounds): asin/acos are 4.8 us built-ins and the
// Abramowitz-Stegun form costs 12.3 us; a 64-entry table with lerp for exp
// costs 14.8 us (two array reads); (1 + t/16)^-16 costs 17.8 us.
//
// Domain proofs use an interval analysis over pure expressions: literals,
// render coordinates ([0, 1] unless the member transforms them), single-
// assignment locals and never-written module constants through their
// initializers, and the bounded built-ins. A site whose argument interval
// cannot be proven is declined with a reason; overflow safety comes from the
// clamp on t (t^5 / 120 at t = 8 is 273, inside 16.16) and from B <= 1.
import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export interface ShowMemberTranscendentalOptions {
  exp?: boolean
  pow?: boolean
  tanh?: boolean
}

export type TranscendentalSkipReason =
  | 'nested-site'
  | 'shadowed-builtin'
  | 'impure-argument'
  | 'unproven-domain'
  | 'non-literal-exponent'
  | 'exponent-out-of-range'
  | 'no-statement-context'

export interface ShowMemberTranscendentalResult {
  source: string
  rewritten: { exp: number; pow: number; tanh: number }
  skipped: Array<{ line: number; kind: 'exp' | 'pow' | 'tanh'; reason: TranscendentalSkipReason }>
}

const TEMP_PREFIX = '__pxlblz_tx_'
const RENDER_ENTRY_NAMES = new Set(['render', 'render2D', 'render3D'])
const COORDINATE_TRANSFORM_BUILTINS = new Set([
  'translate', 'scale', 'rotate', 'resetTransform', 'translate3D', 'scale3D',
  'rotateX', 'rotateY', 'rotateZ', 'transform', 'setPerspective',
])
const PURE_BUILTINS = new Set([
  'abs', 'wave', 'square', 'triangle', 'sin', 'cos', 'tan', 'sqrt', 'frac', 'floor', 'ceil',
  'round', 'min', 'max', 'clamp', 'hypot', 'hypot3', 'mod', 'exp', 'log', 'log2', 'pow', 'atan', 'atan2',
  'asin', 'acos', 'trunc',
])
/** Upper bound of t in the exp substitute: e^-8 is 3e-4, below one 8-bit step. */
const EXP_T_MAX = 8
/** Calls this pass may rewrite; a fact derived through one is not recorded. */
const REWRITABLE_CALLS = new Set(['exp', 'pow', 'tanh'])

export function approximateShowMemberTranscendentals(
  source: string,
  options: ShowMemberTranscendentalOptions = {},
): ShowMemberTranscendentalResult {
  const wantExp = options.exp ?? true
  const wantPow = options.pow ?? true
  const wantTanh = options.tanh ?? true
  const result: ShowMemberTranscendentalResult = { source, rewritten: { exp: 0, pow: 0, tanh: 0 }, skipped: [] }
  let ast: Node
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module', locations: true }) as unknown as Node
  } catch {
    return result
  }
  const usedNames = collectIdentifierNames(ast)
  const declared = new Set([...allDeclaredNames(ast), ...assignedNames(ast)])
  const shadowed = (name: string): boolean => declared.has(name)
  const coordinatesTransformed = mentionsAny(ast, COORDINATE_TRANSFORM_BUILTINS)
  let tempCounter = 0
  const nextTemp = (): string => {
    let name: string
    do { name = `${TEMP_PREFIX}${tempCounter++}` } while (usedNames.has(name))
    usedNames.add(name)
    return name
  }
  const edits: Array<{ start: number; end: number; text: string }> = []
  const insertions = new Map<number, string[]>()
  const rewrittenTanhBodies = new Set<Node>()
  // Replacements are queued against original offsets; a site inside (or
  // around) an already-queued replacement cannot be spliced independently,
  // so the outer site wins and the inner one is declined.
  const replaced: Array<{ start: number; end: number }> = []
  const overlapsReplacement = (start: number, end: number): boolean => replaced.some((range) => start < range.end && end > range.start)
  const queueReplacement = (start: number, end: number, text: string): void => {
    replaced.push({ start, end })
    edits.push({ start, end, text })
  }

  walkWithContext(ast, coordinatesTransformed, shadowed, (node, context) => {
    // Library tanh helper: match the body shape, replace the whole body.
    if (wantTanh && (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') && node.params.length === 1 && node.params[0].type === 'Identifier') {
      const param: string = node.params[0].name
      if (isLibraryTanhBody(node.body, param) && !shadowed('exp') && !shadowed('clamp') && !overlapsReplacement(node.body.start, node.body.end)) {
        const x = param
        const x2 = nextTemp()
        queueReplacement(
          node.body.start,
          node.body.end,
          `{\n  ${x} = clamp(${x}, -3, 3)\n  var ${x2} = ${x} * ${x}\n  return ${x} * (27 + ${x2}) / (27 + 9 * ${x2})\n}`,
        )
        rewrittenTanhBodies.add(node.body)
        result.rewritten.tanh += 1
      }
      return
    }
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return
    if (context.enclosingBody && rewrittenTanhBodies.has(context.enclosingBody)) return
    const line: number = node.loc?.start.line ?? 0
    const name: string = node.callee.name
    if ((name === 'exp' || name === 'pow') && overlapsReplacement(node.start, node.end)) {
      result.skipped.push({ line, kind: name, reason: 'nested-site' })
      return
    }
    if (name === 'exp' && wantExp && node.arguments.length === 1) {
      if (shadowed('exp') || shadowed('clamp')) { result.skipped.push({ line, kind: 'exp', reason: 'shadowed-builtin' }); return }
      const argument = node.arguments[0]
      if (!isPure(argument, shadowed)) { result.skipped.push({ line, kind: 'exp', reason: 'impure-argument' }); return }
      const interval = intervalBound(argument, { ...context.bounds, shadowed, site: node.start })
      if (!interval || interval[1] > 0) { result.skipped.push({ line, kind: 'exp', reason: 'unproven-domain' }); return }
      const statement = context.hoistStatement
      if (!statement) { result.skipped.push({ line, kind: 'exp', reason: 'no-statement-context' }); return }
      const t = nextTemp()
      const argumentText = source.slice(argument.start, argument.end)
      const list = insertions.get(statement.start) ?? []
      list.push(`var ${t} = clamp(-(${argumentText}), 0, ${EXP_T_MAX})\n${context.statementIndent}`)
      insertions.set(statement.start, list)
      queueReplacement(
        node.start,
        node.end,
        `(1 / (1 + ${t} * (1 + ${t} * (0.5 + ${t} * (0.16666667 + ${t} * (0.041666667 + ${t} * 0.0083333333))))))`,
      )
      result.rewritten.exp += 1
      return
    }
    if (name === 'pow' && wantPow && node.arguments.length === 2) {
      if (shadowed('pow')) { result.skipped.push({ line, kind: 'pow', reason: 'shadowed-builtin' }); return }
      const exponent = node.arguments[1]
      const k = exponent.type === 'Literal' && typeof exponent.value === 'number' ? exponent.value : null
      if (k === null) { result.skipped.push({ line, kind: 'pow', reason: 'non-literal-exponent' }); return }
      // Integer exponents belong to the #933 display-exact lowering. The
      // least-squares coefficient a lies in [0, 1] exactly for 1 <= k <= 2
      // ((k + 2)(k + 3) between 12 and 20): below 1 the quadratic overshoots
      // [0, 1] (pow(b, 0.1) at b = 0.75 reads 1.145), above 2 it dips
      // negative near 0 (pow(b, 2.5) at b = 0.1 reads -0.016). So the fit is
      // offered for 1 < k < 2 only.
      if (Number.isInteger(k) || k <= 1 || k >= 2) { result.skipped.push({ line, kind: 'pow', reason: 'exponent-out-of-range' }); return }
      const base = node.arguments[0]
      if (!isPure(base, shadowed)) { result.skipped.push({ line, kind: 'pow', reason: 'impure-argument' }); return }
      const interval = intervalBound(base, { ...context.bounds, shadowed, site: node.start })
      if (!interval || interval[0] < 0 || interval[1] > 1) { result.skipped.push({ line, kind: 'pow', reason: 'unproven-domain' }); return }
      const a = quadraticFitCoefficient(k)
      const simple = base.type === 'Identifier'
      if (simple) {
        const b = source.slice(base.start, base.end)
        queueReplacement(node.start, node.end, `(${b} * (${fixed(a)} + ${fixed(1 - a)} * ${b}))`)
        result.rewritten.pow += 1
        return
      }
      const statement = context.hoistStatement
      if (!statement) { result.skipped.push({ line, kind: 'pow', reason: 'no-statement-context' }); return }
      const t = nextTemp()
      const list = insertions.get(statement.start) ?? []
      list.push(`var ${t} = ${source.slice(base.start, base.end)}\n${context.statementIndent}`)
      insertions.set(statement.start, list)
      queueReplacement(node.start, node.end, `(${t} * (${fixed(a)} + ${fixed(1 - a)} * ${t}))`)
      result.rewritten.pow += 1
    }
  })

  for (const [start, texts] of insertions) edits.push({ start, end: start, text: texts.join('') })
  result.source = applyEdits(source, edits)
  return result
}

/** Least-squares fit of b^k on [0, 1] by a * b + (1 - a) * b^2 (exact at both
 *  endpoints): a = 30 * (1 / (k + 2) - 1 / (k + 3) - 1 / 20). */
export function quadraticFitCoefficient(k: number): number {
  return 30 * (1 / (k + 2) - 1 / (k + 3) - 1 / 20)
}

function fixed(value: number): string {
  return Number(value.toFixed(6)).toString()
}

/** The Shader library's tanh: `var e = exp(2 * clamp(x, -5, 5)); return (e - 1) / (e + 1)`. */
function isLibraryTanhBody(body: Node, param: string): boolean {
  if (body.type !== 'BlockStatement' || body.body.length !== 2) return false
  const [declaration, ret] = body.body
  if (declaration.type !== 'VariableDeclaration' || declaration.declarations.length !== 1) return false
  const declarator = declaration.declarations[0]
  if (declarator.id.type !== 'Identifier' || !declarator.init) return false
  const e: string = declarator.id.name
  const init = declarator.init
  if (init.type !== 'CallExpression' || init.callee.type !== 'Identifier' || init.callee.name !== 'exp' || init.arguments.length !== 1) return false
  const scaled = init.arguments[0]
  if (scaled.type !== 'BinaryExpression' || scaled.operator !== '*' || literal(scaled.left) !== 2) return false
  const clampCall = scaled.right
  if (clampCall.type !== 'CallExpression' || clampCall.callee.type !== 'Identifier' || clampCall.callee.name !== 'clamp' || clampCall.arguments.length !== 3) return false
  if (clampCall.arguments[0].type !== 'Identifier' || clampCall.arguments[0].name !== param) return false
  if (literal(clampCall.arguments[1]) !== -5 || literal(clampCall.arguments[2]) !== 5) return false
  if (ret.type !== 'ReturnStatement' || !ret.argument || ret.argument.type !== 'BinaryExpression' || ret.argument.operator !== '/') return false
  const { left, right } = ret.argument
  return left.type === 'BinaryExpression' && left.operator === '-' && left.left.type === 'Identifier' && left.left.name === e && literal(left.right) === 1
    && right.type === 'BinaryExpression' && right.operator === '+' && right.left.type === 'Identifier' && right.left.name === e && literal(right.right) === 1
}

function literal(node: Node): number | null {
  if (node.type === 'Literal' && typeof node.value === 'number') return node.value
  if (node.type === 'UnaryExpression' && node.operator === '-') {
    const inner = literal(node.argument)
    return inner === null ? null : -inner
  }
  return null
}

function isPure(node: Node, shadowed: (name: string) => boolean): boolean {
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
      return ['+', '-', '*', '/', '%', '<', '<=', '>', '>=', '==', '!=', '===', '!=='].includes(node.operator) && pure(node.left) && pure(node.right)
    case 'ConditionalExpression':
      return pure(node.test) && pure(node.consequent) && pure(node.alternate)
    case 'LogicalExpression':
      return pure(node.left) && pure(node.right)
    case 'CallExpression':
      return node.callee.type === 'Identifier' && PURE_BUILTINS.has(node.callee.name) && !shadowed(node.callee.name)
        && node.arguments.every((argument: Node) => pure(argument))
    default:
      return false
  }
}

export interface IntervalScope {
  coordinateParams: ReadonlySet<string>
  singleAssignments: ReadonlyMap<string, Node>
  /** Straight-line facts: the interval a name held after an earlier plain
   *  assignment of the same block, resolved AT that statement (so a later
   *  write to one of its inputs cannot change it), when nothing between
   *  could have written the name (`density = clamp(...)` followed by
   *  `density = pow(density, 1.3)`). */
  blockIntervals?: ReadonlyMap<string, Interval>
  shadowed?: (name: string) => boolean
  /** Source offset of the site being proven: an initializer fact applies
   *  only to reads after the declaration has executed (a function-scoped
   *  `var` read before its declaration is 0 on the device, not its
   *  initializer). */
  site?: number
}

export type Interval = [number, number]

/** A closed interval containing every value of a pure expression, or null
 *  when none is provable. Infinite ends are allowed. */
export function intervalBound(node: Node, scope: IntervalScope, visiting: Set<string> = new Set()): Interval | null {
  const lit = literal(node)
  if (lit !== null) return [lit, lit]
  const bound = (child: Node): Interval | null => intervalBound(child, scope, visiting)
  switch (node.type) {
    case 'Identifier': {
      if (scope.coordinateParams.has(node.name)) return [0, 1]
      const fact = scope.blockIntervals?.get(node.name)
      if (fact) return fact
      const init = scope.singleAssignments.get(node.name)
      if (!init || visiting.has(node.name)) return null
      if (scope.site !== undefined && typeof init.end === 'number' && init.end > scope.site) return null
      if (callsAny(init, REWRITABLE_CALLS)) return null
      visiting.add(node.name)
      const value = isPure(init, scope.shadowed ?? (() => false)) ? bound(init) : null
      visiting.delete(node.name)
      return value
    }
    case 'UnaryExpression': {
      const inner = bound(node.argument)
      if (!inner) return null
      return node.operator === '-' ? [-inner[1], -inner[0]] : inner
    }
    case 'BinaryExpression': {
      if (['<', '<=', '>', '>=', '==', '!=', '===', '!=='].includes(node.operator)) return [0, 1]
      const left = bound(node.left)
      const right = bound(node.right)
      if (!left || !right) return null
      switch (node.operator) {
        case '+': return [left[0] + right[0], left[1] + right[1]]
        case '-': return [left[0] - right[1], left[1] - right[0]]
        case '*': {
          const products = [left[0] * right[0], left[0] * right[1], left[1] * right[0], left[1] * right[1]].map(safeProduct)
          return [Math.min(...products), Math.max(...products)]
        }
        case '/': {
          const divisor = literal(node.right)
          if (divisor === null || divisor === 0) return null
          const scaled = [left[0] / divisor, left[1] / divisor]
          return [Math.min(...scaled), Math.max(...scaled)]
        }
        case '%': {
          const modulus = literal(node.right)
          return modulus === null ? null : [-Math.abs(modulus), Math.abs(modulus)]
        }
        default: return null
      }
    }
    case 'ConditionalExpression': {
      const a = bound(node.consequent)
      const b = bound(node.alternate)
      return a && b ? [Math.min(a[0], b[0]), Math.max(a[1], b[1])] : null
    }
    case 'CallExpression': {
      if (node.callee.type !== 'Identifier' || scope.shadowed?.(node.callee.name)) return null
      const args: Node[] = node.arguments
      const bounds = args.map((argument) => bound(argument))
      const first = bounds[0] ?? null
      switch (node.callee.name) {
        case 'wave': case 'square': case 'triangle': return [0, 1]
        case 'sin': case 'cos': return [-1, 1]
        case 'frac': return [-1, 1]
        // Non-negative by construction even when the argument is unknown:
        // a sign proof is what exp(-x) needs, and [0, inf) carries it.
        case 'abs': return first ? [first[0] >= 0 ? first[0] : first[1] <= 0 ? -first[1] : 0, Math.max(Math.abs(first[0]), Math.abs(first[1]))] : [0, Infinity]
        case 'sqrt': return first && first[0] >= 0 ? [Math.sqrt(first[0]), Math.sqrt(first[1])] : first ? [0, Math.sqrt(Math.max(0, first[1]))] : [0, Infinity]
        case 'exp': return first ? [Math.exp(first[0]), Math.exp(first[1])] : [0, Infinity]
        case 'hypot': case 'hypot3': {
          const known = bounds.filter((b): b is Interval => b !== null)
          if (known.length !== bounds.length || known.length === 0) return [0, Infinity]
          return [0, Math.sqrt(known.reduce((sum, b) => sum + Math.max(Math.abs(b[0]), Math.abs(b[1])) ** 2, 0))]
        }
        case 'clamp': {
          const lo = args[1] ? literal(args[1]) : null
          const hi = args[2] ? literal(args[2]) : null
          if (lo === null || hi === null) return null
          // min(max(v, lo), hi): with lo > hi the result is always hi.
          if (lo > hi) return [hi, hi]
          if (!first) return [lo, hi]
          return [Math.min(Math.max(first[0], lo), hi), Math.min(Math.max(first[1], lo), hi)]
        }
        case 'min': {
          const known = bounds.filter((b): b is Interval => b !== null)
          if (known.length !== bounds.length || known.length === 0) return null
          return [Math.min(...known.map((b) => b[0])), Math.min(...known.map((b) => b[1]))]
        }
        case 'max': {
          const known = bounds.filter((b): b is Interval => b !== null)
          if (known.length !== bounds.length || known.length === 0) return null
          return [Math.max(...known.map((b) => b[0])), Math.max(...known.map((b) => b[1]))]
        }
        case 'mod': {
          const modulus = args[1] ? literal(args[1]) : null
          return modulus === null ? null : [-Math.abs(modulus), Math.abs(modulus)]
        }
        case 'floor': case 'ceil': case 'round': case 'trunc':
          return first ? [first[0] - 1, first[1] + 1] : null
        case 'pow': {
          const k = args[1] ? literal(args[1]) : null
          if (!first || k === null || first[0] < 0) return null
          return [Math.min(first[0] ** k, first[1] ** k), Math.max(first[0] ** k, first[1] ** k)]
        }
        default: return null
      }
    }
    default:
      return null
  }
}

function safeProduct(value: number): number {
  return Number.isNaN(value) ? 0 : value
}

interface WalkContext {
  bounds: IntervalScope
  hoistStatement: Node | null
  statementIndent: string
  enclosingBody: Node | null
}

function walkWithContext(ast: Node, coordinatesTransformed: boolean, shadowed: (name: string) => boolean, visit: (node: Node, context: WalkContext) => void): void {
  const recurse = (node: Node, parent: Node | null, context: WalkContext): void => {
    if (!node || typeof node.type !== 'string') return
    let next = context
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      const params = new Set<string>()
      if (node.type === 'FunctionDeclaration' && node.id && RENDER_ENTRY_NAMES.has(node.id.name) && !coordinatesTransformed) {
        const written = assignedNames(node.body)
        for (const param of node.params.slice(1)) if (param.type === 'Identifier' && !written.has(param.name)) params.add(param.name)
      }
      const locals = singleAssignmentsIn(node.body, new Set(node.params.map((param: Node) => param.name)))
      const merged = new Map(context.bounds.singleAssignments)
      for (const name of allDeclaredNames(node.body)) merged.delete(name)
      for (const param of node.params) if (param.type === 'Identifier') merged.delete(param.name)
      for (const [name, init] of locals) merged.set(name, init)
      // Straight-line facts belong to the statement sequence they were
      // computed in; a nested function runs later, after any write.
      next = { ...context, bounds: { ...context.bounds, coordinateParams: params, singleAssignments: merged, blockIntervals: undefined }, hoistStatement: null, enclosingBody: node.body }
    }
    if (isHoistableStatement(node, parent, shadowed)) {
      next = {
        ...next,
        hoistStatement: node,
        statementIndent: ' '.repeat(node.loc?.start.column ?? 0),
        bounds: { ...next.bounds, blockIntervals: blockIntervalsBefore(parent!, node, next.bounds, shadowed) },
      }
    } else if (node.type.endsWith('Statement') || node.type === 'VariableDeclaration') {
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
  recurse(ast, null, { bounds: { coordinateParams: new Set(), singleAssignments: moduleGlobals }, hoistStatement: null, statementIndent: '', enclosingBody: null })
}

/** For each name, the pure expression it was last assigned by a plain
 *  statement of `block` before `statement`, provided no later statement in
 *  that stretch writes the name through any other shape (compound
 *  assignment, update, nested loop or branch, call with side effects). */
function blockIntervalsBefore(block: Node, statement: Node, scope: IntervalScope, shadowed: (name: string) => boolean): Map<string, Interval> {
  const facts = new Map<string, Interval>()
  const statements: Node[] = block.body ?? []
  for (const previous of statements) {
    if (previous === statement) break
    // A plain assignment records the interval its right-hand side has HERE,
    // with the facts that hold at this point; the AST is not kept, so a
    // later write to an input cannot rewrite history. Anything else
    // invalidates every name it writes.
    const plain = plainAssignment(previous, shadowed)
    if (plain) {
      // A right-hand side that this pass may itself rewrite (exp, pow, the
      // tanh helper) records no fact: the substitute's range is not the
      // built-in's, and the analysis does not model queued rewrites.
      const interval = isPure(plain.init, shadowed) && !callsAny(plain.init, REWRITABLE_CALLS)
        ? intervalBound(plain.init, { ...scope, blockIntervals: facts, shadowed, site: plain.init.end })
        : null
      if (interval) facts.set(plain.name, interval)
      else facts.delete(plain.name)
      continue
    }
    for (const name of assignedNames(previous)) facts.delete(name)
    if (containsUserCall(previous, shadowed)) facts.clear()
  }
  return facts
}

function plainAssignment(statement: Node, shadowed: (name: string) => boolean): { name: string; init: Node } | null {
  if (statement.type === 'VariableDeclaration' && statement.declarations.length === 1) {
    const declarator = statement.declarations[0]
    if (declarator.id.type === 'Identifier' && declarator.init && !containsWrite(declarator.init, shadowed)) return { name: declarator.id.name, init: declarator.init }
    return null
  }
  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
    const expression = statement.expression
    if (expression.operator === '=' && expression.left.type === 'Identifier' && !containsWrite(expression.right, shadowed)) return { name: expression.left.name, init: expression.right }
  }
  return null
}

/** A call is user code unless it names an unshadowed pure built-in. */
function containsUserCall(node: Node, shadowed: (name: string) => boolean): boolean {
  let found = false
  const visit = (current: Node): void => {
    if (found || !current || typeof current.type !== 'string') return
    if (current.type === 'CallExpression' && !(current.callee.type === 'Identifier' && PURE_BUILTINS.has(current.callee.name) && !shadowed(current.callee.name))) { found = true; return }
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

function isHoistableStatement(node: Node, parent: Node | null, shadowed: (name: string) => boolean): boolean {
  if (!parent || (parent.type !== 'BlockStatement' && parent.type !== 'Program')) return false
  if (node.type === 'ExpressionStatement') {
    const expression = node.expression
    return expression.type === 'AssignmentExpression' && !containsWrite(expression.right, shadowed) && !containsWrite(expression.left, shadowed)
  }
  if (node.type === 'VariableDeclaration') {
    return node.declarations.length === 1 && node.declarations[0].init != null && !containsWrite(node.declarations[0].init, shadowed)
  }
  if (node.type === 'ReturnStatement') return node.argument != null && !containsWrite(node.argument, shadowed)
  return false
}

function containsWrite(node: Node, shadowed: (name: string) => boolean): boolean {
  let found = false
  const visit = (current: Node): void => {
    if (found || !current || typeof current.type !== 'string') return
    if (current.type === 'AssignmentExpression' || current.type === 'UpdateExpression') { found = true; return }
    if (current.type === 'CallExpression' && !(current.callee.type === 'Identifier' && PURE_BUILTINS.has(current.callee.name) && !shadowed(current.callee.name))) { found = true; return }
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
    if (node.type === 'VariableDeclarator' && node.id.type !== 'Identifier') collectPatternNames(node.id, written)
    if (node.type === 'FunctionDeclaration' && node.id) written.add(node.id.name)
    if (node.type === 'AssignmentExpression') collectPatternNames(node.left, written)
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

function assignedNames(root: Node): Set<string> {
  const names = new Set<string>()
  const visit = (node: Node): void => {
    if (!node || typeof node.type !== 'string') return
    if (node.type === 'AssignmentExpression') collectPatternNames(node.left, names)
    if (node.type === 'UpdateExpression' && node.argument.type === 'Identifier') names.add(node.argument.name)
    if (node.type === 'VariableDeclarator') collectPatternNames(node.id, names)
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

function collectPatternNames(target: Node, names: Set<string>): void {
  if (!target || typeof target.type !== 'string') return
  switch (target.type) {
    case 'Identifier': names.add(target.name); return
    case 'ArrayPattern': for (const element of target.elements) if (element) collectPatternNames(element, names); return
    case 'ObjectPattern': for (const property of target.properties) collectPatternNames(property.type === 'RestElement' ? property.argument : property.value, names); return
    case 'AssignmentPattern': collectPatternNames(target.left, names); return
    case 'RestElement': collectPatternNames(target.argument, names); return
    default: return
  }
}

function callsAny(root: Node, names: ReadonlySet<string>): boolean {
  let found = false
  const visit = (node: Node): void => {
    if (found || !node || typeof node.type !== 'string') return
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && names.has(node.callee.name)) { found = true; return }
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

function allDeclaredNames(root: Node): Set<string> {
  const names = new Set<string>()
  const visit = (node: Node): void => {
    if (!node || typeof node.type !== 'string') return
    if (node.type === 'VariableDeclarator') collectPatternNames(node.id, names)
    if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') && node.id) names.add(node.id.name)
    if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') && node.params) {
      for (const param of node.params) collectPatternNames(param, names)
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

function exportedNames(ast: Node): Set<string> {
  const names = new Set<string>()
  for (const statement of ast.body ?? []) {
    if (statement.type !== 'ExportNamedDeclaration') continue
    const declaration = statement.declaration
    if (declaration?.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) collectPatternNames(declarator.id, names)
    }
    for (const specifier of statement.specifiers ?? []) if (specifier.local?.type === 'Identifier') names.add(specifier.local.name)
  }
  return names
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
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end)
  let out = source
  for (const edit of ordered) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}
