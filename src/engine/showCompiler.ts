import * as acorn from 'acorn'
import { bundle, type BundleMetadata } from './bundle'
import {
  controllerZonePixelCount,
  findControllerZoneByName,
  normalizeControllerZones,
  type ControllerZone,
} from './controllerProfile'
import { emitFixedPoint } from './fxEmit'
import { emitShowEasingExpression, showCubicBezierRuntimeSource } from './showEasing'
import type {
  ShowClipEffect,
  ShowDissolveVariant,
  ShowMotionAddressPolicy,
  ShowMotionSpinDirection,
  ShowMotionTransitionVariant,
  ShowRevealMode,
  ShowSpatialShape,
  ShowTransitionEasing,
  ShowTransitionEdgePolicy,
  ShowWipeMode,
  ShowWipeOrientation,
  ShowWipeVariant,
} from './personalContentRecords'
import { normalizeShowTransitionColor, showTransitionColorToRgb } from './showFadeThroughColor'
import { normalizeShowTransitionEdgePolicy } from './showTransitionEdge'
import { showWipeMaskPositionExpression } from './showWipe'
import {
  normalizeShowDissolveBlockSize,
  normalizeShowDissolveScale,
  normalizeShowDissolveSeed,
  normalizeShowDissolveSoftness,
} from './showDissolve'
import { normalizeShowRevealMode, showShapeRevealMaxDistance } from './showShapeReveal'
import { normalizeShowMotionTransition, showMotionTransitionVector } from './showMotionTransition'
import {
  applyShowEffectsToSample,
  buildShowEffectSampleMatrix,
  isShowColorEffect,
  normalizeShowClipEffects,
  showEffectNumericValue,
  showEffectParameterNames,
  showEffectsAreIdentity,
} from './showEffects'
import {
  buildShowCompiledCostMetadata,
  type ShowCompiledCostMetadata,
} from './showVisualToolkit'
import {
  planPhysicalRoutingRepresentation,
  type GeneratedRoutingFormula,
  type RoutingRepresentationEstimate,
} from './showRoutingRepresentation'
import { selectRenderCompatibility } from './renderCompatibility'

export interface ShowClipRecipe {
  id: string
  source: string
  zone?: string
  zones?: string[]
  zoneMode?: 'independent' | 'span' | 'repeat'
  adaptation?: Partial<ShowClipAdaptation>
  controlTargets?: Record<string, number>
  effects?: ShowClipEffect[]
}

export interface ShowCrossfadeRecipe {
  startMs: number
  durationMs: number
}

export interface ShowCutRecipe {
  startMs: number
}

export interface ShowClipAdaptation {
  brightness: number
  phase: number
  timeScale: number
  mirror: boolean
  lightShutter?: ShowLightShutter
  steppedClock?: ShowSteppedClock
  timeOffsetMs: number
}

export interface ShowLightShutter {
  rateHz: number
  duty: number
  phase: number
  clockBehavior: 'continue' | 'freeze'
}

export interface ShowSteppedClock {
  stepMs: number
}

export interface ShowAdaptationRampRecipe {
  startMs: number
  durationMs: number
  from: Partial<ShowClipAdaptation>
  to: Partial<ShowClipAdaptation>
  easing?: ShowTransitionEasing
  propertyRamps?: Partial<Record<'timeScale' | 'brightness', ShowAdaptationPropertyRampRecipe>>
  controlRamps?: Record<string, ShowAdaptationPropertyRampRecipe>
  effectRamps?: ShowEffectPropertyRampsRecipe
}

export interface ShowAdaptationPropertyRampRecipe {
  from: number
  to: number
  durationMs: number
  easing: ShowTransitionEasing
}

export type ShowEffectPropertyRampsRecipe = Record<string, Record<string, ShowAdaptationPropertyRampRecipe>>

export interface ShowRouteTransitionRecipe {
  kind: 'fade-color' | 'wipe' | 'dither' | 'portal' | 'motion'
  startMs: number
  durationMs: number
  easing?: ShowTransitionEasing
  color?: string
  direction?: number
  wipeVariant?: ShowWipeVariant
  wipeMode?: ShowWipeMode
  orientation?: ShowWipeOrientation
  count?: number
  phase?: number
  clockwise?: boolean
  edgePolicy?: ShowTransitionEdgePolicy
  dissolveVariant?: ShowDissolveVariant
  seed?: number
  blockSize?: number
  softness?: number
  revealMode?: ShowRevealMode
  aspect?: number
  feather?: number
  centerX?: number
  centerY?: number
  invert?: boolean
  featherPolicy?: 'dither' | 'blend'
  shape?: ShowSpatialShape
  scale?: number
  rotation?: number
  spin?: number
  ringWidth?: number
  cornerRadius?: number
  crossWidth?: number
  starPoints?: number
  starInner?: number
  crescentOffset?: number
  polygonSides?: number
  motionVariant?: ShowMotionTransitionVariant
  anchorX?: number
  anchorY?: number
  contentScale?: number
  spinDirection?: ShowMotionSpinDirection
  addressPolicy?: ShowMotionAddressPolicy
}

export interface ShowSceneSequenceTransitionRecipe {
  kind: 'cut' | 'crossfade' | 'fade-color' | 'wipe' | 'dither' | 'portal' | 'motion'
  durationMs: number
  color?: string
  direction?: number
  wipeVariant?: ShowWipeVariant
  wipeMode?: ShowWipeMode
  orientation?: ShowWipeOrientation
  count?: number
  phase?: number
  clockwise?: boolean
  edgePolicy?: ShowTransitionEdgePolicy
  dissolveVariant?: ShowDissolveVariant
  seed?: number
  blockSize?: number
  softness?: number
  revealMode?: ShowRevealMode
  aspect?: number
  feather?: number
  centerX?: number
  centerY?: number
  invert?: boolean
  featherPolicy?: 'dither' | 'blend'
  shape?: ShowSpatialShape
  scale?: number
  rotation?: number
  spin?: number
  ringWidth?: number
  cornerRadius?: number
  crossWidth?: number
  starPoints?: number
  starInner?: number
  crescentOffset?: number
  polygonSides?: number
  motionVariant?: ShowMotionTransitionVariant
  anchorX?: number
  anchorY?: number
  contentScale?: number
  spinDirection?: ShowMotionSpinDirection
  addressPolicy?: ShowMotionAddressPolicy
  easing?: ShowTransitionEasing
  propertyRamps?: Partial<Record<'timeScale' | 'brightness', ShowAdaptationPropertyRampRecipe>>
  controlRamps?: Record<string, ShowAdaptationPropertyRampRecipe>
  effectRamps?: ShowEffectPropertyRampsRecipe
}

export interface ShowSceneSequenceSceneRecipe {
  clipId: string
  holdMs: number
  timeScale?: number
  brightness?: number
  controlTargets?: Record<string, number>
  effects?: ShowClipEffect[]
  transitionOut?: ShowSceneSequenceTransitionRecipe
}

export interface ShowSceneSequenceRecipe {
  scenes: ShowSceneSequenceSceneRecipe[]
}

export interface ShowRoutingLayoutRecipe {
  id: string
  name: string
  zones: ControllerZone[]
  logical?: ShowLogicalRoutingRecipe
}

export type ShowLogicalRoutingRecipe =
  | { kind: 'single'; zoneNames: [string] }
  | { kind: 'grid'; zoneNames: string[]; columns: number; rows: number }
  | { kind: 'stripes'; zoneNames: string[]; axis: 'x' | 'y' }
  | { kind: 'split'; zoneNames: [string, string]; axis: 'x' | 'y' }
  | { kind: 'pinwheel'; zoneNames: string[]; twist: number }

export interface ShowRoutingPropertyRampRecipe {
  atMs: number
  from: number
  to: number
  durationMs: number
  easing: ShowTransitionEasing
}

export interface ShowRoutingPropertyRampsRecipe {
  splitPosition: {
    initial: number
    ramps: ShowRoutingPropertyRampRecipe[]
  }
}

export interface ShowSamplePropertyRampsRecipe {
  repeatScale: {
    initial: number
    ramps: ShowRoutingPropertyRampRecipe[]
  }
}

export interface ShowRoutingSwitchRecipe {
  atMs: number
  layoutId: string
  durationMs?: number
  easing?: ShowTransitionEasing
  direction?: 'forward' | 'reverse'
}

export interface ShowRecipe {
  clips: ShowClipRecipe[]
  crossfade?: ShowCrossfadeRecipe
  cut?: ShowCutRecipe
  adaptationRamp?: ShowAdaptationRampRecipe
  routeTransition?: ShowRouteTransitionRecipe
  sceneSequence?: ShowSceneSequenceRecipe
  zones?: ControllerZone[]
  routingLayouts?: ShowRoutingLayoutRecipe[]
  /** Authoritative physical output size for fixed Installation routing. */
  masterPixelCount?: number
  routingSwitches?: ShowRoutingSwitchRecipe[]
  routingPropertyRamps?: ShowRoutingPropertyRampsRecipe
  samplePropertyRamps?: ShowSamplePropertyRampsRecipe
  loopDurationMs?: number
}

export interface ShowCompileClipSummary {
  id: string
  prefix: string
  sourceBytes: number
  renamedBindings: string[]
  renamedPatternVars: string[]
  evaluationPolicy: 'full' | 'masked-shutter-continue' | 'masked-shutter-freeze'
  expectedActiveFraction: number
  temporalPolicy: 'continuous' | 'stepped-clock'
  stepMs: number | null
  timeOffsetMs: number
}

export interface ShowCompileSummary {
  clipCount: number
  transitionCount: number
  sourceBytesBeforeMerge: number
  artifactBytes: number
  measuredDeviceBudgetBytes: number
  artifactBudgetRatio: number
  renderPolicy:
    | 'steady-active-transition-both'
    | 'route-one-renderer-per-pixel'
    | 'single-continuous-hold'
    | 'cut-restart'
    | 'parameter-ramp-one-renderer-per-pixel'
    | 'route-transition-one-renderer-per-pixel'
    | 'spatial-route-one-renderer-per-pixel'
    | 'spatial-route-bounded-feather'
  transitionCost: 'none' | 'renderer-window' | 'bounded-renderer-window' | 'route' | 'parameter'
  routePolicy:
    | 'none'
    | 'hard-wipe'
    | 'feathered-wipe'
    | 'blended-wipe'
    | 'dither'
    | 'dissolve-hard'
    | 'dissolve-dithered-edge'
    | 'dissolve-blended-edge'
    | 'portal-hard'
    | 'portal-dithered-feather'
    | 'portal-blended-feather'
    | 'motion-selector'
    | 'motion-full-blend'
  clockPolicy: 'real-time' | 'scaled' | 'scaled-ramp' | 'exact-pause' | 'exact-pause-ramp'
  evaluationPolicy: 'full' | 'masked-shutter' | 'mixed'
  expectedActiveFraction: number | null
  temporalPolicy: 'continuous' | 'stepped-clock' | 'mixed'
  timeOffsetPolicy: 'none' | 'per-clip'
  worstInstantRenderersPerPixel: 1 | 2
  routingRepresentation: 'none' | 'range-branches' | 'packed-pixels' | 'generated-formula' | 'coordinate-predicates'
  routingEstimate: RoutingRepresentationEstimate | null
  routingParameterEstimate: {
    kind: 'moving-split'
    scalarGlobals: 1
    arrayElements: 0
    routeComparisonsPerPixel: 1
    equivalentEnumeratedArrayElements: number
  } | null
  sampleRemappingEstimate: {
    kind: 'synchronized-tiling'
    scalarGlobals: 1
    rendererDelta: 0
    dimensions: '1D/2D'
    maxMultiplicationsPerPixel: 2
    maxFracCallsPerPixel: 2
  } | null
  clips: ShowCompileClipSummary[]
  warnings: string[]
  cost: ShowCompiledCostMetadata
}

export interface GeneratedShowArtifact {
  code: string
  fxCode: string
  metadata: BundleMetadata
  summary: ShowCompileSummary
}

// Largest source/bytecode budget observed during the #314 hardware spike.
const MEASURED_DEVICE_BUDGET_BYTES = 68384

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

interface Rewrite {
  start: number
  end: number
  text: string
}

interface Scope {
  locals: Set<string>
  parent: Scope | null
}

interface CompiledMember {
  id: string
  prefix: string
  code: string
  sourceBytes: number
  renamedBindings: string[]
  renamedPatternVars: string[]
  renderName: string
  render2DName: string
  render3DName: string
  beforeRenderName: string
  hasRender: boolean
  hasRender2D: boolean
  hasRender3D: boolean
  hasBeforeRender: boolean
  elapsedName: string
  pixelCountName: string
  adaptation: ShowClipAdaptation
  samplePropertyRamps?: ShowSamplePropertyRampsRecipe
  controls: Array<{ exportName: string; functionName: string; valueName: string; initialValue: number }>
  effects: ShowClipEffect[]
  animatedEffects: boolean
}

interface ResolvedRoute {
  member: CompiledMember
  zone: ControllerZone
  pixelCount: number
}

type ShowOutputDimension = 1 | 2

interface ResolvedRoutingLayout {
  id: string
  name: string
  routes: ResolvedRoute[]
  logical?: ShowLogicalRoutingRecipe
  warnings: string[]
}

