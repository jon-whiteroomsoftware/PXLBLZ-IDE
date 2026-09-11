import { emptyRendezvous, transitionRendezvous, windowRendezvousView, REGISTRATION_TTL_MS, type RendezvousCommand, type RendezvousState, type WindowIdentity, type AgentClaim, type WindowCommand } from '../../engine/agentRendezvous'
import { agentResponse } from '../../cloudflare/agentAccess'
import { AgentRelay, type AgentDeliveryInput, type AgentEditorQuery, type AgentRelayMessage } from './agentRelay'
import type { PrivateEditResult } from '../../engine/agentPrivateExecutor'

interface StorageTransaction {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
  setAlarm(time: number): Promise<void>
  deleteAlarm(): Promise<void>
}
interface AccountStorage extends StorageTransaction {
  transaction<T>(callback: (storage: StorageTransaction) => Promise<T>): Promise<T>
}
interface StoredAccount {
  rendezvous: RendezvousState
  throttle: { start: number; count: number }
}
export interface AgentAccountNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(request: Request): Promise<Response> }
}

export type AgentWindowChannelCommand = WindowCommand
  | ({ type: 'forget'; bindingId: string } & WindowIdentity)
  | ({ type: 'receive'; lastSeenConnection?: string } & WindowIdentity)
  | ({ type: 'reply'; bindingId: string; operationId: string; deliveryId: string; result: PrivateEditResult } & WindowIdentity)
type AccountCommand = RendezvousCommand | AgentWindowChannelCommand
  | { type: 'relay-dispatch'; identity: AgentClaim; delivery: AgentDeliveryInput; accountId: string }
  | { type: 'relay-query'; identity: AgentClaim; query: AgentEditorQuery; accountId: string }
interface AccountBody { code: string; contact?: 'live' | 'lost'; registrationId?: string; binding?: AgentClaim & WindowIdentity; connection?: ReturnType<typeof windowRendezvousView>; claim?: AgentClaim; expiresAt?: number }
interface AccountRead { body: AccountBody; status: number; state: RendezvousState }

/** Private binding only. Never mount this fetch handler at a public Worker URL. */
export class AgentAccount {
  private readonly storage: AccountStorage
  private relay?: AgentRelay
  private changeEpoch = {}
  private heldCalls = 0
  private coordination: Promise<void> = Promise.resolve()
  private readonly waiting = new Map<string, (reason: 'changed' | 'timeout' | 'superseded') => void>()
  constructor(ctx: { storage: AccountStorage }) { this.storage = ctx.storage }

