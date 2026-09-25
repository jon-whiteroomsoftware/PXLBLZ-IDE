import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentBrowserSession } from './browserSession'
import type { createAgentEditorAdmission } from './editorAdmission'
import type { AgentWindowConnection } from './channelPort'
import { showCommandFixture } from '@/test/showCommandFixture'
import { emptyRendezvous, MAX_REGISTRATIONS, transitionRendezvous } from '@/engine/agentRendezvous'

const windowIdentity = { registrationId: 'registration', sessionId: 'session', showId: 'show' }
const bound = { kind: 'bound', bindingId: 'binding', agentKind: 'builtin', agentName: 'Assistant' } as const
function setup(initialConnection: AgentWindowConnection = bound, options: { delayMoves?: boolean } = {}) {
  const show = showCommandFixture()
  const request = { sessionId: 'session', showId: 'show', operationId: 'binding:op', baseRevision: 0, payloadKey: '', referenceContext: '{}', targets: ['show'] }
  const admission = {
    sessionId: 'session', available: () => true, onClose: vi.fn(() => () => {}), close: vi.fn(),
    getShow: () => structuredClone(show), getEditorFocus: () => ({}),
    getPatterns: vi.fn((): Array<{ kind: string; id: string; name: string; exported_controls: never[] }> | undefined => [{ kind: 'user', id: 'personal', name: 'Personal', exported_controls: [] }]),
    getControllerProfiles: vi.fn((): Array<{ id: string; name: string; pixel_count?: number }> | undefined => [{ id: 'profile', name: 'Profile', pixel_count: 256 }]),
    captureCommandContext: () => ({ commandContext: { source: () => undefined }, retainedBytes: 1 }),
    beginRequest: vi.fn(() => ({ request, show: structuredClone(show), context: {} })),
    applyShow: vi.fn(() => ({ status: 'waiting', request })), cancel: vi.fn(() => ({ status: 'cancelled', request })),
    complete: vi.fn((_request: unknown, completion: string) => ({ status: 'completed', request, completion })), readOutcome: vi.fn(() => ({ status: 'waiting', request })),
  }
  const receives: Array<(value: Response) => void> = []
  const moves: Array<(value: Response) => void> = []
  const calls: Record<string, unknown>[] = []
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string); calls.push(body)
    if (body.type === 'register') return Response.json({ code: 'registered', registrationId: 'registration', connection: initialConnection })
    if (body.type === 'receive') return new Promise<Response>(resolve => receives.push(resolve))
    if (body.type === 'move-external' && options.delayMoves) return new Promise<Response>(resolve => moves.push(resolve))
    return Response.json({ code: body.type === 'reply' ? 'received' : 'disconnected' })
  })
  const session = createAgentBrowserSession({ admission: admission as unknown as ReturnType<typeof createAgentEditorAdmission>, showId: 'show', fetch: fetcher })
  const deliver = async (payload: unknown, sequence: number, extra = {}) => {
    receives.shift()!(Response.json({ code: 'live', connection: bound, deliveries: [{ ...windowIdentity, bindingId: 'binding', operationId: 'op', deliveryId: `d${sequence}`, sequence, payload, ...extra }] }))
    await vi.waitFor(() => expect(receives.length).toBe(1))
  }
  return { admission, session, calls, receives, moves, deliver }
}
afterEach(() => vi.useRealTimers())
describe('production browser channel session', () => {
  it('registers once and delivers through one owner, publishing the local request and replying once', async () => {
    const { session, calls, admission, deliver } = setup()
    const events: unknown[] = []; session.subscribe(event => events.push(event))
    expect(await session.ready).toEqual(windowIdentity)
    await deliver({ kind: 'begin_edit' }, 0)
    await deliver({ kind: 'commit_edit' }, 1)
    expect(admission.beginRequest).toHaveBeenCalledTimes(1)
    expect(admission.complete).toHaveBeenCalledWith(expect.anything(), 'nothing-applied')
    expect(admission.applyShow).not.toHaveBeenCalled()
    expect(events).toContainEqual(expect.objectContaining({ type: 'delivery', request: expect.objectContaining({ operationId: 'binding:op' }) }))
    expect(calls.filter(call => call.type === 'reply')).toHaveLength(2)
    expect(session.getOutcome('op').code).toBe('outcome')
    session.close(); expect(admission.close).not.toHaveBeenCalled()
  })
  it('retires synchronously before disconnect transport and refuses a held late delivery', async () => {
    const { session, admission, deliver, receives, calls } = setup()
    await session.ready
    await deliver({ kind: 'begin_edit' }, 0)
    const pending = session.disconnect()
    expect(admission.cancel).toHaveBeenCalledTimes(1)
    await pending
    receives.shift()!(Response.json({ code: 'live', connection: bound, deliveries: [{ ...windowIdentity, bindingId: 'binding', operationId: 'op', deliveryId: 'd1', sequence: 1, payload: { kind: 'commit_edit' } }] }))
    await vi.waitFor(() => expect(receives.length).toBe(1))
    expect(admission.applyShow).not.toHaveBeenCalled()
    expect(calls.filter(call => call.type === 'register')).toHaveLength(1)
    session.close()
  })
  it('refuses wrong-session deliveries before capture and does not pretend Forget is implemented', async () => {
    const { session, admission, deliver, calls } = setup()
    await session.ready
    await deliver({ kind: 'begin_edit' }, 0, { sessionId: 'old-session' })
    expect(admission.beginRequest).not.toHaveBeenCalled()
    expect(await session.forget()).toEqual({ code: 'unsupported' })
    expect(calls.some(call => call.type === 'forget')).toBe(false)
    session.close()
  })
})
it('preserves the same private operation across contact loss without re-registering or replaying', async () => {
  const { session, receives, deliver, admission, calls } = setup()
  await session.ready
  await deliver({ kind: 'begin_edit' }, 0)
  receives.shift()!(Response.json({ code: 'unavailable' }, { status: 503 }))
  await vi.waitFor(() => expect(session.getConnection().kind).toBe('contact-lost'))
  expect(session.getOutcome('op').code).toBe('outcome')
  expect(admission.cancel).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(receives.length).toBe(1), { timeout: 2000 })
  await deliver({ kind: 'commit_edit' }, 1)
  expect(admission.beginRequest).toHaveBeenCalledTimes(1)
  expect(admission.complete).toHaveBeenCalledWith(expect.anything(), 'nothing-applied')
  expect(admission.applyShow).not.toHaveBeenCalled()
  expect(calls.filter(call => call.type === 'register')).toHaveLength(1)
  session.close()
})
it('keeps the binding and shows a throttled receive refusal without manufacturing contact loss', async () => {
  const { session, receives, deliver, admission } = setup()
  const events: unknown[] = []; session.subscribe(event => events.push(event))
  await session.ready
  await deliver({ kind: 'begin_edit' }, 0)
  receives.shift()!(Response.json({ code: 'throttled', retry_after_ms: 4321 }, { status: 429 }))
  await vi.waitFor(() => expect(session.getConnection()).toEqual({ kind: 'refused', code: 'throttled' }))
  expect(events).not.toContainEqual(expect.objectContaining({ connection: expect.objectContaining({ kind: 'contact-lost' }) }))
  expect(session.getOutcome('op').code).toBe('outcome')
  await vi.waitFor(() => expect(receives.length).toBe(1), { timeout: 2000 })
  await deliver({ kind: 'commit_edit' }, 1)
  expect(admission.beginRequest).toHaveBeenCalledTimes(1)
  expect(admission.complete).toHaveBeenCalledWith(expect.anything(), 'nothing-applied')
  session.close()
})
it('returns a near-limit context unchanged and explicitly refuses oversized context and Show reads', async () => {
  const { session, admission, deliver, calls } = setup()
  await session.ready
  vi.spyOn(admission, 'getEditorFocus').mockReturnValue({ text: 'x'.repeat(1_048_000) })
  await deliver({ kind: 'get_context' }, 0)
  const first = calls.filter(call => call.type === 'reply').slice(-1)[0]!.result as { code: string; context: { text: string } }
  expect(first.code).toBe('read')
  expect(first.context.text).toHaveLength(1_048_000)
  vi.spyOn(admission, 'getEditorFocus').mockReturnValue({ text: 'x'.repeat(1_048_576) })
  await deliver({ kind: 'get_context' }, 1)
  expect(calls.filter(call => call.type === 'reply').slice(-1)[0]!.result).toEqual({ code: 'result_too_large' })
  vi.spyOn(admission, 'getShow').mockReturnValue({ ...showCommandFixture(), name: 'x'.repeat(1_048_576) })
  await deliver({ kind: 'read_show' }, 2)
  expect(calls.filter(call => call.type === 'reply').slice(-1)[0]!.result).toEqual({ code: 'result_too_large' })
  expect(admission.beginRequest).not.toHaveBeenCalled()
  session.close()
})

