// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createProductionDrawerController, type DrawerChannelEvent, type DrawerChannelPort } from './drawerController'
import { useAgentDrawerStore } from './drawerStore'
import { createAgentEditorAdmission } from './editorAdmission'
import { createDefaultShow } from '@/engine/showModel'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { createAgentPrivateExecutor } from '@/engine/agentPrivateExecutor'
import { createAgentPrivateAdmissionOwner } from './privateAdmissionOwner'
import { showInitialState, useShowStore } from '@/store/showStore'
let stop: (() => void) | undefined
afterEach(() => { stop?.(); resetPersonalContentProvider(); vi.restoreAllMocks() })
function fixture(admission?: ReturnType<typeof createAgentEditorAdmission>) {
  let listener: (event: DrawerChannelEvent) => void = () => {}
  let receipt: unknown
  const channel = { getConnection: () => ({ kind: 'idle' }), subscribe: (fn: typeof listener) => { listener = fn; return () => { listener = () => {} } }, getOutcome: () => receipt ? ({ code: 'outcome', receipt }) : ({ code: 'unknown' }), close: vi.fn(), arm: vi.fn(async () => ({ code: 'occupied' })), cancelArm: vi.fn(async () => ({ code: 'idle' })), answer: vi.fn(async () => ({ code: 'bound' })), decline: vi.fn(async () => ({ code: 'declined' })), disconnect: vi.fn(async () => ({ code: 'disconnected' })), forget: vi.fn(async () => ({ code: 'forgotten' })) } as unknown as DrawerChannelPort
  const api = admission ?? { available: () => true, onClose: () => () => {}, readOutcome: () => receipt, retryIntent: () => undefined, cancel: vi.fn() } as unknown as ReturnType<typeof createAgentEditorAdmission>
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
it('registers the returned qualified Retry operation and tracks saving without replacing failure or draft', async () => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  const original = { operationId: 'binding:old', sessionId: 'session', showId: 'show', baseRevision: 0, payloadKey: '{}', referenceContext: '{}', targets: ['clip'] }
  const request = { ...original, operationId: 'binding:new', retryOf: original.operationId, baseRevision: 1 }
  f.setReceipt({ request: original, status: 'pending' })
  f.emit({ type: 'delivery', delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'old', deliveryId: 'begin', sequence: 0, payload: { kind: 'begin_edit', intent: 'Resize original Clip' } }, result: { code: 'begun' }, request: original })
  f.setReceipt({ request: original, status: 'applied', settlement: 'rolled-back' })
  f.emit({ type: 'delivery', delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'old', deliveryId: 'commit', sequence: 1, payload: { kind: 'commit_edit' } }, result: { code: 'outcome', receipt: { request: original, status: 'applied', settlement: 'rolled-back' } }, request: original })
  vi.spyOn(f.api, 'retryIntent').mockReturnValue({ clipId: 'clip', durationMs: 1000 } as never)
  f.channel.retry = vi.fn(async () => {
    const receipt = { request, status: 'applied', settlement: 'saving' }
    f.setReceipt(receipt)
    return { code: 'outcome', operationId: 'new', request, retryOf: original.operationId, receipt }
  })
  f.controller.dispatch({ type: 'draft', text: 'Unrelated composer draft' })
  f.controller.retry('old')
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'new')).toMatchObject({ retryOf: 'old', outcome: 'applied' }))
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'old')).toMatchObject({ outcome: 'rolled-back' })
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'old')?.dismissed).not.toBe(true)
  expect(useAgentDrawerStore.getState().state.draft).toBe('Unrelated composer draft')
  expect(useAgentDrawerStore.getState().busy).toBe(true)
  f.setReceipt({ request, status: 'applied', settlement: 'saved' })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'new')?.outcome).toBe('saved'))
  expect(f.builtin).not.toHaveBeenCalled()
})
it('settles and preserves an owned local outcome when provider configuration becomes unavailable', async () => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  const request = { operationId: 'binding:op', sessionId: 'session', showId: 'show', baseRevision: 0, payloadKey: '{}', referenceContext: '{}', targets: ['clip'] }
  f.setReceipt({ request, status: 'pending' })
  f.emit({ type: 'delivery', delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'op', deliveryId: 'begin', sequence: 0, payload: { kind: 'begin_edit' } }, result: { code: 'begun' }, request })
  f.setReceipt({ request, status: 'applied', settlement: 'saving' })
  f.emit({ type: 'delivery', delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'op', deliveryId: 'commit', sequence: 1, payload: { kind: 'commit_edit' } }, result: { code: 'outcome', receipt: { request, status: 'applied', settlement: 'saving' } }, request })
  f.builtin.mockResolvedValue({ code: 'unavailable' })
  f.emit({ type: 'connection', connection: { kind: 'refused', code: 'service_disabled' } })
  f.setReceipt({ request, status: 'applied', settlement: 'saved' })
  f.controller.restoreContact()
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'op')?.outcome).toBe('saved')
  expect(f.builtin).not.toHaveBeenCalled()
})

