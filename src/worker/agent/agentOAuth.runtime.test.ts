import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createSessionToken } from '../../cloudflare/auth'
let runtime: Miniflare
let cookie: string
let script: string
const client = { clientId: 'test-client', clientName: 'Test Agent', redirectUris: ['https://client.test/callback'] }
const bindings = { SESSION_SECRET: 'test-secret', AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'github:123,github:456', AGENT_OAUTH_ORIGIN: 'https://app.test', AGENT_OAUTH_CLIENTS: JSON.stringify([{ clientId: 'test-client', clientName: 'Test Agent', redirectUris: ['https://client.test/callback'] }]) }
function runtimeOptions(patch: Record<string, string> = {}) {
  return convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-06-30', bindings: { ...bindings, ...patch }, durableObjects: { AGENT_OAUTH_AUTHORITY: { className: 'AgentOAuthAuthority', useSQLite: true } } })
}
beforeAll(async () => {
  const bundle = await build({ entryPoints: ['src/worker/index.ts'], external: ['cloudflare:workers'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  script = bundle.outputFiles[0].text
  runtime = new Miniflare(runtimeOptions())
  cookie = `pxlblz_session=${await createSessionToken({ userId: 'github:123', primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'test-secret')}`
}, 30_000)
afterAll(async () => { await runtime?.dispose() })
const verifier = 'a'.repeat(43)
async function authURL(patch: Record<string, string> = {}) {
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url')
  return `https://app.test/oauth/authorize?${new URLSearchParams({ agent: '1', client_id: client.clientId, redirect_uri: client.redirectUris[0], response_type: 'code', scope: 'agent:connect', state: 'test-state', resource: 'https://app.test/mcp', code_challenge_method: 'S256', code_challenge: challenge, ...patch })}`
}
async function consent() {
  const response = await runtime.dispatchFetch(await authURL(), { headers: { Cookie: cookie } })
  const html = await response.text()
  expect(response.status, html).toBe(200)
  expect(html).toContain('Show editing is not available')
  expect(html).toContain('Signed in as <strong>github:123</strong>')
  return html.match(/name="nonce" value="([^"]+)"/)![1]
}
function answer(nonce: string, decision = 'allow', customCookie = cookie, origin = 'https://app.test') {
  return runtime.dispatchFetch('https://app.test/oauth/authorize?agent=1', { method: 'POST', headers: { Origin: origin, Cookie: customCookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ nonce, decision }).toString(), redirect: 'manual' })
}
function exchange(fields: Record<string, string>) {
  return runtime.dispatchFetch('https://app.test/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.clientId, resource: 'https://app.test/mcp', ...fields }).toString() })
}
async function authorized() {
  const response = await answer(await consent())
  expect(response.status).toBe(303)
  const redirect = new URL(response.headers.get('Location')!)
  expect(redirect.origin).toBe('https://client.test')
  expect(redirect.searchParams.get('state')).toBe('test-state')
  const token = await exchange({ grant_type: 'authorization_code', code: redirect.searchParams.get('code')!, code_verifier: verifier, redirect_uri: client.redirectUris[0] })
  const result = await token.json() as { access_token: string; refresh_token: string }
  expect(token.status, JSON.stringify(result)).toBe(200)
  return result
}
it('requires signed eligible consent with exact redirect/resource/S256 and refuses forged account identity', async () => {
  expect((await runtime.dispatchFetch(await authURL())).status).toBe(401)
  expect((await runtime.dispatchFetch(await authURL(), { headers: { 'X-Agent-Account': 'github:123' } })).status).toBe(401)
  for (const patch of [{ redirect_uri: 'https://hostile.test' }, { resource: 'https://hostile.test/mcp' }, { code_challenge_method: 'plain' }, { client_id: 'https://hostile.test/client.json' }, { scope: 'edit' }] as Record<string, string>[]) {
    expect((await runtime.dispatchFetch(await authURL(patch), { headers: { Cookie: cookie } })).status).toBe(400)
  }
})
it('binds one-use consent to the authenticated account and permits cancel without a grant', async () => {
  const nonce = await consent()
  const other = `pxlblz_session=${await createSessionToken({ userId: 'github:456', primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'test-secret')}`
  expect((await answer(nonce, 'allow', other)).status).toBe(400)
  expect((await answer(nonce, 'allow', cookie, 'https://hostile.test')).status).toBe(403)
  const cancelled = await answer(nonce, 'deny')
  expect(cancelled.status).toBe(303)
  expect(new URL(cancelled.headers.get('Location')!).searchParams.get('error')).toBe('access_denied')
  expect((await answer(nonce)).status).toBe(400)
})
it('discovers OAuth and MCP through the actual Worker while advertising no edit tools', async () => {
  const challenge = await runtime.dispatchFetch('https://app.test/mcp')
  expect(challenge.status).toBe(401)
  expect(challenge.headers.get('WWW-Authenticate')).toContain('/.well-known/oauth-protected-resource/mcp')
  const crossOrigin = await runtime.dispatchFetch('https://app.test/mcp', { headers: { Origin: 'https://client.test' } })
  expect(crossOrigin.headers.get('Access-Control-Allow-Origin')).toBe('https://client.test')
  expect(crossOrigin.headers.get('Access-Control-Expose-Headers')).toContain('WWW-Authenticate')
  const metadata = await runtime.dispatchFetch('https://app.test/.well-known/oauth-protected-resource/mcp')
  expect(await metadata.json()).toMatchObject({ resource: 'https://app.test/mcp', authorization_servers: ['https://app.test'] })
  const tokens = await authorized()
  async function rpc(method: string, params?: unknown) {
    return runtime.dispatchFetch('https://app.test/mcp', { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }) })
  }
  const initialize = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
  expect(initialize.status).toBe(200)
  expect(await initialize.json()).toMatchObject({ result: { capabilities: { tools: {} } } })
  const listing = await rpc('tools/list')
  expect(await listing.json()).toMatchObject({ result: { tools: [] } })
  expect((await runtime.dispatchFetch(`https://app.test/mcp?access_token=${tokens.access_token}`)).status).toBe(401)
  expect((await runtime.dispatchFetch('https://app.test/mcp', { headers: { Authorization: `Bearer ${tokens.access_token}`, Origin: 'https://hostile.test' } })).status).toBe(403)
  expect((await exchange({ token: tokens.refresh_token })).status).toBe(200)
  expect((await rpc('tools/list')).status).toBe(401)
})
it('refuses wrong resource, redirect and verifier without consuming the valid code', async () => {
  const response = await answer(await consent())
  const code = new URL(response.headers.get('Location')!).searchParams.get('code')!
  const fields = { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: client.redirectUris[0] }
  for (const patch of [{ resource: 'https://other.test/mcp' }, { redirect_uri: 'https://client.test/other' }, { code_verifier: 'b'.repeat(43) }] as Record<string, string>[]) expect((await exchange({ ...fields, ...patch })).status).toBe(400)
  expect((await exchange(fields)).status).toBe(200)
})
it('rechecks deployment eligibility for access and refresh while preserving revocation', async () => {
  for (const patch of [{ AGENT_SERVICE_ENABLED: '0' }, { AGENT_ACCOUNT_ALLOWLIST: 'github:456' }] as Record<string, string>[]) {
    const tokens = await authorized()
    await runtime.setOptions(runtimeOptions(patch))
    const response = await runtime.dispatchFetch('https://app.test/mcp', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    expect([403, 503]).toContain(response.status)
    expect((await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status).toBe(400)
    expect((await exchange({ token: tokens.refresh_token })).status).toBe(200)
    await runtime.setOptions(runtimeOptions())
    expect((await runtime.dispatchFetch('https://app.test/mcp', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).status).toBe(401)
  }
})

it('submits native browser consent and follows a registered cross-origin callback', async () => {
  const proofRuntime = new Miniflare(runtimeOptions())
  const browser = await chromium.launch()
  try {
    const origin = (await proofRuntime.ready).origin
    const callbackOrigin = origin.replace('127.0.0.1', 'localhost')
    const redirect = `${callbackOrigin}/client-callback`
    await proofRuntime.setOptions({ ...runtimeOptions({ AGENT_OAUTH_ORIGIN: origin, AGENT_OAUTH_CLIENTS: JSON.stringify([{ ...client, redirectUris: [redirect] }]) }), port: Number(new URL(origin).port) })
    const context = await browser.newContext()
    await context.addCookies([{ name: 'pxlblz_session', value: cookie.slice('pxlblz_session='.length), url: origin }])
    const page = await context.newPage()
    const origins: string[] = []
    page.on('request', (request) => { if (request.method() === 'POST') origins.push(request.headers().origin) })
    // Only the external client's callback is synthetic. Consent and its POST
    // travel through the actual local Worker listener with browser headers.
    await page.route(`${callbackOrigin}/client-callback*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Client callback</h1>' }))
    for (const decision of ['Cancel', 'Allow connection']) {
      const url = (await authURL({ redirect_uri: redirect, resource: `${origin}/mcp` })).replace('https://app.test', origin)
      await page.goto(url)
      await page.getByRole('button', { name: decision, exact: true }).click()
      await page.waitForURL(`${callbackOrigin}/client-callback*`, { timeout: 5000 })
      const callback = new URL(page.url())
      expect(callback.searchParams.get('state')).toBe('test-state')
      if (decision === 'Cancel') expect(callback.searchParams.get('error')).toBe('access_denied')
      else expect(callback.searchParams.get('code')).toEqual(expect.any(String))
    }
    expect(origins).toEqual([origin, origin])
  } finally { await browser.close(); await proofRuntime.dispose() }
}, 30_000)
it('bounds outstanding consent and grant admissions per account without revoking earlier grants', async () => {
  const other = `pxlblz_session=${await createSessionToken({ userId: 'github:456', primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'test-secret')}`
  async function pending() {
    const response = await runtime.dispatchFetch(await authURL(), { headers: { Cookie: other } })
    return { response, nonce: (await response.text()).match(/name="nonce" value="([^"]+)"/)?.[1] }
  }
  const attempts = await Promise.all(Array.from({ length: 5 }, () => pending()))
  expect(attempts.map((item) => item.response.status).sort()).toEqual([200, 200, 200, 200, 429])
  const nonces = attempts.filter((item) => item.response.status === 200).map((item) => item.nonce!)
  const codes: string[] = []
  for (let i = 0; i < 8; i++) {
    const nonce = nonces[i] ?? (await pending()).nonce!
    const response = await answer(nonce, 'allow', other)
    expect(response.status).toBe(303)
    codes.push(new URL(response.headers.get('Location')!).searchParams.get('code')!)
  }
  const capped = (await pending()).nonce!
  expect((await answer(capped, 'allow', other)).status).toBe(429)
  expect((await answer(capped, 'deny', other)).status).toBe(303)
  // Refusal did not consume or revoke any independently admitted family.
  expect((await exchange({ grant_type: 'authorization_code', code: codes[0], code_verifier: verifier, redirect_uri: client.redirectUris[0] })).status).toBe(200)
})
it('shows only the signed account label and escapes hostile display text', async () => {
  const displayName = 'Zoë </strong><img src=x onerror=alert(1)>'
  const signed = `pxlblz_session=${await createSessionToken({ userId: 'github:123', primaryProvider: 'github', primaryHandle: null, displayName, avatarUrl: null }, 'test-secret')}`
  const response = await runtime.dispatchFetch(await authURL(), { headers: { Cookie: signed, 'X-Agent-Account-Label': 'Forged account' } })
  const html = await response.text()
  expect(response.status).toBe(200)
  expect(html).toContain('Zoë &lt;/strong&gt;&lt;img src=x onerror=alert(1)&gt;')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('Forged account')
})
