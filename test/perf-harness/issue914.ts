// #914 design spike: detect the hand-proven member-Pattern optimization moves
// from docs/guides/Optimizing Pixelblaze patterns.md as mechanical rules over
// authored source, so a compiler pass could apply them.
//
//   Rule A — loop-index-only tabling (§9 "Precompute loop-index-only work"):
//     inner-loop call subtrees whose value depends only on the loop induction
//     variable (module-scope table, filled at load) or on the induction
//     variable plus frame/control state (beforeRender table, refilled per
//     frame). Operand-tabling discipline: a site is the maximal eligible
//     subtree, replaced whole — never merged with neighbouring factors, so
//     multiply order (and the Precise checksum) is untouched.
//
//   Rule B — lazy position-only memoization (§9 "Memoize position-only
//     transcendentals"): expensive call subtrees that depend only on the
//     pixel's position/index and immutable module constants, cacheable in a
//     pixelCount-sized array filled lazily per index. Sites whose operands
//     also read control/frame state are counted separately as
//     "needs-invalidation" (the PulseLoom class: refill when a slider moves);
//     they are census-visible but out of prototype scope.
//
//   Rule C — palette specialization (stretch, census only): a setPalette call
//     whose stops are a static literal (or an immutable literal-initialized
//     global) could be specialized at compile time.
//
// The dependency classifier is a spike-local port of the #513/#566 machinery
// in src/engine/showFrameInvariantHoisting.ts, extended with the two signals
// that analysis deliberately excludes: a per-loop induction-variable
// dependency, and copy-propagation through single-assignment locals (both
// ground-truth hand moves — NeonSquircles' ring tables, Kishimisu's
// exp(-len0) memo — are invisible without them). No general pass lands from
// this issue; a real pass would fold these extensions back into the engine
// module rather than duplicate it.

import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export type Issue914Dependency =
  | 'loop-index'
  | 'position'
  | 'render-index'
  | 'constant'
  | 'control'
  | 'frame'
  | 'private-state'
  | 'render-mutation'
  | 'unknown'

const PURE_CALLS = new Set([
  'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'clamp', 'cos', 'exp', 'floor',
  'frac', 'hypot', 'hypot3', 'log', 'max', 'min', 'mod', 'pow', 'round', 'sin',
  'smoothstep', 'sqrt', 'square', 'tan', 'triangle', 'trunc', 'wave',
])

// Device cost per call in multiples of a multiply (test/perf-harness/costs.md,
// fw 3.67). The memo decision prices the whole subtree against these, not a
// callee name list: the paired probes measured single-atan2 memoization as a
// LOSS (CoronalMassEjection -12.9%, TunnelOfSquares2D -5.5% median FPS at
// 256 px) because the lazy read path — floor 1.9 + bound compare + array read
// 1.6 + sentinel compare + branch, ~7x mul — exceeds atan2's 2.7x. Only
// exp/pow-class subtrees (or multi-call subtrees) clear it; Kishimisu's
// hand-proven exp(-len0) memo (+2.5%) sits just past the bar, consistent.
const DEVICE_COST_X_MUL: Record<string, number> = {
  abs: 1.8, acos: 5.5, asin: 4.8, atan: 2.4, atan2: 2.7, ceil: 2.0, clamp: 2.1,
  cos: 3.2, exp: 12.2, floor: 1.9, frac: 2.0, hypot: 3.6, log: 4.0, max: 1.2,
  min: 1.3, mod: 1.3, pow: 8.5, round: 2.0, sin: 2.9, sqrt: 3.5, square: 1.6,
  tan: 4.8, triangle: 1.6, wave: 2.9,
}
/** Minimum estimated subtree cost (x mul) for a memo site to beat the lazy
 * read path, with margin. Derived from the paired losses above. */
const MEMO_BREAKEVEN_X_MUL = 10
/** An exact site must ALSO contain one genuinely heavy call (exp 12.2x /
 * pow 8.5x class): the op-chain probe (ClockworkIris, est 11.4x total,
 * clamp/frac/abs chain) measured -7.3% — summed cheap ops do not beat the
 * read path even past the total threshold, while every measured-positive
 * memo in the catalogue's history (Kishimisu exp +2.5%, PulseLoom exp bumps
 * +37.6%) is exp-dominated. */
const MEMO_HEAVY_CALL_X_MUL = 8
/** Minimum subtree cost for a table read (1.6x mul) to win an inner loop. */
const TABLE_BREAKEVEN_X_MUL = 3

const FRAME_SOURCE_CALLS = new Set(['time'])

// Firmware coordinate-transform builtins. Called per frame (beforeRender or
// render-reachable), they animate the mapping that feeds render's position
// params, so position is NOT stable per index and Rule B memoization would
// freeze frame-one coordinates (BlueHolidayStar2D's beforeRender rotate() is
// the ground case). Top-level calls are static and harmless; slider-handler
// calls couple position to controls (invalidation class).
const TRANSFORM_CALLS = new Set([
  'resetTransform', 'translate', 'rotate', 'scale',
  'translate3D', 'scale3D', 'rotateX', 'rotateY', 'rotateZ',
])

export interface Issue914IndexTablingSite {
  functionName: string
  inductionVar: string
  tripCount: number
  flavor: 'module-table' | 'frame-table'
  subtreeSource: string
  calls: number
  operations: number
  start: number
  end: number
}

export interface Issue914PositionMemoSite {
  functionName: string
  kind: 'exact' | 'below-breakeven' | 'needs-invalidation' | 'already-cached'
  /** Estimated device cost of the subtree, in multiples of a multiply. */
  estCostXMul: number
  subtreeSource: string
  calls: number
  operations: number
  start: number
  end: number
}

export interface Issue914PatternReport {
  indexTabling: Issue914IndexTablingSite[]
  positionMemo: Issue914PositionMemoSite[]
  paletteSpecialization: number
  parseError?: string
}

interface ClassifyContext {
  globals: Set<string>
  immutableGlobals: Set<string>
  frameMutated: Set<string>
  controls: Set<string>
  renderMutated: Set<string>
  locals: Set<string>
  localInitializers: Map<string, Node>
  /** Source offset at which each local's initializer value dies: its first
   * reassignment, hoisted to the start of any loop containing one (a read
   * inside such a loop may observe a later iteration's value). Infinity for
   * locals never reassigned. */
  localKillPositions: Map<string, number>
  params: string[]
  loopIndices: Set<string>
  functions: Set<string>
  pureFunctions: Set<string>
  /** Flow-insensitive classes for out-var globals (see computeOutVarClasses). */
  outVarClasses: Map<string, Set<Issue914Dependency>>
  /** Classes for the current function's params when it is a helper whose
   * call sites were joined (render fns keep the positional default). */
  paramClasses?: Map<string, Set<Issue914Dependency>>
}

