/** #957 built-in testing service: integer nanodollars, one shared UTC allowance.
 * Rates verified 2026-09-11: https://developers.openai.com/api/docs/pricing
 * Ceiling: https://developers.openai.com/api/docs/models/gpt-5.6-luna
 * Standard global endpoint, text/local function tools only. This is accounting,
 * never an invoice claim or authorization to call the provider.
 */
export const AGENT_SERVICE_BOUNDS = Object.freeze({
  model: 'gpt-5.6-luna', reasoning: 'high', serviceTier: 'priority', maxRequestBytes: 256 * 1024,
  maxInputTokens: 1_050_000, maxOutputTokens: 8192, maxRounds: 6,
  startsPerMinute: 4, dailyNanoUsd: 10_000_000_000,
})
const LEGACY_RESERVATION_NANOUSD = 539_745_600
export const AGENT_DISPATCH_RESERVATION_NANOUSD = 1_050_000 * 1000 + 8192 * 3600
interface DispatchCharge { reservedNanoUsd?: number; settledNanoUsd?: number }
interface AllowanceDay { chargedNanoUsd: number; dispatches: Record<string, DispatchCharge> }
export interface AgentAllowanceState { days: Record<string, AllowanceDay>; halted: boolean }
export const emptyAgentAllowance = (): AgentAllowanceState => ({ days: {}, halted: false })

/** Called only inside the durable owner's transaction. IDs are server-owned. */
export function reserveAgentDispatch(previous: AgentAllowanceState, day: string, id: string) {
  const result = (result: 'halted' | 'duplicate' | 'exhausted' | 'reserved', state = previous) => ({ state, result })
  if (previous.halted) return result('halted')
  if (Object.values(previous.days).some(value => Object.prototype.hasOwnProperty.call(value.dispatches, id))) return result('duplicate')
  const current = previous.days[day] ?? { chargedNanoUsd: 0, dispatches: {} }
  if (current.chargedNanoUsd + AGENT_DISPATCH_RESERVATION_NANOUSD > AGENT_SERVICE_BOUNDS.dailyNanoUsd) return result('exhausted')
  return result('reserved', { ...previous, days: { ...previous.days, [day]: {
    chargedNanoUsd: current.chargedNanoUsd + AGENT_DISPATCH_RESERVATION_NANOUSD,
    dispatches: { ...current.dispatches, [id]: { reservedNanoUsd: AGENT_DISPATCH_RESERVATION_NANOUSD } },
  } } })
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function count(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }

/** Missing or contradictory billing categories cannot release a reservation. */
export function agentUsageCost(value: unknown, serviceTier: unknown = 'default'): number | null {
  if (serviceTier !== 'default' && serviceTier !== 'priority') return null
  const usage = record(value)
  const input = usage?.input_tokens, output = usage?.output_tokens, total = usage?.total_tokens
  const inputDetails = record(usage?.input_tokens_details), outputDetails = record(usage?.output_tokens_details)
  const cached = inputDetails?.cached_tokens, written = inputDetails?.cache_write_tokens, reasoning = outputDetails?.reasoning_tokens
  if (![input, output, total, cached, written, reasoning].every(count)) return null
  const i = input as number, o = output as number, c = cached as number, w = written as number
  if (i + o !== total || c + w > i || (reasoning as number) > o) return null
  const long = i > 272_000
  const cost = (i - c - w) * (long ? 400 : 200) + c * (long ? 40 : 20) + w * (long ? 500 : 250) + o * (long ? 1800 : 1200)
  const billed = cost * (serviceTier === 'priority' ? 2 : 1)
  return Number.isSafeInteger(billed) ? billed : null
}

export function settleAgentDispatch(previous: AgentAllowanceState, day: string, id: string, usage: unknown, serviceTier: unknown = 'default') {
  const current = previous.days[day], entry = current?.dispatches[id]
  const cost = agentUsageCost(usage, serviceTier)
  if (!entry || cost === null) return { state: previous, result: 'unknown' as const }
  if (entry.settledNanoUsd !== undefined) return { state: previous, result: 'duplicate' as const }
  const reserved = entry.reservedNanoUsd ?? LEGACY_RESERVATION_NANOUSD
  const values = usage as { input_tokens: number; output_tokens: number }
  const overrun = values.input_tokens > AGENT_SERVICE_BOUNDS.maxInputTokens || values.output_tokens > AGENT_SERVICE_BOUNDS.maxOutputTokens || cost > reserved
  return { result: overrun ? 'overrun' as const : 'settled' as const, state: {
    halted: previous.halted || overrun,
    days: { ...previous.days, [day]: {
      chargedNanoUsd: current.chargedNanoUsd - reserved + cost,
      dispatches: { ...current.dispatches, [id]: { ...entry, settledNanoUsd: cost } },
    } },
  } }
}
