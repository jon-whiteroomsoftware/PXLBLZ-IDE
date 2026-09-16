import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../apiRoutes'
import { agentMcpRouting } from './agentMcpRouting'
import { createShowEditSession } from '../../engine/showEditAdmission'

const grant = {
  accountId: 'account', clientId: 'client', clientName: 'Client', clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60,
}

async function callTool(owner: { fetch(request: Request): Promise<Response> }, name: string, args: object = {}) {
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => owner },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
  } as unknown as WorkerEnv
  const response = await agentMcpRouting(new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }), env, grant)
  return await response.json() as { result: { structuredContent: Record<string, unknown> } }
}

it.each([
  ['get_connection', {}],
  ['list_commands', {}],
  ['read_show', { binding_id: 'binding' }],
  ['get_context', { binding_id: 'binding' }],
  ['begin_edit', { binding_id: 'binding', operation_id: 'operation', delivery_id: 'begin', sequence: 0 }],
  ['rename_show', { binding_id: 'binding', operation_id: 'operation', delivery_id: 'rename', sequence: 1, name: 'Renamed' }],
  ['commit_edit', { binding_id: 'binding', operation_id: 'operation', delivery_id: 'commit', sequence: 2 }],
  ['cancel_edit', { binding_id: 'binding', operation_id: 'operation', delivery_id: 'cancel', sequence: 2 }],
  ['get_outcome', { binding_id: 'binding', operation_id: 'operation' }],
] as const)('%s preserves one authoritative throttled owner response', async (name, args) => {
  const owner = { fetch: vi.fn(async () => Response.json({ code: 'throttled', retry_after_ms: 4321 }, { status: 429 })) }
  const body = await callTool(owner, name, args)
  expect(body.result.structuredContent).toEqual({ code: 'throttled', retry_after_ms: 4321 })
  expect(owner.fetch).toHaveBeenCalledOnce()
})

it('preserves no_live_editor for a current grant whose browser binding is retiring', async () => {
  const owner = { fetch: vi.fn(async () => Response.json({ code: 'retirement_unconfirmed' })) }
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => owner },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
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
  const owner = { fetch: vi.fn().mockResolvedValueOnce(Response.json({ code: 'outcome', receipt })) }
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
