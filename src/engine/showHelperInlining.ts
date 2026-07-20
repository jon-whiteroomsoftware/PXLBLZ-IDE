// #565: bounded, exact call-site inlining of tiny pure member helpers.
//
// #532 priced user-function call overhead at 1.899-3.449 us per call (rising
// with argument count) - pure boundary cost the VM pays even for a
// two-comparison body. This pass substitutes argument expressions for
// parameters in a parenthesized copy of a single-return helper's body, so
// the arithmetic (and therefore Fast/Precise checksums) is unchanged.
//
// Safety boundary (#520): inlining routed transition bodies broke hardware
// activation in the closed program - helper isolation there is load-bearing.
// This pass runs on authored member source before any Show code generation
// and must never be applied to generated transition or scheduler functions.
import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export interface ShowHelperInliningOptions {
  /** Net source-growth allowance per member (default 1,024 bytes, the #513
   * precedent). Call sites are taken in source order until the next one
   * would exceed it. */
  growthAllowanceBytes?: number
}

export interface ShowHelperInliningResult {
  source: string
  inlinedCallCount: number
  removedHelperCount: number
  /** Final minus original source bytes (negative when dead helpers left). */
  addedSourceBytes: number
}

const RENDERER_ENTRY_NAMES = new Set(['beforeRender', 'render', 'render2D', 'render3D'])
const CONTROL_PREFIXES = ['slider', 'toggle', 'trigger', 'inputNumber', 'showNumber', 'gauge', 'hsvPicker', 'rgbPicker']
// Mirror of the frame-invariant PURE_CALLS set: built-ins with no observable
// evaluation-count effects. random() is deliberately absent.
const ALLOWED_CALLS = new Set([
  'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'clamp', 'cos', 'exp', 'floor',
  'frac', 'hypot', 'log', 'max', 'min', 'pow', 'round', 'sin', 'sqrt', 'square',
  'tan', 'triangle', 'wave',
])
const MAX_INLINE_PASSES = 3

interface QualifyingHelper {
  name: string
  params: string[]
  paramUseCounts: Map<string, number>
  bodyStart: number
  bodyEnd: number
  /** Identifier occurrences of each param inside the return expression,
   * as [start, end, name], sorted ascending. */
  paramSites: Array<{ start: number; end: number; name: string }>
}

export function inlineShowMemberHelpers(
  source: string,
  options: ShowHelperInliningOptions = {},
): ShowHelperInliningResult {
  const allowance = options.growthAllowanceBytes ?? 1_024
  const originalLength = source.length
  let current = source
  let inlinedCallCount = 0
  let growth = 0

  for (let pass = 0; pass < MAX_INLINE_PASSES; pass += 1) {
    const ast = parse(current)
    if (!ast) break
    const helpers = collectQualifyingHelpers(ast, current)
    if (helpers.size === 0) break
    const callSites = collectInlinableCallSites(ast, current, helpers)
    if (callSites.length === 0) break
    const replacements: Array<{ start: number; end: number; text: string }> = []
    for (const site of callSites) {
      const callLength = site.end - site.start
      const delta = site.replacement.length - callLength
      if (growth + delta > allowance) continue
      growth += delta
      replacements.push({ start: site.start, end: site.end, text: site.replacement })
    }
    if (replacements.length === 0) break
    replacements.sort((left, right) => right.start - left.start)
    for (const replacement of replacements) {
      current = current.slice(0, replacement.start) + replacement.text + current.slice(replacement.end)
    }
    inlinedCallCount += replacements.length
  }

  let removedHelperCount = 0
  if (inlinedCallCount > 0) {
    const removal = removeDeadHelpers(current)
    current = removal.source
    removedHelperCount = removal.removedCount
  }
  return {
    source: current,
    inlinedCallCount,
    removedHelperCount,
    addedSourceBytes: current.length - originalLength,
  }
}

function parse(source: string): Node | null {
  try {
    return acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  } catch {
    return null
  }
}

function topLevelDeclarations(ast: Node): Array<{ statement: Node; declaration: Node; exported: boolean }> {
  return (ast.body as Node[]).map((statement) => ({
    statement,
    declaration: statement.type === 'ExportNamedDeclaration' ? statement.declaration as Node : statement,
    exported: statement.type === 'ExportNamedDeclaration',
  }))
}

