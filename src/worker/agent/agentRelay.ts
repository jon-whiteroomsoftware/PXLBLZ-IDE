import { createDeliveryJournal, type AgentDelivery } from '../../engine/agentDeliveryJournal'
import type { WindowIdentity } from '../../engine/agentRendezvous'
import type { PrivateEditResult } from '../../engine/agentPrivateExecutor'

export type AgentDeliveryInput = Pick<AgentDelivery, 'operationId' | 'deliveryId' | 'sequence' | 'payload'>
export type ExternalAgentDeliveryInput =
  | { operationId?: undefined; idempotencyKey: string; payload: { kind: 'begin_edit'; intent: string } }
  | { operationId: string; idempotencyKey?: string; payload: unknown }
export type AgentRelayScope = WindowIdentity & { bindingId: string }
export type AgentRelayMessage = AgentDelivery & WindowIdentity
export type AgentEditorQuery = { kind: 'read_show' | 'get_context' } | { kind: 'get_outcome'; operationId: string }

const ORDINARY_JOB_LIMIT = 10
const QUERY_JOB_LIMIT = 8
const DELIVERY_LIMIT = 256
const MAX_ORDINARY_COMMANDS = 253
const IDENTITY_BYTES_LIMIT = 65_536
const IDENTITY_TOTAL_LIMIT = 4_194_304
const RESULT_TOTAL_LIMIT = 4_194_304
const OPERATION_LIMIT = 256
const COMMIT_IDENTITY_BYTES = new TextEncoder().encode('{"kind":"commit_edit"}').byteLength
const CANCEL_IDENTITY_BYTES = new TextEncoder().encode('{"kind":"cancel_edit"}').byteLength

interface KeyRecord {
  identity: string
  operationId: string
  settled: boolean
  result?: PrivateEditResult
}
interface ExternalOperation {
  nextSequence: number
  deliveryCount: number
  ordinaryCommands: number
  phase: 'begin' | 'active' | 'committed' | 'terminal'
  keys: Map<string, KeyRecord>
}
interface Job {
  message: AgentRelayMessage
  sent: boolean
  query: boolean
  external: boolean
  terminalCancel: boolean
  keyRecord?: KeyRecord
  waiters: Set<(result: PrivateEditResult) => void>
}

/** Volatile transport and external-client identity owner. The account owner
 * validates authority before every dispatch/take/reply; the browser journal
 * independently enforces the assigned envelope and owns actual outcomes. */
export class AgentRelay {
  private readonly journal
  private readonly jobs = new Map<string, Job>()
  private readonly beginKeys = new Map<string, KeyRecord>()
  private readonly operations = new Map<string, ExternalOperation>()
  private readonly cachedRecords = new Set<KeyRecord>()
  private activeExternalOperation: string | undefined
  private externalReadReady = false
  private identityBytes = 0
  private resultBytes = 0
  private waiting = 0
  private ended = false
  private cacheTimer: ReturnType<typeof setTimeout> | undefined
  constructor(readonly scope: AgentRelayScope, private readonly notify: () => void) { this.journal = createDeliveryJournal(scope) }

  /** Trusted legacy/built-in seam: its caller already owns the immutable envelope. */
  async dispatch(input: AgentDeliveryInput): Promise<PrivateEditResult> {
    const message = { ...input, ...this.scope }
    const sent = [...this.jobs.values()].find(job => !job.query && job.sent && job.message.operationId === input.operationId)
    const admission = this.journal.admit(message, sent?.message.deliveryId)
    if (admission.code === 'known') return admission.result as PrivateEditResult
    if (admission.code !== 'accepted' && admission.code !== 'pending') return { code: admission.code }
    let job = this.jobs.get(this.key(message))
    if (admission.code === 'accepted') {
      if (this.ordinaryJobCount() >= ORDINARY_JOB_LIMIT || this.waiting >= ORDINARY_JOB_LIMIT) {
        this.journal.complete(input.operationId, input.deliveryId, { code: 'capacity' })
        return { code: 'capacity' }
      }
      job = { message, sent: false, query: false, external: false, terminalCancel: false, waiters: new Set() }
      this.jobs.set(this.key(message), job)
      const waiting = this.wait(job)
      this.notify()
      return waiting
    }
    return job ? this.wait(job) : { code: 'unknown' }
  }

