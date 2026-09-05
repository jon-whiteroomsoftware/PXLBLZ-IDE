// Pure budgeting rules (#945). Boundary: the exported decision functions of
// experiment/paidCallBudget.ts. Invariants: a refusal changes nothing; the
// reservation is the accepted provider ceiling priced at the worst applicable
// documented rates (long-context multiplier, cache-write multiplier) plus the
// output cap, never the request's estimate; the aggregate and run ceilings
// are inclusive at the exact reservation and exclusive one micro-dollar past
// it; ambiguous and still-reserved entries count at their reservation;
// settlement never produces NaN or a negative figure and never prices a
// category below its documented rate: a usage block without the cache-write
// category is charged as if every uncached token were a cache write and
// labelled an upper estimate; usage beyond the ceiling is recorded at its
// actual cost, flagged, and halts the ledger; a request outside the supported
// shape (including one that does not pin service_tier=default and
// truncation=disabled) is refused rather than estimated; a price without
// explicit terms, with inconsistent terms, or without a dated acceptance is
// refused; bounds that are not finite integers where integers are required
// are refused.
import { describe, expect, it } from 'vitest'
import {
  abandonEntry,
  acceptedLimit,
  acceptedPrice,
  checkRequest,
  decideReservation,
  emptyLedger,
  haltLedger,
  ledgerTotals,
  PAID_CALL_BOUNDS,
  parseLedger,
  reservationUsd,
  settleEntry,
  SUPPORTED_REQUEST_SHAPE,
  usageCost,
  usageUsd,
  validateBounds,
  validUsage,
  type BoundedResponsesRequest,
  type LedgerDocument,
  type LedgerEntry,
  type PaidCallBounds,
  type PaidCallPrice,
  type PaidCallPriceTerms,
  type ProviderInputLimit,
} from '../experiment/paidCallBudget.js'
import { MODEL_PRICES } from '../experiment/pricing.js'
import { MODEL_INPUT_LIMITS } from '../experiment/providerLimits.js'

const NOW = new Date('2026-09-04T12:00:00.000Z')

const BOUNDS: PaidCallBounds = {
  aggregateUsd: 20,
  perRunUsd: 2,
  maxCallsPerUnit: 4,
  maxOutputTokensPerCall: 4000,
  acceptanceMaxAgeDays: 30,
}

/** Flat terms: no long-context surcharge, cache writes at the uncached rate. */
const FLAT_TERMS: PaidCallPriceTerms = { longContext: 'none', cacheWriteMultiplier: 1 }

/** $1 per million on every rate with flat terms: one token is one micro-dollar, so costs read directly. */
const UNIT_PRICE: PaidCallPrice = {
  input: 1,
  cachedInput: 1,
  output: 1,
  terms: FLAT_TERMS,
  source: 'test',
  readOn: '2026-09-01',
  acceptedForPaidRuns: { by: 'test', on: '2026-09-03' },
}

/**
 * The documented Luna schedule under test-local acceptance: $0.20 / $0.02 /
 * $1.20 per million, the whole request at 2x input and 1.5x output above
 * 272,000 input tokens, cache writes at 1.25x the uncached input rate.
 */
const LUNA_LIKE: PaidCallPrice = {
  input: 0.2,
  cachedInput: 0.02,
  output: 1.2,
  terms: { longContext: { aboveInputTokens: 272_000, inputMultiplier: 2, outputMultiplier: 1.5 }, cacheWriteMultiplier: 1.25 },
  source: 'test',
  readOn: '2026-09-05',
  acceptedForPaidRuns: { by: 'test', on: '2026-09-04' },
}

/** A test ceiling of 100,000 input tokens: with the unit price a call reserves $0.104. */
const LIMIT: ProviderInputLimit = {
  maxInputTokens: 100_000,
  requestShape: SUPPORTED_REQUEST_SHAPE,
  source: 'test',
  readOn: '2026-09-01',
  evidence: 'test',
  acceptedForPaidRuns: { by: 'test', on: '2026-09-03' },
}

const REQUEST: BoundedResponsesRequest = {
  model: 'test-model',
  input: [
    { role: 'developer', content: 'rules' },
    { role: 'user', content: 'make the first Clip twelve seconds' },
  ],
  tools: [{ type: 'function', name: 'resize_clip', description: 'resize', parameters: { type: 'object' }, strict: false }],
  max_output_tokens: 4000,
  service_tier: 'default',
  truncation: 'disabled',
}

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: 'run-a-1',
    runId: 'run-a',
    unit: 'case-1',
    model: 'test-model',
    reservedAt: NOW.toISOString(),
    state: 'reserved',
    reservedUsd: 0.5,
    reservedInputTokens: 100_000,
    estimatedInputTokens: 1000,
    maxOutputTokens: 4000,
    ...overrides,
  }
}

