import type { AppliedShowImport } from './showImportPlan'
import type { MapRecord, PatternRecord } from './personalContentRecords'
import { convertShowRecordV1ToV2, type ShowV1ToV2Result } from './showRecordV1ToV2'
import { showV1ConversionSources } from './showV2MigrationQualification'

/**
 * A version-1 `.pxlshow` import stores a version-2 record (#1042). The applied
 * Show converts through the retained v1 import boundary, resolving its Pattern
 * sources and Stage map against the Patterns and Maps the import creates, then
 * the workspace's own, which is where the applied references point.
 */
export function convertAppliedShowImportV1(
  applied: AppliedShowImport,
  workspace: { patterns: readonly PatternRecord[]; maps: readonly MapRecord[] },
): ShowV1ToV2Result {
  // The applied record carries explicit `undefined` leaves (an absent Stage
  // map, for one) that storage would drop; convert the record as it would be
  // stored, so an absent field is absent rather than an unaccounted leaf.
  const show = JSON.parse(JSON.stringify(applied.show)) as AppliedShowImport['show']
  return convertShowRecordV1ToV2(show, showV1ConversionSources(
    show,
    [...applied.newPatterns, ...workspace.patterns],
    [...applied.newMaps, ...workspace.maps],
  ))
}
