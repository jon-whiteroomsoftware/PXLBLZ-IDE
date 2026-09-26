import { isShowRecordV2, type ShowDocument } from '../engine/showDocument'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
import { requireShowOutputContract } from '../engine/showOutputContract'
import { PersonalStorageGuardError } from './resourceProtection'
import { cloneValidShowRecordV2ForWorker } from './showV2Codec'

export interface D1ShowStatementLike {
  bind(...values: unknown[]): D1ShowStatementLike
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>
}

export interface D1DatabaseShowsLike {
  prepare(sql: string): D1ShowStatementLike
}

export interface D1ShowRow {
  id: string
  name: string
  record_json: string | null
  updated_at: number
}

export interface D1UnreadableShow {
  id: string
  name: string
  code: 'missing_show_output_contract' | 'invalid_show_record'
  error: string
}

export interface D1ShowListResult {
  shows: ShowRecordV2[]
  unreadableShows: D1UnreadableShow[]
}

export function showRecordFromRow(row: D1ShowRow): ShowRecordV2 | null {
  if (row.record_json === null) return null
  return cloneValidShowRecordV2ForWorker(parseJson<unknown>(row.record_json, null))
}

/** Rows without a version-2 record remain stored but are not listed. */
export async function listD1ShowsV2(
  db: D1DatabaseShowsLike,
  userId: string,
): Promise<D1ShowListResult> {
  const { results } = await db
    .prepare(`
      SELECT id, name, record_json, updated_at
      FROM personal_shows
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .bind(userId)
    .all<D1ShowRow>()
  const shows: ShowRecordV2[] = []
  const unreadableShows: D1UnreadableShow[] = []
  for (const row of results) {
    if (row.record_json === null) continue
    try {
      const show = showRecordFromRow(row)
      if (show) shows.push(show)
    } catch (error) {
      unreadableShows.push({
        id: row.id,
        name: row.name,
        code: 'invalid_show_record',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { shows, unreadableShows }
}

export async function replaceD1ShowV2(
  db: D1DatabaseShowsLike,
  userId: string,
  id: string,
  record: ShowDocument,
): Promise<void> {
  const written = await writeD1ShowV2(db, userId, id, record)
  if (!written) throw new Error(`Show "${id}" is unavailable for version-2 replacement.`)
}

async function writeD1ShowV2(
  db: D1DatabaseShowsLike,
  userId: string,
  id: string,
  record: ShowDocument,
): Promise<boolean> {
  if (!isShowRecordV2(record) || record.id !== id) {
    throw new Error('A version-2 Show replacement must match the requested identity.')
  }
  const validated = cloneValidShowRecordV2ForWorker(record)
  requireWritableShowOutputContract(validated.outputContract, validated.id)
  const result = await db
    .prepare(`
      UPDATE personal_shows
      SET name = ?, record_json = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `)
    .bind(validated.name, JSON.stringify(validated), validated.updatedAt, userId, id)
    .run()
  return result.meta?.changes !== 0
}

export async function createD1Show(
  db: D1DatabaseShowsLike,
  userId: string,
  record: ShowDocument,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  if (!isShowRecordV2(record)) {
    throw new Error('A version-2 Show create requires a version-2 record.')
  }
  requireWritableShowOutputContract(record.outputContract, record.id)
  const validated = cloneValidShowRecordV2ForWorker(record)
  await db
    .prepare(`
      INSERT INTO personal_shows (user_id, id, name, record_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(userId, validated.id, validated.name, JSON.stringify(validated), now, validated.updatedAt)
    .run()
}

export async function deleteD1Show(db: D1DatabaseShowsLike, userId: string, id: string): Promise<void> {
  await db
    .prepare('DELETE FROM personal_shows WHERE user_id = ? AND id = ?')
    .bind(userId, id)
    .run()
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function requireWritableShowOutputContract(value: unknown, showId: string) {
  try {
    return requireShowOutputContract(value, showId)
  } catch {
    throw new PersonalStorageGuardError(
      'missing_show_output_contract',
      400,
      `Show ${showId} is missing a valid output contract`,
    )
  }
}
