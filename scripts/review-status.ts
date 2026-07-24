import { execFileSync, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import {
  findApprovalChain,
  loadApprovalReceipts,
  reviewApprovalDirectory,
  type ReviewApprovalReceipt,
} from './review-approvals'
import { reviewPolicyFingerprint } from './push-review'

export interface ApprovalStatus {
  state: 'approved' | 'missing' | 'stale'
  approvalCount: number
  staleCount: number
  chain: ReviewApprovalReceipt[]
}

export function describeApprovalStatus(
  baseSha: string,
  tipSha: string,
  receipts: readonly ReviewApprovalReceipt[],
  policyFingerprint: string,
  isAncestor: (base: string, tip: string) => boolean,
): ApprovalStatus {
  const chain = findApprovalChain(
    baseSha,
    tipSha,
    receipts,
    policyFingerprint,
    isAncestor,
  )
  const staleCount = receipts.filter((receipt) =>
    receipt.policyFingerprint !== policyFingerprint).length
  if (chain) {
    return {
      state: 'approved',
      approvalCount: chain.length,
      staleCount,
      chain,
    }
  }
  return {
    state: staleCount > 0 ? 'stale' : 'missing',
    approvalCount: 0,
    staleCount,
    chain: [],
  }
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function resolveCommit(ref: string): string {
  try {
    return git(['rev-parse', '--verify', `${ref}^{commit}`])
  } catch {
    throw new Error(`Cannot resolve review status commit: ${ref}`)
  }
}

function isAncestor(baseSha: string, tipSha: string): boolean {
  return spawnSync('git', ['merge-base', '--is-ancestor', baseSha, tipSha], {
    stdio: 'ignore',
  }).status === 0
}

function main(): void {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 0 && args.length !== 2) {
      throw new Error('Review status accepts either no arguments or an explicit base and tip.')
    }
    const baseRef = args[0] ?? 'origin/main'
    const tipRef = args[1] ?? 'HEAD'
    const baseSha = resolveCommit(baseRef)
    const tipSha = resolveCommit(tipRef)
    const directory = reviewApprovalDirectory(git([
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]))
    const status = describeApprovalStatus(
      baseSha,
      tipSha,
      loadApprovalReceipts(directory),
      reviewPolicyFingerprint(),
      isAncestor,
    )
    console.log(`Review range: ${baseSha}..${tipSha}`)
    console.log(`Receipt directory: ${directory}`)
    console.log(`Status: ${status.state}`)
    if (status.state === 'approved') {
      for (const receipt of status.chain) {
        console.log(
          `  ${receipt.baseSha.slice(0, 12)}..${receipt.tipSha.slice(0, 12)}`
          + ` ${receipt.reviewer} ${receipt.effort} ${receipt.reviewedAt}`,
        )
      }
      return
    }
    if (status.staleCount > 0) {
      console.log(`Stale-policy receipts: ${status.staleCount}`)
    }
    console.log(`Run: npm run review:candidate -- ${baseSha} ${tipSha}`)
    process.exitCode = 1
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`REVIEW STATUS FAILED: ${message}`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) main()
