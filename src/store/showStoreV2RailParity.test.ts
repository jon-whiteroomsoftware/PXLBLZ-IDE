// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { showInitialState, useShowStore } from './showStore'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { createShowV2WithOutputContract } from '@/engine/showCreationV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import { ShowV1RetiredError } from '@/engine/remotePersonalContentProvider'

/**
 * A stored v2 row is an ordinary personal Show in the Shows rail (#1039).
 *
 * #1056 landed the v2 row as a listed, openable document that the rail could
 * neither rename, duplicate nor trash. Activation makes those three the same
 * operations a v1 row offers, because the rail is one list and the cutover
 * must not narrow what a personal Show can do.
 */
const CONTRACT = createInstallationShowOutputContract({ outputMapId: null, pixelCount: 60 })

function gate(enabled: boolean): void {
  window.history.replaceState({}, '', enabled ? '/studio?show-v2-editor=1' : '/studio')
}

function provider(seed: ShowRecordV2[] = []) {
  const stored = [...seed]
  const deleted: string[] = []
  setPersonalContentProvider({
    id: 'v2-rail-parity',
    listShows: async () => [],
    listShowDocumentsV2: async () => stored.map(record => structuredClone(record)),
    createShowV2: async (record: ShowRecordV2) => { stored.push(structuredClone(record)) },
    replaceShowV2: async (id: string, record: ShowRecordV2) => {
      const index = stored.findIndex(candidate => candidate.id === id)
      if (index < 0) throw new Error(`No stored v2 Show "${id}".`)
      stored[index] = structuredClone(record)
    },
    deleteShow: async (id: string) => {
      deleted.push(id)
      const index = stored.findIndex(candidate => candidate.id === id)
      if (index >= 0) stored.splice(index, 1)
    },
    setLastActive: async () => {},
  } as unknown as PersonalContentProvider)
  return { stored, deleted }
}

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  gate(true)
})
afterEach(() => {
  resetPersonalContentProvider()
  gate(false)
})

describe('renaming a v2 row from the rail', () => {
  it('renames a stored row that is not open and shows the new name in the list', async () => {
    const { stored } = provider([createShowV2WithOutputContract('row', 'Before', CONTRACT, 1)])
    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().showV2Rows.map(row => row.name)).toEqual(['Before'])

    await useShowStore.getState().renameShow('row', 'After')

    expect(stored[0].name).toBe('After')
    expect(useShowStore.getState().showV2Rows.map(row => row.name)).toEqual(['After'])
    // Renaming a listed row never opens it as the route's working copy.
    expect(useShowStore.getState().showV2Pilots.row).toBeUndefined()
  })

  it('renames the open record and the list row together', async () => {
    const { stored } = provider([createShowV2WithOutputContract('row', 'Before', CONTRACT, 1)])
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot('row')

    await useShowStore.getState().renameShow('row', 'Open rename')

    expect(useShowStore.getState().showV2Pilots.row.name).toBe('Open rename')
    expect(useShowStore.getState().showV2Rows.map(row => row.name)).toEqual(['Open rename'])
    expect(stored[0].name).toBe('Open rename')
  })

  it('is a no-op for the same name', async () => {
    const { stored } = provider([createShowV2WithOutputContract('row', 'Same', CONTRACT, 1)])
    await useShowStore.getState().loadShows()
    const before = useShowStore.getState().showV2Rows

    await useShowStore.getState().renameShow('row', 'Same')

    expect(useShowStore.getState().showV2Rows).toBe(before)
    expect(stored[0].updatedAt).toBe(1)
  })
})

