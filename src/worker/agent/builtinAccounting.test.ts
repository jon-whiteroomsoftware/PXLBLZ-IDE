import { expect, it } from 'vitest'
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
  return { namespace, async begin(index: number) {
    const identity = `account-${index}/binding`
    const response = await owner.fetch(new Request('https://internal/', { method: 'POST', body: JSON.stringify({ type: 'begin', accountId: `account-${index}`, owner: identity }) }))
    const body = await response.json() as { operationId: string }
    return { owner: identity, operationId: body.operationId, round: 0, input: [{ role: 'user', content: 'Edit' }], tools: [] }
  } }
}
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
it('retains every unknown-usage reservation and refuses before the nineteenth provider call', async () => {
  const f = financialOwner(); let calls = 0
  for (let i = 0; i < 19; i++) {
    const result = await dispatchBuiltinProvider({ apiKey: 'injected', allowance: f.namespace, providerFetch: async () => {
      calls++
      return Response.json({ model: 'gpt-5.6-luna', service_tier: 'default', status: 'completed', output: [], usage: null })
    } }, await f.begin(i))
    expect(result.ok).toBe(i < 18)
    if (i === 18) expect(result).toEqual({ ok: false, code: 'exhausted' })
  }
  expect(calls).toBe(18)
})
