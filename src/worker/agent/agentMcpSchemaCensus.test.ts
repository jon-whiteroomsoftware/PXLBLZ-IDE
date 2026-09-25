import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../apiRoutes'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'
import { SHOW_COMMANDS_V2 } from '../../engine/showCommandsV2/registry'
import { agentMcpRouting } from './agentMcpRouting'

const grant = { accountId: 'account', clientId: 'client', clientName: 'Client', clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60 }
type JsonSchema = { properties?: Record<string, JsonSchema>; required?: string[]; [key: string]: unknown }
// Actual tools/list responses from the same 64-tool discovery catalogue before
// and after #1048 moved mutation identity ownership into the relay. That
// catalogue is v1, so the census asks for it by name: since #1039 flipped the
// production default to v2, an unqualified tools/list measures a different
// vocabulary and would silently invalidate these deltas.
const OBSERVED_PRE_IDENTITY_BYTES = 360_987
const OBSERVED_IDENTITY_BYTES = 358_419
const OBSERVED_CONCISE_DESCRIPTION_BYTES = 345_749
/** The production catalogue's own discovery size: measured at the #1039 flip, re-pinned when #1066 named the converted-boundary re-placement refusal in update_clips (+47 bytes), then #1069 added remove_controls to three command schemas (+624 bytes), #1093 kept remove_controls on update_clips only (-416 bytes), #1094 retired repeat-per-zone Clip sampling (295,626 to 295,599 bytes, -27), and #1111 described the one leading-resize rule in resize_clip (295,599 to 295,690 bytes, +91). */
const OBSERVED_V2_DISCOVERY_BYTES = 295_690

async function toolsList(catalogue?: 'v1' | 'v2') {
  const response = await agentMcpRouting(new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }), { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv, grant, catalogue ? { catalogue } : {})
  return await response.json() as { result: { tools: Array<{ name: string; inputSchema: JsonSchema; outputSchema: JsonSchema }> } }
}

const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength

it('measures identity and concise-description reductions against the same discovery catalogue', async () => {
  const current = await toolsList('v1')
  const mutationNames = new Set(['begin_edit', ...SHOW_COMMANDS.map(command => command.name), 'commit_edit', 'cancel_edit'])
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
  expect(measurement.currentBytes).toBe(OBSERVED_CONCISE_DESCRIPTION_BYTES)
  expect(conciseDescriptionDelta).toBe(-12_670)
})

it('measures the production v2 discovery catalogue the flip made the default', async () => {
  const production = await toolsList('v2')
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
  // Discovery is what every unbound client pays before it binds, so the flip's
  // effect on it is measured rather than assumed: v2 authors the same domain in
  // fewer, bulk commands.
  expect(measurement.currentBytes).toBeLessThan(OBSERVED_CONCISE_DESCRIPTION_BYTES)
  expect(encoded(unqualified)).toBe(measurement.currentBytes)
})
