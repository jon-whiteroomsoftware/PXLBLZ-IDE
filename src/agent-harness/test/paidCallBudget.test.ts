// Pure budgeting rules (#945). Boundary: the exported decision functions of
// experiment/paidCallBudget.ts. Invariants: a refusal changes nothing; the
// reservation is the accepted provider ceiling priced uncached plus the
// output cap, never the request's estimate; the aggregate and run ceilings
// are inclusive at the exact reservation and exclusive one micro-dollar past
// it; ambiguous and still-reserved entries count at their reservation;
// settlement never produces NaN or a negative figure; usage beyond the
// ceiling is recorded at its actual cost, flagged, and halts the ledger; a
// request outside the supported shape is refused rather than estimated; a
// price or limit without a dated acceptance is refused; bounds that are not
// finite integers where integers are required are refused.
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
  parseLedger,
  reservationUsd,
  settleEntry,
  usageUsd,
  validateBounds,
  validUsage,
  type BoundedResponsesRequest,
  type LedgerDocument,
  type LedgerEntry,
  type PaidCallBounds,
  type PaidCallPrice,
  type ProviderInputLimit,
} from '../experiment/paidCallBudget.js'

const NOW = new Date('2026-09-04T12:00:00.000Z')

const BOUNDS: PaidCallBounds = {
  aggregateUsd: 20,
  perRunUsd: 2,
  maxCallsPerUnit: 4,
  maxOutputTokensPerCall: 4000,
  acceptanceMaxAgeDays: 30,
}

/** $1 per million on every rate: one token is one micro-dollar, so costs read directly. */
const UNIT_PRICE: PaidCallPrice = {
  input: 1,
  cachedInput: 1,
  output: 1,
  source: 'test',
  readOn: '2026-09-01',
  acceptedForPaidRuns: { by: 'test', on: '2026-09-03' },
}

/** A test ceiling of 100,000 input tokens: with the unit price a call reserves $0.104. */
const LIMIT: ProviderInputLimit = {
  maxInputTokens: 100_000,
  requestShape: 'responses-text-function-tools',
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
  ])('refuses %s', (_label, table, code) => {
    const result = acceptedPrice('test-model', table, BOUNDS, NOW)
    expect(result.ok === false && result.code).toBe(code)
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
})

describe('settlement', () => {
  it('settles at the reported usage below the reservation and flags nothing', () => {
    const reserved = entry({ reservedUsd: 0.01, reservedInputTokens: 6000, maxOutputTokens: 4000 })
    const usage = { inputTokens: 2500, cachedInputTokens: 500, outputTokens: 900 }
    const settled = settleEntry(reserved, usage, UNIT_PRICE, NOW)
    expect(settled.overrun).toBeNull()
    expect(settled.settledUsd).toBe(0.0034)
    expect(settled.entry).toEqual({
      ...reserved,
      state: 'settled',
      settledUsd: 0.0034,
      settledAt: NOW.toISOString(),
      usage,
    })
  })

  it('prices cached input at the cached rate and never below zero', () => {
    const price = { ...UNIT_PRICE, input: 2, cachedInput: 0.2, output: 12 }
    expect(usageUsd(price, { inputTokens: 1000, cachedInputTokens: 400, outputTokens: 100 })).toBeCloseTo((600 * 2 + 400 * 0.2 + 100 * 12) / 1e6, 9)
    expect(usageUsd(price, { inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 })).toBeCloseTo((100 * 0.2) / 1e6, 9)
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
    expect(validUsage({ inputTokens: 1.5, cachedInputTokens: 0, outputTokens: 1 })).toBe(false)
    expect(validUsage({ inputTokens: 2 ** 53, cachedInputTokens: 0, outputTokens: 1 })).toBe(false)
    expect(validUsage({ inputTokens: -1, cachedInputTokens: 0, outputTokens: 1 })).toBe(false)
    expect(validUsage({ inputTokens: '1', cachedInputTokens: 0, outputTokens: 1 })).toBe(false)
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
