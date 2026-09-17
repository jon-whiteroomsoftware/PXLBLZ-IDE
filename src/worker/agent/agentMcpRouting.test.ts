import Ajv, { type ValidateFunction } from 'ajv'
import { expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../apiRoutes'
import { agentMcpRouting } from './agentMcpRouting'
import { createShowEditSession } from '../../engine/showEditAdmission'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'
import { SHOW_COMMANDS_V2 } from '../../engine/showCommandsV2/registry'

const grant = {
  accountId: 'account', clientId: 'client', clientName: 'Client', clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60,
}
const claim = {
  bindingId: 'binding', registrationId: 'registration', sessionId: 'session', showId: 'show',
  agentKind: 'external' as const, agentId: 'grant', agentName: 'Client', callId: 'call',
}

async function request(env: WorkerEnv, method: string, params?: unknown, validatedGrant = grant) {
  return agentMcpRouting(new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
  }), env, validatedGrant)
}

async function call(owner: { fetch: ReturnType<typeof vi.fn> }, name: string, args: object = {}) {
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => account(owner) },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
  } as unknown as WorkerEnv
  const response = await request(env, 'tools/call', { name, arguments: args })
  return (await response.json() as { result: { content: Array<{ text: string }>; structuredContent: Record<string, unknown>; isError?: boolean } }).result
}

/**
 * The account stub these tests bind to. The MCP server asks it which record
 * version the bound editor holds before it registers a tool (#1039), so the
 * stub answers that read itself and forwards every tool call to the test's own
 * owner - which keeps "one authoritative owner response per tool call" exact.
 */
function account(owner: { fetch: ReturnType<typeof vi.fn> | ((input: Request) => Promise<Response>) }, showVersion?: 1 | 2) {
  return {
    fetch: async (input: Request) => {
      const body = await input.clone().json() as { type?: string }
      if (body.type === 'external-tool-inspect-binding') {
        return Response.json(showVersion ? { code: 'bound', binding: { ...claim, showVersion } } : { code: 'no_live_editor' })
      }
      return (owner.fetch as (input: Request) => Promise<Response>)(input)
    },
  }
}

function expectCopies(result: { content: Array<{ text: string }>; structuredContent: Record<string, unknown> }) {
  expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
}

it.each([
  ['get_connection', {}],
  ['list_commands', {}],
  ['read_show', { binding_id: 'binding' }],
  ['get_context', { binding_id: 'binding' }],
  ['list_patterns', { binding_id: 'binding' }],
  ['list_controller_profiles', { binding_id: 'binding' }],
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
  ['list_patterns', { binding_id: 'binding' }],
  ['list_controller_profiles', { binding_id: 'binding' }],
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

it.each(['list_patterns', 'list_controller_profiles'] as const)('%s rejects an expired grant before contacting the owner', async name => {
  const owner = { fetch: vi.fn() }
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => account(owner) },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
  } as unknown as WorkerEnv
  const response = await request(env, 'tools/call', {
    name, arguments: { binding_id: 'binding' },
  }, { ...grant, expiresAt: 0 })
  const body = await response.json() as { result: { structuredContent: Record<string, unknown>; isError?: boolean } }
  expect(body.result).toMatchObject({ isError: true, structuredContent: { code: 'unauthorized' } })
  expect(owner.fetch).not.toHaveBeenCalled()
})

it('preserves no_live_editor for every read query when the browser binding is retiring', async () => {
  for (const name of ['read_show', 'get_context', 'list_patterns', 'list_controller_profiles']) {
    const owner = { fetch: vi.fn(async () => Response.json({ code: 'retirement_unconfirmed' })) }
    const env = {
      AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => account(owner) },
      ASSETS: { fetch: vi.fn() },
      AGENT_SERVICE_ENABLED: '1',
    } as unknown as WorkerEnv
    const response = await request(env, 'tools/call', { name, arguments: { binding_id: 'retiring-binding' } })
    const body = await response.json() as { result: { content: Array<{ text: string }>; structuredContent: Record<string, unknown>; isError?: boolean } }
    expect(body).toMatchObject({ result: { isError: true, structuredContent: { code: 'no_live_editor' } } })
    expectCopies(body.result)
    expect(owner.fetch).toHaveBeenCalledOnce()
  }
})

