/** Coordination metadata only: no documents, candidates, transcripts or operation receipts. */
export const REGISTRATION_TTL_MS = 300_000
export const CONTACT_LOST_MS = 45_000
export const MAX_REGISTRATIONS = 8
export interface EditorRegistration {
  registrationId: string
  sessionId: string
  showId: string
  lastSeenAt: number
}
export interface AgentClaim {
  agentKind: 'builtin' | 'external'
  agentId: string
  agentName: string
  callId: string
  bindingId: string
}
export type RendezvousSlot =
  | { kind: 'armed'; registrationId: string; expiresAt: number }
  | ({ kind: 'pending'; expiresAt: number } & AgentClaim)
  | ({ kind: 'bound'; registrationId: string; retiring?: true } & AgentClaim)
export interface RendezvousState {
  registrations: EditorRegistration[]
  slot: RendezvousSlot | null
}
export type WindowIdentity = Pick<EditorRegistration, 'registrationId' | 'sessionId' | 'showId'>
export type WindowCommand =
  | ({ type: 'register' | 'arm' | 'poll' | 'heartbeat' | 'leave' | 'disarm' } & WindowIdentity)
  | ({ type: 'answer' | 'decline'; callId: string } & WindowIdentity)
  | ({ type: 'disconnect' | 'retirement-ack'; bindingId: string } & WindowIdentity)
export type RendezvousCommand = WindowCommand
  | ({ type: 'claim'; window?: WindowIdentity } & AgentClaim)
  | ({ type: 'inspect' } & AgentClaim)
  | ({ type: 'connect-external' } & AgentClaim)
  | { type: 'resolve-external'; agentId: string; callId?: string }
  | ({ type: 'resolve-builtin' } & WindowIdentity)
  | ({ type: 'disconnect-forget'; bindingId: string } & WindowIdentity)
  | { type: 'retire-grant'; agentId: string }
  | { type: 'expire' }
export interface RendezvousResult { code: string; contact?: 'live' | 'lost'; claim?: AgentClaim }
export function emptyRendezvous(): RendezvousState { return { registrations: [], slot: null } }

export function expireRendezvous(previous: RendezvousState, now: number): RendezvousState {
  const state = structuredClone(previous)
  state.registrations = state.registrations.filter((item) => item.lastSeenAt + REGISTRATION_TTL_MS > now)
  if (state.slot && (
    (state.slot.kind !== 'bound' && state.slot.expiresAt <= now)
    || (state.slot.kind !== 'pending' && !state.registrations.some((item) => item.registrationId === (state.slot as { registrationId: string }).registrationId))
  )) state.slot = null
  return state
}

