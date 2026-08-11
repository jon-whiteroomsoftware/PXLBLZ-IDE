import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPendingAutosave, activeStuckSaveStatus, retryNavigationSaveFailure } from './autosaveSync'
import { usePatternStore, patternInitialState } from './patternStore'
import { useEditorStore, editorInitialState } from './editorStore'
import { useMapStore, mapInitialState } from './mapStore'
import { useMixinStore, mixinInitialState } from './mixinStore'
import { libraryInitialState, useLibraryStore } from './libraryStore'
import type { LibraryRecord, PatternRecord } from '@/engine/personalContentRecords'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'

function memoryProvider(seed: PatternRecord[] = []): PersonalContentProvider {
  const patterns = new Map<string, PatternRecord>(seed.map((p) => [p.id, p]))
  return {
    id: 'memory-test',
    listPatterns: async () => [...patterns.values()],
    createPattern: async (record) => {
      patterns.set(record.id, record)
    },
    updatePattern: async (id, changes) => {
      const existing = patterns.get(id)
      if (!existing) return
      patterns.set(id, { ...existing, ...changes })
    },
    deletePattern: async (id) => {
      patterns.delete(id)
    },
    listMaps: async () => [],
    createMap: async () => {},
    updateMap: async () => {},
    deleteMap: async () => {},
    listMixins: async () => [],
    createMixin: async () => {},
    updateMixin: async () => {},
    deleteMixin: async () => {},
    listLibraries: async () => [],
    createLibrary: async () => {},
    updateLibrary: async () => {},
    deleteLibrary: async () => {},
    listShows: async () => [],
    createShow: async () => {},
    updateShow: async () => {},
    deleteShow: async () => {},
    listControllerProfiles: async () => [],
    createControllerProfile: async () => {},
    updateControllerProfile: async () => {},
    deleteControllerProfile: async () => {},
    getLastActive: async () => undefined,
    setLastActive: async () => {},
    getDemoOverrides: async () => undefined,
    setDemoOverrides: async () => {},
  }
}

const PATTERN: PatternRecord = {
  id: 'pat-1',
  name: 'Glow',
  src: 'export function render(index) {}',
  controls: {},
  updatedAt: 1000,
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  usePatternStore.setState(patternInitialState)
  useEditorStore.setState(editorInitialState)
  useMapStore.setState(mapInitialState)
  useMixinStore.setState(mixinInitialState)
  useLibraryStore.setState(libraryInitialState)
  resetPersonalContentProvider()
})

function openDirtyPattern(buffer: string): void {
  usePatternStore.setState({ userPatterns: [PATTERN], activePatternId: PATTERN.id })
  useEditorStore.setState({
    source: buffer,
    compileStatus: 'good',
    editorFlavor: 'pattern',
    isReadOnly: false,
  })
}

