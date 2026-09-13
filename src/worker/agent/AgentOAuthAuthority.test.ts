import { afterEach, expect, it, vi } from 'vitest'
import { AgentOAuthAuthority } from './AgentOAuthAuthority'
import { providerSubject } from './agentOAuthConfig'

// Only the authority's scheduling/storage lifecycle is under test here.
// Actual provider exchanges and persistence remain covered by workerd suites.
const providerProbe = vi.hoisted(() => ({ transactionDepth: 0, lookupDepths: [] as number[], revoked: [] as Array<[string, string]>, client: null as Record<string, unknown> | null }))
vi.mock('@cloudflare/workers-oauth-provider', () => ({ OAuthProvider: class {
  constructor(private readonly options: { defaultHandler: { fetch(request: Request, env: unknown): Promise<Response> | Response }; clientRegistrationCallback?: (input: { clientMetadata: Record<string, unknown> }) => Promise<{ status?: number } | void> }) {}
  async fetch(request: Request, env: { OAUTH_KV: { get(key: string, options: { type: 'json' }): Promise<unknown> } }) {
    const url = new URL(request.url)
    if (url.pathname === '/internal/cimd-client') return this.options.defaultHandler.fetch(request, { ...env, OAUTH_PROVIDER: { lookupClient: async () => { providerProbe.lookupDepths.push(providerProbe.transactionDepth); return providerProbe.client } } })
    if (url.pathname === '/internal/grant') {
      const grantId = request.headers.get('X-Agent-Grant') ?? ''
      return this.options.defaultHandler.fetch(request, { ...env, OAUTH_PROVIDER: {
        listUserGrants: async () => ({ items: [{ id: grantId, clientId: 'https://client.test/oauth/client.json', scope: ['pxlblz.show.connect'] }] }),
        revokeGrant: async (id: string, userId: string) => { providerProbe.revoked.push([id, userId]) },
        lookupClient: async () => null,
      } })
    }
    if (url.pathname === '/oauth/authorize' && request.headers.has('X-Agent-Continuation')) return this.options.defaultHandler.fetch(request, { ...env, OAUTH_PROVIDER: { lookupClient: async () => ({ clientId: 'client', clientName: 'Client', redirectUris: ['https://client.test/callback'] }) } })
    if (url.pathname === '/oauth/register') {
      const refusal = await this.options.clientRegistrationCallback?.({ clientMetadata: { client_name: 'Client' } })
      return new Response(null, { status: refusal?.status ?? 201 })
    }
    const clientId = url.searchParams.get('client_id')
    if (url.pathname === '/oauth/authorize' && clientId?.startsWith('https://')) return Response.json(await env.OAUTH_KV.get(`client:${clientId}`, { type: 'json' }))
    return new Response('provider')
  }
}, OAuthError: Error }))
afterEach(() => { vi.restoreAllMocks(); providerProbe.transactionDepth = 0; providerProbe.lookupDepths = []; providerProbe.revoked = []; providerProbe.client = null })

function harness(initialTime = 1000) {
  let now = initialTime
  let alarm: number | null = null
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const values = new Map<string, unknown>()
  const scheduled: number[] = []
  const scans: Array<{ prefix: string; startAfter?: string; limit: number }> = []
  const storage: ConstructorParameters<typeof AgentOAuthAuthority>[0]['storage'] = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put<T>(key: string, value: T) { values.set(key, structuredClone(value)) },
    async delete(key: string) { return values.delete(key) },
    async list<T>(options: { prefix: string; startAfter?: string; limit: number }) {
      scans.push({ ...options })
      return new Map([...values.entries()].filter(([key]) => key.startsWith(options.prefix) && (!options.startAfter || key > options.startAfter)).sort(([a], [b]) => a.localeCompare(b)).slice(0, options.limit).map(([key, value]) => [key, structuredClone(value) as T]))
    },
    async getAlarm() { return alarm },
    async setAlarm(time: number) { alarm = time; scheduled.push(time) },
    async deleteAlarm() { alarm = null },
    async transaction(callback) {
      providerProbe.transactionDepth++
      try { return await callback(storage) } finally { providerProbe.transactionDepth-- }
    },
  }
  const owner = new AgentOAuthAuthority({ storage }, { AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'account', AGENT_OAUTH_ORIGIN: 'https://app.test', AGENT_OAUTH_CLIENTS: JSON.stringify([{ clientId: 'client', clientName: 'Client', redirectUris: ['https://client.test/callback'] }]) })
  return { owner, storage, values, scans, scheduled, time: (value: number) => { now = value }, alarm: () => alarm }
}

