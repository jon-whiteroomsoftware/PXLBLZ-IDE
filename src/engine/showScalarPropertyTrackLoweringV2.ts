import type { ShowRoutingPropertyRampRecipe } from './showCompiler'
import type { ShowPropertyTrackV2 } from './showCompositionV2'
import { evaluateShowPropertyKeysV2 } from './showPropertyTrackTimeMappingV2'
import { applyShowEasing } from './showEasing'

export interface ShowScalarRampBaselineV2 { initial: number; ramps: ShowRoutingPropertyRampRecipe[] }
export type ShowScalarTrackLoweringV2 =
  | { status: 'ready'; value: ShowScalarRampBaselineV2 }
  | { status: 'refused'; message: string }

export function evaluateShowScalarRampBaselineV2(source: ShowScalarRampBaselineV2, atMs: number): number {
  let value = source.initial
  for (const ramp of source.ramps) {
    if (atMs < ramp.atMs) continue
    value = ramp.to
    if (ramp.durationMs <= 0 || atMs >= ramp.atMs + ramp.durationMs) continue
    const segment = ramp.curveSegment
    const progress = segment ? (segment.elapsedOffsetMs + atMs - ramp.atMs) / segment.sourceDurationMs : (atMs - ramp.atMs) / ramp.durationMs
    value = segment ? segment.baseValue + segment.deltaValue * applyShowEasing(segment.easing, progress) : ramp.from + (ramp.to - ramp.from) * applyShowEasing(ramp.easing, progress)
  }
  return value
}

/** Overlay authored half-open scalar activation on the existing global recipe channel. */
export function lowerShowScalarPropertyTracksV2(tracks: readonly ShowPropertyTrackV2[], showEndMs: number, baseline: ShowScalarRampBaselineV2): ShowScalarTrackLoweringV2 {
  const carrier = baseline.ramps.find(ramp => ramp.durationMs > 0 && tracks.some(track => ramp.atMs < track.activeStartMs + track.activeDurationMs && track.activeStartMs < ramp.atMs + ramp.durationMs))
  if (carrier) return { status: 'refused', message: 'Scalar animation overlaps an existing positive Property ramp.' }
  const retainedBase = baseline.ramps.filter(ramp => !tracks.some(track => ramp.durationMs === 0 && ramp.atMs >= track.activeStartMs && ramp.atMs < track.activeStartMs + track.activeDurationMs))
  const authored: ShowRoutingPropertyRampRecipe[] = []
  for (const track of tracks) {
    const keys = [...track.keyframes].sort((a, b) => a.timeMs - b.timeMs)
    authored.push({ atMs: track.activeStartMs, from: evaluateShowScalarRampBaselineV2(baseline, track.activeStartMs), to: keys[0].value, durationMs: 0, easing: { curve: 'linear' } })
    for (const [index, left] of keys.slice(0, -1).entries()) {
      const right = keys[index + 1]
      authored.push({ atMs: left.timeMs, from: left.value, to: right.value, durationMs: right.timeMs - left.timeMs, easing: structuredClone(left.easing), ...(left.curveSegment ? { curveSegment: structuredClone(left.curveSegment) } : {}) })
    }
    const activeEndMs = track.activeStartMs + track.activeDurationMs
    if (activeEndMs < showEndMs && !retainedBase.some(ramp => ramp.atMs === activeEndMs)) authored.push({ atMs: activeEndMs, from: evaluateShowPropertyKeysV2(track.keyframes, activeEndMs - 1) ?? keys[keys.length - 1].value, to: evaluateShowScalarRampBaselineV2(baseline, activeEndMs), durationMs: 0, easing: { curve: 'linear' } })
  }
  const ramps = [...retainedBase, ...authored].map((ramp, index) => ({ ramp, index })).sort((a, b) => a.ramp.atMs - b.ramp.atMs || a.index - b.index).map(({ ramp }) => ramp)
  const atZero = tracks.find(track => track.activeStartMs === 0)
  return { status: 'ready', value: { initial: atZero ? evaluateShowPropertyKeysV2(atZero.keyframes, 0) : baseline.initial, ramps } }
}
