import { runTargetedResizeTurn } from '../experiment/targetedResizeTurn'
import { createOpenAiAgent } from '../experiment/openaiAgent'
import { createGuardedOpenAiTestFixture, functionCall, MOCKED_MODEL } from './support/guardedOpenAiTestFixture'

it('isolates the actual provider request and refuses broad dispatch before a matching proposal', async () => {
  const fixture = createGuardedOpenAiTestFixture()
  const previous = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'synthetic-no-network'
  try {
    fixture.queue.push(() => ({ output: [functionCall('broad', 'describe_show', { session_id: 'targeted-resize' })] }))
    fixture.queue.push(() => ({ output: [functionCall('resize', 'resize_clip', { clip_id: 'target', duration_ms: 6000, finish_turn_reply: { intent: 'apply' } })] }))
    const serialized: Array<Record<string, unknown>> = []
    const agent = createOpenAiAgent({ model: MOCKED_MODEL, budget: fixture.budget, transport: { ...fixture.transport, fetch: async (url, init) => {
      serialized.push(JSON.parse(String(init?.body)))
      return fixture.transport.fetch(url, init)
    } } })
    expect(await runTargetedResizeTurn(agent, { clipId: 'target', durationMs: 6000 })).toEqual({ kind: 'proposal', intent: { clipId: 'target', durationMs: 6000 } })
    expect(fixture.requests).toHaveLength(2)
    expect(serialized[0]).toMatchSnapshot()
    expect(serialized[1].tools).toEqual(serialized[0].tools)
    expect(Object.keys(serialized[0]).sort()).toEqual(['input', 'max_output_tokens', 'model', 'service_tier', 'tools', 'truncation'])
    const input = fixture.requests[0] as Array<{ role: string; content: string }>
    expect(input.map(message => message.role)).toEqual(['developer', 'user'])
    expect(input[1].content).toBe('Editor context: Nothing is hovered or selected and no playhead is set.\nCurrent Show (describe_show projection): {"clipId":"target","durationMs":6000}\nThe user says: "Propose exactly the supplied Clip duration, or finish with refusal."')
    const advertised = serialized[0].tools as Array<{ name: string; parameters: { additionalProperties: boolean; properties: Record<string, unknown> } }>
    expect(advertised.map(tool => tool.name)).toEqual(['resize_clip', 'finish_turn'])
    expect(Object.keys(advertised[0].parameters.properties).sort()).toEqual(['clip_id', 'duration_ms', 'finish_turn_reply', 'session_id'])
    expect(advertised[0].parameters.properties.clip_id).toEqual({ type: 'string', const: 'target' })
    expect(advertised[0].parameters.properties.duration_ms).toEqual({ type: 'integer', const: 6000 })
    expect(advertised.every(tool => tool.parameters.additionalProperties === false)).toBe(true)
    const followup = fixture.requests[1] as Array<{ type?: string; output?: string }>
    expect(followup.find(item => item.type === 'function_call_output')?.output).toBe('{"ok":false,"code":"unsupported-call"}')
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previous
    fixture.close()
  }
})
it.each(['missing', 'throw', 'incomplete', 'contradictory', 'refuse'] as const)('never proposes after %s completion', async mode => {
  const result = await runTargetedResizeTurn({ name: 'scripted-boundary', run: async context => {
    if (mode !== 'missing') {
      await context.callTool('resize_clip', { clip_id: 'target', duration_ms: 6000 })
      if (mode !== 'refuse') context.finishTurn!({ intent: 'apply' })
    }
    if (mode === 'throw') throw new Error('unrelated-error-sentinel')
    if (mode === 'incomplete') return { finalText: 'sentinel', incomplete: { reason: 'turn-limit' } }
    return { finalText: 'sentinel', completion: { intent: mode === 'refuse' || mode === 'contradictory' ? 'refuse' : 'apply' } }
  } }, { clipId: 'target', durationMs: 6000 })
  expect(result).toEqual({ kind: mode === 'throw' ? 'service-error' : mode === 'refuse' ? 'refused' : 'incomplete' })
})
it('rejects arbitrary context and all foreign operations without invoking a provider', async () => {
  const run = vi.fn()
  expect(await runTargetedResizeTurn({ name: 'unused', run }, { clipId: 'target', durationMs: 6000, history: ['sentinel'] })).toEqual({ kind: 'refused' })
  expect(run).not.toHaveBeenCalled()
})
it('returns fixed errors for foreign/extra argument calls and rejects a changed duplicate', async () => {
  await runTargetedResizeTurn({ name: 'adversarial', run: async context => {
    for (const [name, args] of [['describe_show', {}], ['move_clip', {}], ['resize_clip', { clip_id: 'foreign', duration_ms: 6000 }], ['resize_clip', { clip_id: 'target', duration_ms: 6000, text: 'sentinel' }]] as const) {
      const result = await context.callTool(name, args)
      expect(result).toEqual({ payload: { ok: false, code: name === 'resize_clip' ? 'invalid-proposal' : 'unsupported-call' }, isError: true })
    }
    expect((await context.callTool('resize_clip', { clip_id: 'target', duration_ms: 6000 })).isError).toBe(false)
    expect((await context.callTool('resize_clip', { clip_id: 'target', duration_ms: 7000 })).isError).toBe(true)
    return { finalText: '', completion: { intent: 'refuse' } }
  } }, { clipId: 'target', durationMs: 6000 })
})
it('serves the finite HTTP route without accepting broad payloads', async () => {
  const { startBridge, createScriptedAgent } = await import('../bridge/service')
  const bridge = await startBridge({ agent: createScriptedAgent(), scripted: true, log: () => {} })
  try {
    const invoke = async (value: unknown) => (await fetch(`${bridge.url}/resize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })).json()
    expect(await invoke({ clipId: 'target', durationMs: 6000 })).toEqual({ kind: 'proposal', intent: { clipId: 'target', durationMs: 6000 } })
    expect(await invoke({ clipId: 'target', durationMs: 6000, show: { sentinel: true } })).toEqual({ kind: 'refused' })
  } finally { await bridge.close() }
})
