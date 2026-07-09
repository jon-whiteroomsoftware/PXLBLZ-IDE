import * as acorn from 'acorn'
import { bundle, type BundleMetadata } from './bundle'
import { emitFixedPoint } from './fxEmit'

export type PassRecipe = PassRecipeItem[]

export type PassRecipeItem = InjectPassRecipe | InterceptPassRecipe | BindPassRecipe

export interface BasePassRecipe {
  id?: string
  cost?: number
}

export interface InjectPassRecipe extends BasePassRecipe {
  kind: 'inject'
  source: string
  params?: Record<string, PassParamValue>
}

export interface InterceptPassRecipe extends BasePassRecipe {
  kind: 'intercept'
  target: OutputSinkName
  source?: string
  wrapperName?: string
  params?: Record<string, PassParamValue>
}

export interface BindPassRecipe extends BasePassRecipe {
  kind: 'bind'
  target: string
  value: PassParamValue
  min?: number
  max?: number
  quantize?: number
  mode?: 'auto' | 'function-call' | 'variable-assignment'
}

export type OutputSinkName = 'hsv' | 'hsv24' | 'rgb' | 'paint'
export type PassParamValue = string | number | boolean
export type BeforeRenderHandling = 'unchanged' | 'wrapped' | 'synthesized'

export interface PassSummary {
  id: string
  kind: PassRecipeItem['kind']
  beforeRender?: BeforeRenderHandling
  callSitesWrapped?: Record<string, number>
  globalsAdded?: string[]
  exportsAdded?: string[]
  bindingsApplied?: BindingSummary[]
  estimatedPixelCost: number
}

export interface BindingSummary {
  target: string
  mode: 'function-call' | 'variable-assignment'
}

export interface TransformSummary {
  passes: PassSummary[]
  callSitesWrapped: Record<string, number>
  beforeRender: BeforeRenderHandling
  globalsAdded: string[]
  exportsAdded: string[]
  bindingsApplied: BindingSummary[]
  estimatedPixelCost: number
}

export interface PassWarning {
  passId: string
  code: string
  message: string
}

export interface GeneratedPatternArtifact {
  code: string
  fxCode: string
  metadata: BundleMetadata
  summary: TransformSummary
  warnings: PassWarning[]
}

// ESTree nodes from Acorn carry position-rich but loosely typed shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

interface Rewrite {
  start: number
  end: number
  text: string
}

interface PassContext {
  code: string
  usedNames: Set<string>
  summary: TransformSummary
  warnings: PassWarning[]
}

interface BeforeRenderResult {
  code: string
  handling: BeforeRenderHandling
  globalsAdded: string[]
  exportsAdded: string[]
}

function emptySummary(): TransformSummary {
  return {
    passes: [],
    callSitesWrapped: {},
    beforeRender: 'unchanged',
    globalsAdded: [],
    exportsAdded: [],
    bindingsApplied: [],
    estimatedPixelCost: 0,
  }
}

export function bundleWithPasses(
  patternSrc: string,
  libraries: Record<string, string>,
  recipe: PassRecipe = [],
): GeneratedPatternArtifact {
  const base = bundle(patternSrc, libraries)
  if (recipe.length === 0) {
    return { ...base, summary: emptySummary(), warnings: [] }
  }

  const ctx: PassContext = {
    code: base.code,
    usedNames: collectIdentifiers(base.code),
    summary: emptySummary(),
    warnings: [],
  }

  for (const [index, pass] of recipe.entries()) {
    applyPass(ctx, pass, index)
  }

  return {
    code: ctx.code,
    fxCode: emitFixedPoint(ctx.code),
    metadata: base.metadata,
    summary: ctx.summary,
    warnings: ctx.warnings,
  }
}

function applyPass(ctx: PassContext, pass: PassRecipeItem, index: number): void {
  const passId = pass.id ?? `${pass.kind}-${index + 1}`
  const beforeWarnings = ctx.warnings.length
  const beforeCode = ctx.code
  let passSummary: PassSummary

  warnReservedPrefixCollisions(ctx, passId)

  if (pass.kind === 'inject') {
    passSummary = applyInjectPass(ctx, pass, passId)
  } else if (pass.kind === 'intercept') {
    passSummary = applyInterceptPass(ctx, pass, passId)
  } else {
    passSummary = applyBindPass(ctx, pass, passId)
  }

  passSummary.estimatedPixelCost = pass.cost ?? passSummary.estimatedPixelCost
  if (ctx.code === beforeCode && ctx.warnings.length === beforeWarnings) return

  ctx.summary.passes.push(passSummary)
  mergeCallSiteCounts(ctx.summary.callSitesWrapped, passSummary.callSitesWrapped ?? {})
  ctx.summary.globalsAdded.push(...(passSummary.globalsAdded ?? []))
  ctx.summary.exportsAdded.push(...(passSummary.exportsAdded ?? []))
  ctx.summary.bindingsApplied.push(...(passSummary.bindingsApplied ?? []))
  ctx.summary.estimatedPixelCost += passSummary.estimatedPixelCost
  if (passSummary.beforeRender && passSummary.beforeRender !== 'unchanged') {
    ctx.summary.beforeRender = passSummary.beforeRender
  }
}