  async fetch(request: Request): Promise<Response> {
    const command = await request.json() as AccountCommand
    if (command.type === 'connect-external') {
      if (this.heldCalls >= 8) return agentResponse({ code: 'capacity' }, 429)
      this.heldCalls += 1
      try {
        let read = await this.coordinate(command)
        const original = read.body.claim
        while (read.body.code === 'pending' && original && (read.body.expiresAt ?? 0) > Date.now()) {
          await this.waitForChange(`call:${original.callId}:${crypto.randomUUID()}`, Math.min(25_000, read.body.expiresAt! - Date.now()))
          read = await this.coordinate({ type: 'resolve-external', agentId: original.agentId, callId: original.callId })
        }
        if (read.body.code === 'pending' && original) read = await this.coordinate({ type: 'resolve-external', agentId: original.agentId, callId: original.callId })
        return agentResponse(read.body, read.status)
      } finally { this.heldCalls -= 1 }
    }
    if (command.type === 'relay-dispatch' || command.type === 'relay-query') {
      const read = await this.coordinate({ type: 'inspect', ...command.identity })
      if (!read.body.binding || read.body.code !== 'bound' || !this.relay || this.relay.scope.bindingId !== read.body.binding.bindingId) return agentResponse({ code: read.body.code })
      const relay = this.relay
      return agentResponse(await (command.type === 'relay-dispatch' ? relay.dispatch(command.delivery) : relay.query(command.query)))
    }
    if (command.type === 'receive') {
      const epoch = this.changeEpoch
      const first = await this.coordinate({ ...command, type: 'heartbeat' })
      if (first.status !== 200) return agentResponse(first.body, first.status)
      if (first.body.connection?.kind === 'retiring') return agentResponse({ ...first.body, deliveries: [] })
      let deliveries = this.take(first, command)
      if (deliveries.length || (command.lastSeenConnection !== undefined && command.lastSeenConnection !== JSON.stringify(first.body.connection))) return agentResponse({ ...first.body, deliveries })
      const reason = await this.waitForChange(command.registrationId, 25_000, epoch)
      if (reason === 'superseded') return agentResponse({ code: 'superseded', deliveries: [] })
      const read = await this.coordinate({ ...command, type: 'poll' })
      deliveries = this.take(read, command)
      return agentResponse({ ...read.body, deliveries }, read.status)
    }
    if (command.type === 'reply') {
      const read = await this.coordinate({ ...command, type: 'poll' })
      if (read.status !== 200 || read.body.connection?.kind !== 'bound' || read.body.connection.bindingId !== command.bindingId || !this.relay) return agentResponse({ code: 'retired' }, 409)
      return agentResponse({ code: this.relay.reply(command, command.result) ? 'received' : 'unknown' })
    }
    if (command.type === 'forget') return agentResponse({ code: 'invalid_request' }, 400)
    const read = await this.coordinate(command)
    return agentResponse(read.body, read.status)
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.coordination.then(work, work)
    this.coordination = next.then(() => {}, () => {})
    return next
  }
  private coordinate(command: RendezvousCommand): Promise<AccountRead> {
    // Commit order and volatile relay reconciliation share this bounded queue.
    // Held calls, receive and delivery response waits remain outside it.
    return this.serialize(() => this.coordinateNow(command))
  }
  private async coordinateNow(command: RendezvousCommand): Promise<AccountRead> {
    const read = await this.storage.transaction(async (storage): Promise<AccountRead> => {
      const now = Date.now()
      const stored = await storage.get<StoredAccount>('account') ?? { rendezvous: emptyRendezvous(), throttle: { start: now, count: 0 } }
      const throttle = now >= stored.throttle.start + 60_000 ? { start: now, count: 0 } : stored.throttle
      const ending = command.type === 'leave' || command.type === 'disconnect' || command.type === 'disarm' || command.type === 'retirement-ack' || command.type === 'retire-grant' || command.type === 'resolve-forget'
      if (throttle.count >= 240 && !ending) return { body: { code: 'throttled' }, status: 429, state: stored.rendezvous }
      if (!ending) throttle.count += 1
      const { state, result } = transitionRendezvous(stored.rendezvous, command, now)
      await storage.put('account', { rendezvous: state, throttle })
      await scheduleExpiry(storage, state, throttle.start + 60_000)
      const reply = (body: AccountBody, status = 200): AccountRead => ({ body, status, state })
      if (command.type === 'claim' || command.type === 'inspect' || command.type === 'resolve-builtin' || command.type === 'connect-external' || command.type === 'resolve-external' || command.type === 'resolve-forget') {
        const slot = state.slot
        const target = slot?.kind === 'bound' && !slot.retiring ? state.registrations.find(item => item.registrationId === slot.registrationId) : undefined
        const body: AccountBody = { ...result }
        if (['connect-external', 'resolve-external', 'resolve-forget'].includes(command.type)
          && (result.code === 'bound' || result.code === 'pending') && slot && (slot.kind === 'bound' || slot.kind === 'pending')) {
          body.claim = { agentId: slot.agentId, agentName: slot.agentName, agentKind: slot.agentKind, callId: slot.callId, bindingId: slot.bindingId }
          if (slot.kind === 'pending') body.expiresAt = slot.expiresAt
        }
        if (result.code === 'bound' && target) body.binding = { ...slot as AgentClaim, registrationId: target.registrationId, sessionId: target.sessionId, showId: target.showId }
        return reply(body)
      }
      if (command.type === 'expire' || ending) return reply(result)
      if (result.code === 'retired' || result.code === 'already_registered' || result.code === 'capacity') return reply(result, 409)
      return reply({ ...result, ...(command.type === 'register' ? { registrationId: command.registrationId } : {}), connection: windowRendezvousView(state, command.registrationId) })
    })
    this.reconcile(read.state)
    if (!['poll', 'heartbeat', 'inspect', 'resolve-builtin', 'resolve-external', 'resolve-forget'].includes(command.type)) this.wake()
    return read
  }

