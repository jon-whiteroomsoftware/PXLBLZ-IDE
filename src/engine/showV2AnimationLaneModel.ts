import { evaluateShowPropertyKeysV2 } from './showPropertyTrackTimeMappingV2'
import type { ShowPropertyKeyframeV2 } from './showCompositionV2'
import type {
  ShowTimelinePropertyKeyView,
  ShowTimelinePropertyTrackView,
  ShowTimelineViewModel,
} from './showTimelineViewModel'

/** One drawn point on a lane. `displayY` is inverted: zero is the lane's top. */
export interface ShowV2AnimationLaneSample {
  timeMs: number
  value: number
  displayX: number
  displayY: number
}

export interface ShowV2AnimationLaneKey extends ShowV2AnimationLaneSample, Pick<ShowTimelinePropertyKeyView, 'id' | 'retainedCurve'> {}

/**
 * One Property track drawn as a lane.
 *
 * Samples come from the shared key evaluator, so a key carrying a retained
 * `curveSegment` is drawn from that descriptor over its half-open interior
 * (specification section 6). The lane never interpolates between two retained
 * endpoints: equal endpoint values can enclose a nonconstant curve, and the
 * reader is entitled to see it.
 */
export interface ShowV2AnimationLane {
  trackId: string
  label: string
  /** `Show`, or the Group definition's name for a definition-local track. */
  ownerLabel: string
  ownerKind: 'show' | 'group-definition'
  /** True when the lane's time domain is the same global domain as the timeline above it. */
  alignedToShowTime: boolean
  /** Full width of this lane in its own owner's milliseconds. */
  domainMs: number
  activeStartMs: number
  activeDurationMs: number
  activeEndMs: number
  /** Activation band as fractions of `domainMs`, for direct CSS placement. */
  activeStartFraction: number
  activeWidthFraction: number
  valueMin: number
  valueMax: number
  samples: ShowV2AnimationLaneSample[]
  keys: ShowV2AnimationLaneKey[]
  /** `samples` as SVG polyline points in a unit box. */
  points: string
  /** Keys whose outgoing segment is a retained restriction of a longer curve. */
  retainedCurveKeyIds: string[]
}

export interface ShowV2AnimationLaneOptions {
  /** Samples across the activation interval, in addition to every exact key time. */
  sampleCount?: number
}

const DEFAULT_SAMPLE_COUNT = 64

/**
 * Build the animation lanes for one timeline view. Pure: it reads the view,
 * allocates no identity and evaluates only the authored keys it was given.
 */
export function buildShowV2AnimationLanes(
  view: ShowTimelineViewModel,
  options: ShowV2AnimationLaneOptions = {},
): ShowV2AnimationLane[] {
  const sampleCount = Math.max(2, Math.floor(options.sampleCount ?? DEFAULT_SAMPLE_COUNT))
  return (view.propertyTracks ?? []).map((track) => laneView(track, view.showEndMs, sampleCount))
}

function laneView(
  track: ShowTimelinePropertyTrackView,
  showEndMs: number,
  sampleCount: number,
): ShowV2AnimationLane {
  const alignedToShowTime = track.owner.kind === 'show'
  // A Group-definition track lives in definition-local time, so its lane spans
  // its own activation rather than the Show's global domain.
  const domainMs = Math.max(1, alignedToShowTime ? showEndMs : track.activeEndMs)
  const times = sampleTimes(track, sampleCount)
  // The shared key evaluator is the only value authority: it is the same code
  // the lowerer and the emitter read a retained descriptor through.
  const keyframes: ShowPropertyKeyframeV2[] = track.keys.map((key) => ({
    id: key.id,
    timeMs: key.timeMs,
    value: key.value,
    easing: key.easing,
    ...(key.curveSegment === undefined ? {} : { curveSegment: key.curveSegment }),
  }))
  const values = times.map((timeMs) => evaluateShowPropertyKeysV2(keyframes, timeMs))
  const valueMin = values.length ? Math.min(...values) : 0
  const valueMax = values.length ? Math.max(...values) : 0
  const span = valueMax - valueMin
  const displayY = (value: number) => (span === 0 ? 0.5 : 1 - (value - valueMin) / span)
  const displayX = (timeMs: number) => Math.min(1, Math.max(0, timeMs / domainMs))
  const samples = times.map((timeMs, index): ShowV2AnimationLaneSample => ({
    timeMs,
    value: values[index],
    displayX: displayX(timeMs),
    displayY: displayY(values[index]),
  }))
  return {
    trackId: track.id,
    label: track.label,
    ownerLabel: track.owner.kind === 'show' ? 'Show' : track.owner.definitionName,
    ownerKind: track.owner.kind,
    alignedToShowTime,
    domainMs,
    activeStartMs: track.activeStartMs,
    activeDurationMs: track.activeDurationMs,
    activeEndMs: track.activeEndMs,
    activeStartFraction: displayX(track.activeStartMs),
    activeWidthFraction: Math.min(1, track.activeDurationMs / domainMs),
    valueMin,
    valueMax,
    samples,
    keys: track.keys.map((key): ShowV2AnimationLaneKey => {
      const value = evaluateShowPropertyKeysV2(keyframes, key.timeMs)
      return {
        id: key.id,
        retainedCurve: key.retainedCurve,
        timeMs: key.timeMs,
        value,
        displayX: displayX(key.timeMs),
        displayY: displayY(value),
      }
    }),
    points: samples.map((sample) => `${sample.displayX},${sample.displayY}`).join(' '),
    retainedCurveKeyIds: track.keys.filter((key) => key.retainedCurve).map((key) => key.id),
  }
}

/** Every exact key time inside activation, plus an even sweep across it. */
function sampleTimes(track: ShowTimelinePropertyTrackView, sampleCount: number): number[] {
  const { activeStartMs, activeEndMs } = track
  const step = (activeEndMs - activeStartMs) / (sampleCount - 1)
  const times = new Set<number>([activeStartMs, activeEndMs])
  for (let index = 1; index < sampleCount - 1; index++) {
    times.add(Math.round(activeStartMs + step * index))
  }
  for (const key of track.keys) {
    if (key.timeMs >= activeStartMs && key.timeMs <= activeEndMs) times.add(key.timeMs)
  }
  return [...times].sort((left, right) => left - right)
}
