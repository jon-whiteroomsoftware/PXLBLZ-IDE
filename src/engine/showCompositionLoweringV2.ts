import { restrictShowPropertyTrackV2 } from './showPropertyTrackTimeMappingV2'
import { groupRuntimeBindings, materializeShowGroupsV2 } from './showGroupsV2'
import { applyShowEasing } from './showEasing'
import { lowerPropertyTarget } from './showV2ValueConversion'
import { isHeldRepeatScaleTrack, repeatScaleAt, scalarBoundaryRamps } from './showV2ScalarProperties'
import type {
  ShowCompositionV1,
  ShowCell,
  ShowLayerTransition,
  ShowMainPlacement,
  ShowOverlayLayer,
  ShowOverlayPlacement,
  ShowPropertyAnimationTarget,
  ShowRecord,
  ShowZoneComposition,
} from './personalContentRecords'
import { showRecordToCompileRecipe, type ShowCompileRecipeSourceLookup } from './showModel'
import { validateShowComposition } from './showCompositionModel'
import { compileShow, ShowRestartEligibilityError, type ShowRecipe } from './showCompiler'
import { deriveShowRestartEventsV2, evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import {
  validateShowRecordV2,
  type ShowClipV2,
  type ShowPropertyTargetV2,
  type ShowRecordV2,
} from './showCompositionV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'

export interface LoweredShowCompositionV2 {
  show: ShowRecord
  lookup: ShowCompileRecipeSourceLookup
}

export type ShowV2CompilePreparationIssueCode =
  | 'invalid-record'
  | 'missing-pattern-source'
  | 'unsupported-layout-occurrences'
  | 'unsupported-groups'
  | 'unsupported-restart'
  | 'unsupported-transition-participants'
  | 'unsupported-transition-overlap'
  | 'unsupported-transition-property-ramp'
  | 'unsupported-transition-property-track'
  | 'unsupported-zone-sampling'
  | 'unsupported-property-target'
  | 'unsupported-track-activation'
  | 'unsupported-runtime-sharing'
  | 'compiler-ineligible'

export interface ShowV2CompilePreparationIssue {
  code: ShowV2CompilePreparationIssueCode
  path: string
  message: string
}

export interface ShowV2CompileProvenance {
  route: 'continuous-flat' | 'global-sections' | 'transition'
  layoutOccurrenceId: string
  layoutId: string
  derivedSceneIds: string[]
  runtimeInstanceIdByClipId: Record<string, string>
}

export type ShowV2CompilePreparation =
  | { status: 'ready'; recipe: ShowRecipe; provenance: ShowV2CompileProvenance }
  | { status: 'refused'; issues: ShowV2CompilePreparationIssue[] }

export interface ShowV2CompilePreparationOptions {
  libraries?: Record<string, string>
}

type PreparationRoute = ShowV2CompileProvenance['route']

interface ResolvedShowV2CompileContext {
  record: ShowRecordV2
  lookup: ShowCompileRecipeSourceLookup
  route: PreparationRoute
  layoutOccurrenceId: string
  layoutId: string
  routingLayouts: ShowRecord['routingLayouts']
  sceneSettings: Pick<ShowRecord['scenes'][number], 'routingTargets' | 'sampleTargets'>
  runtimeInstanceIdByClipId: Record<string, string>
}

interface ResolvedLowering {
  context: ResolvedShowV2CompileContext
  lowered: LoweredShowCompositionV2
}

/**
 * Resolve v2 compile semantics once, then return the compiler's existing recipe
 * and enough identity provenance for consumer-side parity checks.
 */
export function prepareShowV2ForCompile(
  record: ShowRecordV2,
  lookup: ShowCompileRecipeSourceLookup,
  options: ShowV2CompilePreparationOptions = {},
): ShowV2CompilePreparation {
  const libraries = options.libraries ?? {}
  const resolved = resolveAndLowerShowV2(record, lookup)
  if ('issues' in resolved) return { status: 'refused', issues: resolved.issues }
  const { context, lowered } = resolved
  if (lowered.show.composition) {
    const issues = validateShowComposition(lowered.show, lowered.show.composition)
    if (issues.length > 0) return {
      status: 'refused',
      issues: issues.map(issue => ({ code: 'compiler-ineligible', path: `compileRecipe.composition.${issue.path}`, message: issue.message })),
    }
  }
  const recipe = showRecordToCompileRecipe(lowered.show, lowered.lookup)
  const layoutPropertyRamps = lowerLayoutSplitPositionTracks(context.record, recipe.routingPropertyRamps)
  if (layoutPropertyRamps.status === 'refused') {
    return { status: 'refused', ...refuse('unsupported-property-target', layoutPropertyRamps.path, layoutPropertyRamps.message) }
  }
  if (layoutPropertyRamps.value) recipe.routingPropertyRamps = layoutPropertyRamps.value
  const expectedInstances = [...new Set(Object.values(context.runtimeInstanceIdByClipId))].sort()
  const representedInstances = recipe.clips.filter(clip => !clip.compilerOwnedEmpty)
    .map(clip => lowered.lookup.instanceIdByCellId?.[clip.id] ?? clip.id).sort()
  if (JSON.stringify(representedInstances) !== JSON.stringify(expectedInstances)) {
    return { status: 'refused', ...refuse('unsupported-runtime-sharing', 'composition.clips', 'existing compiler recipe cannot represent every used Pattern instance exactly once.') }
  }
  const restart = deriveShowRestartEventsV2(context.record)
  if (restart.status === 'refused') {
    return { status: 'refused', ...refuse('unsupported-restart', 'composition.clips', restart.message) }
  }
  if (restart.events.length > 0) {
    const recipeClipIdByInstanceId = new Map(recipe.clips.filter(clip => !clip.compilerOwnedEmpty).map(clip => [
      lowered.lookup.instanceIdByCellId?.[clip.id] ?? clip.id,
      clip.id,
    ]))
    const restartEvents = restart.events.map(event => ({
      atMs: event.atMs,
      clipId: recipeClipIdByInstanceId.get(event.instanceId),
    }))
    const missing = restartEvents.find(event => event.clipId === undefined)
    if (missing) {
      return { status: 'refused', ...refuse('unsupported-runtime-sharing', 'composition.clips', 'Restart event has no matching compiled Pattern instance.') }
    }
    recipe.restartEvents = restartEvents.map(event => ({ atMs: event.atMs, clipId: event.clipId! }))
    try {
      // Adoption and final emission intentionally use the same compiler path:
      // bundled Libraries, transforms, generated runtime state and selected
      // artifact representation cannot produce a second eligibility answer.
      compileShow(recipe, libraries)
    } catch (error) {
      const clipId = error instanceof ShowRestartEligibilityError ? error.clipId : undefined
      const instanceId = clipId
        ? lowered.lookup.instanceIdByCellId?.[clipId] ?? clipId
        : undefined
      const clipIndex = instanceId
        ? context.record.composition.clips.findIndex(candidate => (
            runtimeInstanceId(context, candidate) === instanceId && candidate.entryPolicy === 'restart'
          ))
        : -1
      const detail = error instanceof ShowRestartEligibilityError
        ? `${error.plan.reason}${error.plan.location ? ` at source ${error.plan.location.line}:${error.plan.location.column}` : ''}: ${error.plan.message}`
        : error instanceof Error ? error.message : String(error)
      return {
        status: 'refused',
        ...refuse(
          'unsupported-restart',
          clipIndex >= 0 ? `composition.clips[${clipIndex}]` : 'composition.clips',
          instanceId
            ? `Restart cannot restore Pattern instance "${instanceId}": ${detail}`
            : `Restart could not prepare the compiled Pattern artifact: ${detail}`,
        ),
      }
    }
  }
  return {
    status: 'ready',
    recipe,
    provenance: {
      route: context.route,
      layoutOccurrenceId: context.layoutOccurrenceId,
      layoutId: context.layoutId,
      derivedSceneIds: lowered.show.scenes.map(scene => scene.id),
      runtimeInstanceIdByClipId: structuredClone(context.runtimeInstanceIdByClipId),
    },
  }
}

/**
 * Derive transient v1 compiler sections solely from authored global-time v2
 * entities. This adapter is not connected to production persistence or decode.
 */
export function lowerShowCompositionV2ForCompile(
  record: ShowRecordV2,
  lookup: ShowCompileRecipeSourceLookup,
): LoweredShowCompositionV2 {
  const hasEffectiveRestart = record.composition.clips.some(clip => clip.entryPolicy === 'restart')
    || record.composition.groupOccurrences.some(occurrence => (
      record.composition.groupDefinitions.find(definition => definition.id === occurrence.definitionId)
        ?.clips.some(clip => clip.entryPolicy === 'restart') === true
    ))
  if (hasEffectiveRestart) {
    throw new Error('Show composition v2 Restart requires prepareShowV2ForCompile so its transient reset events cannot be dropped.')
  }
  if (record.composition.propertyTracks.some(track => track.target.kind === 'layout-occurrence-split-position')) {
    throw new Error('Show composition v2 Layout split-position animation requires prepareShowV2ForCompile so its transient routing ramps cannot be dropped.')
  }
  const resolved = resolveAndLowerShowV2(record, lookup)
  if ('issues' in resolved) {
    throw new Error(resolved.issues.map(issue => `Show composition v2 ${issue.path}: ${issue.message}`).join('; '))
  }
  return resolved.lowered
}

function resolveAndLowerShowV2(
  record: ShowRecordV2,
  lookup: ShowCompileRecipeSourceLookup,
): ResolvedLowering | { issues: ShowV2CompilePreparationIssue[] } {
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', invalid.path, invalid.message)
  const unavailable = validateShowLayoutAvailabilityV2(record)[0]
  if (unavailable) {
    return refuse(
      'invalid-record',
      `composition.${unavailable.entityKind === 'clip' ? 'clips' : 'groupOccurrences'}`,
      `${unavailable.entityKind} "${unavailable.entityId}" uses Zone "${unavailable.zoneId}" while Layout occurrence "${unavailable.layoutOccurrenceId}" does not provide it.`,
    )
  }
  const expanded = record.composition.groupDefinitions.length > 0 ? materializeShowGroupsV2(record) : record
  const invalidExpanded = validateShowRecordV2(expanded)[0]
  if (invalidExpanded) return refuse('invalid-record', invalidExpanded.path, invalidExpanded.message)
  // Retained instance animation can outlive its final Clip user. Such tracks
  // remain authored for future edits, but cannot create an executing member.
  // Every effective Clip counts, including invisible and later contributions.
  const usedInstanceIds = new Set(expanded.composition.clips.map(clip => clip.instanceId))
  const compileRecord: ShowRecordV2 = {
    ...expanded,
    composition: { ...expanded.composition, propertyTracks: expanded.composition.propertyTracks.filter(track => (
      (track.target.kind !== 'instance-control' && track.target.kind !== 'instance-time-scale')
      || usedInstanceIds.has(track.target.instanceId)
    )) },
  }
  const sources = { ...lookup.byPatternInstanceId }
  for (const binding of groupRuntimeBindings(record)) {
    const sameLocalId = [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap(definition => definition.patternInstances)].filter(instance => instance.id === binding.instance.id)
    const unambiguous = sameLocalId.every(instance => JSON.stringify(instance.pattern) === JSON.stringify(binding.instance.pattern))
    const source = sources[binding.runtimeId] ?? (unambiguous ? lookup.byPatternInstanceId?.[binding.instance.id] : undefined)
    if (source) sources[binding.runtimeId] = source
  }
  const resolved = resolveShowV2CompileContext(compileRecord, { ...lookup, byPatternInstanceId: sources })
  if ('issues' in resolved) return resolved
  const lowered = emitResolvedShowV2(resolved)
  const sceneIds = new Set(lowered.show.scenes.map(scene => scene.id))
  if (lowered.show.transitions.some(transition => transition.kind === 'routing' && !sceneIds.has(transition.afterSceneId))) {
    return refuse('unsupported-layout-occurrences', 'composition.layoutOccurrences', 'A Layout switch must attach to an emitted compiler hold end; this time cannot be represented without losing routing behavior.')
  }
  return { context: resolved, lowered }
}

function refuse(
  code: ShowV2CompilePreparationIssueCode,
  path: string,
  message: string,
): { issues: ShowV2CompilePreparationIssue[] } {
  return { issues: [{ code, path, message }] }
}

type RoutingPropertyRamps = NonNullable<ShowRecipe['routingPropertyRamps']>
type RoutingPropertyRamp = RoutingPropertyRamps['splitPosition']['ramps'][number]

function lowerLayoutSplitPositionTracks(
  record: ShowRecordV2,
  source: ShowRecipe['routingPropertyRamps'],
): { status: 'ready'; value?: RoutingPropertyRamps } | { status: 'refused'; path: string; message: string } {
  const tracks = record.composition.propertyTracks
    .filter(track => track.target.kind === 'layout-occurrence-split-position')
    .sort((left, right) => left.activeStartMs - right.activeStartMs || left.id.localeCompare(right.id))
  if (tracks.length === 0) return { status: 'ready', ...(source ? { value: source } : {}) }
  if (!source) {
    return {
      status: 'refused',
      path: 'composition.propertyTracks',
      message: 'Layout split-position animation requires a compiled split or soft-split routing Layout.',
    }
  }
  for (const [index, track] of tracks.entries()) {
    const target = track.target
    if (target.kind !== 'layout-occurrence-split-position') continue
    const occurrence = record.composition.layoutOccurrences.find(candidate => candidate.id === target.layoutOccurrenceId)!
    const layout = record.zoneLayouts.find(candidate => candidate.id === occurrence.layoutId)
    if (layout?.logical?.kind !== 'split' && layout?.logical?.kind !== 'soft-split') {
      return {
        status: 'refused',
        path: `composition.propertyTracks[${record.composition.propertyTracks.indexOf(track)}].target`,
        message: `Layout occurrence "${occurrence.id}" does not use a split-position routing Layout.`,
      }
    }
    const activeEndMs = track.activeStartMs + track.activeDurationMs
    const overlap = tracks.slice(index + 1).find(candidate => (
      candidate.target.kind === 'layout-occurrence-split-position'
      && candidate.target.layoutOccurrenceId === target.layoutOccurrenceId
      && track.activeStartMs < candidate.activeStartMs + candidate.activeDurationMs
      && candidate.activeStartMs < activeEndMs
    ))
    if (overlap) {
      return {
        status: 'refused',
        path: `composition.propertyTracks[${record.composition.propertyTracks.indexOf(overlap)}].target`,
        message: `Layout split-position track "${overlap.id}" overlaps active owner "${track.id}".`,
      }
    }
  }

  const baseline = structuredClone(source.splitPosition)
  const positiveCarrier = baseline.ramps.find(ramp => ramp.durationMs > 0 && tracks.some(track => (
    ramp.atMs < track.activeStartMs + track.activeDurationMs
    && track.activeStartMs < ramp.atMs + ramp.durationMs
  )))
  if (positiveCarrier) {
    return {
      status: 'refused',
      path: 'composition.propertyTracks',
      message: 'Layout split-position animation overlaps an existing positive routing Property ramp.',
    }
  }
  const retainedBase = baseline.ramps.filter(ramp => !tracks.some(track => (
    ramp.durationMs === 0
    && ramp.atMs >= track.activeStartMs
    && ramp.atMs < track.activeStartMs + track.activeDurationMs
  )))
  const authored: RoutingPropertyRamp[] = []
  for (const track of tracks) {
    const keys = [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs)
    const baselineAtStart = evaluateRoutingSplitPosition(baseline, track.activeStartMs)
    authored.push({
      atMs: track.activeStartMs,
      from: baselineAtStart,
      to: keys[0].value,
      durationMs: 0,
      easing: { curve: 'linear' },
    })
    for (const [index, left] of keys.slice(0, -1).entries()) {
      const right = keys[index + 1]
      authored.push({
        atMs: left.timeMs,
        from: left.value,
        to: right.value,
        durationMs: right.timeMs - left.timeMs,
        easing: structuredClone(left.easing),
        ...(left.curveSegment ? { curveSegment: structuredClone(left.curveSegment) } : {}),
      })
    }
    const activeEndMs = track.activeStartMs + track.activeDurationMs
    if (activeEndMs < record.composition.showEndMs) {
      authored.push({
        atMs: activeEndMs,
        from: evaluateShowPropertyTrackV2(track, activeEndMs - 1) ?? keys[keys.length - 1].value,
        to: evaluateRoutingSplitPosition(baseline, activeEndMs),
        durationMs: 0,
        easing: { curve: 'linear' },
      })
    }
  }
  const ramps = [...retainedBase, ...authored]
    .map((ramp, index) => ({ ramp, index }))
    .sort((left, right) => left.ramp.atMs - right.ramp.atMs || left.index - right.index)
    .map(({ ramp }) => ramp)
  const atZero = tracks.find(track => track.activeStartMs === 0)
  return {
    status: 'ready',
    value: {
      splitPosition: {
        initial: atZero ? evaluateShowPropertyTrackV2(atZero, 0)! : baseline.initial,
        ramps,
      },
    },
  }
}

function evaluateRoutingSplitPosition(source: RoutingPropertyRamps['splitPosition'], atMs: number): number {
  let value = source.initial
  for (const ramp of source.ramps) {
    if (atMs < ramp.atMs) continue
    value = ramp.to
    if (ramp.durationMs <= 0 || atMs >= ramp.atMs + ramp.durationMs) continue
    const segment = ramp.curveSegment
    const progress = segment
      ? (segment.elapsedOffsetMs + atMs - ramp.atMs) / segment.sourceDurationMs
      : (atMs - ramp.atMs) / ramp.durationMs
    const easing = segment?.easing ?? ramp.easing
    value = segment
      ? segment.baseValue + segment.deltaValue * applyShowEasing(easing, progress)
      : ramp.from + (ramp.to - ramp.from) * applyShowEasing(easing, progress)
  }
  return value
}

function resolveShowV2CompileContext(
  record: ShowRecordV2,
  lookup: ShowCompileRecipeSourceLookup,
): ResolvedShowV2CompileContext | { issues: ShowV2CompilePreparationIssue[] } {
  const issue = validateShowRecordV2(record)[0]
  if (issue) return refuse('invalid-record', issue.path, issue.message)
  const composition = record.composition
  const wholeOutput = composition.transitions.some(transition => transition.wholeOutput !== undefined)
  if (wholeOutput && composition.transitions.some(transition => !transition.wholeOutput)) {
    return refuse('unsupported-transition-participants', 'composition.transitions', 'Mixed whole-output and Layer scopes require separate preservation proof.')
  }
  if (!wholeOutput && composition.transitions.length > 0 && (composition.layoutOccurrences.length > 1 || composition.propertyTracks.some(track => track.target.kind === 'show-repeat-scale'))) {
    return refuse('unsupported-transition-property-track', 'composition.transitions', 'Global scalar changes require whole-output preservation scope.')
  }
  if (composition.transitions.some(transition => transition.wholeOutput && composition.layoutOccurrences.some(occurrence => occurrence.startMs > transition.wholeOutput!.startMs && occurrence.startMs < transition.wholeOutput!.startMs + transition.durationMs))) {
    return refuse('unsupported-layout-occurrences', 'composition.layoutOccurrences', 'An interior Layout edge inside a whole-output window requires separate preservation proof.')
  }
  if (composition.groupDefinitions.length > 0 || composition.groupOccurrences.length > 0) {
    return refuse('unsupported-groups', 'composition.groupDefinitions', 'lowering requires Group materialization evidence before compilation.')
  }
  const divergentClips = composition.clips.filter(clip => clip.appearance.keys.some(key => !structurallyEqualAppearance(key.value, clip.appearance.keys[0].value)))
  if (composition.transitions.length > 0 && divergentClips.length > 0 && composition.propertyTracks.some(track => {
    const target = track.target
    if ('clipId' in target) return divergentClips.some(clip => clip.id === target.clipId)
    if ('instanceId' in target) return divergentClips.some(clip => clip.instanceId === target.instanceId)
    return false
  })) {
    return refuse('unsupported-transition-property-track', 'composition.propertyTracks', 'A property track targeting a multi-key Clip requires the #1037 projection owner.')
  }
  if (composition.transitions.some(transition => !transition.wholeOutput && transition.participants.length !== 1)) {
    return refuse('unsupported-transition-participants', 'composition.transitions', 'lowering requires one participant per Transition until shared-scope parity is proved.')
  }
  if (hasCoincidentPositiveTransitionWindows(record)) {
    return refuse('unsupported-transition-overlap', 'composition.transitions', 'lowering cannot compile coincident positive Transition windows without independent render targets.')
  }
  if (composition.transitions.some(transition => transition.propertyRamps.some(ramp => !transition.wholeOutput || ramp.participantId !== undefined || (ramp.target.kind !== 'show-repeat-scale' && ramp.target.kind !== 'layout-occurrence-split-position')))) {
    return refuse('unsupported-transition-property-ramp', 'composition.transitions', 'lowering requires Transition property-ramp compiler evidence before compilation.')
  }
  if (!wholeOutput && composition.transitions.length > 0 && composition.propertyTracks.some(track => (
    track.target.kind !== 'layout-occurrence-split-position'
    && (track.activeStartMs !== 0 || track.activeDurationMs !== composition.showEndMs)
  ))) {
    return refuse('unsupported-transition-property-track', 'composition.propertyTracks', 'lowering requires section-scoped positive-Transition property-track activation evidence before compilation.')
  }
  const unsupportedTargetIndex = composition.propertyTracks.findIndex(track => (
    track.target.kind === 'show-repeat-scale' && !isHeldRepeatScaleTrack(track, composition.showEndMs)
  ))
  if (unsupportedTargetIndex >= 0) {
    return refuse(
      'unsupported-property-target',
      `composition.propertyTracks[${unsupportedTargetIndex}].target`,
      `property target "${composition.propertyTracks[unsupportedTargetIndex].target.kind}" requires direct compiler support.`,
    )
  }
  if (composition.propertyTracks.filter(track => track.target.kind === 'show-repeat-scale').length > 1) {
    return refuse('unsupported-property-target', 'composition.propertyTracks', 'Only one global held repeat-scale target is admitted.')
  }
  for (const [index, track] of composition.propertyTracks.entries()) {
    if (!('clipId' in track.target)) continue
    const clipId = track.target.clipId
    const clip = composition.clips.find(candidate => candidate.id === clipId)!
    if (track.activeStartMs >= clip.startMs + clip.durationMs || track.activeStartMs + track.activeDurationMs <= clip.startMs) {
      return refuse('unsupported-track-activation', `composition.propertyTracks[${index}]`, `property track "${track.id}" activation does not intersect its target Clip.`)
    }
  }
  // Restart scheduling exists in the routed Scene emitter. A record that is
  // otherwise flat-compatible already has an equivalent global-section
  // lowering, so select it only for the Restart-bearing case; ordinary flat
  // records retain their existing representation and bytes.
  const unsupportedRoutedSampling = composition.clips.some(clip => (
    clip.zoneSampleMode !== 'span'
    // With one Zone, independent and span address the same complete domain;
    // the existing global-section emitter therefore preserves the flat result.
    && !(record.zones.length === 1 && clip.zoneSampleMode === 'independent')
  ))
  const flatEligible = composition.executionModel === 'continuous'
    && !composition.clips.some(clip => clip.entryPolicy === 'restart')
    // Exact redundant keys may recover the existing flat sampling route only
    // where routed sampling previously refused. Existing routed admissions keep
    // their representation and generated source bytes.
    && (canLowerToFlat(record) || (unsupportedRoutedSampling && canLowerToFlat(record, true)))
  if (unsupportedRoutedSampling && !flatEligible) {
    return refuse('unsupported-zone-sampling', 'composition.clips', 'lowering requires repeat-mode Clip sampling evidence before compilation.')
  }
  if (!flatEligible && (composition.transitions.length === 0 || wholeOutput)) {
    const unsupportedTrackIndex = firstCrossSectionTrackIndex(record)
    if (unsupportedTrackIndex >= 0) {
      return refuse(
        'unsupported-track-activation',
        `composition.propertyTracks[${unsupportedTrackIndex}]`,
        `property track "${composition.propertyTracks[unsupportedTrackIndex].id}" activation crosses a derived Clip/appearance section.`,
      )
    }
  }
  for (const [index, instance] of composition.patternInstances.entries()) {
    if (!lookup.byPatternInstanceId?.[instance.id]) {
      return refuse(
        'missing-pattern-source',
        `composition.patternInstances[${index}]`,
        `requires exact Pattern source for instance "${instance.id}".`,
      )
    }
  }
  const occurrence = composition.layoutOccurrences.find(candidate => candidate.startMs === 0)!
  const route: PreparationRoute = flatEligible
    ? 'continuous-flat'
    : composition.transitions.length === 0 || wholeOutput ? 'global-sections' : 'transition'
  return {
    record,
    lookup: structuredClone(lookup),
    route,
    layoutOccurrenceId: occurrence.id,
    layoutId: occurrence.layoutId,
    routingLayouts: selectedLayoutFirst(record),
    sceneSettings: {
      ...(occurrence.parameters.splitPosition !== undefined
        ? { routingTargets: { splitPosition: occurrence.parameters.splitPosition } }
        : {}),
      ...(composition.sampleRemap.repeatScale !== 1
        ? { sampleTargets: { repeatScale: composition.sampleRemap.repeatScale } }
        : {}),
    },
    runtimeInstanceIdByClipId: Object.fromEntries(composition.clips.map(clip => [clip.id, clip.instanceId])),
  }
}

function globalSectionBoundaries(record: ShowRecordV2): number[] {
  const composition = record.composition
  return [...new Set([
    0,
    composition.showEndMs,
    ...composition.layoutOccurrences.map(occurrence => occurrence.startMs),
    ...composition.transitions.flatMap(transition => transition.wholeOutput ? [transition.wholeOutput.startMs, transition.wholeOutput.startMs + transition.durationMs] : []),
    ...composition.clips.flatMap(clip => clip.appearance.keys.slice(1).map(key => key.timeMs)),
    ...composition.propertyTracks.flatMap(track => track.target.kind === 'show-repeat-scale'
      ? track.keyframes.map(key => key.timeMs)
      : [track.activeStartMs, track.activeStartMs + track.activeDurationMs]),
  ])].filter(timeMs => timeMs >= 0 && timeMs <= composition.showEndMs)
    .sort((left, right) => left - right)
}

function derivedSections(record: ShowRecordV2): DerivedSection[] {
  const boundaries = globalSectionBoundaries(record)
  return boundaries.slice(0, -1).map((startMs, index) => ({
    id: `v2-section:${index}`, startMs, endMs: boundaries[index + 1],
  })).filter(section => !record.composition.transitions.some(transition => transition.wholeOutput
    && section.startMs >= transition.wholeOutput.startMs
    && section.endMs <= transition.wholeOutput.startMs + transition.durationMs))
}

function sectionContribution(record: ShowRecordV2, section: DerivedSection) {
  const incoming = record.composition.transitions.find(transition => transition.wholeOutput
    && transition.wholeOutput.startMs + transition.durationMs === section.startMs)
  const outgoing = record.composition.transitions.find(transition => transition.wholeOutput?.startMs === section.endMs)
  return { startMs: section.startMs - (incoming?.durationMs ?? 0), endMs: section.endMs + (outgoing?.durationMs ?? 0) }
}

function propertyTrackSectionBounds(
  record: ShowRecordV2,
  section: DerivedSection,
  track: ShowRecordV2['composition']['propertyTracks'][number],
) {
  const contribution = sectionContribution(record, section)
  return track.target.kind === 'instance-time-scale' || track.target.kind === 'instance-control'
    ? { startMs: section.startMs, endMs: contribution.endMs }
    : contribution
}

function firstCrossSectionTrackIndex(record: ShowRecordV2): number {
  const sections = derivedSections(record)
  return record.composition.propertyTracks.findIndex(track => {
    if (track.target.kind === 'show-repeat-scale' || track.target.kind === 'layout-occurrence-split-position') return false
    const targetClip = 'clipId' in track.target
      ? record.composition.clips.find(clip => clip.id === ('clipId' in track.target ? track.target.clipId : undefined))
      : undefined
    const activeEndMs = track.activeStartMs + track.activeDurationMs
    const represented = sections.filter(section => {
      if (targetClip && !overlaps(targetClip, section)) return false
      const bounds = propertyTrackSectionBounds(record, section, track)
      return track.activeStartMs < bounds.endMs && activeEndMs > bounds.startMs
    })
    // A Scene track applies over its complete contribution. Activation edges
    // become global section edges; a partial positive-Transition contribution
    // still cannot lose its activation by stripping the persisted v2 fields.
    return represented.length === 0 || represented.some(section => {
      const bounds = propertyTrackSectionBounds(record, section, track)
      return track.activeStartMs > bounds.startMs || activeEndMs < bounds.endMs
    })
  })
}

function emitResolvedShowV2(context: ResolvedShowV2CompileContext): LoweredShowCompositionV2 {
  if (context.route === 'continuous-flat') return lowerContinuousToFlat(context)
  if (context.route === 'global-sections') return lowerGlobalClipsToSections(context)

  const { record, lookup } = context
  const composition = record.composition

  // Only previously refused animated targets need redundant appearance
  // coalescing. Other accepted multi-key records preserve their emitted bytes.
  const clips = composition.clips.map(clip => {
    const animated = composition.propertyTracks.some(track => (
      ('clipId' in track.target && track.target.clipId === clip.id)
      || ('instanceId' in track.target && track.target.instanceId === clip.instanceId)
    ))
    return animated && clip.appearance.keys.length > 1
      && clip.appearance.keys.every(key => structurallyEqualAppearance(key.value, clip.appearance.keys[0].value))
      ? { ...clip, appearance: { keys: [clip.appearance.keys[0]] } }
      : clip
  })
  const sectionId = 'v2-section:0'
  const layersByZone = new Map(record.zones.map(zone => [
    zone.id,
    composition.layers
      .filter(layer => layer.zoneId === zone.id)
      .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id)),
  ]))
  const sceneZones: ShowZoneComposition[] = record.zones.map(zone => {
    const layers = layersByZone.get(zone.id) ?? []
    const mainLayer = layers.find(layer => layer.rank === 0)
    const main = clips
      .filter(clip => clip.zoneId === zone.id && clip.layerId === mainLayer?.id)
      .flatMap(clip => lowerTransitionAppearanceSegments(context, clip, false))
    const overlays: ShowOverlayLayer[] = layers
      .filter(layer => layer.rank > 0)
      .sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id))
      .map(layer => ({
        id: layer.id,
        name: layer.name,
        placements: clips
          .filter(clip => clip.zoneId === zone.id && clip.layerId === layer.id)
          .flatMap(clip => lowerTransitionAppearanceSegments(context, clip, true)),
      }))
    return { zoneId: zone.id, main, overlays }
  })
  const transitionParticipants = composition.transitions.map((transition): ShowLayerTransition => {
    const participant = transition.participants[0]
    return {
      ...stripV2TransitionFields(transition),
      id: transition.id,
      fromPlacementId: finalAppearanceSegmentId(clips.find(clip => clip.id === participant.fromClipId)!),
      toPlacementId: participant.toClipId,
      kind: transition.kind,
    }
  })
  const propertyTracks = composition.propertyTracks.filter(track => track.target.kind !== 'layout-occurrence-split-position').map(track => ({
    ...stripV2PropertyTrackActivation(track),
    target: lowerPropertyTarget(track.target),
  }))
  const v1Composition: ShowCompositionV1 = {
    version: 1,
    ...(composition.executionModel === 'deterministic-loop'
      ? { executionModel: 'deterministic-loop' as const }
      : {}),
    durationMs: composition.showEndMs,
    patternInstances: structuredClone(composition.patternInstances),
    scenes: [{
      sceneId: sectionId,
      zones: sceneZones,
      ...(propertyTracks.length > 0 ? { propertyTracks } : {}),
    }],
    ...(composition.markers.length > 0 ? { markers: structuredClone(composition.markers) } : {}),
    ...(transitionParticipants.length > 0 ? { transitions: transitionParticipants } : {}),
  }
  const show = buildLoweredShow(
    context,
    [buildDerivedScene(context, sectionId, record.name, composition.showEndMs)],
    [],
    v1Composition,
  )
  return { show, lookup }
}

