import {
  createD1Pattern,
  deleteD1Pattern,
  listD1Patterns,
  patternRecordFromRow,
  updateD1Pattern,
  type D1DatabasePatternsLike,
} from './patterns'
import type { PatternRecord } from '../engine/personalContentRecords'

function fakeDb(rows: Record<string, unknown>[] = []): {
  db: D1DatabasePatternsLike
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

describe('D1 pattern persistence', () => {
  it('maps D1 rows to PatternRecord values', () => {
    expect(patternRecordFromRow({
      id: 'p1',
      name: 'Cloud Pattern',
      src: 'export function render() {}',
      controls_json: '{"speed":0.5}',
      params_json: '{"phase":0.25}',
      settings_json: '{"brightness":0.8}',
      updated_at: 123,
    })).toEqual({
      id: 'p1',
      name: 'Cloud Pattern',
      src: 'export function render() {}',
      controls: { speed: 0.5 },
      params: { phase: 0.25 },
      settings: { brightness: 0.8 },
      updatedAt: 123,
    })
  })

  it('lists patterns scoped to the signed-in user', async () => {
    const { db, calls } = fakeDb()

    await listD1Patterns(db, 'github:123')

    expect(calls[0].sql).toContain('WHERE user_id = ?')
    expect(calls[0].values).toEqual(['github:123'])
  })

  it('creates and updates patterns with user id in the key', async () => {
    const { db, calls } = fakeDb()
    const pattern: PatternRecord = {
      id: 'p1',
      name: 'Cloud Pattern',
      src: 'export function render() {}',
      controls: {},
      updatedAt: 123,
      settings: { brightness: 0.8 },
    }

    await createD1Pattern(db, 'github:123', pattern, 100)
    await updateD1Pattern(db, 'github:123', 'p1', { name: 'Renamed', updatedAt: 200 })

    expect(calls[0].values.slice(0, 2)).toEqual(['github:123', 'p1'])
    expect(calls[1].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[1].values.slice(-2)).toEqual(['github:123', 'p1'])
  })

  it('deletes patterns scoped to the signed-in user', async () => {
    const { db, calls } = fakeDb()

    await deleteD1Pattern(db, 'github:123', 'p1')

    expect(calls[0].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[0].values).toEqual(['github:123', 'p1'])
  })
})