export function compileShow(
  recipe: ShowRecipe,
  libraries: Record<string, string>,
): GeneratedShowArtifact {
  const expandedRecipe = { ...recipe, clips: expandRouteClips(recipe.clips) }
  validateRecipe(expandedRecipe)
  const animatedEffectClipIds = new Set<string>()
  if (expandedRecipe.adaptationRamp?.effectRamps && expandedRecipe.clips[0]) {
    animatedEffectClipIds.add(expandedRecipe.clips[0].id)
  }
  for (const scene of expandedRecipe.sceneSequence?.scenes ?? []) {
    if (scene.transitionOut?.effectRamps) animatedEffectClipIds.add(scene.clipId)
  }
  const members = expandedRecipe.clips.map((clip, index) => ({
    ...compileMember(clip, index, libraries, animatedEffectClipIds.has(clip.id)),
    samplePropertyRamps: expandedRecipe.samplePropertyRamps,
  }))
  const route = buildRoutePlan(members, expandedRecipe)
  const routingLayouts = buildRoutingLayoutPlans(members, expandedRecipe)
  const routeMode = route !== null
  const portalTransition = expandedRecipe.routeTransition?.kind === 'portal'
    ? expandedRecipe.routeTransition
    : null
  const directionalWipeTransition = expandedRecipe.routeTransition?.kind === 'wipe'
    && (expandedRecipe.routeTransition.direction !== undefined
      || (expandedRecipe.routeTransition.wipeVariant !== undefined && expandedRecipe.routeTransition.wipeVariant !== 'linear'))
  const motionTransition = expandedRecipe.routeTransition?.kind === 'motion'
    ? expandedRecipe.routeTransition
    : null
  const spatialDissolveTransition = expandedRecipe.routeTransition?.kind === 'dither'
    && isSpatialDissolve(expandedRecipe.routeTransition)
    ? expandedRecipe.routeTransition
    : null
  const sequenceTransitions = expandedRecipe.sceneSequence?.scenes.flatMap((scene) => (
    scene.transitionOut ? [scene.transitionOut] : []
  )) ?? []
  const renderedSequenceTransitions = sequenceTransitions.filter((transition) => transition.kind !== 'cut')
  const sequenceHasCrossfade = renderedSequenceTransitions.some((transition) => transition.kind === 'crossfade')
  const sequenceHasPortal = renderedSequenceTransitions.some((transition) => transition.kind === 'portal')
  const sequenceHasDirectionalWipe = renderedSequenceTransitions.some((transition) => (
    transition.kind === 'wipe' && (transition.direction !== undefined
      || (transition.wipeVariant !== undefined && transition.wipeVariant !== 'linear'))
  ))
  const sequenceHasMotion = renderedSequenceTransitions.some((transition) => transition.kind === 'motion')
  const sequenceHasSpatialDissolve = renderedSequenceTransitions.some((transition) => (
    transition.kind === 'dither' && isSpatialDissolve(transition)
  ))
  const motionBlend = Boolean(
    motionTransition?.edgePolicy === 'blend'
    || renderedSequenceTransitions.some((transition) => transition.kind === 'motion' && transition.edgePolicy === 'blend'),
  )
  const portalBlend = Boolean(
    (portalTransition
      && clampNumber(portalTransition.feather ?? 0, 0, 1) > 0
      && resolvePortalEdgePolicy(portalTransition) === 'blend')
    || renderedSequenceTransitions.some((transition) => (
      transition.kind === 'portal'
      && clampNumber(transition.feather ?? 0, 0, 1) > 0
      && resolvePortalEdgePolicy(transition) === 'blend'
    )),
  )
  const wipeBlend = Boolean(
    (expandedRecipe.routeTransition?.kind === 'wipe'
      && clampNumber(expandedRecipe.routeTransition.feather ?? 0, 0, 1) > 0
      && expandedRecipe.routeTransition.edgePolicy === 'blend')
    || renderedSequenceTransitions.some((transition) => (
      transition.kind === 'wipe'
      && clampNumber(transition.feather ?? 0, 0, 1) > 0
      && transition.edgePolicy === 'blend'
    )),
  )
  const dissolveBlend = Boolean(
    (spatialDissolveTransition
      && spatialDissolveTransition.dissolveVariant === 'soft-threshold'
      && normalizeShowDissolveSoftness(spatialDissolveTransition.softness ?? 0.15) > 0
      && spatialDissolveTransition.edgePolicy === 'blend')
    || renderedSequenceTransitions.some((transition) => (
      transition.kind === 'dither'
      && transition.dissolveVariant === 'soft-threshold'
      && normalizeShowDissolveSoftness(transition.softness ?? 0.15) > 0
      && transition.edgePolicy === 'blend'
    )),
  )
  const boundedBlend = portalBlend || wipeBlend || dissolveBlend
  const memberOutputDimension = showOutputDimensionForMembers(members)
  const sequenceOutputDimension: ShowOutputDimension = sequenceHasPortal || sequenceHasDirectionalWipe || sequenceHasMotion || sequenceHasSpatialDissolve ? 2 : memberOutputDimension
  const transitionOutputDimension: ShowOutputDimension = portalTransition || directionalWipeTransition || motionTransition || spatialDissolveTransition ? 2 : memberOutputDimension
  const routedOutputDimension: 1 | 2 = routingLayouts?.some((layout) => layout.logical)
    ? 2
    : routeMode || routingLayouts
      ? memberOutputDimension
      : 1
  const hasLogicalRouting = routingLayouts?.some((layout) => layout.logical) ?? false
  const routingPlan = routingLayouts && !hasLogicalRouting
    ? planPhysicalRoutingRepresentation(
        routingLayouts.map((layout) => ({
          routes: layout.routes.map((route) => ({ ranges: route.zone.ranges })),
        })),
        MEASURED_DEVICE_BUDGET_BYTES,
      )
    : null
  const routingRepresentation: ShowCompileSummary['routingRepresentation'] = routingLayouts
    ? hasLogicalRouting
      ? 'coordinate-predicates'
      : routingPlan!.representation
    : routeMode
      ? 'range-branches' as const
      : 'none' as const
  const routingParameterEstimate: ShowCompileSummary['routingParameterEstimate'] = expandedRecipe.routingPropertyRamps
    ? {
        kind: 'moving-split',
        scalarGlobals: 1,
        arrayElements: 0,
        routeComparisonsPerPixel: 1,
        equivalentEnumeratedArrayElements: routingLayouts
          ? routingPixelCount(routingLayouts) * (expandedRecipe.routingPropertyRamps.splitPosition.ramps.length + 1)
          : 0,
      }
    : null
  const emittedCode = expandedRecipe.sceneSequence
    ? emitSceneSequenceShowCode(members, expandedRecipe.sceneSequence, sequenceOutputDimension)
    : routingLayouts
    ? emitRoutingLayoutShowCode(
        members,
        routingLayouts,
        expandedRecipe.routingSwitches ?? [],
        expandedRecipe.loopDurationMs ?? 0,
        routedOutputDimension,
        routingRepresentation === 'packed-pixels'
          ? 'packed-pixels'
          : routingRepresentation === 'generated-formula'
            ? 'generated-formula'
          : routingRepresentation === 'coordinate-predicates'
            ? 'coordinate-predicates'
            : 'range-branches',
        routingPlan?.formula,
        expandedRecipe.routingPropertyRamps,
      )
    : routeMode
      ? emitRouteShowCode(members, route.routes, routedOutputDimension)
    : expandedRecipe.adaptationRamp
      ? emitAdaptationRampShowCode(members[0], expandedRecipe.adaptationRamp, memberOutputDimension)
      : expandedRecipe.cut
        ? emitCutShowCode(members[0], members[1], expandedRecipe.cut, memberOutputDimension)
        : expandedRecipe.routeTransition
          ? portalTransition
            ? emitPortalTransitionShowCode(members[0], members[1], portalTransition)
            : emitRouteTransitionShowCode(members[0], members[1], expandedRecipe.routeTransition, transitionOutputDimension)
        : expandedRecipe.crossfade
          ? emitShowCode(members[0], members[1], expandedRecipe.crossfade, memberOutputDimension)
          : emitSingleClipShowCode(members[0], memberOutputDimension)
  const emittedWithEasingRuntime = emittedCode.includes('__pxlblz_show_cubicBezier(')
    ? `${showCubicBezierRuntimeSource()}\n${emittedCode}`
    : emittedCode
  const code = expandedRecipe.samplePropertyRamps
    ? injectSampleRemappingUpdate(emittedWithEasingRuntime)
    : emittedWithEasingRuntime
  const metadata = buildMetadata(
    members,
    expandedRecipe.sceneSequence
      ? sequenceOutputDimension
      : portalTransition || directionalWipeTransition || motionTransition || spatialDissolveTransition
        ? 2
        : routeMode || routingLayouts
          ? routedOutputDimension
          : memberOutputDimension,
  )
  const sourceBytesBeforeMerge = members.reduce((sum, member) => sum + member.sourceBytes, 0)
  const artifactBytes = byteLength(code)
  const transitionCost = expandedRecipe.sceneSequence
    ? sequenceHasCrossfade || motionBlend
      ? 'renderer-window'
      : boundedBlend
        ? 'bounded-renderer-window'
        : renderedSequenceTransitions.length > 0 ? 'route' : 'none'
    : routeMode
    ? 'route'
    : expandedRecipe.crossfade
      ? 'renderer-window'
      : expandedRecipe.adaptationRamp
        ? 'parameter'
        : expandedRecipe.routeTransition
          ? motionBlend ? 'renderer-window' : boundedBlend ? 'bounded-renderer-window' : 'route'
        : 'none'
  const evaluationSummary = describeEvaluationPolicy(members)
  const effectCost = describeEffectCost(members, expandedRecipe)
  const warnings = routingLayouts?.flatMap((layout) => layout.warnings) ?? route?.warnings ?? []
  const cost = buildShowCompiledCostMetadata({
    transitionCost,
    artifactBytes,
    budgetBytes: MEASURED_DEVICE_BUDGET_BYTES,
    expectedActiveFraction: evaluationSummary.expectedActiveFraction,
    generatedScalarGlobals: (routingParameterEstimate?.scalarGlobals ?? 0)
      + (expandedRecipe.samplePropertyRamps ? 1 : 0)
      + members.reduce((count, member) => count + (showEffectsAreIdentity(member.effects) && !member.animatedEffects
        ? 0
        : member.animatedEffects
          ? 13 + member.effects.reduce((parameters, effect) => parameters + showEffectParameterNames(effect).length, 0)
          : 7), 0),
    generatedArrayElements: routingParameterEstimate?.arrayElements ?? 0,
    warnings,
    effects: effectCost,
  })
  const summary: ShowCompileSummary = {
    clipCount: members.length,
    transitionCount: expandedRecipe.sceneSequence
      ? Math.max(0, expandedRecipe.sceneSequence.scenes.length - 1)
      : routingLayouts
      ? Math.max(
          expandedRecipe.routingSwitches?.length ?? 0,
          expandedRecipe.routingPropertyRamps?.splitPosition.ramps.length ?? 0,
        )
      : expandedRecipe.crossfade || expandedRecipe.cut || expandedRecipe.adaptationRamp || expandedRecipe.routeTransition ? 1 : 0,
    sourceBytesBeforeMerge,
    artifactBytes,
    measuredDeviceBudgetBytes: MEASURED_DEVICE_BUDGET_BYTES,
    artifactBudgetRatio: artifactBytes / MEASURED_DEVICE_BUDGET_BYTES,
    renderPolicy: expandedRecipe.sceneSequence
      ? sequenceHasCrossfade || motionBlend
        ? 'steady-active-transition-both'
        : boundedBlend
          ? 'spatial-route-bounded-feather'
          : sequenceHasPortal || sequenceHasDirectionalWipe || sequenceHasMotion || sequenceHasSpatialDissolve
            ? 'spatial-route-one-renderer-per-pixel'
            : renderedSequenceTransitions.length > 0
              ? 'route-transition-one-renderer-per-pixel'
              : 'cut-restart'
      : routeMode
      ? 'route-one-renderer-per-pixel'
      : expandedRecipe.crossfade
        ? 'steady-active-transition-both'
        : expandedRecipe.cut
          ? 'cut-restart'
        : expandedRecipe.adaptationRamp
          ? 'parameter-ramp-one-renderer-per-pixel'
          : expandedRecipe.routeTransition
            ? portalTransition || directionalWipeTransition || motionTransition || spatialDissolveTransition
              ? motionBlend
                ? 'steady-active-transition-both'
                : boundedBlend
                ? 'spatial-route-bounded-feather'
                : 'spatial-route-one-renderer-per-pixel'
              : 'route-transition-one-renderer-per-pixel'
            : 'single-continuous-hold',
    transitionCost,
    routePolicy: expandedRecipe.sceneSequence
      ? sequenceHasMotion
        ? motionBlend ? 'motion-full-blend' : 'motion-selector'
        : sequenceHasSpatialDissolve
          ? dissolveBlend
            ? 'dissolve-blended-edge'
            : renderedSequenceTransitions.some((transition) => transition.kind === 'dither'
              && transition.dissolveVariant === 'soft-threshold'
              && normalizeShowDissolveSoftness(transition.softness ?? 0.15) > 0
              && transition.edgePolicy !== 'hard')
              ? 'dissolve-dithered-edge'
              : 'dissolve-hard'
        : sequenceHasPortal && portalBlend
        ? 'portal-blended-feather'
        : sequenceHasPortal && renderedSequenceTransitions.some((transition) => (
          transition.kind === 'portal'
          && clampNumber(transition.feather ?? 0, 0, 1) > 0
          && resolvePortalEdgePolicy(transition) !== 'hard'
        ))
          ? 'portal-dithered-feather'
          : sequenceHasPortal
            ? 'portal-hard'
            : renderedSequenceTransitions.some((transition) => transition.kind === 'dither')
              ? 'dither'
            : renderedSequenceTransitions.some((transition) => (
                transition.kind === 'wipe'
                && clampNumber(transition.feather ?? 0, 0, 1) > 0
                && normalizeShowTransitionEdgePolicy(transition.edgePolicy, transition.feather ?? 0) !== 'hard'
              ))
              ? renderedSequenceTransitions.some((transition) => transition.kind === 'wipe' && transition.edgePolicy === 'blend')
                ? 'blended-wipe'
                : 'feathered-wipe'
                : renderedSequenceTransitions.some((transition) => transition.kind === 'wipe')
                  ? 'hard-wipe'
                  : 'none'
      : motionTransition
      ? motionBlend ? 'motion-full-blend' : 'motion-selector'
      : spatialDissolveTransition
      ? dissolveBlend
        ? 'dissolve-blended-edge'
        : spatialDissolveTransition.dissolveVariant === 'soft-threshold'
          && normalizeShowDissolveSoftness(spatialDissolveTransition.softness ?? 0.15) > 0
          && spatialDissolveTransition.edgePolicy !== 'hard'
          ? 'dissolve-dithered-edge'
          : 'dissolve-hard'
      : portalTransition
      ? clampNumber(portalTransition.feather ?? 0, 0, 1) <= 0 || resolvePortalEdgePolicy(portalTransition) === 'hard'
        ? 'portal-hard'
        : portalBlend
          ? 'portal-blended-feather'
          : 'portal-dithered-feather'
      : expandedRecipe.routeTransition?.kind === 'dither'
      ? 'dither'
      : expandedRecipe.routeTransition?.kind === 'wipe'
        ? clampNumber(expandedRecipe.routeTransition.feather ?? 0, 0, 1) > 0
          && normalizeShowTransitionEdgePolicy(
            expandedRecipe.routeTransition.edgePolicy,
            expandedRecipe.routeTransition.feather ?? 0,
          ) !== 'hard'
          ? expandedRecipe.routeTransition.edgePolicy === 'blend' ? 'blended-wipe' : 'feathered-wipe'
          : 'hard-wipe'
        : 'none',
    clockPolicy: describeClockPolicy(expandedRecipe, members),
    evaluationPolicy: evaluationSummary.policy,
    expectedActiveFraction: evaluationSummary.expectedActiveFraction,
    temporalPolicy: describeTemporalPolicy(members),
    timeOffsetPolicy: members.some((member) => member.adaptation.timeOffsetMs !== 0) ? 'per-clip' : 'none',
    worstInstantRenderersPerPixel: transitionCost === 'renderer-window' || transitionCost === 'bounded-renderer-window' ? 2 : 1,
    routingRepresentation,
    routingEstimate: routingPlan,
    routingParameterEstimate,
    sampleRemappingEstimate: expandedRecipe.samplePropertyRamps
      ? {
          kind: 'synchronized-tiling',
          scalarGlobals: 1,
          rendererDelta: 0,
          dimensions: '1D/2D',
          maxMultiplicationsPerPixel: 2,
          maxFracCallsPerPixel: 2,
        }
      : null,
    clips: members.map((member) => {
      const lightShutter = member.adaptation.lightShutter
      return {
        id: member.id,
        prefix: member.prefix,
        sourceBytes: member.sourceBytes,
        renamedBindings: member.renamedBindings,
        renamedPatternVars: member.renamedPatternVars,
        evaluationPolicy: lightShutter
          ? `masked-shutter-${lightShutter.clockBehavior}` as const
          : 'full' as const,
        expectedActiveFraction: lightShutter?.duty ?? 1,
        temporalPolicy: member.adaptation.steppedClock ? 'stepped-clock' as const : 'continuous' as const,
        stepMs: member.adaptation.steppedClock?.stepMs ?? null,
        timeOffsetMs: member.adaptation.timeOffsetMs,
      }
    }),
    warnings,
    cost,
  }

  return {
    code,
    fxCode: emitFixedPoint(code),
    metadata,
    summary,
  }
}

function validateRecipe(recipe: ShowRecipe): void {
  const routeMode = recipe.clips.some((clip) => routeTargets(clip).length > 0)
  const boundaryModes = [recipe.crossfade, recipe.cut, recipe.adaptationRamp, recipe.routeTransition, recipe.sceneSequence].filter(Boolean).length
  if (recipe.clips.length < 1) throw new Error('compileShow requires at least one clip.')
  if (!routeMode && !recipe.sceneSequence && recipe.clips.length > 2) throw new Error('compileShow v1 requires one or two unrouted clips.')
  if (boundaryModes > 1) throw new Error('compileShow accepts only one boundary mode.')
  if (routeMode && boundaryModes > 0) throw new Error('compileShow routed clips cannot use scene boundary modes yet.')
  if (recipe.clips.length === 2 && !routeMode && boundaryModes === 0) {
    throw new Error('compileShow requires a crossfade, cut, ramp, or routed clips for two clips.')
  }
  if (recipe.clips.length === 1 && (recipe.crossfade || recipe.cut)) {
    throw new Error('compileShow single-clip recipes can only hold or ramp adaptations.')
  }
  if (recipe.crossfade && recipe.crossfade.durationMs <= 0) {
    throw new Error('compileShow requires a positive crossfade duration.')
  }
  if (recipe.adaptationRamp && recipe.adaptationRamp.durationMs <= 0) {
    throw new Error('compileShow requires a positive adaptation-ramp duration.')
  }
  if (recipe.adaptationRamp && recipe.clips.length !== 1) {
    throw new Error('compileShow adaptation ramps run on one continuous clip.')
  }
  if (recipe.routeTransition && recipe.routeTransition.durationMs <= 0) {
    throw new Error('compileShow requires a positive route-transition duration.')
  }
  if (recipe.routeTransition && recipe.clips.length !== 2) {
    throw new Error('compileShow route transitions require two clips.')
  }
  if (recipe.sceneSequence) {
    const clipIds = new Set(recipe.clips.map((clip) => clip.id))
    if (routeMode) throw new Error('compileShow scene sequences cannot use routed clips.')
    if (recipe.sceneSequence.scenes.length < 2) throw new Error('compileShow scene sequences require at least two scenes.')
    recipe.sceneSequence.scenes.forEach((scene, index) => {
      if (!clipIds.has(scene.clipId)) {
        throw new Error(`compileShow scene sequence references missing clip "${scene.clipId}".`)
      }
      if (scene.holdMs <= 0) throw new Error('compileShow scene sequence holds must be positive.')
      const isFinal = index === recipe.sceneSequence!.scenes.length - 1
      if (isFinal && scene.transitionOut) {
        throw new Error('compileShow scene sequence final scene cannot transition.')
      }
      if (scene.transitionOut && scene.transitionOut.kind !== 'cut' && scene.transitionOut.durationMs <= 0) {
        throw new Error('compileShow scene sequence transitions must be positive.')
      }
    })
  }
  if (routeMode && !recipe.zones) {
    throw new Error('compileShow routed clips require controller zones.')
  }
  if (recipe.routingLayouts) {
    if (!routeMode) throw new Error('compileShow routing layouts require routed clips.')
    if (recipe.routingLayouts.length === 0) throw new Error('compileShow requires at least one routing layout.')
    if (!recipe.loopDurationMs || recipe.loopDurationMs <= 0) {
      throw new Error('compileShow routing layouts require a positive loop duration.')
    }
    const layoutIds = new Set(recipe.routingLayouts.map((layout) => layout.id))
    if (layoutIds.size !== recipe.routingLayouts.length) throw new Error('compileShow routing layout ids must be unique.')
    for (const routingSwitch of recipe.routingSwitches ?? []) {
      if (!layoutIds.has(routingSwitch.layoutId)) {
        throw new Error(`compileShow routing switch references missing layout "${routingSwitch.layoutId}".`)
      }
      if (routingSwitch.atMs <= 0 || routingSwitch.atMs >= recipe.loopDurationMs) {
        throw new Error('compileShow routing switches must fall inside the loop duration.')
      }
      if ((routingSwitch.durationMs ?? 0) < 0 || routingSwitch.atMs + (routingSwitch.durationMs ?? 0) > recipe.loopDurationMs) {
        throw new Error('compileShow routing transfer must fit inside the loop duration.')
      }
    }
  }
}

function expandRouteClips(clips: ShowClipRecipe[]): ShowClipRecipe[] {
  return clips.flatMap((clip) => {
    if (!clip.zones?.length) return [clip]
    if (clip.zoneMode === 'span' || clip.zoneMode === 'repeat') return [clip]
    return clip.zones.map((zone) => ({
      ...clip,
      id: `${clip.id}:${zone}`,
      zone,
      zones: undefined,
      zoneMode: undefined,
    }))
  })
}

function routeTargets(clip: ShowClipRecipe): string[] {
  if (clip.zones?.length) return clip.zones
  return clip.zone ? [clip.zone] : []
}

function compileMember(
  clip: ShowClipRecipe,
  index: number,
  libraries: Record<string, string>,
  animatedEffects = false,
): CompiledMember {
  const bundled = bundle(clip.source, libraries)
  const prefix = `__pxlblz_show_c${index}`
  const bindings = collectTopLevelBindings(bundled.code)
  const mapping = new Map([...bindings].map(name => [name, `${prefix}_${name}`]))
  const code = rewriteMemberSource(bundled.code, prefix, mapping).replace(/\bexport\s+/g, '')
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
    prefix,
    code,
    sourceBytes: byteLength(bundled.code),
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
    elapsedName: `${prefix}_elapsed_ms`,
    pixelCountName: `${prefix}_pixelCount`,
    adaptation: normalizeAdaptation(clip.adaptation),
    controls,
    effects: normalizeShowClipEffects(clip.effects),
    animatedEffects,
  }
}

function emitShowCode(
  from: CompiledMember,
  to: CompiledMember,
  crossfade: ShowCrossfadeRecipe,
  outputDimension: ShowOutputDimension,
): string {
  const transitionEnd = crossfade.startMs + crossfade.durationMs
  const members = [from, to]
  return [
    emitRuntimePrelude(members),
    ...members.map(member => member.code.trim()),
    emitScheduler(from, to, crossfade.startMs, transitionEnd, crossfade.durationMs),
    emitRender(from, to, outputDimension),
    '',
  ].join('\n\n')
}

function emitSingleClipShowCode(member: CompiledMember, outputDimension: ShowOutputDimension): string {
  const render = emitOuterRenderer(outputDimension, `  ${emitMemberCaptureCall(member, outputDimension)}
  ${member.prefix}_emit()`)
  return [
    emitRuntimePrelude([member]),
    member.code.trim(),
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_ms = __pxlblz_show_elapsed_ms + delta
  ${member.prefix}_advance(delta)
}`,
    render,
    '',
  ].join('\n\n')
}

function emitCutShowCode(
  from: CompiledMember,
  to: CompiledMember,
  cut: ShowCutRecipe,
  outputDimension: ShowOutputDimension,
): string {
  return [
    emitRuntimePrelude([from, to]),
    from.code.trim(),
    to.code.trim(),
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_ms = __pxlblz_show_elapsed_ms + delta
  if (__pxlblz_show_elapsed_ms < ${cut.startMs}) {
    __pxlblz_show_phase = 0
    ${from.prefix}_advance(delta)
  } else {
    __pxlblz_show_phase = 2
    ${to.prefix}_advance(delta)
  }
}`,
    emitOuterRenderer(outputDimension, `  if (__pxlblz_show_phase == 0) {
    ${emitMemberCaptureCall(from, outputDimension)}
    ${from.prefix}_emit()
  } else {
    ${emitMemberCaptureCall(to, outputDimension)}
    ${to.prefix}_emit()
  }`),
    '',
  ].join('\n\n')
}