function lowerGlobalClipsToSections(
  context: ResolvedShowV2CompileContext,
): LoweredShowCompositionV2 {
  const { record, lookup } = context
  const composition = record.composition
  const sections = derivedSections(record)
  const trackIds = new Set(composition.propertyTracks.map(track => track.id))
  const keyIds = new Set(composition.propertyTracks.flatMap(track => track.keyframes.map(key => key.id)))
  const freshTransientId = (used: Set<string>, seed: string): string => {
    let id = seed
    let suffix = 2
    while (used.has(id)) id = `${seed}:${suffix++}`
    used.add(id)
    return id
  }
  const sectionTracks = new Map<string, ShowRecordV2['composition']['propertyTracks']>()
  for (const track of composition.propertyTracks.filter(track => (
    track.target.kind !== 'show-repeat-scale' && track.target.kind !== 'layout-occurrence-split-position'
  ))) {
    const targetClip = 'clipId' in track.target
      ? composition.clips.find(clip => clip.id === ('clipId' in track.target ? track.target.clipId : undefined))
      : undefined
    const pieces = sections.flatMap(section => {
      if (targetClip && !overlaps(targetClip, section)) return []
      const bounds = propertyTrackSectionBounds(record, section, track)
      const restricted = restrictShowPropertyTrackV2(composition.propertyTracks, track, bounds.startMs, bounds.endMs, keyIds)
      return restricted ? [{ section, track: restricted }] : []
    })
    for (const piece of pieces) {
      // Previously admitted exact activations retain their track, key identities
      // and authored endpoint representation, preserving generated source bytes.
      const transient = pieces.length === 1 && piece.track === track ? track : {
        ...piece.track,
        id: freshTransientId(trackIds, `${track.id}@${piece.section.id}`),
        keyframes: piece.track.keyframes.map(key => ({
          ...key, id: freshTransientId(keyIds, `${key.id}@${piece.section.id}`),
        })),
      }
      const tracks = sectionTracks.get(piece.section.id) ?? []
      tracks.push(transient)
      sectionTracks.set(piece.section.id, tracks)
    }
  }
  const layersByZone = new Map(record.zones.map(zone => [
    zone.id,
    composition.layers
      .filter(layer => layer.zoneId === zone.id)
      .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id)),
  ]))
  const v1Scenes = sections.map(section => {
    const zones: ShowZoneComposition[] = record.zones.map(zone => {
      const layers = layersByZone.get(zone.id) ?? []
      const mainLayer = layers.find(layer => layer.rank === 0)
      const main = composition.clips
        .filter(clip => clip.zoneId === zone.id && clip.layerId === mainLayer?.id && overlaps(clip, section))
        .map(clip => lowerClipSection(context, clip, section, false))
      const overlays: ShowOverlayLayer[] = layers
        .filter(layer => layer.rank > 0)
        .sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id))
        .map(layer => ({
          id: `${layer.id}@${section.id}`,
          name: layer.name,
          placements: [
            ...composition.clips
              .filter(clip => clip.zoneId === zone.id && clip.layerId === layer.id && overlaps(clip, section))
              .map(clip => lowerClipSection(context, clip, section, true)),
          ],
        }))
      return { zoneId: zone.id, main, overlays }
    })
    const propertyTracks = (sectionTracks.get(section.id) ?? [])
      .map(track => ({
        ...stripV2PropertyTrackActivation(track),
        target: lowerPropertyTargetForSection(track.target, composition.clips, section),
        keyframes: track.keyframes.map(keyframe => ({
          ...structuredClone(keyframe),
          timeMs: keyframe.timeMs - section.startMs,
        })),
      }))
    return {
      sceneId: section.id,
      zones,
      ...(propertyTracks.length > 0 ? { propertyTracks } : {}),
    }
  })
  const v1Composition: ShowCompositionV1 = {
    version: 1,
    ...(composition.executionModel === 'deterministic-loop'
      ? { executionModel: 'deterministic-loop' as const }
      : {}),
    durationMs: composition.showEndMs,
    patternInstances: structuredClone(composition.patternInstances),
    scenes: v1Scenes,
    ...(composition.markers.length > 0 ? { markers: structuredClone(composition.markers) } : {}),
  }
  const scenes = sections.map((section, index) => buildDerivedScene(
    context,
    section.id,
    `Section ${index + 1}`,
    section.endMs - section.startMs,
    section.startMs,
  ))
  const lowered = buildLoweredShow(context, scenes, [], v1Composition)
  for (const transition of composition.transitions) {
    const sectionIndex = sections.findIndex(section => section.endMs === transition.wholeOutput!.startMs)
    if (sectionIndex < 0) throw new Error('Whole-output Transition has no outgoing hold section.')
    lowered.transitions.push({ ...stripV2TransitionFields(transition), id: transition.id, kind: transition.kind, afterSceneId: scenes[sectionIndex].id, ...(transition.propertyRamps.length > 0 ? { propertyTransitions: scalarBoundaryRamps(transition) } : {}) })
  }
  return { show: lowered, lookup }
}

