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

/**
 * Applies the user's per-slot Try with Pattern selections in slot order over a
 * v2 record. Each group swaps as one unit; slots without a selection keep the
 * authored cast. Control targets and instance-control tracks survive only where
 * the new Pattern still exports them. A swapped source forfeits the
 * deterministic-loop stamp to continuous: the exact-reset proof (#823 wrap
 * census) belongs to the authored cast, and control compatibility does not prove
 * runtime-state compatibility. Reselecting the current Pattern keeps the stamp.
 */
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
  const sourceChanged = record.composition.patternInstances.some(
    (instance) =>
      swappedIds.has(instance.id) &&
      (instance.pattern.kind !== pattern.kind || instance.pattern.id !== pattern.id),
  )
  return {
    ...record,
    composition: {
      ...record.composition,
      ...(sourceChanged ? { executionModel: 'continuous' as const } : {}),
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
