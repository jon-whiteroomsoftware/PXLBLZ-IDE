import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createSessionToken } from '../../cloudflare/auth'
import { STOCK_SHOW_IDS } from '../../pixelblaze/stock/showIds'

// Miniflare 5 alpha's ReplaceWorkersTypes maps this namespace to Request under
// the app's DOM types. Keep the consumed runtime interface explicit here.
interface RuntimeNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(url: string, init: RequestInit): Promise<Response> }
}
let runtime: Miniflare
let workerScript: string
let cookie: string
beforeAll(async () => {
  const bundle = await build({ entryPoints: ['src/worker/index.ts'], external: ['cloudflare:workers'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  workerScript = bundle.outputFiles[0].text
  runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: workerScript, compatibilityDate: '2026-06-30',
    bindings: { SESSION_SECRET: 'test-secret', AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'account-a,account-b,account-c,account-move' },
    d1Databases: ['PXLBLZ_DB'], durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true } },
  }))
  const db = await runtime.getD1Database('PXLBLZ_DB')
  await db.exec("CREATE TABLE personal_shows (user_id TEXT, id TEXT, name TEXT)")
  await db.exec("INSERT INTO personal_shows VALUES ('account-a', 'show-a', 'Show A'), ('account-b', 'show-b', 'Show B'), ('account-c', 'show-c', 'Show C'), ('unlisted', 'show-u', 'Show U'), ('account-move', 'move-a', 'First Move Show'), ('account-move', 'move-b', 'Second Move Show')")
  cookie = `pxlblz_session=${await createSessionToken({ userId: 'account-a', primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'test-secret')}`
}, 30_000)
afterAll(async () => { await runtime?.dispose() })
async function channel(body: unknown, authenticated = true) {
  return runtime.dispatchFetch('https://app.test/api/agent/channel?agent=1', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.test', ...(authenticated ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
}
it('refuses signed-out access and registers an owned Show through the actual Worker and Durable Object', async () => {
  const body = { type: 'register', sessionId: 'session-a', showId: 'show-a', showVersion: 2 }
  expect((await channel(body, false)).status).toBe(401)
  const registered = await channel(body)
  expect(registered.status).toBe(200)
  const data = await registered.json() as { code: string; registrationId: string }
  expect(data.code).toBe('registered')
  expect(data.registrationId).toEqual(expect.any(String))
  const beforeArm = Date.now()
  const armed = await channel({ type: 'arm', sessionId: 'session-a', showId: 'show-a', registrationId: data.registrationId })
  const armResult = await armed.json() as { code: string; connection: { kind: string; expiresAt: number } }
  expect(armResult).toMatchObject({ code: 'armed', connection: { kind: 'armed' } })
  expect(armResult.connection.expiresAt).toBeGreaterThanOrEqual(beforeArm + 120_000)
  expect(armResult.connection.expiresAt).toBeLessThanOrEqual(Date.now() + 120_000)
})
 
it('refuses a register that does not declare showVersion 2 as an invalid request', async () => {
  expect(await (await channel({ type: 'register', sessionId: 'versioned', showId: 'show-a' })).json()).toEqual({ code: 'invalid_request' })
  expect(await (await channel({ type: 'register', sessionId: 'versioned', showId: 'show-a', showVersion: 1 })).json()).toEqual({ code: 'invalid_request' })
  expect(await (await channel({ type: 'register', sessionId: 'versioned', showId: 'show-a', showVersion: 2 })).json()).toMatchObject({ code: 'registered' })
})

async function sessionCookie(userId: string) {
  return `pxlblz_session=${await createSessionToken({ userId, primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'test-secret')}`
}
async function requestAs(userId: string, body: unknown, query = '?agent=1', origin = 'https://app.test') {
  return runtime.dispatchFetch(`https://app.test/api/agent/channel${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: await sessionCookie(userId) }, body: JSON.stringify(body) })
}
it('accepts ordinary and legacy URLs for non-allowlisted accounts while preserving origin and Show ownership', async () => {
  const body = { type: 'register', sessionId: 'refused-session', showId: 'show-a', showVersion: 2 }
  for (const query of ['', '?agent=0', '?agent=1&agent=1']) {
    expect(await (await requestAs('account-a', { ...body, sessionId: `session-${query}` }, query)).json()).toMatchObject({ code: 'registered' })
  }
  expect(await (await requestAs('account-a', body, '?agent=1', 'https://hostile.test')).json()).toEqual({ code: 'invalid_origin' })
  expect(await (await requestAs('unlisted', { ...body, showId: 'show-u' })).json()).toMatchObject({ code: 'registered' })
  expect(await (await requestAs('account-b', body)).json()).toEqual({ code: 'show_unavailable' })
})
it('rejects cookie-backed external claims and forged actor/account fields', async () => {
  for (const body of [
    { type: 'claim', agentId: 'forged', agentName: 'forged', showId: 'show-a', sessionId: 'forged' },
    { type: 'register', showId: 'show-a', sessionId: 'forged', showVersion: 2, accountId: 'account-b' },
    { type: 'register', showId: 'show-a', sessionId: 'forged', showVersion: 2, role: 'agent' },
    { type: 'register', showId: 'show-a', sessionId: 'forged', showVersion: 2, registrationId: 'chosen' },
  ]) expect(await (await requestAs('account-a', body)).json()).toEqual({ code: 'invalid_request' })
})
it('serializes simultaneous external claims and competing Answers on the actual Durable Object', async () => {
  const first = await (await requestAs('account-b', { type: 'register', showId: 'show-b', sessionId: 'b-one', showVersion: 2 })).json() as { registrationId: string }
  const second = await (await requestAs('account-b', { type: 'register', showId: 'show-b', sessionId: 'b-two', showVersion: 2 })).json() as { registrationId: string }
  const namespace = await runtime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as RuntimeNamespace
  const stub = namespace.get(namespace.idFromName('account-b'))
  const claims = await Promise.all(['one', 'two'].map(async (id) => (await stub.fetch('https://internal/claim', { method: 'POST', body: JSON.stringify({ type: 'claim', agentKind: 'external', agentId: id, agentName: id, callId: `call-${id}`, bindingId: `binding-${id}` }) })).json() as Promise<{ code: string }>))
  expect(claims.map((result) => result.code).sort()).toEqual(['occupied', 'pending'])
  const poll = await (await requestAs('account-b', { type: 'poll', showId: 'show-b', sessionId: 'b-one', registrationId: first.registrationId })).json() as { connection: { callId: string } }
  const answers = await Promise.all([[first, 'b-one'], [second, 'b-two']].map(async ([registration, sessionId]) => {
    const response = await requestAs('account-b', { type: 'answer', showId: 'show-b', sessionId, registrationId: (registration as { registrationId: string }).registrationId, callId: poll.connection.callId })
    return response.json() as Promise<{ code: string; connection: Record<string, unknown> & { kind: string; bindingId?: string } }>
  }))
  expect(answers.map((answer) => answer.code).sort()).toEqual(['bound', 'occupied'])
  const loser = answers[0].code === 'occupied' ? [first, 'b-one'] : [second, 'b-two']
  const winner = answers.find((answer) => answer.code === 'bound')!
  const occupied = answers.find((answer) => answer.code === 'occupied')!.connection
  expect(occupied).toMatchObject({ kind: 'external-bound', relation: 'same-show', bindingId: winner.connection.bindingId })
  for (const privateField of ['agentId', 'callId', 'registrationId', 'sessionId']) expect(occupied).not.toHaveProperty(privateField)
  const denied = await requestAs('account-b', { type: 'disconnect', showId: 'show-b', sessionId: loser[1], registrationId: (loser[0] as { registrationId: string }).registrationId, bindingId: winner.connection.bindingId })
  expect(await denied.json()).toEqual({ code: 'not_bound_here' })
})
it('rejects an old registration under another session without revealing the occupied slot', async () => {
  const denied = await requestAs('account-a', { type: 'poll', showId: 'show-a', sessionId: 'different', registrationId: 'invented' })
  expect(denied.status).toBe(409)
  expect(await denied.json()).toEqual({ code: 'retired' })
})

it('bounds account channel traffic atomically', async () => {
  const namespace = await runtime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as RuntimeNamespace
  const stub = namespace.get(namespace.idFromName('rate-account'))
  const responses = await Promise.all(Array.from({ length: 241 }, () => stub.fetch('https://internal/window', { method: 'POST', body: JSON.stringify({ type: 'arm', registrationId: 'old', sessionId: 'old', showId: 'old' }) })))
  expect(responses.filter((response) => response.status === 429)).toHaveLength(1)
  expect(responses.filter((response) => response.status === 409)).toHaveLength(240)
  expect(await responses.find((response) => response.status === 429)!.json()).toMatchObject({ code: 'throttled', retry_after_ms: expect.any(Number) })
})
it('keeps browser heartbeat, receive, delivery, reply and cleanup healthy after the agent budget is exhausted', async () => {
  const namespace = await runtime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as RuntimeNamespace
  const stub = namespace.get(namespace.idFromName('mixed-rate-account'))
  const send = (body: object) => stub.fetch('https://internal/account', { method: 'POST', body: JSON.stringify(body) })
  const json = async (body: object) => (await send(body)).json() as Promise<Record<string, unknown>>
  const own = { registrationId: 'mixed-registration', sessionId: 'mixed-session', showId: 'mixed-show' }
  await json({ type: 'register', ...own })
  await json({ type: 'arm', ...own })
  expect(await json({ type: 'external-tool-connect', agentId: 'grant', agentName: 'Client', nextCallId: 'call', nextBindingId: 'binding' })).toMatchObject({ code: 'bound' })

  const reading = json({ type: 'external-tool-query', agentId: 'grant', expectedBindingId: 'binding', query: { kind: 'read_show' } })
  const readBatch = await json({ type: 'receive', ...own }) as { deliveries: Array<{ operationId: string; deliveryId: string; payload: unknown }> }
  expect(readBatch.deliveries).toEqual([expect.objectContaining({ payload: { kind: 'read_show' } })])
  const read = readBatch.deliveries[0]
  expect(await json({ type: 'reply', ...own, bindingId: 'binding', operationId: read.operationId, deliveryId: read.deliveryId, result: { code: 'read', show: { id: own.showId } } })).toEqual({ code: 'received' })
  expect(await reading).toMatchObject({ code: 'read' })

  const dispatch = json({
    type: 'external-tool-dispatch', agentId: 'grant', expectedBindingId: 'binding',
    delivery: { idempotencyKey: 'mixed-begin', payload: { kind: 'begin_edit', intent: 'Verify exhausted-budget liveness' } },
  })
  for (let i = 0; i < 237; i++) expect(await json({ type: 'external-tool-resolve', agentId: 'grant' })).toMatchObject({ code: 'bound' })
  const throttled = await send({ type: 'external-tool-resolve', agentId: 'grant' })
  expect(throttled.status).toBe(429)
  expect(await throttled.json()).toMatchObject({ code: 'throttled', retry_after_ms: expect.any(Number) })

  expect(await json({ type: 'heartbeat', ...own })).toMatchObject({ code: 'status', contact: 'live' })
  const received = await json({ type: 'receive', ...own }) as { deliveries: Array<{ operationId: string; deliveryId: string; sequence: number; payload: unknown }> }
  expect(received.deliveries).toEqual([expect.objectContaining({ sequence: 0, payload: { kind: 'begin_edit', intent: 'Verify exhausted-budget liveness' } })])
  const begin = received.deliveries[0]
  expect(await json({ type: 'reply', ...own, bindingId: 'binding', operationId: begin.operationId, deliveryId: begin.deliveryId, result: { code: 'begun', operationId: begin.operationId } })).toEqual({ code: 'received' })
  expect(await dispatch).toEqual({ code: 'begun', operationId: begin.operationId })
  expect(await json({ type: 'disconnect', ...own, bindingId: 'binding' })).toEqual({ code: 'disconnected' })
  expect(await json({ type: 'leave', ...own })).toEqual({ code: 'retired' })
})
it('can retire its own window after capability loss or Show deletion', async () => {
  const registration = await (await requestAs('account-a', { type: 'register', showId: 'show-a', sessionId: 'leaving', showVersion: 2 })).json() as { registrationId: string }
  const db = await runtime.getD1Database('PXLBLZ_DB')
  await db.prepare('DELETE FROM personal_shows WHERE user_id = ? AND id = ?').bind('account-a', 'show-a').run()
  const ended = await requestAs('account-a', { type: 'leave', showId: 'show-a', sessionId: 'leaving', registrationId: registration.registrationId }, '')
  expect(await ended.json()).toEqual({ code: 'retired' })
  expect(ended.status).toBe(200)
})
it('allows only one simultaneous builtin or external claim through the shared account owner', async () => {
  const data = await (await requestAs('account-c', { type: 'register', sessionId: 'c-one', showId: 'show-c', showVersion: 2 })).json() as { registrationId: string }
  const namespace = await runtime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as RuntimeNamespace
  const stub = namespace.get(namespace.idFromName('account-c'))
  const attempts = [
    { type: 'claim', agentKind: 'builtin', agentId: 'builtin', agentName: 'Built-in', callId: 'builtin-call', bindingId: 'builtin-binding', window: { registrationId: data.registrationId, sessionId: 'c-one', showId: 'show-c' } },
    { type: 'claim', agentKind: 'external', agentId: 'external', agentName: 'External', callId: 'external-call', bindingId: 'external-binding' },
  ]
  const results = await Promise.all(attempts.map(async (attempt) => (await stub.fetch('https://internal/claim', { method: 'POST', body: JSON.stringify(attempt) })).json() as Promise<{ code: string; binding?: { sessionId: string; showId: string } }>))
  if (results[0].code === 'bound') expect(results[0].binding).toMatchObject({ sessionId: 'c-one', showId: 'show-c' })
  expect(results.filter((result) => result.code === 'occupied')).toHaveLength(1)
  expect(results.filter((result) => result.code === 'bound' || result.code === 'pending')).toHaveLength(1)
})
it('refuses service-disabled access through the real Worker before target work', async () => {
  const bundle = await build({ entryPoints: ['src/worker/index.ts'], external: ['cloudflare:workers'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  const disabled = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-06-30', bindings: { SESSION_SECRET: 'test-secret' }, durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true } } }))
  try {
    const response = await disabled.dispatchFetch('https://app.test/api/agent/channel?agent=1', { method: 'POST', headers: { Origin: 'https://app.test', Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'register', sessionId: 'disabled', showId: 'show-a', showVersion: 2 }) })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ code: 'service_disabled' })
  } finally { await disabled.dispose() }
})
it('rejects malformed session cookies as unauthenticated', async () => {
  const response = await runtime.dispatchFetch('https://app.test/api/agent/channel?agent=1', { method: 'POST', headers: { Origin: 'https://app.test', Cookie: 'pxlblz_session=%ZZ', 'Content-Type': 'application/json' }, body: '{}' })
  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ code: 'unauthorized' })
})
it('cannot reuse a registration capability in another authenticated account', async () => {
  const registration = await (await requestAs('account-c', { type: 'register', sessionId: 'scope-session', showId: 'show-c', showVersion: 2 })).json() as { registrationId: string }
  const response = await requestAs('account-b', { type: 'poll', sessionId: 'scope-session', showId: 'show-b', registrationId: registration.registrationId })
  expect(await response.json()).toEqual({ code: 'retired' })
})
it('expires an incoming call on the real runtime clock at the configured lifetime without an automatic new claim', async () => {
  const expiryRuntime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: workerScript, compatibilityDate: '2026-06-30',
    bindings: { SESSION_SECRET: 'test-secret', AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'account-a,account-b,account-c,account-move', AGENT_PENDING_CALL_TTL_MS: '1000' },
    d1Databases: ['PXLBLZ_DB'], durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true } },
  }))
  try {
    const namespace = await expiryRuntime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as RuntimeNamespace
    const stub = namespace.get(namespace.idFromName('expiry-account'))
    const identity = { agentKind: 'external', agentId: 'expiry-agent', agentName: 'Expiry Agent', callId: 'expiry-call', bindingId: 'expiry-binding' }
    const send = async (type: 'claim' | 'inspect') => (await stub.fetch(`https://internal/${type}`, { method: 'POST', body: JSON.stringify({ type, ...identity }) })).json()
    expect(await send('claim')).toEqual({ code: 'pending' })
    expect(await send('inspect')).toEqual({ code: 'pending' })
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    expect(await send('inspect')).toEqual({ code: 'no_live_editor' })
  } finally { await expiryRuntime.dispose() }
}, 15_000)

