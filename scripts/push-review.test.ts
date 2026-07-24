import { describe, expect, it } from 'vitest'
import {
  approvalCoverageFromUpdates,
  CLAUDE_REVIEW_EFFORT,
  CLAUDE_REVIEW_MODEL,
  GPT_REVIEW_EFFORT,
  GPT_REVIEW_MODEL,
  REVIEW_TIMEOUT_MS,
  buildClaudeReviewArgs,
  buildCodexReviewArgs,
  buildReviewHistoryArgs,
  buildReviewPrompt,
  determineNewRefBase,
  formatReviewObjectPacket,
  parseClaudeReviewOutput,
  parseCodexReviewOutput,
  parsePrePushInput,
  parseReviewTestDesignContext,
  rangeHasChanges,
  reviewWithFallback,
  reviewRangesFromUpdates,
  type PushReviewResult,
} from './push-review'
import { createApprovalReceipt } from './review-approvals'

describe('cross-agent push review gate (#63)', () => {
  it('uses Opus 5 High with the fifteen-minute hard cap', () => {
    expect(CLAUDE_REVIEW_MODEL).toBe('opus')
    expect(CLAUDE_REVIEW_EFFORT).toBe('high')
    expect(REVIEW_TIMEOUT_MS).toBe(15 * 60 * 1_000)
    expect(buildClaudeReviewArgs()).toEqual([
      '-p',
      '--safe-mode',
      '--model', 'opus',
      '--effort', 'high',
      '--permission-mode', 'dontAsk',
      '--no-session-persistence',
      '--tools', 'Read,Grep,Glob',
      '--allowedTools',
      'Read',
      'Grep',
      'Glob',
      '--output-format', 'json',
      '--json-schema', expect.any(String),
    ])
  })

  it('falls back to GPT-5.6 High when Opus 5 High cannot return a review', () => {
    const fallbackReview: PushReviewResult = {
      decision: 'pass',
      summary: 'Fallback review passed.',
      findings: [],
    }
    const result = reviewWithFallback(
      () => {
        throw new Error('Opus quota exhausted')
      },
      () => fallbackReview,
    )

    expect(GPT_REVIEW_MODEL).toBe('gpt-5.6-sol')
    expect(GPT_REVIEW_EFFORT).toBe('high')
    expect(result).toEqual({
      reviewer: 'GPT-5.6 High',
      review: fallbackReview,
      fallbackReason: 'Opus quota exhausted',
    })
  })

  it('announces the provider transition before GPT-5.6 High starts', () => {
    const events: string[] = []
    reviewWithFallback(
      () => {
        events.push('opus')
        throw new Error('Opus timed out')
      },
      () => {
        events.push('gpt')
        return { decision: 'pass', summary: 'Fallback passed.', findings: [] }
      },
      (reason) => events.push(`fallback: ${reason}`),
    )

    expect(events).toEqual([
      'opus',
      'fallback: Opus timed out',
      'gpt',
    ])
  })

  it('keeps a valid Opus 5 High failure authoritative', () => {
    const opusReview: PushReviewResult = {
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
      () => opusReview,
      () => {
        fallbackRuns += 1
        return { decision: 'pass', summary: 'Fallback passed.', findings: [] }
      },
    )

    expect(result).toEqual({ reviewer: 'Opus 5 High', review: opusReview })
    expect(fallbackRuns).toBe(0)
  })

  it('fails closed with both errors when neither reviewer can respond', () => {
    expect(() => reviewWithFallback(
      () => {
        throw new Error('Opus timed out')
      },
      () => {
        throw new Error('Codex authentication failed')
      },
    )).toThrow(/Opus 5 High unavailable: Opus timed out[\s\S]*GPT-5\.6 High fallback failed: Codex authentication failed/)
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
    expect(() => parseCodexReviewOutput(JSON.stringify({
      decision: 'pass',
      summary: 'Contradictory pass.',
      findings: [{
        severity: 'P1',
        title: 'Still broken',
        file: 'src/example.ts',
        line: 1,
        explanation: 'A pass cannot contain this finding.',
      }],
    }))).toThrow(/pass.*findings|findings.*pass/i)
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

  it('treats every changed commit identity as reviewable even when endpoint trees match', () => {
    const same = 'a'.repeat(40)
    expect(rangeHasChanges({
      label: 'no ref change',
      baseSha: same,
      tipSha: same,
    })).toBe(false)
    expect(rangeHasChanges({
      label: 'empty commit or reverted history',
      baseSha: same,
      tipSha: 'b'.repeat(40),
    })).toBe(true)
  })

  it('includes each intermediate commit patch in the exact review packet', () => {
    expect(buildReviewHistoryArgs({
      label: 'candidate',
      baseSha: 'base',
      tipSha: 'tip',
    })).toEqual([
      'log',
      '--reverse',
      '--format=fuller',
      '--patch',
      '--diff-merges=first-parent',
      '--no-ext-diff',
      '--unified=80',
      'base..tip',
      '--',
    ])
  })

  it('includes annotated-tag identity and metadata in the exact review packet', () => {
    const tagSha = 'a'.repeat(40)
    const tagBody = [
      `object ${'b'.repeat(40)}`,
      'type commit',
      'tag v1.0.0',
      'tagger Test <test@example.com> 0 +0000',
      '',
      'Release v1.0.0',
    ].join('\n')

    expect(formatReviewObjectPacket(tagSha, 'tag', tagBody)).toContain(
      `<ref-object sha="${tagSha}" type="tag">`,
    )
    expect(formatReviewObjectPacket(tagSha, 'tag', tagBody)).toContain(
      'Release v1.0.0',
    )
    expect(formatReviewObjectPacket(
      'b'.repeat(40),
      'commit',
    )).toContain('type="commit"')
  })

  it('fails closed when a new ref has no remote-main ancestry base', () => {
    const update = {
      localRef: 'refs/heads/main',
      localSha: 'a'.repeat(40),
      remoteRef: 'refs/heads/main',
      remoteSha: '0'.repeat(40),
    }
    const calls: string[][] = []
    expect(() => determineNewRefBase(
      update,
      'origin',
      (...args) => {
        calls.push(args)
        throw new Error('origin/main does not exist')
      },
    )).toThrow(/cannot determine.*origin\/main/i)
    expect(calls).toEqual([[update.localSha, 'origin/main']])
  })

  it('requires complete approval coverage for every changed outgoing ref', () => {
    const a = 'a'.repeat(40)
    const b = 'b'.repeat(40)
    const c = 'c'.repeat(40)
    const d = 'd'.repeat(40)
    const zero = '0'.repeat(40)
    const receipts = [
      createApprovalReceipt({
        baseSha: a,
        tipSha: b,
        reviewer: 'Fable',
        effort: 'medium',
        decision: 'pass',
        policyFingerprint: 'policy-v1',
        promptVersion: 2,
        schemaVersion: 1,
        contextSha256: null,
        reviewedAt: '2026-07-24T12:00:00.000Z',
      }),
      createApprovalReceipt({
        baseSha: b,
        tipSha: c,
        reviewer: 'GPT-5.6 High',
        effort: 'high',
        decision: 'pass',
        policyFingerprint: 'policy-v1',
        promptVersion: 2,
        schemaVersion: 1,
        contextSha256: null,
        reviewedAt: '2026-07-24T12:05:00.000Z',
      }),
    ]
    const coverage = approvalCoverageFromUpdates(
      parsePrePushInput([
        `refs/heads/main ${c} refs/heads/main ${a}`,
        `refs/heads/topic ${d} refs/heads/topic ${zero}`,
        `refs/heads/old ${zero} refs/heads/old ${a}`,
        `refs/heads/no-change ${b} refs/heads/no-change ${b}`,
      ].join('\n')),
      () => b,
      receipts,
      'policy-v1',
      () => true,
      (range) => range.baseSha !== range.tipSha,
    )

    expect(coverage).toHaveLength(2)
    expect(coverage[0].chain).toEqual(receipts)
    expect(coverage[1]).toMatchObject({
      range: { baseSha: b, tipSha: d },
      chain: null,
    })
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

  it('tells Opus to review only correctness and the exact outgoing ranges', () => {
    const prompt = buildReviewPrompt([{
      label: 'refs/heads/main -> refs/heads/main',
      baseSha: 'base',
      tipSha: 'tip',
    }])

    expect(prompt).toContain('git log --reverse --patch base..tip')
    expect(prompt).toContain('correctness')
    expect(prompt).toContain('Do not flag style')
    expect(prompt).toContain('decision = "fail"')
    expect(prompt).toContain('untrusted data')
  })

  it('carries the systemic test model into the candidate review packet', () => {
    const prompt = buildReviewPrompt([{
      label: 'candidate',
      baseSha: 'base',
      tipSha: 'tip',
    }], {
      invariants: ['Approved commits remain byte-identical through landing.'],
      partitions: ['single receipt', 'contiguous chain', 'missing approval'],
      sequences: ['review A-B, review B-C, then push A-C'],
      oracles: ['the exact outgoing range has complete approval coverage'],
      residualGaps: ['remote history can advance before publication'],
    })

    expect(prompt).toContain('Approved commits remain byte-identical through landing.')
    expect(prompt).toContain('single receipt')
    expect(prompt).toContain('review A-B, review B-C, then push A-C')
    expect(prompt).toContain('exact outgoing range has complete approval coverage')
    expect(prompt).toContain('remote history can advance before publication')
    expect(prompt).toContain('<systematic-test-design-context>')
  })

  it('fails closed on incomplete systematic test-design context', () => {
    const context = {
      invariants: ['History remains immutable.'],
      partitions: ['covered', 'missing'],
      sequences: ['review then land'],
      oracles: ['coverage reaches the exact tip'],
      residualGaps: [],
    }
    expect(parseReviewTestDesignContext(context)).toEqual(context)
    expect(() => parseReviewTestDesignContext({
      invariants: ['History remains immutable.'],
    })).toThrow(/test-design context/i)
  })
})