describe('flushPendingAutosave (#810)', () => {
  it('persists the outgoing buffer when the active pattern changes', async () => {
    const provider = memoryProvider([PATTERN])
    const update = vi.spyOn(provider, 'updatePattern')
    setPersonalContentProvider(provider)
    openDirtyPattern('edited source')

    usePatternStore.getState().setActivePattern('pat-2')
    await settled()

    expect(update).toHaveBeenCalledWith(
      PATTERN.id,
      expect.objectContaining({ src: 'edited source' }),
    )
  })

  it('records a failed attempt in autosaveFailed and clears it on the next success', async () => {
    const provider = memoryProvider([PATTERN])
    let offline = true
    provider.updatePattern = async () => {
      if (offline) throw new Error('offline')
    }
    setPersonalContentProvider(provider)
    openDirtyPattern('edited source')

    flushPendingAutosave()
    await settled()
    expect(useEditorStore.getState().autosaveFailed).toBe(true)
    expect(activeStuckSaveStatus()).toMatchObject({ status: 'cant-save' })

    offline = false
    flushPendingAutosave()
    await settled()
    expect(useEditorStore.getState().autosaveFailed).toBe(false)
  })

  it('does not attempt broken source', async () => {
    const provider = memoryProvider([PATTERN])
    const update = vi.spyOn(provider, 'updatePattern')
    setPersonalContentProvider(provider)
    openDirtyPattern('broken(')
    useEditorStore.setState({ compileStatus: 'broken' })

    flushPendingAutosave()
    await settled()

    expect(update).not.toHaveBeenCalled()
    expect(activeStuckSaveStatus()).toMatchObject({ status: 'wont-save', lastSavedAt: 1000 })
  })

  it('dedupes the identical write while one is in flight', async () => {
    const provider = memoryProvider([PATTERN])
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const update = vi.fn(async () => {
      await gate
    })
    provider.updatePattern = update
    setPersonalContentProvider(provider)
    openDirtyPattern('edited source')

    flushPendingAutosave()
    flushPendingAutosave()
    flushPendingAutosave()
    release()
    await settled()

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('does not write for a record that no longer exists', async () => {
    const provider = memoryProvider()
    const update = vi.spyOn(provider, 'updatePattern')
    setPersonalContentProvider(provider)
    useEditorStore.setState({
      source: 'orphan buffer',
      compileStatus: 'good',
      editorFlavor: 'pattern',
      isReadOnly: false,
    })
    usePatternStore.setState({ userPatterns: [], activePatternId: 'deleted-id' })

    flushPendingAutosave()
    await settled()

    expect(update).not.toHaveBeenCalled()
  })

  it('is silent (no stuck status) for a clean dirty buffer between ticks', () => {
    setPersonalContentProvider(memoryProvider([PATTERN]))
    openDirtyPattern('edited source')
    expect(activeStuckSaveStatus()).toBeNull()
  })
})

describe('navigation save failure (#810 review P1)', () => {
  it('holds a draft whose navigation flush fails, then retries it on demand', async () => {
    const provider = memoryProvider([PATTERN])
    let offline = true
    const durableUpdate = provider.updatePattern
    provider.updatePattern = async (id, changes) => {
      if (offline) throw new Error('offline')
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    openDirtyPattern('held draft source')

    usePatternStore.getState().setActivePattern('pat-2')
    await settled()

    // The buffer moved on, so the failure is held for the notice rather than
    // flagged on the (new) active entity's glyph.
    expect(useEditorStore.getState().autosaveFailed).toBe(false)
    expect(useEditorStore.getState().navigationSaveFailure).toMatchObject({
      flavor: 'pattern',
      id: PATTERN.id,
      name: PATTERN.name,
      source: 'held draft source',
    })

    offline = false
    await retryNavigationSaveFailure()
    expect(useEditorStore.getState().navigationSaveFailure).toBeNull()
    expect(usePatternStore.getState().userPatterns[0].src).toBe('held draft source')
  })

  it('a still-failing retry keeps the held draft', async () => {
    const provider = memoryProvider([PATTERN])
    provider.updatePattern = async () => {
      throw new Error('offline')
    }
    setPersonalContentProvider(provider)
    openDirtyPattern('held draft source')
    usePatternStore.getState().setActivePattern('pat-2')
    await settled()

    await retryNavigationSaveFailure()
    expect(useEditorStore.getState().navigationSaveFailure).not.toBeNull()
  })

  it('drops a held draft once its record has advanced past the held timestamp', async () => {
    const provider = memoryProvider([PATTERN])
    let offline = true
    provider.updatePattern = async () => {
      if (offline) throw new Error('offline')
    }
    const update = vi.spyOn(provider, 'updatePattern')
    setPersonalContentProvider(provider)
    openDirtyPattern('held draft source')
    usePatternStore.getState().setActivePattern('pat-2')
    await settled()
    update.mockClear()

    // A newer durable save (another tab, another device) supersedes the draft.
    usePatternStore.setState((s) => ({
      userPatterns: s.userPatterns.map((p) =>
        p.id === PATTERN.id ? { ...p, src: 'newer content', updatedAt: 9999 } : p,
      ),
    }))
    offline = false
    await retryNavigationSaveFailure()

    expect(update).not.toHaveBeenCalled()
    expect(useEditorStore.getState().navigationSaveFailure).toBeNull()
    expect(usePatternStore.getState().userPatterns[0].src).toBe('newer content')
  })

  it('a flush that succeeds after navigation clears a stale held draft for that record', async () => {
    const provider = memoryProvider([PATTERN])
    setPersonalContentProvider(provider)
    useEditorStore.setState({
      navigationSaveFailure: {
        flavor: 'pattern',
        id: PATTERN.id,
        name: PATTERN.name,
        source: 'stale held copy',
        recordUpdatedAt: 1000,
      },
    })
    openDirtyPattern('edited source')

    flushPendingAutosave()
    await settled()

    expect(useEditorStore.getState().navigationSaveFailure).toBeNull()
  })
})

describe('library switch flush pairing (#810 review P1)', () => {
  const LIB_A: LibraryRecord = { id: 'lib-a', name: 'LibA', src: 'export function a() {}', updatedAt: 500 }
  const LIB_B: LibraryRecord = { id: 'lib-b', name: 'LibB', src: 'export function b() {}', updatedAt: 600 }

  it('flushes the outgoing buffer under the outgoing library id, never the destination', async () => {
    const provider = memoryProvider()
    const written: Array<{ id: string; src?: string }> = []
    provider.updateLibrary = async (id, changes) => {
      written.push({ id, src: changes.src })
    }
    setPersonalContentProvider(provider)
    useLibraryStore.setState({ userLibraries: [LIB_A, LIB_B], editingLibrary: { kind: 'existing', id: LIB_A.id } })
    useEditorStore.setState({
      source: 'export function a() { edited() }',
      compileStatus: 'good',
      editorFlavor: 'library',
      isReadOnly: false,
    })

    useLibraryStore.getState().openExistingLibrary(LIB_B)
    await settled()

    expect(written).toEqual([{ id: LIB_A.id, src: 'export function a() { edited() }' }])
  })
})