function collectQualifyingHelpers(ast: Node, source: string): Map<string, QualifyingHelper> {
  const functionNames = new Set<string>()
  for (const { declaration } of topLevelDeclarations(ast)) {
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
      functionNames.add(declaration.id.name as string)
    }
  }
  const valueReferenced = collectValueReferencedNames(ast, functionNames)
  const candidates = new Map<string, { fn: Node; returnExpression: Node }>()
  for (const { declaration, exported } of topLevelDeclarations(ast)) {
    if (declaration?.type !== 'FunctionDeclaration' || !declaration.id?.name) continue
    const name = declaration.id.name as string
    if (exported || RENDERER_ENTRY_NAMES.has(name)) continue
    if (CONTROL_PREFIXES.some((prefix) => name.startsWith(prefix))) continue
    if (valueReferenced.has(name)) continue
    const params = declaration.params as Node[] ?? []
    if (!params.every((param) => param.type === 'Identifier')) continue
    const body = declaration.body as Node
    if (body?.type !== 'BlockStatement' || (body.body as Node[]).length !== 1) continue
    const only = (body.body as Node[])[0]
    if (only.type !== 'ReturnStatement' || !only.argument) continue
    candidates.set(name, { fn: declaration, returnExpression: only.argument as Node })
  }
  // A helper body may call built-ins or other qualifying helpers; cycles
  // disqualify (the pass bound would leave residual calls anyway).
  const memo = new Map<string, boolean>()
  const visiting = new Set<string>()
  const bodyIsPure = (name: string): boolean => {
    const known = memo.get(name)
    if (known !== undefined) return known
    if (visiting.has(name)) return false
    visiting.add(name)
    const candidate = candidates.get(name)
    const pure = candidate !== undefined
      && isPureExpression(candidate.returnExpression, (callee) => (
        (ALLOWED_CALLS.has(callee) && !candidates.has(callee) && !isShadowedBuiltin(callee, ast))
        || (candidates.has(callee) && bodyIsPure(callee))
      ))
    visiting.delete(name)
    memo.set(name, pure)
    return pure
  }
  const helpers = new Map<string, QualifyingHelper>()
  for (const [name, candidate] of candidates) {
    if (!bodyIsPure(name)) continue
    const params = (candidate.fn.params as Node[]).map((param) => param.name as string)
    const paramSet = new Set(params)
    const paramSites: Array<{ start: number; end: number; name: string }> = []
    visitExpression(candidate.returnExpression, (node) => {
      if (node.type === 'Identifier' && paramSet.has(node.name as string)) {
        paramSites.push({ start: node.start as number, end: node.end as number, name: node.name as string })
      }
    })
    const paramUseCounts = new Map<string, number>(params.map((param) => [param, 0]))
    for (const site of paramSites) paramUseCounts.set(site.name, (paramUseCounts.get(site.name) ?? 0) + 1)
    paramSites.sort((left, right) => left.start - right.start)
    helpers.set(name, {
      name,
      params,
      paramUseCounts,
      bodyStart: candidate.returnExpression.start as number,
      bodyEnd: candidate.returnExpression.end as number,
      paramSites,
    })
  }
  void source
  return helpers
}

function isShadowedBuiltin(name: string, ast: Node): boolean {
  for (const { declaration } of topLevelDeclarations(ast)) {
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name === name) return true
    if (declaration?.type === 'VariableDeclaration'
      && (declaration.declarations as Node[]).some((item) => item.id?.name === name)) return true
  }
  return false
}

function collectValueReferencedNames(ast: Node, functionNames: Set<string>): Set<string> {
  const referenced = new Set<string>()
  const walk = (node: Node, parent: Node | null, key: string | null): void => {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return
    if (node.type === 'Identifier' && functionNames.has(node.name as string)) {
      const isCallee = parent?.type === 'CallExpression' && key === 'callee'
      const isDeclarationId = parent?.type === 'FunctionDeclaration' && key === 'id'
      const isNonComputedProperty = parent?.type === 'MemberExpression' && key === 'property' && !parent.computed
      if (!isCallee && !isDeclarationId && !isNonComputedProperty) referenced.add(node.name as string)
    }
    for (const [childKey, child] of Object.entries(node)) {
      if (childKey === 'start' || childKey === 'end' || childKey === 'loc') continue
      if (Array.isArray(child)) child.forEach((item) => walk(item as Node, node, childKey))
      else if (child && typeof child === 'object') walk(child as Node, node, childKey)
    }
  }
  walk(ast, null, null)
  return referenced
}

interface InlinableCallSite {
  start: number
  end: number
  replacement: string
}

