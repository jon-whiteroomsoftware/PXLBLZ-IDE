import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  createApprovalReceipt,
  reviewApprovalDirectory,
  type ReviewApprovalReceipt,
  writeApprovalReceipt,
} from './review-approvals'
import {
  parseReviewTestDesignContext,
  printReview,
  rangeHasChanges,
  REVIEW_PROMPT_VERSION,
  REVIEW_SCHEMA_VERSION,
  reviewContextSha256,
  reviewPolicyFingerprint,
  runReviewForRanges,
  type PushReviewExecution,
  type PushReviewRange,
} from './push-review'

export interface CandidateReviewArgs {
  baseRef: string
  tipRef: string
  testDesignPath?: string
}

export function parseCandidateArgs(args: string[]): CandidateReviewArgs {
  const positional: string[] = []
  let testDesignPath: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--test-design') {
      testDesignPath = args[index + 1]
      if (!testDesignPath) throw new Error('--test-design requires a path.')
      index += 1
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown candidate review option: ${arg}`)
    } else {
      positional.push(arg)
    }
  }
  if (positional.length !== 2) {
    throw new Error('Candidate review requires an explicit base and tip.')
  }
  return {
    baseRef: positional[0],
    tipRef: positional[1],
    ...(testDesignPath ? { testDesignPath } : {}),
  }
}

export interface ApproveCandidateInput {
  range: PushReviewRange
  execution: PushReviewExecution
  policyFingerprint: string
  promptVersion: number
  schemaVersion: number
  contextSha256: string | null
  reviewedAt: string
  saveReceipt: (receipt: ReviewApprovalReceipt) => string
}

export interface CandidateApprovalResult {
  execution: PushReviewExecution
  receiptPath?: string
}

export function approveCandidate(
  input: ApproveCandidateInput,
): CandidateApprovalResult {
  if (input.execution.review.decision !== 'pass'
    || input.execution.review.findings.length > 0) {
    return { execution: input.execution }
  }
  const receipt = createApprovalReceipt({
    baseSha: input.range.baseSha,
    tipSha: input.range.tipSha,
    reviewer: input.execution.reviewer,
    effort: 'high',
    decision: input.execution.review.decision,
    policyFingerprint: input.policyFingerprint,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    contextSha256: input.contextSha256,
    reviewedAt: input.reviewedAt,
  })
  return {
    execution: input.execution,
    receiptPath: input.saveReceipt(receipt),
  }
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function resolveObject(ref: string): string {
  try {
    return git(['rev-parse', '--verify', ref])
  } catch {
    throw new Error(`Cannot resolve candidate Git object: ${ref}`)
  }
}

function resolveCommit(ref: string): string {
  try {
    return git(['rev-parse', '--verify', `${ref}^{commit}`])
  } catch {
    throw new Error(`Cannot resolve candidate commit: ${ref}`)
  }
}

function gitIsAncestor(baseSha: string, tipSha: string): boolean {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', baseSha, tipSha], {
    stdio: 'ignore',
  })
  return result.status === 0
}

export function validateCandidateCheckout(input: {
  baseSha: string
  tipSha: string
  tipCommitSha: string
  headSha: string
  clean: boolean
  hasMergeCommits: boolean
  isAncestor: (base: string, tip: string) => boolean
}): void {
  if (input.tipCommitSha !== input.headSha) {
    throw new Error('Candidate tip must equal the checked-out HEAD so reviewer file reads match the reviewed patch.')
  }
  if (!input.clean) {
    throw new Error('Candidate worktree has uncommitted changes; commit or remove them before review.')
  }
  if (!input.isAncestor(input.baseSha, input.tipSha)) {
    throw new Error(`Candidate base ${input.baseSha} is not an ancestor of tip ${input.tipSha}. Rebase before review.`)
  }
  if (input.hasMergeCommits) {
    throw new Error('Candidate history contains a merge commit. Rebase to a linear range before review.')
  }
}

function main(): void {
  try {
    const args = parseCandidateArgs(process.argv.slice(2))
    const baseSha = resolveObject(args.baseRef)
    const tipSha = resolveObject(args.tipRef)
    validateCandidateCheckout({
      baseSha,
      tipSha,
      tipCommitSha: resolveCommit(tipSha),
      headSha: resolveCommit('HEAD'),
      clean: git(['status', '--porcelain']).length === 0,
      hasMergeCommits: git([
        'rev-list',
        '--merges',
        `${baseSha}..${tipSha}`,
      ]).length > 0,
      isAncestor: gitIsAncestor,
    })
    const range: PushReviewRange = {
      label: `candidate ${args.baseRef} -> ${args.tipRef}`,
      baseSha,
      tipSha,
    }
    if (!rangeHasChanges(range)) {
      throw new Error(`Candidate ${baseSha}..${tipSha} has no changes to review.`)
    }
    const testDesign = args.testDesignPath
      ? parseReviewTestDesignContext(JSON.parse(readFileSync(args.testDesignPath, 'utf8')))
      : undefined

    console.log(`▶ Reviewing candidate ${baseSha.slice(0, 12)}..${tipSha.slice(0, 12)}...`)
    const execution = runReviewForRanges([range], testDesign)
    printReview(execution.reviewer, execution.review)
    const result = approveCandidate({
      range,
      execution,
      policyFingerprint: reviewPolicyFingerprint(),
      promptVersion: REVIEW_PROMPT_VERSION,
      schemaVersion: REVIEW_SCHEMA_VERSION,
      contextSha256: reviewContextSha256(testDesign),
      reviewedAt: new Date().toISOString(),
      saveReceipt: (receipt) => writeApprovalReceipt(
        reviewApprovalDirectory(git([
          'rev-parse',
          '--path-format=absolute',
          '--git-common-dir',
        ])),
        receipt,
      ),
    })
    if (!result.receiptPath) {
      console.error('CANDIDATE REVIEW BLOCKED: fix the findings, commit a new tip, and review that new exact range.')
      process.exitCode = 1
      return
    }
    console.log(`✓ Exact-range approval recorded: ${result.receiptPath}`)
    console.log('Land this candidate unchanged with a fast-forward; amend, rebase, squash, or cherry-pick invalidates this approval.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`CANDIDATE REVIEW BLOCKED: ${message}`)
    console.error('No approval receipt was created.')
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) main()