it('routes both discovery queries through admission, preserves filters, and refuses unavailable or oversized results', async () => {
  const { session, admission, deliver, calls } = setup()
  await session.ready

  await deliver({ kind: 'list_patterns', query: 'aurora', patternKind: 'user' }, 0)
  expect(admission.getPatterns).toHaveBeenCalledWith({ query: 'aurora', kind: 'user' })
  expect(calls.filter(call => call.type === 'reply').slice(-1)[0]!.result).toEqual({
    code: 'read', patterns: [{ kind: 'user', id: 'personal', name: 'Personal', exported_controls: [] }],
  })

  await deliver({ kind: 'list_controller_profiles' }, 1)
  expect(admission.getControllerProfiles).toHaveBeenCalledOnce()
  expect(calls.filter(call => call.type === 'reply').slice(-1)[0]!.result).toEqual({
    code: 'read', controller_profiles: [{ id: 'profile', name: 'Profile', pixel_count: 256 }],
  })

  admission.getPatterns.mockReturnValueOnce(undefined)
  await deliver({ kind: 'list_patterns' }, 2)
  expect(calls.filter(call => call.type === 'reply').slice(-1)[0]!.result).toEqual({ code: 'unavailable' })

  admission.getControllerProfiles.mockReturnValueOnce([{ id: 'profile', name: 'x'.repeat(1_048_576) }])
  await deliver({ kind: 'list_controller_profiles' }, 3)
  expect(calls.filter(call => call.type === 'reply').slice(-1)[0]!.result).toEqual({ code: 'result_too_large' })
  expect(admission.beginRequest).not.toHaveBeenCalled()
  session.close()
})