function ledgerWith(entries: LedgerEntry[]): LedgerDocument {
  return { ...emptyLedger(NOW, 'test'), entries }
}

describe('bounds validation', () => {
  it('accepts the shipped bounds', () => {
    expect(validateBounds(BOUNDS)).toBeNull()
  })

  it.each<[string, Partial<PaidCallBounds>]>([
    ['a fractional output cap', { maxOutputTokensPerCall: 4000.5 }],
    ['a zero call count', { maxCallsPerUnit: 0 }],
    ['an unsafe call count', { maxCallsPerUnit: 2 ** 53 }],
    ['an infinite aggregate', { aggregateUsd: Number.POSITIVE_INFINITY }],
    ['a NaN per-run ceiling', { perRunUsd: Number.NaN }],
    ['a negative per-run ceiling', { perRunUsd: -1 }],
    ['a string acceptance window', { acceptanceMaxAgeDays: '30' as never }],
  ])('refuses %s', (_label, overrides) => {
    const refused = validateBounds({ ...BOUNDS, ...overrides })
    expect(refused?.code).toBe('bounds-invalid')
  })
})

describe('request check against the accepted ceiling', () => {
  it('reserves the full provider ceiling and records the byte estimate as a diagnostic', () => {
    const checked = checkRequest(REQUEST, BOUNDS, LIMIT)
    expect(checked.ok).toBe(true)
    if (!checked.ok) return
    const bytes = Buffer.byteLength(JSON.stringify(REQUEST), 'utf8')
    expect(checked).toEqual({ ok: true, bytes, estimatedInputTokens: bytes, reservedInputTokens: 100_000, maxOutputTokens: 4000 })
    expect(reservationUsd(UNIT_PRICE, checked)).toBe(0.104)
  })

  it('reserves the same ceiling for a tiny and a large request: the estimate never lowers it', () => {
    const tiny = checkRequest({ ...REQUEST, input: [{ role: 'user', content: 'x' }], tools: [] }, BOUNDS, LIMIT)
    const large = checkRequest({ ...REQUEST, input: [{ role: 'user', content: 'x'.repeat(60_000) }] }, BOUNDS, LIMIT)
    if (!tiny.ok || !large.ok) throw new Error('expected both to pass')
    expect(tiny.estimatedInputTokens).toBeLessThan(large.estimatedInputTokens)
    expect(tiny.reservedInputTokens).toBe(100_000)
    expect(large.reservedInputTokens).toBe(100_000)
    expect(reservationUsd(UNIT_PRICE, tiny)).toBe(reservationUsd(UNIT_PRICE, large))
  })

  it.each<[string, unknown]>([
    ['an image input part', { type: 'message', role: 'user', content: [{ type: 'input_image', image_url: 'x' }] }],
    ['a hosted tool call echo', { type: 'web_search_call', id: 'ws_1' }],
    ['a non-string message', { role: 'user', content: [{ type: 'input_file', file_id: 'f' }] }],
    ['a nonsense item', { hello: 'world' }],
  ])('refuses %s as outside the supported shape', (_label, item) => {
    const refused = checkRequest({ ...REQUEST, input: [item as never] }, BOUNDS, LIMIT)
    expect(refused.ok === false && refused.code).toBe('shape-unsupported')
  })

  it('accepts the echoed output items the loop feeds back', () => {
    const echoed = checkRequest(
      {
        ...REQUEST,
        input: [
          ...REQUEST.input,
          { type: 'reasoning', id: 'rs_1', summary: [] },
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok', annotations: [] }] },
          { type: 'function_call', call_id: 'c1', name: 'describe_show', arguments: '{}' },
          { type: 'function_call_output', call_id: 'c1', output: '{"ok":true}' },
        ],
      },
      BOUNDS,
      LIMIT,
    )
    expect(echoed.ok).toBe(true)
  })

  it('refuses hosted tools, foreign request fields and a changed output cap', () => {
    const hosted = checkRequest({ ...REQUEST, tools: [{ type: 'web_search_preview' } as never] }, BOUNDS, LIMIT)
    expect(hosted.ok === false && hosted.code).toBe('shape-unsupported')
    const previous = checkRequest({ ...REQUEST, previous_response_id: 'resp_1' } as never, BOUNDS, LIMIT)
    expect(previous.ok === false && previous.code).toBe('shape-unsupported')
    const cap = checkRequest({ ...REQUEST, max_output_tokens: 64_000 }, BOUNDS, LIMIT)
    expect(cap.ok === false && cap.code).toBe('shape-unsupported')
  })

  it.each<[string, Partial<Record<'service_tier' | 'truncation', unknown>>]>([
    ['service_tier auto (the provider default, which may inherit a project tier)', { service_tier: 'auto' }],
    ['service_tier flex', { service_tier: 'flex' }],
    ['service_tier priority', { service_tier: 'priority' }],
    ['a missing service_tier', { service_tier: undefined }],
    ['truncation auto (silent dropping instead of a 400)', { truncation: 'auto' }],
    ['a missing truncation', { truncation: undefined }],
  ])('refuses a request that does not pin %s', (_label, overrides) => {
    const request = { ...REQUEST, ...overrides } as BoundedResponsesRequest
    for (const key of Object.keys(overrides)) if ((overrides as Record<string, unknown>)[key] === undefined) delete (request as unknown as Record<string, unknown>)[key]
    const refused = checkRequest(request, BOUNDS, LIMIT)
    expect(refused.ok === false && refused.code).toBe('shape-unsupported')
    expect(refused.ok === false && refused.reason).toMatch(/service_tier|truncation/)
  })

  it('refuses a request whose estimate already exceeds the ceiling', () => {
    const huge = { ...REQUEST, input: [{ role: 'user' as const, content: 'x'.repeat(100_000) }] }
    const refused = checkRequest(huge, BOUNDS, LIMIT)
    expect(refused.ok === false && refused.code).toBe('input-too-large')
  })
})

