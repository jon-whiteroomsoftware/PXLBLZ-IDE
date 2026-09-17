// Request-id correlation and turn timing on the bridge (#945): every NDJSON
// line of an /utterance response names the request it belongs to, the
// scripted bridge resolves a known utterance to its script when the overlay
// sends none, and the done event carries the bridge-side phase clock.
import { describe, expect, it } from 'vitest'
import { showFacts, SMOKE_UTTERANCE } from '../bridge/smoke.js'
import { parseBridgeEvents, createScriptedAgent, startBridge, type BridgeEvent } from '../bridge/service.js'
import { dictationFixture } from '../experiment/fixtures.js'
import type { AgentTurnContext, DictationAgent } from '../experiment/runner.js'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'

async function post(url: string, body: Record<string, unknown>): Promise<BridgeEvent[]> {
  const response = await fetch(`${url}/utterance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseBridgeEvents(await response.text())
}

/**
 * An agent whose first candidate is accepted by every command owner and still
 * refused by the turn's final validation, then repaired on the one repair pass.
 *
 * v2 moved the unavailable-Pattern case forward into the command owner, so the
 * failure that only final validation can see is the compiler restriction: a
 * participant Transition cannot be split across the derived section boundary a
 * section-scoped Property activation needs.
 */
function repairingAgent(): DictationAgent & { passes: Array<{ startedAt: number; endedAt: number }> } {
  const passes: Array<{ startedAt: number; endedAt: number }> = []
  let transitionId = ''
  return {
    name: 'repairing-agent',
    passes,
    run: async (context: AgentTurnContext) => {
      const pass = { startedAt: Date.now(), endedAt: 0 }
      passes.push(pass)
      await new Promise((resolve) => setTimeout(resolve, passes.length === 1 ? 40 : 60))
      if (passes.length === 1) {
        const first = context.listing.clips[0]
        const created = await context.callTool('create_clips', {
          session_id: context.sessionId,
          clips: [{
            zone_id: first.zoneId,
            layer_id: first.layerId,
            start_ms: first.endMs,
            duration_ms: 10_000,
            pattern: { kind: 'stock', id: 'TestPattern2D' },
          }],
        })
        const createdClipId = ((created.payload as { changes?: Array<{ details?: { clips?: string[] } }> })
          .changes?.[0]?.details?.clips ?? []).find((id) => id !== first.clipId) ?? ''
        await context.callTool('add_property_tracks', {
          session_id: context.sessionId,
          tracks: [{
            target: { kind: 'view-brightness', clip_id: createdClipId },
            keyframes: [{ at_ms: first.endMs, value: 1 }, { at_ms: first.endMs + 10_000, value: 0.2 }],
          }],
        })
        const inserted = await context.callTool('insert_transition', {
          session_id: context.sessionId,
          from_clip_id: first.clipId,
          to_clip_id: createdClipId,
          duration_ms: 2_000,
          kind: 'crossfade',
        })
        transitionId = ((inserted.payload as { changes?: Array<{ details?: { transitions?: string[] } }> })
          .changes?.[0]?.details?.transitions ?? [])[0] ?? ''
        pass.endedAt = Date.now()
        return { finalText: 'Added a crossfade.', completion: { intent: 'apply', reply: 'Added a crossfade.' } }
      }
      await context.callTool('remove_transition', { session_id: context.sessionId, transition_id: transitionId })
      pass.endedAt = Date.now()
      return { finalText: 'Left the Cut in place instead.', completion: { intent: 'apply', reply: 'Left the Cut in place instead.' } }
    },
  }
}

describe('bridge request ids and timing', () => {
  it('echoes the caller request id on every event and times the phases', async () => {
    const lines: string[] = []
    const bridge = await startBridge({ agent: createScriptedAgent(), scripted: true, port: 0, log: (line) => lines.push(line) })
    try {
      const events = await post(bridge.url, {
        requestId: 'req-test-1',
        show: dictationFixture('base'),
        utterance: SMOKE_UTTERANCE,
        delayMs: 150,
        context: {},
      })
      expect(events[0]).toMatchObject({ kind: 'accepted', requestId: 'req-test-1' })
      for (const event of events) expect(event.requestId).toBe('req-test-1')
      const tools = events.filter((event) => event.kind === 'tool')
      expect(tools.map((event) => (event.kind === 'tool' ? event.name : ''))).toEqual(['describe_show', 'resize_clip'])
      for (const event of tools) expect(typeof event.at).toBe('number')
      const validation = events.find((event) => event.kind === 'validation')
      expect(validation).toMatchObject({ kind: 'validation', ok: true })
      expect(typeof (validation as { ms: number }).ms).toBe('number')
      const done = events[events.length - 1]
      if (!done || done.kind !== 'done') throw new Error('no done event')
      expect(done.changed).toBe(true)
      expect(showFacts(done.show as ShowRecordV2).firstClipDurationMs).toBe(12_000)
      const { timing } = done
      expect(timing.delayMs).toBe(150)
      expect(timing.agentStartedAt - timing.acceptedAt).toBeGreaterThanOrEqual(150)
      expect(timing.agentEndedAt).toBeGreaterThanOrEqual(timing.agentStartedAt)
      expect(timing.exportedAt).toBeGreaterThanOrEqual(timing.agentEndedAt)
      expect(timing.toolCalls.map((call) => call.name)).toEqual(['describe_show', 'resize_clip'])
      expect(timing.validation).toMatchObject({ ok: true })
      expect(lines.some((line) => line.includes('req-test-1'))).toBe(true)
    } finally {
      await bridge.close()
    }
  })

  it('times a refused candidate and its repair as one agent phase', async () => {
    const agent = repairingAgent()
    const bridge = await startBridge({ agent, scripted: true, port: 0, log: () => {} })
    try {
      const events = await post(bridge.url, {
        requestId: 'req-repair-timing',
        show: dictationFixture('empty-tail'),
        utterance: 'Crossfade into a new Clip.',
        script: [],
        delayMs: 30,
        context: {},
      })
      const done = events[events.length - 1]
      if (!done || done.kind !== 'done') throw new Error('no done event')
      expect(done.changed).toBe(true)
      expect(agent.passes).toHaveLength(2)
      expect(events.filter((event) => event.kind === 'validation').map((event) => event.ok)).toEqual([false, true, true])

      const [first, repaired] = agent.passes
      expect(done.timing.delayMs).toBe(30)
      expect(done.timing.agentStartedAt - done.timing.acceptedAt).toBeGreaterThanOrEqual(30)
      expect(done.timing.agentStartedAt).toBeLessThanOrEqual(first.startedAt)
      expect(done.timing.agentStartedAt).toBeLessThan(first.endedAt)
      expect(done.timing.agentStartedAt).toBeLessThan(repaired.startedAt)
      expect(done.timing.agentEndedAt).toBeGreaterThanOrEqual(repaired.endedAt)
      expect(done.timing.agentEndedAt - done.timing.agentStartedAt).toBeGreaterThanOrEqual(100)
      expect(done.timing.exportedAt).toBeGreaterThanOrEqual(done.timing.agentEndedAt)
      expect(done.timing.toolCalls.map((call) => call.name))
        .toEqual(['create_clips', 'add_property_tracks', 'insert_transition', 'remove_transition'])
    } finally {
      await bridge.close()
    }
  })

  it('mints a request id when the caller sends none', async () => {
    const bridge = await startBridge({ agent: createScriptedAgent(), scripted: true, port: 0, log: () => {} })
    try {
      const events = await post(bridge.url, { show: dictationFixture('base'), utterance: SMOKE_UTTERANCE, context: {} })
      const ids = new Set(events.map((event) => event.requestId))
      expect(ids.size).toBe(1)
      expect([...ids][0]).toMatch(/^bridge-/)
    } finally {
      await bridge.close()
    }
  })

  it('applies the bridge default delay when the request names none', async () => {
    const bridge = await startBridge({ agent: createScriptedAgent(), scripted: true, port: 0, log: () => {}, defaultDelayMs: 120 })
    try {
      const health = (await (await fetch(`${bridge.url}/health`)).json()) as { defaultDelayMs: number }
      expect(health.defaultDelayMs).toBe(120)
      const events = await post(bridge.url, { show: dictationFixture('base'), utterance: SMOKE_UTTERANCE, context: {} })
      const done = events[events.length - 1]
      if (!done || done.kind !== 'done') throw new Error('no done event')
      expect(done.timing.delayMs).toBe(120)
      expect(done.timing.agentStartedAt - done.timing.acceptedAt).toBeGreaterThanOrEqual(120)
    } finally {
      await bridge.close()
    }
  })

  it('answers an unknown utterance without a script as a plain no-change reply', async () => {
    const bridge = await startBridge({ agent: createScriptedAgent(), scripted: true, port: 0, log: () => {} })
    try {
      const events = await post(bridge.url, { show: dictationFixture('base'), utterance: 'paint it blue', context: {} })
      const done = events[events.length - 1]
      if (!done || done.kind !== 'done') throw new Error('no done event')
      expect(done.changed).toBe(false)
      expect(done.show).toBeUndefined()
      expect(done.reply).toMatch(/scripted/i)
    } finally {
      await bridge.close()
    }
  })
})
