import { expect, it, vi } from 'vitest'
import { dispatchBuiltinProvider } from './builtinProvider'
import type { ResponseUsage } from 'openai/resources/responses/responses'
import type { AgentAccountNamespace } from './AgentAccount'

const input = [{ role: 'user', content: 'Shorten the opening' }]
const tools = [{ type: 'function' as const, name: 'resize_clip', description: 'Resize', parameters: { type: 'object', properties: {} }, strict: false as const }]
const request = { owner: 'account/binding', operationId: 'operation', round: 0, input, tools }
const usage: ResponseUsage = { input_tokens: 100, output_tokens: 10, total_tokens: 110, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 5 } }
function fixture(code = 'reserved') {
  const order: string[] = [], commands: unknown[] = []
  const allowance: AgentAccountNamespace = { idFromName(name) { expect(name).toBe('builtin-global-v1'); return name }, get: () => ({ fetch: async req => {
    const body = await req.json() as { type: string }; commands.push(body); order.push(body.type)
    return Response.json({ code: body.type === 'reserve' ? code : 'settled' })
  } }) }
  const providerFetch = vi.fn(async () => { order.push('provider'); return Response.json({ model: 'gpt-5.6-luna', service_tier: 'default', status: 'completed', output: [], usage }) })
  return { deps: { apiKey: 'test-secret-never-live', allowance, providerFetch }, order, commands }
}
it('pins the exact request and reserves before one provider request, then settles its own round', async () => {
  const f = fixture()
  expect((await dispatchBuiltinProvider(f.deps, request)).ok).toBe(true)
  expect(f.order).toEqual(['reserve', 'provider', 'settle'])
  const [url, init] = f.deps.providerFetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://api.openai.com/v1/responses')
  expect(JSON.parse(init.body as string)).toMatchObject({ model: 'gpt-5.6-luna', reasoning: { effort: 'high' }, service_tier: 'default', truncation: 'disabled', store: false, max_output_tokens: 8192, parallel_tool_calls: false })
  expect(f.commands[1]).toEqual({ type: 'settle', owner: request.owner, operationId: request.operationId, round: 0, usage })
})
it.each(['exhausted', 'duplicate', 'expired', 'halted', 'unknown'])('starts zero provider calls after %s admission', async code => {
  const f = fixture(code)
  expect(await dispatchBuiltinProvider(f.deps, request)).toEqual({ ok: false, code })
  expect(f.deps.providerFetch).not.toHaveBeenCalled()
})
it('refuses unsupported billable tools, image input, oversize and missing credentials before reservation', async () => {
  for (const change of [{ tools: [{ type: 'web_search' }] }, { input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'https://example.test/image' }] }] }, { input: [{ role: 'user', content: 'x'.repeat(256 * 1024) }] }]) {
    const f = fixture()
    expect((await dispatchBuiltinProvider(f.deps, { ...request, ...change } as typeof request)).ok).toBe(false)
    expect(f.order).toEqual([])
  }
  const f = fixture()
  expect((await dispatchBuiltinProvider({ ...f.deps, apiKey: undefined }, request)).ok).toBe(false)
  expect(f.order).toEqual([])
})
it('does not retry an ambiguous network failure or refund its reservation', async () => {
  const f = fixture(); f.deps.providerFetch.mockRejectedValue(new Error('provider disconnected with secret detail'))
  expect(await dispatchBuiltinProvider(f.deps, request)).toEqual({ ok: false, code: 'provider_unavailable' })
  expect(f.deps.providerFetch).toHaveBeenCalledOnce()
  expect(f.commands).toHaveLength(1)
})
it('settles known incomplete usage but never returns partial output for adoption', async () => {
  const f = fixture(); f.deps.providerFetch.mockResolvedValue(Response.json({ model: 'gpt-5.6-luna', service_tier: 'default', status: 'incomplete', output: [{ type: 'function_call', name: 'resize_clip', arguments: '{}' }], usage }))
  expect(await dispatchBuiltinProvider(f.deps, request)).toEqual({ ok: false, code: 'provider_incomplete' })
  expect(f.order).toEqual(['reserve', 'settle'])
})
it('halts on a returned model or service tier outside the priced contract', async () => {
  const f = fixture(); f.deps.providerFetch.mockResolvedValue(Response.json({ model: 'other-model', service_tier: 'default', status: 'completed', output: [], usage }))
  expect(await dispatchBuiltinProvider(f.deps, request)).toEqual({ ok: false, code: 'provider_contract' })
  expect(f.commands[f.commands.length - 1]).toMatchObject({ type: 'halt' })
  expect(f.commands.some(x => (x as { type: string }).type === 'settle')).toBe(false)
})
it('accepts only text and local-function continuation items, with encrypted reasoning state', async () => {
  const f = fixture()
  const continuation = [
    { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque' },
    { type: 'function_call', call_id: 'call_1', name: 'resize_clip', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call_1', output: '{"code":"changed"}' },
  ]
  expect((await dispatchBuiltinProvider(f.deps, { ...request, input: continuation as never })).ok).toBe(true)
  for (const bad of [{ ...continuation[0], summary: [{ type: 'image', url: 'x' }] }, { ...continuation[1], hosted: true }, { ...continuation[2], output: [{ type: 'input_image' }] }]) {
    const g = fixture()
    expect((await dispatchBuiltinProvider(g.deps, { ...request, input: [bad] as never })).ok).toBe(false)
    expect(g.order).toEqual([])
  }
})
