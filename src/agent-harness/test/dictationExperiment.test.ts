// Provenance: pxlblz-v3 test/dictationExperiment.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { DICTATION_CASES } from '../experiment/cases.js'
import { caseSchema, evaluateAssertion, validateCorpus } from '../experiment/corpus.js'
import { dictationFixture } from '../experiment/fixtures.js'
import { buildReport, renderReport } from '../experiment/report.js'
import {
  createFakeAgent,
  runCase,
  scoreTranscript,
  type DictationTranscript,
} from '../experiment/runner.js'
import { mergeTurnTimings, summarizeCaseTiming } from '../experiment/timing.js'

// Test model (issue #23). Boundaries: the corpus loader and assertion
// evaluator, deterministic scoring over hand-written transcripts, and the
// full-corpus fake-agent run (report shape and determinism). The scoring
// function is the only thing replay mode calls, so its determinism here is
// replay's determinism.

describe('corpus (#23)', () => {
  it('loads, validates, and meets the required distribution', () => {
    expect(validateCorpus(DICTATION_CASES, dictationFixture)).toEqual([])
    expect(DICTATION_CASES.length).toBeGreaterThanOrEqual(30)

    const byOutcome = (outcome: string) =>
      DICTATION_CASES.filter((candidate) => candidate.expect.outcome === outcome)
    expect(byOutcome('ask').length).toBeGreaterThanOrEqual(3)
    expect(byOutcome('no-edit').length).toBeGreaterThanOrEqual(3)

    const families = new Set(DICTATION_CASES.map((candidate) => candidate.family))
    for (const family of ['clips', 'timeline', 'animation', 'junctions', 'layer-transitions', 'effects', 'structure']) {
      expect(families, `family ${family} missing`).toContain(family)
    }
    const referents = new Set(DICTATION_CASES.map((candidate) => candidate.referent))
    for (const referent of ['hover', 'selection', 'ordinal', 'time', 'pattern-name']) {
      expect(referents, `referent ${referent} missing`).toContain(referent)
    }
    expect(DICTATION_CASES.some((candidate) => candidate.id === 'animation-owner-example')).toBe(true)
  })

  it('rejects malformed cases', () => {
    const malformed = { ...DICTATION_CASES[0], family: 'nonsense' }
    expect(caseSchema.safeParse(malformed).success).toBe(false)
    const problems = validateCorpus(
      [malformed as never, DICTATION_CASES[0]],
      dictationFixture,
    )
    expect(problems.length).toBeGreaterThan(0)
  })

  it('evaluates each assertion kind against a document', () => {
    const show = dictationFixture('base')
    // The raw fixture opens to a composition through the session; assertion
    // evaluation projects it on demand, so the flat record suffices here.
    expect(evaluateAssertion(show, { kind: 'clip-count', count: 2 }).passed).toBe(true)
    expect(evaluateAssertion(show, { kind: 'clip-count', count: 5 }).passed).toBe(false)
    expect(evaluateAssertion(show, {
      kind: 'clip-duration', clip: { start_ms: 0 }, duration_ms: 30_000,
    }).passed).toBe(true)
    expect(evaluateAssertion(show, {
      kind: 'clip-duration', clip: { start_ms: 99 }, duration_ms: 1,
    }).passed).toBe(false)
    expect(evaluateAssertion(show, { kind: 'show-end', duration_ms: 60_000 }).passed).toBe(true)
    expect(evaluateAssertion(show, {
      kind: 'pointer-equals', pointer: '/name', value: 'Dictation fixture',
    }).passed).toBe(true)
    expect(evaluateAssertion(show, {
      kind: 'no-effect', clip: { start_ms: 0 }, effect_kind: 'vignette',
    }).passed).toBe(true)
  })
})

