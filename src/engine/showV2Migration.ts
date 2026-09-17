import { artifactHash } from './artifactStamp'
import { cloneValidShowRecordV2, isShowRecordV2, type ShowDocument } from './showDocument'
import type { ShowRecord } from './personalContentRecords'
import type { ShowCompileRecipeSourceLookup } from './showModel'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'

export interface ShowV2MigrationSource {
  id: string
  sourceVersion: 1 | 2
  document?: ShowDocument
  error?: string
  sourceRow: unknown
}

export interface ShowV2MigrationOutcome {
  id: string
  sourceHash: string
  sourceVersion: 1 | 2
  status: 'converted' | 'already-v2' | 'refused'
  detail?: string
}

export interface ShowV2MigrationStore {
  inventory(): Promise<ShowV2MigrationSource[]>
  outcome(id: string): Promise<ShowV2MigrationOutcome | undefined>
  snapshot(source: ShowV2MigrationSource, sourceHash: string): Promise<'ready' | 'conflicting-source'>
  writeV2(source: ShowV2MigrationSource, sourceHash: string, record: ShowDocument): Promise<'written' | 'changed-source'>
  read(id: string): Promise<ShowDocument>
  record(outcome: ShowV2MigrationOutcome): Promise<void>
  restore(id: string): Promise<void>
}

/**
 * Whether a stored v2 row still reopens and compiles as a usable Show.
 *
 * A qualified row carries the compiled artifact's hash and size. That is the
 * evidence the runbook's per-row report keeps: a status alone cannot
 * distinguish a row that compiled from one whose compile step was skipped.
 */
export type ShowV2MigrationQualification =
  | { status: 'qualified'; compiled: { hash: string; codeBytes: number } }
  | { status: 'refused'; detail: string }

export interface ShowV2MigrationOptions {
  /**
   * Reopen and compile the row as it was read back from storage (#1039).
   * The runbook's readback step proves the bytes survive; this proves the
   * record is still a usable Show. It receives the reopened document, never
   * the in-memory candidate, and runs once per unsettled row - after a write
   * for a converted row, and without any write for an already-v2 row. A
   * refusal is a reported outcome: the row keeps its recovery snapshot and
   * the operator rolls back exactly the reported identities.
   */
  qualify?(record: ShowDocument): Promise<ShowV2MigrationQualification>
  /**
   * Trusted Pattern source metadata for one v1 row's conversion (#1039).
   *
   * A flat v1 row - no composition sidecar, Clips in `cells` - is the shape an
   * old personal Show has, and the converter refuses it without the exact
   * source per cell. The migration owner cannot resolve sources itself without
   * becoming a dependency resolver, so the caller that already holds the
   * Patterns supplies them here. Returning undefined leaves conversion to
   * refuse, which is the correct outcome for a row whose sources are genuinely
   * gone.
   */
  sources?(show: ShowRecord): ShowCompileRecipeSourceLookup | undefined
}

export async function rehearseShowV2Migration(
  store: ShowV2MigrationStore,
  options: ShowV2MigrationOptions = {},
): Promise<ShowV2MigrationOutcome[]> {
  const outcomes: ShowV2MigrationOutcome[] = []
  const qualify = async (
    record: ShowDocument,
    settled: ShowV2MigrationOutcome,
  ): Promise<ShowV2MigrationOutcome> => {
    if (!options.qualify) return settled
    const result = await options.qualify(record)
    return result.status === 'qualified'
      ? settled
      : { id: settled.id, sourceHash: settled.sourceHash, sourceVersion: settled.sourceVersion, status: 'refused', detail: result.detail }
  }
  for (const source of await store.inventory()) {
    const sourceHash = migrationSourceHash(source.sourceRow)
    const previous = await store.outcome(source.id)
    if (previous?.sourceHash === sourceHash && (previous.status === 'converted' || previous.status === 'already-v2')) {
      outcomes.push(previous)
      continue
    }
    if (source.sourceVersion === 1 && await store.snapshot(source, sourceHash) === 'conflicting-source') {
      const outcome = {
        id: source.id,
        sourceHash,
        sourceVersion: source.sourceVersion,
        status: 'refused',
        detail: 'Migration backup belongs to a different source revision.',
      } as const
      await store.record(outcome)
      outcomes.push(outcome)
      continue
    }
    if (!source.document) {
      const outcome = {
        id: source.id,
        sourceHash,
        sourceVersion: source.sourceVersion,
        status: 'refused',
        detail: source.error ?? 'Stored Show could not be decoded.',
      } as const
      await store.record(outcome)
      outcomes.push(outcome)
      continue
    }
    if (isShowRecordV2(source.document)) {
      const reopened = cloneValidShowRecordV2(source.document)
      const outcome = await qualify(reopened, { id: source.id, sourceHash, sourceVersion: 2, status: 'already-v2' })
      await store.record(outcome)
      outcomes.push(outcome)
      continue
    }
    const v1 = source.document as ShowRecord
    const converted = convertShowRecordV1ToV2(v1, options.sources?.(v1))
    if (converted.status === 'refused') {
      const outcome = {
        id: source.id, sourceHash, sourceVersion: 1, status: 'refused',
        detail: converted.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '),
      } as const
      await store.record(outcome)
      outcomes.push(outcome)
      continue
    }
    const candidate = cloneValidShowRecordV2(converted.record)
    if (await store.writeV2(source, sourceHash, candidate) === 'changed-source') {
      const outcome = { id: source.id, sourceHash, sourceVersion: 1, status: 'refused', detail: 'Source changed after inventory.' } as const
      await store.record(outcome)
      outcomes.push(outcome)
      continue
    }
    const reopened = cloneValidShowRecordV2(await store.read(source.id))
    if (JSON.stringify(reopened) !== JSON.stringify(candidate)) throw new Error(`Show "${source.id}" did not reopen byte-for-byte after conversion.`)
    const outcome = await qualify(reopened, { id: source.id, sourceHash, sourceVersion: 1, status: 'converted' })
    await store.record(outcome)
    outcomes.push(outcome)
  }
  return outcomes
}

export async function rollbackShowV2Migration(store: ShowV2MigrationStore, ids: readonly string[]): Promise<void> {
  for (const id of ids) await store.restore(id)
}

export function migrationSourceHash(sourceRow: unknown): string {
  return artifactHash(JSON.stringify(sourceRow))
}
