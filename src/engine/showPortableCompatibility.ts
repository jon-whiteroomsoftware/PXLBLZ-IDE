import { inspectPatternMetadata } from './bundle'
import type { ShowOutputContract, ShowRecord, ShowRoutingLayout, ShowZone } from './personalContentRecords'
import { validateShowLogicalRouting } from './showLogicalRouting'
import type { ShowEditDiagnosticCode } from './showEditDiagnostic'

export interface PortablePatternSource {
  cellId: string
  patternName: string
  source: string
  /** The effective Pattern instance this source belongs to, when the caller owns one. */
  instanceId?: string
  /** The Clips that consume that instance, when the caller owns them. */
  clipIds?: readonly string[]
}

export interface PortableShowDiagnostic {
  category: 'capability' | 'structure' | 'metadata'
  code: ShowEditDiagnosticCode
  path?: string
  instanceId?: string
  clipIds?: readonly string[]
  message: string
}

export interface PortableShowCompatibility {
  compatible: boolean
  issues: string[]
  advisories: string[]
  diagnostics: PortableShowDiagnostic[]
}

/**
 * The record-shaped half of the Portable rule, in the fields both record
 * versions own under their own names: a v1 `ShowRecord` supplies
 * `routingLayouts` and a `ShowRecordV2` supplies `zoneLayouts`. Everything the
 * rule inspects - the output contract, the Zone identities and the routing
 * layouts - has the same shape in both, so the rule itself is version-
 * independent and is implemented exactly once below.
 */
export interface PortableShowShape {
  outputContract: ShowOutputContract | undefined
  zones: readonly ShowZone[]
  routingLayouts: readonly ShowRoutingLayout[]
}

/**
 * The one Portable 2D capability rule, over a version-independent projection of
 * the record and the Pattern sources its sites resolve to. `validatePortable
 * ShowCompatibility` and its v2 counterpart both call this; neither owns a
 * separate copy of the rule.
 */
export function validatePortableShowShapeCompatibility(
  shape: PortableShowShape,
  sources: readonly PortablePatternSource[],
  referenceMapDimension: 1 | 2 | 3 | undefined,
): PortableShowCompatibility | null {
  if (shape.outputContract?.kind !== 'portable-2d') return null
  const issues: string[] = []
  const advisories: string[] = []
  const diagnostics: PortableShowDiagnostic[] = []
  const add = (
    category: PortableShowDiagnostic['category'],
    code: ShowEditDiagnosticCode,
    message: string,
    path?: string,
    entry?: PortablePatternSource,
  ) => {
    const diagnostic: PortableShowDiagnostic = {
      category, code, message,
      ...(path ? { path } : {}),
      ...(entry?.instanceId ? { instanceId: entry.instanceId } : {}),
      ...(entry?.clipIds ? { clipIds: [...entry.clipIds] } : {}),
    }
    diagnostics.push(diagnostic)
    issues.push(message)
    return diagnostic
  }

  if (referenceMapDimension !== 2) {
    add('capability', 'portable-reference-map-unsupported', referenceMapDimension === 3
      ? 'The reference output is 3D; Portable currently supports only 2D mapped surfaces.'
      : 'The reference output must be a 2D mapped surface.', JSON.stringify(['stageMapId']))
  }

  const zoneIds = new Set(shape.zones.map((zone) => zone.id))
  for (const layout of shape.routingLayouts) {
    if (!layout.logical) {
      add('capability', 'portable-physical-routing-unsupported', `Routing layout "${layout.name}" uses physical pixel ranges; Portable requires normalized position-based zones.`, JSON.stringify(['layout', layout.id, 'logical']))
      continue
    }
    const logical = layout.logical
    if (logical.zoneIds.some((zoneId) => !zoneIds.has(zoneId))) {
      add('structure', 'portable-logical-zone-missing', `Routing layout "${layout.name}" references a missing logical zone.`, JSON.stringify(['layout', layout.id, 'logical']))
    }
    for (const issue of validateShowLogicalRouting(logical)) add('structure', 'portable-logical-routing-invalid', `Routing layout "${layout.name}": ${issue}`, JSON.stringify(['layout', layout.id, 'logical']))
  }

  // Equal Pattern name and source is one capability question, asked once. A
  // second site that asks it again adds its own identities to the answer
  // instead of a duplicate issue.
  const seenSources = new Map<string, PortableShowDiagnostic | null>()
  for (const entry of sources) {
    const key = `${entry.patternName}\u0000${entry.source}`
    if (seenSources.has(key)) {
      const existing = seenSources.get(key)
      if (existing && entry.clipIds?.length) existing.clipIds = [...(existing.clipIds ?? []), ...entry.clipIds]
      continue
    }
    try {
      const renderFns = inspectPatternMetadata(entry.source).renderFns
      if (!renderFns.hasRender2D && !renderFns.hasRender) {
        seenSources.set(key, add('capability', 'portable-renderer-unsupported', renderFns.hasRender3D
          ? `${entry.patternName} defines only render3D.`
          : `${entry.patternName} defines no render2D or render entry point.`, entry.cellId, entry))
        continue
      }
      if (!renderFns.hasRender2D && renderFns.hasRender) {
        advisories.push(
          `${entry.patternName} uses render; Portable adapts its normalized local position to a resolution-dependent index.`,
        )
      }
      seenSources.set(key, null)
    } catch {
      seenSources.set(key, add('metadata', 'portable-metadata-unavailable', `${entry.patternName} cannot be inspected for Portable renderer compatibility.`, entry.cellId, entry))
    }
  }

  return { compatible: issues.length === 0, issues, advisories, diagnostics }
}

export function validatePortableShowCompatibility(
  show: ShowRecord,
  sources: PortablePatternSource[],
  referenceMapDimension: 1 | 2 | 3 | undefined,
): PortableShowCompatibility | null {
  return validatePortableShowShapeCompatibility(
    { outputContract: show.outputContract, zones: show.zones, routingLayouts: show.routingLayouts },
    sources,
    referenceMapDimension,
  )
}

export function portableCompatibilityBlockingMessage(
  result: PortableShowCompatibility | null,
): string | null {
  const issue = result?.issues[0]
  if (!issue) return null
  const remedy = issue.includes('reference output')
    ? 'Choose a 2D reference map before export or send.'
    : issue.includes('physical pixel ranges')
      ? 'Choose a normalized routing mode in Show properties before export or send.'
      : issue.includes('render3D') || issue.includes('entry point') || issue.includes('inspected')
        ? 'Choose a Pattern with render2D or render, or author that renderer before export or send.'
        : 'Repair the logical routing layout in Show properties before export or send.'
  return `Portable 2D compatibility failed: ${issue} ${remedy}`
}
