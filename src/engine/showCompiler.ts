import * as acorn from 'acorn'
import { bundle, type BundleMetadata } from './bundle'
import {
  controllerZonePixelCount,
  findControllerZoneByName,
  normalizeControllerZones,
  type ControllerZone,
} from './controllerProfile'
import { emitFixedPoint } from './fxEmit'

export interface ShowClipRecipe {
  id: string
  source: string
  zone?: string
  zones?: string[]
  zoneMode?: 'independent' | 'span' | 'repeat'
  adaptation?: Partial<ShowClipAdaptation>
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
}

export interface ShowRouteTransitionRecipe {
  kind: 'wipe' | 'dither' | 'portal'
  startMs: number
  durationMs: number
  feather?: number
  centerX?: number
  centerY?: number
  invert?: boolean
  featherPolicy?: 'dither' | 'blend'
}

export interface ShowSceneSequenceTransitionRecipe {
  kind: 'cut' | 'crossfade' | 'wipe' | 'dither' | 'portal'
  durationMs: number
  feather?: number
  centerX?: number
  centerY?: number
  invert?: boolean
  featherPolicy?: 'dither' | 'blend'
}

export interface ShowSceneSequenceSceneRecipe {
  clipId: string
  holdMs: number
  transitionOut?: ShowSceneSequenceTransitionRecipe
}

export interface ShowSceneSequenceRecipe {
  scenes: ShowSceneSequenceSceneRecipe[]
}

export interface ShowRoutingLayoutRecipe {
  id: string
  name: string
  zones: ControllerZone[]
}

export interface ShowRoutingSwitchRecipe {
  atMs: number
  layoutId: string
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
  routingSwitches?: ShowRoutingSwitchRecipe[]
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
    | 'dither'
    | 'portal-hard'
    | 'portal-dithered-feather'
    | 'portal-blended-feather'
  clockPolicy: 'real-time' | 'scaled' | 'scaled-ramp' | 'exact-pause' | 'exact-pause-ramp'
  evaluationPolicy: 'full' | 'masked-shutter' | 'mixed'
  expectedActiveFraction: number | null
  temporalPolicy: 'continuous' | 'stepped-clock' | 'mixed'
  timeOffsetPolicy: 'none' | 'per-clip'
  worstInstantRenderersPerPixel: 1 | 2
  routingRepresentation: 'none' | 'range-branches' | 'packed-pixels'
  clips: ShowCompileClipSummary[]
  warnings: string[]
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
  beforeRenderName: string
  hasRender: boolean
  hasRender2D: boolean
  hasBeforeRender: boolean
  elapsedName: string
  pixelCountName: string
  adaptation: ShowClipAdaptation
}

interface ResolvedRoute {
  member: CompiledMember
  zone: ControllerZone
  pixelCount: number
}

interface ResolvedRoutingLayout {
  id: string
  name: string
  routes: ResolvedRoute[]
  warnings: string[]
}

