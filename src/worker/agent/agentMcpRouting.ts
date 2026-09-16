import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'
import { showCommandInputShape } from '../../engine/showCommands/descriptorSchema'
import {
  SHOW_AUTHORING_JSON_SCHEMA,
  SHOW_AUTHORING_REFERENCE_MARKDOWN,
  SHOW_AUTHORING_REFERENCE_URI,
  SHOW_AUTHORING_SCHEMA_URI,
  SHOW_AUTHORING_SERVER_INTRO,
} from '../../engine/showCommands/bulkAuthoringReference'
import type { PrivateEditResult } from '../../engine/agentPrivateExecutor'
import { isAgentMcpError, isAgentMcpResult } from '../../engine/agentMcpResults'
import type { WorkerEnv } from '../apiRoutes'
import type { ValidatedAgentGrant } from './AgentOAuthAuthority'
import { agentGrantLive } from './agentGrant'
import { connectExternalTool, dispatchExternalTool, queryExternalTool, resolveExternalTool, type ExternalToolConnection } from './accountDelivery'
import { AGENT_MCP_MOVE_INSTRUCTION, AGENT_MCP_OUTPUT_SCHEMAS } from './agentMcpSchemas'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const binding = { binding_id: id.describe('Binding returned by get_connection; changed bindings require a new operation.') }
const idempotencyKey = id
const operation = { ...binding, operation_id: id, idempotency_key: idempotencyKey.optional() }
export async function agentMcpRouting(request: Request, env: WorkerEnv, grant: ValidatedAgentGrant): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  const active = () => grant.expiresAt * 1000 > Date.now()
  const notice = (resolved: ExternalToolConnection) => resolved.moveNotice ? {
    connection_notice: {
      code: 'binding_moved' as const,
      show_id: resolved.moveNotice.showId,
      ...(resolved.moveNotice.showName ? { show_name: resolved.moveNotice.showName } : {}),
      instruction: AGENT_MCP_MOVE_INSTRUCTION,
    },
  } : {}
  const moved = (resolved: ExternalToolConnection): PrivateEditResult => ({
    code: 'binding_moved',
    ...(resolved.binding ? { show_id: resolved.binding.showId, ...(resolved.binding.showName ? { show_name: resolved.binding.showName } : {}) } : {}),
    instruction: AGENT_MCP_MOVE_INSTRUCTION,
    ...notice(resolved),
  })
  const visible = (resolved: ExternalToolConnection): PrivateEditResult => {
    const { claim: _claim, binding: _binding, moveNotice: _moveNotice, expiresAt: _expiresAt, ...result } = resolved
    return { ...result, ...notice(resolved) }
  }
  const toolResult = (resolved: ExternalToolConnection): PrivateEditResult => resolved.code === 'binding_moved'
    ? moved(resolved)
    : resolved.code === 'retirement_unconfirmed' ? { code: 'no_live_editor', ...notice(resolved) } : visible(resolved)
  const server = new McpServer({ name: 'PXLBLZ Agent', version: '0.2.0' }, { instructions: `Call get_connection, then read_show before editing; get_context can refresh editor focus later. begin_edit requires a stable idempotency key and returns the relay-assigned operation_id. The relay assigns delivery identity and execution order. Await dependent command results before committing. A keyed retry only looks up its original admission; after an unkeyed timeout, query get_outcome and never repeat the command. New bindings require fresh reads and operations. Command changes describe the private proposal, not adopted or saved state. commit_edit requests validation/adoption and may return waiting or saving; an invalid-candidate receipt may include bounded validation detail. ${SHOW_AUTHORING_SERVER_INTRO}` })
  const output = (untrusted: PrivateEditResult) => {
    const trusted: PrivateEditResult = isAgentMcpResult(untrusted) ? untrusted : { code: 'unknown' }
    const { operationId, ...rest } = trusted
    const result = { ...rest, ...(typeof operationId === 'string' ? { operation_id: operationId } : {}) } as PrivateEditResult
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      structuredContent: result,
      ...(isAgentMcpError(result.code) ? { isError: true as const } : {}),
    }
  }
  server.registerTool('get_connection', { description: 'Connect to the open editor, holding an incoming call for up to 30 seconds. With call_id, inspect only that original call; expired calls are never recreated.', inputSchema: z.object({ call_id: id.optional() }).strict(), outputSchema: AGENT_MCP_OUTPUT_SCHEMAS.connection }, async ({ call_id }) => {
    if (!active()) return output({ code: 'unauthorized' })
    const resolved = await connectExternalTool(env, grant, call_id)
    if (resolved.code === 'binding_moved') return output(moved(resolved))
    if (resolved.code !== 'bound' || !resolved.claim) return output(visible(resolved))
    if (call_id === undefined && !await agentGrantLive(env, grant)) return output({ code: 'unauthorized' })
    return output({ code: 'bound', call_id: resolved.claim.callId, binding_id: resolved.claim.bindingId, ...(resolved.binding ? { show_id: resolved.binding.showId, ...(resolved.binding.showName ? { show_name: resolved.binding.showName } : {}) } : {}), ...notice(resolved) })
  })
  server.registerTool('list_commands', { description: 'List canonical command metadata without attaching to an editor or reading Show contents.', inputSchema: z.object({}).strict(), outputSchema: AGENT_MCP_OUTPUT_SCHEMAS.catalogue }, async () => {
    if (!active()) return output({ code: 'unauthorized' })
    const resolved = await resolveExternalTool(env, grant)
    if (['throttled', 'unauthorized', 'unavailable', 'unknown', 'service_disabled', 'invalid_request'].includes(resolved.code)) return output(visible(resolved))
    return output({ code: 'commands', commands: SHOW_COMMANDS.map(({ name, description, fields, exactlyOne, atLeastOne, atMostOne }) => ({
      name, description, fields,
      ...(exactlyOne ? { exactlyOne } : {}),
      ...(atLeastOne ? { atLeastOne } : {}),
      ...(atMostOne ? { atMostOne } : {}),
    })), ...notice(resolved) })
  })
  for (const kind of ['read_show', 'get_context', 'get_outcome'] as const) {
    server.registerTool(kind, { description: kind === 'get_outcome' ? 'Read the surviving browser receipt, including bounded invalid-candidate validation detail when available, for this binding and operation; unknown never permits replay.' : `Read ${kind === 'read_show' ? 'the full current Show' : 'the current editor focus/context'} from the bound editor.`, inputSchema: z.object({ ...binding, ...(kind === 'get_outcome' ? { operation_id: id } : {}) }).strict(), outputSchema: kind === 'get_outcome' ? AGENT_MCP_OUTPUT_SCHEMAS.outcome : AGENT_MCP_OUTPUT_SCHEMAS.read }, async (args) => {
      if (!active()) return output({ code: 'unauthorized' })
      const query = kind === 'get_outcome' ? { kind, operationId: (args as { operation_id: string }).operation_id } : { kind }
      const resolved = await queryExternalTool(env, grant, args.binding_id, query)
      return output(toolResult(resolved))
    })
  }
  const registerMutation = (name: string, description: string, fields: Record<string, z.ZodTypeAny>, payload: (args: Record<string, unknown>) => unknown) => {
    if (Object.keys(fields).some(key => key in operation)) throw new Error('Canonical command collides with transport identity')
    server.registerTool(name, { description: `${description} Requires the current bound editor and an active begin_edit operation. Await dependent results before sending another command. A stable idempotency key makes retries lookup-only; unkeyed timeouts must be recovered with get_outcome.`, inputSchema: z.object({ ...operation, ...fields }).strict(), outputSchema: AGENT_MCP_OUTPUT_SCHEMAS.mutation }, async args => {
      const { binding_id, operation_id, idempotency_key, ...command } = args
      if (!active()) return output({ code: 'unauthorized' })
      const resolved = await dispatchExternalTool(env, grant, binding_id, { operationId: operation_id, ...(idempotency_key ? { idempotencyKey: idempotency_key } : {}), payload: payload(command) })
      return output(toolResult(resolved))
    })
  }
  server.registerTool('begin_edit', { description: 'Capture a full immutable Show/context and begin one private operation. The relay assigns and returns operation_id. Retry only with the same idempotency key and identical intent.', inputSchema: z.object({ ...binding, intent: z.string().max(240).refine(value => value.trim().length > 0 && !/[\r\n]/.test(value)), idempotency_key: id }).strict(), outputSchema: AGENT_MCP_OUTPUT_SCHEMAS.mutation }, async ({ binding_id, intent, idempotency_key }) => {
    if (!active()) return output({ code: 'unauthorized' })
    const resolved = await dispatchExternalTool(env, grant, binding_id, { idempotencyKey: idempotency_key, payload: { kind: 'begin_edit', intent } })
    return output(toolResult(resolved))
  })
  for (const descriptor of SHOW_COMMANDS) registerMutation(descriptor.name, descriptor.description, showCommandInputShape(descriptor), args => ({ kind: 'command', name: descriptor.name, arguments: args }))
  registerMutation('commit_edit', 'Validate and request adoption of the entire private candidate once; command changes describe only the private proposal, waiting/saving are not completion, and invalid-candidate may include bounded validation detail.', {}, () => ({ kind: 'commit_edit' }))
  registerMutation('cancel_edit', 'Retire the private candidate; already-adopted saves retain their receipt.', {}, () => ({ kind: 'cancel_edit' }))
  server.registerResource('clip-layer-authoring-schema-v1', SHOW_AUTHORING_SCHEMA_URI, {
    title: 'Clip and Layer authoring schema v1',
    description: 'Generated JSON Schema for visible Clip/Layer bulk command inputs. This is distinct from persisted ShowRecord JSON.',
    mimeType: 'application/schema+json',
  }, uri => ({ contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: JSON.stringify(SHOW_AUTHORING_JSON_SCHEMA, null, 2) }] }))
  server.registerResource('clip-layer-authoring-reference-v1', SHOW_AUTHORING_REFERENCE_URI, {
    title: 'Clip and Layer authoring reference v1',
    description: 'Global timing, patch/replace, shared-instance, atomicity, result, and executable example semantics.',
    mimeType: 'text/markdown',
  }, uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: SHOW_AUTHORING_REFERENCE_MARKDOWN }] }))
  server.server.registerCapabilities({ tools: { listChanged: false }, resources: { listChanged: false } })
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  await server.connect(transport)
  try { return await transport.handleRequest(request) } finally { await server.close() }
}
