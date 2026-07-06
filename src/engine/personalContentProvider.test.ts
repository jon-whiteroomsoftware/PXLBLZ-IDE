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
import type { MapRecord, PatternRecord } from './personalContentRecords'

beforeEach(() => {
  resetPersonalContentProvider()
})

function memoryProvider(): PersonalContentProvider {
  const patterns = new Map<string, PatternRecord>()
  const maps = new Map<string, MapRecord>()
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

    await expect(demoPersonalContentProvider.listPatterns()).resolves.toEqual([])
    await expect(demoPersonalContentProvider.listMaps()).resolves.toEqual([])
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
  })
})
