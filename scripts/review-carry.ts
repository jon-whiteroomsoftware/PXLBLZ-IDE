/**
 * Content-id approval carry-forward (#637). An approval is a claim about
 * content, not commit identity: after a rebase that changed every sha and no
 * content, the original review still examined exactly the patches being
 * landed. This module re-keys an approved chain onto the rebased shas when --
 * and only when -- two independent checks hold:
 *
 * 1. The ordered per-commit content-id sequence of the rebased range equals
 *    the chain's recorded sequence (same order, same count). A content id is
 *    a byte-exact sha256 of the commit's full `git diff-tree --patch
 *    --full-index` text -- NOT `git patch-id`, which ignores intra-line
 *    whitespace and could let a whitespace-different amend inherit approval.
 *    Because the hashed text includes `index` pre-image blob hashes and
 *    context lines, any intervening change to a stack-touched file also
 *    changes the content id, so same-file interference refuses carry on
 *    content alone.
 * 2. The intervening commits (old base to new base) touch a file set disjoint
 *    from the stack's -- defense in depth over check 1.
 *
 * Accepted residual (#637, decided on the issue): an intervening commit can
 * change behavior a carried patch depends on while touching only other
 * files. Path disjointness cannot prove semantic independence; the
 * alternative is no carry-forward at all, and the policy decision was that
 * a byte-identical stack over disjoint files carries. Everything else --
 * conflict resolutions, reordering, dropped or added commits, overlapping
 * files, annotated-tag tips, or receipts predating content-id recording --
 * returns null and requires a fresh review. Carried receipts keep the
 * original reviewer, effort, coverage, advisories, authorship, and
 * reviewedAt timestamp, and record provenance in `carriedFrom` (rooted at
 * the originally reviewed range when carried repeatedly).
 */

import { REVIEW_RECEIPT_VERSION, type ReviewApprovalReceipt } from './review-approvals'

export interface RebasedCommit {
  sha: string
  contentId: string
}

/**
 * Finds a contiguous receipt chain whose concatenated content-id sequence
 * equals the target sequence, ending in a clean (non-advisory) receipt.
 * Receipts without recorded content ids cannot participate.
 */
export function findChainByContentIds(
  receipts: readonly ReviewApprovalReceipt[],
  sequence: readonly string[],
  policyFingerprint: string,
): ReviewApprovalReceipt[] | null {
  if (sequence.length === 0) return null
  const usable = receipts.filter((receipt) => (
    receipt.receiptVersion === REVIEW_RECEIPT_VERSION
    && receipt.decision === 'pass'
    && receipt.policyFingerprint === policyFingerprint
    && (receipt.contentIds?.length ?? 0) > 0
  ))
  const matchesAt = (receipt: ReviewApprovalReceipt, offset: number): boolean => (
    (receipt.contentIds ?? []).every((contentId, index) => (
      sequence[offset + index] === contentId
    ))
  )
  const queue: Array<{ chain: ReviewApprovalReceipt[]; consumed: number }> = usable
    .filter((receipt) => matchesAt(receipt, 0))
    .map((receipt) => ({ chain: [receipt], consumed: receipt.contentIds!.length }))
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
      const consumed = current.consumed + receipt.contentIds!.length
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
  const chainContentIds = input.chain.map((receipt) => receipt.contentIds)
  if (chainContentIds.some((contentIds) => !contentIds || contentIds.length === 0)) {
    return null
  }
  const recordedSequence = chainContentIds.flatMap((contentIds) => contentIds ?? [])
  if (recordedSequence.length !== input.rebasedCommits.length
    || recordedSequence.some((contentId, index) => (
      contentId !== input.rebasedCommits[index].contentId
    ))) {
    return null
  }

  const carried: ReviewApprovalReceipt[] = []
  let cursor = 0
  let baseSha = input.newBaseSha
  for (const receipt of input.chain) {
    const edgeLength = receipt.contentIds?.length ?? 0
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
