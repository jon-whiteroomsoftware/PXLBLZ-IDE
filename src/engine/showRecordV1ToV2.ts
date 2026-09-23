import { convertGroupDefinition, convertGroupOccurrence, groupDefinitionPreserved } from './showGroupsV2'
import { materializeShowGroupLayerShells } from './showGroupModel'
import { clipAppearance, convertPropertyTarget } from './showV2ValueConversion'
import { repeatScaleAt, scalarBoundaryRamps } from './showV2ScalarProperties'
import type {
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowRecord,
  ShowRoutingLayout,
} from './personalContentRecords'
import { projectFlatShowToCompositionV1WithCellOrigins, validateShowComposition } from './showCompositionModel'
import { projectShowTimeline, showLoopDurationMs, type ShowCompileRecipeSourceLookup } from './showModel'
import {
  validateShowRecordV1Structure,
  validateShowRecordV2,
  type ShowClipV2,
  type ShowLayerV2,
  type ShowLayoutOccurrenceV2,
  type ShowMarkerV2,
  type ShowRecordV2,
  type ShowTransitionV2,
} from './showCompositionV2'

export type ShowV1ToV2IssueCode =
  | 'invalid-v1'
  | 'unknown-source-field'
  | 'unaccounted-source-field'
  | 'missing-source-dependency'
  | 'unsupported-boundary-transition'
  | 'unsupported-transition-track-activation'
  | 'unsupported-cut-identity'
  | 'unsupported-routing-change'
  | 'unsupported-effect-track-appearance'
  | 'ambiguous-layer'
  | 'divergent-clip-field'
  | 'discontinuous-logical-clip'
  | 'unsupported-group'
  | 'invalid-v2'

export interface ShowV1ToV2Issue {
  path: string
  code: ShowV1ToV2IssueCode
  message: string
}

export interface ShowV1ToV2AccountingEntry {
  sourcePath: string
  outcome: 'preserved' | 'mapped' | 'retired-source-structure' | 'retired-silent-runtime-use' | 'refused'
  targetPath?: string
}

export interface ShowV1ToV2Report {
  sourceShowId: string
  accounting: ShowV1ToV2AccountingEntry[]
  unaccountedSourcePaths: string[]
  sceneOffsets: Array<{ sceneId: string; startMs: number; endMs: number }>
  layerMappings: Array<{ sceneId: string; zoneId: string; sourceLayerId: string | 'main'; layerId: string }>
  clipMappings: Array<{ sourcePlacementIds: string[]; clipId: string }>
  splitLogicalClips: Array<{
    logicalClipId: string
    clipIds: string[]
    gaps: Array<{ startMs: number; endMs: number }>
    outcome: 'split-discontinuous-logical-clip'
  }>
  markerMappings: Array<{ sourceSceneId: string; markerId: string; timeMs: number }>
  flatProjectionMappings: Array<{ cellId: string; placementIds: string[]; patternInstanceIds: string[] }>
  retiredFlatCellShadows: Array<{
    sourceCellId: string
    sourcePath: string
    outcome: 'retired-composition-shadow'
  }>
  retiredSilentRuntimeUses: Array<{
    sourcePlacementId: string
    sourcePath: string
    instanceId: string
    zoneId: string
    startMs: number
    durationMs: number
    outcome: 'retired-silent-runtime-use'
  }>
  retiredStructuralCuts: Array<{
    sourceTransitionId: string
    afterSceneId: string
    atMs: number
    outcome: 'retired-structural-cut'
  }>
  retiredNoContributionPropertyTracks: Array<{
    sourceTrackId: string
    sourcePath: string
    outcome: 'retired-no-contribution-property-track'
  }>
}

export type ShowV1ToV2Result =
  | { status: 'converted'; record: ShowRecordV2; report: ShowV1ToV2Report }
  | { status: 'refused'; issues: ShowV1ToV2Issue[]; report: ShowV1ToV2Report }

interface PlacementSource {
  placement: ShowMainPlacement | ShowOverlayPlacement
  placementPath: string
  sceneId: string
  zoneId: string
  layerId: string
  globalStartMs: number
  zoneSampleMode: ShowClipV2['zoneSampleMode']
}

/**
 * Convert a v1 authored record into the provisional Scene-free shape.
 * Unsupported source domains return a complete accounting report and no candidate.
 */