function emitAdaptationRampShowCode(
  member: CompiledMember,
  ramp: ShowAdaptationRampRecipe,
  outputDimension: ShowOutputDimension,
): string {
  const from = normalizeAdaptation(ramp.from)
  const to = normalizeAdaptation(ramp.to)
  const transitionEnd = ramp.startMs + ramp.durationMs
  const propertyAssignments = emitPropertyRampAssignments(member, ramp.propertyRamps, `__pxlblz_show_elapsed_ms - ${ramp.startMs}`)
  const controlAssignments = emitControlRampAssignments(member, ramp.controlRamps, `__pxlblz_show_elapsed_ms - ${ramp.startMs}`)
  const effectAssignments = emitEffectRampAssignments(member, ramp.effectRamps, `__pxlblz_show_elapsed_ms - ${ramp.startMs}`)
  return [
    emitRuntimePrelude([member]),
    member.code.trim(),
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_ms = __pxlblz_show_elapsed_ms + delta
  if (__pxlblz_show_elapsed_ms < ${ramp.startMs}) {
    __pxlblz_show_mix = 0
  } else if (__pxlblz_show_elapsed_ms < ${transitionEnd}) {
    __pxlblz_show_mix = ${emitShowEasingExpression(ramp.easing ?? 'linear', `(__pxlblz_show_elapsed_ms - ${ramp.startMs}) / ${ramp.durationMs}`)}
  } else {
    __pxlblz_show_mix = 1
  }
  ${member.prefix}_mixAdaptation(${from.brightness}, ${from.phase}, ${from.timeScale}, ${boolNumber(from.mirror)}, ${to.brightness}, ${to.phase}, ${to.timeScale}, ${boolNumber(to.mirror)}, __pxlblz_show_mix)${propertyAssignments ? `\n${indentBlock(propertyAssignments, 2)}` : ''}${controlAssignments ? `\n${indentBlock(controlAssignments, 2)}` : ''}${effectAssignments ? `\n${indentBlock(effectAssignments, 2)}` : ''}
  ${member.prefix}_advance(delta)
}`,
    emitOuterRenderer(outputDimension, `  ${emitMemberCaptureCall(member, outputDimension)}
  ${member.prefix}_emit()`),
    '',
  ].join('\n\n')
}

function emitControlRampAssignments(
  member: CompiledMember,
  ramps: Record<string, ShowAdaptationPropertyRampRecipe> | undefined,
  elapsedExpression: string,
): string {
  if (!ramps) return ''
  return Object.entries(ramps).map(([exportName, ramp]) => {
    const control = member.controls.find((candidate) => candidate.exportName === exportName)
    if (!control) throw new Error(`Clip "${member.id}" cannot animate "${exportName}": public slider control not found.`)
    const progress = `clamp((${elapsedExpression}) / ${ramp.durationMs}, 0, 1)`
    const mix = emitShowEasingExpression(ramp.easing, progress)
    return `${control.valueName} = ${ramp.from} * (1 - ${mix}) + ${ramp.to} * ${mix}`
  }).join('\n')
}

function emitPropertyRampAssignments(
  member: CompiledMember,
  ramps: ShowAdaptationRampRecipe['propertyRamps'],
  elapsedExpression: string,
): string {
  if (!ramps) return ''
  return (['brightness', 'timeScale'] as const).flatMap((property) => {
    const ramp = ramps[property]
    if (!ramp) return []
    const progress = `clamp((${elapsedExpression}) / ${ramp.durationMs}, 0, 1)`
    const mix = emitShowEasingExpression(ramp.easing, progress)
    return [`${member.prefix}_adapt_${property} = ${ramp.from} * (1 - ${mix}) + ${ramp.to} * ${mix}`]
  }).join('\n')
}

function emitEffectRampAssignments(
  member: CompiledMember,
  ramps: ShowEffectPropertyRampsRecipe | undefined,
  elapsedExpression: string,
): string {
  if (!ramps) return ''
  return Object.entries(ramps).flatMap(([effectId, parameters]) => (
    Object.entries(parameters).map(([parameter, ramp]) => {
      const variable = effectParameterVariable(member, effectId, parameter)
      const progress = `clamp((${elapsedExpression}) / ${ramp.durationMs}, 0, 1)`
      const mix = emitShowEasingExpression(ramp.easing, progress)
      return `${variable} = ${ramp.from} * (1 - ${mix}) + ${ramp.to} * ${mix}`
    })
  )).join('\n')
}

function emitRouteTransitionShowCode(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowRouteTransitionRecipe,
  outputDimension: ShowOutputDimension,
): string {
  if (transition.kind === 'fade-color') {
    return emitFadeThroughColorShowCode(from, to, transition, outputDimension)
  }
  if (transition.kind === 'wipe') {
    return emitWipeTransitionShowCode(from, to, transition, outputDimension)
  }
  if (transition.kind === 'motion') {
    return emitMotionTransitionShowCode(from, to, transition)
  }
  if (transition.kind === 'dither' && isSpatialDissolve(transition)) {
    return emitSpatialDissolveTransitionShowCode(from, to, transition)
  }
  const transitionEnd = transition.startMs + transition.durationMs
  const pickTo = emitDissolvePickExpression(transition)
  return [
    emitRuntimePrelude([from, to]),
    from.code.trim(),
    to.code.trim(),
    emitScheduler(from, to, transition.startMs, transitionEnd, transition.durationMs, transition.easing),
    emitOuterRenderer(outputDimension, `  if (__pxlblz_show_phase == 0) {
    ${emitMemberCaptureCall(from, outputDimension)}
    ${from.prefix}_emit()
  } else if (__pxlblz_show_phase == 2) {
    ${emitMemberCaptureCall(to, outputDimension)}
    ${to.prefix}_emit()
  } else if (${pickTo}) {
    ${emitMemberCaptureCall(to, outputDimension)}
    ${to.prefix}_emit()
  } else {
    ${emitMemberCaptureCall(from, outputDimension)}
    ${from.prefix}_emit()
  }`),
    '',
  ].join('\n\n')
}

function emitWipeTransitionShowCode(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowRouteTransitionRecipe,
  outputDimension: ShowOutputDimension,
): string {
  return [
    emitRuntimePrelude([from, to]),
    from.code.trim(),
    to.code.trim(),
    emitScheduler(
      from,
      to,
      transition.startMs,
      transition.startMs + transition.durationMs,
      transition.durationMs,
      transition.easing,
    ),
    emitOuterRenderer(outputDimension, `  if (__pxlblz_show_phase == 0) {
    ${emitMemberCaptureCall(from, outputDimension)}
    ${from.prefix}_emit()
  } else if (__pxlblz_show_phase == 2) {
    ${emitMemberCaptureCall(to, outputDimension)}
    ${to.prefix}_emit()
  } else {
${indentBlock(emitWipeTransitionRenderBlock(from, to, transition, outputDimension), 4)}
  }`),
    '',
  ].join('\n\n')
}

function emitMotionTransitionShowCode(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowRouteTransitionRecipe,
): string {
  return [
    emitRuntimePrelude([from, to]),
    from.code.trim(),
    to.code.trim(),
    emitScheduler(
      from,
      to,
      transition.startMs,
      transition.startMs + transition.durationMs,
      transition.durationMs,
      transition.easing,
    ),
    emitOuterRenderer(2, `  if (__pxlblz_show_phase == 0) {
    ${from.prefix}_renderCapture2D(index, x, y)
    ${from.prefix}_emit()
  } else if (__pxlblz_show_phase == 2) {
    ${to.prefix}_renderCapture2D(index, x, y)
    ${to.prefix}_emit()
  } else {
${indentBlock(emitMotionTransitionRenderBlock(from, to, transition), 4)}
  }`),
    '',
  ].join('\n\n')
}

function emitSpatialDissolveTransitionShowCode(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowRouteTransitionRecipe,
): string {
  return [
    emitRuntimePrelude([from, to]),
    from.code.trim(),
    to.code.trim(),
    emitScheduler(
      from,
      to,
      transition.startMs,
      transition.startMs + transition.durationMs,
      transition.durationMs,
      transition.easing,
    ),
    emitOuterRenderer(2, `  if (__pxlblz_show_phase == 0) {
    ${from.prefix}_renderCapture2D(index, x, y)
    ${from.prefix}_emit()
  } else if (__pxlblz_show_phase == 2) {
    ${to.prefix}_renderCapture2D(index, x, y)
    ${to.prefix}_emit()
  } else {
${indentBlock(emitSpatialDissolveRenderBlock(from, to, transition), 4)}
  }`),
    '',
  ].join('\n\n')
}

function emitFadeThroughColorShowCode(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowRouteTransitionRecipe,
  outputDimension: ShowOutputDimension,
): string {
  return [
    emitRuntimePrelude([from, to]),
    from.code.trim(),
    to.code.trim(),
    emitScheduler(
      from,
      to,
      transition.startMs,
      transition.startMs + transition.durationMs,
      transition.durationMs,
      transition.easing,
    ),
    emitOuterRenderer(outputDimension, `  if (__pxlblz_show_phase == 0) {
    ${emitMemberCaptureCall(from, outputDimension)}
    ${from.prefix}_emit()
  } else if (__pxlblz_show_phase == 2) {
    ${emitMemberCaptureCall(to, outputDimension)}
    ${to.prefix}_emit()
  } else {
${indentBlock(emitFadeThroughColorRenderBlock(from, to, transition, outputDimension), 4)}
  }`),
    '',
  ].join('\n\n')
}

function emitPortalTransitionShowCode(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowRouteTransitionRecipe,
): string {
  const fromRender = `${from.prefix}_renderCapture2D(index, x, y)`
  const toRender = `${to.prefix}_renderCapture2D(index, x, y)`
  return [
    emitRuntimePrelude([from, to]),
    from.code.trim(),
    to.code.trim(),
    emitScheduler(
      from,
      to,
      transition.startMs,
      transition.startMs + transition.durationMs,
      transition.durationMs,
      transition.easing,
    ),
    `export function render2D(index, x, y) {
  if (__pxlblz_show_phase == 0) {
    ${fromRender}
    ${from.prefix}_emit()
  } else if (__pxlblz_show_phase == 2) {
    ${toRender}
    ${to.prefix}_emit()
  } else {
${indentBlock(emitPortalRenderBlock(from, to, transition), 4)}
  }
}`,
    '',
  ].join('\n\n')
}

function emitSceneSequenceShowCode(
  members: CompiledMember[],
  sequence: ShowSceneSequenceRecipe,
  outputDimension: 1 | 2,
): string {
  const memberById = new Map(members.map((member) => [member.id, member]))
  const scenes = sequence.scenes.map((scene) => ({ ...scene, member: memberById.get(scene.clipId)! }))
  const segments: Array<{
    kind: 'hold' | 'transition'
    endMs: number
    sceneIndex: number
    from: CompiledMember
    to?: CompiledMember
    transition?: ShowSceneSequenceTransitionRecipe
    startMs: number
  }> = []
  let cursor = 0
  scenes.forEach((scene, sceneIndex) => {
    const holdStart = cursor
    cursor += scene.holdMs
    segments.push({ kind: 'hold', startMs: holdStart, endMs: cursor, sceneIndex, from: scene.member })
    if (scene.transitionOut && scene.transitionOut.kind !== 'cut') {
      const transitionStart = cursor
      cursor += scene.transitionOut.durationMs
      segments.push({
        kind: 'transition',
        startMs: transitionStart,
        endMs: cursor,
        sceneIndex,
        from: scene.member,
        to: scenes[sceneIndex + 1].member,
        transition: scene.transitionOut,
      })
    }
  })
  const schedulerBranches = segments.map((segment, index) => {
    const condition = `${index === 0 ? 'if' : 'else if'} (__pxlblz_show_elapsed_ms < ${segment.endMs})`
    if (segment.kind === 'hold') {
      return `${condition} {
    __pxlblz_show_scene = ${segment.sceneIndex}
    __pxlblz_show_transition = -1
    __pxlblz_show_mix = 0${emitSceneControlTargets(segment.from, scenes[segment.sceneIndex].controlTargets)}${emitSceneEffectTargets(segment.from, scenes[segment.sceneIndex].effects)}${scenes[segment.sceneIndex].brightness === undefined
      ? ''
      : `\n    ${segment.from.prefix}_adapt_brightness = ${scenes[segment.sceneIndex].brightness}`}${scenes[segment.sceneIndex].timeScale === undefined
        ? ''
        : `\n    ${segment.from.prefix}_adapt_timeScale = ${scenes[segment.sceneIndex].timeScale}`}
    ${segment.from.prefix}_advance(delta)
  }`
    }
    const to = segment.to!
    const advanceTo = to === segment.from ? '' : `\n    ${to.prefix}_advance(delta)`
    return `${condition} {
    __pxlblz_show_scene = ${segment.sceneIndex}
    __pxlblz_show_transition = ${segment.sceneIndex}
    __pxlblz_show_mix = ${emitShowEasingExpression(segment.transition!.easing ?? 'linear', `(__pxlblz_show_elapsed_ms - ${segment.startMs}) / ${segment.transition!.durationMs}`)}${segment.transition!.propertyRamps
      ? `\n${indentBlock(emitPropertyRampAssignments(segment.from, segment.transition!.propertyRamps, `__pxlblz_show_elapsed_ms - ${segment.startMs}`), 4)}`
      : ''}${segment.transition!.controlRamps
        ? `\n${indentBlock(emitControlRampAssignments(segment.from, segment.transition!.controlRamps, `__pxlblz_show_elapsed_ms - ${segment.startMs}`), 4)}`
        : ''}${segment.transition!.effectRamps
          ? `\n${indentBlock(emitEffectRampAssignments(segment.from, segment.transition!.effectRamps, `__pxlblz_show_elapsed_ms - ${segment.startMs}`), 4)}`
        : ''}
    ${segment.from.prefix}_advance(delta)${advanceTo}
  }`
  }).join(' ')
  const transitionBranches = segments
    .filter((segment) => segment.kind === 'transition')
    .map((segment, index) => `${index === 0 ? 'if' : 'else if'} (__pxlblz_show_transition == ${segment.sceneIndex}) {
${indentBlock(emitSceneSequenceTransitionBlock(segment.from, segment.to!, segment.transition!, outputDimension), 4)}
  }`)
    .join(' ')
  const sceneBranches = scenes.map((scene, index) => `${index === 0 ? 'if' : 'else if'} (__pxlblz_show_scene == ${index}) {
    ${memberRenderCapture(scene.member, outputDimension)}
    ${scene.member.prefix}_emit()
  }`).join(' ')

  return [
    emitRuntimePrelude(members),
    ...members.map((member) => member.code.trim()),
    'var __pxlblz_show_scene = 0',
    'var __pxlblz_show_transition = -1',
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_ms = (__pxlblz_show_elapsed_ms + delta) % ${cursor}
  ${schedulerBranches}
}`,
    `export function ${outputDimension === 2 ? 'render2D(index, x, y)' : 'render(index)'} {
  if (__pxlblz_show_transition >= 0) {
    ${transitionBranches}
  } else {
    ${sceneBranches}
  }
}`,
    '',
  ].join('\n\n')
}

function emitSceneControlTargets(member: CompiledMember, targets: Record<string, number> | undefined): string {
  if (!targets) return ''
  return Object.entries(targets).map(([exportName, value]) => {
    const control = member.controls.find((candidate) => candidate.exportName === exportName)
    if (!control) throw new Error(`Clip "${member.id}" cannot set "${exportName}": public slider control not found.`)
    return `\n    ${control.valueName} = ${clampNumber(value, 0, 1)}`
  }).join('')
}

function emitSceneEffectTargets(member: CompiledMember, effects: ShowClipEffect[] | undefined): string {
  if (!effects || !member.animatedEffects) return ''
  return normalizeShowClipEffects(effects).flatMap((effect) => (
    showEffectParameterNames(effect).map((parameter) => (
      `\n    ${effectParameterVariable(member, effect.id, parameter)} = ${effectParameterValue(effect, parameter)}`
    ))
  )).join('')
}

function emitSceneSequenceTransitionBlock(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowSceneSequenceTransitionRecipe,
  outputDimension: 1 | 2,
): string {
  if (transition.kind === 'portal') return emitPortalRenderBlock(from, to, transition)
  if (transition.kind === 'fade-color') return emitFadeThroughColorRenderBlock(from, to, transition, outputDimension)
  if (transition.kind === 'wipe') return emitWipeTransitionRenderBlock(from, to, transition, outputDimension)
  if (transition.kind === 'motion') return emitMotionTransitionRenderBlock(from, to, transition)
  if (transition.kind === 'dither' && isSpatialDissolve(transition)) {
    return emitSpatialDissolveRenderBlock(from, to, transition)
  }

  const fromRender = memberRenderCapture(from, outputDimension)
  const toRender = memberRenderCapture(to, outputDimension)
  if (transition.kind === 'crossfade') {
    return `${fromRender}
var r0 = ${from.prefix}_r
var g0 = ${from.prefix}_g
var b0 = ${from.prefix}_b
${toRender}
rgb(
  r0 * (1 - __pxlblz_show_mix) + ${to.prefix}_r * __pxlblz_show_mix,
  g0 * (1 - __pxlblz_show_mix) + ${to.prefix}_g * __pxlblz_show_mix,
  b0 * (1 - __pxlblz_show_mix) + ${to.prefix}_b * __pxlblz_show_mix
)`
  }

  const pickTo = emitDissolvePickExpression(transition)
  return `if (${pickTo}) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  ${from.prefix}_emit()
}`
}

function emitDissolvePickExpression(
  transition: Pick<ShowRouteTransitionRecipe, 'dissolveVariant' | 'seed' | 'blockSize'>,
): string {
  const seedOffset = normalizeShowDissolveSeed(transition.seed ?? 0) * 131
  const cell = transition.dissolveVariant === 'block'
    ? `floor(index / ${normalizeShowDissolveBlockSize(transition.blockSize ?? 8)})`
    : 'index'
  const hashInput = seedOffset === 0 ? cell : `${cell} + ${seedOffset}`
  return `__pxlblz_show_hash01(${hashInput}) < __pxlblz_show_mix`
}

function isSpatialDissolve(
  transition: Pick<ShowRouteTransitionRecipe, 'dissolveVariant'>,
): boolean {
  return transition.dissolveVariant === 'coherent-noise' || transition.dissolveVariant === 'soft-threshold'
}