export function transitionRendezvous(previous: RendezvousState, command: RendezvousCommand, now: number): { state: RendezvousState; result: RendezvousResult } {
  const state = expireRendezvous(previous, now)
  const result = (code: string, contact?: 'live' | 'lost') => ({ state, result: { code, ...(contact ? { contact } : {}) } })
  if (command.type === 'expire') return result('expired')
  if (command.type === 'retire-grant') {
    const slot = state.slot
    if (!slot || slot.kind === 'armed' || slot.agentKind !== 'external' || slot.agentId !== command.agentId) return result('editing_ended')
    if (slot.kind === 'pending') { state.slot = null; return result('editing_ended') }
    slot.retiring = true
    return result('retirement_unconfirmed')
  }
  if (command.type === 'connect-external' || command.type === 'resolve-external') {
    const slot = state.slot
    if (slot && (slot.kind === 'pending' || slot.kind === 'bound') && slot.agentKind === 'external' && slot.agentId === command.agentId) {
      if (command.type === 'resolve-external' && command.callId !== undefined && command.callId !== slot.callId) return result('no_live_editor')
      return result(slot.kind === 'bound' && slot.retiring ? 'retirement_unconfirmed' : slot.kind)
    }
    if (command.type === 'resolve-external') return result('no_live_editor')
    if (command.agentKind !== 'external') return result('invalid_request')
    return transitionRendezvous(state, { ...command, type: 'claim' }, now)
  }
  if (command.type === 'inspect') {
    const slot = state.slot
    if (!slot || slot.kind === 'armed' || slot.agentId !== command.agentId || slot.agentKind !== command.agentKind || slot.callId !== command.callId || slot.bindingId !== command.bindingId) return result('no_live_editor')
    return result(slot.kind === 'bound' && slot.retiring ? 'retirement_unconfirmed' : slot.kind)
  }
  if (command.type === 'register') {
    if (state.registrations.some((item) => item.sessionId === command.sessionId || item.registrationId === command.registrationId)) return result('already_registered')
    if (state.registrations.length >= MAX_REGISTRATIONS) return result('capacity')
    state.registrations.push({ registrationId: command.registrationId, sessionId: command.sessionId, showId: command.showId, lastSeenAt: now })
    return result('registered')
  }
  if (command.type === 'claim') {
    if (command.agentKind === 'builtin') {
      const target = command.window
      const registration = target && state.registrations.find((item) => item.registrationId === target.registrationId && item.sessionId === target.sessionId && item.showId === target.showId)
      if (!registration) return result('retired')
      if (state.slot) return result('occupied')
      state.slot = { kind: 'bound', registrationId: registration.registrationId, agentKind: command.agentKind, agentId: command.agentId, agentName: command.agentName, callId: command.callId, bindingId: command.bindingId }
      return result('bound')
    }
    if (command.window) return result('invalid_request')
    if (!state.slot) {
      state.slot = { kind: 'pending', expiresAt: now + 30_000, agentKind: command.agentKind, agentId: command.agentId, agentName: command.agentName, callId: command.callId, bindingId: command.bindingId }
      return result('pending')
    }
    if (state.slot.kind !== 'armed') return result('occupied')
    state.slot = { kind: 'bound', registrationId: state.slot.registrationId, agentKind: command.agentKind, agentId: command.agentId, agentName: command.agentName, callId: command.callId, bindingId: command.bindingId }
    return result('bound')
  }
  const registration = state.registrations.find((item) => item.registrationId === command.registrationId && item.sessionId === command.sessionId && item.showId === command.showId)
  if (!registration) return result('retired')
  if (command.type === 'disconnect-forget') {
    const slot = state.slot
    if (slot?.kind !== 'bound' || slot.registrationId !== registration.registrationId || slot.agentKind !== 'external' || slot.bindingId !== command.bindingId) return result('not_bound_here')
    const claim: AgentClaim = { agentId: slot.agentId, agentName: slot.agentName, agentKind: slot.agentKind, callId: slot.callId, bindingId: slot.bindingId }
    state.slot = null
    return { state, result: { code: 'disconnected', claim } }
  }
  if (command.type === 'resolve-builtin') return result(state.slot?.kind === 'bound' && state.slot.registrationId === registration.registrationId && state.slot.agentKind === 'builtin' ? 'bound' : 'not_bound_here')
  if (command.type === 'disarm') {
    if (state.slot?.kind !== 'armed' || state.slot.registrationId !== registration.registrationId) return result('not_armed_here')
    state.slot = null
    return result('disarmed')
  }
  if (command.type === 'poll') return result('status', now - registration.lastSeenAt >= CONTACT_LOST_MS ? 'lost' : 'live')
  if (command.type === 'heartbeat') {
    registration.lastSeenAt = now
    return result('status', 'live')
  }
  if (command.type === 'leave') {
    state.registrations = state.registrations.filter((item) => item !== registration)
    if (state.slot?.kind !== 'pending' && state.slot?.registrationId === registration.registrationId) state.slot = null
    return result('retired')
  }
  if (command.type === 'disconnect' || command.type === 'retirement-ack') {
    if (state.slot?.kind !== 'bound' || state.slot.registrationId !== registration.registrationId) return result('not_bound_here')
    if (state.slot.bindingId !== command.bindingId) return result('retired')
    if (command.type === 'retirement-ack' && !state.slot.retiring) return result('not_retiring')
    state.slot = null
    return result(command.type === 'retirement-ack' ? 'editing_ended' : 'disconnected')
  }
  if (command.type === 'answer' || command.type === 'decline') {
    if (state.slot?.kind === 'bound' || state.slot?.kind === 'armed') return result('occupied')
    if (!state.slot || state.slot.callId !== command.callId) return result('no_live_editor')
    const pending = state.slot
    state.slot = command.type === 'decline' ? null : {
      kind: 'bound', registrationId: registration.registrationId,
      agentKind: pending.agentKind, agentId: pending.agentId, agentName: pending.agentName, callId: pending.callId, bindingId: pending.bindingId,
    }
    return result(command.type === 'decline' ? 'declined' : 'bound')
  }
  if (state.slot) return result('occupied')
  state.slot = { kind: 'armed', registrationId: registration.registrationId, expiresAt: now + 120_000 }
  return result('armed')
}

/** A window sees only its own capability and the minimum incoming/occupied explanation. */
export function windowRendezvousView(state: RendezvousState, registrationId: string) {
  const slot = state.slot
  if (!slot) return { kind: 'idle' as const }
  if (slot.kind === 'pending') return { kind: 'pending' as const, callId: slot.callId, agentKind: slot.agentKind, agentName: slot.agentName, expiresAt: slot.expiresAt }
  if (slot.registrationId !== registrationId) return { kind: 'occupied' as const, ...(slot.kind === 'bound' ? { agentName: slot.agentName } : {}) }
  if (slot.kind === 'armed') return { kind: 'armed' as const, expiresAt: slot.expiresAt }
  if (slot.retiring) return { kind: 'retiring' as const, bindingId: slot.bindingId, agentName: slot.agentName }
  return { kind: 'bound' as const, bindingId: slot.bindingId, agentKind: slot.agentKind, agentName: slot.agentName }
}
