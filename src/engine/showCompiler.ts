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
  zoneMode?: 'independent' | 'span'
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
}

export interface ShowAdaptationRampRecipe {
  startMs: number
  durationMs: number
  from: Partial<ShowClipAdaptation>
  to: Partial<ShowClipAdaptation>
}

export interface ShowRouteTransitionRecipe {
  kind: 'wipe' | 'dither'
  startMs: number
  durationMs: number
  feather?: number
}

export interface ShowRecipe {
  clips: ShowClipRecipe[]
  crossfade?: ShowCrossfadeRecipe
  cut?: ShowCutRecipe
  adaptationRamp?: ShowAdaptationRampRecipe
  routeTransition?: ShowRouteTransitionRecipe
  zones?: ControllerZone[]
}

export interface ShowCompileClipSummary {
  id: string
  prefix: string
  sourceBytes: number
  renamedBindings: string[]
  renamedPatternVars: string[]
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
  transitionCost: 'none' | 'renderer-window' | 'route' | 'parameter'
  routePolicy: 'none' | 'hard-wipe' | 'feathered-wipe' | 'dither'
  clockPolicy: 'real-time' | 'scaled' | 'scaled-ramp' | 'exact-pause' | 'exact-pause-ramp'
  worstInstantRenderersPerPixel: 1 | 2
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
  beforeRenderName: string
  hasRender: boolean
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

export function compileShow(
  recipe: ShowRecipe,
  libraries: Record<string, string>,
): GeneratedShowArtifact {
  const expandedRecipe = { ...recipe, clips: expandRouteClips(recipe.clips) }
  validateRecipe(expandedRecipe)
  const members = expandedRecipe.clips.map((clip, index) => compileMember(clip, index, libraries))
  const route = buildRoutePlan(members, expandedRecipe)
  const routeMode = route !== null
  const code = routeMode
    ? emitRouteShowCode(members, route.routes)
    : expandedRecipe.adaptationRamp
      ? emitAdaptationRampShowCode(members[0], expandedRecipe.adaptationRamp)
      : expandedRecipe.cut
        ? emitCutShowCode(members[0], members[1], expandedRecipe.cut)
        : expandedRecipe.routeTransition
          ? emitRouteTransitionShowCode(members[0], members[1], expandedRecipe.routeTransition)
        : expandedRecipe.crossfade
          ? emitShowCode(members[0], members[1], expandedRecipe.crossfade)
          : emitSingleClipShowCode(members[0])
  const metadata = buildMetadata(members)
  const sourceBytesBeforeMerge = members.reduce((sum, member) => sum + member.sourceBytes, 0)
  const artifactBytes = byteLength(code)
  const transitionCost = routeMode
    ? 'route'
    : expandedRecipe.crossfade
      ? 'renderer-window'
      : expandedRecipe.adaptationRamp
        ? 'parameter'
        : expandedRecipe.routeTransition
          ? 'route'
        : 'none'
  const summary: ShowCompileSummary = {
    clipCount: members.length,
    transitionCount: expandedRecipe.crossfade || expandedRecipe.cut || expandedRecipe.adaptationRamp || expandedRecipe.routeTransition ? 1 : 0,
    sourceBytesBeforeMerge,
    artifactBytes,
    measuredDeviceBudgetBytes: MEASURED_DEVICE_BUDGET_BYTES,
    artifactBudgetRatio: artifactBytes / MEASURED_DEVICE_BUDGET_BYTES,
    renderPolicy: routeMode
      ? 'route-one-renderer-per-pixel'
      : expandedRecipe.crossfade
        ? 'steady-active-transition-both'
        : expandedRecipe.cut
          ? 'cut-restart'
        : expandedRecipe.adaptationRamp
          ? 'parameter-ramp-one-renderer-per-pixel'
          : expandedRecipe.routeTransition
            ? 'route-transition-one-renderer-per-pixel'
            : 'single-continuous-hold',
    transitionCost,
    routePolicy: expandedRecipe.routeTransition?.kind === 'dither'
      ? 'dither'
      : expandedRecipe.routeTransition?.kind === 'wipe'
        ? clampNumber(expandedRecipe.routeTransition.feather ?? 0, 0, 1) > 0
          ? 'feathered-wipe'
          : 'hard-wipe'
        : 'none',
    clockPolicy: describeClockPolicy(expandedRecipe, members),
    worstInstantRenderersPerPixel: transitionCost === 'renderer-window' ? 2 : 1,
    clips: members.map(member => ({
      id: member.id,
      prefix: member.prefix,
      sourceBytes: member.sourceBytes,
      renamedBindings: member.renamedBindings,
      renamedPatternVars: member.renamedPatternVars,
    })),
    warnings: route?.warnings ?? [],
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
  const boundaryModes = [recipe.crossfade, recipe.cut, recipe.adaptationRamp, recipe.routeTransition].filter(Boolean).length
  if (recipe.clips.length < 1) throw new Error('compileShow requires at least one clip.')
  if (!routeMode && recipe.clips.length > 2) throw new Error('compileShow v1 requires one or two unrouted clips.')
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
  if (routeMode && !recipe.zones) {
    throw new Error('compileShow routed clips require controller zones.')
  }
}

function expandRouteClips(clips: ShowClipRecipe[]): ShowClipRecipe[] {
  return clips.flatMap((clip) => {
    if (!clip.zones?.length) return [clip]
    if (clip.zoneMode === 'span') return [clip]
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
    beforeRenderName: mapping.get('beforeRender') ?? `${prefix}_beforeRender`,
    hasRender: bindings.has('render'),
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
    const zone = clip.zoneMode === 'span'
      ? mergeRouteZones(clip.id, resolvedZones)
      : resolvedZones[0]
    routes.push({
      member: members[index],
      zone,
      pixelCount: controllerZonePixelCount(zone),
    })
  }
  return { routes, warnings }
}

function mergeRouteZones(id: string, zones: ControllerZone[]): ControllerZone {
  return {
    id: `${id}:span`,
    name: zones.map((zone) => zone.name).join('+'),
    ranges: zones.flatMap((zone) => zone.ranges.map((range) => ({ start: range.start, end: range.end }))),
  }
}

function emitRouteShowCode(members: CompiledMember[], routes: ResolvedRoute[]): string {
  return [
    emitRuntimePrelude(members),
    ...members.map(member => member.code.trim()),
    emitRouteScheduler(routes),
    emitRouteRender(routes),
    '',
  ].join('\n\n')
}

function emitRuntimePrelude(members: CompiledMember[]): string {
  const memberVars = members.flatMap((member, index) => [
    `var ${member.elapsedName} = 0`,
    `var ${member.pixelCountName} = pixelCount`,
    `var ${member.prefix}_adapt_brightness = ${member.adaptation.brightness}`,
    `var ${member.prefix}_adapt_phase = ${member.adaptation.phase}`,
    `var ${member.prefix}_adapt_timeScale = ${member.adaptation.timeScale}`,
    `var ${member.prefix}_adapt_mirror = ${boolNumber(member.adaptation.mirror)}`,
    `var ${member.prefix}_r = 0`,
    `var ${member.prefix}_g = 0`,
    `var ${member.prefix}_b = 0`,
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
    `function ${member.prefix}_advance(delta) {
  var scaledDelta = delta * ${member.prefix}_adapt_timeScale
  ${member.elapsedName} = ${member.elapsedName} + scaledDelta
  ${member.hasBeforeRender ? `${member.beforeRenderName}(scaledDelta)` : ''}
}`,
    `function ${member.prefix}_renderCapture(index) {
  var mappedIndex = index
  if (${member.prefix}_adapt_mirror >= 0.5) mappedIndex = ${member.pixelCountName} - 1 - index
  ${member.prefix}_clear()
  ${member.hasRender ? `${member.renderName}(mappedIndex)` : ''}
}`,
    `function ${member.prefix}_emit() { rgb(${member.prefix}_r, ${member.prefix}_g, ${member.prefix}_b) }`,
  ])

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
  const lines = routes.flatMap((route) => [
    `  ${route.member.pixelCountName} = ${route.pixelCount}`,
    `  ${route.member.prefix}_advance(delta)`,
  ])
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

function emitRouteRender(routes: ResolvedRoute[]): string {
  const blocks = routes.map(emitRouteRenderBlock).join('\n')
  return `export function render(index) {
${blocks}
  rgb(0, 0, 0)
}`
}

function emitRouteRenderBlock(route: ResolvedRoute): string {
  const localName = `${route.member.prefix}_zoneLocalIndex`
  return [
    `  var ${localName} = -1`,
    ...emitZoneLocalAssignments(route.zone, localName),
    `  if (${localName} >= 0) {`,
    `    ${route.member.pixelCountName} = ${route.pixelCount}`,
    `    ${route.member.prefix}_renderCapture(${localName})`,
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

function buildMetadata(members: CompiledMember[]): BundleMetadata {
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
      hasRender: true,
      hasRender2D: false,
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
  }
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
