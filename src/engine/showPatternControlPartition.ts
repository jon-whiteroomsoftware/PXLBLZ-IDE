import type { ShowPropertyAnimationTrack } from './personalContentRecords'

export interface ShowPatternControlPartition {
  keptControlTargets?: Record<string, number>
  removedControlTargets?: Record<string, number>
  keptPropertyTracks?: ShowPropertyAnimationTrack[]
  removedPropertyTracks?: ShowPropertyAnimationTrack[]
}

/**
 * Partitions the control-owned state for one Pattern instance against the
 * public sliders exported by an incoming Pattern. Other Property track kinds
 * and tracks owned by other instances are Pattern-agnostic and always survive.
 */
export function partitionShowPatternControls(
  instanceId: string,
  controlTargets: Readonly<Record<string, number>> | undefined,
  propertyTracks: readonly ShowPropertyAnimationTrack[] | undefined,
  exportedSliderNames: ReadonlySet<string>,
): ShowPatternControlPartition {
  const keptControlEntries = Object.entries(controlTargets ?? {})
    .filter(([exportName]) => exportedSliderNames.has(exportName))
  const removedControlEntries = Object.entries(controlTargets ?? {})
    .filter(([exportName]) => !exportedSliderNames.has(exportName))
  const keptPropertyTracks = propertyTracks?.filter((track) => (
    track.target.kind !== 'instance-control'
    || track.target.instanceId !== instanceId
    || exportedSliderNames.has(track.target.exportName)
  ))
  const removedPropertyTracks = propertyTracks?.filter((track) => (
    track.target.kind === 'instance-control'
    && track.target.instanceId === instanceId
    && !exportedSliderNames.has(track.target.exportName)
  ))

  return {
    ...(keptControlEntries.length > 0
      ? { keptControlTargets: Object.fromEntries(keptControlEntries) }
      : {}),
    ...(removedControlEntries.length > 0
      ? { removedControlTargets: Object.fromEntries(removedControlEntries) }
      : {}),
    ...(keptPropertyTracks && keptPropertyTracks.length > 0 ? { keptPropertyTracks } : {}),
    ...(removedPropertyTracks && removedPropertyTracks.length > 0 ? { removedPropertyTracks } : {}),
  }
}
