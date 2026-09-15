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
import type { ShowCompileRecipeSourceLookup } from './showModel'
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

/**
 * Derive transient v1 compiler sections solely from authored global-time v2
 * entities. This adapter is not connected to production persistence or decode.
 */
export function lowerShowCompositionV2ForCompile(
  record: ShowRecordV2,
  lookup: ShowCompileRecipeSourceLookup,
): LoweredShowCompositionV2 {
  const issue = validateShowRecordV2(record)[0]
  if (issue) throw new Error(`Show composition v2 ${issue.path}: ${issue.message}`)
  const composition = record.composition
  if (composition.layoutOccurrences.length !== 1) {
    throw new Error('Show composition v2 lowering currently requires one full-Show Layout occurrence.')
  }
  if (composition.groupDefinitions.length > 0 || composition.groupOccurrences.length > 0) {
    throw new Error('Show composition v2 lowering requires Group materialization evidence before compilation.')
  }
  if (composition.transitions.length > 0 && composition.clips.some(clip => clip.appearance.keys.length > 1)) {
    throw new Error('Show composition v2 lowering cannot preserve multi-key Clip appearance with Transitions.')
  }
  if (composition.clips.some(clip => clip.entryPolicy === 'restart')) {
    throw new Error('Show composition v2 lowering requires Restart lifecycle evidence before compilation.')
  }
  if (composition.transitions.some(transition => transition.participants.length !== 1)) {
    throw new Error('Show composition v2 lowering requires one participant per Transition until shared-scope parity is proved.')
  }
  if (hasCoincidentPositiveTransitionWindows(record)) {
    throw new Error('Show composition v2 lowering cannot compile coincident positive Transition windows without independent render targets.')
  }
  if (composition.transitions.some(transition => transition.propertyRamps.length > 0)) {
    throw new Error('Show composition v2 lowering requires Transition property-ramp compiler evidence before compilation.')
  }
  if (composition.transitions.length > 0 && composition.propertyTracks.length > 0) {
    throw new Error('Show composition v2 lowering requires positive-Transition property-track activation evidence before compilation.')
  }
  if (composition.transitions.some(transition => transition.kind === 'cut')) {
    throw new Error('Show composition v2 lowering cannot preserve explicit Cut identity in the implicit v1 Layer-transition form.')
  }
  if (composition.clips.some(clip => clip.zoneSampleMode !== 'span')
    && !(composition.executionModel === 'continuous' && canLowerToFlat(record))) {
    throw new Error('Show composition v2 lowering requires repeat-mode Clip sampling evidence before compilation.')
  }
  if (composition.executionModel === 'continuous' && canLowerToFlat(record)) {
    return lowerContinuousToFlat(record, lookup)
  }
  if (composition.transitions.length === 0) {
    return lowerGlobalClipsToSections(record, lookup)
  }

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
      .map(clip => lowerMainClip(clip))
    const overlays: ShowOverlayLayer[] = layers
      .filter(layer => layer.rank > 0)
      .sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id))
      .map(layer => ({
        id: layer.id,
        name: layer.name,
        placements: composition.clips
          .filter(clip => clip.zoneId === zone.id && clip.layerId === layer.id)
          .map(clip => lowerOverlayClip(clip)),
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
  const show: ShowRecord = {
    id: record.id,
    name: record.name,
    scenes: [{
      id: sectionId,
      name: record.name,
      durationMs: composition.showEndMs,
      ...(composition.layoutOccurrences[0].parameters.splitPosition !== undefined
        ? { routingTargets: { splitPosition: composition.layoutOccurrences[0].parameters.splitPosition } }
        : {}),
      ...(composition.sampleRemap.repeatScale !== 1
        ? { sampleTargets: { repeatScale: composition.sampleRemap.repeatScale } }
        : {}),
    }],
    zones: structuredClone(record.zones),
    cells: [],
    routingLayouts: selectedLayoutFirst(record),
    transitions: [],
    ...(record.targetControllerProfileId !== undefined ? { targetControllerProfileId: record.targetControllerProfileId } : {}),
    ...(record.stageMapId !== undefined ? { stageMapId: record.stageMapId } : {}),
    outputContract: structuredClone(record.outputContract),
    composition: v1Composition,
    ...(record.outputEffects !== undefined ? { outputEffects: structuredClone(record.outputEffects) } : {}),
    ...(record.importMetadata !== undefined ? { importMetadata: structuredClone(record.importMetadata) } : {}),
    updatedAt: record.updatedAt,
  }
  return { show, lookup: structuredClone(lookup) }
}

function lowerGlobalClipsToSections(
  record: ShowRecordV2,
  lookup: ShowCompileRecipeSourceLookup,
): LoweredShowCompositionV2 {
  const composition = record.composition
  const boundaries = [...new Set([
    0,
    composition.showEndMs,
    ...composition.clips.flatMap(clip => [
      clip.startMs,
      clip.startMs + clip.durationMs,
      ...clip.appearance.keys.map(key => key.timeMs),
    ]),
    ...composition.propertyTracks.flatMap(track => [
      track.activeStartMs,
      track.activeStartMs + track.activeDurationMs,
    ]),
  ])].filter(timeMs => timeMs >= 0 && timeMs <= composition.showEndMs)
    .sort((left, right) => left - right)
  const sections = boundaries.slice(0, -1).map((startMs, index) => ({
    id: `v2-section:${index}`,
    startMs,
    endMs: boundaries[index + 1],
  }))
  const trackSection = new Map<string, number>()
  for (const track of composition.propertyTracks) {
    const activeEndMs = track.activeStartMs + track.activeDurationMs
    const index = sections.findIndex(section => (
      track.activeStartMs === section.startMs && activeEndMs === section.endMs
    ))
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
        .map(clip => lowerClipSection(clip, section, false))
      const overlays: ShowOverlayLayer[] = layers
        .filter(layer => layer.rank > 0)
        .sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id))
        .map(layer => ({
          id: `${layer.id}@${section.id}`,
          name: layer.name,
          placements: composition.clips
            .filter(clip => clip.zoneId === zone.id && clip.layerId === layer.id && overlaps(clip, section))
            .map(clip => lowerClipSection(clip, section, true)),
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
  const show: ShowRecord = {
    id: record.id,
    name: record.name,
    scenes: sections.map((section, index) => ({
      id: section.id,
      name: `Section ${index + 1}`,
      durationMs: section.endMs - section.startMs,
      ...(composition.layoutOccurrences[0].parameters.splitPosition !== undefined
        ? { routingTargets: { splitPosition: composition.layoutOccurrences[0].parameters.splitPosition } }
        : {}),
      ...(composition.sampleRemap.repeatScale !== 1
        ? { sampleTargets: { repeatScale: composition.sampleRemap.repeatScale } }
        : {}),
    })),
    zones: structuredClone(record.zones),
    cells: [],
    routingLayouts: selectedLayoutFirst(record),
    transitions: [],
    ...(record.targetControllerProfileId !== undefined ? { targetControllerProfileId: record.targetControllerProfileId } : {}),
    ...(record.stageMapId !== undefined ? { stageMapId: record.stageMapId } : {}),
    outputContract: structuredClone(record.outputContract),
    composition: v1Composition,
    ...(record.outputEffects !== undefined ? { outputEffects: structuredClone(record.outputEffects) } : {}),
    ...(record.importMetadata !== undefined ? { importMetadata: structuredClone(record.importMetadata) } : {}),
    updatedAt: record.updatedAt,
  }
  return { show, lookup: structuredClone(lookup) }
}

type DerivedSection = { id: string; startMs: number; endMs: number }

function overlaps(clip: ShowClipV2, section: DerivedSection): boolean {
  return clip.startMs < section.endMs && clip.startMs + clip.durationMs > section.startMs
}

function lowerClipSection(clip: ShowClipV2, section: DerivedSection, overlay: false): ShowMainPlacement
function lowerClipSection(clip: ShowClipV2, section: DerivedSection, overlay: true): ShowOverlayPlacement
function lowerClipSection(
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
    instanceId: clip.instanceId,
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
  const composition = record.composition
  return composition.transitions.length === 0
    && composition.propertyTracks.length === 0
    && composition.layers.every(layer => layer.rank === 0)
    && composition.clips.every(clip => clip.appearance.keys.length === 1 && clip.appearance.keys[0].value.opacity === 1)
    && composition.clips.every(clip => clip.zoneSampleMode === 'independent')
}

function lowerContinuousToFlat(
  record: ShowRecordV2,
  lookup: ShowCompileRecipeSourceLookup,
): LoweredShowCompositionV2 {
  const composition = record.composition
  const boundaries = [...new Set([
    0,
    composition.showEndMs,
    ...composition.clips.flatMap(clip => [clip.startMs, clip.startMs + clip.durationMs]),
  ])].sort((left, right) => left - right)
  const scenes = boundaries.slice(0, -1).map((startMs, index) => ({
    id: `v2-flat-section:${index}`,
    name: composition.markers.find(marker => marker.timeMs === startMs)?.name ?? `Section ${index + 1}`,
    durationMs: boundaries[index + 1] - startMs,
  }))
  const sceneIndexByStart = new Map(boundaries.slice(0, -1).map((startMs, index) => [startMs, index]))
  const instanceById = new Map(composition.patternInstances.map(instance => [instance.id, instance]))
  const byCellId: Record<string, string> = {}
  const cells = composition.clips.map((clip): ShowCell => {
    const appearance = clip.appearance.keys[0].value
    const instance = instanceById.get(clip.instanceId)!
    const startIndex = sceneIndexByStart.get(clip.startMs)!
    const endIndex = boundaries.indexOf(clip.startMs + clip.durationMs)
    const source = lookup.byPatternInstanceId?.[instance.id]
    if (!source) throw new Error(`Show composition v2 requires exact Pattern source for instance "${instance.id}".`)
    byCellId[clip.id] = source
    return {
      id: clip.id,
      zoneId: clip.zoneId,
      sceneId: scenes[startIndex].id,
      sceneSpan: endIndex - startIndex,
      pattern: structuredClone(instance.pattern),
      patternName: instance.patternName,
      evaluationPolicy: instance.evaluationPolicy,
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
  return {
    show: {
      id: record.id,
      name: record.name,
      scenes,
      zones: structuredClone(record.zones),
      cells,
      routingLayouts: selectedLayoutFirst(record),
      transitions: [],
      ...(record.targetControllerProfileId !== undefined ? { targetControllerProfileId: record.targetControllerProfileId } : {}),
      ...(record.stageMapId !== undefined ? { stageMapId: record.stageMapId } : {}),
      outputContract: structuredClone(record.outputContract),
      ...(record.outputEffects !== undefined ? { outputEffects: structuredClone(record.outputEffects) } : {}),
      ...(record.importMetadata !== undefined ? { importMetadata: structuredClone(record.importMetadata) } : {}),
      updatedAt: record.updatedAt,
    },
    lookup: { ...structuredClone(lookup), byCellId },
  }
}

function hasCoincidentPositiveTransitionWindows(record: ShowRecordV2): boolean {
  const clipById = new Map(record.composition.clips.map(clip => [clip.id, clip]))
  const windows = record.composition.transitions.map(transition => {
    const participant = transition.participants[0]
    const from = clipById.get(participant.fromClipId)!
    return { id: transition.id, startMs: from.startMs + from.durationMs, endMs: from.startMs + from.durationMs + transition.durationMs }
  })
  return windows.some((left, index) => windows.slice(index + 1).some(right => (
    left.id !== right.id && left.startMs < right.endMs && right.startMs < left.endMs
  )))
}

function selectedLayoutFirst(record: ShowRecordV2) {
  const selectedId = record.composition.layoutOccurrences[0].layoutId
  return structuredClone(record.zoneLayouts).sort((left, right) => (
    Number(right.id === selectedId) - Number(left.id === selectedId)
  ))
}

function lowerMainClip(clip: ShowClipV2): ShowMainPlacement {
  const appearance = clip.appearance.keys[0].value
  return {
    id: clip.id,
    instanceId: clip.instanceId,
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

function lowerOverlayClip(clip: ShowClipV2): ShowOverlayPlacement {
  return { ...lowerMainClip(clip), opacity: clip.appearance.keys[0].value.opacity }
}

function lowerPropertyTarget(target: ShowPropertyTargetV2): ShowPropertyAnimationTarget {
  if (target.kind === 'instance-time-scale' || target.kind === 'instance-control') return structuredClone(target)
  if (target.kind === 'clip-opacity') return { kind: 'placement-opacity', placementId: target.clipId }
  if (target.kind === 'clip-view') return { kind: 'placement-view', placementId: target.clipId, property: target.property }
  if (target.kind === 'clip-transform') return { kind: 'placement-transform', placementId: target.clipId, property: target.property }
  if (target.kind === 'clip-aperture') return { kind: 'placement-viewport', placementId: target.clipId, property: target.property }
  if (target.kind === 'clip-effect') {
    return {
      kind: 'placement-effect',
      placementId: target.clipId,
      effectId: target.effectId,
      effectKind: target.effectKind,
      parameterId: target.parameterId,
    }
  }
  throw new Error(`Show composition v2 property target "${target.kind}" requires direct compiler support.`)
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
  const { participants: _participants, propertyRamps: _propertyRamps, ...settings } = structuredClone(transition)
  return settings
}
