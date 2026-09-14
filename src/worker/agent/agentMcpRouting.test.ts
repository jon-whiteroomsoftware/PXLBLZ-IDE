import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../apiRoutes'
import { agentMcpRouting } from './agentMcpRouting'
import { createShowEditSession } from '../../engine/showEditAdmission'

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

it('serializes the actual retained outcome diagnostic in text and structured MCP output', async () => {
  const session = createShowEditSession('session', 'show')
  session.begin({ operationId: 'op', payloadKey: '', referenceContext: '{}', targets: ['show'] }, 0)
  const receipt = session.refuse('op', 'invalid-candidate', {
    stage: 'authoring', issues: [{ code: 'invalid-scene-duration', path: '["scene","scene-2","durationMs"]' }],
  })!
  const claim = {
    bindingId: 'binding', registrationId: 'registration', sessionId: 'session', showId: 'show',
    agentKind: 'external', agentId: 'grant', agentName: 'Client', callId: 'call',
  }
  const owner = { fetch: vi.fn()
    .mockResolvedValueOnce(Response.json({ code: 'bound', claim, binding: claim }))
    .mockResolvedValueOnce(Response.json({ code: 'outcome', receipt })) }
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => owner },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
  } as unknown as WorkerEnv
  const request = new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_outcome', arguments: { binding_id: 'binding', operation_id: 'op' } } }),
  })
  const response = await agentMcpRouting(request, env, {
    accountId: 'account', clientId: 'client', clientName: 'Client', clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60,
  })
  const body = await response.json() as { result: { content: Array<{ text: string }>; structuredContent: unknown } }
  expect(body.result.structuredContent).toEqual({ code: 'outcome', receipt })
  expect(JSON.parse(body.result.content[0].text)).toEqual({ code: 'outcome', receipt })
})
