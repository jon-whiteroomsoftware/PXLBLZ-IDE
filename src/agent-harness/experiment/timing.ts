// Provenance: pxlblz-v3 src/experiment/timing.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Turn telemetry for the dictation experiment (#33): what a live model turn
// cost in wall time, model round trips, tokens, and rate-limit waits. Pure
// data plus aggregation; agents fill it in, the runner records it on the
// transcript, the report renders it. Everything here is optional on a
// transcript so recordings made before #33 replay byte-identically.

/** One model round trip. Token fields are absent when the provider gives none. */
export interface ModelCallTiming {
  ms: number
  /** Function calls the model requested in this response. */
  toolCalls: number
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
}

/** The org's rate tier as the API reports it in response headers. */
export interface RateLimitInfo {
  requestsPerMinute?: number
  tokensPerMinute?: number
}

/** What one agent turn reports back alongside its final text. */
export interface TurnTiming {
  calls: ModelCallTiming[]
  /** Milliseconds spent sleeping on 429 backoff. */
  rateLimitWaitMs: number
  rateLimit?: RateLimitInfo
}

/** Per-case telemetry recorded on the transcript (all turns of a conversation). */
export interface CaseTiming {
  /** Wall time across the case's agent turns, harness included. */
  totalMs: number
  calls: ModelCallTiming[]
  rateLimitWaitMs: number
  rateLimit?: RateLimitInfo
}

export interface CaseTimingSummary {
  totalMs: number
  modelCalls: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
  rateLimitWaitMs: number
}

export function summarizeCaseTiming(timing: CaseTiming): CaseTimingSummary {
  const sum = (pick: (call: ModelCallTiming) => number | undefined) =>
    timing.calls.reduce((total, call) => total + (pick(call) ?? 0), 0)
  return {
    totalMs: timing.totalMs,
    modelCalls: timing.calls.length,
    inputTokens: sum((call) => call.inputTokens),
    cachedInputTokens: sum((call) => call.cachedInputTokens),
    outputTokens: sum((call) => call.outputTokens),
    reasoningTokens: sum((call) => call.reasoningTokens),
    rateLimitWaitMs: timing.rateLimitWaitMs,
  }
}

/** Merge the turns of one conversation into the case's record. */
export function mergeTurnTimings(turns: TurnTiming[], totalMs: number): CaseTiming {
  const rateLimit = turns.map((turn) => turn.rateLimit).find((info) => info !== undefined)
  return {
    totalMs,
    calls: turns.flatMap((turn) => turn.calls),
    rateLimitWaitMs: turns.reduce((total, turn) => total + turn.rateLimitWaitMs, 0),
    ...(rateLimit ? { rateLimit } : {}),
  }
}