export function convertShowRecordV1ToV2(
  show: ShowRecord,
  lookup?: ShowCompileRecipeSourceLookup,
): ShowV1ToV2Result {
  const issues: ShowV1ToV2Issue[] = []
  const report = emptyReport(show)
  const structuralIssues = validateShowRecordV1Structure(show)
  if (structuralIssues.length > 0) {
    return refused(show, report, structuralIssues.map(issue => ({
      path: issue.path,
      code: issue.message.includes('additional properties') ? 'unknown-source-field' : 'invalid-v1',
      message: issue.message,
    })))
  }
  let composition = show.composition
  let sourceShow = show
  const flatSampleModeByPlacementId = new Map<string, ShowClipV2['zoneSampleMode']>()
  if (!composition) {
    const missingCellId = show.cells.find(cell => !lookup || !Object.prototype.hasOwnProperty.call(lookup.byCellId, cell.id))?.id
    if (!lookup || missingCellId) {
      return refused(show, report, [{
        path: missingCellId ? `cells[${show.cells.findIndex(cell => cell.id === missingCellId)}].pattern` : 'composition',
        code: 'missing-source-dependency',
        message: missingCellId
          ? `Flat conversion requires the exact Pattern source for cell "${missingCellId}".`
          : 'Flat conversion requires an exact compiler source lookup.',
      }])
    }
    const projected = projectFlatShowToCompositionV1WithCellOrigins(show, lookup)
    composition = projected.composition
    const cellById = new Map(show.cells.map(cell => [cell.id, cell]))
    for (const scene of composition.scenes) {
      for (const zone of scene.zones) {
        for (const placement of [
          ...zone.main,
          ...zone.overlays.flatMap(layer => layer.placements),
        ]) {
          const cell = cellById.get(projected.sourceCellIdByPlacementId[placement.id])
          if (cell?.presentation !== undefined) placement.presentation = structuredClone(cell.presentation)
          if (cell?.blink !== undefined) placement.blink = structuredClone(cell.blink)
        }
      }
    }
    sourceShow = { ...show, composition }
    for (const cell of show.cells) {
      const placementIds = Object.entries(projected.sourceCellIdByPlacementId)
        .filter(([, cellId]) => cellId === cell.id)
        .map(([placementId]) => placementId)
      const patternInstanceIds = [...new Set(composition.scenes.flatMap(scene => scene.zones.flatMap(zone => [
        ...zone.main,
        ...zone.overlays.flatMap(layer => layer.placements),
      ])).filter(placement => placementIds.includes(placement.id)).map(placement => placement.instanceId))]
      report.flatProjectionMappings.push({ cellId: cell.id, placementIds, patternInstanceIds })
      const zoneSampleMode = cell.zoneMode ?? ((cell.zoneSpan ?? 1) === 1 ? 'independent' : 'span')
      for (const placementId of placementIds) flatSampleModeByPlacementId.set(placementId, zoneSampleMode)
    }
  } else {
    for (const [cellIndex, cell] of show.cells.entries()) {
      report.retiredFlatCellShadows.push({
        sourceCellId: cell.id,
        sourcePath: `cells.${cellIndex}`,
        outcome: 'retired-composition-shadow',
      })
    }
  }
  for (const issue of validateShowComposition(sourceShow, composition)) {
    issues.push({ path: `composition.${issue.path}`, code: 'invalid-v1', message: issue.message })
  }
  if ((composition.groupDefinitions ?? []).some(definition => definition.placements.some(clip => clip.logicalClipId !== undefined && clip.logicalClipId !== clip.id))) {
    issues.push({ path: 'composition.groupDefinitions', code: 'unsupported-group', message: 'Segmented Group logical Clips require separate conversion proof.' })
  }
  for (const zone of show.zones) composition = materializeShowGroupLayerShells(composition, zone.id)
  sourceShow = { ...sourceShow, composition }
  const routingChanges = show.transitions.filter(transition => transition.kind === 'routing')
  if (routingChanges.some(transition => !transition.layoutId || Object.keys(transition).some(key => !['id', 'afterSceneId', 'kind', 'layoutId', 'durationMs', 'easing', 'routingDirection'].includes(key)))) {
    issues.push({ path: 'transitions', code: 'unsupported-routing-change', message: 'Routing boundaries with additional carriers require separate preservation proof.' })
  }
  const visualBoundaries = show.transitions.filter(transition => transition.kind !== 'routing' && transition.kind !== 'cut')
  const timeline = projectShowTimeline(show)
  report.sceneOffsets = timeline.scenes.map(scene => ({
    sceneId: scene.sceneId,
    startMs: scene.startMs,
    endMs: scene.endMs,
  }))
  const sceneStartById = new Map(timeline.scenes.map(scene => [scene.sceneId, scene.startMs]))
  const sceneEndById = new Map(timeline.scenes.map(scene => [scene.sceneId, scene.endMs]))
  for (const [index, transition] of show.transitions.entries()) {
    if (transition.kind !== 'cut') continue
    const carrier = cutCarrierField(transition)
    if (carrier) {
      issues.push({
        path: `transitions[${index}].${carrier}`,
        code: 'unsupported-cut-identity',
        message: `Boundary Cut "${transition.id}" carries ${carrier}; the converter cannot retire that payload.`,
      })
      continue
    }
    report.retiredStructuralCuts.push({
      sourceTransitionId: transition.id,
      afterSceneId: transition.afterSceneId,
      atMs: sceneEndById.get(transition.afterSceneId) ?? 0,
      outcome: 'retired-structural-cut',
    })
  }
  const { layers, layerIdByOwner, pendingLayerNames } = convertLayers(sourceShow, report)
  const placementSources = collectPlacements(sourceShow, sceneStartById, layerIdByOwner, flatSampleModeByPlacementId)
  const showEndMs = showLoopDurationMs(show)
  const layoutOccurrences: ShowLayoutOccurrenceV2[] = []
  let activeLayoutId = show.routingLayouts[0]?.id ?? ''
  for (const [index, scene] of timeline.scenes.entries()) {
    const routing = routingChanges.find(transition => transition.afterSceneId === timeline.scenes[index - 1]?.sceneId)
    if (routing?.layoutId) activeLayoutId = routing.layoutId
    const startMs = routing ? timeline.scenes[index - 1].endMs : scene.startMs
    const parameters = scene.scene.routingTargets?.splitPosition === undefined ? {} : { splitPosition: scene.scene.routingTargets.splitPosition }
    const previous = layoutOccurrences[layoutOccurrences.length - 1]
    if (previous && !routing && previous.layoutId === activeLayoutId && (previous.parameters.splitPosition ?? 0.5) === (parameters.splitPosition ?? 0.5)) {
      previous.durationMs = (timeline.scenes[index + 1]?.startMs ?? showEndMs) - previous.startMs
      if (parameters.splitPosition !== undefined) previous.parameters.splitPosition = parameters.splitPosition
    } else {
      if (previous) previous.durationMs = startMs - previous.startMs
      layoutOccurrences.push({ id: `layout-occurrence:${layoutOccurrences.length + 1}`, layoutId: activeLayoutId, startMs, durationMs: (timeline.scenes[index + 1]?.startMs ?? showEndMs) - startMs, parameters,
        ...(routing && previous && routing.durationMs > 0 ? { incomingTransfer: { id: routing.id, fromOccurrenceId: previous.id, durationMs: routing.durationMs, direction: routing.routingDirection ?? 'forward', easing: structuredClone(routing.easing) } } : {}),
        // A zero-duration routing switch has no timed transfer object, so its
        // authored identity and settings survive as inert provenance instead
        // (#1065). Only what v1 authored is written: an absent
        // `routingDirection` stays absent rather than defaulting to 'forward'.
        ...(routing && previous && routing.durationMs === 0 ? { incomingSwitch: {
          origin: 'converted-routing-cut' as const,
          id: routing.id,
          fromOccurrenceId: previous.id,
          ...(routing.routingDirection !== undefined ? { direction: routing.routingDirection } : {}),
          ...(routing.easing !== undefined ? { easing: structuredClone(routing.easing) } : {}),
        } } : {}),
      })
    }
  }
  const clips = convertClips(
    placementSources,
    layoutOccurrences,
    show.routingLayouts,
    show.zones.map(zone => zone.id),
    issues,
    report,
  )
  resolvePendingLayerNames(
    layers,
    pendingLayerNames,
    sourceShow.composition!,
    layerIdByOwner,
    report,
    issues,
    placementSources.map(source => ({
      id: source.placement.id,
      instanceId: source.placement.instanceId,
      startMs: source.globalStartMs,
      durationMs: source.placement.durationMs,
      zoneId: source.zoneId,
    })),
    layoutOccurrences,
    show.routingLayouts,
    show.zones.map(zone => zone.id),
    new Set(composition.patternInstances.map(instance => instance.id)),
  )

  if (issues.length > 0) return refused(show, report, issues)

  const clipIdByPlacementId = new Map<string, string>()
  for (const mapping of report.clipMappings) {
    for (const placementId of mapping.sourcePlacementIds) clipIdByPlacementId.set(placementId, mapping.clipId)
  }
  const boundaryTransitions: ShowTransitionV2[] = []
  for (const boundary of visualBoundaries) {
    const atMs = sceneEndById.get(boundary.afterSceneId)
    const from = clips.filter(clip => clip.startMs + clip.durationMs === atMs)
    const to = clips.filter(clip => clip.startMs === (atMs ?? 0) + boundary.durationMs)
    // Either contributor side may be empty: a neighbouring Scene can contribute
    // no Clip in a Zone while the v1 editor still draws and compiles the boundary
    // Transition as a timed blend to or from Black (#1068). The empty side
    // converts as an explicitly empty contributor set, and validation still
    // requires each side to name every abutting Clip, so emptiness is exact.
    // A contributor spanning the window and any boundary carrier still refuse.
    if (clips.some(clip => !from.includes(clip) && !to.includes(clip) && clip.startMs < (atMs ?? 0) + boundary.durationMs && clip.startMs + clip.durationMs > (atMs ?? 0)) || (boundary.propertyTransitions !== undefined && !isScalarCarrier(boundary.propertyTransitions)) || boundary.layoutId || boundary.routingDirection) {
      issues.push({ path: 'transitions', code: 'unsupported-boundary-transition', message: 'Whole-boundary scope requires exact contributor sets without unrelated contribution or boundary carriers.' })
      continue
    }
    const { afterSceneId: _after, layoutId: _layout, routingDirection: _routing, propertyTransitions: _ramps, ...settings } = structuredClone(boundary)
    const needsWholeOutput = layoutOccurrences.length > 1 || show.scenes.some(scene => (scene.sampleTargets?.repeatScale ?? 1) !== (show.scenes[0]?.sampleTargets?.repeatScale ?? 1)) || boundary.propertyTransitions !== undefined || from.length !== 1 || to.length !== 1 || from[0].zoneId !== to[0].zoneId || from[0].layerId !== to[0].layerId || composition.scenes.some(scene => (scene.propertyTracks?.length ?? 0) > 0)
    boundaryTransitions.push({
      ...settings,
      kind: settings.kind as ShowTransitionV2['kind'],
      // v1 draws a Scene-boundary Transition in its own inspector, so the
      // family survives conversion even when the Transition lands at Layer
      // participant scope (#1065).
      origin: 'converted-boundary-transition',
      ...(needsWholeOutput ? { wholeOutput: { startMs: atMs!, fromClipIds: from.map(clip => clip.id), toClipIds: to.map(clip => clip.id) } } : {}),
      participants: needsWholeOutput ? [] : [{ id: `${boundary.id}:participant:1`, zoneId: from[0].zoneId, layerId: from[0].layerId, fromClipId: from[0].id, toClipId: to[0].id }],
      propertyRamps: [
        ...(boundary.propertyTransitions?.sample?.repeatScale ? [{ target: { kind: 'show-repeat-scale' as const }, ...structuredClone(boundary.propertyTransitions.sample.repeatScale) }] : []),
        ...(boundary.propertyTransitions?.routing?.splitPosition ? [{ target: { kind: 'layout-occurrence-split-position' as const, layoutOccurrenceId: layoutOccurrences.find(occurrence => occurrence.startMs <= atMs! + boundary.durationMs && occurrence.startMs + occurrence.durationMs > atMs! + boundary.durationMs)!.id }, ...structuredClone(boundary.propertyTransitions.routing.splitPosition) }] : []),
      ],
    })
  }
  if (issues.length > 0) return refused(show, report, issues)
  const markers: ShowMarkerV2[] = structuredClone(composition.markers ?? [])
  for (const scene of timeline.scenes) {
    const existing = markers.find(marker => marker.timeMs === scene.startMs && marker.name === scene.scene.name)
    if (existing) {
      // Absorption keeps the authored Marker's identity and color and promotes
      // only its role; a former Scene label never mints a duplicate guide.
      existing.role = 'chapter'
      report.markerMappings.push({ sourceSceneId: scene.sceneId, markerId: existing.id, timeMs: scene.startMs })
      continue
    }
    // Only a guide this conversion invented carries provenance, so the editor can
    // keep showing exactly the Markers the v1 editor drew (#1065).
    const markerId = uniqueId(`scene-marker:${scene.sceneId}`, new Set(markers.map(marker => marker.id)))
    markers.push({ id: markerId, timeMs: scene.startMs, name: scene.scene.name, role: 'chapter', origin: 'converted-scene-label' })
    report.markerMappings.push({ sourceSceneId: scene.sceneId, markerId, timeMs: scene.startMs })
  }
  markers.sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))

  const propertyTracks = composition.scenes.flatMap((scene, sceneIndex) => {
    const sceneStartMs = sceneStartById.get(scene.sceneId) ?? 0
    return (scene.propertyTracks ?? []).flatMap((track, trackIndex) => {
      const sourcePath = `composition.scenes[${sceneIndex}].propertyTracks[${trackIndex}]`
      const holdDurationMs = show.scenes.find(candidate => candidate.id === scene.sceneId)?.durationMs ?? 0
      if (holdDurationMs <= 0) {
        report.retiredNoContributionPropertyTracks.push({
          sourceTrackId: track.id,
          sourcePath,
          outcome: 'retired-no-contribution-property-track',
        })
        return []
      }
      const sourceIndex = show.scenes.findIndex(candidate => candidate.id === scene.sceneId)
      const incoming = visualBoundaries.find(boundary => boundary.afterSceneId === show.scenes[sourceIndex - 1]?.id)?.durationMs ?? 0
      const outgoing = visualBoundaries.find(boundary => boundary.afterSceneId === scene.sceneId)?.durationMs ?? 0
      const target = convertPropertyTarget(track.target, clipIdByPlacementId)
      // Legacy Scene evaluation applies one shared-instance track owner until
      // the following Scene becomes current. Incoming visual pre-roll uses the
      // outgoing owner's shared runtime values; admitting both Scene tracks in
      // that window would invent a last-writer conflict in v2.
      const instanceOwned = target.kind === 'instance-time-scale' || target.kind === 'instance-control'
      const activeStartMs = instanceOwned ? sceneStartMs : sceneStartMs - incoming
      const activeDurationMs = holdDurationMs + outgoing + (instanceOwned ? 0 : incoming)
      if (target.kind === 'clip-effect') {
        const clip = clips.find(candidate => candidate.id === target.clipId)
        const activeEndMs = activeStartMs + activeDurationMs
        const missingKey = clip?.appearance.keys.find((key, keyIndex) => {
          const keyEndMs = clip.appearance.keys[keyIndex + 1]?.timeMs ?? clip.startMs + clip.durationMs
          if (key.timeMs >= activeEndMs || keyEndMs <= activeStartMs) return false
          return !(key.value.effects ?? []).some(effect => effect.id === target.effectId && effect.kind === target.effectKind)
        })
        if (!clip || missingKey) {
          issues.push({
            path: `composition.scenes[${sceneIndex}].propertyTracks[${trackIndex}].target`,
            code: 'unsupported-effect-track-appearance',
            message: `Effect target "${target.effectId}" is not present with kind "${target.effectKind}" in every held appearance key of Clip "${target.clipId}".`,
          })
        }
      }
      return [{
        ...structuredClone(track),
        target,
        activeStartMs,
        activeDurationMs,
        keyframes: track.keyframes.map(keyframe => ({ ...structuredClone(keyframe), timeMs: sceneStartMs + keyframe.timeMs })),
      }]
    })
  })

  if (issues.length > 0) return refused(show, report, issues)

  const repeatKeys = timeline.scenes.map(scene => ({ timeMs: scene.startMs, value: scene.scene.sampleTargets?.repeatScale ?? 1 }))
    .filter((key, index, all) => index === 0 || key.value !== all[index - 1].value)
  if (repeatKeys.length > 1) {
    const id = uniqueId('show-repeat-scale:held', new Set(propertyTracks.map(track => track.id)))
    propertyTracks.push({ id, target: { kind: 'show-repeat-scale' }, activeStartMs: 0, activeDurationMs: showEndMs,
      keyframes: repeatKeys.map((key, index) => ({ ...key, id: `${id}:${index}`, easing: { curve: 'hold', at: 1 } })),
    })
  }

  const record: ShowRecordV2 = {
    version: 2,
    id: show.id,
    name: show.name,
    zones: structuredClone(show.zones),
    zoneLayouts: structuredClone(show.routingLayouts),
    ...(show.targetControllerProfileId !== undefined ? { targetControllerProfileId: show.targetControllerProfileId } : {}),
    ...(show.stageMapId !== undefined ? { stageMapId: show.stageMapId } : {}),
    outputContract: structuredClone(show.outputContract),
    composition: {
      version: 2,
      executionModel: composition.executionModel === 'deterministic-loop' ? 'deterministic-loop' : 'continuous',
      showEndMs,
      sampleRemap: {
        repeatScale: show.scenes[0]?.sampleTargets?.repeatScale ?? 1,
        // Conversion provenance (#1066): an explicitly authored repeat scale,
        // including an explicit 1, is otherwise indistinguishable from none.
        ...(show.scenes.some(scene => scene.sampleTargets?.repeatScale !== undefined)
          ? { origin: 'converted-authored-repeat-scale' as const }
          : {}),
      },
      patternInstances: structuredClone(composition.patternInstances),
      layers,
      clips,
      transitions: [...boundaryTransitions, ...(composition.transitions ?? []).map((transition) => ({
        ...transitionSettings(transition),
        // v1 edits a Layer Transition through its junction popover, never the
        // boundary inspector; the distinction is provenance, not structure.
        origin: 'converted-layer-transition' as const,
        participants: [{
          id: `${transition.id}:participant:1`,
          zoneId: placementSources.find(source => source.placement.id === transition.fromPlacementId)?.zoneId ?? '',
          layerId: placementSources.find(source => source.placement.id === transition.fromPlacementId)?.layerId ?? '',
          fromClipId: clipIdByPlacementId.get(transition.fromPlacementId) ?? '',
          toClipId: clipIdByPlacementId.get(transition.toPlacementId) ?? '',
        }],
        propertyRamps: [],
      }))],
      layoutOccurrences,
      propertyTracks,
      markers,
      groupDefinitions: (composition.groupDefinitions ?? []).map(convertGroupDefinition),
      groupOccurrences: [],
    },
    ...(show.outputEffects !== undefined ? { outputEffects: structuredClone(show.outputEffects) } : {}),
    ...(show.importMetadata !== undefined ? { importMetadata: structuredClone(show.importMetadata) } : {}),
    updatedAt: show.updatedAt,
  }

  record.composition.groupOccurrences = (composition.groupOccurrences ?? []).map(occurrence => convertGroupOccurrence(sourceShow, occurrence, record, sceneStartById.get(occurrence.sceneId)!, layerIdByOwner))

  for (const issue of validateShowRecordV2(record)) {
    issues.push({ path: issue.path, code: 'invalid-v2', message: issue.message })
  }
  if (issues.length > 0) return refused(show, report, issues)
  const audit = auditShowV1ToV2Accounting(show, record, report)
  report.accounting = audit.accounting
  report.unaccountedSourcePaths = audit.unaccountedSourcePaths
  if (audit.unaccountedSourcePaths.length > 0) {
    return {
      status: 'refused',
      issues: audit.unaccountedSourcePaths.map(path => ({
        path,
        code: 'unaccounted-source-field',
        message: `The v1 source leaf "${path}" has no verified v2 disposition.`,
      })),
      report,
    }
  }
  return { status: 'converted', record, report }
}

