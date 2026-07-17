import * as acorn from 'acorn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

export type ShowFrameDependency =
  | 'control'
  | 'frame'
  | 'private-state'
  | 'sample'
  | 'index'
  | 'render-mutation'
  | 'unknown'

export interface ShowFrameInvariantCandidate {
  binding: string
  functionName: string
  dependencies: ShowFrameDependency[]
  operations: number
  initializerStart: number
  initializerEnd: number
  initializerSource: string
  estimatedAddedBytes: number
}

export interface ShowFrameInvariantSelectionOptions {
  pixelCount: number
  currentArtifactBytes: number
  artifactBudgetBytes: number
  maxAddedBytes: number
  minimumAvoidedOperationsPerFrame: number
}

export interface ShowFrameInvariantPlan {
  selected: ShowFrameInvariantCandidate[]
  reason: 'selected' | 'no-candidates' | 'benefit-threshold' | 'artifact-budget' | 'byte-budget'
  estimatedAddedBytes: number
  avoidedOperationsPerFrame: number
}

export interface AppliedShowFrameInvariantHoists {
  source: string
  updateFunctionName: string | null
  valueNames: string[]
  avoidedOperationsPerPixel: number
  addedSourceBytes: number
}

const PURE_CALLS = new Set([
  'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'clamp', 'cos', 'exp', 'floor',
  'frac', 'hypot', 'log', 'max', 'min', 'pow', 'round', 'sin', 'sqrt', 'square',
  'tan', 'triangle', 'wave',
])

const DEPENDENCY_ORDER: ShowFrameDependency[] = [
  'control',
  'frame',
  'private-state',
  'sample',
  'index',
  'render-mutation',
  'unknown',
]

export function analyzeShowFrameInvariantCandidates(source: string): ShowFrameInvariantCandidate[] {
  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  const globals = collectTopLevelGlobals(ast)
  const functions = collectTopLevelFunctions(ast)
  const reachable = collectRenderReachableFunctions(functions)
  const renderMutated = collectMutatedGlobals(reachable, functions, globals)
  const frameMutated = functions.has('beforeRender')
    ? collectMutatedGlobals(new Set(['beforeRender']), functions, globals)
    : new Set<string>()
  const controls = new Set<string>()
  for (const name of functions.keys()) {
    if (!name.startsWith('slider')) continue
    for (const binding of collectMutatedGlobals(new Set([name]), functions, globals)) controls.add(binding)
  }

  const candidates: ShowFrameInvariantCandidate[] = []
  for (const functionName of reachable) {
    const fn = functions.get(functionName)
    if (!fn) continue
    const params = new Set<string>((fn.params as Node[] ?? [])
      .filter((param) => param.type === 'Identifier')
      .map((param) => param.name as string))
    const locals = collectFunctionLocals(fn)
    const mutatedLocals = collectMutatedBindings(fn.body, locals)
    visitFunctionStatements(fn.body, (statement) => {
      if (statement.type !== 'VariableDeclaration' || statement.declarations?.length !== 1) return
      const declaration = statement.declarations[0] as Node
      if (declaration.id?.type !== 'Identifier' || !declaration.init) return
      const binding = declaration.id.name as string
      if (mutatedLocals.has(binding)) return
      const classification = classifyExpression(declaration.init, {
        globals,
        frameMutated,
        controls,
        renderMutated,
        locals,
        params,
        functions: new Set(functions.keys()),
      })
      if (classification.dependencies.has('sample')
        || classification.dependencies.has('index')
        || classification.dependencies.has('render-mutation')
        || classification.dependencies.has('unknown')
        || classification.operations === 0) return
      const initializerSource = source.slice(declaration.init.start, declaration.init.end)
      candidates.push({
        binding,
        functionName,
        dependencies: orderedDependencies(classification.dependencies),
        operations: classification.operations,
        initializerStart: declaration.init.start,
        initializerEnd: declaration.init.end,
        initializerSource,
        estimatedAddedBytes: initializerSource.length + 72,
      })
    })
  }
  return candidates.sort((left, right) => left.initializerStart - right.initializerStart)
}

