import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export type ShowPatternRestartRuntimeFacility =
  | 'elapsed-clock'
  | 'stepped-clock'
  | 'coordinate-transform'
  | 'map-pixels'
  | 'palette'
  | 'private-prng'
  | 'perlin-wrap'
  | 'freeze-capture'
  | 'refresh-capture'
  | 'rolling-refresh-capture'

export type ShowPatternRestartRefusalReason =
  | 'parse-error'
  | 'unsupported-top-level-statement'
  | 'unsupported-binding'
  | 'unsupported-initializer'
  | 'implicit-persistent-binding'
  | 'function-binding-write'
  | 'first-class-function'
  | 'array-or-object-state'
  | 'dynamic-call'
  | 'unclassified-builtin'
  | 'unsupported-syntax'
  | 'unsupported-runtime-facility'

export type ShowPatternRestartPlan =
  | {
      status: 'ready'
      bindings: string[]
      captureDeclarations: string[]
      restoreAssignments: string[]
    }
  | {
      status: 'refused'
      reason: ShowPatternRestartRefusalReason
      message: string
      location?: { line: number; column: number }
    }

export interface ShowPatternRestartPlanOptions {
  baselinePrefix?: string
  implicitBindings?: Iterable<string>
  generatedCalls?: Iterable<string>
  scalarInputs?: Iterable<string>
  runtimeFacilities?: ShowPatternRestartRuntimeFacility[]
}

const PURE_BUILTINS = new Set([
  'abs', 'acos', 'asin', 'atan', 'atan2', 'bezierCubic', 'bezierQuadratic',
  'ceil', 'clamp', 'cos', 'exp', 'floor', 'frac', 'hypot', 'hypot3', 'log',
  'log2', 'map', 'max', 'min', 'mix', 'mod', 'pow', 'round', 'sin',
  'smoothstep', 'sqrt', 'square', 'tan', 'triangle', 'trunc', 'wave',
  'perlin', 'perlinFbm', 'perlinRidge', 'perlinTurbulence',
])
const OUTPUT_BUILTINS = new Set(['hsv', 'hsv24', 'rgb'])
const EXTERNAL_INPUT_BUILTINS = new Set([
  'analogRead', 'clockDay', 'clockHour', 'clockMinute', 'clockMonth',
  'clockSecond', 'clockWeekday', 'clockYear', 'digitalRead', 'has2DMap',
  'has3DMap', 'nodeId', 'pixelMapDimensions', 'random', 'readAdc', 'time',
  'touchRead',
])
const EXTERNAL_OUTPUT_BUILTINS = new Set(['digitalWrite', 'move', 'pinMode'])
const COORDINATE_BUILTINS = new Set([
  'resetTransform', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'scale',
  'scale3D', 'transform', 'translate', 'translate3D',
])
const SCALAR_EXTERNAL_BINDINGS = new Set([
  'E', 'LN10', 'LN2', 'LOG10E', 'LOG2E', 'PI', 'PI2', 'PI3_4', 'PISQ',
  'SQRT1_2', 'SQRT2', 'energyAverage', 'light', 'maxFrequency',
  'maxFrequencyMagnitude', 'pixelCount',
  'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'HIGH', 'LOW',
])
const UNSUPPORTED_FACILITIES = new Set<ShowPatternRestartRuntimeFacility>([
  'palette', 'private-prng', 'perlin-wrap', 'freeze-capture',
  'refresh-capture', 'rolling-refresh-capture', 'map-pixels',
])

interface Scope {
  parent: Scope | null
  bindings: Map<string, 'variable' | 'function'>
}

interface CheckContext {
  program: Scope
  generatedCalls: Set<string>
  scalarInputs: Set<string>
  refusal: Extract<ShowPatternRestartPlan, { status: 'refused' }> | null
}

/**
 * Build the complete Restart plan for one fully transformed Pattern member.
 * The visitor is deliberately fail closed: every admitted syntax node names
 * each executable child and binding role instead of relying on a generic AST
 * walk that can skip computed targets or default expressions.
 */
