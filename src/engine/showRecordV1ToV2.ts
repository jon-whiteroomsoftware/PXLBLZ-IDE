import type {
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPropertyAnimationTarget,
  ShowRecord,
} from './personalContentRecords'
import { projectFlatShowToCompositionV1WithCellOrigins, validateShowComposition } from './showCompositionModel'
import { projectShowTimeline, showLoopDurationMs, type ShowCompileRecipeSourceLookup } from './showModel'
import {
  validateShowRecordV1Structure,
  validateShowRecordV2,
  type ShowClipV2,
  type ShowLayerV2,
  type ShowPropertyTargetV2,
  type ShowRecordV2,
} from './showCompositionV2'

export type ShowV1ToV2IssueCode =
  | 'invalid-v1'
  | 'unknown-source-field'
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
  outcome: 'preserved' | 'mapped' | 'retired-source-structure' | 'refused'
  targetPath?: string
}

export interface ShowV1ToV2Report {
  sourceShowId: string
  accounting: ShowV1ToV2AccountingEntry[]
  unaccountedSourcePaths: string[]
  sceneOffsets: Array<{ sceneId: string; startMs: number; endMs: number }>
  layerMappings: Array<{ sceneId: string; zoneId: string; sourceLayerId: string | 'main'; layerId: string }>
  clipMappings: Array<{ sourcePlacementIds: string[]; clipId: string }>
  markerMappings: Array<{ sourceSceneId: string; markerId: string; timeMs: number }>
  flatProjectionMappings: Array<{ cellId: string; placementIds: string[]; patternInstanceIds: string[] }>
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
  }
  for (const issue of validateShowComposition(sourceShow, composition)) {
    issues.push({ path: `composition.${issue.path}`, code: 'invalid-v1', message: issue.message })
  }
  if ((composition.groupDefinitions?.length ?? 0) > 0 || (composition.groupOccurrences?.length ?? 0) > 0) {
    issues.push({
      path: 'composition.groupDefinitions',
      code: 'unsupported-group',
      message: 'Group Layer bindings require an explicit lossless conversion proof before admission.',
    })
  }
  const routingChanges = show.transitions.filter(transition => transition.kind === 'routing')
  if (routingChanges.length > 0) {
    issues.push({
      path: 'transitions',
      code: 'unsupported-routing-change',
      message: 'Multiple Layout occurrences require the routing parity proof before admission.',
    })
  }
  const visualBoundaries = show.transitions.filter(transition => transition.kind !== 'routing' && transition.kind !== 'cut')
  if (visualBoundaries.length > 0) {
    issues.push({
      path: 'transitions',
      code: 'unsupported-boundary-transition',
      message: 'Whole-boundary visual scope must be converted into explicit participants before admission.',
    })
    if (composition.scenes.some(scene => (scene.propertyTracks?.length ?? 0) > 0)) {
      issues.push({
        path: 'composition.scenes.*.propertyTracks',
        code: 'unsupported-transition-track-activation',
        message: 'Property-track activation during positive Transition contribution requires a dedicated parity proof.',
      })
    }
  }
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
  const { layers, layerIdByOwner } = convertLayers(sourceShow, issues, report)
  const placementSources = collectPlacements(sourceShow, sceneStartById, layerIdByOwner, flatSampleModeByPlacementId)
  const clips = convertClips(placementSources, issues, report)

  if (issues.length > 0) return refused(show, report, issues)

  const clipIdByPlacementId = new Map<string, string>()
  for (const mapping of report.clipMappings) {
    for (const placementId of mapping.sourcePlacementIds) clipIdByPlacementId.set(placementId, mapping.clipId)
  }
  const showEndMs = showLoopDurationMs(show)
  const markers = structuredClone(composition.markers ?? [])
  for (const scene of timeline.scenes) {
    if (markers.some(marker => marker.timeMs === scene.startMs && marker.name === scene.scene.name)) continue
    const markerId = uniqueId(`scene-marker:${scene.sceneId}`, new Set(markers.map(marker => marker.id)))
    markers.push({ id: markerId, timeMs: scene.startMs, name: scene.scene.name })
    report.markerMappings.push({ sourceSceneId: scene.sceneId, markerId, timeMs: scene.startMs })
  }
  markers.sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))

  const propertyTracks = composition.scenes.flatMap((scene, sceneIndex) => {
    const sceneStartMs = sceneStartById.get(scene.sceneId) ?? 0
    return (scene.propertyTracks ?? []).flatMap((track, trackIndex) => {
      const sourcePath = `composition.scenes[${sceneIndex}].propertyTracks[${trackIndex}]`
      const activeDurationMs = show.scenes.find(candidate => candidate.id === scene.sceneId)?.durationMs ?? 0
      if (activeDurationMs <= 0) {
        report.retiredNoContributionPropertyTracks.push({
          sourceTrackId: track.id,
          sourcePath,
          outcome: 'retired-no-contribution-property-track',
        })
        return []
      }
      const activeStartMs = sceneStartMs
      const target = convertPropertyTarget(track.target, clipIdByPlacementId)
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
      sampleRemap: { repeatScale: commonRepeatScale(show, issues) },
      patternInstances: structuredClone(composition.patternInstances),
      layers,
      clips,
      transitions: (composition.transitions ?? []).map((transition) => ({
        ...transitionSettings(transition),
        participants: [{
          id: `${transition.id}:participant:1`,
          zoneId: placementSources.find(source => source.placement.id === transition.fromPlacementId)?.zoneId ?? '',
          layerId: placementSources.find(source => source.placement.id === transition.fromPlacementId)?.layerId ?? '',
          fromClipId: clipIdByPlacementId.get(transition.fromPlacementId) ?? '',
          toClipId: clipIdByPlacementId.get(transition.toPlacementId) ?? '',
        }],
        propertyRamps: [],
      })),
      layoutOccurrences: [{
        id: 'layout-occurrence:1',
        layoutId: show.routingLayouts[0]?.id ?? '',
        startMs: 0,
        durationMs: showEndMs,
        parameters: commonLayoutParameters(show, issues),
      }],
      propertyTracks,
      markers,
      groupDefinitions: [],
      groupOccurrences: [],
    },
    ...(show.outputEffects !== undefined ? { outputEffects: structuredClone(show.outputEffects) } : {}),
    ...(show.importMetadata !== undefined ? { importMetadata: structuredClone(show.importMetadata) } : {}),
    updatedAt: show.updatedAt,
  }

  for (const issue of validateShowRecordV2(record)) {
    issues.push({ path: issue.path, code: 'invalid-v2', message: issue.message })
  }
  if (issues.length > 0) return refused(show, report, issues)
  return { status: 'converted', record, report: finalizeAccounting(show, report, false) }
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

function convertLayers(
  show: ShowRecord,
  issues: ShowV1ToV2Issue[],
  report: ShowV1ToV2Report,
): { layers: ShowLayerV2[]; layerIdByOwner: Map<string, string> } {
  const layers: ShowLayerV2[] = []
  const layerIdByOwner = new Map<string, string>()
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
      const names = new Set(present.map(entry => entry.layer.name))
      if (names.size > 1) {
        issues.push({
          path: `composition.scenes.*.zones[${zone.id}].overlays[${ordinal}].name`,
          code: 'ambiguous-layer',
          message: `Overlay ordinal ${ordinal} in Zone "${zone.id}" has divergent names.`,
        })
      }
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
  return { layers: layers.sort((left, right) => left.zoneId.localeCompare(right.zoneId) || left.rank - right.rank), layerIdByOwner }
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
      const previous = sources[sources.indexOf(source) - 1]
      if (previous.globalStartMs + previous.placement.durationMs !== source.globalStartMs) {
        issues.push({ path: source.placementPath, code: 'discontinuous-logical-clip', message: `Logical Clip "${clipId}" has a gap or overlap between source segments.` })
      }
    }
    const endMs = sources[sources.length - 1].globalStartMs + sources[sources.length - 1].placement.durationMs
    const appearanceValues = sources.map(source => ({
      timeMs: source.globalStartMs,
      value: clipAppearance(source.placement),
    })).filter((entry, index, entries) => (
      index === 0 || JSON.stringify(entry.value) !== JSON.stringify(entries[index - 1].value)
    ))
    clips.push({
      id: clipId,
      instanceId: first.placement.instanceId,
      zoneId: first.zoneId,
      layerId: first.layerId,
      startMs: first.globalStartMs,
      durationMs: endMs - first.globalStartMs,
      entryPolicy: 'continue',
      zoneSampleMode: first.zoneSampleMode,
      appearance: {
        keys: appearanceValues.map((entry, index) => ({
          id: `${clipId}:appearance:${index + 1}`,
          timeMs: entry.timeMs,
          value: entry.value,
        })),
      },
    })
    report.clipMappings.push({ sourcePlacementIds: sources.map(source => source.placement.id), clipId })
  }
  return clips.sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
}

