// Bridge smoke oracle (#945): one scripted, no-paid-call turn through the
// real loopback bridge (HTTP + NDJSON), the in-memory MCP client/server
// pair, a grammar session and the shared turn runner, whose returned
// candidate is then judged at the consumer surfaces: the `.pxlshow` file
// reopened through the Show importer and the `.epe` reopened through the
// Pattern importer, both projected with the V2 editor's own timeline
// projection. Nothing here substitutes a replacement record; the candidate
// is whatever the session exported.
//
// Test model. Boundary: `runBridgeSmoke` over the started bridge.
// Invariants: the candidate keeps the Show id; the only visible change is
// the scripted one; the change survives export and reopen; the scripted
// delay holds the turn open for at least that long. Partitions: default
// run; delayed run. Oracles: reopened artifacts, not the bridge's own
// response. Residual gap: this drives the bridge, not the editor route.
import { describe, expect, it } from 'vitest'
import { runBridgeSmoke } from '../bridge/smoke.js'

describe('scripted bridge turn judged at exported artifacts (#945)', () => {
  it('resizes the first Clip through MCP and the change survives .pxlshow and .epe reopen', async () => {
    const result = await runBridgeSmoke()

    // The bridge ran the agent through the MCP tool path, not a shortcut.
    expect(result.toolEvents).toEqual(['describe_show', 'resize_clip'])
    expect(result.response.changed).toBe(true)
    expect(result.response.summaries).toHaveLength(1)
    expect(result.response.reply).toBe('The first Clip is twelve seconds.')

    // The candidate is the same Show, edited once.
    expect(result.candidate.id).toBe(result.fixture.id)
    expect(result.fixture.firstClipDurationMs).toBe(30_000)
    expect(result.candidate.firstClipDurationMs).toBe(12_000)
    expect(result.candidate.clipCount).toBe(result.fixture.clipCount)

    // Consumer surfaces: the reopened .pxlshow projects the same edit
    // through the editor's timeline projection; the reopened .epe is a
    // Show-stamped artifact whose generated source changed with the edit.
    expect(result.pxlshow.bytes).toBeGreaterThan(0)
    expect(result.pxlshow.reopenedShowName).toBe(result.fixture.name)
    expect(result.pxlshow.reopenedFirstClipDurationMs).toBe(12_000)
    expect(result.pxlshow.reopenedClipCount).toBe(result.fixture.clipCount)
    expect(result.epe.bytes).toBeGreaterThan(0)
    expect(result.epe.stampKind).toBe('show')
    expect(result.epe.sourceChangedFromFixture).toBe(true)

    expect(result.checks.filter((check) => !check.ok)).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('honours a scripted completion delay without changing the outcome', async () => {
    const result = await runBridgeSmoke({ delayMs: 400 })
    expect(result.turnMs).toBeGreaterThanOrEqual(400)
    expect(result.candidate.firstClipDurationMs).toBe(12_000)
    expect(result.ok).toBe(true)
  })
})
