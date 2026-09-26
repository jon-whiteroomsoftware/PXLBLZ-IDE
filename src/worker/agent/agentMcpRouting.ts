import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { SHOW_COMMANDS_V2 } from '../../engine/showCommandsV2/registry'
import { showCommandV2InputShape } from '../../engine/showCommandsV2/descriptorSchema'
import {
  SHOW_AUTHORING_V2_JSON_SCHEMA,
  SHOW_AUTHORING_V2_REFERENCE_MARKDOWN,
  SHOW_AUTHORING_V2_REFERENCE_URI,
  SHOW_AUTHORING_V2_SCHEMA_URI,
  SHOW_AUTHORING_V2_SERVER_INTRO,
} from '../../engine/showCommandsV2/authoringReference'
import type { PrivateEditResult } from '../../engine/agentPrivateExecutor'
import { isAgentMcpError, isAgentMcpResult } from '../../engine/agentMcpResults'
import type { WorkerEnv } from '../apiRoutes'
import type { ValidatedAgentGrant } from './AgentOAuthAuthority'
import { agentGrantLive } from './agentGrant'
import { connectExternalTool, dispatchExternalTool, queryExternalTool, resolveExternalTool, type ExternalToolConnection } from './accountDelivery'
import { AGENT_MCP_MOVE_INSTRUCTION, AGENT_MCP_OUTPUT_SCHEMAS } from './agentMcpSchemas'
import showRecordV2Schema from '../../../schemas/show-record-v2.provisional.schema.json'

const SHOW_RECORD_V2_SCHEMA_URI = 'pxlblz://schemas/show-record/v2'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const binding = { binding_id: id.describe('Binding returned by get_connection; changed bindings require a new operation.') }
const idempotencyKey = id
const operation = { ...binding, operation_id: id, idempotency_key: idempotencyKey.optional() }
const AGENT_MCP_TRANSPORT_INSTRUCTIONS = [
  'Connect and edit in this order: call get_connection, then read_show. read_show returns the Show and the IDs used by command arguments. get_context reads the current editor focus when needed but does not replace read_show. Call begin_edit with the current binding_id, a required nonblank intent shown to the person in the editor, and a stable idempotency_key; it returns the relay-assigned operation_id. Send commands with that binding_id and operation_id, then call commit_edit and get_outcome until the receipt settles.',
  'Independent commands may be queued because the relay serializes admitted calls in admission order. Await every prerequisite before its dependent command, and await every command before commit_edit. A canonical command domain refusal returns refused with issues, changes nothing, and keeps the private operation open for a corrected command, commit_edit, or cancel_edit; noop means a valid command made no change. Explicit whole-turn refusal, commit or admission refusal, service or result-size failure, cancellation, and retirement are terminal.',
  'At most 10 ordinary calls may be queued, including the in-flight head. One operation admits at most 253 ordinary commands; the 256-delivery lifecycle reserves one delivery for commit_edit and one after it for cancel_edit. When a choreography needs more commands, split it into committed operations and call read_show again before each new chunk.',
  'begin_edit requires a stable key. Later mutations may use an optional stable idempotency_key; a keyed retry with an identical payload only looks up the original admission. pending means the original call may still finish; unknown means its result is unavailable and never permits replay. After an unkeyed timeout, do not repeat the mutation; call get_outcome with its operation_id. The retry ledger is volatile: after connection or ledger loss, call get_connection, then read_show, and begin a new operation with a new key; never replay an unkeyed call.',
].join('\n\n')
/** The server instructions; the served vocabulary is v2-only (#1042). */
export const AGENT_MCP_INSTRUCTIONS_V2 = [
  AGENT_MCP_TRANSPORT_INSTRUCTIONS,
  SHOW_AUTHORING_V2_SERVER_INTRO,
].join('\n\n')
/**
 * The server speaks one authored vocabulary: the v2 command catalogue (#1042).
 * Every connection, bound or not, is described the v2 tools, the v2 server
 * instructions and the v2 schema and reference resources, so a caller that
 * discovers a command can always call it. A registration that does not declare
 * showVersion 2 is refused before it binds, and a built-in turn whose captured
 * record is not version 2 ends incomplete.
 */

