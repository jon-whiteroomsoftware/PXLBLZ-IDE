// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createProductionDrawerController, type DrawerChannelEvent, type DrawerChannelPort } from './drawerController'
import { useAgentDrawerStore } from './drawerStore'
import { createAgentEditorAdmission } from './editorAdmission'
import { createDefaultShow } from '@/engine/showModel'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { createAgentPrivateExecutor, type PrivateEditResult } from '@/engine/agentPrivateExecutor'
import { createAgentPrivateAdmissionOwner } from './privateAdmissionOwner'
import { showInitialState, useShowStore } from '@/store/showStore'
import type { AgentMessageAllowance } from '@/engine/agentAllowance'
let stop: (() => void) | undefined
afterEach(() => { stop?.(); resetPersonalContentProvider(); vi.restoreAllMocks(); vi.useRealTimers() })
const availableAllowance = (remaining = 30, revision = 1): AgentMessageAllowance => ({ code: 'available', limit: 30, remaining, resetAt: Date.now() + 86_400_000, revision })
function fixture(admission?: ReturnType<typeof createAgentEditorAdmission>, initialAllowance = availableAllowance()) {
  let listener: (event: DrawerChannelEvent) => void = () => {}
  let receipt: unknown
  const channel = { getConnection: () => ({ kind: 'idle' }), subscribe: (fn: typeof listener) => { listener = fn; return () => { listener = () => {} } }, getOutcome: () => receipt ? ({ code: 'outcome', receipt }) : ({ code: 'unknown' }), close: vi.fn(), arm: vi.fn(async () => ({ code: 'occupied' })), cancelArm: vi.fn(async () => ({ code: 'idle' })), answer: vi.fn(async () => ({ code: 'bound' })), decline: vi.fn(async () => ({ code: 'declined' })), disconnect: vi.fn(async () => ({ code: 'disconnected' })), forget: vi.fn(async () => ({ code: 'forgotten' })), moveExternal: vi.fn(async () => ({ code: 'moved' })) } as unknown as DrawerChannelPort
  const api = admission ?? { available: () => true, onClose: () => () => {}, readOutcome: () => receipt, retryIntent: () => undefined, cancel: vi.fn() } as unknown as ReturnType<typeof createAgentEditorAdmission>
  const builtin = vi.fn(async (_body: Record<string, unknown>) => ({ code: 'occupied' } as Record<string, unknown> & { code: string }))
  const controller = createProductionDrawerController(api, 'show', channel, builtin, initialAllowance)
  stop = controller.dispose
  return { controller, channel, api, builtin, setReceipt: (value: unknown) => { receipt = value }, emit: (event: DrawerChannelEvent) => listener(event) }
}
it('shows catalog-controlled validation detail in the existing refusal reason line', () => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  const request = { operationId: 'binding:op', sessionId: 'session', showId: 'show', baseRevision: 0, payloadKey: '{}', referenceContext: '{}', targets: ['scene-2'] }
  f.setReceipt({ request, status: 'pending' })
  f.emit({ type: 'delivery', delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'op', deliveryId: 'begin', sequence: 0, payload: { kind: 'begin_edit' } }, result: { code: 'begun' }, request })
  const receipt = {
    request, status: 'refused', reason: 'invalid-candidate',
    diagnostic: {
      stage: 'authoring', truncated: false,
      issues: [{ category: 'structure', code: 'invalid-scene-duration', message: 'untrusted transported prose', path: '["scene","scene-2","durationMs"]' }],
    },
  }
  f.setReceipt(receipt)
  f.emit({ type: 'delivery', delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'op', deliveryId: 'commit', sequence: 1, payload: { kind: 'commit_edit' } }, result: { code: 'outcome', receipt }, request })
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'op')).toMatchObject({
    outcome: 'not-applied',
    reason: 'Scene duration must be a positive safe integer.',
  })
})
it('refreshes authoritative allowance on focus and ignores older or lower-revision responses', async () => {
  const resetAt = Date.now() + 86_400_000
  const f = fixture(undefined, { ...availableAllowance(30, 1), resetAt })
  let first!: (value: Record<string, unknown> & { code: string }) => void
  let second!: (value: Record<string, unknown> & { code: string }) => void
  f.builtin
    .mockImplementationOnce(() => new Promise(resolve => { first = resolve }))
    .mockImplementationOnce(() => new Promise(resolve => { second = resolve }))

  window.dispatchEvent(new Event('focus'))
  window.dispatchEvent(new Event('focus'))
  second({ code: 'status', allowance: { code: 'available', limit: 30, remaining: 28, resetAt, revision: 3 } })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.allowance.remaining).toBe(28))
  first({ code: 'status', allowance: { code: 'available', limit: 30, remaining: 29, resetAt, revision: 2 } })
  await Promise.resolve()

  expect(useAgentDrawerStore.getState().state.allowance).toMatchObject({ remaining: 28, revision: 3 })
  expect(f.builtin).toHaveBeenNthCalledWith(1, { action: 'status' })
})
it('fails closed on status loss without erasing the draft or settled activity', async () => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  f.controller.dispatch({ type: 'draft', text: 'Keep this request' })
  f.controller.dispatch({ type: 'beginEdit', id: 'saved', intent: 'Earlier edit' })
  f.controller.dispatch({ type: 'outcome', id: 'saved', outcome: 'saved' })
  f.builtin.mockRejectedValueOnce(new Error('offline'))

  window.dispatchEvent(new Event('focus'))
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.allowance.code).toBe('unavailable'))
  f.controller.submit()

  expect(useAgentDrawerStore.getState().state.draft).toBe('Keep this request')
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'saved')?.outcome).toBe('saved')
  expect(f.builtin).toHaveBeenCalledTimes(1)
})
it('refreshes the allowance once at the authoritative reset instant', async () => {
  vi.useFakeTimers()
  const now = new Date('2026-09-13T23:59:59.000Z').getTime()
  vi.setSystemTime(now)
  const f = fixture(undefined, { ...availableAllowance(0, 7), code: 'daily_message_limit', resetAt: now + 1000 })
  f.builtin.mockResolvedValue({ code: 'status', allowance: { ...availableAllowance(30, 8), resetAt: now + 86_401_000 } })

  await vi.advanceTimersByTimeAsync(1050)

  expect(f.builtin).toHaveBeenCalledWith({ action: 'status' })
  expect(useAgentDrawerStore.getState().state.allowance).toMatchObject({ code: 'available', remaining: 30, revision: 8 })
})
it('backs off after an early reset refresh until the server advances the UTC day', async () => {
  vi.useFakeTimers()
  const now = new Date('2026-09-13T23:59:59.000Z').getTime()
  const resetAt = now + 1000
  vi.setSystemTime(now)
  const f = fixture(undefined, { ...availableAllowance(0, 7), code: 'daily_message_limit', resetAt })
  f.builtin
    .mockResolvedValueOnce({ code: 'status', allowance: { ...availableAllowance(0, 7), code: 'daily_message_limit', resetAt } })
    .mockResolvedValueOnce({ code: 'status', allowance: { ...availableAllowance(30, 8), resetAt: resetAt + 86_400_000 } })

  await vi.advanceTimersByTimeAsync(1050)
  expect(f.builtin).toHaveBeenCalledTimes(1)
  expect(useAgentDrawerStore.getState().state.allowance).toMatchObject({ code: 'daily_message_limit', remaining: 0, revision: 7 })

  await vi.advanceTimersByTimeAsync(999)
  expect(f.builtin).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(f.builtin).toHaveBeenCalledTimes(2)
  expect(useAgentDrawerStore.getState().state.allowance).toMatchObject({ code: 'available', remaining: 30, revision: 8 })
})
it('bounds failed reset retries and lets focus recovery replace their timer', async () => {
  vi.useFakeTimers()
  const now = new Date('2026-09-14T00:00:02.000Z').getTime()
  const resetAt = now - 2000
  vi.setSystemTime(now)
  const f = fixture(undefined, { ...availableAllowance(0, 7), code: 'daily_message_limit', resetAt })
  f.builtin.mockRejectedValue(new Error('offline'))

  await vi.advanceTimersByTimeAsync(120_000)
  expect(f.builtin).toHaveBeenCalledTimes(4)
  expect(useAgentDrawerStore.getState().state.allowance.code).toBe('unavailable')
  await vi.advanceTimersByTimeAsync(120_000)
  expect(f.builtin).toHaveBeenCalledTimes(4)

  f.builtin.mockResolvedValueOnce({ code: 'status', allowance: { ...availableAllowance(30, 8), resetAt: now + 86_400_000 } })
  window.dispatchEvent(new Event('focus'))
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.allowance).toMatchObject({ code: 'available', remaining: 30, revision: 8 }))
  await vi.advanceTimersByTimeAsync(60_000)
  expect(f.builtin).toHaveBeenCalledTimes(5)
})
it.each([
  ['No agent connected', { kind: 'armed', expiresAt: Date.now() + 120_000 }],
  ['Missed connection', { kind: 'pending', callId: 'call', agentKind: 'external', agentName: 'External agent', expiresAt: Date.now() + 30_000 }],
] as const)('preserves %s when server idle wins the browser expiry race', (title, connection) => {
  const f = fixture()
  f.emit({ type: 'connection', connection } as DrawerChannelEvent)
  f.emit({ type: 'connection', connection: { kind: 'idle' } })
  expect(useAgentDrawerStore.getState().state.setupNotice).toMatchObject({ title })
})
it('does not fabricate expiry after explicit arm cancellation or call decline', () => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'armed', expiresAt: Date.now() + 120_000 } })
  f.controller.dispatch({ type: 'cancelArm' })
  f.emit({ type: 'connection', connection: { kind: 'idle' } })
  expect(useAgentDrawerStore.getState().state.setupNotice).toBeNull()

  f.emit({ type: 'connection', connection: { kind: 'pending', callId: 'call', agentKind: 'external', agentName: 'External agent', expiresAt: Date.now() + 30_000 } })
  f.controller.dispatch({ type: 'declineKnock' })
  f.emit({ type: 'connection', connection: { kind: 'idle' } })
  expect(useAgentDrawerStore.getState().state.setupNotice).toBeNull()
})
it('backs out of setup and changes a connected agent without erasing draft or activity', async () => {
  const f = fixture()
  f.controller.dispatch({ type: 'chooseExternal' })
  f.controller.backToChooser()
  expect(useAgentDrawerStore.getState().state.setupOpen).toBe(false)

  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  f.controller.dispatch({ type: 'draft', text: 'Keep this draft' })
  f.controller.dispatch({ type: 'beginEdit', id: 'saved', intent: 'Earlier edit' })
  f.controller.dispatch({ type: 'outcome', id: 'saved', outcome: 'saved' })
  let finishDisconnect!: (value: { code: 'disconnected' }) => void
  vi.mocked(f.channel.disconnect).mockImplementationOnce(() => new Promise(resolve => { finishDisconnect = resolve }) as never)
  f.controller.changeAgent()
  expect(useAgentDrawerStore.getState().state.connection).toMatchObject({ kind: 'builtin' })
  finishDisconnect({ code: 'disconnected' })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.connection).toBeNull())

  expect(f.channel.disconnect).toHaveBeenCalledOnce()
  expect(useAgentDrawerStore.getState().state.draft).toBe('Keep this draft')
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'saved')?.outcome).toBe('saved')
})
it('orders Back behind an in-flight arm and rejects its stale snapshots before a new attempt', async () => {
  const f = fixture()
  const firstUntil = Date.now() + 120_000
  const secondUntil = firstUntil + 1000
  let finishFirstArm!: (result: { code: 'armed'; connection: { kind: 'armed'; expiresAt: number } }) => void
  let finishCancel!: (result: { code: 'disarmed' }) => void
  let finishSecondArm!: (result: { code: 'armed'; connection: { kind: 'armed'; expiresAt: number } }) => void
  vi.mocked(f.channel.arm)
    .mockImplementationOnce(() => new Promise(resolve => { finishFirstArm = resolve }) as never)
    .mockImplementationOnce(() => new Promise(resolve => { finishSecondArm = resolve }) as never)
  vi.mocked(f.channel.cancelArm).mockImplementationOnce(() => new Promise(resolve => { finishCancel = resolve }) as never)

  f.controller.dispatch({ type: 'chooseExternal' })
  f.controller.dispatch({ type: 'connectOwn', now: 0 })
  await vi.waitFor(() => expect(f.channel.arm).toHaveBeenCalledTimes(1))
  f.controller.backToChooser()
  f.emit({ type: 'connection', connection: { kind: 'armed', expiresAt: firstUntil } })
  expect(useAgentDrawerStore.getState().state).toMatchObject({ setupOpen: false, armingUntil: null, setupNotice: null })

  f.controller.dispatch({ type: 'chooseExternal' })
  f.controller.dispatch({ type: 'connectOwn', now: 1 })
  expect(f.channel.cancelArm).not.toHaveBeenCalled()
  expect(f.channel.arm).toHaveBeenCalledTimes(1)

  finishFirstArm({ code: 'armed', connection: { kind: 'armed', expiresAt: firstUntil } })
  await vi.waitFor(() => expect(f.channel.cancelArm).toHaveBeenCalledOnce())
  f.emit({ type: 'connection', connection: { kind: 'armed', expiresAt: firstUntil } })
  expect(useAgentDrawerStore.getState().state.armingUntil).toBeNull()
  finishCancel({ code: 'disarmed' })
  expect(f.channel.arm).toHaveBeenCalledTimes(1)
  f.emit({ type: 'connection', connection: { kind: 'idle' } })
  f.emit({ type: 'connection', connection: { kind: 'armed', expiresAt: firstUntil } })
  expect(useAgentDrawerStore.getState().state).toMatchObject({ setupOpen: true, armingUntil: null, setupNotice: null })
  await vi.waitFor(() => expect(f.channel.arm).toHaveBeenCalledTimes(2))

  finishSecondArm({ code: 'armed', connection: { kind: 'armed', expiresAt: secondUntil } })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.armingUntil).toBe(secondUntil))
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'external', agentName: 'External agent' } })
  expect(useAgentDrawerStore.getState().state.connection).toMatchObject({ kind: 'external', name: 'External agent' })
})
it('does not optimistically bind or arm on refused account actions', async () => {
  const f = fixture()
  f.controller.dispatch({ type: 'chooseBuiltin' })
  await vi.waitFor(() => expect(f.builtin).toHaveBeenCalledOnce())
  expect(useAgentDrawerStore.getState().state.connection).toBeNull()
  f.controller.dispatch({ type: 'chooseExternal' })
  f.controller.dispatch({ type: 'connectOwn', now: 0 })
  await vi.waitFor(() => expect(f.channel.arm).toHaveBeenCalledOnce())
  expect(useAgentDrawerStore.getState().state.armingUntil).toBeNull()
  expect(useAgentDrawerStore.getState().state.setupNotice).toMatchObject({ title: 'Connected in another editor' })
})
it('passes the exact observed external binding to movement and waits for receive to establish ownership', async () => {
  const f = fixture()
  let finish!: (value: { code: string }) => void
  vi.mocked(f.channel.moveExternal).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }) as never)
  f.emit({ type: 'connection', connection: { kind: 'external-bound', agentName: 'External', showId: 'other', showName: 'Other Show', relation: 'other-show', bindingId: 'observed', movedFromHere: false } })

  f.controller.moveExternal()
  expect(f.channel.moveExternal).toHaveBeenCalledWith('observed')
  expect(useAgentDrawerStore.getState().state).toMatchObject({ movePending: true, connection: null, externalBinding: { expectedBindingId: 'observed' } })
  finish({ code: 'moved' })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.movePending).toBe(false))
  expect(useAgentDrawerStore.getState().state.connection).toBeNull()

  f.emit({ type: 'connection', connection: { kind: 'bound', agentKind: 'external', agentName: 'External', bindingId: 'fresh' } })
  expect(useAgentDrawerStore.getState().state).toMatchObject({ connection: { kind: 'external', name: 'External' }, externalBinding: null })
})
it('keeps a newer move pending when an earlier control result settles late', async () => {
  const f = fixture()
  let finishFirst!: (value: { code: string }) => void
  let finishSecond!: (value: { code: string }) => void
  vi.mocked(f.channel.moveExternal)
    .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }) as never)
    .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve }) as never)
  const first = { kind: 'external-bound', agentName: 'External', showId: 'first', relation: 'other-show', bindingId: 'first-binding', movedFromHere: false } as const
  const second = { ...first, showId: 'second', bindingId: 'second-binding' } as const
  f.emit({ type: 'connection', connection: first })
  f.controller.moveExternal()
  f.emit({ type: 'connection', connection: second })
  f.controller.moveExternal()
  finishFirst({ code: 'superseded' })
  await Promise.resolve()
  expect(useAgentDrawerStore.getState().state).toMatchObject({ movePending: true, externalBinding: { expectedBindingId: 'second-binding' } })
  finishSecond({ code: 'moved' })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.movePending).toBe(false))
})
it('settles a move result after contact loss without waiting for receive recovery', async () => {
  const f = fixture()
  let finish!: (value: { code: string }) => void
  vi.mocked(f.channel.moveExternal).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }) as never)
  const available = { kind: 'external-bound', agentName: 'External', showId: 'other', relation: 'other-show', bindingId: 'observed', movedFromHere: false } as const
  f.emit({ type: 'connection', connection: available })
  f.controller.moveExternal()
  f.emit({ type: 'connection', connection: { kind: 'contact-lost', previous: available } })
  finish({ code: 'connection_changed' })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.movePending).toBe(false))
  expect(useAgentDrawerStore.getState().state.externalBinding).toMatchObject({ expectedBindingId: 'observed' })
})
it.each(['expired', 'missed', 'occupied'] as const)('clears a stale %s notice only after a new arm is accepted', async prior => {
  const f = fixture()
  if (prior === 'expired') {
    f.emit({ type: 'connection', connection: { kind: 'armed', expiresAt: 1000 } })
    f.controller.dispatch({ type: 'tick', now: 1000 })
  } else if (prior === 'missed') {
    f.emit({ type: 'connection', connection: { kind: 'pending', callId: 'call', agentKind: 'external', agentName: 'External agent', expiresAt: 1000 } })
    f.controller.dispatch({ type: 'tick', now: 1000 })
  } else {
    f.emit({ type: 'connection', connection: { kind: 'occupied' } })
  }
  expect(useAgentDrawerStore.getState().state.setupNotice).not.toBeNull()
  vi.mocked(f.channel.arm).mockResolvedValue({ code: 'armed' } as never)

  f.controller.dispatch({ type: 'connectOwn', now: 2000 })

  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.setupNotice).toBeNull())
  expect(useAgentDrawerStore.getState().state.armingUntil).toBeNull()
  f.emit({ type: 'connection', connection: { kind: 'armed', expiresAt: 122000 } })
  expect(useAgentDrawerStore.getState().state.armingUntil).toBe(122000)
})
it('keeps the latest refusal notice when an older arm succeeds late', async () => {
  const f = fixture()
  let finishFirst!: (result: { code: 'armed' }) => void
  vi.mocked(f.channel.arm)
    .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }) as never)
    .mockResolvedValueOnce({ code: 'occupied' } as never)

  f.controller.dispatch({ type: 'connectOwn', now: 0 })
  f.controller.dispatch({ type: 'connectOwn', now: 1 })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.setupNotice).toMatchObject({ title: 'Connected in another editor' }))
  finishFirst({ code: 'armed' })
  await Promise.resolve()

  expect(useAgentDrawerStore.getState().state.setupNotice).toMatchObject({ title: 'Connected in another editor' })
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
  const delivery = (deliveryId: string, payload: unknown, result: PrivateEditResult) => f.emit({ type: 'delivery', delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'op', deliveryId, sequence: 0, payload }, result, request })
  f.setReceipt({ request, status: 'pending' })
  delivery('begin', { kind: 'begin_edit', intent: 'Resize' }, { code: 'begun' })
  const command = { kind: 'command', name: 'resize_clip', arguments: { duration_ms: 1000 } }
  const result: PrivateEditResult = { code: 'changed', changes: [{ command: 'resize_clip', targetId: 'clip', description: 'Clip resized' }] }
  delivery('change', command, result); delivery('change', command, result)
  f.setReceipt({ request, status: 'applied', settlement: 'saving' })
  delivery('commit', { kind: 'commit_edit' }, { code: 'outcome', receipt: { request, status: 'applied', settlement: 'saving' } })
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'op')?.changes).toHaveLength(1)
  expect(useAgentDrawerStore.getState().busy).toBe(true)
  f.controller.dispatch({ type: 'draft', text: 'Next request' }); f.controller.submit()
  expect(f.builtin).not.toHaveBeenCalled()
})
it('projects bounded interim command issues on the working entry until final settlement', () => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'external', agentName: 'Codex' } })
  const request = { operationId: 'binding:op', sessionId: 'session', showId: 'show', baseRevision: 0, payloadKey: '{}', referenceContext: '{}', targets: ['clip'] }
  const emit = (deliveryId: string, sequence: number, payload: unknown, result: PrivateEditResult) => f.emit({
    type: 'delivery',
    delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'op', deliveryId, sequence, payload },
    result,
    request,
  })
  f.setReceipt({ request, status: 'pending' })
  emit('begin', 0, { kind: 'begin_edit', intent: 'Resize' }, { code: 'begun' })
  emit('bad', 1, { kind: 'command', name: 'resize_clip', arguments: { clip_id: 'missing', duration_ms: 1000 } }, {
    code: 'refused',
    issues: Array.from({ length: 10 }, (_, index) => ({ code: `issue-${index}`, message: `${index}: ${'x'.repeat(300)}` })),
  })
  const interim = useAgentDrawerStore.getState().state
  expect(interim.request).toEqual({ id: 'op', phase: 'working' })
  const interimLine = interim.stream.find(line => line.operationId === 'op')
  expect(interimLine?.outcome).toBeUndefined()
  expect(interimLine).toMatchObject({
    interimIssues: [expect.stringMatching(/^0: x{156}…$/), expect.stringMatching(/^1: x{156}…$/), expect.stringMatching(/^2: x{156}…$/)],
  })
  expect(interim.unread).toEqual([])

  emit('good', 2, { kind: 'command', name: 'resize_clip', arguments: { clip_id: 'clip', duration_ms: 1000 } }, {
    code: 'changed', changes: [{ command: 'resize_clip', targetId: 'clip', description: 'Clip resized' }],
  })
  const receipt = { request, status: 'applied', settlement: 'saved' }
  f.setReceipt(receipt)
  emit('commit', 3, { kind: 'commit_edit' }, { code: 'outcome', receipt })
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'op')).toMatchObject({
    outcome: 'saved', interimIssues: undefined, changes: [{ targetId: 'clip', description: 'Clip resized' }],
  })
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
  f.channel.retry = vi.fn(async (): Promise<PrivateEditResult> => {
    const receipt = { request, status: 'applied', settlement: 'saving' }
    f.setReceipt(receipt)
    return { code: 'outcome', operationId: 'new', request, retryOf: original.operationId, receipt }
  })
  f.controller.dispatch({ type: 'draft', text: 'Unrelated composer draft' })
  f.controller.retry('old')
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'new')).toMatchObject({ retryOf: 'old', outcome: 'applied' }))
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'old')).toMatchObject({ outcome: 'rolled-back' })
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === 'old')?.retryable).toBe(false)
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
  expect(useAgentDrawerStore.getState().state.stream[0]).toMatchObject({ text: 'Resize the first Clip', phase: 'thinking' })
  finish({ code: 'unavailable', dispatch: 'not_attempted', message: 'No edit was made.' })
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.stream[0].outcome).toBe('not-applied'))
  expect(useAgentDrawerStore.getState().state.stream).toHaveLength(1)
  expect(useAgentDrawerStore.getState().state.stream[0]).toMatchObject({ reply: 'No edit was made.', phase: undefined })
})
it.each(['completed', 'refused'] as const)('classifies the attached reply from a %s receipt', async status => {
  const f = fixture()
  f.emit({ type: 'connection', connection: { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Built-in' } })
  const request = { operationId: 'binding:question', sessionId: 'session', showId: 'show', baseRevision: 0, payloadKey: '{}', referenceContext: '{}', targets: [] }
  f.builtin.mockImplementation(async body => {
    if (body.action === 'begin') return { code: 'started', operationId: 'question' }
    const receipt = { request, status, reason: 'No edit was made.' }
    f.setReceipt(receipt)
    f.emit({ type: 'delivery', delivery: { registrationId: 'reg', sessionId: 'session', showId: 'show', bindingId: 'binding', operationId: 'question', deliveryId: 'begin', sequence: 0, payload: { kind: 'begin_edit' } }, result: { code: 'begun' }, request })
    return { code: 'outcome', receipt, message: 'Which Clip do you mean?' }
  })
  f.controller.dispatch({ type: 'draft', text: 'Change the Clip' }); f.controller.submit()
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().busy).toBe(false))
  expect(useAgentDrawerStore.getState().state.stream).toHaveLength(1)
  expect(useAgentDrawerStore.getState().state.stream[0]).toMatchObject({ outcome: 'not-applied', reply: 'Which Clip do you mean?', replyOnRefusal: status === 'completed' })
})
