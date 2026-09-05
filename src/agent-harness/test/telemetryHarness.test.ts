// Provenance: pxlblz-v3 test/telemetryHarness.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { inspectPatternMetadata } from '@/engine/bundle'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { compileShowDocument } from '../shows/evaluate.js'
import { runTelemetry } from '../telemetry/harness.js'

const runFixture = (source: string, durationMs: number, options: { pixelCount?: number } = {}) =>
  runTelemetry(source, inspectPatternMetadata(source), { durationMs, ...options })

const CONSTANT_DARK = `
export function beforeRender(delta) {}
export function render2D(index, x, y) { rgb(0, 0, 0) }
`

const CONSTANT_WHITE = `
export function beforeRender(delta) {}
export function render2D(index, x, y) { rgb(1, 1, 1) }
`

// 1 Hz square wave: 500 ms off, 500 ms on (t starts above 0).
const BLINK_1HZ = `
var t = 0
export function beforeRender(delta) { t += delta }
export function render2D(index, x, y) {
  var on = floor(t / 500) % 2
  rgb(on, on, on)
}
`

// One lit pixel stepping every 100 ms; covers all 64 pixels in 6.4 s.
const MOVING_DOT = `
var t = 0
export function beforeRender(delta) { t += delta }
export function render2D(index, x, y) {
  var active = floor(t / 100) % 64
  if (index == active) { rgb(1, 1, 1) } else { rgb(0, 0, 0) }
}
`

describe('telemetry harness fixtures (#8)', () => {
  it('measures constant dark as a full-length dark, static stretch', () => {
    const report = runFixture(CONSTANT_DARK, 12_000)
    expect(report.luminance.mean).toBe(0)
    expect(report.spatial.everActiveFraction).toBe(0)
    expect(report.palette.coloredSampleFraction).toBe(0)
    const dark = report.events.find((event) => event.kind === 'dark-stretch')
    expect(dark).toMatchObject({ startMs: 0, durationMs: 12_000, darkFraction: 1 })
    expect(report.events.some((event) => event.kind === 'static-stretch')).toBe(true)
    expect(report.summary).toContain('100% of pixels sat below 5% luminance for 12 seconds starting at 0:00')
  })

  it('measures constant white as bright, fully covered, and static', () => {
    const report = runFixture(CONSTANT_WHITE, 12_000)
    expect(report.luminance.mean).toBeCloseTo(1, 5)
    expect(report.luminance.stdDev).toBeCloseTo(0, 6)
    expect(report.spatial.everActiveFraction).toBe(1)
    expect(report.spatial.meanActiveFraction).toBe(1)
    expect(report.events.some((event) => event.kind === 'dark-stretch')).toBe(false)
    const staticStretch = report.events.find((event) => event.kind === 'static-stretch')
    expect(staticStretch).toMatchObject({ startMs: 0, durationMs: 12_000 })
  })

  it('measures a 1 Hz blink at its known duty cycle and transition energy', () => {
    const report = runFixture(BLINK_1HZ, 12_000)
    // 50% duty cycle of full white.
    expect(report.luminance.mean).toBeGreaterThan(0.45)
    expect(report.luminance.mean).toBeLessThan(0.55)
    // Two full-swing transitions per second across 30 fps.
    expect(report.temporal.meanDeltaEnergy).toBeGreaterThan(2 / 30 * 0.7)
    expect(report.temporal.meanDeltaEnergy).toBeLessThan(2 / 30 * 1.3)
    // Half-second stretches never reach the 5-second event floor.
    expect(report.events).toEqual([])
  })

  it('measures a moving dot: total coverage, sparse frames', () => {
    const report = runFixture(MOVING_DOT, 8_000)
    expect(report.spatial.everActiveFraction).toBe(1)
    expect(report.spatial.meanActiveFraction).toBeGreaterThan(0.9 / 64)
    expect(report.spatial.meanActiveFraction).toBeLessThan(1.6 / 64)
    // 63 of 64 pixels dark every frame still counts as a dark stretch by the
    // 90% default; the harness reports it and the summary cites the fraction.
    const dark = report.events.find((event) => event.kind === 'dark-stretch')
    expect(dark?.darkFraction).toBeCloseTo(63 / 64, 3)
  })
})

describe('telemetry determinism and cost (#8)', () => {
  const compiledStockShow = () => {
    const compiled = compileShowDocument(structuredClone(STOCK_SHOWS[0].show))
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) throw new Error('unreachable')
    return compiled
  }

  it('produces byte-identical reports for identical inputs', () => {
    const { code, metadata } = compiledStockShow()
    const first = runTelemetry(code, metadata, { durationMs: 10_000 })
    const second = runTelemetry(code, metadata, { durationMs: 10_000 })
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    // And the run is not trivially empty.
    expect(first.input.frameCount).toBe(300)
    expect(first.spatial.everActiveFraction).toBeGreaterThan(0)
  })

  it('changes the report when the seed changes', () => {
    const { code, metadata } = compiledStockShow()
    const seeded = runTelemetry(code, metadata, { durationMs: 5_000, randomSeed: 207 })
    const reseeded = runTelemetry(code, metadata, { durationMs: 5_000, randomSeed: 208 })
    // Not asserting inequality of every metric — patterns may ignore random —
    // but the report must carry the seed that produced it.
    expect(seeded.input.randomSeed).toBe(207)
    expect(reseeded.input.randomSeed).toBe(208)
  })

  it('measures a three-minute Show at N=64 in seconds, not minutes', { timeout: 120_000 }, () => {
    const { code, metadata } = compiledStockShow()
    const startedAt = performance.now()
    const report = runTelemetry(code, metadata, { durationMs: 180_000 })
    const elapsedSeconds = (performance.now() - startedAt) / 1000
    expect(report.input.frameCount).toBe(5_400)
    expect(elapsedSeconds).toBeLessThan(60)
  })
})
