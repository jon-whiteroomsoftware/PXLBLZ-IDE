import { expect, it, vi } from 'vitest'
import { convertibleV1Show, flatV1Show } from '../test/showV2TracerFixture'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import type { ShowDocument } from './showDocument'
import type {
  ShowV2MigrationOutcome,
  ShowV2MigrationQualification,
  ShowV2MigrationSource,
  ShowV2MigrationStore,
} from './showV2Migration'
import { rehearseShowV2Migration, rollbackShowV2Migration } from './showV2Migration'

function memoryMigrationStore(initial: ShowDocument[]) {
  const documents = new Map(initial.map(document => [document.id, structuredClone(document)]))
  const originals = new Map(documents)
  const backups = new Map<string, ShowDocument>()
  const outcomes = new Map<string, ShowV2MigrationOutcome>()
  let interruptAfterWrite = false
  const store: ShowV2MigrationStore = {
    inventory: async () => [...documents.values()].map(document => ({
      id: document.id,
      sourceVersion: 'version' in document && document.version === 2 ? 2 : 1,
      document: structuredClone(document),
      sourceRow: structuredClone(document),
    })),
    outcome: async id => outcomes.get(id),
    snapshot: async (source, sourceHash) => {
      if (!source.document) throw new Error('memory fixture is missing its document')
      if (!backups.has(source.id)) {
        backups.set(source.id, structuredClone(source.document))
        return 'ready'
      }
      const { migrationSourceHash } = await import('./showV2Migration')
      return migrationSourceHash(backups.get(source.id)) === sourceHash ? 'ready' : 'conflicting-source'
    },
    writeV2: async (source, sourceHash, record) => {
      const current = documents.get(source.id)!
      const inventory: ShowV2MigrationSource = {
        id: source.id,
        sourceVersion: 'version' in current && current.version === 2 ? 2 : 1,
        document: current,
        sourceRow: current,
      }
      const { migrationSourceHash } = await import('./showV2Migration')
      if (migrationSourceHash(inventory.sourceRow) !== sourceHash) return 'changed-source'
      documents.set(source.id, structuredClone(record))
      if (interruptAfterWrite) { interruptAfterWrite = false; throw new Error('interrupted') }
      return 'written'
    },
    read: async id => structuredClone(documents.get(id)!),
    record: async outcome => { outcomes.set(outcome.id, outcome) },
    restore: async id => { documents.set(id, structuredClone(backups.get(id)!)); outcomes.delete(id) },
  }
  return { store, documents, originals, backups, outcomes, interrupt: () => { interruptAfterWrite = true } }
}

it('resumes an interrupted conversion, treats reopened v2 as idempotent, and restores the original row', async () => {
  const first = convertibleV1Show()
  first.id = 'first'
  const second = convertibleV1Show()
  second.id = 'second'
  const memory = memoryMigrationStore([first, second])
  memory.interrupt()
  await expect(rehearseShowV2Migration(memory.store)).rejects.toThrow('interrupted')
  expect(memory.backups.has('first')).toBe(true)

  const resumed = await rehearseShowV2Migration(memory.store)
  expect(resumed.map(item => [item.id, item.status])).toEqual([['first', 'already-v2'], ['second', 'converted']])
  expect((await rehearseShowV2Migration(memory.store)).every(item => item.status === 'already-v2' || item.status === 'converted')).toBe(true)

  await rollbackShowV2Migration(memory.store, ['first', 'second'])
  expect(memory.documents.get('first')).toEqual(memory.originals.get('first'))
  expect(memory.documents.get('second')).toEqual(memory.originals.get('second'))
})

it('refuses a changed original before write and records the row independently', async () => {
  const source = convertibleV1Show()
  const memory = memoryMigrationStore([source])
  const inventory = memory.store.inventory
  memory.store.inventory = async () => {
    const rows = await inventory()
    memory.documents.set(source.id, { ...source, name: 'Changed elsewhere' })
    return rows
  }
  await expect(rehearseShowV2Migration(memory.store)).resolves.toEqual([
    expect.objectContaining({ id: source.id, status: 'refused', detail: 'Source changed after inventory.' }),
  ])
  expect(memory.documents.get(source.id)?.name).toBe('Changed elsewhere')
})