  async dispatchExternal(input: ExternalAgentDeliveryInput): Promise<PrivateEditResult> {
    if (this.ended) return { code: 'retired' }
    let identity: string
    try { identity = canonicalJson(input.payload) } catch { return { code: 'invalid_payload' } }
    const identityBytes = new TextEncoder().encode(identity).byteLength
    if (identityBytes > IDENTITY_BYTES_LIMIT) return { code: 'invalid_payload' }
    const kind = payloadKind(input.payload)
    if (input.operationId === undefined) {
      if (kind !== 'begin_edit' || !validId(input.idempotencyKey) || typeof input.payload.intent !== 'string' || input.payload.intent.trim().length === 0 || input.payload.intent.length > 240 || /[\r\n]/.test(input.payload.intent)) return { code: 'invalid_payload' }
      const prior = this.beginKeys.get(input.idempotencyKey)
      if (prior) return this.retryResult(prior, identity)
      if (!this.externalReadReady) return { code: 'invalid_request', remedy: 'Call read_show on this binding before begin_edit.' }
      if (this.activeExternalOperation !== undefined) return { code: 'busy' }
      if (this.operations.size >= OPERATION_LIMIT || this.identityBytes + identityBytes + COMMIT_IDENTITY_BYTES + CANCEL_IDENTITY_BYTES > IDENTITY_TOTAL_LIMIT) return { code: 'capacity' }
      if (this.ordinaryJobCount() >= ORDINARY_JOB_LIMIT) return { code: 'capacity', remedy: 'Wait for an admitted call, then retry this begin with the same idempotency key.' }
      const operationId = crypto.randomUUID()
      const deliveryId = crypto.randomUUID()
      const record: KeyRecord = { identity, operationId, settled: false }
      const operation: ExternalOperation = { nextSequence: 0, deliveryCount: 1, ordinaryCommands: 0, phase: 'begin', keys: new Map() }
      this.operations.set(operationId, operation)
      this.beginKeys.set(input.idempotencyKey, record)
      this.identityBytes += identityBytes
      this.activeExternalOperation = operationId
      return this.enqueueExternal(operationId, deliveryId, input.payload, record, false)
    }

    if (!validId(input.operationId) || (input.idempotencyKey !== undefined && !validId(input.idempotencyKey)) || !['command', 'commit_edit', 'cancel_edit'].includes(kind ?? '')) return { code: 'invalid_payload' }
    const operation = this.operations.get(input.operationId)
    if (!operation) return { code: 'unknown', operationId: input.operationId }
    const prior = input.idempotencyKey === undefined ? undefined : operation.keys.get(input.idempotencyKey)
    if (prior) return this.retryResult(prior, identity)
    const cancel = kind === 'cancel_edit'
    const commit = kind === 'commit_edit'
    if (operation.phase === 'terminal' || (operation.phase === 'committed' && !cancel)) return { code: 'finished', operationId: input.operationId }
    const terminalCancel = cancel ? this.terminalCancel(input.operationId) : undefined
    if (terminalCancel) {
      if (canonicalJson(terminalCancel.message.payload) !== identity) return { code: 'invalid_payload', operationId: input.operationId }
      if (input.idempotencyKey === undefined) return { code: 'pending', operationId: input.operationId }
      if (operation.keys.size >= DELIVERY_LIMIT || this.identityBytes + identityBytes > IDENTITY_TOTAL_LIMIT) return { code: 'capacity', operationId: input.operationId, remedy: 'Query get_outcome; cancellation identity capacity is exhausted.' }
      const record = terminalCancel.keyRecord ?? { identity, operationId: input.operationId, settled: false }
      terminalCancel.keyRecord = record
      operation.keys.set(input.idempotencyKey, record)
      this.identityBytes += identityBytes
      return this.retryResult(record, identity)
    }
    const reservedIdentityBytes = cancel ? 0 : commit ? CANCEL_IDENTITY_BYTES : COMMIT_IDENTITY_BYTES + CANCEL_IDENTITY_BYTES
    if (this.identityBytes + identityBytes + reservedIdentityBytes > IDENTITY_TOTAL_LIMIT) return { code: 'capacity', operationId: input.operationId, remedy: cancel ? 'Query get_outcome; identity capacity is exhausted.' : 'Commit or cancel the operation.' }
    if (!cancel && this.ordinaryJobCount() >= ORDINARY_JOB_LIMIT) return { code: 'capacity', operationId: input.operationId, remedy: 'Wait for an admitted command, or cancel the operation.' }
    if (!commit && !cancel && operation.ordinaryCommands >= MAX_ORDINARY_COMMANDS) return { code: 'capacity', operationId: input.operationId, remedy: 'The operation command limit is reached; commit or cancel it.' }
    if (commit && operation.deliveryCount >= DELIVERY_LIMIT - 1) return { code: 'capacity', operationId: input.operationId, remedy: 'Cancel the operation.' }
    if (cancel && operation.deliveryCount >= DELIVERY_LIMIT) return { code: 'capacity', operationId: input.operationId, remedy: 'Query get_outcome; the delivery limit is exhausted.' }
    if (cancel) this.settleUnsent(input.operationId)
    const deliveryId = crypto.randomUUID()
    operation.deliveryCount += 1
    if (!commit && !cancel) operation.ordinaryCommands += 1
    const record: KeyRecord | undefined = input.idempotencyKey === undefined ? undefined : { identity, operationId: input.operationId, settled: false }
    if (record && input.idempotencyKey) operation.keys.set(input.idempotencyKey, record)
    this.identityBytes += identityBytes
    return this.enqueueExternal(input.operationId, deliveryId, input.payload, record, cancel)
  }

