// The durable guard (#945). Boundary: openPaidCallGuard/initLedger/readLedger
// over a real ledger file in a temp directory. Invariants: nothing is
// dispatched or recorded past a refusal; a reservation is on disk before
// reserve returns; a reopened guard (a rerun, another worktree) sees every
// earlier entry, including reservations left by a crash, at their reserved
// amount; a settlement changes its own entry only; a malformed or missing
// file is refused and left byte-identical; a second opener is refused while
// the lock is held. Oracle: the ledger file's bytes reopened through the
// parser, not the guard's in-memory view.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseLedger, type BoundedResponsesRequest, type PaidCallBounds, type PaidCallPrice } from '../experiment/paidCallBudget.js'
import { defaultLedgerPath, initLedger, openPaidCallGuard, readLedger, type PaidCallGuard } from '../experiment/paidCallGuard.js'

const NOW = new Date('2026-09-04T12:00:00.000Z')
const BOUNDS: PaidCallBounds = {
  aggregateUsd: 20,
  perRunUsd: 2,
  maxCallsPerUnit: 4,
  maxOutputTokensPerCall: 4000,
  maxInputTokensPerCall: 200_000,
  inputTokensPerByte: 1.25,
  framingTokensPerItem: 64,
  pricingAcceptanceMaxAgeDays: 30,
}
const PRICES: Record<string, PaidCallPrice> = {
  'test-model': { input: 1, cachedInput: 1, output: 1, source: 'test', readOn: '2026-09-01', acceptedForPaidRuns: { by: 'test', on: '2026-09-03' } },
}
const REQUEST: BoundedResponsesRequest = {
  model: 'test-model',
  input: [{ role: 'user', content: 'hello' }],
  tools: [],
  max_output_tokens: 4000,
}

let directory: string
let ledgerPath: string
const guards: PaidCallGuard[] = []

function open(overrides: Parameters<typeof openPaidCallGuard>[0] = {}): PaidCallGuard {
  const guard = openPaidCallGuard({ ledgerPath, bounds: BOUNDS, prices: PRICES, now: () => NOW, ...overrides })
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
    const reservation = first.reserve(REQUEST, 0)
    expect(reservation.ok).toBe(true)
    if (!reservation.ok) return
    expect(ledgerOnDisk().entries).toEqual([
      expect.objectContaining({ id: 'run-1-1', runId: 'run-1', unit: 'case-a', state: 'reserved', reservedUsd: reservation.reservedUsd }),
    ])

    first.settle(reservation.id, { inputTokens: 100, cachedInputTokens: 0, outputTokens: 50 })
    expect(ledgerOnDisk().entries[0]).toMatchObject({ state: 'settled', settledUsd: 0.00015 })
    first.close()
    expect(existsSync(`${ledgerPath}.lock`)).toBe(false)

    const rerun = open({ runId: 'run-2' })
    const status = rerun.status()
    expect(status.aggregate).toEqual({ entries: 1, settled: 1, reserved: 0, ambiguous: 0, consumedUsd: 0.00015, overruns: 0 })
    expect(status.run.entries).toBe(0)
    expect(status.remainingAggregateUsd).toBe(19.99985)
    expect(status.remainingRunUsd).toBe(2)
  })

  it('keeps a reservation left by a crashed run and a settlement elsewhere cannot erase it', () => {
    initLedger(ledgerPath, 't', NOW)
    const crashed = open({ runId: 'crashed' })
    crashed.beginUnit('case-a')
    const left = crashed.reserve(REQUEST, 0)
    expect(left.ok).toBe(true)
    // Simulate the crash: no settle, no close; only the stale lock is cleared by hand.
    rmSync(`${ledgerPath}.lock`)
    guards.splice(0)

    const next = open({ runId: 'next' })
    next.beginUnit('case-b')
    const own = next.reserve(REQUEST, 0)
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
    const noUnit = guard.reserve(REQUEST, 0)
    expect(noUnit.ok === false && noUnit.code).toBe('no-unit')
    guard.beginUnit('case-a')
    const unknown = guard.reserve({ ...REQUEST, model: 'other-model' }, 0)
    expect(unknown.ok === false && unknown.code).toBe('pricing-unknown')
    const unbounded = guard.reserve({ ...REQUEST, input: [{ type: 'web_search_call' } as never] }, 0)
    expect(unbounded.ok === false && unbounded.code).toBe('input-unbounded')
    expect(readFileSync(ledgerPath, 'utf8')).toBe(before)
    expect(guard.status().unitCalls).toBe(0)
  })
})

