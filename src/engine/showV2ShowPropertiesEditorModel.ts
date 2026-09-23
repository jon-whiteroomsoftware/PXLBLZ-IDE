import type { ShowRecordV2 } from './showCompositionV2'
import { DEFAULT_SHOW_TRAILS_RETENTION, normalizeShowOutputEffects } from './showPreviousRgbFeedback'

/**
 * What the v2 editor's Show properties section reads and submits (#1039).
 *
 * This is a projection, not an owner. It reads one `ShowRecordV2` and returns
 * the summary the v1 editor's Show output summary and Show properties panel
 * show, plus the exact `showCommandsV2` inputs the surface submits. Every
 * mutation rule stays in `showCommandsV2/show.ts`: `set_output_contract`,
 * `set_stage_map`, `update_zone`, `set_output_trails` and
 * `set_target_controller_profile` are the one writer for these fields, whether
 * a person or an agent asks.
 *
 * A named map this workspace cannot see is reported as missing. Nothing here
 * substitutes another map's geometry or identity, because a silent fallback
 * would make the Show preview and compile against something it does not name.
 *
 * The Stage map's own eligibility - which resolvable maps the Stage supports -
 * belongs to `showV2StageMap.ts`, which owns that resolution for the route and
 * the candidate admission alike. This module reports what the record names and
 * leaves that list to the caller rather than encoding the rule twice.
 */
export interface ShowV2MapChoice {
  id: string
  name: string
  dim: 1 | 2 | 3
}

export interface ShowV2OutputContractView {
  kind: 'portable-2d' | 'installation'
  /** `Portable` or `Installation`, the words the v1 output summary uses. */
  kindLabel: 'Portable' | 'Installation'
  /** Reference pixel count for Portable, fixed output pixel count for Installation. */
  pixelCount: number
  mapId: string | null
  /** The named map's name, or null when the Show names no map or a missing one. */
  mapName: string | null
  /** The Show names a map this workspace cannot see. */
  mapMissing: boolean
  /** One line: kind, pixel count and map, as the v1 summary reads it. */
  summary: string
}

export interface ShowV2ShowPropertiesModel {
  contract: ShowV2OutputContractView
  /** Maps the output contract may name: 2D only for Portable, any for Installation. */
  contractMapOptions: ShowV2MapChoice[]
  stageMapId: string | null
  stageMapName: string | null
  stageMapMissing: boolean
  trails: { enabled: boolean; retention: number }
  zones: Array<{ id: string; name: string; nominalPixelCount: number }>
}

export function buildShowV2ShowPropertiesModel(
  record: ShowRecordV2,
  maps: readonly ShowV2MapChoice[],
): ShowV2ShowPropertiesModel {
  const contract = record.outputContract
  const portable = contract.kind === 'portable-2d'
  const mapId = (portable ? contract.referenceMapId : contract.outputMapId) ?? null
  const pixelCount = portable ? contract.referencePixelCount : contract.pixelCount
  const named = describeMap(mapId, maps)
  const stageMapId = record.stageMapId ?? null
  const stage = describeMap(stageMapId, maps)
  const trails = normalizeShowOutputEffects(record.outputEffects).find(effect => effect.kind === 'trails')
  return {
    contract: {
      kind: contract.kind,
      kindLabel: portable ? 'Portable' : 'Installation',
      pixelCount,
      mapId,
      mapName: named.name,
      mapMissing: named.missing,
      summary: `${portable ? 'Portable' : 'Installation'} · ${pixelCount} px ${portable ? 'reference' : 'fixed'} · ${
        named.name ?? (named.missing ? 'Missing map' : 'No map')
      }`,
    },
    contractMapOptions: (portable ? maps.filter(map => map.dim === 2) : maps).map(map => ({ ...map })),
    stageMapId,
    stageMapName: stage.name,
    stageMapMissing: stage.missing,
    trails: { enabled: Boolean(trails), retention: trails?.retention ?? DEFAULT_SHOW_TRAILS_RETENTION },
    zones: record.zones.map(zone => ({ id: zone.id, name: zone.name, nominalPixelCount: zone.nominalPixelCount })),
  }
}

function describeMap(mapId: string | null, maps: readonly ShowV2MapChoice[]): { name: string | null; missing: boolean } {
  if (!mapId) return { name: null, missing: false }
  const found = maps.find(map => map.id === mapId)
  return found ? { name: found.name, missing: false } : { name: null, missing: true }
}

/** One registry command name and its complete typed input. */
export interface ShowV2ShowMetadataCommand {
  command: 'set_output_contract' | 'set_stage_map' | 'update_zone' | 'set_output_trails' | 'set_target_controller_profile'
  input: Record<string, unknown>
}

export function showV2OutputContractCommand(request: {
  kind: 'portable-2d' | 'installation'
  pixelCount: number
  mapId: string | null
}): ShowV2ShowMetadataCommand {
  return {
    command: 'set_output_contract',
    input: { kind: request.kind, pixel_count: request.pixelCount, map_id: request.mapId },
  }
}

export function showV2StageMapCommand(stageMapId: string | null): ShowV2ShowMetadataCommand {
  return { command: 'set_stage_map', input: { stage_map_id: stageMapId } }
}

export function showV2ZoneCommand(
  zoneId: string,
  changes: { name?: string; nominalPixelCount?: number; color?: string },
): ShowV2ShowMetadataCommand {
  return {
    command: 'update_zone',
    input: {
      zone_id: zoneId,
      ...(changes.name === undefined ? {} : { name: changes.name }),
      ...(changes.nominalPixelCount === undefined ? {} : { nominal_pixel_count: changes.nominalPixelCount }),
      ...(changes.color === undefined ? {} : { color: changes.color }),
    },
  }
}

export function showV2TrailsCommand(request: { enabled?: boolean; retention?: number }): ShowV2ShowMetadataCommand {
  return {
    command: 'set_output_trails',
    input: {
      ...(request.enabled === undefined ? {} : { enabled: request.enabled }),
      ...(request.retention === undefined ? {} : { retention: request.retention }),
    },
  }
}