  async query(payload: AgentEditorQuery): Promise<PrivateEditResult> {
    if (this.ended) return { code: 'retired' }
    if (this.queryJobCount() >= QUERY_JOB_LIMIT || this.waiting >= ORDINARY_JOB_LIMIT + QUERY_JOB_LIMIT) return { code: 'capacity' }
    const message = { ...this.scope, operationId: 'query', deliveryId: crypto.randomUUID(), sequence: 0, payload }
    const job: Job = { message, sent: false, query: true, external: false, terminalCancel: false, waiters: new Set() }
    this.jobs.set(this.key(message), job)
    const waiting = this.wait(job)
    this.notify()
    return waiting
  }

  take(): AgentRelayMessage[] {
    if (this.ended) return []
    const messages: AgentRelayMessage[] = []
    for (const job of this.jobs.values()) {
      if (job.sent || (!job.query && job.external)) continue
      job.sent = true
      messages.push(structuredClone(job.message))
    }
    for (const [operationId, operation] of this.operations) {
      const jobs = [...this.jobs.values()].filter(job => job.external && job.message.operationId === operationId)
      const sent = jobs.find(job => job.sent)
      const next = sent
        ? jobs.find(job => !job.sent && job.terminalCancel)
        : jobs.find(job => !job.sent && (operation.phase !== 'committed' || job.terminalCancel))
      if (!next) continue
      next.message.sequence = operation.nextSequence
      const admission = this.journal.admit(next.message, sent?.message.deliveryId)
      if (admission.code !== 'accepted') {
        this.settle(next, admission.code === 'known' ? admission.result as PrivateEditResult : { code: admission.code })
        continue
      }
      operation.nextSequence += 1
      next.sent = true
      messages.push(structuredClone(next.message))
    }
    return messages
  }

