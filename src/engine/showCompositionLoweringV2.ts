import { groupRuntimeBindings, materializeShowGroupsV2 } from './showGroupsV2'
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
import type { ShowRecipe } from './showCompiler'
import {
  validateShowRecordV2,
  type ShowClipV2,
  type ShowPropertyTargetV2,
  type ShowRecordV2,
} from './showCompositionV2'

export interface LoweredShowCompositionV2 {
  show: ShowRecord
  lookup: ShowCompileRecipeSourceLookup
}

export type ShowV2CompilePreparationIssueCode =
  | 'invalid-record'
  | 'missing-pattern-source'
  | 'unsupported-layout-occurrences'
  | 'unsupported-groups'
  | 'unsupported-transition-appearance'
  | 'unsupported-restart'
  | 'unsupported-transition-participants'
  | 'unsupported-transition-overlap'
  | 'unsupported-transition-property-ramp'
  | 'unsupported-transition-property-track'
  | 'unsupported-explicit-cut'
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
): ShowV2CompilePreparation {
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
  const expectedInstances = [...new Set(Object.values(context.runtimeInstanceIdByClipId))].sort()
  const representedInstances = recipe.clips.filter(clip => !clip.compilerOwnedEmpty)
    .map(clip => lowered.lookup.instanceIdByCellId?.[clip.id] ?? clip.id).sort()
  if (JSON.stringify(representedInstances) !== JSON.stringify(expectedInstances)) {
    return { status: 'refused', ...refuse('unsupported-runtime-sharing', 'composition.clips', 'existing compiler recipe cannot represent every used Pattern instance exactly once.') }
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
  const expanded = record.composition.groupDefinitions.length > 0 ? materializeShowGroupsV2(record) : record
  const sources = { ...lookup.byPatternInstanceId }
  for (const binding of groupRuntimeBindings(record)) {
    const sameLocalId = [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap(definition => definition.patternInstances)].filter(instance => instance.id === binding.instance.id)
    const unambiguous = sameLocalId.every(instance => JSON.stringify(instance.pattern) === JSON.stringify(binding.instance.pattern))
    const source = sources[binding.runtimeId] ?? (unambiguous ? lookup.byPatternInstanceId?.[binding.instance.id] : undefined)
    if (source) sources[binding.runtimeId] = source
  }
  const resolved = resolveShowV2CompileContext(expanded, { ...lookup, byPatternInstanceId: sources })
  if ('issues' in resolved) return resolved
  return { context: resolved, lowered: emitResolvedShowV2(resolved) }
}

function refuse(
  code: ShowV2CompilePreparationIssueCode,
  path: string,
  message: string,
): { issues: ShowV2CompilePreparationIssue[] } {
  return { issues: [{ code, path, message }] }
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
  if (composition.transitions.length > 0 && composition.layoutOccurrences.some(occurrence => occurrence.incomingTransfer || occurrence.layoutId !== composition.layoutOccurrences[0].layoutId)) {
    return refuse('unsupported-layout-occurrences', 'composition.layoutOccurrences', 'Mixed Layout and visual Transition lowering requires separate preservation proof.')
  }
  if (composition.groupDefinitions.length > 0 || composition.groupOccurrences.length > 0) {
    return refuse('unsupported-groups', 'composition.groupDefinitions', 'lowering requires Group materialization evidence before compilation.')
  }
  if (composition.transitions.length > 0 && composition.clips.some(clip => clip.appearance.keys.length > 1)) {
    return refuse('unsupported-transition-appearance', 'composition.clips', 'lowering cannot preserve multi-key Clip appearance with Transitions.')
  }
  if (composition.clips.some(clip => clip.entryPolicy === 'restart')) {
    return refuse('unsupported-restart', 'composition.clips', 'lowering requires Restart lifecycle evidence before compilation.')
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
  if (!wholeOutput && composition.transitions.length > 0 && composition.propertyTracks.some(track => track.activeStartMs !== 0 || track.activeDurationMs !== composition.showEndMs)) {
    return refuse('unsupported-transition-property-track', 'composition.propertyTracks', 'lowering requires section-scoped positive-Transition property-track activation evidence before compilation.')
  }
  if (composition.transitions.some(transition => transition.kind === 'cut')) {
    return refuse('unsupported-explicit-cut', 'composition.transitions', 'lowering cannot preserve explicit Cut identity in the implicit v1 Layer-transition form.')
  }
  const unsupportedTargetIndex = composition.propertyTracks.findIndex(track => (
    track.target.kind === 'layout-occurrence-split-position' || (track.target.kind === 'show-repeat-scale' && !isHeldRepeatScaleTrack(track, composition.showEndMs))
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
  const flatEligible = composition.executionModel === 'continuous' && canLowerToFlat(record)
  if (composition.clips.some(clip => clip.zoneSampleMode !== 'span') && !flatEligible) {
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

function firstCrossSectionTrackIndex(record: ShowRecordV2): number {
  const sections = derivedSections(record)
  return record.composition.propertyTracks.findIndex(track => track.target.kind !== 'show-repeat-scale' && !sections.some(section => {
    const contribution = sectionContribution(record, section)
    return contribution.startMs === track.activeStartMs && contribution.endMs === track.activeStartMs + track.activeDurationMs
  }))
}

function emitResolvedShowV2(context: ResolvedShowV2CompileContext): LoweredShowCompositionV2 {
  if (context.route === 'continuous-flat') return lowerContinuousToFlat(context)
  if (context.route === 'global-sections') return lowerGlobalClipsToSections(context)

  const { record, lookup } = context
  const composition = record.composition

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
    const main = composition.clips
      .filter(clip => clip.zoneId === zone.id && clip.layerId === mainLayer?.id)
      .map(clip => lowerMainClip(context, clip))
    const overlays: ShowOverlayLayer[] = layers
      .filter(layer => layer.rank > 0)
      .sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id))
      .map(layer => ({
        id: layer.id,
        name: layer.name,
        placements: composition.clips
          .filter(clip => clip.zoneId === zone.id && clip.layerId === layer.id)
          .map(clip => lowerOverlayClip(context, clip)),
      }))
    return { zoneId: zone.id, main, overlays }
  })
  const transitionParticipants = composition.transitions.map((transition): ShowLayerTransition => {
    if (transition.kind === 'cut') {
      throw new Error('Show composition v2 lowering cannot preserve explicit Cut identity.')
    }
    const participant = transition.participants[0]
    return {
      ...stripV2TransitionFields(transition),
      id: transition.id,
      fromPlacementId: participant.fromClipId,
      toPlacementId: participant.toClipId,
      kind: transition.kind,
    }
  })
  const propertyTracks = composition.propertyTracks.map(track => ({
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
  const trackSection = new Map<string, number>()
  for (const track of composition.propertyTracks.filter(track => track.target.kind !== 'show-repeat-scale')) {
    const activeEndMs = track.activeStartMs + track.activeDurationMs
    const index = sections.findIndex(section => {
      const contribution = sectionContribution(record, section)
      return track.activeStartMs === contribution.startMs && activeEndMs === contribution.endMs
    })
    if (index < 0) {
      throw new Error(`Show composition v2 property track "${track.id}" activation crosses a derived Clip/appearance section.`)
    }
    trackSection.set(track.id, index)
  }
  const layersByZone = new Map(record.zones.map(zone => [
    zone.id,
    composition.layers
      .filter(layer => layer.zoneId === zone.id)
      .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id)),
  ]))
  const v1Scenes = sections.map((section, sectionIndex) => {
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
          placements: composition.clips
            .filter(clip => clip.zoneId === zone.id && clip.layerId === layer.id && overlaps(clip, section))
            .map(clip => lowerClipSection(context, clip, section, true)),
        }))
      return { zoneId: zone.id, main, overlays }
    })
    const propertyTracks = composition.propertyTracks
      .filter(track => trackSection.get(track.id) === sectionIndex)
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

function canLowerToFlat(record: ShowRecordV2): boolean {
  if (record.composition.transitions.some(transition => transition.wholeOutput)) return false
  const composition = record.composition
  const wholeBoundary = composition.transitions.every(transition => {
    const participant = transition.participants[0]
    const from = composition.clips.find(clip => clip.id === participant.fromClipId)!
    const to = composition.clips.find(clip => clip.id === participant.toClipId)!
    return record.zones.length === 1 && !composition.clips.some(clip => clip !== from && clip !== to && clip.startMs <= to.startMs && clip.startMs + clip.durationMs >= from.startMs + from.durationMs)
  })
  return wholeBoundary
    && composition.propertyTracks.length === 0
    && composition.layers.every(layer => layer.rank === 0)
    && composition.clips.every(clip => clip.appearance.keys.length === 1 && clip.appearance.keys[0].value.opacity === 1)
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
    return {
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
  for (const scene of scenes) { cursor += scene.durationMs; sceneEnds.set(cursor, scene.id) }
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

function lowerMainClip(context: ResolvedShowV2CompileContext, clip: ShowClipV2): ShowMainPlacement {
  const appearance = clip.appearance.keys[0].value
  return {
    id: clip.id,
    instanceId: runtimeInstanceId(context, clip),
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    opacity: appearance.opacity,
    view: structuredClone(appearance.view),
    ...(appearance.presentation !== undefined ? { presentation: structuredClone(appearance.presentation) } : {}),
    ...(appearance.blink !== undefined ? { blink: structuredClone(appearance.blink) } : {}),
    ...(appearance.transform !== undefined ? { transform: structuredClone(appearance.transform) } : {}),
    ...(appearance.aperture !== undefined ? { viewport: structuredClone(appearance.aperture) } : {}),
    ...((appearance.effects?.length ?? 0) > 0 ? { effects: structuredClone(appearance.effects) } : {}),
  }
}

function lowerOverlayClip(context: ResolvedShowV2CompileContext, clip: ShowClipV2): ShowOverlayPlacement {
  return { ...lowerMainClip(context, clip), opacity: clip.appearance.keys[0].value.opacity }
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