interface Classification {
  dependencies: Set<Issue914Dependency>
  operations: number
  calls: number
}

export function analyzeIssue914(source: string): Issue914PatternReport {
  let ast: Node
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  } catch (error) {
    return {
      indexTabling: [],
      positionMemo: [],
      paletteSpecialization: 0,
      parseError: error instanceof Error ? error.message : String(error),
    }
  }
  const globals = collectTopLevelGlobals(ast)
  const functions = collectTopLevelFunctions(ast)
  const reachable = collectRenderReachableFunctions(functions)
  const renderMutated = collectMutatedGlobals(reachable, functions, globals)
  const frameMutated = functions.has('beforeRender')
    ? collectMutatedGlobals(new Set(['beforeRender']), functions, globals)
    : new Set<string>()
  const controls = new Set<string>()
  for (const name of functions.keys()) {
    if (!name.startsWith('slider') && !name.startsWith('toggle')) continue
    for (const binding of collectMutatedGlobals(new Set([name]), functions, globals)) controls.add(binding)
  }
  const mutatedAnywhere = collectMutatedGlobals(new Set(functions.keys()), functions, globals)
  const immutableGlobals = new Set([...globals].filter((name) => !mutatedAnywhere.has(name)))
  const pureFunctions = collectPureValueFunctions(functions, globals, immutableGlobals)
  const { classes: outVarClasses, paramClassesByFn } = computeOutVarClasses({
    functions, globals, immutableGlobals, frameMutated, controls, renderMutated, pureFunctions,
  })

  // Position-stability taint from per-frame coordinate transforms. Per-frame
  // code is beforeRender, everything render-reachable, AND helpers reachable
  // only from beforeRender (beforeRender(){ spin() } with spin(){ rotate(...) }
  // animates the mapping just the same).
  const beforeRenderReachable = collectReachableFrom(functions, ['beforeRender'])
  const isControlName = (fnName: string): boolean => fnName.startsWith('slider')
    || fnName.startsWith('toggle') || fnName.startsWith('rgbPicker')
    || fnName.startsWith('hsvPicker') || fnName.startsWith('trigger')
  // Control taint propagates through helpers too: sliderAngle(v){ applyAngle(v) }
  // with applyAngle calling rotate() couples position to the control just as a
  // direct call would.
  const controlReachable = collectReachableFrom(
    functions,
    [...functions.keys()].filter(isControlName),
  )
  let positionAnimated = false
  let positionControlCoupled = false
  for (const [fnName, fn] of functions) {
    const perFrame = fnName === 'beforeRender' || reachable.has(fnName)
      || beforeRenderReachable.has(fnName)
    const controlFn = isControlName(fnName) || controlReachable.has(fnName)
    if (!perFrame && !controlFn) continue
    visitNode(fn.body, (node) => {
      if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') return
      const callee = node.callee.name as string
      if (!TRANSFORM_CALLS.has(callee) || functions.has(callee) || globals.has(callee)) return
      if (perFrame) positionAnimated = true
      else positionControlCoupled = true
    })
  }

  const indexTabling: Issue914IndexTablingSite[] = []
  const positionMemo: Issue914PositionMemoSite[] = []

  for (const functionName of reachable) {
    const fn = functions.get(functionName)
    if (!fn) continue
    const params = ((fn.params as Node[]) ?? [])
      .filter((param) => param.type === 'Identifier')
      .map((param) => param.name as string)
    const locals = collectFunctionLocals(fn)
    const localInitializers = collectSingleAssignmentInitializers(fn.body, locals)
    const localKillPositions = collectLocalKillPositions(fn.body, locals)
    // Render entry points keep positional defaults (index, then position);
    // reachable helpers classify params by their joined call-site classes.
    const isEntry = functionName === 'render' || functionName === 'render2D' || functionName === 'render3D'
    const helperParamArray = paramClassesByFn.get(functionName)
    const paramClasses = isEntry ? undefined : new Map<string, Set<Issue914Dependency>>(
      params.map((param, index) => [param, helperParamArray?.[index] ?? new Set<Issue914Dependency>(['unknown'])]),
    )
    // The mechanical cache is addressed by the render index; a helper that
    // never receives it (LineDancer2D's kal, SceneSplice's cutField) cannot
    // key a per-pixel entry, so its sites are never exact. The param class
    // must be EXACTLY render-index: a joined class that also carries
    // position means some call site passes a coordinate there, which would
    // address the cache with a coordinate instead of an index.
    const indexInScope = isEntry
      || params.some((param) => {
        const cls = paramClasses?.get(param)
        return cls !== undefined && cls.size === 1 && cls.has('render-index')
      })
    const baseContext: ClassifyContext = {
      globals,
      immutableGlobals,
      frameMutated,
      controls,
      renderMutated,
      locals,
      localInitializers,
      localKillPositions,
      params,
      loopIndices: new Set(),
      functions: new Set(functions.keys()),
      pureFunctions,
      outVarClasses,
      paramClasses,
    }

    // Rule A: statically-counted for-loops inside render-reachable code.
    visitNode(fn.body, (node) => {
      if (node.type !== 'ForStatement') return
      const loop = readStaticLoop(node)
      if (!loop || loop.tripCount < 2 || loop.tripCount > 128) return
      // A loop-local induction variable is unreachable from callees (the
      // language has no closures), but a GLOBAL induction variable can be
      // rewritten by any called helper (`bump(){ i = i + 100 }`), making the
      // static count a lie. For global induction, admit the loop only when
      // every body call is a pure builtin or a pure-value function.
      if (!locals.has(loop.inductionVar)) {
        let bodyCallsImpure = false
        visitNode(node.body as Node, (child) => {
          if (child.type !== 'CallExpression') return
          const callee = child.callee?.type === 'Identifier' ? child.callee.name as string : null
          const isPureBuiltin = callee !== null && PURE_CALLS.has(callee)
            && !functions.has(callee) && !globals.has(callee)
          if (callee === null || (!isPureBuiltin && !pureFunctions.has(callee))) bodyCallsImpure = true
        })
        if (bodyCallsImpure) return
      }
      const loopContext: ClassifyContext = {
        ...baseContext,
        loopIndices: new Set([...baseContext.loopIndices, loop.inductionVar]),
      }
      collectMaximalSites(node.body, source, loopContext, (classification, siteNode) => {
        if (classification.calls === 0) return null
        if (estimateSubtreeCost(siteNode, loopContext) < TABLE_BREAKEVEN_X_MUL) return null
        const deps = classification.dependencies
        if (!deps.has('loop-index')) return null
        if (deps.has('position') || deps.has('render-index') || deps.has('render-mutation')
          || deps.has('private-state') || deps.has('unknown')) return null
        return deps.has('frame') || deps.has('control') ? 'frame-table' : 'module-table'
      }, (site, flavor) => {
        indexTabling.push({
          functionName,
          inductionVar: loop.inductionVar,
          tripCount: loop.tripCount,
          flavor,
          subtreeSource: site.sourceText,
          calls: site.calls,
          operations: site.operations,
          start: site.start,
          end: site.end,
        })
      })
    })

    // Rule B: position-only call subtrees anywhere render-reachable, priced
    // against the lazy read path.
    collectMaximalSites(fn.body, source, baseContext, (classification, node) => {
      if (classification.calls === 0) return null
      const deps = classification.dependencies
      if (deps.has('loop-index') || deps.has('render-mutation')
        || deps.has('private-state') || deps.has('unknown')) return null
      if (!deps.has('position') && !deps.has('render-index')) return null
      // A frame-dependent value changes every frame: not memoizable at all.
      // A control-dependent one is stable between slider moves — memoizable
      // with invalidation (the PulseLoom class).
      if (deps.has('frame')) return null
      const usesPosition = deps.has('position')
      // Per-frame coordinate transforms animate the position feed itself.
      if (usesPosition && positionAnimated) return null
      const cost = estimateSubtreeCost(node, baseContext)
      if (cost < 2.5) return null
      if (deps.has('control') || (usesPosition && positionControlCoupled)) return 'needs-invalidation'
      return indexInScope
        && cost >= MEMO_BREAKEVEN_X_MUL
        && maxSingleCallCost(node, baseContext) >= MEMO_HEAVY_CALL_X_MUL
        ? 'exact'
        : 'below-breakeven'
    }, (site, kind, node) => {
      positionMemo.push({
        functionName,
        kind,
        estCostXMul: Math.round(estimateSubtreeCost(node, baseContext) * 10) / 10,
        subtreeSource: site.sourceText,
        calls: site.calls,
        operations: site.operations,
        start: site.start,
        end: site.end,
      })
    })
  }

  // A Rule-A site nested inside a counted loop also matches Rule B's walk when
  // it touches position; Rule A ran on the loop body first, so drop Rule B
  // sites fully contained in a Rule A site.
  const claimed = indexTabling.map((site) => [site.start, site.end] as const)
  // Hand-memoized authored code (shipped Kishimisu) re-exposes the fill arm's
  // expression; the store-through-a-local-into-a-subscript idiom marks it
  // already cached so a pass would not stack a second, redundant cache.
  const cachedRanges = collectAlreadyCachedRanges(ast)
  const dedupedMemo = positionMemo
    .filter((site) => !claimed.some(([start, end]) => site.start >= start && site.end <= end))
    .map((site) => (cachedRanges.some(([start, end]) => site.start >= start && site.end <= end)
      ? { ...site, kind: 'already-cached' as const }
      : site))

  return {
    indexTabling,
    positionMemo: dedupedMemo,
    paletteSpecialization: countPaletteSpecializationSites(ast, immutableGlobals),
  }
}

