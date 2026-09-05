// The durable guard (#945). Boundary: openPaidCallGuard/initLedger/readLedger
// over a real ledger file in a temp directory. Invariants: nothing is
// dispatched or recorded past a refusal; a reservation is on disk before
// reserve returns and is the accepted provider ceiling, whatever the request
// size; a reopened guard (a rerun, another worktree) sees every earlier
// entry, including reservations left by a crash, at their reserved amount;
// a settlement changes its own entry only; an overrun halts the ledger on
// disk and every later opener refuses until a human clears it; a malformed
// or missing file is refused and left byte-identical; a second opener is
// refused while the lock is held; bounds that are not finite integers where
// integers are required refuse at open. Oracle: the ledger file's bytes
// reopened through the parser, not the guard's in-memory view.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  parseLedger,
  SUPPORTED_REQUEST_SHAPE,
  type BoundedResponsesRequest,
  type PaidCallBounds,
  type PaidCallPrice,
  type ProviderInputLimit,
} from '../experiment/paidCallBudget.js'
import { defaultLedgerPath, initLedger, openPaidCallGuard, readLedger, type PaidCallGuard } from '../experiment/paidCallGuard.js'

const NOW = new Date('2026-09-04T12:00:00.000Z')
const BOUNDS: PaidCallBounds = {
  aggregateUsd: 20,
  perRunUsd: 2,
  maxCallsPerUnit: 4,
  maxOutputTokensPerCall: 4000,
  acceptanceMaxAgeDays: 30,
}
const PRICES: Record<string, PaidCallPrice> = {
  'test-model': {
    input: 1,
    cachedInput: 1,
    output: 1,
    terms: { longContext: 'none', cacheWriteMultiplier: 1 },
    source: 'test',
    readOn: '2026-09-01',
    acceptedForPaidRuns: { by: 'test', on: '2026-09-03' },
  },
}
/** 100,000-token ceiling at the unit price: every call reserves $0.104. */
const LIMITS: Record<string, ProviderInputLimit> = {
  'test-model': {
    maxInputTokens: 100_000,
    requestShape: SUPPORTED_REQUEST_SHAPE,
    source: 'test',
    readOn: '2026-09-01',
    evidence: 'test',
    acceptedForPaidRuns: { by: 'test', on: '2026-09-03' },
  },
}
const RESERVATION_USD = 0.104
const REQUEST: BoundedResponsesRequest = {
  model: 'test-model',
  input: [{ role: 'user', content: 'hello' }],
  tools: [],
  max_output_tokens: 4000,
  service_tier: 'default',
  truncation: 'disabled',
}

let directory: string
let ledgerPath: string
const guards: PaidCallGuard[] = []

function open(overrides: Parameters<typeof openPaidCallGuard>[0] = {}): PaidCallGuard {
  const guard = openPaidCallGuard({ ledgerPath, bounds: BOUNDS, prices: PRICES, limits: LIMITS, now: () => NOW, ...overrides })
  guards.push(guard)
  return guard
}

function ledgerOnDisk() {
  const parsed = parseLedger(readFileSync(ledgerPath, 'utf8'))
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.ledger
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'pxlblz-paid-call-ledger-'))
  ledgerPath = join(directory, 'nested', 'ledger.json')
})

afterEach(() => {
  for (const guard of guards.splice(0)) guard.close()
  rmSync(directory, { recursive: true, force: true })
})