function clipAppearance(placement: ShowMainPlacement | ShowOverlayPlacement) {
  return {
    opacity: placement.opacity ?? 1,
    view: structuredClone(placement.view),
    ...(placement.presentation !== undefined ? { presentation: structuredClone(placement.presentation) } : {}),
    ...(placement.blink !== undefined ? { blink: structuredClone(placement.blink) } : {}),
    ...(placement.transform !== undefined ? { transform: structuredClone(placement.transform) } : {}),
    ...(placement.viewport !== undefined ? { aperture: structuredClone(placement.viewport) } : {}),
    effects: structuredClone(placement.effects ?? []),
  }
}

function convertPropertyTarget(
  target: ShowPropertyAnimationTarget,
  clipIdByPlacementId: Map<string, string>,
): ShowPropertyTargetV2 {
  if (target.kind === 'instance-time-scale' || target.kind === 'instance-control') return structuredClone(target)
  const clipId = clipIdByPlacementId.get(target.placementId) ?? ''
  if (target.kind === 'placement-opacity') return { kind: 'clip-opacity', clipId }
  if (target.kind === 'placement-view') return { kind: 'clip-view', clipId, property: target.property }
  if (target.kind === 'placement-transform') return { kind: 'clip-transform', clipId, property: target.property }
  if (target.kind === 'placement-viewport') return { kind: 'clip-aperture', clipId, property: target.property }
  return {
    kind: 'clip-effect',
    clipId,
    effectId: target.effectId,
    effectKind: target.effectKind,
    parameterId: target.parameterId,
  }
}

