export type ShowPatternOutputRenderFunction = 'render' | 'render2D' | 'render3D'
export type ShowPatternOutputRenderState = 'pure' | 'render-mutating' | 'unknown'

export interface ShowPatternOutputConsumer {
  consumerId: string
  patternIdentity: string
  patternInstanceId: string
  clockDomainKey: string
  inputValuesKey: string
  propertyValuesKey: string
  coordinateSpaceKey: string
  sampleDomainKey: string
  renderFunction: ShowPatternOutputRenderFunction
  preCacheEffectsKey: string
  renderState: ShowPatternOutputRenderState
  /** Consumer-only work applied after the shared RGB boundary. */
  postCacheConsumerKey: string
}

export type ShowPatternOutputCompatibilityReason =
  | 'pattern-identity'
  | 'pattern-instance'
  | 'clock-domain'
  | 'input-values'
  | 'property-values'
  | 'coordinate-space'
  | 'sample-domain'
  | 'render-function'
  | 'pre-cache-effects'
  | 'output-alpha'
  | 'render-mutating-state'
  | 'render-state-unknown'
  | 'output-dimension'
  | 'non-cut-transition'
  | 'no-compatible-consumer'

export interface ShowPatternOutputCompatibility {
  compatible: boolean
  reasons: ShowPatternOutputCompatibilityReason[]
  key: string | null
}

export interface ShowPatternRenderStateAnalysis {
  state: ShowPatternOutputRenderState
  mutatedBindings: string[]
  unknownCalls: string[]
}

export interface ShowPatternDeterministicReplayStateAnalysis extends ShowPatternRenderStateAnalysis {
  /** Every non-local binding written by the reachable renderer call graph,
   * including scratch whose reads are dominated by an assignment. */
  writtenBindings: string[]
}

export interface ShowPatternOutputReuseGroup {
  key: string
  producerId: string
  consumerIds: string[]
  evaluationsAvoidedPerPixel: number
}

export interface ShowPatternOutputReuseAnalysis {
  groups: ShowPatternOutputReuseGroup[]
  excluded: Array<{
    consumerId: string
    reasons: ShowPatternOutputCompatibilityReason[]
  }>
}

const COMPATIBILITY_FIELDS = [
  ['patternIdentity', 'pattern-identity'],
  ['patternInstanceId', 'pattern-instance'],
  ['clockDomainKey', 'clock-domain'],
  ['inputValuesKey', 'input-values'],
  ['propertyValuesKey', 'property-values'],
  ['coordinateSpaceKey', 'coordinate-space'],
  ['sampleDomainKey', 'sample-domain'],
  ['renderFunction', 'render-function'],
  ['preCacheEffectsKey', 'pre-cache-effects'],
] as const satisfies ReadonlyArray<readonly [keyof ShowPatternOutputConsumer, ShowPatternOutputCompatibilityReason]>

export function showPatternOutputCompatibilityKey(consumer: ShowPatternOutputConsumer): string | null {
  if (consumer.renderState !== 'pure') return null
  return JSON.stringify(COMPATIBILITY_FIELDS.map(([field]) => consumer[field]))
}

export function compareShowPatternOutputConsumers(
  left: ShowPatternOutputConsumer,
  right: ShowPatternOutputConsumer,
): ShowPatternOutputCompatibility {
  const reasons: ShowPatternOutputCompatibilityReason[] = []
  if (left.renderState === 'render-mutating' || right.renderState === 'render-mutating') {
    reasons.push('render-mutating-state')
  } else if (left.renderState === 'unknown' || right.renderState === 'unknown') {
    reasons.push('render-state-unknown')
  }
  for (const [field, reason] of COMPATIBILITY_FIELDS) {
    if (left[field] !== right[field]) reasons.push(reason)
  }
  const key = reasons.length === 0 ? showPatternOutputCompatibilityKey(left) : null
  return { compatible: key !== null, reasons, key }
}

