import type {
  ShowClipAppearanceKeyV2,
  ShowClipAppearanceValueV2,
  ShowClipV2,
  ShowGroupDefinitionV2,
  ShowGroupOccurrenceV2,
  ShowPropertyTargetV2,
  ShowPropertyTrackV2,
  ShowRecordV2,
  ShowTransitionV2,
} from './showCompositionV2'
import { isShowTransitionClipValueRampV2 } from './showCompositionV2'
import {
  defaultGroupRuntimeIdV2,
  groupOccurrenceDuration,
  groupOccurrenceLocalTimeAtV2,
  occurrenceBoundaryAfter,
  occurrenceBoundaryBefore,
} from './showGroupsV2'
import { normalizeShowClipEvaluationPolicy } from './showClipInspectorModel'
import { normalizeShowClipEffects } from './showEffects'
import { normalizeShowClipTransform } from './showClipTransform'
import { normalizeShowClipViewport } from './showClipViewport'
import {
  resolveShowZonePixelCount,
  validateInstallationCoverage,
  type InstallationCoverage,
} from './showInstallationCoverage'
import { lowerPropertyTarget } from './showV2ValueConversion'
import { repeatScaleAt, scalarBoundaryRamps } from './showV2ScalarProperties'
import { showV2FlatLoweringEligible } from './showFlatLoweringV2'
import type { ShowTransitionSettingsCarrier } from './showTransitionAuthoring'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { formatShowBoundaryIdentity } from './showClipIdentity'
import type { ShowArtifactPatternUse } from './showSourceInventory'
import type { ResolvedClipAnimationSource } from './showClipSummary'
import type {
  ShowAutomatableProperty,
  ShowCell,
  ShowClipBlink,
  ShowClipEffect,
  ShowClipEvaluationPolicy,
  ShowClipPresentation,
  ShowClipTransform,
  ShowClipViewport,
  ShowOutputContract,
  ShowOutputEffect,
  ShowPatternInstance,
  ShowPatternRef,
  ShowPlacementView,
  ShowPropertyAnimationTrack,
  ShowRoutingDirection,
  ShowRoutingLayout,
  ShowTransitionEasing,
  ShowZone,
} from './personalContentRecords'

export type ShowEditorClipOwnerV2 =
  | { kind: 'clip'; clipId: string }
  | { kind: 'group-clip'; occurrenceId: string; definitionId: string; clipId: string }

export interface ShowEditorClipSimulationV2 {
  timeScale: number
  timeOffsetMs: number
  lightShutter?: ShowPatternInstance['time']['lightShutter']
  steppedClock?: ShowPatternInstance['time']['steppedClock']
  controlTargets?: Record<string, number>
}

/**
 * Authored-v2 values consumed by the existing Clip-detail presentation. The
 * vocabulary intentionally mirrors its visible fields without constructing a
 * legacy inspector owner or a Scene-shaped record.
 */
export interface ShowEditorClipValueV2 {
  scope: 'scene-main' | 'scene-overlay'
  owner: ShowEditorClipOwnerV2
  pattern: ShowPatternRef
  patternName: string
  evaluationPolicy: ShowClipEvaluationPolicy
  presentation: ShowClipPresentation
  blink?: ShowClipBlink
  simulation: ShowEditorClipSimulationV2
  view: ShowPlacementView
  transform: ShowClipTransform
  viewport: ShowClipViewport
  effects: ShowClipEffect[]
  placementId: string
  /** Authored Pattern-instance or Group-slot identity. */
  instanceId: string
  /** Effective shared runtime identity for this particular use. */
  effectiveInstanceId: string
  layerId: string
  zoneId: string
  entryPolicy: ShowClipV2['entryPolicy']
  zoneSampleMode: ShowClipV2['zoneSampleMode']
  heldAppearanceKeyId: string
  heldAppearanceTimeMs: number
  /** Requested time in the Clip's authored time domain. */
  requestedLocalTimeMs: number
  local: { startMs: number; durationMs: number; opacity: number }
}

export interface ShowEditorPropertyTrackPresentationV2 {
  /** Complete authored source, including global/local times and retained curves. */
  authored: ShowPropertyTrackV2
  /** Existing property-animation leaf vocabulary, scoped by the surrounding owner. */
  editor: ShowPropertyAnimationTrack
}

export interface ShowEditorClipAnimationPresentationV2 {
  owner: ShowEditorClipOwnerV2
  tracks: ShowEditorPropertyTrackPresentationV2[]
  storageDurationMs: number
  showTimeOffsetMs: number
  instanceUseCount: number
}

export interface ShowEditorClipPresentationV2 {
  owner: ShowEditorClipOwnerV2
  value: ShowEditorClipValueV2
  animation: ShowEditorClipAnimationPresentationV2
}

export interface ShowEditorGroupLayerBindingPresentationV2 {
  definitionLayerId: string
  definitionRank: number
  layerId: string
  layerRank: number
}

export interface ShowEditorGroupOccurrencePresentationV2 {
  id: string
  definitionId: string
  name: string
  zoneId: string
  layoutOccurrenceId: string
  startMs: number
  durationMs: number
  endMs: number
  translationX: number
  translationY: number
  baseLayer: number
  linkedOccurrenceCount: number
  clipCount: number
  layerCount: number
  layerBindings: ShowEditorGroupLayerBindingPresentationV2[]
  clipsById: Record<string, ShowEditorClipPresentationV2>
}

export interface ShowEditorTransitionPresentationV2 {
  id: string
  transition: ShowTransitionV2
  startMs: number
  durationMs: number
  endMs: number
  fromClipIds: string[]
  toClipIds: string[]
}

export interface ShowEditorZonePresentationV2 {
  id: string
  zone: ShowZone
  pixelCount: { source: 'physical' | 'nominal'; value: number }
}

export interface ShowEditorZoneLayoutPresentationV2 {
  id: string
  definition: ShowRoutingLayout
  occurrenceIds: string[]
  useCount: number
}

export interface ShowEditorLayoutOccurrencePresentationV2 {
  id: string
  definitionId: string
  occurrence: ShowRecordV2['composition']['layoutOccurrences'][number]
  definition: ShowRoutingLayout
  active: boolean
}

