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
  | 'render-mutating-state'
  | 'render-state-unknown'
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
  const groupedConsumers = sorted.filter((consumer) => groupedIds.has(consumer.consumerId))
  const excluded = sorted.flatMap((consumer) => {
    if (groupedIds.has(consumer.consumerId)) return []
    if (consumer.renderState === 'render-mutating') {
      return [{ consumerId: consumer.consumerId, reasons: ['render-mutating-state'] as ShowPatternOutputCompatibilityReason[] }]
    }
    if (consumer.renderState === 'unknown') {
      return [{ consumerId: consumer.consumerId, reasons: ['render-state-unknown'] as ShowPatternOutputCompatibilityReason[] }]
    }
    const comparisons = groupedConsumers
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

// Calls outside this side-effect-free Pixelblaze/math surface remain unknown
// until a later call-graph proof can inspect their implementation and aliases.
const PURE_RUNTIME_CALLS = new Set([
  'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'clamp', 'cos', 'exp', 'floor',
  'frac', 'hsv', 'hypot', 'log', 'max', 'min', 'mod', 'pow', 'rgb', 'round',
  'sin', 'sqrt', 'square', 'tan', 'time', 'triangle', 'wave',
])

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

function assignmentRootName(node: AstNode | null | undefined): string | null {
  if (!node) return null
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') return assignmentRootName(node.object)
  return null
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
