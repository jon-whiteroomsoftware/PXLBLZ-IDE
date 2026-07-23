import { describe, expect, it } from 'vitest'
import {
  FABLE_REVIEW_EFFORT,
  GPT_REVIEW_EFFORT,
  GPT_REVIEW_MODEL,
  REVIEW_TIMEOUT_MS,
  buildCodexReviewArgs,
  buildFableReviewArgs,
  buildReviewPrompt,
  parseClaudeReviewOutput,
  parseCodexReviewOutput,
  parsePrePushInput,
  reviewWithFallback,
  reviewRangesFromUpdates,
  type PushReviewResult,
} from './push-review'

describe('cross-agent push review gate (#63)', () => {
  it('uses Fable Medium with the fifteen-minute hard cap', () => {
    expect(FABLE_REVIEW_EFFORT).toBe('medium')
    expect(REVIEW_TIMEOUT_MS).toBe(15 * 60 * 1_000)
    const args = buildFableReviewArgs()
    expect(args).toContain('fable')
    expect(args).not.toContain('opus')
  })

  it('falls back to GPT-5.6 High when Fable cannot return a review', () => {
    const fallbackReview: PushReviewResult = {
      decision: 'pass',
      summary: 'Fallback review passed.',
      findings: [],
    }
    const result = reviewWithFallback(
      () => {
        throw new Error('Fable quota exhausted')
      },
      () => fallbackReview,
    )

    expect(GPT_REVIEW_MODEL).toBe('gpt-5.6-sol')
    expect(GPT_REVIEW_EFFORT).toBe('high')
    expect(result).toEqual({
      reviewer: 'GPT-5.6 High',
      review: fallbackReview,
      fallbackReason: 'Fable quota exhausted',
    })
  })

  it('announces the provider transition before GPT-5.6 High starts', () => {
    const events: string[] = []
    reviewWithFallback(
      () => {
        events.push('fable')
        throw new Error('Fable timed out')
      },
      () => {
        events.push('gpt')
        return { decision: 'pass', summary: 'Fallback passed.', findings: [] }
      },
      (reason) => events.push(`fallback: ${reason}`),
    )

    expect(events).toEqual([
      'fable',
      'fallback: Fable timed out',
      'gpt',
    ])
  })

  it('keeps a valid Fable failure authoritative', () => {
    const fableReview: PushReviewResult = {
      decision: 'fail',
      summary: 'A correctness bug was found.',
      findings: [{
        severity: 'P1',
        title: 'Broken invariant',
        file: 'src/example.ts',
        line: 12,
        explanation: 'The changed branch loses persisted state.',
      }],
    }
    let fallbackRuns = 0
    const result = reviewWithFallback(
      () => fableReview,
      () => {
        fallbackRuns += 1
        return { decision: 'pass', summary: 'Fallback passed.', findings: [] }
      },
    )

    expect(result).toEqual({ reviewer: 'Fable', review: fableReview })
    expect(fallbackRuns).toBe(0)
  })

  it('fails closed with both errors when neither reviewer can respond', () => {
    expect(() => reviewWithFallback(
      () => {
        throw new Error('Fable timed out')
      },
      () => {
        throw new Error('Codex authentication failed')
      },
    )).toThrow(/Fable unavailable: Fable timed out[\s\S]*GPT-5\.6 High fallback failed: Codex authentication failed/)
  })

  it('runs the fallback reviewer as ephemeral read-only GPT-5.6 High', () => {
    expect(buildCodexReviewArgs('/tmp/review.schema.json', '/tmp/review.output.json')).toEqual([
      'exec',
      '--model', 'gpt-5.6-sol',
      '--config', 'model_reasoning_effort="high"',
      '--sandbox', 'read-only',
      '--ephemeral',
      '--color', 'never',
      '--output-schema', '/tmp/review.schema.json',
      '--output-last-message', '/tmp/review.output.json',
      '-',
    ])
  })

  it('accepts the structured review emitted by the Codex fallback', () => {
    expect(parseCodexReviewOutput(JSON.stringify({
      decision: 'pass',
      summary: 'No correctness findings.',
      findings: [],
    }))).toEqual({
      decision: 'pass',
      summary: 'No correctness findings.',
      findings: [],
    })

    expect(() => parseCodexReviewOutput('{"decision":"maybe"}')).toThrow(/malformed/i)
  })

  it('parses the exact ref updates supplied by Git pre-push', () => {
    expect(parsePrePushInput([
      'refs/heads/main aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/main bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'refs/heads/topic cccccccccccccccccccccccccccccccccccccccc refs/heads/topic 0000000000000000000000000000000000000000',
    ].join('\n'))).toEqual([
      {
        localRef: 'refs/heads/main',
        localSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        remoteRef: 'refs/heads/main',
        remoteSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
      {
        localRef: 'refs/heads/topic',
        localSha: 'cccccccccccccccccccccccccccccccccccccccc',
        remoteRef: 'refs/heads/topic',
        remoteSha: '0000000000000000000000000000000000000000',
      },
    ])
  })

  it('reviews updated refs, skips deletions, and resolves new refs from a supplied base', () => {
    const updates = parsePrePushInput([
      'refs/heads/main aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/main bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'refs/heads/topic cccccccccccccccccccccccccccccccccccccccc refs/heads/topic 0000000000000000000000000000000000000000',
      'refs/heads/old 0000000000000000000000000000000000000000 refs/heads/old dddddddddddddddddddddddddddddddddddddddd',
    ].join('\n'))

    expect(reviewRangesFromUpdates(updates, () => 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')).toEqual([
      {
        label: 'refs/heads/main -> refs/heads/main',
        baseSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      {
        label: 'refs/heads/topic -> refs/heads/topic',
        baseSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        tipSha: 'cccccccccccccccccccccccccccccccccccccccc',
      },
    ])
  })

  it('requires structured reviewer output and preserves actionable findings', () => {
    const parsed = parseClaudeReviewOutput(JSON.stringify({
      type: 'result',
      subtype: 'success',
      structured_output: {
        decision: 'fail',
        summary: 'One correctness bug.',
        findings: [{
          severity: 'P1',
          title: 'Wrong boundary',
          file: 'src/example.ts',
          line: 42,
          explanation: 'The interval ends before its transition.',
        }],
      },
    }))

    expect(parsed.decision).toBe('fail')
    expect(parsed.findings[0]).toMatchObject({ severity: 'P1', line: 42 })
    expect(() => parseClaudeReviewOutput('{"type":"result","subtype":"error"}')).toThrow(/structured review output/i)
  })

  it('tells Fable to review only correctness and the exact outgoing ranges', () => {
    const prompt = buildReviewPrompt([{
      label: 'refs/heads/main -> refs/heads/main',
      baseSha: 'base',
      tipSha: 'tip',
    }])

    expect(prompt).toContain('git diff base tip')
    expect(prompt).toContain('correctness')
    expect(prompt).toContain('Do not flag style')
    expect(prompt).toContain('decision = "fail"')
    expect(prompt).toContain('untrusted data')
  })
})
