import Ajv, { type ValidateFunction } from 'ajv'
import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../apiRoutes'
import { agentMcpRouting } from './agentMcpRouting'
import { createShowEditSession } from '../../engine/showEditAdmission'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'

const grant = {
  accountId: 'account', clientId: 'client', clientName: 'Client', clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60,
}
const claim = {
  bindingId: 'binding', registrationId: 'registration', sessionId: 'session', showId: 'show',
  agentKind: 'external' as const, agentId: 'grant', agentName: 'Client', callId: 'call',
}

async function request(env: WorkerEnv, method: string, params?: unknown) {
  return agentMcpRouting(new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
  }), env, grant)
}

async function call(owner: { fetch: ReturnType<typeof vi.fn> }, name: string, args: object = {}) {
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => owner },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
  } as unknown as WorkerEnv
  const response = await request(env, 'tools/call', { name, arguments: args })
  return (await response.json() as { result: { content: Array<{ text: string }>; structuredContent: Record<string, unknown>; isError?: boolean } }).result
}

function expectCopies(result: { content: Array<{ text: string }>; structuredContent: Record<string, unknown> }) {
  expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
}

it.each([
  ['get_connection', {}],
  ['list_commands', {}],
  ['read_show', { binding_id: 'binding' }],
  ['get_context', { binding_id: 'binding' }],
  ['begin_edit', { binding_id: 'binding', intent: 'Rename the Show', idempotency_key: 'begin' }],
  ['rename_show', { binding_id: 'binding', operation_id: 'operation', idempotency_key: 'rename', name: 'Renamed' }],
  ['commit_edit', { binding_id: 'binding', operation_id: 'operation', idempotency_key: 'commit' }],
  ['cancel_edit', { binding_id: 'binding', operation_id: 'operation', idempotency_key: 'cancel' }],
  ['get_outcome', { binding_id: 'binding', operation_id: 'operation' }],
] as const)('%s preserves one authoritative throttled owner response', async (name, args) => {
  const owner = { fetch: vi.fn(async () => Response.json({ code: 'throttled', retry_after_ms: 4321 }, { status: 429 })) }
  const result = await call(owner, name, args)
  expect(result.structuredContent).toEqual({ code: 'throttled', retry_after_ms: 4321 })
  expect(result.isError).toBe(true)
  expectCopies(result)
  expect(owner.fetch).toHaveBeenCalledOnce()
})

it.each([
  ['get_connection', {}],
  ['list_commands', {}],
  ['read_show', { binding_id: 'binding' }],
  ['rename_show', { binding_id: 'binding', operation_id: 'op', idempotency_key: 'change', name: 'New' }],
  ['get_outcome', { binding_id: 'binding', operation_id: 'op' }],
] as const)('%s fails closed for unknown or malformed account results', async (name, args) => {
  for (const response of [null, { code: 'future-unclassified-code' }]) {
    const owner = { fetch: vi.fn(async () => Response.json(response)) }
    const result = await call(owner, name, args)
    expect(result).toMatchObject({ isError: true, structuredContent: { code: 'unknown' } })
    expectCopies(result)
    expect(owner.fetch).toHaveBeenCalledOnce()
  }
})

it('preserves no_live_editor for a current grant whose browser binding is retiring', async () => {
  const owner = { fetch: vi.fn(async () => Response.json({ code: 'retirement_unconfirmed' })) }
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => owner },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
  } as unknown as WorkerEnv
  const response = await request(env, 'tools/call', { name: 'read_show', arguments: { binding_id: 'retiring-binding' } })
  const body = await response.json() as { result: { content: Array<{ text: string }>; structuredContent: Record<string, unknown>; isError?: boolean } }
  expect(body).toMatchObject({ result: { isError: true, structuredContent: { code: 'no_live_editor' } } })
  expectCopies(body.result)
  expect(owner.fetch).toHaveBeenCalledOnce()
})

