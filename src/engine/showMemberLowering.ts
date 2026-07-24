// #570: Pattern-member lowering - the pipeline that turns one Show clip's
// Pattern source into a CompiledMember: bundle, manifest strip, tiny-helper
// inlining (#565), frame-invariant hoisting (#513/#566), alpha-renaming into
// the member prefix namespace, renderer/output-guarantee analysis, reset
// analysis, and Control validation. The lowering never sees scheduler or
// routing state; recipe-derived facts arrive through MemberLoweringOptions.
import * as acorn from 'acorn'
import { bundle } from './bundle'
import { stripPatternManifest } from './patternManifest'
import { inlineShowMemberHelpers } from './showHelperInlining'
import {
  analyzeShowFrameInvariantCandidates,
  applyShowFrameInvariantHoists,
  selectShowFrameInvariantHoists,
} from './showFrameInvariantHoisting'
import { analyzeShowPatternMemberReset } from './showPatternMemberReset'
import { analyzeShowRendererOutputGuaranteesAst } from './showCaptureSpecialization'
import { analyzeShowPatternRenderState } from './showPatternOutputReuse'
import { normalizeShowClipEffects } from './showEffects'
import { showClipTransformEffects } from './showClipTransform'
import { SHOW_ARTIFACT_BUDGET_BYTES } from './showVmResourceLedger'
import type { CompiledMember, ShowClipAdaptation, ShowClipRecipe } from './showCompiler'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

const MEASURED_DEVICE_BUDGET_BYTES = SHOW_ARTIFACT_BUDGET_BYTES
const MEMBER_COORDINATE_TRANSFORM_BUILTINS = new Set([
  'resetTransform',
  'translate',
  'translate3D',
  'scale',
  'scale3D',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'transform',
])

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

export function byteLength(source: string): number {
  return new TextEncoder().encode(source).length
}

export interface Rewrite {
  start: number
  end: number
  text: string
}

interface Scope {
  locals: Set<string>
  parent: Scope | null
}

export function normalizeAdaptation(adaptation: Partial<ShowClipAdaptation> | undefined): ShowClipAdaptation {
  return {
    brightness: clampNumber(adaptation?.brightness ?? 1, 0, 1),
    phase: clampNumber(adaptation?.phase ?? 0, 0, 1),
    timeScale: clampNumber(adaptation?.timeScale ?? 1, 0, 4),
    mirror: Boolean(adaptation?.mirror),
    timeOffsetMs: clampNumber(adaptation?.timeOffsetMs ?? 0, 0, 60000),
    ...(adaptation?.lightShutter
      ? {
          lightShutter: {
            rateHz: clampNumber(adaptation.lightShutter.rateHz, 0.01, 60),
            duty: clampNumber(adaptation.lightShutter.duty, 0, 1),
            phase: clampNumber(adaptation.lightShutter.phase, 0, 1),
            clockBehavior: adaptation.lightShutter.clockBehavior === 'freeze' ? 'freeze' as const : 'continue' as const,
          },
      }
      : {}),
    ...(adaptation?.steppedClock
      ? { steppedClock: { stepMs: clampNumber(adaptation.steppedClock.stepMs, 16, 60000) } }
      : {}),
  }
}

/** The Pattern-member lowering interface: everything beyond the clip and
 * its libraries arrives as one options object. `passes` carries the
 * benchmark counterfactual toggles; `analysis` carries recipe-derived facts
 * the lowering cannot compute from the clip alone. */
interface MemberLoweringOptions {
  passes?: {
    exactSpecializations?: boolean
    frameInvariantHoisting?: boolean
    inlineCallHoisting?: boolean
    helperCallInlining?: boolean
    generatedEffectKernelSharing?: boolean
    conditionalContentKeyEvaluation?: boolean
    coverageDirectedComposition?: boolean
  }
  analysis?: {
    animatedEffects?: boolean
    staticPlanEffects?: boolean
    outputPixelCount?: number
    needsMirrorMapping?: boolean
    needsBrightnessScale?: boolean
    animatedEffectParameterPaths?: string[]
  }
}