export function groupCompatibleShowPatternOutputs(
  consumers: ShowPatternOutputConsumer[],
): ShowPatternOutputReuseAnalysis {
  const sorted = [...consumers].sort((left, right) => left.consumerId.localeCompare(right.consumerId))
  const byKey = new Map<string, ShowPatternOutputConsumer[]>()
  for (const consumer of sorted) {
    const key = showPatternOutputCompatibilityKey(consumer)
    if (!key) continue
    const group = byKey.get(key) ?? []
    group.push(consumer)
    byKey.set(key, group)
  }
  const groups = [...byKey.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({
      key,
      producerId: members[0].consumerId,
      consumerIds: members.map((member) => member.consumerId),
      evaluationsAvoidedPerPixel: members.length - 1,
    }))
    .sort((left, right) => left.producerId.localeCompare(right.producerId))
  const groupedIds = new Set(groups.flatMap((group) => group.consumerIds))
  const excluded = sorted.flatMap((consumer) => {
    if (groupedIds.has(consumer.consumerId)) return []
    if (consumer.renderState === 'render-mutating') {
      return [{ consumerId: consumer.consumerId, reasons: ['render-mutating-state'] as ShowPatternOutputCompatibilityReason[] }]
    }
    if (consumer.renderState === 'unknown') {
      return [{ consumerId: consumer.consumerId, reasons: ['render-state-unknown'] as ShowPatternOutputCompatibilityReason[] }]
    }
    const comparisons = sorted
      .filter((other) => other.consumerId !== consumer.consumerId)
      .map((other) => compareShowPatternOutputConsumers(consumer, other).reasons)
      .filter((reasons) => reasons.length > 0)
      .sort((left, right) => left.length - right.length || left.join(',').localeCompare(right.join(',')))
    return [{
      consumerId: consumer.consumerId,
      reasons: comparisons[0] ?? ['no-compatible-consumer'],
    }]
  })
  return { groups, excluded }
}

const RUNTIME_CALL_COST: Record<string, number> = {
  abs: 1,
  acos: 8,
  asin: 8,
  atan: 8,
  atan2: 10,
  ceil: 1,
  clamp: 2,
  cos: 8,
  exp: 8,
  floor: 1,
  frac: 2,
  hsv: 8,
  hypot: 6,
  log: 8,
  max: 1,
  min: 1,
  mod: 2,
  pow: 8,
  rgb: 1,
  round: 1,
  sin: 8,
  sqrt: 6,
  square: 1,
  tan: 8,
  time: 3,
  triangle: 4,
  wave: 6,
}

/** Conservative relative operation score used only to reject caches that cost more than recomputation. */
export function estimateShowPatternRenderOperations(
  source: string,
  renderFunction: ShowPatternOutputRenderFunction,
): number | null {
  let ast: AstNode
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as AstNode
  } catch {
    return null
  }
  const statements = (ast.body as AstNode[]).map((statement) => (
    statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
  )).filter(Boolean)
  const selected = statements.find((statement) => (
    statement.type === 'FunctionDeclaration' && statement.id?.name === renderFunction
  ))
  if (!selected) return null
  let operations = 0
  walkAst(selected.body, (node) => {
    if (['BinaryExpression', 'LogicalExpression', 'UnaryExpression', 'UpdateExpression', 'AssignmentExpression', 'ConditionalExpression'].includes(node.type)) {
      operations += 1
    } else if (node.type === 'CallExpression') {
      operations += node.callee?.type === 'Identifier'
        ? RUNTIME_CALL_COST[node.callee.name] ?? 1
        : 1
    }
  })
  return Math.max(1, operations)
}

// Calls outside this side-effect-free Pixelblaze/math surface remain unknown
// until a later call-graph proof can inspect their implementation and aliases.
const PURE_RUNTIME_CALLS = new Set([
  'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'clamp', 'cos', 'exp', 'floor',
  'frac', 'hsv', 'hypot', 'log', 'max', 'min', 'mod', 'pow', 'rgb', 'round',
  'sin', 'sqrt', 'square', 'tan', 'time', 'triangle', 'wave',
])