it('serializes the actual retained outcome diagnostic in text and structured MCP output', async () => {
  const session = createShowEditSession('session', 'show')
  session.begin({ operationId: 'op', payloadKey: '', referenceContext: '{}', targets: ['show'] }, 0)
  const receipt = session.refuse('op', 'invalid-candidate', {
    stage: 'authoring', issues: [{ code: 'invalid-scene-duration', path: '["scene","scene-2","durationMs"]' }],
  })!
  const owner = { fetch: vi.fn().mockResolvedValueOnce(Response.json({ code: 'outcome', receipt })) }
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => owner },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
  } as unknown as WorkerEnv
  const response = await request(env, 'tools/call', { name: 'get_outcome', arguments: { binding_id: 'binding', operation_id: 'op' } })
  const body = await response.json() as { result: { content: Array<{ text: string }>; structuredContent: unknown } }
  expect(body.result.structuredContent).toEqual({ code: 'outcome', receipt })
  expect(JSON.parse(body.result.content[0].text)).toEqual({ code: 'outcome', receipt })
})

it('publishes an output schema for every dynamic tool without advertising resource list changes', async () => {
  const env = { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv
  const initialized = await (await request(env, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).json() as {
    result: { capabilities: { resources?: { listChanged?: boolean } } }
  }
  expect(initialized.result.capabilities.resources?.listChanged).not.toBe(true)

  const listed = await (await request(env, 'tools/list')).json() as { result: { tools: Array<{ name: string; outputSchema?: object }> } }
  expect(listed.result.tools).toHaveLength(SHOW_COMMANDS.length + 8)
  for (const tool of listed.result.tools) expect(tool.outputSchema, tool.name).toMatchObject({ type: 'object' })
})

it('keeps public success and error results schema-valid, distinguishable, and byte-equivalent across both copies', async () => {
  const env = { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv
  const listed = await (await request(env, 'tools/list')).json() as { result: { tools: Array<{ name: string; outputSchema: object }> } }
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validators = new Map<string, ValidateFunction>(listed.result.tools.map(tool => [tool.name, ajv.compile(tool.outputSchema)]))
  const validate = (name: string, result: Awaited<ReturnType<typeof call>>, isError: boolean) => {
    expect(result.isError, name)[isError ? 'toBe' : 'toBeUndefined'](true)
    expectCopies(result)
    const validator = validators.get(name)!
    expect(validator(result.structuredContent), `${name}: ${ajv.errorsText(validator.errors)}`).toBe(true)
  }

  const bound = await call({ fetch: vi.fn().mockResolvedValue(Response.json({ code: 'bound', claim, binding: claim })) }, 'get_connection', { call_id: 'call' })
  validate('get_connection', bound, false)

  const commands = await call({ fetch: vi.fn().mockResolvedValue(Response.json({ code: 'no_live_editor' })) }, 'list_commands')
  validate('list_commands', commands, false)

  const noEditor = await call({ fetch: vi.fn().mockResolvedValue(Response.json({ code: 'retirement_unconfirmed' })) }, 'read_show', { binding_id: 'retired-binding' })
  validate('read_show', noEditor, true)

  const changed = await call({ fetch: vi.fn()
    .mockResolvedValueOnce(Response.json({ code: 'changed', changes: [{ command: 'rename_show', targetId: 'show', description: 'Renamed Show', before: 'Old', after: 'New', details: { source: 'agent' } }] })) },
  'rename_show', { binding_id: 'binding', operation_id: 'op', idempotency_key: 'change', name: 'New' })
  validate('rename_show', changed, false)

  const refused = await call({ fetch: vi.fn()
    .mockResolvedValueOnce(Response.json({ code: 'refused', issues: [{ code: 'invalid-argument', message: 'Name is invalid.', path: 'name', remedy: 'Choose another name.', candidates: ['New'], availableRange: { startMs: 0, endMs: 1 } }] })) },
  'rename_show', { binding_id: 'binding', operation_id: 'op', idempotency_key: 'refusal', name: 'New' })
  validate('rename_show', refused, true)

  const receipt = { status: 'refused', diagnostic: { stage: 'authoring', issues: [{ code: 'invalid-scene-duration', path: '["scene"]' }] } }
  const outcome = await call({ fetch: vi.fn().mockResolvedValueOnce(Response.json({ code: 'outcome', receipt })) },
  'get_outcome', { binding_id: 'binding', operation_id: 'op' })
  validate('get_outcome', outcome, false)

  const moveNotice = { showId: 'show-2', showName: 'Destination' }
  const movedClaim = { ...claim, bindingId: 'binding-2' }
  const moved = await call({ fetch: vi.fn().mockResolvedValue(Response.json({ code: 'binding_moved', claim: movedClaim, binding: { ...movedClaim, showId: 'show-2', showName: 'Destination' }, moveNotice })) },
  'begin_edit', { binding_id: 'binding', intent: 'Move the Show', idempotency_key: 'begin' })
  validate('begin_edit', moved, true)
  expect(moved.structuredContent).toMatchObject({
    code: 'binding_moved', instruction: expect.any(String),
    connection_notice: { code: 'binding_moved', show_id: 'show-2', show_name: 'Destination', instruction: expect.any(String) },
  })

  expect(validators.get('rename_show')!({ code: 'accepted' })).toBe(false)
  expect(validators.get('rename_show')!({ code: 'pending', operation_id: 'op' })).toBe(true)
  expect(validators.get('rename_show')!({ code: 'changed', changes: [{ description: 'Missing command' }] })).toBe(false)
  expect(validators.get('rename_show')!({ code: 'refused', issues: [{ code: 'invalid-argument' }] })).toBe(false)
  expect(validators.get('begin_edit')!({ code: 'binding_moved', connection_notice: { code: 'binding_moved', show_id: 'show-2' } })).toBe(false)
})

it('publishes server-owned identity schemas and rejects legacy delivery fields', async () => {
  const env = { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv
  const listed = await (await request(env, 'tools/list')).json() as { result: { tools: Array<{ name: string; inputSchema: { required?: string[]; properties?: Record<string, unknown> } }> } }
  const byName = new Map(listed.result.tools.map(tool => [tool.name, tool.inputSchema]))
  expect(byName.get('begin_edit')).toMatchObject({
    required: expect.arrayContaining(['binding_id', 'intent', 'idempotency_key']),
    properties: { binding_id: expect.any(Object), intent: expect.any(Object), idempotency_key: expect.any(Object) },
  })
  expect(byName.get('begin_edit')?.properties).not.toHaveProperty('operation_id')
  expect(byName.get('begin_edit')?.properties).not.toHaveProperty('delivery_id')
  expect(byName.get('rename_show')).toMatchObject({ required: expect.arrayContaining(['binding_id', 'operation_id']) })
  expect(byName.get('rename_show')?.properties).not.toHaveProperty('delivery_id')
  expect(byName.get('rename_show')?.properties).not.toHaveProperty('sequence')

  const owner = { fetch: vi.fn(async () => Response.json({ code: 'begun', operationId: 'server-operation' })) }
  const begun = await call(owner, 'begin_edit', { binding_id: 'binding', intent: 'Rename the Show', idempotency_key: 'stable-key' })
  expect(begun.structuredContent).toEqual({ code: 'begun', operation_id: 'server-operation' })
  expectCopies(begun)
  for (const arguments_ of [
    { binding_id: 'binding', intent: 'Rename the Show', idempotency_key: '' },
    { binding_id: 'binding', intent: 'Rename the Show', idempotency_key: 'x'.repeat(129) },
    { binding_id: 'binding', intent: '', idempotency_key: 'key' },
    { binding_id: 'binding', intent: '   ', idempotency_key: 'key' },
    { binding_id: 'binding', intent: 'Rename\nthe Show', idempotency_key: 'key' },
    { binding_id: 'binding', intent: 'Rename the Show', idempotency_key: 'key', delivery_id: 'legacy' },
  ]) {
    const response = await request({ ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv, 'tools/call', { name: 'begin_edit', arguments: arguments_ })
    expect((await response.json() as { result: { isError?: boolean } }).result.isError).toBe(true)
  }
})
