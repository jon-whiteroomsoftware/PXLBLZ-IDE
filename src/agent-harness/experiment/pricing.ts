// Provenance: pxlblz-v3 src/experiment/pricing.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Per-token prices used for the report's cost line (#33). US dollars per
// million tokens, from https://platform.openai.com/docs/pricing on the date
// noted; a model absent here renders as "price unknown" rather than $0, so
// a missing entry is visible, never silently free. Reasoning tokens are
// billed as output tokens.
export interface ModelPrice {
  /** USD per million uncached input tokens. */
  input: number
  /** USD per million cached input tokens. */
  cachedInput: number
  /** USD per million output tokens (reasoning included). */
  output: number
  /** Where and when the price was read. */
  source: string
}

const PRICING_PAGE = 'https://platform.openai.com/docs/pricing, standard tier, read 2026-09-01'

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'gpt-5.6-luna': { input: 0.2, cachedInput: 0.02, output: 1.2, source: PRICING_PAGE },
  'gpt-5.6-terra': { input: 2, cachedInput: 0.2, output: 12, source: PRICING_PAGE },
  'gpt-5.6-sol': { input: 4, cachedInput: 0.4, output: 20, source: PRICING_PAGE },
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
