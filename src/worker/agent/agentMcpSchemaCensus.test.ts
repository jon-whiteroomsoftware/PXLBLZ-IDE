import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../apiRoutes'
import { SHOW_COMMANDS_V2 } from '../../engine/showCommandsV2/registry'
import { agentMcpRouting } from './agentMcpRouting'

const grant = { accountId: 'account', clientId: 'client', clientName: 'Client', clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60 }
type JsonSchema = { properties?: Record<string, JsonSchema>; required?: string[]; [key: string]: unknown }
/** The production catalogue's own discovery size: #1157 added a bounded replace_show tool schema (294,751 to 299,077 bytes). The complete record schema is a separate resource, not inlined into tools/list. */
const OBSERVED_V2_DISCOVERY_BYTES = 299_077

async function toolsList() {
  const response = await agentMcpRouting(new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }), { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv, grant)
  return await response.json() as { result: { tools: Array<{ name: string; inputSchema: JsonSchema; outputSchema: JsonSchema }> } }
}

const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength

it('measures the production v2 discovery catalogue (#1042)', async () => {
  const production = await toolsList()
  const unqualified = await toolsList()
  const mutationNames = new Set(['begin_edit', ...SHOW_COMMANDS_V2.map(command => command.name), 'replace_show', 'commit_edit', 'cancel_edit'])
  const measurement = {
    tools: production.result.tools.length,
    mutations: production.result.tools.filter(tool => mutationNames.has(tool.name)).length,
    currentBytes: encoded(production),
  }
  console.info('issue-1039-v2-schema-census', JSON.stringify(measurement))
  expect(measurement).toMatchObject({ tools: SHOW_COMMANDS_V2.length + 11, mutations: SHOW_COMMANDS_V2.length + 4 })
  expect(measurement.currentBytes).toBe(OBSERVED_V2_DISCOVERY_BYTES)
  // Discovery is what every unbound client pays before it binds, so its size is
  // measured rather than assumed.
  expect(encoded(unqualified)).toBe(measurement.currentBytes)
})
