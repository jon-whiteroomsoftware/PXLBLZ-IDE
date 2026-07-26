import type { ShowRecord } from './personalContentRecords'
import { projectShowTimeline } from './showModel'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

export function formatShowTime(timeMs: number): string {
  const tenths = Math.max(0, Math.round((Number.isFinite(timeMs) ? timeMs : 0) / 100))
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths % 10}`
}

export function formatShowClipIdentity(startMs: number, patternName: string): string {
  return `${formatShowIdentityTime(startMs)}: ${patternName}`
}

export function formatShowBoundaryIdentity(startMs: number, incomingPatternNames: string[]): string {
  const [primary, ...additional] = incomingPatternNames
  if (!primary) return formatShowIdentityTime(startMs)
  return `${formatShowClipIdentity(startMs, primary)}${additional.length > 0 ? ` + ${additional.length}` : ''}`
}

export function showBoundaryClipIdentity(show: ShowRecord, afterSceneId: string): string {
  const timeline = projectShowTimeline(show)
  const boundaryIndex = timeline.scenes.findIndex((range) => range.sceneId === afterSceneId)
  const destination = timeline.scenes[boundaryIndex + 1]
  if (!destination) return formatShowIdentityTime(timeline.durationMs)

  const compositionPatterns = show.composition
    ? projectShowUnifiedTimeline(show, show.composition).zones.flatMap((zone) => {
        const orderedLayers = [
          ...zone.layers.filter((layer) => layer.kind === 'main'),
          ...zone.layers.filter((layer) => layer.kind === 'overlay'),
        ]
        return orderedLayers.flatMap((layer) => layer.clips
          .filter((clip) => clip.startMs === destination.startMs)
          .map((clip) => clip.patternName))
      })
    : []
  const legacyPatterns = show.zones.flatMap((zone) => show.cells
    .filter((cell) => cell.zoneId === zone.id && cell.sceneId === destination.sceneId)
    .map((cell) => cell.patternName))

  return formatShowBoundaryIdentity(
    destination.startMs,
    compositionPatterns.length > 0 ? compositionPatterns : legacyPatterns,
  )
}

function formatShowIdentityTime(timeMs: number): string {
  const tenths = Math.max(0, Math.round((Number.isFinite(timeMs) ? timeMs : 0) / 100))
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)
  const secondsAndTenths = `${minutes > 0 ? String(seconds).padStart(2, '0') : seconds}.${tenths % 10}`
  return minutes > 0 ? `${minutes}:${secondsAndTenths}` : secondsAndTenths
}