it('sends movement as an intent without installing an owned connection from its result', async () => {
  const available = { kind: 'external-bound', agentName: 'External', showId: 'other-show', showName: 'Other Show', relation: 'other-show', bindingId: 'observed-binding' } as const
  const { session, calls } = setup(available)
  await session.ready
  expect(session.getConnection()).toEqual({ ...available, movedFromHere: false })
  expect(await session.moveExternal('observed-binding')).toEqual({ code: 'disconnected' })
  expect(calls).toContainEqual({ type: 'move-external', ...windowIdentity, expectedBindingId: 'observed-binding' })
  expect(session.getConnection()).toEqual({ ...available, movedFromHere: false })
  session.close()
})

it('supersedes an older move result after a newer receive and move intent', async () => {
  const available = { kind: 'external-bound', agentName: 'External', showId: 'other-show', showName: 'Other Show', relation: 'other-show', bindingId: 'observed-binding' } as const
  const { session, receives, moves } = setup(available, { delayMoves: true })
  await session.ready
  const first = session.moveExternal('observed-binding')
  await vi.waitFor(() => expect(moves).toHaveLength(1))

  const newer = { ...available, showId: 'newer-show', showName: 'Newer Show', bindingId: 'newer-binding' } as const
  receives.shift()!(Response.json({ code: 'status', connection: newer, deliveries: [] }))
  await vi.waitFor(() => expect(session.getConnection()).toEqual({ ...newer, movedFromHere: false }))
  const second = session.moveExternal('newer-binding')
  await vi.waitFor(() => expect(moves).toHaveLength(2))

  moves.shift()!(Response.json({ code: 'connection_changed' }))
  expect(await first).toEqual({ code: 'superseded' })
  moves.shift()!(Response.json({ code: 'moved' }))
  expect(await second).toEqual({ code: 'moved' })
  session.close()
})

