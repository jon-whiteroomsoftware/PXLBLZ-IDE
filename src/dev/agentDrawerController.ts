import { create } from 'zustand'
import { agentInsertionBand, createAgentDrawerState, transitionAgentDrawer, type AgentChange, type AgentDrawerEvent, type AgentDrawerState, type AgentOutcome } from '@/engine/agentDrawerModel'
import type { createAgentEditorAdmission } from './agentEditorAdmission'
import type { ShowEditRequest } from '@/engine/showEditAdmission'
import { useShowStore } from '@/store/showStore'

type Admission = ReturnType<typeof createAgentEditorAdmission>
type Captured = NonNullable<ReturnType<Admission['beginRequest']>> & { retryResize?: ReturnType<Admission['retryIntent']> }
type Receipt = ReturnType<Admission['readOutcome']>
interface DiagnosticRecord {
  requestId: string
  applied?: boolean | null
  changed?: boolean
  error?: string | null
  outcome?: Receipt
  events: Array<{ kind: string; name?: string; at: number }>
  submittedAt: number
  showId: string
  capturedUpdatedAt: number
  responseAt: number | null
  firstEventAt: number | null
  doneAt: number | null
  applyStartedAt: number | null
  applyEndedAt: number | null
  bridgeTiming?: unknown
}
interface DrawerStore { busy: boolean; state: AgentDrawerState; controller: AgentDrawerController | null }
export const useAgentDrawerStore = create<DrawerStore>(() => ({ state: createAgentDrawerState(), controller: null, busy: false }))
export type AgentDrawerController = ReturnType<typeof createAgentDrawerController>