function emitSpatialDissolveRenderBlock(
  from: CompiledMember,
  to: CompiledMember,
  transition: Pick<ShowRouteTransitionRecipe, 'dissolveVariant' | 'seed' | 'scale' | 'softness' | 'edgePolicy'>,
): string {
  const seedOffset = normalizeShowDissolveSeed(transition.seed ?? 0) * 131
  const scale = normalizeShowDissolveScale(transition.scale ?? 6)
  const softness = transition.dissolveVariant === 'soft-threshold'
    ? normalizeShowDissolveSoftness(transition.softness ?? 0.15)
    : 0
  const policy = transition.dissolveVariant === 'soft-threshold'
    ? transition.edgePolicy === 'hard' || transition.edgePolicy === 'blend'
      ? transition.edgePolicy
      : 'dither'
    : 'hard'
  const seedTerm = seedOffset === 0 ? '' : ` + ${seedOffset}`
  const prelude = `var __pxlblz_show_dissolve_x = x * ${scale}
var __pxlblz_show_dissolve_y = y * ${scale}
var __pxlblz_show_dissolve_ix = floor(__pxlblz_show_dissolve_x)
var __pxlblz_show_dissolve_iy = floor(__pxlblz_show_dissolve_y)
var __pxlblz_show_dissolve_fx = __pxlblz_show_dissolve_x - __pxlblz_show_dissolve_ix
var __pxlblz_show_dissolve_fy = __pxlblz_show_dissolve_y - __pxlblz_show_dissolve_iy
var __pxlblz_show_dissolve_sx = __pxlblz_show_dissolve_fx * __pxlblz_show_dissolve_fx * (3 - 2 * __pxlblz_show_dissolve_fx)
var __pxlblz_show_dissolve_sy = __pxlblz_show_dissolve_fy * __pxlblz_show_dissolve_fy * (3 - 2 * __pxlblz_show_dissolve_fy)
var __pxlblz_show_dissolve_h00 = __pxlblz_show_hash01(__pxlblz_show_dissolve_ix + __pxlblz_show_dissolve_iy * 4096${seedTerm})
var __pxlblz_show_dissolve_h10 = __pxlblz_show_hash01(__pxlblz_show_dissolve_ix + 1 + __pxlblz_show_dissolve_iy * 4096${seedTerm})
var __pxlblz_show_dissolve_h01 = __pxlblz_show_hash01(__pxlblz_show_dissolve_ix + (__pxlblz_show_dissolve_iy + 1) * 4096${seedTerm})
var __pxlblz_show_dissolve_h11 = __pxlblz_show_hash01(__pxlblz_show_dissolve_ix + 1 + (__pxlblz_show_dissolve_iy + 1) * 4096${seedTerm})
var __pxlblz_show_dissolve_top = __pxlblz_show_dissolve_h00 + (__pxlblz_show_dissolve_h10 - __pxlblz_show_dissolve_h00) * __pxlblz_show_dissolve_sx
var __pxlblz_show_dissolve_bottom = __pxlblz_show_dissolve_h01 + (__pxlblz_show_dissolve_h11 - __pxlblz_show_dissolve_h01) * __pxlblz_show_dissolve_sx
var __pxlblz_show_dissolve_field = __pxlblz_show_dissolve_top + (__pxlblz_show_dissolve_bottom - __pxlblz_show_dissolve_top) * __pxlblz_show_dissolve_sy`
  const fromRender = `${from.prefix}_renderCapture2D(index, x, y)`
  const toRender = `${to.prefix}_renderCapture2D(index, x, y)`
  if (policy === 'hard' || softness === 0) {
    return `${prelude}
if (__pxlblz_show_dissolve_field < __pxlblz_show_mix) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  ${from.prefix}_emit()
}`
  }
  const edgePrelude = `${prelude}
var __pxlblz_show_dissolve_edge_mix = clamp((__pxlblz_show_mix + ${softness / 2} - __pxlblz_show_dissolve_field) / ${softness}, 0, 1)`
  if (policy === 'dither') {
    return `${edgePrelude}
if (__pxlblz_show_hash01(index + ${seedOffset + 7919}) < __pxlblz_show_dissolve_edge_mix) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  ${from.prefix}_emit()
}`
  }
  return `${edgePrelude}
if (__pxlblz_show_dissolve_edge_mix <= 0) {
  ${fromRender}
  ${from.prefix}_emit()
} else if (__pxlblz_show_dissolve_edge_mix >= 1) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  var r0 = ${from.prefix}_r
  var g0 = ${from.prefix}_g
  var b0 = ${from.prefix}_b
  ${toRender}
  rgb(
    r0 * (1 - __pxlblz_show_dissolve_edge_mix) + ${to.prefix}_r * __pxlblz_show_dissolve_edge_mix,
    g0 * (1 - __pxlblz_show_dissolve_edge_mix) + ${to.prefix}_g * __pxlblz_show_dissolve_edge_mix,
    b0 * (1 - __pxlblz_show_dissolve_edge_mix) + ${to.prefix}_b * __pxlblz_show_dissolve_edge_mix
  )
}`
}

function emitWipeTransitionRenderBlock(
  from: CompiledMember,
  to: CompiledMember,
  transition: Pick<ShowRouteTransitionRecipe, 'direction' | 'wipeVariant' | 'wipeMode' | 'orientation' | 'count' | 'centerX' | 'centerY' | 'phase' | 'clockwise' | 'edgePolicy' | 'feather'>,
  outputDimension: ShowOutputDimension,
): string {
  const feather = clampNumber(transition.feather ?? 0, 0, 1)
  const edgePolicy = normalizeShowTransitionEdgePolicy(transition.edgePolicy, feather)
  const position = showWipePositionExpression(transition, outputDimension)
  const fromRender = memberRenderCapture(from, outputDimension)
  const toRender = memberRenderCapture(to, outputDimension)
  if (edgePolicy === 'hard' || feather === 0) {
    return `if (${position} < __pxlblz_show_mix) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  ${from.prefix}_emit()
}`
  }
  const prelude = `var __pxlblz_show_wipe_position = ${position}
var __pxlblz_show_feather_progress = (__pxlblz_show_mix + ${feather / 2} - __pxlblz_show_wipe_position) / ${feather}`
  if (edgePolicy === 'dither') {
    return `${prelude}
if (__pxlblz_show_wipe_position < __pxlblz_show_mix - ${feather / 2} || (__pxlblz_show_wipe_position < __pxlblz_show_mix + ${feather / 2} && __pxlblz_show_hash01(index) < clamp(__pxlblz_show_feather_progress, 0, 1))) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  ${from.prefix}_emit()
}`
  }
  return `${prelude}
if (__pxlblz_show_feather_progress <= 0) {
  ${fromRender}
  ${from.prefix}_emit()
} else if (__pxlblz_show_feather_progress >= 1) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  var r0 = ${from.prefix}_r
  var g0 = ${from.prefix}_g
  var b0 = ${from.prefix}_b
  ${toRender}
  var __pxlblz_show_edge_mix = clamp(__pxlblz_show_feather_progress, 0, 1)
  rgb(
    r0 * (1 - __pxlblz_show_edge_mix) + ${to.prefix}_r * __pxlblz_show_edge_mix,
    g0 * (1 - __pxlblz_show_edge_mix) + ${to.prefix}_g * __pxlblz_show_edge_mix,
    b0 * (1 - __pxlblz_show_edge_mix) + ${to.prefix}_b * __pxlblz_show_edge_mix
  )
}`
}

function emitMotionTransitionRenderBlock(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowRouteTransitionRecipe | ShowSceneSequenceTransitionRecipe,
): string {
  const settings = normalizeShowMotionTransition(transition)
  const vector = showMotionTransitionVector(settings.direction)
  const fromMoves = settings.motionVariant === 'reveal'
    || settings.motionVariant === 'push'
    || settings.motionVariant === 'content-shrink'
    || settings.motionVariant === 'zoom-out'
  const toMoves = settings.motionVariant === 'cover'
    || settings.motionVariant === 'push'
    || settings.motionVariant === 'content-grow'
    || settings.motionVariant === 'zoom-in'
  const grows = settings.motionVariant === 'content-grow' || settings.motionVariant === 'zoom-in'
  const scales = grows || settings.motionVariant === 'content-shrink' || settings.motionVariant === 'zoom-out'
  const spins = settings.motionVariant === 'zoom-in' || settings.motionVariant === 'zoom-out'
  const scaleExpression = grows
    ? `${settings.contentScale} * (1 - __pxlblz_show_mix) + __pxlblz_show_mix`
    : `(1 - __pxlblz_show_mix) + ${settings.contentScale} * __pxlblz_show_mix`
  const rotationSign = settings.spinDirection === 'counterclockwise' ? -1 : 1
  const rotationExpression = settings.motionVariant === 'zoom-in'
    ? `${rotationSign * settings.rotation} * (1 - __pxlblz_show_mix)`
    : `${rotationSign * settings.rotation} * __pxlblz_show_mix`
  const affineCoordinates = {
    x: `${settings.anchorX} + (__pxlblz_show_motion_cos * (x - ${settings.anchorX}) + __pxlblz_show_motion_sin * (y - ${settings.anchorY})) / __pxlblz_show_motion_scale`,
    y: `${settings.anchorY} + (-__pxlblz_show_motion_sin * (x - ${settings.anchorX}) + __pxlblz_show_motion_cos * (y - ${settings.anchorY})) / __pxlblz_show_motion_scale`,
  }
  const fromCoordinates = settings.motionVariant === 'reveal' || settings.motionVariant === 'push'
    ? {
        x: `x - ${vector.x} * __pxlblz_show_mix`,
        y: `y - ${vector.y} * __pxlblz_show_mix`,
      }
    : settings.motionVariant === 'content-shrink' || settings.motionVariant === 'zoom-out'
      ? {
          x: spins ? affineCoordinates.x : `${settings.anchorX} + (x - ${settings.anchorX}) / __pxlblz_show_motion_scale`,
          y: spins ? affineCoordinates.y : `${settings.anchorY} + (y - ${settings.anchorY}) / __pxlblz_show_motion_scale`,
        }
      : { x: 'x', y: 'y' }
  const toCoordinates = settings.motionVariant === 'cover' || settings.motionVariant === 'push'
    ? {
        x: `x + ${vector.x} * (1 - __pxlblz_show_mix)`,
        y: `y + ${vector.y} * (1 - __pxlblz_show_mix)`,
      }
    : settings.motionVariant === 'content-grow' || settings.motionVariant === 'zoom-in'
      ? {
          x: spins ? affineCoordinates.x : `${settings.anchorX} + (x - ${settings.anchorX}) / __pxlblz_show_motion_scale`,
          y: spins ? affineCoordinates.y : `${settings.anchorY} + (y - ${settings.anchorY}) / __pxlblz_show_motion_scale`,
        }
      : { x: 'x', y: 'y' }
  const address = (name: 'from' | 'to', moves: boolean) => !moves
    ? ''
    : settings.addressPolicy === 'wrap'
      ? `\n__pxlblz_show_motion_${name}_x = frac(__pxlblz_show_motion_${name}_x)
__pxlblz_show_motion_${name}_y = frac(__pxlblz_show_motion_${name}_y)
__pxlblz_show_motion_${name}_inside = 1`
      : `\n__pxlblz_show_motion_${name}_x = clamp(__pxlblz_show_motion_${name}_x, 0, 1)
__pxlblz_show_motion_${name}_y = clamp(__pxlblz_show_motion_${name}_y, 0, 1)`
  const prelude = `${scales
    ? `var __pxlblz_show_motion_scale = ${scaleExpression}\n`
    : ''}${spins
    ? `var __pxlblz_show_motion_rotation = ${rotationExpression}\nvar __pxlblz_show_motion_cos = cos(__pxlblz_show_motion_rotation * 6.283185307179586)\nvar __pxlblz_show_motion_sin = sin(__pxlblz_show_motion_rotation * 6.283185307179586)\n`
    : ''}var __pxlblz_show_motion_from_x = ${fromCoordinates.x}
var __pxlblz_show_motion_from_y = ${fromCoordinates.y}
var __pxlblz_show_motion_to_x = ${toCoordinates.x}
var __pxlblz_show_motion_to_y = ${toCoordinates.y}
var __pxlblz_show_motion_from_inside = __pxlblz_show_motion_from_x >= 0 && __pxlblz_show_motion_from_x <= 1 && __pxlblz_show_motion_from_y >= 0 && __pxlblz_show_motion_from_y <= 1
var __pxlblz_show_motion_to_inside = __pxlblz_show_motion_to_x >= 0 && __pxlblz_show_motion_to_x <= 1 && __pxlblz_show_motion_to_y >= 0 && __pxlblz_show_motion_to_y <= 1${address('from', fromMoves)}${address('to', toMoves)}`
  const fromRender = `${from.prefix}_renderCapture2D(index, __pxlblz_show_motion_from_x, __pxlblz_show_motion_from_y)`
  const toRender = `${to.prefix}_renderCapture2D(index, __pxlblz_show_motion_to_x, __pxlblz_show_motion_to_y)`
  if (settings.edgePolicy === 'hard') {
    const incomingPrimary = settings.motionVariant === 'cover'
      || settings.motionVariant === 'push'
      || settings.motionVariant === 'content-grow'
      || settings.motionVariant === 'zoom-in'
    return incomingPrimary
      ? `${prelude}
if (__pxlblz_show_motion_to_inside) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  ${from.prefix}_emit()
}`
      : `${prelude}
if (__pxlblz_show_motion_from_inside) {
  ${fromRender}
  ${from.prefix}_emit()
} else {
  ${toRender}
  ${to.prefix}_emit()
}`
  }
  const clearFrom = fromMoves && settings.addressPolicy === 'clip'
    ? `\nif (!__pxlblz_show_motion_from_inside) ${from.prefix}_clear()`
    : ''
  const clearTo = toMoves && settings.addressPolicy === 'clip'
    ? `\nif (!__pxlblz_show_motion_to_inside) ${to.prefix}_clear()`
    : ''
  return `${prelude}
${fromRender}${clearFrom}
var r0 = ${from.prefix}_r
var g0 = ${from.prefix}_g
var b0 = ${from.prefix}_b
${toRender}${clearTo}
rgb(
  r0 * (1 - __pxlblz_show_mix) + ${to.prefix}_r * __pxlblz_show_mix,
  g0 * (1 - __pxlblz_show_mix) + ${to.prefix}_g * __pxlblz_show_mix,
  b0 * (1 - __pxlblz_show_mix) + ${to.prefix}_b * __pxlblz_show_mix
)`
}

function showWipePositionExpression(
  transition: Pick<ShowRouteTransitionRecipe, 'direction' | 'wipeVariant' | 'wipeMode' | 'orientation' | 'count' | 'centerX' | 'centerY' | 'phase' | 'clockwise'>,
  outputDimension: ShowOutputDimension,
): string {
  return showWipeMaskPositionExpression(transition, outputDimension)
}

function emitFadeThroughColorRenderBlock(
  from: CompiledMember,
  to: CompiledMember,
  transition: Pick<ShowRouteTransitionRecipe, 'color'>,
  outputDimension: ShowOutputDimension,
): string {
  const [red, green, blue] = showTransitionColorToRgb(normalizeShowTransitionColor(transition.color))
  const fromRender = memberRenderCapture(from, outputDimension)
  const toRender = memberRenderCapture(to, outputDimension)
  return `if (__pxlblz_show_mix < 0.5) {
  ${fromRender}
  var __pxlblz_show_color_mix = __pxlblz_show_mix * 2
  rgb(
    ${from.prefix}_r * (1 - __pxlblz_show_color_mix) + ${red} * __pxlblz_show_color_mix,
    ${from.prefix}_g * (1 - __pxlblz_show_color_mix) + ${green} * __pxlblz_show_color_mix,
    ${from.prefix}_b * (1 - __pxlblz_show_color_mix) + ${blue} * __pxlblz_show_color_mix
  )
} else {
  ${toRender}
  var __pxlblz_show_color_mix = __pxlblz_show_mix * 2 - 1
  rgb(
    ${red} * (1 - __pxlblz_show_color_mix) + ${to.prefix}_r * __pxlblz_show_color_mix,
    ${green} * (1 - __pxlblz_show_color_mix) + ${to.prefix}_g * __pxlblz_show_color_mix,
    ${blue} * (1 - __pxlblz_show_color_mix) + ${to.prefix}_b * __pxlblz_show_color_mix
  )
}`
}

function memberRenderCapture(member: CompiledMember, outputDimension: 1 | 2): string {
  return outputDimension === 2
    ? `${member.prefix}_renderCapture2D(index, x, y)`
    : `${member.prefix}_renderCapture(index)`
}