export function planShowPatternRestart(
  source: string,
  options: ShowPatternRestartPlanOptions = {},
): ShowPatternRestartPlan {
  const unsupportedFacility = (options.runtimeFacilities ?? []).find(facility => UNSUPPORTED_FACILITIES.has(facility))
  if (unsupportedFacility) {
    return refuse('unsupported-runtime-facility', `Restart does not restore compiler runtime facility "${unsupportedFacility}".`)
  }
  const implicit = [...(options.implicitBindings ?? [])]
  if (implicit.length > 0) {
    return refuse('implicit-persistent-binding', `Restart requires declared scalar state; implicit persistent binding${implicit.length === 1 ? '' : 's'} ${implicit.sort().join(', ')} cannot be restored.`)
  }

  let ast: Node
  try {
    ast = acorn.parse(source, {
      ecmaVersion: 2020,
      sourceType: 'module',
      locations: true,
    }) as unknown as Node
  } catch (error) {
    return refuse('parse-error', error instanceof Error ? error.message : String(error))
  }

  const program: Scope = { parent: null, bindings: new Map() }
  const topLevelVariables: string[] = []
  for (const statement of ast.body as Node[]) {
    const declaration = unwrapExport(statement)
    if (declaration?.type === 'VariableDeclaration') {
      if (declaration.kind !== 'var') return refusalAt('unsupported-binding', 'Restart requires mutable top-level var declarations.', declaration)
      for (const item of declaration.declarations as Node[]) {
        if (item.id?.type !== 'Identifier') return refusalAt('unsupported-binding', 'Restart supports identifier variable declarations only.', item.id ?? item)
        const existing = program.bindings.get(item.id.name)
        if (existing === 'function') return refusalAt('unsupported-binding', `Restart refuses top-level function/variable collision "${item.id.name}".`, item.id)
        program.bindings.set(item.id.name, 'variable')
        if (!topLevelVariables.includes(item.id.name)) topLevelVariables.push(item.id.name)
      }
    } else if (declaration?.type === 'FunctionDeclaration' && declaration.id?.type === 'Identifier') {
      const existing = program.bindings.get(declaration.id.name)
      if (existing) return refusalAt('unsupported-binding', `Restart refuses duplicate top-level binding "${declaration.id.name}".`, declaration.id)
      program.bindings.set(declaration.id.name, 'function')
    }
  }

  for (const statement of ast.body as Node[]) {
    const declaration = unwrapExport(statement)
    if (declaration?.type === 'FunctionDeclaration') continue
    if (declaration?.type !== 'VariableDeclaration') {
      return refusalAt('unsupported-top-level-statement', 'Restart supports only top-level scalar variables and declared functions.', declaration ?? statement)
    }
    for (const item of declaration.declarations as Node[]) {
      const initializerRefusal = checkScalarInitializer(item.init ?? null, program)
      if (initializerRefusal) return initializerRefusal
    }
  }

  const context: CheckContext = {
    program,
    generatedCalls: new Set(options.generatedCalls ?? []),
    scalarInputs: new Set(options.scalarInputs ?? []),
    refusal: null,
  }
  for (const statement of ast.body as Node[]) {
    visitTopLevel(statement, program, context)
    if (context.refusal) return context.refusal
  }

  const prefix = options.baselinePrefix ?? '__pxlblz_show_restart_initial'
  return {
    status: 'ready',
    bindings: topLevelVariables,
    captureDeclarations: topLevelVariables.map((binding, index) => `var ${prefix}_${index} = ${binding}`),
    restoreAssignments: topLevelVariables.map((binding, index) => `${binding} = ${prefix}_${index}`),
  }
}

function checkScalarInitializer(
  node: Node | null,
  program: Scope,
): Extract<ShowPatternRestartPlan, { status: 'refused' }> | null {
  if (!node) return null
  if (node.type === 'Literal') return scalarLiteral(node)
    ? null
    : refusalAt('unsupported-initializer', 'Restart scalar initializers must be numeric or boolean.', node)
  if (node.type === 'Identifier') {
    if (program.bindings.get(node.name) === 'function') {
      return refusalAt('first-class-function', `Restart cannot capture function value "${node.name}".`, node)
    }
    return program.bindings.has(node.name) || SCALAR_EXTERNAL_BINDINGS.has(node.name)
      ? null
      : refusalAt('unsupported-initializer', `Restart cannot prove initializer identifier "${node.name}" is scalar.`, node)
  }
  if (node.type === 'UnaryExpression' && ['!', '+', '-', '~'].includes(node.operator)) {
    return checkScalarInitializer(node.argument, program)
  }
  if ((node.type === 'BinaryExpression' && BINARY_OPERATORS.has(node.operator))
    || (node.type === 'LogicalExpression' && LOGICAL_OPERATORS.has(node.operator))) {
    return checkScalarInitializer(node.left, program) ?? checkScalarInitializer(node.right, program)
  }
  if (node.type === 'ConditionalExpression') {
    return checkScalarInitializer(node.test, program)
      ?? checkScalarInitializer(node.consequent, program)
      ?? checkScalarInitializer(node.alternate, program)
  }
  if (node.type === 'SequenceExpression') {
    for (const expression of node.expressions as Node[]) {
      const refusal = checkScalarInitializer(expression, program)
      if (refusal) return refusal
    }
    return null
  }
  return refusalAt(
    node.type === 'ArrayExpression' || node.type === 'ObjectExpression' ? 'array-or-object-state' : 'unsupported-initializer',
    'Restart initializers must be side-effect-free scalar expressions; startup calls and aggregate values are unsupported.',
    node,
  )
}

