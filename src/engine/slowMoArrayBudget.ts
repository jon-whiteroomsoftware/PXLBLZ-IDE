import type { AnyNode, CallExpression, ForStatement, FunctionDeclaration, IfStatement, Program, VariableDeclarator } from 'acorn'
import { PIXELBLAZE_ARRAY_HEADER_WORDS } from './showVmResourceLedger'

function visitChildren(node: AnyNode, visit: (child: AnyNode) => void) {
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === 'object' && typeof child.type === 'string') visit(child as AnyNode)
    }
  }
}

function namesWrittenBy(node: AnyNode, names: Set<string>) {
  if (node.type === 'Identifier') {
    names.add(node.name)
    return
  }
  if (node.type === 'MemberExpression') return
  if (node.type === 'Property') {
    namesWrittenBy(node.value, names)
    return
  }
  if (node.type === 'AssignmentPattern') {
    namesWrittenBy(node.left, names)
    return
  }
  visitChildren(node, child => namesWrittenBy(child, names))
}

// Keep intermediates exact in both host numbers and the signed 16.16 VM.
function exactInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= -32768 && value < 32768
    ? value : null
}

function sizeValue(node: AnyNode, scalars: ReadonlyMap<string, number>): number | null {
  if (node.type === 'Literal') return exactInteger(node.value)
  if (node.type === 'Identifier') return scalars.get(node.name) ?? null
  if (node.type === 'UnaryExpression' && (node.operator === '+' || node.operator === '-')) {
    const value = sizeValue(node.argument, scalars)
    return value === null ? null : exactInteger(node.operator === '-' ? -value : value)
  }
  if (node.type !== 'BinaryExpression') return null
  if (node.left.type === 'PrivateIdentifier') return null
  const left = sizeValue(node.left, scalars)
  const right = sizeValue(node.right, scalars)
  if (left === null || right === null) return null
  switch (node.operator) {
    case '+': return exactInteger(left + right)
    case '-': return exactInteger(left - right)
    case '*': return exactInteger(left * right)
    case '/': return exactInteger(left / right)
    default: return null
  }
}

const unbounded = Infinity
const nativeLeafCalls = new Set(['array', 'abs', 'ceil', 'clamp', 'cos', 'floor', 'max', 'min', 'mod', 'random', 'round', 'sin'])
type FunctionNode = FunctionDeclaration | Extract<AnyNode, { type: 'FunctionExpression' | 'ArrowFunctionExpression' }>

function isFunction(node: AnyNode): node is FunctionNode {
  return node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression'
}

function statements(node: AnyNode): AnyNode[] {
  return node.type === 'BlockStatement' ? node.body : [node]
}

