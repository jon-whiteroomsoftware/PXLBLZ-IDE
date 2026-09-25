import type { ShowGroupSelection } from './showGroupModel'
import type { ShowRecordV2 } from './showCompositionV2'
import { showEditorTransitionIdsV2 } from './showEditorTimelinePresentation'

/** Structural counterpart of the editor selection, kept free of store imports. */
export type ShowSelectionForExistenceV2 =
  | { kind: 'clip'; clipId: string }
  | { kind: 'transition'; transitionId: string }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'zone-layout'; layoutId: string; intervalId?: string }
  | { kind: 'group'; occurrenceId: string }
  | { kind: 'group-clip'; occurrenceId: string; placementId: string }
  | { kind: 'multi'; groupSelection: ShowGroupSelection }
  | { kind: 'show' }

export function showSelectionExistsV2(
  record: ShowRecordV2,
  selection: ShowSelectionForExistenceV2,
): boolean {
  const { composition } = record
  if (selection.kind === 'show') return true
  if (selection.kind === 'clip') {
    return composition.clips.some((clip) => clip.id === selection.clipId)
  }
  if (selection.kind === 'transition') {
    return showEditorTransitionIdsV2(record).has(selection.transitionId)
  }
  if (selection.kind === 'zone') return record.zones.some((zone) => zone.id === selection.zoneId)
  if (selection.kind === 'zone-layout') {
    return record.zoneLayouts.some((layout) => layout.id === selection.layoutId)
  }
  if (selection.kind === 'multi') {
    return selection.groupSelection.placementIds.every((placementId) => (
      composition.clips.some((clip) => clip.id === placementId)
    ))
  }

  const occurrence = composition.groupOccurrences.find((candidate) => candidate.id === selection.occurrenceId)
  if (!occurrence || !record.zones.some((zone) => zone.id === occurrence.zoneId)) return false
  if (selection.kind === 'group') return true
  const definition = composition.groupDefinitions.find((candidate) => candidate.id === occurrence.definitionId)
  return Boolean(definition?.clips.some((clip) => clip.id === selection.placementId))
}
