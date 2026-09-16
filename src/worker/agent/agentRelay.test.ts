import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AgentRelay, type AgentRelayMessage } from './agentRelay'
import { createShowEditSession } from '../../engine/showEditAdmission'
const scope = { bindingId: 'binding', registrationId: 'registration', sessionId: 'session', showId: 'show' }
const delivery = (sequence = 0, payload: unknown = { kind: 'begin_edit' }) => ({ operationId: 'op', deliveryId: `d${sequence}`, sequence, payload })
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
it('delivers once, returns the browser result, and never requeues duplicate or changed identity', async () => {
  const relay = new AgentRelay(scope, () => {})
  const pending = relay.dispatch(delivery())
  const [message] = relay.take()
  expect(message).toEqual({ ...scope, ...delivery() })
  expect(relay.take()).toEqual([])
  expect(relay.reply(message, { code: 'begun' })).toBe(true)
  expect(await pending).toEqual({ code: 'begun' })
  expect(await relay.dispatch(delivery())).toEqual({ code: 'begun' })
  expect(await relay.dispatch(delivery(0, { kind: 'cancel_edit' }))).toEqual({ code: 'identity_conflict' })
  expect(relay.take()).toEqual([])
})
it('carries an actual retained diagnostic receipt without rebuilding it', async () => {
  const session = createShowEditSession('session', 'show')
  const pendingReceipt = session.begin({ operationId: 'op', payloadKey: '', referenceContext: '{}', targets: ['show'] }, 0)
  const receipt = session.refuse('op', 'invalid-candidate', {
    stage: 'authoring', issues: [{ code: 'invalid-scene-duration', path: '["scene","scene-2","durationMs"]' }],
  })!
  const relay = new AgentRelay(scope, () => {})
  const pending = relay.dispatch(delivery())
  const [message] = relay.take()
  expect(message.operationId).toBe(pendingReceipt.request.operationId)
  expect(relay.reply(message, { code: 'outcome', receipt })).toBe(true)
  expect(await pending).toEqual({ code: 'outcome', receipt })
  expect(await relay.dispatch(delivery())).toEqual({ code: 'outcome', receipt })
})
it('a transport wait ending neither cancels nor replays the delivery', async () => {
  const relay = new AgentRelay(scope, () => {})
  const pending = relay.dispatch(delivery())
  const [message] = relay.take()
  await vi.advanceTimersByTimeAsync(25_000)
  expect(await pending).toEqual({ code: 'pending', operationId: 'op' })
  expect(relay.take()).toEqual([])
  relay.reply(message, { code: 'outcome', receipt: { status: 'applied' } })
  expect(await relay.dispatch(delivery())).toMatchObject({ code: 'outcome' })
  await vi.advanceTimersByTimeAsync(60_000)
  expect(await relay.dispatch(delivery())).toEqual({ code: 'unknown' })
  expect(relay.take()).toEqual([])
})
it('preserves command order and refuses replies from an old generation', async () => {
  const relay = new AgentRelay(scope, () => {})
  const pending = relay.dispatch(delivery())
  const [message] = relay.take()
  expect(await relay.dispatch(delivery(1))).toEqual({ code: 'busy' })
  expect(relay.reply({ ...message, sessionId: 'old' }, { code: 'changed' })).toBe(false)
  relay.end()
  expect(await pending).toEqual({ code: 'connection_retired' })
  expect(relay.reply(message, { code: 'changed' })).toBe(false)
  expect(await relay.dispatch(delivery())).toEqual({ code: 'retired' })
})
it('bounds waiting callers while retaining room for a non-mutating outcome query', async () => {
  const relay = new AgentRelay(scope, () => {})
  const waiting = Array.from({ length: 10 }, (_, index) => relay.dispatch({ ...delivery(), operationId: `op${index}` }))
  expect(await relay.dispatch({ ...delivery(), operationId: 'overflow' })).toEqual({ code: 'capacity' })
  const query = relay.query({ kind: 'get_outcome', operationId: 'op0' })
  const messages = relay.take()
  expect(messages).toHaveLength(11)
  const queryMessage = messages.find(message => (message.payload as { kind: string }).kind === 'get_outcome')!
  relay.reply(queryMessage, { code: 'outcome', receipt: { status: 'pending' } })
  expect(await query).toMatchObject({ code: 'outcome' })
  relay.end()
  await Promise.all(waiting)
})
it('a surviving terminal receipt releases lost-reply queue capacity without replaying the delivery', async () => {
  const relay = new AgentRelay(scope, () => {})
  const pending = relay.dispatch(delivery())
  relay.take()
  await vi.advanceTimersByTimeAsync(25_000)
  expect(await pending).toEqual({ code: 'pending', operationId: 'op' })
  const query = relay.query({ kind: 'get_outcome', operationId: 'op' })
  const [message] = relay.take()
  relay.reply(message, { code: 'outcome', receipt: { status: 'applied', settlement: 'saved' } })
  expect(await query).toMatchObject({ receipt: { status: 'applied' } })
  expect(await relay.dispatch(delivery())).toEqual({ code: 'result_unavailable' })
  expect(relay.take()).toEqual([])
})
it.each([false, true])('allows only terminal cancel behind a sent command, with honest missing-browser-delivery outcome (%s)', async received => {
  const { createAgentPrivateExecutor } = await import('../../engine/agentPrivateExecutor')
  const { showCommandFixture } = await import('../../test/showCommandFixture')
  const show = showCommandFixture()
  const request = { operationId: 'binding:op', sessionId: scope.sessionId, showId: show.id, baseRevision: 0, payloadKey: '', referenceContext: '{}', targets: [show.id] }
  const cancel = vi.fn(() => ({ status: 'cancelled', request }))
  const browser = createAgentPrivateExecutor(scope, { capture: () => ({ request, show, context: {}, commandContext: { source: () => undefined }, retainedBytes: 1000 }), apply: vi.fn(), complete: vi.fn(), cancel, outcome: vi.fn() })
  const relay = new AgentRelay(scope, () => {})
  const original = relay.dispatch(delivery())
  // Before transmission, even terminal cancellation cannot bypass ordering.
  expect(await relay.dispatch(delivery(1, { kind: 'cancel_edit' }))).toEqual({ code: 'busy' })
  const [first] = relay.take()
  const priorResult = received ? browser.deliver(first) : undefined
  const cancelling = relay.dispatch(delivery(1, { kind: 'cancel_edit' }))
  const [terminal] = relay.take()
  expect(terminal).toBeDefined()
  const result = browser.deliver(terminal)
  relay.reply(terminal, result)
  expect(await cancelling).toMatchObject(received ? { code: 'outcome', receipt: { status: 'cancelled' } } : { code: 'out_of_order' })
  expect(cancel).toHaveBeenCalledTimes(received ? 1 : 0)
  expect(await relay.dispatch(delivery(1, { kind: 'cancel_edit' }))).toEqual(result)
  expect(await relay.dispatch(delivery(1, { kind: 'commit_edit' }))).toEqual({ code: 'identity_conflict' })
  if (received) {
    expect(await original).toEqual({ code: 'result_unavailable' })
    expect(relay.reply(first, priorResult!)).toBe(false)
  } else {
    await vi.advanceTimersByTimeAsync(25_000)
    expect(await original).toEqual({ code: 'pending', operationId: 'op' })
  }
  expect(relay.take()).toEqual([])
  relay.end(); browser.retire()
})

