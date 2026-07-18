import * as acorn from 'acorn'
import { bundle, type BundleMetadata } from './bundle'
import {
  controllerZonePixelCount,
  findControllerZoneByName,
  normalizeControllerZones,
  type ControllerZone,
} from './controllerProfile'
import { emitFixedPoint } from './fxEmit'
import { emitShowEasingExpression, showCubicBezierRuntimeSource, validateShowEasing } from './showEasing'
import type {
  ShowClipEffect,
  ShowCrossfadePolicy,
  ShowDissolveVariant,
  ShowMotionAddressPolicy,
  ShowMotionSpinDirection,
  ShowMotionTransitionVariant,
  ShowPropertyAnimationTrack,
  ShowRevealMode,
  ShowSpatialShape,
  ShowTransitionEasing,
  ShowTransitionEdgePolicy,
  ShowWipeMode,
  ShowWipeOrientation,
  ShowWipeVariant,
} from './personalContentRecords'
import { normalizeShowTransitionColor, showTransitionColorToRgb } from './showFadeThroughColor'
import { showClipEffectPersistedField } from './showEffectAuthoring'
import { emitShowPropertyTrackExpression } from './showPropertyAnimation'
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
  isShowDistortionEffect,
  normalizeShowClipEffects,
  showEffectNumericValue,
  showEffectParameterNames,
  showEffectsAreIdentity,
} from './showEffects'
import {
  buildShowCompiledCostMetadata,
  type ShowCompiledCostMetadata,
} from './showVisualToolkit'
import { SHOW_DISTORTION_CANDIDATES } from './showDistortionBenchmark'
import {
  planPhysicalRoutingRepresentation,
  type GeneratedRoutingFormula,
  type RoutingRepresentationEstimate,
} from './showRoutingRepresentation'
import { selectRenderCompatibility } from './renderCompatibility'
import {
  analyzeShowRendererOutputGuaranteesAst,
  type ShowRendererOutputGuarantees,
} from './showCaptureSpecialization'
import {
  analyzeShowFrameInvariantCandidates,
  applyShowFrameInvariantHoists,
  selectShowFrameInvariantHoists,
  type ShowFrameDependency,
} from './showFrameInvariantHoisting'
import {
  selectShowRenderKernelSpecialization,
  type ShowRenderKernelSelection,
} from './showRenderKernelSpecialization'
import {
  describeShowRenderTargetArena,
  emitShowRenderTargetArenaSource,
  emitShowRenderTargetRead,
  emitShowRenderTargetWrite,
  planShowRenderTargetArena,
  type ShowRenderTargetArenaSummary,
  type ShowRenderTargetPlan,
} from './showRenderTargetArena'
import {
  planShowRenderTargetCaches,
  type ShowRenderTargetCachePlan,
  type ShowRenderTargetCandidate,
} from './showRenderTargetPlanner'
import {
  planPhysicalRoutingShortCircuit,
  type PhysicalRoutingShortCircuitPlan,
} from './showPhysicalRoutingSpecialization'
import {
  buildShowVmResourceLedger,
  countShowPersistentGlobals,
  inspectGeneratedShowVmAllocations,
  SHOW_ARTIFACT_BUDGET_BYTES,
  SHOW_MAX_OUTPUT_PIXELS,
  type ShowVmResourceLedger,
} from './showVmResourceLedger'

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
  crossfadePolicy?: ShowCrossfadePolicy
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
  crossfadePolicy?: ShowCrossfadePolicy
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

export interface ShowRoutedScenePlacementRecipe {
  /** Stable authored placement id used by placement-owned local tracks. */
  placementId?: string
  zoneName: string
  clipId: string
  /** Back-to-front order inside one Zone. Omitted flat placements are order 0. */
  stackOrder?: number
  /** Source-over opacity for this placement after its Clip effects. */
  opacity?: number
  phase?: number
  mirror?: boolean
  domainZoneNames?: string[]
  zoneMode?: 'span' | 'repeat'
  timeScale?: number
  brightness?: number
  controlTargets?: Record<string, number>
  effects?: ShowClipEffect[]
}

export interface ShowRoutedScenePlacementRampRecipe {
  clipId: string
  propertyRamps?: Partial<Record<'timeScale' | 'brightness', ShowAdaptationPropertyRampRecipe>>
  controlRamps?: Record<string, ShowAdaptationPropertyRampRecipe>
  effectRamps?: ShowEffectPropertyRampsRecipe
}

export interface ShowRoutedSceneSequenceSceneRecipe {
  placements: ShowRoutedScenePlacementRecipe[]
  holdMs: number
  /** Offset into the source Scene when composition lowering creates derived holds. */
  localTimeOffsetMs?: number
  propertyTracks?: ShowPropertyAnimationTrack[]
  transitionOut?: ShowSceneSequenceTransitionRecipe
  transitionRamps?: ShowRoutedScenePlacementRampRecipe[]
}

export interface ShowRoutedSceneSequenceRecipe {
  scenes: ShowRoutedSceneSequenceSceneRecipe[]
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
  routedSceneSequence?: ShowRoutedSceneSequenceRecipe
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
  expandedArtifactBytes: number
  artifactBytes: number
  measuredDeviceBudgetBytes: number
  artifactBudgetRatio: number
  renderPolicy:
    | 'steady-active-transition-both'
    | 'snapshot-outgoing-transition-live-incoming'
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
  steadyStateRenderersPerPixel: number
  worstInstantRenderersPerPixel: number
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
  renderTarget: ShowRenderTargetArenaSummary
  renderTargetPlan: ShowRenderTargetCachePlan
  specializations: {
    routing: Omit<PhysicalRoutingShortCircuitPlan, 'ranges'> | null
    capture: Array<{
      clipId: string
      samplePath: 'identity' | 'mapped'
      outputPath: 'identity' | 'brightness' | 'effects'
      clearPolicy: 'omitted-guaranteed-output' | 'retained'
      operationsAvoidedPerEvaluatedPixel: number
    }>
    frameInvariants: Array<{
      clipId: string
      bindings: string[]
      candidateCount: number
      selectedCount: number
      dependencies: ShowFrameDependency[]
      operationsAvoidedPerEvaluatedPixel: number
      estimatedOperationsAvoidedPerFrame: number
      addedSourceBytes: number
    }>
    renderKernels: (ShowRenderKernelSelection & {
      configurationPlanCount: number
      kernelCount: number
      baselineDispatchBytes: number
      selectedDispatchBytes: number
    }) | null
    motionTransitions: {
      selected: boolean
      representation: 'unrolled' | 'exact-shared-environment' | 'exact-family-kernels'
      reason: 'selected' | 'disabled' | 'incompatible' | 'not-smaller'
      boundaryCount: number
      stackPlanCount: number
      kernelCount: number
      parameterWords: number
      parameterScalarGlobals: number
      dynamicBranchesAddedPerPixel: number
      emittedBytes: number
      baselineEmittedBytes: number
      avoidedEmittedBytes: number
    } | null
  }
  clips: ShowCompileClipSummary[]
  resources: ShowVmResourceLedger
  warnings: string[]
  cost: ShowCompiledCostMetadata
}

export interface GeneratedShowArtifact {
  code: string
  expandedCode: string
  fxCode: string
  metadata: BundleMetadata
  summary: ShowCompileSummary
}

// Largest source/bytecode budget observed during the #314 hardware spike.
const MEASURED_DEVICE_BUDGET_BYTES = SHOW_ARTIFACT_BUDGET_BYTES

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
  resourceSource: string
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
  usesHsv: boolean
  usesTime: boolean
  elapsedName: string
  elapsedSecondsName: string
  pixelCountName: string
  adaptation: ShowClipAdaptation
  samplePropertyRamps?: ShowSamplePropertyRampsRecipe
  controls: Array<{ exportName: string; functionName: string; valueName: string; initialValue: number }>
  effects: ShowClipEffect[]
  animatedEffects: boolean
  staticPlanEffects: boolean
  exactSpecializations: boolean
  outputGuarantees: ShowRendererOutputGuarantees
  needsMirrorMapping: boolean
  needsBrightnessScale: boolean
  frameInvariantUpdateName: string | null
  frameInvariantSummary: {
    bindings: string[]
    candidateCount: number
    selectedCount: number
    dependencies: ShowFrameDependency[]
    operationsAvoidedPerEvaluatedPixel: number
    estimatedOperationsAvoidedPerFrame: number
    addedSourceBytes: number
  }
}

export interface ShowCompileOptions {
  exactSpecializations?: boolean
  frameInvariantHoisting?: boolean
  renderKernelSpecialization?: boolean
  /** Benchmark-only counterfactual; production always uses the default `true`. */
  renderTargetArenaEmission?: boolean
  /** `none` preserves the unrolled #515 boundary; `exact` forces the #525 exact candidate. */
  motionTransitionSharing?: 'auto' | 'none' | 'structure' | 'exact'
}

const DIRECT_SNAPSHOT_CANDIDATE_ID = 'transition:direct:snapshot-live'

function sequenceSnapshotCandidateId(kind: 'sequence' | 'routed', sceneIndex: number): string {
  return `transition:${kind}:${sceneIndex}:snapshot-live`
}

