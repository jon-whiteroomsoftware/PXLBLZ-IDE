import type { MapRecord } from '@/engine/personalContentRecords'
import type { PixelMap } from '@/engine/maps'
import { resolveMap, STOCK_MAPS } from './mapStore'

/**
 * The Stage map a `ShowRecordV2` actually previews and compiles against (#1039).
 *
 * One resolution for the route's prepared capture and for the candidate
 * admission that re-prepares a Show whose command changed `stageMapId`: a
 * built-in map, then an owned map that is not an empty custom one, and only at
 * a dimension the Stage supports. A named map that is gone, empty or neither
 * 2D nor 3D resolves to `null`, which previews as generic Zone strips rather
 * than substituting another map's geometry.
 */
export function resolveShowV2StageMap(stageMapId: string | null | undefined, maps: readonly MapRecord[]): PixelMap | null {
  if (!stageMapId) return null
  const selected = STOCK_MAPS.find(map => map.id === stageMapId)
    ?? maps.find(map => map.id === stageMapId && (map.generator !== 'custom' || (map.points?.length ?? 0) > 0))
  return selected && (selected.dim === 2 || selected.dim === 3) ? resolveMap(selected.id, [...maps]) : null
}

/** Whether the Show names a Stage map this workspace can still resolve. */
export function showV2StageMapAvailable(stageMapId: string | null | undefined, maps: readonly MapRecord[]): boolean {
  return !stageMapId || resolveShowV2StageMap(stageMapId, maps) !== null
}
