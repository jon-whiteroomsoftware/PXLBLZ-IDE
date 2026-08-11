import { describe, it, expect, beforeEach, vi } from 'vitest'
import { __resetAutosaveSyncForTests, flushPendingAutosave, activeStuckSaveStatus, dismissNavigationSaveLoss } from './autosaveSync'
import { usePatternStore, patternInitialState } from './patternStore'
import { useEditorStore, editorInitialState } from './editorStore'
import { useMapStore, mapInitialState } from './mapStore'
import { useMixinStore, mixinInitialState } from './mixinStore'
import { libraryInitialState, useLibraryStore } from './libraryStore'
import { routerInitialState, useRouterStore } from './routerStore'
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
  __resetAutosaveSyncForTests()
  useRouterStore.setState(routerInitialState)
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

  it('records a failed attempt against its entity and clears it on the next success', async () => {
    const provider = memoryProvider([PATTERN])
    let offline = true
    provider.updatePattern = async () => {
      if (offline) throw new Error('offline')
    }
    setPersonalContentProvider(provider)
    openDirtyPattern('edited source')

    flushPendingAutosave()
    await settled()
    expect(useEditorStore.getState().autosaveFailedEntity).toMatchObject({ flavor: 'pattern', id: PATTERN.id })
    expect(activeStuckSaveStatus()).toMatchObject({ status: 'cant-save' })

    offline = false
    flushPendingAutosave()
    await settled()
    expect(useEditorStore.getState().autosaveFailedEntity).toBeNull()
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

describe('navigation flush outcomes (#810)', () => {
  it('reports a lost edit when a navigation flush fails, with Dismiss clearing it', async () => {
    const provider = memoryProvider([PATTERN])
    provider.updatePattern = async () => {
      throw new Error('offline')
    }
    setPersonalContentProvider(provider)
    openDirtyPattern('lost draft source')

    usePatternStore.getState().setActivePattern('pat-2')
    await settled()

    // The buffer moved on, so the loss is reported on the Studio notice
    // rather than the (new) active entity's glyph.
    expect(activeStuckSaveStatus()).toBeNull()
    expect(useEditorStore.getState().navigationSaveLosses).toEqual([
      { flavor: 'pattern', id: PATTERN.id, name: PATTERN.name },
    ])

    dismissNavigationSaveLoss('pattern', PATTERN.id)
    expect(useEditorStore.getState().navigationSaveLosses).toEqual([])
  })

  it('a navigation flush that succeeds reports nothing', async () => {
    const provider = memoryProvider([PATTERN])
    setPersonalContentProvider(provider)
    openDirtyPattern('clean draft source')

    usePatternStore.getState().setActivePattern('pat-2')
    await settled()

    expect(useEditorStore.getState().navigationSaveLosses).toEqual([])
    expect(usePatternStore.getState().userPatterns[0].src).toBe('clean draft source')
  })

  it('keeps the glyph path when the active buffer still holds (or extends) the draft', async () => {
    const provider = memoryProvider([PATTERN])
    provider.updatePattern = async () => {
      throw new Error('offline')
    }
    setPersonalContentProvider(provider)
    openDirtyPattern('live draft')

    flushPendingAutosave()
    await settled()

    expect(useEditorStore.getState().autosaveFailedEntity).toMatchObject({ id: PATTERN.id })
    expect(useEditorStore.getState().navigationSaveLosses).toEqual([])
  })

  it('a failure on one record never leaks cant-save onto the next record', async () => {
    const patternB: PatternRecord = { ...PATTERN, id: 'pat-b', name: 'Shine' }
    const provider = memoryProvider([PATTERN, patternB])
    provider.updatePattern = async () => {
      throw new Error('offline')
    }
    setPersonalContentProvider(provider)
    openDirtyPattern('failing draft A')
    flushPendingAutosave()
    await settled()
    expect(activeStuckSaveStatus()).toMatchObject({ status: 'cant-save' })

    // Open B and make a fresh clean edit: no B write has failed yet, so the
    // glyph must stay silent until B's own attempt fails.
    usePatternStore.setState({ userPatterns: [PATTERN, patternB] })
    usePatternStore.getState().setActivePattern(patternB.id)
    await settled()
    useEditorStore.setState({ source: 'fresh edit for B', compileStatus: 'good', isReadOnly: false })

    expect(activeStuckSaveStatus()).toBeNull()
  })

  it('serializes saves per record so a slow older write cannot clobber a newer one', async () => {
    const provider = memoryProvider([PATTERN])
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const written: string[] = []
    let call = 0
    const durableUpdate = provider.updatePattern
    provider.updatePattern = async (id, changes) => {
      call += 1
      if (call === 1) await firstGate
      if (typeof changes.src === 'string') written.push(changes.src)
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)

    openDirtyPattern('slow older S1')
    flushPendingAutosave()
    useEditorStore.setState({ source: 'newer S2' })
    usePatternStore.getState().setActivePattern('pat-2')
    // S1 is still pending; S2 must queue behind it, not race it.
    releaseFirst()
    await settled()

    expect(written).toEqual(['slow older S1', 'newer S2'])
    expect(usePatternStore.getState().userPatterns[0].src).toBe('newer S2')
  })

  it('dedupes in-flight writes per record, not per source text', async () => {
    const patternB: PatternRecord = { ...PATTERN, id: 'pat-b', name: 'Shine' }
    const provider = memoryProvider([PATTERN, patternB])
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const update = vi.fn(async (_id: string) => {
      await gate
    })
    provider.updatePattern = update
    setPersonalContentProvider(provider)

    // A's slow write is in flight when B flushes the identical source text:
    // B's write must still be attempted.
    openDirtyPattern('shared source text')
    flushPendingAutosave()
    usePatternStore.setState({ userPatterns: [PATTERN, patternB], activePatternId: patternB.id })
    useEditorStore.setState({ source: 'shared source text' })
    flushPendingAutosave()
    release()
    await settled()

    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls.map((call) => call[0]).sort()).toEqual(['pat-b', PATTERN.id].sort())
  })

  it('a queued map save persists its captured source, never a later broken buffer', async () => {
    const provider = memoryProvider([PATTERN])
    const mapWrites: Array<string | undefined> = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let mapCall = 0
    provider.updateMap = async (_id, changes) => {
      mapCall += 1
      if (mapCall === 1) await firstGate
      mapWrites.push(typeof changes.source === 'string' ? changes.source : undefined)
    }
    setPersonalContentProvider(provider)
    const mapRecord = {
      id: 'map-1',
      name: 'Bench map',
      dim: 2 as const,
      generator: 'custom' as const,
      params: {},
      source: '[[0,0],[1,0]]',
      updatedAt: 100,
    }
    useMapStore.setState({
      userMaps: [mapRecord],
      editingMap: { kind: 'existing', id: mapRecord.id },
      activePixelCount: 4,
    })
    useEditorStore.setState({
      source: '[[0,0],[1,0],[1,1]]',
      compileStatus: 'good',
      editorFlavor: 'map',
      isReadOnly: false,
    })
    flushPendingAutosave()

    // A clean follow-up draft queues, then the user types broken source.
    useEditorStore.setState({ source: '[[0,0],[0.5,0.5]]' })
    flushPendingAutosave()
    useEditorStore.setState({ source: 'not valid [', compileStatus: 'broken' })
    releaseFirst()
    await settled()

    expect(mapWrites).toHaveLength(2)
    expect(mapWrites[1]).toBe('[[0,0],[0.5,0.5]]')
    expect(useMapStore.getState().userMaps[0].source).toBe('[[0,0],[0.5,0.5]]')
  })

  it('reports a queued eval-failing map draft as lost instead of persisting it', async () => {
    const provider = memoryProvider([PATTERN])
    setPersonalContentProvider(provider)
    const mapRecord = {
      id: 'map-1',
      name: 'Bench map',
      dim: 2 as const,
      generator: 'custom' as const,
      params: {},
      source: '[[0,0],[1,0]]',
      updatedAt: 100,
    }
    useMapStore.setState({
      userMaps: [mapRecord],
      editingMap: { kind: 'existing', id: mapRecord.id },
      activePixelCount: 4,
    })
    // Parses (flush accepts it) but throws on eval; the user leaves map mode
    // before the write runs, so the captured-draft path takes over.
    useEditorStore.setState({
      source: "function(n){ throw new Error('boom') }",
      compileStatus: 'good',
      editorFlavor: 'map',
      isReadOnly: false,
    })
    useMapStore.getState().closeMapEditor()
    await settled()

    expect(useMapStore.getState().userMaps[0].source).toBe('[[0,0],[1,0]]')
    expect(useEditorStore.getState().navigationSaveLosses).toEqual([
      { flavor: 'map', id: mapRecord.id, name: mapRecord.name },
    ])
  })
})

describe('non-editor surfaces (#810 review round 8)', () => {
  it('a flush that fails after navigating to a Show surface reports a loss, not a hidden glyph', async () => {
    const provider = memoryProvider([PATTERN])
    provider.updatePattern = async () => {
      throw new Error('offline')
    }
    setPersonalContentProvider(provider)
    openDirtyPattern('draft before shows')
    useRouterStore.setState({ route: { kind: 'studio', entity: { kind: 'patterns', id: PATTERN.id } } })

    // Navigating to Shows leaves activePatternId set, but nothing on that
    // surface renders the glyph — the failure must surface as a loss notice.
    useRouterStore.setState({ route: { kind: 'studio', entity: { kind: 'shows', id: null } } })
    flushPendingAutosave()
    await settled()

    expect(useEditorStore.getState().autosaveFailedEntity).toBeNull()
    expect(useEditorStore.getState().navigationSaveLosses).toEqual([
      { flavor: 'pattern', id: PATTERN.id, name: PATTERN.name },
    ])
  })
})

describe('missing-route ownership (#810 review round 9)', () => {
  it('a not-found route on the same surface does not own the old draft', async () => {
    const provider = memoryProvider([PATTERN])
    provider.updatePattern = async () => {
      throw new Error('offline')
    }
    setPersonalContentProvider(provider)
    openDirtyPattern('draft on missing route')
    // The route points at a record that does not exist: the surface matches
    // but a not-found message renders instead of the editor, so a failure
    // must surface as a loss notice, not an invisible glyph flag.
    useRouterStore.setState({ route: { kind: 'studio', entity: { kind: 'patterns', id: 'missing-id' } } })
    flushPendingAutosave()
    await settled()

    expect(useEditorStore.getState().autosaveFailedEntity).toBeNull()
    expect(useEditorStore.getState().navigationSaveLosses).toEqual([
      { flavor: 'pattern', id: PATTERN.id, name: PATTERN.name },
    ])
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

describe('empty-buffer and reopen coherence (#810 review round 7)', () => {
  it('an emptied buffer shows wont-save and is never written', async () => {
    const provider = memoryProvider([PATTERN])
    const update = vi.spyOn(provider, 'updatePattern')
    setPersonalContentProvider(provider)
    openDirtyPattern('')

    expect(activeStuckSaveStatus()).toMatchObject({ status: 'wont-save' })
    flushPendingAutosave()
    usePatternStore.getState().setActivePattern('pat-2')
    await settled()

    expect(update).not.toHaveBeenCalled()
    expect(usePatternStore.getState().userPatterns[0].src).toBe(PATTERN.src)
  })

  it('refreshes an untouched reopened buffer when its pending save lands', async () => {
    const provider = memoryProvider([PATTERN])
    let releaseWrite!: () => void
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    const durableUpdate = provider.updatePattern
    provider.updatePattern = async (id, changes) => {
      await writeGate
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    openDirtyPattern('pending draft')
    flushPendingAutosave()

    // Navigate away and reopen before the save settles: the open path reloads
    // the stale persisted source (setSource, so bufferEdited stays false).
    usePatternStore.getState().setActivePattern('pat-2')
    usePatternStore.getState().setActivePattern(PATTERN.id)
    useEditorStore.getState().setSource(PATTERN.src)
    releaseWrite()
    await settled()

    // The buffer follows the successful save; a tick now writes nothing back.
    expect(useEditorStore.getState().source).toBe('pending draft')
    expect(usePatternStore.getState().userPatterns[0].src).toBe('pending draft')
  })

  it('never touches a reopened buffer the user has typed into', async () => {
    const provider = memoryProvider([PATTERN])
    let releaseWrite!: () => void
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    const durableUpdate = provider.updatePattern
    provider.updatePattern = async (id, changes) => {
      await writeGate
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    openDirtyPattern('pending draft')
    flushPendingAutosave()

    usePatternStore.getState().setActivePattern('pat-2')
    usePatternStore.getState().setActivePattern(PATTERN.id)
    // The user deliberately re-authors the old content in the editor.
    useEditorStore.getState().setEditedSource(PATTERN.src)
    releaseWrite()
    await settled()

    expect(useEditorStore.getState().source).toBe(PATTERN.src)
  })
})
