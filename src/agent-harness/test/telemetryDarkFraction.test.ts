// V2-authored for #945 (candidate review of a4e11cc0, P3): a dark-stretch
// event's darkFraction is the fraction of dark pixel samples across the
// stretch, weighted by the frames each bucket holds. Averaging the buckets
// equally let a half-second tail count as much as a full second. Boundary:
// runTelemetry's events. Oracle: the fraction computed by hand from the
// fixture's frame and pixel counts, independent of the harness's buckets.
import { describe, expect, it } from 'vitest'
import { inspectPatternMetadata } from '@/engine/bundle'
import { runTelemetry } from '../telemetry/harness.js'

/** Fully dark through 5 s, then 18 of 20 pixels dark (90%). */
const DARK_THEN_MOSTLY_DARK = `
var t = 0
export function beforeRender(delta) { t += delta }
export function render2D(index, x, y) {
  if (t <= 5000 || index < 18) rgb(0, 0, 0)
  else rgb(1, 1, 1)
}
`

/** Fully dark for the first second, then 18 of 20 pixels dark. */
const DARK_ONE_SECOND_THEN_MOSTLY_DARK = `
var t = 0
export function beforeRender(delta) { t += delta }
export function render2D(index, x, y) {
  if (t <= 1000 || index < 18) rgb(0, 0, 0)
  else rgb(1, 1, 1)
}
`

const run = (source: string, durationMs: number, thresholds?: Record<string, number>) =>
  runTelemetry(source, inspectPatternMetadata(source), {
    durationMs,
    fps: 10,
    pixelCount: 20,
    ...(thresholds ? { thresholds } : {}),
  })

describe('dark-stretch darkFraction weights buckets by their frames (#945 repair)', () => {
  it('reports the sample-weighted fraction over five full seconds and a 90% half second', () => {
    const report = run(DARK_THEN_MOSTLY_DARK, 5_500)
    expect(report.input.frameCount).toBe(55)
    // 50 frames x 20 dark pixels + 5 frames x 18 dark pixels, over 55 x 20 samples.
    const expected = (50 * 20 + 5 * 18) / (55 * 20)
    expect(expected).toBeCloseTo(0.990909, 6)
    const dark = report.events.find((event) => event.kind === 'dark-stretch')
    expect(dark).toEqual({ kind: 'dark-stretch', startMs: 0, durationMs: 5_500, darkFraction: 0.990909 })
    // The equal-weight average of the six buckets, which the report must not give.
    expect((5 * 1 + 0.9) / 6).toBeCloseTo(0.983333, 6)
    expect(dark!.darkFraction).not.toBeCloseTo(0.983333, 6)
    expect(report.summary).toContain('99% of pixels sat below 5% luminance for 5.5 seconds starting at 0:00')
  })

  it('agrees with the equal-weight average when every bucket is whole', () => {
    const report = run(DARK_ONE_SECOND_THEN_MOSTLY_DARK, 2_000, { minEventSeconds: 2 })
    const dark = report.events.find((event) => event.kind === 'dark-stretch')
    // 10 frames x 20 + 10 frames x 18, over 20 x 20 samples: 0.95 either way.
    expect(dark).toEqual({ kind: 'dark-stretch', startMs: 0, durationMs: 2_000, darkFraction: 0.95 })
  })
})