it('resolves CIMD before serialized mutation and injects it only for the request', async () => {
  const { owner, values } = harness()
  const clientId = 'https://client.test/oauth/client.json'
  providerProbe.client = { clientId, clientName: 'Remote client', redirectUris: ['https://client.test/callback'], tokenEndpointAuthMethod: 'none', grantTypes: ['authorization_code', 'refresh_token'], responseTypes: ['code'] }
  const response = await owner.fetch(new Request(`https://app.test/oauth/authorize?client_id=${encodeURIComponent(clientId)}`))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ clientId, clientName: 'Remote client' })
  expect(providerProbe.lookupDepths).toEqual([0])
  expect([...values.keys()].filter(key => key.includes(clientId))).toEqual([])
})

it('refuses failed CIMD resolution before rate or provider storage mutation', async () => {
  const { owner, values } = harness()
  const response = await owner.fetch(new Request('https://app.test/oauth/authorize?client_id=https%3A%2F%2Fclient.test%2Foauth%2Fclient.json'))
  expect(response.status).toBe(400)
  expect(providerProbe.lookupDepths).toEqual([0])
  expect([...values.keys()]).toEqual([])
})

it('re-resolves current CIMD metadata before protected use and fails closed without mutating again', async () => {
  const { owner, values } = harness()
  const accountId = 'github:123'
  const grantId = 'grant-1'
  const clientId = 'https://client.test/oauth/client.json'
  const subject = providerSubject(accountId)
  values.set(`oauth:grant:${subject}:${grantId}`, { value: JSON.stringify({ clientId }) })
  providerProbe.client = { clientId, clientName: 'Remote client', redirectUris: ['https://client.test/callback'], tokenEndpointAuthMethod: 'none', grantTypes: ['authorization_code', 'refresh_token'], responseTypes: ['code'] }

  expect((await owner.fetch(new Request('https://app.test/mcp', { headers: { Authorization: `Bearer ${subject}:${grantId}:secret` } }))).status).toBe(200)
  expect(providerProbe.lookupDepths).toEqual([0])
  expect(values.get('rate')).toEqual({ start: 1000, count: 1 })

  providerProbe.client = null
  providerProbe.lookupDepths = []
  const changed = await owner.fetch(new Request('https://app.test/mcp', { headers: { Authorization: `Bearer ${subject}:${grantId}:secret` } }))
  expect(changed.status).toBe(400)
  expect(await changed.json()).toEqual({ error: 'invalid_request' })
  expect(providerProbe.lookupDepths).toEqual([0])
  expect(values.get('rate')).toEqual({ start: 1000, count: 1 })
})

it('re-resolves current CIMD metadata before token operations', async () => {
  const { owner } = harness()
  const clientId = 'https://client.test/oauth/client.json'
  const request = () => new Request('https://app.test/oauth/token', { method: 'POST', body: new URLSearchParams({ client_id: clientId }) })
  providerProbe.client = { clientId, clientName: 'Remote client', redirectUris: ['https://client.test/callback'], tokenEndpointAuthMethod: 'none', grantTypes: ['authorization_code', 'refresh_token'], responseTypes: ['code'] }
  expect((await owner.fetch(request())).status).toBe(200)
  providerProbe.client = null
  const changed = await owner.fetch(request())
  expect(changed.status).toBe(400)
  expect(await changed.json()).toEqual({ error: 'invalid_client' })
  expect(providerProbe.lookupDepths).toEqual([0, 0])
})

it('revokes an account-bound CIMD grant after its metadata document disappears', async () => {
  const { owner, values } = harness()
  const accountId = 'github:123'
  const grantId = 'grant-1'
  const subject = providerSubject(accountId)
  values.set(`oauth:grant:${subject}:${grantId}`, { value: JSON.stringify({ clientId: 'https://client.test/oauth/client.json' }) })

  const response = await owner.fetch(new Request('https://app.test/internal/grant', { method: 'POST', headers: {
    'X-Agent-Account': accountId,
    'X-Agent-Grant': grantId,
    'X-Agent-Grant-Action': 'revoke',
    'X-Agent-Revocation': '1',
  } }))

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ code: 'credentials_revoked' })
  expect(providerProbe.lookupDepths).toEqual([])
  expect(providerProbe.revoked).toEqual([[grantId, subject]])
})

it('refuses an expired continuation without creating consent state', async () => {
  const { owner, values } = harness(10_000)
  const continuation = '00000000-0000-4000-8000-000000000001'
  values.set(`oauth:continuation:${continuation}`, { value: JSON.stringify({
    request: { clientId: 'client', redirectUri: 'https://client.test/callback', responseType: 'code', codeChallengeMethod: 'S256', codeChallenge: 'a'.repeat(43), resource: 'https://app.test/mcp', scope: ['pxlblz.show.connect'], state: 'state' },
    expiresAt: 9_999,
  }) })
  const response = await owner.fetch(new Request('https://app.test/oauth/authorize', { headers: { 'X-Agent-Continuation': continuation, 'X-Agent-Account': 'github:123' } }))
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'authorization_expired' })
  expect([...values.keys()].filter(key => key.includes('consent:'))).toEqual([])
})

