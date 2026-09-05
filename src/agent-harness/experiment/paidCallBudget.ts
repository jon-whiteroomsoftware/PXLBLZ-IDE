// Paid-call budgeting for the diagnostic harness (#945): the pure rules that
// decide whether one more model call may be dispatched, what it reserves,
// and how a reported usage settles. No I/O here; `paidCallGuard.ts` owns
// the durable ledger file and the lock, `openaiAgent.ts` applies the guard
// at its single dispatch point.
//
// The bounds are ceilings authorised for the #945 live baseline (Jon,
// 2026-09-04: $20 aggregate; coordinator choices the same day: $2 per run,
// at most four model calls per selected corpus case or bridge turn, at most
// 4000 output tokens per call, worst-case reservation before dispatch,
// conservative treatment of retries and ambiguous outcomes). They are not
// targets, and nothing here relaxes them at run time.
//
// Accounting model. Every dispatch attempt first appends a `reserved`
// ledger entry carrying the worst-case cost of that attempt; the attempt is
// refused when the aggregate or the run could not absorb that worst case.
// A response with usage settles the entry at its actual cost. Anything else
// (a thrown error, a missing usage block, a crash before settlement) leaves
// the reservation in place as `ambiguous`, and ambiguous or still-reserved
// entries count at their reserved amount forever: the ledger never shrinks
// except by a settlement of the same entry, and a settlement never touches
// another entry.
//
// Reservation basis. The worst case of one call is the provider-enforced
// maximum input tokens for the selected model and the supported request
// shape (`ProviderInputLimit`, recorded with its source, date, evidence and
// a separate acceptance in `providerLimits.ts`) priced at the worst
// applicable documented rates, plus the output cap priced in full. A price
// is more than three flat figures: its `terms` state the documented
// long-context surcharge (above a threshold of input tokens the whole
// request is billed at higher multipliers) and the cache-write multiplier
// over the uncached input rate, and a price without explicit, consistent
// terms is refused rather than reserved at flat rates. The reservation
// applies every multiplier that can apply at the ceiling, so it is an
// inference from documented factors, not a measured bill. The request's own
// size is not the basis: a byte-derived estimate is recorded on the entry as
// a diagnostic and can refuse a request that is already larger than the
// ceiling, but it never lowers a reservation. A model without an accepted
// ceiling is refused before dispatch. If a provider ever reports usage above
// the ceiling the reservation assumed, the settlement records the actual
// cost, flags the entry, and writes a persistent halt into the ledger: every
// later run refuses until a human reconciles the charged usage and clears it.
//
// Settlement basis. A settlement prices the usage categories the installed
// SDK documents (input tokens, cached input tokens, cache-write tokens,
// output tokens) at the documented rates, applying the long-context
// multipliers when the request's input tokens exceed the threshold. When
// the response omits the cache-write category, every uncached input token is
// charged at the cache-write rate and the entry is labelled an upper
// estimate. Either way the figure is the guard's accounting from documented
// rates, never a claim about the provider's invoice.

export interface PaidCallBounds {
  /** Ceiling on everything the ledger has ever consumed, all runs, all states. */
  aggregateUsd: number
  /** Ceiling on what one run (one CLI invocation or bridge process) may consume. */
  perRunUsd: number
  /** Model calls (dispatch attempts, retries included) per accounting unit; a positive integer. */
  maxCallsPerUnit: number
  /** Sent as max_output_tokens on every request and reserved in full; a positive integer. */
  maxOutputTokensPerCall: number
  /** A price or limit acceptance older than this (days) is refused. */
  acceptanceMaxAgeDays: number
}

/** Provenance: issue #945 "Live baseline authorization" (Jon, 2026-09-04) and
 * the coordinator's implementation choices of the same day. */
export const PAID_CALL_BOUNDS: PaidCallBounds = {
  aggregateUsd: 20,
  perRunUsd: 2,
  maxCallsPerUnit: 4,
  maxOutputTokensPerCall: 4000,
  acceptanceMaxAgeDays: 30,
}

/** Recorded only after someone verified the figure against the provider for a paid run. */
export interface PaidRunAcceptance {
  by: string
  /** ISO date of the verification. */
  on: string
  note?: string
}

/** Documented long-context surcharge: strictly above the threshold, the whole request is billed at these multipliers. */
export interface LongContextTerms {
  /** Input tokens in one request; a positive integer. Above it (strictly) the multipliers apply. */
  aboveInputTokens: number
  /** Multiplier on every input-side rate (uncached, cached, cache write); at least 1. */
  inputMultiplier: number
  /** Multiplier on the output rate; at least 1. */
  outputMultiplier: number
}

/**
 * The parts of a price schedule beyond the three flat rates. Every accepted
 * price states them explicitly; `'none'` records that the source documents
 * no long-context surcharge, and a cache-write multiplier of 1 that the
 * source documents no cache-write premium. Absent terms are refused: flat
 * rates alone are not a schedule the guard can reserve from.
 */
