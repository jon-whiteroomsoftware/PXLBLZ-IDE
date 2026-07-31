import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export const REVIEW_RECEIPT_VERSION = 1 as const

export interface ReviewAdvisoryFinding {
  severity: 'P2' | 'P3'
  title: string
  file: string
  line: number | null
  explanation: string
}

export interface ReviewApprovalReceipt {
  receiptVersion: typeof REVIEW_RECEIPT_VERSION
  baseSha: string
  tipSha: string
  reviewer: 'Fable' | 'Opus 5 High' | 'GPT-5.6 High'
  effort: 'medium' | 'high'
  decision: 'pass'
  /** Omitted means clean. Advisory coverage must be followed by a clean exact-range receipt. */
  coverage?: 'advisory'
  advisories?: ReviewAdvisoryFinding[]
  /** Distinct authoring models signalled by the reviewed commits (#637). */
  authoredModels?: string[]
  /** Reviewer family differs from every signalled authoring family. Omitted receipts are unverified on this axis (#637). */
  crossFamily?: boolean
  /** Ordered per-commit `git patch-id --stable` sequence; enables carry-forward across content-identical rebases (#637). */
  patchIds?: string[]
  /** Provenance of a carried receipt, rooted at the originally reviewed range (#637). */
  carriedFrom?: ReviewCarryProvenance
  policyFingerprint: string
  promptVersion: number
  schemaVersion: number
  contextSha256: string | null
  reviewedAt: string
}

export interface ReviewCarryProvenance {
  baseSha: string
  tipSha: string
  carriedAt: string
}

export interface CreateApprovalReceiptInput {
  baseSha: string
  tipSha: string
  reviewer: ReviewApprovalReceipt['reviewer']
  effort: ReviewApprovalReceipt['effort']
  decision: 'pass' | 'fail'
  coverage?: ReviewApprovalReceipt['coverage']
  advisories?: ReviewAdvisoryFinding[]
  authoredModels?: string[]
  crossFamily?: boolean
  patchIds?: string[]
  carriedFrom?: ReviewCarryProvenance
  policyFingerprint: string
  promptVersion: number
  schemaVersion: number
  contextSha256: string | null
  reviewedAt: string
}

export function createApprovalReceipt(
  input: CreateApprovalReceiptInput,
): ReviewApprovalReceipt {
  if (input.decision !== 'pass') {
    throw new Error('A failed review cannot create an approval receipt.')
  }
  const receipt: ReviewApprovalReceipt = {
    receiptVersion: REVIEW_RECEIPT_VERSION,
    ...input,
    decision: 'pass',
  }
  return parseApprovalReceipt(receipt)
}

export function findApprovalChain(
  baseSha: string,
  tipSha: string,
  receipts: readonly ReviewApprovalReceipt[],
  policyFingerprint: string | null,
  isAncestor: (base: string, tip: string) => boolean = () => true,
): ReviewApprovalReceipt[] | null {
  if (baseSha === tipSha) return []
  const usable = receipts.filter((receipt) => (
    receipt.receiptVersion === REVIEW_RECEIPT_VERSION
    && receipt.decision === 'pass'
    && (policyFingerprint === null || receipt.policyFingerprint === policyFingerprint)
    && isAncestor(receipt.baseSha, receipt.tipSha)
    && isAncestor(receipt.tipSha, tipSha)
  ))
  const queue: Array<{ sha: string; chain: ReviewApprovalReceipt[] }> = [{
    sha: baseSha,
    chain: [],
  }]
  const visited = new Set([baseSha])

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    for (const receipt of usable) {
      if (receipt.baseSha !== current.sha) continue
      const chain = [...current.chain, receipt]
      if (receipt.tipSha === tipSha && receipt.coverage !== 'advisory') return chain
      if (visited.has(receipt.tipSha)) continue
      visited.add(receipt.tipSha)
      queue.push({ sha: receipt.tipSha, chain })
    }
  }
  return null
}