type DerivedSection = { id: string; startMs: number; endMs: number }

function overlaps(clip: ShowClipV2, section: DerivedSection): boolean {
  return clip.startMs < section.endMs && clip.startMs + clip.durationMs > section.startMs
}

function lowerClipSection(context: ResolvedShowV2CompileContext, clip: ShowClipV2, section: DerivedSection, overlay: false): ShowMainPlacement
function lowerClipSection(context: ResolvedShowV2CompileContext, clip: ShowClipV2, section: DerivedSection, overlay: true): ShowOverlayPlacement
function lowerClipSection(
  context: ResolvedShowV2CompileContext,
  clip: ShowClipV2,
  section: DerivedSection,
  overlay: boolean,
): ShowMainPlacement | ShowOverlayPlacement {
  const segmentStartMs = Math.max(clip.startMs, section.startMs)
  const segmentEndMs = Math.min(clip.startMs + clip.durationMs, section.endMs)
  const id = segmentStartMs === clip.startMs ? clip.id : `${clip.id}--span-${section.id}`
  const appearance = heldAppearance(clip, segmentStartMs)
  const placement: ShowMainPlacement = {
    id,
    ...(id === clip.id ? {} : { logicalClipId: clip.id }),
    instanceId: runtimeInstanceId(context, clip),
    startMs: segmentStartMs - section.startMs,
    durationMs: segmentEndMs - segmentStartMs,
    opacity: appearance.opacity,
    view: structuredClone(appearance.view),
    ...(appearance.presentation !== undefined ? { presentation: structuredClone(appearance.presentation) } : {}),
    ...(appearance.blink !== undefined ? { blink: structuredClone(appearance.blink) } : {}),
    ...(appearance.transform !== undefined ? { transform: structuredClone(appearance.transform) } : {}),
    ...(appearance.aperture !== undefined ? { viewport: structuredClone(appearance.aperture) } : {}),
    ...((appearance.effects?.length ?? 0) > 0 ? { effects: structuredClone(appearance.effects) } : {}),
  }
  return overlay ? { ...placement, opacity: appearance.opacity } : placement
}

