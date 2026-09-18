import type { GeneratedShowArtifact } from './showCompiler'
import {
  validateInstallationCoverage,
  type InstallationCoverage,
} from './showInstallationCoverage'
import {
  buildShowStageClipDiagnosticPoints,
  buildShowStageDiagnosticRects,
  type ShowStageDiagnosticRect,
} from './showStageDiagnostics'
import { normalizeShowClipTransform } from './showClipTransform'
import {
  groupOccurrenceLocalTimeAtV2,
  occurrenceBoundaryAfter,
  occurrenceBoundaryBefore,
} from './showGroupsV2'
import { applyNormalizeMode, type MapPoint, type PixelMap } from './maps'
import {
  buildShowStripsLayout,
  showLogicalAspectAdvisory,
} from './zonePreview'
import { buildShowStageOccurrenceProjectionV2 } from './showStagePresentationV2'
import type { ShowClipAppearanceKeyV2, ShowRecordV2 } from './showCompositionV2'
import type {
  ShowPreparedStageEditCaptureV2,
  ShowPreparedStageAssetPayloadV2,
  ShowPreparedStageLayoutV2,
} from './showPreparedStageV2'
import { showStageRecordDigestV2 } from './showPreparedStageV2'

export interface ShowEditorStagePresentationV2 {
  readonly showId: string
  readonly updatedAt: number
  readonly digest: string
  readonly status: 'ready' | 'empty' | 'refused'
  readonly artifact: GeneratedShowArtifact | null
  readonly layout: ShowPreparedStageLayoutV2
  readonly selectedStageMap: { readonly id: string; readonly name: string; readonly dim: 2 | 3 } | null
  readonly stageIdentityRole: string
  readonly installationCoverage: InstallationCoverage | null
  readonly durationMs: number
  readonly error: string | null
  diagnosticFrameAt(focus: ShowEditorStageDiagnosticFocusV2 | null, timeMs: number): ShowEditorStageDiagnosticFrame
}

export interface ShowEditorStageDiagnosticFocusV2 {
  readonly recordVersion: 2
  readonly showId: string
  readonly zoneId: string
  /** Authored ordinary or Group-definition Clip identity. */
  readonly clipId: string | null
  /** Authored Group occurrence identity; null for an ordinary Clip. */
  readonly occurrenceId: string | null
}

export interface ShowEditorStageDiagnosticFrame {
  readonly rects: readonly ShowStageDiagnosticRect[]
  readonly clipPoints: readonly [number, number][] | null
}

/** Project one captured authored-v2 Show into the existing Stage presentation vocabulary. */
export function projectShowEditorStagePresentationV2(
  capture: ShowPreparedStageEditCaptureV2,
): ShowEditorStagePresentationV2 {
  const bundle = capture.prepared.status === 'ready' ? capture.prepared.bundle : null
  const qualified = capture.inputCapture.status === 'qualified' ? capture.inputCapture.inputs : null
  const record = bundle?.record ?? qualified?.record ?? capture.record
  const assets = bundle?.assets ?? qualified?.assets ?? capture.dependencies
  const stageMap = bundle
    ? capture.inputCapture.status === 'qualified' ? capture.inputCapture.inputs.stageMap : null
    : qualified?.stageMap ?? null
  const layout = bundle?.presentation.layout ?? buildStageShellLayout(record, assets, stageMap)
  const durationMs = bundle?.presentation.durationMs ?? record.composition.showEndMs
  return {
    showId: record.id,
    updatedAt: record.updatedAt,
    digest: bundle?.digest ?? showStageRecordDigestV2(record),
    status: capture.prepared.status,
    artifact: bundle?.artifact ?? null,
    layout,
    selectedStageMap: bundle?.presentation.stageMap
      ?? (stageMap && (stageMap.dim === 2 || stageMap.dim === 3)
        ? { id: stageMap.id, name: stageMap.name, dim: stageMap.dim }
        : null),
    stageIdentityRole: bundle?.presentation.stageIdentityRole
      ?? (record.outputContract.kind === 'installation' ? 'Output map' : 'Reference map'),
    installationCoverage: bundle?.presentation.installationCoverage ?? validateInstallationCoverage({
      outputContract: record.outputContract,
      routingLayouts: record.zoneLayouts,
    }),
    durationMs,
    error: capture.prepared.status === 'refused' ? capture.prepared.message : null,
    diagnosticFrameAt: createDiagnosticFrameReader(record, layout),
  }
}

