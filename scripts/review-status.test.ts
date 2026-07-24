import { describe, expect, it } from 'vitest'
import { createApprovalReceipt } from './review-approvals'
import { describeApprovalStatus } from './review-status'

describe('review approval status (#598)', () => {
  it('distinguishes approved, missing, and stale-policy ranges', () => {
    const baseSha = 'a'.repeat(40)
    const tipSha = 'b'.repeat(40)
    const receipt = createApprovalReceipt({
      baseSha,
      tipSha,
      reviewer: 'Fable',
      effort: 'medium',
      decision: 'pass',
      policyFingerprint: 'policy-v1',
      promptVersion: 2,
      schemaVersion: 1,
      contextSha256: null,
      reviewedAt: '2026-07-24T12:00:00.000Z',
    })

    expect(describeApprovalStatus(
      baseSha,
      tipSha,
      [receipt],
      'policy-v1',
      () => true,
    )).toMatchObject({ state: 'approved', approvalCount: 1, staleCount: 0 })
    expect(describeApprovalStatus(
      baseSha,
      tipSha,
      [receipt],
      'policy-v2',
      () => true,
    )).toMatchObject({ state: 'stale', approvalCount: 0, staleCount: 1 })
    expect(describeApprovalStatus(
      baseSha,
      tipSha,
      [],
      'policy-v1',
      () => true,
    )).toMatchObject({ state: 'missing', approvalCount: 0, staleCount: 0 })
  })
})