function heldAppearance(clip: ShowClipV2, timeMs: number) {
  return [...clip.appearance.keys].reverse().find(key => key.timeMs <= timeMs)!.value
}

function lowerPropertyTargetForSection(
  target: ShowPropertyTargetV2,
  clips: ShowClipV2[],
  section: DerivedSection,
): ShowPropertyAnimationTarget {
  if (target.kind === 'instance-time-scale' || target.kind === 'instance-control') return structuredClone(target)
  if (target.kind === 'layout-occurrence-split-position' || target.kind === 'show-repeat-scale') {
    throw new Error(`Show composition v2 property target "${target.kind}" requires direct compiler support.`)
  }
  const clipId = target.clipId
  const clip = clips.find(candidate => candidate.id === clipId)
  if (!clip || !overlaps(clip, section)) {
    throw new Error(`Show composition v2 property target Clip "${clipId}" is outside its derived section.`)
  }
  const placementId = Math.max(clip.startMs, section.startMs) === clip.startMs
    ? clip.id
    : `${clip.id}--span-${section.id}`
  if (target.kind === 'clip-opacity') return { kind: 'placement-opacity', placementId }
  if (target.kind === 'clip-view') return { kind: 'placement-view', placementId, property: target.property }
  if (target.kind === 'clip-transform') return { kind: 'placement-transform', placementId, property: target.property }
  if (target.kind === 'clip-aperture') return { kind: 'placement-viewport', placementId, property: target.property }
  return {
    kind: 'placement-effect',
    placementId,
    effectId: target.effectId,
    effectKind: target.effectKind,
    parameterId: target.parameterId,
  }
}

