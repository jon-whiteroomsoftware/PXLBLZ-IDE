import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createSessionToken } from '../../cloudflare/auth'
import { STOCK_SHOW_IDS } from '../../pixelblaze/stock/showIds'

let runtime: Miniflare
let cookie: string
const showId = STOCK_SHOW_IDS[0]
interface Namespace { idFromName(name: string): unknown; get(id: unknown): { fetch(url: string, init: RequestInit): Promise<Response> } }
beforeAll(async () => {
  const bundle = await build({ entryPoints: ['src/worker/index.ts'], external: ['cloudflare:workers'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-06-30', bindings: { SESSION_SECRET: 'relay-test', AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'relay-account' }, durableObjects: { AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true } } }))
  cookie = `pxlblz_session=${await createSessionToken({ userId: 'relay-account', primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'relay-test')}`
}, 30_000)
afterAll(async () => { await runtime?.dispose() })
const channel = (body: unknown) => runtime.dispatchFetch('https://app.test/api/agent/channel?agent=1', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://app.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
async function internal(body: unknown) {
  const ns = await runtime.getDurableObjectNamespace('AGENT_ACCOUNTS') as unknown as Namespace
  return ns.get(ns.idFromName('relay-account')).fetch('https://internal/account', { method: 'POST', body: JSON.stringify(body) })
}
it('routes a trusted claim through held browser receive/reply without holding the coordination transaction', async () => {
  const registration = await (await channel({ type: 'register', sessionId: 'live', showId })).json() as { registrationId: string }
  const window = { ...registration, sessionId: 'live', showId }
  // Construct exact public capability, never echo response metadata into commands.
  const own = { registrationId: window.registrationId, sessionId: window.sessionId, showId }
  const identity = { agentKind: 'builtin', agentId: 'builtin', agentName: 'Assistant', callId: 'call', bindingId: 'binding' }
  expect(await (await internal({ type: 'claim', ...identity, window: own })).json()).toMatchObject({ code: 'bound' })
  const receiving = channel({ type: 'receive', ...own })
  const delivery = { operationId: 'operation', deliveryId: 'delivery', sequence: 0, payload: { kind: 'begin_edit' } }
  const dispatching = internal({ type: 'relay-dispatch', accountId: 'relay-account', identity, delivery })
  const received = await (await receiving).json() as { deliveries: unknown[] }
  expect(received.deliveries).toEqual([{ ...own, bindingId: 'binding', ...delivery }])
  expect(await (await channel({ type: 'reply', ...own, sessionId: 'old', bindingId: 'binding', operationId: 'operation', deliveryId: 'delivery', result: { code: 'forged' } })).json()).toEqual({ code: 'retired' })
  expect(await (await channel({ type: 'reply', ...own, bindingId: 'binding', operationId: 'operation', deliveryId: 'delivery', result: { code: 'begun' } })).json()).toEqual({ code: 'received' })
  expect(await (await dispatching).json()).toEqual({ code: 'begun' })
  expect(await (await internal({ type: 'relay-dispatch', accountId: 'relay-account', identity, delivery })).json()).toEqual({ code: 'begun' })
  const held = internal({ type: 'relay-dispatch', accountId: 'relay-account', identity, delivery: { ...delivery, sequence: 1, deliveryId: 'second', payload: { kind: 'commit_edit' } } })
  expect(await (await channel({ type: 'disconnect', ...own, bindingId: 'binding' })).json()).toEqual({ code: 'disconnected' })
  expect(await (await held).json()).toMatchObject({ code: expect.stringMatching(/connection_retired|no_live_editor/) })
  expect(await (await channel({ type: 'reply', ...own, bindingId: 'binding', operationId: 'operation', deliveryId: 'second', result: { code: 'applied' } })).json()).toEqual({ code: 'retired' })
  await channel({ type: 'leave', ...own })
}, 10_000)
it('accepts only exact stock IDs and disarms only the armed owning window', async () => {
  expect(await (await channel({ type: 'register', sessionId: 'invented', showId: 'stock-show-made-up' })).json()).toEqual({ code: 'unavailable' })
  const registration = await (await channel({ type: 'register', sessionId: 'armed', showId })).json() as { registrationId: string }
  const own = { registrationId: registration.registrationId, sessionId: 'armed', showId }
  expect(await (await channel({ type: 'arm', ...own })).json()).toMatchObject({ code: 'armed' })
  expect(await (await channel({ type: 'disarm', ...own, sessionId: 'wrong' })).json()).toEqual({ code: 'retired' })
  expect(await (await channel({ type: 'disarm', ...own })).json()).toEqual({ code: 'disarmed' })
  expect(await (await channel({ type: 'poll', ...own })).json()).toMatchObject({ connection: { kind: 'idle' } })
  await channel({ type: 'leave', ...own })
})

it('evicts an account owner, retires its persisted old binding, and admits only a fresh generation', async () => {
  const registration = await (await channel({ type: 'register', sessionId: 'recreated', showId })).json() as { registrationId: string }
  const own = { registrationId: registration.registrationId, sessionId: 'recreated', showId }
  const old = { agentKind: 'external', agentId: 'grant', agentName: 'Client', callId: 'old-call', bindingId: 'old-binding' }
  await channel({ type: 'arm', ...own })
  expect(await (await internal({ type: 'claim', ...old })).json()).toMatchObject({ code: 'bound' })

  await runtime.unsafeEvictDurableObject('', 'AgentAccount', { name: 'relay-account' })
  const oldAttempt = { type: 'external-tool-dispatch', agentId: 'grant', expectedBindingId: 'old-binding', delivery: { idempotencyKey: 'begin-key', payload: { kind: 'begin_edit', intent: 'Rename the Show' } } }
  expect(await (await internal(oldAttempt)).json()).toEqual({ code: 'retirement_unconfirmed' })
  expect(await (await internal(oldAttempt)).json()).toEqual({ code: 'retirement_unconfirmed' })
  expect(await (await channel({ type: 'receive', ...own, lastSeenConnection: 'force-retirement' })).json()).toMatchObject({ connection: { kind: 'retiring', bindingId: 'old-binding' }, deliveries: [] })
  expect(await (await channel({ type: 'retirement-ack', ...own, bindingId: 'old-binding' })).json()).toEqual({ code: 'editing_ended' })

  await channel({ type: 'arm', ...own })
  const fresh = { ...old, callId: 'fresh-call', bindingId: 'fresh-binding' }
  expect(await (await internal({ type: 'claim', ...fresh })).json()).toMatchObject({ code: 'bound' })
  const reading = internal({ type: 'external-tool-query', agentId: 'grant', expectedBindingId: 'fresh-binding', query: { kind: 'read_show' } })
  const receive = await (await channel({ type: 'receive', ...own })).json() as { deliveries: Array<{ operationId: string; deliveryId: string }> }
  expect(receive.deliveries).toHaveLength(1)
  const delivery = receive.deliveries[0]
  await channel({ type: 'reply', ...own, bindingId: 'fresh-binding', operationId: delivery.operationId, deliveryId: delivery.deliveryId, result: { code: 'read', show: { id: showId } } })
  expect(await (await reading).json()).toMatchObject({ code: 'read', show: { id: showId } })
  const beginning = internal({ type: 'external-tool-dispatch', agentId: 'grant', expectedBindingId: 'fresh-binding', delivery: { idempotencyKey: 'fresh-begin', payload: { kind: 'begin_edit', intent: 'Rename the Show' } } })
  const beginReceive = await (await channel({ type: 'receive', ...own })).json() as { deliveries: Array<{ operationId: string; deliveryId: string; sequence: number }> }
  const begin = beginReceive.deliveries[0]
  expect(begin.sequence).toBe(0)
  await channel({ type: 'reply', ...own, bindingId: 'fresh-binding', operationId: begin.operationId, deliveryId: begin.deliveryId, result: { code: 'begun', operationId: begin.operationId } })
  expect(await (await beginning).json()).toEqual({ code: 'begun', operationId: begin.operationId })
  await channel({ type: 'disconnect', ...own, bindingId: 'fresh-binding' })
  await channel({ type: 'leave', ...own })
}, 10_000)
