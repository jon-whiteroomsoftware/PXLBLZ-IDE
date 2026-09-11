/** Session-only presentation of owned outcomes; never edits a Show or replays a candidate. */
export type AgentDrawerMode = 'tucked' | 'open' | 'pinned'
export type AgentOutcome = 'applied' | 'saved' | 'draft' | 'not-applied' | 'rolled-back' | 'superseded' | 'cancelled' | 'unknown'
export interface AgentChange { targetId: string; description: string; touches?: string[]; range?: { startMs: number; endMs: number } }
export interface AgentLine {
  id: string
  kind: 'author' | 'reply' | 'system' | 'action'
  text: string
  operationId?: string
  retryOf?: string
  phase?: 'thinking' | 'working' | 'waiting'
  outcome?: AgentOutcome
  changes?: AgentChange[]
  reason?: string
  retryable?: boolean
  dismissed?: boolean
  calls?: string[]
}
export interface AgentDrawerState {
  drawer: AgentDrawerMode
  pinPreference: boolean
  connection: { kind: 'builtin' | 'external'; name: string } | null
  armingUntil: number | null
  pendingCall: { name: string; expiresAt: number } | null
  contactLost: boolean
  request: { id: string; phase: 'thinking' | 'working' | 'waiting' } | null
  stream: AgentLine[]
  unread: string[]
  highlights: string[]
  highlightPhase: 'none' | 'flash' | 'settled'
  highlightOperation: string | null
  refusedTargets: string[]
  band: { startMs: number; endMs: number } | null
  draft: string
  showMcp: boolean
  announcement?: { text: string; outcome: AgentOutcome }
}
export type AgentDrawerEvent =
  | ({ type: 'connection' } & Pick<AgentDrawerState, 'connection' | 'armingUntil' | 'pendingCall' | 'contactLost'>)
  | { type: 'pin'; pinned: boolean }
  | { type: 'drawer'; mode: AgentDrawerMode }
  | { type: 'chooseBuiltin' | 'cancelArm' | 'declineKnock' | 'approveKnock' | 'drop' | 'reattach' | 'disconnect' | 'forget' | 'reading' | 'settle' | 'manualEdit' | 'undo' | 'leave' | 'toggleMcp' }
  | { type: 'connectOwn' | 'tick'; now: number }
  | { type: 'knock'; name: string; now: number }
  | { type: 'agentBinds'; name: string }
  | { type: 'draft' | 'say' | 'reply' | 'system'; text: string }
  | { type: 'thinking'; id: string }
  | { type: 'beginEdit'; id: string; intent: string; retryOf?: string }
  | { type: 'waiting'; id: string }
  | { type: 'call'; id: string; name: string }
  | { type: 'dismiss'; id: string }
  | { type: 'touch'; targetId: string }
  | { type: 'outcome'; id: string; outcome: AgentOutcome; changes?: AgentChange[]; reason?: string; retryable?: boolean; refusedTargets?: string[]; band?: AgentDrawerState['band'] }