describe('price acceptance', () => {
  const prices = { 'test-model': UNIT_PRICE }

  it('accepts a dated acceptance inside the window', () => {
    expect(acceptedPrice('test-model', prices, BOUNDS, NOW).ok).toBe(true)
  })

  it.each<[string, Record<string, PaidCallPrice>, string]>([
    ['an unknown model', {}, 'pricing-unknown'],
    ['a price without acceptance', { 'test-model': { ...UNIT_PRICE, acceptedForPaidRuns: undefined } }, 'pricing-unaccepted'],
    ['an acceptance older than the window', { 'test-model': { ...UNIT_PRICE, acceptedForPaidRuns: { by: 'x', on: '2026-07-01' } } }, 'pricing-stale'],
    ['an acceptance dated in the future', { 'test-model': { ...UNIT_PRICE, acceptedForPaidRuns: { by: 'x', on: '2026-10-01' } } }, 'pricing-stale'],
    ['a non-finite rate', { 'test-model': { ...UNIT_PRICE, output: Number.NaN } }, 'pricing-invalid'],
    ['an acceptance without a name', { 'test-model': { ...UNIT_PRICE, acceptedForPaidRuns: { by: '', on: '2026-09-03' } } }, 'pricing-invalid'],
    ['a price without terms (flat rates alone are not a schedule)', { 'test-model': { ...UNIT_PRICE, terms: undefined } }, 'pricing-invalid'],
    ['a cache-write multiplier below one', { 'test-model': { ...UNIT_PRICE, terms: { ...FLAT_TERMS, cacheWriteMultiplier: 0.5 } } }, 'pricing-invalid'],
    ['a non-finite cache-write multiplier', { 'test-model': { ...UNIT_PRICE, terms: { ...FLAT_TERMS, cacheWriteMultiplier: Number.NaN } } }, 'pricing-invalid'],
    ['a long-context input multiplier below one', { 'test-model': { ...LUNA_LIKE, terms: { ...LUNA_LIKE.terms!, longContext: { aboveInputTokens: 272_000, inputMultiplier: 0.9, outputMultiplier: 1.5 } } } }, 'pricing-invalid'],
    ['a fractional long-context threshold', { 'test-model': { ...LUNA_LIKE, terms: { ...LUNA_LIKE.terms!, longContext: { aboveInputTokens: 272_000.5, inputMultiplier: 2, outputMultiplier: 1.5 } } } }, 'pricing-invalid'],
    ['a zero long-context threshold', { 'test-model': { ...LUNA_LIKE, terms: { ...LUNA_LIKE.terms!, longContext: { aboveInputTokens: 0, inputMultiplier: 2, outputMultiplier: 1.5 } } } }, 'pricing-invalid'],
    ['a string long-context term', { 'test-model': { ...LUNA_LIKE, terms: { ...LUNA_LIKE.terms!, longContext: 'unknown' as never } } }, 'pricing-invalid'],
    ['a cached rate above the uncached rate', { 'test-model': { ...UNIT_PRICE, cachedInput: 2 } }, 'pricing-invalid'],
  ])('refuses %s', (_label, table, code) => {
    const result = acceptedPrice('test-model', table, BOUNDS, NOW)
    expect(result.ok === false && result.code).toBe(code)
  })

  it('accepts the documented Luna-shaped schedule', () => {
    expect(acceptedPrice('luna-like', { 'luna-like': LUNA_LIKE }, BOUNDS, NOW).ok).toBe(true)
  })
})

