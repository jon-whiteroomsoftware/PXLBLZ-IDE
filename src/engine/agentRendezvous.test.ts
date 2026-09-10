import { describe, expect, it } from 'vitest'
import { emptyRendezvous, transitionRendezvous } from './agentRendezvous'

describe('account rendezvous', () => {
  it('arms one live registered window and binds only one agent', () => {
    const initial = emptyRendezvous()
    const registered = transitionRendezvous(initial, { type: 'register', sessionId: 'session-a', showId: 'show-a', registrationId: 'registration-a' }, 0)
    expect(registered.result.code).toBe('registered')
    const armed = transitionRendezvous(registered.state, { type: 'arm', registrationId: 'registration-a', sessionId: 'session-a', showId: 'show-a' }, 1)
    expect(armed.result.code).toBe('armed')
    const claimed = transitionRendezvous(armed.state, { type: 'claim', agentKind: 'external' as const, agentId: 'agent-a', agentName: 'Agent A', callId: 'call-a', bindingId: 'binding-a' }, 2)
    expect(claimed.result.code).toBe('bound')
    const competing = transitionRendezvous(claimed.state, { type: 'claim', agentKind: 'external' as const, agentId: 'agent-b', agentName: 'Agent B', callId: 'call-b', bindingId: 'binding-b' }, 3)
    expect(competing.result.code).toBe('occupied')
    expect(competing.state.slot).toEqual(claimed.state.slot)
    expect(initial).toEqual(emptyRendezvous())
  })
})

const windowA = { registrationId: 'registration-a', sessionId: 'session-a', showId: 'show-a' }
const windowB = { registrationId: 'registration-b', sessionId: 'session-b', showId: 'show-b' }
const agentA = { agentKind: 'external' as const, agentId: 'agent-a', agentName: 'Agent A', callId: 'call-a', bindingId: 'binding-a' }
function registered() {
  const a = transitionRendezvous(emptyRendezvous(), { type: 'register', ...windowA }, 0).state
  return transitionRendezvous(a, { type: 'register', ...windowB }, 0).state
}

it('holds a call for any registered window, and the first Answer owns the slot', () => {
  const call = transitionRendezvous(registered(), { type: 'claim', ...agentA }, 10)
  expect(call.result.code).toBe('pending')
  const answered = transitionRendezvous(call.state, { type: 'answer', ...windowB, callId: 'call-a' }, 20)
  expect(answered.result.code).toBe('bound')
  expect(answered.state.slot).toEqual({ kind: 'bound', registrationId: 'registration-b', ...agentA })
  const late = transitionRendezvous(answered.state, { type: 'answer', ...windowA, callId: 'call-a' }, 21)
  expect(late.result.code).toBe('occupied')
  expect(late.state).toEqual(answered.state)
})

it.each([119_999, 120_000])('enforces the arming boundary at %i ms', (time) => {
  const armed = transitionRendezvous(registered(), { type: 'arm', ...windowA }, 0).state
  const claimed = transitionRendezvous(armed, { type: 'claim', ...agentA }, time)
  expect(claimed.result.code).toBe(time < 120_000 ? 'bound' : 'no_live_editor')
})

it.each([29_999, 30_000])('enforces the incoming Answer boundary at %i ms', (time) => {
  const pending = transitionRendezvous(registered(), { type: 'claim', ...agentA }, 0).state
  const answered = transitionRendezvous(pending, { type: 'answer', ...windowA, callId: 'call-a' }, time)
  expect(answered.result.code).toBe(time < 30_000 ? 'bound' : 'no_live_editor')
})

it('preserves binding through contact loss and ends only the matching local window', () => {
  const armed = transitionRendezvous(registered(), { type: 'arm', ...windowA }, 0).state
  const bound = transitionRendezvous(armed, { type: 'claim', ...agentA }, 1).state
  const lost = transitionRendezvous(bound, { type: 'poll', ...windowA }, 46_000)
  expect(lost.result.contact).toBe('lost')
  expect(lost.state.slot).toEqual(bound.slot)
  const other = transitionRendezvous(lost.state, { type: 'disconnect', bindingId: 'binding-a', ...windowB }, 46_001)
  expect(other.result.code).toBe('not_bound_here')
  expect(other.state.slot).toEqual(bound.slot)
  const recovered = transitionRendezvous(other.state, { type: 'heartbeat', ...windowA }, 46_002)
  expect(recovered.result.contact).toBe('live')
  expect(recovered.state.slot).toEqual(bound.slot)
  const ended = transitionRendezvous(recovered.state, { type: 'disconnect', bindingId: 'binding-a', ...windowA }, 46_003)
  expect(ended.result.code).toBe('disconnected')
  expect(ended.state.slot).toBeNull()
})