function canLowerToFlat(record: ShowRecordV2, allowEqualAppearanceSegments = false): boolean {
  if (record.composition.transitions.some(transition => transition.wholeOutput)) return false
  const composition = record.composition
  const wholeBoundary = composition.transitions.every(transition => {
    const participant = transition.participants[0]
    const from = composition.clips.find(clip => clip.id === participant.fromClipId)!
    const to = composition.clips.find(clip => clip.id === participant.toClipId)!
    return record.zones.length === 1 && !composition.clips.some(clip => clip !== from && clip !== to && clip.startMs <= to.startMs && clip.startMs + clip.durationMs >= from.startMs + from.durationMs)
  })
  return wholeBoundary
    && composition.propertyTracks.every(track => track.target.kind === 'layout-occurrence-split-position')
    && composition.layers.every(layer => layer.rank === 0)
    && composition.clips.every(clip => (clip.appearance.keys.length === 1 || (allowEqualAppearanceSegments && clip.appearance.keys.every(key => structurallyEqualAppearance(key.value, clip.appearance.keys[0].value)))) && clip.appearance.keys[0].value.opacity === 1)
    && composition.clips.every(clip => clip.zoneSampleMode === 'independent')
}

function lowerContinuousToFlat(
  context: ResolvedShowV2CompileContext,
): LoweredShowCompositionV2 {
  const { record, lookup } = context
  const composition = record.composition
  const boundaries = [...new Set([
    0,
    composition.showEndMs,
    ...composition.layoutOccurrences.map(occurrence => occurrence.startMs),
    ...composition.clips.flatMap(clip => [clip.startMs, clip.startMs + clip.durationMs]),
  ])].sort((left, right) => left - right)
  const windows = composition.transitions.map(transition => {
    const from = composition.clips.find(clip => clip.id === transition.participants[0].fromClipId)!
    const startMs = from.startMs + from.durationMs
    return { transition, startMs, endMs: startMs + transition.durationMs }
  })
  const sections = boundaries.slice(0, -1).map((startMs, index) => ({ startMs, endMs: boundaries[index + 1] }))
    .filter(section => !windows.some(window => section.startMs >= window.startMs && section.endMs <= window.endMs))
  const scenes = sections.map((section, index) => buildDerivedScene(
    context,
    `v2-flat-section:${index}`,
    composition.markers.find(marker => marker.timeMs === section.startMs)?.name ?? `Section ${index + 1}`,
    section.endMs - section.startMs,
    section.startMs,
  ))
  const sceneIndexByStart = new Map(sections.map((section, index) => [section.startMs, index]))
  const instanceById = new Map(composition.patternInstances.map(instance => [instance.id, instance]))
  const byCellId: Record<string, string> = {}
  const instanceIdByCellId = { ...(lookup.instanceIdByCellId ?? {}) }
  const cells = composition.clips.map((clip): ShowCell => {
    const appearance = clip.appearance.keys[0].value
    const instanceId = runtimeInstanceId(context, clip)
    const instance = instanceById.get(instanceId)!
    const startIndex = sceneIndexByStart.get(clip.startMs)!
    const endIndex = sections.findIndex(section => section.endMs === clip.startMs + clip.durationMs) + 1
    const source = lookup.byPatternInstanceId?.[instance.id]
    if (!source) throw new Error(`Show composition v2 requires exact Pattern source for instance "${instance.id}".`)
    byCellId[clip.id] = source
    instanceIdByCellId[clip.id] = instanceId
    const cell: ShowCell = {
      id: clip.id,
      zoneId: clip.zoneId,
      sceneId: scenes[startIndex].id,
      sceneSpan: endIndex - startIndex,
      pattern: structuredClone(instance.pattern),
      patternName: instance.patternName,
      evaluationPolicy: instance.evaluationPolicy,
      restartOnEntry: false,
      ...(clip.zoneSampleMode === 'independent' ? {} : { zoneMode: clip.zoneSampleMode }),
      adaptations: {
        mirror: appearance.view.mirror,
        phase: appearance.view.phase,
        brightness: appearance.view.brightness,
        timeScale: instance.time.timeScale,
        timeOffsetMs: instance.time.timeOffsetMs,
        ...(instance.time.lightShutter ? { lightShutter: structuredClone(instance.time.lightShutter) } : {}),
        ...(instance.time.steppedClock ? { steppedClock: structuredClone(instance.time.steppedClock) } : {}),
      },
      ...(instance.controlTargets ? { controlTargets: structuredClone(instance.controlTargets) } : {}),
      ...(appearance.presentation ? { presentation: structuredClone(appearance.presentation) } : {}),
      ...(appearance.blink ? { blink: structuredClone(appearance.blink) } : {}),
      ...(appearance.transform ? { transform: structuredClone(appearance.transform) } : {}),
      ...(appearance.aperture ? { viewport: structuredClone(appearance.aperture) } : {}),
      ...((appearance.effects?.length ?? 0) > 0 ? { effects: structuredClone(appearance.effects) } : {}),
    }
    return cell
  })
  const coalesced: ShowCell[] = []
  for (const cell of [...cells].sort((a, b) => scenes.findIndex(scene => scene.id === a.sceneId) - scenes.findIndex(scene => scene.id === b.sceneId))) {
    const start = scenes.findIndex(scene => scene.id === cell.sceneId)
    const previous = coalesced.find(candidate =>
      instanceIdByCellId[candidate.id] === instanceIdByCellId[cell.id]
      && scenes.findIndex(scene => scene.id === candidate.sceneId) + candidate.sceneSpan === start
      && sameFlatCellAppearance(candidate, cell))
    if (previous) previous.sceneSpan += cell.sceneSpan
    else coalesced.push({ ...cell })
  }
  const show = buildLoweredShow(context, scenes, coalesced)
  show.transitions.push(...windows.map(window => ({
    ...stripV2TransitionFields(window.transition),
    id: window.transition.id, kind: window.transition.kind,
    afterSceneId: scenes[sections.findIndex(section => section.endMs === window.startMs)].id,
  })))
  return {
    show,
    lookup: { ...structuredClone(lookup), byCellId, instanceIdByCellId },
  }
}