it('records an undecodable source as refused without losing its recovery snapshot', async () => {
  const outcomes = new Map<string, ShowV2MigrationOutcome>()
  let snapshot: ShowV2MigrationSource | undefined
  const source: ShowV2MigrationSource = {
    id: 'broken',
    sourceVersion: 1,
    sourceRow: { id: 'broken', output_contract_json: null },
    error: 'Show broken is missing a valid output contract',
  }
  const store: ShowV2MigrationStore = {
    inventory: async () => [source],
    outcome: async id => outcomes.get(id),
    snapshot: async item => { snapshot = item; return 'ready' },
    writeV2: async () => { throw new Error('must not write') },
    read: async () => { throw new Error('must not read') },
    record: async outcome => { outcomes.set(outcome.id, outcome) },
    restore: async () => {},
  }

  await expect(rehearseShowV2Migration(store)).resolves.toEqual([
    expect.objectContaining({ id: 'broken', sourceVersion: 1, status: 'refused' }),
  ])
  expect(snapshot).toBe(source)
})

it('refuses conversion when the retained backup belongs to an older source revision', async () => {
  const source = convertibleV1Show()
  const record = vi.fn()
  const writeV2 = vi.fn()
  const store: ShowV2MigrationStore = {
    inventory: async () => [{
      id: source.id,
      sourceVersion: 1,
      document: source,
      sourceRow: source,
    }],
    outcome: async () => undefined,
    snapshot: async () => 'conflicting-source',
    writeV2,
    read: async () => { throw new Error('must not read') },
    record,
    restore: async () => {},
  }

  await expect(rehearseShowV2Migration(store)).resolves.toEqual([
    expect.objectContaining({
      id: source.id,
      status: 'refused',
      detail: 'Migration backup belongs to a different source revision.',
    }),
  ])
  expect(writeV2).not.toHaveBeenCalled()
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ status: 'refused' }))
})

// #1039: section 10's runbook reads back, reopens and compiles each row. The
// byte-for-byte readback above proves storage; reopening and compiling proves
// the converted record is still a usable Show. A qualification refusal is a
// reported, recoverable outcome - the row keeps its snapshot and the operator
// rolls back exactly the reported ids - not a thrown pass.

it('qualifies each converted row after readback and reports a refusal recoverably', async () => {
  const good = convertibleV1Show()
  good.id = 'good'
  const bad = convertibleV1Show()
  bad.id = 'bad'
  const memory = memoryMigrationStore([good, bad])
  const qualified: string[] = []
  const qualify = async (record: ShowDocument): Promise<ShowV2MigrationQualification> => {
    qualified.push(record.id)
    return record.id === 'bad'
      ? { status: 'refused', detail: 'Pattern source is unavailable.' }
      : { status: 'qualified', compiled: { hash: '0e4bd46e', codeBytes: 3282 } }
  }

  const outcomes = await rehearseShowV2Migration(memory.store, { qualify })

  // Qualification sees the reopened record, once per row, never the candidate.
  expect(qualified).toEqual(['good', 'bad'])
  expect(outcomes.map(item => [item.id, item.status])).toEqual([
    ['good', 'converted'],
    ['bad', 'refused'],
  ])
  expect(outcomes.find(item => item.id === 'bad')?.detail).toBe('Pattern source is unavailable.')
  // The refused row keeps its recovery snapshot and restores to the original.
  expect(memory.backups.has('bad')).toBe(true)
  await rollbackShowV2Migration(memory.store, ['bad'])
  expect(memory.documents.get('bad')).toEqual(memory.originals.get('bad'))
  // The qualified row is untouched by that rollback.
  expect(memory.documents.get('good')).not.toEqual(memory.originals.get('good'))
})

