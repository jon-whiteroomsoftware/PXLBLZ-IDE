import { expect, test, type Page } from './fixtures/authenticated'

/**
 * One agent command sequence against a version-2 record, on the production
 * Show route with no query flag, through the real MCP path (#1039).
 *
 * Nothing is stubbed: the client registers itself with the Worker's own OAuth
 * authority, the person grants consent on the real consent page in this
 * browser, and every command is a real `tools/call` against `/mcp`. It reaches
 * the editor the way an external agent does - relay, browser binding, the v2
 * executor, the v2 candidate admission - and the oracles are what the author
 * sees in the timeline and what storage returns on a reload.
 */
/**
 * The consent page is served outside the app's base path, so the dev server has
 * no `/assets/...` webfont to answer with. That is a static-asset path on the
 * OAuth page this test visits directly, not an error from the editor route, so
 * the test serves it rather than admitting a console error it did not cause.
 */
async function serveConsentFont(page: Page): Promise<void> {
  const origin = new URL(page.url()).origin
  await page.route(`${origin}/assets/*.woff2`, route => route.fulfill({ status: 200, contentType: 'font/woff2', body: '' }))
}

interface Client { client_id: string }

async function registerClient(page: Page): Promise<Client> {
  const origin = new URL(page.url()).origin
  const response = await page.request.post('/oauth/register', {
    headers: { 'Content-Type': 'application/json' },
    data: {
      client_name: 'v2 command proof',
      redirect_uris: [`${origin}/PXLBLZ-IDE/oauth-callback`],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
  })
  expect(response.status(), await response.text()).toBe(201)
  return await response.json() as Client
}

/** The real consent page, answered by the signed-in person in this browser. */
async function accessToken(page: Page, client: Client): Promise<string> {
  const origin = new URL(page.url()).origin
  const verifier = 'v2-command-proof-verifier-000000000000000000'
  const digest = await page.evaluate(async (value) => {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }, verifier)
  await serveConsentFont(page)
  const redirectUri = `${origin}/PXLBLZ-IDE/oauth-callback`
  // The client's own callback is outside this app; answer it here so the real
  // consent click still navigates, without a 404 from the dev server.
  await page.route(`${redirectUri}*`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>callback</title>' }))
  const authorize = `${origin}/oauth/authorize?${new URLSearchParams({
    agent: '1', client_id: client.client_id, redirect_uri: redirectUri, response_type: 'code',
    scope: 'agent:connect', state: 'v2-command-proof', resource: `${origin}/mcp`,
    code_challenge_method: 'S256', code_challenge: digest,
  })}`
  await page.goto(authorize)
  await expect(page.getByRole('heading', { name: /connect/i }).first()).toBeVisible()
  await Promise.all([
    page.waitForURL(url => url.pathname.endsWith('/oauth-callback')),
    page.getByRole('button', { name: /allow/i }).click(),
  ])
  const code = new URL(page.url()).searchParams.get('code')
  expect(code, page.url()).toBeTruthy()
  const token = await page.request.post('/oauth/token', {
    form: {
      client_id: client.client_id, resource: `${origin}/mcp`, grant_type: 'authorization_code',
      code: code!, code_verifier: verifier, redirect_uri: redirectUri,
    },
  })
  expect(token.ok(), await token.text()).toBe(true)
  return (await token.json() as { access_token: string }).access_token
}

function mcp(page: Page, token: string) {
  return async (name: string, args: object = {}): Promise<Record<string, unknown>> => {
    const response = await page.request.post('/mcp', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    })
    const body = await response.json() as { result?: { structuredContent?: Record<string, unknown> } }
    expect(body.result?.structuredContent, JSON.stringify(body)).toBeTruthy()
    return body.result!.structuredContent!
  }
}

async function createShow(page: Page): Promise<string> {
  const addShow = page.getByRole('button', { name: 'Add show' })
  const openShows = page.getByRole('button', { name: 'Open the Shows list' })
  await expect(addShow.or(openShows).first()).toBeVisible()
  if (await openShows.isVisible()) await openShows.click()
  await addShow.click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+/)
  return new URL(page.url()).pathname.split('/').at(-1)!
}

test('an external agent renames and reshapes a v2 Show through MCP on the production route', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('studio/shows')
  const showId = await createShow(page)

  const client = await registerClient(page)
  const token = await accessToken(page, client)
  const tool = mcp(page, token)

  // Back on the production route, holding the v2 record, with the binding armed.
  await page.goto(`studio/shows/${showId}`)
  await expect(page.getByTestId('show-editor-v2-route')).toBeVisible()
  await expect(page.getByTestId('show-editor-v2-route-version')).toHaveText('v2')
  const edge = page.getByRole('button', { name: /^Open the Agent drawer/ })
  await expect(edge).toBeVisible()
  await edge.click()
  const external = page.getByRole('button', { name: 'Connect your agent with MCP' })
  await expect(external).toBeVisible()
  await external.click()
  const ready = page.getByRole('button', { name: /^Ready to connect/ })
  await expect(ready).toBeVisible()
  await ready.click()

  const connected = await tool('get_connection')
  expect(connected.code).toBe('bound')
  const binding_id = connected.binding_id as string

  // The editor holds v2, so read_show answers v2 and the v2 catalogue applies.
  const read = await tool('read_show', { binding_id })
  expect(read.code).toBe('read')
  expect((read.show as { version: number }).version).toBe(2)
  const clips = (read.show as { composition: { clips: Array<{ id: string }> } }).composition.clips
  expect(clips.length).toBeGreaterThan(1)

  const begun = await tool('begin_edit', { binding_id, intent: 'Rename and shorten the Show', idempotency_key: 'v2-begin' })
  expect(begun.code).toBe('begun')
  const identity = { binding_id, operation_id: begun.operation_id as string }
  expect((await tool('rename_show', { ...identity, idempotency_key: 'v2-rename', name: 'Renamed by MCP' })).code).toBe('changed')
  expect((await tool('remove_clips', { ...identity, idempotency_key: 'v2-remove', clip_ids: [clips[clips.length - 1].id] })).code).toBe('changed')
  expect((await tool('commit_edit', { ...identity, idempotency_key: 'v2-commit' })).code).toBe('outcome')
  await expect.poll(async () => (await tool('get_outcome', identity)).receipt, { timeout: 30_000 })
    .toMatchObject({ status: 'applied', settlement: 'saved' })

  // What the author sees, and what storage returns on a fresh load.
  await expect(page.getByRole('heading', { name: 'Renamed by MCP' })).toBeVisible()
  const surface = page.getByTestId('show-timeline-read-only')
  await expect(surface.getByRole('button', { name: /^Clip / })).toHaveCount(clips.length - 1)

  const stored = await page.request.get('/api/shows?show-version=2')
  expect(stored.ok(), await stored.text()).toBe(true)
  const saved = ((await stored.json()) as { shows: Array<{ id: string; name: string; composition: { clips: Array<{ id: string }> } }> })
    .shows.find(show => show.id === showId)
  expect(saved?.name).toBe('Renamed by MCP')
  expect(saved?.composition.clips).toHaveLength(clips.length - 1)

  await page.goto(`studio/shows/${showId}`)
  await expect(page.getByTestId('show-editor-v2-route-version')).toHaveText('v2')
  await expect(page.getByRole('heading', { name: 'Renamed by MCP' })).toBeVisible()

  expect(errors, errors.join('\n')).toEqual([])
})