// ── maximal-subtree collection ───────────────────────────────────────────────

interface SiteInfo {
  sourceText: string
  calls: number
  operations: number
  start: number
  end: number
}

function collectMaximalSites<Verdict extends string>(
  root: Node,
  source: string,
  context: ClassifyContext,
  judge: (classification: Classification, node: Node) => Verdict | null,
  emit: (site: SiteInfo, verdict: Verdict, node: Node) => void,
): void {
  const attempt = (node: Node): boolean => {
    if (!node || typeof node !== 'object' || typeof node.start !== 'number') return false
    if (!isExpressionNode(node)) return false
    const classification = classifyExpression(node, context)
    const verdict = judge(classification, node)
    if (verdict === null) return false
    emit({
      sourceText: source.slice(node.start, node.end),
      calls: classification.calls,
      operations: classification.operations,
      start: node.start,
      end: node.end,
    }, verdict, node)
    return true
  }
  const walk = (node: Node): void => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
      || node.type === 'ArrowFunctionExpression') return
    if (node.type === 'AssignmentExpression') {
      walk(node.right as Node)
      if (node.left?.type === 'MemberExpression' && node.left.computed) walk(node.left.property as Node)
      return
    }
    if (isExpressionNode(node) && attempt(node)) return
    for (const [key, child] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue
      if (Array.isArray(child)) child.forEach((item) => walk(item as Node))
      else if (child && typeof child === 'object') walk(child as Node)
    }
  }
  walk(root)
}

function isExpressionNode(node: Node): boolean {
  return node.type === 'CallExpression'
    || node.type === 'BinaryExpression'
    || node.type === 'LogicalExpression'
    || node.type === 'UnaryExpression'
    || node.type === 'ConditionalExpression'
}

/** Cost of the single most expensive builtin call in the subtree. */
function maxSingleCallCost(node: Node, context: ClassifyContext): number {
  let max = 0
  visitNode(node, (child) => {
    if (child.type !== 'CallExpression' || child.callee?.type !== 'Identifier') return
    const callee = child.callee.name as string
    const shadowed = context.functions.has(callee) || context.globals.has(callee)
    if (!shadowed && DEVICE_COST_X_MUL[callee] !== undefined) {
      max = Math.max(max, DEVICE_COST_X_MUL[callee])
    }
  })
  return max
}

/** Estimated device cost of a subtree in multiples of a multiply, from the
 * profiled per-builtin ratios; arithmetic nodes count ~1.1x, calls to
 * pure-value user functions a flat 3x (bodies vary; this only ranks). */
