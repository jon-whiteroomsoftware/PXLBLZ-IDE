import type { ShowPropertyTransitions } from './personalContentRecords'
import type { ShowPropertyTrackV2, ShowRecordV2, ShowTransitionV2 } from './showCompositionV2'

/** A held global target; smooth motion belongs to the explicit boundary ramp. */
export function isHeldRepeatScaleTrack(track: ShowPropertyTrackV2, showEndMs: number): boolean {
  return track.target.kind === 'show-repeat-scale'
    && track.activeStartMs === 0 && track.activeDurationMs === showEndMs
    && track.keyframes[0]?.timeMs === 0
    && track.keyframes.every(key => key.value > 0 && key.easing.curve === 'hold' && key.easing.at === 1)
}

export function repeatScaleAt(record: ShowRecordV2, timeMs: number): number {
  const track = record.composition.propertyTracks.find(track => track.target.kind === 'show-repeat-scale')
  const keys = track?.keyframes.filter(key => key.timeMs <= timeMs) ?? []
  return keys[keys.length - 1]?.value ?? record.composition.sampleRemap.repeatScale
}

/** Existing scalar carrier descriptors, without Clip or instance ownership. */
export function scalarBoundaryRamps(transition: ShowTransitionV2): ShowPropertyTransitions | undefined {
  if (transition.propertyRamps.length === 0) return undefined
  const result: ShowPropertyTransitions = {}
  for (const ramp of transition.propertyRamps) {
    const { from, durationMs, easing } = ramp
    const descriptor = { from, ...(durationMs !== undefined ? { durationMs } : {}), ...(easing !== undefined ? { easing: structuredClone(easing) } : {}) }
    if (ramp.target.kind === 'show-repeat-scale') result.sample = { repeatScale: descriptor }
    else if (ramp.target.kind === 'layout-occurrence-split-position') result.routing = { splitPosition: descriptor }
    else throw new Error('Unproved boundary scalar target.')
  }
  return result
}
