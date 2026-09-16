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
it('treats a trusted cancel saving receipt as explicit terminal recovery', async () => {
  const relay = new AgentRelay(scope, () => {})
  const original = relay.dispatch(delivery(0, { kind: 'begin_edit' }))
  const [first] = relay.take()
  const cancelling = relay.dispatch(delivery(1, { kind: 'cancel_edit' }))
  const [cancel] = relay.take()
  const saving = { code: 'outcome' as const, receipt: { status: 'applied', settlement: 'saving' } }

  expect(relay.reply(cancel, saving)).toBe(true)
  expect(await cancelling).toEqual(saving)
  expect(relay.reply(first, { code: 'changed' })).toBe(false)
  expect(await original).toEqual({ code: 'result_unavailable' })
  expect(await relay.dispatch(delivery(1, { kind: 'cancel_edit' }))).toEqual(saving)
  expect(relay.take()).toEqual([])
})
it.each([
  { label: 'non-outcome receipt-shaped metadata', result: { code: 'unknown', receipt: { status: 'applied', settlement: 'saving' } } },
  { label: 'a null receipt', result: { code: 'outcome', receipt: null } },
])('does not recover a trusted cancel from $label', async ({ result }) => {
  const relay = new AgentRelay(scope, () => {})
  const original = relay.dispatch(delivery(0, { kind: 'begin_edit' }))
  const [first] = relay.take()
  const cancelling = relay.dispatch(delivery(1, { kind: 'cancel_edit' }))
  const [cancel] = relay.take()
  const malformed = result as unknown as Parameters<AgentRelay['reply']>[1]

  expect(relay.reply(cancel, malformed)).toBe(true)
  expect(await cancelling).toEqual(malformed)
  expect(relay.reply(first, { code: 'changed' })).toBe(true)
  expect(await original).toEqual({ code: 'changed' })
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

it.each([false, true])('joins same-key, distinct-key, and unkeyed cancellation behind one terminal delivery (sent=%s)', async firstCancelSent => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const headCall = relay.dispatchExternal({ operationId, idempotencyKey: 'head', payload: { kind: 'command', name: 'rename_show', arguments: { name: 'Head' } } })
  const followerCall = relay.dispatchExternal({ operationId, idempotencyKey: 'follower', payload: { kind: 'command', name: 'rename_show', arguments: { name: 'Follower' } } })
  const [head] = relay.take()
  const cancelA = relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-a', payload: { kind: 'cancel_edit' } })
  expect(await followerCall).toEqual({ code: 'result_unavailable' })
  let terminal = firstCancelSent ? relay.take()[0] : undefined
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-a', payload: { kind: 'cancel_edit' } })).toEqual({ code: 'pending', operationId })
  const cancelB = relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-b', payload: { kind: 'cancel_edit' } })
  const unkeyed = relay.dispatchExternal({ operationId, payload: { kind: 'cancel_edit' } })
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-a', payload: { kind: 'cancel_edit' } })).toEqual({ code: 'pending', operationId })
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-b', payload: { kind: 'cancel_edit', changed: true } })).toEqual({ code: 'identity_conflict', operationId })
  if (!terminal) terminal = relay.take()[0]
  expect(terminal.sequence).toBe(2)
  expect((terminal.payload as { kind: string }).kind).toBe('cancel_edit')
  expect(relay.take()).toEqual([])
  expect(await cancelB).toEqual({ code: 'pending', operationId })
  expect(await unkeyed).toEqual({ code: 'pending', operationId })
  const cancelled = { code: 'outcome' as const, receipt: { status: 'cancelled' } }
  expect(relay.reply(terminal, cancelled)).toBe(true)
  expect(await cancelA).toEqual(cancelled)
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-a', payload: { kind: 'cancel_edit' } })).toEqual(cancelled)
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-b', payload: { kind: 'cancel_edit' } })).toEqual(cancelled)
  expect(await headCall).toEqual({ code: 'result_unavailable' })
  expect(relay.reply(head, { code: 'changed', changes: [] })).toBe(false)

  const outcome = relay.query({ kind: 'get_outcome', operationId })
  const [outcomeQuery] = relay.take()
  relay.reply(outcomeQuery, cancelled)
  expect(await outcome).toEqual(cancelled)
  const unknown = relay.query({ kind: 'get_outcome', operationId })
  const [unknownQuery] = relay.take()
  relay.reply(unknownQuery, { code: 'unknown' })
  expect(await unknown).toEqual({ code: 'unknown' })
})

it('bounds joined terminal-cancel identities by aggregate bytes and retires the one live delivery', async () => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength
  const beginBytes = encoded({ kind: 'begin_edit', intent: 'Rename the Show' })
  const hugePayload = { kind: 'command', name: 'rename_show', arguments: { padding: 'x'.repeat(65_000) } }
  let retainedIdentityBytes = beginBytes
  for (let index = 0; index < 64; index += 1) {
    const call = relay.dispatchExternal({ operationId, payload: hugePayload })
    const [message] = relay.take()
    relay.reply(message, { code: 'changed', changes: [] })
    await call
    retainedIdentityBytes += encoded(hugePayload)
  }
  const headPayload = { kind: 'command', name: 'rename_show', arguments: { name: 'Head' } }
  const cancelPayload = { kind: 'cancel_edit' }
  const fillerOverhead = encoded({ kind: 'command', name: 'rename_show', arguments: { padding: '' } })
  const fillerBytes = 4_194_304 - retainedIdentityBytes - encoded(headPayload) - (2 * encoded(cancelPayload)) - 11
  const fillerPayload = { kind: 'command', name: 'rename_show', arguments: { padding: 'x'.repeat(fillerBytes - fillerOverhead) } }
  expect(encoded(fillerPayload)).toBe(fillerBytes)
  const fillerCall = relay.dispatchExternal({ operationId, payload: fillerPayload })
  const [filler] = relay.take()
  relay.reply(filler, { code: 'changed', changes: [] })
  await fillerCall

  const headCall = relay.dispatchExternal({ operationId, payload: headPayload })
  relay.take()
  const cancelling = relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-root', payload: cancelPayload })
  const [terminal] = relay.take()
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-alias', payload: cancelPayload })).toEqual({ code: 'pending', operationId })
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-over-budget', payload: cancelPayload })).toMatchObject({ code: 'capacity', operationId, remedy: expect.stringContaining('get_outcome') })
  expect(relay.take()).toEqual([])
  relay.end()
  expect(await cancelling).toEqual({ code: 'connection_retired' })
  expect(await headCall).toEqual({ code: 'connection_retired' })
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-alias', payload: cancelPayload })).toEqual({ code: 'retired' })
  expect(relay.reply(terminal, { code: 'outcome', receipt: { status: 'cancelled' } })).toBe(false)
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

it.each([
  { label: 'pending', commitResult: { code: 'outcome' as const, receipt: { status: 'pending' } }, cancelResult: { code: 'outcome' as const, receipt: { status: 'cancelled' } } },
  { label: 'waiting', commitResult: { code: 'outcome' as const, receipt: { status: 'waiting' } }, cancelResult: { code: 'outcome' as const, receipt: { status: 'cancelled' } } },
  { label: 'saving', commitResult: { code: 'outcome' as const, receipt: { status: 'applied', settlement: 'saving' } }, cancelResult: { code: 'outcome' as const, receipt: { status: 'applied', settlement: 'saving' } } },
])('a $label commit result tombstones queued ordinary work and preserves terminal cancel', async ({ commitResult, cancelResult }) => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const committing = relay.dispatchExternal({ operationId, idempotencyKey: 'commit', payload: { kind: 'commit_edit' } })
  const followerPayload = { kind: 'command', name: 'rename_show', arguments: { name: 'Too late' } }
  const follower = relay.dispatchExternal({ operationId, idempotencyKey: 'late-command', payload: followerPayload })
  const [commit] = relay.take()
  expect((commit.payload as { kind: string }).kind).toBe('commit_edit')

  expect(relay.reply(commit, commitResult)).toBe(true)
  expect(await committing).toEqual(commitResult)
  expect(await follower).toEqual({ code: 'result_unavailable' })
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'late-command', payload: followerPayload })).toEqual({ code: 'result_unavailable' })
  expect(relay.take()).toEqual([])

  const cancelling = relay.dispatchExternal({ operationId, idempotencyKey: 'cancel', payload: { kind: 'cancel_edit' } })
  const [cancel] = relay.take()
  expect((cancel.payload as { kind: string }).kind).toBe('cancel_edit')
  expect(cancel.sequence).toBe(2)
  expect(relay.reply(cancel, cancelResult)).toBe(true)
  expect(await cancelling).toEqual(cancelResult)
  expect(relay.take()).toEqual([])
})