export interface PaidCallPriceTerms {
  longContext: LongContextTerms | 'none'
  /** Multiple of the uncached input rate charged for tokens written to the prompt cache; at least 1. */
  cacheWriteMultiplier: number
}

export interface PaidCallPrice {
  /** USD per million uncached input tokens (standard service tier). */
  input: number
  /** USD per million cached input tokens. */
  cachedInput: number
  /** USD per million output tokens (reasoning included). */
  output: number
  /** Long-context and cache-write terms; required for acceptance, see PaidCallPriceTerms. */
  terms?: PaidCallPriceTerms
  /** Where the price was read. */
  source: string
  /** ISO date the price was read. */
  readOn: string
  /**
   * Absent means the guard refuses the model: a transferred or edited price
   * is never treated as freshly verified.
   */
  acceptedForPaidRuns?: PaidRunAcceptance
}

/**
 * The one request partition the harness sends and a limit can be accepted
 * for: the Responses API, text-only input, function tools only,
 * service_tier pinned to "default" (standard pricing, never the project's
 * configured tier) and truncation pinned to "disabled" (input past the
 * context window is rejected with HTTP 400, never silently dropped).
 */
export const SUPPORTED_REQUEST_SHAPE = 'responses-text-function-tools-default-tier-truncation-disabled'

/**
 * A provider-enforced ceiling on input tokens per request, for one model and
 * the supported request shape. This is the reservation basis: it must come
 * from the provider's primary documentation and be observed as enforced (a
 * request above it is rejected, not billed), and it is accepted separately
 * from the price because it answers a different question.
 */
export interface ProviderInputLimit {
  /** Maximum input tokens the provider accepts in one request; a positive integer. */
  maxInputTokens: number
  /** The request partition the limit was verified for. */
  requestShape: typeof SUPPORTED_REQUEST_SHAPE
  /** Exact primary source: URL or document title and section. */
  source: string
  /** ISO date the source was read. */
  readOn: string
  /** What the source states and how enforcement was confirmed. */
  evidence: string
  /** Absent means the guard refuses the model for paid runs. */
  acceptedForPaidRuns?: PaidRunAcceptance
}

export type PaidCallRefusalCode =
  | 'bounds-invalid'
  | 'no-unit'
  | 'unit-calls'
  | 'run-exhausted'
  | 'aggregate-exhausted'
  | 'halted'
  | 'run-id-reused'
  | 'shape-unsupported'
  | 'input-too-large'
  | 'arithmetic-overflow'
  | 'pricing-unknown'
  | 'pricing-unaccepted'
  | 'pricing-stale'
  | 'pricing-invalid'
  | 'limit-unknown'
  | 'limit-unaccepted'
  | 'limit-stale'
  | 'limit-invalid'
  | 'limit-shape'
  | 'ledger-missing'
  | 'ledger-malformed'
  | 'ledger-locked'
  | 'ledger-halted'
  | 'ledger-exists'

export interface PaidCallRefusal {
  ok: false
  code: PaidCallRefusalCode
  reason: string
}

export class PaidCallRefusedError extends Error {
  readonly code: PaidCallRefusalCode
  constructor(refusal: PaidCallRefusal) {
    super(`paid call refused (${refusal.code}): ${refusal.reason}`)
    this.name = 'PaidCallRefusedError'
    this.code = refusal.code
  }
}

export function refuse(code: PaidCallRefusalCode, reason: string): PaidCallRefusal {
  return { ok: false, code, reason }
}

// ---------------------------------------------------------------------------
// Validation helpers.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

/** Bounds must be finite where money is concerned and integers where tokens or calls are counted. */
export function validateBounds(bounds: PaidCallBounds): PaidCallRefusal | null {
  if (!isPlainObject(bounds)) return refuse('bounds-invalid', 'bounds must be an object')
  if (!isFinitePositive(bounds.aggregateUsd)) return refuse('bounds-invalid', `aggregateUsd must be a finite positive number, got ${String(bounds.aggregateUsd)}`)
  if (!isFinitePositive(bounds.perRunUsd)) return refuse('bounds-invalid', `perRunUsd must be a finite positive number, got ${String(bounds.perRunUsd)}`)
  if (!isPositiveInteger(bounds.maxCallsPerUnit)) return refuse('bounds-invalid', `maxCallsPerUnit must be a positive integer, got ${String(bounds.maxCallsPerUnit)}`)
  if (!isPositiveInteger(bounds.maxOutputTokensPerCall)) {
    return refuse('bounds-invalid', `maxOutputTokensPerCall must be a positive integer, got ${String(bounds.maxOutputTokensPerCall)}`)
  }
  if (!isFinitePositive(bounds.acceptanceMaxAgeDays)) {
    return refuse('bounds-invalid', `acceptanceMaxAgeDays must be a finite positive number, got ${String(bounds.acceptanceMaxAgeDays)}`)
  }
  return null
}

// ---------------------------------------------------------------------------
// Request shape: the finite set of things the harness sends.

