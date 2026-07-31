/**
 * Patch-id approval carry-forward (#637). An approval is a claim about
 * content, not commit identity: after a rebase that changed every sha and no
 * content, the original review still examined exactly the patches being
 * landed. This module re-keys an approved chain onto the rebased shas when --
 * and only when -- two independent checks hold:
 *
 * 1. The ordered per-commit `git patch-id --stable` sequence of the rebased
 *    range equals the chain's recorded sequence (same patches, same order,
 *    same count).
 * 2. The intervening commits (old base to new base) touch a file set disjoint
 *    from the stack's, because a textually identical patch can still be
 *    semantically broken by changes to the files it lands beside.
 *
 * Anything else -- conflict resolutions, reordering, dropped or added
 * commits, overlapping files, or receipts predating patch-id recording --
 * returns null and requires a fresh review. Carried receipts keep the
 * original reviewer, effort, coverage, advisories, authorship, and reviewedAt
 * timestamp, and record provenance in `carriedFrom` (rooted at the originally
 * reviewed range when carried repeatedly).
 */

import { REVIEW_RECEIPT_VERSION, type ReviewApprovalReceipt } from './review-approvals'

export interface RebasedCommit {
  sha: string
  patchId: string
}

/**
 * Parses `git patch-id --stable` output: one `<patch-id> <commit-sha>` line
 * per non-empty patch, in input order.
 */
export function parsePatchIdOutput(raw: string): RebasedCommit[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [patchId, sha] = line.split(/\s+/)
      if (!patchId || !sha) throw new Error(`Malformed git patch-id line: ${line}`)
      return { sha, patchId }
    })
}

/**
 * Finds a contiguous receipt chain whose concatenated patch-id sequence
 * equals the target sequence, ending in a clean (non-advisory) receipt.
 * Receipts without recorded patch-ids cannot participate.
 */
export function findChainByPatchIds(
  receipts: readonly ReviewApprovalReceipt[],
  sequence: readonly string[],
  policyFingerprint: string,
): ReviewApprovalReceipt[] | null {
  if (sequence.length === 0) return null
  const usable = receipts.filter((receipt) => (
    receipt.receiptVersion === REVIEW_RECEIPT_VERSION
    && receipt.decision === 'pass'
    && receipt.policyFingerprint === policyFingerprint
    && (receipt.patchIds?.length ?? 0) > 0
  ))
  const matchesAt = (receipt: ReviewApprovalReceipt, offset: number): boolean => (
    (receipt.patchIds ?? []).every((patchId, index) => (
      sequence[offset + index] === patchId
    ))
  )
  const queue: Array<{ chain: ReviewApprovalReceipt[]; consumed: number }> = usable
    .filter((receipt) => matchesAt(receipt, 0))
    .map((receipt) => ({ chain: [receipt], consumed: receipt.patchIds!.length }))
  const visited = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    const last = current.chain[current.chain.length - 1]
    if (current.consumed === sequence.length) {
      if (last.coverage !== 'advisory') return current.chain
      continue
    }
    for (const receipt of usable) {
      if (receipt.baseSha !== last.tipSha) continue
      if (!matchesAt(receipt, current.consumed)) continue
      const consumed = current.consumed + receipt.patchIds!.length
      if (consumed > sequence.length) continue
      const key = `${receipt.tipSha}:${consumed}`
      if (visited.has(key)) continue
      visited.add(key)
      queue.push({ chain: [...current.chain, receipt], consumed })
    }
  }
  return null
}

export function filesAreDisjoint(
  interveningFiles: readonly string[],
  stackFiles: readonly string[],
): boolean {
  const stack = new Set(stackFiles)
  return !interveningFiles.some((file) => stack.has(file))
}

export interface CarryApprovalChainInput {
  chain: readonly ReviewApprovalReceipt[]
  newBaseSha: string
  rebasedCommits: readonly RebasedCommit[]
  interveningFiles: readonly string[]
  stackFiles: readonly string[]
  carriedAt: string
}

export function carryApprovalChainForward(
  input: CarryApprovalChainInput,
): ReviewApprovalReceipt[] | null {
  if (input.chain.length === 0) return null
  if (!filesAreDisjoint(input.interveningFiles, input.stackFiles)) return null
  const chainPatchIds = input.chain.map((receipt) => receipt.patchIds)
  if (chainPatchIds.some((patchIds) => !patchIds || patchIds.length === 0)) {
    return null
  }
  const recordedSequence = chainPatchIds.flatMap((patchIds) => patchIds ?? [])
  if (recordedSequence.length !== input.rebasedCommits.length
    || recordedSequence.some((patchId, index) => (
      patchId !== input.rebasedCommits[index].patchId
    ))) {
    return null
  }

  const carried: ReviewApprovalReceipt[] = []
  let cursor = 0
  let baseSha = input.newBaseSha
  for (const receipt of input.chain) {
    const edgeLength = receipt.patchIds?.length ?? 0
    const edgeCommits = input.rebasedCommits.slice(cursor, cursor + edgeLength)
    cursor += edgeLength
    const tipSha = edgeCommits[edgeCommits.length - 1].sha
    carried.push({
      ...receipt,
      baseSha,
      tipSha,
      carriedFrom: {
        baseSha: receipt.carriedFrom?.baseSha ?? receipt.baseSha,
        tipSha: receipt.carriedFrom?.tipSha ?? receipt.tipSha,
        carriedAt: input.carriedAt,
      },
    })
    baseSha = tipSha
  }
  return carried
}