function transitionSettings(
  transition: NonNullable<NonNullable<ShowRecord['composition']>['transitions']>[number],
) {
  const {
    fromPlacementId: _fromPlacementId,
    toPlacementId: _toPlacementId,
    ...settings
  } = structuredClone(transition)
  return settings
}

function cutCarrierField(transition: ShowRecord['transitions'][number]): string | undefined {
  const structuralFields = new Set(['id', 'afterSceneId', 'kind', 'durationMs', 'easing'])
  return Object.keys(transition).find(field => !structuralFields.has(field))
}

interface PendingLayerName {
  layerId: string
  zoneId: string
  ordinal: number
  candidates: Array<{ sceneId: string; name: string; placementIds: string[] }>
}

/**
 * Divergent overlay ordinals collected from a shelled composition: one entry
 * per Zone ordinal whose Scene-local layers disagree on the name. The global
 * layer id is deterministic from Zone and rank, so conversion and the
 * accounting audit derive identical entries from the identical shelled
 * composition.
 */
function collectPendingLayerNames(
  zones: ShowRecord['zones'],
  composition: NonNullable<ShowRecord['composition']>,
): PendingLayerName[] {
  const pending: PendingLayerName[] = []
  for (const zone of zones) {
    const zoneRows = composition.scenes.flatMap(scene => {
      const zoneComposition = scene.zones.find(candidate => candidate.zoneId === zone.id)
      return zoneComposition ? [{ sceneId: scene.sceneId, overlays: zoneComposition.overlays }] : []
    })
    const maxOverlays = Math.max(0, ...zoneRows.map(row => row.overlays.length))
    for (let ordinal = 0; ordinal < maxOverlays; ordinal += 1) {
      const present = zoneRows.flatMap(row => row.overlays[ordinal] ? [{ sceneId: row.sceneId, layer: row.overlays[ordinal] }] : [])
      if (new Set(present.map(entry => entry.layer.name)).size > 1) {
        const rank = maxOverlays - ordinal
        pending.push({
          layerId: `layer:${zone.id}:overlay:${rank}`,
          zoneId: zone.id,
          ordinal,
          candidates: present.map(entry => ({ sceneId: entry.sceneId, name: entry.layer.name, placementIds: entry.layer.placements.map(placement => placement.id) })),
        })
      }
    }
  }
  return pending
}

function convertLayers(
  show: ShowRecord,
  report: ShowV1ToV2Report,
): { layers: ShowLayerV2[]; layerIdByOwner: Map<string, string>; pendingLayerNames: PendingLayerName[] } {
  const layers: ShowLayerV2[] = []
  const layerIdByOwner = new Map<string, string>()
  const pendingLayerNames = collectPendingLayerNames(show.zones, show.composition!)
  for (const zone of show.zones) {
    const mainId = `layer:${zone.id}:main`
    layers.push({ id: mainId, zoneId: zone.id, name: 'Main', rank: 0 })
    for (const scene of show.composition!.scenes) {
      if (scene.zones.some(candidate => candidate.zoneId === zone.id)) {
        layerIdByOwner.set(`${scene.sceneId}:${zone.id}:main`, mainId)
        report.layerMappings.push({ sceneId: scene.sceneId, zoneId: zone.id, sourceLayerId: 'main', layerId: mainId })
      }
    }
    const zoneRows = show.composition!.scenes.flatMap(scene => {
      const zoneComposition = scene.zones.find(candidate => candidate.zoneId === zone.id)
      return zoneComposition ? [{ sceneId: scene.sceneId, overlays: zoneComposition.overlays }] : []
    })
    const maxOverlays = Math.max(0, ...zoneRows.map(row => row.overlays.length))
    for (let ordinal = 0; ordinal < maxOverlays; ordinal += 1) {
      const present = zoneRows.flatMap(row => row.overlays[ordinal] ? [{ sceneId: row.sceneId, layer: row.overlays[ordinal] }] : [])
      const rank = maxOverlays - ordinal
      const layerId = `layer:${zone.id}:overlay:${rank}`
      layers.push({ id: layerId, zoneId: zone.id, name: present[0]?.layer.name ?? `Layer ${rank}`, rank })
      for (const entry of present) {
        layerIdByOwner.set(`${entry.sceneId}:${zone.id}:${entry.layer.id}`, layerId)
        report.layerMappings.push({
          sceneId: entry.sceneId,
          zoneId: zone.id,
          sourceLayerId: entry.layer.id,
          layerId,
        })
      }
    }
  }
  return { layers: layers.sort((left, right) => left.zoneId.localeCompare(right.zoneId) || left.rank - right.rank), layerIdByOwner, pendingLayerNames }
}

/**
 * Scene ids whose Group-occurrence children land on each global Layer.
 * Mirrors convertGroupOccurrence's owner resolution (showGroupsV2.ts): rank =
 * baseLayer + layerOffset, rank 0 binds Main, otherwise the owner is
 * zone.overlays[overlays.length - rank], resolved through layerIdByOwner.
 * Every definition placement becomes a definition Clip (convertGroupDefinition
 * maps all placements), and each materializes as a real v2 Clip on the bound
 * layer (materializeShowGroupsV2), so a binding carries retained content
 * exactly when the definition holds a placement at that offset. The v2 editor
 * draws those children under the bound Scene-local lane header, which is why
 * they count toward the displayed name. Dangling references contribute
 * nothing here; structural validation refuses them on their own path.
 */