it.each([
  { service: '0', allowlist: 'account-a', refusal: 'service_disabled' },
  { service: '1', allowlist: 'another-account', refusal: 'status' },
])('allows only local cleanup with service=$service and allowlist=$allowlist', async ({ service, allowlist, refusal }) => {
  const bundle = await build({ entryPoints: ['src/worker/index.ts'], external: ['cloudflare:workers'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  const suspended = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-06-30', bindings: { SESSION_SECRET: 'test-secret', AGENT_SERVICE_ENABLED: service, AGENT_ACCOUNT_ALLOWLIST: allowlist }, durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true } } }))
  try {
    // Seed the previously valid binding through the private owner. Its current
    // deployment policy now disables admission; persisted identity still exists.
    const namespace = await suspended.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as RuntimeNamespace
    const stub = namespace.get(namespace.idFromName('account-a'))
    const target = { registrationId: 'suspended-registration', sessionId: 'suspended-session', showId: STOCK_SHOW_IDS[0] }
    const other = { registrationId: 'other-registration', sessionId: 'other-session', showId: STOCK_SHOW_IDS[1] }
    const identity = { agentKind: 'builtin', agentId: 'suspended-agent', agentName: 'Suspended', callId: 'suspended-call', bindingId: 'suspended-binding' }
    for (const window of [target, other]) await stub.fetch('https://internal/window', { method: 'POST', body: JSON.stringify({ type: 'register', ...window }) })
    await stub.fetch('https://internal/claim', { method: 'POST', body: JSON.stringify({ type: 'claim', ...identity, window: target }) })
    const request = (body: unknown, origin = 'https://app.test') => suspended.dispatchFetch('https://app.test/api/agent/channel', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    expect(await (await request({ type: 'heartbeat', ...target })).json()).toMatchObject({ code: refusal })
    expect(await (await request({ type: 'disconnect', ...target, bindingId: identity.bindingId }, 'https://hostile.test')).json()).toEqual({ code: 'invalid_origin' })
    expect(await (await request({ type: 'disconnect', ...other, bindingId: identity.bindingId })).json()).toEqual({ code: 'not_bound_here' })
    expect(await (await request({ type: 'disconnect', ...target, bindingId: identity.bindingId })).json()).toEqual({ code: 'disconnected' })
    expect(await (await stub.fetch('https://internal/inspect', { method: 'POST', body: JSON.stringify({ type: 'inspect', ...identity }) })).json()).toEqual({ code: 'no_live_editor' })
    expect(await (await request({ type: 'leave', ...target })).json()).toEqual({ code: 'retired' })
    expect(await (await stub.fetch('https://internal/window', { method: 'POST', body: JSON.stringify({ type: 'poll', ...target }) })).json()).toEqual({ code: 'retired' })
  } finally { await suspended.dispose() }
})
it('requires JSON content type even for local cleanup', async () => {
  const response = await runtime.dispatchFetch('https://app.test/api/agent/channel', { method: 'POST', headers: { Origin: 'https://app.test', Cookie: cookie, 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'leave', registrationId: 'old', sessionId: 'old', showId: 'old' }) })
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ code: 'invalid_request' })
})

it('resolves builtin identity privately for the original window, never a public role input', async () => {
  const namespace = await runtime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as RuntimeNamespace
  const stub = namespace.get(namespace.idFromName('resolver-only'))
  const send = (body: unknown) => stub.fetch('https://agent-account.internal/connection', { method: 'POST', body: JSON.stringify(body) })
  const window = { registrationId: 'resolver-window', sessionId: 'resolver-session', showId: 'resolver-show' }
  const identity = { agentKind: 'builtin', agentId: 'builtin-service', agentName: 'Built-in', callId: 'resolver-call', bindingId: 'resolver-binding' }
  await send({ type: 'register', ...window })
  await send({ type: 'claim', ...identity, window })
  expect(await (await send({ type: 'resolve-builtin', ...window })).json()).toMatchObject({ code: 'bound', binding: identity })
  const wrong = await (await send({ type: 'resolve-builtin', ...window, sessionId: 'other' })).json()
  expect(wrong).toEqual({ code: 'retired' })
  const otherAccount = namespace.get(namespace.idFromName('resolver-other'))
  expect(await (await otherAccount.fetch('https://agent-account.internal/connection', { method: 'POST', body: JSON.stringify({ type: 'resolve-builtin', ...window }) })).json()).toEqual({ code: 'retired' })
  expect((await channel({ type: 'resolve-builtin', ...window })).status).toBe(400)
})

it('projects safe external binding availability without transferring ownership or capabilities', async () => {
  const first = await (await requestAs('account-move', { type: 'register', sessionId: 'move-first', showId: 'move-a', showVersion: 2 })).json() as { registrationId: string }
  const same = await (await requestAs('account-move', { type: 'register', sessionId: 'move-same', showId: 'move-a', showVersion: 2 })).json() as { registrationId: string }
  const other = await (await requestAs('account-move', { type: 'register', sessionId: 'move-other', showId: 'move-b', showVersion: 2 })).json() as { registrationId: string }
  const firstWindow = { registrationId: first.registrationId, sessionId: 'move-first', showId: 'move-a' }
  const namespace = await runtime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as RuntimeNamespace
  const stub = namespace.get(namespace.idFromName('account-move'))
  await requestAs('account-move', { type: 'arm', ...firstWindow })
  await stub.fetch('https://internal/claim', { method: 'POST', body: JSON.stringify({ type: 'claim', agentKind: 'external', agentId: 'private-grant', agentName: 'Test Agent', callId: 'private-call', bindingId: 'opaque-binding' }) })

  const sameView = await (await requestAs('account-move', { type: 'poll', registrationId: same.registrationId, sessionId: 'move-same', showId: 'move-a' })).json()
  expect(sameView).toMatchObject({ connection: { kind: 'external-bound', agentName: 'Test Agent', showId: 'move-a', showName: 'First Move Show', relation: 'same-show', bindingId: 'opaque-binding' } })
  const otherView = await (await requestAs('account-move', { type: 'poll', registrationId: other.registrationId, sessionId: 'move-other', showId: 'move-b' })).json() as { connection: Record<string, unknown> }
  expect(otherView).toMatchObject({ connection: { kind: 'external-bound', agentName: 'Test Agent', showId: 'move-a', showName: 'First Move Show', relation: 'other-show', bindingId: 'opaque-binding' } })
  expect(otherView.connection).not.toHaveProperty('agentId')
  expect(otherView.connection).not.toHaveProperty('callId')
  expect(otherView.connection).not.toHaveProperty('registrationId')
  expect(otherView.connection).not.toHaveProperty('sessionId')
})
