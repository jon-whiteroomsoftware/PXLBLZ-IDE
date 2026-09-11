import { expect, it, vi } from 'vitest'
import { createSessionToken } from '../../cloudflare/auth'
import { authorizeBuiltinRequest } from './builtinAccess'
const windowIdentity = { registrationId: 'registration', sessionId: 'session', showId: 'show' }
async function fixture() {
  const secret = 'local-test-secret'
  const token = await createSessionToken({ userId: 'account', primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, secret)
  const all = vi.fn(async () => ({ results: [{ id: 'show' }] }))
  const env = { SESSION_SECRET: secret, AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'account', PXLBLZ_DB: { prepare: () => ({ bind: () => ({ all }) }) } }
  const request = (body: unknown = { action: 'connect', window: windowIdentity }, headers: Record<string, string> = {}, url = 'https://app.test/api/agent/builtin?agent=1') => new Request(url, { method: 'POST', headers: { Origin: 'https://app.test', 'Content-Type': 'application/json', Cookie: `pxlblz_session=${token}`, ...headers }, body: JSON.stringify(body) })
  return { env, request, all }
}
it('returns only server-authenticated account identity and a parsed local window capability', async () => {
  const f = await fixture()
  expect(await authorizeBuiltinRequest(f.request(), f.env as never)).toEqual({ accountId: 'account', command: { action: 'connect', window: windowIdentity } })
  expect(f.all).toHaveBeenCalledOnce()
})
it('refuses unauthenticated, wrong-origin, disabled, opted-out and non-owned Show requests', async () => {
  const f = await fixture()
  for (const request of [f.request(undefined, { Cookie: '' }), f.request(undefined, { Origin: 'https://other.test' }), f.request(undefined, {}, 'https://app.test/api/agent/builtin')]) expect(await authorizeBuiltinRequest(request, f.env as never)).toBeInstanceOf(Response)
  expect(await authorizeBuiltinRequest(f.request(), { ...f.env, AGENT_SERVICE_ENABLED: '0' } as never)).toBeInstanceOf(Response)
  f.all.mockResolvedValue({ results: [] })
  expect(await authorizeBuiltinRequest(f.request(), f.env as never)).toBeInstanceOf(Response)
})
it('rejects caller account/agent claims, malformed operation identity and oversize streamed bodies', async () => {
  const f = await fixture()
  for (const body of [{ action: 'connect', window: windowIdentity, accountId: 'other' }, { action: 'run', window: windowIdentity, operationId: '../old', prompt: 'Edit' }, { action: 'run', window: windowIdentity, operationId: 'op', prompt: 'x'.repeat(256 * 1024) }]) {
    expect(await authorizeBuiltinRequest(f.request(body), f.env as never)).toBeInstanceOf(Response)
  }
})