it('latches moved-from-here across later external owners and clears it on idle', async () => {
  const owned = { kind: 'bound', bindingId: 'binding', agentKind: 'external', agentName: 'External' } as const
  const { session, receives } = setup(owned)
  await session.ready
  const moved = { kind: 'external-bound', agentName: 'External', showId: 'other-show', showName: 'Other Show', relation: 'other-show', bindingId: 'binding-two' } as const
  receives.shift()!(Response.json({ code: 'status', connection: moved, deliveries: [] }))
  await vi.waitFor(() => expect(session.getConnection()).toEqual({ ...moved, movedFromHere: true }))
  const movedAgain = { ...moved, showId: 'third-show', showName: 'Third Show', bindingId: 'binding-three' } as const
  receives.shift()!(Response.json({ code: 'status', connection: movedAgain, deliveries: [] }))
  await vi.waitFor(() => expect(session.getConnection()).toEqual({ ...movedAgain, movedFromHere: true }))
  receives.shift()!(Response.json({ code: 'status', connection: { kind: 'idle' }, deliveries: [] }))
  await vi.waitFor(() => expect(session.getConnection()).toEqual({ kind: 'idle' }))
  receives.shift()!(Response.json({ code: 'status', connection: moved, deliveries: [] }))
  await vi.waitFor(() => expect(session.getConnection()).toEqual({ ...moved, movedFromHere: false }))
  session.close()
})

/**
 * Registration lifetime across close.
 *
 * Transport model, stated rather than assumed: the account owner commits a
 * `register` when it accepts the request, independently of whether the client
 * ever receives the response. Client cancellation rejects only the client's
 * own promise. This fake therefore commits on accept and *does* reject an
 * aborted caller — it is not an abort-ignoring fake. Capacity is the real
 * `MAX_REGISTRATIONS` bound, so an unretired registration is visible as the
 * `capacity` refusal a later mount would see.
 */
function registrationHarness({ holdRegister = true } = {}) {
  let rendezvous = emptyRendezvous()
  const answers: Array<() => void> = []
  const aborted: string[] = []
  const calls: Record<string, unknown>[] = []
  const state = { holdRegister }
  let issued = 0
  // A fixed clock: these partitions are about close ordering, never about TTL.
  const apply = (command: Parameters<typeof transitionRendezvous>[1]) => {
    const outcome = transitionRendezvous(rendezvous, command, 0)
    rendezvous = outcome.state
    return outcome.result
  }
  const fetcher = ((_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(init?.body as string) as Record<string, string>
    calls.push(body)
    const signal = init?.signal ?? undefined
    const rejectOnAbort = (type: string, reject: (reason: Error) => void) =>
      signal?.addEventListener('abort', () => { aborted.push(type); reject(new Error('aborted')) }, { once: true })
    if (body.type === 'register') {
      const registrationId = `registration-${++issued}`
      const accepted = apply({ type: 'register', registrationId, sessionId: body.sessionId, showId: body.showId, showVersion: 2 })
      const reply = Response.json(accepted.code === 'registered' ? { code: accepted.code, registrationId } : { code: accepted.code })
      if (!state.holdRegister) return Promise.resolve(reply)
      return new Promise<Response>((resolve, reject) => { answers.push(() => resolve(reply)); rejectOnAbort('register', reject) })
    }
    if (body.type === 'receive') return new Promise<Response>((_resolve, reject) => rejectOnAbort('receive', reject))
    const identity = { registrationId: body.registrationId, sessionId: body.sessionId, showId: body.showId }
    if (body.type === 'leave' || body.type === 'arm' || body.type === 'heartbeat') return Promise.resolve(Response.json(apply({ type: body.type, ...identity })))
    return Promise.resolve(Response.json({ code: 'ok' }))
  }) as unknown as typeof fetch
  const mount = (sessionId: string) => {
    const admission = { sessionId, available: () => true, onClose: vi.fn(() => () => {}), recordVersion: 1 }
    return createAgentBrowserSession({ admission: admission as unknown as ReturnType<typeof createAgentEditorAdmission>, showId: 'show', fetch: fetcher })
  }
  return { answers, aborted, calls, mount, state, registrations: () => rendezvous.registrations }
}
const bodiesOfType = (calls: Record<string, unknown>[], type: string) => calls.filter(call => call.type === type)

