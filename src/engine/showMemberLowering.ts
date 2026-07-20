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
  const bindings = collectTopLevelBindings(memberAst)
  const mapping = new Map([...bindings].map(name => [name, `${prefix}_${name}`]))
  const code = rewriteMemberSource(memberSource, memberAst, prefix, mapping).replace(/\bexport\s+/g, '')
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
    resettable: reset.resettable,
    resetAssignments: reset.assignments,
    slotOwnerCount: 1,
    slotOwnerAdaptations: [adaptation],
  }
}

function rewriteMemberSource(source: string, ast: Node, prefix: string, mapping: Map<string, string>): string {
  const rewrites: Rewrite[] = []
  const emptyScope: Scope = { locals: new Set(), parent: null }
  walkForRewrites(ast, emptyScope, true, mapping, prefix, rewrites)
  return rewriteSource(source, rewrites)
}

function walkForRewrites(
  node: Node,
  scope: Scope,
  topLevel: boolean,
  mapping: Map<string, string>,
  prefix: string,
  rewrites: Rewrite[],
): void {
  if (!node || typeof node !== 'object') return

  if (node.type === 'Program') {
    for (const child of node.body as Node[]) {
      walkForRewrites(child, scope, true, mapping, prefix, rewrites)
    }
    return
  }

  if (node.type === 'ExportNamedDeclaration') {
    if (node.declaration) walkForRewrites(node.declaration, scope, topLevel, mapping, prefix, rewrites)
    return
  }

  if (node.type === 'VariableDeclaration') {
    for (const declaration of node.declarations as Node[]) {
      if (topLevel && declaration.id?.type === 'Identifier') {
        addMappedRewrite(declaration.id, mapping, rewrites)
      }
      if (declaration.init) walkForRewrites(declaration.init, scope, false, mapping, prefix, rewrites)
    }
    return
  }

  if (node.type === 'FunctionDeclaration') {
    if (topLevel && node.id?.type === 'Identifier') addMappedRewrite(node.id, mapping, rewrites)
    const fnScope = makeFunctionScope(node, scope)
    walkForRewrites(node.body, fnScope, false, mapping, prefix, rewrites)
    return
  }

  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    const fnScope = makeFunctionScope(node, scope)
    walkForRewrites(node.body, fnScope, false, mapping, prefix, rewrites)
    return
  }

  if (node.type === 'CallExpression') {
    if (node.callee?.type === 'Identifier') {
      addReferenceRewrite(node.callee, scope, mapping, prefix, rewrites, true)
    } else {
      walkForRewrites(node.callee, scope, false, mapping, prefix, rewrites)
    }
    for (const argument of (node.arguments as Node[]) ?? []) {
      walkForRewrites(argument, scope, false, mapping, prefix, rewrites)
    }
    return
  }

  if (node.type === 'MemberExpression') {
    walkForRewrites(node.object, scope, false, mapping, prefix, rewrites)
    if (node.computed) walkForRewrites(node.property, scope, false, mapping, prefix, rewrites)
    return
  }

  if (node.type === 'Property') {
    if (node.computed) walkForRewrites(node.key, scope, false, mapping, prefix, rewrites)
    walkForRewrites(node.value, scope, false, mapping, prefix, rewrites)
    return
  }

  if (node.type === 'Identifier') {
    addReferenceRewrite(node, scope, mapping, prefix, rewrites, false)
    return
  }

  for (const [key, val] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(val)) {
      for (const child of val) walkForRewrites(child as Node, scope, false, mapping, prefix, rewrites)
    } else if (val && typeof val === 'object') {
      walkForRewrites(val as Node, scope, false, mapping, prefix, rewrites)
    }
  }
}

function addReferenceRewrite(
  node: Node,
  scope: Scope,
  mapping: Map<string, string>,
  prefix: string,
  rewrites: Rewrite[],
  callCallee: boolean,
): void {
  const name = node.name as string
  if (isLocallyBound(scope, name)) return
  const mapped = mapping.get(name)
  if (mapped) {
    rewrites.push({ start: node.start, end: node.end, text: mapped })
    return
  }
  if (name === 'pixelCount') {
    rewrites.push({ start: node.start, end: node.end, text: `${prefix}_pixelCount` })
    return
  }
  if (!callCallee) return
  if (name === 'time') rewrites.push({ start: node.start, end: node.end, text: `${prefix}_time` })
  if (name === 'rgb') rewrites.push({ start: node.start, end: node.end, text: `${prefix}_rgb` })
  if (name === 'hsv') rewrites.push({ start: node.start, end: node.end, text: `${prefix}_hsv` })
}

function addMappedRewrite(node: Node, mapping: Map<string, string>, rewrites: Rewrite[]): void {
  const mapped = mapping.get(node.name as string)
  if (mapped) rewrites.push({ start: node.start, end: node.end, text: mapped })
}

function makeFunctionScope(node: Node, parent: Scope): Scope {
  const locals = new Set<string>()
  for (const param of (node.params as Node[]) ?? []) {
    if (param.type === 'Identifier') locals.add(param.name as string)
  }
  if (node.body?.type === 'BlockStatement') {
    for (const statement of node.body.body as Node[]) {
      collectLocalDeclarations(statement, locals)
    }
  }
  return { locals, parent }
}

function collectLocalDeclarations(node: Node, locals: Set<string>): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'VariableDeclaration') {
    for (const declaration of (node.declarations as Node[]) ?? []) {
      if (declaration.id?.type === 'Identifier') locals.add(declaration.id.name as string)
    }
    return
  }
  if (node.type === 'FunctionDeclaration') {
    if (node.id?.type === 'Identifier') locals.add(node.id.name as string)
    return
  }
  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return

  for (const [key, val] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(val)) {
      for (const child of val) collectLocalDeclarations(child as Node, locals)
    } else if (val && typeof val === 'object') {
      collectLocalDeclarations(val as Node, locals)
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

function collectTopLevelBindings(ast: Node): Set<string> {
  const bindings = new Set<string>()
  for (const node of ast.body as Node[]) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
      bindings.add(declaration.id.name as string)
    }
    if (declaration?.type === 'VariableDeclaration') {
      for (const item of (declaration.declarations as Node[]) ?? []) {
        if (item.id?.type === 'Identifier') bindings.add(item.id.name as string)
      }
    }
  }
  return bindings
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