export interface ShowEditorShowPresentationV2 {
  id: string
  name: string
  showEndMs: number
  executionModel: ShowRecordV2['composition']['executionModel']
  repeatScale: number
  targetControllerProfileId?: string
  stageMapId?: string | null
  outputContract: ShowOutputContract
  outputEffects: ShowOutputEffect[]
  zoneCount: number
  nominalPixelCount: number
  installationCoverage: InstallationCoverage | null
}

export interface ShowEditorInspectorPresentationV2 {
  recordVersion: 2
  atMs: number
  show: ShowEditorShowPresentationV2
  zonesById: Record<string, ShowEditorZonePresentationV2>
  clipsById: Record<string, ShowEditorClipPresentationV2>
  groupsByOccurrenceId: Record<string, ShowEditorGroupOccurrencePresentationV2>
  transitionsById: Record<string, ShowEditorTransitionPresentationV2>
  zoneLayoutsById: Record<string, ShowEditorZoneLayoutPresentationV2>
  layoutOccurrencesById: Record<string, ShowEditorLayoutOccurrencePresentationV2>
}

interface HeldAppearance {
  key: ShowClipAppearanceKeyV2
  value: ShowClipAppearanceValueV2
  spanStartMs: number
  spanEndMs: number
}

function heldAppearance(
  clip: Pick<ShowClipV2, 'startMs' | 'durationMs' | 'appearance'>,
  atMs: number,
): HeldAppearance {
  const keys = [...clip.appearance.keys]
    .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  let index = 0
  for (let candidate = 0; candidate < keys.length; candidate += 1) {
    if (keys[candidate]!.timeMs <= atMs) index = candidate
    else break
  }
  const key = keys[index]!
  return {
    key,
    value: key.value,
    spanStartMs: key.timeMs,
    spanEndMs: keys[index + 1]?.timeMs ?? clip.startMs + clip.durationMs,
  }
}

function cloneSimulation(instance: ShowPatternInstance): ShowEditorClipSimulationV2 {
  return {
    timeScale: instance.time.timeScale,
    timeOffsetMs: instance.time.timeOffsetMs,
    ...(instance.time.lightShutter ? { lightShutter: structuredClone(instance.time.lightShutter) } : {}),
    ...(instance.time.steppedClock ? { steppedClock: structuredClone(instance.time.steppedClock) } : {}),
    ...(instance.controlTargets ? { controlTargets: structuredClone(instance.controlTargets) } : {}),
  }
}

function clipValue(input: {
  owner: ShowEditorClipOwnerV2
  clip: ShowClipV2
  authoredInstanceId: string
  effectiveInstanceId: string
  instance: ShowPatternInstance
  layerId: string
  layerRank: number
  zoneId: string
  requestedLocalTimeMs: number
  globalStartMs: number
  globalDurationMs: number
}): ShowEditorClipValueV2 {
  const appearance = heldAppearance(input.clip, input.requestedLocalTimeMs)
  return {
    scope: input.layerRank === 0 ? 'scene-main' : 'scene-overlay',
    owner: structuredClone(input.owner),
    pattern: structuredClone(input.instance.pattern),
    patternName: input.instance.patternName,
    evaluationPolicy: normalizeShowClipEvaluationPolicy(input.instance.evaluationPolicy),
    presentation: appearance.value.presentation
      ? structuredClone(appearance.value.presentation)
      : { mode: 'live' },
    ...(appearance.value.blink ? { blink: structuredClone(appearance.value.blink) } : {}),
    simulation: cloneSimulation(input.instance),
    view: structuredClone(appearance.value.view),
    transform: normalizeShowClipTransform(appearance.value.transform),
    viewport: normalizeShowClipViewport(appearance.value.aperture),
    effects: normalizeShowClipEffects(appearance.value.effects),
    placementId: input.clip.id,
    instanceId: input.authoredInstanceId,
    effectiveInstanceId: input.effectiveInstanceId,
    layerId: input.layerId,
    zoneId: input.zoneId,
    entryPolicy: input.clip.entryPolicy,
    zoneSampleMode: input.clip.zoneSampleMode,
    heldAppearanceKeyId: appearance.key.id,
    heldAppearanceTimeMs: appearance.key.timeMs,
    requestedLocalTimeMs: input.requestedLocalTimeMs,
    local: {
      startMs: input.globalStartMs,
      durationMs: input.globalDurationMs,
      opacity: appearance.value.opacity,
    },
  }
}

export function targetBelongsToClip(target: ShowPropertyTargetV2, clipId: string, instanceId: string): boolean {
  if ('clipId' in target) return target.clipId === clipId
  if ('instanceId' in target) return target.instanceId === instanceId
  return false
}

function editorTrack(
  track: ShowPropertyTrackV2,
  target: ShowPropertyAnimationTrack['target'],
  timeMs: (sourceTimeMs: number) => number,
  includeKey: (sourceTimeMs: number) => boolean = () => true,
): ShowPropertyAnimationTrack {
  return {
    id: track.id,
    target: structuredClone(target),
    keyframes: track.keyframes.filter(key => includeKey(key.timeMs)).map(key => ({
      id: key.id,
      timeMs: timeMs(key.timeMs),
      value: key.value,
      easing: structuredClone(key.easing),
    })),
  }
}

function ordinaryAnimation(
  record: ShowRecordV2,
  clip: ShowClipV2,
  owner: Extract<ShowEditorClipOwnerV2, { kind: 'clip' }>,
  appearance: HeldAppearance,
): ShowEditorClipAnimationPresentationV2 {
  const tracks = record.composition.propertyTracks
    .filter(track => targetBelongsToClip(track.target, clip.id, clip.instanceId))
    .filter(track => (
      track.activeStartMs < appearance.spanEndMs
      && track.activeStartMs + track.activeDurationMs > appearance.spanStartMs
    ))
    .map((track): ShowEditorPropertyTrackPresentationV2 => ({
      authored: structuredClone(track),
      editor: editorTrack(
        track,
        lowerPropertyTarget(track.target),
        timeMs => timeMs - appearance.spanStartMs,
        timeMs => timeMs >= appearance.spanStartMs && timeMs <= appearance.spanEndMs,
      ),
    }))
  return {
    owner: structuredClone(owner),
    tracks,
    storageDurationMs: appearance.spanEndMs - appearance.spanStartMs,
    showTimeOffsetMs: appearance.spanStartMs,
    instanceUseCount: effectiveInstanceUseCount(record, clip.instanceId),
  }
}

