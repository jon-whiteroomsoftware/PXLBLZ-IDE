import { agentRefusalMessage } from '@/engine/agentRefusalMessage'
import { agentInsertionBand, createAgentDrawerState, transitionAgentDrawer, type AgentChange, type AgentDrawerEvent, type AgentOutcome } from '@/engine/agentDrawerModel'
import type { ShowEditRequest } from '@/engine/showEditAdmission'
import type { createAgentEditorAdmission } from './editorAdmission'
import { useAgentDrawerStore, type AgentDrawerControllerPort } from './drawerStore'
import { useShowStore } from '@/store/showStore'

interface Result { code: string; [key: string]: unknown }
export type { AgentBrowserSessionEvent as DrawerChannelEvent, AgentBrowserSessionPort as DrawerChannelPort } from './channelPort'
import type { AgentBrowserConnection as DrawerConnection, AgentBrowserSessionPort as DrawerChannelPort } from './channelPort'
type Admission = ReturnType<typeof createAgentEditorAdmission>
type Receipt = ReturnType<Admission['readOutcome']>
interface Operation { request?: ShowEditRequest; changes: AgentChange[] }

/** Thin session presentation. Channel/executor owns work; admission owns outcomes. */
export function createProductionDrawerController(api: Admission, showId: string, channel: DrawerChannelPort, builtin: (command: Record<string, unknown>) => Promise<Result>): AgentDrawerControllerPort {
  let state = createAgentDrawerState()
  try { state = createAgentDrawerState(localStorage.getItem('pxlblz-agent-drawer-pinned') === 'true') } catch { /* Optional preference. */ }
  let disposed = false
  let running = false
  let connection = channel.getConnection()
  const operations = new Map<string, Operation>()
  const cancelled = new Set<string>()
  const seenDeliveries = new Set<string>()
  const emit = (event: AgentDrawerEvent) => {
    if (disposed) return
    const next = transitionAgentDrawer(state, event)
    if (next === state) return
    state = next
    useAgentDrawerStore.setState({ state })
  }
  const updateBusy = () => {
    if (disposed) return
    const saving = [...operations.values()].some(operation => {
      const receipt = operation.request && api.readOutcome(operation.request)
      return receipt?.status === 'applied' && receipt.settlement === 'saving'
    })
    useAgentDrawerStore.setState({ busy: running || saving })
  }
  const publish = (id: string, receipt: Receipt) => {
    if (!receipt) return
    const operation = operations.get(id)
    if (!operation || (operation.request && (operation.request.operationId !== receipt.request.operationId || operation.request.sessionId !== receipt.request.sessionId))) return
    operation.request = receipt.request
    if (receipt.status === 'pending') return
    if (receipt.status === 'waiting') { emit({ type: 'waiting', id }); return }
    const outcome: AgentOutcome = receipt.status === 'applied' ? receipt.settlement === 'saving' ? 'applied' : receipt.settlement : receipt.status === 'cancelled' ? 'cancelled' : receipt.status === 'retired' ? 'unknown' : 'not-applied'
    emit({ type: 'outcome', id, outcome, changes: operation.changes, band: agentInsertionBand(operation.changes), retryable: Boolean(api.retryIntent(receipt.request)), reason: receipt.status === 'refused' ? agentRefusalMessage(receipt.reason) : receipt.status === 'completed' ? agentRefusalMessage(receipt.completion) : undefined })
  }
  const refresh = () => {
    if (disposed || !api.available()) return
    emit({ type: 'tick', now: Date.now() })
    for (const [id, operation] of operations) {
      if (!operation.request) {
        const result = channel.getOutcome(id)
        if (result.code === 'outcome') publish(id, result.receipt as Receipt)
      } else publish(id, api.readOutcome(operation.request))
    }
    updateBusy()
  }
  const syncConnection = (next: DrawerConnection) => {
    connection = next
    if (next.kind === 'contact-lost' || next.kind === 'retiring') { emit({ type: 'drop' }); return }
    if (next.kind === 'refused') { emit({ type: 'system', text: agentRefusalMessage(next.code) }); return }
    if (next.kind === 'occupied') { emit({ type: 'system', text: 'Another editor window owns the account connection.' }); return }
    if (next.kind === 'idle' && state.connection) { refresh(); emit({ type: 'disconnect' }) }
    emit({ type: 'connection', connection: next.kind === 'bound' ? { kind: next.agentKind, name: next.agentName } : null, armingUntil: next.kind === 'armed' ? next.expiresAt : null, pendingCall: next.kind === 'pending' ? { name: next.agentName, expiresAt: next.expiresAt } : null, contactLost: false })
  }
  const action = async (run: () => Promise<Result>) => {
    try {
      const result = await run()
      if (!disposed && !['bound', 'armed', 'disarmed', 'declined', 'disconnected', 'forgotten', 'idle', 'status', 'retiring', 'outcome'].includes(result.code)) emit({ type: 'system', text: agentRefusalMessage(result.code) })
    } catch { emit({ type: 'drop' }) }
  }
  const stopChannel = channel.subscribe(event => {
    if (disposed) return
    if (event.type === 'connection') { syncConnection(event.connection); return }
    const deliveryKey = JSON.stringify([event.delivery.bindingId, event.delivery.operationId, event.delivery.deliveryId])
    if (seenDeliveries.has(deliveryKey)) return
    seenDeliveries.add(deliveryKey)
    const { operationId: id, payload: raw } = event.delivery
    if (!raw || typeof raw !== 'object') return
    const payload = raw as { kind?: string; intent?: string; name?: string; arguments?: Record<string, unknown> }
    if (payload.kind === 'begin_edit' && event.result.code === 'begun') {
      const operation = operations.get(id) ?? { changes: [] }
      if (event.request) operation.request = event.request
      operations.set(id, operation)
      emit({ type: 'beginEdit', id, intent: payload.intent || 'Edit the Show', retryOf: event.request?.retryOf ? [...operations.entries()].find(([, prior]) => prior.request?.operationId === event.request!.retryOf)?.[0] : undefined })
      if (cancelled.has(id) && operation.request) publish(id, api.cancel(operation.request))
    }
    const operation = operations.get(id)
    if (operation && payload.kind === 'command') {
      emit({ type: 'call', id, name: payload.name ?? 'command' })
      if (event.result.code === 'changed' && Array.isArray(event.result.changes)) {
        for (const rawChange of event.result.changes) {
          if (!rawChange || typeof rawChange !== 'object') continue
          const change = rawChange as { targetId?: unknown; description?: unknown; command?: unknown }
          if (typeof change.targetId !== 'string' || typeof change.description !== 'string') continue
          const at = payload.arguments?.at_ms, duration = payload.arguments?.duration_ms
          const range = payload.name === 'insert_time' && change.command === 'insert_time' && typeof at === 'number' && typeof duration === 'number' && Number.isFinite(at) && Number.isFinite(duration) ? { startMs: Math.round(at), endMs: Math.round(at) + Math.round(duration) } : undefined
          operation.changes.push({ targetId: change.targetId, description: change.description, ...(range ? { range } : {}) })
        }
      }
    }
    if (operation && event.result.code === 'outcome') publish(id, event.result.receipt as Receipt)
    refresh()
  })
  const timer = window.setInterval(refresh, 100)
  const stopRevisions = useShowStore.subscribe((next, previous) => {
    if (next.showRevisions[showId] !== previous.showRevisions[showId]) emit({ type: 'manualEdit' })
  })
  const controller: AgentDrawerControllerPort = {
    showId,
    dispatch(event) {
      if (disposed) return
      if (event.type === 'chooseBuiltin') { void action(() => builtin({ action: 'connect' })); return }
      if (event.type === 'connectOwn') { void action(() => channel.arm()); return }
      if (event.type === 'cancelArm') { void action(() => channel.cancelArm()); return }
      if (event.type === 'approveKnock' || event.type === 'declineKnock') {
        if (connection.kind === 'pending') { const callId = connection.callId; void action(() => event.type === 'approveKnock' ? channel.answer(callId) : channel.decline(callId)) }
        return
      }
      emit(event)
    },
    submit() {
      const prompt = state.draft.trim()
      if (!prompt || disposed || running || useAgentDrawerStore.getState().busy || state.request || state.contactLost || state.connection?.kind !== 'builtin' || !api.available()) return
      running = true; updateBusy()
      void (async () => {
        try {
          const begun = await builtin({ action: 'begin' })
          if (disposed) return
          if (begun.code !== 'started' || typeof begun.operationId !== 'string') { emit({ type: 'system', text: agentRefusalMessage(begun.code) }); return }
          const id = begun.operationId
          operations.set(id, { changes: [] })
          emit({ type: 'draft', text: '' }); emit({ type: 'say', text: prompt }); emit({ type: 'beginEdit', id, intent: prompt })
          const result = await builtin({ action: 'run', operationId: id, prompt })
          if (disposed) return
          refresh()
          if (typeof result.message === 'string') emit({ type: 'reply', text: result.message })
          if (!operations.get(id)?.request) emit({ type: 'outcome', id, outcome: 'unknown', reason: 'Outcome unavailable; restore contact to inspect this operation.' })
        } catch { emit({ type: 'drop' }) } finally { running = false; updateBusy() }
      })()
    },
    retry(id) {
      const request = operations.get(id)?.request
      if (!request || !api.retryIntent(request) || disposed || running || useAgentDrawerStore.getState().busy || state.request || state.contactLost || state.connection?.kind !== 'builtin') return
      running = true; updateBusy()
      void action(async () => {
        const result = await channel.retry(id)
        const next = result.request as ShowEditRequest | undefined
        if (result.code === 'outcome' && typeof result.operationId === 'string' && next?.retryOf === request.operationId && next.sessionId === request.sessionId) {
          const nextId = result.operationId
          operations.set(nextId, { request: next, changes: [...(operations.get(id)?.changes ?? [])] })
          emit({ type: 'beginEdit', id: nextId, intent: state.stream.find(line => line.operationId === id)?.text ?? 'Retry the original Clip resize', retryOf: id })
          publish(nextId, result.receipt as Receipt)
        }
        return result
      }).finally(() => { running = false; refresh() })
    },
    cancel() {
      const id = state.request?.id
      if (!id) return
      cancelled.add(id)
      const operation = operations.get(id)
      if (operation?.request) publish(id, api.cancel(operation.request))
      updateBusy()
    },
    restoreContact() { refresh() },
    disconnect(forget = false) { void action(() => forget ? channel.forget() : channel.disconnect()); refresh() },
    dispose() {
      if (disposed) return
      disposed = true; window.clearInterval(timer); stopChannel(); stopRevisions(); channel.close(); operations.clear(); cancelled.clear(); seenDeliveries.clear()
      if (useAgentDrawerStore.getState().controller === controller) useAgentDrawerStore.setState({ controller: null, state: createAgentDrawerState(), busy: false })
    },
  }
  useAgentDrawerStore.setState({ controller, state, busy: false })
  syncConnection(connection)
  api.onClose(controller.dispose)
  return controller
}