it.each([
  { label: 'pending', receipt: { status: 'pending' }, cancelReceipt: { status: 'cancelled' } },
  { label: 'waiting', receipt: { status: 'waiting' }, cancelReceipt: { status: 'cancelled' } },
  { label: 'saving', receipt: { status: 'applied', settlement: 'saving' }, cancelReceipt: { status: 'applied', settlement: 'saving' } },
])('keeps terminal cancellation admissible after a $label outcome query', async ({ receipt, cancelReceipt }) => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const committing = relay.dispatchExternal({ operationId, payload: { kind: 'commit_edit' } })
  const [commit] = relay.take()
  relay.reply(commit, { code: 'outcome', receipt })
  await committing

  const querying = relay.query({ kind: 'get_outcome', operationId })
  const [query] = relay.take()
  expect((query.payload as { kind: string }).kind).toBe('get_outcome')
  relay.reply(query, { code: 'outcome', receipt })
  expect(await querying).toEqual({ code: 'outcome', receipt })

  const cancelling = relay.dispatchExternal({ operationId, idempotencyKey: 'cancel', payload: { kind: 'cancel_edit' } })
  const [cancel] = relay.take()
  expect((cancel.payload as { kind: string }).kind).toBe('cancel_edit')
  const cancelResult = { code: 'outcome' as const, receipt: cancelReceipt }
  expect(relay.reply(cancel, cancelResult)).toBe(true)
  expect(await cancelling).toEqual(cancelResult)
})

