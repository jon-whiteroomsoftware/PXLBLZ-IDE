import { agentResponse } from '../../cloudflare/agentAccess'
import { AGENT_SERVICE_BOUNDS, emptyAgentAllowance, reserveAgentDispatch, settleAgentDispatch, type AgentAllowanceState } from '../../engine/agentAllowance'

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
  rounds: Record<string, { day: string; id: string }>
}
interface Stored { allowance: AgentAllowanceState; operations: Record<string, Operation> }
const DAY_MS = 86_400_000
const MAX_OPERATIONS = 2048
const MAX_DAILY_DISPATCHES = 4096

/** Singleton private binding: all allowed accounts share this financial owner.
 * No Show, command body, transcript or editor receipt enters durable storage.
 * The caller constructs owner from validated account + binding/window identity.
 */
export class AgentAllowance {
  constructor(private readonly ctx: { storage: Storage }) {}
  async fetch(request: Request): Promise<Response> {
    const command = await request.json() as { type: string; accountId?: string; owner?: string; operationId?: string; round?: number; usage?: unknown }
    if (typeof command.owner !== 'string' || !command.owner || command.owner.length > 512) return agentResponse({ code: 'invalid_request' }, 400)
    return this.ctx.storage.transaction(async tx => {
      const now = Date.now(), today = new Date(now).toISOString().slice(0, 10)
      const state = await tx.get<Stored>('service') ?? { allowance: emptyAgentAllowance(), operations: {} }
      // Operation epochs are server-issued. Expiry is checked before admission;
      // removing old accounting metadata therefore never resurrects a dispatch.
      state.operations = Object.fromEntries(Object.entries(state.operations).filter(([, op]) => now < op.epoch + 2 * DAY_MS))
      state.allowance.days = Object.fromEntries(Object.entries(state.allowance.days).filter(([day]) => Date.parse(`${day}T00:00:00Z`) >= now - 3 * DAY_MS))
      const reply = async (code: string, fields: Record<string, unknown> = {}) => {
        await tx.put('service', state)
        return agentResponse({ code, ...fields })
      }
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
      if (command.type === 'halt') { state.allowance.halted = true; return reply('halted') }
      if (command.type === 'finish') { op.finished = true; return reply('finished') }
      if (command.type === 'settle') {
        const prior = op.rounds[String(command.round)]
        if (!prior) return reply('unknown')
        const settled = settleAgentDispatch(state.allowance, prior.day, prior.id, command.usage)
        state.allowance = settled.state
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
      const reserved = reserveAgentDispatch(state.allowance, today, id)
      state.allowance = reserved.state
      if (reserved.result === 'reserved') op.rounds[String(command.round)] = { day: today, id }
      return reply(reserved.result)
    })
  }
}
