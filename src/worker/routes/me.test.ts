import { expect, it } from 'vitest'
import { createSessionToken, sessionCookieName } from '../../cloudflare/auth'
import { onRequestGet } from './me'

async function request() {
  const token = await createSessionToken({ userId: 'github:123', primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'secret')
  return new Request('https://app.test/api/me', { headers: { Cookie: `${sessionCookieName}=${token}` } })
}

const oauth = {
  AGENT_SERVICE_ENABLED: '1',
  AGENT_OAUTH_ORIGIN: 'https://app.test',
  AGENT_OAUTH_CLIENTS: JSON.stringify([{ clientId: 'static', clientName: 'Static', redirectUris: ['https://client.test/callback'] }]),
  AGENT_OAUTH_AUTHORITY: {},
  AGENT_ACCOUNTS: {},
}

const allowance = (body: object = { code: 'status', allowance: { code: 'available', limit: 30, remaining: 27, resetAt: Date.parse('2026-09-11T00:00:00Z'), revision: 3 } }) => ({
  idFromName: (name: string) => name,
  get: () => ({ fetch: async () => Response.json(body) }),
})

it('returns effective external and built-in capabilities with authoritative allowance status', async () => {
  const nonAllowlisted = await onRequestGet({ request: await request(), env: { ...oauth, SESSION_SECRET: 'secret', AGENT_ACCOUNT_ALLOWLIST: 'github:other', AGENT_ALLOWANCE: allowance(), OPENAI_API_KEY: 'configured' } })
  const nonAllowlistedText = await nonAllowlisted.text()
  expect(JSON.parse(nonAllowlistedText)).toMatchObject({
    authenticated: true,
    agentCapabilities: { external: true, builtin: true, endpoint: 'https://app.test/mcp', allowance: { code: 'available', limit: 30, remaining: 27 } },
  })
  expect(nonAllowlistedText).not.toContain('github:other')

  const allowlisted = await onRequestGet({ request: await request(), env: { ...oauth, SESSION_SECRET: 'secret', AGENT_ACCOUNT_ALLOWLIST: 'github:123', AGENT_ALLOWANCE: allowance(), OPENAI_API_KEY: 'configured' } })
  expect(await allowlisted.json()).toMatchObject({ agentCapabilities: { external: true, builtin: true } })

  const automaticOnly = await onRequestGet({ request: await request(), env: { ...oauth, SESSION_SECRET: 'secret', AGENT_OAUTH_CLIENTS: '[]' } })
  expect(await automaticOnly.json()).toMatchObject({ agentCapabilities: { external: true, builtin: false, endpoint: 'https://app.test/mcp' } })
})

it('keeps the built-in choice visible but marks allowance unavailable when its status read fails', async () => {
  const failing = allowance()
  failing.get = () => ({ fetch: async () => { throw new Error('owner unavailable') } })
  const response = await onRequestGet({ request: await request(), env: { ...oauth, SESSION_SECRET: 'secret', AGENT_ALLOWANCE: failing, OPENAI_API_KEY: 'configured' } })
  expect(await response.json()).toMatchObject({
    agentCapabilities: { builtin: true, allowance: { code: 'unavailable', limit: 30, remaining: null, resetAt: null } },
  })
})

it('fails capabilities closed when service or required provider bindings are unavailable', async () => {
  const disabled = await onRequestGet({ request: await request(), env: { ...oauth, SESSION_SECRET: 'secret', AGENT_SERVICE_ENABLED: '0', AGENT_ACCOUNT_ALLOWLIST: 'github:123', AGENT_ALLOWANCE: {} as never, OPENAI_API_KEY: 'configured' } })
  expect(await disabled.json()).toMatchObject({ agentCapabilities: { external: false, builtin: false } })

  const missingAuthority = await onRequestGet({ request: await request(), env: { ...oauth, SESSION_SECRET: 'secret', AGENT_OAUTH_AUTHORITY: undefined } })
  expect(await missingAuthority.json()).toMatchObject({ agentCapabilities: { external: false, builtin: false } })
})