export function compileShow(
  recipe: ShowRecipe,
  libraries: Record<string, string>,
): GeneratedShowArtifact {
  const expandedRecipe = { ...recipe, clips: expandRouteClips(recipe.clips) }
  validateRecipe(expandedRecipe)
  const members = expandedRecipe.clips.map((clip, index) => compileMember(clip, index, libraries))
  const route = buildRoutePlan(members, expandedRecipe)
  const routingLayouts = buildRoutingLayoutPlans(members, expandedRecipe)
  const routeMode = route !== null
  const portalTransition = expandedRecipe.routeTransition?.kind === 'portal'
    ? expandedRecipe.routeTransition
    : null
  const sequenceTransitions = expandedRecipe.sceneSequence?.scenes.flatMap((scene) => (
    scene.transitionOut ? [scene.transitionOut] : []
  )) ?? []
  const renderedSequenceTransitions = sequenceTransitions.filter((transition) => transition.kind !== 'cut')
  const sequenceHasCrossfade = renderedSequenceTransitions.some((transition) => transition.kind === 'crossfade')
  const sequenceHasPortal = renderedSequenceTransitions.some((transition) => transition.kind === 'portal')
  const portalBlend = Boolean(
    (portalTransition
      && clampNumber(portalTransition.feather ?? 0, 0, 1) > 0
      && portalTransition.featherPolicy === 'blend')
    || renderedSequenceTransitions.some((transition) => (
      transition.kind === 'portal'
      && clampNumber(transition.feather ?? 0, 0, 1) > 0
      && transition.featherPolicy === 'blend'
    )),
  )
  const sequenceOutputDimension: 1 | 2 = sequenceHasPortal || members.some((member) => member.hasRender2D) ? 2 : 1
  const routedOutputDimension: 1 | 2 = (routeMode || routingLayouts) && members.some((member) => member.hasRender2D)
    ? 2
    : 1
  const routingRepresentation: ShowCompileSummary['routingRepresentation'] = routingLayouts
    ? selectRoutingRepresentation(routingLayouts)
    : routeMode
      ? 'range-branches' as const
      : 'none' as const
  const code = expandedRecipe.sceneSequence
    ? emitSceneSequenceShowCode(members, expandedRecipe.sceneSequence, sequenceOutputDimension)
    : routingLayouts
    ? emitRoutingLayoutShowCode(
        members,
        routingLayouts,
        expandedRecipe.routingSwitches ?? [],
        expandedRecipe.loopDurationMs ?? 0,
        routedOutputDimension,
        routingRepresentation === 'packed-pixels' ? 'packed-pixels' : 'range-branches',
      )
    : routeMode
      ? emitRouteShowCode(members, route.routes, routedOutputDimension)
    : expandedRecipe.adaptationRamp
      ? emitAdaptationRampShowCode(members[0], expandedRecipe.adaptationRamp)
      : expandedRecipe.cut
        ? emitCutShowCode(members[0], members[1], expandedRecipe.cut)
        : expandedRecipe.routeTransition
          ? portalTransition
            ? emitPortalTransitionShowCode(members[0], members[1], portalTransition)
            : emitRouteTransitionShowCode(members[0], members[1], expandedRecipe.routeTransition)
        : expandedRecipe.crossfade
          ? emitShowCode(members[0], members[1], expandedRecipe.crossfade)
          : emitSingleClipShowCode(members[0])
  const metadata = buildMetadata(members, expandedRecipe.sceneSequence ? sequenceOutputDimension : portalTransition ? 2 : routedOutputDimension)
  const sourceBytesBeforeMerge = members.reduce((sum, member) => sum + member.sourceBytes, 0)
  const artifactBytes = byteLength(code)
  const transitionCost = expandedRecipe.sceneSequence
    ? sequenceHasCrossfade
      ? 'renderer-window'
      : portalBlend
        ? 'bounded-renderer-window'
        : renderedSequenceTransitions.length > 0 ? 'route' : 'none'
    : routeMode
    ? 'route'
    : expandedRecipe.crossfade
      ? 'renderer-window'
      : expandedRecipe.adaptationRamp
        ? 'parameter'
        : expandedRecipe.routeTransition
          ? portalBlend ? 'bounded-renderer-window' : 'route'
        : 'none'
  const evaluationSummary = describeEvaluationPolicy(members)
  const summary: ShowCompileSummary = {
    clipCount: members.length,
    transitionCount: expandedRecipe.sceneSequence
      ? Math.max(0, expandedRecipe.sceneSequence.scenes.length - 1)
      : routingLayouts
      ? expandedRecipe.routingSwitches?.length ?? 0
      : expandedRecipe.crossfade || expandedRecipe.cut || expandedRecipe.adaptationRamp || expandedRecipe.routeTransition ? 1 : 0,
    sourceBytesBeforeMerge,
    artifactBytes,
    measuredDeviceBudgetBytes: MEASURED_DEVICE_BUDGET_BYTES,
    artifactBudgetRatio: artifactBytes / MEASURED_DEVICE_BUDGET_BYTES,
    renderPolicy: expandedRecipe.sceneSequence
      ? sequenceHasCrossfade
        ? 'steady-active-transition-both'
        : portalBlend
          ? 'spatial-route-bounded-feather'
          : sequenceHasPortal
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
            ? portalTransition
              ? portalBlend
                ? 'spatial-route-bounded-feather'
                : 'spatial-route-one-renderer-per-pixel'
              : 'route-transition-one-renderer-per-pixel'
            : 'single-continuous-hold',
    transitionCost,
    routePolicy: expandedRecipe.sceneSequence
      ? sequenceHasPortal && portalBlend
        ? 'portal-blended-feather'
        : sequenceHasPortal && renderedSequenceTransitions.some((transition) => (
          transition.kind === 'portal' && clampNumber(transition.feather ?? 0, 0, 1) > 0
        ))
          ? 'portal-dithered-feather'
          : sequenceHasPortal
            ? 'portal-hard'
            : renderedSequenceTransitions.some((transition) => transition.kind === 'dither')
              ? 'dither'
              : renderedSequenceTransitions.some((transition) => (
                transition.kind === 'wipe' && clampNumber(transition.feather ?? 0, 0, 1) > 0
              ))
                ? 'feathered-wipe'
                : renderedSequenceTransitions.some((transition) => transition.kind === 'wipe')
                  ? 'hard-wipe'
                  : 'none'
      : portalTransition
      ? clampNumber(portalTransition.feather ?? 0, 0, 1) <= 0
        ? 'portal-hard'
        : portalBlend
          ? 'portal-blended-feather'
          : 'portal-dithered-feather'
      : expandedRecipe.routeTransition?.kind === 'dither'
      ? 'dither'
      : expandedRecipe.routeTransition?.kind === 'wipe'
        ? clampNumber(expandedRecipe.routeTransition.feather ?? 0, 0, 1) > 0
          ? 'feathered-wipe'
          : 'hard-wipe'
        : 'none',
    clockPolicy: describeClockPolicy(expandedRecipe, members),
    evaluationPolicy: evaluationSummary.policy,
    expectedActiveFraction: evaluationSummary.expectedActiveFraction,
    temporalPolicy: describeTemporalPolicy(members),
    timeOffsetPolicy: members.some((member) => member.adaptation.timeOffsetMs !== 0) ? 'per-clip' : 'none',
    worstInstantRenderersPerPixel: transitionCost === 'renderer-window' || transitionCost === 'bounded-renderer-window' ? 2 : 1,
    routingRepresentation,
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
    warnings: routingLayouts?.flatMap((layout) => layout.warnings) ?? route?.warnings ?? [],
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
): CompiledMember {
  const bundled = bundle(clip.source, libraries)
  const prefix = `__pxlblz_show_c${index}`
  const bindings = collectTopLevelBindings(bundled.code)
  const mapping = new Map([...bindings].map(name => [name, `${prefix}_${name}`]))
  const code = rewriteMemberSource(bundled.code, prefix, mapping).replace(/\bexport\s+/g, '')
  const renamedPatternVars = bundled.metadata.patternVars
    .map(name => mapping.get(name))
    .filter((name): name is string => Boolean(name))

  return {
    id: clip.id,
    prefix,
    code,
    sourceBytes: byteLength(bundled.code),
    renamedBindings: [...mapping.values()].sort(),
    renamedPatternVars,
    renderName: mapping.get('render') ?? `${prefix}_render`,
    render2DName: mapping.get('render2D') ?? `${prefix}_render2D`,
    beforeRenderName: mapping.get('beforeRender') ?? `${prefix}_beforeRender`,
    hasRender: bindings.has('render'),
    hasRender2D: bindings.has('render2D'),
    hasBeforeRender: bindings.has('beforeRender'),
    elapsedName: `${prefix}_elapsed_ms`,
    pixelCountName: `${prefix}_pixelCount`,
    adaptation: normalizeAdaptation(clip.adaptation),
  }
}

function emitShowCode(from: CompiledMember, to: CompiledMember, crossfade: ShowCrossfadeRecipe): string {
  const transitionEnd = crossfade.startMs + crossfade.durationMs
  const members = [from, to]
  return [
    emitRuntimePrelude(members),
    ...members.map(member => member.code.trim()),
    emitScheduler(from, to, crossfade.startMs, transitionEnd, crossfade.durationMs),
    emitRender(from, to),
    '',
  ].join('\n\n')
}

function emitSingleClipShowCode(member: CompiledMember): string {
  return [
    emitRuntimePrelude([member]),
    member.code.trim(),
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_ms = __pxlblz_show_elapsed_ms + delta
  ${member.prefix}_advance(delta)
}`,
    `export function render(index) {
  ${member.prefix}_renderCapture(index)
  ${member.prefix}_emit()
}`,
    '',
  ].join('\n\n')
}

function emitCutShowCode(from: CompiledMember, to: CompiledMember, cut: ShowCutRecipe): string {
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
    `export function render(index) {
  if (__pxlblz_show_phase == 0) {
    ${from.prefix}_renderCapture(index)
    ${from.prefix}_emit()
  } else {
    ${to.prefix}_renderCapture(index)
    ${to.prefix}_emit()
  }
}`,
    '',
  ].join('\n\n')
}

function emitAdaptationRampShowCode(member: CompiledMember, ramp: ShowAdaptationRampRecipe): string {
  const from = normalizeAdaptation(ramp.from)
  const to = normalizeAdaptation(ramp.to)
  const transitionEnd = ramp.startMs + ramp.durationMs
  return [
    emitRuntimePrelude([member]),
    member.code.trim(),
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_ms = __pxlblz_show_elapsed_ms + delta
  if (__pxlblz_show_elapsed_ms < ${ramp.startMs}) {
    __pxlblz_show_mix = 0
  } else if (__pxlblz_show_elapsed_ms < ${transitionEnd}) {
    __pxlblz_show_mix = (__pxlblz_show_elapsed_ms - ${ramp.startMs}) / ${ramp.durationMs}
  } else {
    __pxlblz_show_mix = 1
  }
  ${member.prefix}_mixAdaptation(${from.brightness}, ${from.phase}, ${from.timeScale}, ${boolNumber(from.mirror)}, ${to.brightness}, ${to.phase}, ${to.timeScale}, ${boolNumber(to.mirror)}, __pxlblz_show_mix)
  ${member.prefix}_advance(delta)
}`,
    `export function render(index) {
  ${member.prefix}_renderCapture(index)
  ${member.prefix}_emit()
}`,
    '',
  ].join('\n\n')
}

