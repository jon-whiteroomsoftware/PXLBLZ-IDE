// Provenance: pxlblz-v3 test/measureShow.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { toShowRecordV2 } from './support/convertFixture.js'
import { measureShowDocument, showTimelineDurationMs } from '../telemetry/measure.js'

const STROBE_SOURCE = `
var t = 0
export function beforeRender(delta) { t += delta }
export function render2D(index, x, y) {
  var on = floor(t / 50) % 2
  rgb(on, on, on)
}
`

const BROKEN_SOURCE = `
export function beforeRender(delta) {}
export function render2D(index, x, y) { thisFunctionDoesNotExist(x) }
`

// Minimal portable version-2 Show around one inline user Pattern: one Zone, one
// Layer, one 12 s Clip, one Layout occurrence over the whole Show.
const inlineShow = (patternId: string): ShowRecordV2 => ({
  version: 2,
  id: 'measure-fixture',
  name: 'Measure Fixture',
  zones: [{ id: 'zone-main', name: 'Main', nominalPixelCount: 64 }],
  zoneLayouts: [
    { id: 'layout-full', name: 'Full Stage', zones: [], logical: { kind: 'single', zoneIds: ['zone-main'] } },
  ],
  outputContract: {
    version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 256,
    compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
  },
  composition: {
    version: 2,
    executionModel: 'continuous',
    showEndMs: 12_000,
    sampleRemap: { repeatScale: 1 },
    patternInstances: [{
      id: 'inst-1',
      pattern: { kind: 'user', id: patternId },
      patternName: patternId,
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    layers: [{ id: 'layer-main', zoneId: 'zone-main', name: 'Main', rank: 0 }],
    clips: [{
      id: 'clip-1',
      instanceId: 'inst-1',
      zoneId: 'zone-main',
      layerId: 'layer-main',
      startMs: 0,
      durationMs: 12_000,
      entryPolicy: 'continue',
      zoneSampleMode: 'independent',
      appearance: {
        keys: [{
          id: 'clip-1:appearance:1',
          timeMs: 0,
          value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
        }],
      },
    }],
    transitions: [],
    layoutOccurrences: [{ id: 'layout-occurrence-1', layoutId: 'layout-full', startMs: 0, durationMs: 12_000, parameters: {} }],
    propertyTracks: [],
    markers: [],
    groupDefinitions: [],
    groupOccurrences: [],
  },
  updatedAt: 0,
})

/** The stock catalogue entry as the version-2 record the app's converter makes. */
const stockShowV2 = () => toShowRecordV2(structuredClone(STOCK_SHOWS[0].show), STOCK_SHOWS[0].name)

describe('measureShowDocument (#12)', () => {
  it('measures a stock Show over its own timeline with the gate passing', () => {
    const show = stockShowV2()
    const result = measureShowDocument(show)
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) return
    const expectedMs = Math.min(600_000, Math.max(1_000, showTimelineDurationMs(show)))
    expect(result.report.input.durationMs).toBe(expectedMs)
    expect(result.report.input.fps).toBe(60)
    expect(result.report.flicker.bandLimitedByFps).toBe(false)
    expect(result.flickerGatePassed).toBe(true)
    expect(result.report.summary).toContain('Flicker gate passed')
    expect(result.compile.artifactBytes).toBeGreaterThan(0)
    expect(result.compile.clipCount).toBeGreaterThanOrEqual(1)
  })

  it('honors an explicit measurement window', () => {
    const result = measureShowDocument(stockShowV2(), [], { durationSeconds: 5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.report.input.durationMs).toBe(5_000)
    expect(result.report.input.frameCount).toBe(300)
  })

  it('returns the full report with a terminal verdict when the gate fails', () => {
    const result = measureShowDocument(inlineShow('strobe'), [{ id: 'strobe', source: STROBE_SOURCE }])
    expect(result.ok, JSON.stringify(result).slice(0, 300)).toBe(true)
    if (!result.ok) return
    expect(result.flickerGatePassed).toBe(false)
    expect(result.report.flicker.violations.length).toBeGreaterThan(0)
    expect(result.report.flicker.violations[0].meanFlashHz).toBeGreaterThan(8)
    expect(result.report.summary).toContain('FLICKER GATE FAILED')
  })

  it('rejects an invalid document with typed errors, not an exception', () => {
    const result = measureShowDocument('{"composition": [')
    expect(result).toMatchObject({ ok: false, reason: 'invalid-show' })
    if (result.ok || result.reason !== 'invalid-show') return
    expect(result.errors[0].code).toBe('malformed-json')
  })

  it('turns a runtime crash in Pattern code into an actionable error', () => {
    const result = measureShowDocument(inlineShow('broken'), [{ id: 'broken', source: BROKEN_SOURCE }])
    expect(result).toMatchObject({ ok: false, reason: 'execution-failed' })
    if (result.ok || result.reason !== 'execution-failed') return
    expect(result.error).toContain('failed during execution')
    expect(result.error).toContain('inline_patterns')
  })

  it('is deterministic across runs', () => {
    const first = measureShowDocument(stockShowV2(), [], { durationSeconds: 8 })
    const second = measureShowDocument(stockShowV2(), [], { durationSeconds: 8 })
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})
