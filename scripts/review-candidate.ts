import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  createApprovalReceipt,
  loadApprovalReceipts,
  reviewApprovalDirectory,
  type ReviewAdvisoryFinding,
  type ReviewApprovalReceipt,
  writeApprovalReceipt,
} from './review-approvals'
import {
  carryApprovalChainForward,
  findChainByContentIds,
  type RebasedCommit,
} from './review-carry'
import { parseAuthorshipLog, type CommitAuthorship } from './review-routing'
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
  contentIds?: string[]
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
  const advisories = input.execution.review.findings.filter(
    (finding): finding is typeof finding & ReviewAdvisoryFinding => (
      finding.severity === 'P2' || finding.severity === 'P3'
    ),
  )
  const hasBlockingFinding = input.execution.review.findings.some(
    (finding) => finding.severity === 'P0' || finding.severity === 'P1',
  )
  const cleanPass = input.execution.review.decision === 'pass'
    && input.execution.review.findings.length === 0
  const advisoryFailure = input.execution.review.decision === 'fail'
    && advisories.length > 0
    && !hasBlockingFinding
  if (!cleanPass && !advisoryFailure) {
    return { execution: input.execution }
  }
  const receipt = createApprovalReceipt({
    baseSha: input.range.baseSha,
    tipSha: input.range.tipSha,
    reviewer: input.execution.reviewer,
    effort: 'high',
    decision: 'pass',
    ...(advisoryFailure ? { coverage: 'advisory' as const, advisories } : {}),
    ...(input.execution.authoredModels?.length
      ? { authoredModels: input.execution.authoredModels }
      : {}),
    ...(input.execution.crossFamily !== undefined
      ? { crossFamily: input.execution.crossFamily }
      : {}),
    ...(input.contentIds?.length ? { contentIds: input.contentIds } : {}),
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

const GIT_MAX_BUFFER_BYTES = 16 * 1024 * 1024

function git(args: string[], input?: string): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER_BYTES,
    ...(input !== undefined ? { input } : {}),
  }).trim()
}

function gitFileList(args: string[]): string[] {
  return git(args).split(/\r?\n/).filter((line) => line.length > 0)
}

/**
 * Ordered per-commit content ids for the range: a byte-exact sha256 of each
 * commit's full diff-tree patch text. Deliberately NOT `git patch-id`, which
 * ignores intra-line whitespace; whitespace is semantic in reviewed code.
 * `--full-index` keeps complete pre/post blob hashes in the hashed text, so
 * any intervening change to a stack-touched file changes the content id.
 */
function computeRangeContentIds(baseSha: string, tipSha: string): RebasedCommit[] {
  const shas = git(['rev-list', '--reverse', `${baseSha}..${tipSha}`])
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
  return shas.map((sha) => {
    const patch = git([
      'diff-tree', '--patch', '--no-ext-diff', '--full-index', '--unified=3',
      '--no-color', '--root', sha,
    ])
    const body = patch.split('\n').slice(1).join('\n')
    return { sha, contentId: createHash('sha256').update(body).digest('hex') }
  })
}

interface CarryForwardOutcome {
  chain: ReviewApprovalReceipt[]
  receiptPaths: string[]
}

/**
 * Trailer-derived authorship for each commit of the range, oldest first so
 * indexes align with computeRangeContentIds. Returns null when the two git
 * views disagree on the commit sequence; carry must not guess.
 */
function rangeAuthorshipAligned(
  baseSha: string,
  tipSha: string,
  rebasedCommits: readonly RebasedCommit[],
): CommitAuthorship[] | null {
  const authorship = parseAuthorshipLog(git([
    'log', '--reverse', '--format=%H%x1f%(trailers)%x1e', `${baseSha}..${tipSha}`, '--',
  ]))
  if (authorship.length !== rebasedCommits.length
    || authorship.some((commit, index) => commit.sha !== rebasedCommits[index].sha)) {
    return null
  }
  return authorship
}

/** Union of paths touched by any intervening commit, not the net endpoint diff: touch-and-revert must still force re-review. */
function interveningTouchedFiles(oldBaseSha: string, newBaseSha: string): string[] {
  return [...new Set(gitFileList([
    'log', '--name-only', '--format=', '--no-renames', `${oldBaseSha}..${newBaseSha}`, '--',
  ]))]
}