const COVERAGE_PURE_RUNTIME_CALLS = new Set([...PURE_RUNTIME_CALLS, 'perlin'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = Record<string, any>

export function analyzeShowPatternRenderState(
  source: string,
  renderFunction: ShowPatternOutputRenderFunction,
): ShowPatternRenderStateAnalysis {
  let ast: AstNode
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as AstNode
  } catch {
    return { state: 'unknown', mutatedBindings: [], unknownCalls: ['<parse>'] }
  }
  const statements = (ast.body as AstNode[]).map((statement) => (
    statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
  )).filter(Boolean)
  const topLevelBindings = new Set<string>()
  const userFunctions = new Map<string, AstNode>()
  for (const statement of statements) {
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations as AstNode[]) {
        for (const name of astBindingNames(declaration.id)) topLevelBindings.add(name)
      }
    } else if (statement.type === 'FunctionDeclaration' && statement.id?.name) {
      userFunctions.set(statement.id.name, statement)
    }
  }
  const selected = userFunctions.get(renderFunction)
  if (!selected) {
    return { state: 'unknown', mutatedBindings: [], unknownCalls: [`<missing:${renderFunction}>`] }
  }
  const localBindings = new Set<string>((selected.params as AstNode[]).flatMap(astBindingNames))
  collectLocalDeclarations(selected.body, localBindings)
  const mutatedBindings = new Set<string>()
  const unknownCalls = new Set<string>()
  walkAst(selected.body, (node) => {
    if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
      const root = assignmentRootName(node.type === 'AssignmentExpression' ? node.left : node.argument)
      if (root && topLevelBindings.has(root) && !localBindings.has(root)) mutatedBindings.add(root)
    }
    if (node.type !== 'CallExpression') return
    const callee = node.callee
    if (callee?.type !== 'Identifier') {
      unknownCalls.add('<dynamic-call>')
      return
    }
    const name = callee.name as string
    if (userFunctions.has(name) || !PURE_RUNTIME_CALLS.has(name)) unknownCalls.add(name)
  })
  const mutated = [...mutatedBindings].sort()
  const unknown = [...unknownCalls].sort()
  return {
    state: mutated.length > 0 ? 'render-mutating' : unknown.length > 0 ? 'unknown' : 'pure',
    mutatedBindings: mutated,
    unknownCalls: unknown,
  }
}

/**
 * Coverage-directed evaluation may skip repeated calls to one renderer, so
 * it needs a narrower proof than output reuse: non-exported scratch globals
 * are admissible only when every read is dominated by a write in the same
 * render invocation. This recognizes Pixelblaze's common out-var helper
 * idiom without treating accumulators or opaque calls as pure (#834).
 */
export function analyzeShowPatternCoverageRenderState(
  source: string,
  renderFunction: ShowPatternOutputRenderFunction,
): ShowPatternRenderStateAnalysis {
  const { writtenBindings: _writtenBindings, ...analysis } = analyzeShowPatternDeterministicReplayState(
    source,
    renderFunction,
  )
  return analysis
}