function applyInjectPass(ctx: PassContext, pass: InjectPassRecipe, passId: string): PassSummary {
  const source = substituteParams(pass.source, pass.params ?? {})
  const mixinBeforeRender = firstTopLevelFunction(source, 'beforeRender')
  if (!mixinBeforeRender) {
    addWarning(ctx, passId, 'missing-before-render', 'Inject pass source does not define beforeRender.')
    return { id: passId, kind: 'inject', beforeRender: 'unchanged', estimatedPixelCost: 0 }
  }

  const mixinFnName = reserveName(ctx, passId, `${reservedStem(passId)}_beforeRender`)
  const rewrittenMixin = rewriteSource(source, [
    {
      start: mixinBeforeRender.id.start,
      end: mixinBeforeRender.id.end,
      text: mixinFnName,
    },
  ])

  ctx.code = `${rewrittenMixin.trimEnd()}\n\n${ctx.code}`
  ctx.usedNames = collectIdentifiers(ctx.code)
  const wrapped = wrapBeforeRender(ctx, passId, `${mixinFnName}(delta)`)
  ctx.code = wrapped.code
  ctx.usedNames = collectIdentifiers(ctx.code)

  return {
    id: passId,
    kind: 'inject',
    beforeRender: wrapped.handling,
    globalsAdded: [mixinFnName, ...wrapped.globalsAdded],
    exportsAdded: wrapped.exportsAdded,
    estimatedPixelCost: 0,
  }
}

function applyInterceptPass(ctx: PassContext, pass: InterceptPassRecipe, passId: string): PassSummary {
  const source = pass.source ? substituteParams(pass.source, pass.params ?? {}) : ''
  const wrapperBaseName = pass.wrapperName ?? (source ? firstFunctionName(source) : '')
  const parsed = parseModule(ctx.code)
  const callRewrites: Rewrite[] = []
  const counts: Record<string, number> = {}
  const wrappers = new Map<string, { name: string; sink: OutputSinkName; arity: number }>()
  const warningCount = ctx.warnings.length

  walkWithScope(parsed, null, (node, scope) => {
    if (node.type !== 'CallExpression') return
    const callee = node.callee as Node
    if (callee?.type !== 'Identifier' || callee.name !== pass.target) return
    if (isNameBound(scope, pass.target)) return

    const arity = (node.arguments as Node[]).length
    const shape = outputShape(pass.target, arity)
    if (!shape) {
      addWarning(
        ctx,
        passId,
        'unsupported-output-shape',
        `Unsupported ${pass.target} call with ${arity} argument${arity === 1 ? '' : 's'} was left unchanged.`,
      )
      return
    }

    const wrapper = wrappers.get(shape) ?? {
      name: reserveName(ctx, passId, `${reservedStem(passId)}_${shape.replace(/[()]/g, '').replace(',', '_')}`),
      sink: pass.target,
      arity,
    }
    wrappers.set(shape, wrapper)
    callRewrites.push({ start: callee.start, end: callee.end, text: wrapper.name })
    counts[shape] = (counts[shape] ?? 0) + 1
  })

  if (callRewrites.length === 0) {
    if (ctx.warnings.length === warningCount) {
      addWarning(ctx, passId, 'no-call-sites', `No ${pass.target} call sites were wrapped.`)
    }
    return { id: passId, kind: 'intercept', callSitesWrapped: {}, estimatedPixelCost: 0 }
  }

  const generatedWrappers = [...wrappers.values()]
    .map((wrapper) => emitOutputWrapper(wrapper.name, wrapper.sink, wrapper.arity, wrapperBaseName))
    .join('\n')
  const preamble = [source.trim(), generatedWrappers].filter(Boolean).join('\n\n')
  ctx.code = `${preamble}\n\n${rewriteSource(ctx.code, callRewrites)}`
  ctx.usedNames = collectIdentifiers(ctx.code)

  return {
    id: passId,
    kind: 'intercept',
    callSitesWrapped: counts,
    globalsAdded: [...wrappers.values()].map((wrapper) => wrapper.name),
    estimatedPixelCost: pass.cost ?? callRewrites.length,
  }
}

