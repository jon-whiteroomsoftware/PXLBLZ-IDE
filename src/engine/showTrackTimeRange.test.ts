import { describe, expect, it } from 'vitest'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { emitShowPropertyTrackExpression, evaluateShowPropertyTrack } from './showPropertyAnimation'

const RED = { id: 'instance-a', source: 'export function render(index) { rgb(1, 0, 0) }' }
const ZONES = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 0 }] }]
type Track = Parameters<typeof evaluateShowPropertyTrack>[0]
type Scene = NonNullable<Parameters<typeof compileShow>[0]['routedSceneSequence']>['scenes'][number]
const placement = { placementId: 'placement-a', zoneName: 'main', clipId: 'instance-a', opacity: 1 }
function runtime(artifact: ReturnType<typeof compileShow>, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: [{ sample: [0.5, 0.5], pos: [0.5, 0.5] }], randomSeed: 1197, fidelity })
}

// Advance in bounded steps so the delta itself stays within 16.16 range.
function redAt(artifact: ReturnType<typeof compileShow>, fidelity: 'fast' | 'fidelity', timesMs: number[]): number[] {
  const replay = runtime(artifact, fidelity)
  let elapsedMs = 0
  return timesMs.map((timeMs) => {
    let result: ReturnType<typeof replay.advanceLive> | undefined
    while (elapsedMs < timeMs) {
      const stepMs = Math.min(elapsedMs >= 40_000 && timeMs <= 40_500 ? 50 : 500, timeMs - elapsedMs)
      result = replay.advanceLive(stepMs)
      elapsedMs += stepMs
    }
    return result!.pixels[0][0]
  })
}

function opacityTrack(points: Array<[number, number]>): Track {
  return {
    id: 'opacity', target: { kind: 'placement-opacity', placementId: 'placement-a' },
    keyframes: points.map(([timeMs, value], index) => ({ id: String(index), timeMs, value, easing: { curve: 'linear' } })),
  }
}
const case1Track = opacityTrack([[0, 0], [4_800, 1], [4_801, 1], [81_600, 1], [84_000, 0.25], [96_000, 0.25]])
case1Track.keyframes[1].easing = { curve: 'hold', at: 1 }
function routed(scenes: Scene[], loopDurationMs: number) {
  return compileShow({
    clips: [RED], zones: ZONES, routingLayouts: [{ id: 'default', name: 'Default', zones: ZONES }],
    routedSceneSequence: { scenes }, loopDurationMs,
  }, {})
}
function compare(artifact: ReturnType<typeof compileShow>, times: number[], track?: Track, localMs = (time: number) => time) {
  const fast = redAt(artifact, 'fast', times)
  const precise = redAt(artifact, 'fidelity', times)
  times.forEach((time, index) => {
    expect(precise[index], `Precise at ${time} ms`).toBeCloseTo(fast[index], 3)
    if (track) expect(fast[index], `fast at ${time} ms`).toBeCloseTo(evaluateShowPropertyTrack(track, localMs(time)), 6)
  })
  return fast
}

describe('Show emitted time range (#1197)', () => {
  it('plays a long single section opacity track', () => {
    compare(routed([{ holdMs: 96_000, placements: [placement], propertyTracks: [case1Track] }], 96_000),
      [2_400, 18_000, 33_000, 60_000, 82_800, 90_000], case1Track)
  })

  it('plays a long section placement-view brightness track', () => {
    const track: Track = { ...opacityTrack([[0, 1], [40_000, 0.2], [96_000, 0.2]]),
      target: { kind: 'placement-view', placementId: 'placement-a', property: 'brightness' } }
    compare(routed([{ holdMs: 96_000, placements: [placement], propertyTracks: [track] }], 96_000),
      [18_000, 33_000, 39_000, 60_000, 90_000])
  })

  it('plays a late short section with a large localTimeOffsetMs', () => {
    const track = opacityTrack([[30_000, 0], [40_000, 1]])
    compare(routed([
      { holdMs: 30_000, placements: [{ ...placement, placementId: 'placement-b' }], transitionOut: { kind: 'cut', durationMs: 0 } },
      { holdMs: 10_000, localTimeOffsetMs: 30_000, placements: [placement], propertyTracks: [track] },
    ], 40_000), [31_000, 32_500, 33_000, 35_000, 39_500], track)
  })

  it('plays a very short section after a long one', () => {
    const track = opacityTrack([[0, 0], [500, 1]])
    compare(routed([
      { holdMs: 40_000, placements: [{ ...placement, placementId: 'placement-b' }], transitionOut: { kind: 'cut', durationMs: 0 } },
      { holdMs: 500, placements: [placement], propertyTracks: [track] },
    ], 40_500), [40_100, 40_250, 40_400], track, (time) => time - 40_000)
  })

  it('holds an adaptation ramp past 32.767 seconds', () => {
    const artifact = compileShow({ clips: [RED], adaptationRamp: {
      startMs: 1_000, durationMs: 2_000, from: { brightness: 1 }, to: { brightness: 0.5 },
    }, loopDurationMs: 96_000 }, {})
    const fast = compare(artifact, [2_000, 10_000, 40_000, 90_000])
    expect(fast[2]).toBe(fast[1])
    expect(fast[3]).toBe(fast[1])
  })

  it('keeps emitted track time constants inside 16.16 range', () => {
    const artifact = routed([{ holdMs: 96_000, placements: [placement], propertyTracks: [case1Track] }], 96_000)
    expect(artifact.code).not.toContain('* 1000 +')
    const constants = emitShowPropertyTrackExpression(case1Track, 't').match(/-?\d+(\.\d+)?/g) ?? []
    for (const constant of constants) expect(Math.abs(Number(constant))).toBeLessThan(32768)
  })
})