  reply(message: Pick<AgentRelayMessage, 'bindingId' | 'registrationId' | 'sessionId' | 'showId' | 'operationId' | 'deliveryId'>, result: PrivateEditResult): boolean {
    if (this.ended || message.bindingId !== this.scope.bindingId || message.registrationId !== this.scope.registrationId || message.sessionId !== this.scope.sessionId || message.showId !== this.scope.showId) return false
    const job = this.jobs.get(this.key(message))
    if (!job?.sent) return false
    let bounded: PrivateEditResult
    try { bounded = new TextEncoder().encode(JSON.stringify(result)).byteLength <= 1_048_576 ? structuredClone(result) : { code: 'result_too_large' } } catch { bounded = { code: 'result_unavailable' } }
    if (!job.query && !this.journal.complete(message.operationId, message.deliveryId, bounded)) bounded = { code: 'result_unavailable' }
    if (job.external) this.recordExternalReply(job, bounded)
    const query = job.message.payload as AgentEditorQuery | { kind: string }
    if (job.query && query.kind === 'read_show' && bounded.code === 'read') this.externalReadReady = true
    const recoveredOperationId = job.query && query.kind === 'get_outcome' ? (query as AgentEditorQuery & { kind: 'get_outcome' }).operationId : !job.query && query.kind === 'cancel_edit' ? job.message.operationId : undefined
    const recovered = recoveredOperationId !== undefined && terminalOutcome(bounded, !job.query && query.kind === 'cancel_edit')
    if (recovered) {
      this.settleOperationJobs(recoveredOperationId, job)
      const operation = this.operations.get(recoveredOperationId)
      if (operation) operation.phase = 'terminal'
      if (this.activeExternalOperation === recoveredOperationId) this.activeExternalOperation = undefined
    }
    this.settle(job, bounded)
    if ((!job.query || recovered) && this.cacheTimer === undefined) this.cacheTimer = setTimeout(() => {
      this.journal.forgetResults()
      for (const record of this.cachedRecords) delete record.result
      this.cachedRecords.clear()
      this.resultBytes = 0
      this.cacheTimer = undefined
    }, 60_000)
    this.notify()
    return true
  }

  end() {
    if (this.ended) return
    this.ended = true
    this.journal.retire()
    if (this.cacheTimer !== undefined) clearTimeout(this.cacheTimer)
    for (const job of [...this.jobs.values()]) this.settle(job, { code: 'connection_retired' })
    this.operations.clear()
    this.beginKeys.clear()
    this.cachedRecords.clear()
    this.identityBytes = 0
    this.resultBytes = 0
    this.externalReadReady = false
  }