async function beginExternal(relay: AgentRelay, key = 'begin-key', intent = 'Rename the Show') {
  await primeExternal(relay)
  const call = relay.dispatchExternal({ idempotencyKey: key, payload: { kind: 'begin_edit', intent } })
  const [message] = relay.take()
  expect(message.sequence).toBe(0)
  expect(relay.reply(message, { code: 'begun', operationId: message.operationId })).toBe(true)
  expect(await call).toEqual({ code: 'begun', operationId: message.operationId })
  return message.operationId
}

async function primeExternal(relay: AgentRelay) {
  const reading = relay.query({ kind: 'read_show' })
  const [message] = relay.take()
  relay.reply(message, { code: 'read', show: {} })
  await reading
}

it('recovers one server-minted begin identity across pending, known, changed, completed, and expired retries', async () => {
  const relay = new AgentRelay(scope, () => {})
  expect(await relay.dispatchExternal({ idempotencyKey: 'blank', payload: { kind: 'begin_edit', intent: '   ' } })).toEqual({ code: 'invalid_payload' })
  expect(await relay.dispatchExternal({ idempotencyKey: 'before-read', payload: { kind: 'begin_edit', intent: 'Rename the Show' } })).toMatchObject({ code: 'invalid_request', remedy: expect.stringContaining('read_show') })
  await primeExternal(relay)
  const first = relay.dispatchExternal({ idempotencyKey: 'begin-key', payload: { kind: 'begin_edit', intent: 'Rename the Show' } })
  const [message] = relay.take()
  await vi.advanceTimersByTimeAsync(25_000)
  expect(await first).toEqual({ code: 'pending', operationId: message.operationId })
  expect(await relay.dispatchExternal({ idempotencyKey: 'begin-key', payload: { intent: 'Rename the Show', kind: 'begin_edit' } })).toEqual({ code: 'pending', operationId: message.operationId })
  expect(await relay.dispatchExternal({ idempotencyKey: 'begin-key', payload: { kind: 'begin_edit', intent: 'Change the intent' } })).toEqual({ code: 'identity_conflict', operationId: message.operationId })
  expect(await relay.dispatchExternal({ idempotencyKey: 'other-key', payload: { kind: 'begin_edit', intent: 'Rename the Show' } })).toEqual({ code: 'busy' })
  relay.reply(message, { code: 'begun', operationId: message.operationId })
  expect(await relay.dispatchExternal({ idempotencyKey: 'begin-key', payload: { kind: 'begin_edit', intent: 'Rename the Show' } })).toEqual({ code: 'begun', operationId: message.operationId })
  const cancel = relay.dispatchExternal({ operationId: message.operationId, payload: { kind: 'cancel_edit' } })
  const [cancelMessage] = relay.take()
  relay.reply(cancelMessage, { code: 'outcome', receipt: { status: 'cancelled' } })
  await cancel
  expect(await relay.dispatchExternal({ idempotencyKey: 'begin-key', payload: { kind: 'begin_edit', intent: 'Rename the Show' } })).toEqual({ code: 'begun', operationId: message.operationId })
  await vi.advanceTimersByTimeAsync(60_000)
  expect(await relay.dispatchExternal({ idempotencyKey: 'begin-key', payload: { kind: 'begin_edit', intent: 'Rename the Show' } })).toEqual({ code: 'unknown', operationId: message.operationId })
  const fresh = relay.dispatchExternal({ idempotencyKey: 'other-key', payload: { kind: 'begin_edit', intent: 'Start another edit' } })
  const [freshMessage] = relay.take()
  expect(freshMessage.operationId).not.toBe(message.operationId)
  relay.end()
  expect(await fresh).toEqual({ code: 'connection_retired' })
})

