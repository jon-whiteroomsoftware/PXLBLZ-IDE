import { afterEach, expect, it, vi } from 'vitest'
import { AgentAccount } from './AgentAccount'

afterEach(() => vi.restoreAllMocks())
it('an old alarm observes renewed liveness and only retires the current expired generation', async () => {
  let now = 0
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const values = new Map<string, unknown>()
  const storage: ConstructorParameters<typeof AgentAccount>[0]['storage'] = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)) },
    async delete(key: string) { return values.delete(key) },
    async setAlarm(_time: number) {},
    async deleteAlarm() {},
    async transaction(callback) { return callback(storage) },
  }
  const owner = new AgentAccount({ storage })
  const send = async (body: unknown) => (await owner.fetch(new Request('https://internal', { method: 'POST', body: JSON.stringify(body) }))).json()
  const target = { registrationId: 'registration', sessionId: 'session', showId: 'show' }
  const agent = { agentKind: 'builtin', agentId: 'agent', agentName: 'Agent', callId: 'call', bindingId: 'binding' }
  await send({ type: 'register', ...target })
  await send({ type: 'claim', ...agent, window: target })
  now = 200_000
  expect(await send({ type: 'heartbeat', ...target })).toMatchObject({ code: 'status', contact: 'live' })
  now = 300_000
  await owner.alarm()
  expect(await send({ type: 'inspect', ...agent })).toMatchObject({ code: 'bound', binding: { sessionId: 'session', showId: 'show' } })
  now = 500_000
  await owner.alarm()
  expect(await send({ type: 'inspect', ...agent })).toEqual({ code: 'no_live_editor' })
  const replacement = { registrationId: 'new-registration', sessionId: 'new-session', showId: 'show' }
  await send({ type: 'register', ...replacement })
  await send({ type: 'claim', ...agent, bindingId: 'new-binding', window: replacement })
  await owner.alarm()
  expect(await send({ type: 'leave', ...target })).toEqual({ code: 'retired' })
  expect(await send({ type: 'inspect', ...agent, bindingId: 'new-binding' })).toMatchObject({ code: 'bound', binding: { sessionId: 'new-session' } })
})
it('holds a new external call for the full30 seconds and never recreates its expired identity', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0)
  const values = new Map<string, unknown>()
  const storage: ConstructorParameters<typeof AgentAccount>[0]['storage'] = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)) },
    async delete(key: string) { return values.delete(key) },
    async setAlarm() {}, async deleteAlarm() {}, async transaction(callback) { return callback(storage) },
  }
  const owner = new AgentAccount({ storage })
  const send = async (body: object) => (await owner.fetch(new Request('https://internal', { method: 'POST', body: JSON.stringify(body) }))).json()
  const window = { registrationId: 'r', sessionId: 's', showId: 'show' }
  const identity = { agentKind: 'external', agentId: 'grant', agentName: 'Client', callId: 'call', bindingId: 'binding' }
  try {
    await send({ type: 'register', ...window })
    let finished = false
    const call = send({ type: 'connect-external', ...identity }).then(result => { finished = true; return result })
    await vi.advanceTimersByTimeAsync(25_000)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(4999)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await call).toEqual({ code: 'no_live_editor' })
    expect(await send({ type: 'resolve-external', agentId: 'grant', callId: 'call' })).toEqual({ code: 'no_live_editor' })
    const fresh = send({ type: 'connect-external', ...identity, callId: 'fresh', bindingId: 'fresh-binding' })
    await vi.advanceTimersByTimeAsync(0)
    expect(await send({ type: 'answer', ...window, callId: 'call' })).toMatchObject({ code: 'no_live_editor' })
    await send({ type: 'answer', ...window, callId: 'fresh' })
    expect(await fresh).toMatchObject({ code: 'bound', claim: { callId: 'fresh', bindingId: 'fresh-binding' } })
  } finally { vi.useRealTimers() }
})
