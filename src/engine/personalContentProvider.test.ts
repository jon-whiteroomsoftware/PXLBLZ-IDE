import {
  demoPersonalContentProvider,
  getPersonalContentProvider,
  initializePersonalContentProvider,
  personalContentCollectionLabel,
  resetPersonalContentProvider,
  resolvePersonalContentProviderMode,
  setPersonalContentProvider,
  storageModeForPersonalContentProvider,
  type PersonalContentProvider,
} from './personalContentProvider'
import type { ControllerProfile } from './controllerProfile'
import type { LibraryRecord, MapRecord, MixinRecord, PatternRecord, ShowRecord } from './personalContentRecords'

beforeEach(() => {
  resetPersonalContentProvider()
})

function memoryProvider(): PersonalContentProvider {
  const patterns = new Map<string, PatternRecord>()
  const maps = new Map<string, MapRecord>()
  const mixins = new Map<string, MixinRecord>()
  const shows = new Map<string, ShowRecord>()
  const controllers = new Map<string, ControllerProfile>()
  return {
    id: 'memory-test',
    listPatterns: async () => [...patterns.values()],
    createPattern: async (record) => {
      patterns.set(record.id, record)
    },
    updatePattern: async (id, changes) => {
      const existing = patterns.get(id)
      if (!existing) throw new Error(`Pattern ${id} not found`)
      patterns.set(id, { ...existing, ...changes })
    },
    deletePattern: async (id) => {
      patterns.delete(id)
    },
    listMaps: async () => [...maps.values()],
    createMap: async (record) => {
      maps.set(record.id, record)
    },
    updateMap: async (id, changes) => {
      const existing = maps.get(id)
      if (!existing) throw new Error(`Map ${id} not found`)
      maps.set(id, { ...existing, ...changes })
    },
    deleteMap: async (id) => {
      maps.delete(id)
    },
    listMixins: async () => [...mixins.values()],
    createMixin: async (record) => {
      mixins.set(record.id, record)
    },
    updateMixin: async (id, changes) => {
      const existing = mixins.get(id)
      if (!existing) throw new Error(`Mixin ${id} not found`)
      mixins.set(id, { ...existing, ...changes })
    },
    deleteMixin: async (id) => {
      mixins.delete(id)
    },
    listShows: async () => [...shows.values()],
    createShow: async (record) => {
      shows.set(record.id, record)
    },
    updateShow: async (id, changes) => {
      const existing = shows.get(id)
      if (!existing) throw new Error(`Show ${id} not found`)
      shows.set(id, { ...existing, ...changes })
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
      if (!existing) throw new Error(`Controller profile ${id} not found`)
      controllers.set(id, { ...existing, ...changes })
    },
    deleteControllerProfile: async (id) => {
      controllers.delete(id)
    },
    getLastActive: async () => undefined,
    setLastActive: async () => {},
    getDemoOverrides: async () => undefined,
    setDemoOverrides: async () => {},
  }
}

