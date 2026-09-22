import type { ShowPatternRef } from './personalContentRecords'
import type { ShowRecordV2 } from './showCompositionV2'
import type { ShowPatternSlotGroup } from './showReferenceShow'

export function showPatternSlotRemovedControlNamesV2(
  record: ShowRecordV2,
  group: ShowPatternSlotGroup,
  exportedSliderNames: ReadonlySet<string>,
): string[] {
  const instanceIds = new Set(group.instanceIds)
  const removed = new Set<string>()
  for (const track of record.composition.propertyTracks) {
    if (
      track.target.kind === 'instance-control'
      && instanceIds.has(track.target.instanceId)
      && !exportedSliderNames.has(track.target.exportName)
    ) {
      removed.add(track.target.exportName)
    }
  }
  return [...removed]
}

export function applyShowPatternSlotSelectionsV2(
  record: ShowRecordV2,
  slotGroups: readonly ShowPatternSlotGroup[],
  selections: Readonly<Record<number, ShowPatternRef>>,
  patternNameFor: (ref: ShowPatternRef) => string | undefined,
  exportedSliderNamesFor: (ref: ShowPatternRef) => ReadonlySet<string> | null,
): ShowRecordV2 {
  return slotGroups.reduce((current, group, index) => {
    const pattern = selections[index]
    if (!pattern) return current
    const patternName = patternNameFor(pattern)
    if (!patternName) return current
    const sliderNames = exportedSliderNamesFor(pattern)
    if (sliderNames === null) return current
    return applyShowPatternSlotSelectionV2(current, group, pattern, patternName, sliderNames)
  }, record)
}

function applyShowPatternSlotSelectionV2(
  record: ShowRecordV2,
  group: ShowPatternSlotGroup,
  pattern: ShowPatternRef,
  patternName: string,
  sliderNames: ReadonlySet<string>,
): ShowRecordV2 {
  const presentIds = new Set(record.composition.patternInstances.map((instance) => instance.id))
  const swappedIds = new Set(group.instanceIds.filter((id) => presentIds.has(id)))
  return {
    ...record,
    composition: {
      ...record.composition,
      patternInstances: record.composition.patternInstances.map((instance) => {
        if (!swappedIds.has(instance.id)) return instance
        const keptEntries = Object.entries(instance.controlTargets ?? {}).filter(
          ([exportName]) => sliderNames.has(exportName),
        )
        const next = { ...instance, pattern, patternName }
        if (keptEntries.length > 0) {
          next.controlTargets = Object.fromEntries(keptEntries)
        } else {
          delete next.controlTargets
        }
        return next
      }),
      propertyTracks: record.composition.propertyTracks.filter(
        (track) =>
          track.target.kind !== 'instance-control'
          || !swappedIds.has(track.target.instanceId)
          || sliderNames.has(track.target.exportName),
      ),
    },
  }
}