export async function agentMcpRouting(request: Request, env: WorkerEnv, grant: ValidatedAgentGrant): Promise<Response> {
  // One catalogue for every connection. Every command surface - the registered
  // tools, the server instructions, the schema and reference resources and
  // list_commands - describes the v2 vocabulary, so a caller that discovers a
  // command can always call it (#1042).
  const descriptors: ReadonlyArray<{
    name: string
    description: string
    fields: Record<string, unknown>
    exactlyOne?: readonly string[]
    atLeastOne?: readonly string[]
    atMostOne?: readonly string[]
  }> = SHOW_COMMANDS_V2
  const catalogue = SHOW_COMMANDS_V2.map(descriptor => ({ name: descriptor.name, description: descriptor.description, shape: showCommandV2InputShape(descriptor) }))
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
  const server = new McpServer({ name: 'PXLBLZ Agent', version: '0.2.0' }, { instructions: AGENT_MCP_INSTRUCTIONS_V2 })
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
  server.registerTool('list_commands', { description: 'List canonical command metadata without attaching to an editor or reading Show contents.', inputSchema: z.object({}).strict(), outputSchema: AGENT_MCP_OUTPUT_SCHEMAS.catalogue, annotations: { readOnlyHint: true } }, async () => {
    if (!active()) return output({ code: 'unauthorized' })
    const resolved = await resolveExternalTool(env, grant)
    if (['throttled', 'unauthorized', 'unavailable', 'unknown', 'service_disabled', 'invalid_request'].includes(resolved.code)) return output(visible(resolved))
    return output({ code: 'commands', commands: descriptors.map(({ name, description, fields, exactlyOne, atLeastOne, atMostOne }) => ({
      name, description, fields,
      ...(exactlyOne ? { exactlyOne } : {}),
      ...(atLeastOne ? { atLeastOne } : {}),
      ...(atMostOne ? { atMostOne } : {}),
    })), ...notice(resolved) })
  })
  for (const kind of ['read_show', 'get_context', 'get_outcome'] as const) {
    server.registerTool(kind, { description: kind === 'get_outcome' ? 'Read the surviving browser receipt, including bounded invalid-candidate validation detail when available, for this binding and operation; unknown never permits replay.' : `Read ${kind === 'read_show' ? 'the full current Show' : 'the current editor focus/context'} from the bound editor.`, inputSchema: z.object({ ...binding, ...(kind === 'get_outcome' ? { operation_id: id } : {}) }).strict(), outputSchema: kind === 'get_outcome' ? AGENT_MCP_OUTPUT_SCHEMAS.outcome : AGENT_MCP_OUTPUT_SCHEMAS.read, annotations: { readOnlyHint: true } }, async (args) => {
      if (!active()) return output({ code: 'unauthorized' })
      const query = kind === 'get_outcome' ? { kind, operationId: (args as { operation_id: string }).operation_id } : { kind }
      const resolved = await queryExternalTool(env, grant, args.binding_id, query)
      return output(toolResult(resolved))
    })
  }
  server.registerTool('list_patterns', {
    description: 'List stock and signed-account personal Pattern identities with authored exported control metadata. Slider ranges are normalized 0–1; source is never returned.',
    inputSchema: z.object({ ...binding, query: z.string().max(128).optional(), kind: z.enum(['stock', 'user']).optional() }).strict(),
    outputSchema: AGENT_MCP_OUTPUT_SCHEMAS.read,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ binding_id, query, kind }) => {
    if (!active()) return output({ code: 'unauthorized' })
    const resolved = await queryExternalTool(env, grant, binding_id, {
      kind: 'list_patterns',
      ...(query !== undefined ? { query } : {}),
      ...(kind ? { patternKind: kind } : {}),
    })
    return output(toolResult(resolved))
  })
  server.registerTool('list_controller_profiles', {
    description: 'List existing Controller-profile identities and optional last-known pixel counts. Does not read live hardware or claim an installed map.',
    inputSchema: z.object({ ...binding }).strict(),
    outputSchema: AGENT_MCP_OUTPUT_SCHEMAS.read,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ binding_id }) => {
    if (!active()) return output({ code: 'unauthorized' })
    const resolved = await queryExternalTool(env, grant, binding_id, { kind: 'list_controller_profiles' })
    return output(toolResult(resolved))
  })
  const registerMutation = (name: string, description: string, fields: Record<string, z.ZodTypeAny>, payload: (args: Record<string, unknown>) => unknown) => {
    if (Object.keys(fields).some(key => key in operation)) throw new Error('Canonical command collides with transport identity')
    server.registerTool(name, { description, inputSchema: z.object({ ...operation, ...fields }).strict(), outputSchema: AGENT_MCP_OUTPUT_SCHEMAS.mutation }, async args => {
      const { binding_id, operation_id, idempotency_key, ...command } = args
      if (!active()) return output({ code: 'unauthorized' })
      const resolved = await dispatchExternalTool(env, grant, binding_id, { operationId: operation_id, ...(idempotency_key ? { idempotencyKey: idempotency_key } : {}), payload: payload(command) })
      return output(toolResult(resolved))
    })
  }
  server.registerTool('begin_edit', { description: 'Capture a full immutable Show/context and begin one private operation. The intent is required and displayed to the person in the editor. The relay assigns and returns operation_id.', inputSchema: z.object({ ...binding, intent: z.string().max(240).refine(value => value.trim().length > 0 && !/[\r\n]/.test(value)).describe('Required nonblank edit intent displayed to the person in the editor; one line, at most 240 characters.'), idempotency_key: id }).strict(), outputSchema: AGENT_MCP_OUTPUT_SCHEMAS.mutation }, async ({ binding_id, intent, idempotency_key }) => {
    if (!active()) return output({ code: 'unauthorized' })
    const resolved = await dispatchExternalTool(env, grant, binding_id, { idempotencyKey: idempotency_key, payload: { kind: 'begin_edit', intent } })
    return output(toolResult(resolved))
  })
  for (const entry of catalogue) registerMutation(entry.name, entry.description, entry.shape, args => ({ kind: 'command', name: entry.name, arguments: args }))
  registerMutation('replace_show', `Replace the connected Show's whole private composition. Start from read_show output; the record format is ${SHOW_RECORD_V2_SCHEMA_URI}. The supplied id must match the connected Show and the current Show name is kept.`, { show: z.record(z.unknown()) }, ({ show }) => ({ kind: 'replace_show', show }))
  registerMutation('commit_edit', 'Validate and request adoption of the entire private candidate once; command changes describe only the private proposal, waiting/saving are not completion, and invalid-candidate may include bounded validation detail.', {}, () => ({ kind: 'commit_edit' }))
  registerMutation('cancel_edit', 'Retire the private candidate; already-adopted saves retain their receipt.', {}, () => ({ kind: 'cancel_edit' }))
  server.registerResource('clip-layer-authoring-schema-v2', SHOW_AUTHORING_V2_SCHEMA_URI, {
    title: 'Show authoring schema v2',
    description: 'Generated JSON Schema for the authored command vocabulary. This is distinct from persisted ShowRecord JSON.',
    mimeType: 'application/schema+json',
  }, uri => ({ contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: JSON.stringify(SHOW_AUTHORING_V2_JSON_SCHEMA, null, 2) }] }))
  server.registerResource('show-record-schema-v2', SHOW_RECORD_V2_SCHEMA_URI, {
    title: 'Show record schema v2',
    description: 'Complete JSON Schema for the ShowRecordV2 record returned by read_show and accepted by replace_show.',
    mimeType: 'application/schema+json',
  }, uri => ({ contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: JSON.stringify(showRecordV2Schema, null, 2) }] }))
  server.registerResource('clip-layer-authoring-reference-v2', SHOW_AUTHORING_V2_REFERENCE_URI, {
    title: 'Show authoring reference v2',
    description: 'Identity addressing, exact global timing, the appearance apply selector, Effect and Aperture parameter names, the animation target union, the uniform no-op and the affected-entity result.',
    mimeType: 'text/markdown',
  }, uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: SHOW_AUTHORING_V2_REFERENCE_MARKDOWN }] }))
  server.server.registerCapabilities({ tools: { listChanged: false }, resources: { listChanged: false } })
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  await server.connect(transport)
  try { return await transport.handleRequest(request) } finally { await server.close() }
}
