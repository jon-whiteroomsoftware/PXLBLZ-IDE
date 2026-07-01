import { getD1Setting, setD1Setting, type D1DatabaseSettingsLike } from './settings'

function fakeDb(row: Record<string, unknown> | null = null): {
  db: D1DatabaseSettingsLike
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

describe('D1 personal settings persistence', () => {
  it('reads settings scoped to the signed-in user', async () => {
    const { db, calls } = fakeDb({ value_json: '{"type":"demo","name":"IridescentFibers"}' })

    await expect(getD1Setting(db, 'github:123', 'lastActive')).resolves.toEqual({
      type: 'demo',
      name: 'IridescentFibers',
    })
    expect(calls[0].sql).toContain('WHERE user_id = ? AND key = ?')
    expect(calls[0].values).toEqual(['github:123', 'lastActive'])
  })

  it('upserts settings scoped to the signed-in user', async () => {
    const { db, calls } = fakeDb()

    await setD1Setting(db, 'github:123', 'demoOverrides', { AuroraSphere: { brightness: 0.5 } }, 100)

    expect(calls[0].sql).toContain('INSERT INTO personal_settings')
    expect(calls[0].values).toEqual([
      'github:123',
      'demoOverrides',
      '{"AuroraSphere":{"brightness":0.5}}',
      100,
    ])
  })
})
