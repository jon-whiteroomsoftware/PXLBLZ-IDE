import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../apiRoutes'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'
import { agentMcpRouting } from './agentMcpRouting'

const grant = { accountId: 'account', clientId: 'client', clientName: 'Client', clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60 }
type JsonSchema = { properties?: Record<string, JsonSchema>; required?: string[]; [key: string]: unknown }
const OBSERVED_BASE_BYTES = 271_687

it('measures the server-owned identity schema reduction against the same command catalogue', async () => {
  const response = await agentMcpRouting(new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }), { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv, grant)
  const current = await response.json() as { result: { tools: Array<{ name: string; inputSchema: JsonSchema; outputSchema: JsonSchema }> } }
  const mutationNames = new Set(['begin_edit', ...SHOW_COMMANDS.map(command => command.name), 'commit_edit', 'cancel_edit'])
  const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength
  const measurement = {
    tools: current.result.tools.length,
    mutations: current.result.tools.filter(tool => mutationNames.has(tool.name)).length,
    baseBytes: OBSERVED_BASE_BYTES,
    currentBytes: encoded(current),
  }
  const delta = measurement.currentBytes - measurement.baseBytes
  console.info('issue-1048-schema-census', JSON.stringify({ ...measurement, delta }))
  expect(measurement).toMatchObject({ tools: SHOW_COMMANDS.length + 8, mutations: SHOW_COMMANDS.length + 3 })
  expect(delta).toBeLessThan(0)
})