function sameFlatCellAppearance(left: ShowCell, right: ShowCell): boolean {
  const payload = (cell: ShowCell) => {
    const result: Partial<ShowCell> = { ...cell }
    delete result.id
    delete result.sceneId
    delete result.sceneSpan
    return result
  }
  return JSON.stringify(payload(left)) === JSON.stringify(payload(right))
}

function buildDerivedScene(
  context: ResolvedShowV2CompileContext,
  id: string,
  name: string,
  durationMs: number,
  startMs = 0,
): ShowRecord['scenes'][number] {
  const occurrence = context.record.composition.layoutOccurrences.find(candidate => candidate.startMs <= startMs && candidate.startMs + candidate.durationMs > startMs)!
  return { id, name, durationMs, ...(repeatScaleAt(context.record, startMs) !== 1 ? { sampleTargets: { repeatScale: repeatScaleAt(context.record, startMs) } } : {}), ...(occurrence.parameters.splitPosition !== undefined ? { routingTargets: { splitPosition: occurrence.parameters.splitPosition } } : {}) }
}

function buildLoweredShow(
  context: ResolvedShowV2CompileContext,
  scenes: ShowRecord['scenes'],
  cells: ShowCell[],
  composition?: ShowCompositionV1,
): ShowRecord {
  const { record } = context
  const sceneEnds = new Map<number, string>()
  let cursor = 0
  for (const scene of scenes) {
    cursor += scene.durationMs
    sceneEnds.set(cursor, scene.id)
    const boundary = record.composition.transitions.find(transition => transition.wholeOutput?.startMs === cursor)
    cursor += boundary?.durationMs ?? 0
  }
  const transitions: ShowRecord['transitions'] = [...record.composition.layoutOccurrences].sort((a, b) => a.startMs - b.startMs).filter((occurrence, index, ordered) => index > 0 && (occurrence.incomingTransfer || occurrence.layoutId !== ordered[index - 1].layoutId)).map(occurrence => ({
    id: occurrence.incomingTransfer?.id ?? `routing:${occurrence.id}`,
    afterSceneId: sceneEnds.get(occurrence.startMs)!, kind: 'routing', layoutId: occurrence.layoutId,
    durationMs: occurrence.incomingTransfer?.durationMs ?? 0,
    easing: structuredClone(occurrence.incomingTransfer?.easing ?? { curve: 'linear' }),
    ...(occurrence.incomingTransfer ? { routingDirection: occurrence.incomingTransfer.direction } : {}),
  }))
  return {
    id: record.id,
    name: record.name,
    scenes,
    zones: structuredClone(record.zones),
    cells,
    routingLayouts: structuredClone(context.routingLayouts),
    transitions,
    ...(record.targetControllerProfileId !== undefined ? { targetControllerProfileId: record.targetControllerProfileId } : {}),
    ...(record.stageMapId !== undefined ? { stageMapId: record.stageMapId } : {}),
    outputContract: structuredClone(record.outputContract),
    ...(composition !== undefined ? { composition } : {}),
    ...(record.outputEffects !== undefined ? { outputEffects: structuredClone(record.outputEffects) } : {}),
    ...(record.importMetadata !== undefined ? { importMetadata: structuredClone(record.importMetadata) } : {}),
    updatedAt: record.updatedAt,
  }
}

