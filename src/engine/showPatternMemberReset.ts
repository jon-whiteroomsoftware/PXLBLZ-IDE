import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export type ShowPatternMemberResetReason =
  | 'unsupported-top-level-statement'
  | 'unsupported-binding'
  | 'non-deterministic-initializer'
  | 'reassigned-function-binding'

export interface ShowPatternMemberResetAnalysis {
  resettable: boolean
  assignments: string[]
  reason: ShowPatternMemberResetReason | null
}

export function analyzeShowPatternMemberReset(source: string): ShowPatternMemberResetAnalysis {
  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  const assignments: string[] = []

  if (hasReassignedTopLevelFunctionBinding(ast)) {
    return rejected('reassigned-function-binding')
  }

  for (const statement of ast.body as Node[]) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type === 'FunctionDeclaration') continue
    if (declaration?.type !== 'VariableDeclaration') {
      return rejected('unsupported-top-level-statement')
    }
    for (const item of declaration.declarations as Node[]) {
      if (item.id?.type !== 'Identifier') return rejected('unsupported-binding')
      if (!isDeterministicScalarInitializer(item.init ?? null)) {
        return rejected('non-deterministic-initializer')
      }
      const initializer = item.init ? source.slice(item.init.start, item.init.end) : '0'
      assignments.push(`${item.id.name} = ${initializer}`)
    }
  }

  return { resettable: true, assignments, reason: null }
}

interface BindingScope {
  parent: BindingScope | null
  bindings: Set<string>
  functionBoundary: boolean
}

/** Function declarations are resettable only while their bindings remain the
 * original declarations. Resolve writes through lexical scopes so a local or
 * parameter with the same spelling does not falsely disqualify the Pattern. */
function hasReassignedTopLevelFunctionBinding(ast: Node): boolean {
  const topLevelFunctions = new Set<string>()
  for (const statement of ast.body as Node[]) {
    const declaration = unwrapDeclaration(statement)
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.type === 'Identifier') {
      topLevelFunctions.add(declaration.id.name)
    }
  }
  if (topLevelFunctions.size === 0) return false

  const programScope: BindingScope = { parent: null, bindings: new Set(), functionBoundary: true }
  predeclareBlockBindings(ast.body as Node[], programScope)
  collectFunctionVarBindings(ast, programScope)
  let reassigned = false

  const bindingOwner = (name: string, scope: BindingScope): BindingScope | null => {
    for (let current: BindingScope | null = scope; current; current = current.parent) {
      if (current.bindings.has(name)) return current
    }
    return null
  }
  const inspectWriteTarget = (target: Node | null | undefined, scope: BindingScope) => {
    if (!target || reassigned) return
    if (target.type === 'Identifier') {
      if (topLevelFunctions.has(target.name) && bindingOwner(target.name, scope) === programScope) reassigned = true
      return
    }
    if (target.type === 'RestElement') return inspectWriteTarget(target.argument, scope)
    if (target.type === 'AssignmentPattern') return inspectWriteTarget(target.left, scope)
    if (target.type === 'ArrayPattern') {
      for (const element of target.elements as Array<Node | null>) inspectWriteTarget(element, scope)
      return
    }
    if (target.type === 'ObjectPattern') {
      for (const property of target.properties as Node[]) {
        inspectWriteTarget(property.type === 'RestElement' ? property.argument : property.value, scope)
      }
    }
  }
  const walkChildren = (node: Node, scope: BindingScope) => {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) walk(child, scope)
      } else if (isNode(value)) walk(value, scope)
    }
  }
  const walkFunction = (node: Node, parent: BindingScope, namedExpression = false) => {
    const scope: BindingScope = { parent, bindings: new Set(), functionBoundary: true }
    if (namedExpression && node.id?.type === 'Identifier') scope.bindings.add(node.id.name)
    for (const parameter of node.params as Node[]) declarePatternBindings(parameter, scope)
    for (const parameter of node.params as Node[]) walk(parameter, scope)
    collectFunctionVarBindings(node.body, scope)
    walk(node.body, scope)
  }
  const walk = (node: Node, scope: BindingScope): void => {
    if (reassigned) return
    if (node.type === 'Program') {
      for (const statement of node.body as Node[]) walk(statement, scope)
      return
    }
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) walk(node.declaration, scope)
      return
    }
    if (node.type === 'FunctionDeclaration') return walkFunction(node, scope)
    if (node.type === 'FunctionExpression') return walkFunction(node, scope, true)
    if (node.type === 'ArrowFunctionExpression') return walkFunction(node, scope)
    if (node.type === 'BlockStatement') {
      const blockScope: BindingScope = { parent: scope, bindings: new Set(), functionBoundary: false }
      predeclareBlockBindings(node.body as Node[], blockScope)
      for (const statement of node.body as Node[]) walk(statement, blockScope)
      return
    }
    if (node.type === 'CatchClause') {
      const catchScope: BindingScope = { parent: scope, bindings: new Set(), functionBoundary: false }
      declarePatternBindings(node.param, catchScope)
      walk(node.body, catchScope)
      return
    }
    if (node.type === 'SwitchStatement') {
      const switchScope: BindingScope = { parent: scope, bindings: new Set(), functionBoundary: false }
      predeclareBlockBindings(
        (node.cases as Node[]).flatMap(entry => entry.consequent as Node[]),
        switchScope,
      )
      walk(node.discriminant, scope)
      for (const entry of node.cases as Node[]) {
        if (entry.test) walk(entry.test, switchScope)
        for (const statement of entry.consequent as Node[]) walk(statement, switchScope)
      }
      return
    }
    if (node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
      const loopScope: BindingScope = { parent: scope, bindings: new Set(), functionBoundary: false }
      if (node.init?.type === 'VariableDeclaration' && node.init.kind !== 'var') {
        for (const declaration of node.init.declarations as Node[]) declarePatternBindings(declaration.id, loopScope)
      }
      if (node.left?.type === 'VariableDeclaration' && node.left.kind !== 'var') {
        for (const declaration of node.left.declarations as Node[]) declarePatternBindings(declaration.id, loopScope)
      }
      if ((node.type === 'ForInStatement' || node.type === 'ForOfStatement') && node.left?.type !== 'VariableDeclaration') {
        inspectWriteTarget(node.left, loopScope)
      }
      walkChildren(node, loopScope)
      return
    }
    if (node.type === 'AssignmentExpression') {
      inspectWriteTarget(node.left, scope)
      walk(node.right, scope)
      return
    }
    if (node.type === 'UpdateExpression') {
      inspectWriteTarget(node.argument, scope)
      return
    }
    if (node.type === 'VariableDeclaration') {
      const owner = node.kind === 'var' ? nearestFunctionScope(scope) : scope
      for (const declaration of node.declarations as Node[]) {
        declarePatternBindings(declaration.id, owner)
        if (declaration.init) walk(declaration.init, scope)
      }
      return
    }
    walkChildren(node, scope)
  }

  walk(ast, programScope)
  return reassigned
}

