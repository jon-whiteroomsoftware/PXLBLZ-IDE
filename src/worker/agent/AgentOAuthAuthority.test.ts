import { afterEach, expect, it, vi } from 'vitest'
import { AgentOAuthAuthority } from './AgentOAuthAuthority'

// Only the authority's scheduling/storage lifecycle is under test here.
// Actual provider exchanges and persistence remain covered by workerd suites.
vi.mock('@cloudflare/workers-oauth-provider', () => ({ OAuthProvider: class { async fetch() { return new Response('provider') } }, OAuthError: Error }))
afterEach(() => vi.restoreAllMocks())

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
    async transaction(callback) { return callback(storage) },
  }
  const owner = new AgentOAuthAuthority({ storage }, { AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'account', AGENT_OAUTH_ORIGIN: 'https://app.test', AGENT_OAUTH_CLIENTS: JSON.stringify([{ clientId: 'client', clientName: 'Client', redirectUris: ['https://client.test/callback'] }]) })
  return { owner, storage, values, scans, scheduled, time: (value: number) => { now = value }, alarm: () => alarm }
}

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