function emitPortalRenderBlock(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowSceneSequenceTransitionRecipe,
): string {
  const centerX = clampNumber(transition.centerX ?? 0.5, 0, 1)
  const centerY = clampNumber(transition.centerY ?? 0.5, 0, 1)
  const feather = clampNumber(transition.feather ?? 0, 0, 1)
  const supportedShapes: ShowSpatialShape[] = [
    'circle', 'ellipse', 'box', 'rounded-box', 'diamond', 'cross', 'ring',
    'heart', 'star', 'crescent', 'polygon', 'cat-head', 'cat-side-profile', 'bastet',
  ]
  const shape = supportedShapes.includes(transition.shape as ShowSpatialShape)
    ? transition.shape as ShowSpatialShape
    : 'circle'
  const scale = clampNumber(transition.scale ?? 1, 0.25, 2)
  const rotation = clampNumber(transition.rotation ?? 0, -1, 1)
  const spin = clampNumber(transition.spin ?? 0, -4, 4)
  const ringWidth = clampNumber(transition.ringWidth ?? 0.12, 0.02, 1)
  const aspect = clampNumber(transition.aspect ?? 1, 0.25, 4)
  const cornerRadius = clampNumber(transition.cornerRadius ?? 0.3, 0, 1)
  const crossWidth = clampNumber(transition.crossWidth ?? 0.32, 0.1, 0.9)
  const starPoints = Math.round(clampNumber(transition.starPoints ?? 5, 3, 12))
  const starInner = clampNumber(transition.starInner ?? 0.45, 0.2, 0.8)
  const crescentOffset = clampNumber(transition.crescentOffset ?? 0.45, 0.15, 0.8)
  const polygonSides = Math.round(clampNumber(transition.polygonSides ?? 6, 3, 8))
  const revealMode = normalizeShowRevealMode(transition.revealMode, transition.invert)
  const edgePolicy = resolvePortalEdgePolicy(transition)
  const maxRadius = Math.max(
    Math.hypot(centerX, centerY),
    Math.hypot(1 - centerX, centerY),
    Math.hypot(centerX, 1 - centerY),
    Math.hypot(1 - centerX, 1 - centerY),
  )
  const shapeRadius = shape === 'diamond'
    ? maxRadius * Math.SQRT2
    : shape === 'box'
      ? showShapeRevealMaxDistance({ centerX, centerY, shape, aspect, rotation })
      : shape === 'circle' || shape === 'ring'
        ? maxRadius
        : showShapeRevealMaxDistance({
            centerX, centerY, shape, aspect, rotation,
            cornerRadius, crossWidth, starPoints, starInner, polygonSides,
          })
  const radiusScale = transition.scale === undefined ? '' : ` * ${scale}`
  const radius = revealMode === 'shrink-outgoing'
    ? `${shapeRadius} * (1 - __pxlblz_show_mix)${radiusScale}`
    : `${shapeRadius} * __pxlblz_show_mix${radiusScale}`
  const rotatedPrelude = `var __pxlblz_show_portal_dx = x - ${centerX}
var __pxlblz_show_portal_dy = y - ${centerY}
var __pxlblz_show_portal_angle = (${rotation} + ${shape === 'diamond' ? spin : 0} * __pxlblz_show_mix) * 6.283185307179586
var __pxlblz_show_portal_cos = cos(__pxlblz_show_portal_angle)
var __pxlblz_show_portal_sin = sin(__pxlblz_show_portal_angle)
var __pxlblz_show_portal_rx = __pxlblz_show_portal_dx * __pxlblz_show_portal_cos + __pxlblz_show_portal_dy * __pxlblz_show_portal_sin
var __pxlblz_show_portal_ry = -__pxlblz_show_portal_dx * __pxlblz_show_portal_sin + __pxlblz_show_portal_dy * __pxlblz_show_portal_cos`
  const rootAspect = Math.sqrt(aspect)
  const catalogueMetric = portalCatalogueMetricExpression({
    shape, cornerRadius, crossWidth, starPoints, starInner, polygonSides,
  })
  const distancePrelude = shape === 'diamond'
    ? `var __pxlblz_show_portal_dx = x - ${centerX}
var __pxlblz_show_portal_dy = y - ${centerY}
var __pxlblz_show_portal_angle = (${rotation} + ${spin} * __pxlblz_show_mix) * 6.283185307179586
var __pxlblz_show_portal_cos = cos(__pxlblz_show_portal_angle)
var __pxlblz_show_portal_sin = sin(__pxlblz_show_portal_angle)
var __pxlblz_show_portal_rx = __pxlblz_show_portal_dx * __pxlblz_show_portal_cos + __pxlblz_show_portal_dy * __pxlblz_show_portal_sin
var __pxlblz_show_portal_ry = -__pxlblz_show_portal_dx * __pxlblz_show_portal_sin + __pxlblz_show_portal_dy * __pxlblz_show_portal_cos
var __pxlblz_show_portal_distance = abs(__pxlblz_show_portal_rx) + abs(__pxlblz_show_portal_ry)`
    : shape === 'box'
      ? `${rotatedPrelude}
var __pxlblz_show_portal_distance = max(abs(__pxlblz_show_portal_rx) / ${Math.sqrt(aspect)}, abs(__pxlblz_show_portal_ry) * ${Math.sqrt(aspect)})`
    : shape === 'circle' || shape === 'ring'
      ? `var __pxlblz_show_portal_distance = hypot(x - ${centerX}, y - ${centerY})`
      : `${rotatedPrelude}
var __pxlblz_show_portal_sx = __pxlblz_show_portal_rx / ${rootAspect}
var __pxlblz_show_portal_sy = __pxlblz_show_portal_ry * ${rootAspect}
${catalogueMetric.prelude ? `${catalogueMetric.prelude}\n` : ''}var __pxlblz_show_portal_distance = ${catalogueMetric.expression}`
  const crescentSigned = `max(
  hypot(__pxlblz_show_portal_sx, __pxlblz_show_portal_sy) - __pxlblz_show_portal_radius,
  __pxlblz_show_portal_radius * 0.78 - hypot(__pxlblz_show_portal_sx - ${crescentOffset} * __pxlblz_show_portal_radius, __pxlblz_show_portal_sy)
)`
  const signedDistance = shape === 'ring'
    ? `abs(__pxlblz_show_portal_distance - __pxlblz_show_portal_radius) - ${ringWidth / 2}`
    : shape === 'crescent'
      ? revealMode === 'shrink-outgoing' ? `-(${crescentSigned})` : crescentSigned
    : revealMode === 'shrink-outgoing'
      ? '__pxlblz_show_portal_radius - __pxlblz_show_portal_distance'
      : '__pxlblz_show_portal_distance - __pxlblz_show_portal_radius'
  const fromRender = `${from.prefix}_renderCapture2D(index, x, y)`
  const toRender = `${to.prefix}_renderCapture2D(index, x, y)`
  let transitionBody: string

  if (feather <= 0 || edgePolicy === 'hard') {
    transitionBody = `if (__pxlblz_show_portal_signed <= 0) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  ${from.prefix}_emit()
}`
  } else if (edgePolicy === 'blend') {
    transitionBody = `var __pxlblz_show_portal_mix = clamp(0.5 - __pxlblz_show_portal_signed / ${feather}, 0, 1)
if (__pxlblz_show_portal_mix <= 0) {
  ${fromRender}
  ${from.prefix}_emit()
} else if (__pxlblz_show_portal_mix >= 1) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  var r0 = ${from.prefix}_r
  var g0 = ${from.prefix}_g
  var b0 = ${from.prefix}_b
  ${toRender}
  rgb(
    r0 * (1 - __pxlblz_show_portal_mix) + ${to.prefix}_r * __pxlblz_show_portal_mix,
    g0 * (1 - __pxlblz_show_portal_mix) + ${to.prefix}_g * __pxlblz_show_portal_mix,
    b0 * (1 - __pxlblz_show_portal_mix) + ${to.prefix}_b * __pxlblz_show_portal_mix
  )
}`
  } else {
    transitionBody = `var __pxlblz_show_portal_mix = clamp(0.5 - __pxlblz_show_portal_signed / ${feather}, 0, 1)
if (__pxlblz_show_portal_mix >= 1 || (__pxlblz_show_portal_mix > 0 && __pxlblz_show_hash01(index) < __pxlblz_show_portal_mix)) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  ${from.prefix}_emit()
}`
  }

  return `${distancePrelude}
var __pxlblz_show_portal_radius = ${radius}
var __pxlblz_show_portal_signed = ${signedDistance}
${transitionBody}`
}

function portalCatalogueMetricExpression(input: {
  shape: ShowSpatialShape
  cornerRadius: number
  crossWidth: number
  starPoints: number
  starInner: number
  polygonSides: number
}): { prelude: string; expression: string } {
  const x = '__pxlblz_show_portal_sx'
  const y = '__pxlblz_show_portal_sy'
  const radial = `hypot(${x}, ${y})`
  const box = `max(abs(${x}), abs(${y}))`
  if (input.shape === 'ellipse' || input.shape === 'crescent') return { prelude: '', expression: radial }
  if (input.shape === 'rounded-box') {
    return {
      prelude: '',
      expression: `${box} * ${1 - input.cornerRadius} + ${radial} * ${input.cornerRadius}`,
    }
  }
  if (input.shape === 'cross') {
    return {
      prelude: '',
      expression: `min(max(abs(${x}), abs(${y}) / ${input.crossWidth}), max(abs(${x}) / ${input.crossWidth}, abs(${y})))`,
    }
  }
  const angle = '__pxlblz_show_portal_shape_angle'
  const prelude = `var ${angle} = atan2(${y}, ${x})`
  if (input.shape === 'polygon') {
    const sector = Math.PI * 2 / input.polygonSides
    const local = `(frac((${angle} + ${sector / 2}) / ${sector}) * ${sector} - ${sector / 2})`
    return {
      prelude,
      expression: `${radial} * cos(${local}) / ${Math.cos(Math.PI / input.polygonSides)}`,
    }
  }
  if (input.shape === 'star') {
    const phase = `frac(${angle} / ${Math.PI * 2} * ${input.starPoints})`
    const spike = `1 - 2 * abs(${phase} - 0.5)`
    return {
      prelude,
      expression: `${radial} / (${input.starInner} + ${1 - input.starInner} * (${spike}))`,
    }
  }
  if (input.shape === 'heart') {
    return {
      prelude,
      expression: `${radial} / max(0.25, 0.75 + 0.2 * sin(${angle}) - 0.15 * cos(${angle} * 2))`,
    }
  }
  if (input.shape === 'cat-head') {
    const ears = `${angularBumpExpression(angle, -2.2, 0.38)} + ${angularBumpExpression(angle, -0.94, 0.38)}`
    return { prelude, expression: `${radial} / (0.72 + 0.42 * (${ears}))` }
  }
  if (input.shape === 'cat-side-profile') {
    return {
      prelude,
      expression: `${radial} / (0.62 + 0.3 * ${angularBumpExpression(angle, -0.2, 0.65)} + 0.38 * ${angularBumpExpression(angle, -2.75, 0.42)} + 0.22 * ${angularBumpExpression(angle, 1.35, 0.34)})`,
    }
  }
  const ears = `${angularBumpExpression(angle, -1.96, 0.3)} + ${angularBumpExpression(angle, -1.18, 0.3)}`
  return {
    prelude,
    expression: `${radial} / (0.55 + 0.34 * (${ears}) + 0.38 * ${angularBumpExpression(angle, Math.PI / 2, 0.68)})`,
  }
}

function angularBumpExpression(angle: string, target: number, width: number): string {
  const tau = Math.PI * 2
  return `max(0, 1 - abs(frac((${angle} - ${target} + ${Math.PI}) / ${tau}) * ${tau} - ${Math.PI}) / ${width})`
}

function resolvePortalEdgePolicy(
  transition: Pick<ShowRouteTransitionRecipe, 'edgePolicy' | 'featherPolicy'>,
): ShowTransitionEdgePolicy {
  if (transition.edgePolicy === 'hard' || transition.edgePolicy === 'dither' || transition.edgePolicy === 'blend') {
    return transition.edgePolicy
  }
  return transition.featherPolicy === 'blend' ? 'blend' : 'dither'
}

function indentBlock(block: string, spaces: number): string {
  const indent = ' '.repeat(spaces)
  return block.split('\n').map((line) => `${indent}${line}`).join('\n')
}

function buildRoutePlan(
  members: CompiledMember[],
  recipe: ShowRecipe,
): { routes: ResolvedRoute[]; warnings: string[] } | null {
  if (!recipe.clips.some((clip) => routeTargets(clip).length > 0)) return null

  const zones = normalizeControllerZones(recipe.zones ?? [])
  const warnings: string[] = []
  const routes: ResolvedRoute[] = []
  for (const [index, clip] of recipe.clips.entries()) {
    const targets = routeTargets(clip)
    if (targets.length === 0) continue
    const resolvedZones = targets
      .map((target) => {
        const zone = findControllerZoneByName(zones, target)
        if (!zone) warnings.push(`Clip "${clip.id}" references missing zone "${target}".`)
        return zone
      })
      .filter((zone): zone is ControllerZone => Boolean(zone))
    if (resolvedZones.length === 0) {
      continue
    }
    const routeZones = clip.zoneMode === 'repeat'
      ? resolvedZones
      : [clip.zoneMode === 'span' ? mergeRouteZones(clip.id, resolvedZones) : resolvedZones[0]]
    for (const zone of routeZones) {
      routes.push({
        member: members[index],
        zone,
        pixelCount: controllerZonePixelCount(zone),
      })
    }
  }
  return { routes, warnings }
}

function buildRoutingLayoutPlans(
  members: CompiledMember[],
  recipe: ShowRecipe,
): ResolvedRoutingLayout[] | null {
  if (!recipe.routingLayouts) return null
  const physicalPixelCount = recipe.masterPixelCount ?? (recipe.zones ?? []).reduce((largest, zone) => (
    Math.max(largest, ...zone.ranges.map((range) => range.end + 1))
  ), 0)
  return recipe.routingLayouts.map((layout) => {
    const plan = buildRoutePlan(members, { ...recipe, zones: layout.zones, routingLayouts: undefined })
    const routes = plan?.routes ?? []
    return {
      id: layout.id,
      name: layout.name,
      routes,
      logical: layout.logical,
      warnings: [
        ...(plan?.warnings ?? []),
        ...routingLayoutOverlapWarnings(layout.name, routes),
        ...routingLayoutGapWarnings(layout.name, routes, layout.logical ? 0 : physicalPixelCount),
      ],
    }
  })
}

function routingLayoutGapWarnings(name: string, routes: ResolvedRoute[], physicalPixelCount: number): string[] {
  if (physicalPixelCount <= 0) return []
  const assigned = new Set<number>()
  for (const route of routes) {
    for (const range of route.zone.ranges) {
      for (let index = Math.max(0, range.start); index <= Math.min(physicalPixelCount - 1, range.end); index += 1) {
        assigned.add(index)
      }
    }
  }
  const missing = physicalPixelCount - assigned.size
  return missing > 0
    ? [`Routing layout "${name}" leaves ${missing} of ${physicalPixelCount} physical pixels unassigned; those pixels render black.`]
    : []
}

function routingLayoutOverlapWarnings(name: string, routes: ResolvedRoute[]): string[] {
  const warnings: string[] = []
  for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
      const left = routes[leftIndex]
      const right = routes[rightIndex]
      const overlaps = left.zone.ranges.some((leftRange) => right.zone.ranges.some((rightRange) => (
        leftRange.start <= rightRange.end && rightRange.start <= leftRange.end
      )))
      if (overlaps) {
        warnings.push(
          `Routing layout "${name}" assigns overlapping pixels to clips "${left.member.id}" and "${right.member.id}"; the first route wins.`,
        )
      }
    }
  }
  return warnings
}

function mergeRouteZones(id: string, zones: ControllerZone[]): ControllerZone {
  return {
    id: `${id}:span`,
    name: zones.map((zone) => zone.name).join('+'),
    ranges: zones.flatMap((zone) => zone.ranges.map((range) => ({ start: range.start, end: range.end }))),
  }
}

function emitRouteShowCode(members: CompiledMember[], routes: ResolvedRoute[], outputDimension: 1 | 2): string {
  return [
    emitRuntimePrelude(members),
    ...members.map(member => member.code.trim()),
    emitRouteScheduler(routes),
    emitRouteRender(routes, outputDimension),
    '',
  ].join('\n\n')
}