export function compileMember(
  clip: ShowClipRecipe,
  index: number,
  libraries: Record<string, string>,
  options: MemberLoweringOptions = {},
): CompiledMember {
  const passes = options.passes ?? {}
  const analysis = options.analysis ?? {}
  const animatedEffects = analysis.animatedEffects ?? false
  const staticPlanEffects = analysis.staticPlanEffects ?? false
  const exactSpecializations = passes.exactSpecializations ?? true
  const frameInvariantHoisting = passes.frameInvariantHoisting ?? true
  const inlineCallHoisting = passes.inlineCallHoisting ?? true
  const outputPixelCount = analysis.outputPixelCount ?? 256
  const needsMirrorMapping = analysis.needsMirrorMapping ?? Boolean(clip.adaptation?.mirror)
  const needsBrightnessScale = analysis.needsBrightnessScale ?? (clip.adaptation?.brightness ?? 1) !== 1
  const conditionalContentKeyEvaluation = passes.conditionalContentKeyEvaluation ?? true
  const coverageDirectedComposition = passes.coverageDirectedComposition ?? true
  const generatedEffectKernelSharing = passes.generatedEffectKernelSharing ?? false
  const animatedEffectParameterPaths = analysis.animatedEffectParameterPaths ?? []
  const helperCallInlining = passes.helperCallInlining ?? true
  const bundled = bundle(clip.source, libraries)
  const strippedCode = stripPatternManifest(bundled.code)
  // #565: inline tiny pure helper call sites before frame-invariant analysis
  // so newly exposed subexpressions become hoisting candidates in the same
  // compile. Runs on authored member source only - never on generated
  // transition or scheduler functions (#520 hardware boundary).
  const helperInlining = helperCallInlining
    ? inlineShowMemberHelpers(strippedCode)
    : { source: strippedCode, inlinedCallCount: 0, removedHelperCount: 0, addedSourceBytes: 0 }
  const memberCode = helperInlining.source
  const prefix = `__pxlblz_show_c${index}`
  const frameCandidates = frameInvariantHoisting
    ? analyzeShowFrameInvariantCandidates(memberCode, { inlineCallSubtrees: inlineCallHoisting })
    : []
  const frameHoistSourceAllowance = 1_024
  const framePlan = selectShowFrameInvariantHoists(frameCandidates, {
    pixelCount: outputPixelCount,
    currentArtifactBytes: byteLength(memberCode),
    artifactBudgetBytes: MEASURED_DEVICE_BUDGET_BYTES,
    maxAddedBytes: frameHoistSourceAllowance,
    minimumAvoidedOperationsPerFrame: 128,
  })
  let selectedFrameCandidates = framePlan.selected
  let frameHoists = applyShowFrameInvariantHoists(memberCode, selectedFrameCandidates)
  while (frameHoists.addedSourceBytes > frameHoistSourceAllowance && selectedFrameCandidates.length > 0) {
    selectedFrameCandidates = selectedFrameCandidates.slice(0, -1)
    frameHoists = applyShowFrameInvariantHoists(memberCode, selectedFrameCandidates)
  }
  const memberSource = frameHoists.source
  const memberAst = parseModule(memberSource)
  const implicitBindings = new Set<string>()
  const bindings = collectTopLevelBindings(memberAst, implicitBindings)
  const mapping = new Map([...bindings].map(name => [
    name,
    implicitBindings.has(name)
      ? `__pxlblz_show_implicit_c${index}_${name}`
      : `${prefix}_${name}`,
  ]))
  const coordinateTransformBuiltins = new Set<string>()
  const renamedSource = rewriteMemberSource(
    memberSource,
    memberAst,
    prefix,
    mapping,
    coordinateTransformBuiltins,
  )
  const coordinateMapBuiltins = new Set<string>()
  const isolatedSource = coordinateTransformBuiltins.size > 0
    ? rewriteMemberSource(
        renamedSource,
        parseModule(renamedSource),
        prefix,
        new Map(),
        coordinateMapBuiltins,
        true,
      )
    : renamedSource
  const code = isolatedSource.replace(/\bexport\s+/g, '')
  const coordinateTransformPrefix = coordinateTransformBuiltins.size > 0
    ? allocateMemberRuntimePrefix(prefix, mapping, 'ctm')
    : null
  const reset = analyzeShowPatternMemberReset(code)
  const adaptation = normalizeAdaptation(clip.adaptation)
  const renamedPatternVars = bundled.metadata.patternVars
    .map(name => mapping.get(name))
    .filter((name): name is string => Boolean(name))
  const sliderNames = new Set(bundled.metadata.controls.filter((control) => control.kind === 'slider').map((control) => control.exportName))
  const controls = Object.entries(clip.controlTargets ?? {}).map(([exportName, initialValue]) => {
    if (!sliderNames.has(exportName)) {
      throw new Error(`Clip "${clip.id}" cannot automate "${exportName}": public slider control not found.`)
    }
    const functionName = mapping.get(exportName)
    if (!functionName) throw new Error(`Clip "${clip.id}" cannot bind renamed slider "${exportName}".`)
    return {
      exportName,
      functionName,
      valueName: `${prefix}_control_${exportName}`,
      initialValue: clampNumber(initialValue, 0, 1),
    }
  })

  return {
    id: clip.id,
    evaluationPolicy: clip.evaluationPolicy === 'freeze-at-entry'
      ? 'freeze-at-entry'
      : clip.evaluationPolicy === 'refresh'
        ? 'refresh'
        : clip.evaluationPolicy === 'rolling-refresh' ? 'rolling-refresh' : 'live',
    refreshIntervalMs: Number.isFinite(clip.refreshIntervalMs)
      ? Math.max(1, Math.round(clip.refreshIntervalMs!))
      : 1_000,
    rollingRefreshSlices: Number.isFinite(clip.rollingRefreshSlices)
      ? Math.max(1, Math.min(256, Math.round(clip.rollingRefreshSlices!)))
      : 4,
    prefix,
    code,
    resourceSource: memberSource,
    sourceBytes: byteLength(memberSource),
    renamedBindings: [...mapping.values()].sort(),
    renamedPatternVars,
    renderName: mapping.get('render') ?? `${prefix}_render`,
    render2DName: mapping.get('render2D') ?? `${prefix}_render2D`,
    render3DName: mapping.get('render3D') ?? `${prefix}_render3D`,
    beforeRenderName: mapping.get('beforeRender') ?? `${prefix}_beforeRender`,
    hasRender: bindings.has('render'),
    hasRender2D: bindings.has('render2D'),
    hasRender3D: bindings.has('render3D'),
    hasBeforeRender: bindings.has('beforeRender'),
    coordinateTransformBuiltins: [...coordinateTransformBuiltins].sort(),
    coordinateTransformPrefix,
    usesMapPixels: coordinateMapBuiltins.has('mapPixels'),
    usesHsv: code.includes(`${prefix}_hsv`),
    usesTime: code.includes(`${prefix}_time`),
    elapsedName: `${prefix}_elapsed_ms`,
    elapsedSecondsName: `${prefix}_elapsed_s`,
    pixelCountName: `${prefix}_pixelCount`,
    adaptation,
    controls,
    effects: normalizeShowClipEffects(showClipTransformEffects(clip.transform, clip.effects)),
    animatedEffects,
    staticPlanEffects,
    exactSpecializations,
    outputGuarantees: exactSpecializations
      ? analyzeShowRendererOutputGuaranteesAst(memberAst)
      : { render: false, render2D: false, render3D: false },
    renderState: {
      render: analyzeShowPatternRenderState(memberSource, 'render').state,
      render2D: analyzeShowPatternRenderState(memberSource, 'render2D').state,
      render3D: analyzeShowPatternRenderState(memberSource, 'render3D').state,
    },
    needsMirrorMapping,
    needsBrightnessScale,
    frameInvariantUpdateName: frameHoists.updateFunctionName
      ? mapping.get(frameHoists.updateFunctionName) ?? null
      : null,
    frameInvariantSummary: {
      bindings: selectedFrameCandidates.map((candidate) => candidate.binding),
      candidateCount: frameCandidates.length,
      selectedCount: selectedFrameCandidates.length,
      dependencies: [...new Set(selectedFrameCandidates.flatMap((candidate) => candidate.dependencies))],
      operationsAvoidedPerEvaluatedPixel: frameHoists.avoidedOperationsPerPixel,
      estimatedOperationsAvoidedPerFrame: selectedFrameCandidates.reduce((sum, candidate) => (
        sum + candidate.operations * Math.max(0, outputPixelCount - 1)
      ), 0),
      addedSourceBytes: frameHoists.addedSourceBytes,
    },
    helperInliningSummary: {
      inlinedCallCount: helperInlining.inlinedCallCount,
      removedHelperCount: helperInlining.removedHelperCount,
      addedSourceBytes: helperInlining.addedSourceBytes,
    },
    conditionalContentKeyEvaluation,
    coverageDirectedComposition,
    coordinateFieldCapture: false,
    generatedEffectKernelSharing,
    animatedEffectParameterPaths,
    freezeOwnerTokens: [],
    refreshOwnerTokens: [],
    rollingRefreshOwnerTokens: [],
    // Coordinate transforms carry persistent matrix state that is not part of
    // the Pattern-slot bank. Keep transformed members on independent machines
    // until that state participates in slot save/restore.
    resettable: reset.resettable && coordinateTransformBuiltins.size === 0,
    resetAssignments: reset.assignments,
    slotOwnerCount: 1,
    slotOwnerAdaptations: [adaptation],
  }
}

