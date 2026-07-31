import { describe, expect, it } from 'vitest'
import { createApprovalReceipt } from './review-approvals'
import { describeApprovalStatus, formatReceiptLine } from './review-status'

describe('review approval status (#598)', () => {
  it('surfaces cross-family coverage, loud same-family downgrades, and unverified legacy receipts (#637)', () => {
    const base = {
      baseSha: 'a'.repeat(40),
      tipSha: 'b'.repeat(40),
      effort: 'high' as const,
      decision: 'pass' as const,
      policyFingerprint: 'policy-v1',
      promptVersion: 6,
      schemaVersion: 1,
      contextSha256: null,
      reviewedAt: '2026-07-31T12:00:00.000Z',
    }

    expect(formatReceiptLine(createApprovalReceipt({
      ...base,
      reviewer: 'GPT-5.6 High',
      authoredModels: ['claude-fable-5'],
      crossFamily: true,
    }))).toBe(
      `  ${'a'.repeat(12)}..${'b'.repeat(12)} GPT-5.6 High high clean cross-family`
      + ' authored-by claude-fable-5 2026-07-31T12:00:00.000Z',
    )
    expect(formatReceiptLine(createApprovalReceipt({
      ...base,
      reviewer: 'Opus 5 High',
      authoredModels: ['claude-fable-5'],
      crossFamily: false,
    }))).toContain('SAME-FAMILY')
    expect(formatReceiptLine(createApprovalReceipt({
      ...base,
      reviewer: 'Opus 5 High',
    }))).toContain('family-unverified')
  })

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

  it('does not classify a missing range as stale because of an unrelated old receipt', () => {
    const baseSha = 'a'.repeat(40)
    const tipSha = 'b'.repeat(40)
    const unrelated = createApprovalReceipt({
      baseSha: 'c'.repeat(40),
      tipSha: 'd'.repeat(40),
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
      [unrelated],
      'policy-v2',
      (ancestor, descendant) => (
        ancestor === descendant
        || (ancestor === baseSha && descendant === tipSha)
      ),
    )).toMatchObject({ state: 'missing', approvalCount: 0, staleCount: 0 })
  })

  it('recognizes an exact stale chain assembled under multiple superseded policies', () => {
    const a = 'a'.repeat(40)
    const b = 'b'.repeat(40)
    const c = 'c'.repeat(40)
    const makeReceipt = (baseSha: string, tipSha: string, policyFingerprint: string) =>
      createApprovalReceipt({
        baseSha,
        tipSha,
        reviewer: 'Fable',
        effort: 'medium',
        decision: 'pass',
        policyFingerprint,
        promptVersion: 2,
        schemaVersion: 1,
        contextSha256: null,
        reviewedAt: '2026-07-24T12:00:00.000Z',
      })

    expect(describeApprovalStatus(
      a,
      c,
      [
        makeReceipt(a, b, 'policy-v1'),
        makeReceipt(b, c, 'policy-v2'),
      ],
      'policy-v3',
      () => true,
    )).toMatchObject({ state: 'stale', approvalCount: 0, staleCount: 2 })
  })
})
