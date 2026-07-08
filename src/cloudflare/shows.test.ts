import {
  createD1Show,
  deleteD1Show,
  listD1Shows,
  showRecordFromRow,
  updateD1Show,
  type D1DatabaseShowsLike,
} from './shows'
import { createDefaultShow } from '../engine/showModel'

function fakeDb(rows: Record<string, unknown>[] = []): {
  db: D1DatabaseShowsLike
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

describe('D1 show persistence (#318)', () => {
  it('maps D1 rows to ShowRecord values', () => {
    const show = createDefaultShow('show-1', 'Tazii nights', 123)

    expect(showRecordFromRow({
      id: show.id,
      name: show.name,
      scenes_json: JSON.stringify(show.scenes),
      zones_json: JSON.stringify(show.zones),
      cells_json: JSON.stringify(show.cells),
      target_controller_profile_id: 'ctrl-1',
      updated_at: 123,
    })).toEqual({ ...show, targetControllerProfileId: 'ctrl-1' })
  })

  it('scopes list, update, and delete by signed-in user', async () => {
    const { db, calls } = fakeDb()
    await listD1Shows(db, 'github:123')
    await updateD1Show(db, 'github:123', 'show-1', { name: 'Renamed', updatedAt: 2 })
    await deleteD1Show(db, 'github:123', 'show-1')

    expect(calls[0].sql).toContain('WHERE user_id = ?')
    expect(calls[0].values).toEqual(['github:123'])
    expect(calls[1].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[1].values.slice(-2)).toEqual(['github:123', 'show-1'])
    expect(calls[2].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[2].values).toEqual(['github:123', 'show-1'])
  })

  it('creates shows with user id in the key and serialized strip data', async () => {
    const { db, calls } = fakeDb()
    const show = createDefaultShow('show-1', 'Tazii nights', 123)

    await createD1Show(db, 'github:123', show, 100)

    expect(calls[0].values.slice(0, 2)).toEqual(['github:123', 'show-1'])
    expect(calls[0].values).toContain(JSON.stringify(show.scenes))
    expect(calls[0].values).toContain(JSON.stringify(show.cells))
  })
})
