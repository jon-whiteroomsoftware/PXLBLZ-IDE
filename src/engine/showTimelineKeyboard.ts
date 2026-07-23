import type { ShowUnifiedTimelineProjection } from './showUnifiedTimelineProjection'

export type ShowTimelineTraversalTarget =
  | { kind: 'clip'; clipId: string }
  | { kind: 'group'; occurrenceId: string }
  | { kind: 'group-clip'; occurrenceId: string; placementId: string }

interface OrderedTraversalTarget {
  target: ShowTimelineTraversalTarget
  startMs: number
  zoneIndex: number
  layerIndex: number
  stableId: string
}

/**
 * Resolve the Clip-focused keyboard order independently of DOM layout. Groups
 * are one structural target until isolation discloses their child Clips.
 */
export function projectShowTimelineTraversalTargets(
  timeline: ShowUnifiedTimelineProjection,
  isolatedGroupOccurrenceId: string | null = null,
): ShowTimelineTraversalTarget[] {
  const ordered: OrderedTraversalTarget[] = []

  timeline.zones.forEach((zone, zoneIndex) => {
    if (!isolatedGroupOccurrenceId) {
      for (const group of zone.groups) {
        ordered.push({
          target: { kind: 'group', occurrenceId: group.id },
          startMs: group.startMs,
          zoneIndex,
          layerIndex: group.topLayerIndex,
          stableId: `group:${group.id}`,
        })
      }
    }

    for (const layer of zone.layers) {
      for (const clip of layer.clips) {
        if (isolatedGroupOccurrenceId) {
          if (clip.groupOccurrenceId !== isolatedGroupOccurrenceId) continue
          const prefix = `${isolatedGroupOccurrenceId}:`
          if (!clip.id.startsWith(prefix)) continue
          ordered.push({
            target: {
              kind: 'group-clip',
              occurrenceId: isolatedGroupOccurrenceId,
              placementId: clip.id.slice(prefix.length),
            },
            startMs: clip.startMs,
            zoneIndex,
            layerIndex: clip.layerIndex,
            stableId: clip.id,
          })
          continue
        }
        if (clip.groupOccurrenceId) continue
        ordered.push({
          target: { kind: 'clip', clipId: clip.id },
          startMs: clip.startMs,
          zoneIndex,
          layerIndex: clip.layerIndex,
          stableId: clip.id,
        })
      }
    }
  })

  return ordered
    .sort((left, right) => (
      left.startMs - right.startMs
      || left.zoneIndex - right.zoneIndex
      || left.layerIndex - right.layerIndex
      || left.stableId.localeCompare(right.stableId)
    ))
    .map((entry) => entry.target)
}

export function nextShowTimelineTraversalTarget(
  targets: ShowTimelineTraversalTarget[],
  current: ShowTimelineTraversalTarget | null,
  direction: -1 | 1,
): ShowTimelineTraversalTarget | null {
  if (targets.length === 0) return null
  const currentKey = current ? showTimelineTraversalTargetKey(current) : null
  const currentIndex = currentKey === null
    ? -1
    : targets.findIndex((target) => showTimelineTraversalTargetKey(target) === currentKey)
  if (currentIndex < 0) return direction === 1 ? targets[0] : targets[targets.length - 1]
  return targets[(currentIndex + direction + targets.length) % targets.length]
}

export function showTimelineTraversalTargetKey(target: ShowTimelineTraversalTarget): string {
  if (target.kind === 'clip') return `clip:${target.clipId}`
  if (target.kind === 'group') return `group:${target.occurrenceId}`
  return `group-clip:${target.occurrenceId}:${target.placementId}`
}
