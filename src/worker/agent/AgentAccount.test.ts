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