function estimateSubtreeCost(node: Node, context: ClassifyContext): number {
  let cost = 0
  visitNode(node, (child) => {
    if (child.type === 'CallExpression' && child.callee?.type === 'Identifier') {
      const callee = child.callee.name as string
      const shadowed = context.functions.has(callee) || context.globals.has(callee)
      if (!shadowed && DEVICE_COST_X_MUL[callee] !== undefined) cost += DEVICE_COST_X_MUL[callee]
      else if (context.pureFunctions.has(callee)) cost += 3
      return
    }
    if (child.type === 'BinaryExpression' || child.type === 'LogicalExpression'
      || child.type === 'UnaryExpression' || child.type === 'ConditionalExpression') cost += 1.1
  })
  return cost
}

// ── already-cached suppression ───────────────────────────────────────────────

/** Ranges of expressions inside the authored lazy-fill idiom: within one
 * function, `V = <expr>` and `A[i] = V` in an if-body whose TEST reads V,
 * where V was earlier loaded from a read of the same array A (the sentinel
 * check). All three legs are required — a bare conditional output-buffer
 * write (`if (cond) { v = f(x); buf[i] = v }`) is NOT a cache and must not
 * hide its expression from the census. */
function collectAlreadyCachedRanges(ast: Node): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = []
  for (const statement of ast.body as Node[]) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'FunctionDeclaration') continue
    const fnBody = declaration.body as Node

    // Leg 3 prerequisite: EVERY definition of each var, with position and the
    // arrays its RHS reads. The sentinel check is only proven when the
    // variable's LATEST definition before the if-test is the array load —
    // an intervening overwrite (`v = A[i]; v = x; if (v) ...`) breaks the
    // idiom and must not suppress the candidate.
    const definitionsByName = new Map<string, Array<{ position: number; readsArrays: Set<string> }>>()
    const recordDefinition = (targetName: string, expression: Node, position: number): void => {
      const readsArrays = new Set<string>()
      visitNode(expression, (read) => {
        if (read.type === 'MemberExpression' && read.computed && read.object?.type === 'Identifier') {
          readsArrays.add(read.object.name as string)
        }
      })
      const definitions = definitionsByName.get(targetName) ?? []
      definitions.push({ position, readsArrays })
      definitionsByName.set(targetName, definitions)
    }
    visitNode(fnBody, (child) => {
      if (child.type === 'VariableDeclaration') {
        for (const item of child.declarations as Node[]) {
          if (item.id?.type === 'Identifier' && item.init) {
            recordDefinition(item.id.name as string, item.init as Node, item.start as number)
          }
        }
      }
      if (child.type === 'AssignmentExpression' && child.left?.type === 'Identifier' && child.right) {
        // Compound assignments (v += x) depend on the prior value — they are
        // definitions that do NOT carry the array-load provenance, so an
        // intervening one correctly breaks the lazy-fill chain below.
        if (child.operator === '=') {
          recordDefinition(child.left.name as string, child.right as Node, child.start as number)
        } else {
          const definitions = definitionsByName.get(child.left.name as string) ?? []
          definitions.push({ position: child.start as number, readsArrays: new Set() })
          definitionsByName.set(child.left.name as string, definitions)
        }
      }
      if (child.type === 'UpdateExpression' && child.argument?.type === 'Identifier') {
        const definitions = definitionsByName.get(child.argument.name as string) ?? []
        definitions.push({ position: child.start as number, readsArrays: new Set() })
        definitionsByName.set(child.argument.name as string, definitions)
      }
    })

    visitNode(fnBody, (node) => {
      if (node.type !== 'IfStatement') return
      const body = node.consequent as Node
      const statements: Node[] = body?.type === 'BlockStatement' ? body.body as Node[] : body ? [body] : []
      const valueExprByName = new Map<string, Node>()
      const storedInto = new Map<string, string>()
      for (const statement of statements) {
        visitNode(statement, (child) => {
          if (child.type !== 'AssignmentExpression' || child.operator !== '=') return
          if (child.left?.type === 'Identifier' && child.right) {
            valueExprByName.set(child.left.name as string, child.right as Node)
          }
          if (child.left?.type === 'MemberExpression' && child.left.computed
            && child.left.object?.type === 'Identifier' && child.right?.type === 'Identifier') {
            storedInto.set(child.right.name as string, child.left.object.name as string)
          }
        })
      }
      const testReferences = new Set<string>()
      visitNode(node.test as Node, (child) => {
        if (child.type === 'Identifier') testReferences.add(child.name as string)
      })
      for (const [name, array] of storedInto) {
        const expression = valueExprByName.get(name)
        if (!expression) continue
        if (!testReferences.has(name)) continue
        const priorDefinitions = (definitionsByName.get(name) ?? [])
          .filter((definition) => definition.position < (node.start as number))
          .sort((left, right) => left.position - right.position)
        const latest = priorDefinitions[priorDefinitions.length - 1]
        if (!latest || !latest.readsArrays.has(array)) continue
        ranges.push([expression.start as number, expression.end as number])
      }
    })
  }
  return ranges
}

// ── static loop shape ────────────────────────────────────────────────────────