describe('ledger creation and reopening', () => {
  it('refuses to open without a ledger and never creates one implicitly', () => {
    expect(() => open()).toThrow(/ledger-missing/)
    expect(existsSync(ledgerPath)).toBe(false)
    expect(existsSync(`${ledgerPath}.lock`)).toBe(false)
  })

  it('creates an empty ledger once and refuses to replace it', () => {
    expect(initLedger(ledgerPath, '#945 test', NOW)).toEqual({ ok: true })
    const first = readFileSync(ledgerPath, 'utf8')
    expect(ledgerOnDisk()).toEqual({ version: 1, createdAt: NOW.toISOString(), authorisation: '#945 test', entries: [] })
    const again = initLedger(ledgerPath, 'other', NOW)
    expect(again.ok === false && again.code).toBe('ledger-exists')
    expect(readFileSync(ledgerPath, 'utf8')).toBe(first)
  })

  it('writes the reservation before returning and the settlement after, and a rerun sees both', () => {
    initLedger(ledgerPath, 't', NOW)
    const first = open({ runId: 'run-1' })
    first.beginUnit('case-a')
    const reservation = first.reserve(REQUEST)
    expect(reservation.ok).toBe(true)
    if (!reservation.ok) return
    expect(reservation).toEqual({ ok: true, id: 'run-1-1', reservedUsd: RESERVATION_USD, reservedInputTokens: 100_000, estimatedInputTokens: expect.any(Number) })
    expect(ledgerOnDisk().entries).toEqual([
      expect.objectContaining({ id: 'run-1-1', runId: 'run-1', unit: 'case-a', state: 'reserved', reservedUsd: RESERVATION_USD, reservedInputTokens: 100_000 }),
    ])

    first.settle(reservation.id, { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 50 })
    expect(ledgerOnDisk().entries[0]).toMatchObject({ state: 'settled', settledUsd: 0.00015, settledBasis: 'reported-categories' })
    first.close()
    expect(existsSync(`${ledgerPath}.lock`)).toBe(false)

    const rerun = open({ runId: 'run-2' })
    const status = rerun.status()
    expect(status.aggregate).toEqual({ entries: 1, settled: 1, reserved: 0, ambiguous: 0, consumedUsd: 0.00015, overruns: 0 })
    expect(status.run.entries).toBe(0)
    expect(status.remainingAggregateUsd).toBe(19.99985)
    expect(status.remainingRunUsd).toBe(2)
    expect(status.ledgerHalt).toBeNull()
  })

  it('reserves the full accepted ceiling for a one-word request and a large one alike', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    guard.beginUnit('case-a')
    const small = guard.reserve(REQUEST)
    const large = guard.reserve({ ...REQUEST, input: [{ role: 'user', content: 'x'.repeat(50_000) }] })
    if (!small.ok || !large.ok) throw new Error('expected both reservations')
    expect(small.estimatedInputTokens).toBeLessThan(large.estimatedInputTokens)
    expect(ledgerOnDisk().entries.map((entry) => [entry.reservedUsd, entry.reservedInputTokens])).toEqual([
      [RESERVATION_USD, 100_000],
      [RESERVATION_USD, 100_000],
    ])
  })

  it('keeps a reservation left by a crashed run and a settlement elsewhere cannot erase it', () => {
    initLedger(ledgerPath, 't', NOW)
    const crashed = open({ runId: 'crashed' })
    crashed.beginUnit('case-a')
    const left = crashed.reserve(REQUEST)
    expect(left.ok).toBe(true)
    // Simulate the crash: no settle, no close; only the stale lock is cleared by hand.
    rmSync(`${ledgerPath}.lock`)
    guards.splice(0)

    const next = open({ runId: 'next' })
    next.beginUnit('case-b')
    const own = next.reserve(REQUEST)
    expect(own.ok).toBe(true)
    if (!own.ok || !left.ok) return
    next.settle(own.id, { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 })
    const entries = ledgerOnDisk().entries
    expect(entries.map((entry) => [entry.id, entry.state])).toEqual([
      ['crashed-1', 'reserved'],
      ['next-1', 'settled'],
    ])
    expect(next.status().aggregate.consumedUsd).toBe(Math.round((left.reservedUsd + 0.00002) * 1e6) / 1e6)
    // The stranger's reservation is not this run's to settle: it stays reserved.
    expect(() => next.settle(left.id, { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 })).toThrow(/belongs to run crashed/)
    expect(() => next.abandon(left.id, 'x')).toThrow(/belongs to run crashed/)
    expect(ledgerOnDisk().entries[0].state).toBe('reserved')
  })
})