export function analyzeShowPatternDeterministicReplayState(
  source: string,
  renderFunction: ShowPatternOutputRenderFunction,
): ShowPatternDeterministicReplayStateAnalysis {
  let ast: AstNode
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as AstNode
  } catch {
    return { state: 'unknown', mutatedBindings: [], unknownCalls: ['<parse>'], writtenBindings: [] }
  }
  const statements = (ast.body as AstNode[]).map((statement) => (
    statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
  )).filter(Boolean)
  const userFunctions = new Map<string, AstNode>()
  const topLevelBindings = new Set<string>()
  const exportedBindings = new Set<string>()
  for (const statement of ast.body as AstNode[]) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
      userFunctions.set(declaration.id.name, declaration)
      if (statement.type === 'ExportNamedDeclaration') exportedBindings.add(declaration.id.name)
    } else if (declaration?.type === 'VariableDeclaration' && statement.type === 'ExportNamedDeclaration') {
      for (const variable of declaration.declarations as AstNode[]) {
        for (const name of astBindingNames(variable.id)) exportedBindings.add(name)
      }
    }
    if (declaration?.type === 'VariableDeclaration') {
      for (const variable of declaration.declarations as AstNode[]) {
        for (const name of astBindingNames(variable.id)) topLevelBindings.add(name)
      }
    }
  }
  // Include non-exported function declarations gathered from the normalized
  // statement list as well.
  for (const statement of statements) {
    if (statement.type === 'FunctionDeclaration' && statement.id?.name) {
      userFunctions.set(statement.id.name, statement)
    }
  }
  if (!userFunctions.has(renderFunction)) {
    return { state: 'unknown', mutatedBindings: [], unknownCalls: [`<missing:${renderFunction}>`], writtenBindings: [] }
  }

  const localBindingsByFunction = new Map<string, Set<string>>()
  for (const [name, fn] of userFunctions) {
    const locals = new Set<string>((fn.params as AstNode[]).flatMap(astBindingNames))
    collectLocalDeclarations(fn.body, locals)
    localBindingsByFunction.set(name, locals)
  }

  const reachable = new Set<string>()
  const scratchBindings = new Set<string>()
  const unknownCalls = new Set<string>()
  walkAst(ast, (node) => {
    for (const name of assignedBindingNames(node)) {
      if (userFunctions.has(name)) unknownCalls.add(`<function-rebind:${name}>`)
    }
  })
  const collect = (name: string, stack: Set<string>) => {
    if (reachable.has(name)) return
    if (stack.has(name)) {
      unknownCalls.add(name)
      return
    }
    const fn = userFunctions.get(name)
    if (!fn) return
    reachable.add(name)
    const nextStack = new Set(stack).add(name)
    const locals = localBindingsByFunction.get(name)!
    const parameters = new Set<string>((fn.params as AstNode[]).flatMap(astBindingNames))
    const recordMemberWrites = (target: AstNode | null | undefined) => {
      for (const memberTarget of assignmentMemberWriteTargets(target)) {
        const memberRoot = assignmentRootName(memberTarget)
        if (memberRoot && parameters.has(memberRoot)) {
          unknownCalls.add(`<parameter-member-write:${name}.${memberRoot}>`)
        } else if (memberRoot && locals.has(memberRoot)) {
          unknownCalls.add(`<local-member-write:${name}.${memberRoot}>`)
        } else if (memberRoot) {
          unknownCalls.add(`<persistent-member-write:${name}.${memberRoot}>`)
        } else {
          unknownCalls.add(`<dynamic-member-write:${name}>`)
        }
      }
    }
    walkAst(fn.body, (node) => {
      if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
        const target = node.type === 'AssignmentExpression' ? node.left : node.argument
        if ((target?.type === 'ArrayPattern' || target?.type === 'ObjectPattern')
          && assignmentMemberWriteTargets(target).length === 0) {
          unknownCalls.add(`<destructuring-assignment:${name}>`)
        }
        const root = assignmentRootName(target)
        recordMemberWrites(target)
        if (root && !locals.has(root)) scratchBindings.add(root)
      }
      if (node.type === 'UnaryExpression' && node.operator === 'delete') {
        recordMemberWrites(node.argument)
      }
      if (node.type !== 'CallExpression') return
      if (node.callee?.type !== 'Identifier') {
        unknownCalls.add('<dynamic-call>')
        return
      }
      const callee = node.callee.name as string
      if (userFunctions.has(callee)) collect(callee, nextStack)
      else if (!COVERAGE_PURE_RUNTIME_CALLS.has(callee)) unknownCalls.add(callee)
    })
  }
  collect(renderFunction, new Set())

  const unsafeBindings = new Set<string>(
    [...scratchBindings].filter((name) => exportedBindings.has(name)),
  )
  const externallyReachable = new Set<string>()
  const collectExternal = (name: string) => {
    if (externallyReachable.has(name)) return
    const fn = userFunctions.get(name)
    if (!fn) return
    externallyReachable.add(name)
    const locals = localBindingsByFunction.get(name)!
    walkAst(fn.body, (node) => {
      if (node.type !== 'CallExpression') return
      if (node.callee?.type !== 'Identifier') {
        unknownCalls.add(`<external-dynamic-call:${name}>`)
        return
      }
      const callee = node.callee.name as string
      if (userFunctions.has(callee)) collectExternal(callee)
      else if (topLevelBindings.has(callee) || locals.has(callee)) {
        unknownCalls.add(`<external-call:${callee}>`)
      }
    })
  }
  for (const name of exportedBindings) {
    const alternateRenderer = name === 'render' || name === 'render2D' || name === 'render3D'
    if (!alternateRenderer && userFunctions.has(name)) collectExternal(name)
  }
  if (userFunctions.has('beforeRender')) collectExternal('beforeRender')
  for (const name of externallyReachable) {
    const reads = new Set<string>()
    collectAstReadIdentifiers(userFunctions.get(name)!.body, reads)
    const locals = localBindingsByFunction.get(name)!
    for (const scratch of scratchBindings) {
      if (reads.has(scratch) && !locals.has(scratch)) unsafeBindings.add(scratch)
    }
  }
  interface FlowState { assigned: Set<string>; active: Set<string>; fallsThrough: boolean }
  interface FlowContext { exits: Set<string>[] }
  const flowFunction = (name: string, state: FlowState): FlowState => {
    if (state.active.has(name)) {
      unknownCalls.add(name)
      return state
    }
    const fn = userFunctions.get(name)
    if (!fn) return state
    const context: FlowContext = { exits: [] }
    const completed = flowStatement(fn.body, {
      assigned: new Set(state.assigned),
      active: new Set(state.active).add(name),
      fallsThrough: true,
    }, name, context)
    if (completed.fallsThrough) context.exits.push(completed.assigned)
    const assigned = context.exits.length === 0
      ? new Set(state.assigned)
      : context.exits.reduce(intersectSets)
    return { assigned, active: state.active, fallsThrough: true }
  }
  const readIdentifier = (name: string, state: FlowState) => {
    if (scratchBindings.has(name) && !state.assigned.has(name)) unsafeBindings.add(name)
  }
  const flowExpression = (node: AstNode | null | undefined, state: FlowState, owner: string): FlowState => {
    if (!node) return state
    if (node.type === 'Identifier') {
      readIdentifier(node.name, state)
      return state
    }
    if (node.type === 'AssignmentExpression') {
      const root = assignmentRootName(node.left)
      if (node.operator !== '=') flowExpression(node.left, state, owner)
      else if (node.left?.type === 'MemberExpression') {
        flowExpression(node.left.object, state, owner)
        if (node.left.computed) flowExpression(node.left.property, state, owner)
      }
      flowExpression(node.right, state, owner)
      if (root && scratchBindings.has(root)) state.assigned.add(root)
      return state
    }
    if (node.type === 'UpdateExpression') {
      flowExpression(node.argument, state, owner)
      const root = assignmentRootName(node.argument)
      if (root && scratchBindings.has(root)) state.assigned.add(root)
      return state
    }
    if (node.type === 'CallExpression') {
      if (node.callee?.type !== 'Identifier') flowExpression(node.callee, state, owner)
      for (const argument of node.arguments ?? []) flowExpression(argument, state, owner)
      if (node.callee?.type === 'Identifier' && userFunctions.has(node.callee.name)) {
        const nested = flowFunction(node.callee.name, state)
        state.assigned = nested.assigned
      }
      return state
    }
    if (node.type === 'ConditionalExpression' || node.type === 'LogicalExpression') {
      flowExpression(node.test ?? node.left, state, owner)
      const left = flowExpression(node.consequent ?? node.right, {
        assigned: new Set(state.assigned), active: new Set(state.active), fallsThrough: true,
      }, owner)
      const right = node.alternate
        ? flowExpression(node.alternate, {
            assigned: new Set(state.assigned), active: new Set(state.active), fallsThrough: true,
          }, owner)
        : state
      state.assigned = intersectSets(left.assigned, right.assigned)
      return state
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object') flowExpression(item as AstNode, state, owner)
        }
      } else if (value && typeof value === 'object') {
        flowExpression(value as AstNode, state, owner)
      }
    }
    return state
  }
  const flowStatement = (
    node: AstNode | null | undefined,
    state: FlowState,
    owner: string,
    context: FlowContext,
  ): FlowState => {
    if (!node) return state
    if (node.type === 'BlockStatement') {
      let current = state
      for (const statement of node.body as AstNode[]) {
        if (!current.fallsThrough) break
        current = flowStatement(statement, current, owner, context)
      }
      return current
    }
    if (node.type === 'ExpressionStatement') return flowExpression(node.expression, state, owner)
    if (node.type === 'VariableDeclaration') {
      for (const declaration of node.declarations as AstNode[]) flowExpression(declaration.init, state, owner)
      return state
    }
    if (node.type === 'IfStatement') {
      flowExpression(node.test, state, owner)
      const consequent = flowStatement(node.consequent, {
        assigned: new Set(state.assigned), active: new Set(state.active), fallsThrough: true,
      }, owner, context)
      const alternate = node.alternate
        ? flowStatement(node.alternate, {
            assigned: new Set(state.assigned), active: new Set(state.active), fallsThrough: true,
          }, owner, context)
        : { assigned: new Set(state.assigned), active: new Set(state.active), fallsThrough: true }
      state.fallsThrough = consequent.fallsThrough || alternate.fallsThrough
      if (consequent.fallsThrough && alternate.fallsThrough) {
        state.assigned = intersectSets(consequent.assigned, alternate.assigned)
      } else if (consequent.fallsThrough) {
        state.assigned = consequent.assigned
      } else if (alternate.fallsThrough) {
        state.assigned = alternate.assigned
      }
      return state
    }
    if (node.type === 'ReturnStatement') {
      flowExpression(node.argument, state, owner)
      context.exits.push(new Set(state.assigned))
      state.fallsThrough = false
      return state
    }
    if (node.type === 'ForStatement' || node.type === 'WhileStatement' || node.type === 'DoWhileStatement') {
      flowExpression(node.init, state, owner)
      flowExpression(node.test, state, owner)
      const loop = flowStatement(node.body, {
        assigned: new Set(state.assigned), active: new Set(state.active), fallsThrough: true,
      }, owner, context)
      flowExpression(node.update, loop, owner)
      return state
    }
    if (node.type === 'EmptyStatement') return state
    if (node.type.endsWith('Statement') || node.type.endsWith('Declaration')) {
      unknownCalls.add(`<control-flow:${node.type}>`)
      return state
    }
    return flowExpression(node, state, owner)
  }
  flowFunction(renderFunction, { assigned: new Set(), active: new Set(), fallsThrough: true })
  const mutated = [...unsafeBindings].sort()
  const unknown = [...unknownCalls].sort()
  return {
    state: mutated.length > 0 ? 'render-mutating' : unknown.length > 0 ? 'unknown' : 'pure',
    mutatedBindings: mutated,
    unknownCalls: unknown,
    writtenBindings: [...scratchBindings].sort(),
  }
}

