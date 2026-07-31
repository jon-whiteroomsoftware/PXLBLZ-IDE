import { describe, expect, it } from 'vitest'
import { createApprovalReceipt, type ReviewApprovalReceipt } from './review-approvals'
import {
  carryApprovalChainForward,
  filesAreDisjoint,
  findChainByPatchIds,
  parsePatchIdOutput,
  type RebasedCommit,
} from './review-carry'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)
const M1 = '1'.repeat(40)
const N1 = 'd'.repeat(40)
const N2 = 'e'.repeat(40)

function receipt(
  overrides: Partial<Parameters<typeof createApprovalReceipt>[0]> & {
    baseSha: string
    tipSha: string
  },
): ReviewApprovalReceipt {
  return createApprovalReceipt({
    reviewer: 'GPT-5.6 High',
    effort: 'high',
    decision: 'pass',
    policyFingerprint: 'policy-v1',
    promptVersion: 6,
    schemaVersion: 1,
    contextSha256: null,
    reviewedAt: '2026-07-31T12:00:00.000Z',
    ...overrides,
  })
}

describe('patch-id approval carry-forward (#637)', () => {
  it('parses git patch-id output in order and rejects malformed lines', () => {
    expect(parsePatchIdOutput(`p1 ${A}\np2 ${B}\n\n`)).toEqual([
      { sha: A, patchId: 'p1' },
      { sha: B, patchId: 'p2' },
    ])
    expect(parsePatchIdOutput('')).toEqual([])
    expect(() => parsePatchIdOutput('lonely-token')).toThrow(/malformed/i)
  })

  it('finds a receipt chain by concatenated patch-id sequence ending clean', () => {
    const first = receipt({ baseSha: A, tipSha: B, patchIds: ['p1', 'p2'] })
    const second = receipt({ baseSha: B, tipSha: C, patchIds: ['p3'] })
    const receipts = [first, second]

    expect(findChainByPatchIds(receipts, ['p1', 'p2', 'p3'], 'policy-v1'))
      .toEqual([first, second])
    expect(findChainByPatchIds(receipts, ['p1', 'p2'], 'policy-v1')).toEqual([first])
    expect(findChainByPatchIds(receipts, ['p1', 'p3'], 'policy-v1')).toBeNull()
    expect(findChainByPatchIds(receipts, ['p1', 'p2', 'p3'], 'policy-v2')).toBeNull()
    expect(findChainByPatchIds(receipts, [], 'policy-v1')).toBeNull()
    expect(findChainByPatchIds(
      [receipt({ baseSha: A, tipSha: B })],
      ['p1'],
      'policy-v1',
    )).toBeNull()
  })

  it('never returns a chain whose final edge is advisory', () => {
    const advisory = receipt({
      baseSha: A,
      tipSha: B,
      coverage: 'advisory',
      advisories: [{
        severity: 'P3',
        title: 'Pending follow-up',
        file: 'src/x.ts',
        line: 1,
        explanation: 'Corrective commit required.',
      }],
      patchIds: ['p1'],
    })
    const corrective = receipt({ baseSha: B, tipSha: C, patchIds: ['p2'] })

    expect(findChainByPatchIds([advisory], ['p1'], 'policy-v1')).toBeNull()
    expect(findChainByPatchIds([advisory, corrective], ['p1', 'p2'], 'policy-v1'))
      .toEqual([advisory, corrective])
  })

  it('treats overlapping intervening files as requiring re-review', () => {
    expect(filesAreDisjoint(['a.ts', 'b.ts'], ['c.ts'])).toBe(true)
    expect(filesAreDisjoint(['a.ts'], ['a.ts', 'z.ts'])).toBe(false)
    expect(filesAreDisjoint([], ['a.ts'])).toBe(true)
  })

  it('carries a clean single-receipt chain across a content-identical rebase', () => {
    const original = receipt({
      baseSha: A,
      tipSha: B,
      patchIds: ['p1', 'p2'],
    })
    const rebased: RebasedCommit[] = [
      { sha: N1, patchId: 'p1' },
      { sha: N2, patchId: 'p2' },
    ]

    const carried = carryApprovalChainForward({
      chain: [original],
      newBaseSha: M1,
      rebasedCommits: rebased,
      interveningFiles: ['src/other.ts'],
      stackFiles: ['scripts/push-review.ts'],
      carriedAt: '2026-07-31T13:00:00.000Z',
    })

    expect(carried).not.toBeNull()
    expect(carried).toHaveLength(1)
    expect(carried![0]).toMatchObject({
      baseSha: M1,
      tipSha: N2,
      reviewer: 'GPT-5.6 High',
      patchIds: ['p1', 'p2'],
      carriedFrom: { baseSha: A, tipSha: B, carriedAt: '2026-07-31T13:00:00.000Z' },
      reviewedAt: '2026-07-31T12:00:00.000Z',
    })
  })

  it('maps multi-receipt chains edge by edge, preserving advisory structure', () => {
    const advisory = receipt({
      baseSha: A,
      tipSha: B,
      coverage: 'advisory',
      advisories: [{
        severity: 'P2',
        title: 'Advisory finding',
        file: 'src/x.ts',
        line: 1,
        explanation: 'Needs a follow-up.',
      }],
      patchIds: ['p1'],
    })
    const corrective = receipt({ baseSha: B, tipSha: C, patchIds: ['p2'] })

    const carried = carryApprovalChainForward({
      chain: [advisory, corrective],
      newBaseSha: M1,
      rebasedCommits: [
        { sha: N1, patchId: 'p1' },
        { sha: N2, patchId: 'p2' },
      ],
      interveningFiles: ['src/other.ts'],
      stackFiles: ['src/x.ts'],
      carriedAt: '2026-07-31T13:00:00.000Z',
    })

    expect(carried).toHaveLength(2)
    expect(carried![0]).toMatchObject({
      baseSha: M1,
      tipSha: N1,
      coverage: 'advisory',
      patchIds: ['p1'],
    })
    expect(carried![0].advisories).toHaveLength(1)
    expect(carried![1]).toMatchObject({ baseSha: N1, tipSha: N2, patchIds: ['p2'] })
  })

  it('refuses to carry when content, order, count, files, or provenance disagree', () => {
    const original = receipt({ baseSha: A, tipSha: B, patchIds: ['p1', 'p2'] })
    const base = {
      chain: [original],
      newBaseSha: M1,
      rebasedCommits: [
        { sha: N1, patchId: 'p1' },
        { sha: N2, patchId: 'p2' },
      ],
      interveningFiles: ['src/other.ts'],
      stackFiles: ['scripts/push-review.ts'],
      carriedAt: '2026-07-31T13:00:00.000Z',
    }

    expect(carryApprovalChainForward({
      ...base,
      rebasedCommits: [{ sha: N1, patchId: 'p1' }, { sha: N2, patchId: 'DIFFERENT' }],
    })).toBeNull()
    expect(carryApprovalChainForward({
      ...base,
      rebasedCommits: [{ sha: N1, patchId: 'p2' }, { sha: N2, patchId: 'p1' }],
    })).toBeNull()
    expect(carryApprovalChainForward({
      ...base,
      rebasedCommits: [{ sha: N1, patchId: 'p1' }],
    })).toBeNull()
    expect(carryApprovalChainForward({
      ...base,
      interveningFiles: ['scripts/push-review.ts'],
    })).toBeNull()
    expect(carryApprovalChainForward({
      ...base,
      chain: [receipt({ baseSha: A, tipSha: B })],
    })).toBeNull()
    expect(carryApprovalChainForward({
      ...base,
      chain: [receipt({
        baseSha: A,
        tipSha: B,
        patchIds: ['p1', 'p2'],
        carriedFrom: {
          baseSha: 'f'.repeat(40),
          tipSha: '9'.repeat(40),
          carriedAt: '2026-07-30T12:00:00.000Z',
        },
      })],
    })).not.toBeNull()
  })

  it('carries already-carried receipts while preserving the original provenance root', () => {
    const carriedOnce = receipt({
      baseSha: A,
      tipSha: B,
      patchIds: ['p1'],
      carriedFrom: {
        baseSha: 'f'.repeat(40),
        tipSha: '9'.repeat(40),
        carriedAt: '2026-07-30T12:00:00.000Z',
      },
    })

    const carried = carryApprovalChainForward({
      chain: [carriedOnce],
      newBaseSha: M1,
      rebasedCommits: [{ sha: N1, patchId: 'p1' }],
      interveningFiles: [],
      stackFiles: ['src/x.ts'],
      carriedAt: '2026-07-31T13:00:00.000Z',
    })

    expect(carried![0].carriedFrom).toEqual({
      baseSha: 'f'.repeat(40),
      tipSha: '9'.repeat(40),
      carriedAt: '2026-07-31T13:00:00.000Z',
    })
  })
})
