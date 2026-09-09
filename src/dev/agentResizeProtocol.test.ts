import { parseAgentResizeIntent, sameAgentResizeIntent } from './agentResizeProtocol'

it('admits only the finite typed exact-duration request', () => {
  expect(parseAgentResizeIntent({ clipId: 'logical-clip', durationMs: 6000 })).toEqual({ clipId: 'logical-clip', durationMs: 6000 })
  for (const value of [null, 'make it longer', { clipId: 'a', durationMs: 1.5 }, { clipId: 'a', durationMs: Infinity }, { clipId: '', durationMs: 1 }, { clipId: 'a', durationMs: 0 }, { clipId: 'a', durationMs: 6, utterance: 'like before' }, { clipId: 'a', durationMs: 6, history: [] }]) expect(parseAgentResizeIntent(value)).toBeUndefined()
  expect(sameAgentResizeIntent({ clipId: 'a', durationMs: 6 }, { clipId: 'b', durationMs: 6 })).toBe(false)
})