function intersectSets(left: Set<string>, right: Set<string>): Set<string> {
  return new Set([...left].filter((value) => right.has(value)))
}

function collectLocalDeclarations(node: AstNode, locals: Set<string>): void {
  walkAst(node, (candidate) => {
    if (candidate.type !== 'VariableDeclaration') return
    for (const declaration of candidate.declarations as AstNode[]) {
      for (const name of astBindingNames(declaration.id)) locals.add(name)
    }
  })
}

function astBindingNames(node: AstNode | null | undefined): string[] {
  if (!node) return []
  if (node.type === 'Identifier') return [node.name]
  if (node.type === 'RestElement') return astBindingNames(node.argument)
  if (node.type === 'AssignmentPattern') return astBindingNames(node.left)
  if (node.type === 'ArrayPattern') return (node.elements as AstNode[]).flatMap(astBindingNames)
  if (node.type === 'ObjectPattern') return (node.properties as AstNode[]).flatMap((property) => (
    property.type === 'RestElement' ? astBindingNames(property.argument) : astBindingNames(property.value)
  ))
  return []
}

function assignedBindingNames(node: AstNode): string[] {
  if (node.type === 'AssignmentExpression') return astBindingNames(node.left)
  if (node.type === 'UpdateExpression') return astBindingNames(node.argument)
  if (node.type === 'VariableDeclarator' && node.init) return astBindingNames(node.id)
  if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
    if (node.left?.type === 'VariableDeclaration') {
      return (node.left.declarations as AstNode[]).flatMap((declaration) => astBindingNames(declaration.id))
    }
    return astBindingNames(node.left)
  }
  return []
}