function groupBoundSceneIdsByLayerId(
  composition: NonNullable<ShowRecord['composition']>,
  layerIdByOwner: Map<string, string>,
): Map<string, Set<string>> {
  const bound = new Map<string, Set<string>>()
  const definitions = new Map((composition.groupDefinitions ?? []).map(definition => [definition.id, definition]))
  for (const occurrence of composition.groupOccurrences ?? []) {
    const definition = definitions.get(occurrence.definitionId)
    const zone = composition.scenes.find(scene => scene.sceneId === occurrence.sceneId)?.zones.find(zone => zone.zoneId === occurrence.zoneId)
    if (!definition || !zone) continue
    for (const layerOffset of new Set(definition.placements.map(placement => placement.layerOffset))) {
      const rank = occurrence.baseLayer + layerOffset
      if (rank === 0) continue
      const owner = zone.overlays[zone.overlays.length - rank]
      if (!owner) continue
      const layerId = layerIdByOwner.get(`${occurrence.sceneId}:${occurrence.zoneId}:${owner.id}`)
      if (!layerId || !definition.placements.some(placement => placement.layerOffset === layerOffset)) continue
      const scenes = bound.get(layerId) ?? new Set<string>()
      scenes.add(occurrence.sceneId)
      bound.set(layerId, scenes)
    }
  }
  return bound
}

interface PlacementRouteSpan {
  id: string
  instanceId: string
  startMs: number
  durationMs: number
  zoneId: string
}

/**
 * Clip-mapping IDs minus the placements `auditPlacement` retires as silent
 * runtime use. A wholly unrouted placement never becomes visible content, but
 * `convertClips` carries its ID forward through `pendingLayoutGapPlacements`
 * into a later visible Clip mapping, so raw mapping membership over-counts it
 * as surviving content. The routed predicate mirrors `auditPlacement`
 * exactly: an interval overlapping no providing Layout occurrence while the
 * instance exists.
 */
function retainedVisiblePlacementIds(
  report: ShowV1ToV2Report,
  spans: PlacementRouteSpan[],
  occurrences: ShowLayoutOccurrenceV2[],
  layouts: ShowRoutingLayout[],
  allZoneIds: string[],
  instanceIds: Set<string>,
): Set<string> {
  const layoutById = new Map(layouts.map(layout => [layout.id, layout]))
  const retired = new Set<string>()
  for (const span of spans) {
    if (!instanceIds.has(span.instanceId)) continue
    const endMs = span.startMs + span.durationMs
    const routed = occurrences.some(occurrence => {
      if (occurrence.startMs >= endMs || occurrence.startMs + occurrence.durationMs <= span.startMs) return false
      return layoutProvidesZone(layoutById.get(occurrence.layoutId), span.zoneId, allZoneIds)
    })
    if (!routed) retired.add(span.id)
  }
  return new Set(report.clipMappings.flatMap(mapping => mapping.sourcePlacementIds).filter(id => !retired.has(id)))
}

/**
 * Resolve divergent overlay names against the content the conversion retains.
 * A name survives when its Scene-local layer carries a placement that becomes
 * a v2 Clip, or a Group-occurrence child bound to that layer. One surviving
 * name is forced; where several survive, the first Scene's name wins in Scene
 * order (candidates arrive in composition.scenes order, so the first surviving
 * candidate carries it). Refusing to open a Show the user already has is a
 * worse failure than picking one of two reasonable names (#1068). This is
 * display-only: Layer-name properties carry no domain validation and
 * layerIdByOwner attribution is untouched, so placement-to-Clip mapping is
 * byte-unchanged and only the Layer's display name is written. Two Layers in
 * a Zone may share a name, as they may in v1 (which uniquifies Scene, Zone
 * and routing-layout names but has no uniqueLayerName), so no resolved name
 * is refused for colliding with another Layer's final name. Names with no
 * surviving content retire with the per-scene structure and take no
 * provenance. Zero surviving names stays refused.
 */
function resolveDivergentLayerNames(
  pending: PendingLayerName[],
  retainedPlacementIds: Set<string>,
  groupBound: Map<string, Set<string>>,
): { resolutions: Map<string, string>; refusedLayerIds: Map<string, string> } {
  const resolutions = new Map<string, string>()
  const refusedLayerIds = new Map<string, string>()
  for (const entry of pending) {
    const surviving = entry.candidates.filter(candidate =>
      candidate.placementIds.some(placementId => retainedPlacementIds.has(placementId))
        || groupBound.get(entry.layerId)?.has(candidate.sceneId))
    if (surviving.length === 0) refusedLayerIds.set(entry.layerId, 'none')
    else resolutions.set(entry.layerId, surviving[0].name)
  }
  return { resolutions, refusedLayerIds }
}

function resolvePendingLayerNames(
  layers: ShowLayerV2[],
  pending: PendingLayerName[],
  composition: NonNullable<ShowRecord['composition']>,
  layerIdByOwner: Map<string, string>,
  report: ShowV1ToV2Report,
  issues: ShowV1ToV2Issue[],
  spans: PlacementRouteSpan[],
  occurrences: ShowLayoutOccurrenceV2[],
  layouts: ShowRoutingLayout[],
  allZoneIds: string[],
  instanceIds: Set<string>,
): void {
  const retainedPlacementIds = retainedVisiblePlacementIds(report, spans, occurrences, layouts, allZoneIds, instanceIds)
  const groupBound = groupBoundSceneIdsByLayerId(composition, layerIdByOwner)
  const { resolutions, refusedLayerIds } = resolveDivergentLayerNames(pending, retainedPlacementIds, groupBound)
  for (const [layerId, name] of resolutions) layers.find(layer => layer.id === layerId)!.name = name
  for (const entry of pending) {
    if (!refusedLayerIds.has(entry.layerId)) continue
    issues.push({
      path: `composition.scenes.*.zones[${entry.zoneId}].overlays[${entry.ordinal}].name`,
      code: 'ambiguous-layer',
      message: `Overlay ordinal ${entry.ordinal} in Zone "${entry.zoneId}" has divergent names with no surviving Clip to name the Layer.`,
    })
  }
}

function collectPlacements(
  show: ShowRecord,
  sceneStartById: Map<string, number>,
  layerIdByOwner: Map<string, string>,
  flatSampleModeByPlacementId: Map<string, ShowClipV2['zoneSampleMode']>,
): PlacementSource[] {
  return show.composition!.scenes.flatMap((scene, sceneIndex) => scene.zones.flatMap((zone, zoneIndex) => {
    const sceneStartMs = sceneStartById.get(scene.sceneId) ?? 0
    const mainLayerId = layerIdByOwner.get(`${scene.sceneId}:${zone.zoneId}:main`) ?? ''
    const main = zone.main.map((placement, placementIndex): PlacementSource => ({
      placement,
      placementPath: `composition.scenes[${sceneIndex}].zones[${zoneIndex}].main[${placementIndex}]`,
      sceneId: scene.sceneId,
      zoneId: zone.zoneId,
      layerId: mainLayerId,
      globalStartMs: sceneStartMs + placement.startMs,
      zoneSampleMode: flatSampleModeByPlacementId.get(placement.id) ?? 'span',
    }))
    const overlays = zone.overlays.flatMap((layer, layerIndex) => {
      const layerId = layerIdByOwner.get(`${scene.sceneId}:${zone.zoneId}:${layer.id}`) ?? ''
      return layer.placements.map((placement, placementIndex): PlacementSource => ({
        placement,
        placementPath: `composition.scenes[${sceneIndex}].zones[${zoneIndex}].overlays[${layerIndex}].placements[${placementIndex}]`,
        sceneId: scene.sceneId,
        zoneId: zone.zoneId,
        layerId,
        globalStartMs: sceneStartMs + placement.startMs,
        zoneSampleMode: flatSampleModeByPlacementId.get(placement.id) ?? 'span',
      }))
    })
    return [...main, ...overlays]
  }))
}

function convertClips(
  placements: PlacementSource[],
  layoutOccurrences: ShowLayoutOccurrenceV2[],
  layouts: ShowRoutingLayout[],
  allZoneIds: string[],
  issues: ShowV1ToV2Issue[],
  report: ShowV1ToV2Report,
): ShowClipV2[] {
  const byLogicalId = new Map<string, PlacementSource[]>()
  for (const source of placements) {
    const id = source.placement.logicalClipId ?? source.placement.id
    const entries = byLogicalId.get(id) ?? []
    entries.push(source)
    byLogicalId.set(id, entries)
  }
  const clips: ShowClipV2[] = []
  const pendingLayoutGapPlacements = new Map<string, string[]>()
  const emitSourceRun = (baseId: string, runSources: PlacementSource[]): string[] => {
    const first = runSources[0]
    const endMs = runSources[runSources.length - 1].globalStartMs + runSources[runSources.length - 1].placement.durationMs
    const appearanceValues = runSources.map(source => ({
      timeMs: source.globalStartMs,
      value: clipAppearance(source.placement),
    })).filter((entry, index, entries) => (
      index === 0 || JSON.stringify(entry.value) !== JSON.stringify(entries[index - 1].value)
    ))
    const runs = layoutAvailableRuns(
      first.globalStartMs,
      endMs,
      first.zoneId,
      layoutOccurrences,
      layouts,
      allZoneIds,
    )
    const continuityKey = `${first.placement.instanceId}\u0000${first.zoneId}\u0000${first.layerId}`
    if (runs.length === 0) {
      pendingLayoutGapPlacements.set(continuityKey, [
        ...(pendingLayoutGapPlacements.get(continuityKey) ?? []),
        ...runSources.map(source => source.placement.id),
      ])
      return []
    }
    const pendingPlacementIds = pendingLayoutGapPlacements.get(continuityKey) ?? []
    pendingLayoutGapPlacements.delete(continuityKey)
    const segmentedByLayout = pendingPlacementIds.length > 0
      || runs.length !== 1
      || runs[0]?.startMs !== first.globalStartMs
      || runs[0]?.endMs !== endMs
    const emittedClipIds: string[] = []
    for (const [runIndex, run] of runs.entries()) {
      const runId = segmentedByLayout ? `${baseId}--layout-${runIndex + 1}` : baseId
      const held = [...appearanceValues].reverse().find(entry => entry.timeMs <= run.startMs)
      if (!held) continue
      const keys = [
        { timeMs: run.startMs, value: structuredClone(held.value) },
        ...appearanceValues
          .filter(entry => entry.timeMs > run.startMs && entry.timeMs < run.endMs)
          .map(entry => structuredClone(entry)),
      ].filter((entry, index, entries) => index === 0 || JSON.stringify(entry.value) !== JSON.stringify(entries[index - 1].value))
      clips.push({
        id: runId,
        instanceId: first.placement.instanceId,
        zoneId: first.zoneId,
        layerId: first.layerId,
        startMs: run.startMs,
        durationMs: run.endMs - run.startMs,
        entryPolicy: 'continue',
        zoneSampleMode: first.zoneSampleMode,
        appearance: {
          keys: keys.map((entry, index) => ({
            id: `${runId}:appearance:${index + 1}`,
            timeMs: entry.timeMs,
            value: entry.value,
          })),
        },
      })
      report.clipMappings.push({
        sourcePlacementIds: [
          ...(runIndex === 0 ? pendingPlacementIds : []),
          ...runSources
            .filter(source => source.globalStartMs >= run.startMs && source.globalStartMs + source.placement.durationMs <= run.endMs)
            .map(source => source.placement.id),
        ],
        clipId: runId,
      })
      emittedClipIds.push(runId)
    }
    return emittedClipIds
  }
  for (const [clipId, sources] of byLogicalId) {
    sources.sort((left, right) => left.globalStartMs - right.globalStartMs || left.placement.id.localeCompare(right.placement.id))
    const first = sources[0]
    for (const source of sources.slice(1)) {
      for (const field of ['instanceId', 'zoneId', 'layerId', 'zoneSampleMode'] as const) {
        const firstValue = field === 'instanceId' ? first.placement.instanceId : first[field]
        const value = field === 'instanceId' ? source.placement.instanceId : source[field]
        if (JSON.stringify(value) !== JSON.stringify(firstValue)) {
          issues.push({ path: `${source.placementPath}.${field}`, code: 'divergent-clip-field', message: `Logical Clip "${clipId}" has divergent ${field}.` })
        }
      }
    }
    const sourceRuns: PlacementSource[][] = [[first]]
    let overlapRefused = false
    for (const source of sources.slice(1)) {
      const current = sourceRuns[sourceRuns.length - 1]
      const previous = current[current.length - 1]
      const previousEndMs = previous.globalStartMs + previous.placement.durationMs
      if (previousEndMs === source.globalStartMs) current.push(source)
      else if (previousEndMs < source.globalStartMs) sourceRuns.push([source])
      else {
        issues.push({ path: source.placementPath, code: 'discontinuous-logical-clip', message: `Logical Clip "${clipId}" has overlapping source segments.` })
        overlapRefused = true
      }
    }
    if (overlapRefused) continue
    const emittedClipIds: string[] = []
    sourceRuns.forEach((runSources, runIndex) => {
      const baseId = sourceRuns.length === 1 ? clipId : `${clipId}--run-${runIndex + 1}`
      emittedClipIds.push(...emitSourceRun(baseId, runSources))
    })
    if (sourceRuns.length > 1) {
      report.splitLogicalClips.push({
        logicalClipId: clipId,
        clipIds: emittedClipIds,
        gaps: sourceRuns.slice(1).map((runSources, runIndex) => {
          const previousRun = sourceRuns[runIndex]
          const previousEnd = previousRun[previousRun.length - 1]
          return {
            startMs: previousEnd.globalStartMs + previousEnd.placement.durationMs,
            endMs: runSources[0].globalStartMs,
          }
        }),
        outcome: 'split-discontinuous-logical-clip',
      })
    }
  }
  return clips.sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
}