it('serializes the actual retained outcome diagnostic in text and structured MCP output', async () => {
  const session = createShowEditSession('session', 'show')
  session.begin({ operationId: 'op', payloadKey: '', referenceContext: '{}', targets: ['show'] }, 0)
  const receipt = session.refuse('op', 'invalid-candidate', {
    stage: 'authoring', issues: [{ code: 'invalid-scene-duration', path: '["scene","scene-2","durationMs"]' }],
  })!
  const owner = { fetch: vi.fn().mockResolvedValueOnce(Response.json({ code: 'outcome', receipt })) }
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => account(owner) },
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

  const listed = await (await request(env, 'tools/list')).json() as { result: { tools: Array<{ name: string; outputSchema?: object; annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean } }> } }
  // The default catalogue is the production one, which is v2 since #1039.
  expect(listed.result.tools).toHaveLength(SHOW_COMMANDS_V2.length + 10)
  for (const tool of listed.result.tools) expect(tool.outputSchema, tool.name).toMatchObject({ type: 'object' })
  for (const name of ['list_patterns', 'list_controller_profiles']) {
    expect(listed.result.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false })
  }
})

it('publishes the complete external edit protocol in the initialization instructions', async () => {
  const env = { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv
  const initialized = await (await request(env, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).json() as {
    result: { instructions?: string }
  }
  expect(initialized.result.instructions).toMatchInlineSnapshot(`
    "Connect and edit in this order: call get_connection, then read_show. read_show returns the Show and the IDs used by command arguments. get_context reads the current editor focus when needed but does not replace read_show. Call begin_edit with the current binding_id, a required nonblank intent shown to the person in the editor, and a stable idempotency_key; it returns the relay-assigned operation_id. Send commands with that binding_id and operation_id, then call commit_edit and get_outcome until the receipt settles.

    Independent commands may be queued because the relay serializes admitted calls in admission order. Await every prerequisite before its dependent command, and await every command before commit_edit. A canonical command domain refusal returns refused with issues, changes nothing, and keeps the private operation open for a corrected command, commit_edit, or cancel_edit; noop means a valid command made no change. Explicit whole-turn refusal, commit or admission refusal, service or result-size failure, cancellation, and retirement are terminal.

    At most 10 ordinary calls may be queued, including the in-flight head. One operation admits at most 253 ordinary commands; the 256-delivery lifecycle reserves one delivery for commit_edit and one after it for cancel_edit. When a choreography needs more commands, split it into committed operations and call read_show again before each new chunk.

    begin_edit requires a stable key. Later mutations may use an optional stable idempotency_key; a keyed retry with an identical payload only looks up the original admission. pending means the original call may still finish; unknown means its result is unavailable and never permits replay. After an unkeyed timeout, do not repeat the mutation; call get_outcome with its operation_id. The retry ledger is volatile: after connection or ledger loss, call get_connection, then read_show, and begin a new operation with a new key; never replay an unkeyed call.

    Show authoring uses schema version 2. Every command addresses entities by stable identity from read_show; there are no indices, Scenes or time lookups. Times are exact global milliseconds and intervals are half-open; nothing is clamped and Show End never grows on its own. An already-satisfied request returns unchanged with no changes and does not abort the batch. Each bulk array carries 1 to 128 items and applies as one atomic candidate. Read pxlblz://docs/clip-layer-authoring/v2 and pxlblz://schemas/clip-layer-authoring/v2 for Effect and Aperture parameter names, the animation target union, and executable examples."
  `)
})

it('keeps tool metadata concise and marks exactly the non-claiming read tools read-only', async () => {
  const env = { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv
  const listed = await (await request(env, 'tools/list')).json() as {
    result: { tools: Array<{ name: string; description?: string; annotations?: { readOnlyHint?: boolean }; inputSchema: { properties?: Record<string, { description?: string }> } }> }
  }
  const byName = new Map(listed.result.tools.map(tool => [tool.name, tool]))
  const mutationNames = new Set(['begin_edit', ...SHOW_COMMANDS_V2.map(command => command.name), 'commit_edit', 'cancel_edit'])
  const mutations = listed.result.tools.filter(tool => mutationNames.has(tool.name))

  // The v2 catalogue authors the same domain in fewer, bulk commands.
  expect(mutations).toHaveLength(SHOW_COMMANDS_V2.length + 3)
  expect(mutations.some(tool => tool.description?.includes('Requires the current bound editor'))).toBe(false)
  expect(mutations.some(tool => tool.description?.includes('unkeyed timeouts must be recovered'))).toBe(false)
  for (const command of SHOW_COMMANDS_V2) expect(byName.get(command.name)?.description, command.name).toBe(command.description)
  expect(byName.get('begin_edit')?.description).toBe('Capture a full immutable Show/context and begin one private operation. The intent is required and displayed to the person in the editor. The relay assigns and returns operation_id.')
  expect(byName.get('begin_edit')?.inputSchema.properties?.intent?.description).toBe('Required nonblank edit intent displayed to the person in the editor; one line, at most 240 characters.')

  const readOnly = listed.result.tools.filter(tool => tool.annotations?.readOnlyHint === true).map(tool => tool.name).sort()
  expect(readOnly).toEqual(['get_context', 'get_outcome', 'list_commands', 'list_controller_profiles', 'list_patterns', 'read_show'])
  expect(byName.get('get_connection')?.annotations?.readOnlyHint).not.toBe(true)
  for (const mutation of mutations) expect(mutation.annotations?.readOnlyHint, mutation.name).not.toBe(true)
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

  const patternOwner = { fetch: vi.fn()
    .mockResolvedValueOnce(Response.json({ code: 'read', patterns: [
      { kind: 'stock', id: 'Aurora', name: 'Aurora', exported_controls: [{ export_name: 'sliderSpeed', kind: 'slider', min: 0, max: 1 }, { export_name: 'toggleMirror', kind: 'toggle' }] },
      { kind: 'user', id: 'personal', name: 'Personal', exported_controls: [] },
    ] })) }
  const patterns = await call(patternOwner, 'list_patterns', { binding_id: 'binding', query: 'aur', kind: 'stock' })
  validate('list_patterns', patterns, false)
  expect(JSON.stringify(patterns.structuredContent)).not.toContain('source')
  expect(await (patternOwner.fetch.mock.calls[0][0] as Request).clone().json()).toMatchObject({
    type: 'external-tool-query', expectedBindingId: 'binding', agentId: 'grant', agentName: 'Client',
    query: { kind: 'list_patterns', query: 'aur', patternKind: 'stock' },
  })

  const profiles = await call({ fetch: vi.fn()
    .mockResolvedValueOnce(Response.json({ code: 'read', controller_profiles: [{ id: 'profile', name: 'Profile', pixel_count: 256 }, { id: 'unknown', name: 'Unknown' }] })) },
  'list_controller_profiles', { binding_id: 'binding' })
  validate('list_controller_profiles', profiles, false)

  const unavailablePatterns = await call({ fetch: vi.fn()
    .mockResolvedValueOnce(Response.json({ code: 'unavailable' })) },
  'list_patterns', { binding_id: 'binding' })
  validate('list_patterns', unavailablePatterns, true)

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
  expect(validators.get('list_patterns')!({ code: 'read', patterns: [{ kind: 'user', id: 'one', name: 'One', exported_controls: [{ export_name: 'toggleX', kind: 'toggle', min: 0 }] }] })).toBe(false)
  expect(validators.get('list_controller_profiles')!({ code: 'read', controller_profiles: [{ id: 'one', name: 'One', map_id: 'stale-map' }] })).toBe(false)
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
    { binding_id: 'binding', idempotency_key: 'key' },
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

// #1039: the server registers one catalogue per connection. `list_commands` is
// how a caller discovers that vocabulary without attaching to an editor, so it
// must describe the catalogue that was actually registered. Describing v1 under
// `catalogue: 'v2'` hands the caller command names that match no registered
// tool - the same editor-accepts-v2-while-commands-assume-v1 window the
// scene-retirement specification forbids, in miniature.
async function catalogueRequest(env: WorkerEnv, method: string, params: unknown, catalogue: 'v1' | 'v2') {
  return agentMcpRouting(new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
  }), env, grant, { catalogue })
}

async function listedCommands(catalogue: 'v1' | 'v2') {
  const owner = { fetch: vi.fn().mockResolvedValue(Response.json({ code: 'no_live_editor' })) }
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => account(owner) },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
  } as unknown as WorkerEnv
  const response = await catalogueRequest(env, 'tools/call', { name: 'list_commands', arguments: {} }, catalogue)
  const result = (await response.json() as {
    result: { content: Array<{ text: string }>; structuredContent: Record<string, unknown>; isError?: boolean }
  }).result
  expect(result.isError).toBeUndefined()
  expectCopies(result)
  return (result.structuredContent as {
    commands: Array<{ name: string; description: string; fields: Record<string, unknown>; exactlyOne?: readonly string[] }>
  }).commands
}

it.each(['v1', 'v2'] as const)('list_commands describes the %s catalogue the connection registered', async catalogue => {
  const expected = (catalogue === 'v2' ? SHOW_COMMANDS_V2 : SHOW_COMMANDS).map(command => command.name)
  expect((await listedCommands(catalogue)).map(command => command.name)).toEqual(expected)
})

it.each(['v1', 'v2'] as const)('list_commands names only tools the %s catalogue registered', async catalogue => {
  const response = await catalogueRequest({ ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv, 'tools/list', undefined, catalogue)
  const tools = new Set((await response.json() as { result: { tools: Array<{ name: string }> } }).result.tools.map(tool => tool.name))
  const listed = await listedCommands(catalogue)
  expect(listed.length).toBeGreaterThan(0)
  for (const command of listed) expect(tools, `${catalogue}: ${command.name}`).toContain(command.name)
})

it('list_commands carries each v2 catalogue entry own field metadata', async () => {
  const byName = new Map((await listedCommands('v2')).map(command => [command.name, command]))
  for (const descriptor of SHOW_COMMANDS_V2) {
    const entry = byName.get(descriptor.name)!
    expect(entry.description, descriptor.name).toBe(descriptor.description)
    expect(entry.fields, descriptor.name).toEqual(descriptor.fields)
    expect(entry.exactlyOne, descriptor.name).toEqual(descriptor.exactlyOne)
  }
})

it.each([
  [1, SHOW_COMMANDS],
  [2, SHOW_COMMANDS_V2],
] as const)('registers the catalogue the bound editor record version %i needs', async (showVersion, expected) => {
  const owner = { fetch: vi.fn().mockResolvedValue(Response.json({ code: 'no_live_editor' })) }
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => account(owner, showVersion) },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
  } as unknown as WorkerEnv
  const response = await request(env, 'tools/list')
  const tools = new Set((await response.json() as { result: { tools: Array<{ name: string }> } }).result.tools.map(tool => tool.name))
  for (const command of expected) expect(tools, command.name).toContain(command.name)
  const absent = (showVersion === 2 ? SHOW_COMMANDS : SHOW_COMMANDS_V2).filter(command => !expected.some(entry => entry.name === command.name))
  expect(absent.length).toBeGreaterThan(0)
  for (const command of absent) expect(tools, command.name).not.toContain(command.name)
  // The binding read is not a tool call: it neither reaches the owner's tool
  // surface nor consumes one of its rate-limited agent calls.
  expect(owner.fetch).not.toHaveBeenCalled()
})

