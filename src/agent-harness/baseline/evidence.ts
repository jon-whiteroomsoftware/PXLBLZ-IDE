// Deterministic evidence over the baseline fixtures (#945): stable hashes of
// each fixture record and of its exported `.pxlshow` and `.epe` deliverables
// before and after one scripted bridge turn, so a later compiler or grammar
// change can be compared against what the baseline saw. Everything here is
// pure over its inputs; the fixtures command supplies the records and the
// export results.
import { createHash } from 'node:crypto'

/** JSON with object keys sorted at every level, so equal values hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex')
}

export function recordSha256(record: unknown): string {
  return sha256Hex(canonicalJson(record))
}

export interface ArtifactEvidence {
  pxlshow: { filename: string; bytes: number; contentSha256: string } | { error: string }
  epe: { filename: string; bytes: number; sourceSha256: string; stampKind: string | null } | { error: string }
}

export interface FixtureEvidence {
  id: string
  source: { kind: 'constructed' } | { kind: 'stock'; stockShowId: string }
  features: string[]
  recordSha256: string
  loopDurationMs: number
  clipCount: number
  before: ArtifactEvidence
  bridge: {
    /** Whether the grammar opened the record in editing-session mode. */
    opened: boolean
    changed: boolean
    summaries: string[]
    reply: string
    toolEvents: string[]
    /** Refused tool calls as `name: message`, verbatim from the session. */
    refusals: string[]
  }
  after: (ArtifactEvidence & { recordSha256: string; clipCount: number; firstClipDurationMs: number }) | null
}

export interface BaselineFixtureEvidence {
  version: 1
  /** Fixed export stamp; the evidence never carries wall-clock time. */
  stampedAt: string
  utterance: string
  fixtures: FixtureEvidence[]
}

/** Paths (dot-separated) at which two evidence documents differ. */
export function evidenceDifferences(expected: unknown, actual: unknown, path = ''): string[] {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const differences: string[] = []
    const length = Math.max(expected.length, actual.length)
    for (let index = 0; index < length; index += 1) {
      differences.push(...evidenceDifferences(expected[index], actual[index], `${path}[${index}]`))
    }
    return differences
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
    return [...keys].flatMap((key) => evidenceDifferences(
      (expected as Record<string, unknown>)[key],
      (actual as Record<string, unknown>)[key],
      path ? `${path}.${key}` : key,
    ))
  }
  return Object.is(expected, actual) ? [] : [path || '(root)']
}