function hasCoincidentPositiveTransitionWindows(record: ShowRecordV2): boolean {
  const clipById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  const windows = record.composition.transitions.map(transition => {
    if (transition.wholeOutput) return { id: transition.id, startMs: transition.wholeOutput.startMs, endMs: transition.wholeOutput.startMs + transition.durationMs }
    const participant = transition.participants[0]
    const from = clipById.get(participant.fromClipId)!
    return { id: transition.id, startMs: from.startMs + from.durationMs, endMs: from.startMs + from.durationMs + transition.durationMs }
  })
  return windows.some((left, index) => windows.slice(index + 1).some(right => (
    left.id !== right.id && left.startMs < right.endMs && right.startMs < left.endMs
  )))
}

function selectedLayoutFirst(record: ShowRecordV2) {
  const selectedId = record.composition.layoutOccurrences.find(occurrence => occurrence.startMs === 0)!.layoutId
  return structuredClone(record.zoneLayouts).sort((left, right) => (
    Number(right.id === selectedId) - Number(left.id === selectedId)
  ))
}

function runtimeInstanceId(context: ResolvedShowV2CompileContext, clip: ShowClipV2): string {
  const instanceId = context.runtimeInstanceIdByClipId[clip.id]
  if (!instanceId) throw new Error(`Resolved Show composition v2 Clip "${clip.id}" has no runtime identity.`)
  return instanceId
}

