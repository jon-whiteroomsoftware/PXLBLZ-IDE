// Provenance: pxlblz-v3 test/flickerGate.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { inspectPatternMetadata } from '@/engine/bundle'
import { runTelemetry, type TelemetryOptions } from '../telemetry/harness.js'

const run = (source: string, options: Partial<TelemetryOptions> & { durationMs?: number } = {}) =>
  runTelemetry(source, inspectPatternMetadata(source), { durationMs: 12_000, ...options })

// Full-swing square wave at a given half-period in ms.
const strobe = (halfPeriodMs: number) => `
var t = 0
export function beforeRender(delta) { t += delta }
export function render2D(index, x, y) {
  var on = floor(t / ${halfPeriodMs}) % 2
  rgb(on, on, on)
}
`

// Same square wave, but between two luminances chosen so the swing (0.06)
// stays under the 0.1 contrast floor.
const LOW_CONTRAST_10HZ = `
var t = 0
export function beforeRender(delta) { t += delta }
export function render2D(index, x, y) {
  var on = floor(t / 50) % 2
  var v = 0.5 + on * 0.06
  rgb(v, v, v)
}
`

// A bright dot sweeping two pixels per frame: fast spatial motion, but each
// individual pixel flashes only ~once per second.
const FAST_SMOOTH_MOTION = `
var t = 0
export function beforeRender(delta) { t += delta }
export function render2D(index, x, y) {
  var active = floor(t / 16.6) % 64
  if (index == active) { rgb(1, 1, 1) } else { rgb(0, 0, 0) }
}
`

describe('photosensitive flicker gate (#9)', () => {
  it('fails a 10 Hz full-field strobe, citing rate, interval, and affected fraction', () => {
    const report = run(strobe(50))
    expect(report.flicker.pass).toBe(false)
    expect(report.flicker.violations).toHaveLength(1)
    const violation = report.flicker.violations[0]
    expect(violation.startMs).toBe(0)
    expect(violation.durationMs).toBe(12_000)
    expect(violation.meanFlashHz).toBeGreaterThan(8)
    expect(violation.meanFlashHz).toBeLessThan(12)
    expect(violation.affectedPixelFraction).toBe(1)
    expect(report.summary).toContain('FLICKER GATE FAILED')
    expect(report.summary).toContain('10 Hz')
    expect(report.summary).toContain('100% of pixels')
    expect(report.summary).toContain('12 seconds starting at 0:00')
  })

  it('passes fast-but-smooth motion (each pixel flashes below the floor)', () => {
    const report = run(FAST_SMOOTH_MOTION)
    expect(report.flicker.pass).toBe(true)
    expect(report.flicker.violations).toEqual([])
    expect(report.summary).toContain('Flicker gate passed')
  })

  it('passes low-contrast pulsing at a dangerous rate', () => {
    const report = run(LOW_CONTRAST_10HZ)
    expect(report.flicker.pass).toBe(true)
  })

  it('passes at the lower band edge (3 flashes/second is allowed) and fails just above', () => {
    // 3 Hz: half-period 166.67 ms.
    expect(run(strobe(166.67)).flicker.pass).toBe(true)
    // 2.5 Hz is comfortably below the floor.
    expect(run(strobe(200)).flicker.pass).toBe(true)
    // 4 Hz is past "more than three flashes per second".
    expect(run(strobe(125)).flicker.pass).toBe(false)
  })

  it('fails inside the upper band edge and passes beyond it (needs fps headroom)', () => {
    // At 120 fps the Nyquist limit (60 Hz) clears the 30 Hz band top.
    const inBand = run(strobe(20), { fps: 120 }) // 25 Hz
    expect(inBand.flicker.bandLimitedByFps).toBe(false)
    expect(inBand.flicker.pass).toBe(false)
    expect(inBand.flicker.violations[0].meanFlashHz).toBeGreaterThan(22)
    expect(inBand.flicker.violations[0].meanFlashHz).toBeLessThan(28)

    const beyondBand = run(strobe(14.2857), { fps: 120 }) // ~35 Hz
    expect(beyondBand.flicker.pass).toBe(true)
  })

  it('records the fps-limited analysis band at the default frame rate', () => {
    const report = run(strobe(200))
    expect(report.flicker.analyzedBandHz).toEqual([3, 15])
    expect(report.flicker.bandLimitedByFps).toBe(true)
    expect(report.summary).toContain('limited by 30 fps sampling')
  })

  it('embeds the verdict in the structured report for downstream consumers', () => {
    const failing = run(strobe(50))
    expect(failing.flicker.perSecondViolatingFraction.every((fraction) => fraction === 1)).toBe(true)
    const passing = run(strobe(200))
    expect(passing.flicker.perSecondViolatingFraction.every((fraction) => fraction === 0)).toBe(true)
  })
})