export function selectShowFrameInvariantHoists(
  candidates: ShowFrameInvariantCandidate[],
  options: ShowFrameInvariantSelectionOptions,
): ShowFrameInvariantPlan {
  if (candidates.length === 0) return emptyPlan('no-candidates')
  const beneficial = candidates.filter((candidate) => (
    candidate.operations * Math.max(0, options.pixelCount - 1)
      >= options.minimumAvoidedOperationsPerFrame
  ))
  if (beneficial.length === 0) return emptyPlan('benefit-threshold')
  const artifactHeadroom = Math.max(0, options.artifactBudgetBytes - options.currentArtifactBytes)
  if (artifactHeadroom === 0) return emptyPlan('artifact-budget')
  const byteAllowance = Math.min(options.maxAddedBytes, artifactHeadroom)
  const selected: ShowFrameInvariantCandidate[] = []
  let estimatedAddedBytes = 0
  for (const candidate of beneficial) {
    if (estimatedAddedBytes + candidate.estimatedAddedBytes > byteAllowance) continue
    selected.push(candidate)
    estimatedAddedBytes += candidate.estimatedAddedBytes
  }
  if (selected.length === 0) {
    return emptyPlan(byteAllowance < Math.min(...beneficial.map((candidate) => candidate.estimatedAddedBytes))
      ? 'byte-budget'
      : 'artifact-budget')
  }
  return {
    selected,
    reason: 'selected',
    estimatedAddedBytes,
    avoidedOperationsPerFrame: selected.reduce((sum, candidate) => (
      sum + candidate.operations * Math.max(0, options.pixelCount - 1)
    ), 0),
  }
}

export function applyShowFrameInvariantHoists(
  source: string,
  selected: ShowFrameInvariantCandidate[],
): AppliedShowFrameInvariantHoists {
  if (selected.length === 0) {
    return {
      source,
      updateFunctionName: null,
      valueNames: [],
      avoidedOperationsPerPixel: 0,
      addedSourceBytes: 0,
    }
  }
  const updateFunctionName = uniqueSyntheticName(source, '__pxlblz_frame_update')
  const valueNames = selected.map((_, index) => uniqueSyntheticName(source, `__pxlblz_frame_value_${index}`))
  let transformed = source
  const replacements = selected.map((candidate, index) => ({
    start: candidate.initializerStart,
    end: candidate.initializerEnd,
    text: valueNames[index],
  })).sort((left, right) => right.start - left.start)
  for (const replacement of replacements) {
    transformed = transformed.slice(0, replacement.start) + replacement.text + transformed.slice(replacement.end)
  }
  const runtime = [
    ...valueNames.map((name, index) => `var ${name} = ${selected[index].initializerSource}`),
    `function ${updateFunctionName}() {`,
    ...selected.map((candidate, index) => `  ${valueNames[index]} = ${candidate.initializerSource}`),
    '}',
  ].join('\n')
  transformed = `${transformed.trimEnd()}\n${runtime}\n`
  return {
    source: transformed,
    updateFunctionName,
    valueNames,
    avoidedOperationsPerPixel: selected.reduce((sum, candidate) => sum + candidate.operations, 0),
    addedSourceBytes: transformed.length - source.length,
  }
}

function emptyPlan(reason: ShowFrameInvariantPlan['reason']): ShowFrameInvariantPlan {
  return { selected: [], reason, estimatedAddedBytes: 0, avoidedOperationsPerFrame: 0 }
}