describe('scoring (#23)', () => {
  const editCase = DICTATION_CASES.find((candidate) => candidate.id === 'clips-resize-ordinal')!
  const askCase = DICTATION_CASES.find((candidate) => candidate.id === 'ambiguous-no-hover')!

  function transcriptFor(overrides: Partial<DictationTranscript>): DictationTranscript {
    return {
      caseId: editCase.id,
      agent: 'hand-written',
      events: [{ type: 'tool', tool: 'resize_clip', args: {}, result: {}, isError: false }],
      finalText: 'Done.',
      transactions: 1,
      genericUses: [],
      finalShow: dictationFixture('base'),
      ...overrides,
    }
  }

  it('scores a wrong edit as a failure with the assertion detail', () => {
    // The fixture is unedited, so the 12 s assertion fails.
    const score = scoreTranscript(editCase, transcriptFor({}))
    expect(score.outcome).toBe('edit')
    expect(score.firstTrySuccess).toBe(false)
    expect(score.failures.some((failure) => failure.includes('30000 ms'))).toBe(true)
  })

  it('scores extra transactions against the expectation', () => {
    const score = scoreTranscript(editCase, transcriptFor({ transactions: 3 }))
    expect(score.failures.some((failure) => failure.includes('3 transactions'))).toBe(true)
  })

  it('scores a missing ask and an unexpected refusal', () => {
    const askedNot = scoreTranscript(askCase, transcriptFor({
      caseId: askCase.id,
      transactions: 0,
      finalText: 'I refuse.',
    }))
    expect(askedNot.outcome).toBe('refuse')
    expect(askedNot.askedCorrectly).toBe(false)
    expect(askedNot.firstTrySuccess).toBe(false)

    const askedRight = scoreTranscript(askCase, transcriptFor({
      caseId: askCase.id,
      transactions: 0,
      finalText: 'Which clip do you mean?',
    }))
    expect(askedRight.outcome).toBe('ask')
    expect(askedRight.firstTrySuccess).toBe(true)

    const editedWhenAsking = scoreTranscript(askCase, transcriptFor({
      caseId: askCase.id,
      transactions: 1,
      finalText: 'Which clip do you mean?',
    }))
    expect(editedWhenAsking.outcome).toBe('edit')
    expect(editedWhenAsking.failures.length).toBeGreaterThan(0)
  })

  it('carries generic-operation use into the report', () => {
    const score = scoreTranscript(editCase, transcriptFor({
      genericUses: [{ operation: 'set_field', pointers: ['/name'], transaction: null }],
    }))
    const report = buildReport('hand-written', [score])
    expect(report.genericUse).toEqual([
      { caseId: editCase.id, operation: 'set_field', pointers: ['/name'] },
    ])
  })
})