it('does not tombstone an already-sent cancel when an outcome query still reports saving', async () => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const saving = { code: 'outcome' as const, receipt: { status: 'applied', settlement: 'saving' } }
  const committing = relay.dispatchExternal({ operationId, payload: { kind: 'commit_edit' } })
  const [commit] = relay.take()
  relay.reply(commit, saving)
  await committing

  const cancelling = relay.dispatchExternal({ operationId, idempotencyKey: 'cancel', payload: { kind: 'cancel_edit' } })
  const [cancel] = relay.take()
  const querying = relay.query({ kind: 'get_outcome', operationId })
  const [query] = relay.take()
  relay.reply(query, saving)
  expect(await querying).toEqual(saving)
  expect(relay.reply(cancel, saving)).toBe(true)
  expect(await cancelling).toEqual(saving)
})

it.each([
  { label: 'saved', receipt: { status: 'applied', settlement: 'saved' } },
  { label: 'rolled back', receipt: { status: 'applied', settlement: 'rolled-back' } },
  { label: 'superseded', receipt: { status: 'applied', settlement: 'superseded' } },
  { label: 'draft', receipt: { status: 'applied', settlement: 'draft' } },
  { label: 'refused', receipt: { status: 'refused', reason: 'revision-conflict' } },
  { label: 'cancelled', receipt: { status: 'cancelled' } },
  { label: 'completed', receipt: { status: 'completed', completion: 'service-failed' } },
  { label: 'retired', receipt: { status: 'retired' } },
])('terminalizes an operation after a $label outcome query', async ({ receipt }) => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const committing = relay.dispatchExternal({ operationId, payload: { kind: 'commit_edit' } })
  const [commit] = relay.take()
  relay.reply(commit, { code: 'outcome', receipt: { status: 'applied', settlement: 'saving' } })
  await committing

  const querying = relay.query({ kind: 'get_outcome', operationId })
  const [query] = relay.take()
  relay.reply(query, { code: 'outcome', receipt })
  expect(await querying).toEqual({ code: 'outcome', receipt })
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'cancel', payload: { kind: 'cancel_edit' } })).toEqual({ code: 'finished', operationId })
  expect(relay.take()).toEqual([])
})