function groupEditorTarget(
  target: ShowPropertyTargetV2,
  clipId: string,
): ShowPropertyAnimationTrack['target'] {
  const lowered = lowerPropertyTarget(target)
  if (lowered.kind === 'instance-time-scale') return lowered
  if (lowered.kind === 'instance-control') return lowered
  if ('placementId' in lowered && lowered.placementId === clipId) return lowered
  // The caller filters ownership before conversion; retain the authored local
  // identity if a future target shape reaches this versioned reader.
  if ('placementId' in lowered) return { ...lowered, placementId: clipId }
  return lowered
}

function groupAnimation(
  record: ShowRecordV2,
  definition: ShowGroupDefinitionV2,
  occurrence: ShowGroupOccurrenceV2,
  child: ShowGroupDefinitionV2['clips'][number],
  owner: Extract<ShowEditorClipOwnerV2, { kind: 'group-clip' }>,
): ShowEditorClipAnimationPresentationV2 {
  const tracks = definition.propertyTracks
    .filter(track => targetBelongsToClip(track.target, child.id, child.instanceId))
    .map((track): ShowEditorPropertyTrackPresentationV2 => ({
      authored: structuredClone(track),
      editor: editorTrack(
        track,
        groupEditorTarget(track.target, child.id),
        timeMs => occurrenceBoundaryAfter(occurrence, timeMs) - occurrence.startMs,
      ),
    }))
  return {
    owner: structuredClone(owner),
    tracks,
    storageDurationMs: groupOccurrenceDuration(definition, occurrence),
    showTimeOffsetMs: occurrence.startMs,
    instanceUseCount: definitionLinkedInstanceUseCount(record, definition, child.instanceId),
  }
}

/**
 * How many Clips one Group Pattern-instance edit reaches, in the same reading
 * the v1 editor reports: the definition's uses of that authored slot times the
 * number of occurrences that definition has.
 *
 * The slot is authored on the definition and every occurrence instantiates it,
 * so an edit is definition-wide. `instanceBindings` names the per-occurrence
 * runtime the compiler materializes, which is a lowering identity and not the
 * authored linkage this count describes.
 */
function definitionLinkedInstanceUseCount(
  record: ShowRecordV2,
  definition: ShowGroupDefinitionV2,
  slotInstanceId: string,
): number {
  const definitionUseCount = new Set(definition.clips
    .filter(child => child.instanceId === slotInstanceId)
    .map(child => child.id)).size
  const occurrenceCount = record.composition.groupOccurrences
    .filter(candidate => candidate.definitionId === definition.id).length
  return definitionUseCount * Math.max(1, occurrenceCount)
}

function effectiveInstanceUseCount(record: ShowRecordV2, instanceId: string): number {
  let count = record.composition.clips.filter(clip => clip.instanceId === instanceId).length
  for (const occurrence of record.composition.groupOccurrences) {
    const definition = record.composition.groupDefinitions.find(candidate => candidate.id === occurrence.definitionId)
    if (!definition) continue
    for (const child of definition.clips) {
      const effectiveId = occurrence.instanceBindings?.[child.instanceId]
        ?? defaultGroupRuntimeIdV2(definition.id, child.instanceId)
      if (effectiveId === instanceId) count += 1
    }
  }
  return count
}

function ordinaryClipPresentation(record: ShowRecordV2, clip: ShowClipV2, atMs: number): ShowEditorClipPresentationV2 | null {
  const instance = record.composition.patternInstances.find(candidate => candidate.id === clip.instanceId)
  const layer = record.composition.layers.find(candidate => candidate.id === clip.layerId)
  if (!instance || !layer) return null
  const owner = { kind: 'clip' as const, clipId: clip.id }
  const appearance = heldAppearance(clip, atMs)
  return {
    owner,
    value: clipValue({
      owner,
      clip,
      authoredInstanceId: clip.instanceId,
      effectiveInstanceId: clip.instanceId,
      instance,
      layerId: clip.layerId,
      layerRank: layer.rank,
      zoneId: clip.zoneId,
      requestedLocalTimeMs: atMs,
      globalStartMs: clip.startMs,
      globalDurationMs: clip.durationMs,
    }),
    animation: ordinaryAnimation(record, clip, owner, appearance),
  }
}

