import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { PENDING_CALL_TTL_MS } from '../../engine/agentRendezvous'
import { AgentAccount, pendingCallTtl } from './AgentAccount'

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
    const call = send({ type: 'external-tool-connect', agentId: identity.agentId, agentName: identity.agentName, nextCallId: identity.callId, nextBindingId: identity.bindingId }).then(result => { finished = true; return result })
    await vi.advanceTimersByTimeAsync(25_000)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(4999)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await call).toEqual({ code: 'no_live_editor' })
    expect((values.get('account') as { agentThrottle: { count: number } }).agentThrottle.count).toBe(1)
    expect(await send({ type: 'resolve-external', agentId: 'grant', callId: 'call' })).toEqual({ code: 'no_live_editor' })
    const fresh = send({ type: 'external-tool-connect', agentId: identity.agentId, agentName: identity.agentName, nextCallId: 'fresh', nextBindingId: 'fresh-binding' })
    await vi.advanceTimersByTimeAsync(0)
    expect(await send({ type: 'answer', ...window, callId: 'call' })).toMatchObject({ code: 'no_live_editor' })
    await send({ type: 'answer', ...window, callId: 'fresh' })
    expect(await fresh).toMatchObject({ code: 'bound', claim: { callId: 'fresh', bindingId: 'fresh-binding' } })
  } finally { vi.useRealTimers() }
})

it('expires an injected external call exactly at its 1000 ms boundary', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0)
  const values = new Map<string, unknown>()
  const storage: ConstructorParameters<typeof AgentAccount>[0]['storage'] = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)) },
    async delete(key: string) { return values.delete(key) },
    async setAlarm() {}, async deleteAlarm() {}, async transaction(callback) { return callback(storage) },
  }
  const owner = new AgentAccount({ storage }, { AGENT_PENDING_CALL_TTL_MS: '1000' })
  const send = async (body: object) => (await owner.fetch(new Request('https://internal', { method: 'POST', body: JSON.stringify(body) }))).json()
  const window = { registrationId: 'r', sessionId: 's', showId: 'show' }
  const identity = { agentKind: 'external', agentId: 'grant', agentName: 'Client', callId: 'call', bindingId: 'binding' }
  try {
    await send({ type: 'register', ...window })
    let finished = false
    const call = send({ type: 'external-tool-connect', agentId: identity.agentId, agentName: identity.agentName, nextCallId: identity.callId, nextBindingId: identity.bindingId }).then(result => { finished = true; return result })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(999)
    expect(finished).toBe(false)
    expect(await send({ type: 'inspect', ...identity })).toEqual({ code: 'pending' })
    await vi.advanceTimersByTimeAsync(1)
    expect(await call).toEqual({ code: 'no_live_editor' })
  } finally { vi.useRealTimers() }
})

it.each([
  [undefined, 30_000], ['', 30_000], ['0', 30_000], ['-5', 30_000],
  ['abc', 30_000], ['1.5', 30_000], ['30001', 30_000],
  ['1', 1], ['1000', 1000], ['30000', 30_000],
] as const)('accepts only a shorter positive decimal pending TTL (%s)', (value, expected) => {
  expect(pendingCallTtl(value)).toBe(expected)
})

it('keeps the production pending TTL at 30 seconds without an override binding', () => {
  expect(PENDING_CALL_TTL_MS).toBe(30_000)
  expect(readFileSync(new URL('../../../wrangler.jsonc', import.meta.url), 'utf8')).not.toContain('AGENT_PENDING_CALL_TTL_MS')
})

it('keeps agent and control windows independent while liveness and cleanup remain exempt', async () => {
  let now = 1000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const values = new Map<string, unknown>()
  const storage: ConstructorParameters<typeof AgentAccount>[0]['storage'] = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)) },
    async delete(key: string) { return values.delete(key) },
    async setAlarm() {}, async deleteAlarm() {}, async transaction(callback) { return callback(storage) },
  }
  const owner = new AgentAccount({ storage })
  const response = (body: object) => owner.fetch(new Request('https://internal', { method: 'POST', body: JSON.stringify(body) }))
  const send = async (body: object) => (await response(body)).json() as Promise<Record<string, unknown>>
  const target = { registrationId: 'registration', sessionId: 'session', showId: 'show' }

  await send({ type: 'register', ...target })
  expect(values.get('account')).toMatchObject({ agentThrottle: { count: 0 }, controlThrottle: { count: 1 } })
  for (let i = 0; i < 240; i++) expect(await send({ type: 'external-tool-resolve', agentId: 'grant' })).toEqual({ code: 'no_live_editor' })
  const throttled = await response({ type: 'external-tool-resolve', agentId: 'grant' })
  expect(throttled.status).toBe(429)
  expect(await throttled.json()).toEqual({ code: 'throttled', retry_after_ms: 60_000 })

  for (let i = 0; i < 300; i++) {
    expect(await send({ type: 'heartbeat', ...target })).toMatchObject({ code: 'status', contact: 'live' })
    expect(await send({ type: 'poll', ...target })).toMatchObject({ code: 'status' })
  }
  expect(await send({ type: 'receive', ...target, lastSeenConnection: 'force-current-snapshot' })).toMatchObject({ code: 'status', deliveries: [] })
  expect(await send({ type: 'disarm', ...target })).toMatchObject({ code: 'not_armed_here' })
  expect(values.get('account')).toMatchObject({ agentThrottle: { count: 240 }, controlThrottle: { count: 1 } })

  now = 61_000
  expect(await send({ type: 'external-tool-resolve', agentId: 'grant' })).toEqual({ code: 'no_live_editor' })
  expect(values.get('account')).toMatchObject({ agentThrottle: { start: 61_000, count: 1 }, controlThrottle: { start: 61_000, count: 0 } })
})

