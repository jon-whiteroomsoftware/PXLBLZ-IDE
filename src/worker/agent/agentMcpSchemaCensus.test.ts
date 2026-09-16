import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../apiRoutes'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'
import { agentMcpRouting } from './agentMcpRouting'

const grant = { accountId: 'account', clientId: 'client', clientName: 'Client', clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60 }
type JsonSchema = { properties?: Record<string, JsonSchema>; required?: string[]; [key: string]: unknown }
// Actual tools/list responses from the same 64-tool discovery catalogue before
// and after #1048 moved mutation identity ownership into the relay.
const OBSERVED_PRE_IDENTITY_BYTES = 360_987
const OBSERVED_IDENTITY_BYTES = 358_419

it('measures identity and concise-description reductions against the same discovery catalogue', async () => {
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
    preIdentityBytes: OBSERVED_PRE_IDENTITY_BYTES,
    identityBytes: OBSERVED_IDENTITY_BYTES,
    currentBytes: encoded(current),
  }
  const identityDelta = measurement.identityBytes - measurement.preIdentityBytes
  const conciseDescriptionDelta = measurement.currentBytes - measurement.identityBytes
  console.info('issue-1051-schema-census', JSON.stringify({ ...measurement, identityDelta, conciseDescriptionDelta }))
  expect(measurement).toMatchObject({ tools: SHOW_COMMANDS.length + 10, mutations: SHOW_COMMANDS.length + 3 })
  expect(identityDelta).toBe(-2_568)
  expect(conciseDescriptionDelta).toBeLessThan(0)
})
