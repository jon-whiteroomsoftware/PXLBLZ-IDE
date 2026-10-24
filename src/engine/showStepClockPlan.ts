import type { ShowStructuredEasing } from './personalContentRecords'
import type { ShowPropertyTrackV2 } from './showCompositionV2'

export type ShowStepClockTrack = Pick<ShowPropertyTrackV2, 'id' | 'activeStartMs' | 'activeDurationMs' | 'keyframes'>

export interface ShowStepClockTrackIssue {
  keyframeIndex: number
  field: 'value' | 'easing' | 'curveSegment'
  message: string
}

export interface ShowStepClockRequestChange {
  atMs: number
  stepMs: number
}

export interface ShowStepClockPlan {
  instanceId: string
  baseStepMs: number
  initialStepMs: number
  changes: ShowStepClockRequestChange[]
}

export function isShowStepClockValue(value: number): boolean {
  return value === 0 || (Number.isInteger(value) && value >= 16 && value <= 60_000)
}

function isHeldUntilNextKey(easing: ShowStructuredEasing): boolean {
  return easing.curve === 'hold' && easing.at === 1
}

/** Target-specific supplement; structural and domain validation belongs to the record validator. */
export function validateShowStepClockTrack(track: ShowStepClockTrack): ShowStepClockTrackIssue[] {
  const issues: ShowStepClockTrackIssue[] = []
  track.keyframes.forEach((key, keyframeIndex) => {
    if (!isShowStepClockValue(key.value)) {
      issues.push({
        keyframeIndex,
        field: 'value',
        message: 'Step length must be 0 (continuous) or an integer from 16 to 60000 ms.',
      })
    }
    if (keyframeIndex === track.keyframes.length - 1) return
    const next = track.keyframes[keyframeIndex + 1]
    const segment = key.curveSegment
    const constant = segment
      ? segment.deltaValue === 0 && segment.baseValue === key.value
      : key.value === next.value
    if (!constant && !isHeldUntilNextKey(key.easing)) {
      issues.push({
        keyframeIndex,
        field: 'easing',
        message: 'Step-length changes require Hold easing at the next key.',
      })
    }
    if (segment && ((segment.deltaValue !== 0 && !isHeldUntilNextKey(segment.easing))
      || segment.baseValue !== key.value
      || !isShowStepClockValue(segment.baseValue)
      || !isShowStepClockValue(segment.baseValue + segment.deltaValue))) {
      issues.push({
        keyframeIndex,
        field: 'curveSegment',
        message: 'Retained step-length segments must preserve a held value.',
      })
    }
  })
  return issues
}

/** Resolve validated, disjoint activations into requests, without computing runtime step boundaries. */
export function planShowStepClock(input: {
  instanceId: string
  baseStepMs: number
  tracks: readonly ShowStepClockTrack[]
}): ShowStepClockPlan | null {
  const { instanceId, baseStepMs, tracks } = input
  if (tracks.length === 0) return null

  const events = new Set([0])
  for (const track of tracks) {
    const endMs = track.activeStartMs + track.activeDurationMs
    events.add(track.activeStartMs)
    events.add(endMs)
    for (const key of track.keyframes) {
      if (key.timeMs > track.activeStartMs && key.timeMs < endMs) events.add(key.timeMs)
    }
  }

  const requestAt = (atMs: number): number => {
    const active = tracks.find(track => atMs >= track.activeStartMs
      && atMs < track.activeStartMs + track.activeDurationMs)
    if (!active) return baseStepMs
    let value = active.keyframes[0].value
    for (const key of active.keyframes) {
      if (key.timeMs > atMs) break
      value = key.value
    }
    return value
  }

  const initialStepMs = requestAt(0)
  const changes: ShowStepClockRequestChange[] = []
  let previous = initialStepMs
  for (const atMs of [...events].sort((left, right) => left - right)) {
    if (atMs === 0) continue
    const stepMs = requestAt(atMs)
    if (stepMs !== previous) changes.push({ atMs, stepMs })
    previous = stepMs
  }
  return { instanceId, baseStepMs, initialStepMs, changes }
}