it('serializes ten admitted external calls in relay order and retains dedicated query capacity', async () => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const calls = Array.from({ length: 10 }, (_, index) => relay.dispatchExternal({
    operationId,
    idempotencyKey: `command-${index}`,
    payload: { kind: 'command', name: 'rename_show', arguments: { name: `Name ${index}` } },
  }))
  expect(await relay.dispatchExternal({ operationId, payload: { kind: 'command', name: 'rename_show', arguments: { name: 'Overflow' } } })).toMatchObject({ code: 'capacity', operationId })
  const query = relay.query({ kind: 'get_outcome', operationId })
  const received: AgentRelayMessage[] = []
  for (let index = 0; index < 10; index += 1) {
    const deliveries = relay.take()
    const command = deliveries.find(item => (item.payload as { kind: string }).kind === 'command')!
    if (index === 0) {
      const queryMessage = deliveries.find(item => (item.payload as { kind: string }).kind === 'get_outcome')!
      relay.reply(queryMessage, { code: 'outcome', receipt: { status: 'pending' } })
    }
    received.push(command)
    expect(relay.take()).toEqual([])
    relay.reply(command, { code: 'changed', changes: [] })
  }
  expect(received.map(item => item.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  expect(received.map(item => (item.payload as { arguments: { name: string } }).arguments.name)).toEqual(Array.from({ length: 10 }, (_, index) => `Name ${index}`))
  await expect(Promise.all(calls)).resolves.toEqual(Array.from({ length: 10 }, () => ({ code: 'changed', changes: [] })))
  await expect(query).resolves.toMatchObject({ code: 'outcome' })
})

it('cancellation discards unsent followers, bypasses saturation behind a sent head, and rejects its late reply', async () => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const calls = Array.from({ length: 10 }, (_, index) => relay.dispatchExternal({
    operationId,
    idempotencyKey: `command-${index}`,
    payload: { kind: 'command', name: 'rename_show', arguments: { name: `Name ${index}` } },
  }))
  const [head] = relay.take()
  const cancelling = relay.dispatchExternal({ operationId, idempotencyKey: 'cancel', payload: { kind: 'cancel_edit' } })
  const [cancel] = relay.take()
  expect(cancel.sequence).toBe(2)
  expect((cancel.payload as { kind: string }).kind).toBe('cancel_edit')
  relay.reply(cancel, { code: 'outcome', receipt: { status: 'cancelled' } })
  expect(await cancelling).toMatchObject({ receipt: { status: 'cancelled' } })
  expect(await Promise.all(calls)).toEqual(Array.from({ length: 10 }, () => ({ code: 'result_unavailable' })))
  expect(relay.reply(head, { code: 'changed', changes: [] })).toBe(false)
  expect(relay.take()).toEqual([])
})

