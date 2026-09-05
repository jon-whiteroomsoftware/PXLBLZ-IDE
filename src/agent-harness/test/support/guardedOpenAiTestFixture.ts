// V2-authored for #945: a per-test OpenAI adapter fixture. It exercises the
// installed SDK through the supported injected fetch/sleep transport while a
// real paid-call guard records the dispatch in a temporary ledger. Nothing is
// mocked at module scope, so the node project's isolate:false module cache
// cannot replace the SDK used by another suite.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PAID_CALL_BOUNDS,
  SUPPORTED_REQUEST_SHAPE,
  type PaidCallPrice,
  type ProviderInputLimit,
} from '../../experiment/paidCallBudget.js'
import { initLedger, openPaidCallGuard, type PaidCallGuard } from '../../experiment/paidCallGuard.js'

const NOW = new Date('2026-09-05T12:00:00.000Z')
export const MOCKED_MODEL = 'mocked-model'

const PRICES: Record<string, PaidCallPrice> = {
  [MOCKED_MODEL]: {
    input: 1,
    cachedInput: 1,
    output: 1,
    terms: { longContext: 'none', cacheWriteMultiplier: 1 },
    source: 'test fixture',
    readOn: '2026-09-05',
    acceptedForPaidRuns: { by: 'test fixture', on: '2026-09-05' },
  },
}

const LIMITS: Record<string, ProviderInputLimit> = {
  [MOCKED_MODEL]: {
    maxInputTokens: 200_000,
    requestShape: SUPPORTED_REQUEST_SHAPE,
    source: 'test fixture',
    readOn: '2026-09-05',
    evidence: 'the injected transport never reaches the provider',
    acceptedForPaidRuns: { by: 'test fixture', on: '2026-09-05' },
  },
}

export type MockedResponse = (input: unknown[]) => { output: unknown[] }

export interface GuardedOpenAiTestFixture {
  queue: MockedResponse[]
  requests: unknown[][]
  sleeps: number[]
  budget: PaidCallGuard
  transport: {
    fetch: typeof fetch
    sleep: (ms: number) => Promise<void>
  }
  close: () => void
}

/** One explicit accounting unit, isolated ledger, and injected provider transport. */
export function createGuardedOpenAiTestFixture(unit = 'adapter-turn'): GuardedOpenAiTestFixture {
  const directory = mkdtempSync(join(tmpdir(), 'pxlblz-openai-adapter-test-'))
  const ledgerPath = join(directory, 'ledger.json')
  const initialized = initLedger(ledgerPath, 'test fixture', NOW)
  if (!initialized.ok) throw new Error(initialized.reason)
  const budget = openPaidCallGuard({
    ledgerPath,
    bounds: PAID_CALL_BOUNDS,
    prices: PRICES,
    limits: LIMITS,
    now: () => NOW,
    runId: 'adapter-test',
  })
  budget.beginUnit(unit)

  const queue: MockedResponse[] = []
  const requests: unknown[][] = []
  const sleeps: number[] = []
  let responseSequence = 0
  let closed = false
  const fetchImpl: typeof fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { input?: unknown[] }
    const next = queue.shift()
    if (!next) throw new Error('the injected OpenAI transport has no response left')
    const input = request.input ?? []
    requests.push([...input])
    responseSequence += 1
    return new Response(
      JSON.stringify({
        id: `resp_${responseSequence}`,
        object: 'response',
        created_at: 0,
        model: MOCKED_MODEL,
        status: 'completed',
        output: next(input).output,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 15,
        },
        service_tier: 'default',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  return {
    queue,
    requests,
    sleeps,
    budget,
    transport: {
      fetch: fetchImpl,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    },
    close: () => {
      if (closed) return
      closed = true
      budget.close()
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

export const functionCall = (id: string, name: string, args: Record<string, unknown>) => ({
  type: 'function_call',
  id: `fc_${id}`,
  call_id: id,
  name,
  arguments: JSON.stringify(args),
  status: 'completed',
})
