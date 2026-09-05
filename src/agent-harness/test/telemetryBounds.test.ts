// V2-authored for #945 (candidate review of a4e11cc0, P1): the raw telemetry
// entry bounds its window and frame rate exactly as the Show entry does.
// runTelemetry used to check only finite-and-positive, so a direct caller
// with durationMs 1e12 at 240 fps ran 240 billion frames. Boundary:
// runTelemetry and measureShowDocument. Invariant: every entry resolves the
// same envelope before any Pattern code is compiled or run: a finite positive
// window clamps into [1 s, 600 s]; a non-finite or non-positive window and an
// fps that is not an integer in [1, 240] are refused. Oracles: the report's
// input block (effective window and frame count), and a Pattern whose module
// body throws on load, proving the refusal came first.
import { describe, expect, it } from 'vitest'
import { inspectPatternMetadata } from '@/engine/bundle'
import { runTelemetry } from '../telemetry/harness.js'
import { measureShowDocument } from '../telemetry/measure.js'
import { grammarFixtureShow } from './support/grammarFixture.js'

const CONSTANT_DARK = `
export function beforeRender(delta) {}
export function render2D(index, x, y) { rgb(0, 0, 0) }
`

/** Throws while the module body runs: loadPattern never returns a handle. */
const LOAD_THROWS = `
var boom = (function () { throw new Error('the Pattern module ran') })()
export function beforeRender(delta) {}
export function render2D(index, x, y) { rgb(0, 0, 0) }
`

describe('the raw telemetry entry bounds its work like the Show entry (#945 repair)', () => {
  it('clamps a finite excessive window to 600 s at the highest frame rate', () => {
    const report = runTelemetry(CONSTANT_DARK, inspectPatternMetadata(CONSTANT_DARK), {
      durationMs: 1e12,
      fps: 240,
      pixelCount: 4,
    })
    expect(report.input.durationMs).toBe(600_000)
    expect(report.input.frameCount).toBe(144_000)
    expect(report.luminance.perSecondMean).toHaveLength(600)
    expect(report.summary).toContain('Rendered 144000 frames (10:00) at 240 fps')
  })

  it('clamps a sub-second window up to 1 s', () => {
    const report = runTelemetry(CONSTANT_DARK, inspectPatternMetadata(CONSTANT_DARK), { durationMs: 0.5, fps: 10 })
    expect(report.input.durationMs).toBe(1_000)
    expect(report.input.frameCount).toBe(10)
  })

  it('refuses non-finite or non-positive windows and out-of-range fps before the Pattern loads', () => {
    const metadata = inspectPatternMetadata(LOAD_THROWS)
    const refused: Array<[string, { durationMs: number; fps?: number }, RegExp]> = [
      ['Infinity window', { durationMs: Number.POSITIVE_INFINITY }, /durationMs/],
      ['NaN window', { durationMs: Number.NaN }, /durationMs/],
      ['zero window', { durationMs: 0 }, /durationMs/],
      ['negative window', { durationMs: -1_000 }, /durationMs/],
      ['zero fps', { durationMs: 1_000, fps: 0 }, /fps/],
      ['fps above 240', { durationMs: 1_000, fps: 241 }, /fps/],
      ['fractional fps', { durationMs: 1_000, fps: 2.5 }, /fps/],
      ['Infinity fps', { durationMs: 1_000, fps: Number.POSITIVE_INFINITY }, /fps/],
      ['NaN fps', { durationMs: 1_000, fps: Number.NaN }, /fps/],
      ['huge window and huge fps', { durationMs: 1e12, fps: 1e6 }, /fps/],
    ]
    for (const [label, options, expected] of refused) {
      let caught: unknown
      try {
        runTelemetry(LOAD_THROWS, metadata, options)
      } catch (error) {
        caught = error
      }
      expect(caught, label).toBeInstanceOf(Error)
      expect((caught as Error).message, label).toMatch(expected)
      expect((caught as Error).message, label).not.toContain('the Pattern module ran')
    }
    // Within the envelope the Pattern is loaded, proving the guards above ran first.
    expect(() => runTelemetry(LOAD_THROWS, metadata, { durationMs: 1_000, fps: 10 })).toThrowError('the Pattern module ran')
  })

  it('refuses a non-positive window at the Show entry with a typed reason', () => {
    const show = grammarFixtureShow()
    for (const durationSeconds of [0, -5]) {
      const result = measureShowDocument(show, [], { durationSeconds, fps: 1 })
      expect(result, String(durationSeconds)).toMatchObject({ ok: false, reason: 'invalid-options' })
      if (result.ok || result.reason !== 'invalid-options') continue
      expect(result.error).toMatch(/durationSeconds/)
    }
  })
})
