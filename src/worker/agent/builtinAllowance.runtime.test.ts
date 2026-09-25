import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createSessionToken } from '../../cloudflare/auth'

let runtime: Miniflare
const showId = 'runtime-allowance-show'
const windowIdentity = { registrationId: '', sessionId: 'runtime-session', showId }

const entry = `
import app from './src/worker/index'
export { AgentAccount, AgentAllowance } from './src/worker/index'
import { handleBuiltinHttp } from './src/worker/agent/builtinHttp'
let providerCalls = 0
const receipts = new Map()
const relay = {
  async deliver(_env, accountId, identity, envelope) {
    if (envelope.payload.kind === 'begin_edit') {
      const receipt = { status: 'pending', request: { operationId: envelope.operationId, accountId, bindingId: identity.bindingId } }
      receipts.set(envelope.operationId, receipt)
      return { code: 'begun', show: { id: 'runtime-allowance-show', name: 'Runtime proof', version: 2 }, context: {} }
    }
    const receipt = { status: 'completed', completion: 'asked', request: receipts.get(envelope.operationId)?.request }
    receipts.set(envelope.operationId, receipt)
    return { code: 'outcome', receipt }
  },
  async query(_env, _accountId, _identity, query) {
    return { code: 'outcome', receipt: receipts.get(query.operationId) ?? { status: 'pending' } }
  },
}
const provider = async () => {
  providerCalls++
  return Response.json({
    model: 'gpt-5.6-luna', service_tier: 'default', status: 'completed',
    usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
    output: [{ type: 'function_call', call_id: 'finish', name: 'finish_turn', arguments: '{"outcome":"ask","message":"Which Clip do you mean?"}' }],
  })
}
export default {
  async fetch(request, env, context) {
    if (new URL(request.url).pathname === '/api/agent/builtin') return handleBuiltinHttp(request, env, relay, provider)
    if (new URL(request.url).pathname === '/fixture/provider-calls') return Response.json({ providerCalls })
    return app.fetch(request, env, context)
  },
}
`

beforeAll(async () => {
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: 'builtin-allowance-runtime-entry.ts' }, external: ['cloudflare:workers'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-06-30',
    bindings: { SESSION_SECRET: 'runtime-secret', AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'some-other-account', OPENAI_API_KEY: 'synthetic-never-sent' },
    d1Databases: ['PXLBLZ_DB'], durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true }, AGENT_ALLOWANCE: { className: 'AgentAllowance', useSQLite: true } },
  }))
  const db = await runtime.getD1Database('PXLBLZ_DB')
  await db.exec('CREATE TABLE personal_shows (user_id TEXT, id TEXT, name TEXT); CREATE TABLE identities (user_id TEXT, provider TEXT, provider_user_id TEXT, handle TEXT, email TEXT, email_verified INTEGER)')
  await db.prepare('INSERT INTO personal_shows VALUES (?, ?, ?)').bind('account-open', showId, 'Runtime proof').run()
  const registered = await channel('account-open', { type: 'register', sessionId: windowIdentity.sessionId, showId, showVersion: 2 })
  const body = await registered.json() as { code: string; registrationId: string }
  expect(body.code).toBe('registered')
  windowIdentity.registrationId = body.registrationId
}, 30_000)

afterAll(async () => { await runtime?.dispose() })

async function cookie(accountId: string): Promise<string> {
  const token = await createSessionToken({ userId: accountId, primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'runtime-secret')
  return `pxlblz_session=${token}`
}

async function channel(accountId: string, body: unknown) {
  return runtime.dispatchFetch('https://app.test/api/agent/channel', { method: 'POST', headers: { Origin: 'https://app.test', 'Content-Type': 'application/json', Cookie: await cookie(accountId) }, body: JSON.stringify(body) })
}

async function builtin(accountId: string | null, body: unknown) {
  return runtime.dispatchFetch('https://app.test/api/agent/builtin', { method: 'POST', headers: { Origin: 'https://app.test', 'Content-Type': 'application/json', ...(accountId ? { Cookie: await cookie(accountId) } : {}) }, body: JSON.stringify(body) })
}

it('opens the actual Worker route beyond the legacy allowlist and returns its durable first-dispatch charge', async () => {
  const request = (action: string, fields: Record<string, unknown> = {}) => ({ action, window: windowIdentity, ...fields })
  const capability = await runtime.dispatchFetch('https://app.test/api/me', { headers: { Cookie: await cookie('account-open') } })
  expect(await capability.json()).toMatchObject({ authenticated: true, agentCapabilities: { builtin: true, allowance: { code: 'available', limit: 30, remaining: 30 } } })
  expect(await (await builtin('account-open', request('connect'))).json()).toMatchObject({ code: 'bound', allowance: { code: 'available', remaining: 30 } })
  const started = await (await builtin('account-open', request('begin'))).json() as { code: string; operationId: string; allowance: { remaining: number } }
  expect(started).toMatchObject({ code: 'started', allowance: { remaining: 30 } })
  const result = await (await builtin('account-open', request('run', { operationId: started.operationId, prompt: 'Change a Clip' }))).json()
  expect(result).toMatchObject({ code: 'outcome', message: 'Which Clip do you mean?', allowance: { code: 'available', limit: 30, remaining: 29 } })
  expect(await (await builtin('account-open', request('status'))).json()).toMatchObject({ code: 'status', allowance: { remaining: 29 } })
  expect(await (await runtime.dispatchFetch('https://app.test/fixture/provider-calls')).json()).toEqual({ providerCalls: 1 })
})

it('refuses signed-out and wrong-owner requests before the controlled provider transport', async () => {
  const before = await (await runtime.dispatchFetch('https://app.test/fixture/provider-calls')).json()
  const run = { action: 'run', window: windowIdentity, operationId: 'forged', prompt: 'Do not run' }
  expect(await (await builtin(null, run)).json()).toEqual({ code: 'unauthorized', dispatch: 'not_attempted' })
  expect(await (await builtin('account-wrong', run)).json()).toEqual({ code: 'show_unavailable', dispatch: 'not_attempted' })
  expect(await (await runtime.dispatchFetch('https://app.test/fixture/provider-calls')).json()).toEqual(before)
})