function applyBindPass(ctx: PassContext, pass: BindPassRecipe, passId: string): PassSummary {
  const targets = collectTopLevelBindings(ctx.code)
  const requestedMode = pass.mode ?? 'auto'
  const hasFunction = targets.functions.has(pass.target)
  const hasVariable = targets.variables.has(pass.target)
  const mode =
    requestedMode === 'function-call' || (requestedMode === 'auto' && hasFunction)
      ? 'function-call'
      : requestedMode === 'variable-assignment' || (requestedMode === 'auto' && hasVariable)
        ? 'variable-assignment'
        : null

  if (!mode || (mode === 'function-call' && !hasFunction) || (mode === 'variable-assignment' && !hasVariable)) {
    addWarning(ctx, passId, 'missing-bind-target', `Bind target ${pass.target} was not found.`)
    return { id: passId, kind: 'bind', bindingsApplied: [], estimatedPixelCost: 0 }
  }

  const value = constrainValue(passParamToCode(pass.value), pass)
  const call =
    mode === 'function-call'
      ? `${pass.target}(${value})`
      : `${pass.target} = ${value}`
  const bindingFn = reserveName(ctx, passId, `${reservedStem(passId)}_bind`)
  const bindingSource = `function ${bindingFn}(delta) {\n  ${call}\n}`
  ctx.code = `${bindingSource}\n\n${ctx.code}`
  ctx.usedNames = collectIdentifiers(ctx.code)
  const wrapped = wrapBeforeRender(ctx, passId, `${bindingFn}(delta)`)
  ctx.code = wrapped.code
  ctx.usedNames = collectIdentifiers(ctx.code)

  return {
    id: passId,
    kind: 'bind',
    beforeRender: wrapped.handling,
    globalsAdded: [bindingFn, ...wrapped.globalsAdded],
    exportsAdded: wrapped.exportsAdded,
    bindingsApplied: [{ target: pass.target, mode }],
    estimatedPixelCost: 0,
  }
}

function wrapBeforeRender(ctx: PassContext, passId: string, injectedCall: string): BeforeRenderResult {
  const beforeRender = firstTopLevelFunction(ctx.code, 'beforeRender')
  if (!beforeRender) {
    return {
      code: `${ctx.code.trimEnd()}\n\nexport function beforeRender(delta) {\n  ${injectedCall}\n}\n`,
      handling: 'synthesized',
      globalsAdded: [],
      exportsAdded: ['beforeRender'],
    }
  }

  const originalName = reserveName(ctx, passId, `${reservedStem(passId)}_original_beforeRender`)
  const renamed = rewriteSource(ctx.code, [
    { start: beforeRender.id.start, end: beforeRender.id.end, text: originalName },
  ])
  return {
    code: `${renamed.trimEnd()}\n\nexport function beforeRender(delta) {\n  ${originalName}(delta)\n  ${injectedCall}\n}\n`,
    handling: 'wrapped',
    globalsAdded: [originalName],
    exportsAdded: [],
  }
}

function substituteParams(source: string, params: Record<string, PassParamValue>): string {
  const names = new Set(Object.keys(params))
  if (names.size === 0) return source
  const ast = parseModule(source)
  const rewrites: Rewrite[] = []
  walkAst(ast, (node) => {
    if (node.type !== 'Identifier' || !names.has(node.name)) return
    rewrites.push({ start: node.start, end: node.end, text: passParamToCode(params[node.name]) })
  })
  return rewriteSource(source, rewrites)
}

function passParamToCode(value: PassParamValue): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return value
}

function constrainValue(value: string, pass: BindPassRecipe): string {
  let expr = value
  if (typeof pass.min === 'number' && typeof pass.max === 'number') {
    expr = `(${pass.min} + (${expr}) * ${pass.max - pass.min})`
  } else if (typeof pass.min === 'number') {
    expr = `max(${pass.min}, ${expr})`
  } else if (typeof pass.max === 'number') {
    expr = `min(${pass.max}, ${expr})`
  }
  if (typeof pass.quantize === 'number' && pass.quantize > 0) {
    const base = typeof pass.min === 'number' ? pass.min : 0
    expr = `(${base} + floor((${expr} - ${base}) / ${pass.quantize} + 0.5) * ${pass.quantize})`
  }
  return expr
}

function emitOutputWrapper(
  name: string,
  sink: OutputSinkName,
  arity: number,
  wrapperBaseName: string,
): string {
  const params = paramsForArity(arity)
  const target = wrapperBaseName || sink
  const args = params.join(', ')
  return `function ${name}(${args}) {\n  ${target}(${args})\n}`
}

function outputShape(sink: OutputSinkName, arity: number): string | null {
  if (sink === 'hsv' && arity === 3) return 'hsv'
  if (sink === 'hsv24' && arity === 1) return 'hsv24'
  if (sink === 'rgb' && arity === 3) return 'rgb'
  if (sink === 'paint' && arity === 1) return 'paint(v)'
  if (sink === 'paint' && arity === 2) return 'paint(v,b)'
  return null
}