function collectInlinableCallSites(
  ast: Node,
  source: string,
  helpers: Map<string, QualifyingHelper>,
): InlinableCallSite[] {
  const sites: InlinableCallSite[] = []
  const helperNames = new Set(helpers.keys())
  for (const { declaration } of topLevelDeclarations(ast)) {
    if (declaration?.type !== 'FunctionDeclaration' || !declaration.id?.name) continue
    // Helper bodies are extraction sources, not edit targets: chains resolve
    // on later passes after the outer helper lands in a caller.
    if (helperNames.has(declaration.id.name as string)) continue
    visitExpression(declaration.body as Node, (node) => {
      if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') return
      const helper = helpers.get(node.callee.name as string)
      if (!helper) return
      const args = node.arguments as Node[] ?? []
      if (args.length !== helper.params.length) return
      const argSources: string[] = []
      for (const [index, argument] of args.entries()) {
        const param = helper.params[index]
        const uses = helper.paramUseCounts.get(param) ?? 0
        const trivial = argument.type === 'Identifier' || argument.type === 'Literal'
        // Never duplicate a non-trivial argument, and never move an impure
        // one into the body (its evaluation position changes).
        if (uses > 1 && !trivial) return
        if (!trivial && !isPureExpression(argument, (callee) => (
          ALLOWED_CALLS.has(callee) || helperNames.has(callee)
        ))) return
        const text = source.slice(argument.start as number, argument.end as number)
        argSources.push(trivial ? text : `(${text})`)
      }
      const body = source.slice(helper.bodyStart, helper.bodyEnd)
      let replacement = ''
      let cursor = helper.bodyStart
      for (const site of helper.paramSites) {
        replacement += body.slice(cursor - helper.bodyStart, site.start - helper.bodyStart)
        replacement += argSources[helper.params.indexOf(site.name)]
        cursor = site.end
      }
      replacement += body.slice(cursor - helper.bodyStart)
      sites.push({
        start: node.start as number,
        end: node.end as number,
        replacement: `(${replacement})`,
      })
    })
  }
  return sites.sort((left, right) => left.start - right.start)
}

/** Pure means: literals, reads (including array reads), arithmetic, and
 * calls the predicate accepts. Assignments, updates, functions, and
 * anything unrecognized disqualify. */
function isPureExpression(node: Node, callAllowed: (callee: string) => boolean): boolean {
  if (!node || typeof node !== 'object') return false
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
      return true
    case 'MemberExpression':
      return isPureExpression(node.object as Node, callAllowed)
        && (!node.computed || isPureExpression(node.property as Node, callAllowed))
    case 'BinaryExpression':
    case 'LogicalExpression':
      return isPureExpression(node.left as Node, callAllowed) && isPureExpression(node.right as Node, callAllowed)
    case 'UnaryExpression':
      return isPureExpression(node.argument as Node, callAllowed)
    case 'ConditionalExpression':
      return isPureExpression(node.test as Node, callAllowed)
        && isPureExpression(node.consequent as Node, callAllowed)
        && isPureExpression(node.alternate as Node, callAllowed)
    case 'CallExpression':
      return node.callee?.type === 'Identifier'
        && callAllowed(node.callee.name as string)
        && (node.arguments as Node[] ?? []).every((argument) => isPureExpression(argument, callAllowed))
    default:
      return false
  }
}

function removeDeadHelpers(source: string): { source: string; removedCount: number } {
  let current = source
  let removedCount = 0
  // Iterate: removing one dead helper can orphan another it referenced.
  for (let round = 0; round < MAX_INLINE_PASSES + 1; round += 1) {
    const ast = parse(current)
    if (!ast) break
    const removable: Array<{ start: number; end: number }> = []
    for (const { statement, declaration, exported } of topLevelDeclarations(ast)) {
      if (exported || declaration?.type !== 'FunctionDeclaration' || !declaration.id?.name) continue
      const name = declaration.id.name as string
      if (RENDERER_ENTRY_NAMES.has(name)) continue
      if (CONTROL_PREFIXES.some((prefix) => name.startsWith(prefix))) continue
      let referenced = false
      visitExpression(ast, (node) => {
        if (referenced || node.type !== 'Identifier' || node.name !== name) return
        if (node.start >= declaration.id.start && node.end <= declaration.id.end) return
        referenced = true
      })
      if (!referenced) removable.push({ start: statement.start as number, end: statement.end as number })
    }
    if (removable.length === 0) break
    removable.sort((left, right) => right.start - left.start)
    for (const range of removable) {
      const trailing = current.slice(range.end).match(/^\n+/)
      current = current.slice(0, range.start) + current.slice(range.end + (trailing ? trailing[0].length : 0))
    }
    removedCount += removable.length
  }
  return { source: current, removedCount }
}

function visitExpression(node: Node, visitor: (node: Node) => void): void {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return
  visitor(node)
  for (const [key, child] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(child)) child.forEach((item) => visitExpression(item as Node, visitor))
    else if (child && typeof child === 'object') visitExpression(child as Node, visitor)
  }
}
