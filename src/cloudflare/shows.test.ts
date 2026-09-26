import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { createD1Show, deleteD1Show, listD1ShowsV2, replaceD1ShowV2, showRecordFromRow, type D1DatabaseShowsLike } from './shows'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'

const userId = 'github:123'

function v2Record(id = 'show-v2', name = 'V2 Show') {
  const result = convertShowRecordV1ToV2({ ...convertibleV1Show(), id, name })
  if (result.status !== 'converted') throw new Error(JSON.stringify(result.issues))
  return { ...result.record, updatedAt: 456 }
}

function showsDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE personal_shows (
      user_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
      record_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX idx_personal_shows_updated_at ON personal_shows(user_id, updated_at DESC);
  `)
  const db: D1DatabaseShowsLike = {
    prepare(sql: string) {
      let values: SQLInputValue[] = []
      const statement = sqlite.prepare(sql)
      return {
        bind(...next: unknown[]) {
          values = next as SQLInputValue[]
          return this
        },
        async all<T>() {
          return { results: statement.all(...values) as T[] }
        },
        async run() {
          const result = statement.run(...values)
          return { success: true, meta: { changes: Number(result.changes) } }
        },
      }
    },
  }
  return { db, sqlite }
}

describe('D1 Show persistence (#1042)', () => {
  it('creates and reopens a v2 Show', async () => {
    const { db, sqlite } = showsDatabase()
    const record = v2Record()
    await createD1Show(db, userId, record, 100)

    const row = sqlite.prepare('SELECT id, name, record_json, updated_at FROM personal_shows WHERE user_id = ? AND id = ?')
      .get(userId, record.id)
    expect(showRecordFromRow(row as never)).toEqual(record)
  })

  it('lists only rows with a v2 record', async () => {
    const { db, sqlite } = showsDatabase()
    sqlite.prepare('INSERT INTO personal_shows (user_id, id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, 'unconverted', 'Unconverted', 1, 100)
    const record = v2Record()
    await createD1Show(db, userId, record, 100)

    await expect(listD1ShowsV2(db, userId)).resolves.toEqual({ shows: [record], unreadableShows: [] })
    expect(showRecordFromRow({ id: 'unconverted', name: 'Unconverted', record_json: null, updated_at: 100 })).toBeNull()
  })

  it('refuses a non-v2 record at create before writing', async () => {
    const { db, sqlite } = showsDatabase()

    await expect(createD1Show(db, userId, convertibleV1Show(), 100)).rejects.toThrow('version-2')
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM personal_shows').get()).toEqual({ count: 0 })
  })

  it('writes only name, record and timestamp', async () => {
    const { db, sqlite } = showsDatabase()
    const record = v2Record()
    await createD1Show(db, userId, record, 100)
    const replacement = { ...record, name: 'Replaced', updatedAt: 789 }

    await replaceD1ShowV2(db, userId, record.id, replacement)

    expect(sqlite.prepare('SELECT * FROM personal_shows WHERE user_id = ? AND id = ?').get(userId, record.id)).toEqual({
      user_id: userId,
      id: record.id,
      name: replacement.name,
      record_json: JSON.stringify(replacement),
      created_at: 100,
      updated_at: replacement.updatedAt,
    })
    await expect(replaceD1ShowV2(db, userId, 'wrong-id', replacement)).rejects.toThrow('match')
  })

  it('reports an unreadable v2 row without losing readable Shows', async () => {
    const { db, sqlite } = showsDatabase()
    const record = v2Record()
    await createD1Show(db, userId, record, 100)
    sqlite.prepare('INSERT INTO personal_shows (user_id, id, name, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'corrupt-show', 'Corrupt', '{"version":2}', 1, 100)

    await expect(listD1ShowsV2(db, userId)).resolves.toEqual({
      shows: [record],
      unreadableShows: [expect.objectContaining({ id: 'corrupt-show', name: 'Corrupt', code: 'invalid_show_record' })],
    })
  })

  it('scopes list and delete by user', async () => {
    const { db } = showsDatabase()
    const record = v2Record()
    await createD1Show(db, userId, record, 100)
    await expect(listD1ShowsV2(db, 'github:other')).resolves.toEqual({ shows: [], unreadableShows: [] })
    await deleteD1Show(db, 'github:other', record.id)
    await expect(listD1ShowsV2(db, userId)).resolves.toEqual({ shows: [record], unreadableShows: [] })
    await deleteD1Show(db, userId, record.id)
    await expect(listD1ShowsV2(db, userId)).resolves.toEqual({ shows: [], unreadableShows: [] })
  })
})