function nearestFunctionScope(scope: BindingScope): BindingScope {
  let current = scope
  while (!current.functionBoundary && current.parent) current = current.parent
  return current
}

function unwrapDeclaration(statement: Node): Node | null {
  return statement.type === 'ExportNamedDeclaration' ? statement.declaration ?? null : statement
}

function predeclareBlockBindings(statements: Node[], scope: BindingScope): void {
  for (const statement of statements) {
    const declaration = unwrapDeclaration(statement)
    if (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') {
      if (declaration.id?.type === 'Identifier') scope.bindings.add(declaration.id.name)
    } else if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var') {
      for (const item of declaration.declarations as Node[]) declarePatternBindings(item.id, scope)
    }
  }
}

function collectFunctionVarBindings(node: Node, functionScope: BindingScope): void {
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    for (const declaration of node.declarations as Node[]) declarePatternBindings(declaration.id, functionScope)
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) collectFunctionVarBindings(child, functionScope)
    } else if (isNode(value)) collectFunctionVarBindings(value, functionScope)
  }
}

function declarePatternBindings(pattern: Node | null | undefined, scope: BindingScope): void {
  if (!pattern) return
  if (pattern.type === 'Identifier') {
    scope.bindings.add(pattern.name)
    return
  }
  if (pattern.type === 'RestElement') return declarePatternBindings(pattern.argument, scope)
  if (pattern.type === 'AssignmentPattern') return declarePatternBindings(pattern.left, scope)
  if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements as Array<Node | null>) declarePatternBindings(element, scope)
    return
  }
  if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties as Node[]) {
      declarePatternBindings(property.type === 'RestElement' ? property.argument : property.value, scope)
    }
  }
}

function isNode(value: unknown): value is Node {
  return Boolean(value) && typeof value === 'object' && typeof (value as Node).type === 'string'
}

function rejected(reason: ShowPatternMemberResetReason): ShowPatternMemberResetAnalysis {
  return { resettable: false, assignments: [], reason }
}

function isDeterministicScalarInitializer(node: Node | null): boolean {
  if (!node) return true
  if (node.type === 'Literal' || node.type === 'Identifier') return true
  if (node.type === 'UnaryExpression') return isDeterministicScalarInitializer(node.argument)
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    return isDeterministicScalarInitializer(node.left) && isDeterministicScalarInitializer(node.right)
  }
  if (node.type === 'ConditionalExpression') {
    return isDeterministicScalarInitializer(node.test)
      && isDeterministicScalarInitializer(node.consequent)
      && isDeterministicScalarInitializer(node.alternate)
  }
  if (node.type === 'SequenceExpression') {
    return node.expressions.every((entry: Node) => isDeterministicScalarInitializer(entry))
  }
  return false
}
