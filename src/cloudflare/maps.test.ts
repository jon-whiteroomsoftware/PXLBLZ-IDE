import {
  createD1Map,
  deleteD1Map,
  listD1Maps,
  mapRecordFromRow,
  updateD1Map,
  type D1DatabaseMapsLike,
} from './maps'
import type { MapRecord } from '../engine/personalContentRecords'

function fakeDb(rows: Record<string, unknown>[] = []): {
  db: D1DatabaseMapsLike
  calls: Array<{ sql: string; values: unknown[]; action: 'all' | 'run' }>
} {
  const calls: Array<{ sql: string; values: unknown[]; action: 'all' | 'run' }> = []
  return {
    calls,
    db: {
      prepare(sql) {
        let bound: unknown[] = []
        return {
          bind(...values) {
            bound = values
            return this
          },
          async all<T>() {
            calls.push({ sql, values: bound, action: 'all' })
            return { results: rows as T[] }
          },
          async run() {
            calls.push({ sql, values: bound, action: 'run' })
            return { success: true }
          },
        }
      },
    },
  }
}

describe('D1 map persistence', () => {
  it('maps D1 rows to MapRecord values', () => {
    expect(mapRecordFromRow({
      id: 'm1',
      name: 'Cloud Map',
      dim: 2,
      generator: 'custom',
      params_json: '{"scale":1}',
      points_json: '[[0,0],[1,1]]',
      source: 'function(pixelCount){ return [[0,0]] }',
      grid_dims_json: '{"cols":2,"rows":1}',
      updated_at: 123,
    })).toEqual({
      id: 'm1',
      name: 'Cloud Map',
      dim: 2,
      generator: 'custom',
      params: { scale: 1 },
      points: [[0, 0], [1, 1]],
      source: 'function(pixelCount){ return [[0,0]] }',
      gridDims: { cols: 2, rows: 1 },
      updatedAt: 123,
    })
  })

  it('scopes list, update, and delete by signed-in user', async () => {
    const { db, calls } = fakeDb()
    await listD1Maps(db, 'github:123')
    await updateD1Map(db, 'github:123', 'm1', { name: 'Renamed', updatedAt: 2 })
    await deleteD1Map(db, 'github:123', 'm1')

    expect(calls[0].sql).toContain('WHERE user_id = ?')
    expect(calls[0].values).toEqual(['github:123'])
    expect(calls[1].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[1].values.slice(-2)).toEqual(['github:123', 'm1'])
    expect(calls[2].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[2].values).toEqual(['github:123', 'm1'])
  })

  it('creates maps with user id in the key', async () => {
    const { db, calls } = fakeDb()
    const map: MapRecord = {
      id: 'm1',
      name: 'Cloud Map',
      dim: 2,
      generator: 'custom',
      params: {},
      updatedAt: 1,
    }

    await createD1Map(db, 'github:123', map, 100)

    expect(calls[0].values.slice(0, 2)).toEqual(['github:123', 'm1'])
  })
})