function readStaticLoop(node: Node): { inductionVar: string; tripCount: number } | null {
  let inductionVar: string | null = null
  let initValue: number | null = null
  const init = node.init as Node | null
  if (init?.type === 'VariableDeclaration' && init.declarations?.length === 1) {
    const declaration = init.declarations[0] as Node
    if (declaration.id?.type === 'Identifier' && declaration.init?.type === 'Literal'
      && typeof declaration.init.value === 'number') {
      inductionVar = declaration.id.name as string
      initValue = declaration.init.value as number
    }
  } else if (init?.type === 'AssignmentExpression' && init.operator === '='
    && init.left?.type === 'Identifier' && init.right?.type === 'Literal'
    && typeof init.right.value === 'number') {
    inductionVar = init.left.name as string
    initValue = init.right.value as number
  }
  if (inductionVar === null || initValue === null) return null

  const test = node.test as Node | null
  if (test?.type !== 'BinaryExpression' || (test.operator !== '<' && test.operator !== '<=')) return null
  if (test.left?.type !== 'Identifier' || test.left.name !== inductionVar) return null
  if (test.right?.type !== 'Literal' || typeof test.right.value !== 'number') return null
  const bound = test.right.value as number

  const update = node.update as Node | null
  let step: number | null = null
  if (update?.type === 'UpdateExpression' && update.operator === '++'
    && update.argument?.type === 'Identifier' && update.argument.name === inductionVar) {
    step = 1
  } else if (update?.type === 'AssignmentExpression' && update.operator === '+='
    && update.left?.type === 'Identifier' && update.left.name === inductionVar
    && update.right?.type === 'Literal' && typeof update.right.value === 'number'
    && (update.right.value as number) > 0) {
    step = update.right.value as number
  } else if (update?.type === 'AssignmentExpression' && update.operator === '='
    && update.left?.type === 'Identifier' && update.left.name === inductionVar
    && update.right?.type === 'BinaryExpression' && update.right.operator === '+') {
    // The catalogue's dominant idiom is `i = i + 1`, not `i++`.
    const { left, right } = update.right as Node
    const literalSide = left?.type === 'Identifier' && left.name === inductionVar ? right : left
    const varSide = literalSide === right ? left : right
    if (varSide?.type === 'Identifier' && varSide.name === inductionVar
      && literalSide?.type === 'Literal' && typeof literalSide.value === 'number'
      && (literalSide.value as number) > 0) {
      step = literalSide.value as number
    }
  }
  if (step === null) return null

  // A body write to the induction variable makes the "index" arbitrary
  // (possibly position-derived or fractional); the loop is not statically
  // counted no matter what init/test/update say.
  let bodyWritesInduction = false
  visitNode(node.body as Node, (child) => {
    if (child.type === 'AssignmentExpression' && child.left?.type === 'Identifier'
      && child.left.name === inductionVar) bodyWritesInduction = true
    if (child.type === 'UpdateExpression' && child.argument?.type === 'Identifier'
      && child.argument.name === inductionVar) bodyWritesInduction = true
  })
  if (bodyWritesInduction) return null

  const span = bound - initValue
  if (span < 0 || (span === 0 && test.operator === '<')) return null
  // `<`: iterations while i < bound; `<=`: one more when the boundary lands
  // exactly. Both forms are correct for fractional steps
  // (for (i=0; i<=1; i+=0.5) runs three times, not four).
  const tripCount = test.operator === '<'
    ? Math.ceil(span / step)
    : Math.floor(span / step) + 1
  if (tripCount <= 0) return null
  // Fractional bounds must count identically in device 16.16: 0.1 rounds to
  // 6554/65536, so for (i=0; i<=1; i+=0.1) runs 10 times on hardware but 11
  // in float64. A loop whose count differs between modes cannot be tabled
  // exactly with one trip count.
  if (!Number.isInteger(initValue) || !Number.isInteger(bound) || !Number.isInteger(step)) {
    const to16 = (value: number): number => Math.round(value * 65536)
    let fixed = to16(initValue)
    const bound16 = to16(bound)
    const step16 = to16(step)
    if (step16 <= 0) return null
    let fixedCount = 0
    while ((test.operator === '<' ? fixed < bound16 : fixed <= bound16) && fixedCount <= 200) {
      fixedCount += 1
      fixed += step16
    }
    if (fixedCount !== tripCount) return null
  }
  return { inductionVar, tripCount }
}

// ── classifier (spike-local port of showFrameInvariantHoisting + extensions) ──

function classifyExpression(node: Node, context: ClassifyContext, depth = 0): Classification {
  if (!node || depth > 24) return classified(['unknown'], 0)
  if (node.type === 'Literal') return classified([], 0)
  if (node.type === 'Identifier') {
    const name = node.name as string
    if (name === 'pixelCount') return classified(['position'], 0)
    if (context.loopIndices.has(name)) return classified(['loop-index'], 0)
    const paramClass = context.paramClasses?.get(name)
    if (paramClass) return { dependencies: new Set(paramClass), operations: 0, calls: 0 }
    const paramIndex = context.params.indexOf(name)
    if (paramIndex >= 0) return classified([paramIndex === 0 ? 'render-index' : 'position'], 0)
    if (context.locals.has(name)) {
      // Copy-propagate through the local's declarator initializer for reads
      // the initial value still reaches (before the kill position). Ground
      // truth needs this: Kishimisu's exp(-len0) reads px/py-derived len0
      // before the octave loop reassigns px/py.
      const readPos = node.start as number
      const killPos = context.localKillPositions.get(name) ?? Infinity
      if (readPos < killPos) {
        const initializer = context.localInitializers.get(name)
        if (initializer) return classifyExpression(initializer, context, depth + 1)
      }
      return classified(['unknown'], 0)
    }
    if (context.renderMutated.has(name)) {
      // The out-var idiom: Shader.toUV-style helpers return values by writing
      // globals, which flow-insensitive mutation analysis reads as
      // render-mutation. When every write to the global classifies as
      // position-only through the writer's joined call-site argument classes,
      // reads carry that class instead. (Flow-insensitive: a read before the
      // defining call in the same render would be misclassified; the
      // catalogue idiom always reads immediately after the call, and any
      // generated transform re-verifies per site on hardware checksums.)
      const outVarClass = context.outVarClasses.get(name)
      if (outVarClass) return { dependencies: new Set(outVarClass), operations: 0, calls: 0 }
      return classified(['render-mutation'], 0)
    }
    if (context.controls.has(name)) return classified(['control'], 0)
    if (context.frameMutated.has(name)) return classified(['frame'], 0)
    if (context.immutableGlobals.has(name)) return classified(['constant'], 0)
    if (context.globals.has(name)) return classified(['private-state'], 0)
    return classified(['unknown'], 0)
  }
  if (node.type === 'CallExpression') {
    const callee = node.callee?.type === 'Identifier' ? node.callee.name as string : null
    const shadowed = callee !== null
      && (context.functions.has(callee) || context.globals.has(callee))
    if (callee !== null && !shadowed && FRAME_SOURCE_CALLS.has(callee)) {
      const parts = ((node.arguments as Node[]) ?? []).map((argument) => classifyExpression(argument, context, depth + 1))
      return combine([...parts, classified(['frame'], 0)], 1, 1)
    }
    if (callee !== null && context.pureFunctions.has(callee)) {
      // Interprocedural: a pure-value top-level function's result depends only
      // on its arguments (plus immutable globals). Library helpers like
      // smoothstep arrive as top-level functions post-bundle; without this the
      // hand-tabled NeonSquircles anim term is invisible.
      return combine([
        ...((node.arguments as Node[]) ?? []).map((argument) => classifyExpression(argument, context, depth + 1)),
        classified(['constant'], 0),
      ], 3, 1)
    }
    if (callee === null || !PURE_CALLS.has(callee) || shadowed) return classified(['unknown'], 1)
    return combine(((node.arguments as Node[]) ?? []).map((argument) => classifyExpression(argument, context, depth + 1)), 1, 1)
  }
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    return combine([
      classifyExpression(node.left, context, depth + 1),
      classifyExpression(node.right, context, depth + 1),
    ], 1)
  }
  if (node.type === 'UnaryExpression') return combine([classifyExpression(node.argument, context, depth + 1)], 1)
  if (node.type === 'ConditionalExpression') {
    return combine([
      classifyExpression(node.test, context, depth + 1),
      classifyExpression(node.consequent, context, depth + 1),
      classifyExpression(node.alternate, context, depth + 1),
    ], 1)
  }
  return classified(['unknown'], 0)
}