export interface BoundedMessageItem {
  role: 'developer' | 'user' | 'assistant'
  content: string
}
export interface BoundedFunctionCallOutputItem {
  type: 'function_call_output'
  call_id: string
  output: string
}
/** Items fed back from a previous response: assistant text, requested calls, reasoning summaries. */
export interface BoundedEchoedOutputItem {
  type: 'message' | 'function_call' | 'reasoning'
  [key: string]: unknown
}
export type BoundedInputItem = BoundedMessageItem | BoundedFunctionCallOutputItem | BoundedEchoedOutputItem

export interface BoundedFunctionTool {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
  strict: boolean
}

/** Exactly what the adapter is allowed to dispatch. Anything outside this
 * shape (hosted tools, previous_response_id, image or file inputs, another
 * service tier, truncation) is not representable and therefore never
 * reaches the provider. */
export interface BoundedResponsesRequest {
  model: string
  input: BoundedInputItem[]
  tools: BoundedFunctionTool[]
  max_output_tokens: number
  /** Standard pricing, explicitly; "auto" would inherit the project's configured tier. */
  service_tier: 'default'
  /** Oversized input fails with HTTP 400 instead of dropping items and billing the rest. */
  truncation: 'disabled'
  reasoning?: { effort: string }
}

const ECHOED_TYPES = new Set(['message', 'function_call', 'reasoning'])
const MESSAGE_PART_TYPES = new Set(['output_text', 'input_text', 'refusal'])

/** Refuse any input item outside the text-only partition the limit is accepted for. */
export function unsupportedItem(item: unknown, index: number): string | null {
  if (!isPlainObject(item)) return `input[${index}] is not an object`
  if ('type' in item && item.type !== undefined) {
    const type = item.type
    if (type === 'function_call_output') {
      return typeof item.output === 'string' && typeof item.call_id === 'string'
        ? null
        : `input[${index}] function_call_output must carry a string output and call_id`
    }
    if (typeof type !== 'string' || !ECHOED_TYPES.has(type)) return `input[${index}] has type "${String(type)}", outside the supported request shape`
    if (type === 'message') {
      const content = item.content
      if (typeof content === 'string') return null
      if (!Array.isArray(content)) return `input[${index}] message content is neither a string nor an array`
      for (const [partIndex, part] of content.entries()) {
        if (!isPlainObject(part) || typeof part.type !== 'string' || !MESSAGE_PART_TYPES.has(part.type)) {
          return `input[${index}].content[${partIndex}] is not a text part`
        }
      }
    }
    return null
  }
  if (item.role === 'developer' || item.role === 'user' || item.role === 'assistant') {
    return typeof item.content === 'string' ? null : `input[${index}] ${String(item.role)} message content must be a string`
  }
  return `input[${index}] is neither a role message nor an echoed output item`
}

export interface RequestCheck {
  ok: true
  /** UTF-8 bytes of the request JSON. */
  bytes: number
  /** Diagnostic only: the byte count as a rough token figure. Never prices anything. */
  estimatedInputTokens: number
  /** The accepted provider ceiling: what the reservation is priced at. */
  reservedInputTokens: number
  maxOutputTokens: number
}

/**
 * Check one request against the supported shape and the accepted ceiling.
 * The reservation figure is the ceiling itself; the estimate is recorded for
 * diagnosis and refuses only a request that is already larger than the
 * ceiling, which the provider would reject and the ledger would still have
 * to hold at the full reservation.
 */
export function checkRequest(
  request: BoundedResponsesRequest,
  bounds: PaidCallBounds,
  limit: ProviderInputLimit,
): RequestCheck | PaidCallRefusal {
  if (!Array.isArray(request.input) || !Array.isArray(request.tools)) {
    return refuse('shape-unsupported', 'the request must carry input and tools arrays')
  }
  for (const [index, item] of request.input.entries()) {
    const problem = unsupportedItem(item, index)
    if (problem) return refuse('shape-unsupported', problem)
  }
  for (const [index, tool] of request.tools.entries()) {
    if (!isPlainObject(tool) || tool.type !== 'function' || typeof tool.name !== 'string') {
      return refuse('shape-unsupported', `tools[${index}] is not a function tool; hosted tools are outside the supported request shape`)
    }
  }
  const known = new Set(['model', 'input', 'tools', 'max_output_tokens', 'service_tier', 'truncation', 'reasoning'])
  for (const key of Object.keys(request)) {
    if (!known.has(key)) return refuse('shape-unsupported', `request field "${key}" is outside the supported request shape`)
  }
  if (request.max_output_tokens !== bounds.maxOutputTokensPerCall) {
    return refuse('shape-unsupported', `max_output_tokens must be ${bounds.maxOutputTokensPerCall}, got ${String(request.max_output_tokens)}`)
  }
  if (request.service_tier !== 'default') {
    return refuse(
      'shape-unsupported',
      `service_tier must be pinned to "default" (standard pricing), got ${JSON.stringify(request.service_tier)}; "auto" or an absent tier would inherit the project's configured tier`,
    )
  }
  if (request.truncation !== 'disabled') {
    return refuse(
      'shape-unsupported',
      `truncation must be pinned to "disabled" so oversized input fails with HTTP 400, got ${JSON.stringify(request.truncation)}`,
    )
  }
  const bytes = Buffer.byteLength(JSON.stringify(request), 'utf8')
  const estimatedInputTokens = bytes
  if (estimatedInputTokens > limit.maxInputTokens) {
    return refuse(
      'input-too-large',
      `the request is ${bytes} bytes, already past the ${limit.maxInputTokens}-token provider ceiling the reservation would assume`,
    )
  }
  return { ok: true, bytes, estimatedInputTokens, reservedInputTokens: limit.maxInputTokens, maxOutputTokens: bounds.maxOutputTokensPerCall }
}

