// V2-authored for #945 (integration review correction 7): a partial final
// bucket counts for the time it actually covers. Boundary: runTelemetry's
// events and summary. Invariant: a dark or static run becomes an event only
// when the seconds it covers, frame-quantized, reach minEventSeconds, and
// its reported duration is that covered time. Partitions: below the floor by
// a partial bucket (4.1 s), exactly at it (5 s), above it by a partial
// bucket (5.5 s), a request that rounds up to a whole bucket (4.999 s at 30
// fps) and one that rounds down (4.99 s at 60 fps). The flicker gate's
// verdict over a partial window is unchanged.
import { describe, expect, it } from 'vitest'
import { inspectPatternMetadata } from '@/engine/bundle'
import { runTelemetry } from '../telemetry/harness.js'

const CONSTANT_DARK = `
export function beforeRender(delta) {}
export function render2D(index, x, y) { rgb(0, 0, 0) }
`

const CONSTANT_WHITE = `
export function beforeRender(delta) {}
export function render2D(index, x, y) { rgb(1, 1, 1) }
`

const STROBE = `
var t = 0
export function beforeRender(delta) { t += delta }
export function render2D(index, x, y) {
  var on = floor(t / 50) % 2
  rgb(on, on, on)
}
`

const run = (source: string, durationMs: number, fps = 30) =>
  runTelemetry(source, inspectPatternMetadata(source), { durationMs, fps })

describe('partial final bucket (#945)', () => {
  it('does not stretch 4.1 s of darkness into a 5 s event', () => {
    const report = run(CONSTANT_DARK, 4_100)
    expect(report.input.frameCount).toBe(123)
    expect(report.luminance.perSecondMean).toHaveLength(5)
    expect(report.events).toEqual([])
    expect(report.summary).toContain('No dark or static stretches of 5 seconds or longer')
  })

  it('accepts exactly 5 s and reports it as 5 s', () => {
    const report = run(CONSTANT_DARK, 5_000)
    expect(report.events).toEqual([
      { kind: 'dark-stretch', startMs: 0, durationMs: 5_000, darkFraction: 1 },
      { kind: 'static-stretch', startMs: 0, durationMs: 5_000 },
    ])
    expect(report.summary).toContain('for 5 seconds starting at 0:00')
  })

  it('reports 5.5 s as 5.5 s, not 6', () => {
    const report = run(CONSTANT_DARK, 5_500)
    expect(report.input.frameCount).toBe(165)
    expect(report.events).toEqual([
      { kind: 'dark-stretch', startMs: 0, durationMs: 5_500, darkFraction: 1 },
      { kind: 'static-stretch', startMs: 0, durationMs: 5_500 },
    ])
    expect(report.summary).toContain('for 5.5 seconds starting at 0:00')
  })

  it('measures coverage in rendered frames at the request boundary', () => {
    // 4.999 s at 30 fps rounds to 150 frames: five whole buckets, a 5 s event.
    const roundedUp = run(CONSTANT_WHITE, 4_999)
    expect(roundedUp.input.frameCount).toBe(150)
    expect(roundedUp.events).toEqual([{ kind: 'static-stretch', startMs: 0, durationMs: 5_000 }])
    // 4.99 s at 60 fps rounds to 299 frames: 4 s plus 59 frames, no event.
    const roundedDown = run(CONSTANT_WHITE, 4_990, 60)
    expect(roundedDown.input.frameCount).toBe(299)
    expect(roundedDown.events).toEqual([])
  })

  it('places a late run at its whole-second start and ends it at the covered time', () => {
    // 3 s white then dark until 9.3 s: dark covers 6.3 s from 3 s.
    const source = `
var t = 0
export function beforeRender(delta) { t += delta }
export function render2D(index, x, y) { var on = t < 3000 ? 1 : 0; rgb(on, on, on) }
`
    const report = run(source, 9_300)
    const dark = report.events.find((event) => event.kind === 'dark-stretch')
    expect(dark).toMatchObject({ startMs: 3_000, durationMs: 6_300 })
    expect(report.summary).toContain('for 6.3 seconds starting at 0:03')
  })

  it('keeps the flicker verdict over a partial window', () => {
    const partial = run(STROBE, 4_100)
    expect(partial.flicker.pass).toBe(false)
    expect(partial.flicker.violations.length).toBeGreaterThan(0)
    expect(partial.flicker.perSecondViolatingFraction).toHaveLength(5)
    expect(partial.summary).toContain('FLICKER GATE FAILED')
  })
})
