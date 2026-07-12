import type { ParsedPxlblzBanner } from './artifactStamp'
import { STOCK_MAP_SPECS } from './maps'
import type { MapRecord } from './personalContentRecords'

export type ArtifactPreferredMapResolution =
  | { status: 'none'; mapId: null; message: null }
  | { status: 'resolved'; mapId: string; message: string }
  | { status: 'missing' | 'ambiguous'; mapId: null; message: string }

export function resolveArtifactPreferredMap(
  stamp: ParsedPxlblzBanner | null,
  userMaps: readonly MapRecord[],
): ArtifactPreferredMapResolution {
  const preferred = stamp?.preferredMap
  if (!preferred) return { status: 'none', mapId: null, message: null }

  if (preferred.kind === 'stock') {
    const stock = STOCK_MAP_SPECS.find((map) => map.id === preferred.id)
    return stock
      ? { status: 'resolved', mapId: stock.id, message: `Using the artifact preferred map: ${stock.name}.` }
      : {
          status: 'missing',
          mapId: null,
          message: `Preferred stock map "${preferred.name}" is not available; preview is using its normal fallback map.`,
        }
  }

  const matches = userMaps.filter((map) => map.name === preferred.name)
  if (matches.length === 1) {
    return {
      status: 'resolved',
      mapId: matches[0].id,
      message: `Using the matching custom map: ${preferred.name}.`,
    }
  }
  if (matches.length === 0) {
    return {
      status: 'missing',
      mapId: null,
      message: `Preferred custom map "${preferred.name}" is not available; preview is using its normal fallback map.`,
    }
  }
  return {
    status: 'ambiguous',
    mapId: null,
    message: `${matches.length} custom maps are named "${preferred.name}"; preview is using its normal fallback map.`,
  }
}