  private enqueueExternal(operationId: string, deliveryId: string, payload: unknown, keyRecord: KeyRecord | undefined, terminalCancel: boolean): Promise<PrivateEditResult> {
    const message = { ...this.scope, operationId, deliveryId, sequence: -1, payload }
    const job: Job = { message, sent: false, query: false, external: true, terminalCancel, keyRecord, waiters: new Set() }
    this.jobs.set(this.key(message), job)
    const waiting = this.wait(job)
    this.notify()
    return waiting
  }
  private retryResult(record: KeyRecord, identity: string): PrivateEditResult {
    if (record.identity !== identity) return { code: 'identity_conflict', operationId: record.operationId }
    if (!record.settled) return { code: 'pending', operationId: record.operationId }
    return record.result ? structuredClone(record.result) : { code: 'unknown', operationId: record.operationId }
  }
  private recordExternalReply(job: Job, result: PrivateEditResult) {
    if (job.keyRecord) this.cacheRecord(job.keyRecord, result)
    const operation = this.operations.get(job.message.operationId)
    if (!operation) return
    const kind = payloadKind(job.message.payload)
    if (kind === 'begin_edit') {
      operation.phase = result.code === 'begun' ? 'active' : 'terminal'
    } else if (kind === 'commit_edit') {
      operation.phase = terminalOutcome(result) ? 'terminal' : 'committed'
      if (operation.phase === 'committed') this.settleUnsent(job.message.operationId)
    } else if (kind === 'cancel_edit') {
      operation.phase = 'terminal'
    } else if (!['changed', 'noop', 'unchanged', 'refused'].includes(result.code)) {
      operation.phase = 'terminal'
    }
    if (operation.phase === 'terminal') {
      this.settleOperationJobs(job.message.operationId, job)
      if (this.activeExternalOperation === job.message.operationId) this.activeExternalOperation = undefined
    }
  }
  private terminalCancel(operationId: string) {
    return [...this.jobs.values()].find(job => job.external && job.terminalCancel && job.message.operationId === operationId)
  }
  private settleUnsent(operationId: string) {
    for (const job of [...this.jobs.values()]) if (job.external && !job.terminalCancel && !job.sent && job.message.operationId === operationId) this.settle(job, { code: 'result_unavailable' })
  }
  private settleOperationJobs(operationId: string, except: Job) {
    for (const job of [...this.jobs.values()]) if (job !== except && !job.query && job.message.operationId === operationId) {
      if (job.sent) this.journal.complete(job.message.operationId, job.message.deliveryId, { code: 'result_unavailable' })
      this.settle(job, { code: 'result_unavailable' })
    }
  }
  private settle(job: Job, result: PrivateEditResult) {
    if (job.keyRecord && !job.keyRecord.settled) this.cacheRecord(job.keyRecord, result)
    for (const resolve of [...job.waiters]) resolve(result)
    this.jobs.delete(this.key(job.message))
  }
  private ordinaryJobCount() { return [...this.jobs.values()].filter(job => !job.query && !job.terminalCancel).length }
  private queryJobCount() { return [...this.jobs.values()].filter(job => job.query).length }
  private key(message: Pick<AgentDelivery, 'operationId' | 'deliveryId'>) { return `${message.operationId}/${message.deliveryId}` }
  private wait(job: Job): Promise<PrivateEditResult> {
    if (job.waiters.size >= 1 || this.waiting >= ORDINARY_JOB_LIMIT + QUERY_JOB_LIMIT) return Promise.resolve({ code: 'capacity' })
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
  private cacheRecord(record: KeyRecord, result: PrivateEditResult) {
    record.settled = true
    let bytes: number
    try { bytes = new TextEncoder().encode(canonicalJson(result)).byteLength } catch { return }
    while (this.resultBytes + bytes > RESULT_TOTAL_LIMIT && this.cachedRecords.size > 0) {
      const oldest = this.cachedRecords.values().next().value as KeyRecord
      this.resultBytes -= oldest.result ? new TextEncoder().encode(canonicalJson(oldest.result)).byteLength : 0
      delete oldest.result
      this.cachedRecords.delete(oldest)
    }
    if (bytes > RESULT_TOTAL_LIMIT) return
    record.result = structuredClone(result)
    this.cachedRecords.add(record)
    this.resultBytes += bytes
  }
}

function validId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) }
function payloadKind(payload: unknown): string | undefined {
  return typeof payload === 'object' && payload !== null && typeof (payload as { kind?: unknown }).kind === 'string' ? (payload as { kind: string }).kind : undefined
}
function terminalOutcome(result: PrivateEditResult, explicitCancel = false): boolean {
  const rawReceipt = result.receipt
  if (result.code !== 'outcome' || typeof rawReceipt !== 'object' || rawReceipt === null) return false
  const receipt = rawReceipt as { status?: unknown; settlement?: unknown }
  // A cancel reply completes that delivery even when it truthfully reports a
  // commit already saving. A passive saving observation leaves cancellation
  // available until a later terminal receipt is observed.
  if (receipt.status === 'applied' && receipt.settlement === 'saving') return explicitCancel
  return ['applied', 'refused', 'cancelled', 'completed', 'retired'].includes(String(receipt.status))
}
/** JSON identity with stable object-key order; no coercion of invalid values. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  throw new Error('Payload must be JSON')
}