const BINARY_OPERATORS = new Set([
  '==', '!=', '===', '!==', '<', '<=', '>', '>=', '<<', '>>', '>>>', '+', '-',
  '*', '/', '%', '**', '|', '^', '&', 'in',
])
const LOGICAL_OPERATORS = new Set(['&&', '||', '??'])
const ASSIGNMENT_OPERATORS = new Set([
  '=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '|=', '^=', '&=',
])

function visitTopLevel(node: Node, scope: Scope, context: CheckContext): void {
  if (context.refusal) return
  if (node.type === 'ExportNamedDeclaration') {
    if (node.declaration) visitTopLevel(node.declaration, scope, context)
    return
  }
  if (node.type === 'VariableDeclaration') {
    for (const item of node.declarations as Node[]) if (item.init) visitExpression(item.init, scope, context, 'value')
    return
  }
  if (node.type === 'FunctionDeclaration') {
    if (node.async || node.generator || !node.id || node.id.type !== 'Identifier' || (node.params as Node[]).some(parameter => parameter.type !== 'Identifier')) {
      reject(context, 'unsupported-binding', 'Restart supports ordinary synchronous declared functions with identifier parameters only.', node)
      return
    }
    const functionScope: Scope = { parent: scope, bindings: new Map() }
    for (const parameter of node.params as Node[]) functionScope.bindings.set(parameter.name, 'variable')
    collectFunctionVariables(node.body, functionScope, context)
    if (!context.refusal) visitStatement(node.body, functionScope, context)
    return
  }
  reject(context, 'unsupported-top-level-statement', 'Restart supports only top-level scalar variables and declared functions.', node)
}

function collectFunctionVariables(node: Node, functionScope: Scope, context: CheckContext): void {
  if (context.refusal) return
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    reject(context, 'first-class-function', 'Restart does not support nested functions or closures.', node)
    return
  }
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    for (const item of node.declarations as Node[]) {
      if (item.id?.type !== 'Identifier') {
        reject(context, 'unsupported-binding', 'Restart supports identifier local declarations only.', item.id ?? item)
        return
      }
      functionScope.bindings.set(item.id.name, 'variable')
    }
  }
  forEachChild(node, child => collectFunctionVariables(child, functionScope, context))
}

function visitStatement(node: Node, scope: Scope, context: CheckContext): void {
  if (context.refusal) return
  switch (node.type) {
    case 'BlockStatement':
      {
        const blockScope: Scope = { parent: scope, bindings: new Map() }
        predeclareLexicalBindings(node.body as Node[], blockScope, context)
        for (const statement of node.body as Node[]) visitStatement(statement, blockScope, context)
      }
      return
    case 'VariableDeclaration':
      for (const item of node.declarations as Node[]) if (item.init) visitExpression(item.init, scope, context, 'value')
      return
    case 'ExpressionStatement':
      visitExpression(node.expression, scope, context, 'value')
      return
    case 'ReturnStatement':
      if (node.argument) visitExpression(node.argument, scope, context, 'value')
      return
    case 'IfStatement':
      visitExpression(node.test, scope, context, 'value')
      visitStatement(node.consequent, scope, context)
      if (node.alternate) visitStatement(node.alternate, scope, context)
      return
    case 'ForStatement':
      {
        const loopScope: Scope = { parent: scope, bindings: new Map() }
        if (node.init?.type === 'VariableDeclaration' && node.init.kind !== 'var') {
          predeclareVariableBindings(node.init, loopScope, context)
        }
        if (node.init?.type === 'VariableDeclaration') visitStatement(node.init, loopScope, context)
        else if (node.init) visitExpression(node.init, loopScope, context, 'value')
        if (node.test) visitExpression(node.test, loopScope, context, 'value')
        if (node.update) visitExpression(node.update, loopScope, context, 'value')
        visitStatement(node.body, loopScope, context)
      }
      return
    case 'WhileStatement':
    case 'DoWhileStatement':
      visitExpression(node.test, scope, context, 'value')
      visitStatement(node.body, scope, context)
      return
    case 'SwitchStatement':
      {
        const switchScope: Scope = { parent: scope, bindings: new Map() }
        predeclareLexicalBindings((node.cases as Node[]).flatMap(entry => entry.consequent as Node[]), switchScope, context)
        visitExpression(node.discriminant, scope, context, 'value')
        for (const entry of node.cases as Node[]) {
          if (entry.test) visitExpression(entry.test, switchScope, context, 'value')
          for (const statement of entry.consequent as Node[]) visitStatement(statement, switchScope, context)
        }
      }
      return
    case 'BreakStatement':
    case 'ContinueStatement':
    case 'EmptyStatement':
      return
    case 'FunctionDeclaration':
      reject(context, 'first-class-function', 'Restart does not support nested functions or closures.', node)
      return
    default:
      reject(context, 'unsupported-syntax', `Restart does not support statement syntax "${node.type}".`, node)
  }
}

