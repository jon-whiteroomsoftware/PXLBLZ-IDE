import { projectShowLayoutIntervals, showLayoutIntervalAtTime } from './showLayoutIntervals'
import { projectShowTimeline } from './showModel'
import { materializeShowGroupOccurrences } from './showGroupModel'
import { installationPhysicalZones } from './showInstallationCoverage'
import { buildShowLogicalStageProjection, buildShowStageProjection } from './zonePreview'
import type { MapPoint } from './maps'
import type { ShowStageProjection } from '@/engine/zonePreview'
import type { ShowRecord, ShowClipTransform } from '@/engine/personalContentRecords'
import { normalizeShowClipTransform } from '@/engine/showClipTransform'

export interface ShowStageDiagnosticRect {
  zoneId: string
  name: string
  color: string
  x: number
  y: number
  width: number
  height: number
}

const MIN_EXTENT = 0.02

/** Map a Clip's authored, rotated content bounds into its Zone's Stage rectangle. */
export function buildShowStageClipDiagnosticPoints(
  zone: ShowStageDiagnosticRect,
  authoredTransform: Partial<ShowClipTransform> | undefined,
): [number, number][] {
  const transform = normalizeShowClipTransform(authoredTransform)
  const centerX = 0.5 + transform.positionX
  const centerY = 0.5 + transform.positionY
  const halfWidth = transform.scaleX / 2
  const halfHeight = transform.scaleY / 2
  const radians = transform.rotation * Math.PI * 2
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)

  return [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ].map(([x, y]) => {
    const localX = centerX + x * cosine - y * sine
    const localY = centerY + x * sine + y * cosine
    return [zone.x + localX * zone.width, zone.y + localY * zone.height]
  })
}

/** Build read-only 2D Stage guides without touching rendered Show pixels. */
export function buildShowStageDiagnosticRects(
  positions: [number, number][],
  projection: ShowStageProjection,
): ShowStageDiagnosticRect[] {
  return projection.zones.flatMap((zone) => {
    if (zone.offStage) return []
    const points = positions.filter((_, index) => projection.pixelZoneIds[index] === zone.id)
    if (points.length === 0) return []

    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    let x = Math.min(...xs)
    let y = Math.min(...ys)
    let width = Math.max(...xs) - x
    let height = Math.max(...ys) - y
    if (width < MIN_EXTENT) {
      x = Math.max(0, x - MIN_EXTENT / 2)
      width = Math.min(1 - x, MIN_EXTENT)
    }
    if (height < MIN_EXTENT) {
      y = Math.max(0, y - MIN_EXTENT / 2)
      height = Math.min(1 - y, MIN_EXTENT)
    }
    return [{ zoneId: zone.id, name: zone.name, color: zone.color, x, y, width, height }]
  })
}

export interface ShowStageDiagnosticFocus {
  sceneId: string
  zoneId: string
  placementId: string | null
}

/** Build stable diagnostic frames once per authored input, never per rendered frame.
 * Bounds describe sampled, axis-aligned Zones and authored content transforms;
 * they do not evaluate aperture clipping, placement animation or routing blends.
 */
export function createShowStageDiagnostics(
  show: ShowRecord,
  positions: [number, number][],
  mapPoints: MapPoint[],
  fallbackProjection: ShowStageProjection,
  mapped: boolean,
  focus: ShowStageDiagnosticFocus | null,
): (positionMs: number) => { rects: ShowStageDiagnosticRect[]; clipPoints: [number, number][] | null } {
  const intervals = projectShowLayoutIntervals(show)
  const timeline = projectShowTimeline(show)
  const composition = show.composition ? materializeShowGroupOccurrences(show.composition) : null
  const selectedCell = show.cells.find(cell => cell.id === focus?.placementId)
  const selectedPlacement = composition?.scenes.flatMap(scene => scene.zones.flatMap(zone => [
    ...zone.main, ...zone.overlays.flatMap(layer => layer.placements),
  ])).find(placement => placement.id === focus?.placementId)
  const logicalId = selectedPlacement?.logicalClipId ?? selectedPlacement?.id
  const activeRanges = composition && !selectedCell
    ? composition.scenes.flatMap(scene => {
        const start = timeline.scenes.find(range => range.sceneId === scene.sceneId)?.startMs ?? 0
        return scene.zones.filter(zone => zone.zoneId === focus?.zoneId).flatMap(zone => [
          ...zone.main, ...zone.overlays.flatMap(layer => layer.placements),
        ]).filter(placement => placement.id === focus?.placementId || (logicalId && (placement.logicalClipId ?? placement.id) === logicalId))
          .map(placement => ({ startMs: start + placement.startMs, endMs: start + placement.startMs + placement.durationMs, transform: placement.transform }))
      })
    : timeline.rows.flatMap(row => row.cells).filter(cell => cell.id === selectedCell?.id)
      .map(cell => ({ startMs: cell.startMs, endMs: cell.endMs, transform: selectedCell?.transform }))
  const frames = timeline.scenes.map(scene => {
    const interval = showLayoutIntervalAtTime(intervals, scene.startMs)
    const routing = show.routingLayouts.find(layout => layout.id === interval?.layoutId)
    const projection = !mapped ? fallbackProjection
      : show.outputContract?.kind === 'portable-2d' && routing?.logical
        ? buildShowLogicalStageProjection(show.zones, mapPoints, routing.logical, {
            splitPosition: scene.scene.routingTargets?.splitPosition ?? 0.5,
          })
        : show.outputContract?.kind === 'installation'
          ? buildShowStageProjection(show.zones, mapPoints.length, {
              controllerZones: installationPhysicalZones(show, routing?.id),
            })
          : fallbackProjection
    const rects = buildShowStageDiagnosticRects(positions, projection)
    const zone = rects.find(rect => rect.zoneId === focus?.zoneId)
    const hidden = { rects, clipPoints: null }
    return {
      startMs: scene.startMs,
      hidden,
      active: activeRanges.map(range => ({
        ...range,
        frame: { rects, clipPoints: zone ? buildShowStageClipDiagnosticPoints(zone, range.transform) : null },
      })),
    }
  })
  const reverseFrames = [...frames].reverse()
  const empty = { rects: [], clipPoints: null }
  return positionMs => {
    const frame = reverseFrames.find(candidate => candidate.startMs <= positionMs) ?? frames[0]
    if (!frame) return empty
    return frame.active.find(range => positionMs >= range.startMs && positionMs < range.endMs)?.frame ?? frame.hidden
  }
}
