import { describe, it, expect, beforeEach, vi } from 'vitest'
import { __resetAutosaveSyncForTests, flushPendingAutosave, activeStuckSaveStatus, retryNavigationSaveFailure } from './autosaveSync'
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
  __resetAutosaveSyncForTests()
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
    expect(activeStuckSaveStatus()).toBeNull()
    expect(useEditorStore.getState().navigationSaveFailures).toEqual([
      expect.objectContaining({
        flavor: 'pattern',
        id: PATTERN.id,
        name: PATTERN.name,
        source: 'held draft source',
        baseSrc: PATTERN.src,
      }),
    ])

    offline = false
    await retryNavigationSaveFailure('pattern', PATTERN.id)
    expect(useEditorStore.getState().navigationSaveFailures).toEqual([])
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

    await retryNavigationSaveFailure('pattern', PATTERN.id)
    expect(useEditorStore.getState().navigationSaveFailures).toHaveLength(1)
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
    await retryNavigationSaveFailure('pattern', PATTERN.id)

    expect(update).not.toHaveBeenCalled()
    expect(useEditorStore.getState().navigationSaveFailures).toEqual([])
    expect(usePatternStore.getState().userPatterns[0].src).toBe('newer content')
  })

  it('never holds a draft superseded while its write was in flight', async () => {
    // S1 (older draft) is pending when a newer save S2 lands; S1 then fails
    // after navigation. Its draft must not be held: Retry would offer to
    // overwrite the newer durable content.
    const provider = memoryProvider([PATTERN])
    let rejectS1!: (cause: Error) => void
    const s1Gate = new Promise<void>((_resolve, reject) => {
      rejectS1 = reject
    })
    provider.updatePattern = async () => s1Gate
    setPersonalContentProvider(provider)
    openDirtyPattern('older draft S1')
    flushPendingAutosave()
    // Let the chained write start (and capture its base) before the record
    // moves: same-client saves are chain-ordered, so a mid-flight advance can
    // only come from outside this client.
    await settled()

    // S2 lands durably (e.g. from another tab) and advances the record.
    usePatternStore.setState((s) => ({
      userPatterns: s.userPatterns.map((p) =>
        p.id === PATTERN.id ? { ...p, src: 'newer durable S2', updatedAt: 2000 } : p,
      ),
    }))
    usePatternStore.getState().setActivePattern('pat-2')
    rejectS1(new Error('offline'))
    await settled()

    expect(useEditorStore.getState().navigationSaveFailures).toEqual([])
    expect(usePatternStore.getState().userPatterns[0].src).toBe('newer durable S2')
  })

  it('holds the draft when its record was reopened clean before the failure settled', async () => {
    // Edit A, switch away, reopen A (buffer reloads the stale persisted
    // source), then the original write fails: the draft exists nowhere else.
    const provider = memoryProvider([PATTERN])
    let rejectWrite!: (cause: Error) => void
    const writeGate = new Promise<void>((_resolve, reject) => {
      rejectWrite = reject
    })
    provider.updatePattern = async () => writeGate
    setPersonalContentProvider(provider)
    openDirtyPattern('reopened-lost draft')
    flushPendingAutosave()

    // Reopen A clean from the record before the write settles.
    useEditorStore.setState({ source: PATTERN.src })
    rejectWrite(new Error('offline'))
    await settled()

    expect(useEditorStore.getState().navigationSaveFailures).toEqual([
      expect.objectContaining({ id: PATTERN.id, source: 'reopened-lost draft' }),
    ])
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
    expect(useEditorStore.getState().navigationSaveFailures).toEqual([])
  })

  it('holds independent drafts for different records at the same time', async () => {
    const patternB: PatternRecord = { ...PATTERN, id: 'pat-b', name: 'Shine' }
    const provider = memoryProvider([PATTERN, patternB])
    let offline = true
    const durableUpdate = provider.updatePattern
    provider.updatePattern = async (id, changes) => {
      if (offline) throw new Error('offline')
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)

    openDirtyPattern('draft for A')
    usePatternStore.setState({ userPatterns: [PATTERN, patternB] })
    usePatternStore.getState().setActivePattern(patternB.id)
    await settled()
    useEditorStore.setState({ source: 'draft for B', compileStatus: 'good', isReadOnly: false })
    usePatternStore.getState().setActivePattern('pat-elsewhere')
    await settled()

    const held = useEditorStore.getState().navigationSaveFailures
    expect(held.map((draft) => draft.id).sort()).toEqual(['pat-b', PATTERN.id].sort())

    // Retrying one draft leaves the other held.
    offline = false
    await retryNavigationSaveFailure('pattern', PATTERN.id)
    expect(useEditorStore.getState().navigationSaveFailures.map((draft) => draft.id)).toEqual([patternB.id])
  })

  it('a flush that succeeds after navigation clears a stale held draft for that record', async () => {
    const provider = memoryProvider([PATTERN])
    setPersonalContentProvider(provider)
    useEditorStore.setState({
      navigationSaveFailures: [{
        flavor: 'pattern',
        id: PATTERN.id,
        name: PATTERN.name,
        source: 'stale held copy',
        baseSrc: PATTERN.src,
      }],
    })
    openDirtyPattern('edited source')

    flushPendingAutosave()
    await settled()

    expect(useEditorStore.getState().navigationSaveFailures).toEqual([])
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
})