function predeclareLexicalBindings(statements: Node[], scope: Scope, context: CheckContext): void {
  for (const statement of statements) {
    if (statement.type === 'VariableDeclaration' && statement.kind !== 'var') {
      predeclareVariableBindings(statement, scope, context)
    }
  }
}

function predeclareVariableBindings(declaration: Node, scope: Scope, context: CheckContext): void {
  for (const item of declaration.declarations as Node[]) {
    if (item.id?.type !== 'Identifier') {
      reject(context, 'unsupported-binding', 'Restart supports identifier local declarations only.', item.id ?? item)
      return
    }
    if (scope.bindings.has(item.id.name)) {
      reject(context, 'unsupported-binding', `Restart refuses duplicate lexical binding "${item.id.name}".`, item.id)
      return
    }
    scope.bindings.set(item.id.name, 'variable')
  }
}

function visitExpression(
  node: Node,
  scope: Scope,
  context: CheckContext,
  role: 'value' | 'callee',
): void {
  if (context.refusal) return
  switch (node.type) {
    case 'Literal':
      if (!scalarLiteral(node)) reject(context, 'array-or-object-state', 'Restart supports scalar literal values only.', node)
      return
    case 'Identifier': {
      const binding = resolveBinding(node.name, scope)
      if (binding?.kind === 'function' && role !== 'callee') {
        reject(context, 'first-class-function', `Restart cannot preserve first-class function value "${node.name}".`, node)
      } else if (!binding && !SCALAR_EXTERNAL_BINDINGS.has(node.name) && !context.scalarInputs.has(node.name)) {
        reject(context, 'unclassified-builtin', `Restart has no classification for external binding "${node.name}".`, node)
      }
      return
    }
    case 'UnaryExpression':
      if (!['!', '+', '-', '~'].includes(node.operator)) return reject(context, 'unsupported-syntax', `Restart does not support unary operator "${node.operator}".`, node)
      visitExpression(node.argument, scope, context, 'value')
      return
    case 'BinaryExpression':
      if (!BINARY_OPERATORS.has(node.operator)) return reject(context, 'unsupported-syntax', `Restart does not support binary operator "${node.operator}".`, node)
      visitExpression(node.left, scope, context, 'value')
      visitExpression(node.right, scope, context, 'value')
      return
    case 'LogicalExpression':
      if (!LOGICAL_OPERATORS.has(node.operator)) return reject(context, 'unsupported-syntax', `Restart does not support logical operator "${node.operator}".`, node)
      visitExpression(node.left, scope, context, 'value')
      visitExpression(node.right, scope, context, 'value')
      return
    case 'ConditionalExpression':
      visitExpression(node.test, scope, context, 'value')
      visitExpression(node.consequent, scope, context, 'value')
      visitExpression(node.alternate, scope, context, 'value')
      return
    case 'SequenceExpression':
      for (const expression of node.expressions as Node[]) visitExpression(expression, scope, context, 'value')
      return
    case 'AssignmentExpression':
      if (!ASSIGNMENT_OPERATORS.has(node.operator)) return reject(context, 'unsupported-syntax', `Restart does not support assignment operator "${node.operator}".`, node)
      visitWriteTarget(node.left, scope, context)
      visitExpression(node.right, scope, context, 'value')
      return
    case 'UpdateExpression':
      visitWriteTarget(node.argument, scope, context)
      return
    case 'CallExpression': {
      if (node.callee.type !== 'Identifier') {
        visitExpression(node.callee, scope, context, 'value')
        if (!context.refusal) reject(context, 'dynamic-call', 'Restart supports direct calls only.', node.callee)
        return
      }
      const name = node.callee.name as string
      if (name === 'array' || name.startsWith('array')) {
        reject(context, 'array-or-object-state', 'Restart does not restore array or object state.', node)
        return
      }
      const binding = resolveBinding(name, scope)
      if (binding && binding.kind !== 'function') {
        reject(context, 'dynamic-call', `Restart cannot prove variable call target "${name}" remains a declared function.`, node.callee)
        return
      }
      if (!binding
        && !PURE_BUILTINS.has(name)
        && !OUTPUT_BUILTINS.has(name)
        && !EXTERNAL_INPUT_BUILTINS.has(name)
        && !EXTERNAL_OUTPUT_BUILTINS.has(name)
        && !COORDINATE_BUILTINS.has(name)
        && !context.generatedCalls.has(name)) {
        reject(context, 'unclassified-builtin', `Restart has no builtin classification for call "${name}".`, node.callee)
        return
      }
      for (const argument of node.arguments as Node[]) {
        if (argument.type === 'SpreadElement') {
          reject(context, 'unsupported-binding', 'Restart does not support spread call arguments.', argument)
          return
        }
        visitExpression(argument, scope, context, 'value')
      }
      return
    }
    case 'MemberExpression':
      visitExpression(node.object, scope, context, 'value')
      if (node.computed) visitExpression(node.property, scope, context, 'value')
      if (!context.refusal) reject(context, 'array-or-object-state', 'Restart does not restore array or object state.', node)
      return
    case 'ArrayExpression':
    case 'ObjectExpression':
      reject(context, 'array-or-object-state', 'Restart does not restore array or object state.', node)
      return
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      reject(context, 'first-class-function', 'Restart does not support first-class function values or closures.', node)
      return
    default:
      reject(context, 'unsupported-syntax', `Restart does not support expression syntax "${node.type}".`, node)
  }
}