describe('run-time ceilings through the guard', () => {
  it('refuses the fifth call of a unit and starts a fresh count for the next unit', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    guard.beginUnit('case-a')
    for (let call = 0; call < 4; call += 1) {
      const reservation = guard.reserve(REQUEST, 0)
      expect(reservation.ok).toBe(true)
      if (reservation.ok) guard.settle(reservation.id, { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 })
    }
    const fifth = guard.reserve(REQUEST, 0)
    expect(fifth.ok === false && fifth.code).toBe('unit-calls')
    guard.beginUnit('case-b')
    expect(guard.reserve(REQUEST, 0).ok).toBe(true)
    expect(ledgerOnDisk().entries).toHaveLength(5)
  })

  it('halts the run after usage beyond the reservation and keeps the actual cost', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    guard.beginUnit('case-a')
    const reservation = guard.reserve(REQUEST, 0)
    expect(reservation.ok).toBe(true)
    if (!reservation.ok) return
    guard.settle(reservation.id, { inputTokens: reservation.boundedInputTokens + 1, cachedInputTokens: 0, outputTokens: 4000 })
    const entry = ledgerOnDisk().entries[0]
    expect(entry.exceededReservation).toBe(true)
    expect(entry.settledUsd).toBe(Math.round((reservation.boundedInputTokens + 1 + 4000) * 1) / 1e6)
    const halted = guard.reserve(REQUEST, 0)
    expect(halted.ok === false && halted.code).toBe('halted')
    expect(guard.status().halted).toMatch(/input tokens reported against a bound/)
    expect(guard.status().aggregate.overruns).toBe(1)
  })

  it('keeps a reservation whose response had no usage block as ambiguous', () => {
    initLedger(ledgerPath, 't', NOW)
    const guard = open({ runId: 'r' })
    guard.beginUnit('case-a')
    const reservation = guard.reserve(REQUEST, 0)
    if (!reservation.ok) throw new Error(reservation.reason)
    guard.settle(reservation.id, undefined)
    expect(ledgerOnDisk().entries[0]).toMatchObject({ state: 'ambiguous', reservedUsd: reservation.reservedUsd })
    expect(guard.status().aggregate.consumedUsd).toBe(reservation.reservedUsd)
  })

  it('refuses past the aggregate ceiling using every earlier run', () => {
    initLedger(ledgerPath, 't', NOW)
    const spent = open({ runId: 'spent', bounds: { ...BOUNDS, perRunUsd: 20 } })
    spent.beginUnit('u')
    const big = spent.reserve(REQUEST, 0)
    if (!big.ok) throw new Error(big.reason)
    spent.settle(big.id, { inputTokens: 19_999_000, cachedInputTokens: 0, outputTokens: 0 })
    spent.close()

    const next = open({ runId: 'next' })
    next.beginUnit('u')
    const refused = next.reserve(REQUEST, 0)
    expect(refused.ok === false && refused.code).toBe('aggregate-exhausted')
    expect(next.status().remainingAggregateUsd).toBe(0.001)
    expect(ledgerOnDisk().entries).toHaveLength(1)
  })
})

describe('default ledger location', () => {
  it('prefers the explicit override, then XDG state, then the home state directory', () => {
    expect(defaultLedgerPath({ AGENT_HARNESS_LEDGER: '/tmp/x.json' })).toBe('/tmp/x.json')
    expect(defaultLedgerPath({ XDG_STATE_HOME: '/state' })).toBe('/state/pxlblz-ide/agent-harness-paid-calls.json')
    expect(defaultLedgerPath({})).toMatch(/\.local\/state\/pxlblz-ide\/agent-harness-paid-calls\.json$/)
  })
})