export function createAgentDrawerController(api: Admission, showId: string) {
  let state = createAgentDrawerState()
  try { state = createAgentDrawerState(localStorage.getItem('pxlblz-agent-drawer-pinned') === 'true') } catch { /* Session still works when preferences are unavailable. */ }
  let disposed = false
  let bridgeUrl: string | null = null
  let active: Captured | null = null
  let adopting = false
  let transport: AbortController | null = null
  const captures = new Map<string, Captured>()
  const records: DiagnosticRecord[] = []
  const history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  const metadata = new Map<string, { changes: AgentChange[]; band: AgentDrawerState['band'] }>()
  const dispatch = (event: AgentDrawerEvent) => {
    if (disposed) return
    const next = transitionAgentDrawer(state, event)
    if (next === state) return
    state = next
    useAgentDrawerStore.setState({ state })
  }
  const available = () => !disposed && api.available()
  const mint = () => `req-${crypto.randomUUID()}`
  const publish = (request: ShowEditRequest, receipt: Receipt) => {
    if (!receipt || receipt.request.operationId !== request.operationId || receipt.request.sessionId !== request.sessionId) {
      if (state.stream.some(line => line.operationId === request.operationId && line.outcome && line.outcome !== 'unknown')) return
      dispatch({ type: 'outcome', id: request.operationId, outcome: 'unknown', reason: 'Outcome unavailable; inspect the Show. Do not replay this request.' })
      return
    }
    if (receipt.status === 'pending') return
    if (receipt.status === 'waiting') { dispatch({ type: 'waiting', id: request.operationId }); return }
    const details = metadata.get(request.operationId)
    const outcome: AgentOutcome = receipt.status === 'applied'
      ? receipt.settlement === 'saving' ? 'applied' : receipt.settlement
      : receipt.status === 'cancelled' ? 'cancelled'
      : receipt.status === 'retired' ? 'unknown' : 'not-applied'
    dispatch({ type: 'outcome', id: request.operationId, outcome, changes: details?.changes, band: details?.band,
      reason: receipt.status === 'refused' ? receipt.reason : receipt.status === 'completed' ? receipt.completion : undefined,
      retryable: Boolean(api.retryIntent(request)),
      refusedTargets: receipt.status === 'refused' ? details?.changes.map(change => change.targetId) ?? [...request.targets] : [],
    })
    const record = records.find(item => item.requestId === request.operationId)
    if (record) { record.outcome = receipt; record.applied = receipt.status === 'completed' ? null : receipt.status === 'applied' && receipt.settlement !== 'rolled-back' }
  }
  const refresh = () => {
    if (!available()) return
    for (const captured of captures.values()) publish(captured.request, api.readOutcome(captured.request))
  }
  const interval = window.setInterval(() => { dispatch({ type: 'tick', now: Date.now() }); refresh() }, 100)
  const unsubscribe = useShowStore.subscribe((next, previous) => {
    if (!adopting && next.showRevisions[showId] !== previous.showRevisions[showId]) dispatch({ type: 'manualEdit' })
  })
  const submitCaptured = async (utterance: string, captured: Captured, retry = false) => {
    if (!bridgeUrl || !available()) return
    active = captured
    useAgentDrawerStore.setState({ busy: true })
    captures.set(captured.request.operationId, captured)
    const id = captured.request.operationId
    dispatch({ type: 'say', text: retry ? `Retry the original Clip at ${captured.retryResize!.durationMs / 1000}s.` : utterance })
    dispatch({ type: 'beginEdit', id, intent: retry ? `Resize the original Clip to ${captured.retryResize!.durationMs / 1000}s` : utterance, retryOf: captured.request.retryOf })
    const record: DiagnosticRecord = { requestId: id, showId, capturedUpdatedAt: captured.show.updatedAt, responseAt: null, firstEventAt: null, doneAt: null, applyStartedAt: null, applyEndedAt: null, submittedAt: Date.now(), events: [], error: null }
    records.push(record)
    transport = new AbortController()
    try {
      const context = captured.context as { hoveredClipId?: string; selection?: { kind: string; clipId?: string; zoneId?: string }; playheadMs?: number }
      const payload = retry ? JSON.parse(captured.request.payloadKey) as { utterance: string; history: typeof history } : { utterance, history: history.slice(-12) }
      const response = await fetch(`${bridgeUrl}/utterance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: transport.signal,
        body: JSON.stringify({ requestId: id, show: captured.show, utterance: payload.utterance, history: payload.history, context: { hoveredClipId: context.hoveredClipId, selectedClipIds: context.selection?.kind === 'clip' ? [context.selection.clipId] : undefined, activeZoneId: context.selection?.kind === 'zone' ? context.selection.zoneId : undefined, playheadMs: context.playheadMs }, ...(retry ? { retryResize: captured.retryResize } : {}) }) })
      record.responseAt = Date.now()
      if (!response.ok || !response.body) throw new Error(`Bridge response ${response.status}`)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let result: { changed?: boolean; show?: unknown; reply: string; privateOutcome?: { kind: string }; retryResize?: unknown; changes?: AgentChange[]; timing?: unknown } | null = null
      for (;;) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        let newline: number
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
          if (!line.trim()) continue
          const event = JSON.parse(line)
          if (event.requestId !== id) throw new Error('The bridge returned another request identity')
          if (!available()) return
          record.firstEventAt ??= Date.now()
          record.events.push({ kind: event.kind, name: event.name, at: Date.now() })
          if (event.kind === 'thinking') dispatch({ type: 'thinking', id })
          if (event.kind === 'tool') dispatch({ type: 'call', id, name: event.name })
          if (event.kind === 'done') { if (result) throw new Error('Duplicate terminal event'); result = event }
        }
        if (done) break
      }
      if (buffer.trim() || !result) throw new Error('The bridge stream ended without a complete result')
      if (!available()) return
      record.doneAt = Date.now(); record.changed = result.changed === true; record.bridgeTiming = result.timing
      // A private edit reply cannot claim live completion; the owned action carries its outcome.
      if (!result.changed) dispatch({ type: 'reply', text: result.reply })
      history.push({ role: 'user', text: retry ? `Retry exact duration ${captured.retryResize!.durationMs}ms for original logical Clip ${captured.retryResize!.clipId}.` : utterance })
      if (result.changed && result.show && result.privateOutcome?.kind === 'committed') {
        // Metadata comes from private registry execution, and grants no mutation capability.
        const changes = Array.isArray(result.changes) ? result.changes.filter(change => typeof change.targetId === 'string' && typeof change.description === 'string') : []
        metadata.set(id, { changes, band: agentInsertionBand(changes) })
        record.applyStartedAt = Date.now()
        adopting = true
        let receipt: Receipt
        try { receipt = api.applyShow(result.show, captured.request, result.retryResize) } finally { adopting = false }
        publish(captured.request, receipt)
        while (available() && (receipt?.status === 'waiting' || (receipt?.status === 'applied' && receipt.settlement === 'saving'))) {
          await new Promise(resolve => window.setTimeout(resolve, 50))
          receipt = api.readOutcome(captured.request)
          publish(captured.request, receipt)
        }
        record.applyEndedAt = Date.now()
      } else {
        const kind = result.privateOutcome?.kind
        const completion = ['asked', 'refused', 'nothing-applied', 'commit-refused', 'incomplete', 'service-refused'].includes(kind ?? '') ? kind as 'asked' | 'refused' | 'nothing-applied' | 'commit-refused' | 'incomplete' | 'service-refused' : 'incomplete'
        publish(captured.request, api.complete(captured.request, completion))
      }
      const line = state.stream.find(item => item.operationId === id)
      history.push({ role: 'assistant', text: `${result.reply}\n${line?.outcome ?? 'outcome unknown'}` })
    } catch (error) {
      if (!available()) return
      record.error = error instanceof Error ? error.message : String(error)
      // Contact loss is not evidence of cancellation or of a private commit.
      dispatch({ type: 'drop' })
      publish(captured.request, api.readOutcome(captured.request))
    } finally { active = null; transport = null; if (!disposed) useAgentDrawerStore.setState({ busy: false }) }
  }
  const controller = {
    showId,
    dispatch,
    attachBridge(url: string) {
      if (!available()) return
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Diagnostic bridge must be loopback HTTP')
      bridgeUrl = parsed.origin
      dispatch({ type: 'drawer', mode: 'open' }); dispatch({ type: 'chooseBuiltin' })
    },
    submit() {
      const utterance = state.draft.trim()
      if (!utterance || active || state.request || state.contactLost || state.connection?.kind !== 'builtin' || !available()) return
      if (!bridgeUrl) { dispatch({ type: 'system', text: 'The diagnostic bridge is not connected.' }); return }
      const captured = api.beginRequest(mint(), utterance, history.slice(-12))
      if (!captured) { dispatch({ type: 'system', text: 'The editor refused to start this request.' }); return }
      dispatch({ type: 'draft', text: '' })
      void submitCaptured(utterance, captured)
    },
    retry(id: string) {
      if (state.connection?.kind !== 'builtin' || active || state.request || state.contactLost || !available()) return
      const original = captures.get(id)
      if (!original) return
      const captured = api.beginRetry(mint(), original.request)
      if (!captured) return
      dispatch({ type: 'dismiss', id })
      void submitCaptured(JSON.parse(captured.request.payloadKey).utterance, captured, true)
    },
    cancel() {
      const captured = state.request ? captures.get(state.request.id) : active
      if (captured && available()) publish(captured.request, api.cancel(captured.request))
    },
    restoreContact() { if (!available()) return; refresh(); dispatch({ type: 'reattach' }) },
    disconnect(forget = false) { controller.cancel(); transport?.abort(); dispatch({ type: forget ? 'forget' : 'disconnect' }) },
    get requests() { return structuredClone(records) },
    dispose() {
      if (disposed) return
      disposed = true
      transport?.abort(); window.clearInterval(interval); unsubscribe()
      captures.clear(); records.length = 0; history.length = 0
      if (useAgentDrawerStore.getState().controller === controller) useAgentDrawerStore.setState({ controller: null, state: createAgentDrawerState(), busy: false })
    },
  }
  useAgentDrawerStore.setState({ controller, state, busy: false })
  api.onClose(controller.dispose)
  return controller
}
