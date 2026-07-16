import { applyShowEasing } from './showEasing'
import { projectShowTimeline, showCellAtSlot } from './showModel'
import type {
  ShowCell,
  ShowPropertyAnimationTrack,
  ShowPropertyTransition,
  ShowPropertyTransitions,
  ShowRecord,
  ShowTransitionEasing,
} from './personalContentRecords'

export interface ShowPropertyLaneSegment {
  id: string
  startMs: number
  endMs: number
  from: number
  to: number
  easing: ShowTransitionEasing
}

export interface ShowPropertyLaneBeatInput {
  id: string
  timeMs: number
  value: number
  kind: 'authored' | 'boundary' | 'target'
  ownerId?: string
  label?: string
}

export interface ShowPropertyLaneInput {
  durationMs: number
  constraint: { min: number; max: number }
  defaultValue: number
  segments: readonly ShowPropertyLaneSegment[]
  beats?: readonly ShowPropertyLaneBeatInput[]
  pinned?: boolean
  sampleCount?: number
}

export interface ShowPropertyLaneSample {
  timeMs: number
  value: number
  displayX: number
  /** Normalized SVG-space ordinate: zero is the top and one is the bottom. */
  displayY: number
}

export interface ShowPropertyLaneBeat extends ShowPropertyLaneBeatInput {
  displayX: number
  displayY: number
}

export interface ShowPropertyLaneProjection {
  durationMs: number
  disclosed: boolean
  extrema: { min: number; max: number }
  displayRange: { min: number; max: number }
  samples: ShowPropertyLaneSample[]
  beats: ShowPropertyLaneBeat[]
}

export type ShowGlobalPropertyLaneTarget =
  | { kind: 'timeScale' }
  | { kind: 'brightness' }
  | { kind: 'control'; exportName: string; defaultValue?: number }

const MINIMUM_VISIBLE_CONSTRAINT_FRACTION = 0.12

/**
 * Projects truthful property values into a compact, deliberately legible lane.
 * The display range may magnify a small variation, but sample values, extrema,
 * timing, and easing remain the authored values.
 */
export function projectShowPropertyLane(input: ShowPropertyLaneInput): ShowPropertyLaneProjection {
  const durationMs = Math.max(0, input.durationMs)
  const segments = [...input.segments].sort((left, right) => (
    left.startMs - right.startMs || left.endMs - right.endMs || left.id.localeCompare(right.id)
  ))
  const sampleCount = Math.max(2, Math.round(input.sampleCount ?? 41))
  const sampleTimes = new Set(Array.from({ length: sampleCount }, (_, index) => (
    durationMs * index / (sampleCount - 1)
  )))
  for (const segment of segments) {
    sampleTimes.add(segment.startMs)
    sampleTimes.add(segment.endMs)
    if (Math.abs(segment.to - segment.from) <= 0.000001) continue
    for (let index = 1; index < 8; index += 1) {
      sampleTimes.add(segment.startMs + (segment.endMs - segment.startMs) * index / 8)
    }
  }
  const rawSamples = [...sampleTimes]
    .filter((timeMs) => timeMs >= 0 && timeMs <= durationMs)
    .sort((left, right) => left - right)
    .map((timeMs) => {
    return { timeMs, value: valueAt(segments, timeMs, input.defaultValue) }
  })
  const beatInputs = [...(input.beats ?? [])]
    .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  const values = [...rawSamples.map((sample) => sample.value), ...beatInputs.map((beat) => beat.value)]
  const authoredMin = values.length > 0 ? Math.min(...values) : input.defaultValue
  const authoredMax = values.length > 0 ? Math.max(...values) : input.defaultValue
  const constraintSpan = Math.max(0.000001, input.constraint.max - input.constraint.min)
  const minimumVisibleSpan = constraintSpan * MINIMUM_VISIBLE_CONSTRAINT_FRACTION
  const authoredSpan = authoredMax - authoredMin
  const center = (authoredMin + authoredMax) / 2
  const displayMin = authoredSpan < minimumVisibleSpan ? center - minimumVisibleSpan / 2 : authoredMin
  const displayMax = authoredSpan < minimumVisibleSpan ? center + minimumVisibleSpan / 2 : authoredMax
  const displayY = (value: number) => 1 - clamp(
    (value - displayMin) / Math.max(0.000001, displayMax - displayMin),
    0,
    1,
  )
  const displayX = (timeMs: number) => clamp(timeMs / Math.max(1, durationMs), 0, 1)
  const disclosed = Boolean(input.pinned)
    || beatInputs.length > 0
    || values.some((value) => Math.abs(value - input.defaultValue) > 0.000001)

  return {
    durationMs,
    disclosed,
    extrema: { min: authoredMin, max: authoredMax },
    displayRange: { min: displayMin, max: displayMax },
    samples: rawSamples.map((sample) => ({
      ...sample,
      displayX: displayX(sample.timeMs),
      displayY: displayY(sample.value),
    })),
    beats: beatInputs.map((beat) => ({
      ...beat,
      displayX: displayX(beat.timeMs),
      displayY: displayY(beat.value),
    })),
  }
}