it('a terminal commit settles followers that were admitted before its result', async () => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const committing = relay.dispatchExternal({ operationId, payload: { kind: 'commit_edit' } })
  const follower = relay.dispatchExternal({ operationId, idempotencyKey: 'late-command', payload: { kind: 'command', name: 'rename_show', arguments: { name: 'Too late' } } })
  const [commit] = relay.take()
  expect((commit.payload as { kind: string }).kind).toBe('commit_edit')
  relay.reply(commit, { code: 'outcome', receipt: { status: 'applied', settlement: 'saved' } })
  expect(await committing).toMatchObject({ receipt: { status: 'applied' } })
  expect(await follower).toEqual({ code: 'result_unavailable' })
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'late-command', payload: { kind: 'command', name: 'rename_show', arguments: { name: 'Too late' } } })).toEqual({ code: 'result_unavailable' })
  expect(relay.take()).toEqual([])
})

it('canonicalizes keyed command arguments and reserves commit plus post-commit cancellation within 256 deliveries', async () => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const original = relay.dispatchExternal({ operationId, idempotencyKey: 'canonical', payload: { kind: 'command', name: 'rename_show', arguments: { a: 1, b: 2 } } })
  const [first] = relay.take()
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'canonical', payload: { name: 'rename_show', arguments: { b: 2, a: 1 }, kind: 'command' } })).toEqual({ code: 'pending', operationId })
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'canonical', payload: { kind: 'command', name: 'rename_show', arguments: { a: 1, b: 3 } } })).toEqual({ code: 'identity_conflict', operationId })
  relay.reply(first, { code: 'changed', changes: [] })
  await original
  for (let index = 1; index < 253; index += 1) {
    const call = relay.dispatchExternal({ operationId, payload: { kind: 'command', name: 'rename_show', arguments: { name: `N${index}` } } })
    const [message] = relay.take()
    relay.reply(message, { code: 'changed', changes: [] })
    await call
  }
  expect(await relay.dispatchExternal({ operationId, payload: { kind: 'command', name: 'rename_show', arguments: { name: 'Too many' } } })).toMatchObject({ code: 'capacity', remedy: expect.stringContaining('commit or cancel') })
  const committing = relay.dispatchExternal({ operationId, payload: { kind: 'commit_edit' } })
  const [commit] = relay.take()
  expect(commit.sequence).toBe(254)
  relay.reply(commit, { code: 'outcome', receipt: { status: 'pending' } })
  await committing
  const cancelling = relay.dispatchExternal({ operationId, payload: { kind: 'cancel_edit' } })
  const [cancel] = relay.take()
  expect(cancel.sequence).toBe(255)
  relay.reply(cancel, { code: 'outcome', receipt: { status: 'cancelled' } })
  await cancelling
})
