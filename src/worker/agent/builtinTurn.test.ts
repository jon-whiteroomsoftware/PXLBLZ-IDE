import { expect, it, vi } from 'vitest'
import { runBuiltinTurn } from './builtinTurn'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'
import { SHOW_COMMANDS_V2 } from '../../engine/showCommandsV2/registry'
const call = (name: string, args: object) => ({ type: 'function_call', call_id: `call-${name}`, name, arguments: JSON.stringify(args) })
function fixture(outputs: unknown[][]) {
  const deliveries: Record<string, unknown>[] = []
  const dispatch = vi.fn<Parameters<typeof runBuiltinTurn>[0]['dispatch']>(async () => ({ ok: true as const, output: outputs.shift() ?? [] }))
  const deliver = vi.fn(async (payload: Record<string, unknown>): Promise<Record<string, unknown> & { code: string }> => {
    deliveries.push(payload)
    if (payload.kind === 'begin_edit') return { code: 'begun', show: { id: 'show' }, context: {} }
    if (payload.kind === 'command') return { code: 'changed', changes: [{ description: 'Private change' }] }
    return { code: 'outcome', receipt: { status: 'applied' } }
  })
  return { dispatch, deliver, deliveries }
}
it('executes canonical commands privately and adopts only explicit apply completion', async () => {
  const f = fixture([[call('rename_show', { name: 'New' })], [call('finish_turn', { outcome: 'apply', message: 'Requested rename' })]])
  const result = await runBuiltinTurn(f, 'Rename the Show')
  expect(result).toMatchObject({ code: 'outcome', message: 'Requested rename' })
  expect(f.deliveries.map(x => x.kind)).toEqual(['begin_edit', 'command', 'commit_edit'])
  expect(f.dispatch).toHaveBeenCalledTimes(2)
  const firstRequest = (f.dispatch.mock.calls as unknown as Array<[{ input: Array<{ role?: string; content?: string }> }]>)[0][0]
  expect(firstRequest.input[0]).toMatchObject({
    role: 'developer', content: expect.stringContaining('Clip and Layer authoring schema v1'),
  })
})
it.each(['ask', 'refuse', 'incomplete'])('discards private work for explicit %s', async outcome => {
  const f = fixture([[call('finish_turn', { outcome, message: 'More information' })]])
  await runBuiltinTurn(f, 'Edit')
  expect(f.deliveries[1]).toEqual({ kind: 'complete_edit', completion: outcome === 'ask' ? 'asked' : outcome === 'refuse' ? 'refused' : 'incomplete' })
})
it('never treats assistant prose or malformed/unknown tools as adoption', async () => {
  for (const output of [[{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done' }] }], [call('unknown_tool', {})], [call('finish_turn', { outcome: 'apply', message: 'Done', unexpected: true })]]) {
    const f = fixture([output]); await runBuiltinTurn(f, 'Edit')
    expect(f.deliveries.some(x => x.kind === 'commit_edit')).toBe(false)
    expect(f.deliveries[f.deliveries.length - 1].kind).toBe('complete_edit')
  }
})
it('does not dispatch when begin is refused and keeps the same edit open for command correction', async () => {
  const f = fixture([]); f.deliver.mockResolvedValue({ code: 'busy' })
  expect(await runBuiltinTurn(f, 'Edit')).toMatchObject({ code: 'busy' })
  expect(f.dispatch).not.toHaveBeenCalled()
  const g = fixture([[call('rename_show', { name: '' })], [call('rename_show', { name: 'New' })], [call('finish_turn', { outcome: 'apply', message: 'Requested rename' })]])
  let commands = 0
  g.deliver.mockImplementation(async payload => {
    g.deliveries.push(payload)
    if (payload.kind === 'begin_edit') return { code: 'begun', show: {}, context: {} }
    if (payload.kind === 'command' && commands++ === 0) return { code: 'refused', issues: [{ code: 'invalid-argument', message: 'Name is required.' }] }
    if (payload.kind === 'command') return { code: 'changed', changes: [{ description: 'Private change' }] }
    return { code: 'outcome', receipt: { status: 'applied' } }
  })
  expect(await runBuiltinTurn(g, 'Edit')).toMatchObject({ code: 'outcome', message: 'Requested rename' })
  expect(g.dispatch).toHaveBeenCalledTimes(3)
  expect(g.deliveries.map(item => item.kind)).toEqual(['begin_edit', 'command', 'command', 'commit_edit'])
  const correctionInput = g.dispatch.mock.calls[1][0].input
  expect(correctionInput[correctionInput.length - 1]).toMatchObject({
    type: 'function_call_output', output: expect.stringContaining('Name is required.'),
  })
})

it('keeps explicit whole-turn refusal terminal after a command refusal', async () => {
  const f = fixture([[call('rename_show', { name: '' })], [call('finish_turn', { outcome: 'refuse', message: 'I cannot resolve the name.' })]])
  f.deliver.mockImplementation(async payload => {
    f.deliveries.push(payload)
    if (payload.kind === 'begin_edit') return { code: 'begun', show: {}, context: {} }
    if (payload.kind === 'command') return { code: 'refused', issues: [{ code: 'invalid-argument', message: 'Name is required.' }] }
    return { code: 'outcome', receipt: { status: 'completed', completion: 'refused' } }
  })
  expect(await runBuiltinTurn(f, 'Edit')).toMatchObject({ code: 'outcome', message: 'I cannot resolve the name.' })
  expect(f.deliveries[f.deliveries.length - 1]).toEqual({ kind: 'complete_edit', completion: 'refused' })
})
it('bounds rounds and preserves unknown delivery outcomes without replay', async () => {
  const f = fixture(Array.from({ length: 6 }, () => [call('rename_show', { name: 'New' })]))
  await runBuiltinTurn(f, 'Edit')
  expect(f.dispatch).toHaveBeenCalledTimes(6)
  expect(f.deliveries[f.deliveries.length - 1]).toEqual({ kind: 'complete_edit', completion: 'incomplete' })
  const g = fixture([[call('finish_turn', { outcome: 'apply', message: 'Done' })]])
  g.deliver.mockImplementation(async payload => payload.kind === 'begin_edit' ? { code: 'begun', show: {}, context: {} } : { code: 'unknown' })
  expect(await runBuiltinTurn(g, 'Edit')).toMatchObject({ code: 'unknown' })
  expect(g.deliver).toHaveBeenCalledTimes(2)
})
it('preserves private work when dispatch loses editor contact', async () => {
  const f = fixture([])
  const result = await runBuiltinTurn({ deliver: f.deliver, dispatch: async () => ({ ok: false, code: 'contact_lost' }) }, 'Edit')
  expect(result).toEqual({ code: 'unknown' })
  expect(f.deliveries.map(x => x.kind)).toEqual(['begin_edit'])
})
it('carries SDK reasoning content through a complete provider-backed edit turn', async () => {
  const { dispatchBuiltinProvider } = await import('./builtinProvider')
  const reasoning = { type: 'reasoning', id: 'rs_test', summary: [], encrypted_content: 'opaque', content: [] }
  const outputs = [[reasoning, call('rename_show', { name: 'New' })], [reasoning, call('finish_turn', { outcome: 'apply', message: 'Requested rename' })]]
  const requests: Record<string, unknown>[] = []
  const f = fixture([])
  const result = await runBuiltinTurn({ deliver: f.deliver, dispatch: request => dispatchBuiltinProvider({
    apiKey: 'test-only',
    allowance: { idFromName: name => name, get: () => ({ fetch: async req => Response.json({ code: (await req.json() as { type: string }).type === 'reserve' ? 'reserved' : 'settled' }) }) },
    providerFetch: async (_url, init) => {
      requests.push(JSON.parse(init!.body as string))
      return Response.json({ model: 'gpt-5.6-luna', service_tier: 'default', status: 'completed', output: outputs.shift(), usage: {} })
    },
  }, { ...request, owner: 'test', operationId: 'test' }) }, 'Rename')
  expect(result).toMatchObject({ code: 'outcome', message: 'Requested rename' })
  expect(f.deliveries.map(item => item.kind)).toEqual(['begin_edit', 'command', 'commit_edit'])
  expect(requests).toHaveLength(2)
  expect(requests[1].input).toEqual(expect.arrayContaining([reasoning]))
})

it('offers the v2 catalogue, tools and reference when the captured record is v2', async () => {
  const f = fixture([[call('rename_show', { name: 'New' })], [call('finish_turn', { outcome: 'apply', message: 'Requested rename' })]])
  f.deliver.mockImplementation(async (payload: Record<string, unknown>) => {
    f.deliveries.push(payload)
    if (payload.kind === 'begin_edit') return { code: 'begun', show: { id: 'show', version: 2 }, context: {} }
    if (payload.kind === 'command') return { code: 'changed', changes: [{ description: 'Private change' }] }
    return { code: 'outcome', receipt: { status: 'applied' } }
  })
  await runBuiltinTurn(f, 'Rename the Show')
  const calls = f.dispatch.mock.calls as unknown as Array<[{ input: Array<{ role?: string; content?: string }>; tools: Array<{ name: string }> }]>
  expect(calls[0][0].input[0]).toMatchObject({ role: 'developer', content: expect.stringContaining('Show authoring uses schema version') })
  const tools = new Set(calls[0][0].tools.map(tool => tool.name))
  for (const command of SHOW_COMMANDS_V2) expect(tools, command.name).toContain(command.name)
  expect(tools.has('finish_turn')).toBe(true)
  const onlyV1 = SHOW_COMMANDS.filter(command => !SHOW_COMMANDS_V2.some(entry => entry.name === command.name))
  expect(onlyV1.length).toBeGreaterThan(0)
  for (const command of onlyV1) expect(tools, command.name).not.toContain(command.name)
})

it('refuses a v1 command name against a v2 capture rather than delivering it', async () => {
  const onlyV1 = SHOW_COMMANDS.find(command => !SHOW_COMMANDS_V2.some(entry => entry.name === command.name))!
  const f = fixture([[call(onlyV1.name, {})]])
  f.deliver.mockImplementation(async (payload: Record<string, unknown>) => {
    f.deliveries.push(payload)
    if (payload.kind === 'begin_edit') return { code: 'begun', show: { id: 'show', version: 2 }, context: {} }
    return { code: 'outcome', receipt: { status: 'completed' } }
  })
  await runBuiltinTurn(f, 'Edit')
  expect(f.deliveries.map(entry => entry.kind)).toEqual(['begin_edit', 'complete_edit'])
  expect(f.deliveries[1]).toMatchObject({ completion: 'incomplete' })
})