function classified(dependencies: Issue914Dependency[], operations: number, calls = 0): Classification {
  return { dependencies: new Set(dependencies), operations, calls }
}

function combine(parts: Classification[], ownOperations: number, ownCalls = 0): Classification {
  const dependencies = new Set<Issue914Dependency>()
  let operations = ownOperations
  let calls = ownCalls
  for (const part of parts) {
    part.dependencies.forEach((dependency) => dependencies.add(dependency))
    operations += part.operations
    calls += part.calls
  }
  return { dependencies, operations, calls }
}

// ── out-var classification ───────────────────────────────────────────────────

/**
 * The catalogue's helper idiom returns values by writing globals (Shader.toUV
 * writes ux/uy), which flow-insensitive mutation analysis classifies as
 * render-mutation and hides position-only dataflow. This computes a class for
 * each such global by joining, over every assignment to it, the class of the
 * assigned expression — with the writer's parameters classified as the join
 * of the argument classes at every observed call site. Globals also written
 * from beforeRender/controls, written through subscripts, or whose assignment
 * reads any render-mutated global (self-feeding accumulators carry state
 * across pixels, which position classes must never claim) are excluded.
 */
function computeOutVarClasses(input: {
  functions: Map<string, Node>
  globals: Set<string>
  immutableGlobals: Set<string>
  frameMutated: Set<string>
  controls: Set<string>
  renderMutated: Set<string>
  pureFunctions: Set<string>
}): {
  classes: Map<string, Set<Issue914Dependency>>
  paramClassesByFn: Map<string, Array<Set<Issue914Dependency>>>
} {
  const { functions, globals, immutableGlobals, frameMutated, controls, renderMutated, pureFunctions } = input

  // Candidate filter: written only from plain identifier assignments whose RHS
  // never reads a render-mutated global.
  const candidates = new Set<string>()
  const GUARDED_TYPES = new Set([
    'IfStatement', 'ConditionalExpression', 'LogicalExpression', 'SwitchStatement',
    'ForStatement', 'WhileStatement', 'DoWhileStatement',
  ])
  for (const name of renderMutated) {
    if (frameMutated.has(name) || controls.has(name)) continue
    let ok = true
    for (const fn of functions.values()) {
      // Depth-tracked walk: an assignment nested under any conditional or loop
      // may not execute on every call, so the out-var can carry a PRIOR
      // pixel's value (setU(v){ if (v > .5) u = v }) — such a global is state,
      // not a return value, and must stay render-mutation.
      const walk = (node: Node, guarded: boolean): void => {
        if (!ok || !node || typeof node !== 'object') return
        if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
          || node.type === 'ArrowFunctionExpression') return
        if (node.type === 'AssignmentExpression') {
          const target = node.left as Node
          const targetsName = (target?.type === 'Identifier' && target.name === name)
            || (target?.type === 'MemberExpression' && target.object?.type === 'Identifier'
              && target.object.name === name)
          if (targetsName) {
            if (guarded || target.type === 'MemberExpression' || node.operator !== '=') { ok = false; return }
            visitNode(node.right as Node, (read) => {
              if (read.type === 'Identifier' && renderMutated.has(read.name as string)) ok = false
            })
          }
        }
        if (node.type === 'UpdateExpression') {
          const target = node.argument as Node
          if (target?.type === 'Identifier' && target.name === name) { ok = false; return }
        }
        const childGuarded = guarded || GUARDED_TYPES.has(node.type as string)
        for (const [key, child] of Object.entries(node)) {
          if (key === 'start' || key === 'end' || key === 'loc') continue
          if (Array.isArray(child)) child.forEach((item) => walk(item as Node, childGuarded))
          else if (child && typeof child === 'object') walk(child as Node, childGuarded)
        }
      }
      walk(fn.body, false)
    }
    if (!ok) continue
    // An unconditional assignment inside the writer is not enough: the WRITER
    // itself must run on every evaluation, or the out-var still carries
    // prior-pixel state (`if (x > .5) setU(x); ... exp(u)`). Require every
    // call site of every non-entry writer to be an unguarded call from a
    // firmware entry point (render*/beforeRender).
    const ENTRY_FNS = new Set(['render', 'render2D', 'render3D', 'beforeRender'])
    const writers = [...functions.keys()].filter((fnName) => {
      const fn = functions.get(fnName)!
      let writes = false
      visitNode(fn.body, (node) => {
        if (node.type === 'AssignmentExpression' && node.left?.type === 'Identifier'
          && node.left.name === name) writes = true
      })
      return writes
    })
    for (const writer of writers) {
      if (!ok) break
      if (ENTRY_FNS.has(writer)) continue
      for (const [callerName, callerFn] of functions) {
        if (!ok) break
        const checkCalls = (node: Node, guarded: boolean): void => {
          if (!ok || !node || typeof node !== 'object') return
          if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
            || node.type === 'ArrowFunctionExpression') return
          if (node.type === 'CallExpression' && node.callee?.type === 'Identifier'
            && node.callee.name === writer) {
            if (guarded || !ENTRY_FNS.has(callerName)) ok = false
          }
          const childGuarded = guarded || GUARDED_TYPES.has(node.type as string)
          for (const [key, child] of Object.entries(node)) {
            if (key === 'start' || key === 'end' || key === 'loc') continue
            if (Array.isArray(child)) child.forEach((item) => checkCalls(item as Node, childGuarded))
            else if (child && typeof child === 'object') checkCalls(child as Node, childGuarded)
          }
        }
        checkCalls(callerFn.body, false)
      }
    }
    if (!ok) continue
    // Establishment must DOMINATE every read: an unguarded write (direct
    // assignment or writer call) must textually precede each read of the
    // out-var within its function, or the read observes prior-pixel state
    // (`render(index){ color(exp(u)); setU(index) }` reads before writing).
    for (const [, fn] of functions) {
      if (!ok) break
      let earliestEstablish = Infinity
      const reads: number[] = []
      const scan = (node: Node, guarded: boolean): void => {
        if (!node || typeof node !== 'object') return
        if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
          || node.type === 'ArrowFunctionExpression') return
        if (node.type === 'AssignmentExpression' && node.left?.type === 'Identifier'
          && node.left.name === name) {
          if (!guarded) earliestEstablish = Math.min(earliestEstablish, node.start as number)
          scan(node.right as Node, guarded)
          return
        }
        if (node.type === 'CallExpression' && node.callee?.type === 'Identifier'
          && writers.includes(node.callee.name as string) && !guarded) {
          earliestEstablish = Math.min(earliestEstablish, node.start as number)
        }
        if (node.type === 'Identifier' && node.name === name) reads.push(node.start as number)
        const childGuarded = guarded || GUARDED_TYPES.has(node.type as string)
        for (const [key, child] of Object.entries(node)) {
          if (key === 'start' || key === 'end' || key === 'loc') continue
          if (Array.isArray(child)) child.forEach((item) => scan(item as Node, childGuarded))
          else if (child && typeof child === 'object') scan(child as Node, childGuarded)
        }
      }
      scan(fn.body, false)
      if (reads.some((position) => position < earliestEstablish)) ok = false
    }
    if (ok) candidates.add(name)
  }

  const paramClassesByFn = new Map<string, Array<Set<Issue914Dependency>>>()
  const classes = new Map<string, Set<Issue914Dependency>>(
    [...candidates].map((name) => [name, new Set<Issue914Dependency>()]),
  )

  const entryParamClass = (fnName: string, paramIndex: number): Set<Issue914Dependency> | null => {
    if (fnName === 'render' || fnName === 'render2D' || fnName === 'render3D') {
      return new Set([paramIndex === 0 ? 'render-index' : 'position'])
    }
    if (fnName === 'beforeRender') return new Set(['frame'])
    if (fnName.startsWith('slider') || fnName.startsWith('toggle')
      || fnName.startsWith('rgbPicker') || fnName.startsWith('hsvPicker')
      || fnName.startsWith('trigger')) return new Set(['control'])
    return null
  }

  const contextFor = (fnName: string, fn: Node): ClassifyContext => {
    const params = ((fn.params as Node[]) ?? [])
      .filter((param) => param.type === 'Identifier')
      .map((param) => param.name as string)
    const locals = collectFunctionLocals(fn)
    const paramClassArray = paramClassesByFn.get(fnName)
    const paramClasses = new Map<string, Set<Issue914Dependency>>()
    params.forEach((param, index) => {
      const entry = entryParamClass(fnName, index)
      if (entry) paramClasses.set(param, entry)
      else paramClasses.set(param, paramClassArray?.[index] ?? new Set(['unknown']))
    })
    return {
      globals,
      immutableGlobals,
      frameMutated,
      controls,
      renderMutated,
      locals,
      localInitializers: collectSingleAssignmentInitializers(fn.body, locals),
      localKillPositions: collectLocalKillPositions(fn.body, locals),
      params,
      loopIndices: new Set(),
      functions: new Set(functions.keys()),
      pureFunctions,
      outVarClasses: classes,
      paramClasses,
    }
  }

  for (let round = 0; round < 4; round++) {
    let changed = false
    // (a) join call-site argument classes into helper param classes.
    for (const [callerName, callerFn] of functions) {
      const callerContext = contextFor(callerName, callerFn)
      visitNode(callerFn.body, (node) => {
        if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') return
        const calleeName = node.callee.name as string
        if (!functions.has(calleeName) || entryParamClass(calleeName, 0)) return
        const target = functions.get(calleeName)!
        const paramCount = ((target.params as Node[]) ?? []).length
        const existing = paramClassesByFn.get(calleeName)
          ?? Array.from({ length: paramCount }, () => new Set<Issue914Dependency>())
        const args = (node.arguments as Node[]) ?? []
        for (let index = 0; index < paramCount; index++) {
          const argClass = index < args.length
            ? classifyExpression(args[index], callerContext).dependencies
            : new Set<Issue914Dependency>(['unknown'])
          for (const dependency of argClass) {
            if (!existing[index].has(dependency)) { existing[index].add(dependency); changed = true }
          }
        }
        paramClassesByFn.set(calleeName, existing)
      })
    }
    // (b) join assignment classes into out-var classes.
    for (const [fnName, fn] of functions) {
      const context = contextFor(fnName, fn)
      visitNode(fn.body, (node) => {
        if (node.type !== 'AssignmentExpression' || node.left?.type !== 'Identifier') return
        const target = node.left.name as string
        if (!candidates.has(target)) return
        const rhsClass = classifyExpression(node.right as Node, context).dependencies
        const accumulated = classes.get(target)!
        for (const dependency of rhsClass) {
          if (!accumulated.has(dependency)) { accumulated.add(dependency); changed = true }
        }
      })
    }
    if (!changed) break
  }

  return { classes, paramClassesByFn }
}