function uniqueSyntheticName(source: string, base: string): string {
  let candidate = base
  let suffix = 2
  while (new RegExp(`\\b${candidate}\\b`).test(source)) candidate = `${base}_${suffix++}`
  return candidate
}

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
  const result = new Set<string>()
  const pending = ['render', 'render2D', 'render3D'].filter((name) => functions.has(name))
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
  const result = new Set<string>((fn.params as Node[] ?? [])
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

function collectMutatedBindings(body: Node, bindings: Set<string>): Set<string> {
  const result = new Set<string>()
  visitNode(body, (node) => {
    if (node.type === 'AssignmentExpression' && node.left?.type === 'Identifier'
      && bindings.has(node.left.name as string)) result.add(node.left.name as string)
    if (node.type === 'UpdateExpression' && node.argument?.type === 'Identifier'
      && bindings.has(node.argument.name as string)) result.add(node.argument.name as string)
  })
  return result
}

function classifyExpression(node: Node, context: {
  globals: Set<string>
  frameMutated: Set<string>
  controls: Set<string>
  renderMutated: Set<string>
  locals: Set<string>
  params: Set<string>
  functions: Set<string>
}): { dependencies: Set<ShowFrameDependency>; operations: number } {
  if (!node) return classified(['unknown'], 0)
  if (node.type === 'Literal') return classified([], 0)
  if (node.type === 'Identifier') {
    const name = node.name as string
    if (name === 'pixelCount') return classified(['sample'], 0)
    if (context.params.has(name)) return classified([name === 'index' ? 'index' : 'sample'], 0)
    if (context.locals.has(name)) return classified(['unknown'], 0)
    if (context.renderMutated.has(name)) return classified(['render-mutation'], 0)
    if (context.controls.has(name)) return classified(['control'], 0)
    if (context.frameMutated.has(name)) return classified(['frame'], 0)
    if (context.globals.has(name)) return classified(['private-state'], 0)
    return classified(['unknown'], 0)
  }
  if (node.type === 'CallExpression') {
    if (node.callee?.type !== 'Identifier'
      || !PURE_CALLS.has(node.callee.name as string)
      || context.functions.has(node.callee.name as string)
      || context.globals.has(node.callee.name as string)) {
      return classified(['unknown'], 1)
    }
    return combine((node.arguments as Node[] ?? []).map((argument) => classifyExpression(argument, context)), 1)
  }
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    return combine([classifyExpression(node.left, context), classifyExpression(node.right, context)], 1)
  }
  if (node.type === 'UnaryExpression') return combine([classifyExpression(node.argument, context)], 1)
  if (node.type === 'ConditionalExpression') {
    return combine([
      classifyExpression(node.test, context),
      classifyExpression(node.consequent, context),
      classifyExpression(node.alternate, context),
    ], 1)
  }
  if (node.type === 'SequenceExpression') {
    return combine((node.expressions as Node[]).map((expression) => classifyExpression(expression, context)), 0)
  }
  return classified(['unknown'], 0)
}

function classified(dependencies: ShowFrameDependency[], operations: number) {
  return { dependencies: new Set(dependencies), operations }
}

function combine(
  parts: Array<{ dependencies: Set<ShowFrameDependency>; operations: number }>,
  ownOperations: number,
) {
  const dependencies = new Set<ShowFrameDependency>()
  let operations = ownOperations
  for (const part of parts) {
    part.dependencies.forEach((dependency) => dependencies.add(dependency))
    operations += part.operations
  }
  return { dependencies, operations }
}

function orderedDependencies(dependencies: Set<ShowFrameDependency>): ShowFrameDependency[] {
  return DEPENDENCY_ORDER.filter((dependency) => dependencies.has(dependency))
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
  if (node.type === 'FunctionDeclaration' && node.body !== undefined && node.id !== undefined) {
    // The caller starts at one function body; nested functions have independent state.
    if (node.body.type === 'BlockStatement') return
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(child)) child.forEach((item) => visitNode(item as Node, visitor))
    else if (child && typeof child === 'object') visitNode(child as Node, visitor)
  }
}
