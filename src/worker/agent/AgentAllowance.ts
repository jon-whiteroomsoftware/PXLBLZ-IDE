import { agentResponse } from '../../cloudflare/agentAccess'
import { AGENT_DAILY_MESSAGE_LIMIT, AGENT_DISPATCH_RESERVATION_NANOUSD, AGENT_SERVICE_BOUNDS, emptyAgentAllowance, reserveAgentDispatch, settleAgentDispatch, type AgentAllowanceState } from '../../engine/agentAllowance'

interface Transaction {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
}
interface Storage extends Transaction { transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T> }
interface Operation {
  accountId: string
  owner: string
  epoch: number
  finished: boolean
  activated?: boolean
  messageDay?: string
  rounds: Record<string, { day: string; id: string }>
}
interface Stored {
  allowance: AgentAllowanceState
  operations: Record<string, Operation>
  messageDays: Record<string, Record<string, number>>
  revision: number
}
const DAY_MS = 86_400_000
const MAX_OPERATIONS = 2048
const MAX_DAILY_DISPATCHES = 4096
function resetAt(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) + DAY_MS
}

function messageAllowance(state: Stored, accountId: string, day: string) {
  const used = state.messageDays[day]?.[accountId] ?? 0
  const remaining = Math.max(0, AGENT_DAILY_MESSAGE_LIMIT - used)
  const financialDay = state.allowance.days[day]
  const sharedExhausted = (financialDay?.chargedNanoUsd ?? 0) + AGENT_DISPATCH_RESERVATION_NANOUSD > AGENT_SERVICE_BOUNDS.dailyNanoUsd
  const code = state.allowance.halted ? 'service_halted'
    : remaining === 0 ? 'daily_message_limit'
      : sharedExhausted ? 'daily_api_budget'
        : 'available'
  return { code, limit: AGENT_DAILY_MESSAGE_LIMIT, remaining, resetAt: resetAt(day), revision: state.revision }
}

/** Singleton private binding: all authenticated accounts share this financial owner.
 * No Show, command body, transcript or editor receipt enters durable storage.
 * The caller constructs owner from validated account + binding/window identity.
 */