function buildShowRenderTargetCandidates(
  recipe: ShowRecipe,
  pixelCount: number,
): ShowRenderTargetCandidate[] {
  const candidates: ShowRenderTargetCandidate[] = []
  const addSnapshot = (id: string, start: number, duration: number, key: string) => {
    candidates.push({
      id,
      kind: 'rgb-snapshot',
      lifetime: { kind: 'transition', start, end: start + duration, key },
      invalidatedBy: ['transition-exit', 'show-loop'],
      exactness: 'authored-snapshot',
      authorSelected: true,
      required: true,
      setupCost: pixelCount,
      perFrameSavings: pixelCount,
      expectedReuseCount: Math.max(1, Math.ceil(duration / (1_000 / 30)) - 1),
    })
  }
  if (recipe.crossfade?.crossfadePolicy === 'snapshot-live') {
    addSnapshot(DIRECT_SNAPSHOT_CANDIDATE_ID, recipe.crossfade.startMs, recipe.crossfade.durationMs, 'direct')
  }
  const addSequence = (
    kind: 'sequence' | 'routed',
    scenes: Array<{
      holdMs: number
      transitionOut?: ShowSceneSequenceTransitionRecipe
    }>,
    eligible: (sceneIndex: number) => boolean,
  ) => {
    let cursor = 0
    scenes.forEach((scene, sceneIndex) => {
      cursor += scene.holdMs
      const transition = scene.transitionOut
      if (transition?.kind === 'crossfade' && transition.crossfadePolicy === 'snapshot-live' && eligible(sceneIndex)) {
        addSnapshot(
          sequenceSnapshotCandidateId(kind, sceneIndex),
          cursor,
          transition.durationMs,
          `${kind}-${sceneIndex}`,
        )
      }
      if (transition && transition.kind !== 'cut') cursor += transition.durationMs
    })
  }
  if (recipe.sceneSequence) {
    addSequence('sequence', recipe.sceneSequence.scenes, (sceneIndex) => (
      recipe.sceneSequence!.scenes[sceneIndex].clipId
      !== recipe.sceneSequence!.scenes[sceneIndex + 1]?.clipId
    ))
  }
  if (recipe.routedSceneSequence) {
    addSequence('routed', recipe.routedSceneSequence.scenes, () => true)
  }
  return candidates
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
  options: ShowCompileOptions = {},
): GeneratedShowArtifact {
  const expandedRecipe = { ...recipe, clips: expandRouteClips(recipe.clips) }
  const exactSpecializations = options.exactSpecializations ?? true
  const frameInvariantHoisting = options.frameInvariantHoisting ?? exactSpecializations
  // The pb32/3.67 matrix for #513 found no repeatable runtime benefit from
  // kernel dispatch despite its smaller artifact. Keep it opt-in until a
  // controller profile demonstrates a gain.
  const renderKernelSpecialization = options.renderKernelSpecialization ?? false
  const renderTargetArenaEmission = options.renderTargetArenaEmission ?? true
  const motionTransitionSharing = options.motionTransitionSharing ?? 'auto'
  validateRecipe(expandedRecipe)
  const animatedEffectClipIds = new Set<string>()
  const dynamicallyAnimatedEffectClipIds = new Set<string>()
  if (expandedRecipe.adaptationRamp?.effectRamps && expandedRecipe.clips[0]) {
    animatedEffectClipIds.add(expandedRecipe.clips[0].id)
    dynamicallyAnimatedEffectClipIds.add(expandedRecipe.clips[0].id)
  }
  for (const scene of expandedRecipe.sceneSequence?.scenes ?? []) {
    if (scene.transitionOut?.effectRamps) {
      animatedEffectClipIds.add(scene.clipId)
      dynamicallyAnimatedEffectClipIds.add(scene.clipId)
    }
  }
  for (const scene of expandedRecipe.routedSceneSequence?.scenes ?? []) {
    for (const placement of scene.placements) {
      if (placement.effects) animatedEffectClipIds.add(placement.clipId)
    }
    for (const ramp of scene.transitionRamps ?? []) {
      if (ramp.effectRamps) {
        animatedEffectClipIds.add(ramp.clipId)
        dynamicallyAnimatedEffectClipIds.add(ramp.clipId)
      }
    }
    for (const track of scene.propertyTracks ?? []) {
      if (track.target.kind !== 'placement-effect') continue
      const placementId = track.target.placementId
      const placement = scene.placements.find((candidate) => candidate.placementId === placementId)
      if (placement) {
        animatedEffectClipIds.add(placement.clipId)
        dynamicallyAnimatedEffectClipIds.add(placement.clipId)
      }
    }
  }
  const canBakeStaticRoutedPlanEffects = expandedRecipe.routingLayouts?.length === 1
    && !expandedRecipe.routingLayouts[0].logical
    && Boolean(expandedRecipe.routedSceneSequence)
    && expandedRecipe.routedSceneSequence!.scenes.every((scene) => {
      const zoneNames = scene.placements.map((placement) => placement.zoneName)
      return (!scene.transitionOut || scene.transitionOut.kind === 'cut')
        && (scene.propertyTracks?.length ?? 0) === 0
        && !(scene.transitionRamps ?? []).some((ramp) => ramp.effectRamps)
        && new Set(zoneNames).size === zoneNames.length
        && scene.placements.every((placement) => (
          clampNumber(placement.opacity ?? 1, 0, 1) === 1
          && (placement.zoneMode !== 'span'
            || !placement.domainZoneNames?.length
            || (placement.domainZoneNames.length === 1 && placement.domainZoneNames[0] === placement.zoneName))
        ))
    })
  const staticPlanEffectClipIds = new Set(
    canBakeStaticRoutedPlanEffects
      ? [...animatedEffectClipIds].filter((clipId) => !dynamicallyAnimatedEffectClipIds.has(clipId))
      : [],
  )
  const members = expandedRecipe.clips.map((clip, index) => ({
    ...compileMember(
      clip,
      index,
      libraries,
      animatedEffectClipIds.has(clip.id),
      staticPlanEffectClipIds.has(clip.id),
      exactSpecializations,
      frameInvariantHoisting,
      expandedRecipe.masterPixelCount ?? 256,
      showMemberNeedsMirrorMapping(expandedRecipe, clip),
      showMemberNeedsBrightnessScale(expandedRecipe, clip),
    ),
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
  const sequenceTransitions = (expandedRecipe.sceneSequence?.scenes ?? expandedRecipe.routedSceneSequence?.scenes)?.flatMap((scene) => (
    scene.transitionOut ? [scene.transitionOut] : []
  )) ?? []
  const renderedSequenceTransitions = sequenceTransitions.filter((transition) => transition.kind !== 'cut')
  const sequenceHasCrossfade = expandedRecipe.routedSceneSequence
    ? renderedSequenceTransitions.some((transition) => transition.kind === 'crossfade')
    : expandedRecipe.sceneSequence?.scenes.some((scene, index, scenes) => (
        scene.transitionOut?.kind === 'crossfade'
        && scene.clipId !== scenes[index + 1]?.clipId
      )) ?? false
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
    : expandedRecipe.routedSceneSequence
      ? sequenceOutputDimension
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
  const renderTargetPixelCount = expandedRecipe.masterPixelCount ?? SHOW_MAX_OUTPUT_PIXELS
  const renderTargetArena = describeShowRenderTargetArena(
    renderTargetPixelCount,
    renderTargetArenaEmission,
  )
  const renderTargetCandidates = buildShowRenderTargetCandidates(expandedRecipe, renderTargetPixelCount)
  const preliminaryRenderTargetPlan = planShowRenderTargetCaches(renderTargetCandidates, {
    arena: renderTargetArena,
  })
  const selectedRenderTargetCandidates = new Set(
    preliminaryRenderTargetPlan.assignments.map((assignment) => assignment.candidateId),
  )
  const directSnapshotCrossfade = selectedRenderTargetCandidates.has(DIRECT_SNAPSHOT_CANDIDATE_ID)
  const sequenceSnapshotCrossfade = preliminaryRenderTargetPlan.assignments.some((assignment) => (
    assignment.candidateId.startsWith('transition:sequence:')
  ))
  const routedSnapshotCrossfade = preliminaryRenderTargetPlan.assignments.some((assignment) => (
    assignment.candidateId.startsWith('transition:routed:')
  ))
  const routedSceneEmission = expandedRecipe.routedSceneSequence
      ? emitRoutedSceneSequenceShowCode(
        members,
        expandedRecipe.routingLayouts ?? [],
        expandedRecipe.routedSceneSequence,
        routedOutputDimension,
        expandedRecipe.routingSwitches ?? [],
        expandedRecipe.routingPropertyRamps,
        expandedRecipe.masterPixelCount,
        renderTargetPixelCount,
        selectedRenderTargetCandidates,
        renderKernelSpecialization,
        motionTransitionSharing,
      )
      : null
  const emittedCode = routedSceneEmission
    ? routedSceneEmission.code
    : expandedRecipe.sceneSequence
    ? emitSceneSequenceShowCode(
        members,
        expandedRecipe.sceneSequence,
        sequenceOutputDimension,
        renderTargetPixelCount,
        selectedRenderTargetCandidates,
      )
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
        expandedRecipe.masterPixelCount,
      )
    : routeMode
      ? emitRouteShowCode(members, route.routes, routedOutputDimension, expandedRecipe.masterPixelCount)
    : expandedRecipe.adaptationRamp
      ? emitAdaptationRampShowCode(members[0], expandedRecipe.adaptationRamp, memberOutputDimension)
      : expandedRecipe.cut
        ? emitCutShowCode(members[0], members[1], expandedRecipe.cut, memberOutputDimension)
        : expandedRecipe.routeTransition
          ? portalTransition
            ? emitPortalTransitionShowCode(members[0], members[1], portalTransition)
            : emitRouteTransitionShowCode(members[0], members[1], expandedRecipe.routeTransition, transitionOutputDimension)
        : expandedRecipe.crossfade
          ? emitShowCode(
              members[0],
              members[1],
              expandedRecipe.crossfade,
              memberOutputDimension,
              renderTargetPixelCount,
              directSnapshotCrossfade,
            )
          : emitSingleClipShowCode(members[0], memberOutputDimension)
  const emittedWithEasingRuntime = emittedCode.includes('__pxlblz_show_cubicBezier(')
    ? `${showCubicBezierRuntimeSource()}\n${emittedCode}`
    : emittedCode
  const emittedWithSampleRemapping = expandedRecipe.samplePropertyRamps
    ? injectSampleRemappingUpdate(emittedWithEasingRuntime)
    : emittedWithEasingRuntime
  const expandedCode = renderTargetArenaEmission
    ? `${emitShowRenderTargetArenaSource(renderTargetPixelCount)}\n${emittedWithSampleRemapping}`
    : emittedWithSampleRemapping
  const compacted = compactGeneratedShowSymbols(expandedCode)
  const code = compacted.code
  const compiledOutputDimension = expandedRecipe.sceneSequence || expandedRecipe.routedSceneSequence
      ? expandedRecipe.routedSceneSequence ? routedOutputDimension : sequenceOutputDimension
      : portalTransition || directionalWipeTransition || motionTransition || spatialDissolveTransition
        ? 2
        : routeMode || routingLayouts
          ? routedOutputDimension
          : memberOutputDimension
  const metadata = buildMetadata(members, compiledOutputDimension)
  const patternVarBindings = Object.fromEntries(metadata.patternVars.flatMap((name) => {
    const runtimeName = compacted.names.get(name)
    return runtimeName ? [[name, runtimeName]] : []
  }))
  if (Object.keys(patternVarBindings).length > 0) metadata.patternVarBindings = patternVarBindings
  const sourceBytesBeforeMerge = members.reduce((sum, member) => sum + member.sourceBytes, 0)
  const expandedArtifactBytes = byteLength(expandedCode)
  const artifactBytes = byteLength(code)
  const resources = buildShowVmResourceLedger({
    pixelCount: expandedRecipe.masterPixelCount ?? SHOW_MAX_OUTPUT_PIXELS,
    members: members.map((member) => ({ owner: member.id, source: member.resourceSource })),
    generatedAllocations: inspectGeneratedShowVmAllocations(expandedCode),
    persistentGlobals: countShowPersistentGlobals(code),
    artifactBytes,
  })
  const renderTargetPlan = planShowRenderTargetCaches(renderTargetCandidates, {
    arena: renderTargetArena,
    resources,
  })
  const transitionCost = expandedRecipe.sceneSequence || expandedRecipe.routedSceneSequence
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
  const rendererPressure = showRendererPressure(expandedRecipe, transitionCost)
  const patternEvaluationOverride = showPatternEvaluationOverride(transitionCost, rendererPressure)
  const warnings = expandedRecipe.routedSceneSequence
    ? []
    : routingLayouts?.flatMap((layout) => layout.warnings) ?? route?.warnings ?? []
  const renderTargetCandidateById = new Map(renderTargetCandidates.map((candidate) => [candidate.id, candidate]))
  for (const decision of renderTargetPlan.decisions) {
    const candidate = renderTargetCandidateById.get(decision.candidateId)
    if (decision.status !== 'rejected' || !candidate?.required) continue
    if (decision.candidateId === DIRECT_SNAPSHOT_CANDIDATE_ID && decision.reason === 'arena-unavailable') {
      warnings.push(
        'Snapshot/live crossfade fell back to live/live because the Show render-target arena is unavailable.',
      )
    } else {
      warnings.push(
        `Snapshot/live cache ${decision.candidateId} fell back to live/live (${decision.reason}): ${decision.detail}`,
      )
    }
  }
  const cost = buildShowCompiledCostMetadata({
    transitionCost,
    ...(patternEvaluationOverride
      ? { patternEvaluations: patternEvaluationOverride }
      : {}),
    artifactBytes,
    budgetBytes: MEASURED_DEVICE_BUDGET_BYTES,
    expectedActiveFraction: evaluationSummary.expectedActiveFraction,
    generatedScalarGlobals: (routingParameterEstimate?.scalarGlobals ?? 0)
      + (expandedRecipe.samplePropertyRamps ? 1 : 0)
      + members.reduce((count, member) => {
        if (showEffectsAreIdentity(member.effects) && !member.animatedEffects) return count
        const hasAffine = member.effects.some((effect) => ['translate', 'rotate', 'scale', 'shear'].includes(effect.kind))
        const parameters = member.animatedEffects
          ? member.effects.reduce((total, effect) => (
              total + (member.staticPlanEffects && ['translate', 'rotate', 'scale', 'shear'].includes(effect.kind)
                ? 0
                : showEffectParameterNames(effect).length)
            ), 0)
          : 0
        const affineGlobals = hasAffine
          ? 6 + (member.animatedEffects && !member.staticPlanEffects ? 6 : 0)
          : 0
        return count + parameters + affineGlobals
      }, 0),
    generatedArrayElements: resources.allocations
      .filter((allocation) => ['routing', 'plan', 'auxiliary-cache'].includes(allocation.category))
      .reduce((sum, allocation) => sum + allocation.elementCount, 0),
    warnings,
    effects: effectCost,
  })
  const routingSpecialization = exactSpecializations
    ? describeSelectedRoutingSpecialization(
        expandedRecipe,
        route?.routes ?? null,
        routingLayouts,
        routingRepresentation,
      )
    : null
  const captureSpecializations = exactSpecializations
    ? members.map((member) => describeCaptureSpecialization(member, compiledOutputDimension))
    : []
  const summary: ShowCompileSummary = {
    clipCount: members.length,
    transitionCount: expandedRecipe.sceneSequence || expandedRecipe.routedSceneSequence
      ? Math.max(0, (expandedRecipe.sceneSequence?.scenes ?? expandedRecipe.routedSceneSequence!.scenes).length - 1)
      : routingLayouts
      ? Math.max(
          expandedRecipe.routingSwitches?.length ?? 0,
          expandedRecipe.routingPropertyRamps?.splitPosition.ramps.length ?? 0,
        )
      : expandedRecipe.crossfade || expandedRecipe.cut || expandedRecipe.adaptationRamp || expandedRecipe.routeTransition ? 1 : 0,
    sourceBytesBeforeMerge,
    expandedArtifactBytes,
    artifactBytes,
    measuredDeviceBudgetBytes: MEASURED_DEVICE_BUDGET_BYTES,
    artifactBudgetRatio: artifactBytes / MEASURED_DEVICE_BUDGET_BYTES,
    renderPolicy: expandedRecipe.sceneSequence || expandedRecipe.routedSceneSequence
      ? sequenceSnapshotCrossfade || routedSnapshotCrossfade
        ? 'snapshot-outgoing-transition-live-incoming'
        : sequenceHasCrossfade || motionBlend
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
        ? directSnapshotCrossfade
          ? 'snapshot-outgoing-transition-live-incoming'
          : 'steady-active-transition-both'
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
    routePolicy: expandedRecipe.sceneSequence || expandedRecipe.routedSceneSequence
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
    steadyStateRenderersPerPixel: rendererPressure.steady,
    worstInstantRenderersPerPixel: rendererPressure.worst,
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
    renderTarget: describeShowRenderTargetArena(
      renderTargetPixelCount,
      renderTargetArenaEmission,
      directSnapshotCrossfade || sequenceSnapshotCrossfade || routedSnapshotCrossfade ? 'stage-rgb' : null,
    ),
    renderTargetPlan,
    specializations: {
      routing: routingSpecialization,
      capture: captureSpecializations,
      frameInvariants: members.map((member) => ({
        clipId: member.id,
        ...member.frameInvariantSummary,
      })),
      renderKernels: routedSceneEmission?.renderKernels ?? null,
      motionTransitions: routedSceneEmission?.motionTransitions ?? null,
    },
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
    resources,
    warnings,
    cost,
  }

  return {
    code,
    expandedCode,
    fxCode: emitFixedPoint(code),
    metadata,
    summary,
  }
}

function describeSelectedRoutingSpecialization(
  recipe: ShowRecipe,
  directRoutes: ResolvedRoute[] | null,
  layouts: ResolvedRoutingLayout[] | null,
  representation: ShowCompileSummary['routingRepresentation'],
): Omit<PhysicalRoutingShortCircuitPlan, 'ranges'> | null {
  let plan: PhysicalRoutingShortCircuitPlan | null = null
  if (layouts && representation === 'range-branches') {
    if (recipe.routedSceneSequence) {
      const sharedPhysicalCut = recipe.routingLayouts?.length === 1
        && !recipe.routingLayouts[0].logical
        && recipe.routedSceneSequence.scenes.every((scene) => (
          (!scene.transitionOut || scene.transitionOut.kind === 'cut')
          && scene.placements.every((placement) => (
            placement.zoneMode !== 'span'
            || !placement.domainZoneNames?.length
            || (placement.domainZoneNames.length === 1 && placement.domainZoneNames[0] === placement.zoneName)
          ))
        ))
      if (sharedPhysicalCut) {
        plan = planPhysicalRoutingShortCircuit(
          recipe.routingLayouts![0].zones.map((zone) => ({ ranges: zone.ranges })),
          recipe.masterPixelCount,
        )
      }
    } else {
      const plans = layouts.map((layout) => planPhysicalRoutingShortCircuit(
        layout.routes.map((route) => ({ ranges: route.zone.ranges })),
        recipe.masterPixelCount,
      ))
      if (plans.every((candidate): candidate is PhysicalRoutingShortCircuitPlan => candidate !== null)) {
        plan = plans.reduce((largest, candidate) => (
          candidate.baselineMaxComparisonsPerPixel > largest.baselineMaxComparisonsPerPixel
            ? candidate
            : largest
        ))
      }
    }
  } else if (!layouts && directRoutes) {
    plan = planPhysicalRoutingShortCircuit(
      directRoutes.map((route) => ({ ranges: route.zone.ranges })),
      recipe.masterPixelCount,
    )
  }
  if (!plan) return null
  const { ranges: _ranges, ...summary } = plan
  return summary
}

function describeCaptureSpecialization(
  member: CompiledMember,
  outputDimension: ShowOutputDimension,
): ShowCompileSummary['specializations']['capture'][number] {
  const effectRuntime = describeMemberEffectRuntime(member)
  const compatibility = selectRenderCompatibility(outputDimension, {
    hasBeforeRender: member.hasBeforeRender,
    hasRender: member.hasRender,
    hasRender2D: member.hasRender2D,
    hasRender3D: member.hasRender3D,
  })
  const rendererGuaranteesOutput = compatibility.renderer
    ? member.outputGuarantees[compatibility.renderer]
    : false
  const samplePath = !member.needsMirrorMapping
    && !member.samplePropertyRamps
    && !effectRuntime?.hasCoordinates
    ? 'identity' as const
    : 'mapped' as const
  const hasOutputEffects = member.effects.some((effect) => (
    isShowColorEffect(effect) && (member.animatedEffects || !showEffectsAreIdentity([effect]))
  ))
  const outputPath = hasOutputEffects
    ? 'effects' as const
    : member.needsBrightnessScale ? 'brightness' as const : 'identity' as const
  const omitClear = rendererGuaranteesOutput && !member.adaptation.lightShutter
  return {
    clipId: member.id,
    samplePath,
    outputPath,
    clearPolicy: omitClear ? 'omitted-guaranteed-output' : 'retained',
    operationsAvoidedPerEvaluatedPixel:
      (samplePath === 'identity' ? 1 : 0)
      + (member.needsBrightnessScale ? 0 : 3)
      + (omitClear ? 3 : 0),
  }
}

function validateRecipe(recipe: ShowRecipe): void {
  const routeMode = recipe.clips.some((clip) => routeTargets(clip).length > 0)
  const boundaryModes = [recipe.crossfade, recipe.cut, recipe.adaptationRamp, recipe.routeTransition, recipe.sceneSequence, recipe.routedSceneSequence].filter(Boolean).length
  if (recipe.clips.length < 1) throw new Error('compileShow requires at least one clip.')
  if (!routeMode && !recipe.sceneSequence && !recipe.routedSceneSequence && recipe.clips.length > 2) throw new Error('compileShow v1 requires one or two unrouted clips.')
  if (boundaryModes > 1) throw new Error('compileShow accepts only one boundary mode.')
  if (routeMode && boundaryModes > 0 && !recipe.routedSceneSequence) throw new Error('compileShow routed clips cannot use scene boundary modes yet.')
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
  if (recipe.routedSceneSequence) {
    const clipIds = new Set(recipe.clips.map((clip) => clip.id))
    const zoneNames = new Set((recipe.routingLayouts ?? []).flatMap((layout) => (
      layout.logical?.zoneNames ?? layout.zones.map((zone) => zone.name)
    )))
    if (!recipe.routingLayouts?.length) throw new Error('compileShow routed scene sequences require at least one routing layout.')
    if (recipe.routedSceneSequence.scenes.length < 2) throw new Error('compileShow routed scene sequences require at least two scenes.')
    recipe.routedSceneSequence.scenes.forEach((scene, index) => {
      if (scene.holdMs <= 0) throw new Error('compileShow routed scene sequence holds must be positive.')
      const placedZoneOrders = new Set<string>()
      for (const placement of scene.placements) {
        if (!clipIds.has(placement.clipId)) {
          throw new Error(`compileShow routed scene sequence references missing clip "${placement.clipId}".`)
        }
        if (!zoneNames.has(placement.zoneName)) {
          throw new Error(`compileShow routed scene sequence references missing zone "${placement.zoneName}".`)
        }
        const placementKey = `${placement.zoneName}:${placement.stackOrder ?? 0}`
        if (placedZoneOrders.has(placementKey)) {
          throw new Error(`compileShow routed scene sequence repeats stack order ${placement.stackOrder ?? 0} in zone "${placement.zoneName}".`)
        }
        placedZoneOrders.add(placementKey)
        if (!Number.isInteger(placement.stackOrder ?? 0) || (placement.stackOrder ?? 0) < 0) {
          throw new Error('compileShow routed Scene stack order must be a non-negative integer.')
        }
        if (!Number.isFinite(placement.opacity ?? 1) || (placement.opacity ?? 1) < 0 || (placement.opacity ?? 1) > 1) {
          throw new Error('compileShow routed Scene layer opacity must be between 0 and 1.')
        }
      }
      validateRoutedScenePropertyTracks(recipe, scene)
      const isFinal = index === recipe.routedSceneSequence!.scenes.length - 1
      if (isFinal && scene.transitionOut) throw new Error('compileShow routed scene sequence final scene cannot transition.')
      if (scene.transitionOut && scene.transitionOut.kind !== 'cut' && scene.transitionOut.durationMs <= 0) {
        throw new Error('compileShow routed scene sequence transitions must be positive.')
      }
    })
  }
  if (routeMode && !recipe.zones) {
    throw new Error('compileShow routed clips require controller zones.')
  }
  if (recipe.routingLayouts) {
    if (!routeMode && !recipe.routedSceneSequence) throw new Error('compileShow routing layouts require routed clips.')
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

function validateRoutedScenePropertyTracks(
  recipe: ShowRecipe,
  scene: ShowRoutedSceneSequenceSceneRecipe,
): void {
  const trackIds = new Set<string>()
  const keyframeIds = new Set<string>()
  const targetKeys = new Set<string>()
  for (const track of scene.propertyTracks ?? []) {
    if (trackIds.has(track.id)) throw new Error(`compileShow property track id "${track.id}" is duplicated.`)
    trackIds.add(track.id)
    const targetKey = JSON.stringify(track.target)
    if (targetKeys.has(targetKey)) throw new Error('compileShow property tracks repeat one typed target in a Scene.')
    targetKeys.add(targetKey)
    if (track.keyframes.length < 2) throw new Error(`compileShow property track "${track.id}" needs at least two keyframes.`)
    track.keyframes.forEach((keyframe, index) => {
      if (keyframeIds.has(keyframe.id)) throw new Error(`compileShow keyframe id "${keyframe.id}" is duplicated.`)
      keyframeIds.add(keyframe.id)
      if (!Number.isFinite(keyframe.timeMs) || !Number.isInteger(keyframe.timeMs) || keyframe.timeMs < 0) {
        throw new Error(`compileShow property track "${track.id}" requires non-negative whole-millisecond keyframes.`)
      }
      if (!Number.isFinite(keyframe.value)) throw new Error(`compileShow property track "${track.id}" requires finite values.`)
      if (!validateShowEasing(keyframe.easing).valid) throw new Error(`compileShow property track "${track.id}" has invalid easing.`)
      if (index > 0 && keyframe.timeMs <= track.keyframes[index - 1].timeMs) {
        throw new Error(`compileShow property track "${track.id}" keyframes must be strictly ordered.`)
      }
    })
    const target = track.target
    if (target.kind === 'instance-time-scale' || target.kind === 'instance-control') {
      const instanceId = target.instanceId
      const clip = recipe.clips.find((candidate) => candidate.id === instanceId)
      if (!clip) throw new Error(`compileShow property track "${track.id}" references missing Pattern instance "${instanceId}".`)
      if (target.kind === 'instance-control' && !(target.exportName in (clip.controlTargets ?? {}))) {
        throw new Error(`compileShow property track "${track.id}" references missing control "${target.exportName}".`)
      }
      continue
    }
    const placementId = target.placementId
    const placement = scene.placements.find((candidate) => candidate.placementId === placementId)
    if (!placement) throw new Error(`compileShow property track "${track.id}" references missing placement "${placementId}".`)
    if (target.kind === 'placement-opacity' && placement.opacity === undefined) {
      throw new Error(`compileShow property track "${track.id}" targets opacity on a non-overlay placement.`)
    }
    if (target.kind !== 'placement-effect') continue
    const effectId = target.effectId
    const effect = placement.effects?.find((candidate) => candidate.id === effectId)
    if (!effect) throw new Error(`compileShow property track "${track.id}" references missing Effect "${effectId}".`)
    if (effect.kind !== target.effectKind) throw new Error(`compileShow property track "${track.id}" Effect identity changed from ${target.effectKind} to ${effect.kind}.`)
    const field = showClipEffectPersistedField(effect.kind, target.parameterId)
    try {
      showEffectNumericValue(effect, field)
    } catch {
      throw new Error(`compileShow property track "${track.id}" references missing Effect parameter "${target.parameterId}".`)
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

function showMemberNeedsMirrorMapping(recipe: ShowRecipe, clip: ShowClipRecipe): boolean {
  if (clip.adaptation?.mirror) return true
  if (recipe.adaptationRamp && recipe.clips[0]?.id === clip.id) {
    if (recipe.adaptationRamp.from.mirror || recipe.adaptationRamp.to.mirror) return true
  }
  return recipe.routedSceneSequence?.scenes.some((scene) => scene.placements.some((placement) => (
    placement.clipId === clip.id && placement.mirror === true
  ))) ?? false
}

function showMemberNeedsBrightnessScale(recipe: ShowRecipe, clip: ShowClipRecipe): boolean {
  if ((clip.adaptation?.brightness ?? 1) !== 1) return true
  if (recipe.adaptationRamp && recipe.clips[0]?.id === clip.id) {
    const ramp = recipe.adaptationRamp
    if ((ramp.from.brightness ?? 1) !== 1 || (ramp.to.brightness ?? 1) !== 1 || ramp.propertyRamps?.brightness) return true
  }
  if (recipe.sceneSequence?.scenes.some((scene) => (
    scene.clipId === clip.id
    && ((scene.brightness ?? 1) !== 1 || Boolean(scene.transitionOut?.propertyRamps?.brightness))
  ))) return true
  return recipe.routedSceneSequence?.scenes.some((scene) => {
    const placements = scene.placements.filter((placement) => placement.clipId === clip.id)
    if (placements.some((placement) => (placement.brightness ?? 1) !== 1)) return true
    if (scene.transitionRamps?.some((ramp) => ramp.clipId === clip.id && Boolean(ramp.propertyRamps?.brightness))) return true
    return (scene.propertyTracks ?? []).some((track) => {
      if (track.target.kind !== 'placement-view' || track.target.property !== 'brightness') return false
      const placementId = track.target.placementId
      return placements.some((placement) => placement.placementId === placementId)
    })
  }) ?? false
}

function compileMember(
  clip: ShowClipRecipe,
  index: number,
  libraries: Record<string, string>,
  animatedEffects = false,
  staticPlanEffects = false,
  exactSpecializations = true,
  frameInvariantHoisting = true,
  outputPixelCount = 256,
  needsMirrorMapping = Boolean(clip.adaptation?.mirror),
  needsBrightnessScale = (clip.adaptation?.brightness ?? 1) !== 1,
): CompiledMember {
  const bundled = bundle(clip.source, libraries)
  const prefix = `__pxlblz_show_c${index}`
  const frameCandidates = frameInvariantHoisting
    ? analyzeShowFrameInvariantCandidates(bundled.code)
    : []
  const frameHoistSourceAllowance = 1_024
  const framePlan = selectShowFrameInvariantHoists(frameCandidates, {
    pixelCount: outputPixelCount,
    currentArtifactBytes: byteLength(bundled.code),
    artifactBudgetBytes: MEASURED_DEVICE_BUDGET_BYTES,
    maxAddedBytes: frameHoistSourceAllowance,
    minimumAvoidedOperationsPerFrame: 128,
  })
  let selectedFrameCandidates = framePlan.selected
  let frameHoists = applyShowFrameInvariantHoists(bundled.code, selectedFrameCandidates)
  while (frameHoists.addedSourceBytes > frameHoistSourceAllowance && selectedFrameCandidates.length > 0) {
    selectedFrameCandidates = selectedFrameCandidates.slice(0, -1)
    frameHoists = applyShowFrameInvariantHoists(bundled.code, selectedFrameCandidates)
  }
  const memberSource = frameHoists.source
  const memberAst = parseModule(memberSource)
  const bindings = collectTopLevelBindings(memberAst)
  const mapping = new Map([...bindings].map(name => [name, `${prefix}_${name}`]))
  const code = rewriteMemberSource(memberSource, memberAst, prefix, mapping).replace(/\bexport\s+/g, '')
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
    adaptation: normalizeAdaptation(clip.adaptation),
    controls,
    effects: normalizeShowClipEffects(clip.effects),
    animatedEffects,
    staticPlanEffects,
    exactSpecializations,
    outputGuarantees: exactSpecializations
      ? analyzeShowRendererOutputGuaranteesAst(memberAst)
      : { render: false, render2D: false, render3D: false },
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
  }
}

function emitShowCode(
  from: CompiledMember,
  to: CompiledMember,
  crossfade: ShowCrossfadeRecipe,
  outputDimension: ShowOutputDimension,
  renderTargetPixelCount: number,
  snapshotLive: boolean,
): string {
  const transitionEnd = crossfade.startMs + crossfade.durationMs
  const members = [from, to]
  const renderTarget = planShowRenderTargetArena(renderTargetPixelCount, 'stage-rgb')
  return [
    emitRuntimePrelude(members, outputDimension),
    ...members.map(member => member.code.trim()),
    ...(snapshotLive ? ['var __pxlblz_show_snapshot_ready = 0'] : []),
    emitScheduler(
      from,
      to,
      crossfade.startMs,
      transitionEnd,
      crossfade.durationMs,
      'linear',
      snapshotLive,
    ),
    snapshotLive
      ? emitSnapshotLiveRender(from, to, outputDimension, renderTarget)
      : emitRender(from, to, outputDimension),
    '',
  ].join('\n\n')
}

function emitSingleClipShowCode(member: CompiledMember, outputDimension: ShowOutputDimension): string {
  const render = emitOuterRenderer(outputDimension, `  ${emitMemberCaptureCall(member, outputDimension)}
  ${member.prefix}_emit()`)
  return [
    emitRuntimePrelude([member], outputDimension),
    member.code.trim(),
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_s = __pxlblz_show_elapsed_s + delta / 1000
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
    emitRuntimePrelude([from, to], outputDimension),
    from.code.trim(),
    to.code.trim(),
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_s = __pxlblz_show_elapsed_s + delta / 1000
  if (__pxlblz_show_elapsed_s < ${cut.startMs / 1000}) {
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
  const elapsedRampMs = `(__pxlblz_show_elapsed_s - ${ramp.startMs / 1000}) * 1000`
  const propertyAssignments = emitPropertyRampAssignments(member, ramp.propertyRamps, elapsedRampMs)
  const controlAssignments = emitControlRampAssignments(member, ramp.controlRamps, elapsedRampMs)
  const effectAssignments = emitEffectRampAssignments(member, ramp.effectRamps, elapsedRampMs)
  return [
    emitRuntimePrelude([member], outputDimension, { includeAdaptationMix: true }),
    member.code.trim(),
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_s = __pxlblz_show_elapsed_s + delta / 1000
  if (__pxlblz_show_elapsed_s < ${ramp.startMs / 1000}) {
    __pxlblz_show_mix = 0
  } else if (__pxlblz_show_elapsed_s < ${transitionEnd / 1000}) {
    __pxlblz_show_mix = ${emitShowEasingExpression(ramp.easing ?? 'linear', `(__pxlblz_show_elapsed_s - ${ramp.startMs / 1000}) / ${ramp.durationMs / 1000}`)}
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
    emitRuntimePrelude([from, to], outputDimension),
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
    emitRuntimePrelude([from, to], outputDimension),
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
    emitRuntimePrelude([from, to], 2),
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
    emitRuntimePrelude([from, to], 2),
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
    emitRuntimePrelude([from, to], outputDimension),
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
    emitRuntimePrelude([from, to], 2),
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
  renderTargetPixelCount: number,
  selectedRenderTargetCandidates: ReadonlySet<string>,
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
  const snapshotSegments = segments.filter((segment) => (
    segment.kind === 'transition'
    && segment.transition?.kind === 'crossfade'
    && segment.transition.crossfadePolicy === 'snapshot-live'
    && segment.from !== segment.to
    && selectedRenderTargetCandidates.has(sequenceSnapshotCandidateId('sequence', segment.sceneIndex))
  ))
  const usesSnapshot = snapshotSegments.length > 0
  const renderTarget = planShowRenderTargetArena(renderTargetPixelCount, 'stage-rgb')
  const schedulerBranches = segments.map((segment, index) => {
    const condition = `${index === 0 ? 'if' : 'else if'} (__pxlblz_show_elapsed_s < ${segment.endMs / 1000})`
    if (segment.kind === 'hold') {
      return `${condition} {
    __pxlblz_show_scene = ${segment.sceneIndex}
    __pxlblz_show_transition = -1
    __pxlblz_show_mix = 0${usesSnapshot ? '\n    __pxlblz_show_snapshot_transition = -1\n    __pxlblz_show_snapshot_ready = 0' : ''}${emitSceneControlTargets(segment.from, scenes[segment.sceneIndex].controlTargets)}${emitSceneEffectTargets(segment.from, scenes[segment.sceneIndex].effects)}${scenes[segment.sceneIndex].brightness === undefined
      ? ''
      : `\n    ${segment.from.prefix}_adapt_brightness = ${scenes[segment.sceneIndex].brightness}`}${scenes[segment.sceneIndex].timeScale === undefined
        ? ''
        : `\n    ${segment.from.prefix}_adapt_timeScale = ${scenes[segment.sceneIndex].timeScale}`}
    ${segment.from.prefix}_advance(delta)
  }`
    }
    const to = segment.to!
    const advanceTo = to === segment.from ? '' : `\n    ${to.prefix}_advance(delta)`
    const snapshotEntry = usesSnapshot
      && segment.transition?.kind === 'crossfade'
      && segment.transition.crossfadePolicy === 'snapshot-live'
      && segment.from !== to
      && selectedRenderTargetCandidates.has(sequenceSnapshotCandidateId('sequence', segment.sceneIndex))
      ? `
    if (__pxlblz_show_snapshot_transition != ${segment.sceneIndex}) {
      __pxlblz_show_snapshot_transition = ${segment.sceneIndex}
      __pxlblz_show_snapshot_ready = 0
    }`
      : ''
    return `${condition} {
    __pxlblz_show_scene = ${segment.sceneIndex}
    __pxlblz_show_transition = ${segment.sceneIndex}
    __pxlblz_show_mix = ${emitShowEasingExpression(segment.transition!.easing ?? 'linear', `(__pxlblz_show_elapsed_s - ${segment.startMs / 1000}) / ${segment.transition!.durationMs / 1000}`)}${snapshotEntry}${segment.transition!.propertyRamps
      ? `\n${indentBlock(emitPropertyRampAssignments(segment.from, segment.transition!.propertyRamps, `(__pxlblz_show_elapsed_s - ${segment.startMs / 1000}) * 1000`), 4)}`
      : ''}${segment.transition!.controlRamps
        ? `\n${indentBlock(emitControlRampAssignments(segment.from, segment.transition!.controlRamps, `(__pxlblz_show_elapsed_s - ${segment.startMs / 1000}) * 1000`), 4)}`
        : ''}${segment.transition!.effectRamps
          ? `\n${indentBlock(emitEffectRampAssignments(segment.from, segment.transition!.effectRamps, `(__pxlblz_show_elapsed_s - ${segment.startMs / 1000}) * 1000`), 4)}`
        : ''}
    ${segment.from.prefix}_advance(delta)${advanceTo}
  }`
  }).join(' ')
  const transitionBranches = segments
    .filter((segment) => segment.kind === 'transition')
    .map((segment, index) => `${index === 0 ? 'if' : 'else if'} (__pxlblz_show_transition == ${segment.sceneIndex}) {
${indentBlock(
  segment.transition?.kind === 'crossfade'
    && segment.transition.crossfadePolicy === 'snapshot-live'
    && segment.from !== segment.to
    && selectedRenderTargetCandidates.has(sequenceSnapshotCandidateId('sequence', segment.sceneIndex))
    ? emitSnapshotLiveCrossfadeBlock(
        segment.from,
        segment.to!,
        memberRenderCapture(segment.from, outputDimension),
        memberRenderCapture(segment.to!, outputDimension),
        renderTarget,
      )
    : emitSceneSequenceTransitionBlock(segment.from, segment.to!, segment.transition!, outputDimension),
  4,
)}
  }`)
    .join(' ')
  const sceneBranches = scenes.map((scene, index) => `${index === 0 ? 'if' : 'else if'} (__pxlblz_show_scene == ${index}) {
    ${memberRenderCapture(scene.member, outputDimension)}
    ${scene.member.prefix}_emit()
  }`).join(' ')

  return [
    emitRuntimePrelude(members, outputDimension, {
      includeHash: transitionBranches.includes('__pxlblz_show_hash01'),
    }),
    ...members.map((member) => member.code.trim()),
    'var __pxlblz_show_scene = 0',
    'var __pxlblz_show_transition = -1',
    ...(usesSnapshot
      ? ['var __pxlblz_show_snapshot_transition = -1', 'var __pxlblz_show_snapshot_ready = 0']
      : []),
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_s = (__pxlblz_show_elapsed_s + delta / 1000) % ${cursor / 1000}
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

function emitRoutedSceneSequenceShowCode(
  members: CompiledMember[],
  layouts: ShowRoutingLayoutRecipe[],
  sequence: ShowRoutedSceneSequenceRecipe,
  outputDimension: 1 | 2,
  switches: ShowRoutingSwitchRecipe[],
  propertyRamps?: ShowRoutingPropertyRampsRecipe,
  outputPixelCount?: number,
  renderTargetPixelCount = SHOW_MAX_OUTPUT_PIXELS,
  selectedRenderTargetCandidates: ReadonlySet<string> = new Set(),
  renderKernelSpecialization = false,
  motionTransitionSharing: 'auto' | 'none' | 'structure' | 'exact' = 'auto',
): {
  code: string
  renderKernels: ShowCompileSummary['specializations']['renderKernels']
  motionTransitions: ShowCompileSummary['specializations']['motionTransitions']
} {
  if (layouts.length === 0) throw new Error('compileShow routed scene sequence requires a routing layout.')
  const layoutIndex = new Map(layouts.map((layout, index) => [layout.id, index]))
  const memberById = new Map(members.map((member) => [member.id, member]))
  const physicalZonesByName = new Map(layouts.flatMap((layout) => layout.zones).map((zone) => [zone.name, zone]))
  const logicalZoneCount = Math.max(1, ...layouts.map((layout) => layout.logical?.zoneNames.length ?? 0))
  const scenes = sequence.scenes.map((scene, sceneIndex) => ({
    ...scene,
    sceneIndex,
    placements: scene.placements.map((placement) => ({ ...placement, member: memberById.get(placement.clipId)! })),
    transitionRamps: scene.transitionRamps?.map((ramp) => ({ ...ramp, member: memberById.get(ramp.clipId)! })),
  }))
  const segments: Array<{
    kind: 'hold' | 'transition'
    startMs: number
    endMs: number
    sceneIndex: number
    transition?: ShowSceneSequenceTransitionRecipe
  }> = []
  const sceneStartMs = new Map<number, number>()
  let cursor = 0
  scenes.forEach((scene, sceneIndex) => {
    const startMs = cursor
    sceneStartMs.set(sceneIndex, startMs)
    cursor += scene.holdMs
    segments.push({ kind: 'hold', startMs, endMs: cursor, sceneIndex })
    if (scene.transitionOut && scene.transitionOut.kind !== 'cut') {
      const transitionStart = cursor
      cursor += scene.transitionOut.durationMs
      segments.push({
        kind: 'transition',
        startMs: transitionStart,
        endMs: cursor,
        sceneIndex,
        transition: scene.transitionOut,
      })
    }
  })
  const snapshotSegments = segments.filter((segment) => (
    segment.kind === 'transition'
    && segment.transition?.kind === 'crossfade'
    && segment.transition.crossfadePolicy === 'snapshot-live'
    && selectedRenderTargetCandidates.has(sequenceSnapshotCandidateId('routed', segment.sceneIndex))
  ))
  const usesSnapshot = snapshotSegments.length > 0
  const renderTarget = planShowRenderTargetArena(renderTargetPixelCount, 'stage-rgb')
  const motionSegments = segments.filter((segment): segment is typeof segment & {
    kind: 'transition'
    transition: ShowSceneSequenceTransitionRecipe & { kind: 'motion' }
  } => segment.kind === 'transition' && segment.transition?.kind === 'motion')
  const motionStackNeedsClear = motionSegments.some((segment) => {
    const settings = normalizeShowMotionTransition(segment.transition)
    return settings.edgePolicy === 'blend' && settings.addressPolicy === 'clip'
  })
  const exactSharedMotionPlan = (() => {
    if (motionSegments.length === 0 || motionSegments.length !== segments.filter((segment) => segment.kind === 'transition').length) return null
    if (outputDimension !== 2 || layouts.length !== 1 || switches.length > 0 || propertyRamps) return null
    const logical = layouts[0].logical
    if (!logical || logical.kind !== 'single' || logical.zoneNames.length !== 1) return null
    if (scenes.some((scene) => (scene.propertyTracks?.length ?? 0) > 0 || (scene.transitionRamps?.length ?? 0) > 0)) return null
    const zoneName = logical.zoneNames[0]
    const stackPlans: Array<{ prefix: string; wrapper: string; member: CompiledMember }> = []
    const planIndexByKey = new Map<string, number>()
    const planIndexByScene = new Map<number, number>()
    for (const scene of scenes) {
      const stacks = groupRoutedPlacementsByZone(scene.placements)
      if (stacks.size !== 1) return null
      const stack = stacks.get(zoneName)
      if (!stack || stack.length === 0) return null
      const canonicalPrefix = '__pxlblz_show_motion_stack_plan'
      const key = emitRoutedSceneStackWrapper(stack, canonicalPrefix, 2, undefined, undefined, motionStackNeedsClear)
      let planIndex = planIndexByKey.get(key)
      if (planIndex === undefined) {
        planIndex = stackPlans.length
        const prefix = `__pxlblz_show_motion_stack_${planIndex}`
        stackPlans.push({
          prefix,
          wrapper: emitRoutedSceneStackWrapper(stack, prefix, 2, undefined, undefined, motionStackNeedsClear),
          member: routedSceneCompositeMember(stack, prefix),
        })
        planIndexByKey.set(key, planIndex)
      }
      planIndexByScene.set(scene.sceneIndex, planIndex)
    }
    return { logical, zoneName, stackPlans, planIndexByScene }
  })()
  const directionSharedMotionPlan = (() => {
    if (!exactSharedMotionPlan) return null
    const groups: Array<{
      id: number
      transition: ShowSceneSequenceTransitionRecipe & { kind: 'motion' }
      fromPlanIndex: number
      toPlanIndex: number
      sceneIndices: number[]
    }> = []
    const groupIndexByKey = new Map<string, number>()
    const groupIndexByScene = new Map<number, number>()
    for (const segment of motionSegments) {
      const settings = normalizeShowMotionTransition(segment.transition)
      if (!['cover', 'reveal', 'push'].includes(settings.motionVariant)) continue
      const fromPlanIndex = exactSharedMotionPlan.planIndexByScene.get(segment.sceneIndex)
      const toPlanIndex = exactSharedMotionPlan.planIndexByScene.get(segment.sceneIndex + 1)
      if (fromPlanIndex === undefined || toPlanIndex === undefined) return null
      const key = [
        fromPlanIndex,
        toPlanIndex,
        settings.motionVariant,
        settings.addressPolicy,
        settings.edgePolicy,
      ].join(':')
      let groupIndex = groupIndexByKey.get(key)
      if (groupIndex === undefined) {
        groupIndex = groups.length
        groups.push({
          id: groupIndex,
          transition: segment.transition,
          fromPlanIndex,
          toPlanIndex,
          sceneIndices: [],
        })
        groupIndexByKey.set(key, groupIndex)
      }
      groups[groupIndex].sceneIndices.push(segment.sceneIndex)
      groupIndexByScene.set(segment.sceneIndex, groupIndex)
    }
    return { groups, groupIndexByScene }
  })()
  const zoomInSharedMotionPlan = (() => {
    if (!exactSharedMotionPlan) return null
    const groups: Array<{
      id: number
      transition: ShowSceneSequenceTransitionRecipe & { kind: 'motion' }
      fromPlanIndex: number
      toPlanIndex: number
      sceneIndices: number[]
    }> = []
    const groupIndexByKey = new Map<string, number>()
    const groupIndexByScene = new Map<number, number>()
    for (const segment of motionSegments) {
      const settings = normalizeShowMotionTransition(segment.transition)
      if (settings.motionVariant !== 'zoom-in') continue
      const fromPlanIndex = exactSharedMotionPlan.planIndexByScene.get(segment.sceneIndex)
      const toPlanIndex = exactSharedMotionPlan.planIndexByScene.get(segment.sceneIndex + 1)
      if (fromPlanIndex === undefined || toPlanIndex === undefined) return null
      const key = [fromPlanIndex, toPlanIndex, settings.addressPolicy, settings.edgePolicy].join(':')
      let groupIndex = groupIndexByKey.get(key)
      if (groupIndex === undefined) {
        groupIndex = groups.length
        groups.push({
          id: (directionSharedMotionPlan?.groups.length ?? 0) + groupIndex,
          transition: segment.transition,
          fromPlanIndex,
          toPlanIndex,
          sceneIndices: [],
        })
        groupIndexByKey.set(key, groupIndex)
      }
      groups[groupIndex].sceneIndices.push(segment.sceneIndex)
      groupIndexByScene.set(segment.sceneIndex, groupIndex)
    }
    return { groups, groupIndexByScene }
  })()
  const exactCandidateEnabled = motionTransitionSharing !== 'none' && exactSharedMotionPlan !== null
  const familyKernelEnabled = exactCandidateEnabled && motionTransitionSharing !== 'structure'
  const sceneLocalTimeExpression = (sceneIndex: number) => {
    const scene = scenes[sceneIndex]
    const offset = scene.localTimeOffsetMs ?? 0
    return `((__pxlblz_show_elapsed_s - ${(sceneStartMs.get(sceneIndex) ?? 0) / 1000}) * 1000 + ${offset})`
  }

  const setupEntriesForPlacements = (
    placements: typeof scenes[number]['placements'],
    ramps?: ResolvedRoutedScenePlacementRamp[],
    propertyTrackContexts?: Array<{ tracks: ShowPropertyAnimationTrack[]; localTimeExpression: string }>,
  ): Array<{ member: CompiledMember; code: string }> => {
    const byMember = new Map<CompiledMember, typeof placements>()
    for (const placement of placements) {
      byMember.set(placement.member, [...(byMember.get(placement.member) ?? []), placement])
    }
    return [...byMember.entries()].map(([member, memberPlacements]) => {
      const placement = memberPlacements[0]
      const physicalPixelCount = Math.max(0, ...memberPlacements.map((candidate) => {
        if (candidate.zoneMode === 'span' && candidate.domainZoneNames?.length) {
          return candidate.domainZoneNames.reduce((sum, name) => {
            const zone = physicalZonesByName.get(name)
            return sum + (zone ? controllerZonePixelCount(zone) : 0)
          }, 0)
        }
        const zone = physicalZonesByName.get(candidate.zoneName)
        return zone ? controllerZonePixelCount(zone) : 0
      }))
      const pixelCount = physicalPixelCount > 0
        ? `${physicalPixelCount}`
        : `max(1, floor(pixelCount / ${logicalZoneCount}))`
      const rampAssignments = emitRoutedSceneRampAssignments(
        ramps?.filter((ramp) => ramp.member === member),
        '(__pxlblz_show_elapsed_s - __pxlblz_show_transition_start_s) * 1000',
      )
      const propertyTrackAssignments = (propertyTrackContexts ?? []).map((context) => (
        emitRoutedInstancePropertyTrackAssignments(member, context.tracks, context.localTimeExpression)
      )).filter(Boolean).join('\n')
      const code = `${member.pixelCountName} = ${pixelCount}${emitSceneControlTargets(member, placement.controlTargets)}${emitSceneEffectTargets(member, placement.effects)}${placement.brightness === undefined
        ? ''
        : `\n${member.prefix}_adapt_brightness = ${placement.brightness}`}${placement.timeScale === undefined
          ? ''
          : `\n${member.prefix}_adapt_timeScale = ${placement.timeScale}`}${rampAssignments
            ? `\n${rampAssignments}`
            : ''}${propertyTrackAssignments
              ? `\n${propertyTrackAssignments}`
              : ''}
${member.prefix}_advance(delta)`
      return {
        member,
        code: code.split('\n').map((line) => line.trim()).filter(Boolean).join('\n'),
      }
    })
  }
  const setupForPlacements = (
    placements: typeof scenes[number]['placements'],
    ramps?: ResolvedRoutedScenePlacementRamp[],
    propertyTrackContexts?: Array<{ tracks: ShowPropertyAnimationTrack[]; localTimeExpression: string }>,
  ): string => setupEntriesForPlacements(placements, ramps, propertyTrackContexts)
    .map(({ code }) => indentBlock(code, 4))
    .join('\n')

  const canSharePhysicalCutRouting = layouts.length === 1
    && !layouts[0].logical
    && segments.every((segment) => segment.kind === 'hold')
    && scenes.every((scene) => scene.placements.every((placement) => (
      placement.zoneMode !== 'span'
      || !placement.domainZoneNames?.length
      || (placement.domainZoneNames.length === 1 && placement.domainZoneNames[0] === placement.zoneName)
    )))
  const holdSetupEntriesForScene = (sceneIndex: number) => setupEntriesForPlacements(
    scenes[sceneIndex].placements,
    undefined,
    scenes[sceneIndex].propertyTracks
      ? [{ tracks: scenes[sceneIndex].propertyTracks!, localTimeExpression: sceneLocalTimeExpression(sceneIndex) }]
      : undefined,
  )
  const canonicalCutScheduler = () => {
    const setupByScene = new Map<number, Map<CompiledMember, string>>()
    for (const segment of segments) {
      setupByScene.set(segment.sceneIndex, new Map(
        holdSetupEntriesForScene(segment.sceneIndex).map(({ member, code }) => [member, code]),
      ))
    }
    const durationRuns: Array<typeof segments> = []
    for (const segment of segments) {
      const duration = segment.endMs - segment.startMs
      const run = durationRuns[durationRuns.length - 1]
      const previous = run?.[run.length - 1]
      if (previous && previous.endMs - previous.startMs === duration && previous.sceneIndex + 1 === segment.sceneIndex) {
        run.push(segment)
      } else {
        durationRuns.push([segment])
      }
    }
    const sceneSelection = durationRuns.map((run, index) => {
      const first = run[0]
      const last = run[run.length - 1]
      const durationS = (first.endMs - first.startMs) / 1000
      const elapsed = first.startMs === 0
        ? '__pxlblz_show_elapsed_s'
        : `(__pxlblz_show_elapsed_s - ${first.startMs / 1000})`
      const steppedScene = run.length === 1
        ? `${first.sceneIndex}`
        : `${first.sceneIndex === 0 ? '' : `${first.sceneIndex} + `}floor(${elapsed} / ${durationS})`
      if (durationRuns.length === 1) return `__pxlblz_show_scene = ${steppedScene}`
      return `${index === 0 ? 'if' : index === durationRuns.length - 1 ? 'else' : 'else if'}${index === durationRuns.length - 1
        ? ''
        : ` (__pxlblz_show_elapsed_s < ${last.endMs / 1000})`} __pxlblz_show_scene = ${steppedScene}`
    }).join('\n')
    const minimumScene = segments[0].sceneIndex
    const maximumScene = segments[segments.length - 1].sceneIndex
    const sceneSetCondition = (sceneIndices: number[]) => {
      const runs: Array<{ start: number; end: number }> = []
      for (const sceneIndex of sceneIndices) {
        const run = runs[runs.length - 1]
        if (run && run.end + 1 === sceneIndex) run.end = sceneIndex
        else runs.push({ start: sceneIndex, end: sceneIndex })
      }
      return runs.map((run) => {
        if (run.start === minimumScene) return `__pxlblz_show_scene <= ${run.end}`
        if (run.end === maximumScene) return `__pxlblz_show_scene >= ${run.start}`
        if (run.start === run.end) return `__pxlblz_show_scene == ${run.start}`
        return `(__pxlblz_show_scene >= ${run.start} && __pxlblz_show_scene <= ${run.end})`
      }).join(' || ')
    }
    const setupGroups = members.flatMap((member) => {
      const scenesBySetup = new Map<string, number[]>()
      for (const segment of segments) {
        const setup = setupByScene.get(segment.sceneIndex)?.get(member) ?? ''
        scenesBySetup.set(setup, [...(scenesBySetup.get(setup) ?? []), segment.sceneIndex])
      }
      return [...scenesBySetup.entries()].flatMap(([setup, sceneIndices]) => {
        if (!setup) return []
        if (sceneIndices.length === segments.length) return [setup]
        const condition = sceneSetCondition(sceneIndices)
        return [`if (${condition}) {\n${indentBlock(setup, 2)}\n}`]
      })
    }).join('\n')
    return `${sceneSelection}
${setupGroups}`
  }
  const schedulerBranches = canSharePhysicalCutRouting ? canonicalCutScheduler() : segments.map((segment, index) => {
    const condition = `${index === 0 ? 'if' : 'else if'} (__pxlblz_show_elapsed_s < ${segment.endMs / 1000})`
    if (segment.kind === 'hold') {
      return `${condition} {
    __pxlblz_show_scene = ${segment.sceneIndex}
    __pxlblz_show_transition = -1
    __pxlblz_show_mix = 0${usesSnapshot ? '\n    __pxlblz_show_snapshot_transition = -1\n    __pxlblz_show_snapshot_ready = 0' : ''}
 ${setupForPlacements(
    scenes[segment.sceneIndex].placements,
    undefined,
    scenes[segment.sceneIndex].propertyTracks
      ? [{ tracks: scenes[segment.sceneIndex].propertyTracks!, localTimeExpression: sceneLocalTimeExpression(segment.sceneIndex) }]
      : undefined,
  )}
  }`
    }
    const from = scenes[segment.sceneIndex].placements
    const to = scenes[segment.sceneIndex + 1].placements
    const snapshotEntry = usesSnapshot
      && segment.transition?.kind === 'crossfade'
      && segment.transition.crossfadePolicy === 'snapshot-live'
      && selectedRenderTargetCandidates.has(sequenceSnapshotCandidateId('routed', segment.sceneIndex))
      ? `
    if (__pxlblz_show_snapshot_transition != ${segment.sceneIndex}) {
      __pxlblz_show_snapshot_transition = ${segment.sceneIndex}
      __pxlblz_show_snapshot_ready = 0
    }`
      : ''
    const directionKernelIndex = familyKernelEnabled
      ? directionSharedMotionPlan?.groupIndexByScene.get(segment.sceneIndex)
      : undefined
    const zoomInGroupIndex = familyKernelEnabled
      ? zoomInSharedMotionPlan?.groupIndexByScene.get(segment.sceneIndex)
      : undefined
    const motionKernelAssignments = directionKernelIndex !== undefined
      ? (() => {
          const vector = showMotionTransitionVector(normalizeShowMotionTransition(segment.transition!).direction)
          return `
    __pxlblz_show_motion_kernel = ${directionKernelIndex}
    __pxlblz_show_motion_direction_x = ${vector.x}
    __pxlblz_show_motion_direction_y = ${vector.y}`
        })()
      : zoomInGroupIndex !== undefined
        ? (() => {
            const settings = normalizeShowMotionTransition(segment.transition!)
            const rotation = (settings.spinDirection === 'counterclockwise' ? -1 : 1) * settings.rotation
            const kernelId = zoomInSharedMotionPlan!.groups[zoomInGroupIndex].id
            return `
    __pxlblz_show_motion_kernel = ${kernelId}
    __pxlblz_show_motion_content_scale = ${settings.contentScale}
    __pxlblz_show_motion_anchor_x = ${settings.anchorX}
    __pxlblz_show_motion_anchor_y = ${settings.anchorY}
    __pxlblz_show_motion_rotation_value = ${rotation}`
          })()
        : familyKernelEnabled ? '\n    __pxlblz_show_motion_kernel = -1' : ''
    return `${condition} {
    __pxlblz_show_scene = ${segment.sceneIndex}
    __pxlblz_show_transition = ${segment.sceneIndex}
    __pxlblz_show_transition_start_s = ${segment.startMs / 1000}
    __pxlblz_show_mix = ${emitShowEasingExpression(segment.transition!.easing ?? 'linear', `(__pxlblz_show_elapsed_s - ${segment.startMs / 1000}) / ${segment.transition!.durationMs / 1000}`)}${snapshotEntry}${motionKernelAssignments}
${setupForPlacements(
    [...from, ...to],
    scenes[segment.sceneIndex].transitionRamps,
    [segment.sceneIndex, segment.sceneIndex + 1].flatMap((sceneIndex) => (
      scenes[sceneIndex].propertyTracks
        ? [{ tracks: scenes[sceneIndex].propertyTracks!, localTimeExpression: sceneLocalTimeExpression(sceneIndex) }]
        : []
    )),
  )}
  }
`
  }).join(' ')

  const layoutSelectLines = [...switches]
    .sort((left, right) => left.atMs - right.atMs)
    .map((routingSwitch) => `  if (__pxlblz_show_elapsed_s >= ${routingSwitch.atMs / 1000}) __pxlblz_show_route_layout = ${layoutIndex.get(routingSwitch.layoutId) ?? 0}`)
    .join('\n')

  const sharedPhysicalCut = canSharePhysicalCutRouting
      ? emitSharedPhysicalCutSceneRender(
        layouts[0],
        scenes,
        outputDimension,
        sceneLocalTimeExpression,
        outputPixelCount,
        renderKernelSpecialization,
      )
    : undefined
  const sceneBranches = sharedPhysicalCut?.render
    ?? scenes.map((scene, index) => `${index === 0 ? 'if' : 'else if'} (__pxlblz_show_scene == ${index}) {
${indentBlock(emitRoutedScenePlacements(
    layouts,
    scene.placements,
    outputDimension,
    scene.propertyTracks,
    sceneLocalTimeExpression(index),
  ), 4)}
  }`).join(' ')
  const unrolledTransitionBranches = segments
    .filter((segment) => segment.kind === 'transition')
    .map((segment, index) => `${index === 0 ? 'if' : 'else if'} (__pxlblz_show_transition == ${segment.sceneIndex}) {
${indentBlock(emitRoutedSceneTransition(
    layouts,
    scenes[segment.sceneIndex].placements,
    scenes[segment.sceneIndex + 1].placements,
    segment.transition!,
    outputDimension,
    segment.sceneIndex,
    segment.sceneIndex + 1,
    segment.transition?.kind === 'crossfade'
      && segment.transition.crossfadePolicy === 'snapshot-live'
      && selectedRenderTargetCandidates.has(sequenceSnapshotCandidateId('routed', segment.sceneIndex))
      ? renderTarget
      : undefined,
  ), 4)}
  }`)
    .join(' ')
  const transitionSceneIndices = new Set(segments.flatMap((segment) => (
    segment.kind === 'transition' ? [segment.sceneIndex, segment.sceneIndex + 1] : []
  )))
  const unrolledStackWrappers = scenes.filter((scene) => transitionSceneIndices.has(scene.sceneIndex)).flatMap((scene) => (
    [...groupRoutedPlacementsByZone(scene.placements).entries()].flatMap(([zoneName, stack]) => (
      routedSceneStackNeedsWrapper(stack)
        ? [emitRoutedSceneStackWrapper(
            stack,
            routedSceneStackPrefix(scene.sceneIndex, zoneName),
            outputDimension,
            scene.propertyTracks,
            sceneLocalTimeExpression(scene.sceneIndex),
            motionStackNeedsClear,
          )]
        : []
    ))
  ))
  const exactSharedMotionRender = exactSharedMotionPlan
    ? (() => {
        const membersInPlans = [...new Set(scenes.flatMap((scene) => scene.placements.map((placement) => placement.member)))]
        const directionBranches = (familyKernelEnabled ? directionSharedMotionPlan?.groups ?? [] : []).map((group, index) => {
          const from = exactSharedMotionPlan.stackPlans[group.fromPlanIndex].member
          const to = exactSharedMotionPlan.stackPlans[group.toPlanIndex].member
          return `${index === 0 ? 'if' : 'else if'} (__pxlblz_show_motion_kernel == ${group.id}) {
${indentBlock(emitMotionTransitionRenderBlock(from, to, group.transition, {
    index: '__pxlblz_show_motion_local_index',
    x: '__pxlblz_show_motion_local_x',
    y: '__pxlblz_show_motion_local_y',
  }, {
    x: '__pxlblz_show_motion_direction_x',
    y: '__pxlblz_show_motion_direction_y',
  }), 2)}
  return
}`
        })
        const zoomInBranches = (familyKernelEnabled ? zoomInSharedMotionPlan?.groups ?? [] : []).map((group) => {
          const from = exactSharedMotionPlan.stackPlans[group.fromPlanIndex].member
          const to = exactSharedMotionPlan.stackPlans[group.toPlanIndex].member
          return `else if (__pxlblz_show_motion_kernel == ${group.id}) {
${indentBlock(emitMotionTransitionRenderBlock(from, to, group.transition, {
    index: '__pxlblz_show_motion_local_index',
    x: '__pxlblz_show_motion_local_x',
    y: '__pxlblz_show_motion_local_y',
  }, undefined, {
    contentScale: '__pxlblz_show_motion_content_scale',
    anchorX: '__pxlblz_show_motion_anchor_x',
    anchorY: '__pxlblz_show_motion_anchor_y',
    signedRotation: '__pxlblz_show_motion_rotation_value',
  }), 2)}
  return
}`
        })
        const specializedBranches = motionSegments.flatMap((segment) => {
          if (familyKernelEnabled && directionSharedMotionPlan?.groupIndexByScene.has(segment.sceneIndex)) return []
          if (familyKernelEnabled && zoomInSharedMotionPlan?.groupIndexByScene.has(segment.sceneIndex)) return []
          const fromPlanIndex = exactSharedMotionPlan.planIndexByScene.get(segment.sceneIndex)
          const toPlanIndex = exactSharedMotionPlan.planIndexByScene.get(segment.sceneIndex + 1)
          if (fromPlanIndex === undefined || toPlanIndex === undefined) throw new Error('Shared motion plan lost a Scene stack binding.')
          const from = exactSharedMotionPlan.stackPlans[fromPlanIndex].member
          const to = exactSharedMotionPlan.stackPlans[toPlanIndex].member
          return [`else if (__pxlblz_show_transition == ${segment.sceneIndex}) {
${indentBlock(emitMotionTransitionRenderBlock(from, to, segment.transition, {
    index: '__pxlblz_show_motion_local_index',
    x: '__pxlblz_show_motion_local_x',
    y: '__pxlblz_show_motion_local_y',
  }), 2)}
  return
}`]
        })
        const branches = [...directionBranches, ...zoomInBranches, ...specializedBranches]
          .map((branch, index) => index === 0 ? branch.replace(/^else if/, 'if') : branch)
          .join(' ')
        return `${emitLogicalRoutingSetup(exactSharedMotionPlan.logical)}
if (__pxlblz_show_route_id == 0) {
${membersInPlans.map((member) => `  ${member.pixelCountName} = pixelCount`).join('\n')}
  var __pxlblz_show_motion_side = ceil(sqrt(pixelCount))
  var __pxlblz_show_motion_local_x = __pxlblz_show_route_local_x
  var __pxlblz_show_motion_local_y = __pxlblz_show_route_local_y
  var __pxlblz_show_motion_local_index = min(pixelCount - 1, floor(__pxlblz_show_motion_local_y * __pxlblz_show_motion_side) * __pxlblz_show_motion_side + floor(__pxlblz_show_motion_local_x * __pxlblz_show_motion_side))
${indentBlock(branches, 2)}
}`
      })()
    : null
  const baselineEmittedBytes = byteLength(`${unrolledStackWrappers.join('\n')}\n${unrolledTransitionBranches}`)
  const exactEmittedBytes = exactSharedMotionPlan && exactSharedMotionRender
    ? byteLength(`${exactSharedMotionPlan.stackPlans.map((plan) => plan.wrapper).join('\n')}\n${exactSharedMotionRender}`)
    : baselineEmittedBytes
  const useExactSharedMotion = motionTransitionSharing !== 'none'
    && exactSharedMotionPlan !== null
    && exactSharedMotionRender !== null
    && (motionTransitionSharing === 'exact' || exactEmittedBytes < baselineEmittedBytes)
  const transitionBranches = useExactSharedMotion ? exactSharedMotionRender! : unrolledTransitionBranches
  const stackWrappers = useExactSharedMotion
    ? exactSharedMotionPlan!.stackPlans.map((plan) => plan.wrapper)
    : unrolledStackWrappers
  const hasTransitions = unrolledTransitionBranches.length > 0
  const usesRouteLayout = !sharedPhysicalCut || layoutSelectLines.length > 0
  const snapshotPixelPrelude = usesSnapshot
    ? `var __pxlblz_show_snapshot_writing = __pxlblz_show_snapshot_transition == __pxlblz_show_transition && !__pxlblz_show_snapshot_ready
    if (__pxlblz_show_snapshot_writing) {
      ${emitShowRenderTargetWrite(renderTarget, 'r', 'index', '0')}
      ${emitShowRenderTargetWrite(renderTarget, 'g', 'index', '0')}
      ${emitShowRenderTargetWrite(renderTarget, 'b', 'index', '0')}
    }
    if (__pxlblz_show_snapshot_writing && index == pixelCount - 1) __pxlblz_show_snapshot_ready = 1`
    : ''
  const renderBody = hasTransitions
    ? `if (__pxlblz_show_transition >= 0) {
    ${snapshotPixelPrelude}${snapshotPixelPrelude ? '\n    ' : ''}${transitionBranches}
  } else {
    ${sceneBranches}
  }`
    : sceneBranches

  const code = [
    emitRuntimePrelude(members, outputDimension, {
      includeHash: transitionBranches.includes('__pxlblz_show_hash01'),
      includeMix: transitionBranches.length > 0,
      includePhase: false,
    }),
    ...members.map((member) => member.code.trim()),
    ...stackWrappers,
    ...(sharedPhysicalCut?.prelude ? [sharedPhysicalCut.prelude] : []),
    'var __pxlblz_show_scene = 0',
    ...(hasTransitions
      ? [
          'var __pxlblz_show_transition = -1',
          'var __pxlblz_show_transition_start_s = 0',
          ...(usesSnapshot
            ? ['var __pxlblz_show_snapshot_transition = -1', 'var __pxlblz_show_snapshot_ready = 0']
            : []),
          ...(familyKernelEnabled
            ? [
                'var __pxlblz_show_motion_kernel = -1',
                'var __pxlblz_show_motion_direction_x = 0',
                'var __pxlblz_show_motion_direction_y = 0',
                'var __pxlblz_show_motion_content_scale = 1',
                'var __pxlblz_show_motion_anchor_x = 0.5',
                'var __pxlblz_show_motion_anchor_y = 0.5',
                'var __pxlblz_show_motion_rotation_value = 0',
              ]
            : []),
        ]
      : []),
    ...(usesRouteLayout ? ['var __pxlblz_show_route_layout = 0'] : []),
    ...(propertyRamps ? [`var __pxlblz_show_route_split_position = ${clampNumber(propertyRamps.splitPosition.initial, 0, 1)}`] : []),
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_s = (__pxlblz_show_elapsed_s + delta / 1000) % ${cursor / 1000}
${usesRouteLayout ? '  __pxlblz_show_route_layout = 0\n' : ''}
${layoutSelectLines}${layoutSelectLines ? '\n' : ''}${propertyRamps ? `${emitRoutingPropertyAssignments(propertyRamps)}\n` : ''}  ${schedulerBranches}
}`,
    `export function ${outputDimension === 2 ? 'render2D(index, x, y)' : 'render(index)'} {
  ${renderBody}
  rgb(0, 0, 0)
}`,
    '',
  ].join('\n\n')
  return {
    code,
    renderKernels: sharedPhysicalCut?.renderKernels ?? null,
    motionTransitions: motionSegments.length === 0
      ? null
      : {
          selected: useExactSharedMotion,
          representation: useExactSharedMotion
            ? familyKernelEnabled ? 'exact-family-kernels' : 'exact-shared-environment'
            : 'unrolled',
          reason: motionTransitionSharing === 'none'
            ? 'disabled'
            : useExactSharedMotion
              ? 'selected'
              : exactSharedMotionPlan === null || exactSharedMotionRender === null
                ? 'incompatible'
                : 'not-smaller',
          boundaryCount: motionSegments.length,
          stackPlanCount: useExactSharedMotion ? exactSharedMotionPlan!.stackPlans.length : transitionSceneIndices.size,
          kernelCount: useExactSharedMotion
            ? (familyKernelEnabled ? directionSharedMotionPlan?.groups.length ?? 0 : 0)
              + (familyKernelEnabled ? zoomInSharedMotionPlan?.groups.length ?? 0 : 0)
              + motionSegments.filter((segment) => (
                !familyKernelEnabled
                || (!directionSharedMotionPlan?.groupIndexByScene.has(segment.sceneIndex)
                  && !zoomInSharedMotionPlan?.groupIndexByScene.has(segment.sceneIndex))
              )).length
            : motionSegments.length,
          parameterWords: 0,
          parameterScalarGlobals: useExactSharedMotion && familyKernelEnabled ? 7 : 0,
          dynamicBranchesAddedPerPixel: 0,
          emittedBytes: useExactSharedMotion ? exactEmittedBytes : baselineEmittedBytes,
          baselineEmittedBytes,
          avoidedEmittedBytes: useExactSharedMotion ? baselineEmittedBytes - exactEmittedBytes : 0,
        },
  }
}

type ResolvedRoutedScenePlacement = ShowRoutedScenePlacementRecipe & { member: CompiledMember }
type ResolvedRoutedScenePlacementRamp = ShowRoutedScenePlacementRampRecipe & { member: CompiledMember }

function emitSharedPhysicalCutSceneRender(
  layout: ShowRoutingLayoutRecipe,
  scenes: Array<{
    sceneIndex: number
    placements: ResolvedRoutedScenePlacement[]
    propertyTracks?: ShowPropertyAnimationTrack[]
  }>,
  outputDimension: 1 | 2,
  sceneLocalTimeExpression: (sceneIndex: number) => string,
  outputPixelCount?: number,
  renderKernelSpecialization = false,
): {
  prelude: string
  render: string
  renderKernels: ShowCompileSummary['specializations']['renderKernels']
} {
  const routingSpecialization = scenes.some((scene) => scene.placements.some((placement) => placement.member.exactSpecializations))
    ? planPhysicalRoutingShortCircuit(layout.zones.map((zone) => ({ ranges: zone.ranges })), outputPixelCount)
    : null
  const specializedRoutingAssignments = routingSpecialization?.ranges.map((range, rangeIndex) => {
    const zone = layout.zones[range.routeIndex]
    const pixelCount = Math.max(1, controllerZonePixelCount(zone))
    const width = Math.max(1, Math.ceil(Math.sqrt(pixelCount)))
    const height = Math.max(1, Math.ceil(pixelCount / width))
    const localIndex = range.localOffset === 0
      ? `index - ${range.start}`
      : `${range.localOffset} + index - ${range.start}`
    const condition = rangeIndex === routingSpecialization.ranges.length - 1
      ? 'else'
      : `${rangeIndex === 0 ? 'if' : 'else if'} (index <= ${range.end})`
    return [
      `${condition} {`,
      `  __pxlblz_show_route_id = ${range.routeIndex}`,
      `  __pxlblz_show_route_local_index = ${localIndex}`,
      `  __pxlblz_show_route_pixelCount = ${pixelCount}`,
      ...(outputDimension === 2
        ? [`  __pxlblz_show_route_width = ${width}`, `  __pxlblz_show_route_height = ${height}`]
        : []),
      '}',
    ]
  }).flat() ?? null
  const routingSetup = [
    'var __pxlblz_show_route_id = -1',
    'var __pxlblz_show_route_local_index = -1',
    'var __pxlblz_show_route_pixelCount = 1',
    ...(outputDimension === 2
      ? ['var __pxlblz_show_route_width = 1', 'var __pxlblz_show_route_height = 1']
      : []),
    ...(specializedRoutingAssignments ?? layout.zones.flatMap((zone, zoneIndex) => {
      const local = `__pxlblz_show_route_candidate_${zoneIndex}`
      const pixelCount = Math.max(1, controllerZonePixelCount(zone))
      const width = Math.max(1, Math.ceil(Math.sqrt(pixelCount)))
      const height = Math.max(1, Math.ceil(pixelCount / width))
      return [
        `var ${local} = -1`,
        ...emitZoneLocalAssignments(zone, local),
        `if (${local} >= 0) {`,
        `  __pxlblz_show_route_id = ${zoneIndex}`,
        `  __pxlblz_show_route_local_index = ${local}`,
        `  __pxlblz_show_route_pixelCount = ${pixelCount}`,
        ...(outputDimension === 2
          ? [`  __pxlblz_show_route_width = ${width}`, `  __pxlblz_show_route_height = ${height}`]
          : []),
        '}',
      ]
    })),
    ...(outputDimension === 2
      ? [
          'var __pxlblz_show_route_local_x = __pxlblz_show_route_width == 1 ? 0.5 : (__pxlblz_show_route_local_index % __pxlblz_show_route_width) / (__pxlblz_show_route_width - 1)',
          'var __pxlblz_show_route_local_y = __pxlblz_show_route_height == 1 ? 0.5 : floor(__pxlblz_show_route_local_index / __pxlblz_show_route_width) / (__pxlblz_show_route_height - 1)',
        ]
      : []),
  ].join('\n')
  const canInternPlans = scenes.every((scene) => {
    if ((scene.propertyTracks?.length ?? 0) > 0) return false
    return [...groupRoutedPlacementsByZone(scene.placements).values()].every((stack) => (
      stack.length === 1 && routedPlacementIsOpaque(stack[0])
    ))
  })
  if (canInternPlans) {
    const planCode: Array<{ configuration: string; render: string }> = []
    const planIndexByCode = new Map<string, number>()
    const scenePlans = scenes.map((scene) => {
      const stacks = groupRoutedPlacementsByZone(scene.placements)
      return layout.zones.flatMap((zone, zoneIndex) => {
        const stack = stacks.get(zone.name)
        if (!stack) return []
        const plan = emitInternedSharedPhysicalSceneZonePlan(stack[0], outputDimension)
        const key = `${plan.configuration}\n--- render ---\n${plan.render}`
        let planIndex = planIndexByCode.get(key)
        if (planIndex === undefined) {
          planIndex = planCode.length
          planCode.push(plan)
          planIndexByCode.set(key, planIndex)
        }
        return [{ planIndex, zoneIndex }]
      })
    })
    const tableSize = scenes.length * layout.zones.length
    const tableValues = Array.from({ length: tableSize }, () => 0)
    scenePlans.forEach((plans, sceneArrayIndex) => {
      plans.forEach(({ planIndex, zoneIndex }) => {
        tableValues[sceneArrayIndex * layout.zones.length + zoneIndex] = planIndex + 1
      })
    })
    const sharedPrelude = [
      `var __pxlblz_show_plans = array(${tableSize})`,
      ...tableValues.flatMap((planIndex, index) => (
        planIndex === 0 ? [] : [`__pxlblz_show_plans[${index}] = ${planIndex}`]
      )),
      'var __pxlblz_show_plan_config = -1',
    ].join('\n')
    const baselineRenderPlan = planCode.map((plan, planIndex) => (
      `${planIndex === 0 ? 'if' : 'else if'} (__pxlblz_show_plan == ${planIndex}) {
  if (__pxlblz_show_plan_configure) {
${indentBlock(plan.configuration, 4)}
  }
${indentBlock(plan.render, 2)}
}`
    )).join(' ')
    const baselineRender = `${routingSetup}
var __pxlblz_show_plan = -1
if (__pxlblz_show_route_id >= 0) __pxlblz_show_plan = __pxlblz_show_plans[__pxlblz_show_scene * ${layout.zones.length} + __pxlblz_show_route_id] - 1
var __pxlblz_show_plan_config_key = __pxlblz_show_plan * ${layout.zones.length} + __pxlblz_show_route_id
var __pxlblz_show_plan_configure = __pxlblz_show_plan >= 0 && __pxlblz_show_plan_config_key != __pxlblz_show_plan_config
if (__pxlblz_show_plan_configure) __pxlblz_show_plan_config = __pxlblz_show_plan_config_key
${baselineRenderPlan}`

    const kernels: string[] = []
    const kernelIndexByRender = new Map<string, number>()
    const configurationPlans = planCode.map((plan) => {
      let kernelIndex = kernelIndexByRender.get(plan.render)
      if (kernelIndex === undefined) {
        kernelIndex = kernels.length
        kernels.push(plan.render)
        kernelIndexByRender.set(plan.render, kernelIndex)
      }
      return { configuration: plan.configuration, kernelIndex }
    })
    const candidatePrelude = [
      sharedPrelude,
      ...(kernels.length > 1 ? ['var __pxlblz_show_render_kernel = -1'] : []),
    ].join('\n')
    const configurationDispatch = configurationPlans.map((plan, planIndex) => (
      `${planIndex === 0 ? 'if' : 'else if'} (__pxlblz_show_plan == ${planIndex}) {
${indentBlock(plan.configuration, 2)}${kernels.length > 1 ? `\n  __pxlblz_show_render_kernel = ${plan.kernelIndex}` : ''}
}`
    )).join(' ')
    const kernelDispatch = kernels.length === 1
      ? kernels[0]
      : kernels.map((render, kernelIndex) => (
          `${kernelIndex === 0 ? 'if' : 'else if'} (__pxlblz_show_render_kernel == ${kernelIndex}) {\n${indentBlock(render, 2)}\n}`
        )).join('\n')
    const candidateRender = `${routingSetup}
var __pxlblz_show_plan = -1
if (__pxlblz_show_route_id >= 0) __pxlblz_show_plan = __pxlblz_show_plans[__pxlblz_show_scene * ${layout.zones.length} + __pxlblz_show_route_id] - 1
var __pxlblz_show_plan_config_key = __pxlblz_show_plan * ${layout.zones.length} + __pxlblz_show_route_id
var __pxlblz_show_plan_configure = __pxlblz_show_plan >= 0 && __pxlblz_show_plan_config_key != __pxlblz_show_plan_config
if (__pxlblz_show_plan_configure) {
  __pxlblz_show_plan_config = __pxlblz_show_plan_config_key
${indentBlock(configurationDispatch, 2)}
}
if (__pxlblz_show_plan >= 0) {
${indentBlock(kernelDispatch, 2)}
}`
    const baselineDispatchBytes = byteLength(`${sharedPrelude}\n${baselineRender}`)
    const candidateDispatchBytes = byteLength(`${candidatePrelude}\n${candidateRender}`)
    const selection = selectShowRenderKernelSpecialization({
      planCount: planCode.length,
      kernelCount: kernels.length,
      baselineDispatchBytes,
      candidateDispatchBytes,
      baselineArtifactBytes: baselineDispatchBytes,
      artifactBudgetBytes: MEASURED_DEVICE_BUDGET_BYTES,
      minimumAvoidedBranchesPerPixel: 1,
      maxAddedBytes: 0,
    })
    const renderKernels = {
      ...selection,
      ...(!renderKernelSpecialization && selection.selected
        ? { selected: false, reason: 'hardware-profile' as const }
        : {}),
      configurationPlanCount: planCode.length,
      kernelCount: kernels.length,
      baselineDispatchBytes,
      selectedDispatchBytes: renderKernelSpecialization && selection.selected
        ? candidateDispatchBytes
        : baselineDispatchBytes,
    }
    if (renderKernelSpecialization && selection.selected) {
      return { prelude: candidatePrelude, render: candidateRender, renderKernels }
    }
    return {
      prelude: sharedPrelude,
      render: baselineRender,
      renderKernels,
    }
  }
  const sceneBranches = scenes.map((scene, sceneIndex) => {
    const stacks = groupRoutedPlacementsByZone(scene.placements)
    const activeZones = layout.zones.flatMap((zone, zoneIndex) => {
      const stack = stacks.get(zone.name)
      if (!stack) return []
      return [{ stack, zoneIndex }]
    })
    const zoneBranches = activeZones.map(({ stack, zoneIndex }, blockIndex) => (
      `${blockIndex === 0 ? 'if' : 'else if'} (__pxlblz_show_route_id == ${zoneIndex}) {
${indentBlock(emitSharedPhysicalSceneZoneStack(
    stack,
    zoneIndex,
    outputDimension,
    scene.propertyTracks,
    sceneLocalTimeExpression(scene.sceneIndex),
  ), 2)}
}`
    )).join(' ')
    return `${sceneIndex === 0 ? 'if' : 'else if'} (__pxlblz_show_scene == ${scene.sceneIndex}) {
${indentBlock(zoneBranches, 2)}
}`
  }).join(' ')
  return { prelude: '', render: `${routingSetup}\n${sceneBranches}`, renderKernels: null }
}

function emitInternedSharedPhysicalSceneZonePlan(
  placement: ResolvedRoutedScenePlacement,
  outputDimension: 1 | 2,
): { configuration: string; render: string } {
  const member = placement.member
  const captureCall = outputDimension === 2
    ? `${member.prefix}_renderCapture2D(__pxlblz_show_route_local_index, __pxlblz_show_route_local_x, __pxlblz_show_route_local_y)`
    : `${member.prefix}_renderCapture(__pxlblz_show_route_local_index)`
  const capture = emitRoutedPlacementCapture(placement, captureCall)
  return {
    configuration: [
      `${member.pixelCountName} = __pxlblz_show_route_pixelCount`,
      ...capture.lines.slice(0, -1),
    ].join('\n'),
    render: [
      capture.lines[capture.lines.length - 1],
      `${member.prefix}_emit()`,
      'return',
    ].join('\n'),
  }
}

function emitSharedPhysicalSceneZoneStack(
  placements: ResolvedRoutedScenePlacement[],
  zoneIndex: number,
  outputDimension: 1 | 2,
  propertyTracks?: ShowPropertyAnimationTrack[],
  localTimeExpression?: string,
): string {
  const captureMember = (placement: ResolvedRoutedScenePlacement) => outputDimension === 2
    ? `${placement.member.prefix}_renderCapture2D(__pxlblz_show_route_local_index, __pxlblz_show_route_local_x, __pxlblz_show_route_local_y)`
    : `${placement.member.prefix}_renderCapture(__pxlblz_show_route_local_index)`
  const directPlacement = placements.length === 1 && routedPlacementIsOpaque(placements[0], propertyTracks)
    ? placements[0]
    : undefined
  if (directPlacement) {
    const capture = emitRoutedPlacementCapture(
      directPlacement,
      captureMember(directPlacement),
      propertyTracks,
      localTimeExpression,
    )
    return [
      `${directPlacement.member.pixelCountName} = __pxlblz_show_route_pixelCount`,
      ...capture.lines,
      `${directPlacement.member.prefix}_emit()`,
      'return',
    ].join('\n')
  }
  const target = `__pxlblz_show_stack_${zoneIndex}`
  const capture = emitRoutedPlacementStackCapture(
    placements,
    captureMember,
    target,
    propertyTracks,
    localTimeExpression,
  )
  return [
    ...placements.map((placement) => `${placement.member.pixelCountName} = __pxlblz_show_route_pixelCount`),
    capture,
    `rgb(${target}_r, ${target}_g, ${target}_b)`,
    'return',
  ].join('\n')
}

function emitRoutedSceneRampAssignments(
  ramps: ResolvedRoutedScenePlacementRamp[] | undefined,
  elapsedExpression: string,
): string {
  return (ramps ?? []).flatMap((ramp) => [
    emitPropertyRampAssignments(ramp.member, ramp.propertyRamps, elapsedExpression),
    emitControlRampAssignments(ramp.member, ramp.controlRamps, elapsedExpression),
    emitEffectRampAssignments(ramp.member, ramp.effectRamps, elapsedExpression),
  ]).filter(Boolean).join('\n')
}

function emitRoutedInstancePropertyTrackAssignments(
  member: CompiledMember,
  tracks: ShowPropertyAnimationTrack[],
  localTimeExpression: string,
): string {
  return tracks.flatMap((track): string[] => {
    const expression = emitShowPropertyTrackExpression(track, localTimeExpression)
    if (track.target.kind === 'instance-time-scale' && track.target.instanceId === member.id) {
      return [`${member.prefix}_adapt_timeScale = ${expression}`]
    }
    if (track.target.kind === 'instance-control' && track.target.instanceId === member.id) {
      const exportName = track.target.exportName
      const control = member.controls.find((candidate) => candidate.exportName === exportName)
      if (!control) throw new Error(`Clip "${member.id}" cannot animate missing control "${track.target.exportName}".`)
      return [`${control.valueName} = ${expression}`]
    }
    return []
  }).join('\n')
}

function emitRoutedScenePlacements(
  layouts: ShowRoutingLayoutRecipe[],
  placements: ResolvedRoutedScenePlacement[],
  outputDimension: 1 | 2,
  propertyTracks?: ShowPropertyAnimationTrack[],
  localTimeExpression?: string,
): string {
  return layouts.map((layout, layoutIndex) => `${layoutIndex === 0 ? 'if' : 'else if'} (__pxlblz_show_route_layout == ${layoutIndex}) {
${indentBlock(layout.logical
    ? emitLogicalScenePlacements(layout, placements, propertyTracks, localTimeExpression)
    : emitPhysicalScenePlacements(layout, placements, outputDimension, propertyTracks, localTimeExpression), 2)}
}`).join(' ')
}

function emitRoutedSceneTransition(
  layouts: ShowRoutingLayoutRecipe[],
  fromPlacements: ResolvedRoutedScenePlacement[],
  toPlacements: ResolvedRoutedScenePlacement[],
  transition: ShowSceneSequenceTransitionRecipe,
  outputDimension: 1 | 2,
  fromSceneIndex: number,
  toSceneIndex: number,
  snapshotRenderTarget?: ShowRenderTargetPlan<'stage-rgb'>,
): string {
  return layouts.map((layout, layoutIndex) => `${layoutIndex === 0 ? 'if' : 'else if'} (__pxlblz_show_route_layout == ${layoutIndex}) {
${indentBlock(layout.logical
    ? emitLogicalSceneTransition(
        layout,
        fromPlacements,
        toPlacements,
        transition,
        fromSceneIndex,
        toSceneIndex,
        snapshotRenderTarget,
      )
    : emitPhysicalSceneTransition(
        layout,
        fromPlacements,
        toPlacements,
        transition,
        outputDimension,
        fromSceneIndex,
        toSceneIndex,
        snapshotRenderTarget,
      ), 2)}
}`).join(' ')
}

function emitLogicalScenePlacements(
  layout: ShowRoutingLayoutRecipe,
  placements: ResolvedRoutedScenePlacement[],
  propertyTracks?: ShowPropertyAnimationTrack[],
  localTimeExpression?: string,
): string {
  const logical = layout.logical!
  const placementByZone = groupRoutedPlacementsByZone(placements)
  const blocks = logical.zoneNames.flatMap((zoneName, zoneIndex) => {
    const stack = placementByZone.get(zoneName)
    if (!stack) return []
    const domain = logicalScenePlacementDomain(logical, stack[0], zoneIndex)
    const capture = emitRoutedPlacementStackCapture(
      stack,
      (placement) => {
        const placementDomain = logicalScenePlacementDomain(logical, placement, zoneIndex)
        return `${placement.member.pixelCountName} = ${placementDomain.pixelCount}
${placement.member.prefix}_renderCapture2D(__pxlblz_show_route_local_index, __pxlblz_show_scene_local_x, __pxlblz_show_scene_local_y)`
      },
      `__pxlblz_show_logical_stack_${zoneIndex}`,
      propertyTracks,
      localTimeExpression,
    )
    return [`${zoneIndex === 0 ? 'if' : 'else if'} (__pxlblz_show_route_id == ${zoneIndex}) {
  var __pxlblz_show_route_side = ceil(sqrt(${domain.pixelCount}))
  var __pxlblz_show_scene_local_x = ${domain.x}
  var __pxlblz_show_scene_local_y = ${domain.y}
  var __pxlblz_show_route_local_index = min(${domain.pixelCount} - 1, floor(__pxlblz_show_scene_local_y * __pxlblz_show_route_side) * __pxlblz_show_route_side + floor(__pxlblz_show_scene_local_x * __pxlblz_show_route_side))
${indentBlock(capture, 2)}
  rgb(__pxlblz_show_logical_stack_${zoneIndex}_r, __pxlblz_show_logical_stack_${zoneIndex}_g, __pxlblz_show_logical_stack_${zoneIndex}_b)
  return
}`]
  })
  return `${emitLogicalRoutingSetup(logical)}\n${blocks.join('\n')}`
}

function emitLogicalSceneTransition(
  layout: ShowRoutingLayoutRecipe,
  fromPlacements: ResolvedRoutedScenePlacement[],
  toPlacements: ResolvedRoutedScenePlacement[],
  transition: ShowSceneSequenceTransitionRecipe,
  fromSceneIndex: number,
  toSceneIndex: number,
  snapshotRenderTarget?: ShowRenderTargetPlan<'stage-rgb'>,
): string {
  const logical = layout.logical!
  const fromByZone = groupRoutedPlacementsByZone(fromPlacements)
  const toByZone = groupRoutedPlacementsByZone(toPlacements)
  const blocks = logical.zoneNames.flatMap((zoneName, zoneIndex) => {
    const fromStack = fromByZone.get(zoneName)
    const toStack = toByZone.get(zoneName)
    if (!fromStack || !toStack) return []
    const fromPlacement = fromStack[0]
    const toPlacement = toStack[0]
    const from = routedSceneStackNeedsWrapper(fromStack)
      ? routedSceneCompositeMember(fromStack, routedSceneStackPrefix(fromSceneIndex, zoneName))
      : fromPlacement.member
    const to = routedSceneStackNeedsWrapper(toStack)
      ? routedSceneCompositeMember(toStack, routedSceneStackPrefix(toSceneIndex, zoneName))
      : toPlacement.member
    const fromDomain = logicalScenePlacementDomain(logical, fromPlacement, zoneIndex)
    const toDomain = logicalScenePlacementDomain(logical, toPlacement, zoneIndex)
    const localIndex = '__pxlblz_show_route_local_index'
    const toLocalIndex = '__pxlblz_show_route_to_local_index'
    const fromCapture = `${from.prefix}_renderCapture2D(${localIndex}, __pxlblz_show_scene_local_x, __pxlblz_show_scene_local_y)`
    const toCapture = `${to.prefix}_renderCapture2D(${toLocalIndex}, __pxlblz_show_scene_to_local_x, __pxlblz_show_scene_to_local_y)`
    const transitionBlock = emitSceneTransitionWithCaptures(
      from,
      to,
      transition,
      2,
      fromCapture,
      toCapture,
      { index: localIndex, x: '__pxlblz_show_scene_local_x', y: '__pxlblz_show_scene_local_y' },
      snapshotRenderTarget,
    )
    return [`${zoneIndex === 0 ? 'if' : 'else if'} (__pxlblz_show_route_id == ${zoneIndex}) {
${fromStack.map((placement) => `  ${placement.member.pixelCountName} = ${fromDomain.pixelCount}`).join('\n')}
${toStack.map((placement) => `  ${placement.member.pixelCountName} = ${toDomain.pixelCount}`).join('\n')}
  ${from.pixelCountName} = ${fromDomain.pixelCount}
  ${to.pixelCountName} = ${toDomain.pixelCount}
  var __pxlblz_show_route_side = ceil(sqrt(${from.pixelCountName}))
  var __pxlblz_show_route_to_side = ceil(sqrt(${to.pixelCountName}))
  var __pxlblz_show_scene_local_x = ${fromDomain.x}
  var __pxlblz_show_scene_local_y = ${fromDomain.y}
  var __pxlblz_show_scene_to_local_x = ${toDomain.x}
  var __pxlblz_show_scene_to_local_y = ${toDomain.y}
  var ${localIndex} = min(${from.pixelCountName} - 1, floor(__pxlblz_show_scene_local_y * __pxlblz_show_route_side) * __pxlblz_show_route_side + floor(__pxlblz_show_scene_local_x * __pxlblz_show_route_side))
  var ${toLocalIndex} = min(${to.pixelCountName} - 1, floor(__pxlblz_show_scene_to_local_y * __pxlblz_show_route_to_side) * __pxlblz_show_route_to_side + floor(__pxlblz_show_scene_to_local_x * __pxlblz_show_route_to_side))
${indentBlock(transitionBlock, 2)}
  return
}`]
  })
  return `${emitLogicalRoutingSetup(logical)}\n${blocks.join('\n')}`
}

function logicalScenePlacementDomain(
  logical: ShowLogicalRoutingRecipe,
  placement: ResolvedRoutedScenePlacement,
  zoneIndex: number,
): { x: string; y: string; pixelCount: string } {
  const zoneCount = Math.max(1, logical.zoneNames.length)
  const domainIndices = placement.zoneMode === 'span' && placement.domainZoneNames?.length
    ? placement.domainZoneNames.map((name) => logical.zoneNames.indexOf(name)).filter((index) => index >= 0)
    : [zoneIndex]
  if (domainIndices.length > 1) {
    const start = Math.min(...domainIndices)
    const end = Math.max(...domainIndices)
    const count = end - start + 1
    if (logical.kind === 'stripes') {
      const local = `clamp((${logical.axis === 'x' ? 'x' : 'y'} * ${zoneCount} - ${start}) / ${count}, 0, 1)`
      return {
        x: logical.axis === 'x' ? local : 'clamp(x, 0, 1)',
        y: logical.axis === 'y' ? local : 'clamp(y, 0, 1)',
        pixelCount: `max(1, floor(pixelCount * ${count} / ${zoneCount}))`,
      }
    }
    if (logical.kind === 'grid') {
      const columns = logical.columns
      const rows = Math.ceil(zoneCount / columns)
      const minColumn = Math.min(...domainIndices.map((index) => index % columns))
      const maxColumn = Math.max(...domainIndices.map((index) => index % columns))
      const minRow = Math.min(...domainIndices.map((index) => Math.floor(index / columns)))
      const maxRow = Math.max(...domainIndices.map((index) => Math.floor(index / columns)))
      const width = maxColumn - minColumn + 1
      const height = maxRow - minRow + 1
      return {
        x: `clamp((x * ${columns} - ${minColumn}) / ${width}, 0, 1)`,
        y: `clamp((y * ${rows} - ${minRow}) / ${height}, 0, 1)`,
        pixelCount: `max(1, floor(pixelCount * ${domainIndices.length} / ${zoneCount}))`,
      }
    }
    return {
      x: 'clamp(x, 0, 1)',
      y: 'clamp(y, 0, 1)',
      pixelCount: domainIndices.length === zoneCount
        ? 'pixelCount'
        : `max(1, floor(pixelCount * ${domainIndices.length} / ${zoneCount}))`,
    }
  }
  if (logical.kind === 'single') return { x: '__pxlblz_show_route_local_x', y: '__pxlblz_show_route_local_y', pixelCount: 'pixelCount' }
  if (logical.kind === 'split') {
    return {
      x: '__pxlblz_show_route_local_x',
      y: '__pxlblz_show_route_local_y',
      pixelCount: zoneIndex === 0
        ? 'max(1, floor(pixelCount * __pxlblz_show_route_split_position))'
        : 'max(1, pixelCount - floor(pixelCount * __pxlblz_show_route_split_position))',
    }
  }
  return {
    x: '__pxlblz_show_route_local_x',
    y: '__pxlblz_show_route_local_y',
    pixelCount: `max(1, floor(pixelCount / ${zoneCount}))`,
  }
}

function emitPhysicalScenePlacements(
  layout: ShowRoutingLayoutRecipe,
  placements: ResolvedRoutedScenePlacement[],
  outputDimension: 1 | 2,
  propertyTracks?: ShowPropertyAnimationTrack[],
  localTimeExpression?: string,
): string {
  const stacks = groupRoutedPlacementsByZone(placements)
  return [...stacks.values()].flatMap((stack, placementIndex) => {
    const placement = stack[0]
    const domain = physicalPlacementDomain(layout, placement)
    if (!domain) return []
    return [emitPhysicalSceneZoneStack(
      domain,
      placementIndex,
      stack,
      outputDimension,
      propertyTracks,
      localTimeExpression,
    )]
  }).join('\n')
}

function emitPhysicalSceneTransition(
  layout: ShowRoutingLayoutRecipe,
  fromPlacements: ResolvedRoutedScenePlacement[],
  toPlacements: ResolvedRoutedScenePlacement[],
  transition: ShowSceneSequenceTransitionRecipe,
  outputDimension: 1 | 2,
  fromSceneIndex: number,
  toSceneIndex: number,
  snapshotRenderTarget?: ShowRenderTargetPlan<'stage-rgb'>,
): string {
  const fromPlacementByZone = groupRoutedPlacementsByZone(fromPlacements)
  const toPlacementByZone = groupRoutedPlacementsByZone(toPlacements)
  const emitted = new Set<string>()
  return layout.zones.flatMap((zone, zoneIndex) => {
    const fromStack = fromPlacementByZone.get(zone.name)
    const toStack = toPlacementByZone.get(zone.name)
    if (!fromStack || !toStack) return []
    const fromZone = physicalPlacementDomain(layout, fromStack[0])
    const toZone = physicalPlacementDomain(layout, toStack[0])
    if (!fromZone || !toZone) return []
    const key = `${zone.name}:${fromZone.name}->${toZone.name}`
    if (emitted.has(key)) return []
    emitted.add(key)
    return [emitPhysicalSceneZoneStackTransition(
      fromZone,
      toZone,
      zoneIndex,
      zone.name,
      fromStack,
      toStack,
      transition,
      outputDimension,
      fromSceneIndex,
      toSceneIndex,
      snapshotRenderTarget,
    )]
  }).join('\n')
}

function groupRoutedPlacementsByZone(
  placements: ResolvedRoutedScenePlacement[],
): Map<string, ResolvedRoutedScenePlacement[]> {
  const result = new Map<string, ResolvedRoutedScenePlacement[]>()
  for (const placement of placements) {
    result.set(placement.zoneName, [...(result.get(placement.zoneName) ?? []), placement])
  }
  for (const [zoneName, stack] of result) {
    result.set(zoneName, [...stack].sort((left, right) => (left.stackOrder ?? 0) - (right.stackOrder ?? 0)))
  }
  return result
}

function routedSceneStackNeedsWrapper(stack: ResolvedRoutedScenePlacement[]): boolean {
  return stack.length > 1 || stack.some((placement) => Boolean(placement.placementId))
}

function routedSceneStackPrefix(sceneIndex: number, zoneName: string): string {
  return `__pxlblz_show_stack_s${sceneIndex}_${zoneName.replace(/[^a-zA-Z0-9_]/g, '_')}`
}

function routedSceneCompositeMember(
  stack: ResolvedRoutedScenePlacement[],
  prefix: string,
): CompiledMember {
  return {
    ...stack[stack.length - 1].member,
    id: prefix,
    prefix,
    pixelCountName: `${prefix}_pixelCount`,
  }
}

function emitRoutedSceneStackWrapper(
  stack: ResolvedRoutedScenePlacement[],
  prefix: string,
  outputDimension: 1 | 2,
  propertyTracks?: ShowPropertyAnimationTrack[],
  localTimeExpression?: string,
  includeClear = false,
): string {
  const capture = emitRoutedPlacementStackCapture(
    stack,
    (placement) => outputDimension === 2
      ? `${placement.member.prefix}_renderCapture2D(index, x, y)`
      : `${placement.member.prefix}_renderCapture(index)`,
    `${prefix}_capture`,
    propertyTracks,
    localTimeExpression,
  )
  const captureFunction = outputDimension === 2
    ? `function ${prefix}_renderCapture2D(index, x, y) {
${indentBlock(capture, 2)}
  ${prefix}_r = ${prefix}_capture_r
  ${prefix}_g = ${prefix}_capture_g
  ${prefix}_b = ${prefix}_capture_b
}`
    : `function ${prefix}_renderCapture(index) {
${indentBlock(capture, 2)}
  ${prefix}_r = ${prefix}_capture_r
  ${prefix}_g = ${prefix}_capture_g
  ${prefix}_b = ${prefix}_capture_b
}`
  return `var ${prefix}_r = 0
var ${prefix}_g = 0
var ${prefix}_b = 0
var ${prefix}_pixelCount = pixelCount
${captureFunction}${includeClear ? `
function ${prefix}_clear() {
  ${prefix}_r = 0
  ${prefix}_g = 0
  ${prefix}_b = 0
}` : ''}
function ${prefix}_emit() { rgb(${prefix}_r, ${prefix}_g, ${prefix}_b) }`
}

function physicalPlacementDomain(
  layout: ShowRoutingLayoutRecipe,
  placement: ResolvedRoutedScenePlacement,
): ControllerZone | undefined {
  const names = placement.zoneMode === 'span' && placement.domainZoneNames?.length
    ? placement.domainZoneNames
    : [placement.zoneName]
  const zones = names.flatMap((name) => {
    const zone = layout.zones.find((candidate) => candidate.name === name)
    return zone ? [zone] : []
  })
  if (zones.length === 0) return undefined
  return zones.length === 1 ? zones[0] : mergeRouteZones(placement.clipId, zones)
}

function emitPhysicalSceneZoneStack(
  zone: ControllerZone,
  zoneIndex: number,
  placements: ResolvedRoutedScenePlacement[],
  outputDimension: 1 | 2,
  propertyTracks?: ShowPropertyAnimationTrack[],
  localTimeExpression?: string,
): string {
  const local = `__pxlblz_show_scene_zone_${zoneIndex}_index`
  const pixelCount = Math.max(1, controllerZonePixelCount(zone))
  const directPlacement = placements.length === 1 && routedPlacementIsOpaque(placements[0], propertyTracks)
    ? placements[0]
    : undefined
  if (directPlacement) {
    const capture = emitRoutedPlacementCapture(
      directPlacement,
      routedSceneMemberCapture(directPlacement.member, local, pixelCount, outputDimension, zoneIndex),
      propertyTracks,
      localTimeExpression,
    )
    return [
      `var ${local} = -1`,
      ...emitZoneLocalAssignments(zone, local),
      `if (${local} >= 0) {`,
      `  ${directPlacement.member.pixelCountName} = ${pixelCount}`,
      indentBlock(capture.lines.join('\n'), 2),
      `  ${directPlacement.member.prefix}_emit()`,
      `  return`,
      `}`,
    ].join('\n')
  }
  const capture = emitRoutedPlacementStackCapture(
    placements,
    (placement) => routedSceneMemberCapture(placement.member, local, pixelCount, outputDimension, zoneIndex),
    `__pxlblz_show_stack_${zoneIndex}`,
    propertyTracks,
    localTimeExpression,
  )
  return [
    `var ${local} = -1`,
    ...emitZoneLocalAssignments(zone, local),
    `if (${local} >= 0) {`,
    ...placements.map((placement) => `  ${placement.member.pixelCountName} = ${pixelCount}`),
    indentBlock(capture, 2),
    `  rgb(__pxlblz_show_stack_${zoneIndex}_r, __pxlblz_show_stack_${zoneIndex}_g, __pxlblz_show_stack_${zoneIndex}_b)`,
    `  return`,
    `}`,
  ].join('\n')
}

function emitRoutedPlacementStackCapture(
  placements: ResolvedRoutedScenePlacement[],
  capture: (placement: ResolvedRoutedScenePlacement) => string,
  target: string,
  propertyTracks?: ShowPropertyAnimationTrack[],
  localTimeExpression?: string,
): string {
  return [
    `var ${target}_r = 0`,
    `var ${target}_g = 0`,
    `var ${target}_b = 0`,
    ...placements.flatMap((placement) => {
      const rendered = emitRoutedPlacementCapture(
        placement,
        capture(placement),
        propertyTracks,
        localTimeExpression,
      )
      const member = placement.member
      return [
        ...rendered.lines,
        `${target}_r = ${member.prefix}_r * (${rendered.opacity}) + ${target}_r * (1 - (${rendered.opacity}))`,
        `${target}_g = ${member.prefix}_g * (${rendered.opacity}) + ${target}_g * (1 - (${rendered.opacity}))`,
        `${target}_b = ${member.prefix}_b * (${rendered.opacity}) + ${target}_b * (1 - (${rendered.opacity}))`,
      ]
    }),
  ].join('\n')
}

function routedPlacementIsOpaque(
  placement: ResolvedRoutedScenePlacement,
  propertyTracks?: ShowPropertyAnimationTrack[],
): boolean {
  const hasOpacityTrack = (propertyTracks ?? []).some((track) => (
    track.target.kind === 'placement-opacity'
    && track.target.placementId === placement.placementId
  ))
  return !hasOpacityTrack && clampNumber(placement.opacity ?? 1, 0, 1) === 1
}

function emitRoutedPlacementCapture(
  placement: ResolvedRoutedScenePlacement,
  capture: string,
  propertyTracks?: ShowPropertyAnimationTrack[],
  localTimeExpression?: string,
): { lines: string[]; opacity: string } {
  const placementTracks = (propertyTracks ?? []).filter((track) => (
    'placementId' in track.target && track.target.placementId === placement.placementId
  ))
  const opacityTrack = placementTracks.find((track) => track.target.kind === 'placement-opacity')
  const opacity = opacityTrack && localTimeExpression
    ? emitShowPropertyTrackExpression(opacityTrack, localTimeExpression)
    : String(clampNumber(placement.opacity ?? 1, 0, 1))
  const brightnessTrack = placementTracks.find((track) => (
    track.target.kind === 'placement-view' && track.target.property === 'brightness'
  ))
  const phaseTrack = placementTracks.find((track) => (
    track.target.kind === 'placement-view' && track.target.property === 'phase'
  ))
  const member = placement.member
  return {
    lines: [
      ...(brightnessTrack && localTimeExpression
        ? [`${member.prefix}_adapt_brightness = ${emitShowPropertyTrackExpression(brightnessTrack, localTimeExpression)}`]
        : placement.brightness === undefined ? [] : [`${member.prefix}_adapt_brightness = ${placement.brightness}`]),
      ...(phaseTrack && localTimeExpression
        ? [`${member.prefix}_adapt_phase = ${emitShowPropertyTrackExpression(phaseTrack, localTimeExpression)}`]
        : placement.phase === undefined ? [] : [`${member.prefix}_adapt_phase = ${placement.phase}`]),
      ...(placement.mirror === undefined ? [] : [`${member.prefix}_adapt_mirror = ${boolNumber(placement.mirror)}`]),
      ...emitRoutedPlacementEffectTargets(member, placement.effects, placementTracks, localTimeExpression),
      capture,
    ],
    opacity,
  }
}

function emitRoutedPlacementEffectTargets(
  member: CompiledMember,
  placementEffects: ShowClipEffect[] | undefined,
  placementTracks: ShowPropertyAnimationTrack[] = [],
  localTimeExpression?: string,
): string[] {
  if (!member.animatedEffects || member.effects.length === 0) return []
  const authored = normalizeShowClipEffects(placementEffects)
  const resolved = member.effects.map((template) => (
    authored.find((effect) => effect.id === template.id && effect.kind === template.kind)
    ?? identityShowEffect(template)
  ))
  const hasAffine = member.effects.some((effect) => ['translate', 'rotate', 'scale', 'shear'].includes(effect.kind))
  if (member.staticPlanEffects) {
    const parameterAssignments = resolved.flatMap((effect) => (
      ['translate', 'rotate', 'scale', 'shear'].includes(effect.kind)
        ? []
        : showEffectParameterNames(effect).map((parameter) => (
            `${effectParameterVariable(member, effect.id, parameter)} = ${effectParameterValue(effect, parameter)}`
          ))
    ))
    const matrixAssignments = hasAffine
      ? (() => {
          const matrix = buildShowEffectSampleMatrix(resolved)
          const value = (candidate: number) => String(Object.is(candidate, -0) ? 0 : candidate)
          return [
            `${member.prefix}_fx_a = ${value(matrix.a)}`,
            `${member.prefix}_fx_b = ${value(matrix.b)}`,
            `${member.prefix}_fx_c = ${value(matrix.c)}`,
            `${member.prefix}_fx_d = ${value(matrix.d)}`,
            `${member.prefix}_fx_tx = ${value(matrix.tx)}`,
            `${member.prefix}_fx_ty = ${value(matrix.ty)}`,
          ]
        })()
      : []
    return [...parameterAssignments, ...matrixAssignments]
  }
  const assignments = emitSceneEffectTargets(member, resolved).trim()
  const animationAssignments = localTimeExpression
    ? placementTracks.flatMap((track): string[] => {
        if (track.target.kind !== 'placement-effect') return []
        const parameter = showClipEffectPersistedField(track.target.effectKind, track.target.parameterId)
        return [`${effectParameterVariable(member, track.target.effectId, parameter)} = ${emitShowPropertyTrackExpression(track, localTimeExpression)}`]
      })
    : []
  return [
    ...(assignments ? assignments.split('\n').map((line) => line.trim()) : []),
    ...animationAssignments,
    ...(hasAffine ? [`${member.prefix}_fx_update()`] : []),
  ]
}

function identityShowEffect(effect: ShowClipEffect): ShowClipEffect {
  if (effect.kind === 'opacity') return { ...effect, opacity: 1 }
  if (effect.kind === 'brightness') return { ...effect, brightness: 1 }
  if (effect.kind === 'hue' || effect.kind === 'rotate') return { ...effect, turns: 0 }
  if (effect.kind === 'saturation') return { ...effect, saturation: 1 }
  if (effect.kind === 'contrast') return { ...effect, contrast: 1 }
  if (effect.kind === 'invert') return { ...effect, amount: 0 }
  if (effect.kind === 'threshold' || effect.kind === 'posterize' || effect.kind === 'color-map') return { ...effect, amount: 0 }
  if (effect.kind === 'translate' || effect.kind === 'shear') return { ...effect, x: 0, y: 0 }
  if (effect.kind === 'scale') return { ...effect, x: 1, y: 1 }
  if (effect.kind === 'ripple' || effect.kind === 'swirl' || effect.kind === 'bulge' || effect.kind === 'pixelate' || effect.kind === 'kaleidoscope') {
    return { ...effect, amount: 0 }
  }
  return { ...effect }
}

function emitPhysicalSceneZoneStackTransition(
  fromZone: ControllerZone,
  toZone: ControllerZone,
  zoneIndex: number,
  zoneName: string,
  fromStack: ResolvedRoutedScenePlacement[],
  toStack: ResolvedRoutedScenePlacement[],
  transition: ShowSceneSequenceTransitionRecipe,
  outputDimension: 1 | 2,
  fromSceneIndex: number,
  toSceneIndex: number,
  snapshotRenderTarget?: ShowRenderTargetPlan<'stage-rgb'>,
): string {
  const from = routedSceneStackNeedsWrapper(fromStack)
    ? routedSceneCompositeMember(fromStack, routedSceneStackPrefix(fromSceneIndex, zoneName))
    : fromStack[0].member
  const to = routedSceneStackNeedsWrapper(toStack)
    ? routedSceneCompositeMember(toStack, routedSceneStackPrefix(toSceneIndex, zoneName))
    : toStack[0].member
  return emitPhysicalSceneZoneTransition(
    fromZone,
    toZone,
    zoneIndex,
    from,
    to,
    transition,
    outputDimension,
    fromStack.map((placement) => placement.member),
    toStack.map((placement) => placement.member),
    snapshotRenderTarget,
  )
}

function emitPhysicalSceneZoneTransition(
  fromZone: ControllerZone,
  toZone: ControllerZone,
  zoneIndex: number,
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowSceneSequenceTransitionRecipe,
  outputDimension: 1 | 2,
  fromMembers: CompiledMember[] = [from],
  toMembers: CompiledMember[] = [to],
  snapshotRenderTarget?: ShowRenderTargetPlan<'stage-rgb'>,
): string {
  const fromLocal = `__pxlblz_show_scene_zone_${zoneIndex}_from_index`
  const toLocal = `__pxlblz_show_scene_zone_${zoneIndex}_to_index`
  const fromPixelCount = Math.max(1, controllerZonePixelCount(fromZone))
  const toPixelCount = Math.max(1, controllerZonePixelCount(toZone))
  const localX = `__pxlblz_show_scene_zone_${zoneIndex}_x`
  const localY = `__pxlblz_show_scene_zone_${zoneIndex}_y`
  const toLocalX = `__pxlblz_show_scene_zone_${zoneIndex}_to_x`
  const toLocalY = `__pxlblz_show_scene_zone_${zoneIndex}_to_y`
  const width = Math.max(1, Math.ceil(Math.sqrt(fromPixelCount)))
  const height = Math.max(1, Math.ceil(fromPixelCount / width))
  const toWidth = Math.max(1, Math.ceil(Math.sqrt(toPixelCount)))
  const toHeight = Math.max(1, Math.ceil(toPixelCount / toWidth))
  const coordinatePrelude = outputDimension === 2
    ? [
        `  var ${localX} = ${width === 1 ? '0.5' : `(${fromLocal} % ${width}) / ${width - 1}`}`,
        `  var ${localY} = ${height === 1 ? '0.5' : `floor(${fromLocal} / ${width}) / ${height - 1}`}`,
        `  var ${toLocalX} = ${toWidth === 1 ? '0.5' : `(${toLocal} % ${toWidth}) / ${toWidth - 1}`}`,
        `  var ${toLocalY} = ${toHeight === 1 ? '0.5' : `floor(${toLocal} / ${toWidth}) / ${toHeight - 1}`}`,
      ]
    : []
  const fromCapture = outputDimension === 2
    ? `${from.prefix}_renderCapture2D(${fromLocal}, ${localX}, ${localY})`
    : `${from.prefix}_renderCapture(${fromLocal})`
  const toCapture = outputDimension === 2
    ? `${to.prefix}_renderCapture2D(${toLocal}, ${toLocalX}, ${toLocalY})`
    : `${to.prefix}_renderCapture(${toLocal})`
  const transitionBlock = emitSceneTransitionWithCaptures(
    from,
    to,
    transition,
    outputDimension,
    fromCapture,
    toCapture,
    { index: fromLocal, x: localX, y: localY },
    snapshotRenderTarget,
  )
  return [
    `var ${fromLocal} = -1`,
    ...emitZoneLocalAssignments(fromZone, fromLocal),
    `var ${toLocal} = -1`,
    ...emitZoneLocalAssignments(toZone, toLocal),
    `if (${fromLocal} >= 0 && ${toLocal} >= 0) {`,
    ...fromMembers.map((member) => `  ${member.pixelCountName} = ${fromPixelCount}`),
    ...toMembers.map((member) => `  ${member.pixelCountName} = ${toPixelCount}`),
    `  ${from.pixelCountName} = ${fromPixelCount}`,
    `  ${to.pixelCountName} = ${toPixelCount}`,
    ...coordinatePrelude,
    indentBlock(transitionBlock, 2),
    `  return`,
    `}`,
  ].join('\n')
}

function emitSceneTransitionWithCaptures(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowSceneSequenceTransitionRecipe,
  outputDimension: 1 | 2,
  fromCapture: string,
  toCapture: string,
  localCoordinates: { index: string; x: string; y: string },
  snapshotRenderTarget?: ShowRenderTargetPlan<'stage-rgb'>,
): string {
  if (transition.kind === 'motion') {
    return emitMotionTransitionRenderBlock(from, to, transition, localCoordinates)
  }
  if (transition.kind === 'crossfade' && snapshotRenderTarget) {
    return emitSnapshotLiveCrossfadeBlock(
      from,
      to,
      fromCapture,
      toCapture,
      snapshotRenderTarget,
      'index',
      '__pxlblz_show_snapshot_writing',
      false,
    )
  }
  return emitSceneSequenceTransitionBlock(from, to, transition, outputDimension)
    .split(memberRenderCapture(from, outputDimension)).join(fromCapture)
    .split(memberRenderCapture(to, outputDimension)).join(toCapture)
}

function routedSceneMemberCapture(
  member: CompiledMember,
  localIndex: string,
  pixelCount: number,
  outputDimension: 1 | 2,
  zoneIndex: number,
): string {
  if (outputDimension === 1) return `${member.prefix}_renderCapture(${localIndex})`
  const width = Math.max(1, Math.ceil(Math.sqrt(pixelCount)))
  const height = Math.max(1, Math.ceil(pixelCount / width))
  const localX = `__pxlblz_show_scene_zone_${zoneIndex}_x`
  const localY = `__pxlblz_show_scene_zone_${zoneIndex}_y`
  return `var ${localX} = ${width === 1 ? '0.5' : `(${localIndex} % ${width}) / ${width - 1}`}
var ${localY} = ${height === 1 ? '0.5' : `floor(${localIndex} / ${width}) / ${height - 1}`}
${member.prefix}_renderCapture2D(${localIndex}, ${localX}, ${localY})`
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
  if (!effects || !member.animatedEffects || member.staticPlanEffects) return ''
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
    if (from === to) {
      return `${fromRender}
${from.prefix}_emit()`
    }
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
  coordinates: { index: string; x: string; y: string } = { index: 'index', x: 'x', y: 'y' },
  runtimeVector?: { x: string; y: string },
  runtimeAffine?: { contentScale: string; anchorX: string; anchorY: string; signedRotation: string },
): string {
  const { index, x, y } = coordinates
  const settings = normalizeShowMotionTransition(transition)
  const vector = runtimeVector ?? showMotionTransitionVector(settings.direction)
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
  const contentScale = runtimeAffine?.contentScale ?? String(settings.contentScale)
  const anchorX = runtimeAffine?.anchorX ?? String(settings.anchorX)
  const anchorY = runtimeAffine?.anchorY ?? String(settings.anchorY)
  const signedRotation = runtimeAffine?.signedRotation
    ?? String((settings.spinDirection === 'counterclockwise' ? -1 : 1) * settings.rotation)
  const scaleExpression = grows
    ? `${contentScale} * (1 - __pxlblz_show_mix) + __pxlblz_show_mix`
    : `(1 - __pxlblz_show_mix) + ${contentScale} * __pxlblz_show_mix`
  const rotationExpression = settings.motionVariant === 'zoom-in'
    ? `${signedRotation} * (1 - __pxlblz_show_mix)`
    : `${signedRotation} * __pxlblz_show_mix`
  const affineCoordinates = {
    x: `${anchorX} + (__pxlblz_show_motion_cos * (${x} - ${anchorX}) + __pxlblz_show_motion_sin * (${y} - ${anchorY})) / __pxlblz_show_motion_scale`,
    y: `${anchorY} + (-__pxlblz_show_motion_sin * (${x} - ${anchorX}) + __pxlblz_show_motion_cos * (${y} - ${anchorY})) / __pxlblz_show_motion_scale`,
  }
  const fromCoordinates = settings.motionVariant === 'reveal' || settings.motionVariant === 'push'
    ? {
        x: `${x} - ${vector.x} * __pxlblz_show_mix`,
        y: `${y} - ${vector.y} * __pxlblz_show_mix`,
      }
    : settings.motionVariant === 'content-shrink' || settings.motionVariant === 'zoom-out'
      ? {
          x: spins ? affineCoordinates.x : `${anchorX} + (${x} - ${anchorX}) / __pxlblz_show_motion_scale`,
          y: spins ? affineCoordinates.y : `${anchorY} + (${y} - ${anchorY}) / __pxlblz_show_motion_scale`,
        }
      : { x, y }
  const toCoordinates = settings.motionVariant === 'cover' || settings.motionVariant === 'push'
    ? {
        x: `${x} + ${vector.x} * (1 - __pxlblz_show_mix)`,
        y: `${y} + ${vector.y} * (1 - __pxlblz_show_mix)`,
      }
    : settings.motionVariant === 'content-grow' || settings.motionVariant === 'zoom-in'
      ? {
          x: spins ? affineCoordinates.x : `${anchorX} + (${x} - ${anchorX}) / __pxlblz_show_motion_scale`,
          y: spins ? affineCoordinates.y : `${anchorY} + (${y} - ${anchorY}) / __pxlblz_show_motion_scale`,
        }
      : { x, y }
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
  const fromRender = `${from.prefix}_renderCapture2D(${index}, __pxlblz_show_motion_from_x, __pxlblz_show_motion_from_y)`
  const toRender = `${to.prefix}_renderCapture2D(${index}, __pxlblz_show_motion_to_x, __pxlblz_show_motion_to_y)`
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

function emitRouteShowCode(
  members: CompiledMember[],
  routes: ResolvedRoute[],
  outputDimension: 1 | 2,
  outputPixelCount?: number,
): string {
  return [
    emitRuntimePrelude(members, outputDimension),
    ...members.map(member => member.code.trim()),
    emitRouteScheduler(routes),
    emitRouteRender(routes, outputDimension, outputPixelCount),
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
  outputPixelCount?: number,
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
      return `  if (__pxlblz_show_elapsed_s >= ${routingSwitch.atMs / 1000}) __pxlblz_show_route_layout = ${destinationLayoutIndex}`
    }
    const progress = '__pxlblz_show_route_progress'
    return `  if (__pxlblz_show_elapsed_s >= ${routingSwitch.atMs / 1000}) {
    __pxlblz_show_route_layout = ${destinationLayoutIndex}
    __pxlblz_show_route_from_layout = ${sourceLayoutIndex}
    __pxlblz_show_route_progress = 1
    if (__pxlblz_show_elapsed_s < ${(routingSwitch.atMs + durationMs) / 1000}) {
      __pxlblz_show_route_progress = clamp((__pxlblz_show_elapsed_s - ${routingSwitch.atMs / 1000}) / ${durationMs / 1000}, 0, 1)
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
    : emitRouteRenderBody(layout.routes, '    ', outputDimension, outputPixelCount)}
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
    emitRuntimePrelude(members, outputDimension),
    ...members.map((member) => member.code.trim()),
    packedPrelude,
    `var __pxlblz_show_route_layout = 0`,
    ...(propertyRamps ? [`var __pxlblz_show_route_split_position = ${clampNumber(propertyRamps.splitPosition.initial, 0, 1)}`] : []),
    ...progressiveGlobals,
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_s = (__pxlblz_show_elapsed_s + delta / 1000) % ${loopDurationMs / 1000}
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
    const atS = ramp.atMs / 1000
    const durationS = Math.max(1, durationMs) / 1000
    const progress = `clamp((__pxlblz_show_elapsed_s - ${atS}) / ${durationS}, 0, 1)`
    const mix = emitShowEasingExpression(ramp.easing, progress)
    lines.push(`  if (__pxlblz_show_elapsed_s >= ${atS}) {
    __pxlblz_show_route_split_position = ${to}
    if (__pxlblz_show_elapsed_s < ${(ramp.atMs + durationMs) / 1000}) __pxlblz_show_route_split_position = ${from} * (1 - ${mix}) + ${to} * ${mix}
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
      const atS = ramp.atMs / 1000
      const durationS = Math.max(1, durationMs) / 1000
      const progress = `clamp((__pxlblz_show_elapsed_s - ${atS}) / ${durationS}, 0, 1)`
      const mix = emitShowEasingExpression(ramp.easing, progress)
      return `  if (__pxlblz_show_elapsed_s >= ${atS}) {
    __pxlblz_show_sample_repeat_scale = ${to}
    if (__pxlblz_show_elapsed_s < ${(ramp.atMs + durationMs) / 1000}) __pxlblz_show_sample_repeat_scale = ${from} * (1 - ${mix}) + ${to} * ${mix}
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
  const secondsAssignmentStart = code.indexOf('__pxlblz_show_elapsed_s =', functionStart)
  const assignmentStart = secondsAssignmentStart >= 0
    ? secondsAssignmentStart
    : code.indexOf('__pxlblz_show_elapsed_ms =', functionStart)
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
  hasCoordinates: boolean
  wrap: boolean
  opacity: number
} | null {
  if (showEffectsAreIdentity(member.effects) && !member.animatedEffects) return null
  const matrix = buildShowEffectSampleMatrix(member.effects)
  const opacity = applyShowEffectsToSample(member.effects, 0.5, 0.5).opacity
  const hasAffine = member.effects.some((effect) => (
    effect.kind === 'translate' || effect.kind === 'rotate' || effect.kind === 'scale' || effect.kind === 'shear'
  ))
  const hasDistortion = member.effects.some((effect) => isShowDistortionEffect(effect) && effect.amount !== 0)
  const hasCoordinates = hasAffine || hasDistortion || (member.animatedEffects && member.effects.some(isShowDistortionEffect))
  const wrap = member.effects.some((effect) => effect.kind === 'wrap') && hasCoordinates
  const parameterDeclarations = member.effects.flatMap((effect) => (
    member.staticPlanEffects && ['translate', 'rotate', 'scale', 'shear'].includes(effect.kind)
      ? []
      : showEffectParameterNames(effect).map((parameter) => (
          `var ${effectParameterVariable(member, effect.id, parameter)} = ${effectParameterValue(effect, parameter)}`
        ))
  ))
  const operationAssignments = member.effects.flatMap((effect, index) => {
    if (!['translate', 'rotate', 'scale', 'shear'].includes(effect.kind)) return []
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
    hasCoordinates,
    wrap,
    opacity,
    declarations: [
      ...(member.animatedEffects ? [
        ...parameterDeclarations,
      ] : []),
      ...(member.animatedEffects && hasAffine && !member.staticPlanEffects ? [
        `var ${member.prefix}_fx_ma = 1`,
        `var ${member.prefix}_fx_mb = 0`,
        `var ${member.prefix}_fx_mc = 0`,
        `var ${member.prefix}_fx_md = 1`,
        `var ${member.prefix}_fx_mtx = 0`,
        `var ${member.prefix}_fx_mty = 0`,
      ] : []),
      ...(hasAffine ? [
        `var ${member.prefix}_fx_a = ${matrix.a}`,
        `var ${member.prefix}_fx_b = ${matrix.b}`,
        `var ${member.prefix}_fx_c = ${matrix.c}`,
        `var ${member.prefix}_fx_d = ${matrix.d}`,
        `var ${member.prefix}_fx_tx = ${matrix.tx}`,
        `var ${member.prefix}_fx_ty = ${matrix.ty}`,
      ] : []),
      ...(member.animatedEffects && hasAffine && !member.staticPlanEffects ? [updateFunction] : []),
    ],
  }
}

function emitMemberDistortionSampling(member: CompiledMember, x: string, y: string): string {
  const value = (effect: ShowClipEffect, parameter: string): string => member.animatedEffects
    ? effectParameterVariable(member, effect.id, parameter)
    : String(showEffectNumericValue(effect, parameter))
  return member.effects.flatMap((effect, index): string[] => {
    if (!isShowDistortionEffect(effect)) return []
    const amount = value(effect, 'amount')
    const name = `${member.prefix}_fx_distort_${index}`
    if (effect.kind === 'ripple') {
      return [`  var ${name}_dx = ${x} - ${value(effect, 'centerX')}
  var ${name}_dy = ${y} - ${value(effect, 'centerY')}
  var ${name}_radius = hypot(${name}_dx, ${name}_dy)
  if (${name}_radius > 0.000001) {
    var ${name}_offset = ${amount} * sin((${name}_radius * ${value(effect, 'frequency')} + ${value(effect, 'phase')}) * 6.283185307179586)
    ${x} = ${x} + ${name}_dx * ${name}_offset / ${name}_radius
    ${y} = ${y} + ${name}_dy * ${name}_offset / ${name}_radius
  }`]
    }
    if (effect.kind === 'swirl') {
      return [`  var ${name}_dx = ${x} - ${value(effect, 'centerX')}
  var ${name}_dy = ${y} - ${value(effect, 'centerY')}
  var ${name}_radius = hypot(${name}_dx, ${name}_dy)
  var ${name}_falloff = max(0, 1 - ${name}_radius / ${value(effect, 'radius')})
  var ${name}_angle = ${amount} * ${name}_falloff * ${name}_falloff * 6.283185307179586
  var ${name}_cos = cos(${name}_angle)
  var ${name}_sin = sin(${name}_angle)
  ${x} = ${value(effect, 'centerX')} + ${name}_dx * ${name}_cos - ${name}_dy * ${name}_sin
  ${y} = ${value(effect, 'centerY')} + ${name}_dx * ${name}_sin + ${name}_dy * ${name}_cos`]
    }
    if (effect.kind === 'bulge') {
      return [`  var ${name}_dx = ${x} - ${value(effect, 'centerX')}
  var ${name}_dy = ${y} - ${value(effect, 'centerY')}
  var ${name}_radius = hypot(${name}_dx, ${name}_dy)
  var ${name}_falloff = max(0, 1 - ${name}_radius / ${value(effect, 'radius')})
  var ${name}_scale = max(0.05, 1 + ${amount} * ${name}_falloff * ${name}_falloff)
  ${x} = ${value(effect, 'centerX')} + ${name}_dx / ${name}_scale
  ${y} = ${value(effect, 'centerY')} + ${name}_dy / ${name}_scale`]
    }
    if (effect.kind === 'pixelate') {
      return [`  var ${name}_target_x = (min(${value(effect, 'columns')} - 1, floor(clamp(${x}, 0, 1) * ${value(effect, 'columns')})) + 0.5) / ${value(effect, 'columns')}
  var ${name}_target_y = (min(${value(effect, 'rows')} - 1, floor(clamp(${y}, 0, 1) * ${value(effect, 'rows')})) + 0.5) / ${value(effect, 'rows')}
  ${x} = ${x} + (${name}_target_x - ${x}) * ${amount}
  ${y} = ${y} + (${name}_target_y - ${y}) * ${amount}`]
    }
    return [`  var ${name}_dx = ${x} - ${value(effect, 'centerX')}
  var ${name}_dy = ${y} - ${value(effect, 'centerY')}
  var ${name}_radius = hypot(${name}_dx, ${name}_dy)
  var ${name}_turn = (atan2(${name}_dy, ${name}_dx) / 6.283185307179586 + ${value(effect, 'rotation')}) * ${value(effect, 'segments')}
  var ${name}_sector = ${name}_turn - floor(${name}_turn)
  var ${name}_angle = abs(${name}_sector - 0.5) / ${value(effect, 'segments')} * 6.283185307179586
  var ${name}_target_x = ${value(effect, 'centerX')} + ${name}_radius * cos(${name}_angle)
  var ${name}_target_y = ${value(effect, 'centerY')} + ${name}_radius * sin(${name}_angle)
  ${x} = ${x} + (${name}_target_x - ${x}) * ${amount}
  ${y} = ${y} + (${name}_target_y - ${y}) * ${amount}`]
  }).join('\n')
}

function effectParameterVariable(member: CompiledMember, effectId: string, parameter: string): string {
  const index = member.effects.findIndex((effect) => effect.id === effectId)
  if (index < 0) throw new Error(`Clip "${member.id}" cannot animate missing Effect "${effectId}".`)
  return `${member.prefix}_fx_p${index}_${parameter}`
}

function effectParameterValue(effect: ShowClipEffect, parameter: string): number {
  return showEffectNumericValue(effect, parameter)
}

function emitMemberOutputEffectLines(member: CompiledMember): string {
  const r = `${member.prefix}_r`
  const g = `${member.prefix}_g`
  const b = `${member.prefix}_b`
  const value = (effect: ShowClipEffect, parameter: string): string => member.animatedEffects
    ? effectParameterVariable(member, effect.id, parameter)
    : String(showEffectNumericValue(effect, parameter))
  const lines = member.exactSpecializations && !member.needsBrightnessScale
    ? []
    : [
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
  return lines.join('\n')
}

function emitRuntimePrelude(
  members: CompiledMember[],
  outputDimension: ShowOutputDimension,
  options: {
    includeAdaptationMix?: boolean
    includeHash?: boolean
    includeMix?: boolean
    includePhase?: boolean
  } = {},
): string {
  const includeAdaptationMix = options.includeAdaptationMix ?? false
  const includeHash = options.includeHash ?? true
  const includeMix = options.includeMix ?? true
  const includePhase = options.includePhase ?? true
  const samplePropertyRamps = members[0]?.samplePropertyRamps
  const sampleRuntime = emitSampleRemappingRuntime(samplePropertyRamps)
  const memberVars = members.flatMap((member, index) => {
    const effectRuntime = describeMemberEffectRuntime(member)
    const compatibility = selectRenderCompatibility(outputDimension, {
      hasBeforeRender: member.hasBeforeRender,
      hasRender: member.hasRender,
      hasRender2D: member.hasRender2D,
      hasRender3D: member.hasRender3D,
    })
    const rendererGuaranteesOutput = compatibility.renderer
      ? member.outputGuarantees[compatibility.renderer]
      : false
    const identitySamplePath = member.exactSpecializations
      && !member.needsMirrorMapping
      && !samplePropertyRamps
      && !effectRuntime?.hasCoordinates
    const omitClear = member.exactSpecializations
      && rendererGuaranteesOutput
      && !member.adaptation.lightShutter
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
    ${member.usesTime ? `${member.elapsedSecondsName} = ${member.elapsedSecondsName} + deliveredDelta / 1000` : ''}
    ${member.hasBeforeRender ? `${member.beforeRenderName}(deliveredDelta)` : ''}
    ${member.frameInvariantUpdateName ? `${member.frameInvariantUpdateName}()` : ''}
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
  else if (frac(__pxlblz_show_elapsed_s * ${member.prefix}_shutter_rate_hz + ${member.prefix}_shutter_phase) < ${member.prefix}_shutter_duty) ${member.prefix}_shutter_open = 1
  else ${member.prefix}_shutter_open = 0
}`,
          ...(lightShutter.clockBehavior === 'freeze'
            ? [
                `function ${member.prefix}_shutterActiveCycles(cycles) {
  return floor(cycles) * ${member.prefix}_shutter_duty + min(frac(cycles), ${member.prefix}_shutter_duty)
}`,
                `function ${member.prefix}_shutterActiveMs(startS, endS) {
  if (${member.prefix}_shutter_duty <= 0) return 0
  if (${member.prefix}_shutter_duty >= 1) return (endS - startS) * 1000
  var cyclesPerS = ${member.prefix}_shutter_rate_hz
  var startCycles = startS * cyclesPerS + ${member.prefix}_shutter_phase
  var endCycles = endS * cyclesPerS + ${member.prefix}_shutter_phase
  return (${member.prefix}_shutterActiveCycles(endCycles) - ${member.prefix}_shutterActiveCycles(startCycles)) / cyclesPerS * 1000
}`,
              ]
            : []),
        ]
      : []
    const advanceDelta = (delta: string, indent: string) => steppedClock
      ? `${indent}${member.prefix}_advanceStepped(${delta})`
      : `${indent}var scaledDelta = ${delta} * ${member.prefix}_adapt_timeScale
${indent}${member.elapsedName} = ${member.elapsedName} + scaledDelta
${member.usesTime ? `${indent}${member.elapsedSecondsName} = ${member.elapsedSecondsName} + scaledDelta / 1000\n` : ''}
${indent}${member.hasBeforeRender ? `${member.beforeRenderName}(scaledDelta)` : ''}
${indent}${member.frameInvariantUpdateName ? `${member.frameInvariantUpdateName}()` : ''}`
    const controlCalls = member.controls.map((control) => `  ${control.functionName}(${control.valueName})`).join('\n')
    const effectUpdateCall = effectRuntime?.hasAffine && member.animatedEffects && !member.staticPlanEffects
      ? `\n  ${member.prefix}_fx_update()`
      : ''
    const advance = lightShutter?.clockBehavior === 'freeze'
      ? `function ${member.prefix}_advance(delta) {${controlCalls ? `\n${controlCalls}` : ''}${effectUpdateCall}
  ${member.prefix}_updateShutter()
  var activeDelta = ${member.prefix}_shutterActiveMs(__pxlblz_show_elapsed_s - delta / 1000, __pxlblz_show_elapsed_s)
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
    ...(member.usesTime ? [`var ${member.elapsedSecondsName} = ${member.adaptation.timeOffsetMs / 1000}`] : []),
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
    ...(member.usesHsv
      ? [`function ${member.prefix}_hsv(h, s, v) { __pxlblz_show_capture_hsv(${index}, h + ${member.prefix}_adapt_phase, s, v) }`]
      : []),
    ...(member.usesTime
      ? [`function ${member.prefix}_time(interval) { return (${member.elapsedSecondsName} / (interval * 65.536)) % 1 }`]
      : []),
    ...(includeAdaptationMix ? [`function ${member.prefix}_setAdaptation(brightness, phase, timeScale, mirror) {
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
}`] : []),
    advance,
    ...(outputDimension === 1 ? [`function ${member.prefix}_renderCapture(index) {
${identitySamplePath ? '' : `  var mappedIndex = index
  if (${member.prefix}_adapt_mirror >= 0.5) mappedIndex = ${member.pixelCountName} - 1 - index
`}${samplePropertyRamps ? `  if (__pxlblz_show_sample_repeat_scale != 1) {
    var mappedPosition = mappedIndex / max(1, ${member.pixelCountName} - 1)
    mappedIndex = min(${member.pixelCountName} - 1, floor(frac(mappedPosition * __pxlblz_show_sample_repeat_scale) * ${member.pixelCountName}))
  }
` : ''}${effectRuntime?.hasCoordinates ? `  var effectPosition = mappedIndex / max(1, ${member.pixelCountName} - 1)
  var effectX = ${effectRuntime.hasAffine ? `${member.prefix}_fx_a * effectPosition + ${member.prefix}_fx_c * 0.5 + ${member.prefix}_fx_tx` : 'effectPosition'}
  var effectY = ${effectRuntime.hasAffine ? `${member.prefix}_fx_b * effectPosition + ${member.prefix}_fx_d * 0.5 + ${member.prefix}_fx_ty` : '0.5'}
${emitMemberDistortionSampling(member, 'effectX', 'effectY')}
  var effectInside = effectX >= 0 && effectX <= 1 && effectY >= 0 && effectY <= 1
  ${effectRuntime.wrap ? 'effectX = effectX - floor(effectX)' : 'effectX = clamp(effectX, 0, 1)'}
  mappedIndex = min(${member.pixelCountName} - 1, floor(effectX * ${member.pixelCountName}))
` : ''}${omitClear ? '' : `  ${member.prefix}_clear()
`}  ${member.hasRender ? emitSelectedMemberRendererCall(member, 1, { index: identitySamplePath ? 'index' : 'mappedIndex' }) : ''}
${emitMemberOutputEffectLines(member)}
${effectRuntime?.hasCoordinates && !effectRuntime.wrap ? `  if (!effectInside) ${member.prefix}_clear()
` : ''}}`] : []),
    ...(outputDimension === 2 ? [`function ${member.prefix}_renderCapture2D(index, x, y) {
${identitySamplePath ? '' : `  var mappedIndex = index
  var mappedX = x
${samplePropertyRamps || effectRuntime?.hasCoordinates ? '  var mappedY = y\n' : ''}  if (${member.prefix}_adapt_mirror >= 0.5) {
    mappedIndex = ${member.pixelCountName} - 1 - index
    mappedX = 1 - x
  }
`}
${samplePropertyRamps ? `  if (__pxlblz_show_sample_repeat_scale != 1) {
    mappedX = frac(clamp(mappedX, 0, 1) * __pxlblz_show_sample_repeat_scale)
    mappedY = frac(clamp(mappedY, 0, 1) * __pxlblz_show_sample_repeat_scale)${!member.hasRender2D && member.hasRender ? `
    mappedIndex = min(${member.pixelCountName} - 1, floor(mappedX * ${member.pixelCountName}))` : ''}
  }
` : ''}${effectRuntime?.hasCoordinates ? `  var effectX = ${effectRuntime.hasAffine ? `${member.prefix}_fx_a * mappedX + ${member.prefix}_fx_c * mappedY + ${member.prefix}_fx_tx` : 'mappedX'}
  var effectY = ${effectRuntime.hasAffine ? `${member.prefix}_fx_b * mappedX + ${member.prefix}_fx_d * mappedY + ${member.prefix}_fx_ty` : 'mappedY'}
${emitMemberDistortionSampling(member, 'effectX', 'effectY')}
  var effectInside = effectX >= 0 && effectX <= 1 && effectY >= 0 && effectY <= 1
  ${effectRuntime.wrap ? 'mappedX = effectX - floor(effectX)\n  mappedY = effectY - floor(effectY)' : 'mappedX = clamp(effectX, 0, 1)\n  mappedY = clamp(effectY, 0, 1)'}
` : ''}${omitClear ? '' : `  ${member.prefix}_clear()
`}
  ${emitSelectedMemberRendererCall(member, 2, {
    index: identitySamplePath ? 'index' : 'mappedIndex',
    x: identitySamplePath ? 'x' : 'mappedX',
    y: identitySamplePath ? 'y' : samplePropertyRamps || effectRuntime?.hasCoordinates ? 'mappedY' : 'y',
  })}
${emitMemberOutputEffectLines(member)}
${effectRuntime?.hasCoordinates && !effectRuntime.wrap ? `  if (!effectInside) ${member.prefix}_clear()
` : ''}}`] : []),
    `function ${member.prefix}_emit() { rgb(${member.prefix}_r, ${member.prefix}_g, ${member.prefix}_b) }`,
    ]
  })

  const usesHsv = members.some((member) => member.usesHsv)
  const captureBranches = members.length <= 2
    ? `if (slot == 0) { __pxlblz_show_c0_r = r; __pxlblz_show_c0_g = g; __pxlblz_show_c0_b = b }
  else { __pxlblz_show_c1_r = r; __pxlblz_show_c1_g = g; __pxlblz_show_c1_b = b }`
    : members.map((member, index) => (
        `${index === 0 ? 'if' : 'else if'} (slot == ${index}) { ${member.prefix}_r = r; ${member.prefix}_g = g; ${member.prefix}_b = b }`
      )).join('\n  ')

  return [
    'var __pxlblz_show_elapsed_s = 0',
    ...(includeMix ? ['var __pxlblz_show_mix = 0'] : []),
    ...(includePhase ? ['var __pxlblz_show_phase = 0'] : []),
    ...(sampleRuntime ? [sampleRuntime] : []),
    ...memberVars,
    ...(usesHsv ? [`function __pxlblz_show_capture_rgb(slot, r, g, b) {
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
}`] : []),
    ...(includeHash ? [`function __pxlblz_show_hash01(index) {
  return frac((index + 1) * 0.61803398875)
}`] : []),
  ].join('\n')
}

function emitScheduler(
  from: CompiledMember,
  to: CompiledMember,
  transitionStart: number,
  transitionEnd: number,
  duration: number,
  easing: ShowTransitionEasing = 'linear',
  resetSnapshot = false,
): string {
  return `export function beforeRender(delta) {
  __pxlblz_show_elapsed_s = __pxlblz_show_elapsed_s + delta / 1000
  if (__pxlblz_show_elapsed_s < ${transitionStart / 1000}) {
    __pxlblz_show_phase = 0
    __pxlblz_show_mix = 0
    ${resetSnapshot ? '__pxlblz_show_snapshot_ready = 0' : ''}
    ${from.prefix}_advance(delta)
  } else if (__pxlblz_show_elapsed_s < ${transitionEnd / 1000}) {
    __pxlblz_show_phase = 1
    __pxlblz_show_mix = ${emitShowEasingExpression(easing, `(__pxlblz_show_elapsed_s - ${transitionStart / 1000}) / ${duration / 1000}`)}
    ${from.prefix}_advance(delta)
    ${to.prefix}_advance(delta)
  } else {
    __pxlblz_show_phase = 2
    __pxlblz_show_mix = 1
    ${to.prefix}_advance(delta)
  }
}`
}

function emitSnapshotLiveRender(
  from: CompiledMember,
  to: CompiledMember,
  outputDimension: ShowOutputDimension,
  renderTarget: ShowRenderTargetPlan<'stage-rgb'>,
): string {
  const transitionBlock = emitSnapshotLiveCrossfadeBlock(
    from,
    to,
    emitMemberCaptureCall(from, outputDimension),
    emitMemberCaptureCall(to, outputDimension),
    renderTarget,
  )
  return emitOuterRenderer(outputDimension, `  if (__pxlblz_show_phase == 0) {
    ${emitMemberCaptureCall(from, outputDimension)}
    ${from.prefix}_emit()
  } else if (__pxlblz_show_phase == 2) {
    ${emitMemberCaptureCall(to, outputDimension)}
    ${to.prefix}_emit()
  } else {
${indentBlock(transitionBlock, 4)}
  }`)
}

function emitSnapshotLiveCrossfadeBlock(
  from: CompiledMember,
  to: CompiledMember,
  fromCapture: string,
  toCapture: string,
  renderTarget: ShowRenderTargetPlan<'stage-rgb'>,
  physicalIndex = 'index',
  captureCondition = '!__pxlblz_show_snapshot_ready',
  markReady = true,
): string {
  const readR = emitShowRenderTargetRead(renderTarget, 'r', physicalIndex)
  const readG = emitShowRenderTargetRead(renderTarget, 'g', physicalIndex)
  const readB = emitShowRenderTargetRead(renderTarget, 'b', physicalIndex)
  return `if (${captureCondition}) {
  ${fromCapture}
  ${emitShowRenderTargetWrite(renderTarget, 'r', physicalIndex, `${from.prefix}_r`)}
  ${emitShowRenderTargetWrite(renderTarget, 'g', physicalIndex, `${from.prefix}_g`)}
  ${emitShowRenderTargetWrite(renderTarget, 'b', physicalIndex, `${from.prefix}_b`)}
}
${toCapture}
rgb(
  ${readR} * (1 - __pxlblz_show_mix) + ${to.prefix}_r * __pxlblz_show_mix,
  ${readG} * (1 - __pxlblz_show_mix) + ${to.prefix}_g * __pxlblz_show_mix,
  ${readB} * (1 - __pxlblz_show_mix) + ${to.prefix}_b * __pxlblz_show_mix
)
${markReady ? `if (${physicalIndex} == pixelCount - 1) __pxlblz_show_snapshot_ready = 1` : ''}`
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
  __pxlblz_show_elapsed_s = __pxlblz_show_elapsed_s + delta / 1000
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

function emitRouteRender(
  routes: ResolvedRoute[],
  outputDimension: 1 | 2,
  outputPixelCount?: number,
): string {
  const blocks = emitRouteRenderBody(routes, '', outputDimension, outputPixelCount)
  return `export function ${outputDimension === 2 ? 'render2D(index, x, y)' : 'render(index)'} {
${blocks}
  rgb(0, 0, 0)
}`
}

function emitRouteRenderBody(
  routes: ResolvedRoute[],
  indent: string,
  outputDimension: 1 | 2,
  outputPixelCount?: number,
): string {
  const specialization = routes[0]?.member.exactSpecializations
    ? planPhysicalRoutingShortCircuit(routes.map((route) => ({ ranges: route.zone.ranges })), outputPixelCount)
    : null
  if (specialization) return emitShortCircuitRouteRenderBody(routes, specialization, indent, outputDimension)
  return routes
    .map((route) => emitRouteRenderBlock(route, outputDimension).split('\n').map((line) => `${indent}${line}`).join('\n'))
    .join('\n')
}

function emitShortCircuitRouteRenderBody(
  routes: ResolvedRoute[],
  plan: PhysicalRoutingShortCircuitPlan,
  indent: string,
  outputDimension: 1 | 2,
): string {
  return plan.ranges.map((range, rangeIndex) => {
    const route = routes[range.routeIndex]
    const localIndex = range.localOffset === 0
      ? `index - ${range.start}`
      : `${range.localOffset} + index - ${range.start}`
    const width = Math.max(1, Math.ceil(Math.sqrt(route.pixelCount)))
    const height = Math.max(1, Math.ceil(route.pixelCount / width))
    const render = outputDimension === 2
      ? [
          `  var ${route.member.prefix}_zoneLocalX = ${width === 1 ? '0.5' : `(${localIndex} % ${width}) / ${width - 1}`}`,
          `  var ${route.member.prefix}_zoneLocalY = ${height === 1 ? '0.5' : `floor((${localIndex}) / ${width}) / ${height - 1}`}`,
          `  ${route.member.prefix}_renderCapture2D(${localIndex}, ${route.member.prefix}_zoneLocalX, ${route.member.prefix}_zoneLocalY)`,
        ]
      : [`  ${route.member.prefix}_renderCapture(${localIndex})`]
    const condition = rangeIndex === plan.ranges.length - 1
      ? 'else'
      : `${rangeIndex === 0 ? 'if' : 'else if'} (index <= ${range.end})`
    return `${condition} {
  ${route.member.pixelCountName} = ${route.pixelCount}
${render.join('\n')}
  ${route.member.prefix}_emit()
  return
}`.split('\n').map((line) => `${indent}${line}`).join('\n')
  }).join('\n')
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
    '__pxlblz_show_elapsed_s',
    '__pxlblz_show_mix',
    '__pxlblz_show_phase',
    ...members.flatMap(member => [
      member.elapsedName,
      ...(member.usesTime ? [member.elapsedSecondsName] : []),
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
    member.animatedEffects && !member.staticPlanEffects ? affineCounts[index] : 0
  )))
  const hasAffine = affineCounts.some((count) => count > 0)
  const memberDistortionCosts = members.map((member) => member.effects
    .filter((effect) => isShowDistortionEffect(effect) && (member.animatedEffects || effect.amount !== 0))
    .reduce((cost, effect) => {
      const candidate = SHOW_DISTORTION_CANDIDATES.find((item) => item.id === effect.kind)
      if (!candidate) return cost
      return {
        count: cost.count + 1,
        scalar: cost.scalar + candidate.operations.scalar,
        floor: cost.floor + candidate.operations.floor,
        trig: cost.trig + candidate.operations.trig,
        sqrt: cost.sqrt + candidate.operations.sqrt,
        atan2: cost.atan2 + candidate.operations.atan2,
        cheap: cost.cheap + (candidate.qualityPolicy === 'cheap' ? 1 : 0),
        smooth: cost.smooth + (candidate.qualityPolicy === 'smooth' ? 1 : 0),
      }
    }, { count: 0, scalar: 0, floor: 0, trig: 0, sqrt: 0, atan2: 0, cheap: 0, smooth: 0 }))
  const maxDistortion = memberDistortionCosts.reduce((worst, cost) => (
    cost.scalar > worst.scalar ? cost : worst
  ), { count: 0, scalar: 0, floor: 0, trig: 0, sqrt: 0, atan2: 0, cheap: 0, smooth: 0 })
  const hasDistortion = memberDistortionCosts.some((cost) => cost.count > 0)
  const hasMotion = motionTransitions.length > 0
  const adaptationAnimated = countEffectRamps(recipe.adaptationRamp?.effectRamps)
  const sequenceAnimated = Math.max(0, ...(recipe.sceneSequence?.scenes.map((scene) => (
    countEffectRamps(scene.transitionOut?.effectRamps)
  )) ?? []))
  const hasOpacity = members.some((member) => member.effects.some((effect) => (
    effect.kind === 'opacity' && effect.opacity !== 1
  ))) || Object.values(recipe.adaptationRamp?.effectRamps ?? {}).some((parameters) => parameters.opacity !== undefined)
  const hasCoordinates = hasAffine || hasDistortion
  const hasWrap = hasCoordinates && members.some((member) => (
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
    distortionEffectsPerEvaluatedPixel: maxDistortion.count,
    distortionScalarOpsPerEvaluatedPixel: maxDistortion.scalar,
    distortionFloorCallsPerEvaluatedPixel: maxDistortion.floor,
    distortionTrigCallsPerEvaluatedPixel: maxDistortion.trig,
    distortionSqrtCallsPerEvaluatedPixel: maxDistortion.sqrt,
    distortionAtan2CallsPerEvaluatedPixel: maxDistortion.atan2,
    distortionPolicies: { cheap: maxDistortion.cheap, smooth: maxDistortion.smooth },
    addressPolicy: !hasCoordinates && !hasMotion ? 'none' : hasWrap ? 'wrap' : 'clip',
  }
}

function showRendererPressure(
  recipe: ShowRecipe,
  transitionCost: ShowCompileSummary['transitionCost'],
): { steady: number; worst: number } {
  if (recipe.routedSceneSequence) {
    const sceneDepths = recipe.routedSceneSequence.scenes.map((scene) => {
      const depthByZone = new Map<string, number>()
      for (const placement of scene.placements) {
        depthByZone.set(placement.zoneName, (depthByZone.get(placement.zoneName) ?? 0) + 1)
      }
      return Math.max(1, ...depthByZone.values())
    })
    const holdDepth = Math.max(1, ...sceneDepths)
    const transitionDepth = recipe.routedSceneSequence.scenes.slice(0, -1).reduce((worst, scene, index) => {
      if (!scene.transitionOut || scene.transitionOut.kind === 'cut') return worst
      const rendersBoth = scene.transitionOut.kind === 'crossfade'
        || (scene.transitionOut.kind === 'motion' && scene.transitionOut.edgePolicy === 'blend')
        || (scene.transitionOut.kind === 'portal'
          && clampNumber(scene.transitionOut.feather ?? 0, 0, 1) > 0
          && resolvePortalEdgePolicy(scene.transitionOut) === 'blend')
        || (scene.transitionOut.kind === 'wipe'
          && clampNumber(scene.transitionOut.feather ?? 0, 0, 1) > 0
          && scene.transitionOut.edgePolicy === 'blend')
        || (scene.transitionOut.kind === 'dither'
          && scene.transitionOut.dissolveVariant === 'soft-threshold'
          && normalizeShowDissolveSoftness(scene.transitionOut.softness ?? 0.15) > 0
          && scene.transitionOut.edgePolicy === 'blend')
      return Math.max(worst, rendersBoth
        ? sceneDepths[index] + sceneDepths[index + 1]
        : Math.max(sceneDepths[index], sceneDepths[index + 1]))
    }, 1)
    return { steady: holdDepth, worst: Math.max(holdDepth, transitionDepth) }
  }
  const worst = transitionCost === 'renderer-window' || transitionCost === 'bounded-renderer-window' ? 2 : 1
  return { steady: 1, worst }
}

function showPatternEvaluationOverride(
  transitionCost: ShowCompileSummary['transitionCost'],
  pressure: { steady: number; worst: number },
): ShowCompiledCostMetadata['cpu']['patternEvaluations'] | undefined {
  const defaultWorst = transitionCost === 'renderer-window' || transitionCost === 'bounded-renderer-window' ? 2 : 1
  if (pressure.steady === 1 && pressure.worst <= defaultWorst) return undefined
  return pressure.worst === 2
    ? { formula: '2N', basePerPixel: 2 }
    : { formula: 'S * N', samplesPerPixel: pressure.worst }
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

function compactGeneratedShowSymbols(source: string): { code: string; names: Map<string, string> } {
  const ast = parseModule(source)
  const identifiers: Node[] = []
  const existingNames = new Set<string>()
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const node = value as Node
    if (node.type === 'Identifier' && typeof node.name === 'string') {
      identifiers.push(node)
      existingNames.add(node.name)
    }
    for (const child of Object.values(node)) visit(child)
  }
  visit(ast)

  const counts = new Map<string, number>()
  for (const identifier of identifiers) {
    const name = identifier.name as string
    if (!name.startsWith('__pxlblz_show_')) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const orderedNames = [...counts].sort((left, right) => (
    right[1] - left[1] || left[0].localeCompare(right[0])
  )).map(([name]) => name)
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const suffix = (index: number) => {
    let value = index
    let result = ''
    do {
      result = alphabet[value % alphabet.length] + result
      value = Math.floor(value / alphabet.length) - 1
    } while (value >= 0)
    return result
  }
  const names = new Map<string, string>()
  let candidateIndex = 0
  for (const name of orderedNames) {
    let compact: string
    do {
      compact = `__pxlblz_${suffix(candidateIndex)}`
      candidateIndex += 1
    } while (existingNames.has(compact))
    names.set(name, compact)
    existingNames.add(compact)
  }
  const rewrites = identifiers.flatMap((identifier): Rewrite[] => {
    const compact = names.get(identifier.name as string)
    return compact ? [{ start: identifier.start, end: identifier.end, text: compact }] : []
  })
  return { code: rewriteSource(source, rewrites), names }
}

function byteLength(source: string): number {
  return new TextEncoder().encode(source).length
}