// ── interprocedural purity ───────────────────────────────────────────────────

/** Fixpoint over top-level functions: pure-value means the body assigns only
 * its own locals, calls only PURE_CALLS or other pure-value functions, and
 * reads only params, own locals, literals, and immutable globals. A call to
 * one classifies as the union of its argument dependencies. */
function collectPureValueFunctions(
  functions: Map<string, Node>,
  globals: Set<string>,
  immutableGlobals: Set<string>,
): Set<string> {
  const pure = new Set<string>(functions.keys())
  let changed = true
  while (changed) {
    changed = false
    for (const [name, fn] of functions) {
      if (!pure.has(name)) continue
      const locals = collectFunctionLocals(fn)
      let ok = true
      visitNode(fn.body, (node) => {
        if (!ok) return
        if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
          const target = node.type === 'AssignmentExpression' ? node.left : node.argument
          if (!(target?.type === 'Identifier' && locals.has(target.name as string))) ok = false
          return
        }
        if (node.type === 'CallExpression') {
          const callee = node.callee?.type === 'Identifier' ? node.callee.name as string : null
          if (callee === null) { ok = false; return }
          const shadowedByGlobal = globals.has(callee)
          const isPureBuiltin = PURE_CALLS.has(callee) && !functions.has(callee) && !shadowedByGlobal
          if (!isPureBuiltin && !pure.has(callee)) ok = false
          return
        }
        if (node.type === 'Identifier') {
          const id = node.name as string
          if (locals.has(id) || immutableGlobals.has(id)) return
          if (globals.has(id)) ok = false
          // Bare unknown identifiers (out-vars written by impure helpers,
          // firmware globals like pixelCount) disqualify unless immutable.
          if (!globals.has(id) && !PURE_CALLS.has(id) && !functions.has(id)) ok = false
        }
      })
      if (!ok) {
        pure.delete(name)
        changed = true
      }
    }
  }
  return pure
}