function allocateMemberRuntimePrefix(
  memberPrefix: string,
  mapping: Map<string, string>,
  namespace: string,
): string {
  const occupied = [...mapping.values()]
  let suffix = 0
  while (true) {
    const candidate = `${memberPrefix}_${namespace}${suffix === 0 ? '' : `_${suffix}`}`
    if (!occupied.some((name) => name === candidate || name.startsWith(`${candidate}_`))) return candidate
    suffix++
  }
}

interface MemberRewriteContext {
  mapping: Map<string, string>
  prefix: string
  rewrites: Rewrite[]
  rewrittenBuiltins: Set<string>
  rewriteMapPixels: boolean
}

function rewriteMemberSource(
  source: string,
  ast: Node,
  prefix: string,
  mapping: Map<string, string>,
  coordinateTransformBuiltins: Set<string>,
  rewriteMapPixels = false,
): string {
  const context: MemberRewriteContext = {
    mapping,
    prefix,
    rewrites: [],
    rewrittenBuiltins: coordinateTransformBuiltins,
    rewriteMapPixels,
  }
  const emptyScope: Scope = { locals: new Set(), parent: null }
  walkForRewrites(ast, emptyScope, true, context)
  return rewriteSource(source, context.rewrites)
}

function walkForRewrites(
  node: Node,
  scope: Scope,
  topLevel: boolean,
  context: MemberRewriteContext,
): void {
  if (!node || typeof node !== 'object') return

  if (node.type === 'Program') {
    for (const child of node.body as Node[]) {
      walkForRewrites(child, scope, true, context)
    }
    return
  }

  if (node.type === 'BlockStatement') {
    const blockScope = makeBlockScope(node, scope)
    removeProgramMappedFunctionLocals(
      blockScope,
      scope,
      context.mapping,
      (node.body as Node[])
        .filter((statement) => statement.type === 'FunctionDeclaration')
        .map((statement) => statement.id?.name as string),
    )
    for (const child of node.body as Node[]) {
      walkForRewrites(child, blockScope, false, context)
    }
    return
  }

  if (node.type === 'CatchClause') {
    const catchLocals = new Set<string>()
    collectBindingNames(node.param, catchLocals)
    const catchScope: Scope = { locals: catchLocals, parent: scope }
    walkForRewrites(node.body, catchScope, false, context)
    return
  }

  if (node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
    const declaration = node.type === 'ForStatement' ? node.init : node.left
    const loopLocals = new Set<string>()
    if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var') {
      for (const item of declaration.declarations as Node[]) collectBindingNames(item.id, loopLocals)
    }
    const loopScope: Scope = loopLocals.size > 0 ? { locals: loopLocals, parent: scope } : scope
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc' || key === 'type') continue
      if (Array.isArray(value)) {
        for (const child of value) walkForRewrites(child as Node, loopScope, false, context)
      } else if (value && typeof value === 'object') {
        walkForRewrites(value as Node, loopScope, false, context)
      }
    }
    return
  }

  if (node.type === 'SwitchStatement') {
    const switchScope = makeSwitchScope(node, scope)
    removeProgramMappedFunctionLocals(
      switchScope,
      scope,
      context.mapping,
      (node.cases as Node[]).flatMap((switchCase) => (
        (switchCase.consequent as Node[])
          .filter((statement) => statement.type === 'FunctionDeclaration')
          .map((statement) => statement.id?.name as string)
      )),
    )
    walkForRewrites(node.discriminant, scope, false, context)
    for (const switchCase of (node.cases as Node[]) ?? []) {
      if (switchCase.test) walkForRewrites(switchCase.test, switchScope, false, context)
      for (const child of (switchCase.consequent as Node[]) ?? []) {
        walkForRewrites(child, switchScope, false, context)
      }
    }
    return
  }

  if (node.type === 'ExportNamedDeclaration') {
    if (node.declaration) walkForRewrites(node.declaration, scope, topLevel, context)
    return
  }

  if (node.type === 'VariableDeclaration') {
    for (const declaration of node.declarations as Node[]) {
      const declarationNames = new Set<string>()
      collectBindingNames(declaration.id, declarationNames)
      const programScopedVar = node.kind === 'var'
        && [...declarationNames].some(name => !isLocallyBound(scope, name))
      if (topLevel || programScopedVar) {
        addMappedBindingRewrites(declaration.id, context.mapping, context.rewrites)
      }
      walkParameterInitializers(declaration.id, scope, context)
      if (declaration.init) walkForRewrites(declaration.init, scope, false, context)
    }
    return
  }

  if (node.type === 'FunctionDeclaration') {
    if (node.id?.type === 'Identifier' && !isLocallyBound(scope, node.id.name as string)) {
      addMappedRewrite(node.id, context.mapping, context.rewrites)
    }
    const parameterScope = makeFunctionParameterScope(node, scope)
    for (const param of (node.params as Node[]) ?? []) {
      walkParameterInitializers(param, parameterScope, context)
    }
    walkForRewrites(node.body, makeFunctionBodyScope(node, parameterScope), false, context)
    return
  }

  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    const parameterScope = makeFunctionParameterScope(node, scope)
    for (const param of (node.params as Node[]) ?? []) {
      walkParameterInitializers(param, parameterScope, context)
    }
    walkForRewrites(node.body, makeFunctionBodyScope(node, parameterScope), false, context)
    return
  }

  if (node.type === 'CallExpression') {
    if (node.callee?.type === 'Identifier') {
      addReferenceRewrite(node.callee, scope, context, true)
    } else {
      walkForRewrites(node.callee, scope, false, context)
    }
    for (const argument of (node.arguments as Node[]) ?? []) {
      walkForRewrites(argument, scope, false, context)
    }
    return
  }

  if (node.type === 'MemberExpression') {
    walkForRewrites(node.object, scope, false, context)
    if (node.computed) walkForRewrites(node.property, scope, false, context)
    return
  }

  if (node.type === 'Property') {
    if (node.shorthand
      && node.key?.type === 'Identifier') {
      const binding = node.value?.type === 'Identifier'
        ? node.value
        : node.value?.type === 'AssignmentPattern' && node.value.left?.type === 'Identifier'
          ? node.value.left
          : null
      if (!binding) return
      const rewriteCount = context.rewrites.length
      addReferenceRewrite(binding, scope, context, false)
      const rewrite = context.rewrites[rewriteCount]
      if (rewrite
        && rewrite.start === binding.start
        && rewrite.end === binding.end) {
        rewrite.text = `${node.key.name}: ${rewrite.text}`
      }
      if (node.value.type === 'AssignmentPattern') {
        walkForRewrites(node.value.right, scope, false, context)
      }
      return
    }
    if (node.computed) walkForRewrites(node.key, scope, false, context)
    walkForRewrites(node.value, scope, false, context)
    return
  }

  if (node.type === 'Identifier') {
    addReferenceRewrite(node, scope, context, false)
    return
  }

  for (const [key, val] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(val)) {
      for (const child of val) walkForRewrites(child as Node, scope, false, context)
    } else if (val && typeof val === 'object') {
      walkForRewrites(val as Node, scope, false, context)
    }
  }
}