/**
 * Read the Stage diagnostic frame owning one instant. Like the v1 reader, the
 * returned frame is a stable object for every instant inside the same Layout
 * occurrence and held appearance key, so a transport subscriber sees one
 * unchanged snapshot across ordinary playback instead of a new object per tick.
 */
function createDiagnosticFrameReader(
  record: ShowRecordV2,
  layout: ShowPreparedStageLayoutV2,
): (focus: ShowEditorStageDiagnosticFocusV2 | null, timeMs: number) => ShowEditorStageDiagnosticFrame {
  const rectsByLayoutOccurrenceId = new Map<string, readonly ShowStageDiagnosticRect[]>()
  const framesByKey = new Map<string, ShowEditorStageDiagnosticFrame>()
  const layoutOccurrences = [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  const reversedLayoutOccurrences = [...layoutOccurrences].reverse()

  const rectsAt = (timeMs: number): readonly ShowStageDiagnosticRect[] => {
    if (layout.draw.kind !== '2d') return EMPTY_RECTS
    const occurrence = reversedLayoutOccurrences.find(candidate => candidate.startMs <= timeMs)
      ?? layoutOccurrences[0]
    const key = occurrence?.id ?? ''
    const cached = rectsByLayoutOccurrenceId.get(key)
    if (cached) return cached
    const projection = layout.kind !== 'map' || !occurrence || occurrence.startMs === 0
      ? layout.projection
      : buildShowStageOccurrenceProjectionV2(record, occurrence.layoutId, {
          mapPoints: layout.mapPoints,
          splitPosition: occurrence.parameters.splitPosition ?? 0.5,
        })
    const rects = buildShowStageDiagnosticRects(
      layout.draw.kind === '2d' ? layout.draw.positions : [],
      projection,
    )
    rectsByLayoutOccurrenceId.set(key, rects)
    return rects
  }

  const frame = (
    cacheKey: string,
    rects: readonly ShowStageDiagnosticRect[],
    buildClipPoints: () => readonly [number, number][] | null,
  ): ShowEditorStageDiagnosticFrame => {
    const cached = framesByKey.get(cacheKey)
    if (cached) return cached
    const built: ShowEditorStageDiagnosticFrame = { rects, clipPoints: buildClipPoints() }
    framesByKey.set(cacheKey, built)
    return built
  }

  return (focus, timeMs) => {
    const rects = rectsAt(timeMs)
    const occurrence = reversedLayoutOccurrences.find(candidate => candidate.startMs <= timeMs)
      ?? layoutOccurrences[0]
    const layoutKey = occurrence?.id ?? ''
    if (!focus || focus.showId !== record.id || !focus.clipId) {
      return frame(`${layoutKey}|unfocused`, rects, () => null)
    }
    const zone = rects.find(candidate => candidate.zoneId === focus.zoneId)
    const hiddenKey = `${layoutKey}|hidden|${focus.zoneId}|${focus.clipId}|${focus.occurrenceId ?? ''}`
    if (!zone) return frame(hiddenKey, rects, () => null)
    if (focus.occurrenceId) {
      const groupOccurrence = record.composition.groupOccurrences
        .find(candidate => candidate.id === focus.occurrenceId)
      const definition = groupOccurrence
        ? record.composition.groupDefinitions.find(candidate => candidate.id === groupOccurrence.definitionId)
        : undefined
      const child = definition?.clips.find(candidate => candidate.id === focus.clipId)
      if (!groupOccurrence || !child || groupOccurrence.zoneId !== focus.zoneId) {
        return frame(hiddenKey, rects, () => null)
      }
      const startMs = occurrenceBoundaryAfter(groupOccurrence, child.startMs)
      const endMs = occurrenceBoundaryBefore(groupOccurrence, child.startMs + child.durationMs)
      if (timeMs < startMs || timeMs >= endMs) return frame(hiddenKey, rects, () => null)
      const localTimeMs = groupOccurrenceLocalTimeAtV2(groupOccurrence, timeMs)
      const key = heldAppearanceKey(child.appearance.keys, localTimeMs)
      if (!key) return frame(hiddenKey, rects, () => null)
      return frame(
        `${layoutKey}|group|${groupOccurrence.id}|${child.id}|${key.id}`,
        rects,
        () => {
          const transform = normalizeShowClipTransform(key.value.transform)
          return buildShowStageClipDiagnosticPoints(zone, {
            ...transform,
            positionX: transform.positionX + groupOccurrence.translationX,
            positionY: transform.positionY + groupOccurrence.translationY,
          })
        },
      )
    }
    const clip = record.composition.clips.find(candidate => candidate.id === focus.clipId)
    if (!clip || clip.zoneId !== focus.zoneId || timeMs < clip.startMs || timeMs >= clip.startMs + clip.durationMs) {
      return frame(hiddenKey, rects, () => null)
    }
    const key = heldAppearanceKey(clip.appearance.keys, timeMs)
    return frame(
      `${layoutKey}|clip|${clip.id}|${key?.id ?? 'none'}`,
      rects,
      () => key ? buildShowStageClipDiagnosticPoints(zone, normalizeShowClipTransform(key.value.transform)) : null,
    )
  }
}

const EMPTY_RECTS: readonly ShowStageDiagnosticRect[] = []

function heldAppearanceKey(
  keys: readonly ShowClipAppearanceKeyV2[],
  atMs: number,
): ShowClipAppearanceKeyV2 | undefined {
  const ordered = [...keys].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  let held = ordered[0]
  for (const candidate of ordered) {
    if (candidate.timeMs <= atMs) held = candidate
    else break
  }
  return held
}

function buildStageShellLayout(
  record: ShowRecordV2,
  assets: ShowPreparedStageAssetPayloadV2,
  map: PixelMap | null,
): ShowPreparedStageLayoutV2 {
  if (!map || (map.dim !== 2 && map.dim !== 3)) {
    const strips = buildShowStripsLayout(record.zones)
    return {
      kind: 'strips',
      mapPoints: strips.mapPoints,
      draw: { kind: '2d', positions: strips.positions },
      projection: strips.projection,
      label: 'Zone strips - generic',
      note: record.stageMapId ? 'The saved stage map is gone, so this show is previewing as generic strips.' : null,
    }
  }
  const stageDimension = map.dim
  const profile = assets.profiles.find(candidate => candidate.id === record.targetControllerProfileId) ?? assets.profiles[0]
  const zoneTotal = record.zones.reduce((total, zone) => total + Math.max(0, Math.floor(zone.nominalPixelCount)), 0)
  const declaredPixelCount = record.outputContract.kind === 'installation'
    ? record.outputContract.pixelCount
    : record.outputContract.referencePixelCount
  const pixelCount = Math.max(1, declaredPixelCount ?? map.bakedCount ?? profile?.lastKnownPixelCount
    ?? (zoneTotal || (stageDimension === 3 ? 512 : 1024)))
  const resolved = applyNormalizeMode(map.resolve(pixelCount), 'contain')
  const mapPoints: MapPoint[] = resolved.map(point => {
    const raw = point.pos ?? point.sample
    const pos: [number, number] | [number, number, number] = stageDimension === 3
      ? [raw[0] ?? 0.5, raw[1] ?? 0.5, raw[2] ?? 0.5]
      : [raw[0] ?? 0.5, raw[1] ?? 0.5]
    return { sample: [...pos], pos }
  })
  const occurrence = record.composition.layoutOccurrences.find(candidate => candidate.startMs === 0)
    ?? record.composition.layoutOccurrences[0]
  const projection = occurrence
    ? buildShowStageOccurrenceProjectionV2(record, occurrence.layoutId, {
        mapPoints,
        splitPosition: occurrence.parameters.splitPosition ?? 0.5,
      })
    : buildShowStripsLayout(record.zones).projection
  const draw: ShowPreparedStageLayoutV2['draw'] = stageDimension === 3
    ? { kind: '3d', positions: mapPoints.map(point => [point.pos![0], point.pos![1], point.pos![2] ?? 0.5]) }
    : { kind: '2d', positions: mapPoints.map(point => [point.pos![0], point.pos![1]]) }
  const activeLayout = record.zoneLayouts.find(candidate => candidate.id === occurrence?.layoutId)
  const logical = record.outputContract.kind === 'portable-2d' ? activeLayout?.logical : undefined
  return {
    kind: 'map',
    mapPoints,
    sampleDimension: stageDimension,
    draw,
    projection,
    label: map.name,
    note: logical ? showLogicalAspectAdvisory(mapPoints, logical) : null,
  }
}