// ---------------------------------------------------------------------------
// Acceptances: prices and provider limits.

const DAY_MS = 24 * 60 * 60 * 1000

type AcceptanceKind = 'pricing' | 'limit'

/** An acceptance is a name, an ISO date, and a date inside the window ending now. */
function checkAcceptance(
  kind: AcceptanceKind,
  label: string,
  acceptance: PaidRunAcceptance | undefined,
  bounds: PaidCallBounds,
  now: Date,
): PaidCallRefusal | null {
  if (!acceptance) {
    return refuse(
      `${kind}-unaccepted`,
      `${label} has not been accepted for paid runs; verify it against the provider's primary documentation and record acceptedForPaidRuns (by, on, note)`,
    )
  }
  if (!isPlainObject(acceptance) || !isNonEmptyString(acceptance.by) || !isIsoDate(acceptance.on)) {
    return refuse(`${kind}-invalid`, `the acceptance for ${label} needs a name and an ISO date`)
  }
  const ageDays = (now.getTime() - Date.parse(acceptance.on)) / DAY_MS
  if (ageDays < 0 || ageDays > bounds.acceptanceMaxAgeDays) {
    return refuse(`${kind}-stale`, `the acceptance for ${label} is dated ${acceptance.on}, outside the ${bounds.acceptanceMaxAgeDays}-day window`)
  }
  return null
}

/** The price a paid run may use: present, well formed, with explicit terms, accepted, and accepted recently. */
export function acceptedPrice(
  model: string,
  prices: Record<string, PaidCallPrice>,
  bounds: PaidCallBounds,
  now: Date,
): { ok: true; price: PaidCallPrice } | PaidCallRefusal {
  const price = Object.prototype.hasOwnProperty.call(prices, model) ? prices[model] : undefined
  if (!price) return refuse('pricing-unknown', `no price entry for model "${model}"`)
  if (!isFiniteNonNegative(price.input) || !isFiniteNonNegative(price.cachedInput) || !isFiniteNonNegative(price.output)) {
    return refuse('pricing-invalid', `the price entry for "${model}" has a non-finite or negative rate`)
  }
  if (!isIsoDate(price.readOn)) {
    return refuse('pricing-invalid', `the price entry for "${model}" has no readable readOn date`)
  }
  const terms = validatePriceTerms(price)
  if (terms) return refuse('pricing-invalid', `the price entry for "${model}" ${terms}; the guard does not reserve from flat rates alone`)
  const acceptance = checkAcceptance('pricing', `the price for "${model}" (read ${price.readOn})`, price.acceptedForPaidRuns, bounds, now)
  return acceptance ?? { ok: true, price }
}

/** The provider ceiling a paid run may reserve from: present, an integer, for the supported shape, accepted recently. */
export function acceptedLimit(
  model: string,
  limits: Record<string, ProviderInputLimit>,
  bounds: PaidCallBounds,
  now: Date,
): { ok: true; limit: ProviderInputLimit } | PaidCallRefusal {
  const limit = Object.prototype.hasOwnProperty.call(limits, model) ? limits[model] : undefined
  if (!limit) {
    return refuse(
      'limit-unknown',
      `no provider input-token ceiling is recorded for model "${model}"; the reservation has no basis. Record it in providerLimits.ts from the provider's primary documentation, with source, date, evidence and acceptance`,
    )
  }
  if (!isPositiveInteger(limit.maxInputTokens)) {
    return refuse('limit-invalid', `the input-token ceiling for "${model}" must be a positive integer, got ${String(limit.maxInputTokens)}`)
  }
  if (!isNonEmptyString(limit.source) || !isNonEmptyString(limit.evidence) || !isIsoDate(limit.readOn)) {
    return refuse('limit-invalid', `the input-token ceiling for "${model}" needs a source, an evidence line and a readable readOn date`)
  }
  if (limit.requestShape !== SUPPORTED_REQUEST_SHAPE) {
    return refuse(
      'limit-shape',
      `the input-token ceiling for "${model}" was verified for "${String(limit.requestShape)}", not the supported shape "${SUPPORTED_REQUEST_SHAPE}"`,
    )
  }
  const acceptance = checkAcceptance(
    'limit',
    `the ${limit.maxInputTokens}-token provider ceiling for "${model}" (read ${limit.readOn})`,
    limit.acceptedForPaidRuns,
    bounds,
    now,
  )
  return acceptance ?? { ok: true, limit }
}