function addReferenceRewrite(
  node: Node,
  scope: Scope,
  context: MemberRewriteContext,
  callCallee: boolean,
): void {
  const name = node.name as string
  if (isLocallyBound(scope, name)) return
  const mapped = context.mapping.get(name)
  if (mapped) {
    context.rewrites.push({ start: node.start, end: node.end, text: mapped })
    return
  }
  if (name === 'pixelCount') {
    context.rewrites.push({ start: node.start, end: node.end, text: `${context.prefix}_pixelCount` })
    return
  }
  if (name === 'mapPixels' && context.rewriteMapPixels) {
    context.rewrites.push({ start: node.start, end: node.end, text: `${context.prefix}_mapPixels` })
    context.rewrittenBuiltins.add(name)
    return
  }
  if (MEMBER_COORDINATE_TRANSFORM_BUILTINS.has(name)) {
    context.rewrites.push({ start: node.start, end: node.end, text: `${context.prefix}_${name}` })
    context.rewrittenBuiltins.add(name)
    return
  }
  if (!callCallee) return
  if (name === 'time') {
    context.rewrites.push({ start: node.start, end: node.end, text: `${context.prefix}_time` })
  }
  if (name === 'rgb') {
    context.rewrites.push({ start: node.start, end: node.end, text: `${context.prefix}_rgb` })
  }
  if (name === 'hsv') {
    context.rewrites.push({ start: node.start, end: node.end, text: `${context.prefix}_hsv` })
  }
}

