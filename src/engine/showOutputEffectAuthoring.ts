import type { ShowRecord } from './personalContentRecords'
import { DEFAULT_SHOW_TRAILS_RETENTION, normalizeShowOutputEffects } from './showPreviousRgbFeedback'

export interface SetShowOutputTrailsInput {
  enabled: boolean
  /**
   * Retention in [0, 1]; values outside clamp. Omitted or non-finite keeps
   * the Show's current retention when Trails is already on, otherwise the
   * default.
   */
  retention?: number
}

/**
 * Enable, disable, or retune the Show's Trails output Effect. Returns the
 * input Show by identity when the request changes nothing; otherwise returns
 * a new Show with a normalized outputEffects list and a fresh updatedAt.
 */
export function setShowOutputTrails(show: ShowRecord, input: SetShowOutputTrailsInput): ShowRecord {
  const trails = normalizeShowOutputEffects(show.outputEffects).find((effect) => effect.kind === 'trails')
  // Monotonic even when a prior rapid edit stamped updatedAt ahead of the
  // clock; the store's durable rollback baseline relies on this.
  const updatedAt = Math.max(Date.now(), show.updatedAt + 1)
  if (!input.enabled) {
    if (!trails) return show
    return { ...show, outputEffects: [], updatedAt }
  }
  const retention = Number.isFinite(input.retention)
    ? Math.max(0, Math.min(1, input.retention as number))
    : trails?.retention ?? DEFAULT_SHOW_TRAILS_RETENTION
  if (trails && trails.retention === retention) return show
  return {
    ...show,
    outputEffects: normalizeShowOutputEffects([
      { id: trails?.id ?? 'trails', kind: 'trails', retention },
    ]),
    updatedAt,
  }
}
