import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createSessionToken } from '../../cloudflare/auth'
import { createAgentBrowserSession } from '../../agent/browserSession'
import type { createAgentEditorAdmission } from '../../agent/editorAdmission'
import { showCommandFixture } from '../../test/showCommandFixture'

let script: string
const runtimes: Miniflare[] = []
beforeAll(async () => {
  const bundle = await build({ entryPoints: ['src/worker/index.ts'], external: ['cloudflare:workers'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  script = bundle.outputFiles[0].text
})
afterAll(async () => { await Promise.all(runtimes.map(runtime => runtime.dispose())) })
interface Namespace { idFromName(name: string): unknown; get(id: unknown): { fetch(url: string, init: RequestInit): Promise<Response> } }
async function fixture() {
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-06-30', bindings: { SESSION_SECRET: 'ordering-test', AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'ordering-account' }, durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true } } }))
  runtimes.push(runtime)
  const cookie = `pxlblz_session=${await createSessionToken({ userId: 'ordering-account', primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'ordering-test')}`
  const ns = await runtime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as Namespace
  const owner = ns.get(ns.idFromName('ordering-account'))
  const internal = async (body: object) => (await owner.fetch('https://internal/account', { method: 'POST', body: JSON.stringify(body) })).json() as Promise<{ code: string }>
  const request = { sessionId: 'session', showId: 'stock-show-100-getting-around', operationId: 'binding:op', baseRevision: 0, payloadKey: '', referenceContext: '{}', targets: ['clip-a'] }
  const admission = {
    sessionId: 'session', available: () => true, onClose: () => () => {},
    getShow: showCommandFixture, getEditorFocus: () => ({}), captureCommandContext: () => ({ commandContext: { source: () => undefined }, retainedBytes: 1 }),
    beginRequest: vi.fn(() => ({ request, show: showCommandFixture(), context: {} })),
    readOutcome: () => ({ request, status: 'pending' }), cancel: vi.fn(() => ({ request, status: 'cancelled' })),
    applyShow: vi.fn(() => ({ request, status: 'applied', settlement: 'draft' })), complete: vi.fn(),
  }
  let delayType: string | undefined
  let release: (() => void) | undefined
  let held: { code: string; connection?: { kind: string } } | undefined
  let receives = 0
  const session = createAgentBrowserSession({ admission: admission as unknown as ReturnType<typeof createAgentEditorAdmission>, showId: request.showId, fetch: async (_url, init) => {
    const body = JSON.parse(init?.body as string)
    if (body.type === 'receive') receives++
    const response = await runtime.dispatchFetch('https://app.test/api/agent/channel?agent=1', { method: 'POST', headers: { Origin: 'https://app.test', 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })
    const result = await response.json() as { code: string; connection?: { kind: string } }
    if (body.type === delayType) { held = result; await new Promise<void>(resolve => { release = resolve }) }
    return Response.json(result)
  } })
  await session.ready
  const identity = { agentKind: 'external', agentId: 'client', agentName: 'External', callId: 'call', bindingId: 'binding' }
  const begin = () => internal({ type: 'relay-dispatch', accountId: 'ordering-account', identity, delivery: { operationId: 'op', deliveryId: 'begin', sequence: 0, payload: { kind: 'begin_edit' } } })
  const assertPreserved = async (pending: Promise<unknown>) => {
    expect(await begin()).toMatchObject({ code: 'begun' })
    expect(session.getConnection()).toMatchObject({ kind: 'bound', bindingId: 'binding' })
    expect(admission.cancel).not.toHaveBeenCalled()
    release!(); await pending
    expect(session.getConnection()).toMatchObject({ kind: 'bound', bindingId: 'binding' })
    expect(admission.cancel).not.toHaveBeenCalled()
    expect(await internal({ type: 'inspect', ...identity })).toMatchObject({ code: 'bound' })
    expect(await internal({ type: 'relay-query', accountId: 'ordering-account', identity, query: { kind: 'get_outcome', operationId: 'op' } })).toMatchObject({ code: 'outcome', receipt: { status: 'pending' } })
    expect(await internal({ type: 'relay-dispatch', accountId: 'ordering-account', identity, delivery: { operationId: 'op', deliveryId: 'commit', sequence: 1, payload: { kind: 'commit_edit' } } })).toMatchObject({ code: 'outcome' })
    expect(admission.beginRequest).toHaveBeenCalledOnce(); expect(admission.applyShow).toHaveBeenCalledOnce()
  }
  return { session, identity, internal, assertPreserved, delay(type: string) { delayType = type }, held: () => held, receives: () => receives }
}
it.each(['arm', 'disarm', 'answer'] as const)('a delayed %s result cannot supersede a newer authoritative bound receive', async kind => {
  const f = await fixture()
  try {
    if (kind === 'disarm') await f.session.arm()
    if (kind === 'answer') expect(await f.internal({ type: 'claim', ...f.identity })).toMatchObject({ code: 'pending' })
    f.delay(kind)
    const previousReceives = f.receives()
    const pending = kind === 'arm' ? f.session.arm() : kind === 'disarm' ? f.session.cancelArm() : f.session.answer('call')
    await vi.waitFor(() => expect(f.held()).toBeDefined())
    // The action wakes the existing long poll; a later receive can report the
    // next state while the independent control HTTP response remains delayed.
    await vi.waitFor(() => expect(f.receives()).toBeGreaterThan(previousReceives))
    if (kind === 'arm') expect(await f.internal({ type: 'claim', ...f.identity })).toMatchObject({ code: 'bound' })
    if (kind === 'disarm') {
      f.identity.agentKind = 'builtin'
      expect(await f.internal({ type: 'claim', ...f.identity, window: f.session.getWindow() })).toMatchObject({ code: 'bound' })
    }
    await f.assertPreserved(pending)
  } finally { f.session.close() }
}, 15_000)
