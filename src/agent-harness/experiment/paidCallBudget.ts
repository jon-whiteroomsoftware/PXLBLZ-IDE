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
// another entry. Actual usage above the reservation is recorded at its
// actual cost, flagged, and halts further dispatch in that run.
//
// Input-token bound. The reservation's input side is derived from the UTF-8
// byte length of the request JSON. Under a byte-level BPE tokenizer no
// token spans less than one byte of the text it encodes, so tokens never
// exceed bytes of the *tokenized* text; the provider's framing and its own
// rendering of the tool schemas are not that text, and the margin factor and
// the per-item allowance stand in for them. That makes the figure a bound
// under stated assumptions, not a guarantee, which is why every settlement
// compares the reported usage against it and an excess halts the run. A
// request that carries anything whose token cost is not a function of its
// bytes (images, files, hosted tools, server-side previous responses) is
// refused rather than estimated.

export interface PaidCallBounds {
  /** Ceiling on everything the ledger has ever consumed, all runs, all states. */
  aggregateUsd: number
  /** Ceiling on what one run (one CLI invocation or bridge process) may consume. */
  perRunUsd: number
  /** Model calls (dispatch attempts, retries included) per accounting unit. */
  maxCallsPerUnit: number
  /** Sent as max_output_tokens on every request and reserved in full. */
  maxOutputTokensPerCall: number
  /** A request whose bounded input exceeds this is refused before dispatch. */
  maxInputTokensPerCall: number
  /** Margin over the byte count for provider framing and schema rendering. */
  inputTokensPerByte: number
  /** Fixed allowance per input item and per tool for message and tool framing. */
  framingTokensPerItem: number
  /** A price acceptance older than this (days) is refused. */
  pricingAcceptanceMaxAgeDays: number
}

/** Provenance: issue #945 "Live baseline authorization" (Jon, 2026-09-04) and
 * the coordinator's implementation choices of the same day; the input cap and
 * the two framing allowances are this slice's choices, sized from the measured
 * first-call request (about 97 KB: 88 KB of tool schemas, 5 KB of Show
 * projection, 4 KB of rules and prompt) with room for four rounds of feedback. */
export const PAID_CALL_BOUNDS: PaidCallBounds = {
  aggregateUsd: 20,
  perRunUsd: 2,
  maxCallsPerUnit: 4,
  maxOutputTokensPerCall: 4000,
  maxInputTokensPerCall: 200_000,
  inputTokensPerByte: 1.25,
  framingTokensPerItem: 64,
  pricingAcceptanceMaxAgeDays: 30,
}

export interface PaidCallPrice {
  /** USD per million uncached input tokens. */
  input: number
  /** USD per million cached input tokens. */
  cachedInput: number
  /** USD per million output tokens (reasoning included). */
  output: number
  /** Where the price was read. */
  source: string
  /** ISO date the price was read. */
  readOn: string
  /**
   * Set only after someone verified the price against the provider for a paid
   * run. Absent means the guard refuses the model: a transferred or edited
   * price is never treated as freshly verified.
   */
  acceptedForPaidRuns?: { by: string; on: string; note?: string }
}

export type PaidCallRefusalCode =
  | 'no-unit'
  | 'unit-calls'
  | 'run-exhausted'
  | 'aggregate-exhausted'
  | 'halted'
  | 'input-unbounded'
  | 'input-too-large'
  | 'pricing-unknown'
  | 'pricing-unaccepted'
  | 'pricing-stale'
  | 'pricing-invalid'
  | 'ledger-missing'
  | 'ledger-malformed'
  | 'ledger-locked'
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
 * shape (hosted tools, previous_response_id, image or file inputs) is not
 * representable and therefore never reaches the provider. */
export interface BoundedResponsesRequest {
  model: string
  input: BoundedInputItem[]
  tools: BoundedFunctionTool[]
  max_output_tokens: number
  reasoning?: { effort: string }
}