// ---------------------------------------------------------------------------
// Costs.

export interface ReportedUsage {
  inputTokens: number
  /** Input tokens served from the prompt cache (input_tokens_details.cached_tokens). */
  cachedInputTokens: number
  outputTokens: number
  /**
   * Input tokens written to the prompt cache (input_tokens_details.cache_write_tokens
   * in the installed SDK). Absent when the response did not report the
   * category; the settlement then charges every uncached token at the
   * cache-write rate and labels itself an upper estimate.
   */
  cacheWriteTokens?: number
}

/** How a settled figure was reached; neither is the provider's invoice. */
export type SettlementBasis =
  /** Every documented usage category was reported and priced at its documented rate. */
  | 'reported-categories'
  /** A category was missing and charged at the highest rate that could apply. */
  | 'upper-estimate'

export interface CostBreakdown {
  usd: number
  basis: SettlementBasis
  /** What was assumed, when anything was. */
  note?: string
}

/** Round to micro-dollars; a non-finite figure is an error, never a number. */
export function roundUsd(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  if (!Number.isFinite(value) || !Number.isFinite(rounded)) throw new Error(`cost arithmetic is not finite (${String(value)})`)
  return rounded
}

/** Tokens times a per-million rate, refusing any figure that leaves the finite range. */
function tokensUsd(tokens: number, ratePerMillion: number): number {
  if (!isNonNegativeInteger(tokens)) throw new Error(`token count is not a non-negative safe integer (${String(tokens)})`)
  const usd = (tokens / 1_000_000) * ratePerMillion
  if (!Number.isFinite(usd)) throw new Error(`cost arithmetic is not finite (${tokens} tokens at ${String(ratePerMillion)} per million)`)
  return usd
}

/** The price's terms, or an error: callers reach here only through acceptedPrice. */
function priceTerms(price: PaidCallPrice): PaidCallPriceTerms {
  const problem = validatePriceTerms(price)
  if (problem) throw new Error(`the price ${problem}; it has no terms the guard can reserve from`)
  return price.terms!
}

/** The multipliers that apply to a request of this many input tokens. */
function multipliersFor(terms: PaidCallPriceTerms, inputTokens: number): { input: number; output: number; longContext: boolean } {
  const longContext = terms.longContext
  if (longContext !== 'none' && inputTokens > longContext.aboveInputTokens) {
    return { input: longContext.inputMultiplier, output: longContext.outputMultiplier, longContext: true }
  }
  return { input: 1, output: 1, longContext: false }
}

/**
 * Worst case for one call: the full ceiling as uncached cache-written input
 * at the long-context multipliers when the ceiling exceeds the threshold,
 * every output token used at its multiplier. Every factor that can apply at
 * the ceiling is applied together; this is a bound, not a bill.
 */
export function reservationUsd(price: PaidCallPrice, check: RequestCheck): number {
  const terms = priceTerms(price)
  const factor = multipliersFor(terms, check.reservedInputTokens)
  return roundUsd(
    tokensUsd(check.reservedInputTokens, price.input * factor.input * terms.cacheWriteMultiplier) +
      tokensUsd(check.maxOutputTokens, price.output * factor.output),
  )
}

/**
 * Price a reported usage block at the documented rates. Cached tokens are
 * the cached rate; reported cache writes are the cache-write rate and are
 * charged in full even when they exceed the uncached count; the uncached
 * remainder is the input rate. Without the cache-write category, every
 * uncached token is a cache write (upper estimate). Above the long-context
 * threshold, every input-side rate (cached included) and the output rate
 * take their multipliers; the cached side is a conservative reading of "the
 * whole request".
 */
export function usageCost(price: PaidCallPrice, usage: ReportedUsage): CostBreakdown {
  const terms = priceTerms(price)
  const factor = multipliersFor(terms, usage.inputTokens)
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens)
  const uncached = usage.inputTokens - cached
  const notes: string[] = []
  let writes: number
  let plain: number
  let basis: SettlementBasis
  if (usage.cacheWriteTokens === undefined) {
    writes = uncached
    plain = 0
    basis = 'upper-estimate'
    notes.push(`cache-write tokens were not reported; all ${uncached} uncached input tokens charged at the cache-write rate (${terms.cacheWriteMultiplier}x uncached input)`)
  } else {
    writes = usage.cacheWriteTokens
    plain = Math.max(0, uncached - writes)
    basis = 'reported-categories'
  }
  if (factor.longContext) {
    notes.push(`long-context multipliers applied (${usage.inputTokens} input tokens above ${(terms.longContext as LongContextTerms).aboveInputTokens}: ${factor.input}x input, ${factor.output}x output)`)
  }
  const usd = roundUsd(
    tokensUsd(plain, price.input * factor.input) +
      tokensUsd(writes, price.input * terms.cacheWriteMultiplier * factor.input) +
      tokensUsd(cached, price.cachedInput * factor.input) +
      tokensUsd(usage.outputTokens, price.output * factor.output),
  )
  return notes.length > 0 ? { usd, basis, note: notes.join('; ') } : { usd, basis }
}

