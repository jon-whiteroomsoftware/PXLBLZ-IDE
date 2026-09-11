import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'
import { showCommandInputShape } from '../../engine/showCommands/descriptorSchema'
import type { AgentClaim, WindowIdentity } from '../../engine/agentRendezvous'
import type { PrivateEditResult } from '../../engine/agentPrivateExecutor'
import type { WorkerEnv } from '../apiRoutes'
import type { ValidatedAgentGrant } from './AgentOAuthAuthority'
import { agentOAuthConfig } from './agentOAuthConfig'
import { agentGrantLive } from './agentGrant'
import { dispatchAgentDelivery, queryAgentEditor } from './accountDelivery'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const binding = { binding_id: id.describe('Binding returned by get_connection; changed bindings require a new operation.') }
const operation = { ...binding, operation_id: id, delivery_id: id, sequence: z.number().int().min(0).max(255) }
interface Connection { code: string; claim?: AgentClaim; binding?: WindowIdentity & AgentClaim; expiresAt?: number }
export async function agentMcpRouting(request: Request, env: WorkerEnv, grant: ValidatedAgentGrant): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  const config = agentOAuthConfig(env)
  const client = config?.clients.find(item => item.clientId === grant.clientId)
  const connect = async (create: boolean, callId?: string): Promise<Connection> => {
    if (!client || !env.AGENT_ACCOUNTS || grant.expiresAt * 1000 <= Date.now()) return { code: 'unauthorized' }
    const command = create
      ? { type: 'connect-external', agentKind: 'external', agentId: grant.grantId, agentName: client.clientName, callId: crypto.randomUUID(), bindingId: crypto.randomUUID() }
      : { type: 'resolve-external', agentId: grant.grantId, ...(callId ? { callId } : {}) }
    try {
      const response = await env.AGENT_ACCOUNTS.get(env.AGENT_ACCOUNTS.idFromName(grant.accountId)).fetch(new Request('https://agent-account.internal/external', { method: 'POST', body: JSON.stringify(command) }))
      const result = await response.json() as Connection
      return !create || await agentGrantLive(env, grant) ? result : { code: 'unauthorized' }
    } catch { return { code: 'unknown' } }
  }
  const owned = async (bindingId: string) => {
    const result = await connect(false)
    return result.code === 'bound' && result.claim?.bindingId === bindingId ? result.claim : undefined
  }
  const server = new McpServer({ name: 'PXLBLZ Agent', version: '0.2.0' }, { instructions: 'Call get_connection and Answer in the opted-in Show editor. read_show/get_context read that editor. begin_edit captures one immutable private Show; canonical commands mutate only that candidate. commit_edit requests validation/adoption and may return waiting or saving. Query get_outcome for the authoritative receipt. Never replay a timed-out command; retain operation and delivery identities. New binding requires new operation IDs.' })
  const output = (result: PrivateEditResult) => ({ content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result })
  server.registerTool('get_connection', { description: 'Connect to your opted-in editor, holding an incoming call for up to 30 seconds. With call_id, inspect only that original call; expired calls are never recreated.', inputSchema: z.object({ call_id: id.optional() }).strict() }, async ({ call_id }) => {
    const result = await connect(call_id === undefined, call_id)
    return output({ code: result.code, ...(result.claim ? { call_id: result.claim.callId, binding_id: result.claim.bindingId } : {}), ...(result.binding ? { show_id: result.binding.showId } : {}) })
  })
  server.registerTool('list_commands', { description: 'List canonical command metadata without attaching to an editor or reading Show contents.', inputSchema: z.object({}).strict() }, async () => output({ code: 'commands', commands: SHOW_COMMANDS.map(({ name, description, fields, exactlyOne }) => ({ name, description, fields, ...(exactlyOne ? { exactlyOne } : {}) })) }))
  for (const kind of ['read_show', 'get_context', 'get_outcome'] as const) {
    server.registerTool(kind, { description: kind === 'get_outcome' ? 'Read the surviving browser receipt for this binding and operation; unknown never permits replay.' : `Read ${kind === 'read_show' ? 'the full current Show' : 'the current editor focus/context'} from the bound editor.`, inputSchema: z.object({ ...binding, ...(kind === 'get_outcome' ? { operation_id: id } : {}) }).strict() }, async (args) => {
      const identity = await owned(args.binding_id)
      if (!identity) return output({ code: 'no_live_editor' })
      const query = kind === 'get_outcome' ? { kind, operationId: (args as { operation_id: string }).operation_id } : { kind }
      return output(await queryAgentEditor(env, grant.accountId, identity, query))
    })
  }
  const registerMutation = (name: string, description: string, fields: Record<string, z.ZodTypeAny>, payload: (args: Record<string, unknown>) => unknown) => {
    if (Object.keys(fields).some(key => key in operation)) throw new Error('Canonical command collides with transport identity')
    server.registerTool(name, { description: `${description} Requires the current bound editor${name === 'begin_edit' ? '' : ' and an active begin_edit operation'}. Preserve increasing sequence and stable delivery identity; changed identity reuse is refused.`, inputSchema: z.object({ ...operation, ...fields }).strict() }, async args => {
      const { binding_id, operation_id, delivery_id, sequence, ...command } = args
      const identity = await owned(binding_id)
      if (!identity) return output({ code: 'no_live_editor' })
      return output(await dispatchAgentDelivery(env, grant.accountId, identity, { operationId: operation_id, deliveryId: delivery_id, sequence, payload: payload(command) }))
    })
  }
  registerMutation('begin_edit', 'Capture a full immutable Show/context and begin one private operation (sequence 0).', { intent: z.string().max(240).refine(value => !/[\r\n]/.test(value)).optional() }, args => ({ kind: 'begin_edit', ...args }))
  for (const descriptor of SHOW_COMMANDS) registerMutation(descriptor.name, descriptor.description, showCommandInputShape(descriptor), args => ({ kind: 'command', name: descriptor.name, arguments: args }))
  registerMutation('commit_edit', 'Validate and request adoption of the entire private candidate once; waiting/saving are not completion.', {}, () => ({ kind: 'commit_edit' }))
  registerMutation('cancel_edit', 'Retire the private candidate; already-adopted saves retain their receipt.', {}, () => ({ kind: 'cancel_edit' }))
  server.server.registerCapabilities({ tools: { listChanged: false } })
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  await server.connect(transport)
  try { return await transport.handleRequest(request) } finally { await server.close() }
}
