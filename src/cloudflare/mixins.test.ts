import {
  createD1Mixin,
  deleteD1Mixin,
  listD1Mixins,
  mixinRecordFromRow,
  updateD1Mixin,
  type D1DatabaseMixinsLike,
} from './mixins'
import type { MixinRecord } from '../engine/personalContentRecords'

function fakeDb(rows: Record<string, unknown>[] = []): {
  db: D1DatabaseMixinsLike
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

describe('D1 mixin persistence (#313)', () => {
  it('maps D1 rows to MixinRecord values', () => {
    expect(mixinRecordFromRow({
      id: 'mx1',
      name: 'Pot binding',
      kind: 'bind',
      src: '// @param PIN\n// @target CONTROL\n// @wraps beforeRender',
      updated_at: 123,
    })).toEqual({
      id: 'mx1',
      name: 'Pot binding',
      kind: 'bind',
      src: '// @param PIN\n// @target CONTROL\n// @wraps beforeRender',
      updatedAt: 123,
    })
  })

  it('scopes list, update, and delete by signed-in user', async () => {
    const { db, calls } = fakeDb()
    await listD1Mixins(db, 'github:123')
    await updateD1Mixin(db, 'github:123', 'mx1', { name: 'Renamed', updatedAt: 2 })
    await deleteD1Mixin(db, 'github:123', 'mx1')

    expect(calls[0].sql).toContain('WHERE user_id = ?')
    expect(calls[0].values).toEqual(['github:123'])
    expect(calls[1].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[1].values.slice(-2)).toEqual(['github:123', 'mx1'])
    expect(calls[2].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[2].values).toEqual(['github:123', 'mx1'])
  })

  it('creates mixins with user id in the key', async () => {
    const { db, calls } = fakeDb()
    const mixin: MixinRecord = {
      id: 'mx1',
      name: 'Pot binding',
      kind: 'bind',
      src: '// @param PIN\n// @target CONTROL\n// @wraps beforeRender',
      updatedAt: 1,
    }

    await createD1Mixin(db, 'github:123', mixin, 100)

    expect(calls[0].values.slice(0, 2)).toEqual(['github:123', 'mx1'])
  })
})
