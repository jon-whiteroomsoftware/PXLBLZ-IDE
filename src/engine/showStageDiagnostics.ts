import type { ShowStageProjection } from '@/engine/zonePreview'
import type { ShowClipTransform } from '@/engine/personalContentRecords'
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