export function writeApprovalReceipt(
  directory: string,
  receipt: ReviewApprovalReceipt,
): string {
  const validated = parseApprovalReceipt(receipt)
  mkdirSync(directory, { recursive: true })
  const identity = createHash('sha256')
    .update(
      `${validated.baseSha}\0${validated.tipSha}\0${validated.policyFingerprint}`
      + `\0${validated.coverage ?? 'clean'}`,
    )
    .digest('hex')
  const path = join(directory, `${validated.tipSha.slice(0, 12)}-${identity}.json`)
  const serialized = `${JSON.stringify(validated, null, 2)}\n`
  try {
    writeFileSync(path, serialized, { flag: 'wx', mode: 0o444 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const existing = parseApprovalReceipt(JSON.parse(readFileSync(path, 'utf8')))
    if (JSON.stringify(existing) !== JSON.stringify(validated)) {
      throw new Error(`Review approval receipt is immutable: ${path}`, { cause: error })
    }
  }
  return path
}

export function loadApprovalReceipts(directory: string): ReviewApprovalReceipt[] {
  let files: string[]
  try {
    files = readdirSync(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return files
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const path = join(directory, file)
      try {
        return parseApprovalReceipt(JSON.parse(readFileSync(path, 'utf8')))
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Invalid review approval receipt ${path}: ${detail}`, { cause: error })
      }
    })
}

export function reviewApprovalDirectory(gitCommonDirectory: string): string {
  return join(
    gitCommonDirectory,
    'pxlblz',
    'review-approvals',
    `v${REVIEW_RECEIPT_VERSION}`,
  )
}

export function parseApprovalReceipt(value: unknown): ReviewApprovalReceipt {
  if (!value || typeof value !== 'object') throw new Error('Receipt must be an object.')
  const receipt = value as Partial<ReviewApprovalReceipt>
  if (receipt.receiptVersion !== REVIEW_RECEIPT_VERSION
    || !validSha(receipt.baseSha)
    || !validSha(receipt.tipSha)
    || (receipt.reviewer !== 'Fable'
      && receipt.reviewer !== 'Opus 5 High'
      && receipt.reviewer !== 'GPT-5.6 High')
    || (receipt.effort !== 'medium' && receipt.effort !== 'high')
    || receipt.decision !== 'pass'
    || (receipt.coverage !== undefined && receipt.coverage !== 'advisory')
    || (receipt.coverage === 'advisory'
      ? !validAdvisories(receipt.advisories)
      : receipt.advisories !== undefined)
    || (receipt.authoredModels !== undefined
      && (!Array.isArray(receipt.authoredModels)
        || receipt.authoredModels.length === 0
        || receipt.authoredModels.some((model) => (
          typeof model !== 'string' || model.trim().length === 0
        ))))
    || (receipt.crossFamily !== undefined && typeof receipt.crossFamily !== 'boolean')
    || (receipt.patchIds !== undefined
      && (!Array.isArray(receipt.patchIds)
        || receipt.patchIds.length === 0
        || receipt.patchIds.some((patchId) => (
          typeof patchId !== 'string' || patchId.trim().length === 0
        ))))
    || (receipt.carriedFrom !== undefined
      && !(receipt.carriedFrom
        && typeof receipt.carriedFrom === 'object'
        && validSha(receipt.carriedFrom.baseSha)
        && validSha(receipt.carriedFrom.tipSha)
        && typeof receipt.carriedFrom.carriedAt === 'string'
        && !Number.isNaN(Date.parse(receipt.carriedFrom.carriedAt))))
    || typeof receipt.policyFingerprint !== 'string'
    || receipt.policyFingerprint.length === 0
    || !Number.isInteger(receipt.promptVersion)
    || !Number.isInteger(receipt.schemaVersion)
    || (receipt.contextSha256 !== null && typeof receipt.contextSha256 !== 'string')
    || typeof receipt.reviewedAt !== 'string'
    || Number.isNaN(Date.parse(receipt.reviewedAt))) {
    throw new Error('Receipt fields are malformed or unsupported.')
  }
  return receipt as ReviewApprovalReceipt
}

function validAdvisories(value: unknown): value is ReviewAdvisoryFinding[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((finding) => (
      finding
      && typeof finding === 'object'
      && ((finding as ReviewAdvisoryFinding).severity === 'P2'
        || (finding as ReviewAdvisoryFinding).severity === 'P3')
      && typeof (finding as ReviewAdvisoryFinding).title === 'string'
      && typeof (finding as ReviewAdvisoryFinding).file === 'string'
      && ((finding as ReviewAdvisoryFinding).line === null
        || (Number.isInteger((finding as ReviewAdvisoryFinding).line)
          && (finding as ReviewAdvisoryFinding).line! > 0))
      && typeof (finding as ReviewAdvisoryFinding).explanation === 'string'
    ))
}

function validSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value)
}