it('keeps an external operation open after a domain refusal and admits its correction', async () => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const accepted = relay.dispatchExternal({ operationId, idempotencyKey: 'accepted-command', payload: { kind: 'command', name: 'rename_show', arguments: { name: 'First' } } })
  const [first] = relay.take()
  relay.reply(first, { code: 'changed', changes: [{ description: 'First change' }] })
  expect(await accepted).toMatchObject({ code: 'changed' })

  const refused = relay.dispatchExternal({ operationId, idempotencyKey: 'bad-command', payload: { kind: 'command', name: 'rename_show', arguments: { name: '' } } })
  const corrected = relay.dispatchExternal({ operationId, idempotencyKey: 'corrected-command', payload: { kind: 'command', name: 'rename_show', arguments: { name: 'Corrected' } } })
  const [bad] = relay.take()
  const refusal = { code: 'refused' as const, issues: [{ code: 'invalid-argument', message: 'Name is required.' }] }
  relay.reply(bad, refusal)
  expect(await refused).toEqual(refusal)
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'bad-command', payload: { kind: 'command', name: 'rename_show', arguments: { name: '' } } })).toEqual(refusal)

  const [good] = relay.take()
  expect(good.operationId).toBe(operationId)
  expect(good.sequence).toBe(bad.sequence + 1)
  relay.reply(good, { code: 'changed', changes: [] })
  expect(await corrected).toEqual({ code: 'changed', changes: [] })

  const committing = relay.dispatchExternal({ operationId, payload: { kind: 'commit_edit' } })
  const [commit] = relay.take()
  expect((commit.payload as { kind: string }).kind).toBe('commit_edit')
  relay.reply(commit, { code: 'outcome', receipt: { status: 'applied', settlement: 'saved' } })
  expect(await committing).toMatchObject({ receipt: { status: 'applied', settlement: 'saved' } })
})

it.each(['result_too_large', 'result_unavailable', 'unavailable'] as const)('keeps terminal command failure %s terminal and settles unsent followers', async code => {
  const relay = new AgentRelay(scope, () => {})
  const operationId = await beginExternal(relay)
  const failing = relay.dispatchExternal({ operationId, idempotencyKey: 'failing-command', payload: { kind: 'command', name: 'rename_show', arguments: { name: 'First' } } })
  const follower = relay.dispatchExternal({ operationId, idempotencyKey: 'unsent-follower', payload: { kind: 'command', name: 'rename_show', arguments: { name: 'Second' } } })
  const [head] = relay.take()
  relay.reply(head, { code })
  expect(await failing).toEqual({ code })
  expect(await follower).toEqual({ code: 'result_unavailable' })
  expect(await relay.dispatchExternal({ operationId, payload: { kind: 'command', name: 'rename_show', arguments: { name: 'Too late' } } })).toEqual({ code: 'finished', operationId })
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
  const cancelling = relay.dispatchExternal({ operationId, idempotencyKey: 'final-cancel', payload: { kind: 'cancel_edit' } })
  const [cancel] = relay.take()
  expect(cancel.sequence).toBe(255)
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'final-cancel', payload: { kind: 'cancel_edit' } })).toEqual({ code: 'pending', operationId })
  const joined = relay.dispatchExternal({ operationId, idempotencyKey: 'joined-cancel', payload: { kind: 'cancel_edit' } })
  const unkeyed = relay.dispatchExternal({ operationId, payload: { kind: 'cancel_edit' } })
  expect(await joined).toEqual({ code: 'pending', operationId })
  expect(await unkeyed).toEqual({ code: 'pending', operationId })
  for (let index = 0; index < 253; index += 1) {
    expect(await relay.dispatchExternal({ operationId, idempotencyKey: `cancel-alias-${index}`, payload: { kind: 'cancel_edit' } })).toEqual({ code: 'pending', operationId })
  }
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'cancel-alias-overflow', payload: { kind: 'cancel_edit' } })).toMatchObject({ code: 'capacity', operationId, remedy: expect.stringContaining('get_outcome') })
  expect(relay.take()).toEqual([])
  const cancelled = { code: 'outcome' as const, receipt: { status: 'cancelled' } }
  relay.reply(cancel, cancelled)
  expect(await cancelling).toEqual(cancelled)
  expect(await relay.dispatchExternal({ operationId, idempotencyKey: 'joined-cancel', payload: { kind: 'cancel_edit' } })).toEqual(cancelled)
})