export class AgentAllowance {
  constructor(private readonly ctx: { storage: Storage }) {}
  async fetch(request: Request): Promise<Response> {
    const command = await request.json() as { type: string; accountId?: string; owner?: string; operationId?: string; round?: number; usage?: unknown; serviceTier?: unknown }
    if (command.type === 'status') {
      if (typeof command.accountId !== 'string' || !command.accountId || command.accountId.length > 256) return agentResponse({ code: 'invalid_request' }, 400)
    } else if (typeof command.owner !== 'string' || !command.owner || command.owner.length > 512) return agentResponse({ code: 'invalid_request' }, 400)
    return this.ctx.storage.transaction(async tx => {
      const now = Date.now(), today = new Date(now).toISOString().slice(0, 10)
      const stored = await tx.get<Partial<Stored>>('service')
      const state: Stored = {
        allowance: stored?.allowance ?? emptyAgentAllowance(),
        operations: stored?.operations ?? {},
        messageDays: stored?.messageDays ?? {},
        revision: stored?.revision ?? 0,
      }
      // A pre-message-limit operation may already contain admitted financial
      // rounds. Mark it as dispatched without retroactively charging it so a
      // later round cannot become the operation's first personal charge.
      for (const operation of Object.values(state.operations)) {
        if (operation.messageDay !== undefined) continue
        const firstRound = Object.entries(operation.rounds).sort(([left], [right]) => Number(left) - Number(right))[0]?.[1]
        if (firstRound) operation.messageDay = firstRound.day
      }
      // Operation epochs are server-issued. Expiry is checked before admission;
      // removing old accounting metadata therefore never resurrects a dispatch.
      state.operations = Object.fromEntries(Object.entries(state.operations).filter(([, op]) => now < op.epoch + 2 * DAY_MS))
      state.allowance.days = Object.fromEntries(Object.entries(state.allowance.days).filter(([day]) => Date.parse(`${day}T00:00:00Z`) >= now - 3 * DAY_MS))
      state.messageDays = Object.fromEntries(Object.entries(state.messageDays).filter(([day]) => Date.parse(`${day}T00:00:00Z`) >= now - 3 * DAY_MS))
      const reply = async (code: string, fields: Record<string, unknown> = {}) => {
        await tx.put('service', state)
        return agentResponse({ code, ...fields })
      }
      if (command.type === 'status') return reply('status', { allowance: messageAllowance(state, command.accountId!, today) })
      if (command.type === 'begin') {
        if (typeof command.accountId !== 'string' || !command.accountId || command.accountId.length > 256) return reply('invalid_request')
        if (state.allowance.halted) return reply('halted')
        if (Object.values(state.operations).some(op => op.owner === command.owner && !op.finished && now < op.epoch + DAY_MS)) return reply('busy')
        if (Object.keys(state.operations).length >= MAX_OPERATIONS) return reply('capacity')
        if (Object.values(state.operations).filter(op => op.accountId === command.accountId && now < op.epoch + 60_000).length >= AGENT_SERVICE_BOUNDS.startsPerMinute) return reply('throttled')
        const operationId = crypto.randomUUID()
        state.operations[operationId] = { accountId: command.accountId, owner: command.owner!, epoch: now, finished: false, rounds: {} }
        return reply('started', { operationId, admissionExpiresAt: now + DAY_MS })
      }
      const op = typeof command.operationId === 'string' && Object.prototype.hasOwnProperty.call(state.operations, command.operationId) ? state.operations[command.operationId] : undefined
      if (!op || op.owner !== command.owner) return reply('unknown')
      if (command.type === 'halt') {
        if (!state.allowance.halted) state.revision++
        state.allowance.halted = true
        return reply('halted')
      }
      if (command.type === 'finish') { op.finished = true; return reply('finished') }
      if (command.type === 'settle') {
        const prior = op.rounds[String(command.round)]
        if (!prior) return reply('unknown')
        const settled = settleAgentDispatch(state.allowance, prior.day, prior.id, command.usage, command.serviceTier)
        state.allowance = settled.state
        if (settled.result === 'settled' || settled.result === 'overrun') state.revision++
        return reply(settled.result)
      }
      if (command.type === 'activate') {
        if (now < op.epoch || now >= op.epoch + DAY_MS) return reply('expired')
        if (op.finished) return reply('finished')
        if (op.activated) return reply('duplicate')
        if (state.allowance.halted) return reply('halted')
        op.activated = true
        return reply('activated')
      }
      if (command.type !== 'reserve') return reply('invalid_request')
      if (now < op.epoch || now >= op.epoch + DAY_MS) return reply('expired')
      if (op.finished) return reply('finished')
      if (!Number.isInteger(command.round) || command.round! < 0 || command.round! >= AGENT_SERVICE_BOUNDS.maxRounds) return reply('invalid_round')
      if (Object.prototype.hasOwnProperty.call(op.rounds, String(command.round))) return reply('duplicate')
      if (command.round !== Object.keys(op.rounds).length) return reply('invalid_round')
      if (Object.keys(state.allowance.days[today]?.dispatches ?? {}).length >= MAX_DAILY_DISPATCHES) return reply('capacity')
      const id = `${command.operationId}:${command.round}`
      const firstDispatch = op.messageDay === undefined
      if (firstDispatch && (state.messageDays[today]?.[op.accountId] ?? 0) >= AGENT_DAILY_MESSAGE_LIMIT) return reply('daily_message_limit')
      const reserved = reserveAgentDispatch(state.allowance, today, id)
      state.allowance = reserved.state
      if (reserved.result === 'reserved') {
        op.rounds[String(command.round)] = { day: today, id }
        state.revision++
        if (firstDispatch) {
          op.messageDay = today
          state.messageDays[today] = { ...state.messageDays[today], [op.accountId]: (state.messageDays[today]?.[op.accountId] ?? 0) + 1 }
        }
      }
      return reply(reserved.result)
    })
  }
}