export function projectShowPropertyTrackLane(input: {
  durationMs: number
  constraint: { min: number; max: number }
  defaultValue: number
  track: ShowPropertyAnimationTrack
  pinned?: boolean
}): ShowPropertyLaneProjection {
  const keyframes = [...input.track.keyframes]
    .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  return projectShowPropertyLane({
    durationMs: input.durationMs,
    constraint: input.constraint,
    defaultValue: input.defaultValue,
    pinned: input.pinned,
    segments: keyframes.slice(0, -1).map((keyframe, index) => ({
      id: `${input.track.id}:${keyframe.id}`,
      startMs: keyframe.timeMs,
      endMs: keyframes[index + 1].timeMs,
      from: keyframe.value,
      to: keyframes[index + 1].value,
      easing: keyframe.easing,
    })),
    beats: keyframes.map((keyframe) => ({
      id: keyframe.id,
      ownerId: input.track.id,
      timeMs: keyframe.timeMs,
      value: keyframe.value,
      kind: 'authored',
      label: `Keyframe at ${keyframe.timeMs} ms`,
    })),
  })
}

export function projectGlobalShowPropertyLane(
  show: ShowRecord,
  zoneId: string,
  target: ShowGlobalPropertyLaneTarget,
): ShowPropertyLaneProjection {
  const timeline = projectShowTimeline(show)
  const defaultValue = target.kind === 'control' ? target.defaultValue ?? 0 : 1
  const constraint = target.kind === 'timeScale' ? { min: 0, max: 4 } : { min: 0, max: 1 }
  const segments: ShowPropertyLaneSegment[] = []
  const beats: ShowPropertyLaneBeatInput[] = []

  for (const [sceneIndex, sceneRange] of timeline.scenes.entries()) {
    const cell = showCellAtSlot(show, zoneId, sceneRange.sceneId)
    const value = globalCellValue(cell, target, defaultValue)
    segments.push({
      id: `${sceneRange.sceneId}:hold`,
      startMs: sceneRange.startMs,
      endMs: sceneRange.endMs,
      from: value,
      to: value,
      easing: { curve: 'linear' },
    })

    const transitionRange = timeline.transitions.find((candidate) => candidate.afterSceneId === sceneRange.sceneId)
    if (!transitionRange) continue
    const nextScene = timeline.scenes[sceneIndex + 1]
    const destination = nextScene ? showCellAtSlot(show, zoneId, nextScene.sceneId) : undefined
    const destinationValue = globalCellValue(destination, target, value)
    const boundary = show.transitions?.find((candidate) => (
      candidate.afterSceneId === sceneRange.sceneId && candidate.kind !== 'routing'
    ))
    const descriptor = globalTransitionDescriptor(boundary?.propertyTransitions, target)
    const from = destination ? descriptor?.fromByCellId[destination.id] : undefined
    const rampDurationMs = Math.min(
      transitionRange.endMs - transitionRange.startMs,
      Math.max(0, descriptor?.durationMs ?? boundary?.durationMs ?? 0),
    )

    if (boundary && descriptor && from !== undefined && rampDurationMs > 0) {
      const rampEndMs = transitionRange.startMs + rampDurationMs
      segments.push({
        id: `${boundary.id}:ramp`,
        startMs: transitionRange.startMs,
        endMs: rampEndMs,
        from,
        to: destinationValue,
        easing: descriptor.easing ?? boundary.easing,
      })
      if (rampEndMs < transitionRange.endMs) {
        segments.push({
          id: `${boundary.id}:tail`,
          startMs: rampEndMs,
          endMs: transitionRange.endMs,
          from: destinationValue,
          to: destinationValue,
          easing: { curve: 'linear' },
        })
      }
      beats.push(
        {
          id: `${boundary.id}:start`,
          ownerId: boundary.id,
          timeMs: transitionRange.startMs,
          value: from,
          kind: 'boundary',
          label: `Boundary starts at ${transitionRange.startMs} ms`,
        },
        {
          id: `${boundary.id}:end`,
          ownerId: boundary.id,
          timeMs: rampEndMs,
          value: destinationValue,
          kind: 'boundary',
          label: `Boundary reaches ${destinationValue} at ${rampEndMs} ms`,
        },
      )
    } else {
      segments.push({
        id: `${sceneRange.sceneId}:transition-hold`,
        startMs: transitionRange.startMs,
        endMs: transitionRange.endMs,
        from: value,
        to: value,
        easing: { curve: 'linear' },
      })
    }
  }

  return projectShowPropertyLane({
    durationMs: timeline.durationMs,
    constraint,
    defaultValue,
    segments,
    beats,
  })
}

function valueAt(
  segments: readonly ShowPropertyLaneSegment[],
  timeMs: number,
  defaultValue: number,
): number {
  if (segments.length === 0) return defaultValue
  // Adjacent segments share their boundary millisecond. Prefer the segment
  // that starts there so an explicitly authored ramp owns its first sample.
  let active: ShowPropertyLaneSegment | undefined
  for (const segment of segments) {
    if (timeMs >= segment.startMs && timeMs <= segment.endMs) active = segment
  }
  if (active) {
    const progress = (timeMs - active.startMs) / Math.max(1, active.endMs - active.startMs)
    return active.from + (active.to - active.from) * applyShowEasing(active.easing, progress)
  }
  const previous = [...segments].reverse().find((segment) => segment.endMs < timeMs)
  if (previous) return previous.to
  return segments[0].from
}

function globalCellValue(
  cell: ShowCell | undefined,
  target: ShowGlobalPropertyLaneTarget,
  fallback: number,
): number {
  if (!cell) return fallback
  if (target.kind === 'timeScale') return cell.adaptations.timeScale
  if (target.kind === 'brightness') return cell.adaptations.brightness
  return cell.controlTargets?.[target.exportName] ?? fallback
}

function globalTransitionDescriptor(
  properties: ShowPropertyTransitions | undefined,
  target: ShowGlobalPropertyLaneTarget,
): ShowPropertyTransition | undefined {
  if (target.kind === 'timeScale') return properties?.timeScale
  if (target.kind === 'brightness') return properties?.brightness
  return properties?.controls?.[target.exportName]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
