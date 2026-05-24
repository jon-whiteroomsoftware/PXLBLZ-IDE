import { IDBFactory } from 'fake-indexeddb'
import {
  openDb,
  createPattern,
  listPatterns,
  getPattern,
  updatePattern,
  deletePattern,
  getSetting,
  setSetting,
  resetDbCache,
  PatternRecord,
} from './storage'

function makeDb() {
  resetDbCache()
  return openDb(new IDBFactory())
}

const PATTERN: PatternRecord = {
  id: 'p1',
  name: 'Test Pattern',
  src: 'export function render2D(index, x, y) { hsv(x, 1, 1) }',
  controls: {},
  updatedAt: 1000,
}

describe('storage — patterns', () => {
  it('creates and retrieves a pattern', async () => {
    const db = await makeDb()
    await createPattern(PATTERN, db)
    const result = await getPattern('p1', db)
    expect(result).toEqual(PATTERN)
  })

  it('lists all patterns', async () => {
    const db = await makeDb()
    const p2 = { ...PATTERN, id: 'p2', name: 'Second' }
    await createPattern(PATTERN, db)
    await createPattern(p2, db)
    const list = await listPatterns(db)
    expect(list).toHaveLength(2)
    expect(list.map((p) => p.id).sort()).toEqual(['p1', 'p2'])
  })

  it('returns undefined for missing pattern', async () => {
    const db = await makeDb()
    const result = await getPattern('nope', db)
    expect(result).toBeUndefined()
  })

  it('updates a pattern', async () => {
    const db = await makeDb()
    await createPattern(PATTERN, db)
    await updatePattern('p1', { name: 'Renamed', updatedAt: 2000 }, db)
    const result = await getPattern('p1', db)
    expect(result?.name).toBe('Renamed')
    expect(result?.updatedAt).toBe(2000)
    expect(result?.src).toBe(PATTERN.src)
  })

  it('throws when updating a missing pattern', async () => {
    const db = await makeDb()
    await expect(updatePattern('nope', { name: 'x' }, db)).rejects.toThrow()
  })

  it('deletes a pattern', async () => {
    const db = await makeDb()
    await createPattern(PATTERN, db)
    await deletePattern('p1', db)
    const result = await getPattern('p1', db)
    expect(result).toBeUndefined()
  })

  it('persists controls per pattern', async () => {
    const db = await makeDb()
    const withControls: PatternRecord = {
      ...PATTERN,
      controls: { sliderBrightness: 0.8, toggleWave: 1, hsvPicker: [0.5, 1, 0.9] },
    }
    await createPattern(withControls, db)
    const result = await getPattern('p1', db)
    expect(result?.controls).toEqual(withControls.controls)
  })
})

describe('storage — settings', () => {
  it('sets and gets a value', async () => {
    const db = await makeDb()
    await setSetting('speed', 2, db)
    const val = await getSetting<number>('speed', db)
    expect(val).toBe(2)
  })

  it('returns undefined for missing key', async () => {
    const db = await makeDb()
    const val = await getSetting('missing', db)
    expect(val).toBeUndefined()
  })

  it('overwrites a setting', async () => {
    const db = await makeDb()
    await setSetting('brightness', 0.5, db)
    await setSetting('brightness', 0.8, db)
    const val = await getSetting<number>('brightness', db)
    expect(val).toBe(0.8)
  })
})
