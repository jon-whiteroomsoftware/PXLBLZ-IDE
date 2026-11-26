import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  usePatternStore,
  patternInitialState,
  activePushKey,
  hasPendingSettingsPersistence,
} from './patternStore'
import type { PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import type { ControllerProfile } from '@/engine/controllerProfile'
import {
  resetPersonalContentProvider,
  getPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { Settings } from '@/engine/settings'
import { editorInitialState, useEditorStore } from './editorStore'

function memoryProvider(): PersonalContentProvider {
  const patterns = new Map<string, PatternRecord>()
  const shows = new Map<string, ShowRecord>()
  const controllers = new Map<string, ControllerProfile>()
  let demoOverrides: Record<string, Partial<Settings>> | undefined
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
    listShows: async () => [...shows.values()],
    createShow: async (record) => {
      shows.set(record.id, record)
    },
    updateShow: async (id, changes) => {
      const existing = shows.get(id)
      if (existing) shows.set(id, { ...existing, ...changes })
    },
    deleteShow: async (id) => {
      shows.delete(id)
    },
    listControllerProfiles: async () => [...controllers.values()],
    createControllerProfile: async (profile) => {
      controllers.set(profile.id, profile)
    },
    updateControllerProfile: async (id, changes) => {
      const existing = controllers.get(id)
      if (existing) controllers.set(id, { ...existing, ...changes })
    },
    deleteControllerProfile: async (id) => {
      controllers.delete(id)
    },
    getLastActive: async () => undefined,
    setLastActive: async () => {},
    getDemoOverrides: async () => demoOverrides,
    setDemoOverrides: async (next) => {
      demoOverrides = next
    },
  }
}

beforeEach(() => {
  resetPersonalContentProvider()
  setPersonalContentProvider(memoryProvider())
  usePatternStore.setState(patternInitialState)
  useEditorStore.setState(editorInitialState)
})

describe('activePushKey', () => {
  it('keys a user pattern by its record id', () => {
    expect(activePushKey({ activePatternId: 'abc-123', activeDemoName: null })).toBe('abc-123')
  })

  it('keys a demo by a `demo:` namespaced name (so it pushes without forking)', () => {
    expect(activePushKey({ activePatternId: null, activeDemoName: 'Test Pattern (2D)' })).toBe(
      'demo:Test Pattern (2D)',
    )
  })

  it('prefers the user pattern id when both are somehow set', () => {
    expect(activePushKey({ activePatternId: 'abc-123', activeDemoName: 'X' })).toBe('abc-123')
  })

  it('is null when nothing pushable is open (e.g. a library)', () => {
    expect(activePushKey({ activePatternId: null, activeDemoName: null })).toBeNull()
  })
})

describe('patternStore', () => {
  it('starts with no pattern selected', () => {
    expect(usePatternStore.getState().activePatternId).toBeNull()
  })

  it('setActivePattern updates activePatternId', () => {
    usePatternStore.getState().setActivePattern('abc-123')
    expect(usePatternStore.getState().activePatternId).toBe('abc-123')
  })

  it('setActivePattern can clear selection', () => {
    usePatternStore.getState().setActivePattern('abc-123')
    usePatternStore.getState().setActivePattern(null)
    expect(usePatternStore.getState().activePatternId).toBeNull()
  })

  it('setActivePattern clears activeLibraryName', () => {
    usePatternStore.getState().setActiveLibrary('sdf')
    usePatternStore.getState().setActivePattern('abc-123')
    expect(usePatternStore.getState().activeLibraryName).toBeNull()
  })

  it('keeps the active artifact name in sync when a Pattern is renamed (#804)', async () => {
    const pattern = {
      id: 'pat-1',
      name: 'Untitled Pattern',
      src: 'export function render(index) { hsv(index, 1, 1) }',
      controls: {},
      updatedAt: 1,
    }
    usePatternStore.setState({ userPatterns: [pattern], activePatternId: pattern.id })
    useEditorStore.setState({ previewPatternName: pattern.name })

    await usePatternStore.getState().renamePattern(pattern.id, 'Freshness spiral')

    expect(useEditorStore.getState().previewPatternName).toBe('Freshness spiral')
  })

  it('setActiveLibrary clears activePatternId', () => {
    usePatternStore.getState().setActivePattern('abc-123')
    usePatternStore.getState().setActiveLibrary('sdf')
    expect(usePatternStore.getState().activePatternId).toBeNull()
  })

  it('skips unchanged source writes so autosave ticks do not rewrite persisted patterns', async () => {
    const updatePattern = vi.fn()
    setPersonalContentProvider({
      id: 'test-provider',
      listPatterns: async () => [],
      createPattern: async () => {},
      updatePattern,
      deletePattern: async () => {},
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
    } satisfies PersonalContentProvider)
    usePatternStore.setState({
      userPatterns: [{ id: 'p1', name: 'P1', src: 'same source', controls: {}, updatedAt: 1 }],
    })

    await usePatternStore.getState().updatePatternSrc('p1', 'same source')

    expect(updatePattern).not.toHaveBeenCalled()
    expect(usePatternStore.getState().userPatterns[0].updatedAt).toBe(1)
  })
})

describe('updatePatternSettings', () => {
  it('discards legacy speed during hydration and subsequent saves without mutating stored inputs (#1246)', async () => {
    const provider = getPersonalContentProvider()
    const legacy = { speed: 4, brightness: 0.4 }
    await provider.createPattern({ id: 'legacy', name: 'Legacy', src: '', controls: {}, updatedAt: 1, settings: legacy })
    await usePatternStore.getState().loadPatterns()
    expect(usePatternStore.getState().userPatterns[0].settings).toEqual({ brightness: 0.4 })
    await usePatternStore.getState().updatePatternSettings('legacy', { lightSize: 0.7 })
    expect((await provider.listPatterns())[0].settings).toEqual({ brightness: 0.4, lightSize: 0.7 })
    expect(legacy).toEqual({ speed: 4, brightness: 0.4 })
  })
  beforeEach(() => {
    usePatternStore.setState({
      userPatterns: [{ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1 }],
    })
  })

  it('sparse-merges overrides into the record settings bag', async () => {
    await usePatternStore.getState().updatePatternSettings('p1', { shapeId: 'ring', pixelCount: 64 })
    expect(usePatternStore.getState().userPatterns[0].settings).toEqual({ shapeId: 'ring', pixelCount: 64 })
  })

  it('accumulates across calls without dropping earlier fields', async () => {
    await usePatternStore.getState().updatePatternSettings('p1', { shapeId: 'ring' })
    await usePatternStore.getState().updatePatternSettings('p1', { brightness: 0.5 })
    expect(usePatternStore.getState().userPatterns[0].settings).toEqual({ shapeId: 'ring', brightness: 0.5 })
  })

  it('does not bump updatedAt (settings are display-side, not a code edit)', async () => {
    await usePatternStore.getState().updatePatternSettings('p1', { brightness: 0.5 })
    expect(usePatternStore.getState().userPatterns[0].updatedAt).toBe(1)
  })

  it('serializes and coalesces rapid pattern settings edits so a slow earlier save cannot restore a cleared override', async () => {
    const base = memoryProvider()
    await base.createPattern({ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1 })
    const sent: Partial<Settings>[] = []
    let releaseFirst!: () => void
    let inFlight = 0
    let maxInFlight = 0
    setPersonalContentProvider({
      ...base,
      updatePattern: async (id, changes) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        sent.push(changes.settings ?? {})
        if (sent.length === 1) {
          await new Promise<void>((resolve) => { releaseFirst = resolve })
        }
        await base.updatePattern(id, changes)
        inFlight--
      },
    })

    const first = usePatternStore.getState().updatePatternSettings('p1', { slowMo: 0.5 })
    const middle = usePatternStore.getState().updatePatternSettings('p1', { slowMo: 0.8 })
    const reset = usePatternStore.getState().updatePatternSettings('p1', { slowMo: 0 })

    expect(hasPendingSettingsPersistence()).toBe(true)
    expect(sent).toEqual([{ slowMo: 0.5 }])
    releaseFirst()
    await Promise.all([first, middle, reset])

    expect(hasPendingSettingsPersistence()).toBe(false)
    expect(maxInFlight).toBe(1)
    expect(sent).toEqual([{ slowMo: 0.5 }, {}])
    expect((await base.listPatterns())[0].settings).toEqual({})
  })

  it('drains queued settings reset before removePattern so a failed deletion preserves the reset in storage', async () => {
    const base = memoryProvider()
    await base.createPattern({ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1 })
    const sent: Partial<Settings>[] = []
    let releaseFirst!: () => void
    setPersonalContentProvider({
      ...base,
      updatePattern: async (id, changes) => {
        sent.push(changes.settings ?? {})
        if (sent.length === 1) {
          await new Promise<void>((resolve) => { releaseFirst = resolve })
        }
        await base.updatePattern(id, changes)
      },
      deletePattern: async () => {
        throw new Error('delete failed')
      },
    })

    const first = usePatternStore.getState().updatePatternSettings('p1', { slowMo: 0.5 })
    const reset = usePatternStore.getState().updatePatternSettings('p1', { slowMo: 0 })
    const removal = usePatternStore.getState().removePattern('p1')

    releaseFirst()
    await expect(removal).rejects.toThrow('delete failed')
    await Promise.all([first, reset])

    expect(sent).toEqual([{ slowMo: 0.5 }, {}])
    expect(usePatternStore.getState().userPatterns[0].settings).toEqual({})
    expect((await base.listPatterns())[0].settings).toEqual({})
    expect(hasPendingSettingsPersistence()).toBe(false)
  })
})

