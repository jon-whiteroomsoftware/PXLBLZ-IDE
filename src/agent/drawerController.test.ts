// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createProductionDrawerController, type DrawerChannelEvent, type DrawerChannelPort } from './drawerController'
import { useAgentDrawerStore } from './drawerStore'
import type { createAgentEditorAdmission } from './editorAdmission'
let stop: (() => void) | undefined
afterEach(() => { stop?.(); vi.restoreAllMocks() })
function fixture() {
  let listener: (event: DrawerChannelEvent) => void = () => {}
  let receipt: unknown
  const channel = { getConnection: () => ({ kind: 'idle' }), subscribe: (fn: typeof listener) => { listener = fn; return () => { listener = () => {} } }, getOutcome: () => receipt ? ({ code: 'outcome', receipt }) : ({ code: 'unknown' }), close: vi.fn(), arm: vi.fn(async () => ({ code: 'occupied' })), cancelArm: vi.fn(async () => ({ code: 'idle' })), answer: vi.fn(async () => ({ code: 'bound' })), decline: vi.fn(async () => ({ code: 'declined' })), disconnect: vi.fn(async () => ({ code: 'disconnected' })), forget: vi.fn(async () => ({ code: 'forgotten' })) } as unknown as DrawerChannelPort
  const api = { available: () => true, onClose: () => () => {}, readOutcome: () => receipt, retryIntent: () => undefined, cancel: vi.fn() } as unknown as ReturnType<typeof createAgentEditorAdmission>
  const builtin = vi.fn(async (_body: Record<string, unknown>) => ({ code: 'occupied' } as Record<string, unknown> & { code: string }))
  const controller = createProductionDrawerController(api, 'show', channel, builtin)
  stop = controller.dispose
  return { controller, channel, api, builtin, setReceipt: (value: unknown) => { receipt = value }, emit: (event: DrawerChannelEvent) => listener(event) }
}
it('does not optimistically bind or arm on refused account actions', async () => {
  const f = fixture()
  f.controller.dispatch({ type: 'chooseBuiltin' })
  await vi.waitFor(() => expect(f.builtin).toHaveBeenCalledOnce())
  expect(useAgentDrawerStore.getState().state.connection).toBeNull()
  f.controller.dispatch({ type: 'connectOwn', now: 0 })
  await vi.waitFor(() => expect(f.channel.arm).toHaveBeenCalledOnce())
  expect(useAgentDrawerStore.getState().state.armingUntil).toBeNull()
})
it('uses actual connection events and preserves an in-flight action during contact loss', () => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  f.controller.dispatch({ type: 'beginEdit', id: 'op', intent: 'Edit' })
  f.emit({ type: 'connection', connection: { kind: 'contact-lost', previous: { kind: 'idle' } } })
  expect(useAgentDrawerStore.getState().state).toMatchObject({ connection: { kind: 'builtin' }, contactLost: true, request: { id: 'op' } })
  f.controller.restoreContact()
  expect(useAgentDrawerStore.getState().state.contactLost).toBe(true)
})
it('preserves the composer draft when server start refuses and closes only its channel on disposal', async () => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  f.controller.dispatch({ type: 'draft', text: 'Keep this request' })
  f.controller.submit()
  await vi.waitFor(() => expect(f.builtin).toHaveBeenCalledWith({ action: 'begin' }))
  expect(useAgentDrawerStore.getState().state.draft).toBe('Keep this request')
  f.controller.dispose()
  expect(f.channel.close).toHaveBeenCalledOnce()
  expect(useAgentDrawerStore.getState().controller).toBeNull()
})
it('attributes only successful owned changes once and keeps Send disabled while saving', () => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  const request = { operationId: 'binding:op', sessionId: 'session', showId: 'show', baseRevision: 0, payloadKey: '{}', referenceContext: '{}', targets: ['clip'] }
  const delivery = (deliveryId: string, payload: unknown, result: { code: string; [key: string]: unknown }) => f.emit({ type: 'delivery', delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'op', deliveryId, sequence: 0, payload }, result, request })
  f.setReceipt({ request, status: 'pending' })
  delivery('begin', { kind: 'begin_edit', intent: 'Resize' }, { code: 'begun' })
  const command = { kind: 'command', name: 'resize_clip', arguments: { duration_ms: 1000 } }
  const result = { code: 'changed', changes: [{ command: 'resize_clip', targetId: 'clip', description: 'Clip resized' }] }
  delivery('change', command, result); delivery('change', command, result)
  f.setReceipt({ request, status: 'applied', settlement: 'saving' })
  delivery('commit', { kind: 'commit_edit' }, { code: 'outcome', receipt: { request, status: 'applied', settlement: 'saving' } })
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'op')?.changes).toHaveLength(1)
  expect(useAgentDrawerStore.getState().busy).toBe(true)
  f.controller.dispatch({ type: 'draft', text: 'Next request' }); f.controller.submit()
  expect(f.builtin).not.toHaveBeenCalled()
})
