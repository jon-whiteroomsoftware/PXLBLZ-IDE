import { afterEach, expect, it, vi } from 'vitest'
import { AgentAllowance } from './AgentAllowance'

function fixture() {
  const values = new Map<string, unknown>()
  let queue = Promise.resolve()
  const storage: ConstructorParameters<typeof AgentAllowance>[0]['storage'] = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)) },
    async transaction(callback) {
      const pending = queue.then(() => callback(storage))
      queue = pending.then(() => undefined, () => undefined)
      return pending
    },
  }
  let owner = new AgentAllowance({ storage })
  return {
    restart() { owner = new AgentAllowance({ storage }) },
    async send(body: Record<string, unknown>): Promise<Record<string, unknown>> { body = { accountId: body.owner, ...body }; return (await owner.fetch(new Request('https://allowance.internal', { method: 'POST', body: JSON.stringify(body) }))).json() },
  }
}
afterEach(() => vi.restoreAllMocks())
it('serializes starts for a binding and global reservations across accounts, including restart', async () => {
  const f = fixture()
  const pair = await Promise.all([f.send({ type: 'begin', owner: 'account-a/binding-a' }), f.send({ type: 'begin', owner: 'account-a/binding-a' })])
  expect(pair.map(x => x.code).sort()).toEqual(['busy', 'started'])
  const operationId = pair.find(x => x.code === 'started')!.operationId
  const one = await f.send({ type: 'reserve', owner: 'account-a/binding-a', operationId, round: 0 })
  expect(one.code).toBe('reserved')
  f.restart()
  expect((await f.send({ type: 'reserve', owner: 'account-a/binding-a', operationId, round: 0 })).code).toBe('duplicate')
  expect((await f.send({ type: 'reserve', owner: 'account-b/binding-b', operationId, round: 1 })).code).toBe('unknown')
  const attempts = await Promise.all(Array.from({ length: 19 }, async (_, i) => {
    const owner = `account-${i}/binding-${i}`
    const started = await f.send({ type: 'begin', owner })
    return f.send({ type: 'reserve', owner, operationId: started.operationId, round: 0 })
  }))
  expect(attempts.filter(x => x.code === 'reserved')).toHaveLength(17)
  expect(attempts.filter(x => x.code === 'exhausted')).toHaveLength(2)
  const last = await f.send({ type: 'begin', owner: 'last' })
  expect((await f.send({ type: 'reserve', owner: 'last', operationId: last.operationId, round: 0 })).code).toBe('exhausted')
})
it('expires admission before pruning identities and never makes an old dispatch fresh', async () => {
  let now = Date.parse('2026-09-10T12:00:00Z')
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const f = fixture(), owner = 'a/b'
  const { operationId } = await f.send({ type: 'begin', owner })
  expect((await f.send({ type: 'reserve', owner, operationId, round: 0 })).code).toBe('reserved')
  now += 24 * 60 * 60 * 1000
  expect((await f.send({ type: 'reserve', owner, operationId, round: 1 })).code).toBe('expired')
  now += 4 * 24 * 60 * 60 * 1000
  expect((await f.send({ type: 'reserve', owner, operationId, round: 0 })).code).toBe('unknown')
  expect((await f.send({ type: 'begin', owner })).code).toBe('started')
})
it('allows each round once, bounds rounds and keeps finished operations closed', async () => {
  const f = fixture(), owner = 'a/b'
  const { operationId } = await f.send({ type: 'begin', owner })
  expect((await f.send({ type: 'reserve', owner, operationId, round: 2 })).code).toBe('invalid_round')
  for (let round = 0; round < 6; round++) expect((await f.send({ type: 'reserve', owner, operationId, round })).code).toBe('reserved')
  expect((await f.send({ type: 'reserve', owner, operationId, round: 6 })).code).toBe('invalid_round')
  expect((await f.send({ type: 'finish', owner, operationId })).code).toBe('finished')
  expect((await f.send({ type: 'reserve', owner, operationId, round: 0 })).code).toBe('finished')
})