function emitRouteTransitionShowCode(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowRouteTransitionRecipe,
): string {
  const transitionEnd = transition.startMs + transition.durationMs
  const feather = clampNumber(transition.feather ?? 0, 0, 1)
  const featherPrelude = transition.kind === 'wipe' && feather > 0
    ? `  var __pxlblz_show_feather_progress = (__pxlblz_show_mix + ${feather / 2} - index / pixelCount) / ${feather}\n`
    : ''
  const pickTo = transition.kind === 'wipe'
    ? feather > 0
      ? `index / pixelCount < __pxlblz_show_mix - ${feather / 2} || (index / pixelCount < __pxlblz_show_mix + ${feather / 2} && __pxlblz_show_hash01(index) < clamp(__pxlblz_show_feather_progress, 0, 1))`
      : 'index / pixelCount < __pxlblz_show_mix'
    : '__pxlblz_show_hash01(index) < __pxlblz_show_mix'
  return [
    emitRuntimePrelude([from, to]),
    from.code.trim(),
    to.code.trim(),
    emitScheduler(from, to, transition.startMs, transitionEnd, transition.durationMs),
    `export function render(index) {
${featherPrelude}  if (__pxlblz_show_phase == 0) {
    ${from.prefix}_renderCapture(index)
    ${from.prefix}_emit()
  } else if (__pxlblz_show_phase == 2) {
    ${to.prefix}_renderCapture(index)
    ${to.prefix}_emit()
  } else if (${pickTo}) {
    ${to.prefix}_renderCapture(index)
    ${to.prefix}_emit()
  } else {
    ${from.prefix}_renderCapture(index)
    ${from.prefix}_emit()
  }
}`,
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
    __pxlblz_show_mix = 0
    ${segment.from.prefix}_advance(delta)
  }`
    }
    const to = segment.to!
    const advanceTo = to === segment.from ? '' : `\n    ${to.prefix}_advance(delta)`
    return `${condition} {
    __pxlblz_show_scene = ${segment.sceneIndex}
    __pxlblz_show_transition = ${segment.sceneIndex}
    __pxlblz_show_mix = (__pxlblz_show_elapsed_ms - ${segment.startMs}) / ${segment.transition!.durationMs}
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

function emitSceneSequenceTransitionBlock(
  from: CompiledMember,
  to: CompiledMember,
  transition: ShowSceneSequenceTransitionRecipe,
  outputDimension: 1 | 2,
): string {
  if (transition.kind === 'portal') return emitPortalRenderBlock(from, to, transition)

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

  const feather = clampNumber(transition.feather ?? 0, 0, 1)
  const featherPrelude = transition.kind === 'wipe' && feather > 0
    ? `var __pxlblz_show_feather_progress = (__pxlblz_show_mix + ${feather / 2} - index / pixelCount) / ${feather}\n`
    : ''
  const pickTo = transition.kind === 'wipe'
    ? feather > 0
      ? `index / pixelCount < __pxlblz_show_mix - ${feather / 2} || (index / pixelCount < __pxlblz_show_mix + ${feather / 2} && __pxlblz_show_hash01(index) < clamp(__pxlblz_show_feather_progress, 0, 1))`
      : 'index / pixelCount < __pxlblz_show_mix'
    : '__pxlblz_show_hash01(index) < __pxlblz_show_mix'
  return `${featherPrelude}if (${pickTo}) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  ${from.prefix}_emit()
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
  const maxRadius = Math.max(
    Math.hypot(centerX, centerY),
    Math.hypot(1 - centerX, centerY),
    Math.hypot(centerX, 1 - centerY),
    Math.hypot(1 - centerX, 1 - centerY),
  )
  const radius = transition.invert
    ? `${maxRadius} * (1 - __pxlblz_show_mix)`
    : `${maxRadius} * __pxlblz_show_mix`
  const signedDistance = transition.invert
    ? '__pxlblz_show_portal_radius - __pxlblz_show_portal_distance'
    : '__pxlblz_show_portal_distance - __pxlblz_show_portal_radius'
  const fromRender = `${from.prefix}_renderCapture2D(index, x, y)`
  const toRender = `${to.prefix}_renderCapture2D(index, x, y)`
  let transitionBody: string

  if (feather <= 0) {
    transitionBody = `if (__pxlblz_show_portal_signed <= 0) {
  ${toRender}
  ${to.prefix}_emit()
} else {
  ${fromRender}
  ${from.prefix}_emit()
}`
  } else if (transition.featherPolicy === 'blend') {
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

  return `var __pxlblz_show_portal_distance = hypot(x - ${centerX}, y - ${centerY})
var __pxlblz_show_portal_radius = ${radius}
var __pxlblz_show_portal_signed = ${signedDistance}
${transitionBody}`
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
  return recipe.routingLayouts.map((layout) => {
    const plan = buildRoutePlan(members, { ...recipe, zones: layout.zones, routingLayouts: undefined })
    return {
      id: layout.id,
      name: layout.name,
      routes: plan?.routes ?? [],
      warnings: [...(plan?.warnings ?? []), ...routingLayoutOverlapWarnings(layout.name, plan?.routes ?? [])],
    }
  })
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
  representation: 'range-branches' | 'packed-pixels',
): string {
  const layoutIndex = new Map(layouts.map((layout, index) => [layout.id, index]))
  const orderedSwitches = [...switches].sort((a, b) => a.atMs - b.atMs)
  const selectLines = orderedSwitches.map((routingSwitch) => (
    `  if (__pxlblz_show_elapsed_ms >= ${routingSwitch.atMs}) __pxlblz_show_route_layout = ${layoutIndex.get(routingSwitch.layoutId) ?? 0}`
  ))
  const countBlocks = layouts.map((layout, index) => {
    const counts = members.map((member) => {
      const route = layout.routes.find((candidate) => candidate.member === member)
      return `    ${member.pixelCountName} = ${route?.pixelCount ?? 0}`
    })
    return `${index === 0 ? '  if' : '  else if'} (__pxlblz_show_route_layout == ${index}) {
${counts.join('\n')}
  }`
  })
  const advanceLines = members.map((member) => `  ${member.prefix}_advance(delta)`)
  const renderBody = representation === 'packed-pixels'
    ? emitPackedRoutingRender(layouts, outputDimension)
    : layouts.map((layout, index) => (
      `${index === 0 ? '  if' : '  else if'} (__pxlblz_show_route_layout == ${index}) {
${emitRouteRenderBody(layout.routes, '    ', outputDimension)}
  }`
    )).join('\n')
  const packedPrelude = representation === 'packed-pixels'
    ? emitPackedRoutingTable(layouts)
    : ''
  return [
    emitRuntimePrelude(members),
    ...members.map((member) => member.code.trim()),
    packedPrelude,
    `var __pxlblz_show_route_layout = 0`,
    `export function beforeRender(delta) {
  __pxlblz_show_elapsed_ms = (__pxlblz_show_elapsed_ms + delta) % ${loopDurationMs}
  __pxlblz_show_route_layout = 0
${selectLines.join('\n')}
${countBlocks.join('\n')}
${advanceLines.join('\n')}
}`,
    `export function ${outputDimension === 2 ? 'render2D(index, x, y)' : 'render(index)'} {
${renderBody}
  rgb(0, 0, 0)
}`,
    '',
  ].join('\n\n')
}

function selectRoutingRepresentation(layouts: ResolvedRoutingLayout[]): 'range-branches' | 'packed-pixels' {
  const pixelCount = routingPixelCount(layouts)
  const arrayElements = pixelCount * layouts.length
  const runCount = layouts.reduce((sum, layout) => (
    sum + layout.routes.reduce((layoutSum, route) => layoutSum + route.zone.ranges.length, 0)
  ), 0)
  return pixelCount > 0 && arrayElements <= 2048 && runCount >= 64
    ? 'packed-pixels'
    : 'range-branches'
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

function emitPackedRoutingRender(layouts: ResolvedRoutingLayout[], outputDimension: 1 | 2): string {
  const pixelCount = routingPixelCount(layouts)
  const stride = pixelCount + 1
  const layoutsBody = layouts.map((layout, layoutIndex) => {
    const routeBody = layout.routes.map((route, routeIndex) => (
      emitPackedRouteBlock(route, routeIndex, outputDimension)
    )).join('\n')
    return `${layoutIndex === 0 ? '    if' : '    else if'} (__pxlblz_show_route_layout == ${layoutIndex}) {
${routeBody}
    }`
  }).join('\n')
  return `  if (index < ${pixelCount}) {
    var __pxlblz_show_route_packed = __pxlblz_show_route_pixels[__pxlblz_show_route_layout * ${pixelCount} + index]
    if (__pxlblz_show_route_packed > 0) {
      __pxlblz_show_route_packed = __pxlblz_show_route_packed - 1
      var __pxlblz_show_route_id = floor(__pxlblz_show_route_packed / ${stride})
      var __pxlblz_show_route_local = __pxlblz_show_route_packed - __pxlblz_show_route_id * ${stride}
${layoutsBody}
    }
  }`
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

function emitRuntimePrelude(members: CompiledMember[]): string {
  const memberVars = members.flatMap((member, index) => {
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
    const advance = lightShutter?.clockBehavior === 'freeze'
      ? `function ${member.prefix}_advance(delta) {
  ${member.prefix}_updateShutter()
  var activeDelta = ${member.prefix}_shutterActiveMs(__pxlblz_show_elapsed_ms - delta, __pxlblz_show_elapsed_ms)
  if (activeDelta > 0) {
${advanceDelta('activeDelta', '    ')}
  }
}`
      : lightShutter
        ? `function ${member.prefix}_advance(delta) {
  ${member.prefix}_updateShutter()
${advanceDelta('delta', '  ')}
}`
        : `function ${member.prefix}_advance(delta) {
${advanceDelta('delta', '  ')}
}`
    return [
    `var ${member.elapsedName} = ${member.adaptation.timeOffsetMs}`,
    `var ${member.pixelCountName} = pixelCount`,
    `var ${member.prefix}_adapt_brightness = ${member.adaptation.brightness}`,
    `var ${member.prefix}_adapt_phase = ${member.adaptation.phase}`,
    `var ${member.prefix}_adapt_timeScale = ${member.adaptation.timeScale}`,
    `var ${member.prefix}_adapt_mirror = ${boolNumber(member.adaptation.mirror)}`,
    `var ${member.prefix}_r = 0`,
    `var ${member.prefix}_g = 0`,
    `var ${member.prefix}_b = 0`,
    ...steppedClockVars,
    ...shutterVars,
    `function ${member.prefix}_clear() { ${member.prefix}_r = 0; ${member.prefix}_g = 0; ${member.prefix}_b = 0 }`,
    `function ${member.prefix}_rgb(r, g, b) { ${member.prefix}_r = r * ${member.prefix}_adapt_brightness; ${member.prefix}_g = g * ${member.prefix}_adapt_brightness; ${member.prefix}_b = b * ${member.prefix}_adapt_brightness }`,
    `function ${member.prefix}_hsv(h, s, v) { __pxlblz_show_capture_hsv(${index}, h + ${member.prefix}_adapt_phase, s, v * ${member.prefix}_adapt_brightness) }`,
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
  ${member.prefix}_clear()
  ${member.hasRender ? lightShutter ? `if (${member.prefix}_shutter_open >= 0.5) ${member.renderName}(mappedIndex)` : `${member.renderName}(mappedIndex)` : ''}
}`,
    `function ${member.prefix}_renderCapture2D(index, x, y) {
  var mappedIndex = index
  var mappedX = x
  if (${member.prefix}_adapt_mirror >= 0.5) {
    mappedIndex = ${member.pixelCountName} - 1 - index
    mappedX = 1 - x
  }
  ${member.prefix}_clear()
  ${member.hasRender2D
    ? lightShutter
      ? `if (${member.prefix}_shutter_open >= 0.5) ${member.render2DName}(mappedIndex, mappedX, y)`
      : `${member.render2DName}(mappedIndex, mappedX, y)`
    : member.hasRender
      ? lightShutter
        ? `if (${member.prefix}_shutter_open >= 0.5) ${member.renderName}(mappedIndex)`
        : `${member.renderName}(mappedIndex)`
      : ''}
}`,
    `function ${member.prefix}_emit() { rgb(${member.prefix}_r, ${member.prefix}_g, ${member.prefix}_b) }`,
    ]
  })

  return [
    'var __pxlblz_show_elapsed_ms = 0',
    'var __pxlblz_show_mix = 0',
    'var __pxlblz_show_phase = 0',
    ...memberVars,
    `function __pxlblz_show_capture_rgb(slot, r, g, b) {
  if (slot == 0) { __pxlblz_show_c0_r = r; __pxlblz_show_c0_g = g; __pxlblz_show_c0_b = b }
  else { __pxlblz_show_c1_r = r; __pxlblz_show_c1_g = g; __pxlblz_show_c1_b = b }
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
): string {
  return `export function beforeRender(delta) {
  __pxlblz_show_elapsed_ms = __pxlblz_show_elapsed_ms + delta
  if (__pxlblz_show_elapsed_ms < ${transitionStart}) {
    __pxlblz_show_phase = 0
    __pxlblz_show_mix = 0
    ${from.prefix}_advance(delta)
  } else if (__pxlblz_show_elapsed_ms < ${transitionEnd}) {
    __pxlblz_show_phase = 1
    __pxlblz_show_mix = (__pxlblz_show_elapsed_ms - ${transitionStart}) / ${duration}
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

function emitRender(from: CompiledMember, to: CompiledMember): string {
  return `export function render(index) {
  if (__pxlblz_show_phase == 0) {
    ${from.prefix}_renderCapture(index)
    ${from.prefix}_emit()
  } else if (__pxlblz_show_phase == 2) {
    ${to.prefix}_renderCapture(index)
    ${to.prefix}_emit()
  } else {
    ${from.prefix}_renderCapture(index)
    var r0 = ${from.prefix}_r
    var g0 = ${from.prefix}_g
    var b0 = ${from.prefix}_b
    ${to.prefix}_renderCapture(index)
    rgb(
      r0 * (1 - __pxlblz_show_mix) + ${to.prefix}_r * __pxlblz_show_mix,
      g0 * (1 - __pxlblz_show_mix) + ${to.prefix}_g * __pxlblz_show_mix,
      b0 * (1 - __pxlblz_show_mix) + ${to.prefix}_b * __pxlblz_show_mix
    )
  }
}`
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
