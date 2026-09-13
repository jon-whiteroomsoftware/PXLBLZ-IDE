// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { createBuiltinClient } from './builtinClient'
import type { AgentBrowserSessionPort } from './channelPort'
it('uses only its registered window on ordinary and legacy Show URLs', async () => {
  window.history.replaceState(null, '', '/studio/shows/show?agent=1')
  const identity = { registrationId: 'registered', sessionId: 'session', showId: 'show' }
  const channel = { getWindow: () => identity, ready: Promise.resolve(identity) } as AgentBrowserSessionPort
  const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{"code":"started"}'))
  const client = createBuiltinClient(channel, transport)
  await client({ action: 'begin', window: { registrationId: 'forged' } })
  expect(JSON.parse((transport.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ action: 'begin', window: identity })
  window.history.replaceState(null, '', '/studio/shows/show')
  expect(await client({ action: 'begin' })).toEqual({ code: 'started' })
  expect(transport).toHaveBeenCalledTimes(2)
  expect(transport.mock.calls.map(call => call[0])).toEqual(['/api/agent/builtin', '/api/agent/builtin'])
})
