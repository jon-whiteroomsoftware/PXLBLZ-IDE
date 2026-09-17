// V2-authored for #945, re-authored on the version-2 record for #1039: the
// default measurement window is the Show's own loop length and every telemetry
// entry bounds its work before executing Pattern code. Boundary:
// measureShowDocument, runTelemetry and the measure_show MCP tool.
// Invariants: the default window equals `composition.showEndMs`, which owns the
// loop in v2, so a trailing Transition or blank tail is measured without summing
// anything; an explicit window is finite and lands in [1 s, 600 s] with an
// integer fps in [1, 240] before any frame renders; a non-finite request is
// refused with a typed reason, never run. Oracles: the report's own input block,
// the events the final tail produces, and a Pattern that throws on its first
// render proving the guard runs first.
import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { inspectPatternMetadata } from '@/engine/bundle'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { createShowsServer } from '../mcp/showsServer.js'
import { runTelemetry } from '../telemetry/harness.js'
import { measureShowDocument, showTimelineDurationMs } from '../telemetry/measure.js'
import { grammarFixtureShow } from './support/grammarFixture.js'

const CONSTANT_WHITE = `
export function beforeRender(delta) {}
export function render2D(index, x, y) { rgb(1, 1, 1) }
`

const THROWS_ON_RENDER = `
export function beforeRender(delta) {}
export function render2D(index, x, y) { thisFunctionDoesNotExist(x) }
`

/** 30 s of an inline white Pattern, then a 6 s blank tail before Show End. */
function fadeToDarkShow(): ShowRecordV2 {
  const show = grammarFixtureShow({ emptyTail: true })
  show.composition.showEndMs = 36_000
  show.composition.layoutOccurrences[0].durationMs = 36_000
  show.composition.patternInstances[0].pattern = { kind: 'user', id: 'white' }
  show.composition.patternInstances[0].patternName = 'White'
  return show
}

describe('the default window is the Show\'s own loop length (#1039)', () => {
  it('measures to Show End, including the Transition tail', () => {
    const show = grammarFixtureShow({ boundaryCrossfade: true })
    expect(showTimelineDurationMs(show)).toBe(60_000)
    const result = measureShowDocument(show, [], { fps: 1 })
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) return
    expect(result.report.input.durationMs).toBe(60_000)
  })

  it('reaches a blank tail that ends before Show End', () => {
    const show = fadeToDarkShow()
    const inline = [{ id: 'white', source: CONSTANT_WHITE }]
    expect(showTimelineDurationMs(show)).toBe(36_000)

    const measured = measureShowDocument(show, inline, { fps: 10 })
    expect(measured.ok, JSON.stringify(measured)).toBe(true)
    if (!measured.ok) return
    expect(measured.report.input.durationMs).toBe(36_000)
    const dark = measured.report.events.find((event) => event.kind === 'dark-stretch')
    expect(dark).toMatchObject({ startMs: 30_000, durationMs: 6_000 })

    // A window that stops inside the Clip never reaches the event.
    const truncated = measureShowDocument(show, inline, { fps: 10, durationSeconds: 29 })
    expect(truncated.ok).toBe(true)
    if (!truncated.ok) return
    expect(truncated.report.events.some((event) => event.kind === 'dark-stretch')).toBe(false)
  })

  it('honours the 600 s cap', () => {
    const long = grammarFixtureShow()
    long.composition.showEndMs = 1_000_000
    long.composition.layoutOccurrences[0].durationMs = 1_000_000
    const result = measureShowDocument(long, [], { fps: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.report.input.durationMs).toBe(600_000)
    expect(result.report.input.frameCount).toBe(600)
  })
})