describe('resetPatternSettings', () => {
  it('clears the record settings bag', async () => {
    usePatternStore.setState({
      userPatterns: [{ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1, settings: { brightness: 0.5 } }],
    })
    await usePatternStore.getState().resetPatternSettings('p1')
    expect(usePatternStore.getState().userPatterns[0].settings).toEqual({})
  })
})

describe('settings save failures', () => {
  it.each(['Pattern', 'stock demo'] as const)('keeps a failed %s reset pending until it is retried successfully', async (scope) => {
    const base = getPersonalContentProvider()
    await base.createPattern({ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1 })
    await usePatternStore.getState().loadPatterns()

    let releaseFirst!: () => void
    let releaseRetry!: () => void
    let writes = 0
    async function beforeWrite() {
      writes++
      if (writes === 1) await new Promise<void>((resolve) => { releaseFirst = resolve })
      if (writes === 2) throw new Error('HTTP 500')
      if (writes === 3) await new Promise<void>((resolve) => { releaseRetry = resolve })
    }
    setPersonalContentProvider({
      ...base,
      updatePattern: async (id, changes) => {
        await beforeWrite()
        await base.updatePattern(id, changes)
      },
      setDemoOverrides: async (overrides) => {
        await beforeWrite()
        await base.setDemoOverrides(overrides)
      },
    })
    const update = (slowMo: number) => scope === 'Pattern'
      ? usePatternStore.getState().updatePatternSettings('p1', { slowMo })
      : usePatternStore.getState().updateDemoSettings('KaleidoBloom', { slowMo })
    const readStored = async () => scope === 'Pattern'
      ? (await base.listPatterns())[0].settings
      : (await base.getDemoOverrides())?.KaleidoBloom ?? {}
    const readLocal = () => scope === 'Pattern'
      ? usePatternStore.getState().userPatterns[0].settings
      : usePatternStore.getState().demoOverrides.KaleidoBloom ?? {}

    const first = update(0.5)
    const reset = update(0)
    expect(writes).toBe(1)
    releaseFirst()
    await Promise.all([first, reset])

    expect(writes).toBe(2)
    expect(await readStored()).toEqual({ slowMo: 0.5 })
    expect(readLocal()).toEqual({})
    expect(hasPendingSettingsPersistence()).toBe(true)
    expect(usePatternStore.getState().settingsSaveFailed).toBe(true)

    await usePatternStore.getState().loadPatterns()
    await usePatternStore.getState().loadDemoOverrides()
    expect(readLocal()).toEqual({})

    const retry = usePatternStore.getState().retrySettingsPersistence()
    expect(hasPendingSettingsPersistence()).toBe(true)
    expect(usePatternStore.getState().settingsSaveFailed).toBe(true)
    releaseRetry()
    await retry
    expect(await readStored()).toEqual({})
    expect(hasPendingSettingsPersistence()).toBe(false)
    expect(usePatternStore.getState().settingsSaveFailed).toBe(false)
  })
})

