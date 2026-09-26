import { agentRefusalMessage } from '@/engine/agentRefusalMessage'
import { showEditDiagnosticMessage } from '@/engine/showEditDiagnostic'
import { agentInsertionBand, createAgentDrawerState, transitionAgentDrawer, type AgentChange, type AgentDrawerEvent, type AgentOutcome } from '@/engine/agentDrawerModel'
import type { ShowEditRequest } from '@/engine/showEditAdmission'
import type { createAgentEditorAdmission } from './editorAdmission'
import { useAgentDrawerStore, type AgentDrawerControllerPort } from './drawerStore'
import { useShowStore } from '@/store/showStore'
import { parseAgentMessageAllowance, unavailableAgentMessageAllowance, type AgentMessageAllowance } from '@/engine/agentAllowance'

import type { AgentBuiltinResult as Result } from '@/engine/agentBuiltinResult'
export type { AgentBrowserSessionEvent as DrawerChannelEvent, AgentBrowserSessionPort as DrawerChannelPort } from './channelPort'
import type { AgentBrowserConnection as DrawerConnection, AgentBrowserSessionPort as DrawerChannelPort } from './channelPort'
type Admission = ReturnType<typeof createAgentEditorAdmission>
type Receipt = ReturnType<Admission['readOutcome']>
interface Operation { request?: ShowEditRequest; changes: AgentChange[] }
interface ArmIntent { generation: number; accepted: boolean; acceptedUntil: number | null; observedUntil: number | null }
const ALLOWANCE_RESET_GRACE_MS = 50
const ALLOWANCE_RESET_RETRY_MIN_MS = 1000
const ALLOWANCE_RESET_RETRY_MAX_MS = 60_000
const MAX_INTERIM_ISSUES = 3
const MAX_INTERIM_ISSUE_CHARS = 160

function boundedInterimIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(issue => {
    const message = issue && typeof issue === 'object' && typeof (issue as { message?: unknown }).message === 'string'
      ? (issue as { message: string }).message.trim()
      : ''
    if (!message) return []
    return [message.length > MAX_INTERIM_ISSUE_CHARS ? `${message.slice(0, MAX_INTERIM_ISSUE_CHARS - 1)}…` : message]
  }).slice(0, MAX_INTERIM_ISSUES)
}