export function createAgentDrawerState(pinned = false): AgentDrawerState {
  return { drawer: pinned ? 'pinned' : 'tucked', pinPreference: pinned, connection: null, armingUntil: null, pendingCall: null, contactLost: false, request: null, stream: [], unread: [], highlights: [], highlightPhase: 'none', highlightOperation: null, refusedTargets: [], band: null, draft: '', showMcp: false }
}
const clearHighlights = { highlights: [], highlightPhase: 'none' as const, highlightOperation: null, refusedTargets: [], band: null }
function append(state: AgentDrawerState, kind: AgentLine['kind'], text: string): AgentDrawerState {
  return { ...state, stream: [...state.stream, { id: `line-${state.stream.length}`, kind, text }] }
}
function connected(state: AgentDrawerState, kind: 'builtin' | 'external', name: string): AgentDrawerState {
  if (state.connection) return state
  return { ...state, connection: { kind, name }, armingUntil: null, pendingCall: null, contactLost: false, drawer: state.drawer === 'open' ? 'pinned' : state.drawer, pinPreference: state.drawer === 'open' || state.pinPreference }
}
export function transitionAgentDrawer(state: AgentDrawerState, event: AgentDrawerEvent): AgentDrawerState {
  switch (event.type) {
    case 'connection': {
      const next = event.connection && !state.connection ? connected(state, event.connection.kind, event.connection.name) : state
      return { ...next, connection: event.connection, armingUntil: event.armingUntil, pendingCall: event.pendingCall, contactLost: event.contactLost }
    }
    case 'pin': return { ...state, pinPreference: event.pinned, drawer: event.pinned ? 'pinned' : 'tucked', unread: event.pinned ? [] : state.unread }
    case 'drawer': return { ...state, drawer: event.mode, unread: event.mode === 'tucked' ? state.unread : [] }
    case 'chooseBuiltin': return connected(state, 'builtin', 'Pixelblaze agent')
    case 'agentBinds': return connected(state, 'external', event.name)
    case 'connectOwn': return state.connection ? state : { ...state, armingUntil: event.now + 120_000 }
    case 'cancelArm': return { ...state, armingUntil: null }
    case 'knock': return state.connection || state.pendingCall ? state : { ...state, pendingCall: { name: event.name, expiresAt: event.now + 30_000 }, drawer: state.drawer === 'tucked' ? 'open' : state.drawer, unread: [] }
    case 'approveKnock': return state.pendingCall ? connected(state, 'external', state.pendingCall.name) : state
    case 'declineKnock': return { ...state, pendingCall: null }
    case 'tick': {
      if (state.armingUntil !== null && event.now >= state.armingUntil) return append({ ...state, armingUntil: null }, 'system', 'Connection window expired. Choose Connect an MCP agent again.')
      if (state.pendingCall && event.now >= state.pendingCall.expiresAt) return append({ ...state, pendingCall: null }, 'system', 'Call expired; the agent was not connected.')
      return state
    }
    case 'drop': return state.connection && !state.contactLost ? append({ ...state, contactLost: true }, 'system', 'contact lost') : state
    case 'reattach': return state.contactLost ? append({ ...state, contactLost: false }, 'system', 'contact restored') : state
    // The controller first publishes owned cancellation/settlement receipts.
    case 'disconnect': case 'forget': return { ...state, connection: null, armingUntil: null, pendingCall: null, contactLost: false, request: null }
    case 'draft': return { ...state, draft: event.text }
    case 'say': return append(state, 'author', event.text)
    case 'reply': return append(state, 'reply', event.text)
    case 'system': return append(state, 'system', event.text)
    case 'reading': return state.connection && !state.request ? append(state, 'system', 'reading the Show') : state
    case 'toggleMcp': return { ...state, showMcp: !state.showMcp }
    case 'thinking': return state.connection?.kind !== 'builtin' || (state.request && state.request.id !== event.id) ? state : { ...state, request: { id: event.id, phase: 'thinking' } }
    case 'beginEdit': {
      if (!state.connection || state.stream.some(line => line.operationId === event.id) || (state.request && state.request.id !== event.id)) return state
      return { ...state, request: { id: event.id, phase: 'working' }, stream: [...state.stream, { id: `op-${event.id}`, operationId: event.id, retryOf: event.retryOf, kind: 'action', text: event.intent, phase: 'working' }] }
    }
    case 'waiting': return state.request?.id !== event.id ? state : { ...state, request: { id: event.id, phase: 'waiting' }, stream: state.stream.map(line => line.operationId === event.id ? { ...line, phase: 'waiting' } : line) }
    case 'call': return { ...state, stream: state.stream.map(line => line.operationId === event.id ? { ...line, calls: [...(line.calls ?? []), event.name] } : line) }
    case 'dismiss': return { ...state, stream: state.stream.map(line => line.operationId === event.id ? { ...line, dismissed: true } : line) }
    case 'touch': return { ...state, highlights: state.highlights.filter(id => id !== event.targetId), refusedTargets: state.refusedTargets.filter(id => id !== event.targetId) }
    case 'manualEdit': case 'undo': return { ...state, ...clearHighlights }
    case 'settle': return state.highlightPhase === 'flash' ? { ...state, highlightPhase: 'settled' } : state
    case 'leave': return createAgentDrawerState()
    case 'outcome': {
      const previous = state.stream.find(line => line.operationId === event.id)
      if (!previous || previous.outcome === event.outcome) return state
      const changes = ['applied', 'saved', 'draft'].includes(event.outcome) ? event.changes ?? previous.changes : previous.changes
      const attributed = state.highlightOperation === event.id
      const clears = attributed && ['rolled-back', 'superseded'].includes(event.outcome)
      return {
        ...state,
        ...(clears ? clearHighlights : {}),
        request: state.request?.id === event.id && event.outcome !== 'unknown' ? null : state.request,
        announcement: { text: previous.text, outcome: event.outcome },
        stream: state.stream.map(line => line === previous ? { ...line, outcome: event.outcome, phase: undefined, changes, reason: event.reason, retryable: event.retryable ?? false } : line),
        unread: state.drawer === 'tucked' ? [...new Set([...state.unread, event.id])] : state.unread,
        ...((event.outcome === 'applied' || event.outcome === 'saved' || event.outcome === 'draft') && (!previous.outcome || previous.outcome === 'unknown') ? { highlights: event.band ? [] : [...new Set((changes ?? []).map(change => change.targetId))], highlightPhase: 'flash' as const, highlightOperation: event.id, band: event.band ?? null, refusedTargets: [] } : {}),
        ...(event.outcome === 'not-applied' ? { refusedTargets: event.refusedTargets ?? [] } : {}),
      }
    }
  }
}
export function agentEdgeState(state: AgentDrawerState) {
  const latest = state.announcement?.outcome
  const failed = latest === 'not-applied' || latest === 'rolled-back'
  if (state.pendingCall) return { label: 'ANSWER', dot: 'busy', ringing: true, failed }
  if (state.contactLost) return { label: 'AGENT', dot: 'dropped', ringing: false, failed }
  if (state.request) return { label: state.request.phase === 'waiting' ? 'WAITING' : 'WORKING', dot: state.request.phase === 'waiting' ? 'waiting' : 'busy', ringing: false, failed }
  return { label: 'AGENT', dot: failed ? 'failed' : state.connection ? 'connected' : 'none', ringing: false, failed }
}

export function agentEdgeAccessibleName(state: AgentDrawerState): string {
  const status = state.contactLost ? 'contact lost'
    : state.pendingCall ? `incoming call from ${state.pendingCall.name}`
      : state.request ? state.request.phase === 'waiting' ? 'waiting for you' : state.request.phase
        : state.armingUntil !== null ? 'waiting for an agent to connect'
          : state.connection ? `${state.connection.name} connected` : 'no agent connected'
  return `Open the Agent drawer; ${agentEdgeState(state).label.toLowerCase()}; ${status}; ${state.unread.length} unread outcomes`
}


/** Per-command ranges are not rebased through later edits. A single range is
 * proven; multiple ranges cannot truthfully be collapsed into one final band.
 * The full edit and its change descriptions remain available either way.
 */
export function agentInsertionBand(changes: AgentChange[]): AgentDrawerState['band'] {
  const ranges = changes.flatMap(change => change.range ? [change.range] : [])
  if (ranges.length !== 1) return null
  const range = ranges[0]
  return Number.isFinite(range.startMs) && Number.isFinite(range.endMs) && range.endMs >= range.startMs ? range : null
}
