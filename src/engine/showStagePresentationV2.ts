import type { MapPoint } from './maps'
import type { ShowRecordV2 } from './showCompositionV2'
import { installationPhysicalZones } from './showInstallationCoverage'
import { buildShowStageDiagnosticRects, type ShowStageDiagnosticRect } from './showStageDiagnostics'
import {
  buildShowLogicalStageProjection,
  buildShowStageProjection,
  type ShowStageProjection,
  type ShowStageZone,
} from './zonePreview'

/**
 * Native time-aware Stage presentation for prepared v2 preview (#1038).
 *
 * A Show routes its Zones through one Layout occurrence at a time, so one
 * Stage pixel can belong to different Zones - or to none - at different Show
 * times. These windows describe that ownership for presentation only: Zone
 * isolation, unstaged dimming and authored Zone guides. Generated output, the
 * compiled artifact, runtime state and captured identity never consult them.
 */
export type ShowStagePresentationKindV2 = 'occurrence' | 'transfer'

export interface ShowStagePresentationWindowV2 {
  readonly layoutOccurrenceId: string
  readonly layoutId: string
  /** A timed incoming transfer keeps its source Layout visible while it blends. */
  readonly kind: ShowStagePresentationKindV2
  readonly startMs: number
  readonly endMs: number
  readonly projection: ShowStageProjection
  readonly guideRects: readonly ShowStageDiagnosticRect[]
}

/** The prepared Stage layout, narrowed to what presentation reads. */
export interface ShowStagePresentationLayoutV2 {
  readonly kind: 'strips' | 'map'
  readonly mapPoints: readonly MapPoint[]
  /** Projection of the Layout active at zero; unmapped Stages keep it throughout. */
  readonly projection: ShowStageProjection
  readonly draw:
    | { readonly kind: '2d'; readonly positions: readonly [number, number][] }
    | { readonly kind: '3d'; readonly positions: readonly [number, number, number][] }
}

export type ShowStagePresentationRecordV2 = Pick<ShowRecordV2, 'zones' | 'zoneLayouts' | 'outputContract'>

/**
 * Project one Layout definition onto the Stage pixels. Preparation and preview
 * share this owner so the occurrence active at zero keeps one description.
 */
export function buildShowStageOccurrenceProjectionV2(
  record: ShowStagePresentationRecordV2,
  layoutId: string,
  context: { mapPoints: readonly MapPoint[]; splitPosition: number },
): ShowStageProjection {
  const layout = record.zoneLayouts.find(candidate => candidate.id === layoutId)
  const logical = record.outputContract.kind === 'portable-2d' ? layout?.logical : undefined
  if (logical) {
    return buildShowLogicalStageProjection(record.zones, [...context.mapPoints], logical, {
      splitPosition: context.splitPosition,
    })
  }
  return buildShowStageProjection(record.zones, context.mapPoints.length, {
    controllerZones: installationPhysicalZones({
      outputContract: record.outputContract,
      zones: record.zones,
      routingLayouts: record.zoneLayouts,
    }, layoutId),
  })
}

/**
 * Derive the ordered presentation windows covering the Show. Occurrences are
 * half-open and cover `[0, showEndMs)`; a positive incoming transfer splits its
 * destination occurrence into a blending window and a steady window.
 */
export function buildShowStagePresentationWindowsV2(
  record: ShowRecordV2,
  layout: ShowStagePresentationLayoutV2,
  options: { initialSplitPosition?: number } = {},
): ShowStagePresentationWindowV2[] {
  const occurrences = [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  const positions = layout.draw.kind === '2d' ? layout.draw.positions : null
  const projections = new Map<string, ShowStageProjection>()
  const guides = new Map<ShowStageProjection, readonly ShowStageDiagnosticRect[]>()

  const splitPositionFor = (index: number): number => {
    const occurrence = occurrences[index]
    const authored = occurrence.parameters.splitPosition ?? 0.5
    return occurrence.startMs === 0 ? options.initialSplitPosition ?? authored : authored
  }
  const projectionFor = (index: number): ShowStageProjection => {
    if (layout.kind !== 'map') return layout.projection
    const occurrence = occurrences[index]
    const splitPosition = splitPositionFor(index)
    const key = `${occurrence.layoutId}:${splitPosition}`
    const cached = projections.get(key)
    if (cached) return cached
    const projection = buildShowStageOccurrenceProjectionV2(record, occurrence.layoutId, {
      mapPoints: layout.mapPoints,
      splitPosition,
    })
    projections.set(key, projection)
    return projection
  }
  const guidesFor = (projection: ShowStageProjection): readonly ShowStageDiagnosticRect[] => {
    if (!positions) return []
    const cached = guides.get(projection)
    if (cached) return cached
    const rects = buildShowStageDiagnosticRects([...positions], projection)
    guides.set(projection, rects)
    return rects
  }
  const blended = (destination: ShowStageProjection, source: ShowStageProjection): ShowStageProjection => {
    const pixelZoneIds = destination.pixelZoneIds.map((zoneId, index) => zoneId ?? source.pixelZoneIds[index] ?? null)
    return {
      zones: destination.zones.map(zone => mergeZone(zone, pixelZoneIds)),
      pixelZoneIds,
      unstagedPixelCount: pixelZoneIds.filter(zoneId => zoneId === null).length,
    }
  }

  return occurrences.flatMap((occurrence, index) => {
    const projection = projectionFor(index)
    const endMs = occurrence.startMs + occurrence.durationMs
    const transfer = occurrence.incomingTransfer
    const previous = index > 0 ? projectionFor(index - 1) : null
    const transferEndMs = transfer ? Math.min(endMs, occurrence.startMs + transfer.durationMs) : occurrence.startMs
    const steady: ShowStagePresentationWindowV2 = {
      layoutOccurrenceId: occurrence.id,
      layoutId: occurrence.layoutId,
      kind: 'occurrence',
      startMs: transferEndMs > occurrence.startMs ? transferEndMs : occurrence.startMs,
      endMs,
      projection,
      guideRects: guidesFor(projection),
    }
    if (!transfer || !previous || transferEndMs <= occurrence.startMs) return [steady]
    const blend = blended(projection, previous)
    return [{
      layoutOccurrenceId: occurrence.id,
      layoutId: occurrence.layoutId,
      kind: 'transfer' as const,
      startMs: occurrence.startMs,
      endMs: transferEndMs,
      projection: blend,
      guideRects: guidesFor(blend),
    }, steady]
  })
}

/**
 * Resolve the window owning a playback instant. Elapsed playback time wraps at
 * Show End exactly like the transport position the frame reports.
 */
export function showStagePresentationWindowAtV2(
  windows: readonly ShowStagePresentationWindowV2[],
  showEndMs: number,
  timeMs: number,
): ShowStagePresentationWindowV2 | null {
  if (windows.length === 0) return null
  if (!Number.isFinite(timeMs)) return windows[0]
  const wrapped = showEndMs > 0 ? ((Math.floor(timeMs) % showEndMs) + showEndMs) % showEndMs : 0
  return windows.find(window => window.startMs <= wrapped && window.endMs > wrapped)
    ?? windows[windows.length - 1]
}

function mergeZone(destination: ShowStageZone, pixelZoneIds: Array<string | null>): ShowStageZone {
  const pixelCount = pixelZoneIds.filter(zoneId => zoneId === destination.id).length
  return {
    ...destination,
    pixelCount: pixelCount || destination.pixelCount,
    offStage: pixelCount === 0,
  }
}