/** Complete exact JSON structure comparison; neither floats nor fields are approximated. */
function structurallyEqualAppearance(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => structurallyEqualAppearance(value, right[index]))
  }
  const leftObject = left as Record<string, unknown>
  const rightObject = right as Record<string, unknown>
  const keys = Object.keys(leftObject)
  return keys.length === Object.keys(rightObject).length
    && keys.every(key => Object.prototype.hasOwnProperty.call(rightObject, key) && structurallyEqualAppearance(leftObject[key], rightObject[key]))
}

function finalAppearanceSegmentId(clip: ShowClipV2): string {
  return clip.appearance.keys.length === 1
    ? clip.id
    : `${clip.id}--appearance-${clip.appearance.keys.length - 1}`
}

function lowerTransitionAppearanceSegments(
  context: ResolvedShowV2CompileContext,
  clip: ShowClipV2,
  overlay: false,
): ShowMainPlacement[]
function lowerTransitionAppearanceSegments(
  context: ResolvedShowV2CompileContext,
  clip: ShowClipV2,
  overlay: true,
): ShowOverlayPlacement[]
function lowerTransitionAppearanceSegments(
  context: ResolvedShowV2CompileContext,
  clip: ShowClipV2,
  overlay: boolean,
): Array<ShowMainPlacement | ShowOverlayPlacement> {
  const sharesPresentationOwner = clip.appearance.keys.every(key => (
    JSON.stringify({
      view: key.value.view,
      presentation: key.value.presentation,
      blink: key.value.blink,
      effects: key.value.effects,
    }) === JSON.stringify({
      view: clip.appearance.keys[0].value.view,
      presentation: clip.appearance.keys[0].value.presentation,
      blink: clip.appearance.keys[0].value.blink,
      effects: clip.appearance.keys[0].value.effects,
    })
  ))
  return clip.appearance.keys.map((key, index) => {
    const endMs = clip.appearance.keys[index + 1]?.timeMs ?? clip.startMs + clip.durationMs
    const id = index === 0 ? clip.id : `${clip.id}--appearance-${index}`
    const appearance = key.value
    const placement: ShowMainPlacement = {
      id,
      ...(index === 0 || !sharesPresentationOwner ? {} : { logicalClipId: clip.id }),
      instanceId: runtimeInstanceId(context, clip),
      startMs: key.timeMs,
      durationMs: endMs - key.timeMs,
      opacity: appearance.opacity,
      view: structuredClone(appearance.view),
      ...(appearance.presentation !== undefined ? { presentation: structuredClone(appearance.presentation) } : {}),
      ...(appearance.blink !== undefined ? { blink: structuredClone(appearance.blink) } : {}),
      ...(appearance.transform !== undefined ? { transform: structuredClone(appearance.transform) } : {}),
      ...(appearance.aperture !== undefined ? { viewport: structuredClone(appearance.aperture) } : {}),
      ...((appearance.effects?.length ?? 0) > 0 ? { effects: structuredClone(appearance.effects) } : {}),
    }
    return overlay ? { ...placement, opacity: appearance.opacity } : placement
  })
}

function stripV2PropertyTrackActivation(
  track: ShowRecordV2['composition']['propertyTracks'][number],
) {
  const {
    activeStartMs: _activeStartMs,
    activeDurationMs: _activeDurationMs,
    ...v1Track
  } = structuredClone(track)
  return v1Track
}

function stripV2TransitionFields(
  transition: ShowRecordV2['composition']['transitions'][number],
): Omit<ShowLayerTransition, 'id' | 'fromPlacementId' | 'toPlacementId' | 'kind'> {
  const { participants: _participants, wholeOutput: _wholeOutput, propertyRamps: _propertyRamps, ...settings } = structuredClone(transition)
  return settings
}
