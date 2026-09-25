/** Coordination metadata only: no documents, candidates, transcripts or operation receipts. */
export const REGISTRATION_TTL_MS = 300_000
export const CONTACT_LOST_MS = 45_000
export const MAX_REGISTRATIONS = 8
export interface EditorRegistration {
  registrationId: string
  sessionId: string
  showId: string
  showName?: string
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
  | ({ kind: 'bound'; registrationId: string; retiring?: true; moveNotice?: ExternalMoveNotice } & AgentClaim)
export interface ExternalMoveNotice { showId: string; showName?: string }
export interface RendezvousState {
  registrations: EditorRegistration[]
  slot: RendezvousSlot | null
}
export type WindowIdentity = Pick<EditorRegistration, 'registrationId' | 'sessionId' | 'showId'>
export type WindowCommand =
  | ({ type: 'register'; showName?: string; showVersion: 2 } & WindowIdentity)
  | ({ type: 'arm' | 'poll' | 'heartbeat' | 'leave' | 'disarm' } & WindowIdentity)
  | ({ type: 'answer' | 'decline'; callId: string } & WindowIdentity)
  | ({ type: 'disconnect' | 'retirement-ack'; bindingId: string } & WindowIdentity)
export type RendezvousCommand = WindowCommand
  | ({ type: 'claim'; window?: WindowIdentity } & AgentClaim)
  | ({ type: 'inspect' } & AgentClaim)
  | ({ type: 'connect-external' } & AgentClaim)
  | { type: 'resolve-external'; agentId: string; callId?: string }
  | { type: 'resolve-external-tool'; agentId: string; callId?: string; expectedBindingId?: string }
  | { type: 'inspect-external-tool-binding'; agentId: string }
  | ({ type: 'resolve-builtin' } & WindowIdentity)
  | ({ type: 'disconnect-forget'; bindingId: string } & WindowIdentity)
  | ({ type: 'inspect-external-move'; expectedBindingId: string } & WindowIdentity)
  | { type: 'replace-external-binding'; target: WindowIdentity; expected: Pick<AgentClaim, 'agentId' | 'bindingId'>; next: Pick<AgentClaim, 'callId' | 'bindingId'> }
  | { type: 'consume-external-move-notice'; agentId: string }
  | { type: 'retire-grant'; agentId: string }
  | { type: 'expire' }
export interface RendezvousResult { code: string; contact?: 'live' | 'lost'; claim?: AgentClaim; moveNotice?: ExternalMoveNotice }
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
  const exactRegistration = (identity: WindowIdentity) => state.registrations.find(item => item.registrationId === identity.registrationId && item.sessionId === identity.sessionId && item.showId === identity.showId)
  const slotClaim = (slot: Extract<RendezvousSlot, { kind: 'pending' | 'bound' }>): AgentClaim => ({ agentId: slot.agentId, agentName: slot.agentName, agentKind: slot.agentKind, callId: slot.callId, bindingId: slot.bindingId })
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
      if (command.type === 'resolve-external' && command.callId !== undefined && command.callId !== slot.callId) return result(slot.kind === 'bound' ? 'binding_moved' : 'no_live_editor')
      return result(slot.kind === 'bound' && slot.retiring ? 'retirement_unconfirmed' : slot.kind)
    }
    if (command.type === 'resolve-external') return result('no_live_editor')
    if (command.agentKind !== 'external') return result('invalid_request')
    return transitionRendezvous(state, { ...command, type: 'claim' }, now)
  }
  // A read of the bound editor only (#1039): the MCP server asks which record
  // version it is describing tools for. It consumes no move notice, changes no
  // slot and is not a tool call, so it is exempt from the agent's rate window.
  if (command.type === 'inspect-external-tool-binding') {
    const slot = state.slot
    if (!slot || slot.kind !== 'bound' || slot.agentKind !== 'external' || slot.agentId !== command.agentId || slot.retiring) return result('no_live_editor')
    return { state, result: { code: 'bound', claim: slotClaim(slot) } }
  }
  if (command.type === 'resolve-external-tool') {
    const slot = state.slot
    if (!slot || slot.kind === 'armed' || slot.agentKind !== 'external' || slot.agentId !== command.agentId) return result('no_live_editor')
    if (slot.kind === 'pending') {
      if ((command.callId !== undefined && command.callId !== slot.callId) || command.expectedBindingId !== undefined) return result('no_live_editor')
      return { state, result: { code: 'pending', claim: slotClaim(slot) } }
    }
    if (slot.retiring) return result('retirement_unconfirmed')
    const moved = (command.callId !== undefined && command.callId !== slot.callId)
      || (command.expectedBindingId !== undefined && command.expectedBindingId !== slot.bindingId)
    const moveNotice = slot.moveNotice
    delete slot.moveNotice
    return { state, result: { code: moved ? 'binding_moved' : 'bound', claim: slotClaim(slot), ...(moveNotice ? { moveNotice } : {}) } }
  }
  if (command.type === 'inspect') {
    const slot = state.slot
    if (!slot || slot.kind === 'armed' || slot.agentId !== command.agentId || slot.agentKind !== command.agentKind || slot.callId !== command.callId || slot.bindingId !== command.bindingId) return result('no_live_editor')
    return result(slot.kind === 'bound' && slot.retiring ? 'retirement_unconfirmed' : slot.kind)
  }
  if (command.type === 'inspect-external-move') {
    const target = exactRegistration(command)
    if (!target) return result('retired')
    const slot = state.slot
    if (!slot || slot.kind !== 'bound' || slot.agentKind !== 'external' || slot.retiring) return result('move_unavailable')
    if (slot.bindingId !== command.expectedBindingId) return result('connection_changed')
    if (slot.registrationId === target.registrationId) return result('bound_here')
    return { state, result: { code: 'move_available', claim: slotClaim(slot) } }
  }
  if (command.type === 'replace-external-binding') {
    const target = exactRegistration(command.target)
    if (!target) return result('retired')
    const slot = state.slot
    if (!slot || slot.kind !== 'bound' || slot.agentKind !== 'external' || slot.retiring
      || slot.agentId !== command.expected.agentId || slot.bindingId !== command.expected.bindingId) return result('connection_changed')
    if (slot.registrationId === target.registrationId) return result('bound_here')
    state.slot = {
      kind: 'bound', registrationId: target.registrationId,
      agentKind: 'external', agentId: slot.agentId, agentName: slot.agentName,
      callId: command.next.callId, bindingId: command.next.bindingId,
      moveNotice: { showId: target.showId, ...(target.showName ? { showName: target.showName } : {}) },
    }
    return result('moved')
  }
  if (command.type === 'consume-external-move-notice') {
    const slot = state.slot
    if (!slot || slot.kind !== 'bound' || slot.agentKind !== 'external' || slot.agentId !== command.agentId) return result('no_live_editor')
    if (slot.retiring) return result('retirement_unconfirmed')
    const moveNotice = slot.moveNotice
    delete slot.moveNotice
    return { state, result: { code: 'bound', claim: slotClaim(slot), ...(moveNotice ? { moveNotice } : {}) } }
  }
  if (command.type === 'register') {
    if (state.registrations.some((item) => item.sessionId === command.sessionId || item.registrationId === command.registrationId)) return result('already_registered')
    if (state.registrations.length >= MAX_REGISTRATIONS) return result('capacity')
    const showName = typeof command.showName === 'string' && command.showName.length > 0 && command.showName.length <= 128 ? command.showName : undefined
    state.registrations.push({ registrationId: command.registrationId, sessionId: command.sessionId, showId: command.showId, ...(showName ? { showName } : {}), lastSeenAt: now })
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
  const registration = exactRegistration(command)
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
export function windowRendezvousView(state: RendezvousState, window: WindowIdentity) {
  const slot = state.slot
  if (!slot) return { kind: 'idle' as const }
  if (slot.kind === 'pending') return { kind: 'pending' as const, callId: slot.callId, agentKind: slot.agentKind, agentName: slot.agentName, expiresAt: slot.expiresAt }
  if (slot.registrationId !== window.registrationId) {
    if (slot.kind === 'bound' && slot.agentKind === 'external' && !slot.retiring) {
      const owner = state.registrations.find(item => item.registrationId === slot.registrationId)
      if (owner) return {
        kind: 'external-bound' as const,
        agentName: slot.agentName,
        showId: owner.showId,
        ...(owner.showName ? { showName: owner.showName } : {}),
        relation: owner.showId === window.showId ? 'same-show' as const : 'other-show' as const,
        bindingId: slot.bindingId,
      }
    }
    return { kind: 'occupied' as const }
  }
  if (slot.kind === 'armed') return { kind: 'armed' as const, expiresAt: slot.expiresAt }
  if (slot.retiring) return { kind: 'retiring' as const, bindingId: slot.bindingId, agentName: slot.agentName }
  return { kind: 'bound' as const, bindingId: slot.bindingId, agentKind: slot.agentKind, agentName: slot.agentName }
}
