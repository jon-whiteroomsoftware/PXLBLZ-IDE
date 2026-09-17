// The Portable 2D capability rule over a `ShowRecordV2` (#1039).
//
// v1 asks this question in two places: `validateShowAuthoring`, which reports
// it as authoring diagnostics, and `compileShowForArtifact`, which blocks the
// delivered artifact. A v2 record reached neither, so a Portable v2 Show
// accepted a Pattern that only defines `render3D` where v1 reports and blocks
// it. This module supplies the missing v2 half.
//
// The rule itself is not restated here. `validatePortableShowShapeCompatibility`
// owns it, over the projection both record versions satisfy; this module
// supplies only the v2 record's own Zone Layouts and its own Pattern sites.
import type { ShowPatternRef } from './personalContentRecords'
import { materializeShowGroupsV2 } from './showGroupsV2'
import type { ShowRecordV2 } from './showCompositionV2'
import {
  validatePortableShowShapeCompatibility,
  type PortablePatternSource,
  type PortableShowCompatibility,
} from './showPortableCompatibility'

/**
 * Where a v2 record names a Pattern, with the identities a refusal reports.
 *
 * `authored` walks the record's own owners - ordinary Pattern instances and
 * each Group definition's local instances - in the same order and under the
 * same owner paths as `showPatternSitesV2`, so an authoring diagnostic names
 * the owner the rest of that validator names. `effective` walks materialized
 * Group runtime uses instead, the way the compiled artifact does.
 *
 * A site whose source is unavailable is skipped rather than substituted: the
 * dependency validator owns missing references, and a renderer verdict on a
 * substituted source would be a verdict on a Pattern this Show does not use.
 */
export function showPortablePatternSitesV2(
  record: ShowRecordV2,
  source: (ref: ShowPatternRef) => string | undefined,
  options: { scope?: 'authored' | 'effective' } = {},
): PortablePatternSource[] {
  const sites: PortablePatternSource[] = []
  const add = (owner: unknown[], instance: { id: string; pattern: ShowPatternRef; patternName: string }, clipIds: string[]) => {
    const text = source(instance.pattern)
    if (text === undefined) return
    sites.push({ cellId: JSON.stringify(owner), instanceId: instance.id, clipIds, patternName: instance.patternName, source: text })
  }
  if (options.scope === 'effective') {
    const effective = materializeShowGroupsV2(record)
    for (const instance of effective.composition.patternInstances) {
      add(['instance', instance.id], instance, effective.composition.clips.filter(clip => clip.instanceId === instance.id).map(clip => clip.id))
    }
    return sites
  }
  for (const instance of record.composition.patternInstances) {
    add(['instance', instance.id], instance, record.composition.clips.filter(clip => clip.instanceId === instance.id).map(clip => clip.id))
  }
  for (const definition of record.composition.groupDefinitions) {
    for (const instance of definition.patternInstances) {
      add(['group', definition.id, 'instance', instance.id], instance, definition.clips.filter(clip => clip.instanceId === instance.id).map(clip => clip.id))
    }
  }
  return sites
}

/**
 * The Portable 2D verdict for one v2 record. `null` means the Show is not
 * Portable, exactly as the v1 entry point's `null` does.
 */
export function validatePortableShowCompatibilityV2(
  record: ShowRecordV2,
  sources: readonly PortablePatternSource[],
  referenceMapDimension: 1 | 2 | 3 | undefined,
): PortableShowCompatibility | null {
  return validatePortableShowShapeCompatibility(
    { outputContract: record.outputContract, zones: record.zones, routingLayouts: record.zoneLayouts },
    sources,
    referenceMapDimension,
  )
}