/** Thin session presentation. Channel/executor owns work; admission owns outcomes. */
export function createProductionDrawerController(api: Admission, showId: string, channel: DrawerChannelPort, builtin: (command: Record<string, unknown>) => Promise<Result>, initialAllowance?: AgentMessageAllowance): AgentDrawerControllerPort {
  const tracksAllowance = initialAllowance !== undefined
  let pinned = false
  try { pinned = localStorage.getItem('pxlblz-agent-drawer-pinned') === 'true' } catch { /* Optional preference. */ }
  let state = createAgentDrawerState(pinned, initialAllowance ?? unavailableAgentMessageAllowance())
  let disposed = false
  let running = false
  let draftVersion = 0
  let armAttempt = 0
  let armIntent: ArmIntent | undefined
  let armMayBeActive = false
  let suppressArmSnapshots = false
  let armBarrier: Promise<void> | undefined
  const pendingArms = new Set<Promise<Result>>()
  const armSettledWaiters = new Set<() => void>()
  let allowanceAttempt = 0
  let appliedAllowanceAttempt = 0
  let allowanceTimer: number | undefined
  let allowanceResetAt = initialAllowance?.resetAt ?? null
  let allowanceResetRetries = 0
  let connection = channel.getConnection()
  let moveAttempt = 0
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
  const scheduleAllowanceRefresh = () => {
    if (allowanceTimer !== undefined) window.clearTimeout(allowanceTimer)
    allowanceTimer = undefined
    if (!tracksAllowance || allowanceResetAt === null) return
    const untilReset = allowanceResetAt - Date.now() + ALLOWANCE_RESET_GRACE_MS
    const retry = untilReset <= 0
    const delay = retry
      ? Math.min(ALLOWANCE_RESET_RETRY_MIN_MS * 2 ** Math.min(allowanceResetRetries, 6), ALLOWANCE_RESET_RETRY_MAX_MS)
      : Math.min(untilReset, 2_147_483_647)
    allowanceTimer = window.setTimeout(() => {
      allowanceTimer = undefined
      if (retry) allowanceResetRetries++
      void refreshAllowance()
    }, delay)
  }
  const applyAllowance = (value: unknown, attempt: number) => {
    if (disposed || attempt < appliedAllowanceAttempt) return
    const allowance = parseAgentMessageAllowance(value)
    if (!allowance) {
      appliedAllowanceAttempt = attempt
      emit({ type: 'allowance', allowance: unavailableAgentMessageAllowance() })
      scheduleAllowanceRefresh()
      return
    }
    const previous = state.allowance
    if (previous.resetAt !== null && (allowance.resetAt! < previous.resetAt || (allowance.resetAt === previous.resetAt && allowance.revision < previous.revision))) return
    if (allowance.resetAt !== allowanceResetAt) {
      allowanceResetAt = allowance.resetAt
      allowanceResetRetries = 0
    }
    appliedAllowanceAttempt = attempt
    emit({ type: 'allowance', allowance })
    scheduleAllowanceRefresh()
  }
  const callBuiltin = async (command: Record<string, unknown>) => {
    const attempt = ++allowanceAttempt
    try {
      const result = await builtin(command)
      if (tracksAllowance) applyAllowance(result.allowance, attempt)
      return result
    } catch (error) {
      if (tracksAllowance) applyAllowance(undefined, attempt)
      throw error
    }
  }
  const refreshAllowance = async () => {
    if (!tracksAllowance || disposed) return
    try { await callBuiltin({ action: 'status' }) } catch { /* Unavailable status is already fail-closed. */ }
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
    emit({ type: 'outcome', id, outcome, changes: operation.changes, band: agentInsertionBand(operation.changes), reason: receipt.status === 'refused' ? showEditDiagnosticMessage(receipt.diagnostic) ?? agentRefusalMessage(receipt.reason) : receipt.status === 'completed' ? agentRefusalMessage(receipt.completion) : undefined })
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
  const resultArmingUntil = (result: Result) => {
    const next = result.connection
    return next && typeof next === 'object' && (next as { kind?: unknown }).kind === 'armed' && Number.isSafeInteger((next as { expiresAt?: unknown }).expiresAt)
      ? (next as { expiresAt: number }).expiresAt
      : null
  }
  const syncConnection = (next: DrawerConnection) => {
    const connectionChanged = JSON.stringify(connection) !== JSON.stringify(next)
    const externalView = next.kind === 'external-bound'
      ? { name: next.agentName, expectedBindingId: next.bindingId, relation: next.relation, ...(next.showName ? { showName: next.showName } : {}), movedFromHere: next.movedFromHere }
      : undefined
    const authoritativeMoveChange = next.kind === 'external-bound'
      ? JSON.stringify(state.externalBinding) !== JSON.stringify(externalView)
      : next.kind !== 'contact-lost' && connectionChanged
    if (authoritativeMoveChange) {
      moveAttempt++
      emit({ type: 'moveSettled' })
    }
    if (next.kind === 'armed') {
      armMayBeActive = true
      if (suppressArmSnapshots) return
      if (armIntent && !armIntent.accepted) { armIntent.observedUntil = Math.max(armIntent.observedUntil ?? 0, next.expiresAt); return }
      if (armIntent?.acceptedUntil !== null && armIntent?.acceptedUntil !== undefined && next.expiresAt < armIntent.acceptedUntil) return
    } else {
      if (next.kind !== 'contact-lost') {
        for (const settle of armSettledWaiters) settle()
        armSettledWaiters.clear()
      }
      if (next.kind !== 'contact-lost') armMayBeActive = false
      if (next.kind !== 'idle' && next.kind !== 'contact-lost') suppressArmSnapshots = false
      if (next.kind === 'bound' || next.kind === 'pending') { armAttempt++; armIntent = undefined }
    }
    connection = next
    if (next.kind === 'contact-lost' || next.kind === 'retiring') { emit({ type: 'drop' }); return }
    if (next.kind === 'refused') { emit({ type: 'system', text: agentRefusalMessage(next.code) }); return }
    if (next.kind === 'external-bound') { emit({ type: 'externalBinding', binding: externalView! }); return }
    if (next.kind === 'occupied') { emit({ type: 'setupFailed', cause: 'occupied', title: 'Connected in another editor', detail: 'Disconnect in the editor that owns the connection, then try again. If that editor is unavailable, wait for its inactive connection to expire.' }); return }
    if (next.kind === 'idle' && state.connection) { refresh(); emit({ type: 'disconnect' }) }
    else if (next.kind === 'idle' && state.pendingCall) emit({ type: 'setupFailed', title: 'Missed connection', detail: 'Select Ready to connect, then ask your agent to connect again.' })
    else if (next.kind === 'idle' && state.armingUntil !== null) emit({ type: 'setupFailed', title: 'No agent connected', detail: 'Select Ready to connect and ask your agent to try again. You do not need to authorize again if your authorization is still valid.' })
    emit({ type: 'connection', connection: next.kind === 'bound' ? { kind: next.agentKind, name: next.agentName } : null, armingUntil: next.kind === 'armed' ? next.expiresAt : null, pendingCall: next.kind === 'pending' ? { name: next.agentName, expiresAt: next.expiresAt } : null, contactLost: false })
  }
  const action = async (run: () => Promise<Result>) => {
    try {
      const result = await run()
      if (!disposed && !['bound', 'armed', 'disarmed', 'not_armed_here', 'declined', 'disconnected', 'forgotten', 'idle', 'status', 'retiring', 'outcome', 'occupied'].includes(result.code)) emit({ type: 'system', text: agentRefusalMessage(result.code) })
    } catch { emit({ type: 'drop' }) }
  }
  const abandonArm = (force: boolean) => {
    const pending = [...pendingArms]
    const shouldDisarm = force || pending.length > 0 || armMayBeActive || state.armingUntil !== null || connection.kind === 'armed'
    armAttempt++
    armIntent = undefined
    if (!shouldDisarm) return
    suppressArmSnapshots = true
    const previous = armBarrier
    let settle!: () => void
    const settled = new Promise<void>(resolve => {
      settle = () => { armSettledWaiters.delete(settle); resolve() }
      armSettledWaiters.add(settle)
    })
    const cleanup = (async (): Promise<Result> => {
      await previous
      await Promise.allSettled(pending)
      if (disposed) return { code: 'idle' }
      const result = await channel.cancelArm()
      if (['disarmed', 'not_armed_here', 'idle'].includes(result.code)) armMayBeActive = false
      await settled
      return result
    })()
    const barrier = cleanup.then(() => {}, () => {})
    armBarrier = barrier
    void barrier.then(() => { if (armBarrier === barrier) armBarrier = undefined })
    void action(() => cleanup)
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
      emit({ type: 'beginEdit', id, intent: payload.intent || 'Edit the Show' })
      if (cancelled.has(id) && operation.request) publish(id, api.cancel(operation.request))
    }
    const operation = operations.get(id)
    if (operation && (payload.kind === 'command' || payload.kind === 'replace_show')) {
      emit({ type: 'call', id, name: payload.kind === 'replace_show' ? 'replace_show' : payload.name ?? 'command' })
      if (event.result.code === 'refused') emit({ type: 'commandRefused', id, issues: boundedInterimIssues(event.result.issues) })
      if (event.result.code === 'changed' && Array.isArray(event.result.changes)) {
        if (payload.kind === 'replace_show') operation.changes = []
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
      if (event.type === 'draft') draftVersion++
      if (event.type === 'chooseBuiltin') { void action(() => callBuiltin({ action: 'connect' })); return }
      if (event.type === 'connectOwn') {
        const attempt = ++armAttempt
        const intent: ArmIntent = { generation: attempt, accepted: false, acceptedUntil: null, observedUntil: null }
        armIntent = intent
        const barrier = armBarrier
        const arm = barrier
          ? barrier.then(() => disposed || armIntent !== intent || attempt !== armAttempt ? { code: 'idle' } : channel.arm())
          : channel.arm()
        pendingArms.add(arm)
        void arm.then(() => pendingArms.delete(arm), () => pendingArms.delete(arm))
        void action(async () => {
          const result = await arm
          if (result.code === 'armed') armMayBeActive = true
          if (!disposed && attempt === armAttempt && armIntent === intent) {
            if (result.code === 'armed') {
              intent.accepted = true
              intent.acceptedUntil = resultArmingUntil(result) ?? intent.observedUntil
              suppressArmSnapshots = false
              emit({ type: 'armAccepted' })
              if (intent.acceptedUntil !== null) syncConnection({ kind: 'armed', expiresAt: intent.acceptedUntil })
            } else {
              armIntent = undefined
              if (result.code === 'occupied') emit({ type: 'setupFailed', cause: 'occupied', title: 'Connected in another editor', detail: 'Disconnect in the editor that owns the connection, then try again. If that editor is unavailable, wait for its inactive connection to expire.' })
            }
          }
          return result
        })
        return
      }
      if (event.type === 'cancelArm') {
        abandonArm(true); emit(event)
        return
      }
      if (event.type === 'approveKnock' || event.type === 'declineKnock') {
        if (connection.kind === 'pending') {
          const callId = connection.callId
          if (event.type === 'declineKnock') emit(event)
          void action(() => event.type === 'approveKnock' ? channel.answer(callId) : channel.decline(callId))
        }
        return
      }
      emit(event)
    },
    submit() {
      const prompt = state.draft.trim()
      if (!prompt || disposed || running || useAgentDrawerStore.getState().busy || state.request || state.contactLost || state.connection?.kind !== 'builtin' || state.allowance.code !== 'available' || !api.available()) return
      const submittedDraftVersion = draftVersion
      running = true; updateBusy()
      void (async () => {
        try {
          const begun = await callBuiltin({ action: 'begin' })
          if (disposed) return
          if (begun.code !== 'started' || typeof begun.operationId !== 'string') { emit({ type: 'system', text: agentRefusalMessage(begun.code) }); return }
          const id = begun.operationId
          operations.set(id, { changes: [] })
          emit({ type: 'draft', text: '' }); emit({ type: 'beginEdit', id, intent: prompt }); emit({ type: 'thinking', id })
          const result = await callBuiltin({ action: 'run', operationId: id, prompt })
          if (disposed) return
          refresh()
          if (typeof result.message === 'string') emit({ type: 'operationReply', id, text: result.message, replyOnRefusal: (result.receipt as { status?: string } | undefined)?.status === 'completed' })
          if (!operations.get(id)?.request) {
            if (result.dispatch === 'not_attempted') {
              // This is the original run (never replayed). Install the barrier
              // before freeing the composer; a late begin must be cancelled.
              cancelled.add(id)
              emit({ type: 'outcome', id, outcome: 'not-applied', reason: agentRefusalMessage(result.code) })
              if (draftVersion === submittedDraftVersion && !state.draft) emit({ type: 'draft', text: prompt })
            } else emit({ type: 'outcome', id, outcome: 'unknown', reason: 'Outcome unavailable; restore contact to inspect this operation.' })
          }
        } catch { emit({ type: 'drop' }) } finally { running = false; updateBusy() }
      })()
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
    backToChooser() {
      if (state.connection || state.pendingCall || disposed) return
      abandonArm(false)
      emit({ type: 'backToChooser' })
    },
    changeAgent() {
      if (disposed || running || useAgentDrawerStore.getState().busy || state.request || !state.connection) return
      void action(async () => {
        const result = await channel.disconnect()
        if (result.code === 'disconnected') emit({ type: 'disconnect' })
        return result
      })
    },
    moveExternal() {
      const observed = state.externalBinding
      if (!observed || state.movePending || disposed || running || useAgentDrawerStore.getState().busy || state.request) return
      const attempt = ++moveAttempt
      emit({ type: 'moveStart' })
      void channel.moveExternal(observed.expectedBindingId).then(result => {
        if (disposed || attempt !== moveAttempt) return
        emit({ type: 'moveSettled' })
        if (!['moved', 'bound_here', 'superseded'].includes(result.code)) emit({ type: 'system', text: agentRefusalMessage(result.code) })
      }, () => {
        if (disposed || attempt !== moveAttempt) return
        emit({ type: 'moveSettled' })
        emit({ type: 'system', text: agentRefusalMessage('unavailable') })
      })
    },
    disconnect(forget = false) {
      void action(async () => {
        const result = await (forget ? channel.forget() : channel.disconnect())
        if (result.code === (forget ? 'forgotten' : 'disconnected')) emit({ type: forget ? 'forget' : 'disconnect' })
        return result
      })
      refresh()
    },
    dispose() {
      if (disposed) return
      disposed = true; for (const settle of armSettledWaiters) settle(); armSettledWaiters.clear(); window.clearInterval(timer); if (allowanceTimer !== undefined) window.clearTimeout(allowanceTimer); window.removeEventListener('focus', refreshAllowance); stopChannel(); stopRevisions(); channel.close(); operations.clear(); cancelled.clear(); seenDeliveries.clear()
      if (useAgentDrawerStore.getState().controller === controller) useAgentDrawerStore.setState({ controller: null, state: createAgentDrawerState(), busy: false })
    },
  }
  useAgentDrawerStore.setState({ controller, state, busy: false })
  syncConnection(connection)
  window.addEventListener('focus', refreshAllowance)
  scheduleAllowanceRefresh()
  api.onClose(controller.dispose)
  return controller
}
