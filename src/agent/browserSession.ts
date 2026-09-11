import { createAgentPrivateExecutor, type PrivateEditResult } from '@/engine/agentPrivateExecutor'
import type { WindowIdentity } from '@/engine/agentRendezvous'
import type { createAgentEditorAdmission } from './editorAdmission'
import { createAgentPrivateAdmissionOwner } from './privateAdmissionOwner'
import type { AgentBrowserConnection, AgentBrowserSessionEvent, AgentBrowserSessionPort, AgentTabDelivery, AgentWindowConnection } from './channelPort'

interface Options {
  admission: ReturnType<typeof createAgentEditorAdmission>
  showId: string
  fetch?: typeof fetch
}
interface ChannelReply extends PrivateEditResult {
  registrationId?: string
  connection?: AgentWindowConnection
  deliveries?: AgentTabDelivery[]
}

/** One window capability and executor. A lost receive/reply never replays work. */
export function createAgentBrowserSession({ admission, showId, fetch: fetcher = globalThis.fetch }: Options): AgentBrowserSessionPort {
  let windowIdentity: WindowIdentity | undefined
  let connection: AgentBrowserConnection = { kind: 'idle' }
  let lastConnection: AgentWindowConnection = { kind: 'idle' }
  let executor: ReturnType<typeof createAgentPrivateExecutor> | undefined
  let bindingId: string | undefined
  let closed = false
  let retiredBinding: string | undefined
  let controlVersion = 0
  let stopAdmission = () => {}
  const listeners = new Set<(event: AgentBrowserSessionEvent) => void>()
  const abort = new AbortController()
  const emit = (event: AgentBrowserSessionEvent) => { for (const listener of listeners) listener(event) }
  const post = async (body: object, signal?: AbortSignal): Promise<ChannelReply> => {
    const response = await fetcher('/api/agent/channel?agent=1', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
    return await response.json() as ChannelReply
  }
  const retire = () => { executor?.retire(); executor = undefined; if (bindingId) retiredBinding = bindingId; bindingId = undefined }
  const update = (next: AgentWindowConnection) => {
    if (next.kind === 'bound' && next.bindingId === retiredBinding) return
    if (next.kind !== 'bound' || next.bindingId !== bindingId) {
      retire()
      if (next.kind === 'bound') {
        bindingId = next.bindingId
        executor = createAgentPrivateExecutor({ bindingId, sessionId: admission.sessionId }, createAgentPrivateAdmissionOwner(admission))
      }
    }
    lastConnection = next; connection = next
    emit({ type: 'connection', connection })
  }
  const contactLost = () => {
    connection = { kind: 'contact-lost', previous: lastConnection }
    emit({ type: 'connection', connection })
  }
  const deliver = (delivery: AgentTabDelivery): PrivateEditResult => {
    if (!windowIdentity || !executor || delivery.registrationId !== windowIdentity.registrationId || delivery.sessionId !== windowIdentity.sessionId || delivery.showId !== windowIdentity.showId || delivery.bindingId !== bindingId || !admission.available()) return { code: 'retired' }
    const payload = delivery.payload as { kind?: string; operationId?: string } | null
    let result: PrivateEditResult
    if (payload?.kind === 'get_outcome' && typeof payload.operationId === 'string') result = executor.getOutcome(payload.operationId)
    else if (payload?.kind === 'read_show' || payload?.kind === 'get_context') {
      const value = payload.kind === 'read_show' ? admission.getShow() : admission.getEditorFocus()
      result = value === undefined ? { code: 'unavailable' } : { code: 'read', [payload.kind === 'read_show' ? 'show' : 'context']: value }
      if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 1_048_576) result = { code: 'result_too_large' }
    } else {
      result = executor.deliver(delivery)
      emit({ type: 'delivery', delivery, result, request: executor.getRequest(delivery.operationId) })
    }
    return result
  }
  const receive = async () => {
    while (!closed && windowIdentity) {
      const version = controlVersion
      try {
        const reply = await post({ type: 'receive', ...windowIdentity }, abort.signal)
        if (closed) return
        // A control action invalidates already-held responses before local adoption.
        if (version !== controlVersion) continue
        if (reply.connection) update(reply.connection)
        else if (reply.code === 'retired') { retire(); connection = { kind: 'refused', code: 'retired' }; emit({ type: 'connection', connection }); return }
        else if (reply.code !== 'superseded') { contactLost(); await pause() }
        for (const delivery of reply.deliveries ?? []) {
          if (closed || version !== controlVersion) break
          const result = deliver(delivery)
          // Never resend a lost reply: browser receipts remain queryable separately.
          try { await post({ type: 'reply', ...windowIdentity, bindingId: delivery.bindingId, operationId: delivery.operationId, deliveryId: delivery.deliveryId, result }, abort.signal) } catch { contactLost() }
        }
      } catch {
        if (closed) return
        contactLost()
        await pause()
      }
    }
  }
  const pause = () => new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', done); resolve() }
    const timer = setTimeout(done, 1000)
    abort.signal.addEventListener('abort', done, { once: true })
    if (closed) done()
  })
  const control = async (type: string, extra: object = {}): Promise<PrivateEditResult> => {
    if (closed || !windowIdentity) return { code: 'unavailable' }
    const version = ++controlVersion
    try {
      const result = await post({ type, ...windowIdentity, ...extra }, abort.signal)
      if (!closed && version === controlVersion) {
        if (result.connection) update(result.connection)
        else if (result.code === 'disarmed' || result.code === 'disconnected') update({ kind: 'idle' })
      }
      return result
    } catch { if (!closed) contactLost(); return { code: 'unknown' } }
  }
  const close = () => {
    if (closed) return
    closed = true; ++controlVersion; retire(); abort.abort(); stopAdmission(); listeners.clear()
    if (windowIdentity) void post({ type: 'leave', ...windowIdentity }).catch(() => {})
  }
  const ready = (async () => {
    if (!admission.available()) return undefined
    try {
      const result = await post({ type: 'register', sessionId: admission.sessionId, showId }, abort.signal)
      if (!result.registrationId) {
        if (!closed) { connection = { kind: 'refused', code: result.code }; emit({ type: 'connection', connection }) }
        return undefined
      }
      const identity = { registrationId: result.registrationId, sessionId: admission.sessionId, showId }
      if (closed) { void post({ type: 'leave', ...identity }).catch(() => {}); return undefined }
      windowIdentity = identity
      if (result.connection) update(result.connection)
      void receive()
      return { ...identity }
    } catch { if (!closed) contactLost(); return undefined }
  })()
  stopAdmission = admission.onClose(close)
  return {
    ready, getWindow: () => !closed && windowIdentity ? { ...windowIdentity } : undefined, getConnection: () => structuredClone(connection),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    arm: () => control('arm'), cancelArm: () => control('disarm'),
    answer: callId => control('answer', { callId }), decline: callId => control('decline', { callId }),
    disconnect() {
      const ownedBinding = bindingId
      retire()
      update({ kind: 'idle' })
      return ownedBinding ? control('disconnect', { bindingId: ownedBinding }) : Promise.resolve({ code: 'not_bound_here' })
    },
    forget: async () => ({ code: 'unsupported' }),
    getOutcome: operationId => executor?.getOutcome(operationId) ?? { code: 'unknown' },
    retry: async operationId => executor?.retry(operationId, crypto.randomUUID()) ?? { code: 'not_qualified' },
    close,
  }
}