// Charge each allocation, including all headers, without assuming reclamation.
// Pixel count is fixed for the lifetime being bounded.
export function boundPatternArrayWords(
  program: Program,
  pixelCount: number,
  programBindings: ReadonlySet<string>,
): number | null {
  const writes = new Map<string, AnyNode[]>()
  const declarations = new Map<string, number>()
  const globalVars = new Map<string, VariableDeclarator>()
  const functions = new Map<string, FunctionDeclaration>()
  const exported = new Set<string>(['beforeRender', 'render', 'render2D', 'render3D'])
  for (const statement of program.body) {
    const isExport = statement.type === 'ExportNamedDeclaration'
    if (isExport) {
      for (const { local } of statement.specifiers) {
        if (local.type === 'Identifier') exported.add(local.name)
      }
    }
    const node = isExport ? statement.declaration : statement
    if (node?.type === 'FunctionDeclaration' && node.id) {
      functions.set(node.id.name, node)
      if (isExport) exported.add(node.id.name)
    }
    if (node?.type === 'VariableDeclaration') {
      for (const declaration of node.declarations) {
        if (declaration.id.type !== 'Identifier') continue
        globalVars.set(declaration.id.name, declaration)
        if (isExport) exported.add(declaration.id.name)
      }
    }
  }

  const parents = new Map<AnyNode, AnyNode>()
  const owners = new Map<AnyNode, FunctionNode>()
  const calls = new Map<FunctionDeclaration, CallExpression[]>()
  const escapes = new Set<FunctionDeclaration>()
  const allocations: (CallExpression | Extract<AnyNode, { type: 'ArrayExpression' }>)[] = []
  let unsupportedSyntax = false
  function scan(node: AnyNode, parent?: AnyNode, enclosing?: FunctionNode) {
    if (parent) parents.set(node, parent)
    if (enclosing) owners.set(node, enclosing)
    const recordBinding = (binding: AnyNode) => {
      const names = new Set<string>()
      namesWrittenBy(binding, names)
      for (const name of names) declarations.set(name, (declarations.get(name) ?? 0) + 1)
    }
    const recordWrite = (target: AnyNode) => {
      const names = new Set<string>()
      namesWrittenBy(target, names)
      for (const name of names) {
        const sites = writes.get(name) ?? []
        sites.push(node)
        writes.set(name, sites)
      }
    }
    if (node.type === 'AssignmentExpression') recordWrite(node.left)
    if (node.type === 'UpdateExpression') recordWrite(node.argument)
    if ((node.type === 'ForOfStatement' || node.type === 'ForInStatement') && node.left.type !== 'VariableDeclaration') {
      recordWrite(node.left)
    }
    if (node.type === 'VariableDeclarator') recordBinding(node.id)
    if (node.type === 'CatchClause' && node.param) recordBinding(node.param)
    if ((node.type === 'ClassDeclaration' || node.type === 'ClassExpression') && node.id) recordBinding(node.id)
    if (isFunction(node)) {
      if (node.type !== 'ArrowFunctionExpression' && node.id) recordBinding(node.id)
      node.params.forEach(recordBinding)
    }
    if (node.type === 'ArrayExpression') allocations.push(node)
    if (node.type === 'Identifier') {
      const directCall = parent?.type === 'CallExpression' && parent.callee === node && !parent.optional ? parent : null
      if (node.name === 'array' && directCall) allocations.push(directCall)
      else if (['array', 'Array', 'eval', 'Function', 'globalThis'].includes(node.name)) unsupportedSyntax = true

      const target = functions.get(node.name)
      if (target && node !== target.id && parent?.type !== 'ExportSpecifier') {
        if (directCall) {
          const sites = calls.get(target) ?? []
          sites.push(directCall)
          calls.set(target, sites)
        } else {
          escapes.add(target)
        }
      }
    }
    visitChildren(node, child => scan(child, node, isFunction(node) ? node : enclosing))
  }
  scan(program)
  if (unsupportedSyntax || programBindings.has('array') || declarations.has('array')
    || programBindings.has('pixelCount') || writes.has('pixelCount') || declarations.has('pixelCount')) return null

  function directFunction(name: string): FunctionDeclaration | undefined {
    return declarations.get(name) === 1 && !writes.has(name) ? functions.get(name) : undefined
  }

  // A function declaration's source position does not establish when it runs.
  // Propagate its earliest at-load call through the direct call graph. Escaped
  // function values could be invoked before any of the scalar initializers.
  const earliestLoad = new Map<FunctionNode, number>()
  for (const fn of escapes) earliestLoad.set(fn, 0)
  function loadPosition(node: AnyNode): number {
    const owner = owners.get(node)
    if (!owner) return node.start
    if (owner.type !== 'FunctionDeclaration' || !owner.id || functions.get(owner.id.name) !== owner) return 0
    return earliestLoad.get(owner) ?? unbounded
  }
  let changed = true
  while (changed) {
    changed = false
    for (const [fn, sites] of calls) {
      const earliest = sites.reduce((position, site) => Math.min(position, loadPosition(site)), earliestLoad.get(fn) ?? unbounded)
      if (earliest < (earliestLoad.get(fn) ?? unbounded)) {
        earliestLoad.set(fn, earliest)
        changed = true
      }
    }
  }

  const stable = new Map<string, { value: number; readyAt: number }>()
  function scalarsAt(position: number) {
    const values = new Map([['pixelCount', pixelCount]])
    for (const [name, { value, readyAt }] of stable) {
      if (readyAt <= position) values.set(name, value)
    }
    return values
  }
  for (const [name, declaration] of globalVars) {
    if (declarations.get(name) !== 1 || writes.has(name) || !declaration.init || exported.has(name)) continue
    const value = sizeValue(declaration.init, scalarsAt(declaration.start))
    if (value !== null) stable.set(name, { value, readyAt: declaration.end })
  }

  function scalarsAtUse(node: AnyNode) {
    const values = scalarsAt(loadPosition(node))
    if (!owners.has(node)) return values
    const preceding: VariableDeclarator[][] = []
    let child = node
    for (let parent = parents.get(child); parent && !isFunction(parent); parent = parents.get(child)) {
      if (parent.type === 'BlockStatement') {
        const index = parent.body.findIndex(statement => statement === child)
        const locals = parent.body.slice(0, index)
          .flatMap(statement => statement.type === 'VariableDeclaration' ? statement.declarations : [])
        preceding.push(locals)
      }
      if (parent.type === 'VariableDeclaration' && child.type === 'VariableDeclarator') {
        preceding.push(parent.declarations.slice(0, parent.declarations.indexOf(child)))
      }
      child = parent
    }
    for (const declaration of preceding.reverse().flat()) {
      if (declaration.id.type !== 'Identifier' || !declaration.init) continue
      const { name } = declaration.id
      if (declarations.get(name) !== 1 || writes.has(name)) continue
      const value = sizeValue(declaration.init, values)
      if (value !== null) values.set(name, value)
    }
    return values
  }

  // Check that a guarded initializer reaches its marker assignment
  // without an early exit or an indirect/reentrant call before the marker.
  function staysInInitializer(node: AnyNode, active: ReadonlySet<FunctionNode>, allowReturn = false): boolean {
    if (isFunction(node)) return true
    if ((!allowReturn && node.type === 'ReturnStatement') || node.type === 'ThrowStatement'
      || node.type === 'TryStatement' || node.type === 'BreakStatement' || node.type === 'ContinueStatement'
      || node.type === 'NewExpression' || node.type === 'TaggedTemplateExpression') return false
    if (node.type === 'CallExpression') {
      if (node.callee.type !== 'Identifier' || node.optional) return false
      const name = node.callee.name
      if (!nativeLeafCalls.has(name) || declarations.has(name) || writes.has(name)) {
        const fn = directFunction(name)
        if (!fn || active.has(fn) || !staysInInitializer(fn.body, new Set([...active, fn]), true)) return false
      }
    }
    let fallsThrough = true
    visitChildren(node, child => { fallsThrough &&= staysInInitializer(child, active, allowReturn) })
    return fallsThrough
  }

  // Find a permanent disabling comparison among the conjuncts of an if-test.
  function disablesTest(test: AnyNode, name: string, value: number): boolean {
    if (test.type === 'LogicalExpression' && test.operator === '&&') {
      return disablesTest(test.left, name, value) || disablesTest(test.right, name, value)
    }
    if (test.type === 'UnaryExpression' && test.operator === '!') {
      return test.argument.type === 'Identifier' && test.argument.name === name && value !== 0
    }
    if (test.type !== 'BinaryExpression' || test.left.type === 'PrivateIdentifier') return false
    const other = test.left.type === 'Identifier' && test.left.name === name ? test.right
      : test.right.type === 'Identifier' && test.right.name === name ? test.left : null
    if (!other) return false
    const comparison = sizeValue(other, new Map([['pixelCount', pixelCount]]))
    if (comparison === null) return false
    if (test.operator === '==' || test.operator === '===') return value !== comparison
    return (test.operator === '!=' || test.operator === '!==') && value === comparison
  }

  function guardBound(branch: IfStatement): number {
    let body = branch.consequent
    const owner = owners.get(branch)
    const active = new Set<FunctionNode>(owner ? [owner] : [])
    const only = statements(body).length === 1 ? statements(body)[0] : null
    if (only?.type === 'ExpressionStatement' && only.expression.type === 'CallExpression'
      && only.expression.callee.type === 'Identifier' && only.expression.arguments.length === 0) {
      const fn = directFunction(only.expression.callee.name)
      if (!fn || active.has(fn)) return unbounded
      body = fn.body
      active.add(fn)
    }
    const steps = statements(body)
    if (!staysInInitializer(branch.test, active)) return unbounded
    for (const [index, step] of steps.entries()) {
      if (step.type !== 'ExpressionStatement' || step.expression.type !== 'AssignmentExpression') continue
      const assignment = step.expression
      if (assignment.operator !== '=' || assignment.left.type !== 'Identifier') continue
      const name = assignment.left.name
      const marker = globalVars.get(name)
      if (!marker || declarations.get(name) !== 1 || exported.has(name)
        || writes.get(name)?.length !== 1 || writes.get(name)?.[0] !== assignment) continue
      const value = sizeValue(assignment.right, new Map([['pixelCount', pixelCount]]))
      if (value === null || !disablesTest(branch.test, name, value)) continue
      if (!steps.slice(0, index).every(prior => staysInInitializer(prior, active))) return unbounded
      // If called earlier at load, the marker's top-level initializer can reset
      // it once. Charge both possible executions in that case.
      return marker.init && loadPosition(branch) < marker.end ? 2 : 1
    }
    return unbounded
  }

  function loopBound(loop: ForStatement): number {
    const { init, test, update } = loop
    if (!owners.has(loop) || update?.type !== 'UpdateExpression' || update.operator !== '++'
      || update.argument.type !== 'Identifier' || test?.type !== 'BinaryExpression'
      || (test.operator !== '<' && test.operator !== '<=')
      || test.left.type !== 'Identifier' || test.left.name !== update.argument.name) return unbounded
    const counter = update.argument.name
    const initial = init?.type === 'VariableDeclaration' && init.declarations.length === 1
      ? init.declarations[0] : init?.type === 'AssignmentExpression' && init.operator === '=' ? init : null
    const target = initial?.type === 'VariableDeclarator' ? initial.id : initial?.left
    const first = initial?.type === 'VariableDeclarator' ? initial.init : initial?.right
    if (target?.type !== 'Identifier' || target.name !== counter || !first) return unbounded
    const scalars = scalarsAtUse(loop)
    const low = sizeValue(first, scalars)
    const high = sizeValue(test.right, scalars)
    if (low === null || high === null || (high === 32767 && test.operator === '<=')) return unbounded
    // The body cannot modify the counter, including through a call. Descend
    // through scalar and native leaf calls only, and handle nested loops below.
    let stableCounter = true
    function inspectBody(node: AnyNode) {
      if (writes.get(counter)?.includes(node) || (node.type === 'VariableDeclarator' && declarations.get(counter) !== 1
        && node.id.type === 'Identifier' && node.id.name === counter)) stableCounter = false
      if (node.type === 'CallExpression' && (node.callee.type !== 'Identifier'
        || !nativeLeafCalls.has(node.callee.name) || declarations.has(node.callee.name)
        || writes.has(node.callee.name))) stableCounter = false
      visitChildren(node, inspectBody)
    }
    inspectBody(loop.body)
    return stableCounter ? Math.max(0, high - low + Number(test.operator === '<=')) : unbounded
  }

  const multiplicity = new Map<AnyNode, number>()
  const visiting = new Set<AnyNode>()
  function countRuns(node: AnyNode): number {
    const known = multiplicity.get(node)
    if (known !== undefined) return known
    if (visiting.has(node)) return unbounded
    visiting.add(node)
    const parent = parents.get(node)
    let count = unbounded
    if (!parent) count = 1
    else if (isFunction(parent)) {
      if (parent.type === 'FunctionDeclaration' && parent.id && directFunction(parent.id.name) === parent
        && !exported.has(parent.id.name) && !escapes.has(parent) && calls.has(parent)) {
        count = calls.get(parent)!.reduce((sum, site) => sum + countRuns(site), 0)
      }
    } else if (parent.type === 'IfStatement' && parent.consequent === node) {
      count = Math.min(countRuns(parent), guardBound(parent))
    } else if (parent.type === 'ForStatement') {
      const iterations = parent.body === node ? loopBound(parent) : unbounded
      if (Number.isFinite(iterations)) {
        const runs = countRuns(parent)
        if (Number.isFinite(runs)) count = runs * iterations
      }
    } else if (parent.type !== 'WhileStatement' && parent.type !== 'DoWhileStatement'
      && parent.type !== 'ForInStatement' && parent.type !== 'ForOfStatement'
      && parent.type !== 'ClassDeclaration' && parent.type !== 'ClassExpression'
      && parent.type !== 'CatchClause' && parent.type !== 'TryStatement') {
      count = countRuns(parent)
    }
    visiting.delete(node)
    multiplicity.set(node, count)
    return count
  }

  let words = 0
  for (const node of allocations) {
    const runs = countRuns(node)
    if (!Number.isFinite(runs)) return null
    let length: number | null = null
    if (node.type === 'ArrayExpression') {
      if (!node.elements.some(element => element?.type === 'SpreadElement')) length = node.elements.length
    } else {
      if (node.arguments.length === 1) length = sizeValue(node.arguments[0], scalarsAtUse(node))
    }
    if (length === null || length < 0) return null
    words += runs * (length + PIXELBLAZE_ARRAY_HEADER_WORDS)
  }
  return words
}