export function usageUsd(price: PaidCallPrice, usage: ReportedUsage): number {
  return usageCost(price, usage).usd
}

/** A usage block the settlement can trust: three non-negative safe integers, and a fourth when the cache-write category is present. */
export function validUsage(usage: unknown): usage is ReportedUsage {
  return (
    isPlainObject(usage) &&
    isNonNegativeInteger(usage.inputTokens) &&
    isNonNegativeInteger(usage.cachedInputTokens) &&
    isNonNegativeInteger(usage.outputTokens) &&
    (usage.cacheWriteTokens === undefined || isNonNegativeInteger(usage.cacheWriteTokens))
  )
}

// ---------------------------------------------------------------------------
// Ledger document.

export type LedgerEntryState = 'reserved' | 'settled' | 'ambiguous'

export interface LedgerEntry {
  id: string
  runId: string
  unit: string
  model: string
  reservedAt: string
  state: LedgerEntryState
  reservedUsd: number
  /** The accepted provider ceiling the reservation assumed. */
  reservedInputTokens: number
  /** Diagnostic: the request's byte-derived estimate at reservation time. */
  estimatedInputTokens: number
  maxOutputTokens: number
  /** Present once settled: the guard's accounting of the reported usage at documented rates. */
  settledUsd?: number
  settledAt?: string
  /** Present once settled: whether every category was reported or a missing one was charged at its upper rate. */
  settledBasis?: SettlementBasis
  /** What the settlement assumed (missing category, long-context multipliers). */
  settledNote?: string
  usage?: ReportedUsage
  /** Reported usage exceeded the reservation's assumptions; the ledger halted after it. */
  exceededReservation?: boolean
  /** Why an entry stayed ambiguous. */
  note?: string
}

/** A persistent stop: written when a settlement exceeded its reservation, cleared only by hand. */
export interface LedgerHalt {
  at: string
  runId: string
  entryId: string
  reason: string
}

export interface LedgerDocument {
  version: 1
  createdAt: string
  /** Free text recorded at creation: who authorised the spend and where. */
  authorisation: string
  entries: LedgerEntry[]
  halt?: LedgerHalt
}

export function emptyLedger(createdAt: Date, authorisation: string): LedgerDocument {
  return { version: 1, createdAt: createdAt.toISOString(), authorisation, entries: [] }
}

function validEntry(value: unknown, index: number): string | null {
  if (!isPlainObject(value)) return `entries[${index}] is not an object`
  const required: Array<[string, (candidate: unknown) => boolean]> = [
    ['id', isNonEmptyString],
    ['runId', isNonEmptyString],
    ['unit', (candidate) => typeof candidate === 'string'],
    ['model', isNonEmptyString],
    ['reservedAt', isIsoDate],
    ['state', (candidate) => candidate === 'reserved' || candidate === 'settled' || candidate === 'ambiguous'],
    ['reservedUsd', isFiniteNonNegative],
    ['reservedInputTokens', isNonNegativeInteger],
    ['estimatedInputTokens', isNonNegativeInteger],
    ['maxOutputTokens', isNonNegativeInteger],
  ]
  for (const [key, check] of required) {
    if (!check(value[key])) return `entries[${index}].${key} is missing or malformed`
  }
  if (value.state === 'settled') {
    if (!isFiniteNonNegative(value.settledUsd)) return `entries[${index}] is settled without a finite settledUsd`
    if (!validUsage(value.usage)) return `entries[${index}] is settled without a valid usage block`
    if (value.settledBasis !== 'reported-categories' && value.settledBasis !== 'upper-estimate') {
      return `entries[${index}] is settled without a settlement basis`
    }
  } else if (value.settledUsd !== undefined) {
    return `entries[${index}] is ${String(value.state)} but carries settledUsd`
  }
  return null
}

function validHalt(value: unknown): string | null {
  if (value === undefined) return null
  if (!isPlainObject(value)) return 'halt is not an object'
  if (!isIsoDate(value.at)) return 'halt.at is not an ISO date'
  if (!isNonEmptyString(value.runId) || !isNonEmptyString(value.entryId)) return 'halt needs a runId and an entryId'
  if (!isNonEmptyString(value.reason)) return 'halt needs a reason'
  return null
}