it.each(['halted', 'no_live_editor'])('settles an original run refused before dispatch (%s) and preserves the draft', async code => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  f.builtin.mockImplementation(async body => body.action === 'begin' ? { code: 'started', operationId: 'op' } : { code, dispatch: 'not_attempted' })
  f.controller.dispatch({ type: 'draft', text: 'Keep this request' }); f.controller.submit()
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().busy).toBe(false))
  expect(useAgentDrawerStore.getState().state).toMatchObject({ request: null, draft: 'Keep this request' })
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'op')).toMatchObject({ outcome: 'not-applied' })
})
it.each(['pending', 'unknown', 'duplicate', 'finished', 'expired'])('keeps %s run outcomes unresolved without replay', async code => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  f.builtin.mockImplementation(async body => body.action === 'begin' ? { code: 'started', operationId: 'op' } : { code })
  f.controller.dispatch({ type: 'draft', text: 'Edit' }); f.controller.submit()
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().busy).toBe(false))
  expect(useAgentDrawerStore.getState().state.request?.id).toBe('op')
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'op')?.outcome).toBe('unknown')
  f.controller.submit(); expect(f.builtin).toHaveBeenCalledTimes(2)
})
it('preserves a newer draft and cancels a late admission after original dispatch refusal', async () => {
  const f = fixture(); let finish!: (result: { code: string; dispatch: string }) => void
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  f.builtin.mockImplementation(async body => body.action === 'begin' ? { code: 'started', operationId: 'op' } : new Promise(resolve => { finish = resolve }))
  f.controller.dispatch({ type: 'draft', text: 'Original' }); f.controller.submit()
  await vi.waitFor(() => expect(finish).toBeDefined())
  f.controller.dispatch({ type: 'draft', text: 'New draft' }); finish({ code: 'no_live_editor', dispatch: 'not_attempted' })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().busy).toBe(false))
  expect(useAgentDrawerStore.getState().state.draft).toBe('New draft')
  const request = { operationId: 'binding:op', sessionId: 'session', showId: 'show', baseRevision: 0, payloadKey: '{}', referenceContext: '{}', targets: [] }
  vi.mocked(f.api.cancel).mockReturnValue({ request, status: 'cancelled' })
  f.emit({ type: 'delivery', delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'op', deliveryId: 'begin', sequence: 0, payload: { kind: 'begin_edit' } }, result: { code: 'begun' }, request })
  expect(f.api.cancel).toHaveBeenCalledWith(request)
})
it('the refusal barrier prevents a late real private candidate from entering history or saving', async () => {
  window.history.replaceState(null, '', '/studio/shows/show?agent=1')
  useShowStore.setState(showInitialState)
  const show = createDefaultShow('show', 'Original'), writes = vi.fn(async () => {})
  setPersonalContentProvider({ updateShow: writes, listShows: async () => [show] } as unknown as PersonalContentProvider)
  await useShowStore.getState().loadShows()
  const admission = createAgentEditorAdmission('show', () => ({}))
  const f = fixture(admission)
  stop = () => { f.controller.dispose(); admission.close() }
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  f.builtin.mockImplementation(async body => body.action === 'begin' ? { code: 'started', operationId: 'op' } : { code: 'halted', dispatch: 'not_attempted' })
  f.controller.dispatch({ type: 'draft', text: 'Rename' }); f.controller.submit()
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().busy).toBe(false))
  const scope = { bindingId: 'binding', sessionId: admission.sessionId }
  const executor = createAgentPrivateExecutor(scope, createAgentPrivateAdmissionOwner(admission))
  const delivery = { ...scope, registrationId: 'reg', showId: 'show', operationId: 'op', deliveryId: 'd0', sequence: 0, payload: { kind: 'begin_edit' } }
  const result = executor.deliver(delivery)
  expect(result.code).toBe('begun')
  f.emit({ type: 'delivery', delivery, result, request: executor.getRequest('op') })
  executor.deliver({ ...delivery, deliveryId: 'd1', sequence: 1, payload: { kind: 'command', name: 'rename_show', arguments: { name: 'Must not adopt' } } })
  expect(executor.deliver({ ...delivery, deliveryId: 'd2', sequence: 2, payload: { kind: 'commit_edit' } })).toMatchObject({ receipt: { status: 'cancelled' } })
  expect(useShowStore.getState().shows[0]).toEqual(show)
  expect(useShowStore.getState().showHistories.show?.past ?? []).toHaveLength(0)
  expect(writes).not.toHaveBeenCalled()
})
it('an already-known local saved receipt wins over an invocation refusal marker', async () => {
  const f = fixture(); let finish!: (result: { code: string; dispatch: string }) => void
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  f.builtin.mockImplementation(async body => body.action === 'begin' ? { code: 'started', operationId: 'op' } : new Promise(resolve => { finish = resolve }))
  f.controller.dispatch({ type: 'draft', text: 'Original' }); f.controller.submit()
  await vi.waitFor(() => expect(finish).toBeDefined())
  const request = { operationId: 'binding:op', sessionId: 'session', showId: 'show', baseRevision: 0, payloadKey: '{}', referenceContext: '{}', targets: [] }
  f.setReceipt({ request, status: 'applied', settlement: 'saved' })
  f.emit({ type: 'delivery', delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'op', deliveryId: 'begin', sequence: 0, payload: { kind: 'begin_edit' } }, result: { code: 'begun' }, request })
  finish({ code: 'no_live_editor', dispatch: 'not_attempted' })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().busy).toBe(false))
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'op')?.outcome).toBe('saved')
  expect(f.api.cancel).not.toHaveBeenCalled()
  expect(useAgentDrawerStore.getState().state.draft).toBe('')
})
it('keeps one command entry from submission through its attached reply', async () => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  let finish!: (result: { code: string; message: string; dispatch: 'not_attempted' }) => void
  f.builtin.mockImplementation(async body => body.action === 'begin' ? { code: 'started', operationId: 'one' } : new Promise(resolve => { finish = resolve }))
  f.controller.dispatch({ type: 'draft', text: 'Resize the first Clip' })
  f.controller.submit()
  await vi.waitFor(() => expect(finish).toBeDefined())
  expect(useAgentDrawerStore.getState().state.stream).toHaveLength(1)
  expect(useAgentDrawerStore.getState().state.stream[0]).toMatchObject({ text: 'Resize the first Clip', phase: 'working' })
  finish({ code: 'unavailable', dispatch: 'not_attempted', message: 'No edit was made.' })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.stream[0].outcome).toBe('not-applied'))
  expect(useAgentDrawerStore.getState().state.stream).toHaveLength(1)
  expect(useAgentDrawerStore.getState().state.stream[0]).toMatchObject({ reply: 'No edit was made.', phase: undefined })
})
