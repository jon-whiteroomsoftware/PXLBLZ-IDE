import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createSessionToken } from '../../cloudflare/auth'

// Miniflare 5 alpha's ReplaceWorkersTypes maps this namespace to Request under
// the app's DOM types. Keep the consumed runtime interface explicit here.
interface RuntimeNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(url: string, init: RequestInit): Promise<Response> }
}
let runtime: Miniflare
let cookie: string
beforeAll(async () => {
  const bundle = await build({ entryPoints: ['src/worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-06-30',
    bindings: { SESSION_SECRET: 'test-secret', AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'account-a,account-b,account-c' },
    d1Databases: ['PXLBLZ_DB'], durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true } },
  }))
  const db = await runtime.getD1Database('PXLBLZ_DB')
  await db.exec("CREATE TABLE personal_shows (user_id TEXT, id TEXT)")
  await db.exec("INSERT INTO personal_shows VALUES ('account-a', 'show-a'), ('account-b', 'show-b'), ('account-c', 'show-c')")
  cookie = `pxlblz_session=${await createSessionToken({ userId: 'account-a', primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'test-secret')}`
}, 30_000)
afterAll(async () => { await runtime?.dispose() })
async function channel(body: unknown, authenticated = true) {
  return runtime.dispatchFetch('https://app.test/api/agent/channel?agent=1', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.test', ...(authenticated ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
}
it('refuses signed-out access and registers an owned Show through the actual Worker and Durable Object', async () => {
  const body = { type: 'register', sessionId: 'session-a', showId: 'show-a' }
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

async function sessionCookie(userId: string) {
  return `pxlblz_session=${await createSessionToken({ userId, primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'test-secret')}`
}
async function requestAs(userId: string, body: unknown, query = '?agent=1', origin = 'https://app.test') {
  return runtime.dispatchFetch(`https://app.test/api/agent/channel${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: await sessionCookie(userId) }, body: JSON.stringify(body) })
}
it('rejects absent/duplicate opt-in, hostile origin, unlisted accounts and wrong-owner Shows before disclosure', async () => {
  const body = { type: 'register', sessionId: 'refused-session', showId: 'show-a' }
  for (const query of ['', '?agent=0', '?agent=1&agent=1']) {
    expect(await (await requestAs('account-a', body, query)).json()).toEqual({ code: 'opt_in_required' })
  }
  expect(await (await requestAs('account-a', body, '?agent=1', 'https://hostile.test')).json()).toEqual({ code: 'invalid_origin' })
  expect(await (await requestAs('unlisted', body)).json()).toEqual({ code: 'not_allowed' })
  expect(await (await requestAs('account-b', body)).json()).toEqual({ code: 'show_unavailable' })
})
it('rejects cookie-backed external claims and forged actor/account fields', async () => {
  for (const body of [
    { type: 'claim', agentId: 'forged', agentName: 'forged', showId: 'show-a', sessionId: 'forged' },
    { type: 'register', showId: 'show-a', sessionId: 'forged', accountId: 'account-b' },
    { type: 'register', showId: 'show-a', sessionId: 'forged', role: 'agent' },
    { type: 'register', showId: 'show-a', sessionId: 'forged', registrationId: 'chosen' },
  ]) expect(await (await requestAs('account-a', body)).json()).toEqual({ code: 'invalid_request' })
})
it('serializes simultaneous external claims and competing Answers on the actual Durable Object', async () => {
  const first = await (await requestAs('account-b', { type: 'register', showId: 'show-b', sessionId: 'b-one' })).json() as { registrationId: string }
  const second = await (await requestAs('account-b', { type: 'register', showId: 'show-b', sessionId: 'b-two' })).json() as { registrationId: string }
  const namespace = await runtime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as RuntimeNamespace
  const stub = namespace.get(namespace.idFromName('account-b'))
  const claims = await Promise.all(['one', 'two'].map(async (id) => (await stub.fetch('https://internal/claim', { method: 'POST', body: JSON.stringify({ type: 'claim', agentKind: 'external', agentId: id, agentName: id, callId: `call-${id}`, bindingId: `binding-${id}` }) })).json() as Promise<{ code: string }>))
  expect(claims.map((result) => result.code).sort()).toEqual(['occupied', 'pending'])
  const poll = await (await requestAs('account-b', { type: 'poll', showId: 'show-b', sessionId: 'b-one', registrationId: first.registrationId })).json() as { connection: { callId: string } }
  const answers = await Promise.all([[first, 'b-one'], [second, 'b-two']].map(async ([registration, sessionId]) => {
    const response = await requestAs('account-b', { type: 'answer', showId: 'show-b', sessionId, registrationId: (registration as { registrationId: string }).registrationId, callId: poll.connection.callId })
    return response.json() as Promise<{ code: string; connection: { kind: string; bindingId?: string } }>
  }))
  expect(answers.map((answer) => answer.code).sort()).toEqual(['bound', 'occupied'])
  expect(answers.find((answer) => answer.code === 'occupied')?.connection).not.toHaveProperty('bindingId')
  const loser = answers[0].code === 'occupied' ? [first, 'b-one'] : [second, 'b-two']
  const winner = answers.find((answer) => answer.code === 'bound')!
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
  const responses = await Promise.all(Array.from({ length: 241 }, () => stub.fetch('https://internal/window', { method: 'POST', body: JSON.stringify({ type: 'poll', registrationId: 'old', sessionId: 'old', showId: 'old' }) })))
  expect(responses.filter((response) => response.status === 429)).toHaveLength(1)
  expect(responses.filter((response) => response.status === 409)).toHaveLength(240)
  expect(await responses.find((response) => response.status === 429)!.json()).toEqual({ code: 'throttled' })
})
it('can retire its own window after URL opt-out or Show deletion', async () => {
  const registration = await (await requestAs('account-a', { type: 'register', showId: 'show-a', sessionId: 'leaving' })).json() as { registrationId: string }
  const db = await runtime.getD1Database('PXLBLZ_DB')
  await db.prepare('DELETE FROM personal_shows WHERE user_id = ? AND id = ?').bind('account-a', 'show-a').run()
  const ended = await requestAs('account-a', { type: 'leave', showId: 'show-a', sessionId: 'leaving', registrationId: registration.registrationId }, '')
  expect(await ended.json()).toEqual({ code: 'retired' })
  expect(ended.status).toBe(200)
})
it('allows only one simultaneous builtin or external claim through the shared account owner', async () => {
  const data = await (await requestAs('account-c', { type: 'register', sessionId: 'c-one', showId: 'show-c' })).json() as { registrationId: string }
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
  const bundle = await build({ entryPoints: ['src/worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  const disabled = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-06-30', bindings: { SESSION_SECRET: 'test-secret' }, durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true } } }))
  try {
    const response = await disabled.dispatchFetch('https://app.test/api/agent/channel?agent=1', { method: 'POST', headers: { Origin: 'https://app.test', Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'register', sessionId: 'disabled', showId: 'show-a' }) })
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
  const registration = await (await requestAs('account-c', { type: 'register', sessionId: 'scope-session', showId: 'show-c' })).json() as { registrationId: string }
  const response = await requestAs('account-b', { type: 'poll', sessionId: 'scope-session', showId: 'show-b', registrationId: registration.registrationId })
  expect(await response.json()).toEqual({ code: 'retired' })
})
it('expires an incoming call on the real runtime clock without an automatic new claim', async () => {
  const namespace = await runtime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as RuntimeNamespace
  const stub = namespace.get(namespace.idFromName('expiry-account'))
  const identity = { agentKind: 'external', agentId: 'expiry-agent', agentName: 'Expiry Agent', callId: 'expiry-call', bindingId: 'expiry-binding' }
  const pending = await stub.fetch('https://internal/claim', { method: 'POST', body: JSON.stringify({ type: 'claim', ...identity }) })
  expect(await pending.json()).toEqual({ code: 'pending' })
  await new Promise((resolve) => setTimeout(resolve, 30_100))
  const expired = await stub.fetch('https://internal/inspect', { method: 'POST', body: JSON.stringify({ type: 'inspect', ...identity }) })
  expect(await expired.json()).toEqual({ code: 'no_live_editor' })
}, 40_000)

it.each([
  { service: '0', allowlist: 'account-a', refusal: 'service_disabled' },
  { service: '1', allowlist: 'another-account', refusal: 'not_allowed' },
])('allows only local cleanup with service=$service and allowlist=$allowlist', async ({ service, allowlist, refusal }) => {
  const bundle = await build({ entryPoints: ['src/worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  const suspended = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-06-30', bindings: { SESSION_SECRET: 'test-secret', AGENT_SERVICE_ENABLED: service, AGENT_ACCOUNT_ALLOWLIST: allowlist }, durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true } } }))
  try {
    // Seed the previously valid binding through the private owner. Its current
    // deployment policy now disables admission; persisted identity still exists.
    const namespace = await suspended.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as RuntimeNamespace
    const stub = namespace.get(namespace.idFromName('account-a'))
    const target = { registrationId: 'suspended-registration', sessionId: 'suspended-session', showId: 'suspended-show' }
    const other = { registrationId: 'other-registration', sessionId: 'other-session', showId: 'other-show' }
    const identity = { agentKind: 'builtin', agentId: 'suspended-agent', agentName: 'Suspended', callId: 'suspended-call', bindingId: 'suspended-binding' }
    for (const window of [target, other]) await stub.fetch('https://internal/window', { method: 'POST', body: JSON.stringify({ type: 'register', ...window }) })
    await stub.fetch('https://internal/claim', { method: 'POST', body: JSON.stringify({ type: 'claim', ...identity, window: target }) })
    const request = (body: unknown, origin = 'https://app.test') => suspended.dispatchFetch('https://app.test/api/agent/channel', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    expect(await (await request({ type: 'heartbeat', ...target })).json()).toEqual({ code: refusal })
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