describe('refusals leave the file alone', () => {
  it('refuses a malformed ledger without rewriting it', () => {
    const malformed = '{"version":1,"createdAt":"x","authorisation":"t","entries":[{"id":"a","state":"refunded"}]}\n'
    initLedger(ledgerPath, 't', NOW)
    writeFileSync(ledgerPath, malformed)
    expect(() => open()).toThrow(/ledger-malformed/)
    expect(readFileSync(ledgerPath, 'utf8')).toBe(malformed)
    expect(existsSync(`${ledgerPath}.lock`)).toBe(false)
    const read = readLedger(ledgerPath)
    expect(read.ok === false && read.code).toBe('ledger-malformed')
  })

  it('refuses a malformed halt record as malformed, never as a fresh start', () => {
    initLedger(ledgerPath, 't', NOW)
    const text = JSON.stringify({ ...ledgerOnDisk(), halt: { at: NOW.toISOString() } })
    writeFileSync(ledgerPath, text)
    expect(() => open()).toThrow(/ledger-malformed.*halt/)
    expect(readFileSync(ledgerPath, 'utf8')).toBe(text)
    expect(existsSync(`${ledgerPath}.lock`)).toBe(false)
  })

  it('refuses invalid bounds before touching the ledger', () => {
    initLedger(ledgerPath, 't', NOW)
    const before = readFileSync(ledgerPath, 'utf8')
    expect(() => open({ bounds: { ...BOUNDS, maxOutputTokensPerCall: 4000.5 } })).toThrow(/bounds-invalid.*maxOutputTokensPerCall/)
    expect(() => open({ bounds: { ...BOUNDS, aggregateUsd: Number.POSITIVE_INFINITY } })).toThrow(/bounds-invalid.*aggregateUsd/)
    expect(readFileSync(ledgerPath, 'utf8')).toBe(before)
    expect(existsSync(`${ledgerPath}.lock`)).toBe(false)
  })

  it('refuses a second opener while the lock is held and admits it after close', () => {
    initLedger(ledgerPath, 't', NOW)
    const holder = open({ runId: 'holder', pid: 4242 })
    expect(() => open({ runId: 'second' })).toThrow(/ledger-locked.*pid 4242/)
    expect(readFileSync(`${ledgerPath}.lock`, 'utf8')).toContain('pid 4242')
    holder.close()
    expect(() => open({ runId: 'second' })).not.toThrow()
  })

  it('records nothing for a refused reservation', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    const before = readFileSync(ledgerPath, 'utf8')
    const noUnit = guard.reserve(REQUEST)
    expect(noUnit.ok === false && noUnit.code).toBe('no-unit')
    guard.beginUnit('case-a')
    const unknown = guard.reserve({ ...REQUEST, model: 'other-model' })
    expect(unknown.ok === false && unknown.code).toBe('pricing-unknown')
    const unsupported = guard.reserve({ ...REQUEST, input: [{ type: 'web_search_call' } as never] })
    expect(unsupported.ok === false && unsupported.code).toBe('shape-unsupported')
    const autoTier = guard.reserve({ ...REQUEST, service_tier: 'auto' as never })
    expect(autoTier.ok === false && autoTier.code).toBe('shape-unsupported')
    expect(readFileSync(ledgerPath, 'utf8')).toBe(before)
    expect(guard.status().unitCalls).toBe(0)
    guard.close()
    guards.splice(0)
    const flatPrice = open({ runId: 'flat', prices: { 'test-model': { ...PRICES['test-model'], terms: undefined } } })
    flatPrice.beginUnit('case-a')
    const noTerms = flatPrice.reserve(REQUEST)
    expect(noTerms.ok === false && noTerms.code).toBe('pricing-invalid')
    expect(readFileSync(ledgerPath, 'utf8')).toBe(before)
  })

  it('refuses a model with an accepted price but no accepted provider ceiling', () => {
    initLedger(ledgerPath, 't', NOW)
    const before = readFileSync(ledgerPath, 'utf8')
    const none = open({ runId: 'none', limits: {} })
    none.beginUnit('case-a')
    const unknown = none.reserve(REQUEST)
    expect(unknown.ok === false && unknown.code).toBe('limit-unknown')
    none.close()
    guards.splice(0)
    const unaccepted = open({ runId: 'unaccepted', limits: { 'test-model': { ...LIMITS['test-model'], acceptedForPaidRuns: undefined } } })
    unaccepted.beginUnit('case-a')
    const refused = unaccepted.reserve(REQUEST)
    expect(refused.ok === false && refused.code).toBe('limit-unaccepted')
    expect(readFileSync(ledgerPath, 'utf8')).toBe(before)
  })
})

