import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../apiRoutes'
import { SHOW_COMMANDS_V2 } from '../../engine/showCommandsV2/registry'
import { agentMcpRouting } from './agentMcpRouting'

const grant = { accountId: 'account', clientId: 'client', clientName: 'Client', clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60 }
type JsonSchema = { properties?: Record<string, JsonSchema>; required?: string[]; [key: string]: unknown }
/** The production catalogue's own discovery size: measured at the #1039 flip, re-pinned when #1066 named the converted-boundary re-placement refusal in update_clips (+47 bytes), then #1069 added remove_controls to three command schemas (+624 bytes), #1093 kept remove_controls on update_clips only (-416 bytes), #1094 retired repeat-per-zone Clip sampling (295,626 to 295,599 bytes, -27), #1111 described the one leading-resize rule in resize_clip (295,599 to 295,690 bytes, +91), and #1042 removed not_qualified from mutation outcomes (295,690 to 294,746 bytes, -944). */
const OBSERVED_V2_DISCOVERY_BYTES = 294_746

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
  const mutationNames = new Set(['begin_edit', ...SHOW_COMMANDS_V2.map(command => command.name), 'commit_edit', 'cancel_edit'])
  const measurement = {
    tools: production.result.tools.length,
    mutations: production.result.tools.filter(tool => mutationNames.has(tool.name)).length,
    currentBytes: encoded(production),
  }
  console.info('issue-1039-v2-schema-census', JSON.stringify(measurement))
  expect(measurement).toMatchObject({ tools: SHOW_COMMANDS_V2.length + 10, mutations: SHOW_COMMANDS_V2.length + 3 })
  expect(measurement.currentBytes).toBe(OBSERVED_V2_DISCOVERY_BYTES)
  // Discovery is what every unbound client pays before it binds, so its size is
  // measured rather than assumed.
  expect(encoded(unqualified)).toBe(measurement.currentBytes)
})
