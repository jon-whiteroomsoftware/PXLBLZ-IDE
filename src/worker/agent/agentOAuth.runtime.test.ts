import { STOCK_SHOW_IDS } from '../../pixelblaze/stock/showIds'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'
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
  return convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-06-30', compatibilityFlags: ['global_fetch_strictly_public'], bindings: { ...bindings, ...patch }, durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true }, AGENT_OAUTH_AUTHORITY: { className: 'AgentOAuthAuthority', useSQLite: true } } })
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
  expect(html).toContain('The application can read the Show and submit edits.')
  expect(html).toContain('Signed in as <strong>github:123</strong>')
  return html.match(/name="nonce" value="([^"]+)"/)![1]
}
function answer(nonce: string, decision = 'allow', customCookie = cookie, origin = 'https://app.test') {
  return runtime.dispatchFetch('https://app.test/oauth/authorize', { method: 'POST', headers: { Origin: origin, Cookie: customCookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ nonce, decision }).toString(), redirect: 'manual' })
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
  const signIn = await runtime.dispatchFetch(await authURL())
  expect(signIn.status).toBe(200)
  expect(await signIn.text()).toContain('Sign in to connect your agent')
  const forged = await runtime.dispatchFetch(await authURL(), { headers: { 'X-Agent-Account': 'github:123' } })
  expect(forged.status).toBe(200)
  expect(await forged.text()).toContain('Sign in to connect your agent')
  for (const patch of [{ redirect_uri: 'https://hostile.test' }, { resource: 'https://hostile.test/mcp' }, { code_challenge_method: 'plain' }, { client_id: 'https://hostile.test/client.json' }, { scope: 'edit' }] as Record<string, string>[]) {
    expect((await runtime.dispatchFetch(await authURL(patch), { headers: { Cookie: cookie } })).status).toBe(400)
  }
})

it('resumes a signed-out authorization through one opaque, one-use account continuation', async () => {
  const started = await runtime.dispatchFetch(await authURL())
  const html = await started.text()
  const continuation = html.match(/agent_continue=([-a-f0-9]{36})/)?.[1]
  expect(continuation).toEqual(expect.any(String))
  expect(html).not.toContain('redirect_uri')

  const continuedCookie = `${cookie}; pxlblz_agent_continue=${continuation}`
  const resumed = await runtime.dispatchFetch('https://app.test/oauth/authorize', { headers: { Cookie: continuedCookie } })
  expect(resumed.status, await resumed.clone().text()).toBe(200)
  expect(await resumed.text()).toContain('Allow this agent to connect?')
  expect(resumed.headers.get('Set-Cookie')).toContain('pxlblz_agent_continue=;')

  const replay = await runtime.dispatchFetch('https://app.test/oauth/authorize', { headers: { Cookie: continuedCookie } })
  expect(replay.status).toBe(400)
  expect(await replay.text()).toContain('Authorization expired')

  const tampered = await runtime.dispatchFetch('https://app.test/oauth/authorize', { headers: { Cookie: `${cookie}; pxlblz_agent_continue=00000000-0000-4000-8000-000000000000` } })
  expect(tampered.status).toBe(400)
  expect(await tampered.text()).toContain('Authorization expired')
})

