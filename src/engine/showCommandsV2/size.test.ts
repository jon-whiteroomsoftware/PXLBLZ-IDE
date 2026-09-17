import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../../worker/apiRoutes'
import { SHOW_COMMANDS } from '../showCommands/registry'
import { agentMcpRouting } from '../../worker/agent/agentMcpRouting'
import { SHOW_COMMANDS_V2 } from './registry'

// Catalogue rule 8: the schema size budget, measured by the in-process probe
// (`agentMcpRouting` with a fake grant) over the same request the MCP client
// makes. The budget applies to the authored command tools' input schemas: the
// transport identity fields, the read tools and the shared output schemas are
// Stage A's, not this catalogue's.

const grant = {
  accountId: 'account', clientId: 'client', clientName: 'Client',
  clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60,
}

const BULK_TOOLS = ['create_clips', 'update_clips', 'add_property_tracks']

function encoded(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

async function measure(catalogue: 'v1' | 'v2', names: ReadonlySet<string>) {
  const response = await agentMcpRouting(new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }), { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv, grant, { catalogue })
  const listed = await response.json() as { result: { tools: Array<{ name: string; inputSchema: unknown }> } }
  const commands = listed.result.tools.filter(tool => names.has(tool.name))
  return {
    tools: listed.result.tools.length,
    commands: commands.length,
    commandInputSchemaBytes: commands.reduce((sum, tool) => sum + encoded(tool.inputSchema), 0),
    bulkInputSchemaBytes: commands
      .filter(tool => BULK_TOOLS.includes(tool.name))
      .reduce((sum, tool) => sum + encoded(tool.inputSchema), 0),
  }
}

it('keeps the prepared v2 catalogue inside the tools/list size budget', async () => {
  const before = await measure('v1', new Set(SHOW_COMMANDS.map(command => command.name)))
  const after = await measure('v2', new Set(SHOW_COMMANDS_V2.map(command => command.name)))
  // Recorded so a later change explains its own size delta instead of drifting.
  console.info('issue-1041-tools-list-bytes', JSON.stringify({ before, after }))

  expect(before.commands).toBe(SHOW_COMMANDS.length)
  expect(after.commands).toBe(SHOW_COMMANDS_V2.length)
  expect(after.commandInputSchemaBytes).toBeLessThanOrEqual(64 * 1024)
  expect(after.bulkInputSchemaBytes).toBeLessThanOrEqual(24 * 1024)
  // The catalogue must not have grown against the v1 surface it replaces.
  expect(after.commandInputSchemaBytes).toBeLessThan(before.commandInputSchemaBytes)
  expect(after.bulkInputSchemaBytes).toBeLessThan(before.bulkInputSchemaBytes)
})