  private reconcile(state: RendezvousState) {
    const slot = state.slot
    const target = slot?.kind === 'bound' && !slot.retiring ? state.registrations.find(item => item.registrationId === slot.registrationId) : undefined
    if (slot?.kind === 'bound' && target && this.relay?.scope.bindingId === slot.bindingId && this.relay.scope.registrationId === target.registrationId) return
    this.relay?.end()
    this.relay = slot?.kind === 'bound' && target ? new AgentRelay({ registrationId: target.registrationId, sessionId: target.sessionId, showId: target.showId, bindingId: slot.bindingId }, () => this.wake()) : undefined
  }
  private take(read: AccountRead, window: WindowIdentity): AgentRelayMessage[] {
    if (read.status !== 200 || read.body.connection?.kind !== 'bound' || this.relay?.scope.registrationId !== window.registrationId || this.relay.scope.sessionId !== window.sessionId || this.relay.scope.showId !== window.showId || this.relay.scope.bindingId !== read.body.connection.bindingId) return []
    return this.relay.take()
  }
  private wake() { this.changeEpoch = {}; for (const resolve of this.waiting.values()) resolve('changed') }
  private waitForChange(key: string, duration = 25_000, epoch = this.changeEpoch): Promise<'changed' | 'timeout' | 'superseded'> {
    // A transition between the snapshot read and waiter registration is durable
    // for this receive even when no waiter existed at the instant of wake.
    if (epoch !== this.changeEpoch) return Promise.resolve('changed')
    this.waiting.get(key)?.('superseded')
    return new Promise(resolve => {
      const finish = (reason: 'changed' | 'timeout' | 'superseded') => { clearTimeout(timer); if (this.waiting.get(key) === finish) this.waiting.delete(key); resolve(reason) }
      const timer = setTimeout(() => finish('timeout'), duration)
      this.waiting.set(key, finish)
    })
  }

  async alarm(): Promise<void> {
    await this.serialize(async () => {
      await this.storage.transaction(async (storage) => {
        const stored = await storage.get<StoredAccount>('account')
        if (!stored) return
        const now = Date.now()
        const { state } = transitionRendezvous(stored.rendezvous, { type: 'expire' }, now)
        if (!state.registrations.length && !state.slot && now >= stored.throttle.start + 60_000) {
          await storage.delete('account')
          await storage.deleteAlarm()
        } else {
          await storage.put('account', { ...stored, rendezvous: state })
          await scheduleExpiry(storage, state, Math.max(now + 1, stored.throttle.start + 60_000))
        }
      })
      const current = await this.storage.get<StoredAccount>('account')
      this.reconcile(current?.rendezvous ?? emptyRendezvous())
      this.wake()
    })
  }
}

async function scheduleExpiry(storage: StorageTransaction, state: RendezvousState, emptyExpiry: number) {
  const deadlines = state.registrations.map((item) => item.lastSeenAt + REGISTRATION_TTL_MS)
  if (state.slot && state.slot.kind !== 'bound') deadlines.push(state.slot.expiresAt)
  await storage.setAlarm(deadlines.length ? Math.min(...deadlines) : emptyExpiry)
}