function groupOccurrencePresentation(
  record: ShowRecordV2,
  occurrence: ShowGroupOccurrenceV2,
  atMs: number,
): ShowEditorGroupOccurrencePresentationV2 | null {
  const definition = record.composition.groupDefinitions.find(candidate => candidate.id === occurrence.definitionId)
  if (!definition) return null
  const bindingPresentations = occurrence.layerBindings.flatMap((binding): ShowEditorGroupLayerBindingPresentationV2[] => {
    const definitionLayer = definition.layers.find(candidate => candidate.id === binding.definitionLayerId)
    const layer = record.composition.layers.find(candidate => candidate.id === binding.layerId)
    return definitionLayer && layer ? [{
      definitionLayerId: definitionLayer.id,
      definitionRank: definitionLayer.rank,
      layerId: layer.id,
      layerRank: layer.rank,
    }] : []
  })
  const requestedLocalTimeMs = groupOccurrenceLocalTimeAtV2(occurrence, atMs)
  const clipsById = Object.fromEntries(definition.clips.flatMap(child => {
    const boundLayer = occurrence.layerBindings.find(binding => binding.definitionLayerId === child.layerId)
    const layer = record.composition.layers.find(candidate => candidate.id === boundLayer?.layerId)
    const slot = definition.patternInstances.find(candidate => candidate.id === child.instanceId)
    const effectiveInstanceId = occurrence.instanceBindings?.[child.instanceId]
      ?? defaultGroupRuntimeIdV2(definition.id, child.instanceId)
    const instance = record.composition.patternInstances.find(candidate => candidate.id === effectiveInstanceId) ?? slot
    if (!boundLayer || !layer || !instance) return []
    const owner = {
      kind: 'group-clip' as const,
      occurrenceId: occurrence.id,
      definitionId: definition.id,
      clipId: child.id,
    }
    const globalStartMs = occurrenceBoundaryAfter(occurrence, child.startMs)
    const globalEndMs = occurrenceBoundaryBefore(occurrence, child.startMs + child.durationMs)
    const presentation: ShowEditorClipPresentationV2 = {
      owner,
      value: clipValue({
        owner,
        clip: { ...child, zoneId: occurrence.zoneId },
        authoredInstanceId: child.instanceId,
        effectiveInstanceId,
        instance,
        layerId: layer.id,
        layerRank: layer.rank,
        zoneId: occurrence.zoneId,
        requestedLocalTimeMs,
        globalStartMs,
        globalDurationMs: globalEndMs - globalStartMs,
      }),
      animation: groupAnimation(record, definition, occurrence, child, owner),
    }
    return [[child.id, presentation] as const]
  }))
  const durationMs = groupOccurrenceDuration(definition, occurrence)
  return {
    id: occurrence.id,
    definitionId: definition.id,
    name: definition.name,
    zoneId: occurrence.zoneId,
    layoutOccurrenceId: occurrence.layoutOccurrenceId,
    startMs: occurrence.startMs,
    durationMs,
    endMs: occurrence.startMs + durationMs,
    translationX: occurrence.translationX,
    translationY: occurrence.translationY,
    baseLayer: bindingPresentations[0]
      ? bindingPresentations[0].layerRank - bindingPresentations[0].definitionRank
      : 0,
    linkedOccurrenceCount: record.composition.groupOccurrences
      .filter(candidate => candidate.definitionId === definition.id).length,
    clipCount: definition.clips.length,
    layerCount: definition.layers.length,
    layerBindings: bindingPresentations,
    clipsById,
  }
}

function transitionPresentation(record: ShowRecordV2, transition: ShowTransitionV2): ShowEditorTransitionPresentationV2 {
  const clipsById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  const fromClipIds = transition.wholeOutput
    ? [...transition.wholeOutput.fromClipIds]
    : [...new Set(transition.participants.map(participant => participant.fromClipId))]
  const toClipIds = transition.wholeOutput
    ? [...transition.wholeOutput.toClipIds]
    : [...new Set(transition.participants.map(participant => participant.toClipId))]
  const starts = transition.wholeOutput
    ? [transition.wholeOutput.startMs]
    : [
        ...fromClipIds.flatMap(id => {
          const clip = clipsById.get(id)
          return clip ? [clip.startMs + clip.durationMs] : []
        }),
        ...toClipIds.flatMap(id => {
          const clip = clipsById.get(id)
          return clip ? [clip.startMs - transition.durationMs] : []
        }),
      ]
  const startMs = starts.length > 0 ? Math.min(...starts) : 0
  return {
    id: transition.id,
    transition: structuredClone(transition),
    startMs,
    durationMs: transition.durationMs,
    endMs: startMs + transition.durationMs,
    fromClipIds,
    toClipIds,
  }
}

/**
 * Project authored v2 data into the existing editor's inspector vocabulary.
 * The result owns its copies and carries no write/admission capability.
 */
export function projectShowEditorInspectorPresentationV2(
  record: ShowRecordV2,
  atMs: number,
): ShowEditorInspectorPresentationV2 {
  const routingRecord = {
    outputContract: record.outputContract,
    zones: record.zones,
    routingLayouts: record.zoneLayouts,
  }
  const zonesById = Object.fromEntries(record.zones.map(zone => {
    const resolved = resolveShowZonePixelCount(routingRecord, zone.id)
      ?? { source: 'nominal' as const, pixelCount: zone.nominalPixelCount }
    return [zone.id, {
      id: zone.id,
      zone: structuredClone(zone),
      pixelCount: { source: resolved.source, value: resolved.pixelCount },
    } satisfies ShowEditorZonePresentationV2]
  }))
  const clipsById = Object.fromEntries(record.composition.clips.flatMap(clip => {
    const presentation = ordinaryClipPresentation(record, clip, atMs)
    return presentation ? [[clip.id, presentation] as const] : []
  }))
  const groupsByOccurrenceId = Object.fromEntries(record.composition.groupOccurrences.flatMap(occurrence => {
    const presentation = groupOccurrencePresentation(record, occurrence, atMs)
    return presentation ? [[occurrence.id, presentation] as const] : []
  }))
  const transitionsById = Object.fromEntries(record.composition.transitions.map(transition => (
    [transition.id, transitionPresentation(record, transition)]
  )))
  const zoneLayoutsById = Object.fromEntries(record.zoneLayouts.map(definition => {
    const occurrenceIds = record.composition.layoutOccurrences
      .filter(occurrence => occurrence.layoutId === definition.id)
      .map(occurrence => occurrence.id)
    return [definition.id, {
      id: definition.id,
      definition: structuredClone(definition),
      occurrenceIds,
      useCount: occurrenceIds.length,
    } satisfies ShowEditorZoneLayoutPresentationV2]
  }))
  const layoutOccurrencesById = Object.fromEntries(record.composition.layoutOccurrences.flatMap(occurrence => {
    const definition = record.zoneLayouts.find(candidate => candidate.id === occurrence.layoutId)
    return definition ? [[occurrence.id, {
      id: occurrence.id,
      definitionId: definition.id,
      occurrence: structuredClone(occurrence),
      definition: structuredClone(definition),
      active: occurrence.startMs <= atMs && atMs < occurrence.startMs + occurrence.durationMs,
    } satisfies ShowEditorLayoutOccurrencePresentationV2] as const] : []
  }))
  return {
    recordVersion: 2,
    atMs,
    show: {
      id: record.id,
      name: record.name,
      showEndMs: record.composition.showEndMs,
      executionModel: record.composition.executionModel,
      repeatScale: record.composition.sampleRemap.repeatScale,
      ...(record.targetControllerProfileId ? { targetControllerProfileId: record.targetControllerProfileId } : {}),
      ...(record.stageMapId !== undefined ? { stageMapId: record.stageMapId } : {}),
      outputContract: structuredClone(record.outputContract),
      outputEffects: structuredClone(record.outputEffects ?? []),
      zoneCount: record.zones.length,
      nominalPixelCount: record.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0),
      installationCoverage: validateInstallationCoverage(routingRecord),
    },
    zonesById,
    clipsById,
    groupsByOccurrenceId,
    transitionsById,
    zoneLayoutsById,
    layoutOccurrencesById,
  }
}

