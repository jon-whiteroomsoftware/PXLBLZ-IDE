import type { ShowMarkerV2, ShowRecordV2 } from './showCompositionV2'

/**
 * One projected narrative chapter. `durationMs` is derived from the next
 * chapter start (Show End for the last one), never authored: a Marker owns a
 * time, not a partition.
 */
export interface ShowChapterV2 {
  id: string
  timeMs: number
  durationMs: number
  name?: string
  color?: string
}

/**
 * Gallery, reading-card and Live chapter projection: `role: chapter` Markers
 * only, ordered by `(timeMs, id)` with the exact UTF-16 code-unit tie-break the
 * Marker owner stores. General Markers never project, equal-time chapters stay
 * distinct selectable entries, and no chapter is ever synthesized.
 */
export function showChaptersV2(record: ShowRecordV2): ShowChapterV2[] {
  const chapters = record.composition.markers
    .filter((marker): marker is ShowMarkerV2 & { role: 'chapter' } => marker.role === 'chapter')
    .slice()
    .sort((left, right) => left.timeMs - right.timeMs || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  return chapters.map((marker, index) => {
    // A chapter reads until the next one, and never past Show End: a dormant
    // guide beyond the loop projects a zero span rather than a phantom act.
    const endMs = Math.min(chapters[index + 1]?.timeMs ?? record.composition.showEndMs, record.composition.showEndMs)
    const projection: ShowChapterV2 = {
      id: marker.id,
      timeMs: marker.timeMs,
      durationMs: Math.max(0, endMs - marker.timeMs),
    }
    if (marker.name !== undefined) projection.name = marker.name
    if (marker.color !== undefined) projection.color = marker.color
    return projection
  })
}

/**
 * Index of the chapter in effect at `timeMs`, or `-1` before the first one
 * starts. Equal-time chapters resolve to the last one in projection order, so
 * the selection is deterministic without merging their identities.
 */
export function showChapterIndexAtV2(chapters: readonly ShowChapterV2[], timeMs: number): number {
  let index = -1
  for (const [candidate, chapter] of chapters.entries()) {
    if (chapter.timeMs <= timeMs) index = candidate
  }
  return index
}