it('migrates one persisted legacy window into independent counters', async () => {
  const now = 1000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const target = { registrationId: 'registration', sessionId: 'session', showId: 'show' }
  const values = new Map<string, unknown>([['account', {
    rendezvous: { registrations: [{ ...target, lastSeenAt: now }], slot: null },
    throttle: { start: 500, count: 17 },
  }]])
  const storage: ConstructorParameters<typeof AgentAccount>[0]['storage'] = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)) },
    async delete(key: string) { return values.delete(key) },
    async setAlarm() {}, async deleteAlarm() {}, async transaction(callback) { return callback(storage) },
  }
  const owner = new AgentAccount({ storage })
  const send = async (body: object) => (await owner.fetch(new Request('https://internal', { method: 'POST', body: JSON.stringify(body) }))).json()

  await send({ type: 'heartbeat', ...target })
  expect(values.get('account')).toMatchObject({ agentThrottle: { count: 17 }, controlThrottle: { count: 17 } })
  await send({ type: 'external-tool-resolve', agentId: 'grant' })
  expect(values.get('account')).toMatchObject({ agentThrottle: { count: 18 }, controlThrottle: { count: 17 } })
  await send({ type: 'arm', ...target })
  expect(values.get('account')).toMatchObject({ agentThrottle: { count: 18 }, controlThrottle: { count: 18 } })
})

it('serializes external movement and consumes its current-binding notice once', async () => {
  const now = 0
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const values = new Map<string, unknown>()
  const storage: ConstructorParameters<typeof AgentAccount>[0]['storage'] = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)) },
    async delete(key: string) { return values.delete(key) },
    async setAlarm() {}, async deleteAlarm() {}, async transaction(callback) { return callback(storage) },
  }
  const owner = new AgentAccount({ storage })
  const send = async (body: object) => (await owner.fetch(new Request('https://internal', { method: 'POST', body: JSON.stringify(body) }))).json()
  const first = { registrationId: 'first', sessionId: 'first-session', showId: 'show-a' }
  const second = { registrationId: 'second', sessionId: 'second-session', showId: 'show-b' }
  const agent = { agentKind: 'external', agentId: 'grant', agentName: 'Client', callId: 'old-call', bindingId: 'old-binding' }
  await send({ type: 'register', ...first, showName: 'First' })
  await send({ type: 'register', ...second, showName: 'Second' })
  await send({ type: 'arm', ...first })
  await send({ type: 'claim', ...agent })

  expect(await send({ type: 'inspect-external-move', ...second, expectedBindingId: 'old-binding' })).toMatchObject({ code: 'move_available', claim: agent })
  expect(await send({
    type: 'replace-external-binding', target: second,
    expected: { agentId: 'grant', bindingId: 'old-binding' },
    next: { callId: 'new-call', bindingId: 'new-binding' },
  })).toEqual({ code: 'moved' })
  expect(await send({ type: 'resolve-external', agentId: 'grant', callId: 'old-call' })).toMatchObject({
    code: 'binding_moved', claim: { callId: 'new-call', bindingId: 'new-binding' }, binding: { ...second, showName: 'Second' },
  })
  expect(await send({ type: 'consume-external-move-notice', agentId: 'grant' })).toMatchObject({
    code: 'bound', claim: { callId: 'new-call', bindingId: 'new-binding' }, binding: { ...second, showName: 'Second' }, moveNotice: { showId: 'show-b', showName: 'Second' },
  })
  expect(await send({ type: 'consume-external-move-notice', agentId: 'grant' })).not.toHaveProperty('moveNotice')
  expect(await send({ type: 'leave', ...first })).toEqual({ code: 'retired' })
  expect(await send({ type: 'consume-external-move-notice', agentId: 'grant' })).toMatchObject({ code: 'bound', binding: second })
})