function paramsForArity(arity: number): string[] {
  return ['a', 'b', 'c', 'd'].slice(0, arity)
}

function firstTopLevelFunction(source: string, name: string): Node | null {
  for (const node of parseModule(source).body as Node[]) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name === name) return declaration
  }
  return null
}

function firstFunctionName(source: string): string {
  for (const node of parseModule(source).body as Node[]) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) return declaration.id.name
  }
  return ''
}

function collectTopLevelBindings(source: string): { functions: Set<string>; variables: Set<string> } {
  const functions = new Set<string>()
  const variables = new Set<string>()
  for (const node of parseModule(source).body as Node[]) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) functions.add(declaration.id.name)
    if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations as Node[]) {
        if (item.id?.type === 'Identifier') variables.add(item.id.name)
      }
    }
  }
  return { functions, variables }
}

function collectIdentifiers(source: string): Set<string> {
  const names = new Set<string>()
  walkAst(parseModule(source), (node) => {
    if (node.type === 'Identifier') names.add(node.name)
  })
  return names
}

function reserveName(ctx: PassContext, passId: string, preferred: string): string {
  if (!ctx.usedNames.has(preferred)) {
    ctx.usedNames.add(preferred)
    return preferred
  }
  addWarning(ctx, passId, 'generated-name-collision', `Generated name ${preferred} collided with user source.`)
  let index = 2
  while (ctx.usedNames.has(`${preferred}_${index}`)) index += 1
  const name = `${preferred}_${index}`
  ctx.usedNames.add(name)
  return name
}

function reservedStem(passId: string): string {
  return `__pxlblz_${passId.replace(/[^A-Za-z0-9_]/g, '_')}`
}

function warnReservedPrefixCollisions(ctx: PassContext, passId: string): void {
  for (const name of ctx.usedNames) {
    if (name.startsWith('__pxlblz_')) {
      addWarning(ctx, passId, 'reserved-prefix-collision', `User identifier ${name} uses the reserved pass prefix.`)
      return
    }
  }
}

function addWarning(ctx: PassContext, passId: string, code: string, message: string): void {
  ctx.warnings.push({ passId, code, message })
}

function mergeCallSiteCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [name, count] of Object.entries(source)) {
    target[name] = (target[name] ?? 0) + count
  }
}

function rewriteSource(src: string, rewrites: Rewrite[]): string {
  const sorted = [...rewrites].sort((a, b) => b.start - a.start)
  for (const r of sorted) {
    src = src.slice(0, r.start) + r.text + src.slice(r.end)
  }
  return src
}

function parseModule(src: string): Node {
  return acorn.parse(src, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
}

function walkAst(node: unknown, visitor: (n: Node) => void): void {
  if (!node || typeof node !== 'object') return
  visitor(node as Node)
  for (const val of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      for (const item of val) walkAst(item, visitor)
    } else {
      walkAst(val, visitor)
    }
  }
}

interface Scope {
  names: Set<string>
  parent: Scope | null
}

function walkWithScope(node: Node, scope: Scope | null, visitor: (n: Node, scope: Scope) => void): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'Program') {
    const programScope = makeScope(scope, node.body as Node[])
    visitor(node, programScope)
    for (const child of node.body as Node[]) walkWithScope(child, programScope, visitor)
    return
  }

  const activeScope = scope ?? { names: new Set(), parent: null }
  visitor(node, activeScope)

  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
    const fnScope: Scope = { names: new Set(), parent: activeScope }
    for (const param of (node.params as Node[]) ?? []) {
      if (param.type === 'Identifier') fnScope.names.add(param.name)
    }
    for (const statement of (node.body?.body as Node[]) ?? []) {
      collectDeclarationNames(statement, fnScope.names)
    }
    walkWithScope(node.body, fnScope, visitor)
    return
  }

  for (const [key, val] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(val)) {
      for (const item of val) walkWithScope(item as Node, activeScope, visitor)
    } else if (val && typeof val === 'object') {
      walkWithScope(val as Node, activeScope, visitor)
    }
  }
}

function makeScope(parent: Scope | null, statements: Node[]): Scope {
  const scope: Scope = { names: new Set(), parent }
  for (const statement of statements) collectDeclarationNames(statement, scope.names)
  return scope
}

function collectDeclarationNames(node: Node, names: Set<string>): void {
  const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
  if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) names.add(declaration.id.name)
  if (declaration?.type === 'VariableDeclaration') {
    for (const item of declaration.declarations as Node[]) {
      if (item.id?.type === 'Identifier') names.add(item.id.name)
    }
  }
}

function isNameBound(scope: Scope, name: string): boolean {
  let current: Scope | null = scope
  while (current) {
    if (current.names.has(name)) return true
    current = current.parent
  }
  return false
}
