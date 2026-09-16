import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../apiRoutes'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'
import { agentMcpRouting } from './agentMcpRouting'

const grant = { accountId: 'account', clientId: 'client', clientName: 'Client', clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60 }
type JsonSchema = { properties?: Record<string, JsonSchema>; required?: string[]; [key: string]: unknown }
const OBSERVED_PRE_IDENTITY_BYTES = 271_687
const OBSERVED_IDENTITY_BYTES = 269_177
const OBSERVED_CONCISE_DESCRIPTION_BYTES = 256_507

it('measures identity and concise-description reductions against the same command catalogue', async () => {
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
  console.info('issue-1049-schema-census', JSON.stringify({ ...measurement, identityDelta, conciseDescriptionDelta }))
  expect(measurement).toMatchObject({ tools: SHOW_COMMANDS.length + 8, mutations: SHOW_COMMANDS.length + 3 })
  expect(identityDelta).toBe(-2_510)
  expect(measurement.currentBytes).toBe(OBSERVED_CONCISE_DESCRIPTION_BYTES)
  expect(conciseDescriptionDelta).toBe(-12_670)
})
