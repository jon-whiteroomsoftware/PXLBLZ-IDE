// Provenance: pxlblz-v3 test/measureShow.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
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

// Minimal portable Show around one inline user pattern.
const inlineShow = (patternId: string) => ({
  id: 'measure-fixture',
  name: 'Measure Fixture',
  scenes: [{ id: 'scene-1', name: 'One', durationMs: 12_000 }],
  zones: [{ id: 'zone-main', name: 'Main', nominalPixelCount: 64 }],
  cells: [
    {
      id: 'cell-1', zoneId: 'zone-main', sceneId: 'scene-1', sceneSpan: 1,
      pattern: { kind: 'user', id: patternId }, patternName: patternId,
      adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
    },
  ],
  routingLayouts: [
    { id: 'layout-full', name: 'Full Stage', zones: [], logical: { kind: 'single', zoneIds: ['zone-main'] } },
  ],
  transitions: [],
  outputContract: {
    version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 256,
    compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
  },
  updatedAt: 0,
})

describe('measureShowDocument (#12)', () => {
  it('measures a stock Show over its own timeline with the gate passing', () => {
    const show = structuredClone(STOCK_SHOWS[0].show)
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
    const result = measureShowDocument(structuredClone(STOCK_SHOWS[0].show), [], { durationSeconds: 5 })
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
    const result = measureShowDocument('{"cells": [')
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
    const first = measureShowDocument(structuredClone(STOCK_SHOWS[0].show), [], { durationSeconds: 8 })
    const second = measureShowDocument(structuredClone(STOCK_SHOWS[0].show), [], { durationSeconds: 8 })
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})
