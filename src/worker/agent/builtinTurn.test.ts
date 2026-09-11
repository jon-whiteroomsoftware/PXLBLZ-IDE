import { expect, it, vi } from 'vitest'
import { runBuiltinTurn } from './builtinTurn'
const call = (name: string, args: object) => ({ type: 'function_call', call_id: `call-${name}`, name, arguments: JSON.stringify(args) })
function fixture(outputs: unknown[][]) {
  const deliveries: Record<string, unknown>[] = []
  const dispatch = vi.fn(async () => ({ ok: true as const, output: outputs.shift() ?? [] }))
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
it('does not dispatch when begin is refused and stops on actual command refusal', async () => {
  const f = fixture([]); f.deliver.mockResolvedValue({ code: 'busy' })
  expect(await runBuiltinTurn(f, 'Edit')).toMatchObject({ code: 'busy' })
  expect(f.dispatch).not.toHaveBeenCalled()
  const g = fixture([[call('rename_show', { name: 'New' })]])
  g.deliver.mockImplementation(async payload => { g.deliveries.push(payload); return payload.kind === 'begin_edit' ? { code: 'begun', show: {}, context: {} } : { code: 'refused' } })
  expect(await runBuiltinTurn(g, 'Edit')).toMatchObject({ code: 'refused' })
  expect(g.dispatch).toHaveBeenCalledOnce()
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