describe('provider limit acceptance', () => {
  it('accepts a dated acceptance inside the window for the supported shape', () => {
    const result = acceptedLimit('test-model', { 'test-model': LIMIT }, BOUNDS, NOW)
    expect(result.ok && result.limit).toBe(LIMIT)
  })

  it.each<[string, Record<string, ProviderInputLimit>, string]>([
    ['an unknown model', {}, 'limit-unknown'],
    ['a limit without acceptance', { 'test-model': { ...LIMIT, acceptedForPaidRuns: undefined } }, 'limit-unaccepted'],
    ['an acceptance older than the window', { 'test-model': { ...LIMIT, acceptedForPaidRuns: { by: 'x', on: '2026-07-01' } } }, 'limit-stale'],
    ['an acceptance dated in the future', { 'test-model': { ...LIMIT, acceptedForPaidRuns: { by: 'x', on: '2026-10-01' } } }, 'limit-stale'],
    ['a fractional ceiling', { 'test-model': { ...LIMIT, maxInputTokens: 100_000.5 } }, 'limit-invalid'],
    ['a zero ceiling', { 'test-model': { ...LIMIT, maxInputTokens: 0 } }, 'limit-invalid'],
    ['an infinite ceiling', { 'test-model': { ...LIMIT, maxInputTokens: Number.POSITIVE_INFINITY } }, 'limit-invalid'],
    ['a string ceiling', { 'test-model': { ...LIMIT, maxInputTokens: '400000' as never } }, 'limit-invalid'],
    ['an empty source', { 'test-model': { ...LIMIT, source: ' ' } }, 'limit-invalid'],
    ['an empty evidence line', { 'test-model': { ...LIMIT, evidence: '' } }, 'limit-invalid'],
    ['an unreadable read date', { 'test-model': { ...LIMIT, readOn: 'yesterday' } }, 'limit-invalid'],
    ['another request shape', { 'test-model': { ...LIMIT, requestShape: 'chat-completions' as never } }, 'limit-shape'],
    ['an acceptance without a name', { 'test-model': { ...LIMIT, acceptedForPaidRuns: { by: '', on: '2026-09-03' } } }, 'limit-invalid'],
  ])('refuses %s', (_label, table, code) => {
    const result = acceptedLimit('test-model', table, BOUNDS, NOW)
    expect(result.ok === false && result.code).toBe(code)
  })
})