/** Parse ledger text strictly; any doubt is a refusal, and the caller must not write. */
export function parseLedger(text: string): { ok: true; ledger: LedgerDocument } | PaidCallRefusal {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return refuse('ledger-malformed', `the ledger is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isPlainObject(parsed)) return refuse('ledger-malformed', 'the ledger is not a JSON object')
  if (parsed.version !== 1) return refuse('ledger-malformed', `unsupported ledger version ${String(parsed.version)}`)
  if (typeof parsed.createdAt !== 'string') return refuse('ledger-malformed', 'the ledger has no createdAt')
  if (typeof parsed.authorisation !== 'string') return refuse('ledger-malformed', 'the ledger has no authorisation text')
  if (!Array.isArray(parsed.entries)) return refuse('ledger-malformed', 'the ledger has no entries array')
  const ids = new Set<string>()
  for (const [index, entry] of parsed.entries.entries()) {
    const problem = validEntry(entry, index)
    if (problem) return refuse('ledger-malformed', problem)
    const id = (entry as LedgerEntry).id
    if (ids.has(id)) return refuse('ledger-malformed', `entries[${index}] repeats id "${id}"`)
    ids.add(id)
  }
  const halt = validHalt(parsed.halt)
  if (halt) return refuse('ledger-malformed', halt)
  return { ok: true, ledger: parsed as unknown as LedgerDocument }
}

/** Why a halted ledger refuses, and what a human must do; the same text on every path. */
export function describeHalt(halt: LedgerHalt): string {
  return (
    `the ledger was halted at ${halt.at} by run ${halt.runId} after entry ${halt.entryId}: ${halt.reason}. ` +
    'Every paid run refuses until a human reconciles the charged usage against the provider, records the outcome, ' +
    'and removes the "halt" field from the ledger file by hand; the entries stay as recorded'
  )
}

/** Write a persistent halt; pure, returns a new document. An existing halt is kept. */
export function haltLedger(ledger: LedgerDocument, halt: LedgerHalt): LedgerDocument {
  return ledger.halt ? ledger : { ...ledger, halt }
}

/** What one entry costs the budget: actual when settled, reserved otherwise. */
export function entryUsd(entry: LedgerEntry): number {
  return entry.state === 'settled' ? (entry.settledUsd ?? entry.reservedUsd) : entry.reservedUsd
}

export interface LedgerTotals {
  entries: number
  settled: number
  reserved: number
  ambiguous: number
  /** Sum of entryUsd over every entry, all runs. */
  consumedUsd: number
  /** Entries whose reported usage exceeded their reservation. */
  overruns: number
}

export function ledgerTotals(ledger: LedgerDocument, runId?: string): LedgerTotals {
  const entries = runId === undefined ? ledger.entries : ledger.entries.filter((entry) => entry.runId === runId)
  return {
    entries: entries.length,
    settled: entries.filter((entry) => entry.state === 'settled').length,
    reserved: entries.filter((entry) => entry.state === 'reserved').length,
    ambiguous: entries.filter((entry) => entry.state === 'ambiguous').length,
    consumedUsd: roundUsd(entries.reduce((sum, entry) => sum + entryUsd(entry), 0)),
    overruns: entries.filter((entry) => entry.exceededReservation === true).length,
  }
}

// ---------------------------------------------------------------------------
// Decisions.

export interface ReservationInput {
  ledger: LedgerDocument
  bounds: PaidCallBounds
  price: PaidCallPrice
  runId: string
  /** The open accounting unit, or null when none was begun. */
  unit: string | null
  /** Dispatch attempts already reserved in this unit. */
  unitCalls: number
  /** Set once the run halted; carried as the refusal reason. */
  halted: string | null
  request: RequestCheck
  model: string
  entryId: string
  now: Date
}

/** Decide one reservation and produce the entry to append; pure. */
export function decideReservation(input: ReservationInput): { ok: true; entry: LedgerEntry } | PaidCallRefusal {
  const { bounds } = input
  if (input.ledger.halt) return refuse('ledger-halted', describeHalt(input.ledger.halt))
  if (input.halted) return refuse('halted', input.halted)
  if (input.ledger.entries.some((entry) => entry.id === input.entryId)) {
    // Identities are never reused: a twin would let one settlement replace two
    // entries, or leave a file the parser refuses. The guard refuses a reused
    // run id at open; this is the same rule at the pure boundary.
    return refuse('run-id-reused', `entry id "${input.entryId}" is already on the ledger; nothing is appended under an existing identity and the recorded entry stays as it is`)
  }
  if (input.unit === null) {
    return refuse('no-unit', 'no accounting unit is open; begin one per corpus case or bridge turn before dispatching')
  }
  if (input.unitCalls >= bounds.maxCallsPerUnit) {
    return refuse('unit-calls', `unit "${input.unit}" already made ${input.unitCalls} of ${bounds.maxCallsPerUnit} model calls`)
  }
  const terms = validatePriceTerms(input.price)
  if (terms) return refuse('pricing-invalid', `the price for "${input.model}" ${terms}; nothing is reserved from flat rates alone`)
  let reserved: number
  let aggregate: number
  let run: number
  let aggregateAfter: number
  let runAfter: number
  try {
    reserved = reservationUsd(input.price, input.request)
    aggregate = ledgerTotals(input.ledger).consumedUsd
    run = ledgerTotals(input.ledger, input.runId).consumedUsd
    aggregateAfter = roundUsd(aggregate + reserved)
    runAfter = roundUsd(run + reserved)
  } catch (error) {
    return refuse('arithmetic-overflow', error instanceof Error ? error.message : String(error))
  }
  if (aggregateAfter > bounds.aggregateUsd) {
    return refuse(
      'aggregate-exhausted',
      `the aggregate ledger has consumed $${aggregate.toFixed(6)} and the next call reserves $${reserved.toFixed(6)}, over the $${bounds.aggregateUsd} ceiling`,
    )
  }
  if (runAfter > bounds.perRunUsd) {
    return refuse(
      'run-exhausted',
      `this run has consumed $${run.toFixed(6)} and the next call reserves $${reserved.toFixed(6)}, over the $${bounds.perRunUsd} per-run ceiling`,
    )
  }
  return {
    ok: true,
    entry: {
      id: input.entryId,
      runId: input.runId,
      unit: input.unit,
      model: input.model,
      reservedAt: input.now.toISOString(),
      state: 'reserved',
      reservedUsd: reserved,
      reservedInputTokens: input.request.reservedInputTokens,
      estimatedInputTokens: input.request.estimatedInputTokens,
      maxOutputTokens: input.request.maxOutputTokens,
    },
  }
}

export interface Settlement {
  entry: LedgerEntry
  settledUsd: number
  /** Non-null when the reported usage exceeded the reservation; the ledger must halt. */
  overrun: string | null
}

/** Settle a reserved entry at its reported usage; pure, returns a new entry. Throws on non-finite cost. */
export function settleEntry(entry: LedgerEntry, usage: ReportedUsage, price: PaidCallPrice, now: Date): Settlement {
  if (entry.state !== 'reserved') throw new Error(`entry ${entry.id} is ${entry.state}, not reserved`)
  const cost = usageCost(price, usage)
  const settledUsd = cost.usd
  const problems: string[] = []
  if (usage.inputTokens > entry.reservedInputTokens) {
    problems.push(`${usage.inputTokens} input tokens reported against the ${entry.reservedInputTokens}-token provider ceiling the reservation assumed`)
  }
  if (usage.outputTokens > entry.maxOutputTokens) {
    problems.push(`${usage.outputTokens} output tokens reported against max_output_tokens ${entry.maxOutputTokens}`)
  }
  if (settledUsd > entry.reservedUsd) {
    problems.push(`$${settledUsd.toFixed(6)} settled (${cost.basis}) against a $${entry.reservedUsd.toFixed(6)} reservation`)
  }
  const overrun = problems.length > 0 ? `entry ${entry.id}: ${problems.join('; ')}` : null
  return {
    entry: {
      ...entry,
      state: 'settled',
      settledUsd,
      settledAt: now.toISOString(),
      settledBasis: cost.basis,
      ...(cost.note ? { settledNote: cost.note } : {}),
      usage: {
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
        ...(usage.cacheWriteTokens !== undefined ? { cacheWriteTokens: usage.cacheWriteTokens } : {}),
      },
      ...(overrun ? { exceededReservation: true } : {}),
    },
    settledUsd,
    overrun,
  }
}

/** Keep a reservation as ambiguous spend; pure, returns a new entry. */
export function abandonEntry(entry: LedgerEntry, note: string): LedgerEntry {
  if (entry.state !== 'reserved') throw new Error(`entry ${entry.id} is ${entry.state}, not reserved`)
  return { ...entry, state: 'ambiguous', note }
}

/** Why a price's terms cannot be reserved from, or null when they are explicit and consistent. */
export function validatePriceTerms(price: PaidCallPrice): string | null {
  const terms = price.terms
  if (!isPlainObject(terms)) return 'has no terms: the long-context surcharge (or "none") and the cache-write multiplier must be stated explicitly'
  if (!(typeof terms.cacheWriteMultiplier === 'number' && Number.isFinite(terms.cacheWriteMultiplier) && terms.cacheWriteMultiplier >= 1)) {
    return `has a cache-write multiplier that is not a finite number of at least 1 (${String(terms.cacheWriteMultiplier)})`
  }
  const longContext = terms.longContext
  if (longContext !== 'none') {
    if (!isPlainObject(longContext)) return `has a long-context term that is neither "none" nor an object (${String(longContext)})`
    if (!isPositiveInteger(longContext.aboveInputTokens)) {
      return `has a long-context threshold that is not a positive integer (${String(longContext.aboveInputTokens)})`
    }
    for (const key of ['inputMultiplier', 'outputMultiplier'] as const) {
      const value = longContext[key]
      if (!(typeof value === 'number' && Number.isFinite(value) && value >= 1)) {
        return `has a long-context ${key} that is not a finite number of at least 1 (${String(value)})`
      }
    }
  }
  if (price.cachedInput > price.input) return `prices cached input ($${price.cachedInput}/M) above uncached input ($${price.input}/M)`
  return null
}