function addMappedRewrite(node: Node, mapping: Map<string, string>, rewrites: Rewrite[]): void {
  const mapped = mapping.get(node.name as string)
  if (mapped) rewrites.push({ start: node.start, end: node.end, text: mapped })
}

function addMappedBindingRewrites(
  node: Node | null | undefined,
  mapping: Map<string, string>,
  rewrites: Rewrite[],
): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'Identifier') {
    addMappedRewrite(node, mapping, rewrites)
    return
  }
  if (node.type === 'RestElement') {
    addMappedBindingRewrites(node.argument, mapping, rewrites)
    return
  }
  if (node.type === 'AssignmentPattern') {
    addMappedBindingRewrites(node.left, mapping, rewrites)
    return
  }
  if (node.type === 'ArrayPattern') {
    for (const element of (node.elements as Node[]) ?? []) {
      addMappedBindingRewrites(element, mapping, rewrites)
    }
    return
  }
  if (node.type === 'ObjectPattern') {
    for (const property of (node.properties as Node[]) ?? []) {
      if (property.type === 'RestElement') {
        addMappedBindingRewrites(property.argument, mapping, rewrites)
        continue
      }
      if (property.shorthand) {
        const binding = property.value?.type === 'AssignmentPattern'
          ? property.value.left
          : property.value
        const mapped = binding?.type === 'Identifier'
          ? mapping.get(binding.name as string)
          : null
        if (mapped) {
          rewrites.push({ start: binding.end, end: binding.end, text: `: ${mapped}` })
        }
        continue
      }
      addMappedBindingRewrites(property.value, mapping, rewrites)
    }
  }
}