describe('reservation decisions', () => {
  const checked = { ok: true as const, bytes: 100, estimatedInputTokens: 100, reservedInputTokens: 6000, maxOutputTokens: 4000 }
  // 10,000 tokens at $1/M: each reservation is exactly $0.01.
  const decide = (ledger: LedgerDocument, overrides: Partial<Parameters<typeof decideReservation>[0]> = {}) =>
    decideReservation({
      ledger,
      bounds: BOUNDS,
      price: UNIT_PRICE,
      runId: 'run-b',
      unit: 'case-1',
      unitCalls: 0,
      halted: null,
      request: checked,
      model: 'test-model',
      entryId: 'run-b-1',
      now: NOW,
      ...overrides,
    })

  it('appends a reserved entry at the worst-case cost', () => {
    const decided = decide(ledgerWith([]))
    expect(decided.ok).toBe(true)
    if (!decided.ok) return
    expect(decided.entry).toEqual({
      id: 'run-b-1',
      runId: 'run-b',
      unit: 'case-1',
      model: 'test-model',
      reservedAt: NOW.toISOString(),
      state: 'reserved',
      reservedUsd: 0.01,
      reservedInputTokens: 6000,
      estimatedInputTokens: 100,
      maxOutputTokens: 4000,
    })
  })

  it('allows the exact aggregate boundary and refuses one micro-dollar past it', () => {
    const prior = entry({ id: 'p', runId: 'run-a', state: 'settled', settledUsd: 19.99, usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 } })
    expect(decide(ledgerWith([prior])).ok).toBe(true)
    const over = { ...prior, settledUsd: 19.990001 }
    const refused = decide(ledgerWith([over]))
    expect(refused.ok === false && refused.code).toBe('aggregate-exhausted')
  })

  it('counts reserved and ambiguous entries from earlier runs at their reservation', () => {
    const crashed = entry({ id: 'c', runId: 'run-a', state: 'reserved', reservedUsd: 10 })
    const failed = entry({ id: 'f', runId: 'run-a', state: 'ambiguous', reservedUsd: 9.99, note: 'timeout' })
    expect(ledgerTotals(ledgerWith([crashed, failed])).consumedUsd).toBe(19.99)
    expect(decide(ledgerWith([crashed, failed])).ok).toBe(true)
    const refused = decide(ledgerWith([crashed, { ...failed, reservedUsd: 9.990001 }]))
    expect(refused.ok === false && refused.code).toBe('aggregate-exhausted')
  })

  it('applies the per-run ceiling to this run only', () => {
    const thisRun = entry({ id: 'r', runId: 'run-b', state: 'ambiguous', reservedUsd: 1.99 })
    expect(decide(ledgerWith([thisRun])).ok).toBe(true)
    const refused = decide(ledgerWith([{ ...thisRun, reservedUsd: 1.990001 }]))
    expect(refused.ok === false && refused.code).toBe('run-exhausted')
    const otherRun = entry({ id: 'o', runId: 'run-a', state: 'ambiguous', reservedUsd: 1.999 })
    expect(decide(ledgerWith([otherRun])).ok).toBe(true)
  })

  it('refuses the fifth call of a unit, a missing unit, and a halted run', () => {
    expect(decide(ledgerWith([]), { unitCalls: 3 }).ok).toBe(true)
    const fifth = decide(ledgerWith([]), { unitCalls: 4 })
    expect(fifth.ok === false && fifth.code).toBe('unit-calls')
    const none = decide(ledgerWith([]), { unit: null })
    expect(none.ok === false && none.code).toBe('no-unit')
    const halted = decide(ledgerWith([]), { halted: 'entry x overran' })
    expect(halted.ok === false && halted.code).toBe('halted')
  })

  it('refuses a ledger carrying a persistent halt whatever the run state', () => {
    const halted = haltLedger(ledgerWith([]), { at: NOW.toISOString(), runId: 'run-a', entryId: 'run-a-1', reason: 'overran' })
    const refused = decide(halted)
    expect(refused.ok === false && refused.code).toBe('ledger-halted')
  })

  it('refuses when the cost arithmetic is not finite instead of reserving a nonsense figure', () => {
    const refused = decide(ledgerWith([]), { price: { ...UNIT_PRICE, input: Number.MAX_VALUE } })
    expect(refused.ok === false && refused.code).toBe('arithmetic-overflow')
    expect(() => reservationUsd({ ...UNIT_PRICE, input: Number.MAX_VALUE }, checked)).toThrow(/not finite/)
  })

  it('refuses a price whose terms are missing rather than reserving at flat rates', () => {
    const refused = decide(ledgerWith([]), { price: { ...UNIT_PRICE, terms: undefined } })
    expect(refused.ok === false && refused.code).toBe('pricing-invalid')
    expect(() => reservationUsd({ ...UNIT_PRICE, terms: undefined }, checked)).toThrow(/terms/)
  })
})

