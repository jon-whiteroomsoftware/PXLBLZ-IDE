// Provenance: pxlblz-v3 src/experiment/pricing.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Per-token prices used for the report's cost line (#33). US dollars per
// million tokens, from https://platform.openai.com/docs/pricing on the date
// noted; a model absent here renders as "price unknown" rather than $0, so
// a missing entry is visible, never silently free. Reasoning tokens are
// billed as output tokens.
//
// #945: the same table feeds the paid-call guard, which refuses a model
// whose entry lacks `acceptedForPaidRuns`. The figures below were read for
// V3 on 2026-09-01 and were transferred, not re-verified: no entry is
// accepted here. Before the first paid run the coordinator verifies each
// rate against the provider and records the acceptance (name, ISO date,
// note) on the entry; the guard also refuses an acceptance older than
// PAID_CALL_BOUNDS.acceptanceMaxAgeDays. The price is one of two accepted
// inputs to a reservation; the other, the provider-enforced input-token
// ceiling, lives in providerLimits.ts with its own evidence and acceptance.
import type { PaidCallPrice } from './paidCallBudget.js'

export type ModelPrice = PaidCallPrice

const PRICING_PAGE = 'https://platform.openai.com/docs/pricing, standard tier, read 2026-09-01'
const READ_ON = '2026-09-01'

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'gpt-5.6-luna': { input: 0.2, cachedInput: 0.02, output: 1.2, source: PRICING_PAGE, readOn: READ_ON },
  'gpt-5.6-terra': { input: 2, cachedInput: 0.2, output: 12, source: PRICING_PAGE, readOn: READ_ON },
  'gpt-5.6-sol': { input: 4, cachedInput: 0.4, output: 20, source: PRICING_PAGE, readOn: READ_ON },
}

/** Match "gpt-5.6-luna (high)" and "gpt-5.6-luna (high) (replay)" to their model id. */
export function priceFor(agentName: string): ModelPrice | undefined {
  const id = agentName.replace(/\s*\(.*$/, '').trim()
  return MODEL_PRICES[id]
}

export function estimateCostUsd(
  price: ModelPrice,
  tokens: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
): number {
  const uncached = Math.max(0, tokens.inputTokens - tokens.cachedInputTokens)
  const usd =
    (uncached * price.input + tokens.cachedInputTokens * price.cachedInput + tokens.outputTokens * price.output) /
    1_000_000
  return Math.round(usd * 10_000) / 10_000
}