// ── palette specialization (Rule C, census only) ─────────────────────────────

function countPaletteSpecializationSites(ast: Node, immutableGlobals: Set<string>): number {
  const literalArrayGlobals = new Set<string>()
  for (const statement of ast.body as Node[]) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const item of declaration.declarations as Node[]) {
      if (item.id?.type === 'Identifier' && immutableGlobals.has(item.id.name as string)
        && item.init?.type === 'ArrayExpression'
        && (item.init.elements as Node[]).every((element) => element?.type === 'Literal'
          || (element?.type === 'UnaryExpression' && element.argument?.type === 'Literal'))) {
        literalArrayGlobals.add(item.id.name as string)
      }
    }
  }
  let count = 0
  visitNode(ast, (node) => {
    if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') return
    if (node.callee.name !== 'setPalette') return
    const argument = (node.arguments as Node[] | undefined)?.[0]
    if (!argument) return
    if (argument.type === 'ArrayExpression'
      || (argument.type === 'Identifier' && literalArrayGlobals.has(argument.name as string))) count++
  })
  return count
}

// ── structural helpers (ported unchanged from showFrameInvariantHoisting) ────

function collectTopLevelGlobals(ast: Node): Set<string> {
  const result = new Set<string>()
  for (const statement of ast.body as Node[]) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const item of declaration.declarations as Node[]) {
      if (item.id?.type === 'Identifier') result.add(item.id.name as string)
    }
  }
  return result
}

function collectTopLevelFunctions(ast: Node): Map<string, Node> {
  const result = new Map<string, Node>()
  for (const statement of ast.body as Node[]) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
      result.set(declaration.id.name as string, declaration)
    }
  }
  return result
}

function collectRenderReachableFunctions(functions: Map<string, Node>): Set<string> {
  return collectReachableFrom(functions, ['render', 'render2D', 'render3D'])
}

function collectReachableFrom(functions: Map<string, Node>, seeds: string[]): Set<string> {
  const result = new Set<string>()
  const pending = seeds.filter((name) => functions.has(name))
  while (pending.length > 0) {
    const name = pending.pop()!
    if (result.has(name)) continue
    result.add(name)
    const fn = functions.get(name)
    if (!fn) continue
    visitNode(fn.body, (node) => {
      if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') return
      const called = node.callee.name as string
      if (functions.has(called) && !result.has(called)) pending.push(called)
    })
  }
  return result
}

function collectMutatedGlobals(
  functionNames: Set<string>,
  functions: Map<string, Node>,
  globals: Set<string>,
): Set<string> {
  const result = new Set<string>()
  for (const name of functionNames) {
    const fn = functions.get(name)
    if (!fn) continue
    visitNode(fn.body, (node) => {
      if (node.type === 'AssignmentExpression') markMutationTarget(node.left, globals, result)
      if (node.type === 'UpdateExpression') markMutationTarget(node.argument, globals, result)
    })
  }
  return result
}

function markMutationTarget(target: Node, globals: Set<string>, result: Set<string>): void {
  if (target?.type === 'Identifier' && globals.has(target.name as string)) result.add(target.name as string)
  if (target?.type === 'MemberExpression' && target.object?.type === 'Identifier'
    && globals.has(target.object.name as string)) result.add(target.object.name as string)
}

function collectFunctionLocals(fn: Node): Set<string> {
  const result = new Set<string>(((fn.params as Node[]) ?? [])
    .filter((param) => param.type === 'Identifier')
    .map((param) => param.name as string))
  visitFunctionStatements(fn.body, (statement) => {
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations as Node[]) {
        if (declaration.id?.type === 'Identifier') result.add(declaration.id.name as string)
      }
    }
  })
  return result
}

function collectSingleAssignmentInitializers(body: Node, locals: Set<string>): Map<string, Node> {
  const result = new Map<string, Node>()
  visitFunctionStatements(body, (statement) => {
    if (statement.type !== 'VariableDeclaration') return
    for (const declaration of statement.declarations as Node[]) {
      if (declaration.id?.type === 'Identifier' && declaration.init
        && locals.has(declaration.id.name as string)
        && !result.has(declaration.id.name as string)) {
        result.set(declaration.id.name as string, declaration.init as Node)
      }
    }
  })
  return result
}

const LOOP_TYPES = new Set(['ForStatement', 'WhileStatement', 'DoWhileStatement'])

function collectLocalKillPositions(body: Node, bindings: Set<string>): Map<string, number> {
  const result = new Map<string, number>()
  const kill = (name: string, position: number): void => {
    result.set(name, Math.min(result.get(name) ?? Infinity, position))
  }
  const walk = (node: Node, loopStack: number[]): void => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
      || node.type === 'ArrowFunctionExpression') return
    const nextStack = LOOP_TYPES.has(node.type as string)
      ? [...loopStack, node.start as number]
      : loopStack
    const target = node.type === 'AssignmentExpression' ? node.left
      : node.type === 'UpdateExpression' ? node.argument : null
    if (target?.type === 'Identifier' && bindings.has(target.name as string)) {
      // A reassignment kills from its own position, or from the outermost
      // enclosing loop's start (earlier iterations' reads see later values).
      kill(target.name as string, nextStack.length > 0 ? nextStack[0] : node.start as number)
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue
      if (Array.isArray(child)) child.forEach((item) => walk(item as Node, nextStack))
      else if (child && typeof child === 'object') walk(child as Node, nextStack)
    }
  }
  walk(body, [])
  return result
}

function visitFunctionStatements(node: Node, visitor: (statement: Node) => void): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return
  if (node.type?.endsWith('Statement') || node.type === 'VariableDeclaration') visitor(node)
  for (const [key, child] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(child)) child.forEach((item) => visitFunctionStatements(item as Node, visitor))
    else if (child && typeof child === 'object') visitFunctionStatements(child as Node, visitor)
  }
}

function visitNode(node: Node, visitor: (node: Node) => void): void {
  if (!node || typeof node !== 'object') return
  visitor(node)
  for (const [key, child] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(child)) child.forEach((item) => visitNode(item as Node, visitor))
    else if (child && typeof child === 'object') visitNode(child as Node, visitor)
  }
}