describe('registration lifetime across close', () => {
  it('retires a registration the server committed before close cancelled the client wait', async () => {
    const harness = registrationHarness()
    const session = harness.mount('session-one')
    await vi.waitFor(() => expect(harness.answers).toHaveLength(1))
    expect(harness.registrations().length).toBe(1)

    session.close()
    harness.answers.shift()!()

    await vi.waitFor(() => expect(bodiesOfType(harness.calls, 'leave')).toEqual([{ type: 'leave', registrationId: 'registration-1', sessionId: 'session-one', showId: 'show' }]))
    expect(harness.registrations().length).toBe(0)
  })

  it('retires that late acknowledgement without reviving the window, receive loop or heartbeat', async () => {
    const harness = registrationHarness()
    const session = harness.mount('session-one')
    await vi.waitFor(() => expect(harness.answers).toHaveLength(1))

    session.close()
    harness.answers.shift()!()

    expect(await session.ready).toBeUndefined()
    expect(session.getWindow()).toBeUndefined()
    await vi.waitFor(() => expect(harness.registrations().length).toBe(0))
    expect(bodiesOfType(harness.calls, 'receive')).toHaveLength(0)
    expect(bodiesOfType(harness.calls, 'heartbeat')).toHaveLength(0)
  })

  it('still retires exactly once when close follows an acknowledged registration', async () => {
    const harness = registrationHarness({ holdRegister: false })
    const session = harness.mount('session-one')
    expect(await session.ready).toEqual({ registrationId: 'registration-1', sessionId: 'session-one', showId: 'show' })

    session.close()
    await vi.waitFor(() => expect(harness.registrations().length).toBe(0))
    expect(bodiesOfType(harness.calls, 'leave')).toHaveLength(1)
  })

  it('does not accumulate registrations across repeated mounts closed before acknowledgement', async () => {
    const harness = registrationHarness()
    for (let mount = 0; mount < MAX_REGISTRATIONS; mount++) {
      const session = harness.mount(`session-${mount}`)
      await vi.waitFor(() => expect(harness.answers).toHaveLength(mount + 1))
      session.close()
    }
    expect(harness.registrations()).toHaveLength(MAX_REGISTRATIONS)

    for (const answer of harness.answers.splice(0)) answer()
    await vi.waitFor(() => expect(harness.registrations().length).toBe(0))

    harness.state.holdRegister = false
    const survivor = harness.mount('session-late')
    // The real reducer is the oracle: a ninth mount answers `capacity` rather
    // than an identity while the eight earlier slots are still held.
    expect(await survivor.ready).toEqual({ registrationId: `registration-${MAX_REGISTRATIONS + 1}`, sessionId: 'session-late', showId: 'show' })
    survivor.close()
  })

  it('retires only the closed registration when a fresh window is already live', async () => {
    const harness = registrationHarness()
    const stale = harness.mount('session-stale')
    await vi.waitFor(() => expect(harness.answers).toHaveLength(1))
    stale.close()

    harness.state.holdRegister = false
    const live = harness.mount('session-live')
    const liveWindow = { registrationId: 'registration-2', sessionId: 'session-live', showId: 'show' }
    expect(await live.ready).toEqual(liveWindow)

    harness.answers.shift()!()

    await vi.waitFor(() => expect(harness.calls).toContainEqual({ type: 'leave', registrationId: 'registration-1', sessionId: 'session-stale', showId: 'show' }))
    expect(harness.registrations()).toEqual([expect.objectContaining(liveWindow)])
    expect(live.getWindow()).toEqual(liveWindow)
    expect(await live.arm()).toEqual({ code: 'armed' })
    expect(stale.getWindow()).toBeUndefined()
    expect(stale.getOutcome('op')).toEqual({ code: 'unknown' })
    live.close()
  })

  it('keeps the register request bounded by its own 35s request timeout', async () => {
    vi.useFakeTimers()
    const harness = registrationHarness()
    const session = harness.mount('session-one')
    await vi.waitFor(() => expect(harness.answers).toHaveLength(1))

    await vi.advanceTimersByTimeAsync(35_000)

    expect(harness.aborted).toContain('register')
    expect(await session.ready).toBeUndefined()
    expect(session.getWindow()).toBeUndefined()
    // Residual, not a repaired case: a registration whose acknowledgement was
    // lost cannot be named, so only the server's expiry TTL releases it.
    expect(harness.registrations().length).toBe(1)
    session.close()
  })

  it('still cancels an in-flight receive when the session closes', async () => {
    const harness = registrationHarness({ holdRegister: false })
    const session = harness.mount('session-one')
    await session.ready
    await vi.waitFor(() => expect(bodiesOfType(harness.calls, 'receive')).toHaveLength(1))

    session.close()

    await vi.waitFor(() => expect(harness.aborted).toContain('receive'))
  })
})