function commonRepeatScale(show: ShowRecord, issues: ShowV1ToV2Issue[]): number {
  const values = new Set(show.scenes.map(scene => scene.sampleTargets?.repeatScale ?? 1))
  if (values.size > 1) {
    issues.push({
      path: 'scenes.*.sampleTargets.repeatScale',
      code: 'unsupported-routing-change',
      message: 'Changing repeat scale requires a proved global property track conversion.',
    })
  }
  return values.values().next().value ?? 1
}

function commonLayoutParameters(
  show: ShowRecord,
  issues: ShowV1ToV2Issue[],
): { splitPosition?: number } {
  const splitPositions = show.scenes.map(scene => scene.routingTargets?.splitPosition ?? 0.5)
  const values = new Set(splitPositions)
  if (values.size > 1) {
    issues.push({
      path: 'scenes.*.routingTargets.splitPosition',
      code: 'unsupported-routing-change',
      message: 'Changing split position requires proved Layout-occurrence conversion.',
    })
  }
  const splitPosition = splitPositions[0] ?? 0.5
  return show.scenes.some(scene => scene.routingTargets?.splitPosition !== undefined)
    ? { splitPosition }
    : {}
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
    markerMappings: [],
    flatProjectionMappings: [],
    retiredStructuralCuts: [],
    retiredNoContributionPropertyTracks: [],
  }
}

function refused(show: ShowRecord, report: ShowV1ToV2Report, issues: ShowV1ToV2Issue[]): ShowV1ToV2Result {
  return { status: 'refused', issues, report: finalizeAccounting(show, report, true) }
}

function finalizeAccounting(show: ShowRecord, report: ShowV1ToV2Report, isRefused: boolean): ShowV1ToV2Report {
  const paths = leafPaths(show)
  report.accounting = paths.map(sourcePath => ({
    sourcePath,
    outcome: isRefused ? 'refused' : accountingOutcome(sourcePath, show, report),
    ...(isRefused ? {} : { targetPath: targetForSourcePath(sourcePath, show, report) }),
  }))
  report.unaccountedSourcePaths = paths.filter(path => !report.accounting.some(entry => entry.sourcePath === path))
  return report
}

function accountingOutcome(
  path: string,
  show: ShowRecord,
  report: ShowV1ToV2Report,
): ShowV1ToV2AccountingEntry['outcome'] {
  if (retiredCutForPath(path, show, report)) return 'retired-source-structure'
  if (path.startsWith('scenes.') || path.startsWith('composition.scenes.') || path.startsWith('cells.')) {
    return 'retired-source-structure'
  }
  return path.startsWith('composition.') || path.startsWith('transitions.') ? 'mapped' : 'preserved'
}

function targetForSourcePath(path: string, show: ShowRecord, report: ShowV1ToV2Report): string {
  if (retiredCutForPath(path, show, report)) return 'composition.clips/markers'
  if (path.startsWith('scenes.')) return 'composition.markers/layoutOccurrences/clips'
  if (path.startsWith('cells.')) return 'composition.patternInstances/clips'
  if (path.startsWith('composition.scenes.')) return 'composition.layers/clips/propertyTracks'
  if (path.startsWith('transitions.')) return 'composition.transitions/layoutOccurrences'
  if (path === 'routingLayouts' || path.startsWith('routingLayouts.')) return path.replace('routingLayouts', 'zoneLayouts')
  return path
}

function retiredCutForPath(path: string, show: ShowRecord, report: ShowV1ToV2Report): boolean {
  const match = /^transitions\.(\d+)(?:\.|$)/.exec(path)
  if (!match) return false
  const transition = show.transitions[Number(match[1])]
  return Boolean(transition && report.retiredStructuralCuts.some(cut => cut.sourceTransitionId === transition.id))
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