it('fails closed when persisted binding state outlives the volatile relay ledger', async () => {
  const values = new Map<string, unknown>()
  const storage: ConstructorParameters<typeof AgentAccount>[0]['storage'] = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)) },
    async delete(key: string) { return values.delete(key) },
    async setAlarm() {}, async deleteAlarm() {}, async transaction(callback) { return callback(storage) },
  }
  const send = async (owner: AgentAccount, body: object) => (await owner.fetch(new Request('https://internal', { method: 'POST', body: JSON.stringify(body) }))).json()
  const window = { registrationId: 'registration', sessionId: 'session', showId: 'show' }
  const old = { agentKind: 'external' as const, agentId: 'grant', agentName: 'Client', callId: 'old-call', bindingId: 'old-binding' }
  const firstOwner = new AgentAccount({ storage })
  await send(firstOwner, { type: 'register', ...window })
  await send(firstOwner, { type: 'arm', ...window })
  expect(await send(firstOwner, { type: 'claim', ...old })).toMatchObject({ code: 'bound' })

  const recreatedOwner = new AgentAccount({ storage })
  const oldAttempt = { type: 'external-tool-dispatch', agentId: 'grant', expectedBindingId: 'old-binding', delivery: { idempotencyKey: 'begin-key', payload: { kind: 'begin_edit', intent: 'Rename the Show' } } }
  expect(await send(recreatedOwner, oldAttempt)).toEqual({ code: 'retirement_unconfirmed' })
  expect(await send(recreatedOwner, oldAttempt)).toEqual({ code: 'retirement_unconfirmed' })
  expect(await send(recreatedOwner, { type: 'receive', ...window, lastSeenConnection: 'force' })).toMatchObject({ connection: { kind: 'retiring', bindingId: 'old-binding' }, deliveries: [] })
  expect(await send(recreatedOwner, { type: 'retirement-ack', ...window, bindingId: 'old-binding' })).toEqual({ code: 'editing_ended' })

  await send(recreatedOwner, { type: 'arm', ...window })
  const fresh = { ...old, callId: 'fresh-call', bindingId: 'fresh-binding' }
  expect(await send(recreatedOwner, { type: 'claim', ...fresh })).toMatchObject({ code: 'bound' })
  const reading = send(recreatedOwner, { type: 'external-tool-query', agentId: 'grant', expectedBindingId: 'fresh-binding', query: { kind: 'read_show' } })
  const received = await send(recreatedOwner, { type: 'receive', ...window, lastSeenConnection: 'force-read' }) as { deliveries: Array<{ bindingId: string; payload: { kind: string }; operationId: string; deliveryId: string }> }
  expect(received.deliveries).toHaveLength(1)
  const read = received.deliveries[0]
  expect(read).toMatchObject({ bindingId: 'fresh-binding', payload: { kind: 'read_show' } })
  await send(recreatedOwner, { type: 'reply', ...window, bindingId: 'fresh-binding', operationId: read.operationId, deliveryId: read.deliveryId, result: { code: 'read', show: {} } })
  expect(await reading).toMatchObject({ code: 'read' })
})
 
it('binds a persisted legacy registration that still carries showVersion without surfacing a version', async () => {
  const now = 0
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const target = { registrationId: 'legacy', sessionId: 'legacy-session', showId: 'show' }
  const values = new Map<string, unknown>([['account', {
    rendezvous: { registrations: [{ ...target, showVersion: 1, lastSeenAt: now }], slot: null },
  }]])
  const storage: ConstructorParameters<typeof AgentAccount>[0]['storage'] = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)) },
    async delete(key: string) { return values.delete(key) },
    async setAlarm() {}, async deleteAlarm() {}, async transaction(callback) { return callback(storage) },
  }
  const owner = new AgentAccount({ storage })
  const send = async (body: object) => (await owner.fetch(new Request('https://internal', { method: 'POST', body: JSON.stringify(body) }))).json()
  const agent = { agentKind: 'external', agentId: 'grant', agentName: 'Client', callId: 'call', bindingId: 'binding' }
  await send({ type: 'arm', ...target })
  expect(await send({ type: 'claim', ...agent })).toMatchObject({ code: 'bound' })
  const resolved = await send({ type: 'resolve-external', agentId: 'grant' }) as Record<string, unknown>
  expect(resolved).toMatchObject({ code: 'bound' })
  expect(resolved.binding).not.toHaveProperty('showVersion')
})