it('keeps cancellation after possible dispatch charged and settles late usage only on its original UTC day', async () => {
  let now = Date.parse('2026-09-10T23:59:59Z')
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const f = fixture(), owner = 'a/b'
  const { operationId } = await f.send({ type: 'begin', owner })
  expect((await f.send({ type: 'reserve', owner, operationId, round: 0 })).code).toBe('reserved')
  expect((await f.send({ type: 'finish', owner, operationId })).code).toBe('finished')
  for (const usage of [null, {}, { input_tokens: 1, output_tokens: 1 }]) expect((await f.send({ type: 'settle', owner, operationId, round: 0, usage })).code).toBe('unknown')
  now += 2000
  const attempts = await Promise.all(Array.from({ length: 18 }, async (_, i) => {
    const nextOwner = `next-${i}`
    const op = await f.send({ type: 'begin', owner: nextOwner })
    return f.send({ type: 'reserve', owner: nextOwner, operationId: op.operationId, round: 0 })
  }))
  expect(attempts.every(x => x.code === 'reserved')).toBe(true)
  const usage = { input_tokens: 100, output_tokens: 10, total_tokens: 110, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } }
  expect((await f.send({ type: 'settle', owner, operationId, round: 0, usage })).code).toBe('settled')
  expect((await f.send({ type: 'settle', owner, operationId, round: 0, usage })).code).toBe('duplicate')
  const last = await f.send({ type: 'begin', owner: 'last' })
  expect((await f.send({ type: 'reserve', owner: 'last', operationId: last.operationId, round: 0 })).code).toBe('exhausted')
})

it('retains an overrun halt after restart and metadata expiry', async () => {
  let now = Date.parse('2026-09-10T12:00:00Z')
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const f = fixture(), owner = 'a/b'
  const { operationId } = await f.send({ type: 'begin', owner })
  await f.send({ type: 'reserve', owner, operationId, round: 0 })
  const usage = { input_tokens: 1_050_001, output_tokens: 8193, total_tokens: 1_058_194, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 1 } }
  expect((await f.send({ type: 'settle', owner, operationId, round: 0, usage })).code).toBe('overrun')
  now += 5 * 86_400_000; f.restart()
  expect((await f.send({ type: 'begin', owner: 'new' })).code).toBe('halted')
})
it('persists a provider contract halt only for the validated operation owner', async () => {
  const f = fixture(), owner = 'a/b'
  const { operationId } = await f.send({ type: 'begin', owner })
  expect((await f.send({ type: 'halt', owner: 'other', operationId })).code).toBe('unknown')
  expect((await f.send({ type: 'reserve', owner, operationId, round: 0 })).code).toBe('reserved')
  expect((await f.send({ type: 'halt', owner, operationId })).code).toBe('halted')
  f.restart()
  expect((await f.send({ type: 'begin', owner: 'next' })).code).toBe('halted')
})
it('bounds account starts across different bindings with a rolling minute window', async () => {
  let now = Date.parse('2026-09-10T12:00:00Z')
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const f = fixture()
  for (let i = 0; i < 4; i++) expect((await f.send({ type: 'begin', owner: `same/b${i}`, accountId: 'same' })).code).toBe('started')
  expect((await f.send({ type: 'begin', owner: 'same/b4', accountId: 'same' })).code).toBe('throttled')
  expect((await f.send({ type: 'begin', owner: 'other/b', accountId: 'other' })).code).toBe('started')
  now += 59_999; f.restart()
  expect((await f.send({ type: 'begin', owner: 'same/b4', accountId: 'same' })).code).toBe('throttled')
  now += 1
  expect((await f.send({ type: 'begin', owner: 'same/b4', accountId: 'same' })).code).toBe('started')
})
it('activates a server-issued operation only once before any private execution', async () => {
  const f = fixture(), owner = 'a/b'
  const { operationId } = await f.send({ type: 'begin', owner })
  const results = await Promise.all([f.send({ type: 'activate', owner, operationId }), f.send({ type: 'activate', owner, operationId })])
  expect(results.map(result => result.code).sort()).toEqual(['activated', 'duplicate'])
  f.restart()
  expect((await f.send({ type: 'activate', owner, operationId })).code).toBe('duplicate')
})
it('distinguishes never-activated halted admission from an earlier activation after restart', async () => {
  const f = fixture()
  const pending = await f.send({ type: 'begin', owner: 'pending' })
  const active = await f.send({ type: 'begin', owner: 'active' })
  expect((await f.send({ type: 'activate', owner: 'active', operationId: active.operationId })).code).toBe('activated')
  await f.send({ type: 'halt', owner: 'active', operationId: active.operationId })
  f.restart()
  expect((await f.send({ type: 'activate', owner: 'pending', operationId: pending.operationId })).code).toBe('halted')
  expect((await f.send({ type: 'activate', owner: 'active', operationId: active.operationId })).code).toBe('duplicate')
})
