import { describe, expect, it } from 'vitest'
import {
  buildReviewPrompt,
  parseClaudeReviewOutput,
  parsePrePushInput,
  reviewRangesFromUpdates,
} from './push-review'

describe('cross-agent push review gate (#63)', () => {
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