describe('every telemetry entry bounds its work before executing (#945)', () => {
  const throwingShow = () => {
    const show = grammarFixtureShow({ emptyTail: true })
    show.composition.patternInstances[0].pattern = { kind: 'user', id: 'throws' }
    show.composition.patternInstances[0].patternName = 'Throws'
    return show
  }
  const throwingInline = [{ id: 'throws', source: THROWS_ON_RENDER }]

  it('clamps an explicit window into [1 s, 600 s]', () => {
    const show = grammarFixtureShow()
    const huge = measureShowDocument(show, [], { durationSeconds: 1e12, fps: 1 })
    expect(huge.ok).toBe(true)
    if (huge.ok) {
      expect(huge.report.input.durationMs).toBe(600_000)
      expect(huge.report.input.frameCount).toBe(600)
    }
    const tiny = measureShowDocument(show, [], { durationSeconds: 0.01, fps: 10 })
    expect(tiny.ok).toBe(true)
    if (tiny.ok) expect(tiny.report.input.durationMs).toBe(1_000)
  })

  it('refuses a non-finite window or fps with a typed reason before any frame renders', () => {
    const cases: Array<[string, Parameters<typeof measureShowDocument>[2]]> = [
      ['Infinity seconds', { durationSeconds: Number.POSITIVE_INFINITY }],
      ['NaN seconds', { durationSeconds: Number.NaN }],
      ['Infinity fps', { fps: Number.POSITIVE_INFINITY }],
      ['fractional fps', { fps: 2.5 }],
      ['zero fps', { fps: 0 }],
      ['fps above 240', { fps: 1_000 }],
    ]
    for (const [label, options] of cases) {
      const result = measureShowDocument(throwingShow(), throwingInline, options)
      expect(result, label).toMatchObject({ ok: false, reason: 'invalid-options' })
      if (result.ok || result.reason !== 'invalid-options') continue
      expect(result.error, label).not.toContain('failed during execution')
    }
    // The Pattern really does throw once execution is allowed to start.
    expect(measureShowDocument(throwingShow(), throwingInline, { fps: 10 })).toMatchObject({ ok: false, reason: 'execution-failed' })
  })

  it('guards the raw harness the same way', () => {
    const metadata = inspectPatternMetadata(THROWS_ON_RENDER)
    expect(() => runTelemetry(THROWS_ON_RENDER, metadata, { durationMs: Number.POSITIVE_INFINITY })).toThrowError(/finite/)
    expect(() => runTelemetry(THROWS_ON_RENDER, metadata, { durationMs: Number.NaN })).toThrowError(/finite/)
    expect(() => runTelemetry(THROWS_ON_RENDER, metadata, { durationMs: 0 })).toThrowError(/positive/)
    expect(() => runTelemetry(THROWS_ON_RENDER, metadata, { durationMs: 1_000, fps: Number.POSITIVE_INFINITY })).toThrowError(/fps/)
    // With valid bounds the render error surfaces, proving the guards ran first above.
    expect(() => runTelemetry(THROWS_ON_RENDER, metadata, { durationMs: 1_000, fps: 10 })).toThrowError(/thisFunctionDoesNotExist/)
  })

  it('bounds the MCP entry too', async () => {
    const server = createShowsServer()
    const client = new Client({ name: 'measure-bounds', version: '0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      const show = grammarFixtureShow()
      const huge = await client.callTool({ name: 'measure_show', arguments: { show, duration_seconds: 1e9, fps: 1 } })
      expect(huge.isError, JSON.stringify(huge.content).slice(0, 300)).not.toBe(true)
      const payload = JSON.parse((huge.content as Array<{ text: string }>)[0].text) as { report: { input: { durationMs: number; frameCount: number } } }
      expect(payload.report.input.durationMs).toBe(600_000)
      expect(payload.report.input.frameCount).toBe(600)

      const negative = await client.callTool({ name: 'measure_show', arguments: { show, duration_seconds: -5 } })
      expect(negative.isError).toBe(true)
      const fastFps = await client.callTool({ name: 'measure_show', arguments: { show, duration_seconds: 1, fps: 100_000 } })
      expect(fastFps.isError).toBe(true)
    } finally {
      await client.close()
      await server.close()
    }
  })
})