function makeFunctionParameterScope(node: Node, parent: Scope): Scope {
  const locals = new Set<string>()
  if (node.type === 'FunctionExpression') collectBindingNames(node.id, locals)
  for (const param of (node.params as Node[]) ?? []) {
    collectBindingNames(param, locals)
  }
  return { locals, parent }
}

function makeFunctionBodyScope(node: Node, parent: Scope): Scope {
  const locals = new Set<string>()
  if (node.body?.type === 'BlockStatement') {
    for (const statement of node.body.body as Node[]) {
      if (statement.type === 'FunctionDeclaration') collectBindingNames(statement.id, locals)
      collectFunctionScopedDeclarations(statement, locals)
    }
  }
  return { locals, parent }
}

function walkParameterInitializers(
  node: Node | null | undefined,
  scope: Scope,
  context: MemberRewriteContext,
): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'AssignmentPattern') {
    walkParameterInitializers(node.left, scope, context)
    walkForRewrites(node.right, scope, false, context)
    return
  }
  if (node.type === 'RestElement') {
    walkParameterInitializers(node.argument, scope, context)
    return
  }
  if (node.type === 'ArrayPattern') {
    for (const element of (node.elements as Node[]) ?? []) {
      walkParameterInitializers(element, scope, context)
    }
    return
  }
  if (node.type === 'ObjectPattern') {
    for (const property of (node.properties as Node[]) ?? []) {
      if (property.type === 'RestElement') {
        walkParameterInitializers(property.argument, scope, context)
      } else {
        if (property.computed) walkForRewrites(property.key, scope, false, context)
        walkParameterInitializers(property.value, scope, context)
      }
    }
  }
}

function makeBlockScope(node: Node, parent: Scope): Scope {
  const locals = new Set<string>()
  for (const statement of (node.body as Node[]) ?? []) {
    if (statement.type === 'VariableDeclaration' && statement.kind !== 'var') {
      for (const declaration of (statement.declarations as Node[]) ?? []) {
        collectBindingNames(declaration.id, locals)
      }
    } else if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
      collectBindingNames(statement.id, locals)
    }
  }
  return { locals, parent }
}