it('refuses signed-out authorization before storing continuation when the service is disabled', async () => {
  await runtime.setOptions(runtimeOptions({ AGENT_SERVICE_ENABLED: '0' }))
  const response = await runtime.dispatchFetch(await authURL())
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('agent_continue=')
  await runtime.setOptions(runtimeOptions())
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
it('discovers OAuth and MCP through the actual Worker with the finite canonical catalogue before attachment', async () => {
  const challenge = await runtime.dispatchFetch('https://app.test/mcp')
  expect(challenge.status).toBe(401)
  expect(challenge.headers.get('WWW-Authenticate')).toContain('/.well-known/oauth-protected-resource/mcp')
  const crossOrigin = await runtime.dispatchFetch('https://app.test/mcp', { headers: { Origin: 'https://client.test' } })
  expect(crossOrigin.headers.get('Access-Control-Allow-Origin')).toBe('https://client.test')
  expect(crossOrigin.headers.get('Access-Control-Expose-Headers')).toContain('WWW-Authenticate')
  const metadata = await runtime.dispatchFetch('https://app.test/.well-known/oauth-protected-resource/mcp')
  expect(await metadata.json()).toMatchObject({ resource: 'https://app.test/mcp', authorization_servers: ['https://app.test'] })
  const authorizationServer = await runtime.dispatchFetch('https://app.test/.well-known/oauth-authorization-server')
  expect(await authorizationServer.json()).toMatchObject({
    authorization_endpoint: 'https://app.test/oauth/authorize',
    registration_endpoint: 'https://app.test/oauth/register',
    client_id_metadata_document_supported: true,
    code_challenge_methods_supported: ['S256'],
  })
  const tokens = await authorized()
  async function rpc(method: string, params?: unknown) {
    return runtime.dispatchFetch('https://app.test/mcp', { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }) })
  }
  const initialize = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
  expect(initialize.status).toBe(200)
  expect(await initialize.json()).toMatchObject({ result: { capabilities: { tools: {} } } })
  const listing = await rpc('tools/list')
  const tools = (await listing.json() as { result: { tools: Array<{ name: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } }> } }).result.tools
  expect(tools.map(tool => tool.name).sort()).toEqual(['get_connection', 'list_commands', 'read_show', 'get_context', 'begin_edit', 'commit_edit', 'get_outcome', 'cancel_edit', ...SHOW_COMMANDS.map(command => command.name)].sort())
  const addClip = tools.find(tool => tool.name === 'add_clip')!.inputSchema
  expect(addClip.properties).toMatchObject({ layer: {}, overlay_layer_index: {} })
  expect(addClip.required).not.toContain('layer')
  const moveClip = tools.find(tool => tool.name === 'move_clip')!.inputSchema
  expect(moveClip.required).not.toContain('start_ms')
  for (const name of ['reorder_overlay_layer', 'remove_overlay_layer']) {
    const schema = tools.find(tool => tool.name === name)!.inputSchema
    expect(schema.properties).toMatchObject({ layer_index: { type: 'integer', minimum: 0 } })
    expect(schema.required).toContain('layer_index')
  }
  expect((await runtime.dispatchFetch(`https://app.test/mcp?access_token=${tokens.access_token}`)).status).toBe(401)
  expect((await runtime.dispatchFetch('https://app.test/mcp', { headers: { Authorization: `Bearer ${tokens.access_token}`, Origin: 'https://hostile.test' } })).status).toBe(403)
  expect((await exchange({ token: tokens.refresh_token })).status).toBe(200)
  expect((await rpc('tools/list')).status).toBe(401)
})
it('registers bounded public DCR clients without replacing static clients', async () => {
  await runtime.setOptions(runtimeOptions({ AGENT_OAUTH_CLIENTS: '[]' }))
  const registeredRedirect = 'http://127.0.0.1:3100/callback'
  const requestedRedirect = 'http://127.0.0.1:3200/callback'
  const dynamic = {
    redirect_uris: [registeredRedirect],
    client_name: 'Independent MCP client',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }
  const registrations = []
  for (let index = 0; index < 10; index++) {
    const token_endpoint_auth_method = index === 1 ? 'client_secret_basic' : index === 2 ? 'client_secret_post' : 'none'
    const response = await runtime.dispatchFetch('https://app.test/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...dynamic, token_endpoint_auth_method, client_name: `${dynamic.client_name} ${index}` }) })
    registrations.push(response)
  }
  expect(registrations.map(response => response.status), JSON.stringify(await Promise.all(registrations.map(response => response.clone().text())))).toEqual(Array(10).fill(201))
  const registeredClients = await Promise.all(registrations.slice(0, 3).map(response => response.json())) as Array<{ client_id: string; client_secret?: string; redirect_uris: string[]; token_endpoint_auth_method: string }>
  const registered = registeredClients[0]
  expect(registered).toMatchObject({ redirect_uris: dynamic.redirect_uris, token_endpoint_auth_method: 'none' })
  expect(registeredClients.map(value => value.token_endpoint_auth_method)).toEqual(['none', 'client_secret_basic', 'client_secret_post'])
  expect(registeredClients.slice(1).every(value => typeof value.client_secret === 'string')).toBe(true)
  const limited = await runtime.dispatchFetch('https://app.test/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dynamic) })
  expect(limited.status).toBe(429)

  for (const clientInfo of registeredClients) {
    const authorization = await runtime.dispatchFetch(await authURL({ client_id: clientInfo.client_id, redirect_uri: requestedRedirect }), { headers: { Cookie: cookie } })
    expect(authorization.status, await authorization.clone().text()).toBe(200)
    const nonce = (await authorization.text()).match(/name="nonce" value="([^"]+)"/)![1]
    const allowed = await answer(nonce)
    const redirect = new URL(allowed.headers.get('Location')!)
    expect(redirect.origin).toBe('http://127.0.0.1:3200')
    const fields = new URLSearchParams({ resource: 'https://app.test/mcp', grant_type: 'authorization_code', code: redirect.searchParams.get('code')!, code_verifier: verifier, redirect_uri: requestedRedirect })
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (clientInfo.token_endpoint_auth_method === 'client_secret_basic') headers.Authorization = `Basic ${btoa(`${clientInfo.client_id}:${clientInfo.client_secret}`)}`
    else {
      fields.set('client_id', clientInfo.client_id)
      if (clientInfo.token_endpoint_auth_method === 'client_secret_post') fields.set('client_secret', clientInfo.client_secret!)
    }
    const token = await runtime.dispatchFetch('https://app.test/oauth/token', { method: 'POST', headers, body: fields.toString() })
    expect(token.status, await token.clone().text()).toBe(200)
    if (clientInfo.token_endpoint_auth_method === 'none') {
      const issued = await token.clone().json() as { access_token: string }
      const initialize = (origin: string) => runtime.dispatchFetch('https://app.test/mcp', {
        method: 'POST',
        headers: { Authorization: `Bearer ${issued.access_token}`, Origin: origin, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-11-25' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'loopback', version: '1' } } }),
      })
      expect((await initialize(new URL(requestedRedirect).origin)).status).toBe(200)
      expect((await initialize('http://127.0.0.1:3300')).status).toBe(403)
    }
  }

  // Reintroducing deployment-owned preregistration leaves the DCR records live.
  await runtime.setOptions(runtimeOptions())
  expect((await runtime.dispatchFetch(await authURL(), { headers: { Cookie: cookie } })).status).toBe(200)
})
it('refuses wrong resource, redirect and verifier without consuming the valid code', async () => {
  const response = await answer(await consent())
  const code = new URL(response.headers.get('Location')!).searchParams.get('code')!
  const fields = { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: client.redirectUris[0] }
  for (const patch of [{ resource: 'https://other.test/mcp' }, { redirect_uri: 'https://client.test/other' }, { code_verifier: 'b'.repeat(43) }] as Record<string, string>[]) expect((await exchange({ ...fields, ...patch })).status).toBe(400)
  expect((await exchange(fields)).status).toBe(200)
})
it('rechecks service availability while preserving revocation', async () => {
  const tokens = await authorized()
  await runtime.setOptions(runtimeOptions({ AGENT_SERVICE_ENABLED: '0' }))
  const response = await runtime.dispatchFetch('https://app.test/mcp', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
  expect(response.status).toBe(503)
  expect((await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status).toBe(400)
  expect((await exchange({ token: tokens.refresh_token })).status).toBe(200)
  await runtime.setOptions(runtimeOptions())
  expect((await runtime.dispatchFetch('https://app.test/mcp', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).status).toBe(401)
})

it('keeps external grants usable when only built-in eligibility changes', async () => {
  const tokens = await authorized()
  await runtime.setOptions(runtimeOptions({ AGENT_ACCOUNT_ALLOWLIST: 'github:456' }))
  expect((await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status).toBe(200)
  await runtime.setOptions(runtimeOptions())
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
it('routes authenticated canonical MCP calls and confirms editing retirement only after the original browser ACK', async () => {
  const tokens = await authorized()
  const showId = STOCK_SHOW_IDS[0]
  const channel = async (body: object) => runtime.dispatchFetch('https://app.test/api/agent/channel?agent=1', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://app.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const rpc = (name: string, args: object = {}) => runtime.dispatchFetch('https://app.test/mcp', { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })
  const registration = await (await channel({ type: 'register', sessionId: 'mcp-live', showId })).json() as { registrationId: string }
  const own = { registrationId: registration.registrationId, sessionId: 'mcp-live', showId }
  await channel({ type: 'arm', ...own })
  const connected = await (await rpc('get_connection')).json() as { result: { structuredContent: { code: string; binding_id: string } } }
  expect(connected.result.structuredContent.code).toBe('bound')
  const bindingId = connected.result.structuredContent.binding_id
  const identity = { binding_id: bindingId, operation_id: 'operation' }
  expect(await (await rpc('read_show', { binding_id: 'old-binding' })).json()).toMatchObject({ result: { structuredContent: { code: 'no_live_editor' } } })
  expect(await (await rpc('begin_edit', { ...identity, delivery_id: 'forged', sequence: 0, accountId: 'github:456' })).json()).toMatchObject({ result: { isError: true } })
  const begin = rpc('begin_edit', { ...identity, delivery_id: 'begin', sequence: 0, intent: 'Rename' })
  const received = await (await channel({ type: 'receive', ...own })).json() as { deliveries: { operationId: string; deliveryId: string; payload: unknown }[] }
  expect(received.deliveries).toEqual([expect.objectContaining({ operationId: 'operation', deliveryId: 'begin', payload: { kind: 'begin_edit', intent: 'Rename' } })])
  await channel({ type: 'reply', ...own, bindingId, operationId: 'operation', deliveryId: 'begin', result: { code: 'begun' } })
  expect(await (await begin).json()).toMatchObject({ result: { structuredContent: { code: 'begun' } } })
  expect(await (await rpc('begin_edit', { ...identity, delivery_id: 'begin', sequence: 0, intent: 'Rename' })).json()).toMatchObject({ result: { structuredContent: { code: 'begun' } } })
  expect(await (await rpc('begin_edit', { ...identity, delivery_id: 'begin', sequence: 0, intent: 'Changed intent' })).json()).toMatchObject({ result: { structuredContent: { code: 'identity_conflict' } } })
  // This canonical rename exceeds the old16KiB OAuth body limit but is below
  // the64KiB normalized command cap. The relay must preserve it byte-for-byte.
  const name = 'x'.repeat(64_000)
  const rename = rpc('rename_show', { ...identity, delivery_id: 'rename', sequence: 1, name })
  const large = await (await channel({ type: 'receive', ...own })).json() as { deliveries: { payload: unknown }[] }
  expect(large.deliveries[0].payload).toEqual({ kind: 'command', name: 'rename_show', arguments: { name } })
  await channel({ type: 'reply', ...own, bindingId, operationId: 'operation', deliveryId: 'rename', result: { code: 'changed' } })
  expect(await (await rename).json()).toMatchObject({ result: { structuredContent: { code: 'changed' } } })
  const oversized = await runtime.dispatchFetch('https://app.test/mcp', { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' }, body: ' '.repeat(67_585) })
  expect(oversized.status).toBe(413)
  expect(await oversized.json()).toEqual({ error: 'invalid_request' })
  const committing = rpc('commit_edit', { ...identity, delivery_id: 'commit', sequence: 2 })
  expect(await (await channel({ type: 'receive', ...own })).json()).toMatchObject({ deliveries: [{ deliveryId: 'commit' }] })
  // The browser executed the commit but its waiting acknowledgement was lost.
  const cancelling = rpc('cancel_edit', { ...identity, delivery_id: 'cancel', sequence: 3 })
  expect(await (await channel({ type: 'receive', ...own })).json()).toMatchObject({ deliveries: [{ deliveryId: 'cancel' }] })
  await channel({ type: 'reply', ...own, bindingId, operationId: 'operation', deliveryId: 'cancel', result: { code: 'outcome', receipt: { status: 'cancelled' } } })
  expect(await (await cancelling).json()).toMatchObject({ result: { structuredContent: { receipt: { status: 'cancelled' } } } })
  expect(await (await committing).json()).toMatchObject({ result: { structuredContent: { code: 'result_unavailable' } } })
  expect(await (await channel({ type: 'reply', ...own, bindingId, operationId: 'operation', deliveryId: 'commit', result: { code: 'outcome', receipt: { status: 'waiting' } } })).json()).toEqual({ code: 'unknown' })
  const waiting = channel({ type: 'receive', ...own })
  expect((await exchange({ token: tokens.refresh_token })).status).toBe(200)
  expect(await (await waiting).json()).toMatchObject({ connection: { kind: 'retiring', bindingId }, deliveries: [] })
  // OAuth200 revoked credentials; the account still awaits local retirement.
  expect(await (await channel({ type: 'poll', ...own })).json()).toMatchObject({ connection: { kind: 'retiring' } })
  expect(await (await channel({ type: 'retirement-ack', ...own, sessionId: 'old', bindingId })).json()).toEqual({ code: 'retired' })
  expect(await (await channel({ type: 'retirement-ack', ...own, bindingId })).json()).toEqual({ code: 'editing_ended' })
  expect(await (await channel({ type: 'poll', ...own })).json()).toMatchObject({ connection: { kind: 'idle' } })
  expect((await rpc('get_outcome', { ...identity })).status).toBe(401)
  await channel({ type: 'leave', ...own })
}, 10_000)
it('local Forget revokes only the grant attached to the exact owning window', async () => {
  const tokens = await authorized()
  const showId = STOCK_SHOW_IDS[0]
  const channel = (body: object) => runtime.dispatchFetch('https://app.test/api/agent/channel?agent=1', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://app.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const registration = await (await channel({ type: 'register', sessionId: 'forget', showId })).json() as { registrationId: string }
  const own = { registrationId: registration.registrationId, sessionId: 'forget', showId }
  await channel({ type: 'arm', ...own })
  const connected = await runtime.dispatchFetch('https://app.test/mcp', { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_connection', arguments: {} } }) })
  const bindingId = (await connected.json() as { result: { structuredContent: { binding_id: string } } }).result.structuredContent.binding_id
  expect(await (await channel({ type: 'forget', ...own, sessionId: 'another-window', bindingId })).json()).toEqual({ code: 'not_bound_here' })
  expect((await runtime.dispatchFetch('https://app.test/mcp', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).status).toBe(405)
  expect(await (await channel({ type: 'forget', ...own, bindingId })).json()).toEqual({ code: 'forgotten' })
  expect((await runtime.dispatchFetch('https://app.test/mcp', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).status).toBe(401)
  expect(await (await channel({ type: 'poll', ...own })).json()).toMatchObject({ connection: { kind: 'idle' } })
  await channel({ type: 'leave', ...own })
})