describe('demo overrides', () => {
  it('discards legacy speed-only and mixed demo settings on hydration and save (#1246)', async () => {
    const provider = getPersonalContentProvider()
    const legacy: Record<string, Partial<Settings>> = JSON.parse('{"AuroraSphere":{"speed":4,"brightness":0.4},"NebulaSphere":{"speed":2}}')
    await provider.setDemoOverrides(legacy)
    await usePatternStore.getState().loadDemoOverrides()
    expect(usePatternStore.getState().demoOverrides).toEqual({ AuroraSphere: { brightness: 0.4 }, NebulaSphere: {} })
    await usePatternStore.getState().updateDemoSettings('AuroraSphere', { lightSize: 0.7 })
    expect(await provider.getDemoOverrides()).toEqual({ AuroraSphere: { brightness: 0.4, lightSize: 0.7 }, NebulaSphere: {} })
    expect(legacy.AuroraSphere).toEqual({ speed: 4, brightness: 0.4 })
  })
  it('updateDemoSettings sparse-merges per demo name', async () => {
    await usePatternStore.getState().updateDemoSettings('AuroraSphere', { brightness: 0.5 })
    await usePatternStore.getState().updateDemoSettings('AuroraSphere', { pixelCount: 256 })
    expect(usePatternStore.getState().demoOverrides.AuroraSphere).toEqual({
      brightness: 0.5,
      pixelCount: 256,
    })
  })

  it('keeps each demo bag independent', async () => {
    await usePatternStore.getState().updateDemoSettings('AuroraSphere', { brightness: 0.5 })
    await usePatternStore.getState().updateDemoSettings('NebulaSphere', { brightness: 0.2 })
    expect(usePatternStore.getState().demoOverrides).toEqual({
      AuroraSphere: { brightness: 0.5 },
      NebulaSphere: { brightness: 0.2 },
    })
  })

  it('resetDemoSettings drops only that demo bag', async () => {
    await usePatternStore.getState().updateDemoSettings('AuroraSphere', { brightness: 0.5 })
    await usePatternStore.getState().updateDemoSettings('NebulaSphere', { brightness: 0.2 })
    await usePatternStore.getState().resetDemoSettings('AuroraSphere')
    expect(usePatternStore.getState().demoOverrides).toEqual({ NebulaSphere: { brightness: 0.2 } })
  })

  it('loadDemoOverrides rehydrates the persisted map', async () => {
    await usePatternStore.getState().updateDemoSettings('AuroraSphere', { brightness: 0.5 })
    usePatternStore.setState({ demoOverrides: {} })
    await usePatternStore.getState().loadDemoOverrides()
    expect(usePatternStore.getState().demoOverrides.AuroraSphere).toEqual({ brightness: 0.5 })
  })

  it('removes slowMo/dreamy overrides and drops empty demo bags on reset to 0', async () => {
    const provider = getPersonalContentProvider()
    await usePatternStore.getState().updateDemoSettings('KaleidoBloom', { slowMo: 0.5, dreamy: 0.3 })
    expect(await provider.getDemoOverrides()).toEqual({ KaleidoBloom: { slowMo: 0.5, dreamy: 0.3 } })
    await usePatternStore.getState().updateDemoSettings('KaleidoBloom', { slowMo: 0 })
    expect(await provider.getDemoOverrides()).toEqual({ KaleidoBloom: { dreamy: 0.3 } })
    await usePatternStore.getState().updateDemoSettings('KaleidoBloom', { dreamy: 0 })
    expect(await provider.getDemoOverrides()).toEqual({})
  })

  it('serializes and coalesces rapid demo override edits so a slow earlier save cannot restore a cleared override', async () => {
    const base = memoryProvider()
    const sent: Record<string, Partial<Settings>>[] = []
    let releaseFirst!: () => void
    let inFlight = 0
    let maxInFlight = 0
    setPersonalContentProvider({
      ...base,
      setDemoOverrides: async (next) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        sent.push(next)
        if (sent.length === 1) {
          await new Promise<void>((resolve) => { releaseFirst = resolve })
        }
        await base.setDemoOverrides(next)
        inFlight--
      },
    })

    const first = usePatternStore.getState().updateDemoSettings('KaleidoBloom', { slowMo: 0.5 })
    const middle = usePatternStore.getState().updateDemoSettings('KaleidoBloom', { slowMo: 0.9, dreamy: 0.4 })
    const resetSlowMo = usePatternStore.getState().updateDemoSettings('KaleidoBloom', { slowMo: 0 })
    const resetDreamy = usePatternStore.getState().updateDemoSettings('KaleidoBloom', { dreamy: 0 })

    expect(sent).toEqual([{ KaleidoBloom: { slowMo: 0.5 } }])
    releaseFirst()
    await Promise.all([first, middle, resetSlowMo, resetDreamy])

    expect(maxInFlight).toBe(1)
    expect(sent).toEqual([{ KaleidoBloom: { slowMo: 0.5 } }, {}])
    expect(await base.getDemoOverrides()).toEqual({})
  })
})
