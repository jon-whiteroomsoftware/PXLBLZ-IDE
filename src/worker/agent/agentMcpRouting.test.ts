import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../apiRoutes'
import { agentMcpRouting } from './agentMcpRouting'

it('preserves no_live_editor for a current grant whose browser binding is retiring', async () => {
  const owner = { fetch: vi.fn(async () => Response.json({ code: 'retirement_unconfirmed' })) }
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => owner },
    ASSETS: { fetch: vi.fn() },
  } as unknown as WorkerEnv
  const request = new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_show', arguments: { binding_id: 'retiring-binding' } } }),
  })
  const response = await agentMcpRouting(request, env, {
    accountId: 'account', clientId: 'client', clientName: 'Client', clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60,
  })
  expect(await response.json()).toMatchObject({ result: { structuredContent: { code: 'no_live_editor' } } })
  expect(owner.fetch).toHaveBeenCalledOnce()
})