/** Pattern-instance sharing facts the existing Clip detail panel presents. */
export interface ShowEditorClipInstanceOwnershipV2 {
  instanceId: string
  useCount: number
  compatibleTargets: Array<{ instanceId: string; patternName: string; useCount: number }>
}

/**
 * Project one Clip's Pattern-instance ownership from the authored record, in the
 * vocabulary the existing panel already renders. Display only: the tracer
 * connects no sharing write, so these identities are never write targets.
 */
export function projectShowEditorClipInstanceOwnershipV2(
  record: ShowRecordV2,
  effectiveInstanceId: string,
): ShowEditorClipInstanceOwnershipV2 | null {
  const instance = record.composition.patternInstances.find(candidate => candidate.id === effectiveInstanceId)
  if (!instance) return null
  return {
    instanceId: instance.id,
    useCount: effectiveInstanceUseCount(record, instance.id),
    compatibleTargets: record.composition.patternInstances.flatMap((candidate) => {
      if (
        candidate.id === instance.id
        || candidate.pattern.kind !== instance.pattern.kind
        || candidate.pattern.id !== instance.pattern.id
      ) return []
      return [{
        instanceId: candidate.id,
        patternName: candidate.patternName,
        useCount: effectiveInstanceUseCount(record, candidate.id),
      }]
    }),
  }
}

/**
 * Name the authored-v2 record's runtime Pattern uses in the existing artifact
 * inventory's vocabulary. Group members are materialized first, so a shared
 * definition reports one runtime per member use exactly as the Show compiles it.
 */
export function projectShowEditorArtifactPatternUsesV2(
  record: ShowRecordV2,
): ShowArtifactPatternUse[] {
  const effective = materializeShowGroupsV2(record)
  const authoredReferenceIds = new Map<string, Set<string>>()
  for (const clip of effective.composition.clips) {
    const references = authoredReferenceIds.get(clip.instanceId) ?? new Set<string>()
    references.add(clip.id)
    authoredReferenceIds.set(clip.instanceId, references)
  }
  return effective.composition.patternInstances.map((instance) => ({
    id: instance.id,
    key: `${instance.pattern.kind}:${instance.pattern.id}`,
    name: instance.patternName,
    authoredReferenceIds: [...authoredReferenceIds.get(instance.id) ?? []],
  }))
}

/**
 * The resolved Clip facts the existing Clip-summary formatter reads, mapped out
 * of one presented authored-v2 Clip. Both the inspector summary and the
 * timeline caption run the same original formatter over this (#1065).
 */
export function showEditorClipSummaryFactsV2(value: ShowEditorClipValueV2): {
  adaptations: NonNullable<ShowCell['adaptations']>
  controlTargets?: Record<string, number>
  opacity: number
  transform: ShowClipTransform
  viewport: ShowClipViewport
  effects: ShowClipEffect[]
} {
  return {
    adaptations: {
      mirror: value.view.mirror,
      phase: value.view.phase,
      brightness: value.view.brightness,
      timeScale: value.simulation.timeScale,
      ...(value.simulation.lightShutter ? { lightShutter: value.simulation.lightShutter } : {}),
      ...(value.simulation.steppedClock ? { steppedClock: value.simulation.steppedClock } : {}),
      ...(value.simulation.timeOffsetMs !== 0 ? { timeOffsetMs: value.simulation.timeOffsetMs } : {}),
    },
    ...(value.simulation.controlTargets ? { controlTargets: value.simulation.controlTargets } : {}),
    opacity: value.local.opacity,
    transform: value.transform,
    viewport: value.viewport,
    effects: value.effects,
  }
}

export interface ShowEditorTimelineClipSummarySourceV2 {
  /** Effective runtime instance, for the Pattern control labels. */
  instanceId: string
  facts: ReturnType<typeof showEditorClipSummaryFactsV2>
  animation: ResolvedClipAnimationSource
}

/**
 * Clip-summary sources for the timeline caption, keyed by the timeline item id
 * the view model uses. Each Clip is read at its own authored start, which is
 * the instant v1's placement-based caption describes, so the caption stays
 * independent of the playhead exactly as the v1 caption is.
 */
export function projectShowEditorTimelineClipSummarySourcesV2(
  record: ShowRecordV2,
): Record<string, ShowEditorTimelineClipSummarySourceV2> {
  const entries: Array<readonly [string, ShowEditorTimelineClipSummarySourceV2]> = []
  for (const clip of record.composition.clips) {
    const presentation = ordinaryClipPresentation(record, clip, clip.startMs)
    if (!presentation) continue
    entries.push([clip.id, {
      instanceId: presentation.value.effectiveInstanceId,
      facts: showEditorClipSummaryFactsV2(presentation.value),
      animation: {
        instanceId: presentation.value.effectiveInstanceId,
        tracks: presentation.animation.tracks.map(track => track.editor),
      },
    }] as const)
  }
  for (const occurrence of record.composition.groupOccurrences) {
    const definition = record.composition.groupDefinitions
      .find(candidate => candidate.id === occurrence.definitionId)
    if (!definition) continue
    for (const child of definition.clips) {
      const localStartMs = occurrenceBoundaryAfter(occurrence, child.startMs)
      const presentation = groupOccurrencePresentation(record, occurrence, localStartMs)?.clipsById[child.id]
      if (!presentation) continue
      // The caption describes where this occurrence actually draws, so the
      // occurrence's translation composes onto the definition's local position
      // exactly as v1's materialization does. The inspector keeps the authored
      // definition-local value.
      entries.push([`${occurrence.id}:${child.id}`, {
        instanceId: presentation.value.effectiveInstanceId,
        facts: translatedSummaryFacts(showEditorClipSummaryFactsV2(presentation.value), occurrence),
        animation: {
          instanceId: presentation.value.instanceId,
          tracks: presentation.animation.tracks
            .map(track => translatedEditorTrack(track.editor, occurrence)),
        },
      }] as const)
    }
  }
  return Object.fromEntries(entries)
}