describe('documented schedule: long context and cache writes', () => {
  const ceiling = { ok: true as const, bytes: 100, estimatedInputTokens: 100, reservedInputTokens: 1_050_000, maxOutputTokens: 4000 }

  it('reserves the full ceiling at the worst applicable multipliers: $0.5322 for 1,050,000 input and 4000 output tokens', () => {
    // 1,050,000 x $0.20 x 2 (long context) x 1.25 (cache write) / 1M = $0.525; 4000 x $1.20 x 1.5 / 1M = $0.0072.
    expect(reservationUsd(LUNA_LIKE, ceiling)).toBe(0.5322)
  })

  it('applies no multiplier when the ceiling sits at or below the long-context threshold', () => {
    const atThreshold = { ...ceiling, reservedInputTokens: 272_000 }
    // 272,000 x $0.20 x 1.25 / 1M = $0.068; 4000 x $1.20 / 1M = $0.0048.
    expect(reservationUsd(LUNA_LIKE, atThreshold)).toBe(0.0728)
    const justAbove = { ...ceiling, reservedInputTokens: 272_001 }
    expect(reservationUsd(LUNA_LIKE, justAbove)).toBeGreaterThan(2 * 0.068)
  })

  it('settles every reported category at its documented rate and labels the basis as reported', () => {
    // 10,000 input: 4,000 cached, 1,000 cache writes, 5,000 plain; 1,000 output.
    const cost = usageCost(LUNA_LIKE, { inputTokens: 10_000, cachedInputTokens: 4_000, cacheWriteTokens: 1_000, outputTokens: 1_000 })
    const expected = (5_000 * 0.2 + 1_000 * 0.2 * 1.25 + 4_000 * 0.02 + 1_000 * 1.2) / 1e6
    expect(cost.usd).toBe(Math.round(expected * 1e6) / 1e6)
    expect(cost.basis).toBe('reported-categories')
  })

  it('charges every uncached token at the cache-write rate when the cache-write category is missing, as an upper estimate', () => {
    const cost = usageCost(LUNA_LIKE, { inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 1_000 })
    const expected = (6_000 * 0.2 * 1.25 + 4_000 * 0.02 + 1_000 * 1.2) / 1e6
    expect(cost.usd).toBe(Math.round(expected * 1e6) / 1e6)
    expect(cost.basis).toBe('upper-estimate')
    expect(cost.note).toMatch(/cache.write.*not reported/i)
    const reported = usageCost(LUNA_LIKE, { inputTokens: 10_000, cachedInputTokens: 4_000, cacheWriteTokens: 0, outputTokens: 1_000 })
    expect(reported.basis).toBe('reported-categories')
    expect(reported.usd).toBeLessThan(cost.usd)
  })

  it('never charges a reported cache write below the write rate even when the categories disagree', () => {
    // More cache writes than uncached tokens: the writes are charged in full, the plain remainder is zero.
    const cost = usageCost(LUNA_LIKE, { inputTokens: 1_000, cachedInputTokens: 800, cacheWriteTokens: 500, outputTokens: 0 })
    const expected = (500 * 0.2 * 1.25 + 800 * 0.02) / 1e6
    expect(cost.usd).toBe(Math.round(expected * 1e6) / 1e6)
  })

  it('bills the whole request at the long-context multipliers strictly above the threshold, cached and written input included', () => {
    const standard = usageCost(LUNA_LIKE, { inputTokens: 272_000, cachedInputTokens: 100_000, cacheWriteTokens: 2_000, outputTokens: 1_000 })
    const standardExpected = (170_000 * 0.2 + 2_000 * 0.2 * 1.25 + 100_000 * 0.02 + 1_000 * 1.2) / 1e6
    expect(standard.usd).toBe(Math.round(standardExpected * 1e6) / 1e6)
    expect(standard.note ?? '').not.toMatch(/long-context/)

    const long = usageCost(LUNA_LIKE, { inputTokens: 272_001, cachedInputTokens: 100_000, cacheWriteTokens: 2_000, outputTokens: 1_000 })
    const longExpected = ((170_001 * 0.2 + 2_000 * 0.2 * 1.25 + 100_000 * 0.02) * 2 + 1_000 * 1.2 * 1.5) / 1e6
    expect(long.usd).toBe(Math.round(longExpected * 1e6) / 1e6)
    expect(long.note).toMatch(/long-context/)
  })

  it('settles below the reservation without an overrun for a full-ceiling request under the same schedule', () => {
    const reserved = entry({ reservedUsd: 0.5322, reservedInputTokens: 1_050_000, maxOutputTokens: 4000 })
    const settled = settleEntry(reserved, { inputTokens: 1_050_000, cachedInputTokens: 0, outputTokens: 4000 }, LUNA_LIKE, NOW)
    expect(settled.settledUsd).toBe(0.5322)
    expect(settled.overrun).toBeNull()
    expect(settled.entry.settledBasis).toBe('upper-estimate')
  })

  it('flat terms reduce to the flat rates and a reported category the same as a missing one, apart from the label', () => {
    const missing = usageCost(UNIT_PRICE, { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 0 })
    const reported = usageCost(UNIT_PRICE, { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 300, outputTokens: 0 })
    expect(missing.usd).toBe(0.001)
    expect(reported.usd).toBe(0.001)
    expect([missing.basis, reported.basis]).toEqual(['upper-estimate', 'reported-categories'])
  })
})