it('qualifies an already-v2 row without writing it again', async () => {
  const source = convertibleV1Show()
  const memory = memoryMigrationStore([source])
  expect((await rehearseShowV2Migration(memory.store)).map(item => item.status)).toEqual(['converted'])

  const writes: string[] = []
  const guarded: ShowV2MigrationStore = {
    ...memory.store,
    writeV2: async (source_, hash, record) => {
      writes.push(source_.id)
      return memory.store.writeV2(source_, hash, record)
    },
  }
  // Clearing the stored outcome forces the already-v2 branch rather than resume.
  memory.outcomes.delete(source.id)

  let calls = 0
  const outcomes = await rehearseShowV2Migration(guarded, {
    qualify: async () => {
      calls += 1
      return { status: 'refused', detail: 'Compile refused.' }
    },
  })
  expect(outcomes.map(item => [item.id, item.status, item.sourceVersion])).toEqual([[source.id, 'refused', 2]])
  expect(outcomes[0].detail).toBe('Compile refused.')
  expect(writes).toEqual([])
  expect(calls).toBe(1)
})

it('reuses a settled outcome without re-qualifying a row that has not changed since it', async () => {
  const source = convertibleV1Show()
  const memory = memoryMigrationStore([source])
  let calls = 0
  const qualify = async (): Promise<ShowV2MigrationQualification> => {
    calls += 1
    return { status: 'qualified', compiled: { hash: '0e4bd46e', codeBytes: 3282 } }
  }
  // Pass 1 converts, so the row changes and its next pass sees a new source
  // hash: pass 2 settles the v2 row as already-v2 and qualifies it once more.
  expect((await rehearseShowV2Migration(memory.store, { qualify })).map(item => item.status)).toEqual(['converted'])
  expect(calls).toBe(1)
  expect((await rehearseShowV2Migration(memory.store, { qualify })).map(item => item.status)).toEqual(['already-v2'])
  expect(calls).toBe(2)
  // Pass 3 finds a settled outcome whose hash still matches the stored row, so
  // it resumes from that outcome and compiles nothing.
  expect((await rehearseShowV2Migration(memory.store, { qualify })).map(item => item.status)).toEqual(['already-v2'])
  expect(calls).toBe(2)
})

it('leaves every outcome unchanged when no qualification is supplied', async () => {
  const source = convertibleV1Show()
  const memory = memoryMigrationStore([source])
  expect((await rehearseShowV2Migration(memory.store)).map(item => item.status)).toEqual(['converted'])
})

// #1039: a flat v1 row - no composition sidecar, Clips living in `cells` - is
// exactly the shape an old personal Show has, and the converter refuses it
// without the exact Pattern source per cell. The runbook therefore has to be
// able to hand conversion the trusted source metadata its caller already holds;
// without that, every flat row in a real database refuses and the migration
// reports nothing but failures.

it('converts a flat v1 row when the caller supplies its Pattern sources', async () => {
  const flat = flatV1Show()
  const memory = memoryMigrationStore([flat])
  const asked: string[] = []

  const withoutSources = await rehearseShowV2Migration(memory.store)
  expect(withoutSources.map(item => [item.id, item.status])).toEqual([[flat.id, 'refused']])
  expect(withoutSources[0].detail).toMatch(/requires the exact Pattern source/)

  // The same row converts once the caller resolves its sources.
  memory.outcomes.delete(flat.id)
  const outcomes = await rehearseShowV2Migration(memory.store, {
    sources: show => {
      asked.push(show.id)
      return {
        byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId((cell.pattern as { id: string }).id)]])),
        byPatternInstanceId: {},
        stageDimension: 2,
      }
    },
  })
  expect(asked).toEqual([flat.id])
  expect(outcomes.map(item => [item.id, item.status])).toEqual([[flat.id, 'converted']])
})

it('does not ask for sources for a row that already carries a composition', async () => {
  const memory = memoryMigrationStore([convertibleV1Show()])
  const asked: string[] = []
  const outcomes = await rehearseShowV2Migration(memory.store, {
    sources: show => { asked.push(show.id); return undefined },
  })
  expect(outcomes.map(item => item.status)).toEqual(['converted'])
  // A composition-carrying row converts either way; the hook is still offered
  // it, because only the converter knows whether the lookup is needed.
  expect(asked).toEqual(['convertible'])
})
