// Provenance: pxlblz-v3 src/experiment/pricing.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Per-token prices used for the report's cost line (#33) and, since #945,
// for the paid-call guard. US dollars per million tokens; a model absent
// here renders as "price unknown" rather than $0, so a missing entry is
// visible, never silently free. Reasoning tokens are billed as output
// tokens.
//
// #945: the guard refuses a model whose entry lacks explicit `terms` (the
// documented long-context surcharge or "none", and the cache-write
// multiplier) or lacks `acceptedForPaidRuns`, and refuses an acceptance
// older than PAID_CALL_BOUNDS.acceptanceMaxAgeDays. The gpt-5.6-luna entry
// was read from the provider's official model page by the #945 root
// coordinator on 2026-09-05 (working note 945-provider-verified.md) and is
// the only accepted entry. The terra and sol figures were read for V3 on
// 2026-09-01 and transferred, not re-verified: they carry no terms and no
// acceptance and are refused for paid runs (`pricing-invalid` before
// `pricing-unaccepted`). The price is one of two accepted inputs to a
// reservation; the other, the provider-enforced input-token ceiling, lives
// in providerLimits.ts with its own evidence and acceptance.
//
// The report's `estimateCostUsd` below is the flat-rate diagnostic V3 shipped
// and is not the ledger: the guard's settlement in paidCallBudget.ts applies
// the terms and records its basis on each entry.
import type { PaidCallPrice } from './paidCallBudget.js'

export type ModelPrice = PaidCallPrice

const TRANSFERRED_PAGE = 'https://platform.openai.com/docs/pricing, standard tier, read 2026-09-01 (transferred from V3, not re-verified)'
const TRANSFERRED_READ_ON = '2026-09-01'

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'gpt-5.6-luna': {
    // Standard service tier, text tokens, USD per million.
    input: 0.2,
    cachedInput: 0.02,
    output: 1.2,
    terms: {
      // Above 272,000 input tokens the whole request is billed at 2x input and 1.5x output.
      longContext: { aboveInputTokens: 272_000, inputMultiplier: 2, outputMultiplier: 1.5 },
      // Cache writes cost 1.25x the uncached input rate.
      cacheWriteMultiplier: 1.25,
    },
    source: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna (standard tier text prices, long-context and cache-write terms)',
    readOn: '2026-09-05',
    acceptedForPaidRuns: {
      by: '#945 root coordinator (gpt-6-astra)',
      on: '2026-09-05',
      note:
        'Read from the official model page; the request pins service_tier=default so these standard rates apply. ' +
        'Accepted for the bounded Luna baseline only; no paid call is authorised by this entry alone. Not verified by Jon.',
    },
  },
  'gpt-5.6-terra': { input: 2, cachedInput: 0.2, output: 12, source: TRANSFERRED_PAGE, readOn: TRANSFERRED_READ_ON },
  'gpt-5.6-sol': { input: 4, cachedInput: 0.4, output: 20, source: TRANSFERRED_PAGE, readOn: TRANSFERRED_READ_ON },
}

/** Match "gpt-5.6-luna (high)" and "gpt-5.6-luna (high) (replay)" to their model id. */
export function priceFor(agentName: string): ModelPrice | undefined {
  const id = agentName.replace(/\s*\(.*$/, '').trim()
  return MODEL_PRICES[id]
}

/** Flat-rate report diagnostic (V3, #33); not the ledger's settlement, which applies the price terms. */
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