describe('the shipped tables', () => {
  const READ = new Date('2026-09-05T12:00:00.000Z')

  it('accept gpt-5.6-luna alone, from the provider model page read on 2026-09-05', () => {
    const price = acceptedPrice('gpt-5.6-luna', MODEL_PRICES, PAID_CALL_BOUNDS, READ)
    expect(price.ok).toBe(true)
    if (!price.ok) return
    expect(price.price).toMatchObject({
      input: 0.2,
      cachedInput: 0.02,
      output: 1.2,
      terms: { longContext: { aboveInputTokens: 272_000, inputMultiplier: 2, outputMultiplier: 1.5 }, cacheWriteMultiplier: 1.25 },
      readOn: '2026-09-05',
      source: expect.stringContaining('developers.openai.com/api/docs/models/gpt-5.6-luna'),
    })
    expect(price.price.acceptedForPaidRuns?.by).not.toMatch(/jon/i)
    const limit = acceptedLimit('gpt-5.6-luna', MODEL_INPUT_LIMITS, PAID_CALL_BOUNDS, READ)
    expect(limit.ok).toBe(true)
    if (!limit.ok) return
    expect(limit.limit).toMatchObject({ maxInputTokens: 1_050_000, requestShape: SUPPORTED_REQUEST_SHAPE, readOn: '2026-09-05' })
    expect(limit.limit.evidence).toMatch(/400/)
    for (const other of ['gpt-5.6-terra', 'gpt-5.6-sol']) {
      expect(acceptedPrice(other, MODEL_PRICES, PAID_CALL_BOUNDS, READ).ok).toBe(false)
      const none = acceptedLimit(other, MODEL_INPUT_LIMITS, PAID_CALL_BOUNDS, READ)
      expect(none.ok === false && none.code).toBe('limit-unknown')
    }
  })

  it('reserve $0.5322 per Luna call at the shipped bounds and refuse the request once the acceptance window has passed', () => {
    const price = acceptedPrice('gpt-5.6-luna', MODEL_PRICES, PAID_CALL_BOUNDS, READ)
    const limit = acceptedLimit('gpt-5.6-luna', MODEL_INPUT_LIMITS, PAID_CALL_BOUNDS, READ)
    if (!price.ok || !limit.ok) throw new Error('expected both acceptances')
    const checked = checkRequest({ ...REQUEST, model: 'gpt-5.6-luna' }, PAID_CALL_BOUNDS, limit.limit)
    if (!checked.ok) throw new Error(checked.reason)
    expect(reservationUsd(price.price, checked)).toBe(0.5322)
    // Three ambiguous outcomes fit a $2 run; a fourth reservation does not.
    expect(4 * 0.5322).toBeGreaterThan(PAID_CALL_BOUNDS.perRunUsd)
    expect(3 * 0.5322 + 0.5322 > PAID_CALL_BOUNDS.perRunUsd && 3 * 0.5322 <= PAID_CALL_BOUNDS.perRunUsd).toBe(true)
    const later = new Date('2026-10-06T12:00:00.000Z')
    const stale = acceptedPrice('gpt-5.6-luna', MODEL_PRICES, PAID_CALL_BOUNDS, later)
    expect(stale.ok === false && stale.code).toBe('pricing-stale')
  })
})

describe('settlement', () => {
  it('settles at the reported usage below the reservation and flags nothing', () => {
    const reserved = entry({ reservedUsd: 0.01, reservedInputTokens: 6000, maxOutputTokens: 4000 })
    const usage = { inputTokens: 2500, cachedInputTokens: 500, cacheWriteTokens: 0, outputTokens: 900 }
    const settled = settleEntry(reserved, usage, UNIT_PRICE, NOW)
    expect(settled.overrun).toBeNull()
    expect(settled.settledUsd).toBe(0.0034)
    expect(settled.entry).toEqual({
      ...reserved,
      state: 'settled',
      settledUsd: 0.0034,
      settledAt: NOW.toISOString(),
      settledBasis: 'reported-categories',
      usage,
    })
  })

  it('records the upper-estimate basis and its note when the cache-write category is missing', () => {
    const reserved = entry({ reservedUsd: 0.01, reservedInputTokens: 6000, maxOutputTokens: 4000 })
    const settled = settleEntry(reserved, { inputTokens: 2500, cachedInputTokens: 500, outputTokens: 900 }, UNIT_PRICE, NOW)
    expect(settled.entry).toMatchObject({ state: 'settled', settledBasis: 'upper-estimate', settledNote: expect.stringMatching(/not reported/) })
    expect(settled.entry.usage).toEqual({ inputTokens: 2500, cachedInputTokens: 500, outputTokens: 900 })
  })

  it('prices cached input at the cached rate and never below zero', () => {
    const price = { ...UNIT_PRICE, input: 2, cachedInput: 0.2, output: 12 }
    expect(usageUsd(price, { inputTokens: 1000, cachedInputTokens: 400, cacheWriteTokens: 0, outputTokens: 100 })).toBeCloseTo((600 * 2 + 400 * 0.2 + 100 * 12) / 1e6, 9)
    expect(usageUsd(price, { inputTokens: 100, cachedInputTokens: 500, cacheWriteTokens: 0, outputTokens: 0 })).toBeCloseTo((100 * 0.2) / 1e6, 9)
  })

  it('records usage beyond the ceiling at its actual cost and flags the overrun', () => {
    const reserved = entry({ reservedUsd: 0.01, reservedInputTokens: 6000, maxOutputTokens: 4000 })
    const settled = settleEntry(reserved, { inputTokens: 9000, cachedInputTokens: 0, outputTokens: 4500 }, UNIT_PRICE, NOW)
    expect(settled.settledUsd).toBe(0.0135)
    expect(settled.entry.exceededReservation).toBe(true)
    expect(settled.overrun).toContain('9000 input tokens')
    expect(settled.overrun).toContain('4500 output tokens')
    expect(ledgerTotals(ledgerWith([settled.entry]))).toEqual({
      entries: 1,
      settled: 1,
      reserved: 0,
      ambiguous: 0,
      consumedUsd: 0.0135,
      overruns: 1,
    })
  })

  it('treats a usage block that is not three safe integers as invalid', () => {
    expect(validUsage({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 })).toBe(true)
    expect(validUsage({ inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 })).toBe(true)
    expect(validUsage({ inputTokens: 1.5, cachedInputTokens: 0, outputTokens: 1 })).toBe(false)
    expect(validUsage({ inputTokens: 2 ** 53, cachedInputTokens: 0, outputTokens: 1 })).toBe(false)
    expect(validUsage({ inputTokens: -1, cachedInputTokens: 0, outputTokens: 1 })).toBe(false)
    expect(validUsage({ inputTokens: '1', cachedInputTokens: 0, outputTokens: 1 })).toBe(false)
    expect(validUsage({ inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: '0', outputTokens: 1 })).toBe(false)
    expect(validUsage({ inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: -1, outputTokens: 1 })).toBe(false)
    expect(validUsage({ inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0.5, outputTokens: 1 })).toBe(false)
  })

  it('keeps an abandoned reservation as ambiguous spend and refuses to settle it twice', () => {
    const reserved = entry()
    const ambiguous = abandonEntry(reserved, 'status 429')
    expect(ambiguous).toEqual({ ...reserved, state: 'ambiguous', note: 'status 429' })
    expect(() => settleEntry(ambiguous, { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }, UNIT_PRICE, NOW)).toThrow(/ambiguous/)
    expect(() => abandonEntry(ambiguous, 'again')).toThrow(/ambiguous/)
  })
})