function visitWriteTarget(node: Node, scope: Scope, context: CheckContext): void {
  if (context.refusal) return
  if (node.type === 'Identifier') {
    const binding = resolveBinding(node.name, scope)
    if (!binding) {
      reject(context, 'implicit-persistent-binding', `Restart requires declared scalar state; implicit persistent binding "${node.name}" cannot be restored.`, node)
    } else if (binding.scope === context.program && binding.kind === 'function') {
      reject(context, 'function-binding-write', `Restart cannot restore reassigned function binding "${node.name}".`, node)
    }
    return
  }
  if (node.type === 'MemberExpression') {
    // Computed targets execute their object/property expressions. Inspect both
    // before refusing aggregate state so a concealed function write is never
    // skipped by an early return.
    visitExpression(node.object, scope, context, 'value')
    if (node.computed) visitExpression(node.property, scope, context, 'value')
    if (!context.refusal) reject(context, 'array-or-object-state', 'Restart does not restore array or object state.', node)
    return
  }
  reject(context, 'unsupported-binding', `Restart does not support assignment target "${node.type}".`, node)
}

function resolveBinding(name: string, scope: Scope): { scope: Scope; kind: 'variable' | 'function' } | null {
  for (let current: Scope | null = scope; current; current = current.parent) {
    const kind = current.bindings.get(name)
    if (kind) return { scope: current, kind }
  }
  return null
}

function forEachChild(node: Node, visit: (child: Node) => void): void {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) visit(child)
    } else if (isNode(value)) visit(value)
  }
}

function unwrapExport(statement: Node): Node | null {
  return statement.type === 'ExportNamedDeclaration' ? statement.declaration ?? null : statement
}

function scalarLiteral(node: Node): boolean {
  return typeof node.value === 'number' || typeof node.value === 'boolean'
}

function isNode(value: unknown): value is Node {
  return Boolean(value) && typeof value === 'object' && typeof (value as Node).type === 'string'
}

function reject(
  context: CheckContext,
  reason: ShowPatternRestartRefusalReason,
  message: string,
  node: Node,
): void {
  if (!context.refusal) context.refusal = refusalAt(reason, message, node)
}

function refusalAt(
  reason: ShowPatternRestartRefusalReason,
  message: string,
  node: Node,
): Extract<ShowPatternRestartPlan, { status: 'refused' }> {
  return {
    status: 'refused',
    reason,
    message,
    ...(node.loc?.start ? { location: { line: node.loc.start.line, column: node.loc.start.column } } : {}),
  }
}

function refuse(
  reason: ShowPatternRestartRefusalReason,
  message: string,
): Extract<ShowPatternRestartPlan, { status: 'refused' }> {
  return { status: 'refused', reason, message }
}