describe('duplicating a v2 row from the rail', () => {
  it('stores an independent copy under a fresh identity and a free name', async () => {
    const { stored } = provider([createShowV2WithOutputContract('row', 'Source', CONTRACT, 1)])
    await useShowStore.getState().loadShows()

    const copy = await useShowStore.getState().duplicateShowV2Row('row')

    expect(copy).not.toBeNull()
    expect(copy!.id).not.toBe('row')
    expect(copy!.name).toBe('Source copy')
    expect(stored.map(record => record.id).sort()).toEqual([copy!.id, 'row'].sort())
    expect(useShowStore.getState().showV2Rows.map(row => row.id)).toContain(copy!.id)
  })

  it('copies the open working record rather than the last stored bytes', async () => {
    const { stored } = provider([createShowV2WithOutputContract('row', 'Source', CONTRACT, 1)])
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot('row')
    // What the user sees is the open record; stored bytes that diverged behind
    // the route are not what a duplicate copies.
    stored[0] = createShowV2WithOutputContract('row', 'Stale bytes', CONTRACT, 1)

    const copy = await useShowStore.getState().duplicateShowV2Row('row')

    expect(copy!.name).toBe('Source copy')
  })

  it('resolves null for an unknown row', async () => {
    provider()
    await useShowStore.getState().loadShows()
    expect(await useShowStore.getState().duplicateShowV2Row('absent')).toBeNull()
  })

  it('copies a caller-supplied record rather than the pilot or stored bytes', async () => {
    const { stored } = provider([createShowV2WithOutputContract('row', 'Stored', CONTRACT, 1)])
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot('row')
    // The open working copy and the stored bytes both disagree with the
    // transient projection the caller passes; the copy keeps the projection.
    stored[0] = createShowV2WithOutputContract('row', 'Stale bytes', CONTRACT, 1)
    const source = createShowV2WithOutputContract('other', 'Projected', CONTRACT, 2)

    const copy = await useShowStore.getState().duplicateShowV2Row('row', source)

    expect(copy).not.toBeNull()
    expect(copy!.id).not.toBe(source.id)
    expect(copy!.name).toBe('Projected copy')
    expect(copy).toEqual({ ...source, id: copy!.id, name: 'Projected copy', updatedAt: copy!.updatedAt })
    expect(stored.map(record => record.id)).toContain(copy!.id)
  })
})

describe('trashing a v2 row from the rail', () => {
  it('deletes the stored row and forgets its session state', async () => {
    const { stored, deleted } = provider([createShowV2WithOutputContract('row', 'Doomed', CONTRACT, 1)])
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot('row')
    useShowStore.setState({ activeShowId: 'row' })

    await useShowStore.getState().removeShow('row')

    expect(deleted).toEqual(['row'])
    expect(stored).toEqual([])
    expect(useShowStore.getState().showV2Rows).toEqual([])
    expect(useShowStore.getState().showV2Pilots.row).toBeUndefined()
    expect(useShowStore.getState().showV2Histories.row).toBeUndefined()
    expect(useShowStore.getState().activeShowId).toBeNull()
  })

  it('keeps the row when the provider refuses the delete', async () => {
    setPersonalContentProvider({
      id: 'v2-rail-parity-refusing',
      listShows: async () => [],
      listShowDocumentsV2: async () => [createShowV2WithOutputContract('row', 'Kept', CONTRACT, 1)],
      replaceShowV2: async () => {},
      deleteShow: async () => { throw new Error('offline') },
      setLastActive: async () => {},
    } as unknown as PersonalContentProvider)
    await useShowStore.getState().loadShows()

    await expect(useShowStore.getState().removeShow('row')).rejects.toThrow('offline')
    expect(useShowStore.getState().showV2Rows.map(row => row.id)).toEqual(['row'])
  })
})

describe('hydration behind the retired v1 list (#1042)', () => {
  afterEach(() => resetPersonalContentProvider())

  it('loads the stored v2 rows when the provider refuses the v1 list as retired', async () => {
    gate(true)
    useShowStore.setState(showInitialState)
    const row = createShowV2WithOutputContract('v2-only', 'Only v2', CONTRACT, 1)
    setPersonalContentProvider({
      id: 'v1-retired',
      listShows: () => Promise.reject(new ShowV1RetiredError()),
      listShowDocumentsV2: async () => [structuredClone(row)],
    } as unknown as PersonalContentProvider)

    await useShowStore.getState().loadShows()

    expect(useShowStore.getState()).toMatchObject({
      shows: [],
      showsLoaded: true,
      showV2Rows: [{ id: 'v2-only', name: 'Only v2', updatedAt: 1 }],
    })
  })

  it('still rejects hydration for any other v1 list failure', async () => {
    useShowStore.setState(showInitialState)
    setPersonalContentProvider({
      id: 'v1-offline',
      listShows: () => Promise.reject(new Error('offline')),
      listShowDocumentsV2: async () => [],
    } as unknown as PersonalContentProvider)

    await expect(useShowStore.getState().loadShows()).rejects.toThrow('offline')
  })
})
