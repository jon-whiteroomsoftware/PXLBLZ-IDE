import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { effectiveShowClipsV2 } from './showGroupsV2'
import type { ShowTimelineMarker } from './personalContentRecords'

/** Generic in the marker shape so a v2 Marker keeps its `role` for the caller. */
export function selectedShowMarkerV2<Marker extends { id: string }>(
  markers: readonly Marker[],
  selectedId: string,
): Marker | undefined {
  return markers.find(marker => marker.id === selectedId) ?? markers[0]
}
/** Caller-owned deterministic fresh identity for an explicit Add intent. */
export function newShowPilotMarkerV2(markers: readonly ShowTimelineMarker[]): ShowTimelineMarker {
  const ids = new Set(markers.map(marker => marker.id))
  let index = 1
  while (ids.has(`marker:${index}`)) index++
  const names = new Set(markers.map(marker => marker.name))
  let nameIndex = 1
  while (names.has(`Marker ${nameIndex}`)) nameIndex++
  return { id: `marker:${index}`, timeMs: 0, name: `Marker ${nameIndex}` }
}

/** Explicit empty-content admission, never a compiler-failure fallback. */
export function isValidatedEmptyShowV2(record: ShowRecordV2): boolean {
  if (validateShowRecordV2(record).length) return false
  try { return effectiveShowClipsV2(record).length === 0 } catch { return false }
}
