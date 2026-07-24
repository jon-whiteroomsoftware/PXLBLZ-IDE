import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createApprovalReceipt,
  findApprovalChain,
  loadApprovalReceipts,
  type ReviewApprovalReceipt,
  writeApprovalReceipt,
} from './review-approvals'

function receipt(
  base: string,
  tip: string,
  policyFingerprint = 'policy-v1',
): ReviewApprovalReceipt {
  return createApprovalReceipt({
    baseSha: base,
    tipSha: tip,
    reviewer: 'Fable',
    effort: 'medium',
    decision: 'pass',
    policyFingerprint,
    promptVersion: 2,
    schemaVersion: 1,
    contextSha256: null,
    reviewedAt: '2026-07-24T12:00:00.000Z',
  })
}

describe('exact-range review approvals (#598)', () => {
  it('records the exact passed range, reviewer policy, and test-design context', () => {
    expect(createApprovalReceipt({
      baseSha: 'a'.repeat(40),
      tipSha: 'b'.repeat(40),
      reviewer: 'Opus 5 High',
      effort: 'high',
      decision: 'pass',
      policyFingerprint: 'policy-v1',
      promptVersion: 2,
      schemaVersion: 1,
      contextSha256: 'context-digest',
      reviewedAt: '2026-07-24T12:00:00.000Z',
    })).toEqual({
      receiptVersion: 1,
      baseSha: 'a'.repeat(40),
      tipSha: 'b'.repeat(40),
      reviewer: 'Opus 5 High',
      effort: 'high',
      decision: 'pass',
      policyFingerprint: 'policy-v1',
      promptVersion: 2,
      schemaVersion: 1,
      contextSha256: 'context-digest',
      reviewedAt: '2026-07-24T12:00:00.000Z',
    })
  })

  it('covers an outgoing range only through a contiguous approval chain', () => {
    const a = 'a'.repeat(40)
    const b = 'b'.repeat(40)
    const c = 'c'.repeat(40)
    const approvals = [receipt(a, b), receipt(b, c)]

    expect(findApprovalChain(a, c, approvals, 'policy-v1')).toEqual(approvals)
    expect(findApprovalChain(a, c, [approvals[1]], 'policy-v1')).toBeNull()
  })

  it('invalidates changed tips, changed policy, and non-ancestral receipts', () => {
    const a = 'a'.repeat(40)
    const b = 'b'.repeat(40)
    const c = 'c'.repeat(40)
    const approval = receipt(a, b)

    expect(findApprovalChain(a, c, [approval], 'policy-v1')).toBeNull()
    expect(findApprovalChain(a, b, [approval], 'policy-v2')).toBeNull()
    expect(findApprovalChain(
      a,
      b,
      [approval],
      'policy-v1',
      () => false,
    )).toBeNull()
  })

  it('writes receipts immutably and rejects conflicting replacement data', () => {
    const directory = mkdtempSync(join(tmpdir(), 'review-approvals-'))
    const approval = receipt('a'.repeat(40), 'b'.repeat(40))
    try {
      const path = writeApprovalReceipt(directory, approval)
      expect(writeApprovalReceipt(directory, approval)).toBe(path)
      expect(loadApprovalReceipts(directory)).toEqual([approval])
      expect(() => writeApprovalReceipt(directory, {
        ...approval,
        reviewedAt: '2026-07-24T13:00:00.000Z',
      })).toThrow(/immutable/i)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
