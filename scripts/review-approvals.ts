import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export const REVIEW_RECEIPT_VERSION = 1 as const

export interface ReviewApprovalReceipt {
  receiptVersion: typeof REVIEW_RECEIPT_VERSION
  baseSha: string
  tipSha: string
  reviewer: 'Fable' | 'GPT-5.6 High'
  effort: 'medium' | 'high'
  decision: 'pass'
  policyFingerprint: string
  promptVersion: number
  schemaVersion: number
  contextSha256: string | null
  reviewedAt: string
}

export interface CreateApprovalReceiptInput {
  baseSha: string
  tipSha: string
  reviewer: ReviewApprovalReceipt['reviewer']
  effort: ReviewApprovalReceipt['effort']
  decision: 'pass' | 'fail'
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
  return {
    receiptVersion: REVIEW_RECEIPT_VERSION,
    ...input,
    decision: 'pass',
  }
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
      if (receipt.tipSha === tipSha) return chain
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
    .update(`${validated.baseSha}\0${validated.tipSha}\0${validated.policyFingerprint}`)
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
    || (receipt.reviewer !== 'Fable' && receipt.reviewer !== 'GPT-5.6 High')
    || (receipt.effort !== 'medium' && receipt.effort !== 'high')
    || receipt.decision !== 'pass'
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

function validSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value)
}