function layoutAvailableRuns(
  startMs: number,
  endMs: number,
  zoneId: string,
  occurrences: ShowLayoutOccurrenceV2[],
  layouts: ShowRoutingLayout[],
  allZoneIds: string[],
): Array<{ startMs: number; endMs: number }> {
  const layoutById = new Map(layouts.map(layout => [layout.id, layout]))
  const runs: Array<{ startMs: number; endMs: number }> = []
  for (const occurrence of [...occurrences].sort((left, right) => left.startMs - right.startMs)) {
    const occurrenceEndMs = occurrence.startMs + occurrence.durationMs
    if (occurrenceEndMs <= startMs || occurrence.startMs >= endMs) continue
    const layout = layoutById.get(occurrence.layoutId)
    if (!layoutProvidesZone(layout, zoneId, allZoneIds)) continue
    const part = { startMs: Math.max(startMs, occurrence.startMs), endMs: Math.min(endMs, occurrenceEndMs) }
    const previous = runs[runs.length - 1]
    if (previous?.endMs === part.startMs) previous.endMs = part.endMs
    else runs.push(part)
  }
  return runs
}

function layoutProvidesZone(
  layout: ShowRoutingLayout | undefined,
  zoneId: string,
  allZoneIds: string[],
): boolean {
  if (!layout) return false
  const zoneIds = layout.logical?.zoneIds
    ?? (layout.zones.length > 0 ? layout.zones.map(zone => zone.zoneId) : allZoneIds)
  return zoneIds.includes(zoneId)
}

function isScalarCarrier(carrier: NonNullable<ShowRecord['transitions'][number]['propertyTransitions']>): boolean {
  return Object.keys(carrier).length > 0 && Object.keys(carrier).every(key => key === 'sample' || key === 'routing')
    && (!carrier.sample || (Object.keys(carrier.sample).length === 1 && carrier.sample.repeatScale !== undefined))
    && (!carrier.routing || (Object.keys(carrier.routing).length === 1 && carrier.routing.splitPosition !== undefined))
}

function uniqueId(preferred: string, used: Set<string>): string {
  if (!used.has(preferred)) return preferred
  let suffix = 2
  while (used.has(`${preferred}:${suffix}`)) suffix += 1
  return `${preferred}:${suffix}`
}

function emptyReport(show: ShowRecord): ShowV1ToV2Report {
  return {
    sourceShowId: show.id,
    accounting: [],
    unaccountedSourcePaths: [],
    sceneOffsets: [],
    layerMappings: [],
    clipMappings: [],
    splitLogicalClips: [],
    markerMappings: [],
    flatProjectionMappings: [],
    retiredFlatCellShadows: [],
    retiredSilentRuntimeUses: [],
    retiredStructuralCuts: [],
    retiredNoContributionPropertyTracks: [],
  }
}

function refused(show: ShowRecord, report: ShowV1ToV2Report, issues: ShowV1ToV2Issue[]): ShowV1ToV2Result {
  return { status: 'refused', issues, report: finalizeAccounting(show, report, true) }
}

function finalizeAccounting(show: ShowRecord, report: ShowV1ToV2Report, isRefused: boolean): ShowV1ToV2Report {
  const paths = leafPaths(show)
  report.accounting = isRefused
    ? paths.map(sourcePath => ({ sourcePath, outcome: 'refused' as const }))
    : report.accounting
  report.unaccountedSourcePaths = paths.filter(path => !report.accounting.some(entry => entry.sourcePath === path))
  return report
}