describe('latency telemetry (#33)', () => {
  const editCase = DICTATION_CASES.find((candidate) => candidate.id === 'clips-resize-ordinal')!
  const timedTranscript = (overrides: Partial<DictationTranscript> = {}): DictationTranscript => ({
    caseId: editCase.id,
    agent: 'gpt-5.6-luna (high)',
    events: [{ type: 'tool', tool: 'resize_clip', args: {}, result: {}, isError: false }],
    finalText: 'Done.',
    transactions: 1,
    genericUses: [],
    finalShow: dictationFixture('base'),
    timing: {
      totalMs: 6_500,
      calls: [
        { ms: 3_000, toolCalls: 1, inputTokens: 20_000, cachedInputTokens: 15_000, outputTokens: 300, reasoningTokens: 200 },
        { ms: 2_500, toolCalls: 0, inputTokens: 21_000, cachedInputTokens: 20_000, outputTokens: 100, reasoningTokens: 50 },
      ],
      rateLimitWaitMs: 0,
      rateLimit: { requestsPerMinute: 500, tokensPerMinute: 500_000 },
    },
    ...overrides,
  })

  it('merges turn timings and summarizes a case', () => {
    const merged = mergeTurnTimings([
      { calls: [{ ms: 1_000, toolCalls: 1, inputTokens: 10, cachedInputTokens: 4, outputTokens: 2, reasoningTokens: 1 }], rateLimitWaitMs: 500 },
      { calls: [{ ms: 2_000, toolCalls: 0 }], rateLimitWaitMs: 0, rateLimit: { requestsPerMinute: 3 } },
    ], 4_000)
    expect(merged.calls.length).toBe(2)
    expect(merged.rateLimitWaitMs).toBe(500)
    expect(merged.rateLimit).toEqual({ requestsPerMinute: 3 })
    // Calls without usage count as zero tokens, never as NaN.
    expect(summarizeCaseTiming(merged)).toEqual({
      totalMs: 4_000, modelCalls: 2, inputTokens: 10, cachedInputTokens: 4, outputTokens: 2, reasoningTokens: 1, rateLimitWaitMs: 500,
    })
  })

  it('renders a Latency section with aggregates, tier, and cost for a timed run', () => {
    const score = scoreTranscript(editCase, timedTranscript())
    expect(score.timing).toEqual({
      totalMs: 6_500, modelCalls: 2, inputTokens: 41_000, cachedInputTokens: 35_000, outputTokens: 400, reasoningTokens: 250, rateLimitWaitMs: 0,
    })
    const report = buildReport('gpt-5.6-luna (high)', [score], { requestsPerMinute: 500, tokensPerMinute: 500_000 })
    expect(report.latency).toMatchObject({
      timedCases: 1,
      meanModelCallsPerCase: 2,
      maxModelCallsPerCase: 2,
      meanSecondsPerCase: 6.5,
      meanSecondsPerModelCall: 3.3,
      meanInputTokensPerCall: 20_500,
      cacheRatio: 0.854,
      rateLimit: { requestsPerMinute: 500, tokensPerMinute: 500_000 },
    })
    // 6,000 uncached input at $0.20/M + 35,000 cached at $0.02/M + 400 output at $1.20/M.
    expect(report.latency?.costUsd).toBe(0.0024)
    const markdown = renderReport(report)
    expect(markdown).toContain('## Latency and cost')
    expect(markdown).toContain('**2 model calls per case** (max 2), 6.5 s per case (max 6.5 s), 3.3 s per model call.')
    expect(markdown).toContain('| Cache ratio (cached / input) | 85% |')
    expect(markdown).toContain('| Rate tier (response headers) | 500 requests/min, 500000 tokens/min |')
    expect(markdown).toContain('| Run cost | $0.00 |')
  })

  it('names an unpriced model instead of costing it at zero', () => {
    const score = scoreTranscript(editCase, timedTranscript({ agent: 'gpt-9-nova (high)' }))
    const report = buildReport('gpt-9-nova (high)', [score])
    expect(report.latency?.costUsd).toBeNull()
    expect(renderReport(report)).toContain('price unknown')
  })

  it('aggregates over the timed subset of a mixed run', () => {
    const timed = scoreTranscript(editCase, timedTranscript())
    const untimed = scoreTranscript(editCase, timedTranscript({ timing: undefined }))
    const report = buildReport('gpt-5.6-luna (high)', [timed, untimed])
    expect(report.latency?.timedCases).toBe(1)
    expect(renderReport(report)).toContain('Over 1 timed case:')
  })

  it('leaves an untimed run without a latency block or section', () => {
    const score = scoreTranscript(editCase, timedTranscript({ timing: undefined }))
    expect('timing' in score).toBe(false)
    const report = buildReport('scripted-fake', [score])
    expect('latency' in report).toBe(false)
    expect(renderReport(report)).not.toContain('Latency')
  })

  // The V3 suite also replayed the recorded 2026-08-21-r4-multiturn run
  // byte-identically against its checked-in report. Those transcripts are
  // private model output that #945 forbids committing to V2, so that one
  // case was not transferred; the hand-written transcript cases above keep
  // scoring determinism covered (see src/agent-harness/PROVENANCE.md).
})

describe('full-corpus fake-agent run (#23)', () => {
  it('runs every case deterministically with a clean report', { timeout: 120_000 }, async () => {
    const runAll = async () => {
      const scores = []
      for (const dictationCase of DICTATION_CASES) {
        const transcript = await runCase(dictationCase, createFakeAgent())
        scores.push(scoreTranscript(dictationCase, transcript))
      }
      return buildReport('scripted-fake', scores)
    }
    const first = await runAll()
    const second = await runAll()

    expect(first.totals.cases).toBe(DICTATION_CASES.length)
    expect(first.totals.percent).toBe(100)
    expect(first.totals.asksCorrect).toBe(first.totals.asksExpected)
    expect(first.totals.refusalsCorrect).toBe(first.totals.refusalsExpected)
    // Trails has a specific operation now (#27); nothing needs the generics.
    expect(first.genericUse).toEqual([])
    // Determinism: two full runs produce identical reports, and the rendered
    // markdown is byte-identical.
    expect(second).toEqual(first)
    expect(renderReport(second)).toBe(renderReport(first))

    const families = Object.fromEntries(first.byFamily.map((stat) => [stat.group, stat.percent]))
    for (const family of Object.keys(families)) expect(families[family]).toBe(100)
  })
})
