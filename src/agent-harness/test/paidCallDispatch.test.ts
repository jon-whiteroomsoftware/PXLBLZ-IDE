// The guard at the real dispatch boundary (#945). Boundary: the OpenAI
// adapter as the two public paths use it, the corpus runner (runCorpus, the
// CLI's loop) and the bridge (startBridge + POST /utterance), with the
// SDK's network replaced by a fetch spy that answers in the Responses API
// shape. Oracles: the number of HTTP requests the spy saw (a refusal means
// zero further requests, SDK retries included), the request bodies it saw
// (the pinned output cap, function tools only, the reserved model), the
// ledger file reopened through the parser (every reservation is the accepted
// provider ceiling, never the request's size), and the refusal as each
// public path surfaces it. No credential is read: OPENAI_API_KEY is a stub
// the spy never records.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseBridgeEvents, startBridge } from '../bridge/service.js'
import { DICTATION_CASES } from '../experiment/cases.js'
import { runCorpus } from '../experiment/cli.js'
import { dictationFixture } from '../experiment/fixtures.js'
import { createOpenAiAgent } from '../experiment/openaiAgent.js'
import {
  parseLedger,
  PAID_CALL_BOUNDS,
  SUPPORTED_REQUEST_SHAPE,
  type PaidCallBounds,
  type PaidCallPrice,
  type ProviderInputLimit,
} from '../experiment/paidCallBudget.js'
import { initLedger, openPaidCallGuard, type PaidCallGuard } from '../experiment/paidCallGuard.js'
import { MODEL_PRICES } from '../experiment/pricing.js'
import { MODEL_INPUT_LIMITS } from '../experiment/providerLimits.js'

const NOW = new Date('2026-09-04T12:00:00.000Z')
const MODEL = 'test-model'
/** $1 per million on every rate: a token is a micro-dollar. */
const PRICES: Record<string, PaidCallPrice> = {
  [MODEL]: { input: 1, cachedInput: 1, output: 1, source: 'test', readOn: '2026-09-01', acceptedForPaidRuns: { by: 'test', on: '2026-09-03' } },
}
/** A 200,000-token accepted ceiling: every call reserves $0.204 at the unit price. The real first request is about 97 KB, and the four-call case feeds tool output back, so a smaller ceiling would trip the size refusal instead. */
const LIMITS: Record<string, ProviderInputLimit> = {
  [MODEL]: {
    maxInputTokens: 200_000,
    requestShape: SUPPORTED_REQUEST_SHAPE,
    source: 'test',
    readOn: '2026-09-01',
    evidence: 'test',
    acceptedForPaidRuns: { by: 'test', on: '2026-09-03' },
  },
}
const RESERVATION_USD = 0.204
const USAGE = { input_tokens: 3000, input_tokens_details: { cached_tokens: 1000 }, output_tokens: 200, output_tokens_details: { reasoning_tokens: 100 }, total_tokens: 3200 }
/** $0.0032 at the unit price. */
const USAGE_USD = 0.0032

type Reply =
  | { text: string; usage?: typeof USAGE }
  | { call: string; args: Record<string, unknown>; usage?: typeof USAGE }
  | { status: 429 }

interface Spy {
  fetch: typeof fetch
  requests: Array<Record<string, unknown>>
  sleeps: number[]
}