describe('held draft supersession and ordering (#810 review round 3)', () => {
  it('a no-op save of unchanged source never discards a held draft', async () => {
    // Reopen a record with a held draft: the buffer loads the persisted
    // source and the tick's save resolves without writing. The held draft is
    // still the only copy and must survive that no-op.
    const provider = memoryProvider([PATTERN])
    setPersonalContentProvider(provider)
    useEditorStore.setState({
      navigationSaveFailures: [{
        flavor: 'pattern',
        id: PATTERN.id,
        name: PATTERN.name,
        source: 'held-only draft',
        baseSrc: PATTERN.src,
      }],
    })
    openDirtyPattern(PATTERN.src)

    flushPendingAutosave()
    await settled()

    expect(useEditorStore.getState().navigationSaveFailures).toHaveLength(1)
  })

  it('a rename never supersedes a held source draft', async () => {
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

    // A metadata write advances updatedAt without touching src.
    usePatternStore.setState((s) => ({
      userPatterns: s.userPatterns.map((p) =>
        p.id === PATTERN.id ? { ...p, name: 'Renamed', updatedAt: 9999 } : p,
      ),
    }))
    offline = false
    await retryNavigationSaveFailure('pattern', PATTERN.id)

    expect(useEditorStore.getState().navigationSaveFailures).toEqual([])
    expect(usePatternStore.getState().userPatterns[0].src).toBe('held draft source')
  })

  it('serializes saves per record so a slow older write cannot clobber a newer one', async () => {
    const provider = memoryProvider([PATTERN])
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const written: string[] = []
    let call = 0
    provider.updatePattern = async (_id, changes) => {
      call += 1
      if (call === 1) await firstGate
      if (typeof changes.src === 'string') written.push(changes.src)
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
})

describe('chained write re-basing and revalidation (#810 review round 4)', () => {
  it('holds the newest draft when a queued follow-up save fails after navigation', async () => {
    // S1 (slow) succeeds; queued S2 then fails after the user navigated. S2
    // re-based on S1 when it ran, so it must be held, not treated as
    // superseded by S1's landing.
    const provider = memoryProvider([PATTERN])
    let releaseS1!: () => void
    const s1Gate = new Promise<void>((resolve) => {
      releaseS1 = resolve
    })
    let call = 0
    const durableUpdate = provider.updatePattern
    provider.updatePattern = async (id, changes) => {
      call += 1
      if (call === 1) {
        await s1Gate
        await durableUpdate(id, changes)
        return
      }
      throw new Error('offline')
    }
    setPersonalContentProvider(provider)

    openDirtyPattern('first save S1')
    flushPendingAutosave()
    useEditorStore.setState({ source: 'newest draft S2' })
    usePatternStore.getState().setActivePattern('pat-2')
    releaseS1()
    await settled()

    expect(usePatternStore.getState().userPatterns[0].src).toBe('first save S1')
    expect(useEditorStore.getState().navigationSaveFailures).toEqual([
      expect.objectContaining({
        id: PATTERN.id,
        source: 'newest draft S2',
        baseSrc: 'first save S1',
      }),
    ])
  })

  it('a Retry queued behind a newer in-flight save drops instead of overwriting it', async () => {
    const provider = memoryProvider([PATTERN])
    let releaseNewer!: () => void
    const newerGate = new Promise<void>((resolve) => {
      releaseNewer = resolve
    })
    const written: string[] = []
    let call = 0
    const durableUpdate = provider.updatePattern
    provider.updatePattern = async (id, changes) => {
      call += 1
      if (call === 1) await newerGate
      if (typeof changes.src === 'string') written.push(changes.src)
      await durableUpdate(id, changes)
    }
    setPersonalContentProvider(provider)
    useEditorStore.setState({
      navigationSaveFailures: [{
        flavor: 'pattern',
        id: PATTERN.id,
        name: PATTERN.name,
        source: 'old held draft',
        baseSrc: PATTERN.src,
      }],
    })
    openDirtyPattern('newer live edit')

    flushPendingAutosave()
    const retried = retryNavigationSaveFailure('pattern', PATTERN.id)
    releaseNewer()
    await retried
    await settled()

    // The newer save landed; the Retry revalidated at run time and dropped.
    expect(written).toEqual(['newer live edit'])
    expect(usePatternStore.getState().userPatterns[0].src).toBe('newer live edit')
    expect(useEditorStore.getState().navigationSaveFailures).toEqual([])
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