export function auditShowV1ToV2Accounting(
  show: ShowRecord,
  record: ShowRecordV2,
  report: ShowV1ToV2Report,
): Pick<ShowV1ToV2Report, 'accounting' | 'unaccountedSourcePaths'> {
  const accounting: ShowV1ToV2AccountingEntry[] = []
  const equal = (
    sourcePath: string,
    targetPath: string,
    source: unknown,
    target: unknown,
    outcome: ShowV1ToV2AccountingEntry['outcome'] = sourcePath === targetPath ? 'preserved' : 'mapped',
  ) => {
    if (JSON.stringify(source) === JSON.stringify(target)) addAccountingLeaves(accounting, sourcePath, source, outcome, targetPath)
  }
  const mapped = (sourcePath: string, targetPath: string, source: unknown, condition: boolean) => {
    if (condition) addAccountingLeaves(accounting, sourcePath, source, 'mapped', targetPath)
  }
  const retired = (sourcePath: string, targetPath: string, source: unknown, condition: boolean) => {
    if (condition) addAccountingLeaves(accounting, sourcePath, source, 'retired-source-structure', targetPath, false)
  }

  equal('id', 'id', show.id, record.id)
  equal('name', 'name', show.name, record.name)
  equal('zones', 'zones', show.zones, record.zones)
  equal('routingLayouts', 'zoneLayouts', show.routingLayouts, record.zoneLayouts)
  if (show.targetControllerProfileId !== undefined) equal('targetControllerProfileId', 'targetControllerProfileId', show.targetControllerProfileId, record.targetControllerProfileId)
  if (show.stageMapId !== undefined) equal('stageMapId', 'stageMapId', show.stageMapId, record.stageMapId)
  equal('outputContract', 'outputContract', show.outputContract, record.outputContract)
  if (show.outputEffects !== undefined) equal('outputEffects', 'outputEffects', show.outputEffects, record.outputEffects)
  if (show.importMetadata !== undefined) equal('importMetadata', 'importMetadata', show.importMetadata, record.importMetadata)
  equal('updatedAt', 'updatedAt', show.updatedAt, record.updatedAt)

  for (const [sceneIndex, scene] of show.scenes.entries()) {
    const sourcePath = `scenes.${sceneIndex}`
    const offset = report.sceneOffsets.find(candidate => candidate.sceneId === scene.id)
    const markerMapping = report.markerMappings.find(candidate => candidate.sourceSceneId === scene.id)
    const marker = record.composition.markers.find(candidate => candidate.id === markerMapping?.markerId)
    const nextScene = show.scenes[sceneIndex + 1]
    const nextMarkerMapping = nextScene
      ? report.markerMappings.find(candidate => candidate.sourceSceneId === nextScene.id)
      : undefined
    const nextMarker = nextMarkerMapping
      ? record.composition.markers.find(candidate => candidate.id === nextMarkerMapping.markerId)
      : undefined
    const layout = record.composition.layoutOccurrences.find(occurrence => offset && occurrence.startMs <= offset.startMs && occurrence.startMs + occurrence.durationMs > offset.startMs)
    const candidateEndMs = nextScene ? nextMarker?.timeMs : record.composition.showEndMs
    mapped(`${sourcePath}.id`, marker ? `composition.markers.${record.composition.markers.indexOf(marker)}.id` : 'composition.markers', scene.id, Boolean(offset && markerMapping && marker && marker.timeMs === offset.startMs))
    equal(`${sourcePath}.name`, marker ? `composition.markers.${record.composition.markers.indexOf(marker)}.name` : 'composition.markers', scene.name, marker?.name)
    mapped(
      `${sourcePath}.durationMs`,
      'composition.markers/showEndMs/layoutOccurrences',
      scene.durationMs,
      Boolean(
        offset
        && marker?.timeMs === offset.startMs
        && candidateEndMs === offset.endMs + (record.composition.transitions.find(transition =>
          show.transitions.some(source => source.id === transition.id && source.afterSceneId === scene.id)
        )?.durationMs ?? 0)
        && offset.endMs - offset.startMs === scene.durationMs
        && layout !== undefined
      ),
    )
    if (scene.routingTargets !== undefined) {
      const value = scene.routingTargets.splitPosition
      if (value !== undefined) equal(`${sourcePath}.routingTargets.splitPosition`, 'composition.layoutOccurrences.*.parameters.splitPosition', value, layout?.parameters.splitPosition)
      else mapped(`${sourcePath}.routingTargets`, 'composition.layoutOccurrences.0.parameters', scene.routingTargets, Object.keys(scene.routingTargets).length === 0)
    }
    if (scene.sampleTargets !== undefined) {
      const value = scene.sampleTargets.repeatScale
      if (value !== undefined) equal(`${sourcePath}.sampleTargets.repeatScale`, 'composition.sampleRemap.repeatScale', value, repeatScaleAt(record, offset?.startMs ?? 0))
      else mapped(`${sourcePath}.sampleTargets`, 'composition.sampleRemap', scene.sampleTargets, Object.keys(scene.sampleTargets).length === 0)
    }
  }

  if (!show.composition) {
    for (const cellIndex of show.cells.keys()) {
      auditFlatCell(accounting, show, record, report, cellIndex)
    }
  } else {
    if (show.cells.length === 0) {
      retired('cells', 'composition', show.cells, true)
    } else {
      for (const [cellIndex, cell] of show.cells.entries()) {
        const provenance = report.retiredFlatCellShadows.find(candidate => (
          candidate.sourceCellId === cell.id && candidate.sourcePath === `cells.${cellIndex}`
        ))
        retired(`cells.${cellIndex}`, 'composition', cell, provenance?.outcome === 'retired-composition-shadow')
      }
    }
    auditComposition(accounting, show, record, report)
  }

  if (show.transitions.length === 0) {
    retired('transitions', 'composition.transitions/layoutOccurrences', show.transitions, true)
  } else {
    for (const [transitionIndex, transition] of show.transitions.entries()) {
      if (transition.kind === 'routing') {
        const offset = report.sceneOffsets.find(scene => scene.sceneId === transition.afterSceneId)
        const occurrence = transition.durationMs > 0
          ? record.composition.layoutOccurrences.find(candidate => candidate.incomingTransfer?.id === transition.id)
          : record.composition.layoutOccurrences.find(candidate => candidate.incomingSwitch?.id === transition.id)
        const transfer = occurrence?.incomingTransfer
        const cut = occurrence?.incomingSwitch
        const valid = !!(occurrence
          && occurrence.layoutId === transition.layoutId
          && occurrence.startMs === offset?.endMs
          && (transition.durationMs === 0
            // A zero-duration switch keeps identity and authored settings as
            // inert provenance, and owns no timed transfer object (#1065).
            ? transfer === undefined
              && cut?.origin === 'converted-routing-cut'
              && cut.direction === transition.routingDirection
              && JSON.stringify(cut.easing) === JSON.stringify(transition.easing)
            : transfer?.durationMs === transition.durationMs
              && transfer.direction === (transition.routingDirection ?? 'forward')
              && JSON.stringify(transfer.easing) === JSON.stringify(transition.easing)))
        mapped(`transitions.${transitionIndex}`, 'composition.layoutOccurrences', transition, valid)
        continue
      }
      const targetIndex = record.composition.transitions.findIndex(candidate => candidate.id === transition.id)
      if (transition.kind !== 'cut' && targetIndex >= 0) {
        const { afterSceneId, propertyTransitions, ...settings } = transition
        const { participants: _participants, wholeOutput: _wholeOutput, propertyRamps: _ramps, origin: _origin, ...targetSettings } = record.composition.transitions[targetIndex]
        mapped(`transitions.${transitionIndex}`, `composition.transitions.${targetIndex}`, settings, JSON.stringify(settings) === JSON.stringify(targetSettings))
        if (propertyTransitions !== undefined) mapped(`transitions.${transitionIndex}.propertyTransitions`, `composition.transitions.${targetIndex}.propertyRamps`, propertyTransitions, JSON.stringify([propertyTransitions.sample, propertyTransitions.routing]) === JSON.stringify([scalarBoundaryRamps(record.composition.transitions[targetIndex])?.sample, scalarBoundaryRamps(record.composition.transitions[targetIndex])?.routing]))
        retired(`transitions.${transitionIndex}.afterSceneId`, `composition.transitions.${targetIndex}.participants`, afterSceneId, report.sceneOffsets.some(scene => scene.sceneId === afterSceneId))
        continue
      }
      const retirement = report.retiredStructuralCuts.find(candidate => candidate.sourceTransitionId === transition.id)
      retired(
        `transitions.${transitionIndex}`,
        'composition.clips/markers',
        transition,
        Boolean(retirement && transition.kind === 'cut' && !cutCarrierField(transition)),
      )
    }
  }

  const sourcePaths = leafPaths(show)
  const accounted = new Set(accounting.map(entry => entry.sourcePath))
  return {
    accounting: accounting.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)),
    unaccountedSourcePaths: sourcePaths.filter(path => !accounted.has(path)),
  }
}

function addAccountingLeaves(
  accounting: ShowV1ToV2AccountingEntry[],
  sourcePath: string,
  source: unknown,
  outcome: ShowV1ToV2AccountingEntry['outcome'],
  targetPath: string,
  appendSuffix = true,
): void {
  for (const leaf of leafPaths(source, sourcePath)) {
    const suffix = leaf.slice(sourcePath.length)
    accounting.push({ sourcePath: leaf, outcome, targetPath: appendSuffix ? `${targetPath}${suffix}` : targetPath })
  }
}

function auditFlatCell(
  accounting: ShowV1ToV2AccountingEntry[],
  show: ShowRecord,
  record: ShowRecordV2,
  report: ShowV1ToV2Report,
  cellIndex: number,
): void {
  const cell = show.cells[cellIndex]
  const sourcePath = `cells.${cellIndex}`
  const projection = report.flatProjectionMappings.find(candidate => candidate.cellId === cell.id)
  if (!projection) return
  if (projection.placementIds.length > 0 && projection.patternInstanceIds.length === 1) {
    const instanceId = projection.patternInstanceIds[0]
    const startSceneIndex = show.scenes.findIndex(scene => scene.id === cell.sceneId)
    const startZoneIndex = show.zones.findIndex(zone => zone.id === cell.zoneId)
    if (startSceneIndex >= 0 && startZoneIndex >= 0) {
      const coveredScenes = show.scenes.slice(startSceneIndex, startSceneIndex + Math.max(1, cell.sceneSpan))
      const coveredZones = show.zones.slice(startZoneIndex, startZoneIndex + Math.max(1, Math.min(cell.zoneSpan ?? 1, show.zones.length - startZoneIndex))).map(zone => zone.id)
      const expected = new Map<string, { zoneId: string; startMs: number; durationMs: number }>()
      for (const scene of coveredScenes) {
        const offset = report.sceneOffsets.find(candidate => candidate.sceneId === scene.id)
        const placementStartMs = offset?.startMs ?? 0
        const placementDurationMs = offset ? offset.endMs - offset.startMs : scene.durationMs
        for (const zoneId of coveredZones) {
          const baseId = `placement-${cell.id}-${scene.id}`
          const placementId = coveredZones.length === 1 ? baseId : `${baseId}-${zoneId}`
          expected.set(placementId, { zoneId, startMs: placementStartMs, durationMs: placementDurationMs })
        }
      }
      const unrouted = projection.placementIds.map(placementId => {
        const detail = expected.get(placementId)
        return detail ? { placementId, ...detail } : undefined
      })
      if (unrouted.every((entry): entry is NonNullable<typeof entry> => entry !== undefined)
        && unrouted.every(entry => !placementIntervalRouted(record, entry.zoneId, entry.startMs, entry.startMs + entry.durationMs))) {
        for (const entry of unrouted) {
          if (!report.retiredSilentRuntimeUses.some(retirement => retirement.sourcePlacementId === entry.placementId && retirement.sourcePath === sourcePath)) {
            report.retiredSilentRuntimeUses.push({
              sourcePlacementId: entry.placementId,
              sourcePath,
              instanceId,
              zoneId: entry.zoneId,
              startMs: entry.startMs,
              durationMs: entry.durationMs,
              outcome: 'retired-silent-runtime-use',
            })
          }
        }
        addAccountingLeaves(accounting, sourcePath, cell, 'retired-silent-runtime-use', 'conversion.report.retiredSilentRuntimeUses', false)
        return
      }
    }
  }
  const clipIds = new Set(report.clipMappings
    .filter(mapping => mapping.sourcePlacementIds.some(id => projection.placementIds.includes(id)))
    .map(mapping => mapping.clipId))
  const clips = record.composition.clips.filter(clip => clipIds.has(clip.id))
  const instances = record.composition.patternInstances.filter(instance => projection.patternInstanceIds.includes(instance.id))
  const mapped = (path: string, targetPath: string, value: unknown, condition: boolean) => {
    if (condition) addAccountingLeaves(accounting, `${sourcePath}.${path}`, value, 'mapped', targetPath)
  }
  const equalAll = (path: string, targetPath: string, value: unknown, targets: unknown[]) => {
    mapped(path, targetPath, value, targets.length > 0 && targets.every(target => JSON.stringify(target) === JSON.stringify(value)))
  }
  mapped('id', 'composition.patternInstances/clips', cell.id, clips.length > 0 && instances.length > 0)
  mapped('zoneId', 'composition.clips.*.zoneId', cell.zoneId, clips.length > 0 && clips.some(clip => clip.zoneId === cell.zoneId))
  const startSceneIndex = show.scenes.findIndex(scene => scene.id === cell.sceneId)
  const startMs = report.sceneOffsets.find(scene => scene.sceneId === cell.sceneId)?.startMs ?? 0
  const lastScene = show.scenes[startSceneIndex + Math.max(1, cell.sceneSpan) - 1]
  const endMs = report.sceneOffsets.find(scene => scene.sceneId === lastScene?.id)?.endMs ?? 0
  const durationMs = endMs - startMs
  mapped('sceneId', 'composition.clips.*.startMs', cell.sceneId, startSceneIndex >= 0 && clips.length > 0 && Math.min(...clips.map(clip => clip.startMs)) === startMs)
  mapped('sceneSpan', 'composition.clips.*.durationMs', cell.sceneSpan, clips.length > 0 && Math.max(...clips.map(clip => clip.startMs + clip.durationMs)) === startMs + durationMs)
  if (cell.zoneSpan !== undefined) {
    const startZoneIndex = show.zones.findIndex(zone => zone.id === cell.zoneId)
    const expectedZoneIds = show.zones.slice(startZoneIndex, startZoneIndex + Math.max(1, cell.zoneSpan)).map(zone => zone.id)
    mapped('zoneSpan', 'composition.clips.*.zoneId', cell.zoneSpan, expectedZoneIds.every(zoneId => clips.some(clip => clip.zoneId === zoneId)))
  }
  if (cell.zoneMode !== undefined) equalAll('zoneMode', 'composition.clips.*.zoneSampleMode', cell.zoneMode, clips.map(clip => clip.zoneSampleMode))
  equalAll('pattern', 'composition.patternInstances.*.pattern', cell.pattern, instances.map(instance => instance.pattern))
  equalAll('patternName', 'composition.patternInstances.*.patternName', cell.patternName, instances.map(instance => instance.patternName))
  equalAll('adaptations.mirror', 'composition.clips.*.appearance.keys.*.value.view.mirror', cell.adaptations.mirror, clips.flatMap(clip => clip.appearance.keys.map(key => key.value.view.mirror)))
  equalAll('adaptations.phase', 'composition.clips.*.appearance.keys.*.value.view.phase', cell.adaptations.phase, clips.flatMap(clip => clip.appearance.keys.map(key => key.value.view.phase)))
  equalAll('adaptations.brightness', 'composition.clips.*.appearance.keys.*.value.view.brightness', cell.adaptations.brightness, clips.flatMap(clip => clip.appearance.keys.map(key => key.value.view.brightness)))
  equalAll('adaptations.timeScale', 'composition.patternInstances.*.time.timeScale', cell.adaptations.timeScale, instances.map(instance => instance.time.timeScale))
  if (cell.adaptations.timeOffsetMs !== undefined) equalAll('adaptations.timeOffsetMs', 'composition.patternInstances.*.time.timeOffsetMs', cell.adaptations.timeOffsetMs, instances.map(instance => instance.time.timeOffsetMs))
  if (cell.adaptations.lightShutter !== undefined) equalAll('adaptations.lightShutter', 'composition.patternInstances.*.time.lightShutter', cell.adaptations.lightShutter, instances.map(instance => instance.time.lightShutter))
  if (cell.adaptations.steppedClock !== undefined) equalAll('adaptations.steppedClock', 'composition.patternInstances.*.time.steppedClock', cell.adaptations.steppedClock, instances.map(instance => instance.time.steppedClock))
  if (cell.restartOnEntry !== undefined) mapped('restartOnEntry', 'composition.patternInstances.*.id', cell.restartOnEntry, instances.length > 0)
  if (cell.evaluationPolicy !== undefined) equalAll('evaluationPolicy', 'composition.patternInstances.*.evaluationPolicy', cell.evaluationPolicy, instances.map(instance => instance.evaluationPolicy ?? 'live'))
  if (cell.controlTargets !== undefined) equalAll('controlTargets', 'composition.patternInstances.*.controlTargets', cell.controlTargets, instances.map(instance => instance.controlTargets))
  const appearances = clips.flatMap(clip => clip.appearance.keys.map(key => key.value))
  if (cell.presentation !== undefined) equalAll('presentation', 'composition.clips.*.appearance.keys.*.value.presentation', cell.presentation, appearances.map(value => value.presentation))
  if (cell.blink !== undefined) equalAll('blink', 'composition.clips.*.appearance.keys.*.value.blink', cell.blink, appearances.map(value => value.blink))
  if (cell.transform !== undefined) equalAll('transform', 'composition.clips.*.appearance.keys.*.value.transform', cell.transform, appearances.map(value => value.transform))
  if (cell.viewport !== undefined) equalAll('viewport', 'composition.clips.*.appearance.keys.*.value.aperture', cell.viewport, appearances.map(value => value.aperture))
  if (cell.effects !== undefined) equalAll('effects', 'composition.clips.*.appearance.keys.*.value.effects', cell.effects, appearances.map(value => value.effects))
}