/** A fetch that answers each request from the script, in order, in the Responses API shape. */
function responsesSpy(script: Reply[]): Spy {
  const requests: Array<Record<string, unknown>> = []
  let index = 0
  const fetchImpl: typeof fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    const reply = script[Math.min(index, script.length - 1)]
    index += 1
    if ('status' in reply) {
      return new Response(JSON.stringify({ error: { message: 'Rate limit reached. Please try again in 1s.', type: 'requests', code: 'rate_limit_exceeded' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    }
    const output =
      'text' in reply
        ? [{ type: 'message', id: `msg_${index}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: reply.text, annotations: [] }] }]
        : [{ type: 'function_call', id: `fc_${index}`, call_id: `call_${index}`, name: reply.call, arguments: JSON.stringify(reply.args), status: 'completed' }]
    const body = { id: `resp_${index}`, object: 'response', created_at: 0, model: MODEL, status: 'completed', output, usage: reply.usage ?? USAGE }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-limit-requests': '500', 'x-ratelimit-limit-tokens': '30000' },
    })
  }
  return { fetch: fetchImpl, requests, sleeps: [] }
}

let directory: string
let ledgerPath: string
let outDir: string
const guards: PaidCallGuard[] = []

function guardWith(
  overrides: { bounds?: Partial<PaidCallBounds>; prices?: Record<string, PaidCallPrice>; limits?: Record<string, ProviderInputLimit>; runId?: string } = {},
): PaidCallGuard {
  const guard = openPaidCallGuard({
    ledgerPath,
    bounds: { ...PAID_CALL_BOUNDS, ...overrides.bounds },
    prices: overrides.prices ?? PRICES,
    limits: overrides.limits ?? LIMITS,
    now: () => NOW,
    runId: overrides.runId ?? 'run-under-test',
  })
  guards.push(guard)
  return guard
}

function liveAgent(guard: PaidCallGuard, spy: Spy, model = MODEL) {
  return createOpenAiAgent({
    model,
    reasoningEffort: 'high',
    budget: guard,
    transport: {
      fetch: spy.fetch,
      sleep: async (ms) => {
        spy.sleeps.push(ms)
      },
    },
  })
}

function ledgerOnDisk() {
  const parsed = parseLedger(readFileSync(ledgerPath, 'utf8'))
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.ledger
}
const ledgerEntries = () => ledgerOnDisk().entries

const ONE_CASE = [DICTATION_CASES[0]]

beforeAll(() => {
  vi.stubEnv('OPENAI_API_KEY', 'sk-test-stub-never-sent-anywhere')
})
afterAll(() => {
  vi.unstubAllEnvs()
})
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'pxlblz-paid-call-dispatch-'))
  ledgerPath = join(directory, 'ledger.json')
  outDir = join(directory, 'out')
  initLedger(ledgerPath, 'test', NOW)
})
afterEach(() => {
  for (const guard of guards.splice(0)) guard.close()
  rmSync(directory, { recursive: true, force: true })
})

describe('corpus path (runCorpus, the CLI loop)', () => {
  it('refuses before any request when the model price is not accepted for paid runs', async () => {
    const spy = responsesSpy([{ text: 'done' }])
    const guard = guardWith({ prices: MODEL_PRICES })
    const result = await runCorpus({ cases: DICTATION_CASES.slice(0, 2), agent: liveAgent(guard, spy, 'gpt-5.6-luna'), outDir, guard, log: () => {} })

    expect(spy.requests).toHaveLength(0)
    expect(ledgerEntries()).toHaveLength(0)
    expect(result.report.totals.cases).toBe(0)
    expect(result.unmeasured.map((entry) => entry.caseId)).toEqual(DICTATION_CASES.slice(0, 2).map((entry) => entry.id))
    expect(result.unmeasured[0].reason).toMatch(/pricing-unaccepted/)
    expect(result.unmeasured[1].reason).toMatch(/not attempted after the refusal/)
    expect(JSON.parse(readFileSync(join(outDir, 'budget.json'), 'utf8'))).toMatchObject({ ledgerPath, unmeasured: result.unmeasured })
  })

  it('refuses before any request when no provider ceiling is accepted, price accepted or not', async () => {
    const spy = responsesSpy([{ text: 'done' }])
    // The shipped table: no ceiling for any model.
    const shipped = guardWith({ limits: MODEL_INPUT_LIMITS })
    const none = await runCorpus({ cases: ONE_CASE, agent: liveAgent(shipped, spy), outDir, guard: shipped, log: () => {} })
    expect(spy.requests).toHaveLength(0)
    expect(none.unmeasured[0].reason).toMatch(/limit-unknown.*no provider input-token ceiling is recorded for model "test-model"/)
    shipped.close()
    guards.splice(0)

    // A recorded but unaccepted ceiling is no better.
    const unaccepted = guardWith({ limits: { [MODEL]: { ...LIMITS[MODEL], acceptedForPaidRuns: undefined } }, runId: 'run-2' })
    const refused = await runCorpus({ cases: ONE_CASE, agent: liveAgent(unaccepted, spy), outDir, guard: unaccepted, log: () => {} })
    expect(spy.requests).toHaveLength(0)
    expect(refused.unmeasured[0].reason).toMatch(/limit-unaccepted/)
    expect(ledgerEntries()).toHaveLength(0)
  })

  it('reserves the full ceiling before the request, pins the request shape, and settles at reported usage', async () => {
    const spy = responsesSpy([{ text: 'I cannot do that.' }])
    const guard = guardWith()
    const result = await runCorpus({ cases: ONE_CASE, agent: liveAgent(guard, spy), outDir, guard, log: () => {} })

    expect(spy.requests).toHaveLength(1)
    const body = spy.requests[0]
    expect(body.model).toBe(MODEL)
    expect(body.max_output_tokens).toBe(4000)
    expect(body.reasoning).toEqual({ effort: 'high' })
    expect(body).not.toHaveProperty('previous_response_id')
    expect((body.tools as Array<{ type: string }>).every((tool) => tool.type === 'function')).toBe(true)
    expect((body.tools as Array<{ name: string }>).map((tool) => tool.name)).toContain('resize_clip')

    const entries = ledgerEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      runId: 'run-under-test',
      unit: ONE_CASE[0].id,
      model: MODEL,
      state: 'settled',
      reservedUsd: RESERVATION_USD,
      reservedInputTokens: 200_000,
      settledUsd: USAGE_USD,
      usage: { inputTokens: 3000, cachedInputTokens: 1000, outputTokens: 200 },
    })
    // The real first request (tool schemas, projection, prompt) is tens of
    // kilobytes; its estimate is recorded but the ceiling is what was reserved.
    expect(entries[0].estimatedInputTokens).toBeGreaterThan(50_000)
    expect(entries[0].estimatedInputTokens).toBeLessThan(entries[0].reservedInputTokens)
    expect(result.unmeasured).toEqual([])
    expect(result.report.totals.cases).toBe(1)
    expect(result.budget?.aggregate.consumedUsd).toBe(USAGE_USD)
    expect(result.report.cases[0].timing?.modelCalls).toBe(1)
  })

  it('stops a case at four model calls, each reserved at the same full ceiling', async () => {
    const spy = responsesSpy([{ call: 'describe_show', args: { session_id: 'show-1' } }])
    const guard = guardWith()
    const result = await runCorpus({ cases: ONE_CASE, agent: liveAgent(guard, spy), outDir, guard, log: () => {} })

    expect(spy.requests).toHaveLength(4)
    const entries = ledgerEntries()
    expect(entries.map((entry) => entry.state)).toEqual(['settled', 'settled', 'settled', 'settled'])
    expect(result.unmeasured).toEqual([{ caseId: ONE_CASE[0].id, reason: expect.stringMatching(/unit-calls.*4 of 4/) }])
    expect(result.budget?.aggregate.consumedUsd).toBe(4 * USAGE_USD)
    // The fed-back items grew the request each call; the reservation did not move.
    const estimates = entries.map((entry) => entry.estimatedInputTokens)
    expect(estimates[1]).toBeGreaterThan(estimates[0])
    expect(estimates[3]).toBeGreaterThan(estimates[2])
    expect(entries.map((entry) => entry.reservedUsd)).toEqual([RESERVATION_USD, RESERVATION_USD, RESERVATION_USD, RESERVATION_USD])
  })

  it('reserves a 429 retry separately at the full ceiling and keeps the failed attempt as ambiguous spend', async () => {
    const spy = responsesSpy([{ status: 429 }, { text: 'done' }])
    const guard = guardWith()
    await runCorpus({ cases: ONE_CASE, agent: liveAgent(guard, spy), outDir, guard, log: () => {} })

    expect(spy.requests).toHaveLength(2)
    expect(spy.sleeps).toEqual([2000])
    const entries = ledgerEntries()
    expect(entries.map((entry) => [entry.state, entry.reservedUsd])).toEqual([
      ['ambiguous', RESERVATION_USD],
      ['settled', RESERVATION_USD],
    ])
    expect(entries[0].note).toMatch(/status 429/)
    expect(guard.status().aggregate.consumedUsd).toBe(Math.round((RESERVATION_USD + USAGE_USD) * 1e6) / 1e6)
  })

  it('refuses the retry itself when the run cannot absorb another full reservation', async () => {
    const spy = responsesSpy([{ status: 429 }, { text: 'done' }])
    // Room for exactly one worst case: the first attempt fits, its retry does not.
    const guard = guardWith({ bounds: { perRunUsd: RESERVATION_USD } })
    const result = await runCorpus({ cases: ONE_CASE, agent: liveAgent(guard, spy), outDir, guard, log: () => {} })

    expect(spy.requests).toHaveLength(1)
    expect(ledgerEntries().map((entry) => entry.state)).toEqual(['ambiguous'])
    expect(result.unmeasured[0].reason).toMatch(/run-exhausted/)
  })

  it('halts the ledger after usage beyond the ceiling, keeps the actual cost, and refuses the next run at open', async () => {
    const overrun = { ...USAGE, input_tokens: 5_000_000, input_tokens_details: { cached_tokens: 0 }, total_tokens: 5_000_200 }
    const spy = responsesSpy([{ call: 'describe_show', args: { session_id: 'show-1' }, usage: overrun }, { text: 'done' }])
    const guard = guardWith({ bounds: { perRunUsd: 20 } })
    const result = await runCorpus({ cases: ONE_CASE, agent: liveAgent(guard, spy), outDir, guard, log: () => {} })

    expect(spy.requests).toHaveLength(1)
    const ledger = ledgerOnDisk()
    expect(ledger.entries).toHaveLength(1)
    expect(ledger.entries[0]).toMatchObject({ state: 'settled', settledUsd: 5.0002, exceededReservation: true })
    expect(ledger.halt).toMatchObject({ runId: 'run-under-test', entryId: 'run-under-test-1', reason: expect.stringMatching(/5000000 input tokens reported against the 200000-token provider ceiling/) })
    expect(result.unmeasured[0].reason).toMatch(/ledger-halted.*input tokens reported against/)
    expect(result.budget).toMatchObject({ halted: expect.stringMatching(/input tokens/), aggregate: { overruns: 1, consumedUsd: 5.0002 } })
    expect(JSON.parse(readFileSync(join(outDir, 'budget.json'), 'utf8')).ledgerHalt).toMatchObject({ entryId: 'run-under-test-1' })
    guard.close()
    guards.splice(0)

    // The next run, however configured, is refused before a credential or a request.
    expect(() => guardWith({ runId: 'run-2', bounds: { aggregateUsd: 1000, perRunUsd: 1000 } })).toThrow(/ledger-halted.*removes the "halt" field/)
    expect(spy.requests).toHaveLength(1)
    expect(ledgerOnDisk()).toEqual(ledger)
  })
})

describe('bridge path (startBridge + POST /utterance)', () => {
  async function utter(url: string, utterance: string) {
    const response = await fetch(`${url}/utterance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show: dictationFixture('base'), utterance, context: {} }),
    })
    const done = parseBridgeEvents(await response.text()).find((event) => event.kind === 'done')
    if (!done || done.kind !== 'done') throw new Error('no done event')
    return done
  }

  it('accounts each utterance as its own unit and refuses the turn that no longer fits', async () => {
    const spy = responsesSpy([{ text: 'Nothing to do.' }])
    // Two full reservations fit in $0.45; a third would not.
    const guard = guardWith({ bounds: { aggregateUsd: 20, perRunUsd: 0.45 } })
    const bridge = await startBridge({ agent: liveAgent(guard, spy), guard, port: 0, log: () => {} })
    try {
      const first = await utter(bridge.url, 'first')
      const second = await utter(bridge.url, 'second')
      expect(first.reply).toBe('Nothing to do.')
      expect(second.changed).toBe(false)
      expect(spy.requests).toHaveLength(2)
      expect(ledgerEntries().map((entry) => [entry.unit, entry.state, entry.reservedUsd])).toEqual([
        ['bridge-turn-1', 'settled', RESERVATION_USD],
        ['bridge-turn-2', 'settled', RESERVATION_USD],
      ])
      expect(guard.status().run.consumedUsd).toBe(2 * USAGE_USD)
    } finally {
      await bridge.close()
    }

    guard.close()
    guards.splice(0)
    const exhausted = guardWith({ bounds: { aggregateUsd: 2 * USAGE_USD }, runId: 'run-2' })
    const again = await startBridge({ agent: liveAgent(exhausted, spy), guard: exhausted, port: 0, log: () => {} })
    try {
      const third = await utter(again.url, 'third')
      expect(third.reply).toMatch(/paid call refused \(aggregate-exhausted\)/)
      expect(third.changed).toBe(false)
      expect(spy.requests).toHaveLength(2)
      expect(ledgerEntries()).toHaveLength(2)
    } finally {
      await again.close()
    }
  })
})