function makeSwitchScope(node: Node, parent: Scope): Scope {
  const locals = new Set<string>()
  for (const switchCase of (node.cases as Node[]) ?? []) {
    for (const statement of (switchCase.consequent as Node[]) ?? []) {
      if (statement.type === 'VariableDeclaration' && statement.kind !== 'var') {
        for (const declaration of (statement.declarations as Node[]) ?? []) {
          collectBindingNames(declaration.id, locals)
        }
      } else if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
        collectBindingNames(statement.id, locals)
      }
    }
  }
  return { locals, parent }
}

function removeProgramMappedFunctionLocals(
  scope: Scope,
  parent: Scope,
  mapping: Map<string, string>,
  functionNames: string[],
): void {
  for (const name of functionNames) {
    if (mapping.has(name) && !isLocallyBound(parent, name)) scope.locals.delete(name)
  }
}

function collectFunctionScopedDeclarations(node: Node, locals: Set<string>): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'VariableDeclaration') {
    if (node.kind === 'var') {
      for (const declaration of (node.declarations as Node[]) ?? []) {
        collectBindingNames(declaration.id, locals)
      }
    }
    return
  }
  if (node.type === 'FunctionDeclaration') {
    collectBindingNames(node.id, locals)
    return
  }
  if (node.type === 'FunctionExpression'
    || node.type === 'ArrowFunctionExpression') return

  for (const [key, val] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(val)) {
      for (const child of val) collectFunctionScopedDeclarations(child as Node, locals)
    } else if (val && typeof val === 'object') {
      collectFunctionScopedDeclarations(val as Node, locals)
    }
  }
}

function collectBindingNames(node: Node | null | undefined, locals: Set<string>): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'Identifier') {
    locals.add(node.name as string)
    return
  }
  if (node.type === 'RestElement') {
    collectBindingNames(node.argument, locals)
    return
  }
  if (node.type === 'AssignmentPattern') {
    collectBindingNames(node.left, locals)
    return
  }
  if (node.type === 'ArrayPattern') {
    for (const element of (node.elements as Node[]) ?? []) collectBindingNames(element, locals)
    return
  }
  if (node.type === 'ObjectPattern') {
    for (const property of (node.properties as Node[]) ?? []) {
      collectBindingNames(property.type === 'RestElement' ? property.argument : property.value, locals)
    }
  }
}

function isLocallyBound(scope: Scope, name: string): boolean {
  let current: Scope | null = scope
  while (current) {
    if (current.locals.has(name)) return true
    current = current.parent
  }
  return false
}

function collectTopLevelBindings(ast: Node, implicitBindings: Set<string>): Set<string> {
  const bindings = new Set<string>()
  for (const node of ast.body as Node[]) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
      bindings.add(declaration.id.name as string)
    }
    if (declaration?.type === 'VariableDeclaration') {
      for (const item of (declaration.declarations as Node[]) ?? []) {
        collectBindingNames(item.id, bindings)
      }
    }
    collectProgramScopedVarDeclarations(declaration, bindings)
  }
  const declaredBindings = new Set(bindings)
  collectImplicitGlobalAssignments(ast, { locals: bindings, parent: null }, bindings)
  for (const name of bindings) {
    if (!declaredBindings.has(name)) implicitBindings.add(name)
  }
  return bindings
}