it('retires stale registration at five minutes without stale messages displacing a successor', () => {
  const armed = transitionRendezvous(registered(), { type: 'arm', ...windowA }, 0).state
  const bound = transitionRendezvous(armed, { type: 'claim', ...agentA }, 1).state
  expect(transitionRendezvous(bound, { type: 'poll', ...windowA }, 299_999).state.slot).toEqual(bound.slot)
  const expired = transitionRendezvous(bound, { type: 'heartbeat', ...windowA }, 300_000)
  expect(expired.result.code).toBe('retired')
  expect(expired.state.slot).toBeNull()
  const replacement = { ...windowA, registrationId: 'new-registration', sessionId: 'new-session' }
  const fresh = transitionRendezvous(expired.state, { type: 'register', ...replacement }, 300_001).state
  const newArm = transitionRendezvous(fresh, { type: 'arm', ...replacement }, 300_002).state
  const late = transitionRendezvous(newArm, { type: 'leave', ...windowA }, 300_003)
  expect(late.result.code).toBe('retired')
  expect(late.state).toEqual(newArm)
})

it('checks session and Show along with registration capability', () => {
  const state = registered()
  for (const identity of [{ ...windowA, sessionId: 'wrong' }, { ...windowA, showId: 'wrong' }]) {
    const refused = transitionRendezvous(state, { type: 'arm', ...identity }, 1)
    expect(refused.result.code).toBe('retired')
    expect(refused.state).toEqual(state)
  }
})

it('does not evict live registrations at capacity, and late decline cannot drop a new call', () => {
  let state = emptyRendezvous()
  for (let i = 0; i < 8; i++) state = transitionRendezvous(state, { type: 'register', registrationId: `r${i}`, sessionId: `s${i}`, showId: 'show' }, 0).state
  const full = transitionRendezvous(state, { type: 'register', ...windowA }, 1)
  expect(full.result.code).toBe('capacity')
  expect(full.state).toEqual(state)
  const pending = transitionRendezvous(registered(), { type: 'claim', ...agentA }, 0).state
  const stale = transitionRendezvous(pending, { type: 'decline', ...windowA, callId: 'older-call' }, 1)
  expect(stale.result.code).toBe('no_live_editor')
  expect(stale.state).toEqual(pending)
  expect(transitionRendezvous(pending, { type: 'decline', ...windowA, callId: 'call-a' }, 2).state.slot).toBeNull()
})
it('a delayed disconnect cannot end a newer binding in the same live window', () => {
  const firstArm = transitionRendezvous(registered(), { type: 'arm', ...windowA }, 0).state
  const first = transitionRendezvous(firstArm, { type: 'claim', ...agentA }, 1).state
  const ended = transitionRendezvous(first, { type: 'disconnect', ...windowA, bindingId: 'binding-a' }, 2).state
  const rearmed = transitionRendezvous(ended, { type: 'arm', ...windowA }, 3).state
  const second = transitionRendezvous(rearmed, { type: 'claim', ...agentA, bindingId: 'binding-new', callId: 'call-new' }, 4).state
  const late = transitionRendezvous(second, { type: 'disconnect', ...windowA, bindingId: 'binding-a' }, 5)
  expect(late.result.code).toBe('retired')
  expect(late.state).toEqual(second)
})
it('lets only the same trusted caller resolve its pending call after Answer', () => {
  const pending = transitionRendezvous(registered(), { type: 'claim', ...agentA }, 0).state
  expect(transitionRendezvous(pending, { type: 'inspect', ...agentA }, 1).result.code).toBe('pending')
  const bound = transitionRendezvous(pending, { type: 'answer', ...windowA, callId: 'call-a' }, 2).state
  expect(transitionRendezvous(bound, { type: 'inspect', ...agentA }, 3).result.code).toBe('bound')
  expect(transitionRendezvous(bound, { type: 'inspect', ...agentA, agentId: 'another' }, 3).result.code).toBe('no_live_editor')
  expect(transitionRendezvous(pending, { type: 'inspect', ...agentA }, 30_000).result.code).toBe('no_live_editor')
})
it('claims builtin work directly for its initiating window and excludes external attachment', () => {
  const builtin = { ...agentA, agentKind: 'builtin' as const }
  const refused = transitionRendezvous(registered(), { type: 'claim', ...builtin }, 1)
  expect(refused.result.code).toBe('retired')
  const claimed = transitionRendezvous(registered(), { type: 'claim', ...builtin, window: windowB }, 2)
  expect(claimed.result.code).toBe('bound')
  expect(claimed.state.slot).toEqual({ ...builtin, kind: 'bound', registrationId: windowB.registrationId })
  expect(transitionRendezvous(claimed.state, { type: 'claim', ...agentA }, 3).result.code).toBe('occupied')
})