it('counts only live DCR records against the 1024-client admission bound', async () => {
  const { owner, values } = harness()
  for (let index = 0; index < 1024; index++) values.set(`oauth:client:${String(index).padStart(4, '0')}`, { value: '{}', expiration: 100 })
  expect((await owner.fetch(new Request('https://app.test/oauth/register', { method: 'POST' }))).status).toBe(429)
  values.set('oauth:client:0000', { value: '{}', expiration: 0 })
  expect((await owner.fetch(new Request('https://app.test/oauth/register', { method: 'POST' }))).status).toBe(201)
  expect(values.has('oauth:client:0000')).toBe(false)
})

it.each([999, 1000, 1001])('expires only due OAuth rows at %i ms and preserves live/unrelated data', async now => {
  const { owner, values, alarm } = harness(now)
  values.set('oauth:due', { value: 'due', expiration: 1 })
  values.set('oauth:future', { value: 'future', expiration: 2 })
  values.set('oauth:without-ttl', { value: 'retained' })
  values.set('unrelated', { expiration: 0 })
  await owner.alarm()
  expect(values.has('oauth:due')).toBe(now < 1000)
  expect(values.get('oauth:future')).toEqual({ value: 'future', expiration: 2 })
  expect(values.get('oauth:without-ttl')).toEqual({ value: 'retained' })
  expect(values.get('unrelated')).toEqual({ expiration: 0 })
  expect(alarm()).toBe(now + 60_000)
})

it('pages 1000 rows using a deleted-key cursor and wraps to new rows behind it', async () => {
  const { owner, values, scans } = harness()
  for (let index = 0; index < 1001; index++) values.set(`oauth:${String(index).padStart(4, '0')}`, { value: 'record', expiration: index < 1000 ? 1 : 100 })
  await owner.alarm()
  expect([...values.keys()].filter(key => key.startsWith('oauth:'))).toEqual(['oauth:1000'])
  expect(values.get('sweep')).toBe('oauth:0999')
  values.set('oauth:0000', { value: 'new expired record behind cursor', expiration: 1 })
  await owner.alarm()
  expect(scans[1]).toEqual({ prefix: 'oauth:', startAfter: 'oauth:0999', limit: 1000 })
  expect(values.has('oauth:0000')).toBe(true)
  expect(values.get('sweep')).toBe('')
  await owner.alarm()
  expect(values.has('oauth:0000')).toBe(false)
  expect(values.get('oauth:1000')).toEqual({ value: 'record', expiration: 100 })
})

it('an old alarm preserves a renewed row and retires it only at its new expiry', async () => {
  const { owner, storage, values, time } = harness()
  values.set('oauth:renewed', { value: 'old', expiration: 1 })
  await storage.put('oauth:renewed', { value: 'renewed', expiration: 61 })
  await owner.alarm()
  expect(values.get('oauth:renewed')).toEqual({ value: 'renewed', expiration: 61 })
  time(61_000)
  await owner.alarm()
  expect(values.has('oauth:renewed')).toBe(false)
})

it('ordinary traffic and exempt revocation preserve an already scheduled deadline', async () => {
  const { owner, values, scheduled, time, alarm } = harness(0)
  const request = (revocation = false) => new Request('https://app.test/oauth/token', { method: 'POST', headers: revocation ? { 'X-Agent-Revocation': '1' } : {} })
  expect((await owner.fetch(request())).status).toBe(200)
  time(59_000)
  expect((await owner.fetch(request())).status).toBe(200)
  expect(values.get('rate')).toEqual({ start: 0, count: 2 })
  expect(scheduled).toEqual([60_000])
  values.set('rate', { start: 0, count: 120 })
  expect((await owner.fetch(request())).status).toBe(429)
  expect((await owner.fetch(request(true))).status).toBe(200)
  expect(values.get('rate')).toEqual({ start: 0, count: 120 })
  expect(alarm()).toBe(60_000)
})

it('finishes an empty cursor pass before tearing down alarm/rate and restarts on later traffic', async () => {
  const { owner, storage, values, time, alarm } = harness()
  values.set('sweep', 'oauth:0999')
  values.set('rate', { start: 0, count: 3 })
  await storage.setAlarm(1000)
  await owner.alarm()
  expect(values.get('sweep')).toBe('')
  expect(values.has('rate')).toBe(true)
  expect(alarm()).toBe(61_000)
  time(61_000)
  await owner.alarm()
  expect(values.has('sweep')).toBe(false)
  expect(values.has('rate')).toBe(false)
  expect(alarm()).toBeNull()
  time(62_000)
  await owner.fetch(new Request('https://app.test/oauth/token', { method: 'POST' }))
  expect(values.get('rate')).toEqual({ start: 62_000, count: 1 })
  expect(alarm()).toBe(122_000)
})
