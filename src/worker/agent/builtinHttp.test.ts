import { expect, it, vi } from 'vitest'
import { createSessionToken } from '../../cloudflare/auth'
import { handleBuiltinHttp } from './builtinHttp'
const binding = { agentKind: 'builtin', agentId: 'builtin-v1', agentName: 'Built-in', bindingId: 'binding', callId: 'call' }
async function fixture() {
  const token = await createSessionToken({ userId: 'account', primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'test-secret')
  const account = vi.fn(async () => Response.json({ code: 'bound', binding }))
  const budget = vi.fn(async (request: Request) => { const body = await request.json() as { type: string }; return Response.json({ code: body.type === 'begin' ? 'started' : body.type === 'activate' ? 'activated' : body.type === 'reserve' ? 'reserved' : 'settled', operationId: 'operation' }) })
  const env = { SESSION_SECRET: 'test-secret', AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'account', OPENAI_API_KEY: 'injected-test-key', PXLBLZ_DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ id: 'show' }] }) }) }) }, AGENT_ACCOUNTS: { idFromName: (id: string) => id, get: () => ({ fetch: account }) }, AGENT_ALLOWANCE: { idFromName: (id: string) => id, get: () => ({ fetch: budget }) } }
  const relay = { deliver: vi.fn(async (_env: unknown, _account: string, _identity: unknown, delivery: { payload: { kind?: string } }) => delivery.payload.kind === 'begin_edit' ? { code: 'begun', show: { id: 'show', name: 'Captured' }, context: {} } : { code: 'outcome', receipt: { status: 'applied' } }), query: vi.fn(async () => ({ code: 'outcome', receipt: { status: 'pending' } })) }
  const providerFetch = vi.fn(async () => Response.json({ model: 'gpt-5.6-luna', service_tier: 'default', status: 'completed', usage: null, output: [{ type: 'function_call', call_id: 'finish', name: 'finish_turn', arguments: '{"outcome":"apply","message":"Requested edit"}' }] }))
  const request = (action: string) => new Request('https://app.test/api/agent/builtin?agent=1', { method: 'POST', headers: { Origin: 'https://app.test', 'Content-Type': 'application/json', Cookie: `pxlblz_session=${token}` }, body: JSON.stringify({ action, window: { registrationId: 'reg', sessionId: 'session', showId: 'show' }, ...(action === 'run' ? { operationId: 'operation', prompt: 'Edit' } : {}) }) })
  return { env, relay, providerFetch, request, account, budget }
}
it('does not claim a builtin connection when the protected provider credential is absent', async () => {
  const f = await fixture()
  const response = await handleBuiltinHttp(f.request('connect'), { ...f.env, OPENAI_API_KEY: undefined } as never, f.relay as never, f.providerFetch)
  expect(await response.json()).toEqual({ code: 'unavailable' })
  expect(f.account).not.toHaveBeenCalled(); expect(f.providerFetch).not.toHaveBeenCalled()
})
it('routes authenticated builtin work through the trusted binding and injected provider only', async () => {
  const f = await fixture()
  const response = await handleBuiltinHttp(f.request('run'), f.env as never, f.relay as never, f.providerFetch)
  expect(await response.json()).toMatchObject({ code: 'outcome' })
  for (const call of f.relay.deliver.mock.calls) { expect(call[1]).toBe('account'); expect(call[2]).toEqual(binding) }
  expect(f.providerFetch).toHaveBeenCalledOnce()
  expect(f.relay.deliver.mock.calls[1][3]).toMatchObject({ payload: { kind: 'commit_edit' } })
})
it('refuses duplicate activation before relay or provider work', async () => {
  const f = await fixture(); f.budget.mockResolvedValue(Response.json({ code: 'duplicate' }))
  expect(await (await handleBuiltinHttp(f.request('run'), f.env as never, f.relay as never, f.providerFetch)).json()).toEqual({ code: 'duplicate' })
  expect(f.relay.deliver).not.toHaveBeenCalled(); expect(f.providerFetch).not.toHaveBeenCalled()
})
it('marks HTTP pre-dispatch refusal but never a failure after attempted relay dispatch', async () => {
  const f = await fixture()
  expect(await (await handleBuiltinHttp(f.request('run'), { ...f.env, OPENAI_API_KEY: undefined } as never, f.relay as never)).json()).toEqual({ code: 'unavailable', dispatch: 'not_attempted' })
  expect(await (await handleBuiltinHttp(f.request('run'), { ...f.env, AGENT_SERVICE_ENABLED: '0' } as never, f.relay as never)).json()).toEqual({ code: 'service_disabled', dispatch: 'not_attempted' })
  expect(f.relay.deliver).not.toHaveBeenCalled()
  f.relay.deliver.mockRejectedValue(new Error('lost reply'))
  expect(await (await handleBuiltinHttp(f.request('run'), f.env as never, f.relay as never)).json()).toEqual({ code: 'unavailable' })
})
