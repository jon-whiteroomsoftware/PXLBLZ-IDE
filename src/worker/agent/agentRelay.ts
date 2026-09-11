import { createDeliveryJournal, type AgentDelivery } from '../../engine/agentDeliveryJournal'
import type { WindowIdentity } from '../../engine/agentRendezvous'
import type { PrivateEditResult } from '../../engine/agentPrivateExecutor'

export type AgentDeliveryInput = Pick<AgentDelivery, 'operationId' | 'deliveryId' | 'sequence' | 'payload'>
export type AgentRelayScope = WindowIdentity & { bindingId: string }
export type AgentRelayMessage = AgentDelivery & WindowIdentity
export type AgentEditorQuery = { kind: 'read_show' | 'get_context' } | { kind: 'get_outcome'; operationId: string }
interface Job { message: AgentRelayMessage; sent: boolean; query: boolean; waiters: Set<(result: PrivateEditResult) => void> }

/** Volatile transport only. The account owner validates authority before every
 * dispatch/take/reply; the browser admission owns actual operation outcomes. */
export class AgentRelay {
  private readonly journal
  private readonly jobs = new Map<string, Job>()
  private waiting = 0
  private ended = false
  private cacheTimer: ReturnType<typeof setTimeout> | undefined
  constructor(readonly scope: AgentRelayScope, private readonly notify: () => void) { this.journal = createDeliveryJournal(scope) }
  async dispatch(input: AgentDeliveryInput): Promise<PrivateEditResult> {
    const message = { ...input, ...this.scope }
    const sent = [...this.jobs.values()].find(job => !job.query && job.sent && job.message.operationId === input.operationId)
    const admission = this.journal.admit(message, sent?.message.deliveryId)
    if (admission.code === 'known') return admission.result as PrivateEditResult
    if (admission.code !== 'accepted' && admission.code !== 'pending') return admission
    let job = this.jobs.get(this.key(message))
    if (admission.code === 'accepted') {
      if (this.jobs.size >= 7 || this.waiting >= 7) {
        this.journal.complete(input.operationId, input.deliveryId, { code: 'capacity' })
        return { code: 'capacity' }
      }
      job = { message, sent: false, query: false, waiters: new Set() }
      this.jobs.set(this.key(message), job)
      const waiting = this.wait(job)
      this.notify()
      return waiting
    }
    return job ? this.wait(job) : { code: 'unknown' }
  }
  async query(payload: AgentEditorQuery): Promise<PrivateEditResult> {
    if (this.ended) return { code: 'retired' }
    if (this.jobs.size >= 8 || this.waiting >= 8) return { code: 'capacity' }
    const message = { ...this.scope, operationId: 'query', deliveryId: crypto.randomUUID(), sequence: 0, payload }
    const job: Job = { message, sent: false, query: true, waiters: new Set() }
    this.jobs.set(this.key(message), job)
    const waiting = this.wait(job)
    this.notify()
    return waiting
  }
  take(): AgentRelayMessage[] {
    if (this.ended) return []
    const messages: AgentRelayMessage[] = []
    for (const job of this.jobs.values()) if (!job.sent) { job.sent = true; messages.push(structuredClone(job.message)) }
    return messages
  }
  reply(message: Pick<AgentRelayMessage, 'bindingId' | 'registrationId' | 'sessionId' | 'showId' | 'operationId' | 'deliveryId'>, result: PrivateEditResult): boolean {
    if (this.ended || message.bindingId !== this.scope.bindingId || message.registrationId !== this.scope.registrationId || message.sessionId !== this.scope.sessionId || message.showId !== this.scope.showId) return false
    const job = this.jobs.get(this.key(message))
    if (!job?.sent) return false
    let bounded: PrivateEditResult
    try { bounded = new TextEncoder().encode(JSON.stringify(result)).byteLength <= 1_048_576 ? structuredClone(result) : { code: 'result_too_large' } } catch { bounded = { code: 'result_unavailable' } }
    if (!job.query && !this.journal.complete(message.operationId, message.deliveryId, bounded)) bounded = { code: 'result_unavailable' }
    const query = job.message.payload as AgentEditorQuery | { kind: 'cancel_edit' }
    const receipt = bounded.receipt as { status?: string } | undefined
    const operationId = job.query && query.kind === 'get_outcome' ? query.operationId : !job.query && query.kind === 'cancel_edit' ? job.message.operationId : undefined
    const recovered = operationId !== undefined && bounded.code === 'outcome'
      && receipt && ['applied', 'refused', 'cancelled', 'completed', 'retired'].includes(receipt.status ?? '')
    if (recovered) {
      for (const [key, pending] of this.jobs) if (pending !== job && !pending.query && pending.message.operationId === operationId) {
        // A terminal browser receipt can release a lost transport reply, but
        // cannot reconstruct that reply or authorize execution again.
        this.journal.complete(pending.message.operationId, pending.message.deliveryId, { code: 'result_unavailable' })
        for (const resolve of pending.waiters) resolve({ code: 'result_unavailable' })
        this.jobs.delete(key)
      }
    }
    for (const resolve of job.waiters) resolve(bounded)
    this.jobs.delete(this.key(message))
    if ((!job.query || recovered) && this.cacheTimer === undefined) this.cacheTimer = setTimeout(() => { this.journal.forgetResults(); this.cacheTimer = undefined }, 60_000)
    return true
  }
  end() {
    if (this.ended) return
    this.ended = true
    this.journal.retire()
    if (this.cacheTimer !== undefined) clearTimeout(this.cacheTimer)
    for (const job of this.jobs.values()) for (const resolve of job.waiters) resolve({ code: 'connection_retired' })
    this.jobs.clear()
  }
  private key(message: Pick<AgentDelivery, 'operationId' | 'deliveryId'>) { return `${message.operationId}/${message.deliveryId}` }
  private wait(job: Job): Promise<PrivateEditResult> {
    if (this.waiting >= (job.query ? 8 : 7)) return Promise.resolve({ code: 'capacity' })
    this.waiting += 1
    return new Promise(resolve => {
      const finish = (result: PrivateEditResult) => {
        clearTimeout(timer)
        job.waiters.delete(finish)
        this.waiting -= 1
        resolve(structuredClone(result))
      }
      const timer = setTimeout(() => {
        finish(job.query ? { code: 'unknown' } : { code: 'pending', operationId: job.message.operationId })
        if (job.query) this.jobs.delete(this.key(job.message))
      }, 25_000)
      job.waiters.add(finish)
    })
  }
}
