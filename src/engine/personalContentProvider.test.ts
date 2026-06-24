import {
  browserPersonalContentProvider,
  getPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from './personalContentProvider'
import { resetDbCache, type MapRecord, type PatternRecord } from './storage'

beforeEach(() => {
  resetDbCache()
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
  it('uses the browser IndexedDB provider by default and allows one active provider override', () => {
    expect(getPersonalContentProvider()).toBe(browserPersonalContentProvider)
    const provider = memoryProvider()
    setPersonalContentProvider(provider)
    expect(getPersonalContentProvider()).toBe(provider)
    resetPersonalContentProvider()
    expect(getPersonalContentProvider()).toBe(browserPersonalContentProvider)
  })

  it('browser provider preserves pattern, map, last-active, and demo-override storage', async () => {
    const suffix = `${Date.now()}-${Math.random()}`
    const pattern: PatternRecord = {
      id: `pattern-${suffix}`,
      name: 'Provider Pattern',
      src: 'export function render(index) { hsv(0, 1, 1) }',
      controls: {},
      updatedAt: 1,
    }
    const map: MapRecord = {
      id: `map-${suffix}`,
      name: 'Provider Map',
      dim: 2,
      generator: 'custom',
      params: {},
      source: 'function(pixelCount){ return [[0,0]] }',
      points: [[0, 0]],
      updatedAt: 1,
    }

    await browserPersonalContentProvider.createPattern(pattern)
    await browserPersonalContentProvider.updatePattern(pattern.id, { name: 'Renamed Pattern' })
    expect((await browserPersonalContentProvider.listPatterns()).find((p) => p.id === pattern.id)?.name).toBe(
      'Renamed Pattern',
    )

    await browserPersonalContentProvider.createMap(map)
    await browserPersonalContentProvider.updateMap(map.id, { name: 'Renamed Map' })
    expect((await browserPersonalContentProvider.listMaps()).find((m) => m.id === map.id)?.name).toBe(
      'Renamed Map',
    )

    await browserPersonalContentProvider.setLastActive({ type: 'pattern', id: pattern.id })
    expect(await browserPersonalContentProvider.getLastActive()).toEqual({ type: 'pattern', id: pattern.id })

    await browserPersonalContentProvider.setDemoOverrides({ AuroraSphere: { brightness: 0.5 } })
    expect(await browserPersonalContentProvider.getDemoOverrides()).toEqual({
      AuroraSphere: { brightness: 0.5 },
    })

    await browserPersonalContentProvider.deletePattern(pattern.id)
    await browserPersonalContentProvider.deleteMap(map.id)
    expect((await browserPersonalContentProvider.listPatterns()).some((p) => p.id === pattern.id)).toBe(false)
    expect((await browserPersonalContentProvider.listMaps()).some((m) => m.id === map.id)).toBe(false)
  })
})