describe('personal content provider seam', () => {
  it('uses the non-durable demo provider by default and allows one active provider override', () => {
    expect(getPersonalContentProvider()).toBe(demoPersonalContentProvider)
    const provider = memoryProvider()
    setPersonalContentProvider(provider)
    expect(getPersonalContentProvider()).toBe(provider)
    resetPersonalContentProvider()
    expect(getPersonalContentProvider()).toBe(demoPersonalContentProvider)
  })

  it('labels storage-backed collections with plain entity names', () => {
    expect(storageModeForPersonalContentProvider(demoPersonalContentProvider)).toBe('demo')
    expect(storageModeForPersonalContentProvider({ id: 'remote-api' })).toBe('api')
    expect(personalContentCollectionLabel('demo', 'patterns')).toBe('Patterns')
    expect(personalContentCollectionLabel('api', 'patterns')).toBe('Patterns')
    expect(personalContentCollectionLabel('api', 'maps')).toBe('Maps')
    expect(personalContentCollectionLabel('api', 'mixins')).toBe('Mixins')
    expect(personalContentCollectionLabel('api', 'libraries')).toBe('Libraries')
    expect(personalContentCollectionLabel('api', 'shows')).toBe('Shows')
  })

  it('selects the remote API as the only durable provider mode', async () => {
    expect(resolvePersonalContentProviderMode(undefined)).toBe('remote-api')
    expect(resolvePersonalContentProviderMode('remote-api')).toBe('remote-api')
    expect(resolvePersonalContentProviderMode('browser', { prod: true, baseUrl: '/' })).toBe('remote-api')
    expect(resolvePersonalContentProviderMode('anything-else')).toBe('remote-api')
    expect(resolvePersonalContentProviderMode(undefined, { prod: true, baseUrl: '/' })).toBe('remote-api')
    expect(resolvePersonalContentProviderMode(undefined, { prod: true, baseUrl: '/PXLBLZ-IDE/' })).toBe('remote-api')
    await expect(initializePersonalContentProvider({ mode: 'remote-api' })).resolves.toMatchObject({ id: 'remote-api' })
  })

  it('demo provider exposes no personal workspace and rejects durable writes', async () => {
    const pattern: PatternRecord = {
      id: 'pattern-1',
      name: 'Provider Pattern',
      src: 'export function render(index) { hsv(0, 1, 1) }',
      controls: {},
      updatedAt: 1,
    }
    const map: MapRecord = {
      id: 'map-1',
      name: 'Provider Map',
      dim: 2,
      generator: 'custom',
      params: {},
      source: 'function(pixelCount){ return [[0,0]] }',
      points: [[0, 0]],
      updatedAt: 1,
    }
    const mixin: MixinRecord = {
      id: 'mixin-1',
      name: 'Provider Mixin',
      kind: 'bind',
      src: '// @param PIN\n// @target CONTROL\n// @wraps beforeRender',
      updatedAt: 1,
    }
    const show: ShowRecord = {
      id: 'show-1',
      name: 'Provider Show',
      scenes: [],
      zones: [],
      cells: [],
      routingLayouts: [],
      transitions: [],
      outputContract: {
        version: 1,
        kind: 'portable-2d',
        referenceMapId: null,
        referencePixelCount: 60,
        compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
      },
      updatedAt: 1,
    }
    const library: LibraryRecord = {
      id: 'library-1',
      name: 'ProviderLib',
      src: 'function identity(v) { return v }',
      updatedAt: 1,
    }

    await expect(demoPersonalContentProvider.listPatterns()).resolves.toEqual([])
    await expect(demoPersonalContentProvider.listMaps()).resolves.toEqual([])
    await expect(demoPersonalContentProvider.listMixins()).resolves.toEqual([])
    await expect(demoPersonalContentProvider.listLibraries?.()).resolves.toEqual([])
    await expect(demoPersonalContentProvider.listShows()).resolves.toEqual([])
    await expect(demoPersonalContentProvider.listControllerProfiles()).resolves.toEqual([])
    await expect(demoPersonalContentProvider.getLastActive()).resolves.toBeUndefined()
    await expect(demoPersonalContentProvider.getDemoOverrides()).resolves.toBeUndefined()
    await expect(demoPersonalContentProvider.setLastActive({ type: 'pattern', id: pattern.id })).resolves.toBeUndefined()
    await expect(demoPersonalContentProvider.setDemoOverrides({ AuroraSphere: { brightness: 0.5 } })).resolves.toBeUndefined()
    await expect(demoPersonalContentProvider.createPattern(pattern)).rejects.toThrow('Sign in required')
    await expect(demoPersonalContentProvider.updatePattern(pattern.id, { name: 'Renamed Pattern' })).rejects.toThrow(
      'Sign in required',
    )
    await expect(demoPersonalContentProvider.deletePattern(pattern.id)).rejects.toThrow('Sign in required')
    await expect(demoPersonalContentProvider.createMap(map)).rejects.toThrow('Sign in required')
    await expect(demoPersonalContentProvider.updateMap(map.id, { name: 'Renamed Map' })).rejects.toThrow(
      'Sign in required',
    )
    await expect(demoPersonalContentProvider.deleteMap(map.id)).rejects.toThrow('Sign in required')
    await expect(demoPersonalContentProvider.createMixin(mixin)).rejects.toThrow('Sign in required')
    await expect(demoPersonalContentProvider.updateMixin(mixin.id, { name: 'Renamed Mixin' })).rejects.toThrow(
      'Sign in required',
    )
    await expect(demoPersonalContentProvider.deleteMixin(mixin.id)).rejects.toThrow('Sign in required')
    await expect(demoPersonalContentProvider.createLibrary?.(library)).rejects.toThrow('Sign in required')
    await expect(demoPersonalContentProvider.updateLibrary?.(library.id, { name: 'RenamedLib' })).rejects.toThrow(
      'Sign in required',
    )
    await expect(demoPersonalContentProvider.deleteLibrary?.(library.id)).rejects.toThrow('Sign in required')
    await expect(demoPersonalContentProvider.createShow(show)).rejects.toThrow('Sign in required')
    await expect(demoPersonalContentProvider.updateShow(show.id, { name: 'Renamed Show' })).rejects.toThrow(
      'Sign in required',
    )
    await expect(demoPersonalContentProvider.deleteShow(show.id)).rejects.toThrow('Sign in required')
    await expect(demoPersonalContentProvider.createControllerProfile({
      id: 'ctrl-1',
      name: 'Controller',
      board: { kind: 'pixelblaze-v3-standard' },
      inputs: [],
      globalTransforms: [],
      patternBindings: [],
      zones: [],
      updatedAt: 1,
    })).rejects.toThrow('Sign in required')
  })
})
