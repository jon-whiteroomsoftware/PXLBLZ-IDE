import {
  getD1ControllerMetadata,
  setD1ControllerMetadata,
  type D1DatabaseControllerMetadataLike,
} from './controllerMetadata'

function fakeDb(row: Record<string, unknown> | null = null): {
  db: D1DatabaseControllerMetadataLike
  calls: Array<{ sql: string; values: unknown[] }>
} {
  const calls: Array<{ sql: string; values: unknown[] }> = []
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
          async first<T>() {
            calls.push({ sql, values: bound })
            return row as T | null
          },
          async run() {
            calls.push({ sql, values: bound })
            return { success: true }
          },
        }
      },
    },
  }
}

describe('D1 controller metadata persistence', () => {
  it('reads metadata scoped to the signed-in user and key', async () => {
    const { db, calls } = fakeDb({ value_json: '{"ctrl-A":{"pat-1":"DEVPROG1"}}' })

    await expect(getD1ControllerMetadata(db, 'github:123', 'controller-bindings')).resolves.toEqual({
      'ctrl-A': { 'pat-1': 'DEVPROG1' },
    })
    expect(calls[0].sql).toContain('FROM controller_metadata')
    expect(calls[0].sql).toContain('WHERE user_id = ? AND key = ?')
    expect(calls[0].values).toEqual(['github:123', 'controller-bindings'])
  })

  it('upserts metadata scoped to the signed-in user and key', async () => {
    const { db, calls } = fakeDb()

    await setD1ControllerMetadata(
      db,
      'github:123',
      'controller-program-labels',
      { 'ctrl-A': { DEVPROG1: 'Twinkle' } },
      100,
    )

    expect(calls[0].sql).toContain('INSERT INTO controller_metadata')
    expect(calls[0].values).toEqual([
      'github:123',
      'controller-program-labels',
      '{"ctrl-A":{"DEVPROG1":"Twinkle"}}',
      100,
    ])
  })
})