function auditComposition(
  accounting: ShowV1ToV2AccountingEntry[],
  show: ShowRecord,
  record: ShowRecordV2,
  report: ShowV1ToV2Report,
): void {
  const composition = show.composition!
  const mapped = (sourcePath: string, targetPath: string, source: unknown, condition: boolean) => {
    if (condition) addAccountingLeaves(accounting, sourcePath, source, 'mapped', targetPath)
  }
  const retired = (sourcePath: string, targetPath: string, source: unknown, condition: boolean) => {
    if (condition) addAccountingLeaves(accounting, sourcePath, source, 'retired-source-structure', targetPath, false)
  }
  mapped('composition.version', 'composition.version', composition.version, record.composition.version === 2)
  if (composition.executionModel !== undefined) mapped('composition.executionModel', 'composition.executionModel', composition.executionModel, record.composition.executionModel === composition.executionModel)
  if (composition.durationMs !== undefined) mapped('composition.durationMs', 'composition.showEndMs', composition.durationMs, record.composition.showEndMs === composition.durationMs)
  if (JSON.stringify(composition.patternInstances) === JSON.stringify(record.composition.patternInstances)) {
    addAccountingLeaves(accounting, 'composition.patternInstances', composition.patternInstances, 'preserved', 'composition.patternInstances')
  }
  for (const [markerIndex, marker] of (composition.markers ?? []).entries()) {
    const targetIndex = record.composition.markers.findIndex(candidate => candidate.id === marker.id)
    // An absorbed Scene label promotes the authored Marker's role and changes
    // nothing else, so its source leaves stay accounted against that Marker.
    const { role: _role, ...target } = record.composition.markers[targetIndex] ?? {}
    if (targetIndex >= 0 && JSON.stringify(marker) === JSON.stringify(target)) {
      addAccountingLeaves(accounting, `composition.markers.${markerIndex}`, marker, 'mapped', `composition.markers.${targetIndex}`)
    }
  }
  if (composition.markers?.length === 0) mapped('composition.markers', 'composition.markers', composition.markers, true)
  if ((composition.groupDefinitions?.length ?? 0) === 0 && composition.groupDefinitions !== undefined) mapped('composition.groupDefinitions', 'composition.groupDefinitions', composition.groupDefinitions, record.composition.groupDefinitions.length === 0)
  if ((composition.groupOccurrences?.length ?? 0) === 0 && composition.groupOccurrences !== undefined) mapped('composition.groupOccurrences', 'composition.groupOccurrences', composition.groupOccurrences, record.composition.groupOccurrences.length === 0)

  for (const [index, definition] of (composition.groupDefinitions ?? []).entries()) {
    const targetIndex = record.composition.groupDefinitions.findIndex(candidate => candidate.id === definition.id)
    const target = record.composition.groupDefinitions[targetIndex]
    mapped(`composition.groupDefinitions.${index}`, `composition.groupDefinitions.${targetIndex}`, definition, Boolean(target && groupDefinitionPreserved(definition, target)))
  }
  let withLayers = composition
  for (const zone of show.zones) withLayers = materializeShowGroupLayerShells(withLayers, zone.id)
  const layerIds = new Map(report.layerMappings.map(mapping => [`${mapping.sceneId}:${mapping.zoneId}:${mapping.sourceLayerId}`, mapping.layerId]))
  // Re-derive exactly what the survivor rule supersedes, from the same inputs
  // conversion used, so the audit retires only those name leaves. Any other
  // mismatch stays unaccounted and refuses below (#1068).
  const pendingAudit = collectPendingLayerNames(show.zones, withLayers)
  const pendingAuditByLayer = new Map(pendingAudit.map(entry => [entry.layerId, entry]))
  const auditRouteSpans = composition.scenes.flatMap(scene => {
    const offset = report.sceneOffsets.find(candidate => candidate.sceneId === scene.sceneId)
    return scene.zones.flatMap(zone => [...zone.main, ...zone.overlays.flatMap(layer => layer.placements)].map(placement => ({
      id: placement.id,
      instanceId: placement.instanceId,
      startMs: (offset?.startMs ?? 0) + placement.startMs,
      durationMs: placement.durationMs,
      zoneId: zone.zoneId,
    })))
  })
  const { resolutions: resolvedAuditNames } = resolveDivergentLayerNames(
    pendingAudit,
    retainedVisiblePlacementIds(
      report,
      auditRouteSpans,
      record.composition.layoutOccurrences,
      record.zoneLayouts,
      record.zones.map(zone => zone.id),
      new Set(record.composition.patternInstances.map(instance => instance.id)),
    ),
    groupBoundSceneIdsByLayerId(withLayers, layerIds),
  )
  for (const [index, occurrence] of (composition.groupOccurrences ?? []).entries()) {
    const targetIndex = record.composition.groupOccurrences.findIndex(candidate => candidate.id === occurrence.id)
    const expected = convertGroupOccurrence({ ...show, composition: withLayers }, occurrence, record, report.sceneOffsets.find(scene => scene.sceneId === occurrence.sceneId)!.startMs, layerIds)
    mapped(`composition.groupOccurrences.${index}`, `composition.groupOccurrences.${targetIndex}`, occurrence, JSON.stringify(record.composition.groupOccurrences[targetIndex]) === JSON.stringify(expected))
  }

  for (const [sceneIndex, scene] of composition.scenes.entries()) {
    const scenePath = `composition.scenes.${sceneIndex}`
    const offset = report.sceneOffsets.find(candidate => candidate.sceneId === scene.sceneId)
    mapped(`${scenePath}.sceneId`, 'composition.markers/clips/propertyTracks', scene.sceneId, Boolean(offset))
    if (scene.propertyTracks?.length === 0) mapped(`${scenePath}.propertyTracks`, 'composition.propertyTracks', scene.propertyTracks, true)
    for (const [trackIndex, track] of (scene.propertyTracks ?? []).entries()) {
      const targetIndex = record.composition.propertyTracks.findIndex(candidate => candidate.id === track.id)
      const target = record.composition.propertyTracks[targetIndex]
      const expectedTarget = convertPropertyTarget(track.target, new Map(report.clipMappings.flatMap(item => item.sourcePlacementIds.map(id => [id, item.clipId]))))
      const keysPreserved = Boolean(target && track.keyframes.every((key, index) => (
        target.keyframes[index]?.id === key.id
        && target.keyframes[index]?.value === key.value
        && JSON.stringify(target.keyframes[index]?.easing) === JSON.stringify(key.easing)
        && target.keyframes[index]?.timeMs === (offset?.startMs ?? 0) + key.timeMs
      )))
      const sourceIndex = show.scenes.findIndex(candidate => candidate.id === scene.sceneId)
      const incoming = show.transitions.find(boundary => boundary.afterSceneId === show.scenes[sourceIndex - 1]?.id && boundary.kind !== 'cut' && boundary.kind !== 'routing')?.durationMs ?? 0
      const outgoing = show.transitions.find(boundary => boundary.afterSceneId === scene.sceneId && boundary.kind !== 'cut' && boundary.kind !== 'routing')?.durationMs ?? 0
      const instanceOwned = expectedTarget.kind === 'instance-time-scale' || expectedTarget.kind === 'instance-control'
      const expectedActiveStartMs = instanceOwned ? offset?.startMs : (offset?.startMs ?? 0) - incoming
      const expectedActiveDurationMs = (offset?.endMs ?? 0) - (offset?.startMs ?? 0) + outgoing + (instanceOwned ? 0 : incoming)
      mapped(
        `${scenePath}.propertyTracks.${trackIndex}`,
        targetIndex >= 0 ? `composition.propertyTracks.${targetIndex}` : 'composition.propertyTracks',
        track,
        Boolean(target && offset && target.activeStartMs === expectedActiveStartMs && target.activeDurationMs === expectedActiveDurationMs && JSON.stringify(target.target) === JSON.stringify(expectedTarget) && keysPreserved),
      )
    }
    for (const [zoneIndex, zone] of scene.zones.entries()) {
      const zonePath = `${scenePath}.zones.${zoneIndex}`
      const hasMappedLayer = report.layerMappings.some(candidate => candidate.sceneId === scene.sceneId && candidate.zoneId === zone.zoneId)
      mapped(`${zonePath}.zoneId`, 'composition.layers/clips', zone.zoneId, hasMappedLayer)
      if (zone.main.length === 0) mapped(`${zonePath}.main`, 'composition.clips', zone.main, true)
      for (const [placementIndex, placement] of zone.main.entries()) {
        auditPlacement(accounting, record, report, placement, `${zonePath}.main.${placementIndex}`, offset?.startMs ?? 0, zone.zoneId)
      }
      if (zone.overlays.length === 0) mapped(`${zonePath}.overlays`, 'composition.layers', zone.overlays, true)
      for (const [layerIndex, layer] of zone.overlays.entries()) {
        const layerPath = `${zonePath}.overlays.${layerIndex}`
        const layerMapping = report.layerMappings.find(candidate => candidate.sceneId === scene.sceneId && candidate.zoneId === zone.zoneId && candidate.sourceLayerId === layer.id)
        const targetIndex = record.composition.layers.findIndex(candidate => candidate.id === layerMapping?.layerId)
        const target = record.composition.layers[targetIndex]
        mapped(`${layerPath}.id`, targetIndex >= 0 ? `composition.layers.${targetIndex}.id` : 'composition.layers', layer.id, Boolean(target && layerMapping))
        // A superseded name belongs to a Scene-local Layer whose name lost:
        // either it carries no surviving content — neither a placement that
        // became a v2 Clip nor a Group-occurrence child bound to the layer —
        // or its surviving name lost the first-Scene tiebreak — while v2's
        // global Layer keeps the winning name, so this leaf retires with the
        // per-scene structure (#1068). Any other mismatch is not what the
        // rule supersedes: it stays unaccounted and refuses below.
        if (target?.name === layer.name) {
          mapped(`${layerPath}.name`, `composition.layers.${targetIndex}.name`, layer.name, true)
        } else if (target && layerMapping) {
          const entry = pendingAuditByLayer.get(layerMapping.layerId)
          const survivor = resolvedAuditNames.get(layerMapping.layerId)
          if (entry && survivor !== undefined && target.name === survivor
            && entry.candidates.some(candidate => candidate.sceneId === scene.sceneId && candidate.name === layer.name && candidate.name !== survivor)) {
            retired(`${layerPath}.name`, `composition.layers.${targetIndex}.name`, layer.name, true)
          }
        }
        if (layer.placements.length === 0) mapped(`${layerPath}.placements`, 'composition.clips', layer.placements, true)
        for (const [placementIndex, placement] of layer.placements.entries()) {
          auditPlacement(accounting, record, report, placement, `${layerPath}.placements.${placementIndex}`, offset?.startMs ?? 0, zone.zoneId)
        }
      }
    }
  }

  if ((composition.transitions?.length ?? 0) === 0 && composition.transitions !== undefined) mapped('composition.transitions', 'composition.transitions', composition.transitions, record.composition.transitions.every(target => show.transitions.some(source => source.id === target.id && source.kind !== 'cut' && source.kind !== 'routing')))
  for (const [transitionIndex, transition] of (composition.transitions ?? []).entries()) {
    const targetIndex = record.composition.transitions.findIndex(candidate => candidate.id === transition.id)
    const target = record.composition.transitions[targetIndex]
    if (!target) continue
    const { fromPlacementId, toPlacementId, ...settings } = transition
    const { participants: _participants, wholeOutput: _wholeOutput, propertyRamps: _ramps, origin: _origin, ...targetSettings } = target
    if (JSON.stringify(settings) === JSON.stringify(targetSettings)) {
      addAccountingLeaves(accounting, `composition.transitions.${transitionIndex}`, settings, 'mapped', `composition.transitions.${targetIndex}`)
    }
    const participant = target.participants[0]
    const fromClipId = report.clipMappings.find(mapping => mapping.sourcePlacementIds.includes(fromPlacementId))?.clipId
    const toClipId = report.clipMappings.find(mapping => mapping.sourcePlacementIds.includes(toPlacementId))?.clipId
    mapped(`composition.transitions.${transitionIndex}.fromPlacementId`, `composition.transitions.${targetIndex}.participants.0.fromClipId`, fromPlacementId, participant?.fromClipId === fromClipId)
    mapped(`composition.transitions.${transitionIndex}.toPlacementId`, `composition.transitions.${targetIndex}.participants.0.toClipId`, toPlacementId, participant?.toClipId === toClipId)
  }
}