describe('run identity', () => {
  /** Leave one entry under run "r" in the given state, as a crash, a completed run or a failed call would. */
  function leaveEntry(state: 'reserved' | 'settled' | 'ambiguous'): void {
    initLedger(ledgerPath, 't', NOW)
    const run = open({ runId: 'r' })
    run.beginUnit('case-a')
    const reservation = run.reserve(REQUEST)
    if (!reservation.ok) throw new Error(reservation.reason)
    if (state === 'settled') run.settle(reservation.id, { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 10 })
    if (state === 'ambiguous') run.abandon(reservation.id, 'timeout')
    if (state === 'reserved') {
      // A crash: no settle, no close; the stale lock is cleared by hand.
      rmSync(`${ledgerPath}.lock`)
      guards.splice(0)
      return
    }
    run.close()
    guards.splice(0)
  }

  it.each<['reserved' | 'settled' | 'ambiguous']>([['reserved'], ['settled'], ['ambiguous']])(
    'refuses to reopen a run id that already has a %s entry, leaving the file and the lock alone',
    (state) => {
      leaveEntry(state)
      const before = readFileSync(ledgerPath, 'utf8')
      expect(() => open({ runId: 'r' })).toThrow(/run-id-reused.*"r".*r-1/)
      expect(readFileSync(ledgerPath, 'utf8')).toBe(before)
      expect(existsSync(`${ledgerPath}.lock`)).toBe(false)
      // The recorded entry is exactly as it was: never removed, never reduced.
      expect(ledgerOnDisk().entries).toEqual([expect.objectContaining({ id: 'r-1', runId: 'r', state })])
    },
  )

  it('never lets a reused run id settle or shadow the reservation a crashed run left', () => {
    leaveEntry('reserved')
    expect(() => open({ runId: 'r' })).toThrow(/run-id-reused/)
    const entries = ledgerOnDisk().entries
    expect(entries).toEqual([expect.objectContaining({ id: 'r-1', state: 'reserved', reservedUsd: RESERVATION_USD })])
    // The ledger still parses: one identity, one entry.
    expect(readLedger(ledgerPath).ok).toBe(true)
  })

  it('admits a fresh run id after the refusal and keeps every earlier entry at its recorded amount', () => {
    leaveEntry('reserved')
    expect(() => open({ runId: 'r' })).toThrow(/run-id-reused/)
    const next = open({ runId: 'r2' })
    next.beginUnit('case-b')
    const own = next.reserve(REQUEST)
    if (!own.ok) throw new Error(own.reason)
    expect(own.id).toBe('r2-1')
    next.settle(own.id, { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 10 })
    next.close()
    guards.splice(0)
    const ledger = ledgerOnDisk()
    expect(ledger.entries.map((entry) => [entry.id, entry.state])).toEqual([
      ['r-1', 'reserved'],
      ['r2-1', 'settled'],
    ])
    expect(ledger.halt).toBeUndefined()
    // A later run sees the crashed reservation plus the settled call, nothing reduced.
    const later = open({ runId: 'r3' })
    expect(later.status().aggregate).toMatchObject({ entries: 2, reserved: 1, settled: 1, consumedUsd: Math.round((RESERVATION_USD + 0.00002) * 1e6) / 1e6 })
    // And "r2" is now spent as an identity too.
    later.close()
    guards.splice(0)
    expect(() => open({ runId: 'r2' })).toThrow(/run-id-reused/)
  })
})

