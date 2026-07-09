import {
  createD1Library,
  deleteD1Library,
  libraryRecordFromRow,
  listD1Libraries,
  updateD1Library,
  type D1DatabaseLibrariesLike,
} from './libraries'
import type { LibraryRecord } from '../engine/personalContentRecords'

function fakeDb(rows: Record<string, unknown>[] = []): {
  db: D1DatabaseLibrariesLike
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

describe('D1 library persistence (#347)', () => {
  it('maps D1 rows to LibraryRecord values', () => {
    expect(libraryRecordFromRow({
      id: 'lib-1',
      name: 'MyLib',
      src: 'function scale(v) { return v }',
      updated_at: 123,
    })).toEqual({
      id: 'lib-1',
      name: 'MyLib',
      src: 'function scale(v) { return v }',
      updatedAt: 123,
    })
  })

  it('scopes list, update, and delete by signed-in user', async () => {
    const { db, calls } = fakeDb()
    await listD1Libraries(db, 'github:123')
    await updateD1Library(db, 'github:123', 'lib-1', { name: 'RenamedLib', updatedAt: 2 })
    await deleteD1Library(db, 'github:123', 'lib-1')

    expect(calls[0].sql).toContain('WHERE user_id = ?')
    expect(calls[0].values).toEqual(['github:123'])
    expect(calls[1].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[1].values.slice(-2)).toEqual(['github:123', 'lib-1'])
    expect(calls[2].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[2].values).toEqual(['github:123', 'lib-1'])
  })

  it('creates libraries with user id in the key', async () => {
    const { db, calls } = fakeDb()
    const library: LibraryRecord = {
      id: 'lib-1',
      name: 'MyLib',
      src: 'function scale(v) { return v }',
      updatedAt: 1,
    }

    await createD1Library(db, 'github:123', library, 100)

    expect(calls[0].values.slice(0, 2)).toEqual(['github:123', 'lib-1'])
  })
})
