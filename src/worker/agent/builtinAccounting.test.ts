import { afterEach, expect, it, vi } from 'vitest'
import { AgentAllowance } from './AgentAllowance'
import { dispatchBuiltinProvider } from './builtinProvider'
import type { AgentAccountNamespace } from './AgentAccount'

function financialOwner() {
  const values = new Map<string, unknown>()
  let queue = Promise.resolve()
  const storage: ConstructorParameters<typeof AgentAllowance>[0]['storage'] = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)) },
    async transaction(run) { const pending = queue.then(() => run(storage)); queue = pending.then(() => undefined, () => undefined); return pending },
  }
  const owner = new AgentAllowance({ storage })
  const namespace: AgentAccountNamespace = { idFromName: name => name, get: () => owner }
  return { namespace, async status(accountId: string) {
    return (await owner.fetch(new Request('https://internal/', { method: 'POST', body: JSON.stringify({ type: 'status', accountId }) }))).json() as Promise<{ allowance: { code: string; remaining: number } }>
  }, async begin(index: number, accountId = `account-${index}`) {
    const identity = `${accountId}/binding-${index}`
    const response = await owner.fetch(new Request('https://internal/', { method: 'POST', body: JSON.stringify({ type: 'begin', accountId, owner: identity }) }))
    const body = await response.json() as { operationId: string }
    return { owner: identity, operationId: body.operationId, round: 0, input: [{ role: 'user', content: 'Edit' }], tools: [] }
  } }
}
afterEach(() => vi.restoreAllMocks())
it('settles official-shaped usage so small successful calls do not each consume the worst reservation', async () => {
  const f = financialOwner(); let calls = 0
  for (let i = 0; i < 25; i++) {
    const result = await dispatchBuiltinProvider({ apiKey: 'injected', allowance: f.namespace, providerFetch: async () => {
      calls++
      return Response.json({ model: 'gpt-5.6-luna', service_tier: 'default', status: 'completed', output: [], usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } })
    } }, await f.begin(i))
    expect(result.ok).toBe(true)
  }
  expect(calls).toBe(25)
})
it('retains every unknown-usage reservation and refuses before the tenth provider call', async () => {
  const f = financialOwner(); let calls = 0
  for (let i = 0; i < 10; i++) {
    const result = await dispatchBuiltinProvider({ apiKey: 'injected', allowance: f.namespace, providerFetch: async () => {
      calls++
      return Response.json({ model: 'gpt-5.6-luna', service_tier: 'default', status: 'completed', output: [], usage: null })
    } }, await f.begin(i))
    expect(result.ok).toBe(i < 9)
    if (i === 9) expect(result).toEqual({ ok: false, code: 'exhausted' })
  }
  expect(calls).toBe(9)
})
it('admits the thirtieth account message and refuses the thirty-first before provider transport', async () => {
  let now = Date.parse('2026-09-10T00:00:00Z')
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const f = financialOwner(); let calls = 0
  for (let index = 0; index < 31; index++) {
    const result = await dispatchBuiltinProvider({ apiKey: 'injected', allowance: f.namespace, providerFetch: async () => {
      calls++
      return Response.json({ model: 'gpt-5.6-luna', service_tier: 'default', status: 'completed', output: [], usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } })
    } }, await f.begin(index, 'same-account'))
    expect(result).toEqual(index < 30 ? { ok: true, output: [] } : { ok: false, code: 'daily_message_limit' })
    now += 60_000
  }
  expect(calls).toBe(30)
  expect(await f.status('same-account')).toMatchObject({ allowance: { code: 'daily_message_limit', remaining: 0 } })
})
it('charges a provider failure after admission while pre-dispatch validation consumes nothing', async () => {
  const f = financialOwner(); let calls = 0
  const invalid = await f.begin(0, 'account')
  invalid.input = [{ role: 'invented', content: 'invalid' }]
  expect(await dispatchBuiltinProvider({ apiKey: 'injected', allowance: f.namespace, providerFetch: async () => { calls++; return Response.json({}) } }, invalid)).toEqual({ ok: false, code: 'invalid_request' })
  expect(await f.status('account')).toMatchObject({ allowance: { code: 'available', remaining: 30 } })

  const admitted = await f.begin(1, 'account')
  expect(await dispatchBuiltinProvider({ apiKey: 'injected', allowance: f.namespace, providerFetch: async () => { calls++; return new Response('failed', { status: 503 }) } }, admitted)).toEqual({ ok: false, code: 'provider_unavailable' })
  expect(calls).toBe(1)
  expect(await f.status('account')).toMatchObject({ allowance: { code: 'available', remaining: 29 } })
})