const ECHOED_TYPES = new Set(['message', 'function_call', 'reasoning'])
const MESSAGE_PART_TYPES = new Set(['output_text', 'input_text', 'refusal'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Refuse any input item whose token cost is not a function of its bytes. */
export function unboundableItem(item: unknown, index: number): string | null {
  if (!isPlainObject(item)) return `input[${index}] is not an object`
  if ('type' in item && item.type !== undefined) {
    const type = item.type
    if (type === 'function_call_output') {
      return typeof item.output === 'string' && typeof item.call_id === 'string'
        ? null
        : `input[${index}] function_call_output must carry a string output and call_id`
    }
    if (typeof type !== 'string' || !ECHOED_TYPES.has(type)) return `input[${index}] has type "${String(type)}", which cannot be bounded`
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

export interface RequestBound {
  ok: true
  /** UTF-8 bytes of the request JSON. */
  bytes: number
  /** The input-token figure the reservation is priced at. */
  boundedInputTokens: number
  maxOutputTokens: number
}

/**
 * Bound one request. `priorOutputTokens` is the sum of output tokens (reasoning
 * included) the provider reported for this unit's earlier calls; reasoning
 * items echoed back by id are re-read server side and billed as input, so the
 * bytes of the echoed item do not cover them.
 */
export function boundRequest(
  request: BoundedResponsesRequest,
  bounds: PaidCallBounds,
  priorOutputTokens: number,
): RequestBound | PaidCallRefusal {
  if (!Number.isFinite(priorOutputTokens) || priorOutputTokens < 0) {
    return refuse('input-unbounded', `prior output tokens must be a finite non-negative number, got ${String(priorOutputTokens)}`)
  }
  if (!Array.isArray(request.input) || !Array.isArray(request.tools)) {
    return refuse('input-unbounded', 'the request must carry input and tools arrays')
  }
  for (const [index, item] of request.input.entries()) {
    const problem = unboundableItem(item, index)
    if (problem) return refuse('input-unbounded', problem)
  }
  for (const [index, tool] of request.tools.entries()) {
    if (!isPlainObject(tool) || tool.type !== 'function' || typeof tool.name !== 'string') {
      return refuse('input-unbounded', `tools[${index}] is not a function tool; hosted tools cannot be bounded`)
    }
  }
  const known = new Set(['model', 'input', 'tools', 'max_output_tokens', 'reasoning'])
  for (const key of Object.keys(request)) {
    if (!known.has(key)) return refuse('input-unbounded', `request field "${key}" is outside the bounded shape`)
  }
  if (request.max_output_tokens !== bounds.maxOutputTokensPerCall) {
    return refuse('input-unbounded', `max_output_tokens must be ${bounds.maxOutputTokensPerCall}, got ${String(request.max_output_tokens)}`)
  }
  const bytes = Buffer.byteLength(JSON.stringify(request), 'utf8')
  const items = request.input.length + request.tools.length
  const boundedInputTokens =
    Math.ceil(bytes * bounds.inputTokensPerByte) + items * bounds.framingTokensPerItem + Math.ceil(priorOutputTokens)
  if (boundedInputTokens > bounds.maxInputTokensPerCall) {
    return refuse(
      'input-too-large',
      `the bounded input of ${boundedInputTokens} tokens (${bytes} bytes) exceeds the ${bounds.maxInputTokensPerCall}-token ceiling`,
    )
  }
  return { ok: true, bytes, boundedInputTokens, maxOutputTokens: bounds.maxOutputTokensPerCall }
}

// ---------------------------------------------------------------------------
// Prices and costs.

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The price a paid run may use: present, well formed, accepted, and accepted recently. */
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
  if (typeof price.readOn !== 'string' || Number.isNaN(Date.parse(price.readOn))) {
    return refuse('pricing-invalid', `the price entry for "${model}" has no readable readOn date`)
  }
  const acceptance = price.acceptedForPaidRuns
  if (!acceptance) {
    return refuse(
      'pricing-unaccepted',
      `the price for "${model}" (read ${price.readOn}) has not been accepted for paid runs; verify it against the provider and record acceptedForPaidRuns in pricing.ts`,
    )
  }
  const acceptedOn = Date.parse(acceptance.on)
  if (typeof acceptance.by !== 'string' || acceptance.by.trim() === '' || Number.isNaN(acceptedOn)) {
    return refuse('pricing-invalid', `the acceptance for "${model}" needs a name and an ISO date`)
  }
  const ageDays = (now.getTime() - acceptedOn) / DAY_MS
  if (ageDays < 0 || ageDays > bounds.pricingAcceptanceMaxAgeDays) {
    return refuse(
      'pricing-stale',
      `the price acceptance for "${model}" is dated ${acceptance.on}, outside the ${bounds.pricingAcceptanceMaxAgeDays}-day window`,
    )
  }
  return { ok: true, price }
}

export interface ReportedUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

/** Round to micro-dollars; never NaN. */
export function roundUsd(value: number): number {
  if (!Number.isFinite(value)) throw new Error(`cost arithmetic produced ${String(value)}`)
  return Math.round(value * 1_000_000) / 1_000_000
}

/** Worst case for one call: every bounded input token uncached, every output token used. */
export function reservationUsd(price: PaidCallPrice, bound: RequestBound): number {
  return roundUsd((bound.boundedInputTokens * price.input + bound.maxOutputTokens * price.output) / 1_000_000)
}

export function usageUsd(price: PaidCallPrice, usage: ReportedUsage): number {
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens)
  return roundUsd(
    (uncached * price.input + Math.min(usage.cachedInputTokens, usage.inputTokens) * price.cachedInput + usage.outputTokens * price.output) /
      1_000_000,
  )
}

/** A usage block the settlement can trust: three finite non-negative integers. */
export function validUsage(usage: unknown): usage is ReportedUsage {
  return (
    isPlainObject(usage) &&
    isFiniteNonNegative(usage.inputTokens) &&
    isFiniteNonNegative(usage.cachedInputTokens) &&
    isFiniteNonNegative(usage.outputTokens)
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
  boundedInputTokens: number
  maxOutputTokens: number
  /** Present once settled: the actual cost from reported usage. */
  settledUsd?: number
  settledAt?: string
  usage?: ReportedUsage
  /** Reported usage exceeded the reservation's bound; the run halted after it. */
  exceededReservation?: boolean
  /** Why an entry stayed ambiguous. */
  note?: string
}

export interface LedgerDocument {
  version: 1
  createdAt: string
  /** Free text recorded at creation: who authorised the spend and where. */
  authorisation: string
  entries: LedgerEntry[]
}

export function emptyLedger(createdAt: Date, authorisation: string): LedgerDocument {
  return { version: 1, createdAt: createdAt.toISOString(), authorisation, entries: [] }
}

function validEntry(value: unknown, index: number): string | null {
  if (!isPlainObject(value)) return `entries[${index}] is not an object`
  const required: Array<[string, (candidate: unknown) => boolean]> = [
    ['id', (candidate) => typeof candidate === 'string' && candidate !== ''],
    ['runId', (candidate) => typeof candidate === 'string' && candidate !== ''],
    ['unit', (candidate) => typeof candidate === 'string'],
    ['model', (candidate) => typeof candidate === 'string' && candidate !== ''],
    ['reservedAt', (candidate) => typeof candidate === 'string' && !Number.isNaN(Date.parse(candidate))],
    ['state', (candidate) => candidate === 'reserved' || candidate === 'settled' || candidate === 'ambiguous'],
    ['reservedUsd', isFiniteNonNegative],
    ['boundedInputTokens', isFiniteNonNegative],
    ['maxOutputTokens', isFiniteNonNegative],
  ]
  for (const [key, check] of required) {
    if (!check(value[key])) return `entries[${index}].${key} is missing or malformed`
  }
  if (value.state === 'settled') {
    if (!isFiniteNonNegative(value.settledUsd)) return `entries[${index}] is settled without a finite settledUsd`
    if (!validUsage(value.usage)) return `entries[${index}] is settled without a valid usage block`
  } else if (value.settledUsd !== undefined) {
    return `entries[${index}] is ${String(value.state)} but carries settledUsd`
  }
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
  return { ok: true, ledger: parsed as unknown as LedgerDocument }
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
  bound: RequestBound
  model: string
  entryId: string
  now: Date
}

/** Decide one reservation and produce the entry to append; pure. */
export function decideReservation(input: ReservationInput): { ok: true; entry: LedgerEntry } | PaidCallRefusal {
  const { bounds } = input
  if (input.halted) return refuse('halted', input.halted)
  if (input.unit === null) {
    return refuse('no-unit', 'no accounting unit is open; begin one per corpus case or bridge turn before dispatching')
  }
  if (input.unitCalls >= bounds.maxCallsPerUnit) {
    return refuse('unit-calls', `unit "${input.unit}" already made ${input.unitCalls} of ${bounds.maxCallsPerUnit} model calls`)
  }
  const reserved = reservationUsd(input.price, input.bound)
  const aggregate = ledgerTotals(input.ledger).consumedUsd
  if (roundUsd(aggregate + reserved) > bounds.aggregateUsd) {
    return refuse(
      'aggregate-exhausted',
      `the aggregate ledger has consumed $${aggregate.toFixed(6)} and the next call reserves $${reserved.toFixed(6)}, over the $${bounds.aggregateUsd} ceiling`,
    )
  }
  const run = ledgerTotals(input.ledger, input.runId).consumedUsd
  if (roundUsd(run + reserved) > bounds.perRunUsd) {
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
      boundedInputTokens: input.bound.boundedInputTokens,
      maxOutputTokens: input.bound.maxOutputTokens,
    },
  }
}

export interface Settlement {
  entry: LedgerEntry
  settledUsd: number
  /** Non-null when the reported usage exceeded the reservation; the run must halt. */
  overrun: string | null
}

/** Settle a reserved entry at its reported usage; pure, returns a new entry. */
export function settleEntry(entry: LedgerEntry, usage: ReportedUsage, price: PaidCallPrice, now: Date): Settlement {
  if (entry.state !== 'reserved') throw new Error(`entry ${entry.id} is ${entry.state}, not reserved`)
  const settledUsd = usageUsd(price, usage)
  const problems: string[] = []
  if (usage.inputTokens > entry.boundedInputTokens) {
    problems.push(`${usage.inputTokens} input tokens reported against a bound of ${entry.boundedInputTokens}`)
  }
  if (usage.outputTokens > entry.maxOutputTokens) {
    problems.push(`${usage.outputTokens} output tokens reported against max_output_tokens ${entry.maxOutputTokens}`)
  }
  if (settledUsd > entry.reservedUsd) {
    problems.push(`$${settledUsd.toFixed(6)} settled against a $${entry.reservedUsd.toFixed(6)} reservation`)
  }
  const overrun = problems.length > 0 ? `entry ${entry.id}: ${problems.join('; ')}` : null
  return {
    entry: {
      ...entry,
      state: 'settled',
      settledUsd,
      settledAt: now.toISOString(),
      usage: { inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens, outputTokens: usage.outputTokens },
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
