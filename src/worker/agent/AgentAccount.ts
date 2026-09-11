import { emptyRendezvous, transitionRendezvous, windowRendezvousView, REGISTRATION_TTL_MS, type RendezvousCommand, type RendezvousState } from '../../engine/agentRendezvous'
import { agentResponse } from '../../cloudflare/agentAccess'

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

/** Private binding only. Never mount this fetch handler at a public Worker URL. */
export class AgentAccount {
  private readonly storage: AccountStorage
  constructor(ctx: { storage: AccountStorage }) { this.storage = ctx.storage }

  async fetch(request: Request): Promise<Response> {
    // The public route constructs the window command; the later OAuth transport
    // must construct claim only after validating account, resource, grant and scope.
    const command = await request.json() as RendezvousCommand
    return this.storage.transaction(async (storage) => {
      const now = Date.now()
      const stored = await storage.get<StoredAccount>('account') ?? { rendezvous: emptyRendezvous(), throttle: { start: now, count: 0 } }
      const throttle = now >= stored.throttle.start + 60_000 ? { start: now, count: 0 } : stored.throttle
      const ending = command.type === 'leave' || command.type === 'disconnect'
      if (throttle.count >= 240 && !ending) return agentResponse({ code: 'throttled' }, 429)
      if (!ending) throttle.count += 1
      const { state, result } = transitionRendezvous(stored.rendezvous, command, now)
      await storage.put('account', { rendezvous: state, throttle })
      await scheduleExpiry(storage, state, throttle.start + 60_000)
      if (command.type === 'claim' || command.type === 'inspect' || command.type === 'resolve-builtin') {
        const slot = state.slot
        const target = slot?.kind === 'bound'
          ? state.registrations.find((item) => item.registrationId === slot.registrationId)
          : undefined
        return agentResponse({ ...result, ...(result.code === 'bound' && target ? {
          binding: { ...slot, sessionId: target.sessionId, showId: target.showId },
        } : {}) })
      }
      if (command.type === 'expire') return agentResponse(result)
      if (ending) return agentResponse(result)
      // Invalid session capabilities reveal neither account occupancy nor names.
      if (result.code === 'retired' || result.code === 'already_registered' || result.code === 'capacity') return agentResponse(result, 409)
      return agentResponse({ ...result, ...(command.type === 'register' ? { registrationId: command.registrationId } : {}), connection: windowRendezvousView(state, command.registrationId) })
    })
  }

  async alarm(): Promise<void> {
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
  }
}

async function scheduleExpiry(storage: StorageTransaction, state: RendezvousState, emptyExpiry: number) {
  const deadlines = state.registrations.map((item) => item.lastSeenAt + REGISTRATION_TTL_MS)
  if (state.slot && state.slot.kind !== 'bound') deadlines.push(state.slot.expiresAt)
  await storage.setAlarm(deadlines.length ? Math.min(...deadlines) : emptyExpiry)
}