/**
 * The Zone Layout switch one authored-v2 Layout occurrence performs on entry.
 *
 * An occurrence's `incomingTransfer` is unambiguously v1's routing Transition:
 * both name a destination Zone Layout, a transfer duration, easing and
 * direction, and the editor opens the same routing panel for each. This is a
 * different question from which panel a Clip-level Transition belongs to.
 */
export interface ShowEditorRoutingTransferPresentationV2 {
  id: string
  occurrenceId: string
  /** Destination-time and Pattern identity, in the existing boundary vocabulary. */
  boundaryIdentity: string
  layoutId: string
  durationMs: number
  easing: ShowTransitionEasing
  direction: ShowRoutingDirection
  /** False when the record stores no direction and `direction` is the default. */
  directionAuthored: boolean
  /** v1 bounds the duration field by the destination Scene's length. */
  maxDurationMs: number
  layoutOptions: Array<{ id: string; name: string }>
}

export function projectShowEditorRoutingTransfersV2(
  record: ShowRecordV2,
): Record<string, ShowEditorRoutingTransferPresentationV2> {
  const layoutOptions = record.zoneLayouts.map(layout => ({ id: layout.id, name: layout.name }))
  const ordered = [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  return Object.fromEntries(ordered.flatMap((occurrence, index) => {
    // A converted zero-duration switch is the same routing event v1 selects at
    // that boundary; it simply owns no timed transfer object (#1065). v1 stores
    // no direction for one, and its panel reports `directionAuthored: false`.
    // A native Cut owns neither, so it gets a display identity too (#1066).
    const routing = occurrence.incomingTransfer
      ? {
          id: occurrence.incomingTransfer.id,
          durationMs: occurrence.incomingTransfer.durationMs,
          easing: occurrence.incomingTransfer.easing,
          direction: occurrence.incomingTransfer.direction as ShowRoutingDirection | undefined,
        }
      : occurrence.incomingSwitch
        ? {
            id: occurrence.incomingSwitch.id,
            durationMs: 0,
            easing: occurrence.incomingSwitch.easing,
            direction: occurrence.incomingSwitch.direction,
          }
        : index === 0
          ? undefined
          : {
              id: `layout-cut:${occurrence.id}`,
              durationMs: 0,
              easing: undefined,
              direction: undefined,
            }
    if (!routing) return []
    return [[routing.id, {
      id: routing.id,
      occurrenceId: occurrence.id,
      boundaryIdentity: formatShowBoundaryIdentity(
        occurrence.startMs,
        incomingPatternNamesAtV2(record, occurrence.startMs),
      ),
      layoutId: occurrence.layoutId,
      durationMs: routing.durationMs,
      easing: routing.easing ?? { curve: 'linear' },
      direction: routing.direction ?? 'forward',
      directionAuthored: routing.direction !== undefined,
      maxDurationMs: occurrence.durationMs,
      layoutOptions: layoutOptions.map(option => ({ ...option })),
    } satisfies ShowEditorRoutingTransferPresentationV2] as const]
  }))
}

/**
 * Pattern names of the Clips that begin at one instant, in the order v1's
 * boundary identity reads them: Zone order, then base Layer before overlays.
 * Group children count, because v1 reads the unified timeline, which
 * materializes every Group occurrence before looking for that start time.
 */
function incomingPatternNamesAtV2(record: ShowRecordV2, atMs: number): string[] {
  const groupChildren = record.composition.groupOccurrences.flatMap(occurrence => {
    const definition = record.composition.groupDefinitions
      .find(candidate => candidate.id === occurrence.definitionId)
    if (!definition) return []
    return definition.clips.flatMap(child => {
      const layerId = occurrence.layerBindings
        .find(binding => binding.definitionLayerId === child.layerId)?.layerId
      if (!layerId) return []
      const effectiveInstanceId = occurrence.instanceBindings?.[child.instanceId]
        ?? defaultGroupRuntimeIdV2(definition.id, child.instanceId)
      const instance = record.composition.patternInstances
        .find(candidate => candidate.id === effectiveInstanceId)
        ?? definition.patternInstances.find(candidate => candidate.id === child.instanceId)
      return [{
        id: `${occurrence.id}:${child.id}`,
        layerId,
        startMs: occurrenceBoundaryAfter(occurrence, child.startMs),
        patternName: instance?.patternName ?? effectiveInstanceId,
      }]
    })
  })
  const ordinary = record.composition.clips.map(clip => ({
    id: clip.id,
    layerId: clip.layerId,
    startMs: clip.startMs,
    patternName: record.composition.patternInstances
      .find(instance => instance.id === clip.instanceId)?.patternName ?? clip.instanceId,
  }))
  const items = [...ordinary, ...groupChildren]
  return record.zones.flatMap(zone => record.composition.layers
    .filter(layer => layer.zoneId === zone.id)
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
    .flatMap(layer => items
      .filter(item => item.layerId === layer.id && item.startMs === atMs)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(item => item.patternName)))
}

/** One Zone as the existing Zone Map lists it. */
export interface ShowEditorZoneMapEntryV2 {
  zone: ShowZone
  /** Resolved physical count the Installation map shows under the name. */
  pixelCount: number
}

/**
 * The Zone Map's reads for one authored-v2 Show: the same Zones, colours, names
 * and resolved pixel counts the v1 map lists from its record (#1065).
 */
export function projectShowEditorZoneMapV2(record: ShowRecordV2): {
  installation: boolean
  entries: ShowEditorZoneMapEntryV2[]
} {
  const routingRecord = {
    outputContract: record.outputContract,
    zones: record.zones,
    routingLayouts: record.zoneLayouts,
  }
  return {
    installation: record.outputContract?.kind === 'installation',
    entries: record.zones.map(zone => ({
      zone: structuredClone(zone),
      pixelCount: resolveShowZonePixelCount(routingRecord, zone.id)?.pixelCount ?? zone.nominalPixelCount,
    })),
  }
}

/**
 * Compose one Group occurrence's translation onto a child's displayed position,
 * the way `materializedPlacement` does on v1: the definition authors a local
 * position, the occurrence moves the whole Group, and the Clip draws at the sum.
 */
function translatedSummaryFacts(
  facts: ReturnType<typeof showEditorClipSummaryFactsV2>,
  occurrence: ShowGroupOccurrenceV2,
): ReturnType<typeof showEditorClipSummaryFactsV2> {
  return {
    ...facts,
    transform: {
      ...facts.transform,
      positionX: facts.transform.positionX + occurrence.translationX,
      positionY: facts.transform.positionY + occurrence.translationY,
    },
    ...(facts.viewport.enabled
      ? {
        viewport: {
          ...facts.viewport,
          x: facts.viewport.x + occurrence.translationX,
          y: facts.viewport.y + occurrence.translationY,
        },
      }
      : {}),
  }
}

/** The same translation applied to an animated position's values (#666 ranges). */
function translatedEditorTrack(
  track: ShowPropertyAnimationTrack,
  occurrence: ShowGroupOccurrenceV2,
): ShowPropertyAnimationTrack {
  const offset = translationForTarget(track.target, occurrence)
  if (offset === 0) return track
  return {
    ...track,
    keyframes: track.keyframes.map(keyframe => ({ ...keyframe, value: keyframe.value + offset })),
  }
}

function translationForTarget(
  target: ShowPropertyAnimationTrack['target'],
  occurrence: ShowGroupOccurrenceV2,
): number {
  if (target.kind === 'placement-transform') {
    if (target.property === 'positionX') return occurrence.translationX
    if (target.property === 'positionY') return occurrence.translationY
  }
  if (target.kind === 'placement-viewport') {
    if (target.property === 'x') return occurrence.translationX
    if (target.property === 'y') return occurrence.translationY
  }
  return 0
}

/** One side of a boundary, in the vocabulary the existing panel's fields read. */
export interface ShowBoundaryTransitionSideValue {
  /** Authored Clip identity; a write callback names this, never a generated id. */
  id: string
  /** Identity the caller's Pattern-control lookup is keyed by. */
  controlSourceId: string
  /** The Pattern reference the existing panel compares for compatibility. */
  patternKey: string
  adaptations: Record<ShowAutomatableProperty, number>
  transform: ShowClipTransform
  controlTargets: Record<string, number>
}

export interface ShowBoundaryTransitionDestinationValue extends ShowBoundaryTransitionSideValue {
  zoneId: string
  zoneName: string
  /** Absent when nothing on this Zone hands over into the destination. */
  outgoing?: ShowBoundaryTransitionSideValue
}

/**
 * Everything the existing boundary Transition inspector draws, with no record
 * ownership: the v1 adapter resolves it from its Scenes and ShowCells, and the
 * authored-v2 reader resolves it from Clips, Pattern instances and Layout
 * occurrences. Neither one hands the panel a Show.
 */
export interface ShowBoundaryTransitionInspectorValue {
  id: string
  /** Destination time and Pattern identity, in the existing vocabulary. */
  boundaryIdentity: string
  /** v2 only: where the incoming side starts, the time its timeline section boundary sits at. */
  destinationStartMs?: number
  /** v2 only: the authored Transition cannot carry speed or brightness ramps through the flat route. */
  clipValueRampsUnavailable?: boolean
  settings: ShowTransitionSettingsCarrier
  destinations: ShowBoundaryTransitionDestinationValue[]
  /** Repeat scale on each side; absent where v1 draws no destination. */
  repeat?: { from: number; to: number }
  /** Split position on each side; absent unless a split Layout exists. */
  split?: { from: number; to: number }
}

/**
 * Which of v1's two Transition surfaces owns a junction (#1065).
 *
 * v1 keeps Scene-boundary Transitions and Layer Transitions in two collections
 * and edits them through two surfaces. Conversion records that family in
 * `origin`, so a converted Transition is routed by what v1 actually authored.
 * A native record carries no `origin` and makes no retroactive claim about one:
 * whole-output ownership is the boundary surface, and participant scope is the
 * Layer surface. Nothing is inferred from an id, a kind or a duration.
 */
function isBoundaryFamilyTransitionV2(transition: ShowTransitionV2): boolean {
  if (transition.origin === 'converted-boundary-transition') return true
  if (transition.origin === 'converted-layer-transition') return false
  return transition.wholeOutput !== undefined
}

function boundarySideValue(
  record: ShowRecordV2,
  clip: ShowClipV2,
): ShowBoundaryTransitionSideValue | null {
  const instance = record.composition.patternInstances.find(candidate => candidate.id === clip.instanceId)
  if (!instance) return null
  // A Clip's adaptations are constant across the boundary in v1, so both sides
  // are read where that Clip begins rather than at the playhead.
  const appearance = heldAppearance(clip, clip.startMs)
  return {
    id: clip.id,
    controlSourceId: instance.id,
    patternKey: `${instance.pattern.kind}:${instance.pattern.id}`,
    adaptations: {
      timeScale: instance.time.timeScale,
      brightness: appearance.value.view.brightness,
    },
    transform: normalizeShowClipTransform(appearance.value.transform),
    controlTargets: structuredClone(instance.controlTargets ?? {}),
  }
}

function splitPositionAt(record: ShowRecordV2, atMs: number): number {
  const occurrence = record.composition.layoutOccurrences
    .find(candidate => candidate.startMs <= atMs && atMs < candidate.startMs + candidate.durationMs)
  return occurrence?.parameters.splitPosition ?? 0.5
}

/**
 * The authored-v2 reads behind the existing boundary Transition inspector.
 * Only the boundary family appears: a Layer-family Transition keeps v1's
 * junction popover instead. The projection is read-only and mints no identity.
 */
export function projectShowEditorBoundaryTransitionsV2(
  record: ShowRecordV2,
): Record<string, ShowBoundaryTransitionInspectorValue> {
  const flatLoweringEligible = showV2FlatLoweringEligible(record)
  const clipsById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  const zoneOrder = new Map(record.zones.map((zone, index) => [zone.id, index]))
  const hasSplitLayout = record.zoneLayouts.some(layout => (
    layout.logical?.kind === 'split' || layout.logical?.kind === 'soft-split'
  ))
  return Object.fromEntries(record.composition.transitions.flatMap(transition => {
    if (!isBoundaryFamilyTransitionV2(transition)) return []
    const fromClips = (transition.wholeOutput
      ? transition.wholeOutput.fromClipIds
      : transition.participants.map(participant => participant.fromClipId))
      .flatMap(id => clipsById.get(id) ?? [])
    const toClips = (transition.wholeOutput
      ? transition.wholeOutput.toClipIds
      : transition.participants.map(participant => participant.toClipId))
      .flatMap(id => clipsById.get(id) ?? [])
    // A one-sided whole-output boundary (#1068) names no contributor on its
    // empty side, so contributor extents cannot supply the window there. The
    // Transition's own recorded window is authoritative instead: validation
    // pins every contributor edge to wholeOutput.startMs and
    // startMs + durationMs. A participant-scope Transition always names both
    // endpoints, so an empty side there is invalid and still drops.
    if (toClips.length === 0 && transition.wholeOutput === undefined) return []
    const destinationStartMs = toClips.length > 0
      ? Math.min(...toClips.map(clip => clip.startMs))
      : transition.wholeOutput!.startMs + transition.durationMs
    // A held scalar is read where the handover happens, not where the outgoing
    // Clip began: that Clip can start long before the value it hands over. The
    // authored boundary start is the whole-output start, or the instant the
    // outgoing Clips end. Held keys sit at the destination start, so reading at
    // the boundary start needs no epsilon to stay on the outgoing side.
    const boundaryStartMs = transition.wholeOutput?.startMs
      ?? (fromClips.length > 0
        ? Math.max(...fromClips.map(clip => clip.startMs + clip.durationMs))
        : destinationStartMs - transition.durationMs)
    const destinations = [...toClips]
      .sort((left, right) => (
        (zoneOrder.get(left.zoneId) ?? 0) - (zoneOrder.get(right.zoneId) ?? 0)
        || left.id.localeCompare(right.id)
      ))
      .flatMap(clip => {
        const side = boundarySideValue(record, clip)
        if (!side) return []
        // v1 pairs the destination with whatever covers the outgoing side of
        // the same Zone. The same Layer is preferred, because that is the pair
        // a participant names and the pair a junction draws.
        const candidates = fromClips.filter(candidate => candidate.zoneId === clip.zoneId)
        const outgoingClip = candidates.find(candidate => candidate.layerId === clip.layerId) ?? candidates[0]
        const outgoing = outgoingClip ? boundarySideValue(record, outgoingClip) : null
        return [{
          zoneId: clip.zoneId,
          zoneName: record.zones.find(zone => zone.id === clip.zoneId)?.name ?? clip.zoneId,
          ...side,
          ...(outgoing ? { outgoing } : {}),
        } satisfies ShowBoundaryTransitionDestinationValue]
      })
    const { participants: _participants, wholeOutput: _wholeOutput, propertyRamps: _ramps, origin: _origin, ...stored } = transition
    // Project only the scalar and incoming Clip value ramps this panel edits.
    const ramps = scalarBoundaryRamps({
      ...transition,
      propertyRamps: transition.propertyRamps.filter(ramp => (
        ramp.target.kind === 'show-repeat-scale' || ramp.target.kind === 'layout-occurrence-split-position'
      )),
    })
    const propertyTransitions: NonNullable<ShowTransitionSettingsCarrier['propertyTransitions']> = { ...(ramps ?? {}) }
    for (const ramp of transition.propertyRamps.filter(isShowTransitionClipValueRampV2)) {
      const participant = ramp.participantId !== undefined
        ? transition.participants.find(candidate => candidate.id === ramp.participantId)
        : transition.participants.length === 1 ? transition.participants[0] : undefined
      const incoming = participant && clipsById.get(participant.toClipId)
      if (!incoming) continue
      const property = ramp.target.kind === 'instance-time-scale' && ramp.target.instanceId === incoming.instanceId
        ? 'timeScale'
        : ramp.target.kind === 'clip-view' && ramp.target.clipId === incoming.id && ramp.target.property === 'brightness'
          ? 'brightness'
          : undefined
      if (!property) continue
      const previous = propertyTransitions[property]
      propertyTransitions[property] = {
        fromByCellId: { ...(previous?.fromByCellId ?? {}), [incoming.id]: ramp.from },
        ...(ramp.durationMs !== undefined ? { durationMs: ramp.durationMs } : {}),
        ...(ramp.easing !== undefined ? { easing: structuredClone(ramp.easing) } : {}),
      }
    }
    return [[transition.id, {
      id: transition.id,
      boundaryIdentity: formatShowBoundaryIdentity(
        destinationStartMs,
        incomingPatternNamesAtV2(record, destinationStartMs),
      ),
      destinationStartMs,
      clipValueRampsUnavailable: !flatLoweringEligible || transition.wholeOutput !== undefined || transition.participants.length !== 1,
      settings: {
        ...structuredClone(stored),
        ...(Object.keys(propertyTransitions).length > 0 ? { propertyTransitions } : {}),
      },
      destinations,
      repeat: { from: repeatScaleAt(record, boundaryStartMs), to: repeatScaleAt(record, destinationStartMs) },
      ...(hasSplitLayout
        ? { split: { from: splitPositionAt(record, boundaryStartMs), to: splitPositionAt(record, destinationStartMs) } }
        : {}),
    } satisfies ShowBoundaryTransitionInspectorValue] as const]
  }))
}