function tryCarryForward(input: {
  baseSha: string
  tipSha: string
  /** Null when the tip is not a plain commit: an annotated tag's receipt must end at the tag-object sha, which carry cannot produce. */
  rebasedCommits: RebasedCommit[] | null
  contextSha256: string | null
  receipts: readonly ReviewApprovalReceipt[]
  policyFingerprint: string
  receiptsDirectory: string
}): CarryForwardOutcome | null {
  if (!input.rebasedCommits || input.rebasedCommits.length === 0) return null
  const chain = findChainByContentIds(
    input.receipts,
    input.rebasedCommits.map((commit) => commit.contentId),
    input.policyFingerprint,
  )
  if (!chain) return null
  if (chain[chain.length - 1].tipSha === input.tipSha) return null
  if (!gitIsAncestor(chain[0].baseSha, input.baseSha)) return null
  const authorship = rangeAuthorshipAligned(input.baseSha, input.tipSha, input.rebasedCommits)
  if (!authorship) return null
  const carried = carryApprovalChainForward({
    chain,
    newBaseSha: input.baseSha,
    rebasedCommits: input.rebasedCommits,
    authorship,
    contextSha256: input.contextSha256,
    interveningFiles: interveningTouchedFiles(chain[0].baseSha, input.baseSha),
    stackFiles: gitFileList(['diff', '--name-only', input.baseSha, input.tipSha]),
    carriedAt: new Date().toISOString(),
  })
  if (!carried) return null
  return {
    chain,
    receiptPaths: carried.map((receipt) => (
      writeApprovalReceipt(input.receiptsDirectory, receipt)
    )),
  }
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

async function main(): Promise<void> {
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
    const receiptsDirectory = reviewApprovalDirectory(git([
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]))
    const policyFingerprint = reviewPolicyFingerprint()
    const tipIsPlainCommit = tipSha === resolveCommit(tipSha)
    const rebasedCommits = tipIsPlainCommit
      ? computeRangeContentIds(baseSha, tipSha)
      : null

    const carriedForward = tryCarryForward({
      baseSha,
      tipSha,
      rebasedCommits,
      contextSha256: reviewContextSha256(testDesign),
      receipts: loadApprovalReceipts(receiptsDirectory),
      policyFingerprint,
      receiptsDirectory,
    })
    if (carriedForward) {
      const original = carriedForward.chain
      console.log(
        `✓ Approval carried forward from ${original[0].baseSha.slice(0, 12)}..`
        + `${original[original.length - 1].tipSha.slice(0, 12)}: content-identical rebase`
        + ' (matching content ids, disjoint intervening files). No re-review required.',
      )
      for (const path of carriedForward.receiptPaths) console.log(`  ${path}`)
      console.log('Land this candidate unchanged with a fast-forward; amend, rebase, squash, or cherry-pick invalidates this approval.')
      return
    }

    console.log(`▶ Reviewing candidate ${baseSha.slice(0, 12)}..${tipSha.slice(0, 12)}...`)
    const execution = await runReviewForRanges([range], testDesign)
    printReview(execution.reviewer, execution.review)
    const result = approveCandidate({
      range,
      execution,
      contentIds: rebasedCommits?.map((commit) => commit.contentId),
      policyFingerprint,
      promptVersion: REVIEW_PROMPT_VERSION,
      schemaVersion: REVIEW_SCHEMA_VERSION,
      contextSha256: reviewContextSha256(testDesign),
      reviewedAt: new Date().toISOString(),
      saveReceipt: (receipt) => writeApprovalReceipt(receiptsDirectory, receipt),
    })
    if (!result.receiptPath) {
      console.error('CANDIDATE REVIEW BLOCKED: fix the findings, commit a new tip, and review that new exact range.')
      process.exitCode = 1
      return
    }
    if (execution.review.findings.length > 0) {
      console.log(`✓ Non-blocking range coverage recorded: ${result.receiptPath}`)
      console.error('CANDIDATE FOLLOW-UP REQUIRED: fix the P2/P3 findings in a new commit, then review that exact follow-up range. Full-range re-review is not required.')
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
if (import.meta.url === invokedPath) void main()
