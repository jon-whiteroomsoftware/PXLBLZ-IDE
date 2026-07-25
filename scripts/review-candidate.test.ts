import { describe, expect, it } from 'vitest'
import {
  approveCandidate,
  parseCandidateArgs,
  validateCandidateCheckout,
} from './review-candidate'

describe('candidate correctness review (#598)', () => {
  it('requires an explicit base and tip and accepts test-design context', () => {
    expect(parseCandidateArgs([
      'main',
      'codex/issue-598-review-receipts',
      '--test-design',
      '/tmp/issue-598-test-design.json',
    ])).toEqual({
      baseRef: 'main',
      tipRef: 'codex/issue-598-review-receipts',
      testDesignPath: '/tmp/issue-598-test-design.json',
    })
    expect(() => parseCandidateArgs(['main'])).toThrow(/base and tip/i)
    expect(() => parseCandidateArgs(['main', 'tip', '--unknown'])).toThrow(/unknown/i)
  })

  it('persists clean coverage for a pass and advisory coverage for P2/P3-only findings', () => {
    const saved: unknown[] = []
    const common = {
      range: {
        label: 'candidate',
        baseSha: 'a'.repeat(40),
        tipSha: 'b'.repeat(40),
      },
      policyFingerprint: 'policy-v1',
      promptVersion: 2,
      schemaVersion: 1,
      contextSha256: null,
      reviewedAt: '2026-07-24T12:00:00.000Z',
      saveReceipt: (receipt: unknown) => {
        saved.push(receipt)
        return '/git/review-approvals/receipt.json'
      },
    }

    expect(approveCandidate({
      ...common,
      execution: {
        reviewer: 'Opus 5 High',
        review: { decision: 'pass', summary: 'Safe.', findings: [] },
      },
    }).receiptPath).toContain('receipt.json')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      reviewer: 'Opus 5 High',
      effort: 'high',
    })

    expect(approveCandidate({
      ...common,
      execution: {
        reviewer: 'Opus 5 High',
        review: {
          decision: 'fail',
          summary: 'Localized defects.',
          findings: [{
            severity: 'P2',
            title: 'Unexpected resize',
            file: 'src/example.ts',
            line: 3,
            explanation: 'A move changes the stored size.',
          }, {
            severity: 'P3',
            title: 'Detached label',
            file: 'scripts/example.ts',
            line: null,
            explanation: 'The fallback label is ambiguous.',
          }],
        },
      },
    }).receiptPath).toContain('receipt.json')
    expect(saved).toHaveLength(2)
    expect(saved[1]).toMatchObject({
      coverage: 'advisory',
      advisories: [
        expect.objectContaining({ severity: 'P2', title: 'Unexpected resize' }),
        expect.objectContaining({ severity: 'P3', title: 'Detached label' }),
      ],
    })

    expect(approveCandidate({
      ...common,
      execution: {
        reviewer: 'Opus 5 High',
        review: {
          decision: 'fail',
          summary: 'Bug.',
          findings: [{
            severity: 'P1',
            title: 'Wrong boundary',
            file: 'src/example.ts',
            line: 1,
            explanation: 'Concrete failure.',
          }],
        },
      },
    }).receiptPath).toBeUndefined()
    expect(saved).toHaveLength(2)

    expect(approveCandidate({
      ...common,
      execution: {
        reviewer: 'GPT-5.6 High',
        review: {
          decision: 'pass',
          summary: 'Contradictory review.',
          findings: [{
            severity: 'P1',
            title: 'Reported despite pass',
            file: 'src/example.ts',
            line: 2,
            explanation: 'A pass cannot carry a correctness finding.',
          }],
        },
      },
    }).receiptPath).toBeUndefined()
    expect(saved).toHaveLength(2)
  })

  it('reviews only a clean candidate worktree checked out at the exact tip', () => {
    const baseSha = 'a'.repeat(40)
    const tipSha = 'b'.repeat(40)
    expect(() => validateCandidateCheckout({
      baseSha,
      tipSha,
      tipCommitSha: tipSha,
      headSha: tipSha,
      clean: true,
      hasMergeCommits: false,
      isAncestor: () => true,
    })).not.toThrow()
    expect(() => validateCandidateCheckout({
      baseSha,
      tipSha,
      tipCommitSha: tipSha,
      headSha: 'c'.repeat(40),
      clean: true,
      hasMergeCommits: false,
      isAncestor: () => true,
    })).toThrow(/checked-out HEAD/i)
    expect(() => validateCandidateCheckout({
      baseSha,
      tipSha,
      tipCommitSha: tipSha,
      headSha: tipSha,
      clean: false,
      hasMergeCommits: false,
      isAncestor: () => true,
    })).toThrow(/uncommitted/i)
    expect(() => validateCandidateCheckout({
      baseSha,
      tipSha,
      tipCommitSha: tipSha,
      headSha: tipSha,
      clean: true,
      hasMergeCommits: false,
      isAncestor: () => false,
    })).toThrow(/rebase/i)
    expect(() => validateCandidateCheckout({
      baseSha,
      tipSha,
      tipCommitSha: tipSha,
      headSha: tipSha,
      clean: true,
      hasMergeCommits: true,
      isAncestor: () => true,
    })).toThrow(/merge commit|linear/i)
    expect(() => validateCandidateCheckout({
      baseSha,
      tipSha: 'c'.repeat(40),
      tipCommitSha: tipSha,
      headSha: tipSha,
      clean: true,
      hasMergeCommits: false,
      isAncestor: () => true,
    })).not.toThrow()
  })
})
