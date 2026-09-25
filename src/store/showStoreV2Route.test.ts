// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { showInitialState, useShowStore } from './showStore'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { createShowV2WithOutputContract } from '@/engine/showCreationV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'

/**
 * The Show list, fresh-Show creation and imported v2 Shows behind the one
 * route gate (#1056 slice 6). The v1 collections stay exactly as they are: a
 * v2 row is listed beside them, never inside `shows`.
 */
const CONTRACT = createInstallationShowOutputContract({ outputMapId: null, pixelCount: 60 })

function gate(enabled: boolean): void {
  window.history.replaceState({}, '', enabled ? '/studio?show-v2-editor=1' : '/studio')
}

function provider(overrides: Partial<PersonalContentProvider> = {}): {
  created: ShowRecordV2[]
  stored: ShowRecordV2[]
} {
  const created: ShowRecordV2[] = []
  const stored: ShowRecordV2[] = []
  setPersonalContentProvider({
    id: 'v2-route-store',
    listShows: async () => [],
    listShowDocumentsV2: async () => stored,
    createShowV2: async (record: ShowRecordV2) => { created.push(record); stored.push(record) },
    setLastActive: async () => {},
    ...overrides,
  } as unknown as PersonalContentProvider)
  return { created, stored }
}

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  gate(false)
})
afterEach(() => {
  resetPersonalContentProvider()
  gate(false)
  vi.restoreAllMocks()
})

describe('the gated v2 Show list', () => {
  it('lists stored v2 rows beside the v1 list however the URL is written (#1039)', async () => {
    const record = createShowV2WithOutputContract('listed', 'Listed v2', CONTRACT, 1)
    const { stored } = provider()
    stored.push(record)

    // The gate is the production default now, so the listing no longer depends
    // on the development preview parameter: a converted row is offered to every
    // user, beside whatever is still stored as v1.
    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().showV2Rows).toEqual([{ id: 'listed', name: 'Listed v2', updatedAt: 1 }])

    gate(true)
    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().showV2Rows).toEqual([{ id: 'listed', name: 'Listed v2', updatedAt: 1 }])
  })

  it('survives a provider that cannot list v2 documents at all', async () => {
    gate(true)
    provider({ listShowDocumentsV2: undefined })
    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().showV2Rows).toEqual([])
    expect(useShowStore.getState().showsLoaded).toBe(true)
  })

  it('reports a failed v2 listing as no rows rather than failing the workspace load', async () => {
    gate(true)
    provider({ listShowDocumentsV2: async () => { throw new Error('offline') } })
    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().showV2Rows).toEqual([])
    expect(useShowStore.getState().showsLoaded).toBe(true)
  })
})

describe('creating and importing a v2 Show', () => {
  it('persists a native fresh v2 Show, opens it in memory and lists it', async () => {
    gate(true)
    const { created } = provider()
    const record = await useShowStore.getState().createNewShowV2({ name: 'Fresh', outputContract: CONTRACT })

    expect(record.version).toBe(2)
    expect(record.composition.clips).toHaveLength(2)
    expect(created).toEqual([record])
    const state = useShowStore.getState()
    expect(state.showV2Rows.map((row) => row.id)).toEqual([record.id])
    // It is immediately editable: the route reads the same in-memory record.
    expect(state.showV2Pilots[record.id]).toEqual(record)
    expect(state.showV2Histories[record.id]).toEqual({ past: [], future: [] })
  })

  it('names a fresh Show uniquely across both listings', async () => {
    gate(true)
    provider()
    const first = await useShowStore.getState().createNewShowV2({ outputContract: CONTRACT })
    const second = await useShowStore.getState().createNewShowV2({ outputContract: CONTRACT })
    expect(first.name).toBe('Untitled Show')
    expect(second.name).not.toBe(first.name)
  })

  it('refuses to create or import when the workspace cannot store v2 records', async () => {
    gate(true)
    provider({ createShowV2: undefined })
    await expect(useShowStore.getState().createNewShowV2({ outputContract: CONTRACT }))
      .rejects.toThrow('This workspace cannot store version-2 Shows.')
    expect(useShowStore.getState().showV2Rows).toEqual([])
  })

  it('validates an imported v2 record before it reaches the provider', async () => {
    gate(true)
    const { created } = provider()
    const record = createShowV2WithOutputContract('imported', 'Imported', CONTRACT, 1)
    await useShowStore.getState().addImportedShowV2(record)
    expect(created.map((entry) => entry.id)).toEqual(['imported'])

    const invalid = { ...record, id: 'broken', composition: { ...record.composition, showEndMs: -1 } }
    await expect(useShowStore.getState().addImportedShowV2(invalid)).rejects.toThrow(/Invalid Show v2 record/)
    expect(created.map((entry) => entry.id)).toEqual(['imported'])
    expect(useShowStore.getState().showV2Rows.map((row) => row.id)).toEqual(['imported'])
  })
})