function assignmentRootName(node: AstNode | null | undefined): string | null {
  if (!node) return null
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') return assignmentRootName(node.object)
  return null
}

function assignmentMemberWriteTargets(node: AstNode | null | undefined): AstNode[] {
  if (!node) return []
  if (node.type === 'ChainExpression') return assignmentMemberWriteTargets(node.expression)
  if (node.type === 'MemberExpression') return [node]
  if (node.type === 'RestElement') return assignmentMemberWriteTargets(node.argument)
  if (node.type === 'AssignmentPattern') return assignmentMemberWriteTargets(node.left)
  if (node.type === 'ArrayPattern') {
    return (node.elements as AstNode[]).flatMap(assignmentMemberWriteTargets)
  }
  if (node.type === 'ObjectPattern') {
    return (node.properties as AstNode[]).flatMap((property) => (
      property.type === 'RestElement'
        ? assignmentMemberWriteTargets(property.argument)
        : assignmentMemberWriteTargets(property.value)
    ))
  }
  return []
}

function collectAstReadIdentifiers(node: unknown, reads: Set<string>): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectAstReadIdentifiers(item, reads)
    return
  }
  const astNode = node as AstNode
  if (astNode.type === 'Identifier') {
    reads.add(astNode.name)
    return
  }
  if (astNode.type === 'AssignmentExpression') {
    if (astNode.operator !== '=') collectAstReadIdentifiers(astNode.left, reads)
    else if (astNode.left?.type === 'MemberExpression') {
      collectAstReadIdentifiers(astNode.left.object, reads)
      if (astNode.left.computed) collectAstReadIdentifiers(astNode.left.property, reads)
    }
    collectAstReadIdentifiers(astNode.right, reads)
    return
  }
  if (astNode.type === 'UpdateExpression') {
    collectAstReadIdentifiers(astNode.argument, reads)
    return
  }
  if (astNode.type === 'VariableDeclarator') {
    collectAstReadIdentifiers(astNode.init, reads)
    return
  }
  if (astNode.type === 'MemberExpression') {
    collectAstReadIdentifiers(astNode.object, reads)
    if (astNode.computed) collectAstReadIdentifiers(astNode.property, reads)
    return
  }
  if (astNode.type === 'Property') {
    if (astNode.computed) collectAstReadIdentifiers(astNode.key, reads)
    collectAstReadIdentifiers(astNode.value, reads)
    return
  }
  for (const [key, value] of Object.entries(astNode)) {
    if (key === 'type' || key === 'id' || key === 'params'
      || key === 'label' || key === 'start' || key === 'end' || key === 'loc') continue
    collectAstReadIdentifiers(value, reads)
  }
}

function walkAst(node: unknown, visit: (node: AstNode) => void): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walkAst(item, visit)
    return
  }
  const astNode = node as AstNode
  if (typeof astNode.type === 'string') visit(astNode)
  for (const [key, value] of Object.entries(astNode)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    walkAst(value, visit)
  }
}
import * as acorn from 'acorn'
