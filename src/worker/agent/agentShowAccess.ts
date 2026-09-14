import type { D1DatabaseShowsLike } from '../../cloudflare/shows'
import { stockShowName } from '../../pixelblaze/stock/showIds'
import type { WorkerEnv } from '../apiRoutes'

export type AgentShowAccess =
  | { ok: true; show: { id: string; name?: string } }
  | { ok: false; code: 'show_unavailable' | 'unavailable'; status: 404 | 503 }

const safeName = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined

/** Resolve same-account Show authority and its bounded display snapshot once. */
export async function resolveAgentShowAccess(env: WorkerEnv, accountId: string, showId: string): Promise<AgentShowAccess> {
  const stockName = stockShowName(showId)
  if (stockName) return { ok: true, show: { id: showId, name: stockName } }
  if (!env.PXLBLZ_DB) return { ok: false, code: 'unavailable', status: 503 }
  try {
    const db: D1DatabaseShowsLike = env.PXLBLZ_DB
    const { results } = await db.prepare('SELECT id, name FROM personal_shows WHERE user_id = ? AND id = ?').bind(accountId, showId).all<{ id: string; name?: string }>()
    const row = results[0]
    return row ? { ok: true, show: { id: row.id, ...(safeName(row.name) ? { name: row.name } : {}) } } : { ok: false, code: 'show_unavailable', status: 404 }
  } catch {
    return { ok: false, code: 'unavailable', status: 503 }
  }
}
