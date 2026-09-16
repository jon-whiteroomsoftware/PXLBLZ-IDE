import { artifactHash } from './artifactStamp'
import { cloneValidShowRecordV2, isShowRecordV2, type ShowDocument } from './showDocument'
import type { ShowRecord } from './personalContentRecords'
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
  writeV2(id: string, sourceHash: string, record: ShowDocument): Promise<'written' | 'changed-source'>
  read(id: string): Promise<ShowDocument>
  record(outcome: ShowV2MigrationOutcome): Promise<void>
  restore(id: string): Promise<void>
}

export async function rehearseShowV2Migration(store: ShowV2MigrationStore): Promise<ShowV2MigrationOutcome[]> {
  const outcomes: ShowV2MigrationOutcome[] = []
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
      cloneValidShowRecordV2(source.document)
      const outcome = { id: source.id, sourceHash, sourceVersion: 2, status: 'already-v2' } as const
      await store.record(outcome)
      outcomes.push(outcome)
      continue
    }
    const converted = convertShowRecordV1ToV2(source.document as ShowRecord)
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
    if (await store.writeV2(source.id, sourceHash, candidate) === 'changed-source') {
      const outcome = { id: source.id, sourceHash, sourceVersion: 1, status: 'refused', detail: 'Source changed after inventory.' } as const
      await store.record(outcome)
      outcomes.push(outcome)
      continue
    }
    const reopened = cloneValidShowRecordV2(await store.read(source.id))
    if (JSON.stringify(reopened) !== JSON.stringify(candidate)) throw new Error(`Show "${source.id}" did not reopen byte-for-byte after conversion.`)
    const outcome = { id: source.id, sourceHash, sourceVersion: 1, status: 'converted' } as const
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