function emitRoutingLayoutShowCode(
  members: CompiledMember[],
  layouts: ResolvedRoutingLayout[],
  switches: ShowRoutingSwitchRecipe[],
  loopDurationMs: number,
  outputDimension: 1 | 2,
  representation: 'range-branches' | 'packed-pixels' | 'generated-formula' | 'coordinate-predicates',
  formula?: GeneratedRoutingFormula,
  propertyRamps?: ShowRoutingPropertyRampsRecipe,
): string {
  const layoutIndex = new Map(layouts.map((layout, index) => [layout.id, index]))
  const orderedSwitches = [...switches].sort((a, b) => a.atMs - b.atMs)
  const hasProgressiveTransfer = orderedSwitches.some((routingSwitch) => (routingSwitch.durationMs ?? 0) > 0)
  const renderLayoutName = hasProgressiveTransfer
    ? '__pxlblz_show_route_render_layout'
    : '__pxlblz_show_route_layout'
  let previousLayoutIndex = 0
  const selectLines = orderedSwitches.map((routingSwitch) => {
    const destinationLayoutIndex = layoutIndex.get(routingSwitch.layoutId) ?? 0
    const durationMs = Math.max(0, routingSwitch.durationMs ?? 0)
    const sourceLayoutIndex = previousLayoutIndex
    previousLayoutIndex = destinationLayoutIndex
    if (durationMs === 0) {
      return `  if (__pxlblz_show_elapsed_ms >= ${routingSwitch.atMs}) __pxlblz_show_route_layout = ${destinationLayoutIndex}`
    }
    const progress = '__pxlblz_show_route_progress'
    return `  if (__pxlblz_show_elapsed_ms >= ${routingSwitch.atMs}) {
    __pxlblz_show_route_layout = ${destinationLayoutIndex}
    __pxlblz_show_route_from_layout = ${sourceLayoutIndex}
    __pxlblz_show_route_progress = 1
    if (__pxlblz_show_elapsed_ms < ${routingSwitch.atMs + durationMs}) {
      __pxlblz_show_route_progress = clamp((__pxlblz_show_elapsed_ms - ${routingSwitch.atMs}) / ${durationMs}, 0, 1)
      __pxlblz_show_route_progress = ${emitShowEasingExpression(routingSwitch.easing ?? 'linear', progress)}
      __pxlblz_show_route_reverse = ${routingSwitch.direction === 'reverse' ? 1 : 0}
    }
  }`
  })
  const countBlocks = layouts.map((layout, index) => {
    const counts = members.map((member) => {
      const logicalZoneCount = layout.logical?.zoneNames.length ?? 0
      const route = layout.routes.find((candidate) => candidate.member === member)
      const participates = layout.routes.some((candidate) => (
        candidate.member === member && layout.logical?.zoneNames.includes(candidate.zone.name)
      ))
      const count = layout.logical
        ? participates
          ? layout.logical.kind === 'split'
            ? layout.logical.zoneNames.indexOf(route?.zone.name ?? '') === 0
              ? 'max(1, floor(pixelCount * __pxlblz_show_route_split_position))'
              : 'max(1, pixelCount - floor(pixelCount * __pxlblz_show_route_split_position))'
            : logicalZoneCount === 1 ? 'pixelCount' : `max(1, floor(pixelCount / ${logicalZoneCount}))`
          : '0'
        : `${route?.pixelCount ?? 0}`
      return `    ${member.pixelCountName} = ${count}`
    })
    return `${index === 0 ? '  if' : '  else if'} (__pxlblz_show_route_layout == ${index}) {
${counts.join('\n')}
  }`
  })
  const advanceLines = members.map((member) => `  ${member.prefix}_advance(delta)`)
  const propertyAssignments = emitRoutingPropertyAssignments(propertyRamps)
  const renderBody = representation === 'packed-pixels'
    ? emitPackedRoutingRender(layouts, outputDimension, renderLayoutName)
    : representation === 'generated-formula' && formula
      ? emitFormulaRoutingRender(layouts, formula, outputDimension, renderLayoutName)
    : layouts.map((layout, index) => (
      `${index === 0 ? '  if' : '  else if'} (${renderLayoutName} == ${index}) {
${representation === 'coordinate-predicates'
    ? emitLogicalRoutingRender(layout, '    ', outputDimension)
    : emitRouteRenderBody(layout.routes, '    ', outputDimension)}
  }`
    )).join('\n')
  const packedPrelude = representation === 'packed-pixels'
    ? emitPackedRoutingTable(layouts)
    : ''
  const progressiveGlobals = hasProgressiveTransfer
    ? [
        `var __pxlblz_show_route_from_layout = 0`,
        `var __pxlblz_show_route_progress = 1`,
        `var __pxlblz_show_route_reverse = 0`,
      ]
    : []
  const progressiveReset = hasProgressiveTransfer
    ? `
  __pxlblz_show_route_from_layout = 0
  __pxlblz_show_route_progress = 1
  __pxlblz_show_route_reverse = 0`
    : ''
  const progressiveRender = hasProgressiveTransfer
    ? `  var __pxlblz_show_route_render_layout = __pxlblz_show_route_layout
  if (__pxlblz_show_route_progress < 1) {
    var __pxlblz_show_route_position = ${outputDimension === 2 ? 'clamp(x, 0, 1)' : 'index / max(1, pixelCount - 1)'}
    if (__pxlblz_show_route_reverse) __pxlblz_show_route_position = 1 - __pxlblz_show_route_position
    if (__pxlblz_show_route_position >= __pxlblz_show_route_progress) __pxlblz_show_route_render_layout = __pxlblz_show_route_from_layout
  }
`
    : ''
  return [
    emitRuntimePrelude(members),
    ...members.map((member) => member.code.trim()),
    packedPrelude,
    `var __pxlblz_show_route_layout = 0`,
    ...(propertyRamps ? [`var __pxlblz_show_route_split_position = ${clampNumber(propertyRamps.splitPosition.initial, 0, 1)}`] : []),
    ...progressiveGlobals,
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_ms = (__pxlblz_show_elapsed_ms + delta) % ${loopDurationMs}
  __pxlblz_show_route_layout = 0${progressiveReset}
${selectLines.join('\n')}
${propertyAssignments ? `${propertyAssignments}\n` : ''}${countBlocks.join('\n')}
${advanceLines.join('\n')}
}`,
    `export function ${outputDimension === 2 ? 'render2D(index, x, y)' : 'render(index)'} {
${progressiveRender}${renderBody}
  rgb(0, 0, 0)
}`,
    '',
  ].join('\n\n')
}

function emitRoutingPropertyAssignments(propertyRamps: ShowRoutingPropertyRampsRecipe | undefined): string {
  if (!propertyRamps) return ''
  const split = propertyRamps.splitPosition
  const lines = [`  __pxlblz_show_route_split_position = ${clampNumber(split.initial, 0, 1)}`]
  for (const ramp of split.ramps) {
    const from = clampNumber(ramp.from, 0, 1)
    const to = clampNumber(ramp.to, 0, 1)
    const durationMs = Math.max(0, ramp.durationMs)
    const progress = `clamp((__pxlblz_show_elapsed_ms - ${ramp.atMs}) / ${Math.max(1, durationMs)}, 0, 1)`
    const mix = emitShowEasingExpression(ramp.easing, progress)
    lines.push(`  if (__pxlblz_show_elapsed_ms >= ${ramp.atMs}) {
    __pxlblz_show_route_split_position = ${to}
    if (__pxlblz_show_elapsed_ms < ${ramp.atMs + durationMs}) __pxlblz_show_route_split_position = ${from} * (1 - ${mix}) + ${to} * ${mix}
  }`)
  }
  return lines.join('\n')
}

function emitLogicalRoutingRender(
  layout: ResolvedRoutingLayout,
  indent: string,
  outputDimension: 1 | 2,
): string {
  const logical = layout.logical
  if (!logical) return emitRouteRenderBody(layout.routes, indent, outputDimension)
  const setup = emitLogicalRoutingSetup(logical)
  const routeBlocks = logical.zoneNames.map((zoneName, zoneIndex) => {
    const route = layout.routes.find((candidate) => candidate.zone.name === zoneName)
    if (!route) return ''
    const render = outputDimension === 2
      ? `${route.member.prefix}_renderCapture2D(__pxlblz_show_route_local_index, __pxlblz_show_route_local_x, __pxlblz_show_route_local_y)`
      : `${route.member.prefix}_renderCapture(__pxlblz_show_route_local_index)`
    return `${zoneIndex === 0 ? 'if' : 'else if'} (__pxlblz_show_route_id == ${zoneIndex}) {
  var __pxlblz_show_route_side = ceil(sqrt(${route.member.pixelCountName}))
  var __pxlblz_show_route_local_index = min(${route.member.pixelCountName} - 1, floor(__pxlblz_show_route_local_y * __pxlblz_show_route_side) * __pxlblz_show_route_side + floor(__pxlblz_show_route_local_x * __pxlblz_show_route_side))
  ${render}
  ${route.member.prefix}_emit()
  return
}`
  }).filter(Boolean).join('\n')
  return `${setup}\n${routeBlocks}`.split('\n').map((line) => `${indent}${line}`).join('\n')
}

function emitLogicalRoutingSetup(logical: ShowLogicalRoutingRecipe): string {
  if (logical.kind === 'single') {
    return `var __pxlblz_show_route_id = 0
var __pxlblz_show_route_local_x = clamp(x, 0, 1)
var __pxlblz_show_route_local_y = clamp(y, 0, 1)`
  }
  if (logical.kind === 'grid') {
    return `var __pxlblz_show_route_column = min(${logical.columns - 1}, floor(clamp(x, 0, 1) * ${logical.columns}))
var __pxlblz_show_route_row = min(${logical.rows - 1}, floor(clamp(y, 0, 1) * ${logical.rows}))
var __pxlblz_show_route_id = __pxlblz_show_route_row * ${logical.columns} + __pxlblz_show_route_column
var __pxlblz_show_route_local_x = clamp(x * ${logical.columns} - __pxlblz_show_route_column, 0, 1)
var __pxlblz_show_route_local_y = clamp(y * ${logical.rows} - __pxlblz_show_route_row, 0, 1)`
  }
  if (logical.kind === 'stripes') {
    const coordinate = logical.axis === 'x' ? 'x' : 'y'
    const count = logical.zoneNames.length
    return `var __pxlblz_show_route_id = min(${count - 1}, floor(clamp(${coordinate}, 0, 1) * ${count}))
var __pxlblz_show_route_stripe_local = clamp(${coordinate} * ${count} - __pxlblz_show_route_id, 0, 1)
var __pxlblz_show_route_local_x = ${logical.axis === 'x' ? '__pxlblz_show_route_stripe_local' : 'clamp(x, 0, 1)'}
var __pxlblz_show_route_local_y = ${logical.axis === 'y' ? '__pxlblz_show_route_stripe_local' : 'clamp(y, 0, 1)'}`
  }
  if (logical.kind === 'split') {
    const coordinate = logical.axis === 'x' ? 'clamp(x, 0, 1)' : 'clamp(y, 0, 1)'
    return `var __pxlblz_show_route_split_coordinate = ${coordinate}
var __pxlblz_show_route_id = 1
var __pxlblz_show_route_split_local = (__pxlblz_show_route_split_coordinate - __pxlblz_show_route_split_position) / max(0.000001, 1 - __pxlblz_show_route_split_position)
if (__pxlblz_show_route_split_position >= 1 || (__pxlblz_show_route_split_position > 0 && __pxlblz_show_route_split_coordinate < __pxlblz_show_route_split_position)) {
  __pxlblz_show_route_id = 0
  __pxlblz_show_route_split_local = __pxlblz_show_route_split_coordinate / max(0.000001, __pxlblz_show_route_split_position)
}
var __pxlblz_show_route_local_x = ${logical.axis === 'x' ? 'clamp(__pxlblz_show_route_split_local, 0, 1)' : 'clamp(x, 0, 1)'}
var __pxlblz_show_route_local_y = ${logical.axis === 'y' ? 'clamp(__pxlblz_show_route_split_local, 0, 1)' : 'clamp(y, 0, 1)'}`
  }
  const count = logical.zoneNames.length
  return `var __pxlblz_show_route_dx = clamp(x, 0, 1) - 0.5
var __pxlblz_show_route_dy = clamp(y, 0, 1) - 0.5
var __pxlblz_show_route_radius = hypot(__pxlblz_show_route_dx, __pxlblz_show_route_dy)
var __pxlblz_show_route_turn = frac((atan2(__pxlblz_show_route_dy, __pxlblz_show_route_dx) + __pxlblz_show_route_radius * ${logical.twist}) / 6.283185307179586 + 1)
var __pxlblz_show_route_id = min(${count - 1}, floor(__pxlblz_show_route_turn * ${count}))
var __pxlblz_show_route_local_x = clamp(__pxlblz_show_route_turn * ${count} - __pxlblz_show_route_id, 0, 1)
var __pxlblz_show_route_local_y = clamp(__pxlblz_show_route_radius / 0.7071067811865476, 0, 1)`
}

function routingPixelCount(layouts: ResolvedRoutingLayout[]): number {
  return layouts.reduce((largest, layout) => layout.routes.reduce((layoutLargest, route) => (
    Math.max(layoutLargest, ...route.zone.ranges.map((range) => range.end + 1))
  ), largest), 0)
}

function emitPackedRoutingTable(layouts: ResolvedRoutingLayout[]): string {
  const pixelCount = routingPixelCount(layouts)
  const stride = pixelCount + 1
  const values = layouts.flatMap((layout) => {
    const layoutValues = Array.from({ length: pixelCount }, () => 0)
    layout.routes.forEach((route, routeIndex) => {
      let localOffset = 0
      for (const range of route.zone.ranges) {
        for (let index = range.start; index <= range.end; index += 1) {
          if (layoutValues[index] === 0) {
            layoutValues[index] = routeIndex * stride + localOffset + index - range.start + 1
          }
        }
        localOffset += range.end - range.start + 1
      }
    })
    return layoutValues
  })
  return [
    `var __pxlblz_show_route_pixels = array(${values.length})`,
    ...values.map((value, index) => `__pxlblz_show_route_pixels[${index}] = ${value}`),
  ].join('\n')
}

function emitPackedRoutingRender(
  layouts: ResolvedRoutingLayout[],
  outputDimension: 1 | 2,
  renderLayoutName: string,
): string {
  const pixelCount = routingPixelCount(layouts)
  const stride = pixelCount + 1
  const layoutsBody = layouts.map((layout, layoutIndex) => {
    const routeBody = layout.routes.map((route, routeIndex) => (
      emitPackedRouteBlock(route, routeIndex, outputDimension)
    )).join('\n')
    return `${layoutIndex === 0 ? '    if' : '    else if'} (${renderLayoutName} == ${layoutIndex}) {
${routeBody}
    }`
  }).join('\n')
  return `  if (index < ${pixelCount}) {
    var __pxlblz_show_route_packed = __pxlblz_show_route_pixels[${renderLayoutName} * ${pixelCount} + index]
    if (__pxlblz_show_route_packed > 0) {
      __pxlblz_show_route_packed = __pxlblz_show_route_packed - 1
      var __pxlblz_show_route_id = floor(__pxlblz_show_route_packed / ${stride})
      var __pxlblz_show_route_local = __pxlblz_show_route_packed - __pxlblz_show_route_id * ${stride}
${layoutsBody}
    }
  }`
}

function emitFormulaRoutingRender(
  layouts: ResolvedRoutingLayout[],
  formula: GeneratedRoutingFormula,
  outputDimension: 1 | 2,
  renderLayoutName: string,
): string {
  const shiftLines = formula.layoutShifts.slice(1).map((shift, layoutIndex) => (
    `    if (${renderLayoutName} == ${layoutIndex + 1}) __pxlblz_show_route_shift = ${shift}`
  ))
  const formulaLines = formula.kind === 'contiguous'
    ? [
        `    var __pxlblz_show_route_id = (floor(index / ${formula.blockSize}) + __pxlblz_show_route_shift) % ${formula.routeCount}`,
        `    var __pxlblz_show_route_local = index % ${formula.blockSize}`,
      ]
    : formula.kind === 'row-bands'
      ? [
          `    var __pxlblz_show_route_row = floor(index / ${formula.rowWidth})`,
          `    var __pxlblz_show_route_id = (__pxlblz_show_route_row + __pxlblz_show_route_shift) % ${formula.routeCount}`,
          `    var __pxlblz_show_route_local = floor(__pxlblz_show_route_row / ${formula.routeCount}) * ${formula.rowWidth} + index % ${formula.rowWidth}`,
        ]
      : [
          `    var __pxlblz_show_route_id = (index + __pxlblz_show_route_shift) % ${formula.routeCount}`,
          `    var __pxlblz_show_route_local = floor(index / ${formula.routeCount})`,
        ]
  const routeBody = layouts[0].routes.map((route, routeIndex) => (
    emitPackedRouteBlock(route, routeIndex, outputDimension)
  )).join('\n')
  return [
    `  if (index < ${formula.pixelCount}) {`,
    `    var __pxlblz_show_route_shift = ${formula.layoutShifts[0] ?? 0}`,
    ...shiftLines,
    ...formulaLines,
    routeBody,
    `  }`,
  ].join('\n')
}

function emitPackedRouteBlock(route: ResolvedRoute, routeIndex: number, outputDimension: 1 | 2): string {
  const width = Math.max(1, Math.ceil(Math.sqrt(route.pixelCount)))
  const height = Math.max(1, Math.ceil(route.pixelCount / width))
  const render = outputDimension === 2
    ? [
        `        var ${route.member.prefix}_zoneLocalX = ${width === 1 ? '0.5' : `(__pxlblz_show_route_local % ${width}) / ${width - 1}`}`,
        `        var ${route.member.prefix}_zoneLocalY = ${height === 1 ? '0.5' : `floor(__pxlblz_show_route_local / ${width}) / ${height - 1}`}`,
        `        ${route.member.prefix}_renderCapture2D(__pxlblz_show_route_local, ${route.member.prefix}_zoneLocalX, ${route.member.prefix}_zoneLocalY)`,
      ]
    : [`        ${route.member.prefix}_renderCapture(__pxlblz_show_route_local)`]
  return [
    `      ${routeIndex === 0 ? 'if' : 'else if'} (__pxlblz_show_route_id == ${routeIndex}) {`,
    `        ${route.member.pixelCountName} = ${route.pixelCount}`,
    ...render,
    `        ${route.member.prefix}_emit()`,
    `        return`,
    `      }`,
  ].join('\n')
}

function emitSampleRemappingRuntime(propertyRamps: ShowSamplePropertyRampsRecipe | undefined): string {
  if (!propertyRamps) return ''
  const repeatScale = propertyRamps.repeatScale
  const assignments = [
    `  __pxlblz_show_sample_repeat_scale = ${clampNumber(repeatScale.initial, 1, 8)}`,
    ...repeatScale.ramps.map((ramp) => {
      const from = clampNumber(ramp.from, 1, 8)
      const to = clampNumber(ramp.to, 1, 8)
      const durationMs = Math.max(0, ramp.durationMs)
      const progress = `clamp((__pxlblz_show_elapsed_ms - ${ramp.atMs}) / ${Math.max(1, durationMs)}, 0, 1)`
      const mix = emitShowEasingExpression(ramp.easing, progress)
      return `  if (__pxlblz_show_elapsed_ms >= ${ramp.atMs}) {
    __pxlblz_show_sample_repeat_scale = ${to}
    if (__pxlblz_show_elapsed_ms < ${ramp.atMs + durationMs}) __pxlblz_show_sample_repeat_scale = ${from} * (1 - ${mix}) + ${to} * ${mix}
  }`
    }),
  ]
  return `var __pxlblz_show_sample_repeat_scale = ${clampNumber(repeatScale.initial, 1, 8)}
function __pxlblz_show_update_sample_remap() {
${assignments.join('\n')}
}`
}

function injectSampleRemappingUpdate(code: string): string {
  const functionStart = code.indexOf('export function beforeRender(delta) {')
  const assignmentStart = code.indexOf('__pxlblz_show_elapsed_ms =', functionStart)
  const lineEnd = code.indexOf('\n', assignmentStart)
  if (functionStart < 0 || assignmentStart < 0 || lineEnd < 0) {
    throw new Error('Show coordinate remapping requires an outer beforeRender scheduler.')
  }
  return `${code.slice(0, lineEnd + 1)}  __pxlblz_show_update_sample_remap()\n${code.slice(lineEnd + 1)}`
}

function showOutputDimensionForMembers(members: CompiledMember[]): ShowOutputDimension {
  return members.some((member) => member.hasRender2D) ? 2 : 1
}

function emitSelectedMemberRendererCall(
  member: CompiledMember,
  outputDimension: ShowOutputDimension,
  args: { index: string; x?: string; y?: string },
): string {
  const compatibility = selectRenderCompatibility(outputDimension, {
    hasBeforeRender: member.hasBeforeRender,
    hasRender: member.hasRender,
    hasRender2D: member.hasRender2D,
    hasRender3D: member.hasRender3D,
  })
  const x = args.x ?? `${args.index} / max(1, ${member.pixelCountName} - 1)`
  const y = args.y ?? '0.5'
  const call = compatibility.renderer === 'render3D'
    ? `${member.render3DName}(${args.index}, ${x}, ${y}, 0.5)`
    : compatibility.renderer === 'render2D'
      ? `${member.render2DName}(${args.index}, ${x}, ${y})`
      : compatibility.renderer === 'render'
        ? `${member.renderName}(${args.index})`
        : ''
  if (!call) return ''
  return member.adaptation.lightShutter
    ? `if (${member.prefix}_shutter_open >= 0.5) ${call}`
    : call
}

function describeMemberEffectRuntime(member: CompiledMember): {
  declarations: string[]
  hasAffine: boolean
  wrap: boolean
  opacity: number
} | null {
  if (showEffectsAreIdentity(member.effects) && !member.animatedEffects) return null
  const matrix = buildShowEffectSampleMatrix(member.effects)
  const opacity = applyShowEffectsToSample(member.effects, 0.5, 0.5).opacity
  const hasAffine = member.effects.some((effect) => (
    effect.kind === 'translate' || effect.kind === 'rotate' || effect.kind === 'scale' || effect.kind === 'shear'
  ))
  const wrap = member.effects.some((effect) => effect.kind === 'wrap') && hasAffine
  const parameterDeclarations = member.effects.flatMap((effect) => showEffectParameterNames(effect).map((parameter) => (
    `var ${effectParameterVariable(member, effect.id, parameter)} = ${effectParameterValue(effect, parameter)}`
  )))
  const operationAssignments = member.effects.flatMap((effect, index) => {
    if (effect.kind === 'wrap' || isShowColorEffect(effect)) return []
    const suffix = `${member.prefix}_fx_o${index}`
    const operation = effect.kind === 'translate'
      ? `  var ${suffix}_a = 1
  var ${suffix}_b = 0
  var ${suffix}_c = 0
  var ${suffix}_d = 1
  var ${suffix}_tx = ${effectParameterVariable(member, effect.id, 'x')}
  var ${suffix}_ty = ${effectParameterVariable(member, effect.id, 'y')}`
      : effect.kind === 'rotate'
        ? `  var ${suffix}_cos = cos(${effectParameterVariable(member, effect.id, 'turns')} * PI * 2)
  var ${suffix}_sin = sin(${effectParameterVariable(member, effect.id, 'turns')} * PI * 2)
  var ${suffix}_a = ${suffix}_cos
  var ${suffix}_b = ${suffix}_sin
  var ${suffix}_c = -${suffix}_sin
  var ${suffix}_d = ${suffix}_cos
  var ${suffix}_tx = 0.5 - ${suffix}_a * 0.5 - ${suffix}_c * 0.5
  var ${suffix}_ty = 0.5 - ${suffix}_b * 0.5 - ${suffix}_d * 0.5`
        : effect.kind === 'scale'
          ? `  var ${suffix}_a = ${effectParameterVariable(member, effect.id, 'x')}
  var ${suffix}_b = 0
  var ${suffix}_c = 0
  var ${suffix}_d = ${effectParameterVariable(member, effect.id, 'y')}
  var ${suffix}_tx = 0.5 - ${suffix}_a * 0.5
  var ${suffix}_ty = 0.5 - ${suffix}_d * 0.5`
          : `  var ${suffix}_a = 1
  var ${suffix}_b = ${effectParameterVariable(member, effect.id, 'y')}
  var ${suffix}_c = ${effectParameterVariable(member, effect.id, 'x')}
  var ${suffix}_d = 1
  var ${suffix}_tx = 0.5 - ${suffix}_a * 0.5 - ${suffix}_c * 0.5
  var ${suffix}_ty = 0.5 - ${suffix}_b * 0.5 - ${suffix}_d * 0.5`
    return [`${operation}
  var ${suffix}_next_a = ${suffix}_a * ${member.prefix}_fx_ma + ${suffix}_c * ${member.prefix}_fx_mb
  var ${suffix}_next_b = ${suffix}_b * ${member.prefix}_fx_ma + ${suffix}_d * ${member.prefix}_fx_mb
  var ${suffix}_next_c = ${suffix}_a * ${member.prefix}_fx_mc + ${suffix}_c * ${member.prefix}_fx_md
  var ${suffix}_next_d = ${suffix}_b * ${member.prefix}_fx_mc + ${suffix}_d * ${member.prefix}_fx_md
  var ${suffix}_next_tx = ${suffix}_a * ${member.prefix}_fx_mtx + ${suffix}_c * ${member.prefix}_fx_mty + ${suffix}_tx
  var ${suffix}_next_ty = ${suffix}_b * ${member.prefix}_fx_mtx + ${suffix}_d * ${member.prefix}_fx_mty + ${suffix}_ty
  ${member.prefix}_fx_ma = ${suffix}_next_a
  ${member.prefix}_fx_mb = ${suffix}_next_b
  ${member.prefix}_fx_mc = ${suffix}_next_c
  ${member.prefix}_fx_md = ${suffix}_next_d
  ${member.prefix}_fx_mtx = ${suffix}_next_tx
  ${member.prefix}_fx_mty = ${suffix}_next_ty`]
  })
  const updateFunction = `function ${member.prefix}_fx_update() {
  ${member.prefix}_fx_ma = 1
  ${member.prefix}_fx_mb = 0
  ${member.prefix}_fx_mc = 0
  ${member.prefix}_fx_md = 1
  ${member.prefix}_fx_mtx = 0
  ${member.prefix}_fx_mty = 0
${operationAssignments.join('\n')}
  var ${member.prefix}_fx_det = ${member.prefix}_fx_ma * ${member.prefix}_fx_md - ${member.prefix}_fx_mb * ${member.prefix}_fx_mc
  if (abs(${member.prefix}_fx_det) < 0.000001) ${member.prefix}_fx_det = ${member.prefix}_fx_det < 0 ? -0.000001 : 0.000001
  ${member.prefix}_fx_a = ${member.prefix}_fx_md / ${member.prefix}_fx_det
  ${member.prefix}_fx_b = -${member.prefix}_fx_mb / ${member.prefix}_fx_det
  ${member.prefix}_fx_c = -${member.prefix}_fx_mc / ${member.prefix}_fx_det
  ${member.prefix}_fx_d = ${member.prefix}_fx_ma / ${member.prefix}_fx_det
  ${member.prefix}_fx_tx = (${member.prefix}_fx_mc * ${member.prefix}_fx_mty - ${member.prefix}_fx_md * ${member.prefix}_fx_mtx) / ${member.prefix}_fx_det
  ${member.prefix}_fx_ty = (${member.prefix}_fx_mb * ${member.prefix}_fx_mtx - ${member.prefix}_fx_ma * ${member.prefix}_fx_mty) / ${member.prefix}_fx_det
}`
  return {
    hasAffine,
    wrap,
    opacity,
    declarations: [
      ...(member.animatedEffects ? [
        ...parameterDeclarations,
        `var ${member.prefix}_fx_ma = 1`,
        `var ${member.prefix}_fx_mb = 0`,
        `var ${member.prefix}_fx_mc = 0`,
        `var ${member.prefix}_fx_md = 1`,
        `var ${member.prefix}_fx_mtx = 0`,
        `var ${member.prefix}_fx_mty = 0`,
      ] : []),
      `var ${member.prefix}_fx_a = ${matrix.a}`,
      `var ${member.prefix}_fx_b = ${matrix.b}`,
      `var ${member.prefix}_fx_c = ${matrix.c}`,
      `var ${member.prefix}_fx_d = ${matrix.d}`,
      `var ${member.prefix}_fx_tx = ${matrix.tx}`,
      `var ${member.prefix}_fx_ty = ${matrix.ty}`,
      ...(member.animatedEffects ? [updateFunction] : []),
    ],
  }
}

function effectParameterVariable(member: CompiledMember, effectId: string, parameter: string): string {
  const index = member.effects.findIndex((effect) => effect.id === effectId)
  if (index < 0) throw new Error(`Clip "${member.id}" cannot animate missing Effect "${effectId}".`)
  return `${member.prefix}_fx_p${index}_${parameter}`
}

function effectParameterValue(effect: ShowClipEffect, parameter: string): number {
  return showEffectNumericValue(effect, parameter)
}

function emitMemberOutputEffectFunction(member: CompiledMember): string {
  const r = `${member.prefix}_r`
  const g = `${member.prefix}_g`
  const b = `${member.prefix}_b`
  const value = (effect: ShowClipEffect, parameter: string): string => member.animatedEffects
    ? effectParameterVariable(member, effect.id, parameter)
    : String(showEffectNumericValue(effect, parameter))
  const lines = [
    `  ${r} = ${r} * ${member.prefix}_adapt_brightness`,
    `  ${g} = ${g} * ${member.prefix}_adapt_brightness`,
    `  ${b} = ${b} * ${member.prefix}_adapt_brightness`,
  ]
  for (const [index, effect] of normalizeShowClipEffects(member.effects).entries()) {
    if (!isShowColorEffect(effect) || (!member.animatedEffects && showEffectsAreIdentity([effect]))) continue
    const name = `${member.prefix}_fx_color_${index}`
    if (effect.kind === 'opacity') {
      const amount = value(effect, 'opacity')
      lines.push(`  ${r} = ${r} * ${amount}`, `  ${g} = ${g} * ${amount}`, `  ${b} = ${b} * ${amount}`)
    } else if (effect.kind === 'brightness') {
      const amount = value(effect, 'brightness')
      lines.push(`  ${r} = clamp(${r} * ${amount}, 0, 1)`, `  ${g} = clamp(${g} * ${amount}, 0, 1)`, `  ${b} = clamp(${b} * ${amount}, 0, 1)`)
    } else if (effect.kind === 'hue') {
      const turns = value(effect, 'turns')
      lines.push(
        `  var ${name}_r = ${r}`,
        `  var ${name}_g = ${g}`,
        `  var ${name}_b = ${b}`,
        `  var ${name}_cos = cos(${turns} * 6.283185307179586)`,
        `  var ${name}_sin = sin(${turns} * 6.283185307179586)`,
        `  var ${name}_third = (1 - ${name}_cos) / 3`,
        `  var ${name}_cross = ${name}_sin / 1.7320508075688772`,
        `  var ${name}_diagonal = ${name}_cos + ${name}_third`,
        `  ${r} = clamp(${name}_diagonal * ${name}_r + (${name}_third - ${name}_cross) * ${name}_g + (${name}_third + ${name}_cross) * ${name}_b, 0, 1)`,
        `  ${g} = clamp((${name}_third + ${name}_cross) * ${name}_r + ${name}_diagonal * ${name}_g + (${name}_third - ${name}_cross) * ${name}_b, 0, 1)`,
        `  ${b} = clamp((${name}_third - ${name}_cross) * ${name}_r + (${name}_third + ${name}_cross) * ${name}_g + ${name}_diagonal * ${name}_b, 0, 1)`,
      )
    } else if (effect.kind === 'saturation') {
      const amount = value(effect, 'saturation')
      lines.push(
        `  var ${name}_luma = 0.2126 * ${r} + 0.7152 * ${g} + 0.0722 * ${b}`,
        `  ${r} = clamp(${name}_luma + (${r} - ${name}_luma) * ${amount}, 0, 1)`,
        `  ${g} = clamp(${name}_luma + (${g} - ${name}_luma) * ${amount}, 0, 1)`,
        `  ${b} = clamp(${name}_luma + (${b} - ${name}_luma) * ${amount}, 0, 1)`,
      )
    } else if (effect.kind === 'contrast') {
      const amount = value(effect, 'contrast')
      lines.push(`  ${r} = clamp((${r} - 0.5) * ${amount} + 0.5, 0, 1)`, `  ${g} = clamp((${g} - 0.5) * ${amount} + 0.5, 0, 1)`, `  ${b} = clamp((${b} - 0.5) * ${amount} + 0.5, 0, 1)`)
    } else if (effect.kind === 'invert') {
      const amount = value(effect, 'amount')
      lines.push(`  ${r} = ${r} * (1 - ${amount}) + (1 - ${r}) * ${amount}`, `  ${g} = ${g} * (1 - ${amount}) + (1 - ${g}) * ${amount}`, `  ${b} = ${b} * (1 - ${amount}) + (1 - ${b}) * ${amount}`)
    } else if (effect.kind === 'threshold') {
      const threshold = value(effect, 'threshold')
      const amount = value(effect, 'amount')
      lines.push(
        `  var ${name}_luma = 0.2126 * ${r} + 0.7152 * ${g} + 0.0722 * ${b}`,
        `  var ${name}_target = ${name}_luma >= ${threshold}`,
        `  ${r} = ${r} * (1 - ${amount}) + ${name}_target * ${amount}`,
        `  ${g} = ${g} * (1 - ${amount}) + ${name}_target * ${amount}`,
        `  ${b} = ${b} * (1 - ${amount}) + ${name}_target * ${amount}`,
      )
    } else if (effect.kind === 'posterize') {
      const levels = value(effect, 'levels')
      const amount = value(effect, 'amount')
      lines.push(
        `  var ${name}_span = ${member.animatedEffects ? `max(1, floor(${levels}) - 1)` : Number(effect.levels - 1)}`,
        `  ${r} = ${r} * (1 - ${amount}) + floor(${r} * ${name}_span + 0.5) / ${name}_span * ${amount}`,
        `  ${g} = ${g} * (1 - ${amount}) + floor(${g} * ${name}_span + 0.5) / ${name}_span * ${amount}`,
        `  ${b} = ${b} * (1 - ${amount}) + floor(${b} * ${name}_span + 0.5) / ${name}_span * ${amount}`,
      )
    } else if (effect.kind === 'color-map') {
      const amount = value(effect, 'amount')
      lines.push(
        `  var ${name}_luma = clamp(0.2126 * ${r} + 0.7152 * ${g} + 0.0722 * ${b}, 0, 1)`,
        `  var ${name}_r = ${value(effect, 'shadowR')} + (${value(effect, 'highlightR')} - ${value(effect, 'shadowR')}) * ${name}_luma`,
        `  var ${name}_g = ${value(effect, 'shadowG')} + (${value(effect, 'highlightG')} - ${value(effect, 'shadowG')}) * ${name}_luma`,
        `  var ${name}_b = ${value(effect, 'shadowB')} + (${value(effect, 'highlightB')} - ${value(effect, 'shadowB')}) * ${name}_luma`,
        `  ${r} = ${r} * (1 - ${amount}) + ${name}_r * ${amount}`,
        `  ${g} = ${g} * (1 - ${amount}) + ${name}_g * ${amount}`,
        `  ${b} = ${b} * (1 - ${amount}) + ${name}_b * ${amount}`,
      )
    }
  }
  return `function ${member.prefix}_applyOutputEffects() {\n${lines.join('\n')}\n}`
}

function emitRuntimePrelude(members: CompiledMember[]): string {
  const samplePropertyRamps = members[0]?.samplePropertyRamps
  const sampleRuntime = emitSampleRemappingRuntime(samplePropertyRamps)
  const memberVars = members.flatMap((member, index) => {
    const effectRuntime = describeMemberEffectRuntime(member)
    const lightShutter = member.adaptation.lightShutter
    const steppedClock = member.adaptation.steppedClock
    const steppedClockVars = steppedClock
      ? [
          `var ${member.prefix}_step_ms = ${steppedClock.stepMs}`,
          `var ${member.prefix}_step_pending_ms = 0`,
          `var ${member.prefix}_step_pending_delta = 0`,
          `function ${member.prefix}_advanceStepped(delta) {
  var scaledDelta = delta * ${member.prefix}_adapt_timeScale
  var previousPendingMs = ${member.prefix}_step_pending_ms
  var accumulatedMs = previousPendingMs + delta
  var deliveredCadenceMs = floor(accumulatedMs / ${member.prefix}_step_ms) * ${member.prefix}_step_ms
  if (deliveredCadenceMs > 0) {
    var deliveredDelta = ${member.prefix}_step_pending_delta + (deliveredCadenceMs - previousPendingMs) * ${member.prefix}_adapt_timeScale
    ${member.prefix}_step_pending_ms = accumulatedMs - deliveredCadenceMs
    ${member.prefix}_step_pending_delta = ${member.prefix}_step_pending_ms * ${member.prefix}_adapt_timeScale
    ${member.elapsedName} = ${member.elapsedName} + deliveredDelta
    ${member.hasBeforeRender ? `${member.beforeRenderName}(deliveredDelta)` : ''}
  } else {
    ${member.prefix}_step_pending_ms = accumulatedMs
    ${member.prefix}_step_pending_delta = ${member.prefix}_step_pending_delta + scaledDelta
  }
}`,
        ]
      : []
    const shutterVars = lightShutter
      ? [
          `var ${member.prefix}_shutter_rate_hz = ${lightShutter.rateHz}`,
          `var ${member.prefix}_shutter_duty = ${lightShutter.duty}`,
          `var ${member.prefix}_shutter_phase = ${lightShutter.phase}`,
          `var ${member.prefix}_shutter_open = ${initialShutterOpen(lightShutter)}`,
          `function ${member.prefix}_updateShutter() {
  if (${member.prefix}_shutter_duty <= 0) ${member.prefix}_shutter_open = 0
  else if (${member.prefix}_shutter_duty >= 1) ${member.prefix}_shutter_open = 1
  else if (frac(__pxlblz_show_elapsed_ms * 0.001 * ${member.prefix}_shutter_rate_hz + ${member.prefix}_shutter_phase) < ${member.prefix}_shutter_duty) ${member.prefix}_shutter_open = 1
  else ${member.prefix}_shutter_open = 0
}`,
          ...(lightShutter.clockBehavior === 'freeze'
            ? [
                `function ${member.prefix}_shutterActiveCycles(cycles) {
  return floor(cycles) * ${member.prefix}_shutter_duty + min(frac(cycles), ${member.prefix}_shutter_duty)
}`,
                `function ${member.prefix}_shutterActiveMs(startMs, endMs) {
  if (${member.prefix}_shutter_duty <= 0) return 0
  if (${member.prefix}_shutter_duty >= 1) return endMs - startMs
  var cyclesPerMs = ${member.prefix}_shutter_rate_hz * 0.001
  var startCycles = startMs * cyclesPerMs + ${member.prefix}_shutter_phase
  var endCycles = endMs * cyclesPerMs + ${member.prefix}_shutter_phase
  return (${member.prefix}_shutterActiveCycles(endCycles) - ${member.prefix}_shutterActiveCycles(startCycles)) / cyclesPerMs
}`,
              ]
            : []),
        ]
      : []
    const advanceDelta = (delta: string, indent: string) => steppedClock
      ? `${indent}${member.prefix}_advanceStepped(${delta})`
      : `${indent}var scaledDelta = ${delta} * ${member.prefix}_adapt_timeScale
${indent}${member.elapsedName} = ${member.elapsedName} + scaledDelta
${indent}${member.hasBeforeRender ? `${member.beforeRenderName}(scaledDelta)` : ''}`
    const controlCalls = member.controls.map((control) => `  ${control.functionName}(${control.valueName})`).join('\n')
    const effectUpdateCall = effectRuntime && member.animatedEffects ? `\n  ${member.prefix}_fx_update()` : ''
    const advance = lightShutter?.clockBehavior === 'freeze'
      ? `function ${member.prefix}_advance(delta) {${controlCalls ? `\n${controlCalls}` : ''}${effectUpdateCall}
  ${member.prefix}_updateShutter()
  var activeDelta = ${member.prefix}_shutterActiveMs(__pxlblz_show_elapsed_ms - delta, __pxlblz_show_elapsed_ms)
  if (activeDelta > 0) {
${advanceDelta('activeDelta', '    ')}
  }
}`
      : lightShutter
        ? `function ${member.prefix}_advance(delta) {${controlCalls ? `\n${controlCalls}` : ''}${effectUpdateCall}
  ${member.prefix}_updateShutter()
${advanceDelta('delta', '  ')}
}`
        : `function ${member.prefix}_advance(delta) {${controlCalls ? `\n${controlCalls}` : ''}${effectUpdateCall}
${advanceDelta('delta', '  ')}
}`
    return [
    `var ${member.elapsedName} = ${member.adaptation.timeOffsetMs}`,
    `var ${member.pixelCountName} = pixelCount`,
    `var ${member.prefix}_adapt_brightness = ${member.adaptation.brightness}`,
    `var ${member.prefix}_adapt_phase = ${member.adaptation.phase}`,
    `var ${member.prefix}_adapt_timeScale = ${member.adaptation.timeScale}`,
    `var ${member.prefix}_adapt_mirror = ${boolNumber(member.adaptation.mirror)}`,
    ...member.controls.map((control) => `var ${control.valueName} = ${control.initialValue}`),
    `var ${member.prefix}_r = 0`,
    `var ${member.prefix}_g = 0`,
    `var ${member.prefix}_b = 0`,
    ...(effectRuntime?.declarations ?? []),
    ...steppedClockVars,
    ...shutterVars,
    `function ${member.prefix}_clear() { ${member.prefix}_r = 0; ${member.prefix}_g = 0; ${member.prefix}_b = 0 }`,
    `function ${member.prefix}_rgb(r, g, b) { ${member.prefix}_r = r; ${member.prefix}_g = g; ${member.prefix}_b = b }`,
    `function ${member.prefix}_hsv(h, s, v) { __pxlblz_show_capture_hsv(${index}, h + ${member.prefix}_adapt_phase, s, v) }`,
    emitMemberOutputEffectFunction(member),
    `function ${member.prefix}_time(interval) { return ((${member.elapsedName} * 0.001) / interval) % 1 }`,
    `function ${member.prefix}_setAdaptation(brightness, phase, timeScale, mirror) {
  ${member.prefix}_adapt_brightness = brightness
  ${member.prefix}_adapt_phase = phase
  ${member.prefix}_adapt_timeScale = timeScale
  ${member.prefix}_adapt_mirror = mirror
}`,
    `function ${member.prefix}_mixAdaptation(fromBrightness, fromPhase, fromTimeScale, fromMirror, toBrightness, toPhase, toTimeScale, toMirror, mix) {
  ${member.prefix}_setAdaptation(
    fromBrightness + (toBrightness - fromBrightness) * mix,
    fromPhase + (toPhase - fromPhase) * mix,
    fromTimeScale + (toTimeScale - fromTimeScale) * mix,
    mix < 0.5 ? fromMirror : toMirror
  )
}`,
    advance,
    `function ${member.prefix}_renderCapture(index) {
  var mappedIndex = index
  if (${member.prefix}_adapt_mirror >= 0.5) mappedIndex = ${member.pixelCountName} - 1 - index
${samplePropertyRamps ? `  if (__pxlblz_show_sample_repeat_scale != 1) {
    var mappedPosition = mappedIndex / max(1, ${member.pixelCountName} - 1)
    mappedIndex = min(${member.pixelCountName} - 1, floor(frac(mappedPosition * __pxlblz_show_sample_repeat_scale) * ${member.pixelCountName}))
  }
` : ''}${effectRuntime?.hasAffine ? `  var effectPosition = mappedIndex / max(1, ${member.pixelCountName} - 1)
  var effectX = ${member.prefix}_fx_a * effectPosition + ${member.prefix}_fx_c * 0.5 + ${member.prefix}_fx_tx
  var effectY = ${member.prefix}_fx_b * effectPosition + ${member.prefix}_fx_d * 0.5 + ${member.prefix}_fx_ty
  var effectInside = effectX >= 0 && effectX <= 1 && effectY >= 0 && effectY <= 1
  ${effectRuntime.wrap ? 'effectX = effectX - floor(effectX)' : 'effectX = clamp(effectX, 0, 1)'}
  mappedIndex = min(${member.pixelCountName} - 1, floor(effectX * ${member.pixelCountName}))
` : ''}  ${member.prefix}_clear()
  ${member.hasRender ? emitSelectedMemberRendererCall(member, 1, { index: 'mappedIndex' }) : ''}
  ${member.prefix}_applyOutputEffects()
${effectRuntime?.hasAffine && !effectRuntime.wrap ? `  if (!effectInside) ${member.prefix}_clear()
` : ''}}`,
    `function ${member.prefix}_renderCapture2D(index, x, y) {
  var mappedIndex = index
  var mappedX = x
${samplePropertyRamps || effectRuntime?.hasAffine ? '  var mappedY = y\n' : ''}  if (${member.prefix}_adapt_mirror >= 0.5) {
    mappedIndex = ${member.pixelCountName} - 1 - index
    mappedX = 1 - x
  }
${samplePropertyRamps ? `  if (__pxlblz_show_sample_repeat_scale != 1) {
    mappedX = frac(clamp(mappedX, 0, 1) * __pxlblz_show_sample_repeat_scale)
    mappedY = frac(clamp(mappedY, 0, 1) * __pxlblz_show_sample_repeat_scale)${!member.hasRender2D && member.hasRender ? `
    mappedIndex = min(${member.pixelCountName} - 1, floor(mappedX * ${member.pixelCountName}))` : ''}
  }
` : ''}${effectRuntime?.hasAffine ? `  var effectX = ${member.prefix}_fx_a * mappedX + ${member.prefix}_fx_c * mappedY + ${member.prefix}_fx_tx
  var effectY = ${member.prefix}_fx_b * mappedX + ${member.prefix}_fx_d * mappedY + ${member.prefix}_fx_ty
  var effectInside = effectX >= 0 && effectX <= 1 && effectY >= 0 && effectY <= 1
  ${effectRuntime.wrap ? 'mappedX = effectX - floor(effectX)\n  mappedY = effectY - floor(effectY)' : 'mappedX = clamp(effectX, 0, 1)\n  mappedY = clamp(effectY, 0, 1)'}
` : ''}  ${member.prefix}_clear()
  ${emitSelectedMemberRendererCall(member, 2, {
    index: 'mappedIndex',
    x: 'mappedX',
    y: samplePropertyRamps || effectRuntime?.hasAffine ? 'mappedY' : 'y',
  })}
  ${member.prefix}_applyOutputEffects()
${effectRuntime?.hasAffine && !effectRuntime.wrap ? `  if (!effectInside) ${member.prefix}_clear()
` : ''}}`,
    `function ${member.prefix}_emit() { rgb(${member.prefix}_r, ${member.prefix}_g, ${member.prefix}_b) }`,
    ]
  })

  const captureBranches = members.length <= 2
    ? `if (slot == 0) { __pxlblz_show_c0_r = r; __pxlblz_show_c0_g = g; __pxlblz_show_c0_b = b }
  else { __pxlblz_show_c1_r = r; __pxlblz_show_c1_g = g; __pxlblz_show_c1_b = b }`
    : members.map((member, index) => (
        `${index === 0 ? 'if' : 'else if'} (slot == ${index}) { ${member.prefix}_r = r; ${member.prefix}_g = g; ${member.prefix}_b = b }`
      )).join('\n  ')

  return [
    'var __pxlblz_show_elapsed_ms = 0',
    'var __pxlblz_show_mix = 0',
    'var __pxlblz_show_phase = 0',
    ...(sampleRuntime ? [sampleRuntime] : []),
    ...memberVars,
    `function __pxlblz_show_capture_rgb(slot, r, g, b) {
  ${captureBranches}
}`,
    `function __pxlblz_show_capture_hsv(slot, h, s, v) {
  h = h - floor(h)
  var i = floor(h * 6)
  var f = h * 6 - i
  var p = v * (1 - s)
  var q = v * (1 - f * s)
  var t = v * (1 - (1 - f) * s)
  if (i == 0) __pxlblz_show_capture_rgb(slot, v, t, p)
  else if (i == 1) __pxlblz_show_capture_rgb(slot, q, v, p)
  else if (i == 2) __pxlblz_show_capture_rgb(slot, p, v, t)
  else if (i == 3) __pxlblz_show_capture_rgb(slot, p, q, v)
  else if (i == 4) __pxlblz_show_capture_rgb(slot, t, p, v)
  else __pxlblz_show_capture_rgb(slot, v, p, q)
}`,
    `function __pxlblz_show_hash01(index) {
  return frac((index + 1) * 0.61803398875)
}`,
  ].join('\n')
}

function emitScheduler(
  from: CompiledMember,
  to: CompiledMember,
  transitionStart: number,
  transitionEnd: number,
  duration: number,
  easing: ShowTransitionEasing = 'linear',
): string {
  return `export function beforeRender(delta) {
  __pxlblz_show_elapsed_ms = __pxlblz_show_elapsed_ms + delta
  if (__pxlblz_show_elapsed_ms < ${transitionStart}) {
    __pxlblz_show_phase = 0
    __pxlblz_show_mix = 0
    ${from.prefix}_advance(delta)
  } else if (__pxlblz_show_elapsed_ms < ${transitionEnd}) {
    __pxlblz_show_phase = 1
    __pxlblz_show_mix = ${emitShowEasingExpression(easing, `(__pxlblz_show_elapsed_ms - ${transitionStart}) / ${duration}`)}
    ${from.prefix}_advance(delta)
    ${to.prefix}_advance(delta)
  } else {
    __pxlblz_show_phase = 2
    __pxlblz_show_mix = 1
    ${to.prefix}_advance(delta)
  }
}`
}

function emitRouteScheduler(routes: ResolvedRoute[]): string {
  const members = [...new Set(routes.map((route) => route.member))]
  const lines = members.flatMap((member) => {
    const route = routes.find((candidate) => candidate.member === member)
    return [
      `  ${member.pixelCountName} = ${route?.pixelCount ?? 0}`,
      `  ${member.prefix}_advance(delta)`,
    ]
  })
  return `export function beforeRender(delta) {
  __pxlblz_show_elapsed_ms = __pxlblz_show_elapsed_ms + delta
${lines.join('\n')}
}`
}

function emitRender(
  from: CompiledMember,
  to: CompiledMember,
  outputDimension: ShowOutputDimension,
): string {
  return emitOuterRenderer(outputDimension, `  if (__pxlblz_show_phase == 0) {
    ${emitMemberCaptureCall(from, outputDimension)}
    ${from.prefix}_emit()
  } else if (__pxlblz_show_phase == 2) {
    ${emitMemberCaptureCall(to, outputDimension)}
    ${to.prefix}_emit()
  } else {
    ${emitMemberCaptureCall(from, outputDimension)}
    var r0 = ${from.prefix}_r
    var g0 = ${from.prefix}_g
    var b0 = ${from.prefix}_b
    ${emitMemberCaptureCall(to, outputDimension)}
    rgb(
      r0 * (1 - __pxlblz_show_mix) + ${to.prefix}_r * __pxlblz_show_mix,
      g0 * (1 - __pxlblz_show_mix) + ${to.prefix}_g * __pxlblz_show_mix,
      b0 * (1 - __pxlblz_show_mix) + ${to.prefix}_b * __pxlblz_show_mix
    )
  }`)
}

function emitOuterRenderer(outputDimension: ShowOutputDimension, body: string): string {
  const signature = outputDimension === 2 ? 'render2D(index, x, y)' : 'render(index)'
  return `export function ${signature} {
${body}
}`
}

function emitMemberCaptureCall(member: CompiledMember, outputDimension: ShowOutputDimension): string {
  return outputDimension === 2
    ? `${member.prefix}_renderCapture2D(index, x, y)`
    : `${member.prefix}_renderCapture(index)`
}

function emitRouteRender(routes: ResolvedRoute[], outputDimension: 1 | 2): string {
  const blocks = emitRouteRenderBody(routes, '', outputDimension)
  return `export function ${outputDimension === 2 ? 'render2D(index, x, y)' : 'render(index)'} {
${blocks}
  rgb(0, 0, 0)
}`
}

function emitRouteRenderBody(routes: ResolvedRoute[], indent: string, outputDimension: 1 | 2): string {
  return routes
    .map((route) => emitRouteRenderBlock(route, outputDimension).split('\n').map((line) => `${indent}${line}`).join('\n'))
    .join('\n')
}

function emitRouteRenderBlock(route: ResolvedRoute, outputDimension: 1 | 2): string {
  const localName = `${route.member.prefix}_zoneLocalIndex`
  const width = Math.max(1, Math.ceil(Math.sqrt(route.pixelCount)))
  const height = Math.max(1, Math.ceil(route.pixelCount / width))
  const render = outputDimension === 2
    ? [
        `    var ${route.member.prefix}_zoneLocalX = ${width === 1 ? '0.5' : `(${localName} % ${width}) / ${width - 1}`}`,
        `    var ${route.member.prefix}_zoneLocalY = ${height === 1 ? '0.5' : `floor(${localName} / ${width}) / ${height - 1}`}`,
        `    ${route.member.prefix}_renderCapture2D(${localName}, ${route.member.prefix}_zoneLocalX, ${route.member.prefix}_zoneLocalY)`,
      ]
    : [`    ${route.member.prefix}_renderCapture(${localName})`]
  return [
    `  var ${localName} = -1`,
    ...emitZoneLocalAssignments(route.zone, localName),
    `  if (${localName} >= 0) {`,
    `    ${route.member.pixelCountName} = ${route.pixelCount}`,
    ...render,
    `    ${route.member.prefix}_emit()`,
    `    return`,
    `  }`,
  ].filter(Boolean).join('\n')
}

function emitZoneLocalAssignments(zone: ControllerZone, localName: string): string[] {
  const lines: string[] = []
  let offset = 0
  for (const range of zone.ranges) {
    const length = range.end - range.start + 1
    const assignment = offset === 0
      ? `index - ${range.start}`
      : `${offset} + index - ${range.start}`
    lines.push(`  if (index >= ${range.start} && index <= ${range.end}) ${localName} = ${assignment}`)
    offset += length
  }
  return lines
}

function buildMetadata(members: CompiledMember[], outputDimension: 1 | 2): BundleMetadata {
  const showVars = [
    '__pxlblz_show_elapsed_ms',
    '__pxlblz_show_mix',
    '__pxlblz_show_phase',
    ...members.flatMap(member => [
      member.elapsedName,
      member.pixelCountName,
      `${member.prefix}_adapt_brightness`,
      `${member.prefix}_adapt_phase`,
      `${member.prefix}_adapt_timeScale`,
      `${member.prefix}_adapt_mirror`,
      ...member.controls.map((control) => control.valueName),
      ...(member.adaptation.lightShutter
        ? [
            `${member.prefix}_shutter_rate_hz`,
            `${member.prefix}_shutter_duty`,
            `${member.prefix}_shutter_phase`,
            `${member.prefix}_shutter_open`,
          ]
        : []),
      ...(member.adaptation.steppedClock
        ? [
            `${member.prefix}_step_ms`,
            `${member.prefix}_step_pending_ms`,
            `${member.prefix}_step_pending_delta`,
          ]
        : []),
      `${member.prefix}_r`,
      `${member.prefix}_g`,
      `${member.prefix}_b`,
      ...member.renamedPatternVars,
    ]),
  ]

  return {
    exportedVars: [],
    patternVars: showVars,
    controls: [],
    renderFns: {
      hasBeforeRender: true,
      hasRender: outputDimension === 1,
      hasRender2D: outputDimension === 2,
      hasRender3D: false,
    },
  }
}

function normalizeAdaptation(adaptation: Partial<ShowClipAdaptation> | undefined): ShowClipAdaptation {
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

function describeTemporalPolicy(members: CompiledMember[]): ShowCompileSummary['temporalPolicy'] {
  const steppedCount = members.filter((member) => member.adaptation.steppedClock).length
  if (steppedCount === 0) return 'continuous'
  if (steppedCount === members.length) return 'stepped-clock'
  return 'mixed'
}

function describeEvaluationPolicy(members: CompiledMember[]): {
  policy: ShowCompileSummary['evaluationPolicy']
  expectedActiveFraction: number | null
} {
  const shutters = members.map((member) => member.adaptation.lightShutter)
  if (shutters.every((shutter) => shutter === undefined)) {
    return { policy: 'full', expectedActiveFraction: 1 }
  }
  if (shutters.every((shutter) => shutter !== undefined)) {
    const duties = shutters.map((shutter) => shutter!.duty)
    if (duties.every((duty) => duty === duties[0])) {
      return { policy: 'masked-shutter', expectedActiveFraction: duties[0] }
    }
  }
  return { policy: 'mixed', expectedActiveFraction: null }
}

function describeEffectCost(
  members: CompiledMember[],
  recipe: ShowRecipe,
): ShowCompiledCostMetadata['cpu']['effects'] {
  const motionTransitions = [
    ...(recipe.routeTransition?.kind === 'motion' ? [recipe.routeTransition] : []),
    ...(recipe.sceneSequence?.scenes.flatMap((scene) => (
      scene.transitionOut?.kind === 'motion' ? [scene.transitionOut] : []
    )) ?? []),
  ]
  const affineCounts = members.map((member) => member.effects.filter((effect) => (
    effect.kind === 'translate' || effect.kind === 'rotate' || effect.kind === 'scale' || effect.kind === 'shear'
  )).length)
  const affineOperationsPerFrame = Math.max(0, ...members.map((member, index) => (
    member.animatedEffects ? affineCounts[index] : 0
  )))
  const hasAffine = affineCounts.some((count) => count > 0)
  const hasMotion = motionTransitions.length > 0
  const adaptationAnimated = countEffectRamps(recipe.adaptationRamp?.effectRamps)
  const sequenceAnimated = Math.max(0, ...(recipe.sceneSequence?.scenes.map((scene) => (
    countEffectRamps(scene.transitionOut?.effectRamps)
  )) ?? []))
  const hasOpacity = members.some((member) => member.effects.some((effect) => (
    effect.kind === 'opacity' && effect.opacity !== 1
  ))) || Object.values(recipe.adaptationRamp?.effectRamps ?? {}).some((parameters) => parameters.opacity !== undefined)
  const hasWrap = hasAffine && members.some((member) => (
    member.effects.some((effect) => effect.kind === 'wrap')
  )) || motionTransitions.some((transition) => transition.addressPolicy === 'wrap')
  const legacyBrightnessAnimated = Boolean(
    recipe.adaptationRamp?.propertyRamps?.brightness
    || recipe.sceneSequence?.scenes.some((scene) => scene.transitionOut?.propertyRamps?.brightness),
  )
  const memberColorCosts = members.map((member) => {
    const active = member.effects.filter((effect) => (
      isShowColorEffect(effect) && (member.animatedEffects || !showEffectsAreIdentity([effect]))
    ))
    const legacyBrightness = member.adaptation.brightness !== 1 || legacyBrightnessAnimated ? 1 : 0
    return active.reduce((cost, effect) => {
      const scalar = effect.kind === 'opacity' || effect.kind === 'brightness' ? 3
        : effect.kind === 'hue' ? 36
          : effect.kind === 'saturation' ? 18
            : effect.kind === 'contrast' ? 9
              : effect.kind === 'invert' ? 12
                : effect.kind === 'threshold' ? 16
                  : effect.kind === 'posterize' ? 21
                    : 28
      return {
        count: cost.count + 1,
        scalar: cost.scalar + scalar,
        floor: cost.floor + (effect.kind === 'posterize' ? 3 + (member.animatedEffects ? 1 : 0) : 0),
        trig: cost.trig + (effect.kind === 'hue' ? 2 : 0),
      }
    }, { count: legacyBrightness, scalar: legacyBrightness * 3, floor: 0, trig: 0 })
  })
  const maxColor = memberColorCosts.reduce((worst, cost) => (
    cost.scalar > worst.scalar ? cost : worst
  ), { count: 0, scalar: 0, floor: 0, trig: 0 })
  return {
    affineOperationsPerFrame,
    animatedParametersPerFrame: Math.max(adaptationAnimated, sequenceAnimated),
    affineScalarOpsPerEvaluatedPixel: hasAffine || hasMotion ? 8 : 0,
    opacityMultipliesPerEvaluatedPixel: hasOpacity ? 3 : 0,
    colorEffectsPerEvaluatedPixel: maxColor.count,
    colorScalarOpsPerEvaluatedPixel: maxColor.scalar,
    colorFloorCallsPerEvaluatedPixel: maxColor.floor,
    colorTrigCallsPerEvaluatedPixel: maxColor.trig,
    addressPolicy: !hasAffine && !hasMotion ? 'none' : hasWrap ? 'wrap' : 'clip',
  }
}

function countEffectRamps(ramps: ShowEffectPropertyRampsRecipe | undefined): number {
  return Object.values(ramps ?? {}).reduce((count, parameters) => count + Object.keys(parameters).length, 0)
}

function initialShutterOpen(shutter: ShowLightShutter): 0 | 1 {
  if (shutter.duty <= 0) return 0
  if (shutter.duty >= 1) return 1
  const cycle = shutter.phase - Math.floor(shutter.phase)
  return cycle < shutter.duty ? 1 : 0
}

function describeClockPolicy(recipe: ShowRecipe, members: CompiledMember[]): ShowCompileSummary['clockPolicy'] {
  if (recipe.adaptationRamp) {
    const from = normalizeAdaptation(recipe.adaptationRamp.from)
    const to = normalizeAdaptation(recipe.adaptationRamp.to)
    if (from.timeScale === 0 || to.timeScale === 0) return 'exact-pause-ramp'
    if (from.timeScale !== 1 || to.timeScale !== 1) return 'scaled-ramp'
  }
  if (members.some((member) => member.adaptation.timeScale === 0)) return 'exact-pause'
  if (members.some((member) => member.adaptation.timeScale !== 1)) return 'scaled'
  return 'real-time'
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function boolNumber(value: boolean): 0 | 1 {
  return value ? 1 : 0
}

function rewriteMemberSource(source: string, prefix: string, mapping: Map<string, string>): string {
  const ast = parseModule(source)
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

function collectTopLevelBindings(source: string): Set<string> {
  const bindings = new Set<string>()
  const ast = parseModule(source)
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

function rewriteSource(src: string, rewrites: Rewrite[]): string {
  const sorted = [...rewrites].sort((a, b) => b.start - a.start)
  for (const rewrite of sorted) {
    src = src.slice(0, rewrite.start) + rewrite.text + src.slice(rewrite.end)
  }
  return src
}

function parseModule(source: string): Node {
  return acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
}

function byteLength(source: string): number {
  return new TextEncoder().encode(source).length
}