function placementIntervalRouted(
  record: ShowRecordV2,
  zoneId: string,
  startMs: number,
  endMs: number,
): boolean {
  return record.composition.layoutOccurrences.some(occurrence => {
    if (occurrence.startMs >= endMs || occurrence.startMs + occurrence.durationMs <= startMs) return false
    const layout = record.zoneLayouts.find(candidate => candidate.id === occurrence.layoutId)
    return layoutProvidesZone(layout, zoneId, record.zones.map(zone => zone.id))
  })
}

function auditPlacement(
  accounting: ShowV1ToV2AccountingEntry[],
  record: ShowRecordV2,
  report: ShowV1ToV2Report,
  placement: ShowMainPlacement | ShowOverlayPlacement,
  sourcePath: string,
  sceneStartMs: number,
  zoneId: string,
): void {
  const timeMs = sceneStartMs + placement.startMs
  const endMs = timeMs + placement.durationMs
  const routed = placementIntervalRouted(record, zoneId, timeMs, endMs)
  if (!routed && record.composition.patternInstances.some(instance => instance.id === placement.instanceId)) {
    if (!report.retiredSilentRuntimeUses.some(retirement => retirement.sourcePath === sourcePath)) {
      report.retiredSilentRuntimeUses.push({
        sourcePlacementId: placement.id,
        sourcePath,
        instanceId: placement.instanceId,
        zoneId,
        startMs: timeMs,
        durationMs: placement.durationMs,
        outcome: 'retired-silent-runtime-use',
      })
    }
    addAccountingLeaves(accounting, sourcePath, placement, 'retired-silent-runtime-use', 'conversion.report.retiredSilentRuntimeUses', false)
    return
  }
  const candidateMappings = report.clipMappings.filter(candidate => candidate.sourcePlacementIds.includes(placement.id))
  const mapping = candidateMappings.find(candidate => {
    const target = record.composition.clips.find(clip => clip.id === candidate.clipId)
    return target && target.startMs <= timeMs && target.startMs + target.durationMs >= endMs
  }) ?? candidateMappings[0]
  const clipIndex = record.composition.clips.findIndex(candidate => candidate.id === mapping?.clipId)
  const clip = record.composition.clips[clipIndex]
  if (!clip) return
  const key = [...clip.appearance.keys].reverse().find(candidate => candidate.timeMs <= timeMs)
  const expectedAppearance = {
    opacity: placement.opacity ?? 1,
    view: placement.view,
    ...(placement.presentation !== undefined ? { presentation: placement.presentation } : {}),
    ...(placement.blink !== undefined ? { blink: placement.blink } : {}),
    ...(placement.transform !== undefined ? { transform: placement.transform } : {}),
    ...(placement.viewport !== undefined ? { aperture: placement.viewport } : {}),
    effects: placement.effects ?? [],
  }
  const logicalId = placement.logicalClipId ?? placement.id
  const intervalCovered = clip.startMs <= timeMs && clip.startMs + clip.durationMs >= endMs
  const mappedLogicalId = mapping?.clipId === logicalId || mapping?.clipId.startsWith(`${logicalId}--layout-`) || mapping?.clipId.startsWith(`${logicalId}--run-`)
  if (mapping && mappedLogicalId && clip.instanceId === placement.instanceId && intervalCovered && JSON.stringify(key?.value) === JSON.stringify(expectedAppearance)) {
    addAccountingLeaves(accounting, sourcePath, placement, 'mapped', `composition.clips.${clipIndex}`)
  }
}

function leafPaths(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [path]
    return value.flatMap((entry, index) => leafPaths(entry, path ? `${path}.${index}` : String(index)))
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) return [path]
    return entries.flatMap(([key, entry]) => leafPaths(entry, path ? `${path}.${key}` : key))
  }
  return [path]
}
