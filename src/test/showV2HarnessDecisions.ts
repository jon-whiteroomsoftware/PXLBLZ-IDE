/**
 * Pure decisions for the Show suite's v2 backing harness (#1066).
 *
 * Everything here is intentionally free of imports, the DOM, and Playwright:
 * `e2e/support/showBacking.ts` loads under the Playwright configuration's
 * typecheck project, and `e2e/support/showBackingRecords.ts` plus the Show
 * spec's own seeding and readback helpers consume these from `e2e/support`.
 * Impure timing, navigation, and storage reads stay in those callers.
 */

export function isV2StoredRecord(record: unknown): boolean {
  return typeof record === 'object'
    && record !== null
    && (record as { version?: unknown }).version === 2
}

export function keepV2StoredRecords<T>(records: readonly T[]): T[] {
  return records.filter(isV2StoredRecord)
}

export function mergeShowListingsById<T extends { id: string }>(
  primary: readonly T[],
  secondary: readonly T[],
): T[] {
  const seen = new Set(primary.map((show) => show.id))
  const merged = [...primary]
  for (const show of secondary) {
    if (!seen.has(show.id)) {
      seen.add(show.id)
      merged.push(show)
    }
  }
  return merged
}

export function routedShowIdFromUrl(url: string): string | null {
  const path = url.split('#', 2)[0]!.split('?', 2)[0]!
  const match = /(?:^|\/)studio\/shows\/([^/]+)$/.exec(path)
  return match ? match[1]! : null
}

export function isBarrierAlreadySatisfied<T>(
  predicate: (show: T) => boolean,
  document: unknown,
): boolean {
  if (document === null || document === undefined) return false
  try {
    return predicate(document as T) === true
  } catch {
    return false
  }
}

export function v2RevisionAdvanced(
  current: number | undefined,
  snapshot: number | undefined,
): boolean {
  if (current === undefined) return false
  if (snapshot === undefined) return true
  return current > snapshot
}

export interface V2BindingProof {
  version: number
  sequence: number
}

export function isBindingProofFresh(
  proof: V2BindingProof | undefined,
  requiredSequence: number,
): boolean {
  return proof !== undefined && proof.version === 2 && proof.sequence >= requiredSequence
}