function collectImplicitGlobalAssignments(
  node: Node,
  scope: Scope,
  bindings: Set<string>,
): void {
  if (!node || typeof node !== 'object') return

  if (node.type === 'Program') {
    for (const child of node.body as Node[]) {
      collectImplicitGlobalAssignments(child, scope, bindings)
    }
    return
  }

  if (node.type === 'BlockStatement') {
    const blockScope = makeBlockScope(node, scope)
    for (const child of node.body as Node[]) {
      collectImplicitGlobalAssignments(child, blockScope, bindings)
    }
    return
  }

  if (node.type === 'CatchClause') {
    const catchLocals = new Set<string>()
    collectBindingNames(node.param, catchLocals)
    collectImplicitGlobalAssignments(
      node.body,
      { locals: catchLocals, parent: scope },
      bindings,
    )
    return
  }

  if (node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
    const declaration = node.type === 'ForStatement' ? node.init : node.left
    const loopLocals = new Set<string>()
    if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var') {
      for (const item of declaration.declarations as Node[]) {
        collectBindingNames(item.id, loopLocals)
      }
    }
    const loopScope = loopLocals.size > 0 ? { locals: loopLocals, parent: scope } : scope
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc' || key === 'type') continue
      if (Array.isArray(value)) {
        for (const child of value) {
          collectImplicitGlobalAssignments(child as Node, loopScope, bindings)
        }
      } else if (value && typeof value === 'object') {
        collectImplicitGlobalAssignments(value as Node, loopScope, bindings)
      }
    }
    return
  }

  if (node.type === 'SwitchStatement') {
    const switchScope = makeSwitchScope(node, scope)
    collectImplicitGlobalAssignments(node.discriminant, scope, bindings)
    for (const switchCase of (node.cases as Node[]) ?? []) {
      if (switchCase.test) {
        collectImplicitGlobalAssignments(switchCase.test, switchScope, bindings)
      }
      for (const child of (switchCase.consequent as Node[]) ?? []) {
        collectImplicitGlobalAssignments(child, switchScope, bindings)
      }
    }
    return
  }

  if (node.type === 'FunctionDeclaration'
    || node.type === 'FunctionExpression'
    || node.type === 'ArrowFunctionExpression') {
    const parameterScope = makeFunctionParameterScope(node, scope)
    for (const param of (node.params as Node[]) ?? []) {
      collectImplicitGlobalAssignments(param, parameterScope, bindings)
    }
    collectImplicitGlobalAssignments(
      node.body,
      makeFunctionBodyScope(node, parameterScope),
      bindings,
    )
    return
  }

  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return

  if (node.type === 'AssignmentExpression') {
    collectAssignmentTargetNames(node.left, (name) => {
      if (isLocallyBound(scope, name)) return
      if (MEMBER_COORDINATE_TRANSFORM_BUILTINS.has(name)) return
      bindings.add(name)
      let programScope = scope
      while (programScope.parent) programScope = programScope.parent
      programScope.locals.add(name)
    })
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const child of value) {
        collectImplicitGlobalAssignments(child as Node, scope, bindings)
      }
    } else if (value && typeof value === 'object') {
      collectImplicitGlobalAssignments(value as Node, scope, bindings)
    }
  }
}

function collectAssignmentTargetNames(
  node: Node | null | undefined,
  visit: (name: string) => void,
): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'Identifier') {
    visit(node.name as string)
    return
  }
  if (node.type === 'RestElement') {
    collectAssignmentTargetNames(node.argument, visit)
    return
  }
  if (node.type === 'AssignmentPattern') {
    collectAssignmentTargetNames(node.left, visit)
    return
  }
  if (node.type === 'ArrayPattern') {
    for (const element of (node.elements as Node[]) ?? []) {
      collectAssignmentTargetNames(element, visit)
    }
    return
  }
  if (node.type === 'ObjectPattern') {
    for (const property of (node.properties as Node[]) ?? []) {
      collectAssignmentTargetNames(
        property.type === 'RestElement' ? property.argument : property.value,
        visit,
      )
    }
  }
}

function collectProgramScopedVarDeclarations(node: Node, bindings: Set<string>): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'FunctionDeclaration') {
    collectBindingNames(node.id, bindings)
    return
  }
  if (node.type === 'FunctionExpression'
    || node.type === 'ArrowFunctionExpression'
    || node.type === 'ClassDeclaration'
    || node.type === 'ClassExpression') return
  if (node.type === 'VariableDeclaration') {
    if (node.kind === 'var') {
      for (const declaration of (node.declarations as Node[]) ?? []) {
        collectBindingNames(declaration.id, bindings)
      }
    }
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const child of value) collectProgramScopedVarDeclarations(child as Node, bindings)
    } else if (value && typeof value === 'object') {
      collectProgramScopedVarDeclarations(value as Node, bindings)
    }
  }
}

export function rewriteSource(src: string, rewrites: Rewrite[]): string {
  const sorted = [...rewrites].sort((a, b) => b.start - a.start)
  for (const rewrite of sorted) {
    src = src.slice(0, rewrite.start) + rewrite.text + src.slice(rewrite.end)
  }
  return src
}

export function parseModule(source: string): Node {
  return acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
}