describe('ledger parsing', () => {
  it('round-trips an empty ledger, one with every entry state, and a halted one', () => {
    const settled = settleEntry(entry({ id: 's' }), { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }, UNIT_PRICE, NOW).entry
    const ledger = ledgerWith([entry({ id: 'r' }), abandonEntry(entry({ id: 'a' }), 'crash'), settled])
    const parsed = parseLedger(JSON.stringify(ledger))
    expect(parsed.ok && parsed.ledger).toEqual(ledger)
    const halted = haltLedger(ledger, { at: NOW.toISOString(), runId: 'run-a', entryId: 's', reason: 'overran' })
    const reparsed = parseLedger(JSON.stringify(halted))
    expect(reparsed.ok && reparsed.ledger).toEqual(halted)
    expect(reparsed.ok && reparsed.ledger.halt?.entryId).toBe('s')
  })

  it.each<[string, string]>([
    ['truncated JSON', '{"version":1,"entries":['],
    ['a bare array', '[]'],
    ['a future version', JSON.stringify({ ...emptyLedger(NOW, 't'), version: 2 })],
    ['a missing authorisation', JSON.stringify({ version: 1, createdAt: NOW.toISOString(), entries: [] })],
    ['an unknown entry state', JSON.stringify(ledgerWith([entry({ state: 'refunded' as never })]))],
    ['a negative reservation', JSON.stringify(ledgerWith([entry({ reservedUsd: -1 })]))],
    ['a string reservation', JSON.stringify(ledgerWith([entry({ reservedUsd: '0.5' as never })]))],
    ['a fractional reserved token count', JSON.stringify(ledgerWith([entry({ reservedInputTokens: 10.5 })]))],
    ['a settled entry without usage', JSON.stringify(ledgerWith([entry({ state: 'settled', settledUsd: 0.1 })]))],
    ['a settled entry without a settlement basis', JSON.stringify(ledgerWith([entry({ state: 'settled', settledUsd: 0.1, usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } })]))],
    ['a settled entry with an unknown settlement basis', JSON.stringify(ledgerWith([entry({ state: 'settled', settledUsd: 0.1, settledBasis: 'invoice' as never, usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } })]))],
    ['a reserved entry carrying settledUsd', JSON.stringify(ledgerWith([entry({ settledUsd: 0 })]))],
    ['a repeated entry id', JSON.stringify(ledgerWith([entry({ id: 'x' }), entry({ id: 'x' })]))],
    ['a halt that is not an object', JSON.stringify({ ...emptyLedger(NOW, 't'), halt: 'yes' })],
    ['a halt without a reason', JSON.stringify({ ...emptyLedger(NOW, 't'), halt: { at: NOW.toISOString(), runId: 'r', entryId: 'e' } })],
    ['a halt with an unreadable date', JSON.stringify({ ...emptyLedger(NOW, 't'), halt: { at: 'later', runId: 'r', entryId: 'e', reason: 'x' } })],
  ])('refuses %s as malformed', (_label, text) => {
    const parsed = parseLedger(text)
    expect(parsed.ok === false && parsed.code).toBe('ledger-malformed')
  })
})
