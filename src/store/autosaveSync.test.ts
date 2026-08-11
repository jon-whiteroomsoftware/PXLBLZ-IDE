import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPendingAutosave, activeStuckSaveStatus } from './autosaveSync'
import { usePatternStore, patternInitialState } from './patternStore'
import { useEditorStore, editorInitialState } from './editorStore'
import { useMapStore, mapInitialState } from './mapStore'
import { useMixinStore, mixinInitialState } from './mixinStore'
import { libraryInitialState, useLibraryStore } from './libraryStore'
import type { PatternRecord } from '@/engine/personalContentRecords'
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