describe('run-time ceilings through the guard', () => {
  it('refuses the fifth call of a unit and starts a fresh count for the next unit', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    guard.beginUnit('case-a')
    for (let call = 0; call < 4; call += 1) {
      const reservation = guard.reserve(REQUEST)
      expect(reservation.ok).toBe(true)
      if (reservation.ok) guard.settle(reservation.id, { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 })
    }
    const fifth = guard.reserve(REQUEST)
    expect(fifth.ok === false && fifth.code).toBe('unit-calls')
    guard.beginUnit('case-b')
    expect(guard.reserve(REQUEST).ok).toBe(true)
    expect(ledgerOnDisk().entries).toHaveLength(5)
  })

  it('halts the ledger on disk after usage beyond the ceiling and refuses every later opener', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    guard.beginUnit('case-a')
    const reservation = guard.reserve(REQUEST)
    expect(reservation.ok).toBe(true)
    if (!reservation.ok) return
    guard.settle(reservation.id, { inputTokens: 100_001, cachedInputTokens: 0, outputTokens: 4000 })
    const ledger = ledgerOnDisk()
    expect(ledger.entries[0]).toMatchObject({ state: 'settled', settledUsd: 0.104001, exceededReservation: true })
    expect(ledger.halt).toEqual({ at: NOW.toISOString(), runId: 'r', entryId: 'r-1', reason: expect.stringMatching(/100001 input tokens reported against the 100000-token provider ceiling/) })
    const halted = guard.reserve(REQUEST)
    expect(halted.ok === false && halted.code).toBe('ledger-halted')
    expect(guard.status()).toMatchObject({ halted: expect.stringMatching(/input tokens/), ledgerHalt: ledger.halt, aggregate: { overruns: 1, consumedUsd: 0.104001 } })
    guard.close()
    guards.splice(0)

    const text = readFileSync(ledgerPath, 'utf8')
    expect(() => open({ runId: 'later' })).toThrow(/ledger-halted.*run r after entry r-1.*removes the "halt" field/)
    expect(readFileSync(ledgerPath, 'utf8')).toBe(text)
    expect(existsSync(`${ledgerPath}.lock`)).toBe(false)
    const read = readLedger(ledgerPath)
    expect(read.ok && read.ledger.halt?.entryId).toBe('r-1')
  })

  it('keeps a reservation whose response had no usage block as ambiguous', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    guard.beginUnit('case-a')
    const reservation = guard.reserve(REQUEST)
    if (!reservation.ok) throw new Error(reservation.reason)
    guard.settle(reservation.id, undefined)
    expect(ledgerOnDisk().entries[0]).toMatchObject({ state: 'ambiguous', reservedUsd: reservation.reservedUsd })
    expect(guard.status().aggregate.consumedUsd).toBe(reservation.reservedUsd)
  })

  it('keeps a reservation whose usage block is not integers as ambiguous', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    guard.beginUnit('case-a')
    const reservation = guard.reserve(REQUEST)
    if (!reservation.ok) throw new Error(reservation.reason)
    guard.settle(reservation.id, { inputTokens: 10.5, cachedInputTokens: 0, outputTokens: 1 })
    expect(ledgerOnDisk().entries[0]).toMatchObject({ state: 'ambiguous', note: expect.stringMatching(/no valid usage block/) })
    expect(ledgerOnDisk().halt).toBeUndefined()
  })

  it('settles a usage block without the cache-write category as an upper estimate, never as actual billing', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    guard.beginUnit('case-a')
    const reservation = guard.reserve(REQUEST)
    if (!reservation.ok) throw new Error(reservation.reason)
    guard.settle(reservation.id, { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10 })
    expect(ledgerOnDisk().entries[0]).toMatchObject({
      state: 'settled',
      settledUsd: 0.00011,
      settledBasis: 'upper-estimate',
      settledNote: expect.stringMatching(/cache.write.*not reported/i),
      usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10 },
    })
    expect(ledgerOnDisk().halt).toBeUndefined()
  })

  it('keeps the reservation and halts the ledger when the response reports a service tier other than the pinned default', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    guard.beginUnit('case-a')
    const reservation = guard.reserve(REQUEST)
    if (!reservation.ok) throw new Error(reservation.reason)
    guard.settle(reservation.id, { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 10 }, { serviceTier: 'priority' })
    const ledger = ledgerOnDisk()
    expect(ledger.entries[0]).toMatchObject({ state: 'ambiguous', reservedUsd: RESERVATION_USD, note: expect.stringMatching(/service_tier "priority".*pinned "default"/) })
    expect(ledger.entries[0].settledUsd).toBeUndefined()
    expect(ledger.halt).toMatchObject({ runId: 'r', entryId: 'r-1', reason: expect.stringMatching(/service_tier "priority"/) })
    const refused = guard.reserve(REQUEST)
    expect(refused.ok === false && refused.code).toBe('ledger-halted')
    guard.close()
    guards.splice(0)
    expect(() => open({ runId: 'later' })).toThrow(/ledger-halted.*service_tier/)
  })

  it('settles normally when the response echoes the default tier or omits the echo', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    guard.beginUnit('case-a')
    const first = guard.reserve(REQUEST)
    const second = guard.reserve(REQUEST)
    if (!first.ok || !second.ok) throw new Error('expected two reservations')
    guard.settle(first.id, { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 }, { serviceTier: 'default' })
    guard.settle(second.id, { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 }, { serviceTier: null })
    expect(ledgerOnDisk().entries.map((entry) => entry.state)).toEqual(['settled', 'settled'])
    expect(ledgerOnDisk().halt).toBeUndefined()
  })

  it('refuses past the aggregate ceiling using every earlier run', () => {
    initLedger(ledgerPath, 't', NOW)
    const wide = { 'test-model': { ...LIMITS['test-model'], maxInputTokens: 19_990_000 } }
    const spent = open({ runId: 'spent', bounds: { ...BOUNDS, perRunUsd: 20 }, limits: wide })
    spent.beginUnit('u')
    const big = spent.reserve(REQUEST)
    if (!big.ok) throw new Error(big.reason)
    expect(big.reservedUsd).toBe(19.994)
    spent.settle(big.id, { inputTokens: 19_990_000, cachedInputTokens: 0, outputTokens: 0 })
    spent.close()

    const next = open({ runId: 'next' })
    next.beginUnit('u')
    const refused = next.reserve(REQUEST)
    expect(refused.ok === false && refused.code).toBe('aggregate-exhausted')
    expect(next.status().remainingAggregateUsd).toBe(0.01)
    expect(ledgerOnDisk().entries).toHaveLength(1)
    expect(ledgerOnDisk().halt).toBeUndefined()
  })
})

describe('default ledger location', () => {
  it('prefers the explicit override, then XDG state, then the home state directory', () => {
    expect(defaultLedgerPath({ AGENT_HARNESS_LEDGER: '/tmp/x.json' })).toBe('/tmp/x.json')
    expect(defaultLedgerPath({ XDG_STATE_HOME: '/state' })).toBe('/state/pxlblz-ide/agent-harness-paid-calls.json')
    expect(defaultLedgerPath({})).toMatch(/\.local\/state\/pxlblz-ide\/agent-harness-paid-calls\.json$/)
  })
})
