import { expect, it, vi } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import type { ShowDocument } from './showDocument'
import type { ShowV2MigrationOutcome, ShowV2MigrationSource, ShowV2MigrationStore } from './showV2Migration'
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