it('describes the production v2 catalogue when no editor is bound (#1039)', async () => {
  // Since the flip, v2 is the authored vocabulary of the production editor, so
  // an unbound connection is told about it. A connection that then binds to a
  // row storage still holds as v1 is answered v1 by the dispatch above, and
  // `get_connection` already instructs that client to reconnect.
  const owner = { fetch: vi.fn().mockResolvedValue(Response.json({ code: 'no_live_editor' })) }
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => account(owner) },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
  } as unknown as WorkerEnv
  const tools = new Set(((await (await request(env, 'tools/list')).json()) as { result: { tools: Array<{ name: string }> } }).result.tools.map(tool => tool.name))
  for (const command of SHOW_COMMANDS_V2) expect(tools, command.name).toContain(command.name)
  const v1Only = SHOW_COMMANDS.filter(command => !SHOW_COMMANDS_V2.some(entry => entry.name === command.name))
  expect(v1Only.length).toBeGreaterThan(0)
  for (const command of v1Only) expect(tools, command.name).not.toContain(command.name)
})

it('describes the production v2 catalogue when the binding cannot be read (#1039)', async () => {
  const env = {
    AGENT_ACCOUNTS: { idFromName: () => 'account', get: () => ({ fetch: () => { throw new Error('unreachable') } }) },
    ASSETS: { fetch: vi.fn() },
    AGENT_SERVICE_ENABLED: '1',
  } as unknown as WorkerEnv
  const tools = new Set(((await (await request(env, 'tools/list')).json()) as { result: { tools: Array<{ name: string }> } }).result.tools.map(tool => tool.name))
  for (const command of SHOW_COMMANDS_V2) expect(tools, command.name).toContain(command.name)
})
